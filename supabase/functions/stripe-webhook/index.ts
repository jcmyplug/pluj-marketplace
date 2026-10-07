/* PLUJ: Stripe webhook (a Connect webhook: payments happen on vendors'
   Stripe accounts, and event.account says which). Stripe calls this; it has
   no Supabase login, so every request is checked against Stripe's signature
   instead. The signing secret is in Vault (saved by Admin → Payments →
   Connect Stripe webhook), or STRIPE_WEBHOOK_SECRET in the function's secrets.

   Refunds and chargebacks are between the host, the vendor and Stripe: a
   chargeback is taken from the vendor's Stripe account and the vendor answers
   it in their Stripe dashboard. PLUJ only records it, tells everyone, and
   stops any payments still to be charged on that booking.

   Each event is recorded in stripe_events and handled once. */

import {
  json, db, markPaid, notify, tellAdmins, money, verifyStripeSignature, saveVendorAccountFlags,
} from "../_shared/payments.ts";

async function signingSecret(): Promise<string> {
  const env = (Deno.env.get("STRIPE_WEBHOOK_SECRET") || "").trim();
  if (env) return env;
  const { data } = await db().rpc("stripe_webhook_secret");
  return (data as string) || "";
}

async function paymentFor(metadata: any, paymentIntentId?: string) {
  if (metadata?.payment_id) {
    const { data } = await db().from("booking_payments").select("*").eq("id", metadata.payment_id).maybeSingle();
    if (data) return data;
  }
  if (paymentIntentId) {
    const { data } = await db().from("booking_payments").select("*").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
    if (data) return data;
  }
  return null;
}

const piOf = (o: any) => typeof o?.payment_intent === "string" ? o.payment_intent : o?.payment_intent?.id;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const payload = await req.text();
  const ok = await verifyStripeSignature(payload, req.headers.get("stripe-signature"), await signingSecret());
  if (!ok) return json({ error: "bad signature" }, 400);

  const event = JSON.parse(payload);
  const { error: dup } = await db().from("stripe_events").insert({ id: event.id, type: event.type, payload: event });
  if (dup) {
    if ((dup as any).code === "23505") return json({ received: true, duplicate: true });
    console.warn("[stripe-webhook] could not record event", dup.message);
  }

  const obj = event.data?.object || {};
  const account: string | undefined = event.account;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        if (obj.payment_status !== "paid" || !obj.payment_intent || !account) break;
        const pay = await paymentFor(obj.metadata);
        if (pay) await markPaid(pay.id, piOf(obj), account);
        break;
      }
      case "payment_intent.succeeded": {
        if (!account) break;
        const pay = await paymentFor(obj.metadata, obj.id);
        if (pay) await markPaid(pay.id, obj.id, account);
        break;
      }
      case "payment_intent.payment_failed": {
        // Off-session failures are handled where the charge is made
        // (chargeSaved); this catches anything that fails later.
        const pay = await paymentFor(obj.metadata, obj.id);
        if (pay && pay.status === "processing") {
          await db().from("booking_payments").update({
            status: "failed", last_error: obj.last_payment_error?.message || "the card was declined.",
            next_attempt_at: new Date(Date.now() + 24 * 3600000).toISOString(),
          }).eq("id", pay.id);
        }
        break;
      }
      case "charge.refunded": {
        const pay = await paymentFor(obj.metadata, piOf(obj));
        if (pay && (obj.amount_refunded || 0) > (pay.refunded_cents || 0)) {
          // A refund the vendor made in their own Stripe dashboard: keep our record right.
          await db().from("booking_payments").update({ refunded_cents: obj.amount_refunded }).eq("id", pay.id);
        }
        break;
      }
      case "charge.dispute.created": {
        const pay = await paymentFor(obj.metadata, piOf(obj));
        if (pay) {
          await db().from("booking_payments").update({ disputed_cents: (pay.disputed_cents || 0) + (obj.amount || 0) }).eq("id", pay.id);
          await db().from("booking_payment_plans").update({ status: "on_hold",
            hold_reason: "The host's bank opened a dispute (chargeback)", updated_at: new Date().toISOString() })
            .eq("booking_id", pay.booking_id).eq("status", "active");
          const { data: plan } = await db().from("booking_payment_plans").select("host_id, vendor_id").eq("booking_id", pay.booking_id).single();
          if (plan) {
            await notify(plan.vendor_id, "payment_problem", "🚩 A host's bank disputed a payment",
              `The host's bank opened a dispute (chargeback) for ${money(obj.amount || 0)} on booking ${pay.booking_id}. `
              + "Stripe took the amount and its dispute fee from your Stripe account. Answer it with evidence in your Stripe dashboard before Stripe's deadline. "
              + "Payments still to be charged on this booking are paused.", pay.booking_id);
            await notify(plan.host_id, "payment_problem", "Card dispute opened",
              `Your bank opened a dispute for ${money(obj.amount || 0)} on this booking. Your bank and the vendor will settle it through Stripe. `
              + "Payments still to be charged on this booking are paused.", pay.booking_id);
          }
        }
        await tellAdmins("payment_problem", "🚩 Chargeback opened (for your information)",
          `A card dispute for ${money(obj.amount || 0)} was opened` + (pay ? ` on booking ${pay.booking_id}` : "")
          + ". It is on the vendor's Stripe account, so the vendor answers it; nothing is taken from PLUJ. Remaining payments on the booking are paused.",
          pay?.booking_id);
        break;
      }
      case "charge.dispute.closed": {
        const pay = await paymentFor(obj.metadata, piOf(obj));
        if (pay) {
          const { data: plan } = await db().from("booking_payment_plans").select("host_id, vendor_id").eq("booking_id", pay.booking_id).single();
          if (obj.status === "won") {
            await db().from("booking_payments").update({ disputed_cents: Math.max(0, (pay.disputed_cents || 0) - (obj.amount || 0)) }).eq("id", pay.id);
          }
          if (plan) {
            await notify(plan.vendor_id, "payment_problem", `Card dispute closed: ${obj.status}`,
              `The dispute for ${money(obj.amount || 0)} on booking ${pay.booking_id} closed with status "${obj.status}".`
              + (obj.status === "won" ? " Stripe returned the amount to your Stripe account." : ""), pay.booking_id);
          }
        }
        await tellAdmins("payment_problem", `Chargeback closed: ${obj.status}`,
          `The card dispute for ${money(obj.amount || 0)} closed with status "${obj.status}". `
          + "If the booking should carry on, resume it in Admin → Payments.", pay?.booking_id);
        break;
      }
      case "account.updated": {
        const { data: vp } = await db().from("vendor_profiles").select("id").eq("stripe_account_id", obj.id).maybeSingle();
        if (vp) await saveVendorAccountFlags(vp.id, obj);
        break;
      }
    }
  } catch (e) {
    console.error("[stripe-webhook]", event.type, (e as Error).message);
    // Let Stripe retry: forget we saw it.
    await db().from("stripe_events").delete().eq("id", event.id);
    return json({ error: "handler failed" }, 500);
  }
  return json({ received: true });
});
