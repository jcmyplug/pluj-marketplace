/* PLUJ payments scheduler. Called by pg_cron every 10 minutes
   (cron job "payments-scheduler") with the x-cron-secret header, which must
   match the PAYMENTS_CRON_SECRET in Vault.

   Each run:
     1. finishes full payments whose webhook hasn't arrived
     2. releases what is due from vendors' locked Stripe balances to their
        banks: 30% a week before the event, 50% the day after, 20% when the
        host approves or 3 days after; never while a booking is paused (a
        problem report or a chargeback)
     3. carries out cancellation refunds (from the vendor's Stripe balance) */

import {
  json, db, stripe, stripeKey, markPlanPaid, releaseDue, runPendingRefund,
} from "../_shared/payments.ts";

Deno.serve(async (req) => {
  const secret = req.headers.get("x-cron-secret") || "";
  const { data: ok } = await db().rpc("payments_cron_secret_ok", { p_secret: secret });
  if (ok !== true) return json({ error: "forbidden" }, 403);
  if (!stripeKey()) return json({ skipped: "no Stripe key" });

  const nowIso = new Date().toISOString();
  const report = { checkouts: 0, released_cents: 0, refunds: 0, errors: [] as string[] };

  // 1. Checkout sessions the webhook hasn't confirmed yet (one per booking)
  const { data: open } = await db().from("booking_payments").select("booking_id, stripe_checkout_session_id, stripe_account_id")
    .not("stripe_checkout_session_id", "is", null).in("status", ["scheduled", "failed"])
    .gte("updated_at", new Date(Date.now() - 2 * 86400000).toISOString()).limit(75);
  const seen = new Set<string>();
  for (const p of open || []) {
    const key = `${p.booking_id}|${p.stripe_checkout_session_id}`;
    if (seen.has(key) || !p.stripe_account_id) continue;
    seen.add(key);
    try {
      const cs = await stripe("GET", `/checkout/sessions/${p.stripe_checkout_session_id}`, {}, undefined, p.stripe_account_id);
      if (cs.payment_status === "paid" && cs.payment_intent) {
        await markPlanPaid(p.booking_id, typeof cs.payment_intent === "string" ? cs.payment_intent : cs.payment_intent.id, p.stripe_account_id);
        report.checkouts++;
      }
    } catch (e) { report.errors.push(`checkout ${p.booking_id}: ${(e as Error).message}`); }
  }

  // 2. Releases that are due
  const { data: due } = await db().from("booking_payments").select("booking_id")
    .eq("status", "paid").is("transferred_at", null).lte("due_at", nowIso).limit(300);
  const bookings: string[] = [...new Set<string>((due || []).map((p: any) => p.booking_id as string))];
  for (const b of bookings) {
    try { report.released_cents += await releaseDue(b); }
    catch (e) { report.errors.push(`release ${b}: ${(e as Error).message}`); }
  }

  // 3. Cancellation refunds
  const { data: refunds } = await db().from("booking_payment_plans").select("*").eq("refund_state", "pending").limit(25);
  for (const plan of refunds || []) {
    try { await runPendingRefund(plan); report.refunds++; }
    catch (e) { report.errors.push(`refund ${plan.booking_id}: ${(e as Error).message}`); }
  }

  if (report.errors.length) console.error("[payments-scheduler]", report.errors);
  return json(report);
});
