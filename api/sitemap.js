/* PLUJ — sitemap.xml for search engines.  Repo location: api/sitemap.js
   Served at https://www.pluj.us/sitemap.xml through a rewrite in vercel.json.

   Lists the pages the app can open directly from a URL (see viewPath() in
   src/PlujMarketplace.jsx): the homepage, Build My Event, each category, and
   one page per approved vendor. Vendors come from vendor_public, which only
   contains approved vendors and only public columns, read with the public key.
   If the database is unreachable the static pages are still returned, so the
   sitemap never 500s. */

const SITE = "https://www.pluj.us";
/* Same public defaults the app itself uses (src/PlujMarketplace.jsx); the anon
   key is public and already shipped in the browser bundle. */
const SB_URL  = process.env.SUPABASE_URL      || process.env.REACT_APP_SUPABASE_URL
  || "https://btmqghudfakpbbplrqhf.supabase.co";
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0bXFnaHVkZmFrcGJicGxycWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNjA1NTgsImV4cCI6MjA5NDczNjU1OH0.t3GgjjKy--BPMJ7Z5wPWB1UamG71F6FGzR_N2cfJpWw";

const CATEGORIES = ["places", "food", "music", "photo", "production", "rentals", "av", "staff",
                    "beauty", "transport", "kids", "logistics", "other"];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function urlTag(loc, lastmod, priority) {
  return "  <url><loc>" + esc(loc) + "</loc>" +
    (lastmod ? "<lastmod>" + lastmod + "</lastmod>" : "") +
    "<priority>" + priority + "</priority></url>";
}

async function vendorIds() {
  if (!SB_URL || !SB_ANON) return [];
  try {
    const r = await fetch(
      SB_URL + "/rest/v1/vendor_public?select=id,created_at&verification_status=eq.approved&order=created_at.desc&limit=5000",
      { headers: { apikey: SB_ANON, Authorization: "Bearer " + SB_ANON } }
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/* Event recaps (published, by approved pros): each has its own page. */
async function recapIds() {
  if (!SB_URL || !SB_ANON) return [];
  try {
    const r = await fetch(
      SB_URL + "/rest/v1/event_recaps?select=id,updated_at&status=eq.published&order=updated_at.desc&limit=5000",
      { headers: { apikey: SB_ANON, Authorization: "Bearer " + SB_ANON } }
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    urlTag(SITE + "/", today, "1.0"),
    urlTag(SITE + "/build", today, "0.8"),
    ...CATEGORIES.map((c) => urlTag(SITE + "/c/" + c, today, "0.7")),
  ];
  for (const v of await vendorIds()) {
    if (!v || !v.id) continue;
    const lastmod = v.created_at ? String(v.created_at).slice(0, 10) : "";
    urls.push(urlTag(SITE + "/vendor/" + encodeURIComponent(v.id), lastmod, "0.6"));
  }
  for (const e of await recapIds()) {
    if (!e || !e.id) continue;
    urls.push(urlTag(SITE + "/event/" + encodeURIComponent(e.id), e.updated_at ? String(e.updated_at).slice(0, 10) : "", "0.5"));
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") + "\n</urlset>\n";
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.status(200).send(xml);
}
