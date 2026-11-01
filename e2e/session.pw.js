/* Sign-in sessions over time (fixed 31 Oct 2026, found in the live logs: a
   browser kept sending a sign-in that had expired hours earlier, and even the
   public catalogue answered 401). */
import { test, expect } from "playwright/test";
import { mockBackend, listings, VERIFIED, settle } from "./mock.js";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub, expSeconds) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", exp: expSeconds })}.sig`;
const now = () => Math.floor(Date.now() / 1000);
const PROFILE = { id: "u1", role: "user", status: "active", full_name: "Ana Host", display_name: "Ana",
                  created_at: "2026-10-01T00:00:00Z" };

/* A fake auth server: which access tokens are alive, and which refresh token
   turns into which new pair (each refresh token works once, like Supabase). */
async function fakeAuth(page, { alive, refreshes, log }) {
  const bearer = (req) => (req.headers()["authorization"] || "").replace(/^Bearer /, "");
  const isUserToken = (t) => t.split(".").length === 3 && !t.startsWith("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSI");
  await page.route("**/rest/v1/**", (route) => {
    const t = bearer(route.request());
    if (isUserToken(t)) {
      log.push({ path: new URL(route.request().url()).pathname, token: t });
      if (!alive.has(t)) return route.fulfill({ status: 401, contentType: "application/json", body: '{"code":"PGRST301","message":"JWT expired"}' });
      if (route.request().url().includes("/profiles")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PROFILE) });
    }
    return route.fallback();
  });
  await page.route("**/auth/v1/**", (route) => {
    const url = route.request().url();
    if (url.includes("/user")) {
      return alive.has(bearer(route.request()))
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "u1", email: "ana@example.com" }) })
        : route.fulfill({ status: 401, contentType: "application/json", body: '{"msg":"invalid JWT"}' });
    }
    if (url.includes("grant_type=refresh_token")) {
      const rt = route.request().postDataJSON().refresh_token;
      log.push({ path: "refresh", token: rt });
      const next = refreshes.get(rt);
      refreshes.delete(rt);                                   /* single use */
      if (!next) return route.fulfill({ status: 400, contentType: "application/json", body: '{"error":"invalid_grant"}' });
      alive.add(next.access_token);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(next) });
    }
    return route.fallback();
  });
}

const saveSession = (page, access, refresh) => page.addInitScript(([a, r]) => {
  try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("pluj_session", JSON.stringify({ access_token: a, refresh_token: r, user: { id: "u1" } })); sessionStorage.setItem("seeded", "1"); } }
  catch { /* private mode */ }
}, [access, refresh]);

test("a saved sign-in that can no longer be renewed: the site still works and the dead session is dropped", async ({ page }) => {
  const dead = jwt("u1", now() - 3 * 3600);
  const log = [];
  await mockBackend(page, { services: listings(6, VERIFIED, { category: "music" }) });
  await fakeAuth(page, { alive: new Set(), refreshes: new Map(), log });
  await saveSession(page, dead, "r-spent");
  await page.goto("/c/music");
  await expect(page.locator("h3", { hasText: "Listing 1" }).first()).toBeVisible();
  await settle(page, 600);
  expect(await page.evaluate(() => localStorage.getItem("pluj_session"))).toBeNull();
  /* After giving up, nothing more is sent with the dead token. */
  const n = log.filter((l) => l.token === dead).length;
  await page.reload();
  await settle(page, 800);
  expect(log.filter((l) => l.token === dead).length).toBe(n);
});

test("an hour-old saved sign-in is renewed on a return visit, not treated as logged out", async ({ page }) => {
  const old = jwt("u1", now() - 600), fresh = jwt("u1", now() + 3600);
  const log = [];
  await mockBackend(page);
  await fakeAuth(page, { alive: new Set(), refreshes: new Map([["r1", { access_token: fresh, refresh_token: "r2" }]]), log });
  await saveSession(page, old, "r1");
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pluj_session") || "{}").access_token)).toBe(fresh);
  await expect(page.getByRole("button", { name: /Log in \/ Sign up/ })).toHaveCount(0);
});

test("two tabs: when one renews the sign-in, the other uses the new one instead of failing", async ({ context }) => {
  const t1 = jwt("u1", now() + 3600), t2 = jwt("u1", now() + 7200);
  const alive = new Set([t1]);
  const refreshes = new Map([["r1", { access_token: t2, refresh_token: "r2" }]]);
  const log = [];
  const a = await context.newPage(), b = await context.newPage();
  for (const p of [a, b]) {
    await mockBackend(p, { services: listings(6, VERIFIED, { category: "music" }) });
    await fakeAuth(p, { alive, refreshes, log });
  }
  await a.addInitScript(([x]) => { if (!localStorage.getItem("pluj_session")) localStorage.setItem("pluj_session", JSON.stringify({ access_token: x, refresh_token: "r1", user: { id: "u1" } })); }, [t1]);
  await a.goto("/");
  await b.goto("/");
  await settle(a, 400); await settle(b, 400);

  /* An hour passes: T1 dies. Tab A notices first and renews with r1. */
  alive.delete(t1);
  await a.goto("/c/music");
  await expect(a.locator("h3", { hasText: "Listing 1" }).first()).toBeVisible();
  await expect.poll(() => a.evaluate(() => JSON.parse(localStorage.getItem("pluj_session")).access_token)).toBe(t2);

  /* Tab B, which loaded with T1 and r1 in memory, carries on: it opens a
     vendor page, which loads availability, booked dates and reviews. */
  const mark = log.length;
  await b.locator("h3", { hasText: "Listing 1" }).first().click();
  await expect.poll(() => b.evaluate(() => location.pathname)).toContain("/vendor/");
  await settle(b, 800);
  const fromB = log.slice(mark).filter((l) => l.path !== "refresh");
  expect(fromB.length).toBeGreaterThan(0);                                             /* it did ask for things */
  expect(fromB.filter((l) => l.token === t1)).toEqual([]);                             /* never with the dead token */
  expect(log.filter((l) => l.path === "refresh" && l.token === "r1").length).toBe(1);  /* nor reused the spent one */
  await expect(b.locator(".session-note")).toHaveCount(0);                             /* and was not logged out */
});
