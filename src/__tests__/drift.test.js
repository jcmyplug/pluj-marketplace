/* ─── THINGS THAT MUST AGREE ACROSS FILES ───────────────────────────────────
   31 Oct 2026: the site sent three analytics events the database's check
   constraint had never listed, and every one was refused and lost without
   anyone noticing. These tests compare the two sides as text, so the next
   mismatch fails here instead of in production.
────────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

describe("analytics events", () => {
  it("every event the site sends is allowed by app_events_known_event", () => {
    const src = ["src/PlujMarketplace.jsx", ...readdirSync(join(root, "src/dashboards")).map((f) => "src/dashboards/" + f)]
      .map(read).join("\n");
    const sent = [...new Set([...src.matchAll(/track\("([a-z_]+)"/g)].map((m) => m[1]))].sort();
    /* The newest SQL file that (re)defines the constraint is the truth. */
    const files = readdirSync(join(root, "sql")).filter((f) => f.endsWith(".sql")).sort();
    let allowed = null;
    for (const f of files) {
      const m = [...read("sql/" + f).matchAll(/constraint app_events_known_event check \(event = any \(array\[([^\]]+)\]/g)].pop();
      if (m) allowed = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    }
    expect(allowed, "no SQL file defines app_events_known_event").not.toBeNull();
    expect(sent.filter((e) => !allowed.includes(e))).toEqual([]);
  });
});

describe("Spanish dictionary", () => {
  const dict = JSON.parse(read("src/i18n-es.json"));
  it("templates keep their placeholders", () => {
    const bad = Object.entries(dict.templates).filter(([en, es]) => {
      const a = new Set([...en.matchAll(/\{#?(\d+)\}/g)].map((m) => m[1]));
      const b = new Set([...es.matchAll(/\{(\d+)\}/g)].map((m) => m[1]));
      return a.size !== b.size || [...a].some((x) => !b.has(x));
    });
    expect(bad).toEqual([]);
  });
  it("no entry is empty or left in English", () => {
    const bad = Object.entries(dict.exact).filter(([en, es]) => !es.trim()
      || (en.length > 25 && es === en && !/PLUJ|Stripe|Instagram|@|http/.test(en)));
    expect(bad).toEqual([]);
  });
});
