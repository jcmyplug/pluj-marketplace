/* PLUJ payments: code shared by the three edge functions
     payments            host Checkout, vendor Stripe onboarding, admin actions
     payments-scheduler  every 10 minutes: releases and refunds
     stripe-webhook      Stripe's confirmations (a Connect webhook)

   HOW MONEY MOVES (since 7 Oct 2026, night)
     The host pays the FULL price upfront, as a "direct charge" on the
     vendor's own Stripe account. PLUJ's service fees come to PLUJ as Stripe
     "application fees". The vendor's automatic payouts are switched off
     (manual payouts), so the money stays locked in the vendor's Stripe
     balance, and PLUJ pays it out to the vendor's bank in three parts:
       retainer   30%  7 days before the event
       event_day  50%  the day after the event
       final      20%  when the host approves it, or 3 days after the event
     A problem report or a chargeback stops every release still to come, so
     the locked money is there for refunds. Vendor accounts are created with
     Stripe liable for their losses and the vendor paying Stripe's fees, so
     refunds, chargebacks and negative balances are between the host, the
     vendor and Stripe. Nothing is ever taken from PLUJ's own Stripe balance.

   Stripe is called through its REST API with fetch, so there is no SDK to
   keep in step. Money is in cents throughout. The database side is
   sql/2026-10-07-payments.sql (section 13).

   Secrets (Supabase → Edge Functions → Secrets):
     STRIPE_SECRET_KEY   sk_test_… while testing, sk_live_… when live
   The webhook signing secret is saved in Vault by "Connect Stripe webhook"
   in Admin → Payments; STRIPE_WEBHOOK_SECRET in the env overrides it. */

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SITE = "https://www.pluj.us";
const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2024-06-20";

// ── HTTP helpers ─────────────────────────────────────────────────────────────
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* A message that is safe and useful to show the person. */
export class PaymentsError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export class StripeError extends Error {
  status: number; code?: string; declineCode?: string; type?: string; raw: unknown;
  constructor(message: string, status: number, raw: any) {
    super(message);
    this.status = status;
    this.code = raw?.code; this.declineCode = raw?.decline_code; this.type = raw?.type;
    this.raw = raw;
  }
}

// ── Database (service role: bypasses RLS, so every caller is checked here) ──
let _admin: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

export async function settings(): Promise<Record<string, string>> {
  const { data } = await db().from("platform_settings").select("key, value");
  const out: Record<string, string> = {};
  for (const r of data || []) out[r.key] = r.value;
  return out;
}

export async function notify(userId: string, type: string, title: string, body: string, bookingId?: string) {
  const { error } = await db().from("notifications").insert({
    user_id: userId, type, title, body, request_id: bookingId || null,
  });
  if (error) console.warn("[payments] notify failed", error.message);
}

export async function email(to: string | null | undefined, subject: string, html: string, kind: string, ref: string) {
  if (!to || !to.includes("@")) return;
  const { error } = await db().rpc("queue_email", { p_to: to, p_subject: subject, p_html: html, p_kind: kind, p_ref: ref });
  if (error) console.warn("[payments] email failed", error.message);
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function money(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* The same simple layout as the database emails. */
export function emailHtml(badge: string, badgeBg: string, badgeFg: string, headline: string, message: string,
                          buttonText = "Open PLUJ", buttonUrl = SITE): string {
  return '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;padding:24px">'
    + `<div style="display:inline-block;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;background:${badgeBg};color:${badgeFg}">${esc(badge)}</div>`
    + `<h2 style="margin:12px 0 6px;font-size:20px;color:#111">${esc(headline)}</h2>`
    + `<p style="margin:0 0 18px;color:#555;font-size:14px;line-height:1.6">${esc(message)}</p>`
    + `<p style="margin:0"><a href="${esc(buttonUrl)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#FF5C28;color:#fff;font-weight:700;font-size:14px;text-decoration:none">${esc(buttonText)}</a></p>`
    + '<p style="margin:22px 0 0;color:#999;font-size:12px">Sent by PLUJ · pluj.us</p></div>';
}

export async function adminContacts(): Promise<{ user_id: string; email: string | null }[]> {
  const { data: admins } = await db().from("admin_users").select("user_id");
  const ids = (admins || []).map((a: any) => a.user_id);
  if (!ids.length) return [];
  const { data: profs } = await db().from("profiles").select("id, email").in("id", ids);
  return ids.map((id: string) => ({ user_id: id, email: (profs || []).find((p: any) => p.id === id)?.email || null }));
}

export async function tellAdmins(type: string, title: string, body: string, bookingId?: string, emailSubject?: string) {
  for (const a of await adminContacts()) {
    await notify(a.user_id, type, title, body, bookingId);
    if (emailSubject) {
      await email(a.email, emailSubject, emailHtml("Payments", "#FEF2F2", "#B91C1C", title, body, "Open Admin → Payments"),
                  type, bookingId || "");
    }
  }
}

// ── Stripe REST ──────────────────────────────────────────────────────────────
export function stripeKey(): string | null {
  const k = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
  return /^(sk|rk)_(test|live)_/.test(k) ? k : null;
}
export function stripeMode(): "test" | "live" | null {
  const k = stripeKey();
  return k ? (k.includes("_live_") ? "live" : "test") : null;
}

/* Stripe's form encoding: a[b]=1, a[0]=x … */
function encode(params: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") out.push(...encode(item as Record<string, unknown>, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") {
      out.push(...encode(v as Record<string, unknown>, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

/* account: a vendor's Stripe account id, to act on that account (direct
   charges, their customers, their refunds). */
export async function stripe(method: "GET" | "POST" | "DELETE", path: string,
                             params: Record<string, unknown> = {}, idempotencyKey?: string,
                             account?: string | null): Promise<any> {
  const key = stripeKey();
  if (!key) throw new PaymentsError("Stripe isn't connected to PLUJ yet. An admin needs to add the Stripe key.", 503);
  const qs = encode(params).join("&");
  const url = STRIPE_API + path + (method === "GET" && qs ? `?${qs}` : "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": STRIPE_VERSION,
  };
  if (method !== "GET") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (account) headers["Stripe-Account"] = account;
  const res = await fetch(url, { method, headers, body: method === "GET" ? undefined : qs });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error || {};
    throw new StripeError(e.message || `Stripe error ${res.status}`, res.status, e);
  }
  return body;
}

/* Stripe-Signature: t=…,v1=… — HMAC-SHA256 of "t.payload". */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string,
                                            toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  let t = ""; const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") t = v; else if (k === "v1" && v) v1.push(v);
  }
  if (!t || !v1.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > toleranceSec) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`)));
  const hex = Array.from(sig).map(b => b.toString(16).padStart(2, "0")).join("");
  return v1.some(candidate => {
    if (candidate.length !== hex.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= candidate.charCodeAt(i) ^ hex.charCodeAt(i);
    return diff === 0;
  });
}

// ── Payment bookkeeping ──────────────────────────────────────────────────────
export const KIND_LABEL: Record<string, string> = {
  retainer: "First release (30%)", event_day: "Second release (50%)", final: "Final release (20%)",
};

/* Everything the host is charged for one part. */
export function chargedCents(p: any): number {
  return p.amount_cents + (p.host_fee_cents || 0) + (p.host_service_fee_cents || 0);
}

/* What the vendor gets paid out for one part: what was charged for it, less
   Stripe's fee and PLUJ's fee on it, less anything refunded or disputed. */
export function netCents(p: any): number {
  return Math.max(0, chargedCents(p) - (p.stripe_fee_cents || 0) - (p.platform_fee_cents || 0)
                     - (p.refunded_cents || 0) - (p.disputed_cents || 0));
}

/* Split a whole-charge amount across the parts in proportion to their size;
   the last part takes the rounding. */
function split(total: number, rows: any[]): number[] {
  const sum = rows.reduce((n, r) => n + chargedCents(r), 0) || 1;
  let left = total;
  return rows.map((r, i) => {
    if (i === rows.length - 1) return left;
    const v = Math.round(total * chargedCents(r) / sum);
    left -= v;
    return v;
  });
}

/* The host's full payment on the vendor's account succeeded: mark every part
   paid, with its share of Stripe's fee and PLUJ's fee. Safe to call more
   than once (the webhook and the scheduler can both see it). */
export async function markPlanPaid(bookingId: string, paymentIntentId: string, account: string) {
  const pi = await stripe("GET", `/payment_intents/${paymentIntentId}`,
                          { expand: ["latest_charge.balance_transaction"] }, undefined, account);
  if (pi.status !== "succeeded") return pi;
  const charge = pi.latest_charge || {};
  const details: any[] = charge.balance_transaction?.fee_details || [];
  const stripeFee = details.filter((d: any) => d.type === "stripe_fee").reduce((n: number, d: any) => n + (d.amount || 0), 0);

  const { data: rows } = await db().from("booking_payments").select("*").eq("booking_id", bookingId)
    .in("status", ["scheduled", "failed", "processing"]).order("due_at");
  if (!rows || !rows.length) return pi;
  const fees = split(stripeFee, rows);
  const appFees = split(pi.application_fee_amount || 0, rows);
  const paidAt = new Date((charge.created || pi.created) * 1000).toISOString();
  for (let i = 0; i < rows.length; i++) {
    await db().from("booking_payments").update({
      status: "paid", paid_at: paidAt, stripe_payment_intent_id: pi.id, stripe_charge_id: charge.id || null,
      stripe_account_id: account, stripe_fee_cents: fees[i], platform_fee_cents: appFees[i],
      last_error: null, next_attempt_at: null, updated_at: new Date().toISOString(),
    }).eq("id", rows[i].id).neq("status", "paid");
  }
  await db().from("booking_requests").update({ payment_status: "paid_in_full", paid_at: new Date().toISOString() }).eq("id", bookingId);

  const { data: plan } = await db().from("booking_payment_plans").select("*").eq("booking_id", bookingId).single();
  const { data: booking } = await db().from("booking_requests").select("id, service_name, event_date").eq("id", bookingId).single();
  if (plan) {
    const svc = booking?.service_name || "your booking";
    const total = money(rows.reduce((n: number, r: any) => n + r.amount_cents, 0));
    await notify(plan.vendor_id, "payment_received", "✅ Paid in full — booking secured",
      `The host paid ${total} for ${svc} on ${booking?.event_date || "the event date"}. It is locked in your Stripe balance `
      + "and PLUJ releases it to your bank in parts: 30% a week before the event, 50% the day after, and 20% when the host approves (or 3 days after).",
      bookingId);
    await notify(plan.host_id, "payment_received", "✅ Paid in full — your date is secured",
      `You paid ${money(chargedCents({ amount_cents: rows.reduce((n: number, r: any) => n + chargedCents(r), 0) }))} for ${svc}. `
      + "The vendor can't touch it yet: it is released in parts, and the last 20% only when you approve it after the event. "
      + "If something goes wrong, press Report a problem and everything not yet released is frozen.", bookingId);
  }
  // Anything already due (an event less than a week away): release it now.
  try { await releaseDue(bookingId); } catch (e) { console.warn("[payments] release after payment failed", (e as Error).message); }
  return pi;
}

/* PLUJ's service fees. Nothing during an account's first N months on PLUJ;
   after that PLUJ keeps platform_fee_after_intro_percent (3%) of each payment
   from the vendor, and adds host_service_fee_after_intro_percent (1%) to the
   host's payment. Each side counts from its own sign-up date. Both are
   collected as Stripe application fees, which Stripe doesn't return on
   refunds unless asked to. */
function afterIntro(since: string | null, at: string | null, months: number): boolean {
  if (!since || !at) return false;
  const cutoff = new Date(since);
  cutoff.setMonth(cutoff.getMonth() + months);
  return new Date(at) >= cutoff;
}
export function vendorFeePercent(s: Record<string, string>, vendorSince: string | null, at: string | null): number {
  return afterIntro(vendorSince, at, Number(s.platform_fee_intro_months ?? 3))
    ? Number(s.platform_fee_after_intro_percent ?? 3) : Number(s.platform_fee_percent ?? 0);
}
export function hostFeePercent(s: Record<string, string>, hostSince: string | null, at: string): number {
  return afterIntro(hostSince, at, Number(s.host_service_fee_intro_months ?? 3))
    ? Number(s.host_service_fee_after_intro_percent ?? 1) : 0;
}

/* Right before the full payment: work out (and save) the host's service fee
   on each part, and PLUJ's whole application fee. */
export async function prepareCharge(rows: any[], plan: any): Promise<{ total: number; appFee: number; base: number; hostFees: number; service: number }> {
  const s = await settings();
  const nowIso = new Date().toISOString();
  const { data: host } = await db().from("profiles").select("created_at").eq("id", plan.host_id).single();
  const { data: vendor } = await db().from("vendor_profiles").select("created_at").eq("id", plan.vendor_id).single();
  const hostPct = hostFeePercent(s, host?.created_at || null, nowIso);
  const vendorPct = vendorFeePercent(s, vendor?.created_at || null, nowIso);
  let total = 0, appFee = 0, base = 0, hostFees = 0, service = 0;
  for (const r of rows) {
    const svc = Math.round(r.amount_cents * hostPct / 100);
    if (svc !== (r.host_service_fee_cents || 0)) {
      await db().from("booking_payments").update({ host_service_fee_cents: svc }).eq("id", r.id);
      r.host_service_fee_cents = svc;
    }
    total += chargedCents(r); base += r.amount_cents; hostFees += r.host_fee_cents || 0; service += svc;
    appFee += svc + Math.round(r.amount_cents * vendorPct / 100);
  }
  return { total, appFee, base, hostFees, service };
}

/* Bring a vendor's Stripe flags up to date (from Stripe, or from an
   account.updated event). */
export async function saveVendorAccountFlags(vendorId: string, acct: any) {
  const flags = {
    stripe_details_submitted: !!acct.details_submitted,
    stripe_charges_enabled:   !!acct.charges_enabled,
    stripe_transfers_enabled: !!acct.charges_enabled,
    stripe_payouts_enabled:   !!acct.payouts_enabled,
    stripe_payouts_locked:    acct.settings?.payouts?.schedule?.interval === "manual",
    stripe_updated_at: new Date().toISOString(),
  };
  await db().from("vendor_profiles").update(flags).eq("id", vendorId);
  return { details_submitted: flags.stripe_details_submitted, charges_enabled: flags.stripe_charges_enabled,
           payouts_enabled: flags.stripe_payouts_enabled, payouts_locked: flags.stripe_payouts_locked };
}

/* Switch off the vendor's automatic payouts, so paid money stays in their
   Stripe balance until PLUJ releases it. */
export async function lockVendorPayouts(vendorId: string, accountId: string) {
  const acct = await stripe("POST", `/accounts/${accountId}`, { settings: { payouts: { schedule: { interval: "manual" } } } });
  return saveVendorAccountFlags(vendorId, acct);
}
export async function refreshVendorAccount(vendorId: string, accountId: string) {
  const acct = await stripe("GET", `/accounts/${accountId}`);
  if (acct.settings?.payouts?.schedule?.interval !== "manual") {
    try { return await lockVendorPayouts(vendorId, accountId); }
    catch (e) { console.warn("[payments] could not lock payouts", (e as Error).message); }
  }
  return saveVendorAccountFlags(vendorId, acct);
}

/* The vendor's Stripe account, and whether it can take a locked payment. */
export async function vendorAccount(vendorId: string): Promise<{ id: string | null; ready: boolean; name: string }> {
  const { data: vp } = await db().from("vendor_profiles")
    .select("stripe_account_id, stripe_charges_enabled, stripe_payouts_locked, business_name, biz_legal").eq("id", vendorId).single();
  let ready = !!vp?.stripe_charges_enabled && !!vp?.stripe_payouts_locked;
  if (vp?.stripe_account_id && !ready) {
    try { const f = await refreshVendorAccount(vendorId, vp.stripe_account_id); ready = f.charges_enabled && f.payouts_locked; }
    catch { /* keep false */ }
  }
  return { id: vp?.stripe_account_id || null, ready, name: vp?.business_name || vp?.biz_legal || "your vendor" };
}

/* Pay out to the vendor's bank every part that is due: its date has come
   (or the host / an admin released it), the booking isn't paused, and no
   problem is open. Payouts come from the vendor's own Stripe balance; if
   Stripe hasn't made the money available yet, it waits for the next run.
   Returns cents paid out. */
export async function releaseDue(bookingId: string, opts: { force?: boolean } = {}) {
  const { data: plan } = await db().from("booking_payment_plans").select("*").eq("booking_id", bookingId).single();
  if (!plan) return 0;
  if (!opts.force && plan.status !== "active") return 0;
  if (plan.refund_state === "pending" || plan.refund_state === "failed") return 0;
  if (!opts.force) {
    const { data: open } = await db().from("booking_problems").select("id").eq("booking_id", bookingId).eq("status", "open");
    if ((open || []).length) return 0;
  }
  const nowIso = new Date().toISOString();
  let q = db().from("booking_payments").select("*").eq("booking_id", bookingId).eq("status", "paid").is("transferred_at", null);
  if (!opts.force) q = q.lte("due_at", nowIso);
  const { data: due } = await q.order("due_at");
  if (!due || !due.length) return 0;

  const account = due[0].stripe_account_id;
  const bal = await stripe("GET", "/balance", {}, undefined, account);
  let available = (bal.available || []).filter((b: any) => b.currency === (plan.currency || "usd"))
                                        .reduce((n: number, b: any) => n + (b.amount || 0), 0);
  let sent = 0;
  for (const p of due) {
    const net = netCents(p);
    if (net > available) {
      await db().from("booking_payment_plans").update({ last_error: "Waiting for Stripe to make the money available for payout",
        updated_at: nowIso }).eq("booking_id", bookingId);
      break;
    }
    let payoutId = "none";
    if (net > 0) {
      const po = await stripe("POST", "/payouts", {
        amount: net, currency: plan.currency || "usd",
        description: `PLUJ ${bookingId} ${p.kind}`,
        metadata: { booking_id: bookingId, payment_id: p.id, kind: p.kind },
      }, `pluj-payout-${p.id}`, account);
      payoutId = po.id;
      available -= net; sent += net;
    }
    await db().from("booking_payments").update({ transferred_cents: net, stripe_transfer_id: payoutId,
      transferred_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", p.id);
  }

  const { data: rest } = await db().from("booking_payments").select("status, transferred_at").eq("booking_id", bookingId);
  const allOut = (rest || []).every((r: any) => r.status === "cancelled" || (r.status === "paid" && r.transferred_at));
  await db().from("booking_payment_plans").update({
    status: allOut && plan.status !== "cancelled" ? "released" : plan.status,
    released_at: allOut ? new Date().toISOString() : plan.released_at,
    last_error: sent > 0 || allOut ? null : plan.last_error, updated_at: new Date().toISOString(),
  }).eq("booking_id", bookingId);

  if (sent > 0) {
    await notify(plan.vendor_id, "payout_sent", "💸 Money released to your bank",
      `PLUJ released ${money(sent)} for booking ${bookingId} from your Stripe balance to your bank. Banks usually show it in 1–2 business days.`,
      bookingId);
  }
  return sent;
}

/* Refund what the cancellation rules say. The refund comes out of the
   vendor's Stripe balance, where the locked money is; PLUJ's service fees
   are not returned. Called by the scheduler for plans with
   refund_state = 'pending'. */
export async function runPendingRefund(plan: any) {
  const { data: pays } = await db().from("booking_payments").select("*")
    .eq("booking_id", plan.booking_id).eq("status", "paid").order("due_at", { ascending: false });
  let total = 0;
  try {
    for (const p of pays || []) {
      const charged = chargedCents(p);
      let want = plan.refund_less_fees
        ? charged - (p.stripe_fee_cents || 0) - (p.platform_fee_cents || 0)
        : Math.round(charged * Number(plan.refund_percent || 0) / 100);
      want = Math.min(want, charged - (p.refunded_cents || 0));
      if (want <= 0 || !p.stripe_payment_intent_id || !p.stripe_account_id) continue;
      await stripe("POST", "/refunds", { payment_intent: p.stripe_payment_intent_id, amount: want,
        metadata: { booking_id: plan.booking_id, payment_id: p.id, reason: "cancellation" } },
        `pluj-refund-${p.id}-${want}`, p.stripe_account_id);
      await db().from("booking_payments").update({ refunded_cents: (p.refunded_cents || 0) + want,
        updated_at: new Date().toISOString() }).eq("id", p.id);
      total += want;
    }
    await db().from("booking_payment_plans").update({ refund_state: "done", last_error: null,
      updated_at: new Date().toISOString() }).eq("booking_id", plan.booking_id);
    await db().from("booking_requests").update({ payment_status: "refunded" }).eq("id", plan.booking_id);
    if (total > 0) {
      await notify(plan.host_id, "payment_refunded", "↩️ Refund on its way",
        `${money(total)} was refunded to your card for your cancelled booking. Banks usually show it within 5–10 business days.`,
        plan.booking_id);
      await notify(plan.vendor_id, "payment_refunded", "↩️ Refund sent to the host",
        `${money(total)} was refunded to the host from your Stripe balance for the cancelled booking, under PLUJ's cancellation policy.`,
        plan.booking_id);
    }
  } catch (e) {
    await db().from("booking_payment_plans").update({ refund_state: "failed", last_error: (e as Error).message,
      updated_at: new Date().toISOString() }).eq("booking_id", plan.booking_id);
    await tellAdmins("payment_problem", "⚠️ A refund failed",
      `The cancellation refund for booking ${plan.booking_id} failed: ${(e as Error).message}. The money is in the vendor's Stripe balance; `
      + "retry from Admin → Payments.", plan.booking_id, "A PLUJ refund failed");
  }
  return total;
}
