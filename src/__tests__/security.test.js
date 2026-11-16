/* @vitest-environment jsdom */

/* ─── SECURITY CHECKS (15 Nov 2026) ─────────────────────────────────────────
   The photo check that runs before every upload, and the scrubbing that keeps
   secrets out of the error log.
────────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import { sniffImageType } from "../PlujMarketplace.jsx";
import { scrub, scrubUrl } from "../../api/log-error.js";

const bytes = (...b) => new Uint8Array(b);

describe("sniffImageType: the bytes decide, not the name", () => {
  it("knows JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffImageType(bytes(0xFF, 0xD8, 0xFF, 0xE0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))).toBe("image/png");
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });
  it("refuses anything else, whatever it is called", () => {
    const text = (t) => Uint8Array.from(t, (c) => c.charCodeAt(0));
    expect(sniffImageType(text("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImageType(text("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageType(text("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(bytes(0x4D, 0x5A, 0x90, 0x00))).toBeNull();      /* a Windows program */
    expect(sniffImageType(bytes(0x50, 0x4B, 0x03, 0x04))).toBeNull();      /* a zip */
    expect(sniffImageType(bytes())).toBeNull();
    expect(sniffImageType(null)).toBeNull();
  });
});

describe("error log scrubbing", () => {
  it("removes tokens, keys and email addresses", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
    const out = scrub(`token ${jwt} sk_live_abcdefgh12345678 whsec_abcdefgh1234 ana@example.com ?refresh_token=xyz&x=1 Bearer abcdefghijklmnopqrstuv`);
    expect(out).not.toContain(jwt);
    expect(out).not.toContain("sk_live_abcdefgh12345678");
    expect(out).not.toContain("whsec_abcdefgh1234");
    expect(out).not.toContain("ana@example.com");
    expect(out).not.toContain("xyz");
    expect(out).not.toContain("abcdefghijklmnopqrstuv");
  });
  it("keeps only the page address, not its query or hash", () => {
    expect(scrubUrl("https://www.pluj.us/build?token_hash=abc#access_token=def")).toBe("https://www.pluj.us/build");
  });
});
