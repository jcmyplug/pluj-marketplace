/* Sign-up and the terms gate (31 Oct): nobody creates an account without
   scrolling through the terms. Checked for a host on a computer in English and
   a vendor on a phone in Spanish. */
import { test, expect } from "playwright/test";
import { mockBackend, spanish, PHONE } from "./mock.js";

const T = {
  en: { login: /Log in/, signup: /^(Sign up)$/, vendor: /Vendor/, cont: /Continue/, answer: "Your answer",
        create: /Create account|Create vendor account/, scrollFirst: /Please scroll through/ },
  es: { login: /Inicia sesión|Iniciar sesión/, signup: /^(Regístrate|Registrarse|Crear cuenta)$/, vendor: /Proveedor/,
        cont: /Continuar/, answer: "Tu respuesta", create: /Crear cuenta|Crear cuenta de proveedor/,
        scrollFirst: /Desplázate por los términos/ },
};

for (const { role, lang, viewport } of [
  { role: "host", lang: "en", viewport: { width: 1280, height: 900 } },
  { role: "vendor", lang: "es", viewport: PHONE },
]) {
  test(`${role} (${lang}): create is refused until the terms are scrolled to the end`, async ({ page }) => {
    await page.setViewportSize(viewport);
    if (lang === "es") await spanish(page);
    const calls = await mockBackend(page);
    const t = T[lang];
    await page.goto("/");
    await page.locator("button", { hasText: t.login }).first().click();
    await page.locator("button", { hasText: t.signup }).first().click();
    if (role === "vendor") await page.locator("button", { hasText: t.vendor }).first().click();

    const fill = async (sel, v) => { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await l.fill(v); };
    await fill('input[placeholder^="First name"], input[placeholder^="Nombre"]', "Ana");
    await fill('input[placeholder^="Last name"], input[placeholder^="Apellido"]', "García");
    if (role === "vendor") {
      await fill('input[placeholder^="Business / stage name"], input[placeholder^="Nombre del negocio"]', "Ana Eventos");
      await fill("#signup-biz-desc", "Houston decor and balloon arches for weddings, quinceañeras and birthdays since 2019.");
    }
    await fill('input[type="email"]', "new@example.com");
    const pws = page.locator('input[autocomplete="new-password"]');
    await pws.nth(0).fill("Secret-Pass-123!");
    await pws.nth(1).fill("Secret-Pass-123!");
    await fill('input[type="tel"]', "7135550100");
    await fill("#signup-dob", "1990-05-05");
    await page.locator("button", { hasText: t.cont }).last().click();

    const box = page.locator('[role="document"]');
    await expect(box).toHaveCount(1);
    /* The terms in the box are the current ones, badge wording included. */
    await expect(box).toContainText(lang === "es" ? "Una insignia refleja lo que vimos el día que revisamos"
                                                  : "A badge records what we saw on the day we checked");
    const accept = page.locator("button[aria-disabled]").first();
    await expect(accept).toHaveAttribute("aria-disabled", "true");

    /* The arithmetic question (shown until Turnstile keys exist). */
    const q = await page.evaluate(() => [...document.querySelectorAll("strong")].map((x) => x.textContent)
      .find((s) => /^\s*\d+\s*[-+×x*]\s*\d+\s*$/.test(s)) || null);
    if (q) {
      const [a, op, b] = q.match(/(\d+)\s*([-+×x*])\s*(\d+)/).slice(1);
      const ans = op === "+" ? +a + +b : op === "-" ? a - b : a * b;
      await fill(`input[placeholder="${t.answer}"]`, String(ans));
    }
    const resp = page.locator("button", { hasText: /responsible for what I post|check vendors|soy responsable|revisaré/i }).first();
    if (await resp.count()) { await resp.scrollIntoViewIfNeeded(); await resp.click(); }

    /* Try to create without reading: refused, nothing sent. */
    const create = page.locator("button", { hasText: t.create }).last();
    await create.scrollIntoViewIfNeeded();
    await create.click();
    await expect(page.getByText(t.scrollFirst).first()).toBeVisible();
    expect(calls.signup).toBe(0);

    /* Halfway is not enough. */
    await box.evaluate((el) => { el.scrollTop = el.scrollHeight * 0.4; el.dispatchEvent(new Event("scroll")); });
    await expect(accept).toHaveAttribute("aria-disabled", "true");

    /* The end unlocks it. */
    await box.evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll")); });
    await expect(accept).toHaveAttribute("aria-disabled", "false");
    await accept.click();
    await create.scrollIntoViewIfNeeded();
    await create.click();
    await expect.poll(() => calls.signup).toBe(1);
    /* The half-finished sign-up kept in the browser is gone once it worked. */
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pluj_signup_draft"))).toBeNull();
  });
}

test("the terms say what a badge does and does not mean", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");
  await page.locator("footer button", { hasText: /^Terms$/ }).first().click();
  await expect(page.getByText(/A badge records what we saw on the day we checked/).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("a licence or insurance verification");
});
