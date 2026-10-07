/* PLUJ: Stripe webhook. Stripe calls this; it has no Supabase login, so
   every request is checked against Stripe's signature instead. The signing
   secret is in Vault (saved by Admin → Payments → Connect Stripe webhook),
   or STRIPE_WEBHOOK_SECRET in the function's secrets.

   Each event is recorded in stripe_events and handled once. */

import {
  json, db, markPaid, notify, tellAdmins, money, verifyStripeSignature, settings, addVendorDebt, chargedCents, stripe,
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
          /* Stripe takes the disputed amount and a $15 fee from PLUJ's balance.
             PLUJ doesn't absorb either: if the money is still held, the
             disputed part is not paid to the vendor; if it was already paid,
             it is taken back from the vendor (or put on their balance due),
             and the fee goes on their balance due. */
          const { data: plan } = await db().from("booking_payment_plans").select("vendor_id").eq("booking_id", pay.booking_id).single();
          const s = await settings();
          const amount = Math.min(obj.amount || 0, chargedCents(pay) - (pay.refunded_cents || 0));
          if (!pay.transferred_at) {
            await db().from("booking_payments").update({ disputed_cents: (pay.disputed_cents || 0) + amount }).eq("id", pay.id);
          } else if (plan) {
            // Already paid out: take it back from the vendor's Stripe balance;
            // whatever can't be taken back goes on their balance due.
            let back = 0;
            if ((pay.transferred_cents || 0) > 0 && pay.stripe_transfer_id && pay.stripe_transfer_id !== "none") {
              try {
                back = Math.min(pay.transferred_cents, amount);
                await stripe("POST", `/transfers/${pay.stripe_transfer_id}/reversals`, { amount: back,
                  metadata: { booking_id: pay.booking_id, reason: "chargeback" } }, `pluj-dispute-${obj.id}`);
                await db().from("booking_payments").update({ transferred_cents: pay.transferred_cents - back,
                  disputed_cents: (pay.disputed_cents || 0) + back }).eq("id", pay.id);
              } catch (e) {
                console.warn("[stripe-webhook] reversal failed", (e as Error).message);
                back = 0;
              }
            }
            await addVendorDebt(plan.vendor_id, amount - back);
          }
          if (plan) await addVendorDebt(plan.vendor_id, Number(s.dispute_fee_cents ?? 1500));
        }
        await tellAdmins("payment_problem", "🚩 Chargeback opened",
          `A card dispute for ${money(obj.amount || 0)} was opened` + (pay ? ` on booking ${pay.booking_id}. Its payout is on hold.` : ".")
          + " Respond in the Stripe dashboard before the deadline.", pay?.booking_id, "Chargeback opened on PLUJ");
        break;
      }
      case "charge.dispute.closed": {
        const pay = await paymentFor(obj.metadata, typeof obj.payment_intent === "string" ? obj.payment_intent : undefined);
        if (pay) {
          const { data: plan } = await db().from("booking_payment_plans").select("vendor_id").eq("booking_id", pay.booking_id).single();
          const s = await settings();
          if (obj.status === "won") {
            // The money came back to PLUJ: undo what the dispute took.
            if ((pay.disputed_cents || 0) > 0 && !pay.transferred_at) {
              await db().from("booking_payments").update({ disputed_cents: Math.max(0, pay.disputed_cents - (obj.amount || 0)) }).eq("id", pay.id);
            } else if (plan) {
              // Give the vendor back what was taken: the reversed part as a new
              // transfer, the rest off their balance due.
              const reversed = Math.min(pay.disputed_cents || 0, obj.amount || 0);
              const { data: vp } = await db().from("vendor_profiles").select("stripe_account_id").eq("id", plan.vendor_id).single();
              let returned = 0;
              if (reversed > 0 && vp?.stripe_account_id) {
                try {
                  await stripe("POST", "/transfers", { amount: reversed, currency: "usd", destination: vp.stripe_account_id,
                    transfer_group: pay.booking_id, description: `PLUJ booking ${pay.booking_id}: chargeback won`,
                    metadata: { booking_id: pay.booking_id, payment_id: pay.id, reason: "chargeback won" } }, `pluj-dispute-won-${obj.id}`);
                  await db().from("booking_payments").update({ transferred_cents: (pay.transferred_cents || 0) + reversed,
                    disputed_cents: Math.max(0, (pay.disputed_cents || 0) - reversed) }).eq("id", pay.id);
                  returned = reversed;
                } catch (e) { console.warn("[stripe-webhook] return transfer failed", (e as Error).message); }
              }
              await addVendorDebt(plan.vendor_id, -((obj.amount || 0) - returned));
            }
          } else if (obj.status === "lost" && plan && (obj.evidence_details?.submission_count || 0) > 0) {
            // A countered dispute that was lost costs a second $15.
            await addVendorDebt(plan.vendor_id, Number(s.dispute_fee_cents ?? 1500));
          }
        }
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
