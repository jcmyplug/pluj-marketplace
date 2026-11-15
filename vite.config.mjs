import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

/* The security headers Vercel sends on every page (vercel.json), applied to
   `vite preview` too, so the browser checks in CI run under the same Content
   Security Policy as the live site (security item 12, 15 Nov 2026). A policy
   that blocks something the app needs then fails CI instead of production.
   Two are left out because they only make sense on https: HSTS, and the
   upgrade-insecure-requests directive, which would rewrite the local
   http://localhost asset URLs to https and break the preview. */
function siteHeaders() {
  const cfg = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8"));
  const rule = (cfg.headers || []).find((h) => h.source === "/(.*)");
  const out = {};
  for (const h of (rule ? rule.headers : [])) {
    if (h.key === "Strict-Transport-Security") continue;
    out[h.key] = h.key === "Content-Security-Policy"
      ? h.value.replace(/;\s*upgrade-insecure-requests/, "")
      : h.value;
  }
  return out;
}

/* ─── VITE CONFIG ───────────────────────────────────────────────────────────
   Replaces Create React App, which the React team deprecated in February 2025
   and which has had no release since react-scripts 5.0.1. See
   DEPENDENCY-AUDIT.md for why that mattered more than the advisory noise.

   Two settings below are deliberately NOT the Vite defaults, to keep the blast
   radius of this migration small:

     outDir: "build"     Vite defaults to "dist". Vercel and vercel.json are
                         already pointed at "build", so keeping the name means
                         the deploy config does not have to change in lockstep.

     assetsDir: "static" Vite defaults to "assets". vercel.json caches
                         /static/(.*) as immutable for a year, and the CSP is
                         written against it. Renaming the folder would silently
                         drop that cache header — the kind of regression that
                         does not fail a build and does not show up until the
                         bill or the Lighthouse score moves.
────────────────────────────────────────────────────────────────────────────── */
export default defineConfig(function (config) {
  const mode = config.mode;

  /* Third argument "" means: load every var, not just VITE_-prefixed ones.
     The app predates Vite and still reads process.env.REACT_APP_*, so those
     names are substituted at build time below rather than renamed across the
     source. Vercel already holds them under these names. */
  const env = loadEnv(mode, process.cwd(), "");

  const passthrough = [
    "REACT_APP_SUPABASE_URL",
    "REACT_APP_SUPABASE_ANON_KEY",
    "REACT_APP_GOOGLE_MAPS_KEY",
    /* REACT_APP_ADMIN_SETUP_KEY removed 30 Sep 2026: anything listed here is
       baked into public JavaScript, so it could never have been a secret. */
    /* Cloudflare Turnstile site key. Public by design — it identifies the
       widget, it does not authorise anything. The secret key never comes near
       this bundle: it lives in Supabase Auth, which is what actually verifies
       the token. Empty until set, and the app treats empty as "not enabled". */
    "REACT_APP_TURNSTILE_SITE_KEY",
  ];

  /* Every reference has to be defined. Vite does not ship a process shim, so
     one undefined process.env.X left in the bundle is a ReferenceError on the
     first line that touches it, not a quiet undefined. */
  const define = { "process.env.NODE_ENV": JSON.stringify(mode) };
  for (const key of passthrough) {
    define["process.env." + key] = JSON.stringify(env[key] || "");
  }

  return {
    plugins: [react()],
    define: define,
    build: {
      outDir: "build",
      assetsDir: "static",
      sourcemap: false,
      /* One very large component in one chunk. Splitting it for real means
         extracting the vendor dashboard and admin panel into their own modules
         so they can be loaded on demand — most visitors never open either.
         That is a refactor with its own deploy, not a config change, and it is
         deliberately not done here. Until then the warning is accurate and
         there is nothing to learn from it on every build. */
      chunkSizeWarningLimit: 2000,

      rollupOptions: {
        output: {
          /* ─── CACHE SPLIT (checklist item 6, part one) ──────────────────────
             React and react-dom go in their own chunk.

             BE CLEAR ABOUT WHAT THIS DOES AND DOES NOT DO. It does not make the
             first visit smaller — a new visitor still downloads the same bytes,
             now in two files instead of one. What it changes is the SECOND
             visit, and every visit after a deploy.

             Assets here are content-hashed and cached immutably for a year by
             vercel.json. One chunk means one hash: change a line of app code and
             the hash changes, so a returning visitor re-downloads React too,
             even though React did not change. React and react-dom are roughly
             140KB of the bundle and they change a few times a year, while app
             code changes several times a day. Separating them means a deploy
             re-downloads only the part that actually moved.

             Everything else stays in the main chunk on purpose. There are only
             three direct dependencies (see DEPENDENCY-AUDIT.md), so there is no
             third "vendor" bundle worth carving out, and inventing one would
             add a request for no benefit.

             Matching by path rather than the shorter `{ react: ["react",
             "react-dom"] }` form on purpose. That form names package ENTRY
             points, which misses react-dom/client and react/jsx-runtime — both
             of which this app uses — and, more importantly, misses `scheduler`,
             which react-dom depends on. Leaving scheduler in the app chunk is
             the known way to get a circular import between the two chunks and a
             blank page that the build reports as successful. */
          manualChunks(id) {
            if (id.includes("node_modules/react-dom/") ||
                id.includes("node_modules/react/") ||
                id.includes("node_modules/scheduler/")) {
              return "react";
            }
            return undefined;   // everything else: let Rollup decide
          },
        },
      },
    },
    server: { port: 3000 },
    preview: { port: 3000, headers: siteHeaders() },
  };
});
