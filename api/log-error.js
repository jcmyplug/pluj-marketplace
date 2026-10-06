import { rateLimit } from "./_rate-limit.js";

/* PLUJ - error reporting and alerting.  Repo location: api/log-error.js

   Checklist items 32 and 33. Until now the only way you learned the site was
   broken was a customer telling you, and your transactional mail has no
   reply-to, so often they could not.

   Deliberately no third-party service. Errors are grouped in Postgres and a
   throttled email goes to your contact address through Resend, which you
   already have. No new account, no card, no vendor holding your data.

   THE OPEN-RELAY LESSON APPLIES HERE
   This endpoint is unauthenticated, because errors happen to signed-out
   visitors and to people whose session has just broken - the exact moments you
   most need to hear about. That makes it the same shape as the email handlers
   that were once an open relay, so the same rules hold:

     - The recipient is fixed server-side. It is never read from the request.
       A caller cannot make this mail anybody.
     - Every value that reaches the HTML is escaped.
     - The subject line is built from our own text, not the caller's.
     - Provider errors are logged, never returned.

   The worst a stranger can do is add rows to a table that dedupes, caps its own
   size, and sends at most 20 emails a day in total.

   NOISE CONTROL
   You said plainly you do not want thousands of emails for nothing. So:
     - errors GROUP by fingerprint; a page failing 10,000 times is one row
     - one email per fingerprint per hour, decided atomically in Postgres so
       two serverless instances cannot both send
     - a hard cap of 20 alert emails per day across all faults
     - the fingerprint is computed HERE, not by the browser, so a caller cannot
       defeat grouping by randomising it

   Env vars - all already set, nothing to add:
     RESEND_API_KEY, REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY
   Optional:
     ALERT_EMAIL   where alerts go. Defaults to info@pluj.us.
     RESEND_FROM   defaults to noreply@pluj.us.

   Written without regular expressions or escape sequences on purpose, so the
   file survives being moved by tools that treat backslashes as escapes. */

import crypto from "node:crypto";

const NL = String.fromCharCode(10);

/* Escape the five characters that can break out of HTML text or an attribute. */
function esc(s) {
  let out = "";
  for (const ch of String(s === null || s === undefined ? "" : s)) {
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else if (ch === "'") out += "&#39;";
    else out += ch;
  }
  return out;
}

/* Group by the message plus the top stack frame. Computed here rather than
   trusted from the browser: a caller who could choose the fingerprint could
   defeat the grouping and turn this into a mail cannon. */
function fingerprint(message, stack, kind) {
  const firstFrame = String(stack || "").split(NL).map((l) => l.trim())
    .filter(Boolean)[0] || "";
  const basis = String(kind || "client") + "|" + String(message || "").slice(0, 300) +
                "|" + firstFrame.slice(0, 200);
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

/* Speed bump against one client hammering a warm instance. Serverless instances
   are ephemeral so this is not a guarantee; the real limits are in Postgres. */
const hits = new Map();
const WINDOW_MS = 60000;
const MAX_PER_WINDOW = 30;
function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) { hits.set(ip, { start: now, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  /* Unauthenticated by design: errors happen to signed-out visitors and to
     people whose session has just broken. 60 reports per 5 minutes per IP is
     far above what a real browser produces and far below a flood. */
  if (!(await rateLimit(req, res, { route: "log-error", max: 60, windowSeconds: 300 }))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fwd = String(req.headers["x-forwarded-for"] || "");
  const ip = fwd.split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "unknown";
  if (rateLimited(ip)) return res.status(429).json({ ok: false });

  const body = req.body || {};
  const message = String(body.message || "").slice(0, 500).trim();
  const stack   = String(body.stack   || "").slice(0, 4000);
  const url     = String(body.url     || "").slice(0, 500);
  const kind    = body.kind === "server" ? "server" : "client";
  const agent   = String(req.headers["user-agent"] || "").slice(0, 300);

  if (!message) return res.status(200).json({ ok: true, skipped: "empty" });

  const supaUrl  = process.env.SUPABASE_URL      || process.env.REACT_APP_SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!supaUrl || !supaAnon) {
    console.error("[log-error] Supabase env not configured");
    return res.status(200).json({ ok: false });
  }

  const fp = fingerprint(message, stack, kind);
  let decision = null;

  try {
    const r = await fetch(supaUrl + "/rest/v1/rpc/record_error", {
      method: "POST",
      headers: {
        apikey: supaAnon,
        Authorization: "Bearer " + supaAnon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_fingerprint: fp, p_message: message, p_stack: stack,
        p_url: url, p_agent: agent, p_kind: kind,
      }),
    });
    if (!r.ok) {
      console.error("[log-error] record_error failed", r.status);
      return res.status(200).json({ ok: false });
    }
    decision = await r.json();
  } catch (err) {
    console.error("[log-error] record_error threw:", err && err.message);
    return res.status(200).json({ ok: false });
  }

  /* Recording succeeded. Whether an email is due was decided in Postgres, in
     the same statement that wrote the row, so this is race-free. */
  if (!decision || decision.alert !== true) {
    return res.status(200).json({ ok: true, alerted: false });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[log-error] RESEND_API_KEY not set; error recorded but not alerted");
    return res.status(200).json({ ok: true, alerted: false });
  }

  /* Fixed recipient. Never from the request body. */
  const to   = process.env.ALERT_EMAIL || "info@pluj.us";
  const from = process.env.RESEND_FROM || "PLUJ Marketplace <noreply@pluj.us>";
  const occurrences = Number(decision.occurrences || 1);
  const isNew = decision.is_new === true;

  const subject = (isNew ? "New error on PLUJ: " : "Error still happening on PLUJ: ") +
                  message.slice(0, 80);

  const html = "<!DOCTYPE html><html><body style=" +
    '"margin:0;padding:24px;background:#F5F5F4;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">' +
    '<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;">' +
    '<div style="background:#0A0A0A;padding:16px 22px;">' +
    '<span style="color:#fff;font-size:16px;font-weight:800;">pluj</span>' +
    '<span style="color:#A8A29E;font-size:12px;float:right;">error alert</span></div>' +
    '<div style="padding:22px;">' +
    '<p style="margin:0 0 4px;font-size:11px;color:#A8A29E;text-transform:uppercase;letter-spacing:.05em;">' +
    (isNew ? "First time seen" : "Recurring") + "</p>" +
    '<p style="margin:0 0 14px;font-size:16px;font-weight:700;color:#0A0A0A;">' + esc(message) + "</p>" +
    '<table style="width:100%;font-size:13px;color:#57534E;border-collapse:collapse;">' +
    '<tr><td style="padding:4px 0;width:110px;">Where</td><td>' + (esc(url) || "unknown") + "</td></tr>" +
    '<tr><td style="padding:4px 0;">Occurrences</td><td>' + esc(String(occurrences)) + "</td></tr>" +
    '<tr><td style="padding:4px 0;">Source</td><td>' + esc(kind) + "</td></tr>" +
    '<tr><td style="padding:4px 0;">Fingerprint</td><td>' + esc(fp) + "</td></tr>" +
    "</table>" +
    (stack
      ? '<pre style="margin:16px 0 0;padding:12px;background:#F5F5F4;border-radius:8px;font-size:11px;color:#57534E;white-space:pre-wrap;word-break:break-word;">' +
        esc(stack.slice(0, 1200)) + "</pre>"
      : "") +
    '<p style="margin:18px 0 0;font-size:12px;color:#A8A29E;line-height:1.6;">' +
    "At most one email per fault per hour, 20 a day in total. " +
    "Full history: select * from error_events order by last_seen desc;" +
    "</p></div></div></body></html>";

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: from, to: [to], subject: subject, html: html }),
    });
    if (!r.ok) {
      const detail = await r.json().catch(() => null);
      /* Log the reason for us, never return it - Resend's error body can name
         the sending domain and quota state. */
      console.error("[log-error] Resend rejected:", r.status, detail);
      return res.status(200).json({ ok: true, alerted: false });
    }
    return res.status(200).json({ ok: true, alerted: true });
  } catch (err) {
    console.error("[log-error] alert send threw:", err && err.message);
    return res.status(200).json({ ok: true, alerted: false });
  }
}
