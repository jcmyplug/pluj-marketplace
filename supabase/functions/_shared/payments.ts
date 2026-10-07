/* PLUJ payments: code shared by the three edge functions
     payments            host Checkout, vendor Stripe onboarding, admin actions
     payments-scheduler  every 10 minutes: due charges and refunds
     stripe-webhook      Stripe's confirmations (a Connect webhook)

   HOW MONEY MOVES (since 7 Oct 2026, evening): every payment is a "direct
   charge" on the vendor's own Stripe account. The money goes straight to the
   vendor; Stripe takes its fees from the vendor's account; PLUJ's service
   fees come to PLUJ as Stripe "application fees". Vendor accounts are created
   with Stripe liable for their losses and the vendor paying Stripe's fees, so
   refunds, chargebacks and negative balances are between the host, the
   vendor and Stripe. Nothing is ever taken from PLUJ's own Stripe balance.

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
  retainer: "Retainer", event_day: "Event-day payment", final: "Final payment",
};

/* A PaymentIntent on a vendor's account succeeded: record it, Stripe's fee
   and PLUJ's fee. Safe to call more than once (the webhook and the scheduler
   can both see it). */
export async function markPaid(paymentId: string, paymentIntentId: string, account: string) {
  const pi = await stripe("GET", `/payment_intents/${paymentIntentId}`,
                          { expand: ["latest_charge.balance_transaction"] }, undefined, account);
  if (pi.status !== "succeeded") return pi;
  const charge = pi.latest_charge || {};
  const details: any[] = charge.balance_transaction?.fee_details || [];
  const stripeFee = details.length
    ? details.filter((d: any) => d.type === "stripe_fee").reduce((n: number, d: any) => n + (d.amount || 0), 0)
    : null;

  const { data: pay } = await db().from("booking_payments").select("*").eq("id", paymentId).single();
  if (!pay) return pi;
  if (pay.status !== "paid") {
    await db().from("booking_payments").update({
      status: "paid", paid_at: new Date((charge.created || pi.created) * 1000).toISOString(),
      stripe_payment_intent_id: pi.id, stripe_charge_id: charge.id || null, stripe_account_id: account,
      stripe_fee_cents: stripeFee, platform_fee_cents: pi.application_fee_amount || 0,
      transferred_cents: pi.amount_received || chargedCents(pay), transferred_at: new Date().toISOString(),
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
    if (paidAll && plan && plan.status === "active") {
      await db().from("booking_payment_plans").update({ status: "released", released_at: new Date().toISOString(),
        updated_at: new Date().toISOString() }).eq("booking_id", pay.booking_id);
    }

    if (plan) {
      const svc = booking?.service_name || "your booking";
      await notify(plan.vendor_id, "payment_received", `💸 ${KIND_LABEL[pay.kind]} paid to your Stripe account`,
        `The host paid the ${pay.percent}% ${KIND_LABEL[pay.kind].toLowerCase()} (${money(pay.amount_cents)}) for ${svc} on `
        + `${booking?.event_date || "the event date"}. It went straight to your Stripe account; Stripe pays it into your bank.`, pay.booking_id);
      await notify(plan.host_id, "payment_received", `✅ ${KIND_LABEL[pay.kind]} paid`,
        `You paid ${money(chargedCents(pay))} for ${svc}, straight to the vendor. `
        + (pay.kind === "final" ? "That was the last payment." : "Report a problem on the booking if something goes wrong; later payments are paused while it's looked at."),
        pay.booking_id);
    }
  }

  // Keep the card for the next payments on this booking.
  if (pi.customer && pi.payment_method) {
    try {
      await stripe("POST", `/customers/${pi.customer}`, { invoice_settings: { default_payment_method: pi.payment_method } },
                   undefined, account);
    } catch (e) { console.warn("[payments] could not set default card", (e as Error).message); }
  }
  return pi;
}

/* PLUJ's service fees. Nothing during an account's first N months on PLUJ;
   after that PLUJ keeps platform_fee_after_intro_percent (3%) of each payment
   from the vendor, and adds host_service_fee_after_intro_percent (1%) to the
   host's payment. Each side counts from its own sign-up date. Both are
   collected as Stripe application fees, so they never come back out of PLUJ:
   Stripe doesn't return application fees on refunds unless asked to. */
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

/* Right before a payment is charged: work out (and save) the host's service
   fee, and PLUJ's whole application fee. */
export async function prepareCharge(pay: any, plan: any): Promise<{ total: number; appFee: number }> {
  const s = await settings();
  const nowIso = new Date().toISOString();
  const { data: host } = await db().from("profiles").select("created_at").eq("id", plan.host_id).single();
  const { data: vendor } = await db().from("vendor_profiles").select("created_at").eq("id", plan.vendor_id).single();
  const svc = Math.round(pay.amount_cents * hostFeePercent(s, host?.created_at || null, nowIso) / 100);
  if (svc !== (pay.host_service_fee_cents || 0)) {
    await db().from("booking_payments").update({ host_service_fee_cents: svc }).eq("id", pay.id);
    pay.host_service_fee_cents = svc;
  }
  const vendorFee = Math.round(pay.amount_cents * vendorFeePercent(s, vendor?.created_at || null, nowIso) / 100);
  return { total: chargedCents(pay), appFee: vendorFee + svc };
}

/* Everything the host is charged for one payment. */
export function chargedCents(p: any): number {
  return p.amount_cents + (p.host_fee_cents || 0) + (p.host_service_fee_cents || 0);
}

/* Bring a vendor's Stripe flags up to date (from Stripe, or from an
   account.updated event). */
export async function saveVendorAccountFlags(vendorId: string, acct: any) {
  const flags = {
    stripe_details_submitted: !!acct.details_submitted,
    stripe_charges_enabled:   !!acct.charges_enabled,
    stripe_transfers_enabled: !!acct.charges_enabled,
    stripe_payouts_enabled:   !!acct.payouts_enabled,
    stripe_updated_at: new Date().toISOString(),
  };
  await db().from("vendor_profiles").update(flags).eq("id", vendorId);
  return { details_submitted: flags.stripe_details_submitted, charges_enabled: flags.stripe_charges_enabled,
           payouts_enabled: flags.stripe_payouts_enabled };
}
export async function refreshVendorAccount(vendorId: string, accountId: string) {
  return saveVendorAccountFlags(vendorId, await stripe("GET", `/accounts/${accountId}`));
}

/* The vendor's Stripe account for a booking, if it can take payments. */
export async function vendorAccount(vendorId: string): Promise<{ id: string | null; ready: boolean; name: string }> {
  const { data: vp } = await db().from("vendor_profiles")
    .select("stripe_account_id, stripe_charges_enabled, business_name, biz_legal").eq("id", vendorId).single();
  let ready = !!vp?.stripe_charges_enabled;
  if (vp?.stripe_account_id && !ready) {
    try { ready = (await refreshVendorAccount(vendorId, vp.stripe_account_id)).charges_enabled; } catch { /* keep false */ }
  }
  return { id: vp?.stripe_account_id || null, ready, name: vp?.business_name || vp?.biz_legal || "your vendor" };
}

/* The host's Stripe customer on the vendor's account (cards saved there are
   used for this booking's later payments). */
export async function hostCustomerOn(plan: any, account: string, host: { email?: string | null; name?: string | null }) {
  if (plan.stripe_customer_id && plan.stripe_account_id === account) return plan.stripe_customer_id as string;
  const c = await stripe("POST", "/customers", {
    email: host.email || undefined, name: host.name || undefined,
    metadata: { pluj_user_id: plan.host_id, booking_id: plan.booking_id },
  }, `pluj-customer-${plan.booking_id}-${account}`, account);
  await db().from("booking_payment_plans").update({ stripe_customer_id: c.id, stripe_account_id: account })
    .eq("booking_id", plan.booking_id);
  plan.stripe_customer_id = c.id; plan.stripe_account_id = account;
  return c.id as string;
}

/* Refund what the cancellation rules say, across the paid payments, newest
   first. The refund comes out of the vendor's Stripe account (that's where
   the money went); PLUJ's service fees are not returned. Called by the
   scheduler for plans with refund_state = 'pending'. */
export async function runPendingRefund(plan: any) {
  const { data: pays } = await db().from("booking_payments").select("*")
    .eq("booking_id", plan.booking_id).eq("status", "paid").order("paid_at", { ascending: false });
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
        `The vendor's Stripe account refunded ${money(total)} to your card for your cancelled booking. Banks usually show it within 5–10 business days.`,
        plan.booking_id);
      await notify(plan.vendor_id, "payment_refunded", "↩️ Refund sent to the host",
        `${money(total)} was refunded to the host from your Stripe account for the cancelled booking, under PLUJ's cancellation policy.`,
        plan.booking_id);
    }
  } catch (e) {
    await db().from("booking_payment_plans").update({ refund_state: "failed", last_error: (e as Error).message,
      updated_at: new Date().toISOString() }).eq("booking_id", plan.booking_id);
    await tellAdmins("payment_problem", "⚠️ A refund failed",
      `The cancellation refund for booking ${plan.booking_id} failed: ${(e as Error).message}. The money is in the vendor's Stripe account; `
      + "retry from Admin → Payments, or ask the vendor to refund the host from their Stripe dashboard.",
      plan.booking_id, "A PLUJ refund failed");
  }
  return total;
}

/* Charge a scheduled payment with the card the host saved on the vendor's
   account. Used by the scheduler for the event-day and final payments. */
export async function chargeSaved(pay: any, plan: any): Promise<"paid" | "processing" | "failed" | "skipped"> {
  const { data: host } = await db().from("profiles").select("id, email").eq("id", plan.host_id).single();
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
    await notify(plan.vendor_id, "payment_failed", `⚠️ The host's ${KIND_LABEL[pay.kind].toLowerCase()} failed`,
      `The ${pay.percent}% ${KIND_LABEL[pay.kind].toLowerCase()} for ${svc} didn't go through. We've asked the host to pay now; `
      + "message them if it's still unpaid.", plan.booking_id);
    if (!retry) {
      await tellAdmins("payment_problem", "⚠️ A payment failed 4 times",
        `${KIND_LABEL[pay.kind]} for booking ${plan.booking_id} has failed 4 times: ${msg}`, plan.booking_id);
    }
    return "failed" as const;
  };

  const acct = await vendorAccount(plan.vendor_id);
  if (!acct.id || !acct.ready) return await fail("the vendor's Stripe account can't take payments right now.");
  if (!plan.stripe_customer_id || plan.stripe_account_id !== acct.id) return await fail("there's no saved card on file.");
  const customer = await stripe("GET", `/customers/${plan.stripe_customer_id}`, {}, undefined, acct.id);
  const pm = customer?.invoice_settings?.default_payment_method;
  if (!pm) return await fail("there's no saved card on file.");

  const { total, appFee } = await prepareCharge(pay, plan);
  await db().from("booking_payments").update({ status: "processing", attempts, stripe_account_id: acct.id,
    updated_at: new Date().toISOString() }).eq("id", pay.id);
  try {
    const pi = await stripe("POST", "/payment_intents", {
      amount: total, currency: plan.currency || "usd",
      customer: plan.stripe_customer_id, payment_method: typeof pm === "string" ? pm : pm.id,
      off_session: true, confirm: true,
      application_fee_amount: appFee > 0 && appFee < total ? appFee : undefined,
      description: `PLUJ booking ${plan.booking_id} — ${KIND_LABEL[pay.kind]} (${pay.percent}%)`,
      metadata: { booking_id: plan.booking_id, payment_id: pay.id, kind: pay.kind },
    }, `pluj-charge-${pay.id}-${attempts}`, acct.id);
    await db().from("booking_payments").update({ stripe_payment_intent_id: pi.id }).eq("id", pay.id);
    if (pi.status === "succeeded") { await markPaid(pay.id, pi.id, acct.id); return "paid"; }
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
