/* Shared fixtures for the browser checks (checklist item 30).

   Every check runs the real production build in a real Chromium, with the
   backend replaced by the answers below. Nothing reaches Supabase, Resend or
   any other site: requests that are not mocked are aborted, so a check can
   never pass or fail because of the network, and never writes anything. */

export const VID = "11111111-1111-1111-1111-111111111111";
export const VID2 = "33333333-3333-3333-3333-333333333333";

/* A vendor PLUJ has checked: licence and insurance, so it earns the
   blue Verified mark. */
export const VERIFIED = {
  id: VID, business_name: "DJ Verified", category: "music", verification_status: "approved",
  schedule: "Fri, Sat · Evening", biz_city: "Houston", biz_state: "TX", description: "We play parties.",
  legal_on_file: true, license_on_file: true, license_checked: true, coi_checked: true,
  coi_valid_until: "2027-06-30", languages: ["en", "es"], travel_miles: 25, years_in_biz: 6,
  service_areas: "Houston",
};
/* Insured but no licence checked: an Insured badge and no Verified mark. */
export const PLAIN = { ...VERIFIED, id: VID2, business_name: "DJ Plain", license_checked: false,
  license_on_file: false, languages: ["en"] };

const CATS = ["music", "food", "rentals", "photo", "places", "production", "av", "staff",
              "beauty", "transport", "kids", "logistics"];

/* n listing rows with the vendor embedded, the shape getApprovedVendors() reads. */
export function listings(n, vendor = VERIFIED, extra = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `aaaaaaaa-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`,
    vendor_id: vendor.id, category: CATS[i % CATS.length], name: `Listing ${i + 1}`,
    service_type: "Service", description: "Thing", price_value: 100 + i, duration_hours: 4,
    avail_days: '["Fri","Sat"]', avail_blocks: '["Evening"]', active: true,
    packages: JSON.stringify([{ name: "4 hours", price: 400, hours: 4, description: "DJ, speakers, 2 mics",
                                requirements: "Needs a standard outlet within 50 ft" }]),
    photos: "[]", addons: "[]", created_at: "2026-10-01T00:00:00Z", vendor_profiles: vendor,
    ...extra,
  }));
}

/* Replace the backend. Returns counters the test can assert on. */
export async function mockBackend(page, { services = listings(6), vendors = [VERIFIED, PLAIN] } = {}) {
  const calls = { signup: 0 };

  /* Lowest priority (registered first): anything not on this machine is cut. */
  await page.route((url) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url.toString()),
                   (route) => route.abort());

  await page.route("**/rest/v1/**", (route) => {
    const req = route.request();
    const url = req.url();
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/rpc/site_status")) return json({ private: false, since: null });
    if (url.includes("rate_limit")) return json({ allowed: true, attempts: 0, remaining: 5 });
    if (url.includes("/rpc/")) return json(null);
    if (url.includes("/vendor_services")) return json(services);
    if (url.includes("/vendor_public")) {
      const hit = vendors.find((v) => url.includes(v.id));
      if (single) return json(hit || vendors[0]);
      return json(url.includes("id=eq.") && hit ? [hit] : vendors);
    }
    return json(single ? null : []);
  });

  await page.route("**/auth/v1/**", (route) => {
    if (route.request().url().includes("/signup")) {
      calls.signup++;
      const user = { id: "u1", email: "new@example.com", identities: [{ id: "i1" }] };
      return route.fulfill({ status: 200, contentType: "application/json",
                             body: JSON.stringify({ ...user, user, session: null }) });
    }
    return route.fulfill({ status: 400, contentType: "application/json", body: "{}" });
  });
  return calls;
}

/* Uncaught errors and console errors, minus the aborted network requests
   that mockBackend causes on purpose. */
export function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|net::ERR_|ERR_FAILED/.test(m.text())) {
      errors.push(m.text().slice(0, 200));
    }
  });
  return errors;
}

export async function spanish(page) {
  await page.addInitScript(() => { try { localStorage.setItem("pluj_lang", "es"); } catch { /* private mode */ } });
}

/* Let the page settle: data arrives, translation runs, icons render. */
export async function settle(page, ms = 1200) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/* Emoji left anywhere a person can see them: text, placeholders, labels,
   tooltips. The site uses one monoline icon set; ✓ ✦ ✕ are typographic marks
   kept on purpose. */
export async function emojiLeftovers(page) {
  return page.evaluate(() => {
    const re = /[☀-➿⭐⏩-⏺⌚⌛]|[\u{1F000}-\u{1FAFF}]/u;
    const allowed = ["✓", "✦", "✕"];
    const out = new Set();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      for (const ch of n.nodeValue) if (re.test(ch) && !allowed.includes(ch)) out.add(`${ch} in "${n.nodeValue.trim().slice(0, 40)}"`);
    }
    document.querySelectorAll("[placeholder],[aria-label],[title]").forEach((el) => {
      for (const a of ["placeholder", "aria-label", "title"]) {
        for (const ch of el.getAttribute(a) || "") if (re.test(ch) && !allowed.includes(ch)) out.add(`${ch} in @${a}`);
      }
    });
    return [...out];
  });
}

export async function sidewaysOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

export const PHONE = { width: 390, height: 844 };
