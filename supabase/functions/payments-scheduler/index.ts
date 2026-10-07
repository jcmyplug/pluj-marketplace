/* PLUJ payments scheduler. Called by pg_cron every 10 minutes
   (cron job "payments-scheduler") with the x-cron-secret header, which must
   match the PAYMENTS_CRON_SECRET in Vault.

   Each run:
     1. finishes Checkout payments whose webhook hasn't arrived
     2. charges the payments that are due, with the card the host saved on
        the vendor's Stripe account:
          event_day  8 AM Houston time on the event date
          final      when the host approves it, or automatically 3 days
                     after the event
        never while the booking is on hold (a problem report or a dispute);
        a failure is retried every 24 hours, up to 4 tries, and the host can
        Pay now
     3. carries out cancellation refunds (from the vendor's Stripe account) */

import {
  json, db, stripe, stripeKey, markPaid, chargeSaved, runPendingRefund,
} from "../_shared/payments.ts";

Deno.serve(async (req) => {
  const secret = req.headers.get("x-cron-secret") || "";
  const { data: ok } = await db().rpc("payments_cron_secret_ok", { p_secret: secret });
  if (ok !== true) return json({ error: "forbidden" }, 403);
  if (!stripeKey()) return json({ skipped: "no Stripe key" });

  const nowIso = new Date().toISOString();
  const report = { checkouts: 0, charged: 0, failed: 0, refunds: 0, errors: [] as string[] };

  // 1. Checkout sessions the webhook hasn't confirmed yet
  const { data: open } = await db().from("booking_payments").select("id, stripe_checkout_session_id, stripe_account_id")
    .not("stripe_checkout_session_id", "is", null).in("status", ["scheduled", "failed"])
    .gte("updated_at", new Date(Date.now() - 2 * 86400000).toISOString()).limit(25);
  for (const p of open || []) {
    if (!p.stripe_account_id) continue;
    try {
      const cs = await stripe("GET", `/checkout/sessions/${p.stripe_checkout_session_id}`, {}, undefined, p.stripe_account_id);
      if (cs.payment_status === "paid" && cs.payment_intent) {
        await markPaid(p.id, typeof cs.payment_intent === "string" ? cs.payment_intent : cs.payment_intent.id, p.stripe_account_id);
        report.checkouts++;
      }
    } catch (e) { report.errors.push(`checkout ${p.id}: ${(e as Error).message}`); }
  }

  // Payments stuck in "processing" for over an hour: ask Stripe.
  const { data: stuck } = await db().from("booking_payments").select("id, stripe_payment_intent_id, stripe_account_id")
    .eq("status", "processing").lt("updated_at", new Date(Date.now() - 3600000).toISOString()).limit(25);
  for (const p of stuck || []) {
    try {
      if (!p.stripe_payment_intent_id || !p.stripe_account_id) {
        await db().from("booking_payments").update({ status: "failed", last_error: "interrupted",
          next_attempt_at: nowIso }).eq("id", p.id);
        continue;
      }
      const pi = await markPaid(p.id, p.stripe_payment_intent_id, p.stripe_account_id);
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
    if (!plan || plan.status !== "active") continue;          // on hold, cancelled or finished: don't charge
    const { data: problems } = await db().from("booking_problems").select("id").eq("booking_id", p.booking_id).eq("status", "open");
    if ((problems || []).length) continue;
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

  if (report.errors.length) console.error("[payments-scheduler]", report.errors);
  return json(report);
});
