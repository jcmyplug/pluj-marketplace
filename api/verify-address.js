import { rateLimit } from "./_rate-limit.js";

/* PLUJ - address verification.  Repo location: api/verify-address.js

   WHY THIS EXISTS
   The autocomplete used Photon and Nominatim, both built on OpenStreetMap. OSM
   has Houston's streets, cities and ZIPs, but very few residential HOUSE
   NUMBERS. So "824 Wilkes St" came back as "Wilkes Street" with the number
   silently dropped, and every event address arrived incomplete.

   The US Census geocoder has house numbers, via TIGER address ranges. It is
   free forever: no API key, no account, no billing card, no usage charges. It
   is a US government service.

   Measured against the exact addresses that were failing:
     824 Wilkes St Houston TX    ->  824 WILKES ST, HOUSTON, TX, 77009   match
     1600 Smith St Houston TX    ->  1600 SMITH ST, HOUSTON, TX, 77002   match
     99999 Wilkes St Houston TX  ->  no match                            rejected

   That last line is the important one. It validates against the real range of
   numbers on the street (Wilkes runs 600-898), so an impossible house number is
   refused rather than accepted. That is what keeps wrong addresses away from a
   vendor who has to drive there.

   WHY IT IS SERVER-SIDE
   The Census API sends no CORS headers, so a browser fetch fails outright
   (verified: "TypeError: Failed to fetch" from a cross-origin page). Proxying
   here also means no CSP change is needed - the browser only ever talks to our
   own origin, which connect-src 'self' already allows.

   NO AUTH ON PURPOSE
   People fill in the event address before signing in, so requiring a JWT would
   break the flow. Unlike the email endpoints, this one sends nothing, stores
   nothing, costs nothing and returns no user data - a stranger calling it gets
   back public address facts they could look up themselves. The guards below
   exist to protect the Census service from us, not to protect us from callers.

   HONEST LIMITS
   - US only. Fine for a Houston marketplace, wrong for anything else.
   - TIGER stores address RANGES, not individual properties. It confirms 824
     falls inside 600-898 on Wilkes St; it cannot prove number 824 is built. It
     will still catch a wrong street, city, ZIP, or an absurd number.
   - Very new construction may be missing.
   - Free service, no SLA. Every failure path degrades to "unverified" rather
     than blocking a booking.

   Written without regular expressions on purpose, so the file can be moved
   around by tools that treat backslashes as escapes. */

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

const isDigit = (c) => c >= "0" && c <= "9";
const hasDigit = (s) => Array.from(String(s || "")).some(isDigit);

/* Census answers in shouty caps - "824 WILKES ST, HOUSTON, TX, 77009". Showing
   that back to a customer looks broken, so restore ordinary casing. */
const KEEP_UPPER = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "US", "PO"]);
function titleCase(s) {
  return String(s || "")
    .toLowerCase()
    .split(" ")
    .map((w) => {
      if (!w) return w;
      const up = w.toUpperCase();
      if (KEEP_UPPER.has(up)) return up;
      if (isDigit(w[0])) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/* This string is handed to a third party, so keep it to characters that can
   legitimately appear in a US street address. Anything else becomes a space. */
const SAFE = " abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,#'-/";
function sanitize(s) {
  let out = "";
  for (const ch of String(s || "")) out += SAFE.includes(ch) ? ch : " ";
  return out.split(" ").filter(Boolean).join(" ");
}

/* Warm-instance cache. Serverless instances are ephemeral so this is not a
   guarantee, but an address repeats constantly while somebody edits a booking,
   and every hit is one fewer request against a free public service. */
const cache = new Map();
const CACHE_MAX = 500;
const CACHE_TTL = 60 * 60 * 1000; // an hour; street ranges do not move

function cacheGet(k) {
  const hit = cache.get(k);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL) { cache.delete(k); return undefined; }
  return hit.value;
}
function cacheSet(k, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(k, { at: Date.now(), value });
}

/* Speed bump against one client hammering a warm instance. */
const hits = new Map();
const WINDOW_MS = 60000;
const MAX_PER_WINDOW = 40;
function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) { hits.set(ip, { start: now, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  /* This route already had a rate limit, but it counted in module memory, so
     it bound one serverless instance for as long as that instance happened to
     live. Vercel runs many. The shared counter below is the real one; the
     in-process one can stay as a cheap first line that costs no round trip. */
  if (!(await rateLimit(req, res, { route: "verify-address", max: 60, windowSeconds: 300 }))) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fwd = String(req.headers["x-forwarded-for"] || "");
  const ip = fwd.split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many address checks - try again in a minute." });
  }

  /* Accept either the raw text the person typed, or the four fields. The raw
     text matters most: when somebody types "824 Wilkes St Houston" and picks a
     street-level suggestion, the house number survives only in what they typed. */
  const body = req.body || {};
  let q = String(body.q || "").trim();
  if (!q) {
    q = [body.street, body.city, body.state, body.zip]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .join(", ");
  }

  if (q.length < 5 || q.length > 200) {
    return res.status(200).json({ ok: true, match: null, reason: "too short or too long" });
  }
  q = sanitize(q);

  /* No house number means there is nothing to confirm beyond the street, and a
     street is not an address. Say so without spending a request. */
  if (!hasDigit(q)) {
    return res.status(200).json({ ok: true, match: null, reason: "no house number" });
  }

  const key = q.toLowerCase();
  const cached = cacheGet(key);
  if (cached !== undefined) return res.status(200).json(Object.assign({}, cached, { cached: true }));

  const url = CENSUS + "?address=" + encodeURIComponent(q) +
              "&benchmark=Public_AR_Current&format=json";

  /* Census can be slow. Waiting on it must never hold up a booking, so cap the
     wait and fall through to unverified. */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);

  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!r.ok) {
      console.error("[verify-address] census HTTP", r.status);
      return res.status(200).json({ ok: true, match: null, reason: "lookup unavailable" });
    }

    const data = await r.json();
    const matches = data && data.result && data.result.addressMatches;
    const first = matches && matches.length ? matches[0] : null;

    if (!first) {
      const miss = { ok: true, match: null, reason: "no match" };
      cacheSet(key, miss);
      return res.status(200).json(miss);
    }

    /* matchedAddress is "824 WILKES ST, HOUSTON, TX, 77009". Splitting it is
       more reliable than reassembling the components by hand, which needs
       preDirection, preType, suffixType and suffixDirection in the right order. */
    const parts = String(first.matchedAddress || "").split(",").map((s) => s.trim());
    const street = parts[0] || "";
    const city = parts[1] || "";
    const state = parts[2] || "";
    const zip = parts[3] || "";

    if (!street || !city) {
      const bad = { ok: true, match: null, reason: "unparseable match" };
      cacheSet(key, bad);
      return res.status(200).json(bad);
    }

    const comp = first.addressComponents || null;
    const payload = {
      ok: true,
      match: {
        street: titleCase(street),
        city: titleCase(city),
        state: state.toUpperCase(),
        zip: zip,
        /* The range this number was checked against. Useful when explaining to
           a customer why their number was not accepted. */
        range: comp ? comp.fromAddress + "-" + comp.toAddress : null,
      },
    };
    cacheSet(key, payload);
    return res.status(200).json(payload);
  } catch (err) {
    clearTimeout(timer);
    /* Abort, DNS failure, Census having a bad minute - all the same to the
       caller. Never block a booking because a free lookup was slow. */
    console.error("[verify-address] lookup failed:", err && err.message);
    return res.status(200).json({ ok: true, match: null, reason: "lookup unavailable" });
  }
}
