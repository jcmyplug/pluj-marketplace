/* PLUJ — which websites may call these API routes from a browser.
   Repo location: api/_origin.js   (security item 16, 15 Nov 2026)

   None of the routes send Access-Control-Allow-Origin, so a browser on
   another site can never READ their answers. But a browser still SENDS a
   cross-site POST before it checks CORS, so another site could make its
   visitors' browsers spam these routes. Every browser request carries an
   Origin header; anything not on this list is refused before any work is
   done. Requests with no Origin at all (curl, servers, Vercel's own probes)
   are not browsers and are left to the rate limiter and the firewall. */

const ALLOWED = new Set([
  "https://www.pluj.us",
  "https://pluj.us",
]);
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function originAllowed(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return true;
  if (ALLOWED.has(origin)) return true;
  /* Local development only: never true on Vercel. */
  if (!process.env.VERCEL && LOCAL.test(origin)) return true;
  return false;
}

/* Returns true if the caller may proceed; otherwise it has already answered 403. */
export function checkOrigin(req, res) {
  if (originAllowed(req)) return true;
  res.status(403).json({ error: "Forbidden" });
  return false;
}
