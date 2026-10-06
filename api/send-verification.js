import { rateLimit } from "./_rate-limit.js";

/* ─────────────────────────────────────────────────────────────────────────────
   PLUJ — email verification code
   Repo location:  api/send-verification.js

   SECURITY REWRITE (Aug 2026)
   The previous version accepted { email, code } from anyone on the internet and
   interpolated both into the email HTML with no escaping and no authentication.
   That made it an open relay: a stranger could send arbitrary HTML — phishing
   links, fake "your payout is on hold" notices — from noreply@pluj.us,
   passing your SPF and DKIM, to any address they chose.

   Three changes close it:
     1. The caller must present a valid Supabase JWT.
     2. The recipient is taken from that JWT, never from the request body, so a
        caller can only ever mail their own verified address.
     3. Every interpolated value is HTML-escaped and the code is format-checked.

   Env vars — all already present in this project, nothing to add:
     RESEND_API_KEY                Resend key (sending access is enough)
     REACT_APP_SUPABASE_URL        also accepts SUPABASE_URL
     REACT_APP_SUPABASE_ANON_KEY   also accepts SUPABASE_ANON_KEY. This is the
                                   publishable key and is already in the client
                                   bundle; it is used here only to ask GoTrue
                                   "who does this token belong to?"
     RESEND_FROM                   optional, default noreply@pluj.us

   Note there is deliberately no service-role key in this file. It never needs
   to read anything the caller could not read themselves.

   NOTE — this endpoint should eventually be deleted. Supabase has built-in
   email OTP (signInWithOtp / verifyOtp) which stores a hashed code server-side
   with real expiry and attempt limits. The current design still lets the
   account holder read their own code out of the verify_codes table, so it
   proves possession of a session, not of an inbox. See LAUNCH-READINESS-AUDIT.md.
   ───────────────────────────────────────────────────────────────────────────── */

/** Escape the five characters that can break out of HTML text or an attribute. */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Best-effort throttle. Serverless instances are ephemeral and not shared, so
   this is a speed bump, not a guarantee — it stops a single client hammering a
   warm instance. Because the recipient now comes from the JWT, the worst case
   is a user spamming their own inbox. For a hard limit use Vercel KV/Upstash. */
const lastSent = new Map();
const THROTTLE_MS = 60000;

async function getCallerFromJwt(req) {
  const auth = req.headers.authorization || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!jwt) return null;

  const url  = process.env.SUPABASE_URL      || process.env.REACT_APP_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("[send-verification] Supabase URL / anon key not configured");
    return null;
  }

  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user && user.id && user.email ? user : null;
  } catch (err) {
    console.error("[send-verification] token check failed:", err);
    return null;
  }
}

export default async function handler(req, res) {
  /* This one sends real email and therefore costs real money, and a flood of
     verification mail to addresses the sender does not own is how a domain
     gets its sending reputation destroyed. 5 per 15 minutes per IP. */
  if (!(await rateLimit(req, res, { route: "verify-email", max: 5, windowSeconds: 900 }))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const caller = await getCallerFromJwt(req);
  if (!caller) return res.status(401).json({ error: "Sign in required" });

  /* The body no longer decides who gets mail — the token does. */
  const to = caller.email;

  const rawCode = (req.body && req.body.code) || "";
  const code = String(rawCode).trim();
  if (!/^\d{4,8}$/.test(code)) {
    return res.status(400).json({ error: "Invalid code format" });
  }

  const previous = lastSent.get(caller.id);
  if (previous && Date.now() - previous < THROTTLE_MS) {
    const wait = Math.ceil((THROTTLE_MS - (Date.now() - previous)) / 1000);
    return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[send-verification] RESEND_API_KEY is not set");
    return res.status(500).json({ error: "Email service not configured" });
  }

  const FROM = process.env.RESEND_FROM || "PLUJ Marketplace <noreply@pluj.us>";

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F5F5F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:#0A0A0A;padding:22px 28px;">
          <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">pluj</span>
        </td></tr>
        <tr><td style="padding:32px 28px 8px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#0A0A0A;">Confirm your email</h1>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#57534E;">
            Enter this code in PLUJ to finish creating your account.
          </p>
          <div style="background:#FFF7ED;border:1.5px solid #FDBA74;border-radius:12px;
                      padding:20px;text-align:center;margin-bottom:24px;">
            <div style="font-size:34px;font-weight:800;letter-spacing:0.30em;color:#EA580C;
                        font-family:'SF Mono',Menlo,Consolas,monospace;">${esc(code)}</div>
          </div>
          <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#57534E;">
            This code expires in 10 minutes.
          </p>
          <p style="margin:0 0 28px;font-size:13px;line-height:1.6;color:#A8A29E;">
            Didn't try to sign up? You can safely ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #E7E5E4;">
          <p style="margin:0;font-size:11px;color:#A8A29E;">PLUJ Marketplace · Houston, TX</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `${code} is your PLUJ verification code`,
        html,
      }),
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      /* Log the provider's reason for us; do not return it. Resend's error body
         can name the sending domain and quota state — free recon for an attacker. */
      console.error("[send-verification] Resend rejected:", r.status, data);
      return res.status(502).json({ error: "Could not send email" });
    }

    lastSent.set(caller.id, Date.now());
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[send-verification] exception:", err);
    return res.status(500).json({ error: "Failed to send verification email" });
  }
}
