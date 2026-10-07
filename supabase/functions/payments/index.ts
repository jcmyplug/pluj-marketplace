/* PLUJ payments: what signed-in people ask for.
   POST { action, ... } with the person's Supabase session token.

   anyone    status
   host      pay { payment_id }                 → Stripe Checkout URL
             checkout_return { booking_id }     → records a finished Checkout
                                                  even if the webhook is late
   vendor    vendor_connect                     → Stripe onboarding URL
             vendor_refresh                     → payout flags from Stripe
             vendor_dashboard                   → Stripe Express dashboard URL
   admin     admin_release  { booking_id, note }
             admin_refund   { booking_id, amount_cents?, note, release_rest? }
             admin_hold     { booking_id, hold, reason }
             admin_dismiss  { problem_id, note }
             admin_retry    { booking_id }      → retry a failed refund / payout now
             admin_connect_webhook

   Host "Release payment", vendor "Ask for early release", host "Report a
   problem" are database functions (approve_payment_release,
   request_early_release, answer_release_request, report_booking_problem). */

import {
  CORS, json, PaymentsError, StripeError, db, settings, stripe, stripeKey, stripeMode, notify, money, SITE,
  KIND_LABEL, refreshVendorAccount, releaseBooking, runPendingRefund, markPaid, prepareCharge, chargedCents,
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

      // ── Host pays one payment through Stripe Checkout ───────────────────
      case "pay": {
        const { data: pay } = await db().from("booking_payments").select("*").eq("id", body.payment_id).single();
        if (!pay) throw new PaymentsError("Payment not found.", 404);
        const { data: plan } = await db().from("booking_payment_plans").select("*").eq("booking_id", pay.booking_id).single();
        if (!plan || plan.host_id !== me.uid) throw new PaymentsError("Only the host of this booking can pay it.", 403);
        if (plan.status === "cancelled") throw new PaymentsError("This booking was cancelled.");
        if (!["scheduled", "failed"].includes(pay.status)) {
          throw new PaymentsError(pay.status === "paid" ? "This payment is already paid." : "This payment can't be paid right now.");
        }
        const { data: booking } = await db().from("booking_requests")
          .select("id, status, service_name, event_date, vendor_id").eq("id", pay.booking_id).single();
        if (!booking || !["confirmed", "accepted", "approved"].includes(booking.status)) {
          throw new PaymentsError("The vendor needs to confirm this booking before you can pay.");
        }
        const { data: vp } = await db().from("vendor_profiles").select("business_name, biz_legal").eq("id", booking.vendor_id).single();
        const vendorName = vp?.business_name || vp?.biz_legal || "your vendor";

        let customer = me.profile?.stripe_customer_id;
        if (!customer) {
          const c = await stripe("POST", "/customers", {
            email: me.email || undefined,
            name: me.profile?.full_name || me.profile?.display_name || undefined,
            metadata: { pluj_user_id: me.uid },
          }, `pluj-customer-${me.uid}`);
          customer = c.id;
          await db().from("profiles").update({ stripe_customer_id: customer }).eq("id", me.uid);
        }

        await prepareCharge(pay, me.uid);   // sets the host's service fee, if any
        const base = returnBase(req);
        const label = `${KIND_LABEL[pay.kind]} (${pay.percent}%)`;
        const lineItems: any[] = [{
          quantity: 1,
          price_data: {
            currency: plan.currency || "usd", unit_amount: pay.amount_cents,
            product_data: { name: `${label} — ${booking.service_name || "Booking"} with ${vendorName}`,
                            description: `Event on ${booking.event_date}. PLUJ holds this payment until you release it, or 3 days after the event.` },
          },
        }];
        if (pay.host_fee_cents > 0) {
          lineItems.push({ quantity: 1, price_data: { currency: plan.currency || "usd", unit_amount: pay.host_fee_cents,
            product_data: { name: "Card processing fee" } } });
        }
        if (pay.host_service_fee_cents > 0) {
          lineItems.push({ quantity: 1, price_data: { currency: plan.currency || "usd", unit_amount: pay.host_service_fee_cents,
            product_data: { name: "PLUJ service fee" } } });
        }
        const session = await stripe("POST", "/checkout/sessions", {
          mode: "payment", customer, client_reference_id: pay.id,
          payment_method_types: ["card"],
          line_items: lineItems,
          payment_intent_data: {
            setup_future_usage: "off_session",   // saved for the event-day and final payments
            transfer_group: pay.booking_id,
            description: `PLUJ booking ${pay.booking_id} — ${label}`,
            metadata: { booking_id: pay.booking_id, payment_id: pay.id, kind: pay.kind },
          },
          metadata: { booking_id: pay.booking_id, payment_id: pay.id, kind: pay.kind },
          success_url: `${base}/?payment=success&booking=${encodeURIComponent(pay.booking_id)}`,
          cancel_url: `${base}/?payment=cancelled&booking=${encodeURIComponent(pay.booking_id)}`,
        });
        await db().from("booking_payments").update({ stripe_checkout_session_id: session.id }).eq("id", pay.id);
        return json({ url: session.url });
      }

      case "checkout_return": {
        const { data: plan } = await db().from("booking_payment_plans").select("host_id").eq("booking_id", body.booking_id).single();
        if (!plan || plan.host_id !== me.uid) throw new PaymentsError("Booking not found.", 404);
        const { data: pays } = await db().from("booking_payments").select("id, status, stripe_checkout_session_id")
          .eq("booking_id", body.booking_id).not("stripe_checkout_session_id", "is", null).in("status", ["scheduled", "failed"]);
        let paid = 0;
        for (const p of pays || []) {
          const cs = await stripe("GET", `/checkout/sessions/${p.stripe_checkout_session_id}`);
          if (cs.payment_status === "paid" && cs.payment_intent) {
            const pi = await markPaid(p.id, typeof cs.payment_intent === "string" ? cs.payment_intent : cs.payment_intent.id);
            if (pi?.status === "succeeded") paid++;
          }
        }
        return json({ ok: true, paid });
      }

      // ── Vendor: Stripe Express onboarding ───────────────────────────────
      case "vendor_connect":
      case "vendor_refresh":
      case "vendor_dashboard": {
        const { data: vp } = await db().from("vendor_profiles")
          .select("id, business_name, biz_website, stripe_account_id").eq("id", me.uid).single();
        if (!vp) throw new PaymentsError("Only vendors can set up payouts.", 403);
        let acct = vp.stripe_account_id;

        if (action === "vendor_refresh") {
          if (!acct) return json({ connected: false });
          return json({ connected: true, ...(await refreshVendorAccount(me.uid, acct)) });
        }
        if (action === "vendor_dashboard") {
          if (!acct) throw new PaymentsError("Set up payouts first.");
          const link = await stripe("POST", `/accounts/${acct}/login_links`);
          return json({ url: link.url });
        }

        if (!acct) {
          const site = (vp.biz_website || "").trim();
          const a = await stripe("POST", "/accounts", {
            type: "express", country: "US", email: me.email || undefined,
            capabilities: { transfers: { requested: true } },
            business_profile: {
              name: vp.business_name || undefined,
              url: /^https?:\/\//i.test(site) ? site : undefined,
              product_description: "Event services booked through PLUJ (pluj.us).",
            },
            metadata: { pluj_vendor_id: me.uid },
          }, `pluj-account-${me.uid}`);
          acct = a.id;
          await db().from("vendor_profiles").update({ stripe_account_id: acct, stripe_updated_at: new Date().toISOString() }).eq("id", me.uid);
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
          updated_at: now }).eq("booking_id", body.booking_id).neq("status", "cancelled");
        const sent = await releaseBooking(body.booking_id, { force: true });
        return json({ ok: true, sent_cents: sent });
      }

      case "admin_refund": {
        const { data: plan } = await db().from("booking_payment_plans").select("*").eq("booking_id", body.booking_id).single();
        if (!plan) throw new PaymentsError("No payments on this booking.");
        const { data: pays } = await db().from("booking_payments").select("*")
          .eq("booking_id", body.booking_id).eq("status", "paid").order("paid_at", { ascending: false });
        const refundable = (pays || []).reduce((n: number, p: any) => n + chargedCents(p) - (p.refunded_cents || 0), 0);
        let left = body.amount_cents == null ? refundable : Math.min(Number(body.amount_cents), refundable);
        if (!(left > 0)) throw new PaymentsError("There is nothing left to refund.");
        let refunded = 0;
        for (const p of pays || []) {
          if (left <= 0) break;
          const charged = chargedCents(p) - (p.refunded_cents || 0);
          const take = Math.min(charged, left);
          if (take <= 0 || !p.stripe_payment_intent_id) continue;
          if (p.transferred_cents > 0 && p.stripe_transfer_id && p.stripe_transfer_id !== "none") {
            const back = Math.min(p.transferred_cents, take);
            await stripe("POST", `/transfers/${p.stripe_transfer_id}/reversals`, { amount: back,
              metadata: { booking_id: body.booking_id, reason: "admin refund" } }, `pluj-reverse-${p.id}-${p.refunded_cents}-${back}`);
            await db().from("booking_payments").update({ transferred_cents: p.transferred_cents - back }).eq("id", p.id);
          }
          await stripe("POST", "/refunds", { payment_intent: p.stripe_payment_intent_id, amount: take,
            metadata: { booking_id: body.booking_id, payment_id: p.id, reason: "admin refund" } },
            `pluj-adminrefund-${p.id}-${p.refunded_cents}-${take}`);
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
        await db().from("booking_requests").update({ payment_status: full ? "refunded" : "partly_refunded" }).eq("id", body.booking_id);
        await notify(plan.host_id, "payment_refunded", "↩️ Refund on its way",
          `PLUJ refunded ${money(refunded)} to your card for booking ${body.booking_id}. Banks usually show it within 5–10 business days.`
          + (body.note ? ` Note from PLUJ: ${body.note}` : ""), body.booking_id);
        await notify(plan.vendor_id, "payment_refunded", "Refund issued to the host",
          `PLUJ refunded ${money(refunded)} to the host for booking ${body.booking_id}.` + (body.note ? ` Note from PLUJ: ${body.note}` : ""),
          body.booking_id);
        let sent = 0;
        if (!full && body.release_rest) sent = await releaseBooking(body.booking_id, { force: true });
        return json({ ok: true, refunded_cents: refunded, sent_cents: sent });
      }

      case "admin_hold": {
        await db().from("booking_payment_plans").update({
          status: body.hold ? "on_hold" : "active", hold_reason: body.hold ? (body.reason || "Held by PLUJ") : null, updated_at: now,
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
        const sent = await releaseBooking(body.booking_id);
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
        const wh = await stripe("POST", "/webhook_endpoints", {
          url, description: "PLUJ payments (pluj.us)",
          enabled_events: [
            "checkout.session.completed", "payment_intent.succeeded", "payment_intent.payment_failed",
            "charge.refunded", "charge.dispute.created", "charge.dispute.closed",
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
