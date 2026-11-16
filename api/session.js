import { rateLimit } from "./_rate-limit.js";

/* PLUJ — keeps the sign-in's long-lived key out of the browser's storage.
   Repo location: api/session.js. Security item 6, 15 Nov 2026.

   WHAT IT DOES
   A Supabase sign-in is two tokens: an access token that works for an hour,
   and a refresh token that keeps getting new access tokens for up to 7 days.
   Both used to sit in localStorage, where any script running on the page can
   read them. The refresh token is the valuable one, so it now lives only in a
   cookie this endpoint sets: HttpOnly (no script can read it), Secure (https
   only), SameSite=Strict (never sent by another site's page) and __Host-
   (only this exact host, path /). The browser keeps the hour-long access
   token in memory and a note in localStorage that says who is signed in, so
   tabs stay in step.

     POST { op: "keep",    refresh_token }  right after signing in: swaps the
                                            fresh refresh token for a new one,
                                            stored only in the cookie
     POST { op: "refresh" }                 a new access token from the cookie
     POST { op: "end" }                     forget the cookie (log out)

   Every answer is { access_token, expires_at, user: { id, email } } or an
   error. The refresh token is never sent back to the page.

   WHY ONLY FROM PLUJ'S OWN PAGES
   The request must come from https://www.pluj.us (or pluj.us) with the
   x-pluj-session header. Another site cannot send that header without the
   browser asking this server first (CORS), which says no, and the cookie is
   SameSite=Strict on top. So another site can neither sign someone in to an
   account of its choosing nor read anyone's access token.

   IF THIS ENDPOINT IS DOWN
   The browser falls back to the old way (tokens in localStorage) rather than
   signing anyone out. See keepSession() in src/PlujMarketplace.jsx. */

const SB_URL  = process.env.SUPABASE_URL      || process.env.REACT_APP_SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

const COOKIE = "__Host-pluj_rt";
const MAX_AGE = 7 * 24 * 3600;           // matches the 7-day session limit set in Supabase Auth (1 Nov 2026)
const SITES = new Set(["https://www.pluj.us", "https://pluj.us"]);

function siteOrigin(req) {
  const o = req.headers && req.headers.origin;
  if (!o) return false;                    // a browser always sends Origin on a POST from a page
  if (SITES.has(o)) return true;
  if (!process.env.VERCEL && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;
  return false;
}

function readCookie(req) {
  const raw = String((req.headers && req.headers.cookie) || "");
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === COOKIE) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ""; }
    }
  }
  return "";
}

function setCookie(res, value) {
  res.setHeader("Set-Cookie",
    `${COOKIE}=${value ? encodeURIComponent(value) : ""}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${value ? MAX_AGE : 0}`);
}

/* Supabase answers a refresh with a new pair; the old refresh token stops
   working (after a few seconds' grace for parallel tabs). */
async function renew(refreshToken) {
  const r = await fetch(SB_URL + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_ANON },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const d = await r.json().catch(() => null);
  return { status: r.status, data: d };
}

function goodToken(t) {
  return typeof t === "string" && t.length > 0 && t.length <= 2048 && !/[\s;,]/.test(t);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!siteOrigin(req) || req.headers["x-pluj-session"] !== "1") {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!SB_URL || !SB_ANON) {
    console.error("[session] Supabase env not configured");
    return res.status(503).json({ error: "Unavailable" });
  }
  if (!(await rateLimit(req, res, { route: "session", max: 60, windowSeconds: 300 }))) return;

  const body = (req.body && typeof req.body === "object") ? req.body : {};
  const op = body.op;

  if (op === "end") {
    setCookie(res, "");
    return res.status(200).json({ ok: true });
  }

  let token = "";
  if (op === "keep") token = body.refresh_token;
  else if (op === "refresh") token = readCookie(req);
  else return res.status(400).json({ error: "Unknown request" });

  if (!goodToken(token)) {
    if (op === "refresh") setCookie(res, "");
    return res.status(401).json({ error: "Not signed in" });
  }

  let out;
  try {
    out = await renew(token);
  } catch (e) {
    console.error("[session] Supabase unreachable:", e && e.name);
    return res.status(503).json({ error: "Unavailable" });
  }

  const d = out.data || {};
  if (out.status === 200 && d.access_token && goodToken(d.refresh_token) && d.user && d.user.id) {
    setCookie(res, d.refresh_token);
    return res.status(200).json({
      access_token: d.access_token,
      expires_at: d.expires_at || null,
      user: { id: d.user.id, email: d.user.email || null },
    });
  }
  if (out.status === 429) return res.status(429).json({ error: "Too many requests" });
  if (out.status >= 500) return res.status(503).json({ error: "Unavailable" });

  /* Spent, revoked or past the 7-day limit: this sign-in is over. */
  setCookie(res, "");
  return res.status(401).json({ error: "Not signed in" });
}
