/* PLUJ payments scheduler. Called by pg_cron every 10 minutes
   (cron job "payments-scheduler") with the x-cron-secret header, which must
   match the PAYMENTS_CRON_SECRET in Vault.

   Each run:
     1. finishes Checkout payments whose webhook hasn't arrived
     2. charges event-day (8 AM on the event date) and final (noon the day
        after) payments that are due, with the host's saved card; a failure
        is retried every 24 hours, up to 4 tries, and the host can Pay now
     3. carries out cancellation refunds
     4. sends released money to vendors: when the host released it, approved
        an early-release request, or 3 days after the event; never while a
        problem is open or the booking is on hold */

import {
  json, db, stripe, stripeKey, markPaid, chargeSaved, runPendingRefund, releaseBooking,
} from "../_shared/payments.ts";

Deno.serve(async (req) => {
  const secret = req.headers.get("x-cron-secret") || "";
  const { data: ok } = await db().rpc("payments_cron_secret_ok", { p_secret: secret });
  if (ok !== true) return json({ error: "forbidden" }, 403);
  if (!stripeKey()) return json({ skipped: "no Stripe key" });

  const nowIso = new Date().toISOString();
  const report = { checkouts: 0, charged: 0, failed: 0, refunds: 0, released_cents: 0, errors: [] as string[] };

  // 1. Checkout sessions the webhook hasn't confirmed yet
  const { data: open } = await db().from("booking_payments").select("id, stripe_checkout_session_id")
    .not("stripe_checkout_session_id", "is", null).in("status", ["scheduled", "failed"])
    .gte("updated_at", new Date(Date.now() - 2 * 86400000).toISOString()).limit(25);
  for (const p of open || []) {
    try {
      const cs = await stripe("GET", `/checkout/sessions/${p.stripe_checkout_session_id}`);
      if (cs.payment_status === "paid" && cs.payment_intent) {
        await markPaid(p.id, typeof cs.payment_intent === "string" ? cs.payment_intent : cs.payment_intent.id);
        report.checkouts++;
      }
    } catch (e) { report.errors.push(`checkout ${p.id}: ${(e as Error).message}`); }
  }

  // Payments stuck in "processing" for over an hour: ask Stripe.
  const { data: stuck } = await db().from("booking_payments").select("id, stripe_payment_intent_id")
    .eq("status", "processing").lt("updated_at", new Date(Date.now() - 3600000).toISOString()).limit(25);
  for (const p of stuck || []) {
    try {
      if (!p.stripe_payment_intent_id) {
        await db().from("booking_payments").update({ status: "failed", last_error: "interrupted",
          next_attempt_at: nowIso }).eq("id", p.id);
        continue;
      }
      const pi = await markPaid(p.id, p.stripe_payment_intent_id);
      if (pi && ["requires_payment_method", "canceled"].includes(pi.status)) {
        await db().from("booking_payments").update({ status: "failed", last_error: "the card was declined.",
          next_attempt_at: nowIso }).eq("id", p.id);
      }
    } catch (e) { report.errors.push(`processing ${p.id}: ${(e as Error).message}`); }
  }

  // 2. Due event-day and final payments
  const { data: due } = await db().from("booking_payments").select("*")
    .in("status", ["scheduled", "failed"]).neq("kind", "retainer").lte("due_at", nowIso).limit(50);
  for (const p of due || []) {
    if (p.next_attempt_at && new Date(p.next_attempt_at) > new Date()) continue;
    if ((p.attempts || 0) >= 4) continue;
    const { data: plan } = await db().from("booking_payment_plans").select("*").eq("booking_id", p.booking_id).single();
    if (!plan || plan.status !== "active") continue;          // on hold, cancelled or released: don't charge
    try {
      const r = await chargeSaved(p, plan);
      if (r === "paid") report.charged++; else if (r === "failed") report.failed++;
    } catch (e) { report.errors.push(`charge ${p.id}: ${(e as Error).message}`); }
  }

  // 3. Cancellation refunds
  const { data: refunds } = await db().from("booking_payment_plans").select("*").eq("refund_state", "pending").limit(25);
  for (const plan of refunds || []) {
    try { await runPendingRefund(plan); report.refunds++; }
    catch (e) { report.errors.push(`refund ${plan.booking_id}: ${(e as Error).message}`); }
  }

  // 4. Payouts: anything paid and not yet sent, on plans that aren't finished
  const { data: unsent } = await db().from("booking_payments").select("booking_id")
    .eq("status", "paid").is("transferred_at", null).limit(200);
  const bookings = [...new Set((unsent || []).map((p: any) => p.booking_id))];
  for (const b of bookings) {
    try { report.released_cents += await releaseBooking(b as string); }
    catch (e) { report.errors.push(`release ${b}: ${(e as Error).message}`); }
  }

  if (report.errors.length) console.error("[payments-scheduler]", report.errors);
  return json(report);
});
