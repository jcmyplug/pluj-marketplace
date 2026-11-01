/* Sign-up and the terms gate (31 Oct): nobody creates an account without
   scrolling through the terms. Checked for a host on a computer in English and
   a vendor on a phone in Spanish. */
import { test, expect } from "playwright/test";
import { mockBackend, spanish, PHONE, TS_TOKEN } from "./mock.js";

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

    /* Every box says what goes in it in the page's language, required ones
       with their star, text boxes included (31 Oct: these were English). */
    if (lang === "es") {
      for (const ph of ["Nombre *", "Apellido *", "Correo electrónico *", "Contraseña *", "Número de teléfono *"])
        await expect(page.locator(`input[placeholder="${ph}"]`).first()).toBeAttached();
      if (role === "vendor") await expect(page.locator("#signup-biz-desc")).toHaveAttribute("placeholder", /^Lo que ofreces/);
      expect(await page.evaluate(() => [...document.querySelectorAll("input[placeholder], textarea[placeholder]")]
        .map((e) => e.placeholder).filter((p) => /\b(name|address|password|phone|What you offer)\b/.test(p)))).toEqual([]);
    }
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
    /* Real people only (31 Oct): in the terms, and in what the person confirms. */
    await expect(box).toContainText(lang === "es" ? "Solo personas reales" : "Real people only");
    await expect(page.getByText(lang === "es" ? /Soy una persona real y usaré esta cuenta personalmente/
                                              : /I'm a real person and will use this account myself/).first()).toBeVisible();
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
    /* With Turnstile on, the sign-up carries the human-check token. */
    if (await page.evaluate(() => (window.__tsRendered || 0) > 0)) {
      const sent = calls.auth.find((c) => c.path.startsWith("/signup"));
      expect(sent.body.gotrue_meta_security).toEqual({ captcha_token: TS_TOKEN });
    }
    /* The half-finished sign-up kept in the browser is gone once it worked. */
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pluj_signup_draft"))).toBeNull();
  });
}

test("the terms and rules say accounts are run by real people, not bots or AI agents (EN and ES)", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");
  await page.locator("footer button", { hasText: /^Terms$/ }).first().click();
  await expect(page.getByText(/AI agents may not create accounts, log in/).first()).toBeVisible();
  await expect(page.getByText(/Every account belongs to one real person/).first()).toBeVisible();

  const es = await page.context().newPage();
  await spanish(es);
  await mockBackend(es);
  await es.goto("/");
  await es.locator("footer button", { hasText: /^Términos$/ }).first().click();
  await expect(es.getByText(/Solo personas reales/).first()).toBeVisible();
  await expect(es.getByText(/agentes de inteligencia artificial \(IA\) no pueden crear cuentas/).first()).toBeVisible();
  await expect(es.getByText(/AI agents/)).toHaveCount(0);
});

test("the terms say what a badge does and does not mean", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");
  await page.locator("footer button", { hasText: /^Terms$/ }).first().click();
  await expect(page.getByText(/A badge records what we saw on the day we checked/).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("a licence or insurance verification");
});

/* Supabase's CAPTCHA covers log-in and password reset too, so both must carry
   the token, or turning CAPTCHA on would lock everyone out (31 Oct). */
test("log in and forgot password carry the human-check token", async ({ page }) => {
  const calls = await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: /log in/i }).first().click();
  const turnstileOn = await page.waitForFunction(() => (window.__tsRendered || 0) > 0, null, { timeout: 4000 })
    .then(() => true, () => false);
  test.skip(!turnstileOn, "this build has no Turnstile site key");
  await page.locator('input[type="email"]').first().fill("someone@example.com");
  await page.locator('input[autocomplete="current-password"], input[type="password"]').first().fill("Secret-Pass-123");
  await page.waitForTimeout(400);   /* the fake hands its token over after 150 ms */

  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect.poll(() => calls.auth.filter((c) => c.path.startsWith("/recover")).length).toBe(1);
  expect(calls.auth.find((c) => c.path.startsWith("/recover")).body.gotrue_meta_security)
    .toEqual({ captcha_token: TS_TOKEN });
  /* A token works once: the widget is reset for the next attempt. */
  await expect.poll(() => page.evaluate(() => window.__tsResets)).toBeGreaterThan(0);

  await page.waitForTimeout(400);
  await page.locator("button", { hasText: /^Log in$/ }).last().click();
  await expect.poll(() => calls.auth.filter((c) => c.path.startsWith("/token")).length).toBe(1);
  expect(calls.auth.find((c) => c.path.startsWith("/token")).body.gotrue_meta_security)
    .toEqual({ captcha_token: TS_TOKEN });
  /* The mock refuses the password, and the page says so. */
  await expect(page.getByText(/Incorrect email or password/).first()).toBeVisible();
});

/* When Supabase refuses a log-in for a reason other than the password, the
   form says so, instead of "Incorrect email or password". */
for (const [label, status, body, expected] of [
  ["a failed human check", 400, { code: 400, error_code: "captcha_failed", msg: "captcha protection: request disallowed (invalid-input-response)" }, /human check didn't go through/],
  ["too many tries", 429, { code: 429, error_code: "over_request_rate_limit", msg: "Request rate limit reached" }, /Too many tries in a row/],
]) {
  test(`log-in refused for ${label}: the form says why`, async ({ page }) => {
    await mockBackend(page);
    await page.route("**/auth/v1/token**", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));
    await page.goto("/");
    await page.getByRole("button", { name: /log in/i }).first().click();
    await page.locator('input[type="email"]').first().fill("someone@example.com");
    await page.locator('input[autocomplete="current-password"], input[type="password"]').first().fill("Secret-Pass-123");
    await page.waitForTimeout(500);
    await page.locator("button", { hasText: /^Log in$/ }).last().click();
    await expect(page.getByText(expected).first()).toBeVisible();
    await expect(page.getByText(/Incorrect email or password/)).toHaveCount(0);
  });
}

/* Supabase's leaked-password check (Pro, on since 31 Oct): a password found in
   a data breach is refused, and the form says so in plain words instead of
   Supabase's technical message. */
test("sign-up with a breached password: the form says why, plainly", async ({ page }) => {
  await mockBackend(page);
  await page.route("**/auth/v1/signup**", (route) => route.fulfill({ status: 422, contentType: "application/json",
    body: JSON.stringify({ code: 422, error_code: "weak_password", weak_password: { reasons: ["pwned"] },
                           msg: "Password is known to be weak and easy to guess, please choose a different one." }) }));
  await page.goto("/");
  await page.locator("button", { hasText: /Log in/ }).first().click();
  await page.locator("button", { hasText: /^(Sign up)$/ }).first().click();
  const fill = async (sel, v) => { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await l.fill(v); };
  await fill('input[placeholder^="First name"]', "Ana");
  await fill('input[placeholder^="Last name"]', "García");
  await fill('input[type="email"]', "new@example.com");
  const pws = page.locator('input[autocomplete="new-password"]');
  await pws.nth(0).fill("Password123!!");
  await pws.nth(1).fill("Password123!!");
  await fill('input[type="tel"]', "7135550100");
  await fill("#signup-dob", "1990-05-05");
  await page.locator("button", { hasText: /Continue/ }).last().click();
  const box = page.locator('[role="document"]');
  await box.evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll")); });
  const accept = page.locator("button[aria-disabled]").first();
  await expect(accept).toHaveAttribute("aria-disabled", "false");
  /* Tap the checkbox itself: on a narrow iPhone screen the middle of the row is
     the "Terms of Service" link, which opens the terms instead. */
  await accept.locator("> span").first().click();
  const resp = page.locator("button", { hasText: /check vendors/i }).first();
  if (await resp.count()) { await resp.scrollIntoViewIfNeeded(); await resp.click(); }
  await page.waitForTimeout(400);   /* the fake Turnstile hands over its token */
  const create = page.locator("button", { hasText: /Create account/ }).last();
  await create.scrollIntoViewIfNeeded();
  await create.click();
  await expect(page.getByText(/shown up in a data breach on another site/).first()).toBeVisible();
  await expect(page.getByText(/known to be weak/)).toHaveCount(0);
});
