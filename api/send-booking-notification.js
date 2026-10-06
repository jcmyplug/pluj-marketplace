import { rateLimit } from "./_rate-limit.js";

/* ─────────────────────────────────────────────────────────────────────────────
   PLUJ — booking lifecycle email
   Repo location:  api/send-booking-notification.js

   SECURITY REWRITE (Aug 2026)
   The previous version took `to` and every display field straight from the
   request body, with no authentication and no HTML escaping. Anyone could POST
   arbitrary HTML and have it delivered from noreply@pluj.us, passing SPF
   and DKIM — a phishing channel aimed at your own users, plus an unbounded
   Resend bill and near-certain domain blocklisting.

   What changed:
     1. The caller must present a valid Supabase JWT.
     2. The booking is read back from the database using that caller's own JWT,
        so row-level security decides whether they may see it. Someone else's
        booking id returns zero rows and gets a 403. No service-role key is used
        anywhere in this file — RLS already encodes the rule we want, so there
        is no reason to hold a credential that can bypass it.
     3. The recipient address comes from the database, never from the body.
     4. Every interpolated value is HTML-escaped.
     5. `status` is checked against a fixed list, and the provider's error body
        is logged but never returned to the caller.

   Env vars — all already present in this project, nothing to add:
     RESEND_API_KEY
     REACT_APP_SUPABASE_URL        also accepts SUPABASE_URL
     REACT_APP_SUPABASE_ANON_KEY   also accepts SUPABASE_ANON_KEY
     RESEND_FROM                   optional, default noreply@pluj.us
   ───────────────────────────────────────────────────────────────────────────── */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const VALID_STATUS = new Set(["requested", "confirmed", "declined", "cancelled", "modified"]);

const SB_URL  = () => process.env.SUPABASE_URL      || process.env.REACT_APP_SUPABASE_URL;
const SB_ANON = () => process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

/** Read through PostgREST as the caller. RLS applies — that is the whole point. */
async function asCaller(jwt, path) {
  const r = await fetch(`${SB_URL()}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON(), Authorization: `Bearer ${jwt}` },
  });
  if (!r.ok) {
    console.error("[send-booking-notification] db read failed:", r.status, path);
    return null;
  }
  return r.json();
}

export default async function handler(req, res) {
  /* Also sends email. 20 per 15 minutes is set above the realistic worst case
     for a legitimate user — sending a whole cart of requests at once — rather
     than at the typical case, because a limit that fires on normal use gets
     removed by the next person who hits it. */
  if (!(await rateLimit(req, res, { route: "booking-mail", max: 20, windowSeconds: 900 }))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!SB_URL() || !SB_ANON()) {
    console.error("[send-booking-notification] Supabase env vars missing");
    return res.status(500).json({ error: "Server not configured" });
  }

  const auth = req.headers.authorization || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!jwt) return res.status(401).json({ error: "Sign in required" });

  const body = req.body || {};
  const requestId = String(body.requestId || "").trim();
  const status = String(body.status || "").trim();
  const role = body.role === "vendor" ? "vendor" : "customer";

  if (!requestId || !VALID_STATUS.has(status)) {
    return res.status(400).json({ error: "Missing or invalid requestId / status" });
  }

  /* ── Load the booking as the caller. RLS proves they belong to it. ────── */
  const rows = await asCaller(jwt,
    `booking_requests?id=eq.${encodeURIComponent(requestId)}` +
    `&select=id,user_id,vendor_id,event_type,event_date,start_time,end_time,` +
    `guests,venue,service_name,package_name,package_price,access_instructions,vendor_note`
  );
  if (!rows) return res.status(401).json({ error: "Could not verify your session" });

  const bk = rows[0];
  if (!bk) {
    /* Either the booking does not exist, or it is not theirs. Same answer to
       both, so this cannot be used to probe which booking ids are real. */
    return res.status(403).json({ error: "Booking not found" });
  }

  /* ── Recipient comes from the database, not the request body ─────────── */
  const recipientId = role === "vendor" ? bk.vendor_id : bk.user_id;
  const people = await asCaller(jwt,
    `profiles?id=in.(${bk.user_id},${bk.vendor_id})&select=id,email,display_name,full_name`
  );
  if (!people) return res.status(500).json({ error: "Could not resolve recipient" });

  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const to = byId[recipientId]?.email;
  if (!to) return res.status(422).json({ error: "Recipient has no email on file" });

  const nameOf = (id) => byId[id]?.display_name || byId[id]?.full_name || "";
  const customerName = nameOf(bk.user_id) || "the customer";
  const vendorName   = nameOf(bk.vendor_id) || "the vendor";
  const isVendor = role === "vendor";

  const THEME = {
    requested: { badge: "NEW REQUEST",    bg: "#EFF6FF", fg: "#1D4ED8" },
    confirmed: { badge: "CONFIRMED",      bg: "#ECFDF5", fg: "#065F46" },
    declined:  { badge: "DECLINED",       bg: "#FEF2F2", fg: "#B91C1C" },
    cancelled: { badge: "CANCELLED",      bg: "#FEF2F2", fg: "#B91C1C" },
    modified:  { badge: "CHANGE REQUEST", bg: "#FFFBEB", fg: "#B45309" },
  }[status];

  const ev = bk.event_type || "your event";

  const subject = {
    requested: isVendor ? `New booking request — ${ev} (${requestId})`
                        : `Request sent to ${vendorName} — ${requestId}`,
    confirmed: isVendor ? `You confirmed ${customerName}'s booking — ${requestId}`
                        : `Booking confirmed by ${vendorName} — ${requestId}`,
    declined:  isVendor ? `You declined booking ${requestId}`
                        : `${vendorName} can't take this booking — ${requestId}`,
    cancelled: `Booking cancelled — ${requestId}`,
    modified:  `Booking change requested — ${requestId}`,
  }[status];

  const headline = {
    requested: isVendor ? `${customerName} wants to book you`
                        : `Your request was sent to ${vendorName}`,
    confirmed: isVendor ? `You confirmed this booking`
                        : `${vendorName} confirmed your booking 🎉`,
    declined:  isVendor ? `You declined this booking`
                        : `${vendorName} can't take this booking`,
    cancelled: isVendor ? `A booking was cancelled` : `Your booking was cancelled`,
    modified:  isVendor ? `${customerName} requested changes`
                        : `Your change request was sent`,
  }[status];

  const message = {
    requested: isVendor ? "Review the details below and approve or decline it in your PLUJ dashboard. The customer is waiting to hear back."
                        : `We've sent your request to ${vendorName}. You'll get another email the moment they respond.`,
    confirmed: isVendor ? "This date is now reserved on your calendar. The full event details are below."
                        : "You're all set — the vendor has approved your event. Keep this confirmation number for your records.",
    declined:  isVendor ? "This is your record of the decision."
                        : "You can send a request to another vendor, or message this one about other dates.",
    cancelled: "This booking has been cancelled. Cancellations must be made at least 48 hours before the event.",
    modified:  isVendor ? "The customer changed the details below. Please review and approve or decline the change."
                        : "We've sent your requested changes to the vendor. They'll need to approve them before they take effect.",
  }[status];

  const price = Number(bk.package_price);
  const money = Number.isFinite(price) && bk.package_price != null
    ? `$${price.toLocaleString()}` : "";
  const timeRange = [bk.start_time, bk.end_time].filter(Boolean).join(" – ");

  /* Street-level detail only once the booking is confirmed. A vendor who
     declines should not keep the customer's address and gate code. */
  const confirmed = status === "confirmed";

  const detail = [
    ["Confirmation #", requestId],
    ["Service",        bk.service_name],
    ["Option",         bk.package_name ? `${bk.package_name}${money ? ` — ${money}` : ""}` : ""],
    ["Event",          bk.event_type],
    ["Date",           bk.event_date],
    ["Time",           timeRange],
    ["Guests",         bk.guests],
    ["Location",       bk.venue],
    ["Access notes",   confirmed ? bk.access_instructions : ""],
    [isVendor ? "Customer" : "Vendor", isVendor ? customerName : vendorName],
    ["Note",           bk.vendor_note],
  ].filter(([, v]) => v);

  const footerNote = confirmed
    ? "Need to change or cancel? Either party can request it up to 48 hours before the event, and the other side must approve."
    : "";

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Email service not configured" });
  const FROM = process.env.RESEND_FROM || "PLUJ Marketplace <noreply@pluj.us>";

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        html: `
          <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;padding:24px">
            <div style="display:inline-block;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;
                        background:${THEME.bg};color:${THEME.fg}">
              ${esc(THEME.badge)}
            </div>
            <h2 style="margin:12px 0 6px;font-size:20px;color:#111">${esc(headline)}</h2>
            <p style="margin:0 0 18px;color:#555;font-size:14px;line-height:1.6">${esc(message)}</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              ${detail.map(([k, v]) => `
                <tr>
                  <td style="padding:8px 0;color:#777;border-top:1px solid #eee;vertical-align:top;white-space:nowrap;padding-right:16px">${esc(k)}</td>
                  <td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #eee;color:#111">${esc(v)}</td>
                </tr>`).join("")}
            </table>
            ${footerNote ? `<p style="margin:18px 0 0;padding:12px 14px;background:#F9FAFB;border-radius:10px;color:#555;font-size:12px;line-height:1.6">${esc(footerNote)}</p>` : ""}
            <p style="margin:22px 0 0;color:#999;font-size:12px">Sent by PLUJ · pluj.us</p>
          </div>`,
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("[send-booking-notification] Resend error:", r.status, data);
      return res.status(502).json({ error: "Could not send email" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[send-booking-notification] exception:", err);
    return res.status(500).json({ error: "Unexpected error" });
  }
}
