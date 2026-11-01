/* Browser checks (checklist item 30). `npx playwright test`.

   CI builds the site, serves the production build with `vite preview`, and
   runs every e2e/*.pw.js file against it in Chromium with a fake backend
   (e2e/mock.js). The files end in .pw.js, not .test.js, so vitest does not
   try to run them as unit tests.

   To run against a server you already have running, set E2E_BASE_URL. */
import { defineConfig, devices } from "playwright/test";

const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.pw\.js$/,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  /* One retry in CI so a slow runner does not block a deploy; a check that
     needed it is reported as flaky in the log, so it is not silent. */
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: external || "http://localhost:4173",
    trace: "retain-on-failure",
  },
  webServer: external ? undefined : {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
