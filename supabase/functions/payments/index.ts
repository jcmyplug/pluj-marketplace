/* PLUJ payments: what signed-in people ask for.
   POST { action, ... } with the person's Supabase session token.

   The host pays the full price upfront as a direct charge on the vendor's
   own Stripe account; it stays locked there (the vendor's payouts are
   manual) and PLUJ releases it in parts (see _shared/payments.ts).

   anyone    status
   host      pay { booking_id, accept_terms }   → Stripe Checkout URL for the full price
             checkout_return { booking_id }     → records a finished Checkout
                                                  even if the webhook is late
   vendor    vendor_connect                     → Stripe onboarding URL
             vendor_refresh                     → account flags from Stripe
             vendor_dashboard                   → Stripe Dashboard URL
   admin     admin_release  { booking_id, note }  → close problems and release everything left
             admin_refund   { booking_id, amount_cents?, note, release_rest? }
                                                → refund from the vendor's Stripe balance
             admin_hold     { booking_id, hold, reason }
             admin_dismiss  { problem_id, note }
             admin_retry    { booking_id }      → retry a failed refund / release now
             admin_connect_webhook

   Host "Release the rest to the vendor" and "Report a problem" are database
   functions (approve_payment_release, report_booking_problem). */

import {
  CORS, json, PaymentsError, StripeError, db, settings, stripe, stripeKey, stripeMode, notify, money, SITE,
  refreshVendorAccount, lockVendorPayouts, runPendingRefund, markPlanPaid, prepareCharge, chargedCents,
  vendorAccount, releaseDue,
} from "../_shared/payments.ts";

const ALLOWED_RETURN = /^https:\/\/(www\.pluj\.us|pluj\.us|pluj-marketplace(-[a-z0-9-]+)?\.vercel\.app)$/;

function returnBase(req: Request): string {
  const o = req.headers.get("origin") || "";
  return ALLOWED_RETURN.test(o) ? o : SITE;
}

async function whoIs(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data, error } = await db().auth.getUser(token);
  if (error || !data?.user) throw new PaymentsError("Please sign in again.", 401);
  const uid = data.user.id;
  const { data: prof } = await db().from("profiles").select("id, role, email, full_name, display_name, stripe_customer_id").eq("id", uid).single();
  const { data: adm } = await db().from("admin_users").select("user_id").eq("user_id", uid).maybeSingle();
  return { uid, email: data.user.email || prof?.email || null, profile: prof, isAdmin: !!adm };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const me = await whoIs(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    switch (action) {
      case "status": {
        const s = await settings();
        const { data: wh } = me.isAdmin ? await db().rpc("stripe_webhook_secret") : { data: null };
        return json({
          configured: !!stripeKey(), mode: stripeMode(),
          payments_enabled: s.payments_enabled === "true",
          webhook_connected: me.isAdmin ? !!wh : undefined,
        });
      }

      // ── Host pays the full price through Stripe Checkout ────────────────
      case "pay": {
        let bookingId = body.booking_id;
        if (!bookingId && body.payment_id) {
          const { data: one } = await db().from("booking_payments").select("booking_id").eq("id", body.payment_id).single();
          bookingId = one?.booking_id;
        }
        const { data: plan } = await db().from("booking_payment_plans").select("*").eq("booking_id", bookingId).single();
        if (!plan || plan.host_id !== me.uid) throw new PaymentsError("Only the host of this booking can pay it.", 403);
        if (plan.status === "cancelled") throw new PaymentsError("This booking was cancelled.");
        if (plan.status === "on_hold") throw new PaymentsError("This booking is paused while a problem is looked at.");
        if (body.accept_terms !== true) {
          throw new PaymentsError("Please tick the box to accept the payment terms before paying.");
        }
        const { data: rows } = await db().from("booking_payments").select("*").eq("booking_id", bookingId)
          .in("status", ["scheduled", "failed"]).order("due_at");
        if (!rows || !rows.length) throw new PaymentsError("This booking is already paid.");
        const { data: booking } = await db().from("booking_requests")
          .select("id, status, service_name, event_date, vendor_id").eq("id", bookingId).single();
        if (!booking || !["confirmed", "accepted", "approved"].includes(booking.status)) {
          throw new PaymentsError("The vendor needs to confirm this booking before you can pay.");
        }
        const acct = await vendorAccount(booking.vendor_id);
        if (!acct.id || !acct.ready) {
          await notify(booking.vendor_id, "payout_setup", "💳 Finish your Stripe setup so the host can pay",
            "A host is trying to pay you, but your Stripe account isn't ready to take payments through PLUJ yet. Open your dashboard and press Finish Stripe setup.",
            bookingId);
          throw new PaymentsError("The vendor's Stripe account isn't ready to take payments yet. We've told them; try again later.");
        }
        const vendorName = acct.name;
        const c = await prepareCharge(rows, plan);
        const now = new Date().toISOString();
        // The host's acceptance of the payment terms: evidence if they later dispute the charge.
        await db().from("booking_payment_plans").update({ host_accepted_at: now,
          host_accept_agent: (req.headers.get("user-agent") || "").slice(0, 300), updated_at: now }).eq("booking_id", bookingId);

        const base = returnBase(req);
        const lineItems: any[] = [{
          quantity: 1,
          price_data: {
            currency: plan.currency || "usd", unit_amount: c.base,
            product_data: { name: `${booking.service_name || "Booking"} with ${vendorName} — paid in full`,
                            description: `Event on ${booking.event_date}. Held in the vendor's Stripe balance and released in parts; the last ${Number((rows.find((r: any) => r.kind === "final") || {}).percent || 20)}% only when you approve it after the event.` },
          },
        }];
        if (c.hostFees > 0) {
          lineItems.push({ quantity: 1, price_data: { currency: plan.currency || "usd", unit_amount: c.hostFees,
            product_data: { name: "Card processing fee" } } });
        }
        if (c.service > 0) {
          lineItems.push({ quantity: 1, price_data: { currency: plan.currency || "usd", unit_amount: c.service,
            product_data: { name: "PLUJ service fee" } } });
        }
        const session = await stripe("POST", "/checkout/sessions", {
          mode: "payment", client_reference_id: bookingId, customer_email: me.email || undefined,
          payment_method_types: ["card"],
          line_items: lineItems,
          payment_intent_data: {
            application_fee_amount: c.appFee > 0 && c.appFee < c.total ? c.appFee : undefined,
            description: `PLUJ booking ${bookingId} — paid in full`,
            metadata: { booking_id: bookingId, kind: "full", host_terms_accepted_at: now },
          },
          metadata: { booking_id: bookingId, kind: "full" },
          success_url: `${base}/?payment=success&booking=${encodeURIComponent(bookingId)}`,
          cancel_url: `${base}/?payment=cancelled&booking=${encodeURIComponent(bookingId)}`,
        }, undefined, acct.id);
        await db().from("booking_payments").update({ stripe_checkout_session_id: session.id, stripe_account_id: acct.id })
          .eq("booking_id", bookingId).in("status", ["scheduled", "failed"]);
        return json({ url: session.url });
      }

      case "checkout_return": {
        const { data: plan } = await db().from("booking_payment_plans").select("host_id").eq("booking_id", body.booking_id).single();
        if (!plan || plan.host_id !== me.uid) throw new PaymentsError("Booking not found.", 404);
        const { data: pays } = await db().from("booking_payments").select("id, status, stripe_checkout_session_id, stripe_account_id")
          .eq("booking_id", body.booking_id).not("stripe_checkout_session_id", "is", null).in("status", ["scheduled", "failed"]);
        let paid = 0;
        const p = (pays || []).find((x: any) => x.stripe_account_id);
        if (p) {
          const cs = await stripe("GET", `/checkout/sessions/${p.stripe_checkout_session_id}`, {}, undefined, p.stripe_account_id);
          if (cs.payment_status === "paid" && cs.payment_intent) {
            const pi = await markPlanPaid(body.booking_id, typeof cs.payment_intent === "string" ? cs.payment_intent : cs.payment_intent.id,
                                          p.stripe_account_id);
            if (pi?.status === "succeeded") paid++;
          }
        }
        return json({ ok: true, paid });
      }

      /* ── Vendor: their own Stripe account ─────────────────────────────
         Created so that Stripe, not PLUJ, is responsible for the account's
         losses (refunds and chargebacks it can't cover), and the vendor pays
         Stripe's fees. Its automatic payouts are switched off so PLUJ can
         release locked money in parts. */
      case "vendor_connect":
      case "vendor_refresh":
      case "vendor_dashboard": {
        const { data: vp } = await db().from("vendor_profiles")
          .select("id, business_name, biz_website, stripe_account_id").eq("id", me.uid).single();
        if (!vp) throw new PaymentsError("Only vendors can set up Stripe payments.", 403);
        let acct = vp.stripe_account_id;

        if (action === "vendor_refresh") {
          if (!acct) return json({ connected: false });
          return json({ connected: true, ...(await refreshVendorAccount(me.uid, acct)) });
        }
        if (action === "vendor_dashboard") {
          if (!acct) throw new PaymentsError("Set up payments with Stripe first.");
          return json({ url: "https://dashboard.stripe.com/" });
        }

        if (!acct) {
          const site = (vp.biz_website || "").trim();
          const a = await stripe("POST", "/accounts", {
            country: "US", email: me.email || undefined,
            controller: {
              losses: { payments: "stripe" },          // Stripe, not PLUJ, covers losses on this account
              fees: { payer: "account" },              // the vendor pays Stripe's fees
              requirement_collection: "stripe",
              stripe_dashboard: { type: "full" },      // the vendor handles refunds and disputes themselves
            },
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
            business_profile: {
              name: vp.business_name || undefined,
              url: /^https?:\/\//i.test(site) ? site : undefined,
              product_description: "Event services booked through PLUJ (pluj.us).",
            },
            metadata: { pluj_vendor_id: me.uid },
          }, `pluj-account-${me.uid}`);
          acct = a.id;
          await db().from("vendor_profiles").update({ stripe_account_id: acct, stripe_updated_at: new Date().toISOString() }).eq("id", me.uid);
          // Paid money stays locked in the vendor's Stripe balance until PLUJ releases it.
          try { await lockVendorPayouts(me.uid, acct); }
          catch (e) { console.warn("[payments] could not lock payouts", (e as Error).message); }
        }
        const base = returnBase(req);
        const link = await stripe("POST", "/account_links", {
          account: acct, type: "account_onboarding",
          refresh_url: `${base}/?stripe=refresh`, return_url: `${base}/?stripe=return`,
        });
        return json({ url: link.url });
      }
    }

    // ── Admin ─────────────────────────────────────────────────────────────
    if (!action.startsWith("admin_")) throw new PaymentsError("Unknown action.");
    if (!me.isAdmin) throw new PaymentsError("Admins only.", 403);
    const now = new Date().toISOString();

    switch (action) {
      case "admin_release": {
        await db().from("booking_problems").update({ status: "released", resolution_note: body.note || null,
          resolved_by: me.uid, resolved_at: now }).eq("booking_id", body.booking_id).eq("status", "open");
        await db().from("booking_payment_plans").update({ status: "active", hold_reason: null, host_approved_at: now,
          updated_at: now }).eq("booking_id", body.booking_id).eq("status", "on_hold");
        await db().from("booking_payments").update({ due_at: now, updated_at: now })
          .eq("booking_id", body.booking_id).eq("status", "paid").is("transferred_at", null);
        const sent = await releaseDue(body.booking_id, { force: true });
        return json({ ok: true, sent_cents: sent });
      }

      case "admin_refund": {
        const { data: plan } = await db().from("booking_payment_plans").select("*").eq("booking_id", body.booking_id).single();
        if (!plan) throw new PaymentsError("No payments on this booking.");
        const { data: pays } = await db().from("booking_payments").select("*")
          .eq("booking_id", body.booking_id).eq("status", "paid").order("due_at", { ascending: false });   // locked parts first
        const refundable = (pays || []).reduce((n: number, p: any) => n + chargedCents(p) - (p.refunded_cents || 0), 0);
        let left = body.amount_cents == null ? refundable : Math.min(Number(body.amount_cents), refundable);
        if (!(left > 0)) throw new PaymentsError("There is nothing left to refund.");
        let refunded = 0;
        for (const p of pays || []) {
          if (left <= 0) break;
          const charged = chargedCents(p) - (p.refunded_cents || 0);
          const take = Math.min(charged, left);
          if (take <= 0 || !p.stripe_payment_intent_id || !p.stripe_account_id) continue;
          // From the vendor's Stripe balance; PLUJ's service fee is not returned.
          await stripe("POST", "/refunds", { payment_intent: p.stripe_payment_intent_id, amount: take,
            metadata: { booking_id: body.booking_id, payment_id: p.id, reason: "admin refund" } },
            `pluj-adminrefund-${p.id}-${p.refunded_cents}-${take}`, p.stripe_account_id);
          await db().from("booking_payments").update({ refunded_cents: (p.refunded_cents || 0) + take, updated_at: now }).eq("id", p.id);
          left -= take; refunded += take;
        }
        const full = refunded >= refundable;
        await db().from("booking_problems").update({ status: full ? "refunded" : "partly_refunded",
          resolution_note: body.note || null, resolved_by: me.uid, resolved_at: now })
          .eq("booking_id", body.booking_id).eq("status", "open");
        if (full) {
          await db().from("booking_payments").update({ status: "cancelled", updated_at: now })
            .eq("booking_id", body.booking_id).in("status", ["scheduled", "failed"]);
        }
        await db().from("booking_payment_plans").update({
          status: full ? "cancelled" : (body.release_rest ? "active" : "on_hold"),
          host_approved_at: body.release_rest ? now : plan.host_approved_at,
          hold_reason: full || body.release_rest ? null : plan.hold_reason, updated_at: now,
        }).eq("booking_id", body.booking_id);
        if (full) await db().from("booking_requests").update({ payment_status: "refunded" }).eq("id", body.booking_id);
        await notify(plan.host_id, "payment_refunded", "↩️ Refund on its way",
          `${money(refunded)} was refunded to your card for booking ${body.booking_id}. Banks usually show it within 5–10 business days.`
          + (body.note ? ` Note from PLUJ: ${body.note}` : ""), body.booking_id);
        await notify(plan.vendor_id, "payment_refunded", "Refund issued to the host",
          `${money(refunded)} was refunded to the host from your Stripe balance for booking ${body.booking_id}.`
          + (body.note ? ` Note from PLUJ: ${body.note}` : ""), body.booking_id);
        let sent = 0;
        if (!full && body.release_rest) sent = await releaseDue(body.booking_id, { force: true });
        return json({ ok: true, refunded_cents: refunded, sent_cents: sent });
      }

      case "admin_hold": {
        await db().from("booking_payment_plans").update({
          status: body.hold ? "on_hold" : "active", hold_reason: body.hold ? (body.reason || "Paused by PLUJ") : null, updated_at: now,
        }).eq("booking_id", body.booking_id).in("status", body.hold ? ["active"] : ["on_hold"]);
        return json({ ok: true });
      }

      case "admin_dismiss": {
        const { data: pr } = await db().from("booking_problems").update({ status: "dismissed",
          resolution_note: body.note || null, resolved_by: me.uid, resolved_at: now }).eq("id", body.problem_id).select().single();
        if (pr) {
          const { data: still } = await db().from("booking_problems").select("id").eq("booking_id", pr.booking_id).eq("status", "open");
          if (!(still || []).length) {
            await db().from("booking_payment_plans").update({ status: "active", hold_reason: null, updated_at: now })
              .eq("booking_id", pr.booking_id).eq("status", "on_hold");
          }
          await notify(pr.reporter_id, "payment_problem", "Your report was reviewed",
            "PLUJ reviewed the problem you reported and closed it." + (body.note ? ` Note from PLUJ: ${body.note}` : ""), pr.booking_id);
        }
        return json({ ok: true });
      }

      case "admin_retry": {
        const { data: plan } = await db().from("booking_payment_plans").select("*").eq("booking_id", body.booking_id).single();
        if (!plan) throw new PaymentsError("No payments on this booking.");
        if (plan.refund_state === "failed" || plan.refund_state === "pending") {
          await db().from("booking_payment_plans").update({ refund_state: "pending" }).eq("booking_id", body.booking_id);
          await runPendingRefund({ ...plan, refund_state: "pending" });
        }
        const sent = await releaseDue(body.booking_id);
        return json({ ok: true, sent_cents: sent });
      }

      case "admin_connect_webhook": {
        const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook`;
        const existing = await stripe("GET", "/webhook_endpoints", { limit: 100 });
        if ((existing.data || []).some((w: any) => w.url === url)) {
          const { data: secret } = await db().rpc("stripe_webhook_secret");
          if (secret) return json({ ok: true, already: true });
          throw new PaymentsError("A PLUJ webhook already exists in Stripe but its secret isn't saved here. "
            + "Delete it in Stripe → Developers → Webhooks, then press Connect again.");
        }
        // connect: true — the payments happen on vendors' accounts.
        const wh = await stripe("POST", "/webhook_endpoints", {
          url, description: "PLUJ payments (pluj.us)", connect: true,
          enabled_events: [
            "checkout.session.completed", "payment_intent.succeeded", "payment_intent.payment_failed",
            "charge.refunded", "charge.dispute.created", "charge.dispute.closed", "account.updated",
          ],
        });
        const { error } = await db().rpc("save_stripe_webhook_secret", { p_secret: wh.secret });
        if (error) throw new PaymentsError("Webhook created in Stripe but its secret couldn't be saved: " + error.message, 500);
        return json({ ok: true });
      }
    }
    throw new PaymentsError("Unknown action.");
  } catch (e) {
    if (e instanceof PaymentsError) return json({ error: e.message }, e.status);
    if (e instanceof StripeError) {
      console.error("[payments] Stripe error", e.status, e.message);
      return json({ error: `Stripe: ${e.message}` }, 502);
    }
    console.error("[payments] unexpected", e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
