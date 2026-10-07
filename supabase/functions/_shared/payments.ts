/* PLUJ payments: code shared by the three edge functions
     payments            host Checkout, vendor Stripe onboarding, admin actions
     payments-scheduler  every 10 minutes: due charges, refunds, payouts
     stripe-webhook      Stripe's confirmations

   Stripe is called through its REST API with fetch, so there is no SDK to
   keep in step. Money is in cents throughout. The database side (tables,
   triggers, host/vendor functions) is sql/2026-10-07-payments.sql.

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

export async function stripe(method: "GET" | "POST" | "DELETE", path: string,
                             params: Record<string, unknown> = {}, idempotencyKey?: string): Promise<any> {
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
  retainer: "Retainer", event_day: "Event-day payment", final: "Final payment",
};

/* A PaymentIntent succeeded: record it, its charge and Stripe's fee. Safe to
   call more than once (the webhook and the scheduler can both see it). */
export async function markPaid(paymentId: string, paymentIntentId: string) {
  const pi = await stripe("GET", `/payment_intents/${paymentIntentId}`, { expand: ["latest_charge.balance_transaction"] });
  if (pi.status !== "succeeded") return pi;
  const charge = pi.latest_charge || {};
  const fee = charge.balance_transaction?.fee ?? null;

  const { data: pay } = await db().from("booking_payments").select("*").eq("id", paymentId).single();
  if (!pay) return pi;
  if (pay.status !== "paid") {
    await db().from("booking_payments").update({
      status: "paid", paid_at: new Date((charge.created || pi.created) * 1000).toISOString(),
      stripe_payment_intent_id: pi.id, stripe_charge_id: charge.id || null, stripe_fee_cents: fee,
      last_error: null, next_attempt_at: null, updated_at: new Date().toISOString(),
    }).eq("id", paymentId);

    const { data: plan } = await db().from("booking_payment_plans").select("*").eq("booking_id", pay.booking_id).single();
    const { data: booking } = await db().from("booking_requests")
      .select("id, service_name, event_date").eq("id", pay.booking_id).single();

    // Payment status on the booking, for lists that don't load the schedule.
    const { data: all } = await db().from("booking_payments").select("kind, status").eq("booking_id", pay.booking_id);
    const paidAll = (all || []).every((p: any) => p.status === "paid" || p.status === "cancelled");
    await db().from("booking_requests").update({
      payment_status: paidAll ? "paid_in_full" : "secured", paid_at: new Date().toISOString(),
    }).eq("id", pay.booking_id);

    if (plan) {
      const svc = booking?.service_name || "your booking";
      if (pay.kind === "retainer") {
        await notify(plan.vendor_id, "payment_received", "✅ Retainer paid — booking secured",
          `The host paid the ${pay.percent}% retainer (${money(pay.amount_cents)}) for ${svc} on ${booking?.event_date || "the event date"}. `
          + "PLUJ holds it until the host releases it, or 3 days after the event.", pay.booking_id);
      }
      await notify(plan.host_id, "payment_received", `✅ ${KIND_LABEL[pay.kind]} received`,
        `We received ${money(chargedCents(pay))} for ${svc}. PLUJ is holding it and will only send it to the vendor `
        + "when you release it, or automatically 3 days after the event if you don't report a problem.", pay.booking_id);
    }
  }

  // The host already released everything (or approved early release for
  // this payment): send it on now rather than at the next scheduler run.
  try { await releaseBooking(pay.booking_id); }
  catch (e) { console.warn("[payments] release after payment failed", (e as Error).message); }

  // Keep the card for the next payments.
  if (pi.customer && pi.payment_method) {
    try {
      await stripe("POST", `/customers/${pi.customer}`, { invoice_settings: { default_payment_method: pi.payment_method } });
    } catch (e) { console.warn("[payments] could not set default card", (e as Error).message); }
  }
  return pi;
}

/* PLUJ's fees. Nothing during an account's first N months on PLUJ; after
   that PLUJ keeps platform_fee_after_intro_percent (3%) of each payment from
   the vendor's payout, and adds host_service_fee_after_intro_percent (1%) to
   the host's payment. Each side counts from its own sign-up date. */
function afterIntro(since: string | null, at: string | null, months: number): boolean {
  if (!since || !at) return false;
  const cutoff = new Date(since);
  cutoff.setMonth(cutoff.getMonth() + months);
  return new Date(at) >= cutoff;
}
export function vendorFeePercent(s: Record<string, string>, vendorSince: string | null, paidAt: string | null): number {
  return afterIntro(vendorSince, paidAt, Number(s.platform_fee_intro_months ?? 3))
    ? Number(s.platform_fee_after_intro_percent ?? 3) : Number(s.platform_fee_percent ?? 0);
}
export function hostFeePercent(s: Record<string, string>, hostSince: string | null, at: string): number {
  return afterIntro(hostSince, at, Number(s.host_service_fee_intro_months ?? 3))
    ? Number(s.host_service_fee_after_intro_percent ?? 1) : 0;
}

/* Work out (and save) the host's service fee for one payment, right before
   it is charged. Returns the full amount to charge. */
export async function prepareCharge(pay: any, hostId: string): Promise<number> {
  const s = await settings();
  const { data: host } = await db().from("profiles").select("created_at").eq("id", hostId).single();
  const pct = hostFeePercent(s, host?.created_at || null, new Date().toISOString());
  const svc = Math.round(pay.amount_cents * pct / 100);
  if (svc !== (pay.host_service_fee_cents || 0)) {
    await db().from("booking_payments").update({ host_service_fee_cents: svc }).eq("id", pay.id);
    pay.host_service_fee_cents = svc;
  }
  return chargedCents(pay);
}

/* Everything the host is charged for one payment. */
export function chargedCents(p: any): number {
  return p.amount_cents + (p.host_fee_cents || 0) + (p.host_service_fee_cents || 0);
}

/* Bring a vendor's payout flags up to date from Stripe. */
export async function refreshVendorAccount(vendorId: string, accountId: string) {
  const acct = await stripe("GET", `/accounts/${accountId}`);
  const transfers = acct.capabilities?.transfers === "active";
  await db().from("vendor_profiles").update({
    stripe_details_submitted: !!acct.details_submitted,
    stripe_transfers_enabled: transfers,
    stripe_payouts_enabled: !!acct.payouts_enabled,
    stripe_updated_at: new Date().toISOString(),
  }).eq("id", vendorId);
  return { details_submitted: !!acct.details_submitted, transfers_enabled: transfers, payouts_enabled: !!acct.payouts_enabled };
}

/* Refund what the cancellation rules say, across the paid payments, newest
   first. Called by the scheduler for plans with refund_state = 'pending'. */
export async function runPendingRefund(plan: any) {
  const { data: pays } = await db().from("booking_payments").select("*")
    .eq("booking_id", plan.booking_id).eq("status", "paid").order("paid_at", { ascending: false });
  let total = 0;
  try {
    for (const p of pays || []) {
      const charged = chargedCents(p);
      let want = plan.refund_less_fees
        ? charged - (p.stripe_fee_cents || 0)
        : Math.round(charged * Number(plan.refund_percent || 0) / 100);
      want = Math.min(want, charged - (p.refunded_cents || 0));
      if (want <= 0 || !p.stripe_payment_intent_id) continue;
      let back = 0;
      if (p.transferred_cents > 0 && p.stripe_transfer_id && p.stripe_transfer_id !== "none") {
        // Already sent to the vendor (early release): take back the share first.
        back = Math.min(p.transferred_cents, want);
        await stripe("POST", `/transfers/${p.stripe_transfer_id}/reversals`, { amount: back,
          metadata: { booking_id: plan.booking_id, reason: "cancellation" } }, `pluj-reverse-${p.id}-${back}`);
        await db().from("booking_payments").update({ transferred_cents: p.transferred_cents - back }).eq("id", p.id);
      }
      await stripe("POST", "/refunds", { payment_intent: p.stripe_payment_intent_id, amount: want,
        metadata: { booking_id: plan.booking_id, payment_id: p.id, reason: "cancellation" } },
        `pluj-refund-${p.id}-${want}`);
      await db().from("booking_payments").update({ refunded_cents: (p.refunded_cents || 0) + want,
        updated_at: new Date().toISOString() }).eq("id", p.id);
      await recoverRefundCost(p, plan.vendor_id, want, back);
      total += want;
    }
    await db().from("booking_payment_plans").update({ refund_state: "done", last_error: null,
      updated_at: new Date().toISOString() }).eq("booking_id", plan.booking_id);
    await db().from("booking_requests").update({ payment_status: "refunded" }).eq("id", plan.booking_id);
    if (total > 0) {
      await notify(plan.host_id, "payment_refunded", "↩️ Refund on its way",
        `We refunded ${money(total)} to your card for your cancelled booking. Banks usually show it within 5–10 business days.`,
        plan.booking_id);
    }
  } catch (e) {
    await db().from("booking_payment_plans").update({ refund_state: "failed", last_error: (e as Error).message,
      updated_at: new Date().toISOString() }).eq("booking_id", plan.booking_id);
    await tellAdmins("payment_problem", "⚠️ A refund failed",
      `The cancellation refund for booking ${plan.booking_id} failed: ${(e as Error).message}. Retry it from Admin → Payments.`,
      plan.booking_id, "A PLUJ refund failed");
  }
  return total;
}

/* Add to (or, with a negative amount, take off) what a vendor owes PLUJ.
   Recovered from their next payouts by releaseBooking. */
export async function addVendorDebt(vendorId: string, cents: number) {
  if (!cents) return;
  const { data: v } = await db().from("vendor_profiles").select("pluj_balance_due_cents").eq("id", vendorId).single();
  const next = Math.max(0, (v?.pluj_balance_due_cents || 0) + Math.round(cents));
  await db().from("vendor_profiles").update({ pluj_balance_due_cents: next }).eq("id", vendorId);
}

/* A refund on a payment the vendor was already paid for. Stripe doesn't
   give back its card fee or payout costs, so whatever the refund takes beyond
   what came back from the vendor and PLUJ's own service fee on that part is
   put on the vendor's balance due. */
export async function recoverRefundCost(p: any, vendorId: string, refunded: number, reversed: number) {
  if (!p.transferred_at || refunded <= 0) return 0;
  const charged = chargedCents(p) || 1;
  const serviceShare = Math.round((p.platform_fee_cents || 0) * Math.min(1, refunded / charged));
  const loss = refunded - reversed - serviceShare;
  if (loss > 0) await addVendorDebt(vendorId, loss);
  return Math.max(0, loss);
}

/* Send a booking's released money to the vendor: one transfer per paid
   payment, tied to that payment's charge (source_transaction), so Stripe
   moves it as soon as the charge's funds are available. Returns cents sent.

   PLUJ never pays Stripe out of pocket. From each payment it keeps: Stripe's
   card fee, PLUJ's service fees, and the cost of paying the vendor (payout
   fee, Stripe's monthly fee for an active vendor, the yearly tax-form fee).
   Anything that payment can't cover (a full refund still costs the card fee,
   a chargeback costs $15) is added to the vendor's balance due and taken from
   their next payout. */
export async function releaseBooking(bookingId: string, opts: { force?: boolean } = {}) {
  const s = await settings();
  const { data: plan } = await db().from("booking_payment_plans").select("*").eq("booking_id", bookingId).single();
  if (!plan) return 0;
  if (plan.status === "on_hold" && !opts.force) return 0;
  if (plan.refund_state === "pending" || plan.refund_state === "failed") return 0;
  const { data: openProblems } = await db().from("booking_problems").select("id").eq("booking_id", bookingId).eq("status", "open");
  if ((openProblems || []).length && !opts.force) return 0;

  const now = new Date();
  const autoDue = new Date(plan.release_at) <= now;
  const { data: pays } = await db().from("booking_payments").select("*")
    .eq("booking_id", bookingId).eq("status", "paid").is("transferred_at", null);
  const due = (pays || []).filter((p: any) => opts.force || autoDue || plan.host_approved_at || p.release_approved_at);
  if (!due.length) return 0;

  const { data: vendor } = await db().from("vendor_profiles")
    .select("id, created_at, stripe_account_id, stripe_transfers_enabled, business_name, pluj_balance_due_cents, stripe_fee_month, stripe_fee_year")
    .eq("id", plan.vendor_id).single();
  if (!vendor) return 0;

  const costPct   = Number(s.payout_cost_percent ?? 0.5);
  const costFixed = Number(s.payout_cost_fixed_cents ?? 25);
  const monthKey  = now.toISOString().slice(0, 7);
  const year      = now.getUTCFullYear();
  let monthlyDue  = vendor.stripe_fee_month !== monthKey ? Number(s.payout_account_fee_cents ?? 200) : 0;
  let yearlyDue   = vendor.stripe_fee_year !== year ? Number(s.tax_form_fee_cents ?? 750) : 0;
  let debt        = vendor.pluj_balance_due_cents || 0;
  let monthlyTaken = false, yearlyTaken = false, tookFees = false;

  // Work everything out first; touch Stripe only if something is actually owed.
  const rows = due.map((p: any) => {
    const charged = chargedCents(p);
    const kept = Math.max(0, charged - (p.refunded_cents || 0) - (p.disputed_cents || 0));
    const cardFee = p.stripe_fee_cents || 0;
    if (kept <= cardFee) {
      // Nothing left for the vendor; whatever the card fee isn't covered by is owed.
      return { p, net: 0, serviceFees: 0, costs: 0, shortfall: cardFee - kept };
    }
    const keptShare = kept / charged;
    const vendorFee = Math.round(p.amount_cents * keptShare * vendorFeePercent(s, vendor.created_at, p.paid_at) / 100);
    const hostService = Math.round((p.host_service_fee_cents || 0) * keptShare);
    const base = kept - cardFee - vendorFee - hostService;
    const costs = Math.round(Math.max(0, base) * costPct / 100) + costFixed;
    let net = base - costs;
    let extra = 0;
    if (net > 0 && (monthlyDue || yearlyDue)) tookFees = true;
    if (net > 0 && monthlyDue) { const t = Math.min(net, monthlyDue); net -= t; extra += t; monthlyDue -= t; monthlyTaken = monthlyDue === 0; }
    if (net > 0 && yearlyDue)  { const t = Math.min(net, yearlyDue);  net -= t; extra += t; yearlyDue  -= t; yearlyTaken  = yearlyDue === 0; }
    if (net > 0 && debt)       { const t = Math.min(net, debt);       net -= t; debt -= t; }
    let shortfall = 0;
    if (net < 0) { shortfall = -net; net = 0; }
    return { p, net, serviceFees: vendorFee + hostService, costs: costs + extra, shortfall };
  });
  const toSend = rows.reduce((n: number, r: any) => n + r.net, 0);
  /* Stripe bills the monthly/yearly fees once there is a payout. If this
     payout couldn't cover them in full, the rest goes on the balance due so
     they are never charged twice or left unpaid. */
  if (toSend > 0 || tookFees) {
    if (vendor.stripe_fee_month !== monthKey) { debt += monthlyDue; monthlyDue = 0; monthlyTaken = true; }
    if (vendor.stripe_fee_year !== year)      { debt += yearlyDue;  yearlyDue = 0;  yearlyTaken = true; }
  }

  if (toSend > 0) {
    if (!vendor.stripe_account_id) {
      if (plan.last_error !== "vendor_not_connected") {
        await db().from("booking_payment_plans").update({ last_error: "vendor_not_connected" }).eq("booking_id", bookingId);
        await notify(plan.vendor_id, "payout_setup", "💳 Set up payouts to get paid",
          "You have money waiting on PLUJ. Open your dashboard and press Set up payouts with Stripe so we can send it to you.", bookingId);
      }
      return 0;
    }
    let transfersOn = vendor.stripe_transfers_enabled;
    if (!transfersOn) transfersOn = (await refreshVendorAccount(vendor.id, vendor.stripe_account_id)).transfers_enabled;
    if (!transfersOn) {
      if (plan.last_error !== "vendor_not_verified") {
        await db().from("booking_payment_plans").update({ last_error: "vendor_not_verified" }).eq("booking_id", bookingId);
        await notify(plan.vendor_id, "payout_setup", "💳 Finish your Stripe setup to get paid",
          "Stripe still needs a few details before PLUJ can send you money. Open your dashboard and press Finish Stripe setup.", bookingId);
      }
      return 0;
    }
  }

  let sent = 0;
  for (const r of rows) {
    const p = r.p;
    let transferId = "none";
    if (r.net > 0) {
      const tr = await stripe("POST", "/transfers", {
        amount: r.net, currency: plan.currency || "usd", destination: vendor.stripe_account_id,
        source_transaction: p.stripe_charge_id || undefined, transfer_group: bookingId,
        description: `PLUJ booking ${bookingId} — ${KIND_LABEL[p.kind]}`,
        metadata: { booking_id: bookingId, payment_id: p.id, kind: p.kind },
      }, `pluj-transfer-${p.id}`);
      transferId = tr.id;
      sent += r.net;
    }
    debt += r.shortfall;
    await db().from("booking_payments").update({
      transferred_cents: r.net, stripe_transfer_id: transferId, platform_fee_cents: r.serviceFees,
      payout_costs_cents: r.costs, transferred_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", p.id);
  }
  await db().from("vendor_profiles").update({
    pluj_balance_due_cents: debt,
    ...(monthlyTaken ? { stripe_fee_month: monthKey } : {}),
    ...(yearlyTaken ? { stripe_fee_year: year } : {}),
  }).eq("id", vendor.id);

  // Everything settled? Then the plan is done.
  const { data: rest } = await db().from("booking_payments").select("status, transferred_at").eq("booking_id", bookingId);
  const open = (rest || []).some((p: any) => p.status === "scheduled" || p.status === "processing" || p.status === "failed"
                                         || (p.status === "paid" && !p.transferred_at));
  await db().from("booking_payment_plans").update({
    status: open ? plan.status : (plan.status === "cancelled" ? "cancelled" : "released"),
    released_at: open ? plan.released_at : new Date().toISOString(),
    last_error: null, updated_at: new Date().toISOString(),
  }).eq("booking_id", bookingId);

  if (sent > 0) {
    await notify(plan.vendor_id, "payout_sent", "💸 Payment sent to your Stripe account",
      `PLUJ sent you ${money(sent)} for booking ${bookingId}. Stripe pays it out to your bank on your payout schedule.`, bookingId);
  }
  return sent;
}

/* Charge a scheduled payment with the host's saved card. Used by the
   scheduler for the event-day and final payments. */
export async function chargeSaved(pay: any, plan: any): Promise<"paid" | "processing" | "failed" | "skipped"> {
  const { data: host } = await db().from("profiles").select("id, email, stripe_customer_id").eq("id", plan.host_id).single();
  const { data: booking } = await db().from("booking_requests").select("id, service_name, event_date, status").eq("id", plan.booking_id).single();
  if (!booking || !["confirmed", "accepted", "approved"].includes(booking.status)) return "skipped";

  const attempts = (pay.attempts || 0) + 1;
  const fail = async (msg: string) => {
    const retry = attempts < 4;
    await db().from("booking_payments").update({
      status: "failed", attempts, last_error: msg, updated_at: new Date().toISOString(),
      next_attempt_at: retry ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : null,
    }).eq("id", pay.id);
    await db().from("booking_requests").update({ payment_status: "payment_failed" }).eq("id", plan.booking_id);
    const amt = money(chargedCents(pay));
    const svc = booking.service_name || "your booking";
    await notify(plan.host_id, "payment_failed", `⚠️ ${KIND_LABEL[pay.kind]} didn't go through`,
      `We couldn't charge ${amt} for ${svc}: ${msg} Open My Requests and press Pay now to pay with another card.`, plan.booking_id);
    await email(host?.email, `Action needed: your ${KIND_LABEL[pay.kind].toLowerCase()} for ${svc} didn't go through`,
      emailHtml("Payment failed", "#FEF2F2", "#B91C1C", `We couldn't charge ${amt}`,
        `Your ${KIND_LABEL[pay.kind].toLowerCase()} for ${svc} on ${booking.event_date} didn't go through (${msg}). `
        + "Sign in, open My Requests and press Pay now to pay with another card.", "Pay now"),
      "payment_failed", pay.id);
    if (pay.kind === "event_day") {
      await notify(plan.vendor_id, "payment_failed", "⚠️ The host's event-day payment failed",
        `The ${pay.percent}% event-day payment for ${svc} didn't go through. We've asked the host to pay now. `
        + "Check My Requests before the event; message the host if it's still unpaid.", plan.booking_id);
    }
    if (!retry) {
      await tellAdmins("payment_problem", "⚠️ A payment failed 4 times",
        `${KIND_LABEL[pay.kind]} for booking ${plan.booking_id} has failed 4 times: ${msg}`, plan.booking_id,
        "A PLUJ payment keeps failing");
    }
    return "failed" as const;
  };

  if (!host?.stripe_customer_id) return await fail("there's no saved card on file.");
  const customer = await stripe("GET", `/customers/${host.stripe_customer_id}`);
  const pm = customer?.invoice_settings?.default_payment_method;
  if (!pm) return await fail("there's no saved card on file.");

  const total = await prepareCharge(pay, plan.host_id);
  await db().from("booking_payments").update({ status: "processing", attempts, updated_at: new Date().toISOString() }).eq("id", pay.id);
  try {
    const pi = await stripe("POST", "/payment_intents", {
      amount: total, currency: plan.currency || "usd",
      customer: host.stripe_customer_id, payment_method: typeof pm === "string" ? pm : pm.id,
      off_session: true, confirm: true, transfer_group: plan.booking_id,
      description: `PLUJ booking ${plan.booking_id} — ${KIND_LABEL[pay.kind]} (${pay.percent}%)`,
      metadata: { booking_id: plan.booking_id, payment_id: pay.id, kind: pay.kind },
    }, `pluj-charge-${pay.id}-${attempts}`);
    await db().from("booking_payments").update({ stripe_payment_intent_id: pi.id }).eq("id", pay.id);
    if (pi.status === "succeeded") { await markPaid(pay.id, pi.id); return "paid"; }
    if (pi.status === "processing") return "processing";
    return await fail("the card needs the cardholder to confirm the payment.");
  } catch (e) {
    const err = e as StripeError;
    const msg = err.code === "authentication_required"
      ? "your bank wants you to confirm this payment."
      : (err.message || "the card was declined.");
    return await fail(msg.endsWith(".") ? msg : msg + ".");
  }
}
