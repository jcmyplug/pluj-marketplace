/* PLUJ: Stripe webhook. Stripe calls this; it has no Supabase login, so
   every request is checked against Stripe's signature instead. The signing
   secret is in Vault (saved by Admin → Payments → Connect Stripe webhook),
   or STRIPE_WEBHOOK_SECRET in the function's secrets.

   Each event is recorded in stripe_events and handled once. */

import {
  json, db, markPaid, notify, tellAdmins, money, verifyStripeSignature,
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
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        if (obj.payment_status !== "paid" || !obj.payment_intent) break;
        const pay = await paymentFor(obj.metadata);
        if (pay) await markPaid(pay.id, typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent.id);
        break;
      }
      case "payment_intent.succeeded": {
        const pay = await paymentFor(obj.metadata, obj.id);
        if (pay) await markPaid(pay.id, obj.id);
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
        const pay = await paymentFor(obj.metadata, typeof obj.payment_intent === "string" ? obj.payment_intent : undefined);
        if (pay && (obj.amount_refunded || 0) > (pay.refunded_cents || 0)) {
          // A refund made directly in the Stripe dashboard: keep our record right.
          await db().from("booking_payments").update({ refunded_cents: obj.amount_refunded }).eq("id", pay.id);
        }
        break;
      }
      case "charge.dispute.created": {
        const pay = await paymentFor(obj.metadata, typeof obj.payment_intent === "string" ? obj.payment_intent : undefined);
        if (pay) {
          await db().from("booking_payment_plans").update({ status: "on_hold",
            hold_reason: "The host's bank opened a dispute (chargeback)" }).eq("booking_id", pay.booking_id).neq("status", "cancelled");
        }
        await tellAdmins("payment_problem", "🚩 Chargeback opened",
          `A card dispute for ${money(obj.amount || 0)} was opened` + (pay ? ` on booking ${pay.booking_id}. Its payout is on hold.` : ".")
          + " Respond in the Stripe dashboard before the deadline.", pay?.booking_id, "Chargeback opened on PLUJ");
        break;
      }
      case "charge.dispute.closed": {
        await tellAdmins("payment_problem", `Chargeback closed: ${obj.status}`,
          `The card dispute for ${money(obj.amount || 0)} closed with status "${obj.status}". Release or refund the booking in Admin → Payments.`);
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
