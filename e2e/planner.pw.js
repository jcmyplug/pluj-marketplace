/* "A PLUJ planner builds it" in Build My Event, and the service icons
   (23 Nov 2026). Fake backend as everywhere else (e2e/mock.js). */
import { test, expect } from "playwright/test";
import { mockBackend, listings, VERIFIED, settle, watchErrors, emojiLeftovers, sidewaysOverflow } from "./mock.js";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub, exp) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", exp })}.sig`;
const PROFILE = { id: "u1", role: "user", status: "active", full_name: "Ana Host", display_name: "Ana",
                  created_at: "2026-10-01T00:00:00Z" };
const DETAILS = "Garden wedding for 150, dinner and dancing. We have no venue yet.";

async function noSessionApi(page) {
  await page.route("**/api/**", (r) => r.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
}

test("logged out: choose the PLUJ planner, fill it in, and what was typed is kept for after logging in", async ({ page }) => {
  const errors = watchErrors(page);
  await mockBackend(page, { services: listings(6, VERIFIED, { category: "places" }) });
  await noSessionApi(page);
  await page.goto("/build");
  await page.getByTestId("build-mode-planner").click();
  await expect(page.getByTestId("build-mode-planner")).toHaveAttribute("aria-checked", "true");

  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "150", exact: true }).click();
  await page.locator("button:has-text('›')").first().click();
  await page.locator("button:not([disabled])", { hasText: /^15$/ }).first().click();
  await page.getByRole("button", { name: "6:00 PM", exact: true }).first().click();
  await page.getByRole("button", { name: "11:00 PM", exact: true }).last().click();
  await page.getByTestId("build-continue").click();

  const send = page.getByTestId("planner-send");
  await expect(page.getByTestId("planner-form")).toBeVisible();
  await expect(send).toHaveText(/Choose the kind of event/);
  await page.getByRole("button", { name: /Wedding$/ }).first().click();
  await page.getByRole("button", { name: "$25,000", exact: true }).click();
  await page.locator("#plan-about").fill(DETAILS);
  await page.getByRole("button", { name: /Text me/ }).click();
  await expect(send).toHaveText(/Enter your phone number/);
  await page.getByLabel("Phone number").fill("(713) 555-0100");
  await expect(page.getByText("About $167 per guest.")).toBeVisible();
  await expect(send).toHaveText(/Log in to send/);

  await send.click();
  await expect(page.locator("input[type=password]").first()).toBeVisible();
  const draft = await page.evaluate(() => localStorage.getItem("pluj_plan_draft"));
  expect(draft).toContain("Garden wedding");
  expect(await emojiLeftovers(page)).toEqual([]);
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("signed in: the request is sent with every detail, and shows in My Requests", async ({ page }) => {
  const errors = watchErrors(page);
  const tok = jwt("u1", Math.floor(Date.now() / 1000) + 3600);
  let sent = null;
  await mockBackend(page);
  await noSessionApi(page);
  await page.route("**/rest/v1/**", (route) => {
    const url = route.request().url();
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (url.includes("/rpc/request_event_planner")) { sent = route.request().postDataJSON(); return json({ id: "p1", status: "new" }); }
    if (url.includes("/rpc/my_planner_requests")) return json(sent ? [{ id: "p1", event_type: "Wedding", city: sent.p_city,
      event_date: sent.p_event_date, start_time: sent.p_start_time, end_time: sent.p_end_time, guests: sent.p_guests,
      budget: sent.p_budget, status: "new", contact: sent.p_contact }] : []);
    if (url.includes("/profiles")) return json(PROFILE);
    return route.fallback();
  });
  await page.route("**/auth/v1/user**", (r) => r.fulfill({ status: 200, contentType: "application/json",
                                                            body: JSON.stringify({ id: "u1", email: "ana@example.com" }) }));
  await page.addInitScript(([a, d]) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("pluj_session", JSON.stringify({ access_token: a, refresh_token: "r1", user: { id: "u1" } }));
    localStorage.setItem("pluj_plan_draft", d);
    sessionStorage.setItem("seeded", "1");
  }, [tok, JSON.stringify({ city: "Houston", date: "2027-01-15", endDate: "", start: "18:00", end: "23:00", guests: "150",
       eventType: "Wedding", otherType: "", budget: "25000", details: DETAILS, contact: "text", phone: "(713) 555-0100",
       savedAt: Date.now() })]);

  await page.goto("/build");
  const send = page.getByTestId("planner-send");
  await expect(send).toHaveText(/Send to a PLUJ planner/);
  await send.click();
  await expect(page.getByTestId("planner-sent")).toBeVisible();
  expect(sent).toMatchObject({ p_event_type: "Wedding", p_city: "Houston", p_event_date: "2027-01-15", p_start_time: "18:00",
                               p_end_time: "23:00", p_guests: 150, p_budget: 25000, p_details: DETAILS, p_contact: "text",
                               p_phone: "(713) 555-0100", p_lang: "en" });
  expect(await page.evaluate(() => localStorage.getItem("pluj_plan_draft"))).toBeNull();
  await page.getByRole("button", { name: "See My Requests" }).click();
  await expect(page.getByTestId("planner-mine")).toContainText("Wedding");
  expect(errors).toEqual([]);
});

test("every service card and service pill has its icon", async ({ page }) => {
  const errors = watchErrors(page);
  await mockBackend(page);
  await noSessionApi(page);
  for (const cat of ["places", "food", "music", "rentals", "kids"]) {
    await page.goto("/c/" + cat);
    await settle(page, 400);
    const cards = page.locator(".dir-grid.sub button");
    await expect(cards.first()).toBeVisible();
    expect(await page.locator(".dir-grid.sub button .ic svg").count()).toBe(await cards.count());
  }
  await page.locator(".dir-grid.sub button").first().click();
  const pills = page.locator('[role="group"].pills.sm button');
  await expect(pills.first()).toBeVisible();
  expect(await page.locator('[role="group"].pills.sm button svg').count()).toBe(await pills.count());
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
