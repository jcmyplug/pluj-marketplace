/* PLUJ — shared rate limiter for the API routes.  Repo location: api/_rate-limit.js

   WHY THE COUNTER IS IN POSTGRES AND NOT IN MEMORY
   Vercel runs these handlers as serverless functions: many instances, each
   with its own memory, recycled without warning. A counter held in a module
   variable therefore limits one instance for as long as it happens to live,
   which is not a limit — it is a speed bump that scales with the attacker.
   The counter lives in the database, which every instance shares.

   WHY THE COUNTER IS BEHIND AN RPC
   check_rate_limit is SECURITY DEFINER and the rate_limits table has no grants
   to anon or authenticated at all. Callers can be counted; they cannot reach
   the number that counts them. The previous design let the browser read and
   write that table directly with the public key, so anyone could delete their
   own row and start again.

   IT FAILS OPEN, DELIBERATELY
   If the database is unreachable the request is allowed through. The other
   choice — refuse everything when the limiter is down — turns a database blip
   into a total outage, and these endpoints already degrade safely on their own
   (log-error drops a report, verify-address returns unverified). Abuse during
   a Postgres outage is the lesser problem, and during one the site is broken
   anyway. This is a real tradeoff, not an oversight.
*/

const SB_URL  = process.env.SUPABASE_URL      || process.env.REACT_APP_SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

/* Vercel puts the real client address first in x-forwarded-for. Everything
   after it is proxy hops and is attacker-controlled, so only the first entry
   is trusted. */
export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"] || "";
  const first = String(xff).split(",")[0].trim();
  return first || req.headers["x-real-ip"] || "unknown";
}

/* Returns true if the caller may proceed. When it returns false it has ALREADY
   sent a 429 with Retry-After, so the handler should just return. */
export async function rateLimit(req, res, opts) {
  const route = (opts  ||  {}).route || "api";
  const max = (opts || {}).max || 30;
  const windowSeconds = (opts || {}).windowSeconds || 300;

  if (!SB_URL || !SB_ANON) return true;            // misconfigured: fail open

  const key = "api:" + route + ":" + clientIp(req);

  try {
    const r = await fetch(SB_URL + "/rest/v1/rpc/check_rate_limit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB_ANON,
        "Authorization": "Bearer " + SB_ANON,
      },
      body: JSON.stringify({ p_key: key, p_max: max, p_window_seconds: windowSeconds }),
    });
    if (!r.ok) return true;                        // limiter unavailable: fail open

    const out = await r.json();
    if (out && out.allowed === false) {
      const retry = out.retry_after_seconds || windowSeconds;
      res.setHeader("Retry-After", String(retry));
      res.status(429).json({
        error: "Too many requests. Please wait and try again.",
        retryAfterSeconds: retry,
      });
      return false;
    }
    return true;
  } catch {
    return true;                                   // network error: fail open
  }
}
