/* PLUJ — sitemap.xml for search engines.  Repo location: api/sitemap.js
   Served at https://www.pluj.us/sitemap.xml through a rewrite in vercel.json.

   Lists the pages the app can open directly from a URL (see viewPath() in
   src/PlujMarketplace.jsx): the homepage, Build My Event, each category, and
   one page per approved vendor. Vendors come from vendor_public, which only
   contains approved vendors and only public columns, read with the public key.
   If the database is unreachable the static pages are still returned, so the
   sitemap never 500s. */

const SITE = "https://www.pluj.us";
const SB_URL  = process.env.SUPABASE_URL      || process.env.REACT_APP_SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

const CATEGORIES = ["food", "music", "production", "logistics", "places", "rentals", "av", "other"];

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
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") + "\n</urlset>\n";
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.status(200).send(xml);
}
