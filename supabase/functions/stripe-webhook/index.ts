/* PLUJ: Stripe webhook (a Connect webhook: payments happen on vendors'
   Stripe accounts, and event.account says which). Stripe calls this; it has
   no Supabase login, so every request is checked against Stripe's signature
   instead. The signing secret is in Vault (saved by Admin → Payments →
   Connect Stripe webhook), or STRIPE_WEBHOOK_SECRET in the function's secrets.

   Refunds and chargebacks are between the host, the vendor and Stripe: a
   chargeback is taken from the vendor's Stripe balance (where the unreleased
   money is locked) and the vendor answers it in their Stripe dashboard.
   PLUJ records it, tells everyone, and stops every release still to come.

   Each event is recorded in stripe_events and handled once. */

import {
  json, db, markPlanPaid, notify, tellAdmins, money, verifyStripeSignature, saveVendorAccountFlags,
} from "../_shared/payments.ts";

async function signingSecret(): Promise<string> {
  const env = (Deno.env.get("STRIPE_WEBHOOK_SECRET") || "").trim();
  if (env) return env;
  const { data } = await db().rpc("stripe_webhook_secret");
  return (data as string) || "";
}

/* One full payment covers all three parts of a booking, so a payment intent
   matches up to three rows: this returns the booking's first one. */
async function paymentFor(metadata: any, paymentIntentId?: string) {
  if (metadata?.booking_id) {
    const { data } = await db().from("booking_payments").select("*").eq("booking_id", metadata.booking_id).order("due_at").limit(1);
    if (data && data[0]) return data[0];
  }
  if (paymentIntentId) {
    const { data } = await db().from("booking_payments").select("*").eq("stripe_payment_intent_id", paymentIntentId).order("due_at").limit(1);
    if (data && data[0]) return data[0];
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
        if (pay) await markPlanPaid(pay.booking_id, piOf(obj), account);
        break;
      }
      case "payment_intent.succeeded": {
        if (!account) break;
        const pay = await paymentFor(obj.metadata, obj.id);
        if (pay) await markPlanPaid(pay.booking_id, obj.id, account);
        break;
      }
      case "charge.refunded": {
        // A refund the vendor made in their own Stripe dashboard: put the
        // difference on the parts not yet released, last part first.
        const pay = await paymentFor(obj.metadata, piOf(obj));
        if (pay) {
          const { data: rows } = await db().from("booking_payments").select("*").eq("booking_id", pay.booking_id)
            .eq("status", "paid").order("due_at", { ascending: false });
          let extra = (obj.amount_refunded || 0) - (rows || []).reduce((n: number, r: any) => n + (r.refunded_cents || 0), 0);
          for (const r of rows || []) {
            if (extra <= 0) break;
            const room = r.amount_cents + (r.host_fee_cents || 0) + (r.host_service_fee_cents || 0) - (r.refunded_cents || 0);
            const take = Math.min(room, extra);
            if (take > 0) await db().from("booking_payments").update({ refunded_cents: (r.refunded_cents || 0) + take }).eq("id", r.id);
            extra -= take;
          }
        }
        break;
      }
      case "charge.dispute.created": {
        const pay = await paymentFor(obj.metadata, piOf(obj));
        if (pay) {
          await db().from("booking_payment_plans").update({ status: "on_hold",
            hold_reason: "The host's bank opened a dispute (chargeback)", updated_at: new Date().toISOString() })
            .eq("booking_id", pay.booking_id).eq("status", "active");
          const { data: plan } = await db().from("booking_payment_plans").select("host_id, vendor_id").eq("booking_id", pay.booking_id).single();
          if (plan) {
            await notify(plan.vendor_id, "payment_problem", "🚩 A host's bank disputed a payment",
              `The host's bank opened a dispute (chargeback) for ${money(obj.amount || 0)} on booking ${pay.booking_id}. `
              + "Stripe took the amount and its dispute fee from your Stripe balance. Answer it with evidence in your Stripe dashboard before Stripe's deadline. "
              + "Releases still to come on this booking are frozen.", pay.booking_id);
            await notify(plan.host_id, "payment_problem", "Card dispute opened",
              `Your bank opened a dispute for ${money(obj.amount || 0)} on this booking. Your bank and the vendor will settle it through Stripe. `
              + "Nothing more is released to the vendor while it is open.", pay.booking_id);
          }
        }
        await tellAdmins("payment_problem", "🚩 Chargeback opened (for your information)",
          `A card dispute for ${money(obj.amount || 0)} was opened` + (pay ? ` on booking ${pay.booking_id}` : "")
          + ". It is on the vendor's Stripe account, so the vendor answers it; nothing is taken from PLUJ. Releases on the booking are frozen.",
          pay?.booking_id);
        break;
      }
      case "charge.dispute.closed": {
        const pay = await paymentFor(obj.metadata, piOf(obj));
        if (pay) {
          const { data: plan } = await db().from("booking_payment_plans").select("host_id, vendor_id").eq("booking_id", pay.booking_id).single();
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
