/* ─── AFTER A DEPLOY: TABS STILL ON THE OLD VERSION ─────────────────────────
   Every deploy renames the code files (VendorDashboard-<hash>.js,
   AdminPanel-<hash>.js, ...). A tab opened before the deploy still asks for
   the old names, which no longer exist on the server, so opening a dashboard
   fails with "Failed to fetch dynamically imported module". That is what the
   error alerts of 7 Oct 2026 were: a dashboard opened 2-25 minutes after a
   deploy, from a tab loaded before it.

   The fix is to reload the page once, which picks up the new version. Two
   guards keep that safe:
   - at most one automatic reload every 30 seconds, so a file that is really
     missing cannot put the page in a reload loop (the error then shows and is
     reported as before);
   - no reload when the browser won't let us remember that we reloaded
     (storage blocked), for the same reason. */
import { lazy } from "react";

const KEY = "pluj_reloaded_for_update";
const GAP_MS = 30000;

export function isStaleChunkError(err) {
  const m = String((err && (err.message || err)) || "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk \S+ failed/i.test(m);
}

/* Reload to get the new version, unless we just did. `before` runs first
   (e.g. to remember which panel to reopen). Returns true if reloading. */
export function reloadForUpdate(before) {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < GAP_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  try { if (before) before(); } catch { /* best effort */ }
  window.location.reload();
  return true;
}

/* React.lazy that recovers from a deploy instead of showing an error. */
export function lazyWithReload(load, before) {
  return lazy(() => load().catch(err => {
    if (isStaleChunkError(err) && reloadForUpdate(before)) {
      return new Promise(() => {});            // the page is reloading; never settle
    }
    throw err;
  }));
}
