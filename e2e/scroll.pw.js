/* "The page jumps to the bottom" (fixed 31 Oct, twice). The page may only move
   when the person scrolls, or to the TOP of a page they just opened. */
import { test, expect } from "playwright/test";
import { mockBackend, listings, settle, PHONE, VERIFIED } from "./mock.js";

const where = (page) => page.evaluate(() => ({
  y: Math.round(scrollY), max: Math.round(document.documentElement.scrollHeight - innerHeight), path: location.pathname,
}));

test.describe("opening pages", () => {
  test("a card far down opens its profile at the top; Back returns to the same place", async ({ page }) => {
    await mockBackend(page, { services: listings(24, VERIFIED, { category: "music" }) });
    await page.goto("/c/music");
    await settle(page);
    const card = page.locator("h3", { hasText: "Listing 17" }).first();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const before = await where(page);
    expect(before.y).toBeGreaterThan(300);
    await card.click();
    await expect.poll(async () => (await where(page)).path).toContain("/vendor/");
    await page.waitForTimeout(600);
    expect((await where(page)).y).toBe(0);

    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    await page.getByText("Back to results").first().click();
    await page.waitForTimeout(800);
    const back = await where(page);
    expect(back.path).toBe("/c/music");
    expect(Math.abs(back.y - before.y)).toBeLessThan(120);
  });

  test("Build my event, pressed from the bottom of the home page, opens at the top", async ({ page }) => {
    await mockBackend(page, { services: listings(24) });
    await page.goto("/");
    await settle(page);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    /* The header button on a computer. On a phone the header folds away, so a
       person taps the "Build it step by step" card instead, from wherever it
       sits on the page; either way /build must open at its top. */
    const exact = page.locator("button:visible", { hasText: /^Build my event$/i }).first();
    const btn = (await exact.count()) ? exact : page.locator("button:visible", { hasText: /Build my event/i }).first();
    await btn.scrollIntoViewIfNeeded();
    expect((await where(page)).y).toBeGreaterThan(0);
    await btn.click();
    await expect.poll(async () => (await where(page)).path).toBe("/build");
    await page.waitForTimeout(600);
    expect((await where(page)).y).toBeLessThan(5);
  });
});

/* Build my event, clicked the way a person does: they scroll the thing on
   screen, then tap it. After every tap the page must not have moved down by
   itself, and must never land at the bottom. */
for (const [name, viewport] of [["computer", { width: 1280, height: 860 }], ["phone", PHONE]]) {
  test(`Build my event never jumps down (${name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockBackend(page, { services: listings(36) });
    await page.goto("/build");
    await settle(page);

    const problems = [];
    const tap = async (label, loc) => {
      if (!(await loc.count())) return false;
      const h = await loc.first().elementHandle();
      await page.evaluate((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < 70 || r.bottom > innerHeight) window.scrollBy(0, r.top - innerHeight / 2);
      }, h);
      await page.waitForTimeout(250);
      const before = await where(page);
      await page.evaluate((el) => el.click(), h);
      await page.waitForTimeout(700);
      const after = await where(page);
      if (after.y > before.y + 40) problems.push(`${label}: moved down ${before.y} -> ${after.y}`);
      if (after.max > 200 && after.y >= after.max - 4) problems.push(`${label}: landed at the bottom`);
      return true;
    };

    await page.locator("select").first().selectOption({ index: 1 });
    await tap("guests 100", page.locator("button", { hasText: /^100$/ }));
    await tap("next month", page.locator('button[aria-label*="Next"], button:has-text("›")'));
    await tap("day 14", page.locator("button:not([disabled])", { hasText: /^14$/ }));
    const times = () => page.locator("button:not([disabled])", { hasText: /^\s*\d{1,2}(:\d{2})?\s*(AM|PM)\s*$/i });
    await tap("start 6 PM", times().filter({ hasText: /^\s*6(:00)?\s*PM/i }));
    await tap("end 11 PM", times().filter({ hasText: /^\s*11(:00)?\s*PM/i }).last());
    await tap("Continue", page.locator("button:not([disabled])", { hasText: /^Continue/ }).last());

    /* Wedding Events is one of the occasions (31 Oct). */
    const wedding = page.locator("button", { hasText: /^Wedding Events/ });
    await expect(wedding.first()).toBeVisible();
    await tap("pick Wedding Events", wedding);
    await tap("Yes (venues)", page.locator("button", { hasText: /^Yes$/ }));
    await tap("Next", page.locator("button", { hasText: /^(Next|Skip|Continue)/ }).last());
    for (let i = 0; i < 14; i++) {
      if (!(await tap(`No #${i + 1}`, page.locator("button", { hasText: /^No$/ })))) break;
    }
    expect(problems).toEqual([]);
  });
}
