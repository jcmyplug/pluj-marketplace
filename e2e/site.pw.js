/* The public site: footer, Spanish, icons, phone width, badges, profile,
   log-in. Each block is something that broke, or was built, in October. */
import { test, expect } from "playwright/test";
import { mockBackend, listings, watchErrors, spanish, settle, emojiLeftovers, sidewaysOverflow,
         VERIFIED, PLAIN, PHONE } from "./mock.js";

const PROFILE = "/vendor/svc_aaaaaaaa-0000-0000-0000-000000000000";
const PAGES = ["/", "/c/music", PROFILE, "/build"];

test.describe("footer", () => {
  test("English: the slogan, Instagram link, and no errors", async ({ page }) => {
    const errors = watchErrors(page);
    await mockBackend(page);
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toContainText("Real pros. Personally vetted. #weknowaguy");
    await expect(footer).toContainText("Follow us on Instagram");
    await expect(footer.getByRole("link", { name: "@pluj.us" }))
      .toHaveAttribute("href", "https://www.instagram.com/pluj.us/");
    await expect(page.locator("body")).not.toContainText("Every pro checked by hand");
    await settle(page);
    expect(errors).toEqual([]);
  });

  test("Spanish: the same footer, translated", async ({ page }) => {
    await spanish(page);
    await mockBackend(page);
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toContainText("Profesionales reales. Revisados personalmente.");
    await expect(footer).toContainText("Síguenos en Instagram");
    await expect(footer.getByRole("link", { name: "@pluj.us" })).toBeVisible();
  });
});

test.describe("one icon style everywhere", () => {
  for (const lang of ["en", "es"]) {
    test(`no emoji left on the main pages (${lang})`, async ({ page }) => {
      if (lang === "es") await spanish(page);
      await mockBackend(page, { services: listings(10) });
      for (const path of PAGES) {
        await page.goto(path);
        await settle(page);
        expect(await emojiLeftovers(page), path).toEqual([]);
      }
    });
  }
});

test.describe("phone width", () => {
  test.use({ viewport: PHONE });
  test("nothing scrolls sideways", async ({ page }) => {
    await mockBackend(page, { services: listings(10) });
    for (const path of PAGES) {
      await page.goto(path);
      await settle(page);
      expect(await sidewaysOverflow(page), path).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("badges", () => {
  const services = [
    ...listings(1, VERIFIED, { id: "aaaaaaaa-0000-0000-0000-000000000001", category: "music", name: "Verified DJ set" }),
    ...listings(1, PLAIN,    { id: "aaaaaaaa-0000-0000-0000-000000000002", category: "music", name: "Plain DJ set" }),
  ];

  const cards = (page) => page.evaluate(() =>
    [...document.querySelectorAll("h3")].filter((h) => /DJ set/.test(h.textContent)).map((h) => {
      const card = h.closest("div").parentElement;
      return { title: h.textContent.trim(), check: !!card.querySelector(".vcheck"),
               badges: [...card.querySelectorAll(".badge-chk")].map((x) => x.textContent.trim()) };
    }));

  test("licensed + insured earns the check mark; insured alone does not", async ({ page }) => {
    await mockBackend(page, { services });
    await page.goto("/c/music");
    await expect(page.locator("h3", { hasText: "Plain DJ set" })).toBeVisible();
    const got = await cards(page);
    const verified = got.find((c) => c.title.includes("Verified DJ set"));
    const plain = got.find((c) => c.title.includes("Plain DJ set"));
    expect(verified).toMatchObject({ check: true });
    expect(verified.badges).toEqual(expect.arrayContaining(["Licensed", "Insured"]));
    expect(plain).toMatchObject({ check: false });
    expect(plain.badges).toContain("Insured");
    expect(plain.badges).not.toContain("Licensed");
  });

  test("the profile says what PLUJ checked", async ({ page }) => {
    await mockBackend(page, { services });
    await page.goto("/vendor/svc_aaaaaaaa-0000-0000-0000-000000000001");
    await expect(page.locator(".verified-pill")).toContainText("Verified · licensed and insured, checked by PLUJ");
    await page.goto("/vendor/svc_aaaaaaaa-0000-0000-0000-000000000002");
    await expect(page.locator("h1")).toBeVisible();
    await settle(page, 600);
    await expect(page.locator(".verified-pill")).toHaveCount(0);
  });
});

test("a listing shows its working days and what the vendor needs", async ({ page }) => {
  await mockBackend(page, { services: listings(2) });
  await page.goto(PROFILE);
  await expect(page.getByText("Needs from you:").first()).toBeVisible();
  const days = await page.locator('span[title="Works this day"]').allTextContents();
  expect(days.map((d) => d.trim())).toEqual(expect.arrayContaining(["Fri", "Sat"]));
});

test("log in: the password eye shows and hides without losing what was typed", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: /log in/i }).first().click();
  const pw = page.locator('input[autocomplete="current-password"], input[type="password"]').first();
  await pw.fill("Secret-Pass-123");
  await expect(pw).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).first().click();
  await expect(pw).toHaveAttribute("type", "text");
  await expect(pw).toHaveValue("Secret-Pass-123");
  await page.getByRole("button", { name: "Hide password" }).first().click();
  await expect(pw).toHaveAttribute("type", "password");
});
