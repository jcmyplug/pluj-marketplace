/* Security headers in the browser (security items 12 and 16, 15 Nov 2026).

   `vite preview` sends the same headers as vercel.json (see vite.config.mjs),
   so these checks run the real site under the live Content Security Policy.
   The policy no longer allows inline scripts; if any part of the app, the
   human check or the address lookup needed one, the browser would block it
   and report a violation here. */
import { test, expect } from "playwright/test";
import { mockBackend, settle } from "./mock.js";

const PROFILE = "/vendor/svc_aaaaaaaa-0000-0000-0000-000000000000";

/* Collect every CSP violation the page reports, from the first script on. */
async function watchCsp(page) {
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI || "inline"}`);
    });
  });
}

test("every page is served with the security headers", async ({ page }) => {
  await mockBackend(page);
  const res = await page.goto("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["content-security-policy"]).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(h["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("SAMEORIGIN");
});

test("no Content Security Policy violations on the main pages and sign-up", async ({ page }) => {
  await watchCsp(page);
  await mockBackend(page);
  for (const path of ["/", "/c/music", PROFILE, "/build"]) {
    await page.goto(path);
    await settle(page);
  }
  /* Sign-up runs the (faked) human check, the riskiest script on the site. */
  await page.goto("/");
  await page.locator("button", { hasText: /Log in/ }).first().click();
  await page.locator("button", { hasText: /^(Sign up)$/ }).first().click();
  await settle(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
});

test("an injected inline script is blocked", async ({ page }) => {
  await watchCsp(page);
  await mockBackend(page);
  await page.goto("/");
  await settle(page, 400);
  /* What an attacker's injected markup would try: an inline script and an
     inline event handler. Neither may run. */
  const ran = await page.evaluate(async () => {
    window.__pwned = false;
    const s = document.createElement("script");
    s.textContent = "window.__pwned = true";
    document.body.appendChild(s);
    const img = document.createElement("img");
    img.setAttribute("onerror", "window.__pwned = true");
    img.src = "data:,x";
    document.body.appendChild(img);
    await new Promise((r) => setTimeout(r, 300));
    return window.__pwned;
  });
  expect(ran).toBe(false);
  expect((await page.evaluate(() => window.__csp)).length).toBeGreaterThan(0);
});
