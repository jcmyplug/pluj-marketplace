import { getLang, setLang, onLangChange } from "./i18n";
import React, { useState, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
/* ══════════════════════════════════════════════════════════════════════════════
   PLUJ MARKETPLACE
   Before opening this file, replace these two values in the SUPABASE CLIENT
   section below (~line 800):

   SUPABASE_URL  = your Project URL from Supabase → Settings → API
   SUPABASE_ANON = your anon public key from Supabase → Settings → API Keys
   ══════════════════════════════════════════════════════════════════════════════ */

/* ─── TWEMOJI ────────────────────────────────────────────────────────────────
   Renders any emoji as a crisp Twemoji PNG — consistent across every platform.
   CDN: cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/ (GitHub path).
   Strips fe0f variation selectors — Twemoji filenames don't include them.
   Falls back to the original character if the image fails to load.
────────────────────────────────────────────────────────────────────────────── */
function toTwemojiCp(emoji) {
  const r = []; let c, p, i = 0;
  while (i < emoji.length) {
    c = emoji.charCodeAt(i++);
    if (p) {
      r.push((0x10000 + ((p - 0xD800) << 10) + (c - 0xDC00)).toString(16));
      p = 0;
    } else if (c >= 0xD800 && c <= 0xDBFF) {
      p = c;
    } else {
      r.push(c.toString(16));
    }
  }
  // Strip variation selector fe0f — not used in Twemoji file names
  return r.filter(h => h !== "fe0f").join("-");
}

function Emoji({ e, size = 20, style: s = {} }) {
  const [failed, setFailed] = useState(false);
  const cp  = toTwemojiCp(e);
  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png`;
  if (failed) {
    // Graceful fallback: render the original system emoji
    return (
      <span aria-label={e} style={{ fontSize: size * 0.8, lineHeight: 1,
                                    display: "inline-block", verticalAlign: "middle",
                                    flexShrink: 0, ...s }}>{e}</span>
    );
  }
  return (
    /* Every emoji on the page is its own network request to the Twemoji CDN,
       and there are roughly seventy of them. Left at default priority they all
       start immediately and compete with the hero image, the listing photos and
       the JS bundle for a phone's handful of connections — decoration racing
       the actual content.

       `lazy` keeps the ones below the fold from being fetched until they are
       scrolled near, and `low` tells the browser these can wait behind anything
       that matters. Both degrade to a normal fetch on browsers that ignore
       them, and the existing onError fallback to the system emoji is unchanged. */
    <img src={url} alt={e} draggable={false} onError={() => setFailed(true)}
      loading="lazy" decoding="async" fetchPriority="low"
      style={{ width: size, height: size, display: "inline-block", verticalAlign: "middle",
               objectFit: "contain", flexShrink: 0, ...s }} />
  );
}

/* ─── PLUJ LOGO MARK (real brand asset — transparent PNG) ────────────────────
   Source: the official PLUJ chain-link + wordmark JPEG, white-bg removed.
   light=true  → CSS filter makes the black logo white (hero/footer/dark nav)
   light=false → shown as-is black (solid white nav)
   Usage: <PlujMark size={32} light={navOnHero} />  (size = height in px)
────────────────────────────────────────────────────────────────────────────── */

/* The mark is now drawn, not downloaded.

   It used to be a ~50,000-character base64 PNG assigned to PLUJ_LOGO_PNG above
   and inlined straight into the JavaScript bundle — roughly 50KB that had to
   arrive and be parsed before ANY script could run, on every visit, on the
   critical path, and not separately cacheable. It was the single largest
   first-paint cost on the site and it bought a picture of two words.

   This is a few hundred bytes, stays sharp at any size and on any screen
   density, and recolours by inheriting `color` instead of the old
   brightness(0)+invert(1) filter trick, which only ever worked because the
   artwork happened to be pure black.

   PLUJ_LOGO_PNG is now referenced by nothing. The production build's dead-code
   elimination should drop it; if you want it gone from source too, delete that
   one line by hand — it is too long to edit safely by search-and-replace. */
/* The PLUJ logo (Oct 2026): a P built from a dot, a bowl and a half moon,
   with the "Pluj" wordmark in the brand lettering (outlined in the official
   files, Desktop/Pluj/PLUJ LOGOS/LOGO-02.svg, whose paths these are). Drawn
   in currentColor so it takes any colour and stays crisp at any size.
     variant "horizontal" (default): mark + wordmark side by side, for bars
     variant "mark": the mark alone (icons, small spaces)
     variant "stacked": the original lockup, wordmark tucked under the bowl
     variant "word": the wordmark alone
   size = height in px. */
const LOGO_DOT = { cx: 243.52, cy: 311.38, rx: 32.3, ry: 31.47 };
const LOGO_P = [
  "M366.27,251.28h-75.96v90.11c25.96,0,48.48,14.59,59.39,35.79h16.57c35.68,0,64.44-28.18,64.44-62.95h0c0-34.76-28.76-62.95-64.44-62.95Z",
  "M350.68,406.09c0-32.4-27.08-58.76-60.37-58.76v117.52c33.29,0,60.37-26.36,60.37-58.76Z",
];
const LOGO_WORD = [
  "M418.43,419.14c0,10.68-6.51,16.39-18.58,16.39h-16.68v16.97h-11.41v-49.75h28.09c12.07,0,18.58,5.71,18.58,16.39ZM406.72,419.14c0-4.54-2.56-6.58-8.19-6.58h-15.36v13.17h15.36c5.63,0,8.19-2.05,8.19-6.58Z",
  "M426.99,400.56h10.97v51.95h-10.97v-51.95Z",
  "M486.47,415.48v37.02h-10.97v-6.58c-3.66,4.98-8.34,7.46-14.19,7.46-8.41,0-13.32-5.12-13.32-13.75v-24.14h10.97v21.88c0,4.68,2.27,6.95,6.8,6.95,3.88,0,7.17-1.68,9.73-4.98v-23.85h10.97Z",
  "M489.98,466.48l.81-8.63c.95.29,1.76.37,2.49.37,2.78,0,3.88-1.17,3.88-4.17v-38.56h10.97v40.02c0,7.97-3.88,11.78-12.14,11.78-2.05,0-3.88-.22-6-.81ZM496.5,403.78c0-3.44,2.49-5.85,6.15-5.85s6.14,2.41,6.14,5.85-2.49,5.85-6.14,5.85-6.15-2.41-6.15-5.85Z",
];
export function PlujMark({ size = 32, light = false, variant = "horizontal", color }) {
  const fill = color || (light ? "#FFFFFF" : "#000000");
  const s = 1.6;                                   // wordmark scale in the horizontal lockup
  const layouts = {
    mark:       { vb: [211.2, 251.28, 219.5, 213.6], mark: true,  word: null },
    stacked:    { vb: [211.2, 251.28, 297.6, 215.6], mark: true,  word: "" },
    word:       { vb: [371.7, 397.9, 137.1, 69.0],   mark: false, word: "" },
    horizontal: { vb: [211.2, 251.28, 468.0, 213.6], mark: true,
                  word: `translate(${(460 - 371.76 * s).toFixed(2)},${(358 - 427.6 * s).toFixed(2)}) scale(${s})` },
  };
  const L = layouts[variant] || layouts.horizontal;
  const [, , w, h] = L.vb;
  return (
    <svg role="img" aria-label="PLUJ" height={size} width={Math.round(size * w / h)} viewBox={L.vb.join(" ")}
      style={{ display:"block", flexShrink:0, color: fill, transition:"color 300ms ease", overflow:"visible" }}>
      <g fill="currentColor">
        {L.mark && <ellipse {...LOGO_DOT} />}
        {L.mark && LOGO_P.map((d, i) => <path key={i} d={d} />)}
        {L.word !== null && <g transform={L.word || undefined}>{LOGO_WORD.map((d, i) => <path key={i} d={d} />)}</g>}
      </g>
    </svg>
  );
}

/* ─── GLOBAL STYLES ─────────────────────────────────────────────────────────── */
/* ─── CORS & ADMIN CONFIGURATION ─────────────────────────────────────────────
   In a traditional server deployment, CORS is enforced via HTTP response headers
   (Access-Control-Allow-Origin, etc.). This is a browser-only SPA with no server,
   so we implement an equivalent app-layer origin guard that hard-blocks any domain
   not in the allowlist below. For production, pair this with real HTTP CORS headers
   on your backend/CDN.

   ADMIN SETUP KEY — required to register an administrator account.
   CHANGE THIS before deploying. In production, move it to a server-side env variable.
────────────────────────────────────────────────────────────────────────────── */
export const CORS_CONFIG = Object.freeze({
  /*
   * Allowed origins — strings are exact matches, RegExp objects are tested with .test().
   * The app will HARD BLOCK any origin not on this list.
   *
   * TO ADD YOUR DOMAIN: uncomment and edit the production lines below.
   */
  allowedOrigins: [
    /^https?:\/\/.*\.claude\.ai$/,      // Claude artifact preview — subdomains
    /^https?:\/\/claude\.ai$/,          // Claude root domain
    /^https?:\/\/.*\.anthropic\.com$/,  // Anthropic CDN / infra
    /^https?:\/\/anthropic\.com$/,
    "http://localhost:3000",             // Create React App dev server
    "http://localhost:5173",             // Vite dev server
    "http://localhost:4173",             // Vite preview
    "null",                              // sandboxed iframe (Claude artifact sandbox)
    "",                                  // empty origin fallback
    // ─── PRODUCTION ─────────────────────────────────────────────────────────────
    "https://pluj.us",
    "https://www.pluj.us",
    /^https?:\/\/.*\.vercel\.app$/,      // Vercel preview deployments
  ],

  /*
   * Admin setup key — the password used to register an administrator account.
   * Only people with this key can create admin accounts.
   * IMPORTANT: Change this value before going live.
   */
  /* adminSetupKey removed 30 Sep 2026. It was a "secret" shipped inside the
     public JavaScript bundle, so anyone could read it, and it guarded an
     Admin option on the public signup form. The database never honoured it -
     handle_new_user turns any requested role other than vendor into user, and
     admin rights live in admin_users, which no client can write - but a
     visible Admin button with a password box next to it is an invitation to
     try. Admins are added in Supabase by the owner, never through the site. */
});

/* Returns true if the given origin is on the allowlist */
export function isOriginAllowed(origin) {
  /* Treat missing / empty / "null" string all as the sandboxed-iframe case */
  const o = (!origin || origin === "null") ? "null" : origin;
  return CORS_CONFIG.allowedOrigins.some(rule =>
    typeof rule === "string" ? rule === o || rule === origin : rule.test(o)
  );
}

/* ─── ORIGIN-BLOCKED SCREEN ────────────────────────────────────────────────── */
function OriginBlockedScreen() {
  const origin = (typeof window !== "undefined" ? window.location.origin : "") || "null";
  return (
    <div style={{ position:"fixed", inset:0, background:"#0A0A0A", zIndex:9999,
                  display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#111", borderRadius:22, maxWidth:460, width:"100%",
                    padding:"44px 36px", textAlign:"center",
                    border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:52, marginBottom:20, lineHeight:1 }}>🚫</div>
        <h1 style={{ fontFamily:"var(--display)", fontSize:26, fontWeight:800,
                     color:"#fff", margin:"0 0 10px" }}>
          Access Denied
        </h1>
        <p style={{ fontSize:14, color:"rgba(255,255,255,0.55)", lineHeight:1.75, margin:"0 0 24px" }}>
          This application is not authorized to run on this domain.
          <br />Only approved origins may load PLUJ.
        </p>
        <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:12, padding:"14px 18px",
                      textAlign:"left", marginBottom:20, border:"1px solid rgba(255,255,255,0.1)" }}>
          <p style={{ margin:"0 0 6px", fontSize:9, fontWeight:800, color:"rgba(255,255,255,0.3)",
                      textTransform:"uppercase", letterSpacing:"0.1em" }}>
            Blocked origin
          </p>
          <p style={{ margin:0, fontFamily:"monospace", fontSize:13, fontWeight:700,
                      color:"#EF4444", letterSpacing:"0.03em" }}>
            {origin}
          </p>
        </div>
        <p style={{ fontSize:11, color:"rgba(255,255,255,0.3)", lineHeight:1.7, margin:0 }}>
          If you are the administrator, add this origin to{" "}
          <code style={{ fontFamily:"monospace", color:"rgba(255,255,255,0.5)" }}>
            CORS_CONFIG.allowedOrigins
          </code>{" "}
          in the source file.
        </p>
      </div>
    </div>
  );
}

/* ─── SECURITY HEADERS ───────────────────────────────────────────────────────
   THREE ENFORCEMENT LAYERS:
   ① <meta> tags   — injected into document.head at runtime (CSP partial, referrer)
   ② JavaScript    — iframe-bust, URL sanitizer
   ③ HTTP headers  — must be set on your web server (see Admin Panel → Security Headers)

   NOTE: frame-ancestors, HSTS, X-Content-Type-Options, Permissions-Policy
   and Cache-Control can ONLY be enforced via HTTP response headers on the server.
────────────────────────────────────────────────────────────────────────────── */
export const SECURITY_HEADERS = Object.freeze({
  /* Applied as <meta> tags — partial enforcement, no frame-ancestors support */
  meta: {
    csp: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' https://images.unsplash.com https://cdn.jsdelivr.net https://*.supabase.co https://maps.gstatic.com https://*.googleapis.com data: blob:",
      "connect-src 'self' https://api.anthropic.com https://*.supabase.co wss://*.supabase.co https://api.resend.com https://photon.komoot.io https://nominatim.openstreetmap.org https://maps.googleapis.com https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
    referrerPolicy: "strict-origin-when-cross-origin",
    xUaCompatible:  "IE=edge",
  },

  /* Full HTTP response headers — configure on your web server / CDN */
  server: {
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' https://images.unsplash.com https://cdn.jsdelivr.net https://*.supabase.co https://maps.gstatic.com https://*.googleapis.com data: blob:",
      "connect-src 'self' https://api.anthropic.com https://*.supabase.co wss://*.supabase.co https://api.resend.com https://photon.komoot.io https://nominatim.openstreetmap.org https://maps.googleapis.com https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "frame-ancestors 'self' https://claude.ai https://www.claude.ai",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
    "Strict-Transport-Security":   "max-age=63072000; includeSubDomains; preload",
    "X-Frame-Options":             "SAMEORIGIN",
    "X-Content-Type-Options":      "nosniff",
    "X-XSS-Protection":            "1; mode=block",
    "Referrer-Policy":             "strict-origin-when-cross-origin",
    "Permissions-Policy":          "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    "Cache-Control":               "no-store, max-age=0",
    "Cross-Origin-Opener-Policy":  "same-origin",
    "Cross-Origin-Resource-Policy":"same-origin",
  },
});

/* ─── SECURITY META HEADERS INJECTOR ─────────────────────────────────────────
   Injects meta-tag-enforceable headers into document.head as early as possible.
   Provides partial CSP and referrer control — server headers are still required.
────────────────────────────────────────────────────────────────────────────── */
function SecurityMetaHeaders() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const H = document.head;
    const set = (sel, build) => { if (!document.querySelector(sel)) H.prepend(build()); };

    /* ① Content-Security-Policy (partial — frame-ancestors ignored in meta tags) */
    set('meta[http-equiv="Content-Security-Policy"]', () => {
      const m = document.createElement("meta");
      m.httpEquiv = "Content-Security-Policy";
      m.content   = SECURITY_HEADERS.meta.csp;
      return m;
    });

    /* ② Referrer-Policy */
    set('meta[name="referrer"]', () => {
      const m = document.createElement("meta");
      m.name    = "referrer";
      m.content = SECURITY_HEADERS.meta.referrerPolicy;
      return m;
    });

    /* ③ X-UA-Compatible — force modern rendering engine */
    set('meta[http-equiv="X-UA-Compatible"]', () => {
      const m = document.createElement("meta");
      m.httpEquiv = "X-UA-Compatible";
      m.content   = SECURITY_HEADERS.meta.xUaCompatible;
      return m;
    });

    console.info("[Security] Meta headers applied ✓ (CSP + referrer + X-UA-Compatible)");
  }, []);

  return null; // no visible output — side-effects only
}


/* ══════════════════════════════════════════════════════════════════════════════
   PLUJ GLOBAL MARKET SYSTEM
   Designed for expansion: city → state → country → world.
   To launch in a new city, add an entry to MARKETS and set vendor cityKeys.
   To launch in a new country, add a COUNTRY entry with currency + locale.
   ══════════════════════════════════════════════════════════════════════════════ */

const COUNTRIES = Object.freeze({
  US: { name:"United States", currency:"USD", symbol:"$", locale:"en-US", flag:"🇺🇸" },
  MX: { name:"Mexico",        currency:"MXN", symbol:"$", locale:"es-MX", flag:"🇲🇽" },
  CA: { name:"Canada",        currency:"CAD", symbol:"$", locale:"en-CA", flag:"🇨🇦" },
  GB: { name:"United Kingdom",currency:"GBP", symbol:"£", locale:"en-GB", flag:"🇬🇧" },
  // Add more countries as PLUJ expands globally
});

const STATES_US = Object.freeze({
  TX: "Texas", CA: "California", NY: "New York", FL: "Florida",
  IL: "Illinois", GA: "Georgia", AZ: "Arizona", CO: "Colorado",
  // Add more as PLUJ expands across the US
});

/* Geocoders return full state names ("Texas"); the app stores abbreviations.
   Truncating would give "TE", so map properly and fall back to the input. */
const STATE_ABBR_BY_NAME = Object.freeze({
  alabama:"AL", alaska:"AK", arizona:"AZ", arkansas:"AR", california:"CA", colorado:"CO",
  connecticut:"CT", delaware:"DE", "district of columbia":"DC", florida:"FL", georgia:"GA",
  hawaii:"HI", idaho:"ID", illinois:"IL", indiana:"IN", iowa:"IA", kansas:"KS", kentucky:"KY",
  louisiana:"LA", maine:"ME", maryland:"MD", massachusetts:"MA", michigan:"MI", minnesota:"MN",
  mississippi:"MS", missouri:"MO", montana:"MT", nebraska:"NE", nevada:"NV",
  "new hampshire":"NH", "new jersey":"NJ", "new mexico":"NM", "new york":"NY",
  "north carolina":"NC", "north dakota":"ND", ohio:"OH", oklahoma:"OK", oregon:"OR",
  pennsylvania:"PA", "rhode island":"RI", "south carolina":"SC", "south dakota":"SD",
  tennessee:"TN", texas:"TX", utah:"UT", vermont:"VT", virginia:"VA", washington:"WA",
  "west virginia":"WV", wisconsin:"WI", wyoming:"WY", "puerto rico":"PR",
});
function toStateAbbr(v) {
  const raw = String(v || "").trim();
  if (!raw) return "";
  if (raw.length === 2) return raw.toUpperCase();
  return STATE_ABBR_BY_NAME[raw.toLowerCase()] || raw.slice(0, 2).toUpperCase();
}

const MARKETS = Object.freeze([
  /* ── ACTIVE MARKETS ── */
  {
    id: "houston-tx",    city:"Houston",      state:"TX", country:"US",
    label:"Houston, TX", timezone:"America/Chicago", active: true,
    lat: 29.7604, lng: -95.3698, radius: 75,
    hero: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1600&q=80",
    tagline: "Houston's #1 event marketplace",
    stats: { vendors: 200, events: 1240, cities: 1 },
  },
  /* ── COMING SOON — Texas ── */
  {
    id: "dallas-tx",     city:"Dallas",       state:"TX", country:"US",
    label:"Dallas, TX",  timezone:"America/Chicago", active: false,
    lat: 32.7767, lng: -96.7970, radius: 60,
    hero: "https://images.unsplash.com/photo-1545096644-acad3c0e7e0d?w=1600&q=80",
  },
  {
    id: "austin-tx",     city:"Austin",       state:"TX", country:"US",
    label:"Austin, TX",  timezone:"America/Chicago", active: false,
    lat: 30.2672, lng: -97.7431, radius: 50,
    hero: "https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=1600&q=80",
  },
  {
    id: "san-antonio-tx",city:"San Antonio",  state:"TX", country:"US",
    label:"San Antonio, TX", timezone:"America/Chicago", active: false,
    lat: 29.4241, lng: -98.4936, radius: 50,
    hero: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=80",
  },
  /* ── COMING SOON — US ── */
  {
    id: "miami-fl",      city:"Miami",        state:"FL", country:"US",
    label:"Miami, FL",   timezone:"America/New_York", active: false,
    lat: 25.7617, lng: -80.1918, radius: 40,
    hero: "https://images.unsplash.com/photo-1514214246283-d427a95c5d2f?w=1600&q=80",
  },
  {
    id: "los-angeles-ca",city:"Los Angeles",  state:"CA", country:"US",
    label:"Los Angeles, CA", timezone:"America/Los_Angeles", active: false,
    lat: 34.0522, lng: -118.2437, radius: 60,
    hero: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1600&q=80",
  },
  {
    id: "new-york-ny",   city:"New York",     state:"NY", country:"US",
    label:"New York, NY",timezone:"America/New_York", active: false,
    lat: 40.7128, lng: -74.0060, radius: 30,
    hero: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1600&q=80",
  },
  /* ── COMING SOON — International ── */
  {
    id: "mexico-city-mx",city:"Mexico City",  state:"CDMX", country:"MX",
    label:"Ciudad de México", timezone:"America/Mexico_City", active: false,
    lat: 19.4326, lng: -99.1332, radius: 50,
    hero: "https://images.unsplash.com/photo-1518638150340-f706e86654de?w=1600&q=80",
  },
  {
    id: "london-gb",     city:"London",       state:"ENG", country:"GB",
    label:"London, UK",  timezone:"Europe/London", active: false,
    lat: 51.5074, lng: -0.1278, radius: 25,
    hero: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1600&q=80",
  },
]);

/* Default market on first load */
const DEFAULT_MARKET = MARKETS[0]; // Houston, TX

/* i18n scaffold — translate strings here per locale */
const I18N = Object.freeze({
  "en-US": {
    tagline:    "Book the perfect vendor. Build your entire event.",
    subtagline: "Food, music, venues, decor and rentals — your whole event, one cart.",
    bookNow:    "Book now",
    sendRequest:"Send booking request",
    addToCart:  "Add to event",
    browseAll:  "Browse all vendors",
    reviews:    "reviews",
    from:       "from",
  },
  "es-MX": {
    tagline:    "Reserva el proveedor perfecto. Construye tu evento completo.",
    subtagline: "Comida, música, producción y logística — proveedores verificados, una plataforma.",
    bookNow:    "Reservar ahora",
    sendRequest:"Enviar solicitud",
    addToCart:  "Agregar al evento",
    browseAll:  "Ver todos los proveedores",
    reviews:    "reseñas",
    from:       "desde",
  },
  // Add more locales as PLUJ expands
});

/* Format currency for a given country */
function fmtCurrency(amount, countryCode = "US") {
  const c = COUNTRIES[countryCode] || COUNTRIES.US;
  try {
    return new Intl.NumberFormat(c.locale, { style:"currency", currency:c.currency,
      minimumFractionDigits:0, maximumFractionDigits:0 }).format(amount);
  } catch { return `${c.symbol}${amount}`; }
}

export const GLOBAL_CSS = `
/* ── Type: Big Shoulders Display, a condensed poster face with the energy of
   a dance-hall or festival bill, for display; Figtree for everything you
   read, clear in English and Spanish with all the accents. ── */
@import url('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500..900&family=Figtree:wght@400..800&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --ink: #17120F; --ink-2: #4B5260; --ink-3: #6B7280;
  --line: #E7E7E9; --surface: #F6F6F7; --white: #FFFFFF;
  --accent: #D13F17; --accent-hover: #B83510; --flame: #FF5C28; --accent-soft: #FFF1EC;
  /* Celebration palette for the public pages: marigold (PLUJ orange) as a
     surface, true black type, white paper. */
  --marigold: #FF5C28; --black: #000000;
  --display: 'Big Shoulders Display', 'Figtree', system-ui, sans-serif;
  --ok: #0F7A55; --ok-soft: #E8F6EF;
  --r-sm: 10px; --r-md: 14px; --r-lg: 22px;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  /* z-index scale */
  --z-sticky: 200; --z-dropdown: 300; --z-drawer: 900; --z-modal: 1000; --z-toast: 1200;
}
html { -webkit-text-size-adjust: 100%; }
body { background: #fff; color: var(--ink); font-family: 'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif;
       -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
.pluj { font-family: 'Figtree', system-ui, sans-serif; color: var(--ink); background: #fff; min-height: 100vh;
        font-size: 15px; line-height: 1.5; }
.pluj button, .pluj input, .pluj select, .pluj textarea { font-family: 'Figtree', system-ui, sans-serif; color: inherit; }
.pluj h1, .pluj h2 { font-family: var(--display); font-weight: 800; letter-spacing: -0.005em;
        text-wrap: balance; color: var(--ink); line-height: 1.02; }
.pluj h3 { font-family: 'Figtree', system-ui, sans-serif; font-weight: 750; letter-spacing: -0.01em; text-wrap: balance; color: var(--ink); }
.pluj ::selection { background: #FF5C28; color: #000; }
.pluj p { text-wrap: pretty; }
.pluj a { color: var(--accent); }
input { outline: none; }

/* ── Visible keyboard focus everywhere ── */
.pluj button:focus-visible, .pluj a:focus-visible, .pluj [role="button"]:focus-visible,
.pluj summary:focus-visible { outline: 3px solid rgba(209,63,23,0.45); outline-offset: 2px; border-radius: 10px; }

/* ── Motion respects the visitor's setting ── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
                           transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}

/* ── Focus rings only on keyboard navigation (Uber Eats pattern) ── */
input:focus-visible { border-color: #D13F17 !important; box-shadow: 0 0 0 3px rgba(209,63,23,0.16) !important; }
input:focus:not(:focus-visible) { border-color: #E5E7EB !important; box-shadow: none !important; }
textarea:focus-visible { outline: 2px solid rgba(209,63,23,0.35) !important; outline-offset: 2px; }
textarea:focus:not(:focus-visible) { outline: none !important; }
select:focus-visible { outline: 2px solid rgba(209,63,23,0.35); outline-offset: 1px; }
select:focus:not(:focus-visible) { outline: none; }

/* ── Password show/hide eye (PasswordInput) ──
   Edge draws its own reveal button inside password boxes; hide it so there is
   only one eye. */
input::-ms-reveal, input::-ms-clear { display: none; }
.pw-eye { opacity: 0.85; transition: opacity 150ms ease, background 150ms ease; }
.pw-eye:hover { opacity: 1; background: rgba(127,127,127,0.12) !important; }
.pw-eye:focus-visible { outline: 2px solid rgba(39,110,241,0.6); outline-offset: 0; opacity: 1; }

/* ── Buttons ── */
.btn {
  transition: background 180ms var(--ease-out), color 180ms var(--ease-out),
              border-color 180ms var(--ease-out), transform 120ms var(--ease-out),
              box-shadow 180ms var(--ease-out), opacity 150ms ease;
  cursor: pointer; border: none;
}
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

/* ── Cards: inset hover tint (Uber Eats pattern — no jumpiness) ── */
.card {
  transition: box-shadow 0.22s ease;
}
.card:hover {
  box-shadow: 0 8px 28px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06),
              inset 999px 999px 0px rgba(0,0,0,0.025);
}
.card:active {
  box-shadow: inset 999px 999px 0px rgba(0,0,0,0.06);
}

.pill { transition: background 200ms cubic-bezier(0,0,1,1), color 200ms cubic-bezier(0,0,1,1), border-color 200ms cubic-bezier(0,0,1,1); cursor: pointer; }

.subcard { transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; cursor: pointer; }
.subcard:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,0.1); }

.vendor-img-wrap { overflow: hidden; }
.vendor-img { transition: transform 0.4s ease, opacity 0.3s ease; }
.vendor-img-wrap:hover .vendor-img { transform: scale(1.05); }

/* ── Nav transition: 400ms ease (Uber Eats scroll transition) ── */
.pluj-nav {
  transition: background 400ms ease, border-color 400ms ease, backdrop-filter 400ms ease;
}

/* ── Animations ── */
@keyframes fadeUp    { from { opacity:0; transform: translateY(16px); } to { opacity:1; transform: translateY(0); } }
@keyframes fadeIn    { from { opacity:0; } to { opacity:1; } }
@keyframes slideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }

/* ── Uber Eats skeleton shimmer — exact gradient ── */
@keyframes shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
.skeleton {
  background: linear-gradient(120deg, #E8E8E8 20%, #F3F3F3 28%, #E8E8E8 43%);
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}

.fade-up        { animation: fadeUp   0.38s ease both; }
.fade-in        { animation: fadeIn   0.25s ease both; }
.modal-overlay  { animation: fadeIn   0.20s ease both; }
.slide-right    { animation: slideRight 0.38s cubic-bezier(0.32, 0.72, 0, 1) both; }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #ddd; border-radius: 99px; }

/* ── Stars ── */
.star-filled { color: #F59E0B; }
.star-empty  { color: #E5E7EB; }

/* ── Glassmorphism nav ── */
.nav-glass {
  background: rgba(255,255,255,0.88) !important;
  backdrop-filter: blur(20px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
  border-bottom: 1px solid rgba(255,255,255,0.5) !important;
}

/* ── Market selector ── */
.market-pill {
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
  border-radius: 99px; padding: 4px 12px; cursor: pointer;
  transition: background 200ms ease;
}
.market-pill:hover { background: rgba(255,255,255,0.25); }

/* ── Filters bar ── */
.filter-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 600;
  border: 1.5px solid #E5E7EB; background: #fff; cursor: pointer;
  white-space: nowrap; transition: all 0.15s ease;
}
.filter-pill.active {
  background: #111; color: #fff; border-color: #111;
}
.filter-pill:hover:not(.active) { border-color: #111; }

/* ── Vendor card V2 ── */
.vcard2 {
  border-radius: 18px; overflow: hidden; background: #fff;
  border: 1px solid var(--line); cursor: pointer;
  transition: transform 260ms var(--ease-out), box-shadow 260ms var(--ease-out), border-color 260ms var(--ease-out);
  display: flex; flex-direction: column;
}
.vcard2:hover { transform: translateY(-3px); box-shadow: 0 18px 40px -18px rgba(23,18,15,0.28); border-color: #DADADD; }
.vcard2:active { transform: translateY(-1px); }

/* ── Heart / favorite button ── */
.heart-btn {
  position: absolute; top: 10px; right: 10px; z-index: 2;
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(255,255,255,0.92); backdrop-filter: blur(4px);
  border: none; cursor: pointer; display: flex; align-items: center;
  justify-content: center; font-size: 15px;
  transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1), background 0.15s ease;
}
.heart-btn:hover { transform: scale(1.18); }
.heart-btn.active { background: #FEF2F2; }

/* ── Stats ticker ── */
@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.ticker-track { animation: ticker 30s linear infinite; }
.ticker-track:hover { animation-play-state: paused; }

/* ── Budget meter fill ── */
@keyframes fillBar { from { width: 0; } to { width: var(--fill-pct); } }
.budget-bar-fill { animation: fillBar 0.6s cubic-bezier(0.34,1.56,0.64,1) both; }

/* ── "How it works" steps ── */
.step-card {
  text-align: center; padding: 28px 20px;
  background: #fff; border-radius: 20px;
  border: 1px solid #E5E7EB;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.step-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 40px rgba(0,0,0,0.09);
}

/* ── Gradient text ── */
.gradient-text { color: var(--accent); }

/* ── Recommendation chip ── */
.rec-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 99px; font-size: 11px; font-weight: 700;
  background: #FFF7ED; border: 1.5px solid rgba(255,92,40,0.2); color: #FF5C28;
  cursor: pointer; transition: all 0.15s ease; white-space: nowrap;
}
.rec-chip:hover { background: #FF5C28; color: #fff; border-color: #FF5C28; }

/* ── Availability dot ── */
.avail-dot {
  width: 7px; height: 7px; border-radius: 50%; display: inline-block;
  flex-shrink: 0;
}
.avail-dot.open     { background: #10B981; box-shadow: 0 0 0 3px #ECFDF5; }
.avail-dot.busy     { background: #F59E0B; box-shadow: 0 0 0 3px #FFFBEB; }
.avail-dot.booked   { background: #EF4444; box-shadow: 0 0 0 3px #FEF2F2; }

/* ── Map placeholder ── */
.map-placeholder {
  background: linear-gradient(135deg, #EFF6FF 0%, #E0F2FE 100%);
  border-radius: 14px; display: flex; align-items: center;
  justify-content: center; font-size: 32px;
}

/* ── Smooth page transitions ── */
.page-enter { animation: fadeUp 0.32s cubic-bezier(0.16,1,0.3,1) both; }

/* ── Home (Oct 2026 redesign) ──
   A marigold field; the artwork is the logo's own geometry (dot, bowl, half
   moon); the example event is a real ticket stub; the categories are set
   like a festival bill. Everything else stays quiet. */
.hero-field { background: var(--marigold); color: var(--black); position: relative; overflow: hidden; }
.home-hero { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); gap: 44px;
             align-items: center; max-width: 1240px; margin: 0 auto; padding: 56px 28px 72px; }
.home-hero h1 { font-size: clamp(56px, 7.2vw, 96px); line-height: 0.92; font-weight: 800; letter-spacing: -0.01em;
                color: var(--black); margin: 0; }
.home-hero .lede { font-size: 18px; line-height: 1.55; color: #000; max-width: 33em; margin: 22px 0 28px; }
.hero-search { display: grid; grid-template-columns: 1.25fr 1.15fr 1.2fr 0.85fr auto; background: #fff;
               border-radius: 16px; overflow: hidden; box-shadow: 0 2px 0 rgba(0,0,0,0.9); border: 2px solid #000; }
.hero-search > label { display: block; padding: 11px 16px 10px; border-right: 1.5px solid #E2E2E2; min-width: 0; cursor: text; }
.hero-search > label span { display: block; font-size: 12.5px; font-weight: 800; color: #000; }
.hero-search input, .hero-search select { width: 100%; border: none; outline: none; background: transparent;
               font-size: 15px; padding: 3px 0 0; color: #000; min-width: 0; }
.hero-search button.go { margin: 7px; border-radius: 11px; padding: 0 24px; background: #000; color: #fff;
               font-weight: 800; font-size: 15px; white-space: nowrap; }
.hero-search button.go:hover { background: #2b2b2b; }
.hero-alt { background: none; border: none; padding: 0; font-size: 15px; font-weight: 700; color: #000;
            text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 5px; cursor: pointer; }
.promise-row { display: flex; flex-wrap: wrap; gap: 10px 26px; margin-top: 26px; }
.promise { font-size: 14.5px; color: #000; display: inline-flex; gap: 8px; align-items: baseline; }
.promise b { font-weight: 800; }
.promise::before { content: ""; width: 9px; height: 9px; background: #000; transform: rotate(45deg) translateY(-1px); flex: 0 0 auto; }
.hero-art { position: relative; min-height: 590px; }
/* The logo's geometry: the photo sits in the bowl (flat left, round right),
   the dot floats to its left and the half moon hangs beneath. */
.hero-photo { position: absolute; right: 0; top: 0; width: 76%; height: 50%; border-radius: 0 999px 999px 0;
              overflow: hidden; background: #000; }
.hero-art .shape { position: absolute; background: #000; }
.hero-art .shape.dot { left: 0; top: 9%; width: 19%; aspect-ratio: 1; border-radius: 50%; }
.hero-art .shape.moon { left: 24%; top: 51%; width: 22%; aspect-ratio: 1 / 2; border-radius: 0 999px 999px 0; background: #fff; }
.hero-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.stamp { position: absolute; right: -14px; top: -22px; width: 118px; height: 118px; z-index: 3; }
.stamp svg { width: 100%; height: 100%; animation: spin 26s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
/* The ticket: a real stub. Notches at the tear line come from a mask, the
   barcode from stripes, the total is set in the poster face. */
.ticket { position: absolute; z-index: 2; right: 0; bottom: 0; width: min(300px, 64%);
          background: #fff; color: #000; border: 2px solid #000; border-radius: 16px; transform: rotate(-3deg);
          transition: transform 400ms var(--ease-out); padding: 0;
          -webkit-mask: radial-gradient(circle 11px at 0 66%, transparent 10.5px, #000 11px) left / 51% 100% no-repeat,
                        radial-gradient(circle 11px at 100% 66%, transparent 10.5px, #000 11px) right / 51% 100% no-repeat;
                  mask: radial-gradient(circle 11px at 0 66%, transparent 10.5px, #000 11px) left / 51% 100% no-repeat,
                        radial-gradient(circle 11px at 100% 66%, transparent 10.5px, #000 11px) right / 51% 100% no-repeat; }
.ticket:hover { transform: rotate(0deg) translateY(-4px); }
.ticket .top { padding: 16px 18px 12px; }
.ticket .tag { font-size: 12px; font-weight: 800; color: #000; }
.ticket .ex { font-size: 11.5px; font-weight: 700; color: #555; float: right; }
.ticket .ev { font-family: var(--display); font-size: 30px; font-weight: 800; line-height: 1; margin: 6px 0 10px; }
.ticket .row { display: flex; align-items: baseline; gap: 6px; font-size: 13.5px; padding: 3px 0; }
.ticket .row .lead { flex: 1; border-bottom: 1.5px dotted #B5B5B5; transform: translateY(-3px); }
.ticket .row b { font-weight: 800; white-space: nowrap; }
.ticket .tear { border-top: 2px dashed #000; margin: 0 14px; }
.ticket .bottom { padding: 12px 18px 14px; display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 8px; }
.ticket .total { font-family: var(--display); font-size: 40px; font-weight: 900; line-height: 0.9; }
.ticket .note { font-size: 12px; color: #333; margin-top: 4px; }
.ticket .ok { font-size: 12.5px; font-weight: 800; color: #000; }
.ticket .barcode { width: 64px; height: 38px; background: repeating-linear-gradient(90deg, #000 0 2px, transparent 2px 4px, #000 4px 5px, transparent 5px 8px, #000 8px 11px, transparent 11px 12px); }
/* Categories on the home page: a directory. Each category is a name and the
   services in it, under a black rule. Hover turns the whole entry black. */
.dir-head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px 40px; align-items: end; margin-bottom: 22px; }
.dir-head h2 { font-size: clamp(36px, 4.4vw, 60px); line-height: 0.95; margin: 0; color: #000; text-wrap: balance; }
.dir-head p { margin: 0; font-size: 16px; line-height: 1.5; color: #333; max-width: 46ch; justify-self: end; }
.dir-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1px; background: #DADADA; border-top: 2px solid #000; border-bottom: 1px solid #DADADA; }
.dir-grid li { background: #fff; }
.dir-grid li.wide { grid-column: 1 / -1; }
.dir-grid button { display: flex; flex-direction: column; gap: 8px; width: 100%; height: 100%; text-align: left;
                   background: #fff; border: none; padding: 22px 22px 24px; cursor: pointer; color: #000;
                   transition: background-color 160ms ease, color 160ms ease; }
.dir-name { font-family: var(--display); font-weight: 800; font-size: 30px; line-height: 1; letter-spacing: -0.005em; }
.dir-subs { font-size: 14.5px; line-height: 1.45; color: #4B5260; transition: color 160ms ease; }
.dir-subs .more { white-space: nowrap; }
.dir-grid button:hover, .dir-grid button[aria-current="true"] { background: #000; color: #fff; }
.dir-grid button:hover .dir-subs, .dir-grid button[aria-current="true"] .dir-subs { color: rgba(255,255,255,0.78); }
.dir-grid .build { background: #000; color: #fff; padding: 28px 22px; display: grid;
                  grid-template-columns: minmax(0, 0.8fr) minmax(0, 2fr); gap: 20px 40px; align-items: start; }
.dir-grid .build .dir-name { color: #fff; padding-top: 18px; }
.build-ways { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.build-ways button { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; text-align: left; cursor: pointer;
                     background: transparent; color: #fff; border: 1.5px solid rgba(255,255,255,0.32); border-radius: 6px;
                     padding: 18px 18px 18px; transition: border-color 160ms ease, background-color 160ms ease; }
.build-ways button:hover { border-color: #fff; background: rgba(255,255,255,0.06); }
.build-ways b { font-size: 18px; font-weight: 800; }
.build-ways span { font-size: 14.5px; line-height: 1.45; color: rgba(255,255,255,0.8); }
.build-ways .go { margin-top: auto; font-weight: 800; font-size: 14.5px; color: #000; background: #fff; border-radius: 999px; padding: 9px 16px; }
.build-ways button + button .go { background: transparent; color: #fff; box-shadow: inset 0 0 0 1.5px #fff; }
.dir-grid.sub { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0; background: transparent;
                border-left: 1px solid #DADADA; border-bottom: none; }
.dir-grid.sub li { border-right: 1px solid #DADADA; border-bottom: 1px solid #DADADA; }
.dir-grid.sub .dir-name { font-size: 24px; }
.dir-grid.sub button { padding: 18px 18px 20px; }
@media (max-width: 720px) {
  .dir-head { grid-template-columns: 1fr; }
  .dir-head p { justify-self: start; }
  .dir-name { font-size: 26px; }
  .dir-grid button { padding: 18px 16px 20px; }
  .dir-grid .build { grid-template-columns: 1fr; padding: 22px 16px; }
  .dir-grid .build .dir-name { padding-top: 0; }
}
.occasions { margin-top: 28px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
.occasions h3 { margin: 0; font-size: 16px; font-weight: 800; color: #000; }
.occasions .pills.sm button { font-size: 14px; padding: 8px 15px; }
/* Categories while browsing: one row of pills that scrolls sideways on phones. */
.pills { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.pills::-webkit-scrollbar { display: none; }
.pills button { flex: 0 0 auto; background: #fff; border: 1.5px solid #000; border-radius: 999px; padding: 9px 16px;
                font-size: 14px; font-weight: 700; color: #000; cursor: pointer; white-space: nowrap;
                transition: background-color 160ms ease, color 160ms ease; }
.pills button:hover { background: #F2F2F2; }
.pills button.on { background: #000; color: #fff; }
.pills.sm { flex-wrap: wrap; overflow: visible; gap: 6px; }
.pills.sm button { padding: 6px 13px; font-size: 13px; font-weight: 650; border-width: 1px; border-color: #C9C9C9; }
.pills.sm button.on { border-color: #000; }
/* How it works */
.steps3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 40px; }
.steps3 .n { font-family: var(--display); font-size: 64px; font-weight: 900; color: var(--marigold); line-height: 0.8;
             -webkit-text-stroke: 2px #000; }
.steps3 h3 { margin: 14px 0 6px; font-size: 20px; }
/* The comparison table */
.compare { border-top: 2px solid #000; }
.crow { display: grid; grid-template-columns: 0.7fr 1.15fr 1.15fr; gap: 16px; padding: 16px 0; border-bottom: 1px solid #E2E2E2; align-items: baseline; }
.crow > span:first-child { font-weight: 800; font-size: 15px; }
.crow .them { color: #6B6B6B; font-size: 16px; text-decoration: line-through; text-decoration-color: rgba(0,0,0,0.25); }
.crow .us { font-family: var(--display); font-size: clamp(22px, 2.4vw, 30px); font-weight: 800; line-height: 1.05; }
.crow.head { padding: 10px 0; }
.crow.head span { font-family: 'Figtree', system-ui, sans-serif !important; font-size: 13.5px !important; font-weight: 800 !important;
                  color: #4B5260; text-decoration: none !important; }
.crow.head .us { color: #000; }
@media (max-width: 640px) {
  .crow { grid-template-columns: 1fr 1fr; }
  .crow > span:first-child { grid-column: 1 / -1; margin-bottom: -8px; }
  .crow.head > span:first-child { display: none; }
}
/* Event recaps */
.recaps { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; }
.recap-card { display: flex; flex-direction: column; gap: 4px; text-align: left; background: none; border: none; padding: 0; cursor: pointer; color: #000; }
.recap-img { display: block; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 4px; background: #F2F2F2; margin-bottom: 6px; }
.recap-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 300ms ease; }
.recap-card:hover .recap-img img { transform: scale(1.03); }
.recap-title { font-family: var(--display); font-size: 24px; font-weight: 800; line-height: 1; }
.recap-meta, .recap-by { font-size: 13px; color: #4B5260; }
@media (prefers-reduced-motion: reduce) { .recap-card:hover .recap-img img { transform: none; } }
/* Trust badges on cards: what PLUJ checked by hand. */
.badge-chk { font-size: 11.5px; font-weight: 700; color: #000; border: 1px solid #000; border-radius: 999px; padding: 2px 8px; line-height: 1.4; }
/* The PLUJ promise: one bordered block, the promise set big. */
.promise-block { margin-top: 72px; border: 2px solid #000; border-radius: 4px; padding: 40px 40px 34px; background: #fff; }
.promise-block .kicker { margin: 0 0 12px; font-size: 15px; font-weight: 800; color: #000; }
.promise-block h2 { font-size: clamp(36px, 4.6vw, 64px); line-height: 0.95; margin: 0 0 22px; max-width: 16ch; text-wrap: balance; }
.promise-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px 40px; margin-bottom: 22px; }
.promise-cols p { margin: 0; font-size: 16px; line-height: 1.6; color: #333; max-width: 46ch; }
.promise-link { background: #000; color: #fff; border-radius: 999px; padding: 12px 20px; font-size: 14.5px; font-weight: 800; }
.promise-block .tag { font-family: var(--display); font-weight: 800; font-size: 22px; color: var(--marigold); }
@media (max-width: 640px) { .promise-block { padding: 26px 18px 22px; } }
/* Vendors: a poster block */
.vendor-band { background: #000; color: #fff; border-radius: 4px; padding: 56px 48px; display: grid;
               grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 40px; align-items: end; position: relative; overflow: hidden; }
.vendor-band h2 { color: #fff !important; font-size: clamp(44px, 6vw, 88px); line-height: 0.92; margin: 0 0 18px; }
.vendor-band .big { font-family: var(--display); font-weight: 900; font-size: clamp(64px, 8vw, 120px); line-height: 0.85; color: var(--marigold); }
.vendor-band .fact { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: baseline;
                     padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.18); font-size: 15px; color: rgba(255,255,255,0.86); }
.vendor-band .fact b { font-family: var(--display); font-size: 36px; font-weight: 800; color: #fff; min-width: 3.2ch; }
/* Footer: the wordmark, full width */
.foot { background: #fff; border-top: 2px solid #000; }
.foot-in { max-width: 1240px; margin: 0 auto; padding: 44px 28px 18px; display: grid; grid-template-columns: 1.4fr repeat(3, 1fr); gap: 28px; }
.foot h4 { font-size: 14px; font-weight: 800; margin: 0 0 10px; color: #000; }
.foot button.lnk { display: block; background: none; border: none; padding: 5px 0; font-size: 14.5px; color: #333; cursor: pointer; text-align: left; }
.foot button.lnk:hover { color: #000; text-decoration: underline; text-underline-offset: 3px; }
.wordmark { padding: 8px 28px 0; max-width: 1240px; margin: 0 auto; }
.wordmark svg { width: 100% !important; height: auto !important; }
@media (max-width: 980px) {
  .home-hero { grid-template-columns: 1fr; gap: 34px; padding: 8px 18px 44px; }
  .hero-art { min-height: 520px; max-width: 520px; margin: 0 auto; width: 100%; }
  .hero-search { grid-template-columns: 1fr 1fr; }
  .hero-search > label { border-bottom: 1.5px solid #E2E2E2; }
  .hero-search > label:nth-child(2n) { border-right: none; }
  .hero-search button.go { grid-column: 1 / -1; height: 50px; }
  .vendor-band { grid-template-columns: 1fr; padding: 36px 22px; }
  .steps3 { grid-template-columns: 1fr; gap: 26px; }
  .foot-in { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 520px) {
  .hero-art { min-height: 480px; }
  .ticket { width: 80%; right: 0; }
  .stamp { width: 104px; height: 104px; right: -10px; }
}

/* Phones: the logo mark alone, and the sticky search collapses to one row. */
.show-mobile { display: none; }
.crit-toggle { display: none; }
@media (max-width: 640px) {
  .show-mobile { display: inline-flex; }
  .crit-toggle { display: inline-block; }
  .crit { display: none; }
  .crit.open { display: block; }
  .sq { flex: 1 1 0 !important; min-width: 0 !important; }
  .sgo { padding: 0 14px !important; }
}

/* ── Responsive grid ── */
@media (max-width: 768px) {
  .vendor-grid { grid-template-columns: repeat(auto-fill, minmax(160px,1fr)) !important; }
  .hide-mobile { display: none !important; }

  /* Two-column pages become one column. The sidebar (price, booking box) is
     the thing people came for, so it goes ABOVE the description rather than
     below a screen and a half of text. */
  .pluj-2col      { grid-template-columns: 1fr !important; }
  .pluj-2col-side { order: -1; }

  /* The hero stats strip is four columns of centred text. Below 768px that is
     four two-character slivers, so it wraps into a 2x2 grid instead. */
  .pluj-stats     { display: grid !important; grid-template-columns: 1fr 1fr !important;
                    gap: 4px 12px !important; padding: 10px 6% !important; }
  .pluj-stats > div { border-right: none !important; padding-left: 0 !important; }
}

/* Anything pinned to a corner has to fit the screen it is pinned to. A fixed
   380px popover is wider than the content area of a 375px phone, so it ran off
   the right edge with no way to scroll to it. */
@media (max-width: 460px) {
  .pluj-popover { right: 8px !important; left: 8px !important; width: auto !important;
                  max-height: 88vh !important; }
}
`;

/* ─── DESIGN TOKENS ─────────────────────────────────────────────────────────── */
const BUILD_VERSION = "v5-2026-08-06-anon-read-ok";
export const C = {
  /* ── Primary ── */
  /* Oct 2026: the accent is a deeper PLUJ orange so white text on it and
     orange text on white both pass WCAG AA (4.7:1). The bright brand orange
     is kept as `flame` for marks and decoration, never for text. */
  orange: "#D13F17", orangeHov: "#B83510", orangeSoft: "#FFF1EC", flame: "#FF5C28",
  orangeBorder: "rgba(209,63,23,0.24)", orangeGlow: "rgba(209,63,23,0.30)",

  /* ── Neutrals (ink is a warm near-black; greys pass 4.5:1 on white) ── */
  black: "#17120F", darkGray: "#2A2420", midGray: "#4B5260",
  lightGray: "#6B7280", border: "#E7E7E9", borderLight: "#F2F2F3",
  bg: "#F6F6F7", bgAlt: "#F4F4F5", white: "#fff",

  /* ── Semantic ── */
  green: "#0F7A55", greenSoft: "#E8F6EF", greenDark: "#065F46",
  red: "#EF4444",   redSoft: "#FEF2F2",
  amber: "#F59E0B", amberSoft: "#FFFBEB",
  blue: "#3B82F6",  blueSoft: "#EFF6FF",

  /* ── PLUJ brand palette ── */
  violet: "#7A5CFF", violetSoft: "#F0ECFF", violetBorder: "rgba(122,92,255,0.22)",
  crystalBlue: "#5FD6FF", frostAqua: "#7FE7DA",

  /* ── Gradients (as CSS strings) ── */
  gradPrimary: "linear-gradient(135deg, #FF5C28 0%, #FF8C00 100%)",
  gradDark:    "linear-gradient(135deg, #0A0A0A 0%, #1A1A2E 100%)",
  gradViolet:  "linear-gradient(135deg, #7A5CFF 0%, #5FD6FF 100%)",
  gradHero:    "linear-gradient(105deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.50) 55%, rgba(0,0,0,0.18) 100%)",

  /* ── Elevation / shadows ── */
  shadowXs:     "0 1px 2px rgba(0,0,0,0.05)",
  shadowCard:   "0 1px 2px rgba(23,18,15,0.04)",
  shadowMd:     "0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
  shadowLg:     "0 12px 32px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)",
  shadowPopover:"0 0 8px rgba(0,0,0,0.10), 0 4px 4px rgba(0,0,0,0.04)",
  shadowDrawer: "-4px 0 40px rgba(0,0,0,0.12)",
  shadowModal:  "0 32px 80px rgba(0,0,0,0.24), 0 8px 24px rgba(0,0,0,0.10)",
  shadowButton: "0 8px 18px -8px rgba(209,63,23,0.55)",
  shadowViolet: "0 4px 18px rgba(122,92,255,0.38)",
};

/* ─── SEED DATA ──────────────────────────────────────────────────────────────── */
/* Oct 2026: every kind of vendor the big event sites list (GigSalad, The
   Bash, The Knot, PartySlate, Peerspace, Airbnb Services), grouped the way a
   host thinks about an event. New ids: photo, staff, transport, beauty, kids. */
export const CATEGORIES = [
  { id:"all",        label:"All",                   icon:"✦" },
  { id:"places",     label:"Places & Venues",       icon:"🏛️" },
  { id:"food",       label:"Food & Drinks",         icon:"🍽️" },
  { id:"music",      label:"Music & Entertainment", icon:"🎵" },
  { id:"photo",      label:"Photo & Video",         icon:"📷" },
  { id:"production", label:"Decor & Design",        icon:"✨" },
  { id:"rentals",    label:"Rentals",               icon:"🪑" },
  { id:"av",         label:"Audio & Visual",        icon:"🔊" },
  { id:"staff",      label:"Staff & Service",       icon:"🤵" },
  { id:"beauty",     label:"Beauty & Style",        icon:"💄" },
  { id:"transport",  label:"Transportation",        icon:"🚘" },
  { id:"kids",       label:"Kids & Family",         icon:"🎈" },
  { id:"logistics",  label:"Planning & Logistics",  icon:"📋" },
  { id:"other",      label:"Other Services",        icon:"➕" },
  { id:"build",      label:"Build My Event",        icon:"⚡" },
];

const FOOD_SUBS    = [
  { id:"food-trucks",  l:"Food Trucks",       e:"🚚", c:"#FFF7ED", a:"#C2410C", d:"Mobile kitchens & specialty trucks" },
  { id:"catering",     l:"Catering",          e:"🍽️", c:"#FEFCE8", a:"#A16207", d:"Full-service catering for any size" },
  { id:"drink-trucks", l:"Drink Trucks",      e:"🥤", c:"#F0FDF4", a:"#15803D", d:"Coffee, juice & specialty drinks" },
  { id:"mobile-bars",  l:"Mobile Bars",       e:"🍹", c:"#EFF6FF", a:"#1D4ED8", d:"Cocktail bars & champagne walls" },
  { id:"desserts",     l:"Desserts & Sweets", e:"🎂", c:"#FDF4FF", a:"#9333EA", d:"Cakes, dessert tables & candy" },
  { id:"private-chef", l:"Private Chef",      e:"👨‍🍳", c:"#FFF1F2", a:"#BE123C", d:"Personal chefs for luxury events" },
  { id:"grazing",      l:"Grazing Tables",    e:"🧀", c:"#FFF7ED", a:"#C2410C", d:"Charcuterie boards & grazing spreads" },
  { id:"cultural",     l:"Cultural Cuisine",  e:"🌍", c:"#ECFDF5", a:"#059669", d:"Authentic international flavors" },
  { id:"bbq",          l:"BBQ & Grill",        e:"🍖", c:"#FFF7ED", a:"#C2410C", d:"Pitmasters, smokers & live grills" },
  { id:"cakes",        l:"Cakes & Bakers",     e:"🍰", c:"#FDF4FF", a:"#9333EA", d:"Wedding, birthday & custom cakes" },
  { id:"coffee-bars",  l:"Coffee & Espresso Bars", e:"☕", c:"#FEFCE8", a:"#A16207", d:"Baristas and mobile espresso" },
  { id:"treat-carts",  l:"Ice Cream & Treat Carts", e:"🍦", c:"#EFF6FF", a:"#1D4ED8", d:"Ice cream, snow cones, popcorn & more" },
];
const MUSIC_SUBS = [
  { id:"djs",             l:"DJs",                  e:"🎧", c:"#F5F3FF", a:"#7C3AED", d:"Club, wedding & corporate DJs" },
  { id:"live-bands",      l:"Live Bands",            e:"🎸", c:"#FFF4ED", a:"#C2410C", d:"Cover bands, jazz & orchestras" },
  { id:"singers",         l:"Singers & Vocalists",   e:"🎤", c:"#FDF2F8", a:"#BE185D", d:"Solo vocalists, gospel & R&B" },
  { id:"performers",      l:"Performers & Dance",    e:"💃", c:"#FFF1F2", a:"#BE123C", d:"Dancers & cultural performers" },
  { id:"entertainers",    l:"Entertainers",          e:"🎪", c:"#ECFDF5", a:"#059669", d:"Magicians, hypnotists & hosts" },
  { id:"comedians",       l:"Comedians",             e:"😂", c:"#FEFCE8", a:"#A16207", d:"Stand-up comics & MC comedians" },
  { id:"kids-ent",        l:"Kids Entertainment",    e:"🎈", c:"#EFF6FF", a:"#1D4ED8", d:"Face painters, clowns & more" },
  { id:"instrumentalists",l:"Instrumentalists",      e:"🎻", c:"#F0FDF4", a:"#15803D", d:"Pianists, quartets & guitarists" },
  { id:"mc-hosts",        l:"MCs & Hosts",           e:"🎙️", c:"#FFF4ED", a:"#C2410C", d:"Emcees for weddings, galas & parties" },
  { id:"karaoke",         l:"Karaoke",               e:"🎤", c:"#F5F3FF", a:"#7C3AED", d:"Karaoke hosts and full setups" },
  { id:"tribute-acts",    l:"Tribute Acts",          e:"⭐", c:"#FEFCE8", a:"#A16207", d:"Tribute bands & look-alikes" },
  { id:"speakers",        l:"Speakers & Presenters", e:"🗣️", c:"#EFF6FF", a:"#1D4ED8", d:"Keynotes, panels & workshops" },
];
const PRODUCTION_SUBS = [
  { id:"decor",      l:"Event Decor",        e:"✨", c:"#FFF1F2", a:"#BE123C", d:"Themed décor & centerpieces" },
  { id:"flowers",    l:"Flowers & Florals",  e:"💐", c:"#F0FDF4", a:"#15803D", d:"Floral arrangements & arches" },
  { id:"balloons",   l:"Balloons & Installs",e:"🎈", c:"#FFF7ED", a:"#B45309", d:"Balloon arches & installations" },
  { id:"draping",    l:"Draping & Backdrops",e:"🎀", c:"#F5F3FF", a:"#6D28D9", d:"Fabric draping, backdrops & arches" },
  { id:"tablescapes", l:"Tablescapes",        e:"🕯️", c:"#FEFCE8", a:"#A16207", d:"Centerpieces & place settings" },
  { id:"signage",     l:"Signs & Neon",       e:"🔆", c:"#EFF6FF", a:"#1D4ED8", d:"Welcome signs, neon & custom displays" },
  { id:"special-fx",  l:"Special Effects",    e:"🎆", c:"#FFF1F2", a:"#BE123C", d:"Cold sparks, confetti, fog & bubbles" },
  { id:"invitations", l:"Invitations & Stationery", e:"✉️", c:"#F0FDF4", a:"#15803D", d:"Invites, menus, programs & calligraphy" },
  { id:"favors",      l:"Favors & Gifts",     e:"🎁", c:"#FDF2F8", a:"#BE185D", d:"Custom favors & guest gifts" },
];
const LOGISTICS_SUBS = [
  { id:"event-planner",  l:"Event Planners",           e:"🗓️", c:"#FFF4ED", a:"#C2410C", d:"Full-service planners for any event type" },
  { id:"event-manager",  l:"Event Managers",           e:"📋", c:"#FEFCE8", a:"#A16207", d:"Day-of coordinators & on-site managers" },
  { id:"truck-rental",  l:"Truck & Van Rental",     e:"🚛", c:"#FFF4ED", a:"#C2410C", d:"Box trucks & cargo vans" },
  { id:"drivers",       l:"Drivers & Transport",     e:"🚗", c:"#EFF6FF", a:"#1D4ED8", d:"Drivers for gear & equipment" },
  { id:"contractors",   l:"Independent Contractors", e:"🔧", c:"#F0FDF4", a:"#15803D", d:"Setup crew & laborers" },
  { id:"decorators",    l:"Decorators",              e:"🎨", c:"#FDF2F8", a:"#BE185D", d:"Professional decorators for hire" },
  { id:"security",      l:"Security",                e:"🛡️", c:"#FFF1F2", a:"#BE123C", d:"Event security & VIP detail" },
  { id:"valet",         l:"Valet & Parking",         e:"🅿️", c:"#F5F3FF", a:"#7C3AED", d:"Valet attendants & lot management" },
  { id:"cleanup",       l:"Cleanup Crews",           e:"🧹", c:"#ECFDF5", a:"#059669", d:"Pre/post event cleaning" },
  { id:"officiants",    l:"Officiants & Ceremony",   e:"💍", c:"#FDF4FF", a:"#9333EA", d:"Officiants and ceremony coordinators" },
];
const PLACES_SUBS = [
  { id:"venues",      l:"Event Venues",        e:"🏛️", c:"#F5F3FF", a:"#7C3AED", d:"Halls, ballrooms & event spaces" },
  { id:"restaurants", l:"Restaurants & Bars",  e:"🍴", c:"#FFF7ED", a:"#C2410C", d:"Private dining & bar buyouts" },
  { id:"parks",       l:"Parks & Outdoor",     e:"🌳", c:"#F0FDF4", a:"#15803D", d:"Gardens, fields & open-air spots" },
  { id:"hotels",      l:"Hotels & Ballrooms",  e:"🏨", c:"#EFF6FF", a:"#1D4ED8", d:"Hotel event & banquet rooms" },
  { id:"rooftops",    l:"Rooftops & Lofts",    e:"🌆", c:"#FDF2F8", a:"#BE185D", d:"Rooftop decks & loft spaces" },
  { id:"warehouses",  l:"Warehouses & Studios",e:"🏭", c:"#FEFCE8", a:"#A16207", d:"Industrial & blank-canvas venues" },
  { id:"estates",     l:"Private Estates",     e:"🏡", c:"#FFF1F2", a:"#BE123C", d:"Mansions, ranches & backyards" },
  { id:"community",   l:"Community Halls",     e:"🏫", c:"#ECFDF5", a:"#059669", d:"Rec centers & community rooms" },
];
const RENTALS_SUBS = [
  { id:"tables-chairs",l:"Tables & Chairs",    e:"🪑", c:"#FFF7ED", a:"#C2410C", d:"Seating, banquet & folding tables" },
  { id:"tents",        l:"Tents & Canopies",   e:"⛺", c:"#F0FDF4", a:"#15803D", d:"Marquees, canopies & sidewalls" },
  { id:"linens",       l:"Linens & Tableware", e:"🍽️", c:"#FEFCE8", a:"#A16207", d:"Cloths, china, glassware & flatware" },
  { id:"lounge",       l:"Lounge Furniture",   e:"🛋️", c:"#F5F3FF", a:"#7C3AED", d:"Sofas, ottomans & lounge sets" },
  { id:"dance-floors", l:"Dance Floors",       e:"🕺", c:"#FDF2F8", a:"#BE185D", d:"Portable dance floors & platforms" },
  { id:"climate",      l:"Heaters & Cooling",  e:"🔥", c:"#FFF1F2", a:"#BE123C", d:"Patio heaters, fans & misters" },
  { id:"restrooms",    l:"Restroom Trailers",  e:"🚻", c:"#EFF6FF", a:"#1D4ED8", d:"Luxury portable restrooms" },
  { id:"power",        l:"Generators & Power", e:"🔌", c:"#ECFDF5", a:"#059669", d:"Generators, cabling & power distro" },
  { id:"inflatables",  l:"Inflatables & Bounce Houses", e:"🏰", c:"#F5F3FF", a:"#7C3AED", d:"Bounce houses, slides & obstacle courses" },
  { id:"games",        l:"Games & Casino Tables", e:"🎲", c:"#FEFCE8", a:"#A16207", d:"Yard games, arcade & casino tables" },
  { id:"bar-rentals",  l:"Bars & Bar Carts",   e:"🍸", c:"#EFF6FF", a:"#1D4ED8", d:"Portable bars, carts & back bars" },
  { id:"catering-equipment", l:"Catering Equipment", e:"🍳", c:"#ECFDF5", a:"#059669", d:"Chafers, warmers, grills & coolers" },
];
const AV_SUBS = [
  { id:"sound",       l:"Sound Systems",       e:"🔊", c:"#F5F3FF", a:"#7C3AED", d:"PA systems, speakers & audio crew" },
  { id:"stages",      l:"Stages & Risers",     e:"🎪", c:"#FFF4ED", a:"#C2410C", d:"Portable stages, risers & rigging" },
  { id:"video-walls", l:"TV & LED Screens",    e:"📺", c:"#EFF6FF", a:"#1D4ED8", d:"LED walls, TVs & projection" },
  { id:"lighting",    l:"Lighting",            e:"💡", c:"#FEFCE8", a:"#A16207", d:"Stage, uplighting & effects" },
  { id:"projectors",  l:"Projectors & Visuals",e:"📽️", c:"#FDF2F8", a:"#BE185D", d:"Projectors, screens & mapping" },
  { id:"cameras",     l:"Cameras & Live Stream",e:"🎥", c:"#FFF1F2", a:"#BE123C", d:"Cameras, switching & livestream" },
  { id:"microphones", l:"Mics & DJ Booths",    e:"🎤", c:"#F0FDF4", a:"#15803D", d:"Wireless mics & DJ setups" },
];
const PHOTO_SUBS = [
  { id:"photographers", l:"Photographers",      e:"📷", c:"#F5F3FF", a:"#7C3AED", d:"Weddings, parties & corporate events" },
  { id:"videographers", l:"Videographers",      e:"🎬", c:"#EFF6FF", a:"#1D4ED8", d:"Films, highlights & live coverage" },
  { id:"photo-booths",  l:"Photo Booths",       e:"🖼️", c:"#FFF7ED", a:"#C2410C", d:"Open-air, mirror & classic booths" },
  { id:"booth-360",     l:"360 Video Booths",   e:"🔄", c:"#FDF2F8", a:"#BE185D", d:"Slow-motion 360 video platforms" },
  { id:"drone",         l:"Drone Photo & Video",e:"🚁", c:"#F0FDF4", a:"#15803D", d:"Aerial shots of venues & crowds" },
];
const STAFF_SUBS = [
  { id:"bartenders",    l:"Bartenders",          e:"🍸", c:"#EFF6FF", a:"#1D4ED8", d:"Licensed bartenders & mixologists" },
  { id:"servers",       l:"Servers & Waitstaff", e:"🍽️", c:"#FEFCE8", a:"#A16207", d:"Plated, buffet & passed service" },
  { id:"event-staff",   l:"Event Staff",         e:"🧑‍💼", c:"#F5F3FF", a:"#7C3AED", d:"Greeters, ushers & check-in" },
  { id:"attendants",    l:"Attendants & Coat Check", e:"🧥", c:"#FFF1F2", a:"#BE123C", d:"Coat check, restroom & gift attendants" },
  { id:"childcare",     l:"Event Childcare",     e:"🧸", c:"#ECFDF5", a:"#059669", d:"Sitters and kids' rooms at events" },
];
const BEAUTY_SUBS = [
  { id:"hair",          l:"Hair Stylists",       e:"💇", c:"#FDF2F8", a:"#BE185D", d:"Bridal, party & on-site styling" },
  { id:"makeup",        l:"Makeup Artists",      e:"💄", c:"#FFF1F2", a:"#BE123C", d:"Bridal, glam & airbrush makeup" },
  { id:"nails",         l:"Nail Artists",        e:"💅", c:"#F5F3FF", a:"#7C3AED", d:"Manicures & nail art on location" },
  { id:"barbers",       l:"Barbers & Grooming",  e:"💈", c:"#EFF6FF", a:"#1D4ED8", d:"Cuts, shaves & grooming on site" },
  { id:"attire",        l:"Dress & Suit Rental", e:"🤵", c:"#FEFCE8", a:"#A16207", d:"Gowns, suits & tuxedo rental" },
];
const TRANSPORT_SUBS = [
  { id:"limos",         l:"Limousines",          e:"🚘", c:"#F5F3FF", a:"#7C3AED", d:"Stretch limos & luxury sedans" },
  { id:"party-buses",   l:"Party Buses",         e:"🚌", c:"#FFF7ED", a:"#C2410C", d:"Party buses & sprinter vans" },
  { id:"classic-cars",  l:"Classic & Exotic Cars", e:"🏎️", c:"#FEFCE8", a:"#A16207", d:"Vintage, classic & exotic rides" },
  { id:"shuttles",      l:"Guest Shuttles",      e:"🚐", c:"#EFF6FF", a:"#1D4ED8", d:"Shuttles between hotels & venues" },
  { id:"carriages",     l:"Horse & Carriage",    e:"🐴", c:"#ECFDF5", a:"#059669", d:"Carriages for entrances & photos" },
];
const KIDS_SUBS = [
  { id:"face-painting", l:"Face Painting",       e:"🎨", c:"#FDF2F8", a:"#BE185D", d:"Face painters & glitter artists" },
  { id:"characters",    l:"Characters & Mascots",e:"🦸", c:"#EFF6FF", a:"#1D4ED8", d:"Costumed characters & mascots" },
  { id:"balloon-artists", l:"Balloon Twisters",  e:"🎈", c:"#FFF7ED", a:"#C2410C", d:"Balloon animals & hats" },
  { id:"petting-zoos",  l:"Petting Zoos & Pony Rides", e:"🐐", c:"#ECFDF5", a:"#059669", d:"Mobile petting zoos & ponies" },
  { id:"game-trucks",   l:"Game Trucks",         e:"🎮", c:"#F5F3FF", a:"#7C3AED", d:"Video game trucks & laser tag" },
  { id:"kids-crafts",   l:"Crafts & Activities", e:"✂️", c:"#FEFCE8", a:"#A16207", d:"Craft stations, science shows & more" },
];
/* Every category also gets an "Other" subcategory at the end, so a vendor whose
   service we haven't thought of can still list it (they name it themselves in
   the listing's Business name + description). Added programmatically so any
   category added later gets one automatically. */
export const CAT_SUBS = (() => {
  const base = { food: FOOD_SUBS, music: MUSIC_SUBS, production: PRODUCTION_SUBS,
                 logistics: LOGISTICS_SUBS, places: PLACES_SUBS, rentals: RENTALS_SUBS,
                 av: AV_SUBS, photo: PHOTO_SUBS, staff: STAFF_SUBS, beauty: BEAUTY_SUBS,
                 transport: TRANSPORT_SUBS, kids: KIDS_SUBS, other: [] };
  const withOther = {};
  for (const [cat, subs] of Object.entries(base)) {
    const list = Array.isArray(subs) ? subs : [];
    withOther[cat] = list.some(s => s.id === "other")
      ? list
      : [...list, { id:"other", l:"Other", e:"➕", c:"#F3F4F6", a:"#57534E",
                    d:"Something else — describe it in your listing" }];
  }
  return withOther;
})();

/* ── VENUE TYPES ───────────────────────────────────────────────────────────
   What kind of place the event is at, so a vendor knows what to expect on
   arrival (loading, parking, indoor/outdoor). Ids map to booking_requests.venue_type. */
const VENUE_TYPES = [
  { id:"house",      label:"House",              icon:"🏠" },
  { id:"apartment",  label:"Apartment / Condo",  icon:"🏬" },
  { id:"venue",      label:"Event Venue",        icon:"🏛️" },
  { id:"hotel",      label:"Hotel / Ballroom",   icon:"🏨" },
  { id:"restaurant", label:"Restaurant / Bar",   icon:"🍴" },
  { id:"park",       label:"Park / Outdoor",     icon:"🌳" },
  { id:"office",     label:"Office / Corporate", icon:"🏢" },
  { id:"other",      label:"Other",              icon:"📍" },
];
function venueTypeLabel(id) {
  const v = VENUE_TYPES.find(t => t.id === id);
  return v ? `${v.icon} ${v.label}` : "";
}
/* "14:30" → "2:30 PM". Leaves anything unexpected untouched. */
export function fmtTime12(t) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return t || "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}
export function fmtTimeRange(start, end) {
  const s = fmtTime12(start), e = fmtTime12(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || "";
}

/* ── VENDOR SIGNUP OPTIONS ──────────────────────────────────────────────────
   Structured choices so vendors pick instead of typing free text. */

/* Service-area cities. Houston metro first (the active market), then other
   major Texas cities. Vendors multi-select from this list. */
export const TX_CITIES = [
  // Greater Houston
  "Houston", "Katy", "Sugar Land", "The Woodlands", "Pearland", "Cypress",
  "Spring", "Humble", "Kingwood", "Atascocita", "Conroe", "Pasadena",
  "Baytown", "League City", "Missouri City", "Richmond", "Rosenberg",
  "Friendswood", "Tomball", "Galveston", "Deer Park", "La Porte", "Stafford",
  "Bellaire", "Webster", "Pinehurst",
  // Other major Texas metros
  "Dallas", "Fort Worth", "Arlington", "Plano", "Frisco", "McKinney", "Denton",
  "Austin", "Round Rock", "San Antonio", "El Paso", "Corpus Christi", "Lubbock",
  "Waco", "Beaumont", "Killeen", "Amarillo", "Laredo", "Brownsville", "Midland",
];

/* Days a vendor is willing to work (multi-select). */
export const AVAIL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* Hour blocks a vendor is willing to work (multi-select). */
export const TIME_BLOCKS = [
  ["Morning",    "Morning · 6am–12pm"],
  ["Afternoon",  "Afternoon · 12–5pm"],
  ["Evening",    "Evening · 5–10pm"],
  ["Late night", "Late night · 10pm–2am"],
];

/* Compose a readable schedule string from selected days + hour blocks.
   Stored in vendor_profiles.schedule (text) so the rest of the app keeps
   displaying it as before, e.g. "Mon, Wed, Fri, Sat · Afternoon, Evening". */
function composeSchedule(days = [], blocks = []) {
  const d = AVAIL_DAYS.filter(x => days.includes(x));
  const dayStr = d.length === 7 ? "Every day" : d.join(", ");
  const blockStr = blocks.join(", ");
  return [dayStr, blockStr].filter(Boolean).join(" · ");
}

/* Parse a composed schedule string back into { days, blocks }.
   Only parses our own composed format (identified by the " · " separator) —
   legacy free-text schedules return nulls so they never block a booking. */
export function parseSchedule(s) {
  if (!s || typeof s !== "string" || !s.includes("·")) return { days: null, blocks: null };
  const [dayPart = "", blockPart = ""] = s.split("·").map(x => x.trim());
  let days;
  if (/every\s*day/i.test(dayPart)) days = [...AVAIL_DAYS];
  else {
    const found = AVAIL_DAYS.filter(d => new RegExp(`\\b${d}\\b`, "i").test(dayPart));
    days = found.length ? found : null;
  }
  const foundBlocks = TIME_BLOCKS.map(([id]) => id).filter(b => blockPart.toLowerCase().includes(b.toLowerCase()));
  return { days, blocks: foundBlocks.length ? foundBlocks : null };
}

/* Every hour block a booking actually touches, not just the one it starts in.
   A vendor who works evenings only cannot take 8pm–1am: that runs through
   Evening AND Late night, and they only cover the first. Checking the start
   time alone said yes to exactly that booking.

   An end time landing exactly on the hour does not reach into it — 7pm–10pm is
   Evening, not Evening plus Late night. An end at or before the start means the
   booking runs past midnight. */
export function blocksForSpan(startTime, endTime) {
  const first = blockForTime(startTime);
  if (!first) return [];
  if (!endTime || !/^\d{1,2}:\d{2}/.test(endTime)) return [first];
  const sh = parseInt(startTime.split(":")[0], 10);
  const [ehRaw, emRaw] = endTime.split(":");
  const eh = parseInt(ehRaw, 10);
  const em = parseInt(emRaw || "0", 10);
  let span = (eh + (em > 0 ? 1 : 0)) - sh;
  if (span <= 0) span += 24;                 // finishes the next day
  span = Math.min(span, 24);
  const out = [];
  for (let i = 0; i < span; i++) {
    const b = blockForTime(`${String((sh + i) % 24).padStart(2, "0")}:00`);
    if (b && !out.includes(b)) out.push(b);
  }
  return out;
}

/* Which hour block a "HH:MM" start time falls into. */
export function blockForTime(t) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null;
  const h = parseInt(t.split(":")[0], 10);
  if (h >= 6  && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  if (h >= 17 && h < 22) return "Evening";
  return "Late night";
}

/* Hours between now and an event's start (date + optional HH:MM). Negative if
   the event is already in the past. */
function hoursUntilEvent(dateStr, startTime) {
  if (!dateStr) return Infinity;                 // no date set — don't block
  const t = /^\d{1,2}:\d{2}/.test(startTime || "") ? startTime : "00:00";
  const when = new Date(`${dateStr}T${t}:00`);
  if (isNaN(when)) return Infinity;
  return (when.getTime() - Date.now()) / 36e5;
}
/* Cancellations and changes are only allowed 48h+ before the event. */
const CHANGE_CUTOFF_HOURS = 48;
function canChangeBooking(dateStr, startTime) {
  return hoursUntilEvent(dateStr, startTime) >= CHANGE_CUTOFF_HOURS;
}

/* Weekday label ("Mon".."Sun") for a YYYY-MM-DD string, parsed as local time. */
function weekdayOf(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d)) return null;
  return AVAIL_DAYS[(d.getDay() + 6) % 7];
}

/* Is this date/time already gone? Returns a reason string, or "" if it is still
   in the future.

   Compared in the browser's local timezone on purpose: the customer picked
   "3pm" meaning 3pm where the event is, and everyone involved here is in
   Houston. Comparing against UTC would reject a valid afternoon slot for
   anyone west of Greenwich.

   With no time given, the whole day counts as available until it is over — an
   event "today" with no time yet is a normal thing to plan. */
function pastEventReason(dateStr, startTime) {
  if (!dateStr) return "";
  const now = new Date();
  if (startTime) {
    const when = new Date(`${dateStr}T${startTime}`);
    if (!isNaN(when) && when.getTime() <= now.getTime()) return "that time has already passed";
    return "";
  }
  const endOfDay = new Date(`${dateStr}T23:59:59`);
  if (!isNaN(endOfDay) && endOfDay.getTime() < now.getTime()) return "that date has already passed";
  return "";
}

/* Does this booking give the vendor the warning they asked for? `hours` comes
   from the listing (min_notice_hours, 0 = no minimum). */
function noticeShortfallReason(dateStr, startTime, hours) {
  const need = Number(hours) || 0;
  if (!need || !dateStr) return "";
  const when = new Date(`${dateStr}T${startTime || "00:00"}`);
  if (isNaN(when)) return "";
  const hoursAway = (when.getTime() - Date.now()) / 3600000;
  if (hoursAway >= need) return "";
  const label = need % 168 === 0 ? `${need / 168} week${need === 168 ? "" : "s"}`
              : need % 24  === 0 ? `${need / 24} day${need === 24 ? "" : "s"}`
              : `${need} hour${need === 1 ? "" : "s"}`;
  return `needs at least ${label} notice`;
}

/* Why a vendor can't take a booking on this date/time. Empty array = available.
   Checks that the date has not already passed, calendar-blocked dates, dates
   already confirmed, the weekdays the vendor works, the hour blocks they work,
   and the advance notice they require. */
export function vendorConflicts(vendor, avail, dateStr, startTime, endTime) {
  const out = [];
  if (!dateStr) return out;
  const past = pastEventReason(dateStr, startTime);
  if (past) out.push(past);
  const shortfall = noticeShortfallReason(dateStr, startTime,
    vendor?.minNoticeHours != null ? vendor.minNoticeHours : vendor?.min_notice_hours);
  if (shortfall) out.push(shortfall);
  if ((avail?.blocked   || []).includes(dateStr)) out.push("has that date blocked");
  if ((avail?.confirmed || []).includes(dateStr)) out.push("is already booked that date");
  const { days, blocks } = parseSchedule(vendor?.schedule);
  const wd = weekdayOf(dateStr);
  if (days && wd && !days.includes(wd)) {
    const full = { Mon:"Mondays", Tue:"Tuesdays", Wed:"Wednesdays", Thu:"Thursdays",
                   Fri:"Fridays", Sat:"Saturdays", Sun:"Sundays" }[wd] || wd;
    out.push(`doesn't work ${full}`);
  }
  if (blocks && startTime) {
    /* Every block the booking runs through must be one the vendor works, not
       just the block it starts in. */
    const missing = blocksForSpan(startTime, endTime).filter(b => !blocks.includes(b));
    if (missing.length) {
      out.push(`doesn't work ${missing.map(b => `${b.toLowerCase()}s`).join(" or ")}`);
    }
  }
  return out;
}

/* Build a single-line location string from a request's structured address
   fields. Accepts either camelCase (UI layer) or snake_case (raw DB row) and
   falls back to the free-text venue name. Returns "" when nothing is set.
   Used for the vendor email and one-line summaries. */
export function formatEventLocation(r = {}) {
  const g = (a, b) => (r[a] ?? r[b] ?? "").toString().trim();
  const venueName = g("venue", "venue");
  const line1 = g("streetAddress", "street_address");
  const line2 = g("addressLine2", "address_line2");
  const city  = g("city", "city");
  const state = g("state", "state");
  const zip   = g("zip", "zip_code");
  const street   = [line1, line2].filter(Boolean).join(", ");
  const cityLine = [city, [state, zip].filter(Boolean).join(" ").trim()].filter(Boolean).join(", ");
  const addr     = [street, cityLine].filter(Boolean).join(", ");
  if (venueName && addr) return `${venueName} — ${addr}`;
  return venueName || addr || "";
}

const INIT_REVIEWS = {
  1:  [{ id:"rv1",  uid:"seed1", uname:"Jordan M.",   rating:5, text:"Taco Rush showed up on time, setup was lightning fast and every single taco was fire. Our guests couldn't stop talking about it. 100% booking again.", date:"Apr 2, 2026", reply:null }],
  4:  [{ id:"rv2",  uid:"seed2", uname:"Priya K.",    rating:5, text:"Prestige Catering turned our wedding into a 5-star dining experience. The staff was impeccable and the custom menu was flawless.", date:"Mar 28, 2026", reply:"Thank you Priya! It was a pleasure being part of your special day. — Prestige Team" }],
  20: [{ id:"rv3",  uid:"seed3", uname:"Darius W.",   rating:5, text:"Pulse DJ Co. had the entire room moving from the first song. MC was hilarious and kept energy HIGH all night. Worth every penny.", date:"Apr 10, 2026", reply:null }],
  22: [{ id:"rv4",  uid:"seed4", uname:"Sofia L.",    rating:5, text:"The Jazz Collective set exactly the right tone for our gala. Sophisticated, tight and they learned two of our requests on short notice. Remarkable.", date:"Mar 15, 2026", reply:"Sofia, we loved playing for your gala! Hope to see you again soon. — The Jazz Collective" }],
  40: [{ id:"rv5",  uid:"seed5", uname:"Marcus T.",   rating:4, text:"SoundWave Pro delivered great audio for our 300-person event. Small hiccup with the monitors at start but crew resolved it immediately.", date:"Apr 5, 2026", reply:"Marcus, thanks for the honest feedback! We've since updated our monitor checklist. — SoundWave Team" }],
  45: [{ id:"rv6",  uid:"seed6", uname:"Amara B.",    rating:5, text:"Bloom Theory transformed our venue into something out of a magazine. The floral arch alone had everyone stopping for photos.", date:"Apr 8, 2026", reply:null }],
  63: [{ id:"rv7",  uid:"seed7", uname:"Kelvin R.",   rating:5, text:"EventEdge handled EVERYTHING. I didn't have to think once on the day. Every vendor was on time, timeline was perfect. Hire them.", date:"Mar 22, 2026", reply:"Kelvin, this means the world to us! Your corporate event was an absolute pleasure to manage. — EventEdge" }],
};

/* ── VENDOR CATALOG ───────────────────────────────────────────────────────
   Demo/sample listings have been removed. The marketplace now shows only
   real, approved vendors loaded from the database (see getApprovedVendors).
   This constant is intentionally kept empty so existing lookups still work. */
const VENDORS = [
];

/* ─── EVENT TYPES ────────────────────────────────────────────────────────────
   The occasions a host can be planning. Vendors tag which they serve, and
   search matches host event-type → vendor tags. Ids are stable and stored in
   vendor_profiles.event_types. Kept in sync with the labels hosts pick. */
export const EVENT_TYPES = [
  { id:"wedding",    icon:"💍", label:"Wedding" },
  { id:"quince",     icon:"👑", label:"Quinceañera / Sweet 16" },
  { id:"corporate",  icon:"💼", label:"Corporate Event" },
  { id:"birthday",   icon:"🎂", label:"Birthday Party" },
  { id:"concert",    icon:"🎤", label:"Concert / Festival" },
  { id:"baby",       icon:"🍼", label:"Baby Shower" },
  { id:"seminar",    icon:"📊", label:"Seminar / Conference" },
  { id:"kids",       icon:"🧸", label:"Kids Party" },
  { id:"graduation", icon:"🎓", label:"Graduation" },
  { id:"social",     icon:"🥂", label:"Social Gathering" },
  { id:"other",      icon:"➕", label:"Other" },
];
function eventTypeLabel(id) {
  const t = EVENT_TYPES.find(e => e.id === id);
  return t ? `${t.icon} ${t.label}` : id;
}
/* Normalize whatever is stored (array or JSON string) into an id array. */
export function parseEventTypes(raw) {
  let arr = raw;
  if (typeof raw === "string" && raw.trim()) { try { arr = JSON.parse(raw); } catch { return []; } }
  return Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
}
/* Does this vendor serve the requested event type?
   No tags set = serves everything (so vendors aren't hidden until they opt in).
   Demo catalog vendors are never filtered by event type. */
export function matchesEventType(v, typeId) {
  if (!typeId) return true;
  const tags = parseEventTypes(v.eventTypes);
  if (!tags.length) return true;
  return tags.includes(typeId);
}

/* ─── EVENT PACKAGES ─────────────────────────────────────────────────────────── */
const EVENT_PACKAGES = [
  { id:"wedding", icon:"💍", label:"Wedding", color:"#FDF4FF", accent:"#9333EA",
    desc:"Ceremony, reception & everything in between",
    checklist:["Venue","DJ","Catering","Cake","Décor","Event Planner","Rentals (Linens, Chairs, Tables)","Audio & Visual","Photography","Live Band","Clean Up","Drivers & Transport","Animation / Entertainer","Portable Restrooms","Security","Registry for Gifts"],
    subs:["venues","djs","catering","desserts","decor","event-planner","tables-chairs","linens","sound","lighting","cameras","live-bands","cleanup","drivers","entertainers","restrooms","security","photographers","videographers","photo-booths","hair","makeup","limos","officiants","bartenders","servers","invitations","cakes","attire"] },
  { id:"quince", icon:"👑", label:"Quinceañera / Sweet 16", color:"#FDF2F8", accent:"#BE185D",
    desc:"Elegant milestone celebrations",
    checklist:["Venue","DJ","Catering","Cake","Décor","Event Planner","Rentals (Linens, Chairs, Tables)","Audio & Visual","Photography","Live Band","Clean Up","Drivers & Transport","Animation / Entertainer","Portable Restrooms","Security","Registry for Gifts"],
    subs:["venues","djs","catering","desserts","decor","event-planner","tables-chairs","linens","sound","lighting","cameras","live-bands","cleanup","drivers","entertainers","restrooms","security","photographers","videographers","photo-booths","hair","makeup","limos","bartenders","servers","invitations","cakes","attire","mc-hosts"] },
  { id:"corporate", icon:"💼", label:"Corporate Event", color:"#EFF6FF", accent:"#1D4ED8",
    desc:"Meetings, launches, team events & galas",
    checklist:["Venue","DJ / Live Music","Catering","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake","Portable Restrooms","Rentals (Generators / Tables / Chairs)","Security"],
    subs:["venues","djs","live-bands","catering","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","photographers","videographers","event-staff","bartenders","shuttles","speakers","signage","mc-hosts"] },
  { id:"birthday", icon:"🎂", label:"Birthday Party", color:"#FFF7ED", accent:"#EA580C",
    desc:"From intimate dinners to massive blowouts",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Generators / Tables / Chairs)","Security","Registry for Gifts"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","photographers","photo-booths","bartenders","cakes","party-buses","karaoke"] },
  { id:"concert", icon:"🎤", label:"Concert / Festival", color:"#F5F3FF", accent:"#7C3AED",
    desc:"Live music events, shows & performances",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Stage / Generators / Tables / Chairs)","Security"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security","event-staff","shuttles","photographers","videographers","special-fx"] },
  { id:"baby", icon:"🍼", label:"Baby Shower", color:"#ECFDF5", accent:"#059669",
    desc:"Intimate celebrations welcoming new life",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Generators / Tables / Chairs)","Security"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","photographers","cakes","favors","balloon-artists"] },
  { id:"seminar", icon:"📊", label:"Seminar / Conference", color:"#F0FDF4", accent:"#15803D",
    desc:"Professional speaker events & workshops",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Stage / Generators / Tables / Chairs)","Security","Event Manager"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security","event-manager","speakers","photographers","event-staff","signage"] },
  { id:"kids", icon:"🧸", label:"Kids Party", color:"#FFF7ED", accent:"#EA580C",
    desc:"Fun-packed parties for the little ones",
    checklist:["Inflatables","Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor (Balloons)","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Generators / Tables / Chairs)","Security","Face Painting"],
    subs:["inflatables","venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","balloons","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","kids-ent","face-painting","characters","petting-zoos","game-trucks","balloon-artists","kids-crafts","photo-booths","cakes"] },
  { id:"graduation", icon:"🎓", label:"Graduation", color:"#EFF6FF", accent:"#1D4ED8",
    desc:"Celebrate the big achievement",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Stage / Generators / Tables / Chairs)","Security","Event Manager"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security","event-manager","photographers","photo-booths","cakes","party-buses"] },
  { id:"social", icon:"🥂", label:"Social Gathering", color:"#FFF1F2", accent:"#BE123C",
    desc:"Reunions, dinners & get-togethers",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Generators / Tables / Chairs)","Security"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","photo-booths","bartenders","karaoke","games"] },
];

const RECS = {
  "Wedding": ["venues","djs","catering","desserts","decor","event-planner","tables-chairs","linens","sound","lighting","cameras","live-bands","cleanup","drivers","entertainers","restrooms","security","photographers","videographers","photo-booths","hair","makeup","limos","officiants","bartenders","servers","invitations","cakes","attire"],
  "Quinceañera / Sweet 16": ["venues","djs","catering","desserts","decor","event-planner","tables-chairs","linens","sound","lighting","cameras","live-bands","cleanup","drivers","entertainers","restrooms","security","photographers","videographers","photo-booths","hair","makeup","limos","bartenders","servers","invitations","cakes","attire","mc-hosts"],
  "Corporate Event": ["venues","djs","live-bands","catering","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","photographers","videographers","event-staff","bartenders","shuttles","speakers","signage","mc-hosts"],
  "Birthday Party": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","photographers","photo-booths","bartenders","cakes","party-buses","karaoke"],
  "Concert / Festival": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security","event-staff","shuttles","photographers","videographers","special-fx"],
  "Baby Shower": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","photographers","cakes","favors","balloon-artists"],
  "Seminar / Conference": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security","event-manager","speakers","photographers","event-staff","signage"],
  "Kids Party": ["inflatables","venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","balloons","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","kids-ent","face-painting","characters","petting-zoos","game-trucks","balloon-artists","kids-crafts","photo-booths","cakes"],
  "Graduation": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security","event-manager","photographers","photo-booths","cakes","party-buses"],
  "Social Gathering": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","photo-booths","bartenders","karaoke","games"],
};

const WIZARD = [
  { k:"eventType", q:"What type of event?",      opts:["Wedding","Quinceañera / Sweet 16","Corporate Event","Birthday Party","Concert / Festival","Baby Shower","Seminar / Conference","Kids Party","Graduation","Social Gathering"] },
  { k:"guests",    q:"How many guests?",          opts:["Under 25","25–50","50–100","100–250","250–500","500+"] },
  { k:"date",      q:"When is your event?",       opts:["This week","2–4 weeks out","1–3 months out","3–6 months out","6+ months out","Not sure yet"] },
  { k:"time",      q:"What time does it start?",  opts:["Morning (8am–12pm)","Afternoon (12pm–5pm)","Evening (5pm–9pm)","Night (9pm+)"] },
  { k:"duration",  q:"How long will it run?",     opts:["1–2 hours","3–4 hours","5–6 hours","Full day / evening","Multi-day"] },
  { k:"budget",    q:"What's your total budget?", opts:["Under $1,000","$1k–$5k","$5k–$15k","$15k–$50k","$50k+","I'm flexible"] },
  { k:"location",  q:"Where is it located?",      opts:["Houston (Inner Loop)","Katy / West Houston","Sugar Land / Pearland","The Woodlands / Conroe","Galveston Island","Other / I'll provide venue"] },
];

/* ─── HELPERS ────────────────────────────────────────────────────────────────── */
function initials(name) { return (name||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2); }
function uid()           { return Math.random().toString(36).slice(2,10); }
function genUserId()     { return "USR-" + Math.random().toString(16).slice(2,10).toUpperCase(); }
function genVendorId()   { return "VND-" + Math.random().toString(16).slice(2,10).toUpperCase(); }
function genBookingId()  { return "BKG-" + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(16).slice(2,6).toUpperCase(); }
function genAdminId()    { return "ADM-" + Math.random().toString(16).slice(2,10).toUpperCase(); }
function genRequestId()  { return "REQ-" + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(16).slice(2,6).toUpperCase(); }
function genNotifId()    { return "NTF-" + Math.random().toString(16).slice(2,10).toUpperCase(); }

/* A short, human-readable member ID that never repeats: derived deterministically
   from the account's unique UUID, so it's stable and collision-free.
   Format: U|V + 6 digits + initials + state  (e.g. "U482913JDTX"). */
function memberId(user) {
  if (!user || !user.id) return "";
  const prefix = user.type === "vendor" ? "V" : "U";
  const uuid = String(user.id).replace(/-/g, "");
  let h = 0;
  for (let i = 0; i < uuid.length; i++) h = (Math.imul(h, 31) + uuid.charCodeAt(i)) >>> 0;
  const digits = String(h % 1000000).padStart(6, "0");
  const name = user.displayName || user.businessName || user.name || "";
  const initials = (name.match(/[A-Za-z]+/g) || []).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "XX";
  const state = String(user.state || user.bizState || user.registeredState || "TX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || "TX";
  return prefix + digits + initials + state;
}

/* Detect whether an ID is a real database UUID (real vendor/user) vs a demo
   slug like "v_pals" used by the hardcoded sample vendor cards on the homepage.
   Booking/notification DB writes are skipped for demo vendors since there's no
   real row to reference — the UI still shows success. Once real vendors are
   onboarded (their IDs will be UUIDs), writes proceed normally. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isRealId(id) { return typeof id === "string" && UUID_RE.test(id); }

/* ── Canonical booking-status vocabulary ─────────────────────────────────────
   One booking moves through: pending → confirmed → (cancelled) / declined.
   Different parts of the code (and older rows) have written synonyms —
   "approved"/"accepted" for confirmed, "rejected" for declined. These
   predicates are the single source of truth so every screen agrees. Note this
   is the BOOKING status, distinct from vendor_profiles.verification_status
   (which legitimately uses "approved"/"rejected" for vetting a business). */
const STATUS_CONFIRMED = ["confirmed", "accepted", "approved"];
const STATUS_DECLINED  = ["declined", "rejected"];
export function isConfirmedStatus(s) { return STATUS_CONFIRMED.includes(s); }
export function isDeclinedStatus(s)  { return STATUS_DECLINED.includes(s); }
function isPendingStatus(s)   { return s === "pending" || !s; }
export function isCancelledStatus(s) { return s === "cancelled" || s === "canceled"; }
/* Normalize any synonym to the canonical value the app writes going forward. */
function canonicalStatus(s) {
  if (isConfirmedStatus(s)) return "confirmed";
  if (isDeclinedStatus(s))  return "declined";
  return s || "pending";
}

/* ─── STORAGE + ROW LEVEL SECURITY ───────────────────────────────────────────
   Storage layer: Supabase (PostgreSQL + Auth + Storage).
   Keys: u:{id}  ue:{email}  session  bk:{id}  ubk:{userId}

   RLS POLICIES — enforced on every read/write, no bypass path exists:
   ┌────────────────────────┬────────────────────────────────────────────────┐
   │ POLICY                 │ RULE                                           │
   ├────────────────────────┼────────────────────────────────────────────────┤
   │ user_isolation         │ session.userId = record.id                     │
   │ booking_isolation      │ session.userId = booking.userId (read + write) │
   │ auth_required          │ session.type IN ('user','vendor')               │
   │ review_auth            │ session.type IN ('user','vendor')               │
   └────────────────────────┴────────────────────────────────────────────────┘
────────────────────────────────────────────────────────────────────────────── */

/* ── Internal low-level primitives (not exported to app layer) ─────────────── */
/* ══════════════════════════════════════════════════════════════════════════════
   SUPABASE CLIENT

   Read from the environment first, falling back to the production values. Both
   are safe in frontend code — the anon key is a public identifier and RLS is
   what protects the data — but hardcoding them meant the app could only ever
   talk to one database. Anything that needs a second one (a staging project, a
   Supabase preview branch, a local stack) was impossible without editing source.

   To point a deployment somewhere else, set these in Vercel:
     REACT_APP_SUPABASE_URL
     REACT_APP_SUPABASE_ANON_KEY
   Create React App inlines them at BUILD time, so a change needs a redeploy.
   ══════════════════════════════════════════════════════════════════════════════ */
const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL
  || "https://btmqghudfakpbbplrqhf.supabase.co";
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0bXFnaHVkZmFrcGJicGxycWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNjA1NTgsImV4cCI6MjA5NDczNjU1OH0.t3GgjjKy--BPMJ7Z5wPWB1UamG71F6FGzR_N2cfJpWw";

/* ── Cloudflare Turnstile ────────────────────────────────────────────────────
   Empty until REACT_APP_TURNSTILE_SITE_KEY is set in Vercel, and everything
   below is written so that emptiness is a working state, not a broken one:
   no key means no widget, no token, and the existing arithmetic question
   carries on exactly as before.

   That ordering is deliberate. A widget rendered without a key shows a broken
   box, and a token sent before Supabase has the secret is ignored — but turning
   on Supabase's CAPTCHA protection while the app sends no token rejects EVERY
   signup. So: this code ships first and changes nothing, then you add the site
   key here and the secret key in Supabase. Neither step alone can break signup. */
const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || "";

/* Detect if running in Claude artifact sandbox (no external fetch allowed) */
const IS_PREVIEW = (() => {
  try {
    const origin = window.location.origin || "";
    /* Only use preview mode inside Claude artifact sandbox */
    /* On real domains (vercel.app, pluj.us) always use Supabase */
    if (origin.includes("pluj.us")) return false;
    if (origin.includes("vercel.app")) return false;
    if (origin.includes("localhost")) return false;
    /* Claude artifact sandbox: origin is null/empty or window.storage exists */
    const hasClaudeStorage = typeof window.storage !== "undefined" &&
      typeof window.storage.get === "function";
    return origin.includes("claude.ai") || origin === "null" || origin === "" ||
           hasClaudeStorage;
  } catch { return true; }
})();

/* Minimal Supabase client — no npm needed, runs in browser */
export const sb = (() => {
  /* Current logged-in user's access token (JWT). Null when signed out.
     REST/write calls must authenticate as this user so Postgres RLS can see
     auth.uid(). Without it, every call runs as the anon role and admin/owner
     policies (is_admin(), auth.uid() = id) silently filter the row out,
     returning HTTP 200 with an empty body [] and no actual change. */
  let _authToken = null;
  let _refreshToken = null;
  let _refreshing = null;
  function setAuth(token, refresh) {
    _authToken = token || null;
    if (refresh !== undefined) _refreshToken = refresh || null;
  }

  /* Supabase access tokens expire after an hour. Without this, every
     authenticated request 401s from then on and the app silently half-works
     until the user logs out and back in. Exchange the refresh token for a new
     pair, update the saved session, and let the caller retry. Guarded so a
     burst of parallel 401s triggers one refresh rather than twenty. */
  function refreshAuth() {
    if (!_refreshToken) return Promise.resolve(false);
    if (_refreshing) return _refreshing;
    _refreshing = (async () => {
      try {
        const r = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON },
          body: JSON.stringify({ refresh_token: _refreshToken }),
        });
        if (!r.ok) { _refreshToken = null; return false; }
        const d = await r.json().catch(() => null);
        if (!d || !d.access_token) return false;
        _authToken = d.access_token;
        if (d.refresh_token) _refreshToken = d.refresh_token;
        try {
          const raw = localStorage.getItem("pluj_session");
          if (raw) {
            const s = JSON.parse(raw);
            s.access_token = _authToken;
            if (d.refresh_token) s.refresh_token = d.refresh_token;
            localStorage.setItem("pluj_session", JSON.stringify(s));
          }
        } catch { /* storage unavailable */ }
        return true;
      } catch {
        return false;
      } finally {
        _refreshing = null;
      }
    })();
    return _refreshing;
  }
  /* Exposed so our own /api routes can authenticate the caller. Those
     endpoints verify this JWT and read the recipient out of the database
     rather than trusting anything in the request body. */
  function getAuthToken() { return _authToken; }

  const headers = {
    "Content-Type":  "application/json",
    "apikey":        SUPABASE_ANON,
    "Authorization": "Bearer " + SUPABASE_ANON,
  };
  /* apikey stays the anon/publishable key (required by the API gateway);
     Authorization carries the user JWT when signed in, else falls back to anon. */
  function userAuth() { return "Bearer " + (_authToken || SUPABASE_ANON); }

  /* Generic REST helper — falls back to window.storage in preview mode.

     `opts.prefer` overrides the Prefer header. This matters more than it looks:
     PostgREST's default here, return=representation, makes every write ALSO
     read the row back, which needs SELECT permission on the table. A table that
     is deliberately write-only for visitors — app_events is exactly that, so
     nobody can read the traffic log — therefore fails the whole insert with
     "permission denied", even though the write itself was allowed. Pass
     { prefer: "return=minimal" } for those. */
  async function rest(method, path, body, opts = {}) {
    if (IS_PREVIEW) return previewRest(method, path, body);
    try {
      const send = () => fetch(SUPABASE_URL + "/rest/v1" + path, {
        method,
        headers: { ...headers, "Authorization": userAuth(),
                   "Prefer": opts.prefer || "return=representation" },
        body: body ? JSON.stringify(body) : undefined,
      });
      let res = await send();
      /* Token expired mid-session: refresh once and retry, rather than
         surfacing a 401 the caller has no way to recover from. */
      if (res.status === 401 && await refreshAuth()) res = await send();
      const data = await res.json().catch(() => null);
      if (!res.ok) { console.error("[Supabase]", path, data); return { data: null, error: data }; }
      return { data, error: null };
    } catch(e) { return { data: null, error: e }; }
  }

  /* Auth helpers */
  async function signUp(email, password, meta = {}, captchaToken = null) {
    if (IS_PREVIEW) return previewSignUp(email, password, meta);
    try {
      /* gotrue_meta_security is where GoTrue expects the CAPTCHA token. It is
         verified by Supabase's auth server against Cloudflare, not by us — the
         whole point is that it holds for anyone calling this endpoint, whether
         or not they went anywhere near our form. Omitted entirely when there is
         no token, because sending an empty one is a failed verification rather
         than an absent one. */
      const body = { email, password, data: meta };
      if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken };
      const res = await fetch(SUPABASE_URL + "/auth/v1/signup", {
        method: "POST", headers,
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));

      /* Errors come back as { code, error_code, msg } — there is no `error`
         field — so the old `error: d.error || null` reported every failure as
         a success with no user in it, which the form then showed as the
         generic "Signup failed". Read the real message. */
      if (!res.ok) {
        return { data: null, error: {
          message: d.msg || d.error_description || d.message || d.error || "Signup failed. Please try again.",
          code: d.error_code || d.code || res.status,
        } };
      }

      /* With email confirmation ON, a successful signup returns the bare user
         object ({ id, email, identities, ... }) — no session and no `user`
         wrapper. Only with confirmation off does it return { user, session }.
         The form checked authData.user, found nothing, and told every person
         who had just signed up successfully that signup had failed. They
         pressed it again, hit the 60-second resend limit, and concluded that
         signup was broken. It was the message that was broken. */
      const user = d.user || (d.id ? d : null);
      return { data: { user, session: d.access_token ? d : null }, error: null };
    } catch(e) { return { data: null, error: e }; }
  }

  async function signIn(email, password) {
    if (IS_PREVIEW) return previewSignIn(email, password);
    try {
      const res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
        method: "POST", headers,
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json();
      return { data: d, error: d.error || null };
    } catch(e) { return { data: null, error: e }; }
  }

  async function signOut(accessToken) {
    if (IS_PREVIEW) return;
    try {
      await fetch(SUPABASE_URL + "/auth/v1/logout", {
        method: "POST",
        headers: { ...headers, "Authorization": "Bearer " + accessToken },
      });
    } catch {}
  }

  async function getUser(accessToken) {
    if (IS_PREVIEW) return previewGetUser(accessToken);
    try {
      const res = await fetch(SUPABASE_URL + "/auth/v1/user", {
        headers: { ...headers, "Authorization": "Bearer " + accessToken },
      });
      const d = await res.json();
      return { data: d, error: d.error || null };
    } catch(e) { return { data: null, error: e }; }
  }

  /* Password recovery — sends Supabase's recovery email. The link returns to
     the site with #access_token=...&type=recovery in the URL hash, which the
     app detects on boot (see recovery handling in PlujApp). */
  async function recover(email, redirectTo) {
    if (IS_PREVIEW) return { data: null, error: { message: "Password reset isn't available in preview mode." } };
    try {
      const res = await fetch(SUPABASE_URL + "/auth/v1/recover", {
        method: "POST", headers,
        body: JSON.stringify(redirectTo ? { email, gotrue_meta_security: {}, redirect_to: redirectTo } : { email }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return { data: null, error: d.error || d || { message: "Could not send reset email." } };
      return { data: d, error: null };
    } catch(e) { return { data: null, error: e }; }
  }

  /* Exchange a one-time token hash from an email for a session.

     This is a POST, and that is the entire point. The old flow put Supabase's
     GET /verify URL straight in the email, and a GET is something any machine
     will do to a link just by looking at it: Outlook, Gmail and most corporate
     mail filters fetch every URL in an incoming message to scan it. The token
     is single use, so the scanner spent it and the person who actually clicked
     got "Email link is invalid or has expired". It was worst for Hotmail and
     Outlook addresses, where the scan is unconditional.

     Now the email points at pluj.us/auth/confirm. A scanner fetching that
     loads a page with a button on it and nothing happens. The token is only
     spent when a human presses the button and this POST runs. */
  async function verifyTokenHash(type, tokenHash) {
    if (IS_PREVIEW) return { data: null, error: { message: "Not available in preview mode." } };
    try {
      const res = await fetch(SUPABASE_URL + "/auth/v1/verify", {
        method: "POST", headers,
        body: JSON.stringify({ type, token_hash: tokenHash }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return { data: null, error: d.error_description || d.msg || d.error || { message: "This link is no longer valid." } };
      return { data: d, error: null };
    } catch (e) { return { data: null, error: e }; }
  }

  /* Set a new password using the recovery access token from the email link. */
  async function updateUserPassword(recoveryToken, newPassword) {
    if (IS_PREVIEW) return { data: null, error: { message: "Not available in preview mode." } };
    try {
      const res = await fetch(SUPABASE_URL + "/auth/v1/user", {
        method: "PUT",
        headers: { ...headers, "Authorization": "Bearer " + recoveryToken },
        body: JSON.stringify({ password: newPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return { data: null, error: d.error || d || { message: "Could not update password." } };
      return { data: d, error: null };
    } catch(e) { return { data: null, error: e }; }
  }

  /* Table helpers */
  function from(table) {
    let _filters = [], _select = "*", _order = "", _limit = "", _single = false;

    return {
      select(cols = "*") { _select = cols; return this; },
      eq(col, val)   { _filters.push(`${col}=eq.${encodeURIComponent(val)}`);  return this; },
      neq(col, val)  { _filters.push(`${col}=neq.${encodeURIComponent(val)}`); return this; },
      in(col, vals)  { _filters.push(`${col}=in.(${vals.map(v=>encodeURIComponent(v)).join(",")})`); return this; },
      order(col, { ascending = true } = {}) { _order = `&order=${col}.${ascending?"asc":"desc"}`; return this; },
      limit(n)       { _limit = `&limit=${n}`; return this; },
      single()       { _single = true; return this; },
      /* A raw PostgREST filter, already encoded ("or=(a.eq.1,b.cs.%7B2%7D)"). */
      filter(raw)    { _filters.push(raw); return this; },

      async get() {
        const q = _filters.length ? "?" + _filters.join("&") + `&select=${_select}` + _order + _limit
                                  : `?select=${_select}` + _order + _limit;
        const { data, error } = await rest("GET", `/${table}${q}`);
        if (_single) return { data: Array.isArray(data) ? data[0] || null : data, error };
        return { data: data || [], error };
      },

      async insert(row, opts) { return rest("POST", `/${table}`, row, opts); },

      async update(row) {
        const q = _filters.length ? "?" + _filters.join("&") : "";
        return rest("PATCH", `/${table}${q}`, row);
      },

      async upsert(row) {
        return fetch(SUPABASE_URL + "/rest/v1/" + table, {
          method: "POST",
          headers: { ...headers, "Authorization": userAuth(), "Prefer": "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(row),
        }).then(r => r.json()).then(d => ({ data: d, error: null })).catch(e => ({ data: null, error: e }));
      },

      async delete() {
        const q = _filters.length ? "?" + _filters.join("&") : "";
        return rest("DELETE", `/${table}${q}`);
      },
    };
  }

  /* Realtime (notifications polling fallback) */
  function channel() { return { on: () => {}, subscribe: () => {} }; }

  /* Call a Postgres function (RPC). Used by the admin moderation actions. */
  async function rpc(fn, args = {}) {
    if (IS_PREVIEW) return { data: null, error: { message: "Not available in preview mode." } };
    try {
      const send = () => fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
        method: "POST",
        headers: { ...headers, "Authorization": userAuth() },
        body: JSON.stringify(args),
      });
      let res = await send();
      if (res.status === 401 && await refreshAuth()) res = await send();
      const data = await res.json().catch(() => null);
      if (!res.ok) { console.error("[Supabase rpc]", fn, data); return { data: null, error: data }; }
      return { data, error: null };
    } catch (e) { return { data: null, error: e }; }
  }

  return { rest, rpc, signUp, signIn, signOut, getUser, from, channel, setAuth, getAuthToken, recover, updateUserPassword, verifyTokenHash };
})();

/* ══════════════════════════════════════════════════════════════════════════════
   PREVIEW MODE ENGINE
   When running inside Claude's artifact sandbox (no external fetch allowed),
   all data operations fall back to window.storage automatically.
   When deployed to Vercel with a real domain, Supabase is used exclusively.
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── Preview storage helpers ─────────────────────────────────────────────── */
async function _pGet(k) {
  try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
}
async function _pSet(k, v) {
  try { await window.storage.set(k, JSON.stringify(v)); return true; } catch { return false; }
}
async function _pDel(k) { try { await window.storage.delete(k); } catch {} }
async function _pGetShared(k) {
  try { const r = await window.storage.get(k, true); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
}
async function _pSetShared(k, v) {
  try { await window.storage.set(k, JSON.stringify(v), true); return true; } catch { return false; }
}

/* ── Preview Auth ────────────────────────────────────────────────────────── */
async function previewSignUp(email, password, meta = {}) {
  const existing = await _pGet("pu:" + email.toLowerCase());
  if (existing) return { data: null, error: { message: "An account with this email already exists." } };
  const id = (meta.role === "admin" ? "ADM-" : meta.role === "vendor" ? "VND-" : "USR-") +
    Math.random().toString(16).slice(2,10).toUpperCase();
  const hash = hashPassword(password);
  const user = { id, email, role: meta.role || "user", ...meta, created_at: new Date().toISOString() };
  await _pSet("pu:" + id, user);
  await _pSet("pu:" + id + ":auth", { password: hash });
  await _pSet("pu:email:" + email.toLowerCase(), id);
  if (meta.role === "vendor") {
    await _pSet("pvp:" + id, { id, verification_status: "pending", ...meta, created_at: new Date().toISOString() });
  }
  return { data: { user: { id, email } }, error: null };
}

async function previewSignIn(email, password) {
  const id = await _pGet("pu:email:" + email.toLowerCase());
  if (!id) return { data: null, error: { message: "No account found with that email." } };
  const auth = await _pGet("pu:" + id + ":auth");
  if (!auth || auth.password !== hashPassword(password))
    return { data: null, error: { message: "Incorrect password." } };
  const token = "preview_" + id + "_" + Date.now();
  await _pSet("pt:" + token, { id, email });
  return { data: { access_token: token, user: { id, email } }, error: null };
}

async function previewGetUser(token) {
  if (!token || !token.startsWith("preview_")) return { data: null, error: { message: "Invalid token" } };
  const session = await _pGet("pt:" + token);
  if (!session) return { data: null, error: { message: "Session expired" } };
  return { data: { id: session.id, email: session.email }, error: null };
}

/* ── Preview REST (table operations) ────────────────────────────────────── */
async function previewRest(method, path, body) {
  /* Parse table name from path like /profiles?... */
  const table = path.split("?")[0].replace("/", "");
  const storageKey = "ptbl:" + table;

  if (method === "GET") {
    const all = (await _pGet(storageKey)) || [];
    /* Apply simple eq filters from query string */
    const qStr = path.includes("?") ? path.split("?")[1] : "";
    const filters = qStr.split("&").filter(f => f.includes("=eq.")).map(f => {
      const [col, val] = f.split("=eq.");
      return { col, val: decodeURIComponent(val) };
    });
    let results = all.filter(row => filters.every(f => String(row[f.col]) === f.val));
    /* Apply limit */
    const limitMatch = qStr.match(/limit=(\d+)/);
    if (limitMatch) results = results.slice(0, parseInt(limitMatch[1]));
    return { data: results, error: null };
  }

  if (method === "POST") {
    const all = (await _pGet(storageKey)) || [];
    const rows = Array.isArray(body) ? body : [body];
    /* Handle upsert */
    const isUpsert = path.includes("resolution=merge-duplicates");
    const updated = [...all];
    rows.forEach(row => {
      const idx = updated.findIndex(r => r.id === row.id);
      if (idx >= 0 && isUpsert) updated[idx] = { ...updated[idx], ...row };
      else updated.push({ ...row, created_at: row.created_at || new Date().toISOString() });
    });
    await _pSet(storageKey, updated);
    return { data: rows, error: null };
  }

  if (method === "PATCH") {
    const all = (await _pGet(storageKey)) || [];
    const qStr = path.includes("?") ? path.split("?")[1] : "";
    const filters = qStr.split("&").filter(f => f.includes("=eq.")).map(f => {
      const [col, val] = f.split("=eq.");
      return { col, val: decodeURIComponent(val) };
    });
    const updated = all.map(row => {
      if (filters.every(f => String(row[f.col]) === f.val)) return { ...row, ...body };
      return row;
    });
    await _pSet(storageKey, updated);
    return { data: updated.filter(row => filters.every(f => String(row[f.col]) === f.val)), error: null };
  }

  if (method === "DELETE") {
    const all = (await _pGet(storageKey)) || [];
    const qStr = path.includes("?") ? path.split("?")[1] : "";
    const filters = qStr.split("&").filter(f => f.includes("=eq.")).map(f => {
      const [col, val] = f.split("=eq.");
      return { col, val: decodeURIComponent(val) };
    });
    const updated = all.filter(row => !filters.every(f => String(row[f.col]) === f.val));
    await _pSet(storageKey, updated);
    return { data: null, error: null };
  }

  return { data: null, error: null };
}

/* ── Preview session helpers ─────────────────────────────────────────────── */
function _saveSessionLocal(session) {
  try {
    if (typeof window !== "undefined" && window.storage) {
      window.storage.set("pluj_session", JSON.stringify(session));
    } else {
      localStorage?.setItem("pluj_session", JSON.stringify(session));
    }
  } catch {}
}
function _loadSessionLocal() {
  try {
    if (IS_PREVIEW && typeof window !== "undefined" && window.storage) {
      /* Sync wrapper — we'll handle async via getCurrentUser */
      return null; /* Preview uses async load */
    }
    const s = localStorage?.getItem("pluj_session");
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}
function _clearSessionLocal() {
  try {
    if (typeof window !== "undefined" && window.storage) window.storage.delete("pluj_session");
    localStorage?.removeItem("pluj_session");
  } catch {}
}

/* Session helpers defined above */

/* ── Password hashing — kept for rate-limit key generation only ─────────────── */
/* Actual password hashing is handled by Supabase Auth (bcrypt server-side)    */
function hashPassword(pwd) {
  let h = 5381;
  for (let i = 0; i < pwd.length; i++) {
    h = Math.imul(h, 33) ^ pwd.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, "0").toUpperCase();
}

/* ── Password helper ────────────────────────────────────────────────────────── */
function sanitizeUser(u) {
  /* Strips ALL credential/sensitive fields before any user object enters React state.
     NEVER let password hash, raw tokens, or auth keys reach component props.          */
  if (!u) return null;
  const { password, _auth, ...safe } = u;
  return safe;
}
export function maskEmail(email) {
  /* Partially masks email for display: "john.doe@gmail.com" → "jo***@gmail.com" */
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return local.slice(0, Math.min(2, local.length)) + "***@" + domain;
}
function maskPhone(phone) {
  /* Shows only last 4 digits: "(713) 555-1234" → "••• ••••1234" */
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return "••• ••••" + digits.slice(-4);
}

/* ══════════════════════════════════════════════════════════════════════════════
   DATA LAYER — Supabase (PostgreSQL + Auth)
   Auth is handled by Supabase Auth (bcrypt, JWT, email verification built-in)
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── Auth ─────────────────────────────────────────────────────────────────── */
async function findUserByEmail(email) {
  /* Used only to check if email exists before signup */
  const { data } = await sb.from("profiles").select("id").eq("email", email.toLowerCase()).single().get();
  return data || null;
}

async function _findUserById(id) {
  if (!id) return null;
  const { data } = await sb.from("profiles").select("*").eq("id", id).single().get();
  return data || null;
}

async function saveUser(u) {
  /* Supabase Auth handles password — we just update the profile table */
  const { password, ...profile } = u;
  await sb.from("profiles").upsert({
    id:             u.id,
    role:           u.type || "user",
    display_name:   u.displayName || u.name,
    full_name:      u.name,
    phone:          u.phone || null,
    dob:            u.dob || null,
    email_verified: u.emailVerified || false,
    phone_verified: u.phoneVerified || false,
    status:         u.status || "active",
    geo_signal:     u.geoSignal || null,
  });
}

async function saveSession(session) {
  /* Save session — window.storage in preview, localStorage in production */
  /* Tell the REST client which user it's acting as, so writes pass RLS. */
  if (!IS_PREVIEW) sb.setAuth(session?.access_token || null, session?.refresh_token || null);
  if (IS_PREVIEW && typeof window !== "undefined" && window.storage) {
    try {
      /* In preview, session is the full previewSignIn response */
      await window.storage.set("pluj_session", JSON.stringify(session));
    } catch {}
  } else {
    _saveSessionLocal(session);
  }
}

async function getSessionUserId() {
  /* Reliably get current user ID in both preview and production */
  if (IS_PREVIEW && typeof window !== "undefined" && window.storage) {
    try {
      const r = await window.storage.get("pluj_session");
      if (!r) return null;
      const session = JSON.parse(r.value);
      if (session?.access_token?.startsWith("preview_")) {
        /* Format: "preview_USR-XXXXXXXX_timestamp" */
        const token = session.access_token;
        const withoutPrefix = token.replace("preview_", "");
        const lastUnderscore = withoutPrefix.lastIndexOf("_");
        return withoutPrefix.slice(0, lastUnderscore);
      }
      return null;
    } catch { return null; }
  }
  const session = _loadSessionLocal();
  return session?.user?.id || null;
}

async function clearSession() {
  let s = null;
  if (IS_PREVIEW && typeof window !== "undefined" && window.storage) {
    try { const r = await window.storage.get("pluj_session"); s = r ? JSON.parse(r.value) : null; } catch {}
  } else { s = _loadSessionLocal(); }
  if (s?.access_token && !IS_PREVIEW) await sb.signOut(s.access_token);
  if (!IS_PREVIEW) sb.setAuth(null, null);
  _clearSessionLocal();
  if (IS_PREVIEW && typeof window !== "undefined" && window.storage) {
    try { await window.storage.delete("pluj_session"); } catch {}
  }
}

/* Headers for our own /api routes. They require a Supabase JWT: the handler
   resolves the caller, confirms they are party to the booking, and takes the
   recipient address from the database. Sent alongside the existing body so
   the previous handler keeps working until the new one is deployed. */
/* Contact details live in the platform_settings table, not in this bundle,
   so the address can be changed in the Supabase table editor without a code
   change, a rebuild or a deploy. These are the fallbacks used before the first
   fetch resolves, or if it fails. */
const CONTACT_FALLBACK = Object.freeze({
  contact_email:    "info@pluj.us",
  contact_location: "Houston, TX",
  support_hours:    "We reply within 1 business day",
});
let _platformSettings = { ...CONTACT_FALLBACK };

async function loadPlatformSettings() {
  if (IS_PREVIEW) return _platformSettings;
  try {
    const { data } = await sb.from("platform_settings").select("key, value").get();
    (data || []).forEach(r => {
      if (r && r.key && r.value) _platformSettings[r.key] = r.value;
    });
  } catch { /* keep the fallbacks */ }
  return _platformSettings;
}

function apiAuthHeaders() {
  const h = { "Content-Type": "application/json" };
  const t = sb.getAuthToken ? sb.getAuthToken() : null;
  if (t) h.Authorization = "Bearer " + t;
  return h;
}

export async function loadSession() {
  /* Returns the saved session object or null */
  return _loadSessionLocal();
}

async function getCurrentUser() {
  /* Returns user profile — handles both preview mode and real Supabase */
  let session = _loadSessionLocal();

  /* In preview mode, load session from window.storage async */
  if (IS_PREVIEW && typeof window !== "undefined" && window.storage) {
    try {
      const r = await window.storage.get("pluj_session");
      session = r ? JSON.parse(r.value) : null;
    } catch { session = null; }
  }

  if (!session?.access_token) return null;

  /* On a fresh page load saveSession() isn't called again — rehydrate the
     REST client's auth token from the restored session so writes pass RLS. */
  if (!IS_PREVIEW) sb.setAuth(session.access_token, session.refresh_token);

  /* Preview mode — load from window.storage tables */
  if (IS_PREVIEW) {
    const token = session.access_token;
    const sessionData = await _pGet("pt:" + token);
    if (!sessionData) return null;
    const userId = sessionData.id;
    const profile = await _pGet("pu:" + userId);
    if (!profile) return null;
    const vendorProfile = profile.role === "vendor" ? await _pGet("pvp:" + userId) : null;
    return {
      id:            userId,
      type:          profile.role || "user",
      name:          vendorProfile?.biz_legal || vendorProfile?.business_name || profile.full_name || profile.display_name,
      displayName:   profile.display_name || profile.full_name,
      email:         profile.email || sessionData.email,
      phone:         profile.phone || null,
      dob:           profile.dob || null,
      emailVerified: profile.email_verified || false,
      phoneVerified: false,
      status:        vendorProfile?.verification_status || profile.status || "active",
      bizLegal:      vendorProfile?.biz_legal || null,
      bizCity:       vendorProfile?.biz_city || null,
      bizState:      vendorProfile?.biz_state || null,
      serviceAreas:  vendorProfile?.service_areas || null,
      schedule:      vendorProfile?.schedule || null,
      capacity:      vendorProfile?.capacity || null,
      travelMiles:   vendorProfile?.travel_miles || null,
      createdAt:     Date.now(),
    };
  }

  try {
    const { data: authUser } = await sb.getUser(session.access_token);
    if (!authUser?.id) return null;
    const { data: profile } = await sb.from("profiles").select("*").eq("id", authUser.id).single().get();
    if (!profile) return null;
    /* Build user object matching app's expected shape */
    let vendorData = null;
    if (profile.role === "vendor") {
      const { data: vp } = await sb.from("vendor_profiles").select("*").eq("id", profile.id).single().get();
      vendorData = vp;
    }
    return {
      id:            profile.id,
      type:          profile.role,
      blocked:       profile.status === "blocked",
      blockedReason: profile.blocked_reason || null,
      name:          vendorData?.biz_legal || vendorData?.business_name || profile.full_name || profile.display_name,
      displayName:   profile.display_name || profile.full_name,
      email:         authUser.email,
      phone:         profile.phone,
      dob:           profile.dob,
      emailVerified: profile.email_verified,
      phoneVerified: profile.phone_verified,
      status:        vendorData?.verification_status || profile.status,
      bizLegal:      vendorData?.biz_legal,
      bizType:       vendorData?.biz_type,
      bizPhone:      vendorData?.biz_phone,
      bizCity:       vendorData?.biz_city,
      bizState:      vendorData?.biz_state,
      serviceAreas:  vendorData?.service_areas,
      schedule:      vendorData?.schedule,
      capacity:      vendorData?.capacity,
      travelMiles:   vendorData?.travel_miles,
      projectSize:   vendorData?.project_size,
      createdAt:     new Date(profile.created_at).getTime(),
    };
  } catch(e) { console.error("[getCurrentUser]", e); return null; }
}

/* ── Vendor application workflow ─────────────────────────────────────────── */
/* ── Live marketplace listings ─────────────────────────────────────────────
   Fetches APPROVED vendors from the database and maps them into the same
   shape the marketplace grid uses for the built-in demo vendors, so real
   sign-ups appear alongside them in search, filters and category pages.     */
const LISTING_PLACEHOLDER = "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&q=80";

/* photos is a jsonb column. PostgREST normally returns it as an array, but a
   row written as a JSON string (or an older row) can arrive as text — parse
   defensively so listings never fall back to the placeholder by mistake. */
/* ── Service pricing options (packages) ──────────────────────────────────────
   Stored as JSON on vendor_services.packages:
     [{ name, description, price, hours, requirements }, ...]
   description   what's included
   hours         how long the option lasts (music, rentals, food trucks…), or null
   requirements  what the host must provide or know (power, space, access…)
   A price of null / "" / 0 means the vendor hasn't finished that option, so it
   stays hidden from customers — visiblePackages() is the single gate for that
   rule, used by every customer-facing surface. */
export function parsePackages(raw) {
  let arr = raw;
  if (typeof raw === "string" && raw.trim()) {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(p => p && typeof p === "object").map(p => ({
    name:        (p.name || "").toString(),
    description: (p.description || "").toString(),
    price:       p.price === "" || p.price == null ? null : Number(p.price),
    hours:       p.hours === "" || p.hours == null || !(Number(p.hours) > 0) ? null : Number(p.hours),
    requirements:(p.requirements || "").toString(),
  }));
}

/* "4 hours", "1 day", "3 days", "1.5 hours". Up to 23 hours reads as hours. */
export function fmtHours(h) {
  const n = Number(h);
  if (!(n > 0)) return "";
  if (n >= 24 && n % 24 === 0) { const d = n / 24; return d === 7 ? "1 week" : `${d} day${d === 1 ? "" : "s"}`; }
  return `${n} hour${n === 1 ? "" : "s"}`;
}

/* How many subcategories a listing may pick. Rental companies usually rent
   many kinds of things, so Rentals has no practical cap; elsewhere 3 keeps
   the filters meaningful. The database trigger applies the same rule. */
export function subcatMax(category) { return category === "rentals" ? 20 : 3; }

/* Categories where time is part of the offer (a set, a rental period, a
   truck's service window). The editor asks for it first on these. */
export const TIMED_CATEGORIES = ["music", "rentals", "food", "av", "logistics", "production", "photo", "staff", "beauty", "transport", "kids", "other"];

/* True when an option is complete enough to show a customer. */
function packageHasPrice(p) {
  return p && Number.isFinite(p.price) && p.price > 0;
}

/* Only the options customers may see. */
function visiblePackages(raw) {
  return parsePackages(raw).filter(packageHasPrice);
}

/* Cheapest visible option, used for the "from $X" price on cards. */
function cheapestPackage(raw) {
  const vis = visiblePackages(raw);
  if (!vis.length) return null;
  return vis.reduce((a, b) => (b.price < a.price ? b : a));
}

/* Add-ons: optional extras a customer can add on top of a listing. */
export function parseAddons(raw) {
  let arr = raw;
  if (typeof raw === "string" && raw.trim()) {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(a => a && typeof a === "object" && (a.name || "").toString().trim())
    .map(a => ({ name: (a.name || "").toString(), price: a.price === "" || a.price == null ? 0 : Number(a.price) || 0 }));
}

export function parsePhotos(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch { /* not JSON — maybe a bare URL */ }
    if (raw.startsWith("http")) return [raw];
  }
  return [];
}

function dbVendorToCard(v) {
  const photos = parsePhotos(v.photos);
  const price  = v.price_value != null ? Number(v.price_value) : null;
  return {
    id:          "db_" + v.id,          // string id avoids clashing with demo numeric ids
    dbId:        v.id,
    vendorId:    v.id,
    isLive:      true,                  // marks a real, database-backed listing
    name:        v.business_name || v.biz_legal || "New vendor",
    cat:         v.category || "food",
    serviceType: v.service_type || "",
    sub:         v.subcategory || null,
    type:        v.service_type || v.category || "Service",
    city:        [v.biz_city, v.biz_state].filter(Boolean).join(", ") || "Houston, TX",
    rating:      0,
    revCount:    0,
    price:       price != null ? ("$" + price.toLocaleString()) : "Contact for pricing",
    pv:          price != null ? price : 0,
    img:         photos[0] || LISTING_PLACEHOLDER,
    photos:      photos.length ? photos : [LISTING_PLACEHOLDER],
    blurb:       v.description || "This vendor hasn't added a description yet.",
    tags:        (v.service_areas ? [v.service_areas] : []).concat(v.capacity ? [v.capacity] : []),
    instant:     false,
    feat:        false,
    yearsInBiz:  v.years_in_biz || 0,
    travelMiles: v.travel_miles || 0,
    capacity:    v.capacity || "",
    projectSize: v.project_size || "",
    bizCity:     v.biz_city || "",
    bizState:    v.biz_state || "",
    bizAddress:  v.biz_address || "",
    bizZip:      v.biz_zip || "",
    /* was `s.service_areas || v.service_areas` — there is no `s` in this
       function's scope (copy-paste from dbServiceToCard below). ES modules
       are strict mode, so this threw a ReferenceError the moment the legacy
       one-card-per-vendor fallback ran, blanking the marketplace grid. */
    serviceAreas:v.service_areas || "",
    schedule:    v.schedule || "",
    eventTypes:  parseEventTypes(v.event_types),
    highlights:  [],
  };
}

/* Hard ceiling on one catalogue read. Nine listings today, so this changes
   nothing now — that is the point of setting it now rather than after it hurts.
   Without a limit the query says "every approved service row there has ever
   been", and PostgREST will happily answer that: the browser parses the lot,
   builds a card object for each, and holds them all. The cost lands on the
   visitor's phone and on your Supabase egress, and it grows with your success.

   500 is chosen to be far above any plausible Houston catalogue for a long
   while and far below a number that would hurt a phone. If it is ever actually
   reached, the honest fix is server-side filtering and paging (see the note on
   PAGE_SIZE below), not a bigger number here. */
const VENDOR_FETCH_LIMIT = 500;

async function getApprovedVendors() {
  if (IS_PREVIEW) return [];
  /* Preferred path: one card per SERVICE (a vendor can offer many).
     Falls back to the legacy one-card-per-vendor shape when the service join
     yields nothing (e.g. vendor-services not set up, or the embedded profile
     isn't readable for this visitor). */
  const { data, error } = await sb.from("vendor_services")
    /* vendor_public, not vendor_profiles: the base table carries the licence
       number, EIN, managing members and business phone, and the anon key that
       would read them ships in this bundle. The `vendor_profiles:` alias keeps
       the response key unchanged so nothing downstream has to know. */
    .select("*, vendor_profiles:vendor_public!inner(*)")
    .order("created_at", { ascending: false })
    .limit(VENDOR_FETCH_LIMIT)
    .get();
  if (!error && Array.isArray(data) && data.length) {
    const cards = data
      .filter(s => s.vendor_profiles && s.vendor_profiles.verification_status === "approved")
      .map(s => dbServiceToCard(s, s.vendor_profiles));
    console.log(`[PLUJ] getApprovedVendors: ${data.length} service row(s) → ${cards.length} card(s)`);
    if (cards.length) return cards;
    console.warn("[PLUJ] getApprovedVendors: service rows had no readable/approved vendor_profiles — trying legacy path.");
  } else if (error) {
    console.warn("[PLUJ] vendor_services unavailable — using legacy listings. Run vendor-services-setup.sql.", error);
  }
  /* vendor_public here too. The view already contains only approved vendors,
     so the .eq below is now redundant, but harmless and left for clarity. */
  const { data: legacy, error: legErr } = await sb.from("vendor_public")
    .select("*")
    .eq("verification_status", "approved")
    .order("created_at", { ascending: false })
    .limit(VENDOR_FETCH_LIMIT)
    .get();
  if (legErr) console.warn("[PLUJ] getApprovedVendors legacy read failed:", legErr, "— check vendor_profiles public read policy (run vendor-public-read.sql).");
  const cards = (legacy || []).map(dbVendorToCard);
  console.log(`[PLUJ] getApprovedVendors: legacy path → ${cards.length} card(s)`);
  return cards;
}

/* ── Vendor services (many per vendor) ───────────────────────────────────── */

/* A guest count on its way to the database: a whole number, or null for "not
   stated". Blank and unparseable both mean not stated — 0 does not, so this
   cannot be the usual `parseInt(x) || null`, which would quietly discard a
   legitimate minimum of 0. */
function toGuestCount(x) {
  if (x === "" || x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/* Every service belonging to this vendor, including inactive ones. */
export async function getMyServices(vendorId) {
  if (IS_PREVIEW) return [];
  const { data, error } = await sb.from("vendor_services")
    .select("*").eq("vendor_id", vendorId)
    .order("created_at", { ascending: true }).get();
  if (error) return { __error: "Services aren't set up yet — run vendor-services-setup.sql in Supabase." };
  return data || [];
}

export async function saveService(vendorId, svc) {
  const row = {
    vendor_id:    vendorId,
    category:     svc.category || "food",
    /* Up to three (any number for Rentals), within this listing's category.
       The database trigger drops blanks, de-duplicates, caps and mirrors the first entry back into
       `subcategory`, so we deliberately do not repeat that logic here. */
    subcategories: Array.isArray(svc.subcategories)
                     ? svc.subcategories.filter(Boolean).slice(0, subcatMax(svc.category))
                     : (svc.subcategory ? [svc.subcategory] : []),
    subcategory:  svc.subcategory || null,
    name:         svc.name || null,
    service_type: svc.service_type || null,
    description:  svc.description || null,
    price_value:  svc.price_value === "" || svc.price_value == null ? null : Number(svc.price_value),
    /* Capacity is a range, not a sentence. `capacity` itself is deliberately
       NOT sent: a database trigger derives that text from these two numbers,
       so the label and the numbers can never drift apart. */
    capacity_min: toGuestCount(svc.capacity_min),
    capacity_max: toGuestCount(svc.capacity_max),
    /* How long the starting price lasts, and what each extra hour costs. */
    duration_hours:   svc.duration_hours === "" || svc.duration_hours == null || !(Number(svc.duration_hours) > 0)
                        ? null : Number(svc.duration_hours),
    extra_hour_price: svc.extra_hour_price === "" || svc.extra_hour_price == null || !(Number(svc.extra_hour_price) >= 0)
                        ? null : Number(svc.extra_hour_price),
    photos:       svc.photos || [],
    /* Keep incomplete options — they stay private until priced. */
    packages:     parsePackages(svc.packages),
    active:       svc.active !== false,
    offsite:      svc.offsite === true,
    travel_miles: svc.category === "places" ? null : (svc.travel_miles === "" || svc.travel_miles == null ? null : parseInt(svc.travel_miles) || null),
    service_areas: svc.service_areas || null,
    addons:       JSON.stringify(svc.addons || []),
    avail_days:   JSON.stringify(svc.avail_days || []),
    avail_blocks: JSON.stringify(svc.avail_blocks || []),
    max_per_day:  svc.max_per_day == null || svc.max_per_day === "" ? 1 : (parseInt(svc.max_per_day) || 1),
    gap_hours:    svc.gap_hours == null || svc.gap_hours === "" ? null : (parseInt(svc.gap_hours) || null),
    min_notice_hours: svc.min_notice_hours == null || svc.min_notice_hours === ""
                        ? 0 : (parseInt(svc.min_notice_hours) || 0),
    simultaneous: svc.simultaneous === true,
    instant_book: svc.instant_book === true,
    instant_terms_accepted_at: svc.instant_book === true ? (svc.instant_terms_accepted_at || new Date().toISOString()) : (svc.instant_terms_accepted_at || null),
    schedule:     composeSchedule(svc.avail_days || [], svc.avail_blocks || []) || null,
    updated_at:   new Date().toISOString(),
  };
  const { error } = svc.id
    ? await sb.from("vendor_services").eq("id", svc.id).eq("vendor_id", vendorId).update(row)
    : await sb.from("vendor_services").insert(row);
  if (error) return { ok: false, error: error.message || "Could not save this service." };
  /* Whether a vendor is editing or listing for the first time is the difference
     between an active supplier and a stalled signup. */
  track("vendor_listing_saved", { mode: svc.id ? "edit" : "new", cat: row.category || "" });
  return { ok: true };
}

export async function deleteService(vendorId, serviceId) {
  const { error } = await sb.from("vendor_services")
    .eq("id", serviceId).eq("vendor_id", vendorId).delete();
  if (error) return { ok: false, error: error.message || "Could not delete this service." };
  return { ok: true };
}

/* Map a vendor_services row (+ its parent business) to a marketplace card.
   Business-level facts (address, travel, verification) come from the vendor;
   offering-level facts (category, price, photos) come from the service. */
/* ── Reviews (persisted, booking-gated, two-sided) ───────────────────────────
   Users review vendors and vendors review users, but only after a confirmed
   booking. Reviews are public; the subject may reply. See reviews-setup.sql. */
export async function getReviewsAbout(subjectId) {
  if (IS_PREVIEW || !subjectId) return [];
  const { data, error } = await sb.from("reviews")
    .select("*").eq("subject_id", subjectId)
    .order("created_at", { ascending: false }).get();
  if (error) { console.warn("[PLUJ] getReviewsAbout:", error); return []; }
  return (data || []).map(r => ({
    id: r.id, bookingId: r.booking_id, authorId: r.author_id, subjectId: r.subject_id,
    direction: r.direction, rating: r.rating, body: r.body, text: r.body,
    /* Only ever the name the author agreed to publish. It is stored on the
       review itself, so showing it needs no lookup against profiles — which
       anonymous visitors cannot read, and should not be able to. */
    authorName: r.show_name ? (r.author_name || null) : null,
    showName: r.show_name === true,
    reply: r.reply, replyAt: r.reply_at, createdAt: r.created_at,
    dims: {
      responsiveness: r.r_responsiveness, quality: r.r_quality, punctuality: r.r_punctuality,
      recommend: r.r_recommend, rebook: r.r_rebook,
    },
  }));
}

/* Average rating + count from a list of persisted reviews. Higher = better. */
export function ratingSummary(reviews) {
  const list = (reviews || []).filter(r => Number.isFinite(r.rating));
  if (!list.length) return { avg: null, count: 0 };
  const avg = list.reduce((a, r) => a + r.rating, 0) / list.length;
  return { avg: Math.round(avg * 10) / 10, count: list.length };
}

/* The CONFIRMED booking, whose event date has passed, that entitles authorId
   to review subjectId in this direction: its id, or null. Client gate for UX;
   the RLS policy (sql/2026-10-08-blind-reviews-checks-languages.sql) is the
   real enforcement, and it needs this booking id on the review. */
async function canReviewSubject(authorId, subjectId, direction) {
  if (IS_PREVIEW || !authorId || !subjectId) return null;
  const col = direction === "vendor_to_user"
    ? { self: "vendor_id", other: "user_id" }
    : { self: "user_id",   other: "vendor_id" };
  const { data } = await sb.from("booking_requests")
    .select("id, status, event_date").eq(col.self, authorId).eq(col.other, subjectId).get();
  const today = new Date().toISOString().slice(0, 10);
  const b = (data || []).filter(x => isConfirmedStatus(x.status) && x.event_date && x.event_date <= today)
    .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)))[0];
  return b ? b.id : null;
}

/* Existing review by this author about this subject (to avoid duplicates). */
export async function existingReview(authorId, subjectId, direction) {
  if (IS_PREVIEW || !authorId) return null;
  const { data } = await sb.from("reviews")
    .select("*").eq("author_id", authorId).eq("subject_id", subjectId)
    .eq("direction", direction).get();
  const r = (data || [])[0];
  return r ? { id: r.id, rating: r.rating, body: r.body, reply: r.reply } : null;
}

export async function submitReviewDB({ bookingId, authorId, subjectId, direction, rating, body, dims,
                                showName, authorName }) {
  if (IS_PREVIEW) return { ok: true };
  const d = dims || {};
  /* Take a first name only, and only when the author asked for it. Splitting
     on whitespace keeps a surname out of a public review even if the account
     holds a full legal name. */
  const firstName = String(authorName || "").trim().split(" ").filter(Boolean)[0] || "";
  const publish   = showName === true && firstName.length > 0;
  const { error } = await sb.from("reviews").insert({
    booking_id: bookingId || null, author_id: authorId, subject_id: subjectId,
    direction, rating: Number(rating), body: body || null,
    show_name: publish,
    author_name: publish ? firstName : null,
    r_responsiveness: d.responsiveness != null ? Number(d.responsiveness) : null,
    r_quality:        d.quality != null ? Number(d.quality) : null,
    r_punctuality:    d.punctuality != null ? Number(d.punctuality) : null,
    r_recommend:      d.recommend != null ? Number(d.recommend) : null,
    r_rebook:         d.rebook != null ? Number(d.rebook) : null,
  });
  if (error) {
    const m = String(error.message || "");
    if (/row-level security|violates/i.test(m) || !m)
      return { ok: false, error: "You can review only after the event, for a booking that was confirmed." };
    if (/duplicate|unique/i.test(m)) return { ok: false, error: "You've already reviewed this booking." };
    return { ok: false, error: m };
  }
  return { ok: true };
}

async function replyToReviewDB(reviewId, subjectId, reply) {
  if (IS_PREVIEW) return { ok: true };
  const { error } = await sb.from("reviews")
    .eq("id", reviewId).eq("subject_id", subjectId)
    .update({ reply: reply || null, reply_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message || "Could not post reply." };
  return { ok: true };
}

/* Fetch a single vendor's full business profile by id (public — read policy
   allows anyone to see approved vendors). Used by the customer-facing profile
   page so it shows everything the vendor entered, not just the clicked card. */
async function getVendorProfileById(vendorId) {
  if (IS_PREVIEW || !vendorId) return null;
  /* vendor_public: this is the customer-facing profile page, so it must not be
     able to serve the vendor's licence number, EIN, members or phone. */
  const { data, error } = await sb.from("vendor_public").select("*").eq("id", vendorId).single().get();
  if (error) console.warn("[PLUJ] getVendorProfileById failed for", vendorId, "→", error, "(vendor_profiles may need a public read policy — run vendor-public-read.sql)");
  else if (!data) console.warn("[PLUJ] getVendorProfileById: no row for", vendorId);
  return data || null;
}

/* All of a vendor's ACTIVE services (public read policy returns active services
   of approved vendors). These become the "offerings" a customer can pick from. */
async function getPublicServices(vendorId) {
  if (IS_PREVIEW || !vendorId) return [];
  const { data, error } = await sb.from("vendor_services")
    .select("*").eq("vendor_id", vendorId)
    .order("created_at", { ascending: true }).get();
  if (error) { console.warn("[PLUJ] getPublicServices failed for", vendorId, "→", error, "(vendor_services may need a public read policy — run vendor-public-read.sql)"); return []; }
  const list = (data || []).filter(s => s.active !== false);
  console.log(`[PLUJ] getPublicServices: vendor ${vendorId} → ${list.length} active service(s)`);
  return list;
}

/* Readable labels for a category id / a service's subcategory. */
function catLabelOf(id) { return (CATEGORIES.find(c => c.id === id) || {}).label || id || ""; }
function subLabelOf(svc) {
  const sub = (CAT_SUBS[svc?.category] || []).find(x => x.id === svc?.subcategory);
  return sub ? sub.l : "";
}
/* Display name for an offering. */
function serviceLabel(svc) {
  return svc?.name || svc?.service_type || subLabelOf(svc) || catLabelOf(svc?.category) || "Service";
}

function dbServiceToCard(s, v) {
  const photos = parsePhotos(s.photos);
  const vPhotos = parsePhotos(v.photos);
  const pics = photos.length ? photos : vPhotos;
  const price = s.price_value != null ? Number(s.price_value) : null;
  /* Pricing options the customer may see. When a service has them, the card
     shows the cheapest as its "from" price and pre-selects it. */
  const pkgs = visiblePackages(s.packages);
  const cheapest = cheapestPackage(s.packages);
  const shownPrice = cheapest ? cheapest.price : price;
  /* Readable label: "Wedding DJ" → subcategory name → category name. Keeps
     multiple listings from the same business clearly distinguishable. */
  const subLabel = (CAT_SUBS[s.category] || []).find(x => x.id === s.subcategory)?.l;
  const catLabel = (CATEGORIES.find(c => c.id === s.category) || {}).label;
  /* Each service's own name comes first so a vendor's many services (e.g. three
     food trucks) are individually identifiable; falls back to type/category. */
  const label = s.name || s.service_type || subLabel || catLabel || "Service";
  const kindLabel = s.service_type || subLabel || catLabel || "";
  return {
    id:          "svc_" + s.id,
    dbId:        v.id,
    vendorId:    v.id,               // bookings still address the VENDOR account
    serviceId:   s.id,               // which offering was picked
    isLive:      true,
    name:        v.business_name || v.biz_legal || "New vendor",
    serviceName: label,
    serviceType: kindLabel,
    cat:         s.category || "food",
    sub:         s.subcategory || null,          // primary, used for the label
    /* Every subcategory this listing claims, so a food truck that also does
       catering is found under both. Falls back to the single value for
       listings created before this existed. */
    subs:        Array.isArray(s.subcategories) && s.subcategories.length
                   ? s.subcategories
                   : (s.subcategory ? [s.subcategory] : []),
    offsite:     s.offsite === true,
    addons:      parseAddons(s.addons),
    availDays:   s.avail_days || null,
    availBlocks: s.avail_blocks || null,
    schedule:    s.schedule || v.schedule || "",
    maxPerDay:   s.max_per_day == null ? 1 : Number(s.max_per_day),
    gapHours:    s.gap_hours == null ? null : Number(s.gap_hours),
    minNoticeHours: s.min_notice_hours == null ? 0 : Number(s.min_notice_hours),
    simultaneous: s.simultaneous === true,
    type:        (s.name && kindLabel) ? `${label} · ${kindLabel}` : (subLabel && s.service_type ? `${label} · ${subLabel}` : label),
    city:        [v.biz_city, v.biz_state].filter(Boolean).join(", ") || "Houston, TX",
    rating:      0,
    revCount:    0,
    price:       shownPrice != null ? ((cheapest ? "From $" : "$") + shownPrice.toLocaleString()) : "Contact for pricing",
    pv:          shownPrice != null ? shownPrice : 0,
    packages:    pkgs,
    selectedPackage: cheapest,
    img:         pics[0] || LISTING_PLACEHOLDER,
    photos:      pics.length ? pics : [LISTING_PLACEHOLDER],
    blurb:       s.description || v.description || "This vendor hasn't added a description yet.",
    tags:        (v.service_areas ? [v.service_areas] : []).concat(s.capacity || v.capacity ? [s.capacity || v.capacity] : []),
    /* Instant booking: confirmed on the spot for open dates 3+ days away. */
    instant:     s.instant_book === true,
    /* Trust badges from vendor_public: what PLUJ checked by hand. */
    langs:       Array.isArray(v.languages) ? v.languages : ["en"],
    insured:     v.coi_checked === true,
    dshsOk:      v.dshs_checked === true,
    tabcOk:      v.tabc_checked === true,
    feat:        false,
    yearsInBiz:  v.years_in_biz || 0,
    travelMiles: (s.travel_miles != null ? s.travel_miles : v.travel_miles) || 0,
    capacity:    s.capacity || v.capacity || "",
    /* The numbers behind that label. A listing row always carries the pair, so
       `capacityKnown` is true even when both are null — which means "no stated
       limit", and is a different thing from a card that never had the columns. */
    capacityMin: s.capacity_min != null ? s.capacity_min : null,
    capacityMax: s.capacity_max != null ? s.capacity_max : null,
    capacityKnown: Object.prototype.hasOwnProperty.call(s, "capacity_max"),
    bizCity:     v.biz_city || "",
    bizState:    v.biz_state || "",
    bizAddress:  v.biz_address || "",
    bizZip:      v.biz_zip || "",
    serviceAreas:s.service_areas || v.service_areas || "",
    eventTypes:  parseEventTypes(v.event_types),
    highlights:  [],
  };
}

/* ── Vendor listing: load / save / photo upload ────────────────────────────
   Signup already captures capacity, project size, years in business, travel
   radius and service areas — those are loaded here so the editor is
   pre-filled ("autopopulated") rather than blank.                          */
export async function getMyListing(vendorId) {
  if (IS_PREVIEW) return null;
  const { data } = await sb.from("vendor_profiles").select("*").eq("id", vendorId).single().get();
  return data || null;
}

async function saveMyListing(vendorId, patch) {
  if (IS_PREVIEW) return { ok: true, error: null };
  const { data, error } = await sb.from("vendor_profiles").eq("id", vendorId).update(patch);
  if (error) return { ok: false, error: error.message || "Could not save changes." };
  if (Array.isArray(data) && data.length === 0) {
    return { ok: false, error: "Nothing was saved — you may need to sign in again (permission denied)." };
  }
  return { ok: true, error: null };
}

/* The legal information still missing before this vendor may post a listing
   (empty = complete). The database refuses a listing while anything is
   missing; this is only so the dashboard can say so before they start. */
export async function getLegalMissing(vendorId) {
  if (IS_PREVIEW || !vendorId) return [];
  const { data, error } = await sb.rpc("vendor_legal_missing", { p_vendor: vendorId });
  if (error) { console.warn("[PLUJ] vendor_legal_missing:", error); return null; }
  return Array.isArray(data) ? data : [];
}

export const BIZ_TYPES = ["Sole proprietor", "LLC", "Corporation", "Partnership", "Nonprofit"];

/* Uploads an image to Supabase Storage bucket "vendor-photos" and returns its
   public URL. Requires the bucket to exist and be public (see setup SQL). */
export async function uploadVendorPhoto(vendorId, file, accessToken) {
  if (IS_PREVIEW) return { url: null, error: "Photo upload isn't available in preview mode." };
  if (file.size > 5 * 1024 * 1024) return { url: null, error: `${file.name} is larger than 5 MB.` };
  const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${vendorId}/${Date.now()}_${Math.random().toString(16).slice(2,8)}.${ext}`;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/vendor-photos/${path}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON,
        "Authorization": "Bearer " + (accessToken || SUPABASE_ANON),
        "Content-Type": file.type || "image/jpeg",
        "x-upsert": "true",
      },
      body: file,
    });
    if (!res.ok) {
      const t = await res.text().catch(()=> "");
      return { url: null, error: `Upload failed (${res.status}). ${t.slice(0,120)}` };
    }
    return { url: `${SUPABASE_URL}/storage/v1/object/public/vendor-photos/${path}`, error: null };
  } catch (e) {
    return { url: null, error: e.message || "Upload failed." };
  }
}

/* DELETED 23 Sep 2026 — submitVendorApp.

   It wrote the vendor application from the browser, using the session signUp
   used to return. With email confirmation on there is no session at that
   moment, so this would have run as anon and been refused by RLS — quietly,
   because nothing checked the result. The vendor would have been told they had
   applied and the application would have been empty.

   handle_new_user now writes the same columns from raw_user_meta_data, before
   any session exists. One writer, server-side, where it cannot be skipped.

   For reference, the columns it used to set: business_name, biz_legal,
   biz_type, biz_license, ein, years_in_biz, biz_phone, biz_website,
   managing_members, biz_address, biz_city, biz_state, biz_zip, service_areas,
   schedule, category, capacity, travel_miles, project_size, doc_file_name,
   photo_count, photos, verification_status. The trigger sets all of these
   except photo_count and photos, which now start empty and are filled when the
   vendor uploads from their dashboard. */

/* ── ADMIN MODERATION ─────────────────────────────────────────────────────
   Every action is authorised server-side by is_admin(), so a non-admin calling
   these gets rejected by the database regardless of what the UI allows. */
export async function adminListAccounts() {
  if (IS_PREVIEW) return [];
  const { data, error } = await sb.rpc("admin_list_accounts");
  if (error) { console.warn("[PLUJ] admin_list_accounts failed — run admin-moderation-setup.sql", error); return []; }
  return (data || []).map(r => ({
    id: r.id, email: r.email, role: r.role,
    displayName: r.display_name, businessName: r.business_name,
    accountStatus: r.account_status, vendorStatus: r.vendor_status,
    listings: r.listings, bookings: r.bookings, createdAt: r.created_at,
  }));
}

export async function adminSendMessage(targetId, kind, subject, message) {
  if (IS_PREVIEW) return { ok: true };
  const { error } = await sb.rpc("admin_message", {
    target_id: targetId, kind, subject: subject || "", message,
  });
  if (error) return { ok: false, error: error.message || "Could not send." };
  return { ok: true };
}

export async function adminSetBlocked(targetId, blocked, reason) {
  if (IS_PREVIEW) return { ok: true };
  const { error } = await sb.rpc("admin_set_blocked", {
    target_id: targetId, blocked, reason: reason || null,
  });
  if (error) return { ok: false, error: error.message || "Could not update." };
  return { ok: true };
}

export async function adminDeleteAccount(targetId) {
  if (IS_PREVIEW) return { ok: true };
  const { error } = await sb.rpc("admin_delete_account", { target_id: targetId });
  if (error) return { ok: false, error: error.message || "Could not delete." };
  return { ok: true };
}

/* ── MAINTENANCE MODE (the on/off switch) ─────────────────────────────────
   site_status() is deliberately a function and not a table read. Turning the
   site off revokes anonymous SELECT on every table and view in public, so a
   settings row would be unreadable at exactly the moment we need to read it —
   the visitor would get a 401 and no way to tell "closed" from "broken". A
   SECURITY DEFINER function is neither a table nor a view, so that revoke
   never touches it and it keeps answering while everything else is shut.

   Fails OPEN on purpose. If this call errors we show the site rather than a
   maintenance page: a network blip should not black out a live marketplace,
   and the worst case of failing open is an empty-looking site, which is what
   private mode produces anyway. */
export async function getSiteStatus() {
  if (IS_PREVIEW) return { private: false, since: null };
  const { data, error } = await sb.rpc("site_status");
  if (error) { console.warn("[PLUJ] site_status failed — assuming open", error); return { private: false, since: null }; }
  return { private: !!(data && data.private), since: data ? data.since : null };
}

/* Admin-only, enforced by is_admin() inside both functions. */
export async function setSitePublic(open) {
  if (IS_PREVIEW) return { ok: true, message: "Preview mode." };
  const { data, error } = await sb.rpc(open ? "site_go_public" : "site_go_private");
  if (error) return { ok: false, error: error.message || "Could not change site status." };
  return { ok: true, message: typeof data === "string" ? data : "" };
}

export async function getVendorApps() {
  const { data } = await sb.from("vendor_profiles")
    .select("id, business_name, biz_legal, category, verification_status, created_at, biz_city, biz_state, photo_count, doc_file_name, description, rejection_reason")
    .order("created_at", { ascending: false })
    .get();
  return (data || []).map(v => ({
    vendorId:    v.id,
    name:        v.biz_legal || v.business_name,
    category:    v.category,
    status:      v.verification_status,
    submittedAt: new Date(v.created_at).getTime(),
    docFileName: v.doc_file_name,
    photoCount:  v.photo_count,
    description: v.description || "",
    reason:      v.rejection_reason || "",
  }));
}

/* Everything the admin needs to decide on one vendor application, in one go:
   the business record, the person behind it, and the listings they've added.
   Only admins can read other vendors' rows (RLS: is_admin()), so for anyone
   else this comes back empty. */
export async function getVendorApplication(vendorId) {
  const [vp, prof, svcs] = await Promise.all([
    sb.from("vendor_profiles").select("*").eq("id", vendorId).single().get(),
    sb.from("profiles")
      .select("id, full_name, display_name, email, phone, dob, email_verified, status, created_at, geo_signal, terms_accepted_at, responsibility_accepted_at, blocked_reason")
      .eq("id", vendorId).single().get(),
    sb.from("vendor_services")
      .select("id, name, category, subcategory, service_type, description, price_value, photos, active, created_at")
      .eq("vendor_id", vendorId).order("created_at", { ascending: true }).get(),
  ]);
  if (vp.error || !vp.data) {
    return { ok: false, error: (vp.error && vp.error.message) || "Could not load this application." };
  }
  return {
    ok: true,
    vendor:   vp.data,
    profile:  prof.data || {},
    listings: Array.isArray(svcs.data) ? svcs.data : [],
  };
}

/* ── Payments (Stripe; paid in full, locked in the vendor's Stripe balance) ──
   Server side: supabase/functions/payments* and sql/2026-10-07-payments.sql
   (section 13). The host pays everything when the vendor confirms; PLUJ
   releases it to the vendor's bank in three parts (a week before, the day
   after, when the host approves; 30/50/20, or 30/20/50 and 30/40/30 for a
   vendor's first two bookings). A problem report
   freezes what isn't released. PLUJ never holds booking money; it only
   collects its service fees. Everything here is hidden while
   platform_settings.payments_enabled is not 'true'. */
export function paymentsOn() {
  return String(_platformSettings.payments_enabled) === "true";
}

/* ── One price ────────────────────────────────────────────────────────────
   Every price a host sees already includes PLUJ's host service fee, so the
   amount on a card is the amount charged; nothing is added at checkout.
   The fee is 1% after the host's first 3 months (platform_settings), and
   only while online payment is on. Signed-out visitors see the price with
   the fee, so a new host's price can only be lower, never higher.
   The payments edge function charges the same: round(base × pct) on the
   booking's whole base (_shared/payments.ts prepareCharge). */
let _priceViewer = null;
export function setPriceViewer(user) { _priceViewer = user || null; }
export function hostFeePct(user = _priceViewer) {
  if (!paymentsOn()) return 0;
  const pct    = Number(_platformSettings.host_service_fee_after_intro_percent ?? 1) || 0;
  const months = Number(_platformSettings.host_service_fee_intro_months ?? 3) || 0;
  if (user && user.type === "vendor") return pct;
  if (user && user.createdAt) {
    const until = new Date(user.createdAt);
    until.setMonth(until.getMonth() + months);
    if (Date.now() < until.getTime()) return 0;
  }
  return pct;
}
/* Base price (dollars) → what the host pays (dollars, to the cent). */
export function allIn(amount, user) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  const cents = Math.round(n * 100);
  return (cents + Math.round(cents * hostFeePct(user) / 100)) / 100;
}
export function fmtAllIn(amount, user) {
  const v = allIn(amount, user);
  return "$" + Number(v).toLocaleString("en-US", Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/* A marketplace card's price label, all-in. Keeps "From" and "Contact for
   pricing" wording from the card itself. */
export function cardPrice(v) {
  if (!v || !(Number(v.pv) > 0)) return v?.price || "Contact for pricing";
  return (/^From/i.test(String(v.price || "")) ? "From " : "") + fmtAllIn(v.pv);
}

export async function paymentsCall(action, payload = {}) {
  const token = sb.getAuthToken ? sb.getAuthToken() : null;
  if (!token) return { error: "Please sign in again." };
  try {
    const r = await fetch(SUPABASE_URL + "/functions/v1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON, Authorization: "Bearer " + token },
      body: JSON.stringify({ action, ...payload }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401) return { error: "Please sign out and sign in again, then try once more." };
      return { error: j.error || j.message || `Payments error (${r.status}).` };
    }
    return j;
  } catch {
    return { error: "Couldn't reach PLUJ payments. Check your connection and try again." };
  }
}

/* The schedule, release requests and problem reports for one booking, as the
   signed-in host, vendor or admin is allowed to see them (RLS). */
export async function getBookingPaymentInfo(bookingId) {
  const [plan, problems] = await Promise.all([
    sb.from("booking_payment_plans").select("*, booking_payments(*), payment_release_requests(*)")
      .eq("booking_id", bookingId).get(),
    sb.from("booking_problems").select("*").eq("booking_id", bookingId)
      .order("created_at", { ascending: false }).get(),
  ]);
  const p = Array.isArray(plan.data) ? plan.data[0] : null;
  if (!p) return null;
  const order = { retainer: 0, event_day: 1, final: 2 };
  return {
    plan: p,
    payments: [...(p.booking_payments || [])].sort((a, b) => order[a.kind] - order[b.kind]),
    requests: [...(p.payment_release_requests || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    problems: problems.data || [],
  };
}

/* Host / vendor actions that live in the database (see the SQL file). */
export async function paymentsRpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { error: (error.message || "That didn't work. Please try again.").replace(/^.*?ERROR:\s*/, "") };
  return { ok: true, data };
}

/* Admin → Payments: every plan with its payments and booking, open problems. */
export async function adminLoadPayments() {
  const [plans, problems] = await Promise.all([
    sb.from("booking_payment_plans")
      .select("*, booking_payments(*), booking_requests(service_name, event_date, status)")
      .order("created_at", { ascending: false }).limit(200).get(),
    sb.from("booking_problems").select("*").order("created_at", { ascending: false }).limit(200).get(),
  ]);
  return { plans: plans.data || [], problems: problems.data || [] };
}

export async function setPaymentsEnabled(on) {
  const { data, error } = await sb.from("platform_settings").eq("key", "payments_enabled")
    .update({ value: on ? "true" : "false" });
  if (error || (Array.isArray(data) && data.length === 0)) {
    return { error: (error && error.message) || "Couldn't change the setting (admin only)." };
  }
  _platformSettings.payments_enabled = on ? "true" : "false";
  return { ok: true };
}

async function getVendorStatus(vendorId) {
  const { data } = await sb.from("vendor_profiles")
    .select("verification_status").eq("id", vendorId).single().get();
  return data?.verification_status || null;
}

export async function setVendorStatus(vendorId, status, reason = "") {
  const { data, error } = await sb.from("vendor_profiles").eq("id", vendorId).update({
    verification_status: status,
    rejection_reason:    reason || null,
    verified_at:         status === "approved" ? new Date().toISOString() : null,
  });
  if (error) return { ok: false, error: error.message || "Update failed." };
  /* With Prefer: return=representation, PostgREST echoes the updated rows.
     An empty array means zero rows changed — almost always RLS filtering the
     write (caller not recognized as admin), or the vendor no longer exists.
     Treat that as a failure instead of a silent no-op. */
  if (Array.isArray(data) && data.length === 0) {
    return { ok: false, error: "No rows updated — the change didn't take. You may not be signed in as an admin (RLS), or the vendor no longer exists." };
  }
  /* Also update profile status */
  await sb.from("profiles").eq("id", vendorId).update({
    status: status === "approved" ? "active" : status === "rejected" ? "suspended" : "pending",
  });
  return { ok: true, error: null };
}

/* ── Booking requests ────────────────────────────────────────────────────── */
async function saveRequest(req) {
  if (IS_PREVIEW) {
    /* Preview: save to window.storage */
    const record = {
      id: req.id, user_id: req.userId, vendor_id: req.vendorId,
      event_type: req.eventType || null, event_date: req.eventDate || null,
      guests: req.guests || null, venue: req.venue || null,
      message: req.message || null, status: "pending",
      market_id: req.marketId || "houston-tx",
      venue_type: req.venueType || null, street_address: req.streetAddress || null,
      address_line2: req.addressLine2 || null, city: req.city || null,
      state: req.state || null, zip_code: req.zip || null,
      start_time: req.startTime || null, end_time: req.endTime || null,
      end_date: req.endDate || null,
      access_instructions: req.accessInstructions || null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      /* Keep original fields for display (preview reads these back directly) */
      userId: req.userId, vendorId: req.vendorId,
      userName: req.userName, vendorName: req.vendorName,
      eventType: req.eventType, eventDate: req.eventDate,
      venueType: req.venueType, streetAddress: req.streetAddress,
      addressLine2: req.addressLine2,
      addressVerified: req.addressVerified === true,
      zip: req.zip, startTime: req.startTime, endTime: req.endTime,
      accessInstructions: req.accessInstructions,
      createdAt: Date.now(),
    };
    /* Save to user's list */
    const uList = (await _pGet("ureqs:" + req.userId)) || [];
    if (!uList.includes(req.id)) await _pSet("ureqs:" + req.userId, [req.id, ...uList]);
    /* Save to vendor's list */
    const vList = (await _pGet("vreqs:" + req.vendorId)) || [];
    if (!vList.includes(req.id)) await _pSet("vreqs:" + req.vendorId, [req.id, ...vList]);
    /* Save full record */
    await _pSet("req:" + req.id, record);
    return;
  }
  /* Demo vendor bookings: persist to localStorage instead of DB.
     Sample listings (vendorId like "v_tacorush") are not real accounts, so
     nobody receives these — they only appear in the customer's own
     "My Requests". Real vendor bookings (UUID) go to the DB normally. */
  if (!isRealId(req.vendorId) || !isRealId(req.userId)) {
    if (typeof console !== "undefined") {
      console.warn("[PLUJ] Request saved locally only — sample listing or guest user. vendorId:", req.vendorId);
    }
    try {
      const key = "pluj_demo_requests:" + req.userId;
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      const record = {
        id: req.id, userId: req.userId, vendorId: req.vendorId,
        vendorName: req.vendorName || "Vendor",
        userName: req.userName || "Guest",
        eventType: req.eventType || null,
        eventDate: req.eventDate || null,
        guests: req.guests || null,
        venue: req.venue || null,
        venueType: req.venueType || null,
        streetAddress: req.streetAddress || null,
        addressLine2: req.addressLine2 || null,
        city: req.city || null,
        state: req.state || null,
        zip: req.zip || null,
        startTime: req.startTime || null,
        endTime: req.endTime || null,
        accessInstructions: req.accessInstructions || null,
        message: req.message || null,
        status: "pending",
        createdAt: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify([record, ...list]));
    } catch {}
    return;
  }

  /* Guarantee the REST client is authenticated as the current user before the
     insert. If the in-memory token was ever lost (e.g. a code path that didn't
     call setAuth), the write would go out anonymously and RLS
     (auth.uid() = user_id) would silently reject it — leaving no row while the
     email still sends. Re-hydrate from the stored session to prevent that. */
  if (!IS_PREVIEW) {
    try { const s = _loadSessionLocal(); if (s?.access_token) sb.setAuth(s.access_token, s.refresh_token); } catch {}
  }
  const { error } = await sb.from("booking_requests").insert({
    id: req.id, user_id: req.userId, vendor_id: req.vendorId,
    event_type: req.eventType || null, event_date: req.eventDate || null,
    guests: req.guests || null, venue: req.venue || null,
    venue_type: req.venueType || null, street_address: req.streetAddress || null,
    address_line2: req.addressLine2 || null, city: req.city || null,
    state: req.state || null, zip_code: req.zip || null,
    start_time: req.startTime || null, end_time: req.endTime || null,
    end_date: req.endDate || null,
    /* Only sent when the customer actually chose one. Null means the database
       default — 120 hours / 5 days — which is what every request used to get. */
    ...(req.responseDeadlineHours ? { response_deadline_hours: req.responseDeadlineHours } : {}),
    access_instructions: req.accessInstructions || null,
    /* Strict === true: anything ambiguous is recorded as unverified, because
       wrongly telling a vendor an address is confirmed is the costly error. */
    address_verified: req.addressVerified === true,
    message: req.message || null, status: "pending",
    market_id: req.marketId || "houston-tx",
    /* Only sent when the listing came from vendor_services — keeps inserts
       working for anyone who hasn't run vendor-services-setup.sql yet. */
    ...(req.serviceId ? { service_id: req.serviceId, service_name: req.serviceName || null } : {}),
    ...(req.packageName ? { package_name: req.packageName, package_price: req.packagePrice ?? null } : {}),
    /* Extras: names only matter; the database prices them from the listing. */
    ...(Array.isArray(req.addons) && req.addons.length ? { addons: req.addons } : {}),
  });
  if (error) {
    /* Surface the real reason instead of silently dropping the request (which
       previously left booking_requests empty while the email still went out). */
    const msg = error.message || error.hint || error.details || JSON.stringify(error);
    console.error("[PLUJ] booking insert REJECTED:", error);
    return { ok: false, error: msg };
  }
  return { ok: true };
}

async function getVendorRequests(vendorId) {
  if (IS_PREVIEW) {
    const ids = (await _pGet("vreqs:" + vendorId)) || [];
    const list = await Promise.all(ids.map(id => _pGet("req:" + id)));
    return list.filter(Boolean).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  /* Fetch the vendor's incoming requests WITHOUT a PostgREST embed. The old
     `profiles!booking_requests_user_id_fkey` embed silently errored the whole
     query when that FK name didn't exist (user_id references auth.users, not
     profiles), so vendors saw zero requests. We now select the rows plainly,
     then look up customer display names in one follow-up query. */
  const { data, error } = await sb.from("booking_requests")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .get();
  if (error) { console.error("[PLUJ] getVendorRequests failed:", error); return []; }
  const rows = data || [];
  console.log(`[PLUJ] getVendorRequests: vendor_id=${vendorId} → ${rows.length} row(s)`);
  if (rows.length === 0) {
    console.log("[PLUJ] 0 requests. If you KNOW one exists, in Supabase run:\n" +
      "  select id, vendor_id, status from booking_requests order by created_at desc limit 5;\n" +
      "and confirm a row's vendor_id EXACTLY equals the id above. If it differs, the request was addressed to a different id (RLS then hides it).");
  }

  /* Resolve customer names in one shot. */
  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  const nameById = {};
  if (userIds.length) {
    try {
      const { data: people } = await sb.from("profiles")
        .select("id, display_name, full_name").in("id", userIds).get();
      (people || []).forEach(p => { nameById[p.id] = p.display_name || p.full_name || null; });
    } catch { /* names are best-effort — the request still shows */ }
  }

  return rows.map(r => ({
    id: r.id, userId: r.user_id, vendorId: r.vendor_id,
    userName: nameById[r.user_id] || "Host",
    eventType: r.event_type, eventDate: r.event_date,
    guests: r.guests, venue: r.venue, message: r.message,
    venueType: r.venue_type, streetAddress: r.street_address,
    addressLine2: r.address_line2, city: r.city, state: r.state,
    zip: r.zip_code, startTime: r.start_time, endTime: r.end_time, endDate: r.end_date,
    addressVerified: r.address_verified === true,
    accessInstructions: r.access_instructions,
    serviceId: r.service_id, serviceName: r.service_name,
    packageName: r.package_name, packagePrice: r.package_price,
    addons: Array.isArray(r.addons) ? r.addons : [], addonsTotal: Number(r.addons_total) || 0,
    cancelledBy: r.cancelled_by || null,
    status: r.status, note: r.vendor_note,
    createdAt: new Date(r.created_at).getTime(),
    respondedAt: r.responded_at ? new Date(r.responded_at).getTime() : null,
  }));
}

async function getUserRequests(userId) {
  if (IS_PREVIEW) {
    const ids = (await _pGet("ureqs:" + userId)) || [];
    const list = await Promise.all(ids.map(id => _pGet("req:" + id)));
    return list.filter(Boolean).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  /* Load demo bookings from localStorage (for demo vendors that can't go to DB) */
  let demoReqs = [];
  try {
    if (isRealId(userId)) {
      const raw = localStorage.getItem("pluj_demo_requests:" + userId);
      demoReqs = raw ? JSON.parse(raw) : [];
    }
  } catch {}

  const { data, error } = await sb.from("booking_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .get();
  if (error) console.error("[PLUJ] getUserRequests failed:", error);
  const rows = data || [];
  /* Resolve vendor business names separately (no fragile embed). */
  const vendorIds = [...new Set(rows.map(r => r.vendor_id).filter(Boolean))];
  const vNameById = {};
  if (vendorIds.length) {
    try {
      const { data: vps } = await sb.from("vendor_directory")
        .select("id, business_name, biz_legal").in("id", vendorIds).get();
      (vps || []).forEach(v => { vNameById[v.id] = v.biz_legal || v.business_name || null; });
    } catch { /* best-effort */ }
  }
  const dbReqs = rows.map(r => ({
    id: r.id, userId: r.user_id, vendorId: r.vendor_id,
    vendorName: vNameById[r.vendor_id] || "Vendor",
    eventType: r.event_type, eventDate: r.event_date,
    guests: r.guests, venue: r.venue, message: r.message,
    venueType: r.venue_type, streetAddress: r.street_address,
    addressLine2: r.address_line2, city: r.city, state: r.state,
    zip: r.zip_code, startTime: r.start_time, endTime: r.end_time, endDate: r.end_date,
    addressVerified: r.address_verified === true,
    accessInstructions: r.access_instructions,
    serviceId: r.service_id, serviceName: r.service_name,
    packageName: r.package_name, packagePrice: r.package_price,
    addons: Array.isArray(r.addons) ? r.addons : [], addonsTotal: Number(r.addons_total) || 0,
    cancelledBy: r.cancelled_by || null,
    status: r.status, note: r.vendor_note,
    createdAt: new Date(r.created_at).getTime(),
    respondedAt: r.responded_at ? new Date(r.responded_at).getTime() : null,
  }));
  /* Merge DB + demo bookings, newest first */
  return [...dbReqs, ...demoReqs].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}


/* ── Booking decision emails ───────────────────────────────────────────────
   This used to POST to /api/send-booking-notification twice — once for the
   customer, once for the vendor — with Promise.allSettled logging failures to
   the console and nothing else. That browser fetch was the fragile step: the
   booking row was already committed, so a closed tab, a dropped connection or
   a cold start meant the email simply never happened, and the only trace was
   a console line nobody reads.

   The database does it now. A trigger on booking_requests writes both emails
   into public.email_outbox in the same transaction as the status change, so
   if the booking exists the email exists, and pg_cron drains the queue with
   exponential backoff. Sending from here as well would hand every party a
   second copy of everything.

   Kept as a no-op rather than deleted so the call sites still read as "this
   change is worth telling both parties about" — which is now true by
   construction rather than by a fetch that may or may not land.           */

/* Emails both parties when a customer cancels or modifies a booking. */
async function notifyBookingChange({ requestId, status, customerId, vendorId, request }) {
  return notifyBookingDecision({ requestId, status, customerId, vendorId, request });
}

async function notifyBookingDecision() {
  /* No-op. public.enqueue_booking_emails() queues these server-side. */
}

async function updateRequestStatus(reqId, status, note = "", extra = {}) {
  if (IS_PREVIEW) {
    const req = await _pGet("req:" + reqId);
    if (!req) return null;
    const updated = { ...req, status, note: note || null, updated_at: new Date().toISOString() };
    await _pSet("req:" + reqId, updated);
    return updated;
  }
  const { data, error } = await sb.from("booking_requests").eq("id", reqId).update({
    status, vendor_note: note || null, updated_at: new Date().toISOString(),
    /* With payments on, a confirm carries the agreed total_price. */
    ...(extra || {}),
  });
  if (error) {
    console.error("[PLUJ] updateRequestStatus failed:", error);
    return { __error: error.message || "Update rejected by the database." };
  }
  if (Array.isArray(data) && data.length === 0) {
    console.error("[PLUJ] updateRequestStatus: 0 rows updated (RLS or missing row)");
    return { __error: "No rows updated — permission denied by database policy." };
  }
  const row = data?.[0] || null;
  /* When a vendor accepts, mark that date on their calendar so search and the
     cart both stop offering them for it. Best-effort — a failure here must not
     fail the acceptance itself. */
  const accepted = status === "confirmed" || status === "accepted";
  if (row && accepted && row.vendor_id && row.event_date) {
    try {
      await sb.from("vendor_availability")
        .upsert({ vendor_id: row.vendor_id, date: row.event_date, status: "confirmed" });
    } catch (e) { console.warn("[PLUJ] could not mark date confirmed:", e); }
  }
  return row;
}

/* ── Vendor availability ─────────────────────────────────────────────────── */
async function getVendorAvailability(vendorId) {
  const { data } = await sb.from("vendor_availability")
    .select("date, status").eq("vendor_id", vendorId).get();
  const blocked   = (data || []).filter(d => d.status === "blocked").map(d => d.date);
  const confirmed = new Set((data || []).filter(d => d.status === "confirmed").map(d => d.date));
  /* Also treat any accepted booking's date as taken, even if it was never
     written to vendor_availability (e.g. accepted before that was wired up).
     This is the source of truth for "already booked". */
  try {
    const { data: booked } = await sb.from("vendor_booked_dates")
      /* Public view exposing only (vendor_id, event_date) for confirmed
         bookings. booking_requests itself is not readable by anon - it holds
         customer street addresses and access notes - so querying it here
         returned a permission error for logged-out visitors and the calendar
         showed already-booked dates as free. */
      .select("event_date").eq("vendor_id", vendorId).get();
    (booked || []).forEach(b => { if (b.event_date) confirmed.add(b.event_date); });
  } catch { /* table/columns may lag — fall back to calendar rows only */ }
  return { blocked, confirmed: [...confirmed] };
}

/* Availability for many vendors at once.

   The grid used to call getVendorAvailability once per vendor, sequentially,
   awaiting each before starting the next — and that function itself makes two
   requests. So the cost of loading the marketplace was 2N round trips in
   series. At nine vendors nobody notices. At two hundred it is four hundred
   requests one after another, which on a phone is not slow, it is broken.

   This asks the same two questions for a batch of vendors and groups the answer
   client-side. Chunked because vendor ids go in the query string and a URL has
   a practical length limit — 100 uuids is comfortably inside it, and the chunks
   run in parallel, so 200 vendors costs 4 requests instead of 400.

   Returns the same { blocked, confirmed } shape per id, and includes an entry
   for every id asked about. That matters: the filter treats `undefined` as
   "not loaded yet, don't hide this vendor", so a vendor silently missing from
   the result would be permanently treated as available. */
async function getVendorAvailabilityBulk(vendorIds) {
  const ids = [...new Set((vendorIds || []).filter(Boolean))];
  const out = {};
  ids.forEach(id => { out[id] = { blocked: [], confirmed: new Set() }; });
  if (!ids.length) return {};

  const CHUNK = 100;
  const chunks = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  await Promise.all(chunks.map(async chunk => {
    try {
      const { data } = await sb.from("vendor_availability")
        .select("vendor_id, date, status").in("vendor_id", chunk).get();
      (data || []).forEach(r => {
        const slot = out[r.vendor_id];
        if (!slot) return;
        if (r.status === "blocked")        slot.blocked.push(r.date);
        else if (r.status === "confirmed") slot.confirmed.add(r.date);
      });
    } catch { /* leave this chunk empty rather than failing the whole load */ }
    try {
      const { data: booked } = await sb.from("vendor_booked_dates")
        .select("vendor_id, event_date").in("vendor_id", chunk).get();
      (booked || []).forEach(b => {
        const slot = out[b.vendor_id];
        if (slot && b.event_date) slot.confirmed.add(b.event_date);
      });
    } catch { /* same */ }
  }));

  const final = {};
  ids.forEach(id => {
    final[id] = { blocked: out[id].blocked, confirmed: [...out[id].confirmed] };
  });
  return final;
}

async function setVendorAvailability(vendorId, avail) {
  /* Toggle a single date — avail = { blocked: [...], confirmed: [...] } */
  const allDates = [...new Set([...avail.blocked, ...avail.confirmed])];
  for (const date of allDates) {
    const status = avail.confirmed.includes(date) ? "confirmed" : "blocked";
    await sb.from("vendor_availability").upsert({ vendor_id: vendorId, date, status });
  }
}

/* ── Notifications ───────────────────────────────────────────────────────── */
async function pushNotif(userId, notif) {
  const record = {
    id: genNotifId(), user_id: userId, type: notif.type || "system",
    title: notif.title, body: notif.body || null,
    request_id: notif.reqId || null, is_read: false,
    created_at: new Date().toISOString(),
    /* Preview-friendly fields */
    read: false, ts: Date.now(), reqId: notif.reqId || null,
  };
  if (IS_PREVIEW) {
    const list = (await _pGet("notif:" + userId)) || [];
    await _pSet("notif:" + userId, [record, ...list].slice(0, 50));
    return;
  }
  /* Skip DB write when the target isn't a real user (e.g. notifying a demo
     vendor that has no real account). Prevents RLS rejection on bogus ids. */
  if (!isRealId(userId)) return;

  await sb.from("notifications").insert({
    user_id: userId, type: record.type, title: record.title,
    body: record.body, request_id: record.request_id, is_read: false,
  });
}

/* ─── TRAFFIC EVENTS ──────────────────────────────────────────────────────────
   error_events answers "did something throw?". This answers the questions that
   actually decide whether the marketplace works: are searches coming back
   empty, does anyone open a listing and leave, do people start a booking and
   abandon it. None of those throw. The site behaves perfectly and the business
   quietly fails.

   THREE RULES THIS MUST NEVER BREAK

   1. It cannot break the page. Every call is fire-and-forget and swallowed. A
      logging system that can take down the thing it is logging is worse than no
      logging at all — and unlike the booking emails, losing one of these costs
      nothing, so fire-and-forget is the right choice here rather than a queue.

   2. It records no personal data. Enumerated event names and small numeric
      facts only — never what somebody typed, never an address, never an email.
      The search event carries the LENGTH of the query and how many results came
      back, which answers "are searches failing" without keeping what anyone
      searched for.

   3. The session id is not a person. Random per tab, gone when the tab closes,
      never joined to anything. It exists so "started a booking" and "submitted
      a booking" can be seen as one visit.
────────────────────────────────────────────────────────────────────────────── */
const SESSION_ID = (() => {
  try {
    const k = "pluj_sid";
    let v = sessionStorage.getItem(k);
    if (!v) { v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
              sessionStorage.setItem(k, v); }
    return v;
  } catch { return null; }   /* private mode, embedded webviews */
})();

/* Only the real site is measured. Branch previews, Vercel's own crawlers and
   localhost all run this same bundle against this same database, so without
   this check every test click lands in the production traffic log. Analytics
   you cannot trust is worse than none — the same reason a staging environment
   that drifts is worse than not having one. */
const IS_PRODUCTION_HOST = (() => {
  try { return /(^|\.)pluj\.us$/i.test(window.location.hostname); }
  catch { return false; }
})();

/* Global Privacy Control (Texas Data Privacy and Security Act, and the
   Privacy page): a browser that sends the GPC signal is treated as opting out.
   PLUJ never sells data or runs ads, so the only thing left to switch off is
   PLUJ's own usage statistics, and it is. Do Not Track is honoured the same way. */
export const GPC_ON = (() => {
  try {
    return navigator.globalPrivacyControl === true
        || navigator.doNotTrack === "1" || window.doNotTrack === "1";
  } catch { return false; }
})();

function track(event, props) {
  if (IS_PREVIEW || !IS_PRODUCTION_HOST || GPC_ON) return;
  try {
    sb.from("app_events").insert({
      event,
      props: props && typeof props === "object" ? props : {},
      session_id: SESSION_ID,
      path: (typeof location !== "undefined" ? location.pathname : "").slice(0, 200),
    }, { prefer: "return=minimal" }).then(() => {}, () => {});
  } catch { /* never let measurement break the thing being measured */ }
}

/* ─── URLS ───────────────────────────────────────────────────────────────────
   The whole marketplace lived at one URL. Every vendor, every category and the
   event builder were states inside a single page, so nothing could be linked
   to, shared, bookmarked or indexed: a vendor asking "send me my page" had no
   page to be sent, and Google had exactly one thing to rank.

   This is deliberately NOT a router. A router wants to own the render tree, and
   the render tree here is one very large component whose view is already driven
   by state (vendorPage, activeCat, activeSub). Rewriting that to satisfy a
   library would be a far bigger change than the problem justifies, and the
   problem is only that the address bar does not reflect the state.

   So the URL is treated as a projection of the state, in both directions:
   read once on boot, and kept in step afterwards with replaceState — which
   never adds a history entry, and therefore cannot disturb the back-button
   guard that is already carefully counting them.

     /                     the marketplace
     /build                Build My Event
     /c/food               a category
     /c/food/catering      a category and subcategory
     /vendor/<id>          one listing
────────────────────────────────────────────────────────────────────────────── */
/* Read the one-time token out of a confirmation or reset link.

   Called during the first render, not from an effect, and that is not a style
   preference. The "URL follows the view" effect rewrites the address bar to
   match whatever is on screen — for the home view, plain "/" — and it is
   declared earlier, so it runs first and takes the query string with it. An
   effect reading window.location.search afterwards finds an empty string and
   the link silently does nothing. Render happens before any of that. */
const EMAIL_LINK_TYPES = ["signup", "recovery", "email", "email_change", "invite", "magiclink"];
function readEmailLinkFromUrl() {
  if (typeof window === "undefined") return null;

  /* Current emails: /auth/confirm?token_hash=...&type=... */
  const q  = new URLSearchParams(window.location.search || "");
  const th = q.get("token_hash");
  const ty = q.get("type");
  if (th && EMAIL_LINK_TYPES.includes(ty)) return { type: ty, tokenHash: th };

  /* Emails sent before the switch, and anything Supabase redirects itself,
     put the result in the hash instead. Two shapes:
       #access_token=...&refresh_token=...&type=signup|recovery  (it worked)
       #error=...&error_code=otp_expired&error_description=...    (it didn't)
     Both used to be thrown away by the "URL follows the view" effect before
     anything read them, so the person landed on the homepage with no idea
     whether their link had done anything — which is exactly what they
     reported. */
  const h = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  if (h.get("error_code") || h.get("error")) {
    const d = (h.get("error_description") || "").replace(/\+/g, " ");
    return { type: h.get("type") || "signup",
             error: d ? d.charAt(0).toUpperCase() + d.slice(1) + "." : "This link has expired or was already used." };
  }
  const at = h.get("access_token");
  const ht = h.get("type");
  if (at && EMAIL_LINK_TYPES.includes(ht)) {
    return { type: ht, accessToken: at, refreshToken: h.get("refresh_token") || null };
  }
  return null;
}

function parsePath(p) {
  const seg = String(p || "/").split("/").filter(Boolean);
  if (!seg.length) return { kind: "home" };
  if (seg[0] === "build") return { kind: "build" };
  if (seg[0] === "event" && seg[1]) return { kind: "recap", id: decodeURIComponent(seg[1]) };
  if (seg[0] === "vendor" && seg[1]) {
    return { kind: "vendor", id: decodeURIComponent(seg[1]) };
  }
  if (seg[0] === "c" && seg[1]) {
    const cat = decodeURIComponent(seg[1]);
    /* The category has to be one we actually have. Without this check any
       /c/<anything> rendered as a real page: an empty grid, a plausible title
       built from the raw slug ("venues in Houston, TX" — the real id is
       "places"), a canonical tag pointing at itself, and robots index,follow.

       Two problems with that. A customer following a stale or mistyped link
       lands on a dead end that looks like a legitimately empty category rather
       than a wrong address. And it hands a search engine an unbounded supply of
       crawlable, indexable, near-identical pages, which is the classic way to
       get a site's real pages buried under its own thin content. */
    if (!CATEGORIES.some(c => c.id === cat)) return { kind: "home" };
    return {
      kind: "cat",
      cat,
      sub: seg[2] ? decodeURIComponent(seg[2]) : null,
    };
  }
  return { kind: "home" };
}

/* Captured once, at load, before anything can rewrite it. */
const BOOT_ROUTE = (() => {
  try { return parsePath(window.location.pathname); }
  catch { return { kind: "home" }; }
})();

const SITE_ORIGIN = "https://www.pluj.us";

export async function getNotifs(userId) {
  if (IS_PREVIEW) {
    return (await _pGet("notif:" + userId)) || [];
  }
  const { data } = await sb.from("notifications")
    .select("*").eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50).get();
  return (data || []).map(n => ({
    id: n.id, type: n.type, title: n.title, body: n.body,
    reqId: n.request_id,
    /* Conversation events point at their own table now. request_id is foreign-
       keyed to booking_requests and rejects anything else — writing a
       conversation id into it broke sending messages outright. */
    convId: n.conversation_id || n.inquiry_id || null,
    read: n.is_read, ts: new Date(n.created_at).getTime(),
  }));
}

export async function markNotifsRead(userId) {
  if (IS_PREVIEW) {
    const list = (await _pGet("notif:" + userId)) || [];
    await _pSet("notif:" + userId, list.map(n => ({ ...n, read: true, is_read: true })));
    return;
  }
  await sb.from("notifications")
    .eq("user_id", userId).neq("is_read", true)
    .update({ is_read: true });
}

/* ── CAPTCHA generator ───────────────────────────────────────────────────── */
function genCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { q: `${a} + ${b}`, answer: a + b };
}

/* ── Rate limiting (protects login + signup against brute-force & bots) ───── */
const RATE_CFG = Object.freeze({ maxAttempts: 5, lockMs: 15 * 60 * 1000, warnAt: 3 });

/* ── Rate limiting — preview uses window.storage, production uses Supabase ── */
async function getRateLimit(email) {
  try {
    const key = "rl:" + hashPassword(email.toLowerCase()).slice(-12);
    if (IS_PREVIEW) {
      const d = await _pGet(key);
      if (!d) return { blocked: false, attempts: 0, attemptsLeft: RATE_CFG.maxAttempts };
      if (d.lockedUntil && Date.now() < d.lockedUntil) {
        return { blocked: true, attempts: d.attempts,
                 resetIn: Math.ceil((d.lockedUntil - Date.now()) / 60000), attemptsLeft: 0 };
      }
      if (d.lockedUntil) { await _pDel(key); return { blocked: false, attempts: 0, attemptsLeft: RATE_CFG.maxAttempts }; }
      return { blocked: false, attempts: d.attempts, attemptsLeft: RATE_CFG.maxAttempts - d.attempts };
    }
    /* Production: Supabase */
    const { data } = await sb.from("rate_limits").select("*").eq("identifier", key).single().get();
    if (!data) return { blocked: false, attempts: 0, attemptsLeft: RATE_CFG.maxAttempts };
    if (data.locked_until && new Date(data.locked_until) > new Date()) {
      const resetIn = Math.ceil((new Date(data.locked_until) - Date.now()) / 60000);
      return { blocked: true, attempts: data.attempts, resetIn, attemptsLeft: 0 };
    }
    return { blocked: false, attempts: data.attempts || 0,
             attemptsLeft: RATE_CFG.maxAttempts - (data.attempts || 0) };
  } catch { return { blocked: false, attempts: 0, attemptsLeft: RATE_CFG.maxAttempts }; }
}

async function recordAttempt(email, success) {
  try {
    const key = "rl:" + hashPassword(email.toLowerCase()).slice(-12);
    if (IS_PREVIEW) {
      if (success) { await _pDel(key); return; }
      const d = (await _pGet(key)) || { attempts: 0 };
      const attempts = (d.attempts || 0) + 1;
      await _pSet(key, { attempts,
        lockedUntil: attempts >= RATE_CFG.maxAttempts ? Date.now() + RATE_CFG.lockMs : null,
        lastAttempt: Date.now() });
      return;
    }
    /* Production: Supabase */
    if (success) {
      await sb.from("rate_limits").eq("identifier", key).delete();
      return;
    }
    const { data: existing } = await sb.from("rate_limits").select("attempts").eq("identifier", key).single().get();
    const attempts = (existing?.attempts || 0) + 1;
    const locked_until = attempts >= RATE_CFG.maxAttempts
      ? new Date(Date.now() + RATE_CFG.lockMs).toISOString() : null;
    await sb.from("rate_limits").upsert({ identifier: key, attempts, locked_until,
      last_attempt_at: new Date().toISOString() });
  } catch(e) { console.error("[recordAttempt]", e); }
}

/* ── RETIRED 23 Sep 2026: the hand-rolled 6-digit email verification ─────────
   Supabase Auth now confirms email addresses itself. Its check happens inside
   the auth server, so it cannot be skipped by anyone talking to the REST API
   directly; ours ran in the browser, which meant a scripted signup never had to
   see it. Running both would have been the worst of the two — twice the code,
   and the weaker check still deciding what `email_verified` said.

   Deleted here: storeVerifyCode, checkVerifyCode, genVerifyCode, and their two
   callers in the signup modal (submitEmailVerify, resendCode).

   Still present elsewhere and deliberately untouched:
     - the `verify_codes` table (holds historical rows; drop it separately)
     - /api/send-verification (still rate-limited; no longer called by the app)
   ──────────────────────────────────────────────────────────────────────────── */

/* ── Locale / timezone-based geo signal (no external API — privacy safe) ─── */
function getGeoSignal() {
  try {
    const tz   = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
    const lang = (navigator.language || "").toUpperCase();
    const tz_city = tz.split("/").pop().replace(/_/g," ") || tz;
    return { tz, tz_city, lang };
  } catch { return { tz:"Unknown", tz_city:"Unknown", lang:"—" }; }
}

/* ══════════════════════════════════════════════════════════════════════════════
   RLS  — all app-layer data access MUST go through this object.
   Direct _stoGet / _stoSet calls outside this block are forbidden.
══════════════════════════════════════════════════════════════════════════════ */
export const RLS = {
  /* Internal: returns the verified session userId or null */
  async _sid() {
    return getSessionUserId();
  }, /* uses public token only */

  /* ── POLICY: user_isolation ─────────────────────────────────────────────────
     Allows a user to read their own profile only.
     USING (session.userId = record.id)                                        */
  async getOwnProfile() {
    const sid = await this._sid();
    if (!sid) return null;
    const u = await _findUserById(sid);
    if (!u || u.id !== sid) {
      console.warn("[RLS DENY] user_isolation: session=" + sid);
      return null;
    }
    return u;
  },

  /* ── POLICY: booking_isolation — enforced by Supabase RLS ─────────────────── */
  async getOwnBookings(userId) {
    if (!userId) return [];
    return getUserRequests(userId);
  },
  async createBooking(booking, sessionUser) {
    if (!sessionUser || sessionUser.type === "guest") return false;
    return saveRequest(booking);
  },

    /* ── POLICY: review_auth ────────────────────────────────────────────────────
     Only authenticated non-guest users may post reviews.
     WITH CHECK (session.type IN ('user','vendor'))                             */
  canReview(sessionUser) {
    if (!sessionUser || sessionUser.type === "guest" || !sessionUser.id) {
      return false;
    }
    return true;
  },

  /* ── POLICY: admin_only ──────────────────────────────────────────────────────
     Only accounts with type='admin' may access administrative operations.
     Verified against live session — cannot be spoofed via props.
     USING (session.type = 'admin' AND session.userId = record.adminId)         */
  async isAdmin(sessionUser) {
    if (!sessionUser || sessionUser.type !== "admin") return false;
    const sid = await this._sid();
    if (!sid || sid !== sessionUser.id) {
      console.warn("[RLS DENY] admin_only: session mismatch");
      return false;
    }
    return true;
  },

  /* ── POLICY: cors_origin ─────────────────────────────────────────────────────
     All operations verify the current window origin against CORS_CONFIG.
     USING (window.location.origin IN CORS_CONFIG.allowedOrigins)               */
  originCheck() {
    const origin = (typeof window !== "undefined" ? window.location.origin : "") || "null";
    if (!isOriginAllowed(origin)) {
      console.warn("[RLS DENY] cors_origin: blocked origin =", origin);
      return false;
    }
    return true;
  },

  /* ── POLICY: request_submit ──────────────────────────────────────────────────
     Authenticated non-guest users may submit booking requests.
     WITH CHECK (session.type IN ('user','vendor') AND session.userId = req.userId) */
  async submitRequest(req, sessionUser) {
    if (!sessionUser || sessionUser.type === "guest") return false;
    /* In preview mode, skip strict session check */
    if (!IS_PREVIEW) {
      const sid = await this._sid();
      if (!sid || sid !== req.userId) return false;
    }
    const saveRes = await saveRequest(req);
    if (saveRes && saveRes.ok === false) {
      /* The DB rejected the insert — do NOT pretend it worked. Return the
         reason so the cart can show it instead of a false "sent" confirmation. */
      return { ok: false, error: saveRes.error };
    }

    /* Notifications reference the booking via request_id (FK). For demo vendors
       the booking was not persisted (see saveRequest), so sending notifications
       would violate the FK. Only notify when the booking actually hit the DB. */
    const persisted = isRealId(req.vendorId) && isRealId(req.userId);
    /* Instant booking: ask the database to confirm it now. Anything that
       doesn't fit (date taken, too soon, a day off…) stays a normal request. */
    if (persisted && req.instant) {
      const { data: ib } = await sb.rpc("instant_book", { p_booking: req.id });
      if (ib === "confirmed") {
        req.status = "confirmed";
        await pushNotif(req.userId, {
          type:"request_sent", title:"⚡ Booked! ✓",
          body:`${req.vendorName || "Your vendor"} is confirmed for ${req.eventType || "your event"} on ${req.eventDate || "your date"}. Instant booking — no waiting.`,
          reqId: req.id,
        });
        return true;
      }
      req.instantFallback = ib || "error";
    }
    if (persisted) {
      /* The vendor's "new request" notification is created server-side by the
         notify_on_booking_change trigger (SECURITY DEFINER) — a client can't
         insert a notification owned by another user, so doing it here would be
         silently rejected by RLS. See notifications-and-vendor-read-fix.sql. */
      /* Notify the customer themselves — this row is owned by them, so it's
         allowed, and gives an instant "request sent" confirmation. */
      await pushNotif(req.userId, {
        type:"request_sent", title:"Request sent! ✓",
        body:`Your request to ${req.vendorName || "the vendor"} for ${req.eventType || "your event"} on ${req.eventDate || "TBD"} was sent. Waiting for their confirmation.`,
        reqId: req.id
      });
      /* Email both parties: the vendor gets an actionable new-request alert,
         the customer gets a "we sent it" receipt. Non-blocking. */
      notifyBookingDecision({
        requestId:  req.id,
        status:     "requested",
        customerId: req.userId,
        vendorId:   req.vendorId,
        request:    req,
      }).catch(e => console.error("[PLUJ] new-request email failed:", e));
    }
    return true;
  },

  /* ── POLICY: request_respond ─────────────────────────────────────────────────
     Only the vendor the request is addressed to may approve / decline it.
     WITH CHECK (session.type = 'vendor' AND session.userId = req.vendorId)        */
  async respondToRequest(reqId, status, note, sessionUser, extra = {}) {
    if (!sessionUser || sessionUser.type !== "vendor") return false;
    const sid = await this._sid();
    if (!sid || sid !== sessionUser.id) return false;
    /* Fetch request from Supabase to verify ownership */
    const { data: reqData } = await sb.from("booking_requests")
      .select("user_id, vendor_id, event_date").eq("id", reqId).single().get();
    if (!reqData || reqData.vendor_id !== sessionUser.id) return false;
    const updated = await updateRequestStatus(reqId, status, note, extra);
    /* Notification is handled automatically by notify_user_request_response trigger */
    /* Email both parties confirming the decision (non-blocking — a mail
       failure must never roll back a successful accept/decline). */
    if (updated && !updated.__error) {
      notifyBookingDecision({
        requestId: reqId,
        status,
        customerId: reqData.user_id,
        vendorId:   reqData.vendor_id,
        request:    updated,
      }).catch(e => console.error("[PLUJ] booking email failed:", e));
    }
    return updated;
  },

  /* ── POLICY: request_read ────────────────────────────────────────────────────
     Users read their own requests; vendors read requests addressed to them.    */
  async getMyRequests(sessionUser) {
    if (!sessionUser || sessionUser.type === "guest") return [];
    /* Read directly by the logged-in account id. The server's RLS policies are
       the real gate (a vendor only sees rows where auth.uid() = vendor_id), so
       we don't add a client-side id check here — that only created a silent
       "No requests yet" when the cached session id was missing or stale. */
    if (sessionUser.type === "vendor") return getVendorRequests(sessionUser.id);
    return getUserRequests(sessionUser.id);
  },
};
function fmtTotal(cart) {
  const t = allIn(cart.reduce((a,v)=>a+(v.pv||0),0));
  if (!t) return "Contact for pricing";
  return t >= 1000 ? `$${(t/1000).toFixed(1)}k` : `$${t}`;
}

/* ── Favorites — Supabase favorites table + localStorage for demo vendors ── */
/* ── INQUIRIES ────────────────────────────────────────────────────────────
   A customer's question about a listing, delivered to the vendor's dashboard
   where they can reply. Both sides get notified (DB trigger). */
/* ── MESSAGING ────────────────────────────────────────────────────────────
   Customer ↔ vendor threads stay open until 3 days after the event, or until
   either side presses Stop. Admin threads never expire and only the admin can
   end them. All enforced by the database, not just the UI. */
function conversationActive(c) {
  if (!c || c.status !== "open") return false;
  if (c.kind === "admin") return true;
  if (!c.eventDate) return true;
  const cutoff = new Date(c.eventDate + "T00:00:00");
  cutoff.setDate(cutoff.getDate() + 3);
  return Date.now() < cutoff.getTime();
}

export async function startConversation({ otherId, kind = "user_vendor", serviceId, serviceName, subject, eventDate, bookingId, selfId }) {
  if (IS_PREVIEW || !otherId) return { ok: false, error: "Not available here." };

  /* Preferred: one server-side call that reuses an existing thread. */
  const { data, error } = await sb.rpc("start_conversation", {
    other_id: otherId, p_kind: kind,
    p_service_id: serviceId || null, p_service_name: serviceName || null,
    p_subject: subject || null, p_event_date: eventDate || null,
    p_booking_id: bookingId || null,
  });
  if (!error) return { ok: true, id: Array.isArray(data) ? data[0] : data };

  /* Fallback: the RPC may be missing or PostgREST's schema cache may be stale
     (error: "Could not find the function … in the schema cache"). Do the same
     work directly against the table — RLS still applies. */
  const me = selfId;
  if (!me) return { ok: false, error: error.message || "Could not start the conversation." };

  const { data: existing } = await sb.from("conversations")
    .select("id, a_id, b_id, service_id, kind, status").eq("status", "open").get();
  const found = (existing || []).find(c =>
    c.kind === kind &&
    ((c.a_id === me && c.b_id === otherId) || (c.a_id === otherId && c.b_id === me)) &&
    String(c.service_id || "") === String(serviceId || ""));
  if (found) return { ok: true, id: found.id };

  const { data: created, error: insErr } = await sb.from("conversations").insert({
    kind, a_id: me, b_id: otherId,
    service_id: serviceId || null, service_name: serviceName || null,
    subject: subject || null, event_date: eventDate || null, booking_id: bookingId || null,
  });
  if (insErr) {
    const msg = /schema cache|does not exist|relation/i.test(insErr.message || "")
      ? "Messaging isn't set up yet — run messaging-setup.sql in Supabase."
      : (insErr.message || "Could not start the conversation.");
    return { ok: false, error: msg };
  }
  const row = Array.isArray(created) ? created[0] : created;
  return row && row.id
    ? { ok: true, id: row.id }
    : { ok: false, error: "Could not start the conversation." };
}

async function getConversations(userId) {
  if (IS_PREVIEW || !userId) return [];
  const { data, error } = await sb.from("conversations")
    .select("*").order("last_message_at", { ascending: false }).get();
  if (error) { console.warn("[PLUJ] conversations unavailable — run messaging-setup.sql", error); return []; }
  const rows = data || [];
  /* Resolve the other person's display name for each thread. */
  const others = [...new Set(rows.map(r => (r.a_id === userId ? r.b_id : r.a_id)))].filter(Boolean);
  const names = {};
  if (others.length) {
    const [{ data: vps }, { data: profs }] = await Promise.all([
      sb.from("vendor_directory").select("id, business_name, biz_legal").in("id", others).get(),
      sb.from("profiles").select("id, display_name, full_name").in("id", others).get(),
    ]);
    (profs || []).forEach(p => { names[p.id] = p.display_name || p.full_name || "Member"; });
    (vps   || []).forEach(v => { names[v.id] = v.business_name || v.biz_legal || names[v.id] || "Vendor"; });
  }
  return rows.map(r => {
    const otherId = r.a_id === userId ? r.b_id : r.a_id;
    const c = {
      id: r.id, kind: r.kind, aId: r.a_id, bId: r.b_id, otherId,
      otherName: r.kind === "admin" && r.a_id !== userId ? "PLUJ Support" : (names[otherId] || "Member"),
      serviceId: r.service_id, serviceName: r.service_name, subject: r.subject,
      eventDate: r.event_date, status: r.status, closedBy: r.closed_by,
      lastMessageAt: r.last_message_at, createdAt: r.created_at,
    };
    c.active = conversationActive(c);
    return c;
  });
}

async function getMessages(convId) {
  if (IS_PREVIEW || !convId) return [];
  const { data, error } = await sb.from("messages")
    .select("*").eq("conversation_id", convId)
    .order("created_at", { ascending: true }).get();
  if (error) return [];
  return (data || []).map(m => ({
    id: m.id, senderId: m.sender_id, body: m.body, createdAt: m.created_at,
  }));
}

export async function sendMessage(convId, senderId, body) {
  if (IS_PREVIEW) return { ok: true };
  const { error } = await sb.from("messages")
    .insert({ conversation_id: convId, sender_id: senderId, body });
  if (error) {
    const raw = error.message || error.hint || JSON.stringify(error);
    console.error("[PLUJ] sendMessage failed:", error);
    /* Only an RLS *policy* rejection means the thread is closed/not yours.
       A not-null or foreign-key violation is a schema problem — surface it
       plainly instead of blaming the conversation. */
    let msg;
    if (/row-level security policy/i.test(raw)) {
      msg = "This conversation is closed, or you're not part of it.";
    } else if (/null value in column|not-null constraint/i.test(raw)) {
      const col = (raw.match(/column "([^"]+)"/) || [])[1];
      msg = `Messaging table needs a fix${col ? ` (required column "${col}")` : ""} — run messaging-repair.sql in Supabase.`;
    } else if (/schema cache|does not exist|relation/i.test(raw)) {
      msg = "Messaging isn't set up yet — run messaging-setup-v3.sql in Supabase.";
    } else {
      msg = raw;
    }
    return { ok: false, error: msg };
  }
  /* Only counted once the insert actually succeeded — a message that was
     rejected is not a message anyone sent. No body, no ids: just the fact. */
  track("message_sent", { len: String(body || "").length });
  return { ok: true };
}

async function closeConversation(convId, byId) {
  if (IS_PREVIEW) return { ok: true };
  const { error } = await sb.from("conversations").eq("id", convId)
    .update({ status: "closed", closed_by: byId, closed_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message || "Could not end the conversation." };
  return { ok: true };
}

async function sendInquiry({ userId, vendorId, serviceId, serviceName, body, eventDate }) {
  if (IS_PREVIEW) return { ok: true };
  /* An inquiry opens a real conversation both sides can keep replying to. */
  const conv = await startConversation({
    otherId: vendorId, kind: "user_vendor", selfId: userId,
    serviceId, serviceName, subject: serviceName || "Inquiry", eventDate,
  });
  if (!conv.ok) return conv;
  const sent = await sendMessage(conv.id, userId, body);
  if (!sent.ok) return sent;
  return { ok: true, conversationId: conv.id };
}

export async function getVendorInquiries(vendorId) {
  if (IS_PREVIEW || !vendorId) return [];
  const { data, error } = await sb.from("inquiries")
    .select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }).get();
  if (error) { console.warn("[PLUJ] inquiries unavailable — run inquiries-setup.sql", error); return []; }
  const ids = [...new Set((data || []).map(r => r.user_id))].filter(Boolean);
  const names = {};
  if (ids.length) {
    const { data: profs } = await sb.from("profiles").select("id, display_name, full_name").in("id", ids).get();
    (profs || []).forEach(p => { names[p.id] = p.display_name || p.full_name || "Host"; });
  }
  return (data || []).map(r => ({
    id: r.id, userId: r.user_id, userName: names[r.user_id] || "Host",
    serviceName: r.service_name, body: r.body, reply: r.reply,
    replyAt: r.reply_at, createdAt: r.created_at,
  }));
}

export async function replyToInquiry(inquiryId, reply) {
  if (IS_PREVIEW) return { ok: true };
  const { error } = await sb.from("inquiries").eq("id", inquiryId)
    .update({ reply, reply_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message || "Could not send your reply." };
  return { ok: true };
}

async function getFavorites(userId) {
  /* Favorites are per-LISTING (each card id), so hearting one service doesn't
     heart all of a vendor's other listings. Stored per user in localStorage. */
  if (!userId) return [];
  try {
    const raw = localStorage.getItem("pluj_favs:" + userId);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
async function toggleFavorite(userId, cardId) {
  if (!userId || !cardId) return await getFavorites(userId);
  try {
    const key = "pluj_favs:" + userId;
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const next = list.includes(cardId) ? list.filter(x => x !== cardId) : [...list, cardId];
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  } catch { return await getFavorites(userId); }
}

/* ── Budget helpers ── */
function budgetPct(spent, budget) {
  if (!budget || budget <= 0) return 0;
  return Math.min(100, Math.round(spent / budget * 100));
}
function budgetColor(pct) {
  if (pct >= 100) return "#EF4444";
  if (pct >= 80)  return "#F59E0B";
  return "#10B981";
}

/* ── Recommendation engine — gaps in cart vs event package ── */
/* The service a sub id names ("photographers" → "Photographers") and the
   category it sits in. */
export function subInfo(subId) {
  for (const [cat, list] of Object.entries(CAT_SUBS)) {
    const hit = (list || []).find(x => x.id === subId);
    if (hit) return { cat, label: hit.l };
  }
  return { cat: "all", label: String(subId || "").replace(/-/g, " ") };
}
/* What a cart item covers: its own sub, else the demo catalog's. */
function cartSub(v, allVendors) { return v.sub || allVendors.find(vv => vv.id === v.id)?.sub || null; }
function cartSubs(cart, allVendors) {
  return new Set(cart.flatMap(v => (Array.isArray(v.subs) && v.subs.length ? v.subs : [cartSub(v, allVendors)])).filter(Boolean));
}
const coversSub = (v, sub) => (Array.isArray(v.subs) && v.subs.length ? v.subs : [v.sub]).includes(sub);

/* "Your checklist still needs a photographer. Here are three we know."
   The first service on the occasion's checklist that isn't in the cart and
   has vendors, and up to three of them: instant booking first, then rating. */
function getRecommendations(cart, activePackage, allVendors) {
  if (!activePackage) return [];
  const have = cartSubs(cart, allVendors);
  for (const sub of activePackage.subs) {
    if (have.has(sub)) continue;
    const picks = allVendors.filter(v => coversSub(v, sub) && !cart.find(c => c.id === v.id))
      .sort((a, b) => (b.instant === true) - (a.instant === true) || (Number(b.rating) || 0) - (Number(a.rating) || 0))
      .slice(0, 3);
    if (picks.length) return picks.map(p => ({ ...p, _needs: sub }));
  }
  return [];
}

/* ── Social proof stats ── */
const PLATFORM_STATS = Object.freeze({
  vendors:   "200+",
  events:    "1,240+",
  cities:    "1 (expanding)",
  rating:    "4.9",
  categories:"5",
});

export function Stars({ r, size=13, interactive=false, onRate }) {
  return (
    <span style={{ display:"inline-flex", gap:2 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} onClick={() => interactive && onRate && onRate(i)}
          style={{ fontSize:size, color: i<=Math.round(r) ? "#F59E0B" : "#E5E7EB", cursor: interactive?"pointer":"default",
                   transition:"color 150ms ease" }}>★</span>
      ))}
    </span>
  );
}

function Avatar({ name, size=32, bg="#FF5C28" }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:bg, color:"#fff",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:size*0.37, fontWeight:700, flexShrink:0, fontFamily:"var(--display)" }}>
      {initials(name)}
    </div>
  );
}

function InstBadge() {
  return (
    <span style={{ background:C.greenSoft, color:C.green, fontSize:10, fontWeight:700,
                   padding:"2px 8px", borderRadius:99, display:"inline-flex", alignItems:"center", gap:3 }}>
      <Emoji e="⚡" size={10} /> Instant
    </span>
  );
}

/* ── Turnstile widget ────────────────────────────────────────────────────────
   Renders nothing at all when no site key is configured, so the caller can
   include it unconditionally.

   The script is loaded once and shared. Loading it per-mount would re-register
   the global callback and leave orphaned widgets behind each time the signup
   modal is reopened, which is how these integrations usually start leaking. */
let _turnstilePromise = null;
function loadTurnstile() {
  if (_turnstilePromise) return _turnstilePromise;
  _turnstilePromise = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(s);
  });
  return _turnstilePromise;
}

function Turnstile({ onToken }) {
  const boxRef  = useRef(null);
  const idRef   = useRef(null);
  const cbRef   = useRef(onToken);
  cbRef.current = onToken;           /* so the widget never holds a stale setter */
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let dead = false;
    loadTurnstile().then(ts => {
      if (dead || !boxRef.current || !ts) return;
      idRef.current = ts.render(boxRef.current, {
        sitekey:  TURNSTILE_SITE_KEY,
        callback: token => cbRef.current(token),
        /* A token is single-use and expires. Clearing it on expiry means the
           form asks again rather than submitting something already spent. */
        "expired-callback": () => cbRef.current(""),
        "error-callback":   () => { setFailed(true); cbRef.current(""); },
      });
    }).catch(() => setFailed(true));
    return () => {
      dead = true;
      try { if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current); }
      catch { /* already gone */ }
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div>
      <div ref={boxRef} />
      {failed && (
        <p style={{ margin:"8px 0 0", fontSize:11, color:C.midGray }}>
          The human check could not load. Check your connection or disable a
          content blocker, then reopen this form.
        </p>
      )}
    </div>
  );
}

function Tag({ children }) {
  return (
    <span style={{ background:"#F3F4F6", color:"#374151", fontSize:10, fontWeight:500,
                   padding:"3px 9px", borderRadius:99 }}>{children}</span>
  );
}

/* ─── AUTH MODAL ─────────────────────────────────────────────────────────────── */
/* ── Password box with a show/hide eye ───────────────────────────────────────
   Used by every password field: sign in (customers, vendors and the admin all
   sign in through AuthModal), sign up, and both password-reset screens.
   Starts hidden. The eye switches it to plain text and back, so people can
   check what they typed. Any margin in `style` moves to the wrapper, which
   keeps the eye centred on the box. autoComplete stays a password hint while
   the text is visible, so browsers and password managers still treat it as a
   password and don't save it to ordinary form history. */
function EyeIcon({ open }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {open ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  );
}

function PasswordInput({ style = {}, iconColor = "#6B7280",
                                autoComplete = "current-password", ...props }) {
  const [show, setShow] = useState(false);
  const { margin, marginTop, marginBottom, marginLeft, marginRight, ...inputStyle } = style;
  const label = show ? "Hide password" : "Show password";
  return (
    <div style={{ position:"relative", width:"100%",
                  margin, marginTop, marginBottom, marginLeft, marginRight }}>
      <input {...props} type={show ? "text" : "password"} autoComplete={autoComplete}
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        style={{ ...inputStyle, display:"block", width:"100%", paddingRight:46 }} />
      <button type="button" className="pw-eye" aria-label={label} title={label}
        aria-pressed={show}
        /* Keep the cursor in the password box when the eye is clicked. */
        onMouseDown={e => e.preventDefault()}
        onClick={() => setShow(s => !s)}
        style={{ position:"absolute", top:"50%", right:4, transform:"translateY(-50%)",
                 width:38, height:38, display:"flex", alignItems:"center",
                 justifyContent:"center", padding:0, border:"none", borderRadius:8,
                 background:"transparent", color:iconColor, cursor:"pointer" }}>
        {/* Open eye = "show it"; crossed-out eye = "hide it again". */}
        <EyeIcon open={!show} />
      </button>
    </div>
  );
}

/* Vendor sign-up description limits. The minimum is also enforced in the
   database (handle_new_user); keep the two the same. */
const VENDOR_DESC_MIN = 40;
const VENDOR_DESC_MAX = 1000;

function AuthModal({ onClose, onAuth }) {
  const [tab,          setTab]         = useState("login");
  const [role,         setRole]        = useState("user");
  const [step,         setStep]        = useState(1);
  const [loading,      setLoading]     = useState(false);
  const [err,          setErr]         = useState("");
  const [created,      setCreated]     = useState(null);
  const [captcha,      setCaptcha]     = useState(() => genCaptcha());
  const [tsToken,      setTsToken]     = useState("");   /* Turnstile, when enabled */
  const [tosAccepted,  setTosAccepted] = useState(false);
  /* The responsibility box on step 2. Vendors confirm their information is
     true and they're responsible for their posts; hosts confirm they'll check
     vendors themselves before booking. Recorded by handle_new_user as
     profiles.responsibility_accepted_at. */
  const [respAccepted, setRespAccepted] = useState(false);
  const [forgotMsg,    setForgotMsg]   = useState("");  // password-reset confirmation
  const [mailError,    setMailError]   = useState(false); // verification email failed to send
  const [legalView,    setLegalView]   = useState(null);  // Terms / Privacy / Marketplace rules
  /* Which legal docs the user has opened. Acceptance is gated on reading all three. */
  const [legalRead,    setLegalRead]   = useState({ Terms:false, Privacy:false, "Marketplace rules":false });

  /* ── Email verification phase ── */
  const [verifyPhase,  setVerifyPhase] = useState(null);  // null | "email"

  /* ── Rate-limit display ── */
  const [rlState,      setRlState]     = useState({ blocked: false, attemptsLeft: 5 });

  /* ── Document upload (vendor) ── */
  const [docFile,      setDocFile]     = useState(null);
  /* Service photos are no longer collected at signup. Uploading needs a
     session, and with email confirmation on there is none until the vendor
     clicks the link, so the picker lives in the dashboard instead. */

  const [form, setForm] = useState({
    name:"", firstName:"", lastName:"", email:"", password:"", password2:"", phone:"", dob:"", setupKey:"", captchaAnswer:"",
    business:"", bizLegal:"", bizType:"LLC", bizLicense:"", ein:"",
    yearsInBiz:"", bizPhone:"", bizWebsite:"", managingMembers:"",
    bizDescription:"",
    bizAddress:"", bizCity:"", bizState:"TX", bizZip:"",
    serviceAreas:"", schedule:"",
    serviceCities:[], availDays:[], availBlocks:[],
    category:"food",
    capacity:"", travelMiles:"",
  });

  function upd(k, v) {
    setForm(f => {
      const next = { ...f, [k]: v };
      /* Keep the composed full name in sync — the rest of the app (profiles,
         display name, vendor records) reads form.name. */
      if (k === "firstName" || k === "lastName") {
        next.name = `${(k === "firstName" ? v : next.firstName) || ""} ${(k === "lastName" ? v : next.lastName) || ""}`.trim();
      }
      /* Places (venues/restaurants/parks) don't travel — keep radius blank. */
      if (k === "category" && v === "places") next.travelMiles = "";
      return next;
    });
    setErr("");
  }

  /* Toggle a value in one of the multi-select arrays (days, hour blocks,
     service cities) and keep the composed text fields in sync. */
  function toggleArr(key, val) {
    setForm(f => {
      const arr = f[key] || [];
      const next = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
      const patch = { ...f, [key]: next };
      if (key === "availDays")     patch.schedule     = composeSchedule(next, f.availBlocks || []);
      if (key === "availBlocks")   patch.schedule     = composeSchedule(f.availDays || [], next);
      if (key === "serviceCities") patch.serviceAreas = next.join(", ");
      return patch;
    });
    setErr("");
  }

  /* Open a legal doc for reading and record that it's been viewed. */
  function openLegal(key) {
    setLegalView(key);
    setLegalRead(r => (r[key] ? r : { ...r, [key]: true }));
  }

  const totalSteps = 2;   // hosts and vendors alike — see the note in renderStep

  /* Load rate-limit state whenever email changes */
  useEffect(() => {
    if (!form.email) return;
    getRateLimit(form.email).then(setRlState);
  }, [form.email]);

  /* ── Validation per step ── */
  function validateStep() {
    if (tab === "login") return true;
    if (step === 1) {
      if (!form.firstName.trim()) { setErr("Please enter your first name."); return false; }
      if (!form.lastName.trim())  { setErr("Please enter your last name.");  return false; }
      if (role === "vendor" && !form.business.trim()) { setErr("Please enter your business name."); return false; }
      /* PLUJ reviews every vendor by hand before they go live, and this is
         what the review starts from. handle_new_user enforces the same
         minimum, so a script calling the signup endpoint directly can't skip
         it either. Keep VENDOR_DESC_MIN in step with the database. */
      if (role === "vendor" && form.bizDescription.trim().length < VENDOR_DESC_MIN) {
        setErr(`Please describe your business in at least ${VENDOR_DESC_MIN} characters, so PLUJ can review it.`);
        return false;
      }
      if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
        { setErr("Please enter a valid email address."); return false; }
      if (!form.password) { setErr("Please enter a password."); return false; }
      /* Must match Supabase → Auth → Sign In/Providers → Email:
         min length 12, requires lowercase + uppercase + digit + symbol.
         If these drift apart, a user passes this form and is then rejected
         by the server with a raw GoTrue error. */
      if (form.password.length < 12) { setErr("Password must be at least 12 characters."); return false; }
      if (!/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) ||
          !/[0-9]/.test(form.password) || !/[^A-Za-z0-9]/.test(form.password))
        { setErr("Password needs a lowercase letter, an uppercase letter, a number and a symbol (like ! ? # $)."); return false; }
      if (!form.password2) { setErr("Please re-enter your password to confirm it."); return false; }
      if (form.password !== form.password2) { setErr("Passwords don't match. Please re-enter them."); return false; }
      /* Marked required on the form, but nothing checked it and it was never
         saved (meta read form.bizPhone, which this form doesn't have). */
      if (String(form.phone || "").replace(/\D/g, "").length < 10)
        { setErr("Please enter a phone number we can reach you on (10 digits)."); return false; }
      if (!form.dob) { setErr("Please enter your date of birth."); return false; }
      {
        const dobDate = new Date(form.dob);
        if (isNaN(dobDate.getTime())) { setErr("Please enter a valid date of birth."); return false; }
        const now = new Date();
        let age = now.getFullYear() - dobDate.getFullYear();
        const m = now.getMonth() - dobDate.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < dobDate.getDate())) age--;
        if (dobDate > now) { setErr("Date of birth can't be in the future."); return false; }
        if (age < 18) { setErr("You must be at least 18 years old to create an account."); return false; }
        if (age > 120) { setErr("Please enter a valid date of birth."); return false; }
      }
      return true;
    }
    if (step === 2) {
      /* The photo requirement moved to the dashboard along with the upload.
         Demanding a photo here would be unsatisfiable: there is no picker any
         more, because there is no session to upload with until the vendor has
         confirmed their email. */
      /* Whichever check is actually in play. With Turnstile configured the
         arithmetic question is not rendered, so validating it would block on a
         field nobody was shown. */
      if (TURNSTILE_SITE_KEY) {
        if (!tsToken) { setErr("Please complete the human check above."); return false; }
      } else if (parseInt(form.captchaAnswer) !== captcha.answer) {
        setErr(`Verification failed — answer: ${form.captchaAnswer || "(blank)"}`); return false;
      }
      if (!tosAccepted) { setErr("Please accept PLUJ's terms to continue."); return false; }
      if (!respAccepted) {
        setErr(role === "vendor"
          ? "Please confirm that your business information is true and that you're responsible for what you post."
          : "Please confirm that you'll check vendors yourself before you book.");
        return false;
      }
      return true;
    }
    return true;
  }

  function nextStep() { setErr(""); if (!validateStep()) return; setStep(s => s + 1); }

  /* ── Document upload handler ── */
  function handleDocUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setErr("Document must be under 4 MB."); return; }
    const reader = new FileReader();
    reader.onload = ev => setDocFile({ name: file.name, size: file.size,
                                       type: file.type, base64: ev.target.result });
    reader.readAsDataURL(file);
  }

  /* ── Forgot password — send Supabase recovery email ── */
  async function handleForgot() {
    setErr(""); setForgotMsg("");
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setErr("Enter your email above first, then tap “Forgot password?”."); return;
    }
    setLoading(true);
    const redirectTo = (typeof window !== "undefined" ? window.location.origin : "");
    const { error } = await sb.recover(form.email, redirectTo);
    setLoading(false);
    if (error) { setErr(error.message || "Could not send reset email."); return; }
    setForgotMsg("If an account exists for that email, a reset link is on its way. Check your inbox (and spam).");
  }

  /* ── Submit (login or signup final step) — Supabase Auth ── */
  async function submit() {
    setErr("");
    if (!validateStep()) return;
    setLoading(true);

    try {
      /* ━━━ LOGIN ━━━ */
      if (tab === "login") {
        const rl = await getRateLimit(form.email);
        if (rl.blocked) {
          setErr(`Too many failed attempts. Try again in ${rl.resetIn} minute${rl.resetIn===1?"":"s"}.`);
          setLoading(false); return;
        }
        const { data, error } = await sb.signIn(form.email, form.password);
        if (error || !data?.access_token) {
          await recordAttempt(form.email, false);
          const updated = await getRateLimit(form.email);
          setRlState(updated);
          const left = updated.attemptsLeft;
          setErr(`Incorrect email or password.${left <= RATE_CFG.warnAt ? ` ${left} attempt${left===1?"":"s"} remaining.` : ""}`);
          setLoading(false); return;
        }
        await recordAttempt(form.email, true);
        await saveSession(data);
        const u = await getCurrentUser();
        if (!u) { setErr("Login succeeded but profile not found. Please contact support."); setLoading(false); return; }

        /* ── MAINTENANCE MODE ──
           Checked after the password, not before, because "are you an admin?"
           is a question only an authenticated session can answer — and asking
           it before would mean telling an anonymous caller which addresses
           belong to admins.

           The credentials were correct, so this is not a login failure and is
           not counted as one against the rate limit. The session is thrown
           away immediately: a non-admin who got this far holds a token the
           `authenticated` role could still use against the REST API directly,
           so leaving it in their browser would make this a curtain rather
           than a door. */
        if (u.type !== "admin") {
          const status = await getSiteStatus();
          if (status.private) {
            await clearSession();
            setErr("PLUJ is down for maintenance right now. Please try again later.");
            setLoading(false);
            return;
          }
        }

        onAuth(u); onClose();
        return;
      }

      /* ━━━ SIGNUP — via Supabase Auth ━━━ */
      const geo = getGeoSignal();
      const meta = {
        role,
        /* The form has always demanded a date of birth and checked it for 18+,
           and then thrown it away: it was never put in meta, and the database
           trigger inserted a hardcoded null. Every existing profile has dob
           null. So the age gate stopped nobody — the check is client-side and
           the REST API is public — and left no evidence that anyone attested
           to being 18, which is exactly what the Terms require.
           handle_new_user now reads this and refuses under-18 signups. */
        dob:              form.dob || null,
        full_name:        form.name,
        first_name:       form.firstName || null,
        last_name:        form.lastName  || null,
        display_name:     form.name,
        business_name:    form.business      || null,
        biz_legal:        form.bizLegal      || null,
        biz_type:         form.bizType       || null,
        biz_license:      form.bizLicense    || null,
        ein:              form.ein           || null,
        years_in_biz:     form.yearsInBiz    || null,
        /* The form's phone box is form.phone; bizPhone is kept for any caller
           that still sets it. handle_new_user writes this to profiles.phone
           and, for vendors, vendor_profiles.biz_phone. */
        biz_phone:        form.bizPhone || form.phone || null,
        biz_website:      role === "vendor" ? (form.bizWebsite.trim() || null) : null,
        /* The vendor's own description of their business: what the admin
           reviews, and the "About" on their public page once approved. */
        description:      role === "vendor" ? (form.bizDescription.trim() || null) : null,
        managing_members: form.managingMembers || null,
        biz_address:      form.bizAddress    || null,
        biz_city:         form.bizCity       || null,
        biz_state:        form.bizState      || "TX",
        biz_zip:          form.bizZip        || null,
        service_areas:    form.serviceAreas  || null,
        schedule:         form.schedule      || null,
        category:         role === "vendor" ? null : (form.category || null),   // listings carry the category now
        capacity:         form.capacity      || null,
        travel_miles:     form.travelMiles   || null,
        /* These two used to be written by the client after signup, with the
           session Supabase handed back. There is no session any more, so they
           travel here and handle_new_user writes them. */
        project_size:     form.projectSize   || null,
        doc_file_name:    docFile?.name      || null,
        market_id:        "houston-tx",
        /* Required by handle_new_user. */
        responsibility_accepted: respAccepted === true,
      };
      /* Started and completed are separate events on purpose: the gap between
         them is the signup drop-off, which is invisible if you only record
         success. No email, no name — just the role and the moment. */
      /* No new accounts while the site is off. A BEFORE INSERT trigger on
         auth.users refuses this regardless of what the browser does — this
         check exists only so the person reads a sentence instead of
         "signups_disabled_maintenance". */
      {
        const status = await getSiteStatus();
        if (status.private) {
          setErr("PLUJ is down for maintenance right now. Please try again later.");
          setLoading(false); return;
        }
      }

      track("signup_started", { role });
      const { data: authData, error: signUpError } = await sb.signUp(
        form.email, form.password, meta, tsToken || null);
      /* Supabase refuses a second confirmation email to the same address
         within 60 seconds. The first one was sent, so the account exists and
         the email is on its way. Showing the raw "For security purposes, you
         can only request this after 43 seconds" made people think signup had
         failed, when it had worked; send them to the check-your-email screen
         instead, which is the truth. */
      const rateLimited = /only request this after|over_email_send_rate_limit/i
        .test(String(signUpError?.message || "") + " " + String(signUpError?.code || ""));
      if (rateLimited) { setVerifyPhase("email"); setLoading(false); return; }

      /* An address that already has a CONFIRMED account comes back as a 200
         with an empty identities list and no email is sent — Supabase does
         that so the form cannot be used to find out who has an account. Left
         alone, the person was told to check an inbox that would stay empty. */
      if (!signUpError && authData?.user && Array.isArray(authData.user.identities)
          && authData.user.identities.length === 0) {
        setErr("An account with this email already exists. Log in instead, or use Forgot password? if you don't remember it.");
        setLoading(false); return;
      }

      if (signUpError || !authData?.user) {
        setErr(signUpError?.message || "Signup failed. Please try again.");
        /* A Turnstile token is single-use. Whatever the failure was, the old
           token is spent, so reset the widget rather than leaving the customer
           pressing a button that can no longer succeed. */
        if (TURNSTILE_SITE_KEY) {
          setTsToken("");
          try { window.turnstile && window.turnstile.reset(); } catch { /* not mounted */ }
        }
        setLoading(false); return;
      }
      track("signup_completed", { role });

      /* ── Email confirmation is Supabase's job now ──────────────────────────
         There used to be two verification systems: Supabase's, and a home-made
         six-digit code stored in verify_codes and mailed through Resend. Two
         systems where neither actually gated anything — an unverified account
         could book, message and review, because RLS gates on is_active(),
         which only looks at blocked/deactivated.

         Supabase's is the one that cannot be bypassed: it is enforced at the
         auth endpoint, so it applies to anyone calling the API directly, not
         only to people using this form. The six-digit flow is gone.

         The important consequence: with confirmation on, signUp returns NO
         session. Everything that used to happen here with the new user's token
         — writing the vendor application, uploading photos, storing the code —
         would run as anon and be rejected by RLS, silently, because nothing
         checked the result. The account would exist, the vendor would be told
         they had applied, and the application would be empty.

         So the vendor application now travels in the signup metadata and is
         written by handle_new_user, server-side, before any session exists.
         Nothing below needs a token. */

      /* Nothing is held about the new account here on purpose. There is no
         session, so there is no signed-in user to represent; the next thing
         that happens is they click the link in their email and sign in, which
         loads the profile from the database rather than from anything we
         remembered in this tab. */
      setVerifyPhase("email");

    } catch(e) { console.error(e); setErr("Something went wrong. Please try again."); }
    setLoading(false);
  }

  /* submitEmailVerify and resendCode deleted 23 Sep 2026 — Supabase Auth sends
     and checks the confirmation link itself, and its resend lives on the
     "Check your email" screen. */

  function continueGuest() { onAuth({ type:"guest", name:"Guest", id: uid() }); onClose(); }

  const inp = (placeholder, key, type="text", required=false) => type === "password" ? (
    <PasswordInput placeholder={placeholder + (required?" *":"")}
           value={form[key]} onChange={e=>upd(key,e.target.value)}
           autoComplete={tab === "login" ? "current-password" : "new-password"}
      style={{ height:44, padding:"0 14px", border:`1px solid ${C.border}`,
               borderRadius:10, fontSize:14, color:C.black, background:"#fff",
               transition:"border-color 200ms cubic-bezier(0,0,1,1)" }} />
  ) : (
    <input type={type} placeholder={placeholder + (required?" *":"")}
           value={form[key]} onChange={e=>upd(key,e.target.value)}
      style={{ width:"100%", height:44, padding:"0 14px", border:`1px solid ${C.border}`,
               borderRadius:10, fontSize:14, color:C.black, background:"#fff",
               transition:"border-color 200ms cubic-bezier(0,0,1,1)" }} />
  );

  const sel = (key, options, placeholder) => (
    <select value={form[key]} onChange={e=>upd(key,e.target.value)}
      style={{ width:"100%", height:44, padding:"0 14px", border:`1px solid ${C.border}`,
               borderRadius:10, fontSize:14, background:"#fff",
               color: (placeholder && !form[key]) ? C.lightGray : C.black }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  /* ─────────────────────────────────────────────────────────────────────────
     EMAIL VERIFICATION SCREEN
  ───────────────────────────────────────────────────────────────────────── */
  if (verifyPhase === "email") {
    return (
      <div className="modal-overlay" onClick={onClose}
        style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000,
                 display:"flex", alignItems:"center", justifyContent:"center", padding:20,
                 backdropFilter:"blur(4px)" }}>
        <div onClick={e=>e.stopPropagation()} className="fade-up"
          style={{ background:"#fff", borderRadius:22, maxWidth:420, width:"100%",
                   padding:"36px 30px", boxShadow:C.shadowModal, textAlign:"center" }}>
          {/* Supabase sends the confirmation link itself, at the auth endpoint,
              so this screen only has to tell the truth and get out of the way.
              There is no code to type and nothing here to get wrong. */}
          <div style={{ fontSize:48, marginBottom:12 }}>📧</div>
          <h2 style={{ fontFamily:"var(--display)", fontSize:20, fontWeight:800, margin:"0 0 8px" }}>
            Check your email
          </h2>
          <p style={{ fontSize:13, color:C.midGray, margin:"0 0 6px", lineHeight:1.65 }}>
            We sent a confirmation link to <strong style={{ color:C.black }}>{form.email}</strong>
          </p>
          <p style={{ fontSize:13, color:C.midGray, margin:"0 0 20px", lineHeight:1.65 }}>
            Click it to activate your account, then sign in.
          </p>

          {role === "vendor" && (
            <div style={{ background:"#F0F9FF", borderRadius:10, padding:"11px 14px",
                          marginBottom:16, border:"1px solid #BAE6FD", textAlign:"left" }}>
              <p style={{ margin:0, fontSize:11, fontWeight:700, color:"#075985" }}>
                Next: your dashboard
              </p>
              <p style={{ margin:"4px 0 0", fontSize:11, color:"#0369A1", lineHeight:1.55 }}>
                Once you confirm, it walks you through your business details and your
                first listing. That's all PLUJ needs to approve you.
              </p>
            </div>
          )}

          <div style={{ background:"#F9FAFB", borderRadius:10, padding:"11px 14px",
                        marginBottom:18, border:`1px solid ${C.border}`, textAlign:"left" }}>
            <p style={{ margin:0, fontSize:11, color:C.midGray, lineHeight:1.6 }}>
              No email after a minute or two? Check spam. If it still hasn't arrived,
              use <strong>Forgot password?</strong> on the sign-in screen — that also
              confirms your address.
            </p>
          </div>

          <button onClick={onClose} className="btn"
            style={{ width:"100%", padding:"13px 0", borderRadius:12, background:C.orange,
                     color:"#fff", border:"none", fontSize:14, fontWeight:700,
                     boxShadow:C.shadowButton }}>
            Done
          </button>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────
     SUCCESS / ID SCREEN
  ───────────────────────────────────────────────────────────────────────── */
  if (created) {
    const isPending = created.type === "vendor";
    return (
      <div className="modal-overlay" onClick={onClose}
        style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000,
                 display:"flex", alignItems:"center", justifyContent:"center", padding:20,
                 backdropFilter:"blur(4px)" }}>
        <div onClick={e=>e.stopPropagation()} className="fade-up"
          style={{ background:"#fff", borderRadius:22, maxWidth:440, width:"100%",
                   boxShadow:C.shadowModal, overflow:"hidden" }}>
          <div style={{ padding:"38px 30px 34px", textAlign:"center" }}>
            <div style={{ fontSize:52, lineHeight:1, marginBottom:14 }}>
              {isPending ? "⏳" : created.type==="admin" ? "🛡️" : "🎉"}
            </div>
            <h2 style={{ fontFamily:"var(--display)", fontSize:22, fontWeight:800, margin:"0 0 6px" }}>
              {isPending ? "Your business profile is created!" : `Welcome to PLUJ!`}
            </h2>
            <p style={{ fontSize:13, color:C.midGray, margin:"0 0 18px", lineHeight:1.65 }}>
              {isPending
                ? "We'll verify your business details and notify you within 2–3 business days."
                : `Your account is ready, ${created.displayName || created.name}.`}
            </p>

            {created.type === "vendor" && (
              <div style={{ background:"#FFF7ED", border:`1.5px solid ${C.orangeBorder}`, borderRadius:14,
                            padding:"14px 16px", marginBottom:16, textAlign:"left" }}>
                <p style={{ margin:"0 0 9px", fontSize:12, fontWeight:800, color:C.orange }}>
                  What happens next
                </p>
                {[
                  ["✓", "Profile created", "Your business account is set up.", true],
                  ["2", "Add your listings", "Each service you sell is its own listing — a venue, a food truck, a DJ set. Add as many as you offer.", false],
                  ["3", "Go live", "Once approved, your listings appear in the marketplace and customers can book.", false],
                ].map(([badge, title, desc, done]) => (
                  <div key={title} style={{ display:"flex", gap:10, marginBottom:9 }}>
                    <span style={{ width:20, height:20, borderRadius:99, flexShrink:0, marginTop:1,
                                   background: done ? C.green : "#fff",
                                   border: done ? "none" : `1.5px solid ${C.orange}`,
                                   color: done ? "#fff" : C.orange,
                                   fontSize:10.5, fontWeight:800, display:"flex",
                                   alignItems:"center", justifyContent:"center" }}>{badge}</span>
                    <div>
                      <p style={{ margin:0, fontSize:12.5, fontWeight:800, color:C.black }}>{title}</p>
                      <p style={{ margin:"1px 0 0", fontSize:11, color:"#9A3412", lineHeight:1.5 }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background:"#F9FAFB", border:`1.5px solid ${C.border}`, borderRadius:14,
                          padding:"16px 20px", marginBottom:18, textAlign:"left" }}>
              <p style={{ margin:0, fontSize:9, fontWeight:800, color:C.midGray,
                          textTransform:"uppercase", letterSpacing:"0.1em" }}>
                Your {created.type==="vendor" ? "Vendor" : created.type==="admin" ? "Admin" : "Host"} ID — save this
              </p>
              <p style={{ margin:"7px 0 0", fontFamily:"monospace", fontSize:21, fontWeight:800,
                          letterSpacing:"0.07em", color:C.black }}>{created.id}</p>
              <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:10, fontWeight:700,
                               color: created.emailVerified ? C.green : "#D97706",
                               background: created.emailVerified ? C.greenSoft : "#FFFBEB",
                               padding:"2px 8px", borderRadius:99 }}>
                  {created.emailVerified ? "✓ Email verified" : "⏳ Email verified"}
                </span>
                {isPending && (
                  <span style={{ fontSize:10, fontWeight:700, color:"#D97706",
                                 background:"#FFFBEB", padding:"2px 8px", borderRadius:99 }}>
                    ⏳ Awaiting admin approval
                  </span>
                )}
              </div>
            </div>
            <button onClick={()=>{ onAuth(created); onClose(); }} className="btn"
              style={{ width:"100%", padding:"13px 0", borderRadius:12, background:C.orange,
                       color:"#fff", border:"none", fontSize:14, fontWeight:700,
                       boxShadow:C.shadowButton }}>
              {isPending ? "Continue to dashboard" : "Start exploring →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────
     MAIN FORM
  ───────────────────────────────────────────────────────────────────────── */

  const StepDots = () => (
    <div style={{ marginBottom:14 }}>
      <div style={{ background:"#FFF7ED", border:`1px solid ${C.orangeBorder}`, borderRadius:10,
                    padding:"9px 12px", marginBottom:12 }}>
        <p style={{ margin:0, fontSize:11.5, fontWeight:800, color:C.orange }}>
          {/* Was "Step 1 of 2". It meant stage 1 of the two-part journey
              (business account now, listings after approval) — but it sits
              directly above a four-dot stepper reading 1 Login, 2 Business,
              3 Location, 4 Finish. Two different counters, both called "Step",
              stacked on top of each other: a vendor on the first screen was
              told they were on step 1 of 2 while looking at four steps. Same
              meaning, without the collision. */}
          First, your business profile — then your listings
        </p>
        <p style={{ margin:"3px 0 0", fontSize:11, color:"#9A3412", lineHeight:1.55 }}>
          This is your business account. Once it's approved you'll add your
          <strong> listings</strong> — the individual services customers actually book.
        </p>
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:0 }}>
        {["Login","Business","Location","Finish"].map((label, i) => {
          const n = i + 1, active = n === step, done = n < step;
          return (
            <React.Fragment key={n}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                <div style={{ width:26, height:26, borderRadius:"50%",
                              background: done ? C.green : active ? C.orange : "#E5E7EB",
                              color: (done||active) ? "#fff" : C.lightGray,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              fontSize:11, fontWeight:800, transition:"all 300ms ease" }}>
                  {done ? "✓" : n}
                </div>
                <span style={{ fontSize:9, fontWeight:600,
                               color: active ? C.orange : done ? C.green : C.lightGray }}>
                  {label}
                </span>
              </div>
              {i < 3 && (
                <div style={{ width:36, height:2, marginBottom:14,
                              background: n < step ? C.green : "#E5E7EB",
                              transition:"background 300ms ease" }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  const renderStep = () => {
    /* LOGIN */
    if (tab === "login") return (
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {rlState.blocked && (
          <div style={{ background:"#FEF2F2", borderRadius:10, padding:"10px 14px",
                        border:"1px solid #FCA5A5" }}>
            <p style={{ margin:0, fontSize:12, fontWeight:700, color:"#991B1B" }}>
              🔒 Account temporarily locked
            </p>
            <p style={{ margin:"3px 0 0", fontSize:11, color:"#B91C1C" }}>
              Too many failed attempts. Try again in {rlState.resetIn} minute{rlState.resetIn===1?"":"s"}.
            </p>
          </div>
        )}
        {!rlState.blocked && rlState.attemptsLeft <= RATE_CFG.warnAt && rlState.attemptsLeft > 0 && (
          <div style={{ background:"#FFFBEB", borderRadius:10, padding:"8px 12px",
                        border:"1px solid #FCD34D" }}>
            <p style={{ margin:0, fontSize:11, color:"#92400E" }}>
              ⚠️ {rlState.attemptsLeft} attempt{rlState.attemptsLeft===1?"":"s"} remaining before lockout.
            </p>
          </div>
        )}
        {inp("Email address", "email", "email", true)}
        {inp("Password", "password", "password", true)}
        {forgotMsg && (
          <p style={{ margin:0, fontSize:11, color:C.green, fontWeight:600 }}>{forgotMsg}</p>
        )}
        <button type="button" onClick={handleForgot}
          style={{ alignSelf:"flex-start", background:"transparent", border:"none", padding:0,
                   color:C.midGray, fontSize:12, fontWeight:600, cursor:"pointer", textDecoration:"underline" }}>
          Forgot password?
        </button>
      </div>
    );

    /* STEP 1: Account */
    if (step === 1) return (
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"flex", gap:8 }}>
          {inp("First name", "firstName", "text", true)}
          {inp("Last name",  "lastName",  "text", true)}
        </div>
        {role === "vendor" && inp("Business / stage name", "business", "text", true)}
        {role === "vendor" && (
          <div>
            <label htmlFor="signup-biz-desc"
              style={{ display:"block", fontSize:12, fontWeight:600, color:C.midGray, marginBottom:4 }}>
              Describe your business *{" "}
              <span style={{ fontWeight:400 }}>(PLUJ reviews this before approving you)</span>
            </label>
            <textarea id="signup-biz-desc" value={form.bizDescription} maxLength={VENDOR_DESC_MAX}
              onChange={e=>upd("bizDescription", e.target.value)} rows={4}
              placeholder="What you offer, the events you work and how long you've been doing it. For example: Houston DJ for weddings and quinceañeras since 2018, with my own sound and lights."
              style={{ width:"100%", padding:"10px 14px", border:`1px solid ${C.border}`, borderRadius:10,
                       fontSize:14, color:C.black, background:"#fff", resize:"vertical", lineHeight:1.5,
                       fontFamily:"'Figtree', system-ui, sans-serif", boxSizing:"border-box" }} />
            {(() => {
              const n = form.bizDescription.trim().length;
              const ok = n >= VENDOR_DESC_MIN;
              return (
                <p style={{ margin:"2px 0 0", fontSize:11, fontWeight:600, color: ok ? "#047857" : C.midGray }}>
                  {ok ? "✓ " : ""}{n} / {VENDOR_DESC_MIN} characters minimum
                </p>
              );
            })()}
          </div>
        )}
        {role === "vendor" && inp("Website, Instagram or Facebook (optional)",
                                  "bizWebsite", "text", false)}
        {inp("Email address", "email", "email", true)}
        {inp("Password", "password", "password", true)}
        {/* Requirements shown up front rather than revealed one error at a time.
            Each rule ticks green as it is met — four unmet criteria discovered
            after submit is a leading cause of signup abandonment. */}
        <ul style={{ margin:"-2px 0 0", padding:0, listStyle:"none", display:"flex",
                     flexWrap:"wrap", gap:"2px 10px" }}>
          {[
            ["12+ characters",     form.password.length >= 12],
            ["upper & lowercase",  /[a-z]/.test(form.password) && /[A-Z]/.test(form.password)],
            ["a number",           /[0-9]/.test(form.password)],
            ["a symbol",           /[^A-Za-z0-9]/.test(form.password)],
          ].map(([label, ok]) => (
            <li key={label} style={{ fontSize:11, fontWeight:600,
                                     color: ok ? "#047857" : C.midGray }}>
              <span aria-hidden="true">{ok ? "✓" : "•"}</span>{" "}
              <span>{label}</span>
              <span style={{ position:"absolute", width:1, height:1, overflow:"hidden", clip:"rect(0 0 0 0)" }}>
                {ok ? " — met" : " — not yet met"}
              </span>
            </li>
          ))}
        </ul>
        {inp("Confirm password", "password2", "password", true)}
        {form.password2 && form.password !== form.password2 && (
          <p style={{ margin:"-4px 0 0", fontSize:11, color:"#B91C1C", fontWeight:600 }}>
            Passwords don't match.
          </p>
        )}
        {form.password2 && form.password === form.password2 && (
          <p style={{ margin:"-4px 0 0", fontSize:11, color:C.green, fontWeight:600 }}>
            ✓ Passwords match.
          </p>
        )}
        {inp("Phone number", "phone", "tel", true)}
        <div>
          <label htmlFor="signup-dob"
            style={{ display:"block", fontSize:12, fontWeight:600, color:C.midGray, marginBottom:4 }}>
            Date of birth * <span style={{ fontWeight:400 }}>(must be 18 or older)</span>
          </label>
          <input id="signup-dob" type="date" value={form.dob} onChange={e=>upd("dob",e.target.value)}
            max={new Date().toISOString().split("T")[0]}
            style={{ width:"100%", height:44, padding:"0 14px", border:`1px solid ${C.border}`,
                     borderRadius:10, fontSize:14, color: form.dob?C.black:C.lightGray,
                     background:"#fff", boxSizing:"border-box" }} />
        </div>
      </div>
    );

    /* Vendor steps 2 and 3 (business info, location & service) were deleted
       on 30 Sep 2026. Vendors now sign up exactly like hosts plus a business
       name, and fill in their business details and listings from the
       dashboard after confirming their email. Asking all of it up front made
       signup four screens long and asked for the same things a listing asks
       for again later, which is what confused vendors. */

    /* STEP 2 (everyone): CAPTCHA + ToS */
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        <div style={{ background:"#F9FAFB", borderRadius:12, padding:"14px 16px" }}>
          <p style={{ margin:"0 0 8px", fontSize:12, fontWeight:700, color:C.black }}>
            🤖 Prove you're human
          </p>
          {TURNSTILE_SITE_KEY ? (
            /* Cloudflare verifies this, and Supabase Auth checks the token
               server-side, so it cannot be skipped by anyone scripting the
               signup endpoint directly. Most real visitors never see a puzzle. */
            <Turnstile onToken={setTsToken} />
          ) : (
            <>
              <p style={{ margin:"0 0 10px", fontSize:13, color:C.midGray }}>
                What is <strong>{captcha.q}</strong>?
              </p>
              <input type="number" placeholder="Your answer" value={form.captchaAnswer}
                onChange={e=>upd("captchaAnswer",e.target.value)}
                style={{ width:"100%", height:44, padding:"0 14px", border:`1px solid ${C.border}`,
                         borderRadius:10, fontSize:16, fontWeight:700, color:C.black,
                         background:"#fff", textAlign:"center" }} />
            </>
          )}
        </div>
        {legalView && <InfoPageModal page={legalView} onClose={()=>setLegalView(null)} />}

        {/* One-click acceptance. The documents stay one tap away for anyone who
            wants to read them, but nothing blocks accepting. */}
        {(() => {
          const LinkTo = ({ doc, label }) => (
            <span onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); openLegal(doc); }}
              style={{ color:C.orange, fontWeight:700, cursor:"pointer", textDecoration:"underline",
                       whiteSpace:"nowrap" }}>
              {label}
            </span>
          );
          return (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button type="button" onClick={()=>setTosAccepted(a => !a)}
                style={{ display:"flex", alignItems:"flex-start", gap:11, width:"100%", textAlign:"left",
                         cursor:"pointer", padding:"14px 15px", borderRadius:12,
                         border:`1.5px solid ${tosAccepted ? C.orange : C.border}`,
                         background: tosAccepted ? "#FFF7ED" : "#fff" }}>
                <span style={{ width:20, height:20, borderRadius:6, flexShrink:0, marginTop:1,
                               display:"flex", alignItems:"center", justifyContent:"center",
                               border:`2px solid ${tosAccepted ? C.orange : "#D6D3D1"}`,
                               background: tosAccepted ? C.orange : "#fff",
                               color:"#fff", fontSize:13, fontWeight:900 }}>
                  {tosAccepted ? "✓" : ""}
                </span>
                <span style={{ flex:1 }}>
                  <span style={{ display:"block", fontSize:13, fontWeight:800, color:C.black, marginBottom:3 }}>
                    I accept all of PLUJ's terms
                  </span>
                  <span style={{ display:"block", fontSize:11.5, color:C.midGray, lineHeight:1.6 }}>
                    This covers the <LinkTo doc="Terms" label="Terms of Service" />,{" "}
                    <LinkTo doc="Privacy" label="Privacy Policy" /> and{" "}
                    <LinkTo doc="Marketplace rules" label="Marketplace Rules" />. I confirm my
                    information is accurate{role === "vendor" ? ", and I understand my business must be verified before listing services" : ""}.
                    If I don't follow these terms, PLUJ may suspend, block or remove my account.
                  </span>
                </span>
              </button>
            </div>
          );
        })()}
        {/* Second, separate box: the specific promise for this role. Kept
            apart from the general terms box on purpose, so nobody can say
            they agreed to it without seeing it. The wording mirrors the
            "Vendors: you are responsible for what you post" and "Hosts: check
            vendors before you book" sections of the Terms. */}
        <button type="button" onClick={()=>setRespAccepted(a => !a)}
          style={{ display:"flex", alignItems:"flex-start", gap:11, width:"100%", textAlign:"left",
                   cursor:"pointer", padding:"14px 15px", borderRadius:12,
                   border:`1.5px solid ${respAccepted ? C.orange : C.border}`,
                   background: respAccepted ? "#FFF7ED" : "#fff" }}>
          <span style={{ width:20, height:20, borderRadius:6, flexShrink:0, marginTop:1,
                         display:"flex", alignItems:"center", justifyContent:"center",
                         border:`2px solid ${respAccepted ? C.orange : "#D6D3D1"}`,
                         background: respAccepted ? C.orange : "#fff",
                         color:"#fff", fontSize:13, fontWeight:900 }}>
            {respAccepted ? "✓" : ""}
          </span>
          {role === "vendor" ? (
            <span style={{ flex:1 }}>
              <span style={{ display:"block", fontSize:13, fontWeight:800, color:C.black, marginBottom:3 }}>
                My business information is true, and I'm responsible for what I post
              </span>
              <span style={{ display:"block", fontSize:11.5, color:C.midGray, lineHeight:1.6 }}>
                Everything I tell PLUJ and hosts about me and my business, at sign-up, in my profile and
                in every listing, photo, price and message, is true, accurate and mine to post. I actually
                offer the services I list and will deliver what I promise. I'm solely responsible and liable
                for my posts and my services, and I won't use PLUJ to mislead or scam anyone or take money
                for services I won't provide. False information can get my account removed and reported to
                the authorities.
              </span>
            </span>
          ) : (
            <span style={{ flex:1 }}>
              <span style={{ display:"block", fontSize:13, fontWeight:800, color:C.black, marginBottom:3 }}>
                I'll check vendors myself before I book
              </span>
              <span style={{ display:"block", fontSize:11.5, color:C.midGray, lineHeight:1.6 }}>
                PLUJ reviews vendor applications but can't control or guarantee what vendors post, whether
                it's true, or how they perform. Before booking or paying any vendor I'll do my own due
                diligence: read their reviews and listing, ask questions, and get the price, deposit and
                cancellation terms in writing. Choosing and paying a vendor is my decision and my risk, and
                PLUJ isn't liable for what a vendor does.
              </span>
            </span>
          )}
        </button>
        {role === "vendor" && (
          <div style={{ background:"#FFFBEB", borderRadius:10, padding:"12px 14px",
                        border:"1px solid #FCD34D" }}>
            <p style={{ margin:0, fontSize:11, color:"#92400E", lineHeight:1.65 }}>
              <strong>📋 What happens next:</strong> confirm your email → add your business
              details and your listings from your dashboard → PLUJ reviews and approves your
              business → your listings go live. You'll see the approval in your dashboard.
            </p>
          </div>
        )}
      </div>
    );
  };

  const isLastStep  = step === totalSteps;
  const isFinalSubmit = tab === "login" || isLastStep;

  return (
    <div className="modal-overlay" onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000,
               display:"flex", alignItems:"center", justifyContent:"center", padding:20,
               backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} className="fade-up"
        style={{ background:"#fff", borderRadius:22, maxWidth:460, width:"100%", overflow:"hidden",
                 boxShadow:C.shadowModal, maxHeight:"92vh", display:"flex", flexDirection:"column" }}>

        {/* Tab bar */}
        <div style={{ padding:"22px 24px 0", display:"flex", justifyContent:"space-between",
                      alignItems:"center", flexShrink:0 }}>
          <div style={{ display:"flex", gap:6, background:"#F3F4F6", borderRadius:99, padding:4 }}>
            {["login","signup"].map(t => (
              <button key={t} onClick={()=>{setTab(t);setErr("");setStep(1);setTosAccepted(false);setRespAccepted(false);setLegalRead({ Terms:false, Privacy:false, "Marketplace rules":false });setCaptcha(genCaptcha());setRlState({blocked:false,attemptsLeft:5});}} className="btn"
                style={{ padding:"7px 18px", borderRadius:99, fontSize:13, fontWeight:600, border:"none",
                         background: tab===t ? "#fff" : "transparent",
                         color: tab===t ? C.black : C.midGray,
                         boxShadow: tab===t ? "0 1px 4px rgba(0,0,0,0.10)" : "none" }}>
                {t === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="btn"
            style={{ background:"#F3F4F6", border:"none", borderRadius:"50%", width:30, height:30,
                     display:"flex", alignItems:"center", justifyContent:"center", fontSize:15,
                     color:C.midGray }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding:"16px 24px 24px", display:"flex", flexDirection:"column",
                      gap:12, overflowY:"auto", flex:1 }}>

          {/* Role selector */}
          {tab === "signup" && step === 1 && (
            <div>
              <p style={{ fontSize:11, fontWeight:600, color:C.midGray, marginBottom:8 }}>I am a…</p>
              <div style={{ display:"flex", gap:7 }}>
                {[["user","👤","Host"],["vendor","🏪","Vendor"]].map(([r,em,label])=>(
                  <button key={r} onClick={()=>{setRole(r);setStep(1);setRespAccepted(false);}} className="btn"
                    style={{ flex:1, padding:"9px 6px", borderRadius:12,
                             border:`2px solid ${role===r ? C.orange : C.border}`,
                             background: role===r ? C.orangeSoft : "#fff",
                             fontSize:11, fontWeight:700, color: role===r ? C.orange : C.midGray,
                             display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                    <Emoji e={em} size={13} />{label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "signup" && role === "vendor" && step === 1 && (
            <div style={{ background:"#FFF7ED", border:`1px solid ${C.orangeBorder}`, borderRadius:10,
                          padding:"10px 12px" }}>
              <p style={{ margin:0, fontSize:12, fontWeight:800, color:C.orange }}>
                Creating your vendor account takes one minute
              </p>
              <p style={{ margin:"3px 0 0", fontSize:11.5, color:"#9A3412", lineHeight:1.55 }}>
                Tell us who you are and what your business does. PLUJ reviews every vendor
                before they go live. After you confirm your email, your dashboard walks you
                through your business details and your first <strong>listing</strong> — each
                service you offer (a DJ set, a taco truck, a venue) is its own listing.
              </p>
            </div>
          )}

          {renderStep()}

          {err && <p style={{ fontSize:12, color:"#EF4444", fontWeight:600, margin:0 }}>{err}</p>}

          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            {tab === "signup" && step > 1 && (
              <button onClick={()=>{setStep(s=>s-1);setErr("");}} className="btn"
                style={{ flex:1, padding:"12px 0", borderRadius:12, background:"#F3F4F6",
                         color:C.midGray, border:"none", fontSize:13, fontWeight:600 }}>
                ← Back
              </button>
            )}
            <button onClick={isFinalSubmit ? submit : nextStep}
              disabled={loading || (tab==="login" && rlState.blocked)} className="btn"
              style={{ flex:1, background: (loading || (tab==="login" && rlState.blocked)) ? "#F3F4F6" : C.orange,
                       color: (loading || (tab==="login" && rlState.blocked)) ? C.midGray : "#fff",
                       borderRadius:12, padding:"13px 0", fontSize:14, fontWeight:700,
                       border:"none", boxShadow: loading ? "none" : C.shadowButton }}>
              {loading ? "Please wait…"
                : tab === "login" ? "Log in"
                : isLastStep ? (role === "vendor" ? "Create vendor account" : "Create account & verify email")
                : "Continue →"}
            </button>
          </div>

          {tab === "login" && (
            <div style={{ textAlign:"center" }}>
              <button onClick={continueGuest} className="btn"
                style={{ background:"none", border:"none", fontSize:13, color:C.midGray,
                         textDecoration:"underline" }}>
                Continue as guest
              </button>
            </div>
          )}

          <p style={{ fontSize:11, color:C.lightGray, textAlign:"center", lineHeight:1.6, margin:0 }}>
            {tab === "login"
              ? "5 failed attempts trigger a 15-minute lockout."
              : role === "vendor"
              ? "Every vendor application is reviewed before their listings go live."
              : "We'll email you a link to confirm your address."}
          </p>
        </div>
      </div>
    </div>
  );
}


/* ─── REQUEST SENT MODAL ─────────────────────────────────────────────────────── */
/* The stamp on the hero photo: the promise. */
function Stamp() {
  return (
    <svg viewBox="0 0 140 140" aria-hidden="true" focusable="false" data-no-translate>
      <defs><path id="stamp-ring" d="M70,70 m-52,0 a52,52 0 1,1 104,0 a52,52 0 1,1 -104,0" /></defs>
      <circle cx="70" cy="70" r="68" fill="#000" />
      <circle cx="70" cy="70" r="40" fill="none" stroke="#fff" strokeWidth="1.5" />
      <text fill="#fff" style={{ fontFamily:"var(--display)", fontWeight:800, fontSize:17 }}>
        <textPath href="#stamp-ring" textLength="318" lengthAdjust="spacing">ONE PRICE ● NO FEES ADDED ●</textPath>
      </text>
      <text x="70" y="84" textAnchor="middle" fill="#FF5C28" style={{ fontFamily:"var(--display)", fontWeight:900, fontSize:44 }}>$</text>
    </svg>
  );
}


/* English / Español switch. The page itself is translated in i18n.js; this
   only flips it and remembers the choice. Never translated itself. */
function LangToggle({ light = false }) {
  const [cur, setCur] = useState(getLang());
  const [busy, setBusy] = useState(false);
  useEffect(() => onLangChange(setCur), []);
  const next = cur === "es" ? "en" : "es";
  return (
    <button type="button" data-no-translate className="btn"
      disabled={busy}
      onClick={async () => { setBusy(true); try { await setLang(next); track("language_changed", { to: next }); } finally { setBusy(false); } }}
      aria-label={cur === "es" ? "Switch to English" : "Cambiar a español"}
      title={cur === "es" ? "Switch to English" : "Cambiar a español"}
      style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 10px", borderRadius:99, cursor:"pointer",
               fontSize:12, fontWeight:800, letterSpacing:"0.02em",
               border:`1px solid ${light ? "rgba(255,255,255,0.35)" : C.border}`,
               background: light ? "rgba(255,255,255,0.12)" : "#fff",
               color: light ? "#fff" : C.black }}>
      <span aria-hidden="true" style={{ fontSize:13 }}>🌐</span>
      <span style={{ opacity: cur === "en" ? 1 : 0.55 }}>EN</span>
      <span style={{ opacity:0.4 }}>|</span>
      <span style={{ opacity: cur === "es" ? 1 : 0.55 }}>ES</span>
    </button>
  );
}

function RequestSentModal({ requests, onClose, onViewAccount }) {
  /* requests = array of {id, vendorName, status, eventDate, eventType} */
  const multi = requests.length > 1;
  const booked  = requests.filter(r => r.status === "confirmed");
  const allBooked = booked.length === requests.length;
  return (
    <div className="modal-overlay" onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000,
               display:"flex", alignItems:"center", justifyContent:"center", padding:20,
               backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} className="fade-up"
        style={{ background:"#fff", borderRadius:22, maxWidth:420, width:"100%",
                 boxShadow:C.shadowModal, overflow:"hidden" }}>
        <div style={{ padding:"36px 28px 32px", textAlign:"center" }}>
          <div style={{ fontSize:52, lineHeight:1, marginBottom:14 }}>{allBooked ? "⚡" : "📩"}</div>
          <h2 style={{ fontFamily:"var(--display)", fontSize:22, fontWeight:800, margin:"0 0 8px" }}>
            {allBooked ? (multi ? "You're booked!" : "You're booked!")
              : booked.length ? `${booked.length} booked, ${requests.length - booked.length} sent`
              : (multi ? "Requests sent!" : "Request sent!")}
          </h2>
          <p style={{ fontSize:13, color:C.midGray, margin:"0 0 22px", lineHeight:1.65 }}>
            {allBooked
              ? (multi ? "Every vendor confirmed instantly. You'll find the details in My Requests."
                       : `${requests[0]?.vendorName} is confirmed instantly. You'll find the details in My Requests.`)
              : booked.length
                ? "Vendors with instant booking are confirmed now. The others will review your request and respond, usually within 24 hours."
                : multi
                  ? `Your booking requests have been sent to ${requests.length} vendors. They'll review and respond — usually within 24 hours.`
                  : `Your request has been sent to ${requests[0]?.vendorName}. They'll confirm availability shortly.`}
          </p>

          {/* Request cards */}
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:22,
                        maxHeight:200, overflowY:"auto" }}>
            {requests.map(req => (
              <div key={req.id} style={{ background:"#F9FAFB", borderRadius:12, padding:"10px 14px",
                                          display:"flex", justifyContent:"space-between",
                                          alignItems:"center", border:`1px solid ${C.border}` }}>
                <div style={{ textAlign:"left" }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:700 }}>{req.vendorName}</p>
                  <p style={{ margin:"2px 0 0", fontSize:10, color:C.lightGray, fontFamily:"monospace" }}>{req.id}</p>
                </div>
                {req.status === "confirmed" ? (
                  <span style={{ fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:99,
                                 background:C.greenSoft, color:"#065F46" }}>
                    ⚡ Booked
                  </span>
                ) : (
                  <span style={{ fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:99,
                                 background:"#FFFBEB", color:"#D97706" }}>
                    ⏳ Pending
                  </span>
                )}
              </div>
            ))}
          </div>

          <div style={{ background:"#EFF6FF", borderRadius:12, padding:"11px 14px",
                        marginBottom:20, textAlign:"left" }}>
            <p style={{ margin:0, fontSize:11, color:"#1D4ED8", lineHeight:1.65 }}>
              <strong>📱 What happens next:</strong> Each vendor reviews your request and confirms
              or declines. You'll receive a notification when they respond. You can track all
              requests in your account.
            </p>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button onClick={onViewAccount} className="btn"
              style={{ width:"100%", padding:"13px 0", borderRadius:12, background:C.black,
                       color:"#fff", border:"none", fontSize:14, fontWeight:700 }}>
              View my requests
            </button>
            <button onClick={onClose} className="btn"
              style={{ width:"100%", padding:"11px 0", borderRadius:12, background:"#F3F4F6",
                       color:C.midGray, border:"none", fontSize:13, fontWeight:600 }}>
              Continue browsing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ─── ACCOUNT PANEL ───────────────────────────────────────────────────────────── */
/* ─── REQUEST DETAIL + EDIT MODAL ────────────────────────────────────────────── */
function RequestDetailModal({ req, user, onClose, onUpdate, onCancel }) {
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");
  const [form, setForm] = useState({
    eventType: req.eventType || "",
    eventDate: req.eventDate || "",
    guests:    req.guests    || "",
    venue:     req.venue     || "",
    venueType: req.venueType || "",
    streetAddress: req.streetAddress || "",
    addressLine2:  req.addressLine2  || "",
    city:      req.city      || "",
    state:     req.state     || "",
    zip:       req.zip       || "",
    startTime: req.startTime || "",
    endTime:   req.endTime   || "",
    endDate:   req.endDate   || req.end_date || "",
    accessInstructions: req.accessInstructions || "",
    message:   req.message   || "",
  });

  function upd(k, v) { setForm(f => ({...f, [k]: v})); setErr(""); }

  async function saveChanges() {
    if (!form.eventDate) { setErr("Please enter an event date."); return; }
    /* Guard the value, not just the picker. `min` on the input stops the
       calendar offering past days, but it does not stop a typed date, and it
       says nothing about the time — so "today at 9am" typed in at 4pm would
       otherwise sail through. */
    const gone = pastEventReason(form.eventDate, form.startTime);
    if (gone) { setErr(`You can't move an event to a time in the past — ${gone}.`); return; }
    if (form.endDate && form.endDate < form.eventDate) {
      setErr("The event can't finish before it starts."); return;
    }
    if (!form.city.trim()) { setErr("Please add at least the event city."); return; }
    setSaving(true);
    try {
      if (IS_PREVIEW) {
        const stored = await _pGet("req:" + req.id);
        if (stored) await _pSet("req:" + req.id, { ...stored, ...form, updated_at: new Date().toISOString() });
      } else {
        const wasConfirmed = isConfirmedStatus(req.status);
        /* Changing a CONFIRMED booking sends it back to pending so the vendor
           re-approves the new details. Pending ones just update in place. */
        const patch = {
          event_type: form.eventType || null, event_date: form.eventDate || null,
          guests: form.guests || null, venue: form.venue || null,
          venue_type: form.venueType || null, street_address: form.streetAddress || null,
          address_line2: form.addressLine2 || null, city: form.city || null,
          state: form.state || null, zip_code: form.zip || null,
          start_time: form.startTime || null, end_time: form.endTime || null,
          end_date: form.endDate || null,
          access_instructions: form.accessInstructions || null,
          message: form.message || null, updated_at: new Date().toISOString(),
        };
        if (wasConfirmed) patch.status = "pending";

        /* Only filter by the row id + owner. Filtering on status="pending" here
           was silently matching zero rows for confirmed bookings, so the save
           looked like it worked but changed nothing. */
        const { data, error } = await sb.from("booking_requests")
          .eq("id", req.id).eq("user_id", user.id)
          .update(patch);

        if (error) {
          setErr(error.message || "Could not save those changes.");
          setSaving(false);
          return;
        }
        if (Array.isArray(data) && data.length === 0) {
          setErr("Nothing was saved — you may not have permission to change this booking, or it no longer exists.");
          setSaving(false);
          return;
        }
        onUpdate?.({ ...req, ...form, ...(wasConfirmed ? { status: "pending" } : {}) });
        setEditing(false);
        setSaving(false);
        return;
      }
      onUpdate?.({ ...req, ...form });
      setEditing(false);
    } catch(e) { setErr("Failed to save. Please try again."); }
    setSaving(false);
  }

  const isOwner   = user?.id === req.userId;
  const isLive    = isPendingStatus(req.status) || isConfirmedStatus(req.status);
  const canEdit   = isOwner && isLive;
  const canCancel = isOwner && isLive;

  /* Cancellation policy: cancelling a CONFIRMED booking within 48 hours of the
     event start incurs a late-cancellation fee for the customer. Pending
     requests can always be withdrawn free — nothing was committed yet. */
  const hoursToEvent = (() => {
    if (!req.eventDate) return null;
    const when = new Date(`${req.eventDate}T${req.startTime || "00:00"}:00`);
    if (isNaN(when.getTime())) return null;
    return (when.getTime() - Date.now()) / 3600000;
  })();
  const lateCancel = isConfirmedStatus(req.status) && hoursToEvent != null && hoursToEvent < 48;

  const sc = {
    pending:   { bg:"#FFFBEB", c:"#D97706", t:"⏳ Pending"   },
    /* The vendor's accept writes "confirmed"; older rows may say "approved"
       or "accepted". Accept all three so a booked job never shows Pending. */
    approved:  { bg:"#ECFDF5", c:"#065F46", t:"✓ Confirmed"  },
    confirmed: { bg:"#ECFDF5", c:"#065F46", t:"✓ Confirmed"  },
    accepted:  { bg:"#ECFDF5", c:"#065F46", t:"✓ Confirmed"  },
    rejected:  { bg:"#FEF2F2", c:"#EF4444", t:"✗ Declined"   },
    declined:  { bg:"#FEF2F2", c:"#EF4444", t:"✗ Declined"   },
    cancelled: { bg:"#F3F4F6", c:"#6B7280", t:"✕ Cancelled"  },
    completed: { bg:"#EFF6FF", c:"#1D4ED8", t:"✓ Completed"  },
  }[req.status] || { bg:"#FFFBEB", c:"#D97706", t:"⏳ Pending" };

  return (
    <div className="modal-overlay" onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1100,
               display:"flex", alignItems:"center", justifyContent:"center",
               padding:20, backdropFilter:"blur(4px)" }}>
      <div onClick={e => e.stopPropagation()} className="fade-up"
        style={{ background:"#fff", borderRadius:22, maxWidth:460, width:"100%",
                 maxHeight:"88vh", display:"flex", flexDirection:"column",
                 boxShadow:C.shadowModal, overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"18px 20px 14px", borderBottom:`1px solid ${C.border}`,
                      display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexShrink:0 }}>
          <div>
            <p style={{ margin:"0 0 2px", fontSize:9, fontWeight:800, color:C.midGray,
                        textTransform:"uppercase", letterSpacing:"0.08em" }}>Booking Request</p>
            <p style={{ margin:"0 0 4px", fontSize:15, fontWeight:800, color:C.black }}>
              {user.type === "vendor" ? (req.userName || "Guest") : (req.vendorName || "Vendor")}
            </p>
            <p style={{ margin:0, fontSize:10, fontFamily:"monospace", color:C.lightGray }}>{req.id}</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, fontWeight:800, padding:"4px 10px", borderRadius:99,
                           background:sc.bg, color:sc.c }}>{sc.t}</span>
            <button onClick={onClose} className="btn"
              style={{ background:"#F3F4F6", border:"none", borderRadius:"50%", width:28, height:28,
                       fontSize:14, color:C.midGray, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>

          {/* Status banners */}
          {isConfirmedStatus(req.status) && (
            <div style={{ background:"#ECFDF5", borderRadius:10, padding:"10px 14px", marginBottom:14, border:"1px solid #86EFAC" }}>
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:"#065F46" }}>🎉 Booking confirmed!</p>
              <p style={{ margin:"4px 0 0", fontSize:11, color:"#047857" }}>Contact the vendor to finalize payment details.</p>
            </div>
          )}
          {isDeclinedStatus(req.status) && (
            <div style={{ background:"#FEF2F2", borderRadius:10, padding:"10px 14px", marginBottom:14, border:"1px solid #FCA5A5" }}>
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:"#991B1B" }}>This vendor is unavailable for your event.</p>
              {req.note && <p style={{ margin:"4px 0 0", fontSize:11, color:"#B91C1C" }}>Note: {req.note}</p>}
            </div>
          )}
          {req.status === "cancelled" && (
            req.cancelledBy === "vendor" && user.type !== "vendor" ? (
              /* The PLUJ promise: if a pro cancels, we find a replacement. */
              <div style={{ border:"2px solid #000", borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                <p style={{ margin:0, fontSize:13.5, fontWeight:800, color:"#000" }}>{req.vendorName || "The vendor"} cancelled. We'll find you a replacement.</p>
                <p style={{ margin:"4px 0 10px", fontSize:12.5, color:"#333", lineHeight:1.5 }}>
                  If you paid through PLUJ, every dollar comes back to your card. PLUJ will also send you other pros who are free on your date. You can look now:
                </p>
                <button className="btn" onClick={() => {
                    window.dispatchEvent(new CustomEvent("pluj:find-replacement", { detail: {
                      serviceId: req.serviceId || null, date: req.eventDate || "", guests: req.guests || "", city: req.city || "" } }));
                    onClose && onClose();
                  }}
                  style={{ background:"#000", color:"#fff", borderRadius:999, padding:"10px 18px", fontSize:13, fontWeight:800 }}>
                  Find a replacement
                </button>
              </div>
            ) : (
              <div style={{ background:"#F3F4F6", borderRadius:10, padding:"10px 14px", marginBottom:14, border:`1px solid ${C.border}` }}>
                <p style={{ margin:0, fontSize:12, fontWeight:700, color:C.midGray }}>
                  {req.cancelledBy === "vendor"
                    ? (user.type === "vendor" ? "You cancelled this booking." : "The vendor cancelled this booking.")
                    : (user.type === "vendor" ? "The host cancelled this request." : "You cancelled this request.")}
                </p>
              </div>
            )
          )}

          {/* Edit form or view */}
          {editing ? (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <p style={{ margin:"0 0 4px", fontSize:12, fontWeight:700, color:C.black }}>✏️ Edit your request</p>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>Event type</label>
                <select value={form.eventType} onChange={e => upd("eventType", e.target.value)}
                  style={{ width:"100%", height:40, padding:"0 12px", marginTop:4,
                           border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, color:C.black, background:"#fff" }}>
                  <option value="">Select event type</option>
                  {EVENT_PACKAGES.filter(p => p.id !== "custom").map(p => (
                    <option key={p.id} value={p.label}>{p.icon} {p.label}</option>
                  ))}
                </select>
              </div>
              {/* Start and finish, each with its own date. An event that runs
                  from 9pm to 1am is a normal booking, and with a single date
                  the finish time simply looked earlier than the start. */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>Start date *</label>
                  <input type="date" value={form.eventDate} min={isoDate(new Date())}
                    onChange={e => upd("eventDate", e.target.value)}
                    style={{ width:"100%", height:40, padding:"0 12px", marginTop:4,
                             border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, color:C.black, background:"#fff" }} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>
                    End date{" "}
                    <span style={{ fontWeight:400, color:C.lightGray }}>— if it runs past midnight</span>
                  </label>
                  <input type="date" value={form.endDate || ""} min={form.eventDate || isoDate(new Date())}
                    onChange={e => upd("endDate", e.target.value)}
                    style={{ width:"100%", height:40, padding:"0 12px", marginTop:4,
                             border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, color:C.black, background:"#fff" }} />
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>Guest count</label>
                  <input value={form.guests} onChange={e => upd("guests", e.target.value)}
                    placeholder="e.g. 40"
                    style={{ width:"100%", height:40, padding:"0 12px", marginTop:4,
                             border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, background:"#fff" }} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>Time</label>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:4 }}>
                    <input type="time" value={form.startTime} onChange={e => upd("startTime", e.target.value)}
                      style={{ width:"100%", height:40, padding:"0 8px", border:`1px solid ${C.border}`,
                               borderRadius:9, fontSize:12.5, color:C.black, background:"#fff" }} />
                    <input type="time" value={form.endTime} onChange={e => upd("endTime", e.target.value)}
                      style={{ width:"100%", height:40, padding:"0 8px", border:`1px solid ${C.border}`,
                               borderRadius:9, fontSize:12.5, color:C.black, background:"#fff" }} />
                  </div>
                </div>
              </div>

              {/* Structured location */}
              <div style={{ marginTop:2, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                <label style={{ fontSize:11, fontWeight:700, color:C.orange }}>📍 Event location</label>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>Venue type</label>
                  <select value={form.venueType} onChange={e => upd("venueType", e.target.value)}
                    style={{ width:"100%", height:40, padding:"0 10px", marginTop:4,
                             border:`1px solid ${C.border}`, borderRadius:9, fontSize:13,
                             color: form.venueType ? C.black : C.lightGray, background:"#fff" }}>
                    <option value="">Select…</option>
                    {VENUE_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>Venue name</label>
                  <input value={form.venue} onChange={e => upd("venue", e.target.value)}
                    placeholder="e.g. The Grand Ballroom"
                    style={{ width:"100%", height:40, padding:"0 12px", marginTop:4,
                             border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, background:"#fff" }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>Street address</label>
                <input value={form.streetAddress} onChange={e => upd("streetAddress", e.target.value)}
                  placeholder="123 Main St"
                  style={{ width:"100%", height:40, padding:"0 12px", marginTop:4,
                           border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, background:"#fff" }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>Apt / suite / unit</label>
                <input value={form.addressLine2} onChange={e => upd("addressLine2", e.target.value)}
                  placeholder="Optional"
                  style={{ width:"100%", height:40, padding:"0 12px", marginTop:4,
                           border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, background:"#fff" }} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1.6fr 0.9fr 1fr", gap:8 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>City *</label>
                  <input value={form.city} onChange={e => upd("city", e.target.value)}
                    style={{ width:"100%", height:40, padding:"0 12px", marginTop:4,
                             border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, background:"#fff" }} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>State</label>
                  <input value={form.state} onChange={e => upd("state", e.target.value.toUpperCase().slice(0,3))}
                    style={{ width:"100%", height:40, padding:"0 10px", marginTop:4, textTransform:"uppercase",
                             border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, background:"#fff" }} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>ZIP</label>
                  <input value={form.zip} onChange={e => upd("zip", e.target.value)} inputMode="numeric"
                    style={{ width:"100%", height:40, padding:"0 10px", marginTop:4,
                             border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, background:"#fff" }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>Access notes</label>
                <textarea value={form.accessInstructions} onChange={e => upd("accessInstructions", e.target.value)}
                  placeholder="Gate code, parking, loading dock, which entrance…" rows={2}
                  style={{ width:"100%", padding:"9px 12px", marginTop:4,
                           border:`1px solid ${C.border}`, borderRadius:9, fontSize:12,
                           color:C.black, resize:"none", fontFamily:"'Figtree', system-ui, sans-serif", background:"#fff" }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>Message to vendor</label>
                <textarea value={form.message} onChange={e => upd("message", e.target.value)}
                  placeholder="Describe your event, special requirements..."
                  rows={3}
                  style={{ width:"100%", padding:"9px 12px", marginTop:4,
                           border:`1px solid ${C.border}`, borderRadius:9, fontSize:12,
                           color:C.black, resize:"none", fontFamily:"'Figtree', system-ui, sans-serif", background:"#fff" }} />
              </div>
              {err && <p style={{ fontSize:12, color:"#EF4444", fontWeight:600 }}>{err}</p>}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={saveChanges} disabled={saving} className="btn"
                  style={{ flex:1, padding:"10px 0", borderRadius:10,
                           background: saving ? "#F3F4F6" : C.orange,
                           color: saving ? C.midGray : "#fff",
                           border:"none", fontSize:13, fontWeight:700 }}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button onClick={() => { setEditing(false); setErr(""); }} className="btn"
                  style={{ flex:1, padding:"10px 0", borderRadius:10,
                           background:"#F3F4F6", color:C.midGray, border:"none", fontSize:13 }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
              {[
                ["Event type",  req.eventType || "—"],
                ...(req.serviceName ? [["Service booked", req.serviceName]] : []),
                ...(req.packageName ? [["Option", req.packageName + (req.packagePrice != null ? ` — $${Number(req.packagePrice).toLocaleString()}` : "")]] : []),
                ...(req.addons && req.addons.length ? [["Extras", req.addons.map(a => a.name).join(", ") + (req.addonsTotal ? ` — $${Number(req.addonsTotal).toLocaleString()}` : "")]] : []),
                ["Vendor",      req.vendorName || "—"],
                ["Booked by",   req.userName   || "—"],
                ["Event date",  req.eventDate || "—"],
                ["Time",        fmtTimeRange(req.startTime, req.endTime) || "—"],
                ["Guest count", req.guests    || "—"],
                ["Requested on", req.createdAt ? new Date(req.createdAt).toLocaleString() : "—"],
                ...(req.respondedAt ? [[
                  isConfirmedStatus(req.status) ? "Confirmed on"
                    : isDeclinedStatus(req.status) ? "Declined on"
                    : isCancelledStatus(req.status) ? "Cancelled on" : "Updated on",
                  new Date(req.respondedAt).toLocaleString()
                ]] : []),
                ...(req.eventDate ? [["Status",
                  new Date(req.eventDate + "T23:59:59") < new Date() ? "Past event" : "Upcoming event"]] : []),
              ].map(([label, val]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
                                          padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12, color:C.midGray, fontWeight:600, flexShrink:0, marginRight:12 }}>{label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:C.black, textAlign:"right",
                                 maxWidth:260, wordBreak:"break-word" }}>{val}</span>
                </div>
              ))}

              {/* Location card — the address a vendor needs to actually show up */}
              {(() => {
                const cityLine = [req.city, [req.state, req.zip].filter(Boolean).join(" ").trim()].filter(Boolean).join(", ");
                const hasAddr  = req.streetAddress || cityLine;
                const mapsQ    = encodeURIComponent(formatEventLocation(req).replace(/^.*? — /, "") || cityLine || req.venue || "");
                return (
                  <div style={{ marginTop:12, background:"#FFF7ED", border:`1px solid ${C.orangeBorder}`,
                                borderRadius:12, padding:"12px 14px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <span style={{ fontSize:11, fontWeight:800, color:C.orange, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                        📍 Event location
                      </span>
                      {req.venueType && (
                        <span style={{ fontSize:11, fontWeight:700, color:"#B45309", background:"#FEF3C7",
                                       padding:"2px 8px", borderRadius:99 }}>{venueTypeLabel(req.venueType)}</span>
                      )}
                    </div>
                    {req.venue && <p style={{ margin:"0 0 3px", fontSize:13, fontWeight:800, color:C.black }}>{req.venue}</p>}
                    {req.streetAddress && (
                      <p style={{ margin:"0 0 1px", fontSize:12.5, color:C.black }}>
                        {req.streetAddress}{req.addressLine2 ? `, ${req.addressLine2}` : ""}
                      </p>
                    )}
                    {cityLine && <p style={{ margin:0, fontSize:12.5, color:C.black }}>{cityLine}</p>}
                    {!hasAddr && !req.venue && (
                      <p style={{ margin:0, fontSize:12, color:C.midGray }}>No location provided yet.</p>
                    )}
                    {/* A hand-typed address has not been checked against any
                        address database. The vendor is the one who has to drive
                        there, so they are the one who needs to know. */}
                    {user.type === "vendor" && hasAddr && !req.addressVerified && (
                      <p style={{ margin:"7px 0 0", padding:"6px 9px", borderRadius:8,
                                  background:"#FEF3C7", border:"1px solid #FCD34D",
                                  fontSize:11.5, color:"#92400E", lineHeight:1.45 }}>
                        ⚠ Entered by hand — not confirmed against an address database.
                        Worth checking with the customer before you travel.
                      </p>
                    )}
                    {req.accessInstructions && (
                      <div style={{ marginTop:8, paddingTop:8, borderTop:"1px dashed #FCD9B6" }}>
                        <p style={{ margin:"0 0 2px", fontSize:10, fontWeight:700, color:C.midGray,
                                    textTransform:"uppercase", letterSpacing:"0.04em" }}>🔑 Access notes</p>
                        <p style={{ margin:0, fontSize:12, color:C.black, lineHeight:1.5, whiteSpace:"pre-wrap" }}>{req.accessInstructions}</p>
                      </div>
                    )}
                    {/* Vendors need directions; only show once there's something to route to */}
                    {user.type === "vendor" && (req.streetAddress || cityLine) && (
                      <a href={`https://maps.google.com/?q=${mapsQ}`} target="_blank" rel="noopener noreferrer"
                         style={{ display:"inline-block", marginTop:10, fontSize:12, fontWeight:700,
                                  color:"#fff", background:C.orange, padding:"7px 14px", borderRadius:9,
                                  textDecoration:"none" }}>
                        🧭 Get directions
                      </a>
                    )}
                  </div>
                );
              })()}

              {[
                ["Message",     req.message   || "—"],
                ["Submitted",   req.createdAt ? new Date(req.createdAt).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) : "—"],
              ].map(([label, val]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
                                          padding:"9px 0", borderBottom:`1px solid ${C.border}`, marginTop: label==="Message" ? 8 : 0 }}>
                  <span style={{ fontSize:12, color:C.midGray, fontWeight:600, flexShrink:0, marginRight:12 }}>{label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:C.black, textAlign:"right",
                                 maxWidth:260, wordBreak:"break-word" }}>{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {!editing && (
          <>
          {isOwner && isConfirmedStatus(req.status) && (
            <div style={{ padding:"0 20px 10px" }}>
              <div style={{ background: lateCancel ? "#FEF2F2" : "#F9FAFB",
                            border:`1px solid ${lateCancel ? "#FCA5A5" : C.border}`,
                            borderRadius:10, padding:"9px 12px" }}>
                <p style={{ margin:0, fontSize:11, fontWeight:800,
                            color: lateCancel ? "#B91C1C" : C.midGray }}>
                  {lateCancel ? "⚠️ Within 48 hours of the event" : "🗓 Cancellation policy"}
                </p>
                <p style={{ margin:"3px 0 0", fontSize:11.5, lineHeight:1.55,
                            color: lateCancel ? "#7F1D1D" : C.midGray }}>
                  {paymentsOn()
                    ? (lateCancel
                        ? "Paid bookings can't be cancelled within 48 hours of the event. Message the vendor, or use Report a problem if something is wrong."
                        : "If you cancel, you get back what you paid less the card fee and PLUJ's service fees: all of it 7+ days before the event, 70% at 5–7 days, 50% at 3–5 days, 25% at 2–3 days. No cancellations within 48 hours. If the vendor cancels, you get back everything you paid.")
                    : lateCancel
                      ? "Cancelling now incurs a late-cancellation fee. If the vendor cancels instead, you're refunded in full and we'll help you find a replacement."
                      : "Free to cancel until 48 hours before the event. After that a late-cancellation fee applies. If the vendor cancels, you're always refunded in full."}
                </p>
              </div>
            </div>
          )}
          <div style={{ padding:"12px 20px 16px", borderTop:`1px solid ${C.border}`, flexShrink:0, display:"flex", gap:8 }}>
            {canEdit && (
              <button onClick={() => setEditing(true)} className="btn"
                style={{ flex:1, padding:"10px 0", borderRadius:10, background:C.black,
                         color:"#fff", border:"none", fontSize:13, fontWeight:700 }}>
                ✏️ Edit request
              </button>
            )}
            {canCancel && (
              <button onClick={() => {
                  const msg = paymentsOn() && isConfirmedStatus(req.status)
                    ? `Cancel this confirmed booking?\n\nYou'll get back what you paid less the card fee and PLUJ's service fees: all of it 7+ days before the event, 70% at 5–7 days, 50% at 3–5 days, 25% at 2–3 days. The vendor will be notified.`
                    : lateCancel
                    ? `Cancel this confirmed booking?\n\n⚠️ This is within 48 hours of the event, so a late-cancellation fee applies under PLUJ's cancellation policy.\n\nThe vendor will be notified immediately.`
                    : isConfirmedStatus(req.status)
                      ? `Cancel this confirmed booking?\n\nYou're more than 48 hours out, so no cancellation fee applies. The vendor will be notified.`
                      : `Withdraw this request?\n\nIt hasn't been confirmed yet, so there's no charge.`;
                  if (!window.confirm(msg)) return;
                  onCancel?.(req.id, { lateCancel });
                  onClose();
                }} className="btn"
                style={{ flex:1, padding:"10px 0", borderRadius:10, background:"#FEF2F2",
                         color:"#EF4444", border:"1px solid #FCA5A5", fontSize:13, fontWeight:600 }}>
                {lateCancel ? "✕ Cancel (fee applies)" : "✕ Cancel booking"}
              </button>
            )}
            {!canEdit && !canCancel && (
              <button onClick={onClose} className="btn"
                style={{ flex:1, padding:"10px 0", borderRadius:10, background:"#F3F4F6",
                         color:C.midGray, border:"none", fontSize:13 }}>
                Close
              </button>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}


function AccountPanel({ user, justSent, allCards, onClose, onLogout, onListingSaved, initialTab, initialConvId }) {
  /* initialTab lets a notification open the panel straight onto the right tab.
     Clicking "Ana Banana replied" used to open the panel on Requests and leave
     the person to go find the message themselves. */
  const [tab,         setTab]       = useState(initialTab || "requests");
  /* "info" | "account". Account settings is a sub-page of Profile, not a
     top-level tab, so the destructive controls take two deliberate steps to
     reach and are not sitting on screen the rest of the time. */
  const [profileView, setProfileView] = useState("info");
  const [reqView,     setReqView]   = useState("list");   // 'list' | 'calendar'
  const [requests,    setRequests]  = useState([]);
  const [loading,     setLoading]   = useState(true);
  const [vstatus,     setVstatus]   = useState(user.status || "pending");
  const [editListing, setEditListing] = useState(false);
  const [actionMsg,   setActionMsg]   = useState("");
  const [modifying,   setModifying]   = useState(null);   // request being edited
  const [selectedReq, setSelectedReq] = useState(null);

  /* ── Account lifecycle (requirement #42) ────────────────────────────
     Deactivation is reversible and keeps everything. Deletion is permanent,
     so it asks the user to type the word rather than click twice — a second
     confirm dialog is muscle memory, typing is a decision. */
  const [acctBusy, setAcctBusy] = useState(false);
  const [acctErr,  setAcctErr]  = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");

  /* null | "deactivate" | "delete". Neither action runs straight off its
     button: it opens the dialog below, which spells out what is about to
     happen and makes the person say yes a second time. */
  const [confirmAction, setConfirmAction] = useState(null);

  async function doDeactivate() {
    setAcctBusy(true); setAcctErr("");
    const { error } = await sb.rpc("deactivate_my_account");
    setAcctBusy(false);
    if (error) {
      setConfirmAction(null);
      setAcctErr(error.message || "Could not deactivate your account.");
      return;
    }
    onLogout();
  }

  async function doDeleteAccount() {
    setAcctBusy(true); setAcctErr("");
    const { error } = await sb.rpc("delete_my_account");
    setAcctBusy(false);
    if (error) {
      setConfirmAction(null);
      setAcctErr((error.message || "").indexOf("admin") >= 0
        ? "Admin accounts cannot be deleted here. Remove admin access first."
        : (error.message || "Could not delete your account."));
      return;
    }
    onLogout();
  }

  useEffect(() => {
    RLS.getMyRequests(user).then(r => {
      const fetched = Array.isArray(r) ? r : [];
      /* Show requests the user just sent immediately, even if the DB read
         hasn't caught up yet. Dedupe by id so nothing doubles up. */
      const ids = new Set(fetched.map(x => x.id));
      const extra = (justSent || []).filter(x => x && !ids.has(x.id));
      setRequests([...extra, ...fetched].sort((a,b) => (b.createdAt||0) - (a.createdAt||0)));
      setLoading(false);
    });
    if (user.type === "vendor") getVendorStatus(user.id).then(s => s && setVstatus(s));
  }, []);

  async function respond(reqId, status, extra = {}) {
    const updated = await RLS.respondToRequest(reqId, status, "", user, extra);
    if (updated && updated.__error) {
      setActionMsg((updated.__error || "").replace(/^.*?ERROR:\s*/, "") || "That didn't save. Please try again.");
      return;
    }
    if (updated) setRequests(r => r.map(req => req.id === reqId ? { ...req, status: updated.status || status } : req));
    if (status === "confirmed" && paymentsOn()) {
      setActionMsg("Confirmed. The host has been asked to pay the 30% retainer to secure the date.");
    }
  }
  /* Total price a vendor types when confirming with payments on, per request. */
  const [priceDraft, setPriceDraft] = useState({});

  /* Vendor cancels a booking they'd confirmed (48h+ before the event).
     Writes 'cancelled', frees the calendar date, and emails the customer. */
  async function vendorCancel(req) {
    if (!canChangeBooking(req.eventDate || req.event_date, req.startTime || req.start_time)) {
      setActionMsg && setActionMsg("Bookings can only be cancelled at least 48 hours before the event.");
      return;
    }
    if (!window.confirm("Cancel this confirmed booking? The customer will be notified by email.")) return;
    const { data, error } = await sb.from("booking_requests")
      .eq("id", req.id).eq("vendor_id", user.id)
      .update({ status: "cancelled", updated_at: new Date().toISOString() });
    if (error || (Array.isArray(data) && data.length === 0)) return;
    setRequests(r => r.map(x => x.id === req.id ? { ...x, status: "cancelled" } : x));
    const row = (Array.isArray(data) ? data[0] : null) || {};
    /* Free the held date so the vendor is bookable again. */
    try { await sb.from("vendor_availability").eq("vendor_id", user.id).eq("date", row.event_date).delete(); } catch {}
    notifyBookingChange({
      requestId:  req.id,
      status:     "cancelled",
      customerId: row.user_id,
      vendorId:   user.id,
      request:    { ...req, ...row },
    }).catch(e => console.error("[PLUJ] vendor cancel email failed:", e));
  }

  async function cancelRequest(reqId) {
    /* Find the booking so we can enforce the 48-hour rule and email correctly. */
    const r = requests.find(x => x.id === reqId) || {};
    if ((r.status === "confirmed" || r.status === "accepted") &&
        !canChangeBooking(r.eventDate || r.event_date, r.startTime || r.start_time)) {
      setActionMsg("Confirmed bookings can only be cancelled at least 48 hours before the event. Please message the vendor directly.");
      return;
    }
    /* User cancels their own pending request */
    if (IS_PREVIEW) {
      const req = await _pGet("req:" + reqId);
      if (!req) return;
      const updated = { ...req, status: "cancelled", updated_at: new Date().toISOString() };
      await _pSet("req:" + reqId, updated);
      setRequests(r => r.map(req => req.id === reqId ? { ...req, status: "cancelled" } : req));
      return;
    }
    /* The database is the source of truth. genRequestId() prefixes EVERY
       booking with REQ-, real ones included, so the old
       reqId.startsWith("REQ-") test classified every genuine booking as a
       local demo and returned before writing: the UI said "cancelled", the
       row never changed, and a refresh showed it back as pending. Whether a
       booking is a demo depends on its PARTIES being real accounts, not on
       the shape of its id, so try the write first and fall back locally only
       if no row was actually updated. */
    const { data, error } = await sb.from("booking_requests")
      .eq("id", reqId).eq("user_id", user.id)
      .update({ status: "cancelled", updated_at: new Date().toISOString() });
    const row = (Array.isArray(data) ? data[0] : null) || null;

    if (error || !row) {
      /* Not in the database, so it may be a sample-listing booking held
         locally. Only treat it as handled if we actually find it there. */
      let wasLocal = false;
      try {
        const key = "pluj_demo_requests:" + user.id;
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        wasLocal = list.some(x => x.id === reqId);
        if (wasLocal) {
          localStorage.setItem(key, JSON.stringify(
            list.map(x => (x.id === reqId ? { ...x, status: "cancelled" } : x))));
        }
      } catch { /* localStorage unavailable */ }

      if (!wasLocal) {
        console.error("[PLUJ] cancel failed", reqId, error);
        setActionMsg("Could not cancel that booking. Please try again.");
        return;
      }
      setRequests(rs => rs.map(req => (req.id === reqId ? { ...req, status: "cancelled" } : req)));
    /* A Modify dialog open for this booking is now meaningless. It also sits
       behind the detail modal, so closing that one would reveal it and look
       like cancelling had opened an edit form. */
    setModifying(m => (m && m.id === reqId ? null : m));
      setActionMsg("Booking cancelled.");
      return;
    }

    setRequests(rs => rs.map(req => (req.id === reqId ? { ...req, status: "cancelled" } : req)));
    /* A Modify dialog open for this booking is now meaningless. It also sits
       behind the detail modal, so closing that one would reveal it and look
       like cancelling had opened an edit form. */
    setModifying(m => (m && m.id === reqId ? null : m));
    setActionMsg("Booking cancelled. We've let the vendor know.");
    notifyBookingChange({
      requestId:  reqId,
      status:     "cancelled",
      customerId: user.id,
      vendorId:   row.vendor_id,
      request:    row,
    }).catch(e => console.error("[PLUJ] cancel email failed:", e));
  }

  /* Customer edits date / guests / venue / message on a request that hasn't
     been completed. Both parties are emailed so nobody works off stale info. */
  async function modifyRequest(reqId, changes) {
    setActionMsg("");
    /* No REQ- special case here either: real bookings carry that prefix too,
       so this branch rejected every genuine modification. If a row is not in
       the database the update below simply affects no rows. */
    const r = requests.find(x => x.id === reqId) || {};
    const wasConfirmed = r.status === "confirmed" || r.status === "accepted";
    /* 48-hour rule applies to changing a confirmed booking. */
    if (wasConfirmed && !canChangeBooking(r.eventDate || r.event_date, r.startTime || r.start_time)) {
      setActionMsg("Confirmed bookings can only be changed at least 48 hours before the event.");
      return false;
    }
    /* Changing a confirmed booking sends it back to 'pending' so the vendor
       must approve the new details — a modification needs both sides to agree.
       Also free up the originally-held date if the event date itself moved. */
    const patch = { ...changes, updated_at: new Date().toISOString() };
    if (wasConfirmed) patch.status = "pending";
    const { data, error } = await sb.from("booking_requests")
      .eq("id", reqId).eq("user_id", user.id).update(patch);
    if (error || (Array.isArray(data) && data.length === 0)) {
      setActionMsg("Could not save those changes. Please try again.");
      return false;
    }
    const row = (Array.isArray(data) ? data[0] : null) || {};
    setRequests(rs => rs.map(req => req.id === reqId ? { ...req, ...changes, ...(wasConfirmed ? { status: "pending" } : {}) } : req));
    setActionMsg(wasConfirmed
      ? "Change request sent. The vendor must approve the new details before they're final."
      : "Booking updated. We've emailed the vendor the new details.");
    notifyBookingChange({
      requestId:  reqId,
      status:     "modified",
      customerId: user.id,
      vendorId:   row.vendor_id,
      request:    row,
    }).catch(e => console.error("[PLUJ] modify email failed:", e));
    return true;
  }

  /* Inline modify form for a booking the customer already sent */
  const ModifyModal = ({ req, onClose }) => {
    const [d, setD] = useState(req.eventDate || req.event_date || "");
    const [g, setG] = useState(req.guests || "");
    const [v, setV] = useState(req.venue || "");
    const [m, setM] = useState(req.message || "");
    const [saving, setSaving] = useState(false);
    const F = { width:"100%", height:40, padding:"0 12px", border:`1px solid ${C.border}`,
                borderRadius:9, fontSize:13, boxSizing:"border-box", marginBottom:8 };
    return (
      <div onClick={onClose}
        style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1400,
                 display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
        <div onClick={e=>e.stopPropagation()}
          style={{ background:"#fff", borderRadius:16, padding:"22px", width:"100%", maxWidth:380 }}>
          <h3 style={{ margin:"0 0 4px", fontSize:16, fontWeight:800 }}>Modify booking</h3>
          <p style={{ margin:"0 0 14px", fontSize:11, color:C.midGray }}>
            {req.vendorName || "Vendor"} · {req.id}. The vendor will be emailed the new details.
          </p>
          <label style={{ fontSize:11, fontWeight:700, color:C.midGray }}>Event date</label>
          <input type="date" value={d} onChange={e=>setD(e.target.value)}
            min={new Date().toISOString().split("T")[0]} style={F} />
          <label style={{ fontSize:11, fontWeight:700, color:C.midGray }}>Guests</label>
          <input type="number" min="1" value={g} onChange={e=>setG(e.target.value)} style={F} />
          <label style={{ fontSize:11, fontWeight:700, color:C.midGray }}>Venue</label>
          <input value={v} onChange={e=>setV(e.target.value)} style={F} />
          <label style={{ fontSize:11, fontWeight:700, color:C.midGray }}>Message</label>
          <textarea value={m} onChange={e=>setM(e.target.value)} rows={3}
            style={{ ...F, height:"auto", padding:"9px 12px", fontFamily:"inherit" }} />
          <button disabled={saving} className="btn"
            onClick={async()=>{
              setSaving(true);
              const ok = await modifyRequest(req.id, {
                event_date: d || null, guests: g || null, venue: v || null, message: m || null,
              });
              setSaving(false);
              if (ok) onClose();
            }}
            style={{ width:"100%", padding:"11px 0", borderRadius:10, background:C.black,
                     color:"#fff", border:"none", fontSize:13, fontWeight:700 }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button onClick={onClose} className="btn"
            style={{ width:"100%", padding:"8px 0", marginTop:6, borderRadius:10,
                     background:"transparent", color:C.midGray, border:"none", fontSize:12 }}>
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const StatusBadge = ({ status }) => {
    const map = {
      pending:   { bg:"#FFFBEB", c:"#D97706", t:"⏳ Pending"    },
      approved:  { bg:C.greenSoft, c:C.green, t:"✓ Confirmed"  },
      confirmed: { bg:C.greenSoft, c:C.green, t:"✓ Confirmed"  },
      accepted:  { bg:C.greenSoft, c:C.green, t:"✓ Confirmed"  },
      rejected:  { bg:"#FEF2F2", c:"#EF4444", t:"✗ Declined"   },
      declined:  { bg:"#FEF2F2", c:"#EF4444", t:"✗ Declined"   },
      cancelled: { bg:"#F3F4F6", c:C.midGray, t:"✕ Cancelled"  },
      completed: { bg:"#EFF6FF", c:"#1D4ED8", t:"✓ Completed"  },
    };
    const s = map[status] || map.pending;
    return <span style={{ fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:99,
                           background:s.bg, color:s.c }}>{s.t}</span>;
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <>
      <div style={{ position:"fixed", inset:0, zIndex:490 }} onClick={onClose} />
      <div className="pluj-popover"
        style={{ position:"fixed", right:20, top:66, zIndex:500, background:"#fff",
                    borderRadius:20, width:380, maxWidth:"calc(100vw - 16px)",
                    maxHeight:"82vh", display:"flex",
                    flexDirection:"column",
                    boxShadow:"0 12px 52px rgba(0,0,0,0.22)",
                    animation:"fadeIn 0.15s ease both" }}>

        {/* Header */}
        <div style={{ padding:"18px 20px 14px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <Avatar name={user.displayName || user.name} size={36} bg={user.type==="vendor" ? "#7C3AED" : C.orange} />
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:14, fontWeight:800, color:C.black,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {user.displayName || user.name}
              </p>
              <p style={{ margin:0, fontSize:10, color:C.lightGray, fontFamily:"monospace" }}>
                {memberId(user)}{user.email ? " · " + user.email : ""}
              </p>
            </div>
            <button onClick={onClose} className="btn"
              style={{ background:"#F3F4F6", border:"none", borderRadius:"50%",
                       width:28, height:28, fontSize:14, color:C.midGray,
                       display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>

          {/* Vendor status banner */}
          {user.type === "vendor" && vstatus === "pending" && (
            <div style={{ background:"#FFFBEB", borderRadius:8, padding:"7px 10px",
                          border:"1px solid #FCD34D", marginBottom:8 }}>
              <p style={{ margin:0, fontSize:10, fontWeight:700, color:"#92400E" }}>
                ⏳ Application under review — your services are not public yet
              </p>
            </div>
          )}
          {user.type === "vendor" && vstatus === "approved" && (
            <div style={{ background:C.greenSoft, borderRadius:8, padding:"7px 10px",
                          border:`1px solid ${C.green}33`, marginBottom:8 }}>
              <p style={{ margin:0, fontSize:10, fontWeight:700, color:"#065F46" }}>
                ✓ Verified vendor — your services are live
              </p>
            </div>
          )}

          {user.type === "vendor" && (
            <button onClick={()=>setEditListing(true)} className="btn"
              style={{ width:"100%", marginBottom:8, padding:"9px 0", borderRadius:9,
                       background:C.black, color:"#fff", border:"none", fontSize:12, fontWeight:700 }}>
              🏪 Edit my listing, services & photos
            </button>
          )}

          {editListing && (
            <VendorListingEditor user={user} onClose={()=>setEditListing(false)} onSaved={onListingSaved} />
          )}

          {actionMsg && (
            <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", color:"#1E40AF",
                          borderRadius:9, padding:"9px 12px", marginBottom:8, fontSize:12, fontWeight:600 }}>
              {actionMsg}
            </div>
          )}

          {modifying && (
            <ModifyModal req={modifying} onClose={()=>setModifying(null)} />
          )}

          {/* Tab bar */}
          <div style={{ display:"flex", gap:4 }}>
            {(user.type === "vendor"
              ? [["requests","📬 Requests"],["messages","💬 Messages"],["availability","📅 Availability"],["saved","❤️ Saved"],["profile","👤 Profile"]]
              : [["requests","📬 My Requests"],["messages","💬 Messages"],["saved","❤️ Saved"],["profile","👤 Profile"]]
            ).map(([k,l]) => (
              <button key={k} onClick={() => setTab(k)} className="btn"
                style={{ padding:"5px 10px", borderRadius:99, fontSize:10, fontWeight:700,
                         border:`1.5px solid ${tab===k ? C.orange : C.border}`,
                         background: tab===k ? C.orangeSoft : "#fff",
                         color: tab===k ? C.orange : C.midGray,
                         display:"flex", alignItems:"center", gap:4 }}>
                {l}
                {k==="requests" && pendingCount > 0 && (
                  <span style={{ background:"#EF4444", color:"#fff", fontSize:8, fontWeight:800,
                                  padding:"1px 5px", borderRadius:99 }}>{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>

          {/* ── REQUESTS TAB ── */}
          {tab === "requests" && (
            <div>
              {/* List / Calendar toggle */}
              <div style={{ display:"flex", gap:6, marginBottom:14, background:"#F3F4F6", borderRadius:10, padding:3 }}>
                {[["list","☰ List"],["calendar","📅 Calendar"]].map(([v,l]) => (
                  <button key={v} onClick={() => setReqView(v)} className="btn"
                    style={{ flex:1, padding:"7px 0", borderRadius:8, border:"none", fontSize:12, fontWeight:700,
                             background: reqView===v ? "#fff" : "transparent",
                             color: reqView===v ? C.black : C.midGray,
                             boxShadow: reqView===v ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                    {l}
                  </button>
                ))}
              </div>

              {reqView === "calendar" ? (
                <EventsCalendar bookings={requests} role={user.type} />
              ) : loading ? (
                <div style={{ textAlign:"center", padding:"28px 0", color:C.lightGray }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
                  <p style={{ fontSize:12 }}>Loading requests…</p>
                </div>
              ) : requests.length === 0 ? (
                <div style={{ textAlign:"center", padding:"28px 0", color:C.lightGray }}>
                  <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
                  <p style={{ fontSize:13, fontWeight:600 }}>
                    {user.type === "vendor" ? "No booking requests yet" : "No requests yet"}
                  </p>
                  <p style={{ fontSize:11, marginTop:4, lineHeight:1.6 }}>
                    {user.type === "vendor"
                      ? "Requests from event hosts will appear here once your profile is live."
                      : "Browse vendors and send booking requests to get started."}
                  </p>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {requests.map(req => (
                    <div key={req.id}
                      onClick={() => setSelectedReq(req)}
                      style={{ background:"#F9FAFB", borderRadius:14, padding:"12px 14px",
                               cursor:"pointer", transition:"box-shadow 0.15s ease",
                               border:`1px solid ${isConfirmedStatus(req.status) ? C.green+"44" : isDeclinedStatus(req.status) ? "#FCA5A544" : C.border}` }}
                      onMouseEnter={e=>e.currentTarget.style.boxShadow=C.shadowMd}
                      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                      <div style={{ display:"flex", justifyContent:"space-between",
                                    alignItems:"flex-start", marginBottom:6 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ margin:0, fontSize:13, fontWeight:800 }}>
                            {user.type === "vendor" ? (req.userName || "Guest") : req.vendorName}
                          </p>
                          <p style={{ margin:"2px 0 0", fontSize:10, color:C.lightGray,
                                      fontFamily:"monospace" }}>{req.id}</p>
                        </div>
                        <StatusBadge status={req.status} />
                      </div>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:6 }}>
                        {req.serviceName && (
                          <span style={{ fontSize:10, background:"#F5F3FF", color:"#6D28D9",
                                         padding:"2px 8px", borderRadius:99, fontWeight:700 }}>
                            🛎️ {req.serviceName}{req.packageName ? ` · ${req.packageName}` : ""}
                          </span>
                        )}
                        {req.eventType && (
                          <span style={{ fontSize:10, background:"#EFF6FF", color:"#1D4ED8",
                                         padding:"2px 7px", borderRadius:99, fontWeight:600 }}>
                            {req.eventType}
                          </span>
                        )}
                        {req.eventDate && (
                          <span style={{ fontSize:10, background:C.orangeSoft, color:C.orange,
                                         padding:"2px 7px", borderRadius:99, fontWeight:600 }}>
                            📅 {req.eventDate}
                          </span>
                        )}
                        {(req.startTime || req.endTime) && (
                          <span style={{ fontSize:10, background:"#F5F3FF", color:"#6D28D9",
                                         padding:"2px 7px", borderRadius:99, fontWeight:600 }}>
                            🕐 {fmtTimeRange(req.startTime, req.endTime) || fmtTime12(req.startTime)}
                          </span>
                        )}
                        {(req.city || req.streetAddress || req.venue) && (
                          <span style={{ fontSize:10, background:"#ECFDF5", color:"#047857",
                                         padding:"2px 7px", borderRadius:99, fontWeight:600 }}>
                            📍 {req.city || req.venue || (formatEventLocation(req) || "").split(",")[0]}
                          </span>
                        )}
                        {req.guests && (
                          <span style={{ fontSize:10, background:"#F3F4F6", color:C.midGray,
                                         padding:"2px 7px", borderRadius:99, fontWeight:600 }}>
                            👥 {req.guests}
                          </span>
                        )}
                      </div>
                      {req.message && (
                        <p style={{ margin:"0 0 8px", fontSize:11, color:C.midGray,
                                    lineHeight:1.6, fontStyle:"italic" }}>
                          "{req.message}"
                        </p>
                      )}
                      {req.note && req.status === "declined" && (
                        <p style={{ margin:"0 0 8px", fontSize:11, color:"#EF4444",
                                    lineHeight:1.5 }}>
                          Reason: {req.note}
                        </p>
                      )}
                      {/* Payment schedule, release and problem reports (payments on) */}
                      <BookingPayments req={req} user={user} />

                      {/* Vendor approve / decline buttons */}
                      {user.type === "vendor" && req.status === "pending" && (
                        <ConfirmPriceField req={req} value={priceDraft[req.id] ?? ""}
                          onChange={v => setPriceDraft(d => ({ ...d, [req.id]: v }))} />
                      )}
                      {user.type === "vendor" && req.status === "pending" && (
                        <div style={{ display:"flex", gap:7, marginTop:6 }}>
                          <button onClick={e => {
                              e.stopPropagation();
                              const pp = confirmPricePayload(req, priceDraft[req.id]);
                              if (pp.error) { setActionMsg(pp.error); return; }
                              respond(req.id, "confirmed", pp.extra);
                            }} className="btn"
                            style={{ flex:1, padding:"7px 0", borderRadius:9,
                                     background:C.green, color:"#fff",
                                     border:"none", fontSize:12, fontWeight:700 }}>
                            ✓ Confirm booking
                          </button>
                          <button onClick={() => respond(req.id, "declined")} className="btn"
                            style={{ flex:1, padding:"7px 0", borderRadius:9,
                                     background:"#FEF2F2", color:"#EF4444",
                                     border:"1px solid #FCA5A5", fontSize:12, fontWeight:700 }}>
                            ✗ Decline
                          </button>
                        </div>
                      )}

                      {/* Vendor can cancel a booking they already confirmed
                         (48h+ before the event); the customer is emailed. */}
                      {user.type === "vendor" && ["confirmed","approved","accepted"].includes(req.status) && (() => {
                        const locked = !canChangeBooking(req.eventDate || req.event_date, req.startTime || req.start_time);
                        return locked ? (
                          <p style={{ marginTop:8, fontSize:11, color:"#B45309" }}>
                            🔒 Within 48 hours of the event — contact the customer directly to change anything.
                          </p>
                        ) : (
                          <button onClick={() => vendorCancel(req)} className="btn"
                            style={{ marginTop:8, width:"100%", padding:"7px 0", borderRadius:9,
                                     background:"#FEF2F2", color:"#B91C1C",
                                     border:"1px solid #FCA5A5", fontSize:12, fontWeight:600 }}>
                            ✕ Cancel this booking
                          </button>
                        );
                      })()}

                      {/* Customers can cancel or modify a request that is still
                         pending OR already confirmed — plans change after a
                         vendor accepts. Both parties are emailed on change. */}
                      {user.type !== "vendor" &&
                        ["pending","confirmed","approved","accepted"].includes(req.status) && (() => {
                        const locked = ["confirmed","approved","accepted"].includes(req.status)
                          && !canChangeBooking(req.eventDate || req.event_date, req.startTime || req.start_time);
                        if (locked) {
                          return (
                            <div style={{ marginTop:8, padding:"9px 12px", borderRadius:9, background:"#FFFBEB",
                                          border:"1px solid #FCD34D", fontSize:11, color:"#B45309", lineHeight:1.5 }}>
                              🔒 This event is within 48 hours, so it can no longer be cancelled or changed online. Message the vendor directly if something urgent comes up.
                            </div>
                          );
                        }
                        return (
                        <div style={{ marginTop:8 }}>
                          <button onClick={e => { e.stopPropagation(); cancelRequest(req.id); }} className="btn"
                            style={{ width:"100%", padding:"7px 0", borderRadius:9,
                                     background:"#F3F4F6", color:C.midGray,
                                     border:"1px solid #E5E7EB", fontSize:12, fontWeight:600,
                                     display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                            ✕ Cancel booking
                          </button>
                          <button onClick={e => { e.stopPropagation(); setModifying(req); }} className="btn"
                            style={{ width:"100%", padding:"7px 0", borderRadius:9, marginTop:6,
                                     background:"#fff", color:C.black,
                                     border:`1px solid ${C.border}`, fontSize:12, fontWeight:600 }}>
                            ✎ Modify booking
                          </button>
                        </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── AVAILABILITY TAB (vendor only) ── */}
          {tab === "availability" && user.type === "vendor" && (
            <AvailabilityCalendar vendorId={user.id} />
          )}

          {/* ── SAVED / FAVORITES TAB ── */}
          {tab === "messages" && (
            <div>
              <h3 style={{ margin:"0 0 4px", fontSize:14, fontWeight:800 }}>Messages</h3>
              <p style={{ margin:"0 0 12px", fontSize:12, color:C.midGray }}>
                Your conversations with vendors and PLUJ support.
              </p>
              {/* focusId opens the exact thread the notification was about,
                  instead of dropping people on the list to find it. */}
              <MessagesPanel user={user} focusId={initialConvId} />
            </div>
          )}
          {tab === "saved" && <SavedVendorsPanel userId={user.id} allCards={allCards} />}

          {/* ── PROFILE TAB ── */}
          {/* ── PROFILE TAB ── with Account settings as a sub-page. The
              deactivate and delete controls used to sit in the main panel,
              visible on every visit, one stray tap from something
              irreversible. They now live at Profile → Account settings and
              nowhere else. */}
          {tab === "profile" && profileView === "account" && (
            <div>
              <button type="button"
                onClick={() => { setProfileView("info"); setAcctErr(""); }}
                className="btn"
                style={{ background:"none", border:"none", padding:"0 0 10px",
                         fontSize:12, fontWeight:700, color:C.midGray, cursor:"pointer" }}>
                ‹ Back to profile
              </button>

              <p style={{ margin:"0 0 4px", fontSize:15, fontWeight:800, color:C.black }}>
                Account settings
              </p>
              <p style={{ margin:"0 0 14px", fontSize:12, color:C.midGray, lineHeight:1.6 }}>
                Pausing or closing your PLUJ account.
              </p>

              <button type="button" onClick={() => { setAcctErr(""); setConfirmAction("deactivate"); }}
                disabled={acctBusy}
                style={{ width:"100%", textAlign:"left", padding:"12px 14px",
                         borderRadius:12, background:"#F9FAFB",
                         border:"1px solid " + C.border,
                         cursor: acctBusy ? "default" : "pointer" }}>
                <span style={{ fontSize:13.5, fontWeight:800, color:C.black }}>Deactivate my account</span>
                <span style={{ display:"block", fontSize:11.5, color:C.midGray, marginTop:3, lineHeight:1.55 }}>
                  Takes your listings down and pauses bookings. Nothing is
                  deleted — log back in any time to undo it.
                </span>
              </button>

              <div style={{ marginTop:12, padding:"12px 14px", borderRadius:12,
                            background:"#FEF2F2", border:"1px solid #FECACA" }}>
                <p style={{ margin:0, fontSize:13.5, fontWeight:800, color:"#B91C1C" }}>
                  Delete my account permanently
                </p>
                <p style={{ margin:"3px 0 10px", fontSize:11.5, color:"#991B1B", lineHeight:1.55 }}>
                  Erases your profile, listings, bookings, messages and reviews.
                  This cannot be undone, and we cannot recover it for you.
                </p>
                <input
                  value={confirmDelete}
                  onChange={e => { setConfirmDelete(e.target.value); setAcctErr(""); }}
                  placeholder="Type DELETE to continue"
                  aria-label="Type DELETE to confirm permanent account deletion"
                  style={{ width:"100%", padding:"9px 10px", borderRadius:8, fontSize:12,
                           border:"1px solid #FCA5A5", background:"#fff", boxSizing:"border-box" }} />
                <button type="button"
                  onClick={() => {
                    if (confirmDelete.trim().toUpperCase() !== "DELETE") {
                      setAcctErr("Type DELETE in the box above to continue."); return;
                    }
                    setAcctErr(""); setConfirmAction("delete");
                  }}
                  disabled={acctBusy}
                  style={{ width:"100%", marginTop:8, padding:"10px 0", borderRadius:8,
                           border:"none", fontSize:12.5, fontWeight:800, color:"#fff",
                           background: confirmDelete.trim().toUpperCase() === "DELETE" ? "#DC2626" : "#FCA5A5",
                           cursor: acctBusy ? "default" : "pointer" }}>
                  Delete my account
                </button>
              </div>

              {acctErr && (
                <p role="alert" style={{ margin:"10px 0 0", fontSize:11.5, fontWeight:600, color:"#B91C1C" }}>
                  {acctErr}
                </p>
              )}
            </div>
          )}

          {tab === "profile" && profileView !== "account" && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ background:"#F9FAFB", borderRadius:12, padding:"12px 14px",
                            border:`1px solid ${C.border}` }}>
                {[
                  ["ID",     user.id,              "mono"],
                  ["Type",   user.type,             "normal"],
                  ["Email",  maskEmail(user.email), "normal"],
                  ["Phone",  user.phone ? maskPhone(user.phone) : "—", "normal"],
                  ["Email verified", user.emailVerified ? "✓ Yes" : "Pending", "normal"],
                  ...(user.type === "vendor" ? [
                    ["Business",  user.bizLegal  || "—", "normal"],
                    ["City",      user.bizCity   || "—", "normal"],
                    ["Capacity",  user.capacity  || "—", "normal"],
                    ["Travel",    user.travelMiles ? user.travelMiles + " mi" : "—", "normal"],
                  ] : []),
                ].map(([l,v,ff]) => (
                  <div key={l} style={{ display:"flex", justifyContent:"space-between",
                                        padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:11, color:C.midGray, fontWeight:600 }}>{l}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:C.black,
                                   fontFamily: ff==="mono" ? "monospace" : "inherit" }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Entry point to the destructive controls. Requirement #42 and a
                  GDPR / CCPA obligation, but it does not need to be on screen
                  every time somebody checks their own phone number. */}
              <button type="button"
                onClick={() => { setProfileView("account"); setAcctErr(""); }}
                style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                         width:"100%", textAlign:"left", padding:"12px 14px",
                         borderRadius:12, background:"#fff",
                         border:`1px solid ${C.border}`, cursor:"pointer" }}>
                <span>
                  <span style={{ fontSize:13, fontWeight:800, color:C.black }}>⚙️ Account settings</span>
                  <span style={{ display:"block", fontSize:11, color:C.midGray, marginTop:2 }}>
                    Deactivate or delete your account
                  </span>
                </span>
                <span style={{ fontSize:16, color:C.lightGray }}>›</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Confirmation dialog ───────────────────────────────────────────
            Deliberately not window.confirm: that cannot say what is about to
            happen in any detail, looks like a scam prompt, and some browsers
            let people suppress it entirely. */}
        {confirmAction && (() => {
          const isDelete = confirmAction === "delete";
          return (
            <div role="dialog" aria-modal="true"
                 aria-label={isDelete ? "Confirm permanent deletion" : "Confirm deactivation"}
                 style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(10,10,10,0.55)",
                          display:"flex", alignItems:"center", justifyContent:"center", padding:18 }}
                 onClick={() => { if (!acctBusy) setConfirmAction(null); }}>
              <div onClick={e => e.stopPropagation()}
                   style={{ background:"#fff", borderRadius:16, maxWidth:420, width:"100%",
                            padding:"20px 20px 16px", boxShadow:"0 20px 60px rgba(0,0,0,0.35)" }}>
                <p style={{ margin:"0 0 8px", fontSize:17, fontWeight:800,
                            color: isDelete ? "#B91C1C" : C.black }}>
                  {isDelete ? "Permanently delete your account?" : "Deactivate your account?"}
                </p>

                <p style={{ margin:"0 0 10px", fontSize:13, color:C.midGray, lineHeight:1.6 }}>
                  {isDelete
                    ? "This is final. Here is exactly what happens:"
                    : "Here is exactly what happens:"}
                </p>

                <ul style={{ margin:"0 0 12px", paddingLeft:18, fontSize:12.5,
                             color:C.black, lineHeight:1.7 }}>
                  {(isDelete
                    ? ["Your profile and login are erased",
                       "Your listings are removed from the marketplace",
                       "Your bookings, messages and reviews are deleted",
                       "Anyone you have a confirmed booking with loses their record of it",
                       "We cannot undo this or recover any of it for you"]
                    : ["Your listings come down and stop appearing in search",
                       "You cannot send or receive booking requests or messages",
                       "Nothing is deleted — your data stays exactly as it is",
                       "Logging back in reactivates everything"]
                  ).map(line => <li key={line}>{line}</li>)}
                </ul>

                {isDelete && (
                  <p style={{ margin:"0 0 12px", padding:"9px 11px", borderRadius:9,
                              background:"#FFFBEB", border:"1px solid #FDE68A",
                              fontSize:12, color:"#92400E", lineHeight:1.55 }}>
                    If you only want a break, close this and choose{" "}
                    <strong>Deactivate</strong> instead — it is reversible.
                  </p>
                )}

                <div style={{ display:"flex", gap:8, marginTop:4 }}>
                  <button type="button" disabled={acctBusy}
                    onClick={() => setConfirmAction(null)}
                    style={{ flex:1, padding:"11px 0", borderRadius:10, fontSize:13, fontWeight:700,
                             border:`1px solid ${C.border}`, background:"#fff", color:C.black,
                             cursor: acctBusy ? "default" : "pointer" }}>
                    {isDelete ? "Keep my account" : "Cancel"}
                  </button>
                  <button type="button" disabled={acctBusy}
                    onClick={isDelete ? doDeleteAccount : doDeactivate}
                    style={{ flex:1, padding:"11px 0", borderRadius:10, fontSize:13, fontWeight:800,
                             border:"none", color:"#fff",
                             background: isDelete ? "#DC2626" : C.black,
                             opacity: acctBusy ? 0.7 : 1,
                             cursor: acctBusy ? "default" : "pointer" }}>
                    {acctBusy
                      ? (isDelete ? "Deleting…" : "Deactivating…")
                      : (isDelete ? "Yes, delete everything" : "Yes, deactivate")}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Footer */}
        <div style={{ padding:"12px 18px 16px", borderTop:`1px solid ${C.border}`,
                      flexShrink:0, display:"flex", gap:8 }}>
          <button onClick={onLogout} className="btn"
            style={{ flex:1, padding:"10px 0", borderRadius:12, background:"#F3F4F6",
                     border:"none", fontSize:13, fontWeight:700, color:"#EF4444" }}>
            Log out
          </button>
        </div>
      </div>

      {/* Request detail modal */}
      {selectedReq && (
        <RequestDetailModal
          req={selectedReq}
          user={user}
          onClose={() => setSelectedReq(null)}
          onUpdate={updated => {
            setRequests(r => r.map(req => req.id === updated.id ? {...req,...updated} : req));
            setSelectedReq(p => ({...p,...updated}));
          }}
          onCancel={reqId => { cancelRequest(reqId); setSelectedReq(null); }}
        />
      )}
    </>
  );
}

/* ─── AVAILABILITY CALENDAR ────────────────────────────────────────────────────── */
export function AvailabilityCalendar({ vendorId }) {
  const today     = new Date();
  const [year,    setYear]    = useState(today.getFullYear());
  const [month,   setMonth]   = useState(today.getMonth());
  const [avail,   setAvail]   = useState({ blocked: [], confirmed: [] });
  const [loading, setLoading] = useState(true);
  const [saved,   setSaved]   = useState(false);

  /* The vendor's listings and the weekdays each one works, so the calendar
     shows days nobody works as "Off" without the vendor blocking every
     Tuesday by hand. A listing with no days marked hasn't said, so it counts
     as working every day. */
  const [svcs,    setSvcs]    = useState([]);
  const [focus,   setFocus]   = useState("all");   // "all" or a listing id
  useEffect(() => {
    getVendorAvailability(vendorId).then(a => { setAvail(a); setLoading(false); });
    getMyServices(vendorId).then(list => setSvcs(Array.isArray(list) ? list.filter(x => x.active !== false) : []));
  }, [vendorId]);
  const daysOf = (svc) => { const d = parseEventTypes(svc.avail_days); return d.length ? d : AVAIL_DAYS; };
  const shown = focus === "all" ? svcs : svcs.filter(x => x.id === focus);
  const workDays = shown.length ? new Set(shown.flatMap(daysOf)) : new Set(AVAIL_DAYS);
  /* getDay(): 0 = Sunday; AVAIL_DAYS starts on Monday. */
  const dayKey = (y, m, d) => AVAIL_DAYS[(new Date(y, m, d).getDay() + 6) % 7];

  async function saveAvail(updated) {
    setAvail(updated);
    await setVendorAvailability(vendorId, updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleDate(dateStr) {
    const isBlocked   = avail.blocked.includes(dateStr);
    const isConfirmed = avail.confirmed.includes(dateStr);
    let updated;
    if (!isBlocked && !isConfirmed) {
      updated = { ...avail, blocked: [...avail.blocked, dateStr] };
    } else if (isBlocked) {
      updated = { ...avail, blocked: avail.blocked.filter(d => d !== dateStr) };
    } else {
      updated = { ...avail, confirmed: avail.confirmed.filter(d => d !== dateStr) };
    }
    saveAvail(updated);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay    = new Date(year, month, 1).getDay();
  const monthName   = new Date(year, month, 1).toLocaleDateString("en-US", { month:"long", year:"numeric" });

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); }

  if (loading) return <div style={{ textAlign:"center", padding:20, color:C.lightGray }}>Loading calendar…</div>;

  return (
    <div>
      <p style={{ margin:"0 0 8px", fontSize:11, color:C.midGray, lineHeight:1.6 }}>
        Set your availability so clients know when you're open to book.
        <strong> Tap a date</strong> to toggle blocked / open. Days none of your listings work are shown as
        <strong> Off</strong> automatically — change them in each listing's "When is this service offered?".
      </p>

      {/* Working days per listing, each one named, so a vendor with several
          listings can see which works when. */}
      {svcs.length > 0 && (
        <div style={{ background:"#F9FAFB", border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 11px", marginBottom:12 }}>
          <p style={{ margin:"0 0 6px", fontSize:10.5, fontWeight:800, color:C.midGray, textTransform:"uppercase", letterSpacing:"0.05em" }}>
            Working days by listing
          </p>
          {svcs.map((x, i) => {
            const d = parseEventTypes(x.avail_days);
            const on = focus === x.id;
            return (
              <button key={x.id} type="button" className="btn" onClick={() => setFocus(on ? "all" : x.id)}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", textAlign:"left",
                         padding:"5px 6px", borderRadius:8, cursor:"pointer", marginTop: i ? 3 : 0,
                         border:`1.5px solid ${on ? C.orange : "transparent"}`, background: on ? "#FFF7ED" : "transparent" }}>
                <span style={{ flex:"1 1 120px", minWidth:0, fontSize:11.5, fontWeight:800, color:C.black,
                               whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {i + 1}. {x.name || x.service_type || "Listing"}
                </span>
                <span style={{ display:"flex", gap:3 }}>
                  {AVAIL_DAYS.map(k => {
                    const w = !d.length || d.includes(k);
                    return <span key={k} style={{ width:26, textAlign:"center", fontSize:9.5, fontWeight:800, borderRadius:5, padding:"2px 0",
                                                  background: w ? "#DCFCE7" : "#F3F4F6", color: w ? "#065F46" : "#B0B0B0" }}>{k.slice(0, 2)}</span>;
                  })}
                </span>
              </button>
            );
          })}
          <p style={{ margin:"6px 0 0", fontSize:10, color:C.lightGray }}>
            {focus === "all" ? "Tap a listing to see only its days on the calendar." : "Showing one listing's days. Tap it again to see all."}
          </p>
        </div>
      )}

      {/* Legend */}
      <div style={{ display:"flex", gap:10, marginBottom:12, flexWrap:"wrap" }}>
        {[["#F0FDF4","#065F46","✓ Available"],["#FEF2F2","#EF4444","✗ Blocked"],["#EFF6FF","#1D4ED8","✓ Confirmed"],["#F3F4F6","#9CA3AF","Off (not a working day)"]].map(([bg,c,l]) => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:14, height:14, borderRadius:4, background:bg, border:`1.5px solid ${c}` }} />
            <span style={{ fontSize:10, color:C.midGray }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Month nav */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <button onClick={prevMonth} className="btn"
          style={{ background:"#F3F4F6", border:"none", borderRadius:8, padding:"5px 10px",
                   fontSize:14, color:C.black, fontWeight:700 }}>‹</button>
        <span style={{ fontSize:13, fontWeight:800, color:C.black }}>{monthName}</span>
        <button onClick={nextMonth} className="btn"
          style={{ background:"#F3F4F6", border:"none", borderRadius:8, padding:"5px 10px",
                   fontSize:14, color:C.black, fontWeight:700 }}>›</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:3 }}>
        {(getLang() === "es" ? ["D","L","M","M","J","V","S"] : ["S","M","T","W","T","F","S"]).map((d,i) => (
          <div key={i} style={{ textAlign:"center", fontSize:10, fontWeight:800,
                                 color:C.lightGray, padding:"4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
        {Array.from({ length: firstDay }).map((_, i) => <div key={"e"+i} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day     = i + 1;
          const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const isBlocked   = avail.blocked.includes(dateStr);
          const isConfirmed = avail.confirmed.includes(dateStr);
          const isPast      = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const isOff       = !isConfirmed && !isBlocked && !workDays.has(dayKey(year, month, day));
          return (
            <button key={day} onClick={() => !isPast && !isOff && toggleDate(dateStr)} className="btn"
              title={isOff ? "Off — none of these listings work this weekday" : undefined}
              style={{ padding:"6px 0", borderRadius:8, textAlign:"center", fontSize:11, fontWeight:700,
                       border:`1.5px solid ${isConfirmed ? "#93C5FD" : isBlocked ? "#FCA5A5" : isOff ? "#E5E7EB" : "#E5E7EB"}`,
                       background: isConfirmed ? "#EFF6FF" : isBlocked ? "#FEF2F2" : isOff ? "#F3F4F6" : "#F0FDF4",
                       color: isConfirmed ? "#1D4ED8" : isBlocked ? "#EF4444" : isOff ? "#B0B0B0" : "#065F46",
                       textDecoration: isOff ? "line-through" : "none",
                       opacity: isPast ? 0.35 : 1, cursor: isPast || isOff ? "default" : "pointer",
                       transition:"all 0.1s ease" }}>
              {day}
            </button>
          );
        })}
      </div>

      {saved && (
        <p style={{ margin:"10px 0 0", fontSize:11, color:C.green, fontWeight:700,
                    textAlign:"center" }}>✓ Availability saved</p>
      )}

      <p style={{ margin:"10px 0 0", fontSize:10, color:C.lightGray, lineHeight:1.6 }}>
        Clients can see blocked dates when requesting a booking.
        Confirmed dates are locked automatically once a request is approved.
      </p>
    </div>
  );
}


/* ─── NOTIFICATION BELL ───────────────────────────────────────────────────────── */
/* ─── PHOTO MANAGER ──────────────────────────────────────────────────────────
   Vendors could add and remove photos but never reorder them — and the FIRST
   photo is the cover everywhere: on the marketplace card, in search results and
   at the top of the profile. So the cover was whichever photo happened to
   upload first, which is rarely the best one.

   Arrows and a "make cover" button rather than drag-and-drop. Dragging is
   fiddly on a phone, which is where most vendors will be doing this, and doing
   it properly needs either a library or a lot of pointer-event code. One tap to
   promote a photo covers the common case; the arrows handle the rest.
────────────────────────────────────────────────────────────────────────────── */
/* One number, used by every photo picker and every counter. The profile form
   said 8, the listing editor said nothing at all, and neither stopped you
   adding more — so vendors uploaded until something silently gave. */
export const MAX_PHOTOS = 10;

export function PhotoManager({ photos, onChange, size = 78 }) {
  const list = Array.isArray(photos) ? photos : [];

  const move = (from, to) => {
    if (to < 0 || to >= list.length) return;
    const next = list.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };
  const remove = (i) => onChange(list.filter((_, j) => j !== i));

  if (!list.length) return null;

  const ctrl = {
    flex:1, border:"none", background:"rgba(0,0,0,0.62)", color:"#fff",
    fontSize:11, lineHeight:1, padding:"3px 0", cursor:"pointer",
  };

  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:8 }}>
      {list.map((url, i) => (
        <div key={url + i}
          style={{ position:"relative", width:size, height:size, borderRadius:9,
                   overflow:"hidden", flexShrink:0,
                   border: i === 0 ? `2px solid ${C.orange}` : `1px solid ${C.border}`,
                   background:"#F3F4F6" }}>
          <img src={url} alt={"Photo " + (i + 1)}
               style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />

          <button type="button" onClick={() => remove(i)} className="btn"
            title="Remove this photo"
            style={{ position:"absolute", top:2, right:2, width:19, height:19, borderRadius:99,
                     border:"none", background:"rgba(0,0,0,0.68)", color:"#fff",
                     fontSize:10, lineHeight:1, cursor:"pointer" }}>✕</button>

          {i === 0 ? (
            <span style={{ position:"absolute", bottom:0, left:0, right:0,
                           background:C.orange, color:"#fff", fontSize:8, fontWeight:800,
                           textAlign:"center", padding:"2px 0", letterSpacing:"0.04em" }}>
              COVER
            </span>
          ) : (
            <div style={{ position:"absolute", bottom:0, left:0, right:0, display:"flex" }}>
              <button type="button" onClick={() => move(i, i - 1)} className="btn"
                title="Move left" style={ctrl}>◀</button>
              <button type="button" onClick={() => move(i, 0)} className="btn"
                title="Make this the cover photo"
                style={{ ...ctrl, background:"rgba(234,88,12,0.9)", fontSize:9, fontWeight:800 }}>
                ★
              </button>
              <button type="button" onClick={() => move(i, i + 1)} className="btn"
                title="Move right" style={ctrl}
                disabled={i === list.length - 1}>▶</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* Where a notification should take you when tapped. Clicking one used to only
   mark it read, which left people hunting for the very thing they had just been
   told about — worst of all for "X replied", where the reply is two taps and a
   tab away.

   Types come from the notifications table: message, inquiry, inquiry_reply and
   conversation_closed are all conversation events; vendor_application (sent to
   admins when a vendor confirms their email) opens the admin panel on Vendors;
   everything else (new_request, request_update, request_sent,
   booking_cancelled, review) hangs off a booking. */
function bookingIdOf(n) { return (n && (n.reqId || n.request_id)) || null; }
function notifTarget(n) {
  const t = String((n && n.type) || "");
  if (t === "vendor_application") return { admin: true, adminTab: "vendors" };
  /* Payment problems open Admin → Payments for admins; anyone else (e.g. the
     host told their report was reviewed) lands on My Requests. */
  if (t === "payment_problem") return { admin: true, adminTab: "payments", tab: "requests", id: bookingIdOf(n) };
  const id = (n && (n.convId || n.conversation_id || n.inquiry_id)) || null;
  const bookingId = (n && (n.reqId || n.request_id)) || null;
  if (t === "message" || t === "admin_message" || t === "inquiry" ||
      t === "inquiry_reply" || t === "conversation_closed") {
    /* request_id carries the conversation for these types (see the
       notify_on_message / notify_on_inquiry triggers). Older notifications
       predate that and have null, so the tab is still the fallback. */
    return { tab: "messages", id };
  }
  return { tab: "requests", id: bookingId };
}

function NotificationBell({ userId, onClick, open, onOpenTarget }) {
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    if (!userId) return;
    const load = () => getNotifs(userId).then(n => setNotifs(n || []));
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [userId]);

  const unread = notifs.filter(n => !n.read && !n.is_read).length;

  return (
    <div style={{ position:"relative" }}>
      <button onClick={onClick} className="btn"
        style={{ background:"transparent", border:"none", padding:"6px 8px",
                 borderRadius:10, cursor:"pointer", position:"relative",
                 display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize:20 }}>🔔</span>
        {unread > 0 && (
          <span style={{ position:"absolute", top:2, right:2, background:"#EF4444",
                          color:"#fff", fontSize:8, fontWeight:800, borderRadius:99,
                          padding:"1px 4px", minWidth:14, textAlign:"center",
                          lineHeight:"14px" }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div style={{ position:"absolute", right:0, top:"calc(100% + 8px)", zIndex:600,
                      background:"#fff", borderRadius:16, width:320, maxHeight:400,
                      overflowY:"auto", boxShadow:"0 12px 40px rgba(0,0,0,0.18)",
                      border:`1px solid ${C.border}` }}>
          <div style={{ padding:"14px 16px 10px", borderBottom:`1px solid ${C.border}`,
                        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <p style={{ margin:0, fontSize:13, fontWeight:800 }}>Notifications</p>
            {unread > 0 && (
              <button onClick={() => markNotifsRead(userId).then(() => setNotifs(n => n.map(x => ({...x,read:true}))))}
                className="btn"
                style={{ background:"none", border:"none", fontSize:11,
                         color:C.orange, fontWeight:700, padding:0 }}>
                Mark all read
              </button>
            )}
          </div>
          {notifs.length === 0 ? (
            <div style={{ padding:"24px 16px", textAlign:"center", color:C.lightGray }}>
              <div style={{ fontSize:28, marginBottom:6 }}>🔕</div>
              <p style={{ fontSize:12 }}>No notifications yet</p>
            </div>
          ) : notifs.map(n => (
            <div key={n.id}
              role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
              onClick={() => {
                markNotifsRead(userId);
                setNotifs(ns => ns.map(x => ({...x,read:true,is_read:true})));
                /* Take them to the thing the notification is about. */
                if (onOpenTarget) onOpenTarget(notifTarget(n));
              }}
              style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`, cursor:"pointer",
                       background: (n.read || n.is_read) ? "#fff" : "#FFF7ED" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <p style={{ margin:0, fontSize:12, fontWeight:700, color:C.black }}>{n.title}</p>
                {(!n.read && !n.is_read) && <div style={{ width:7, height:7, borderRadius:"50%",
                                           background:C.orange, flexShrink:0, marginTop:4 }} />}
              </div>
              <p style={{ margin:"3px 0 0", fontSize:11, color:C.midGray, lineHeight:1.55 }}>{n.body}</p>
              <p style={{ margin:"4px 0 0", fontSize:9, color:C.lightGray }}>
                {new Date(n.ts || n.created_at || Date.now()).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── EVENT PACKAGES PAGE ─────────────────────────────────────────────────────── */
/* ─── BUILD MY EVENT — GUIDED WIZARD ────────────────────────────────────────
   Step 1: pick the event type.
   Step 2: walk every service category, one Yes/No at a time. On "Yes", the
           matching vendors for that category + event type are shown to add.
   Step 3: review every selection and send all booking requests at once. */
const BUILD_CATEGORY_WALK = ["places","food","music","photo","production","rentals","av","staff","beauty","transport","kids","logistics"];

/* ─── Click-only date & time pickers for Build My Event ─────────────────────
   No typing anywhere — the user taps a day on the calendar and taps time pills. */
const WEEKDAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const MONTH_LABELS = ["January","February","March","April","May","June","July",
                      "August","September","October","November","December"];

/* The day after a YYYY-MM-DD string. Built from the parsed date rather than by
   adding 86400000 to a timestamp, so it stays correct across a daylight-saving
   boundary where a "day" is 23 or 25 hours long. */
function nextDayIso(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d)) return "";
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

/* Local "now" as YYYY-MM-DDTHH:MM, so it can be string-compared against a
   date + time the user picked without either side going through UTC. */
function localStamp() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${isoDate(n)}T${p(n.getHours())}:${p(n.getMinutes())}`;
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/* ── COMBINED AVAILABILITY ────────────────────────────────────────────────
   With several vendors in the cart, a date/time only works if EVERY vendor in
   it works then. These build the predicates the pickers grey out with. */
const BLOCK_RANGES = {
  "Morning":    ["06:00", "12:00"],
  "Afternoon":  ["12:00", "17:00"],
  "Evening":    ["17:00", "22:00"],
  "Late night": ["22:00", "23:59"],
};

/* Which weekday + time blocks does this cart item work? Falls back to "any"
   when the vendor hasn't set availability, so nothing is blocked by silence. */
function cardAvailability(v) {
  const days   = parseEventTypes(v.availDays);
  const blocks = parseEventTypes(v.availBlocks);
  const parsed = (!days.length || !blocks.length) ? parseSchedule(v.schedule || "") : null;
  return {
    days:   days.length   ? days   : (parsed?.days   || []),
    blocks: blocks.length ? blocks : (parsed?.blocks || []),
  };
}

function makeDateAllower(cart, availByVendor) {
  return (iso, dateObj) => {
    const dow = AVAIL_DAYS[(dateObj.getDay() + 6) % 7];   // Mon-first label
    for (const v of cart) {
      const { days } = cardAvailability(v);
      if (days.length && !days.includes(dow)) return false;      // doesn't work that weekday
      const av = availByVendor?.[v.vendorId];
      if (av && Array.isArray(av.blocked) && av.blocked.includes(iso)) return false;  // date blocked
      if (av && Array.isArray(av.confirmed) && av.confirmed.includes(iso)) {
        /* Already booked that day — only blocked if they can't take another. */
        if (!(v.maxPerDay > 1 || v.simultaneous)) return false;
      }
    }
    return true;
  };
}

function makeTimeAllower(cart) {
  return (t) => {
    for (const v of cart) {
      const { blocks } = cardAvailability(v);
      if (!blocks.length) continue;                       // no hours set → allow
      const ok = blocks.some(b => {
        const r = BLOCK_RANGES[b];
        return r && t >= r[0] && t < r[1];
      });
      if (!ok) return false;
    }
    return true;
  };
}

function ClickCalendar({ value, onChange, allowDate }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const init = value ? new Date(value + "T00:00:00") : today;
  const [view, setView] = useState(new Date(init.getFullYear(), init.getMonth(), 1));

  const y = view.getFullYear(), m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const cells = [];
  for (let i=0; i<firstDow; i++) cells.push(null);
  for (let d=1; d<=daysInMonth; d++) cells.push(new Date(y, m, d));

  const canGoPrev = new Date(y, m, 1) > new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <div style={{ background:"#fff", border:`1.5px solid ${C.border}`, borderRadius:14, padding:"14px 16px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <button type="button" onClick={() => canGoPrev && setView(new Date(y, m-1, 1))} disabled={!canGoPrev} className="btn"
          style={{ border:"none", background:"none", fontSize:18, color: canGoPrev ? C.black : "#D1D5DB",
                   cursor: canGoPrev ? "pointer" : "default", padding:"2px 8px" }}>‹</button>
        <span style={{ fontSize:14, fontWeight:800 }}>{MONTH_LABELS[m]} {y}</span>
        <button type="button" onClick={() => setView(new Date(y, m+1, 1))} className="btn"
          style={{ border:"none", background:"none", fontSize:18, color:C.black, padding:"2px 8px" }}>›</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
        {WEEKDAY_LABELS.map(w => (
          <div key={w} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:C.lightGray, padding:"2px 0" }}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={"e"+i} />;
          const iso = isoDate(d);
          const past = d < today;
          /* Grey out days the vendor doesn't work (or has blocked). */
          const off  = !past && typeof allowDate === "function" && !allowDate(iso, d);
          const dis  = past || off;
          const sel = value === iso;
          return (
            <button key={iso} type="button" disabled={dis}
              title={off ? "This vendor doesn't take bookings on this day" : undefined}
              onClick={() => !dis && onChange(iso)} className="btn"
              style={{ aspectRatio:"1", border:"none", borderRadius:9, fontSize:13, fontWeight: sel?800:600,
                       cursor: dis ? "not-allowed" : "pointer",
                       background: sel ? C.orange : "transparent",
                       textDecoration: off ? "line-through" : "none",
                       color: sel ? "#fff" : dis ? "#D1D5DB" : C.black }}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Half-hour options across the whole clock.

   This used to start at 6:00 AM and stop at 11:30 PM, which quietly made two
   ordinary bookings impossible: anything finishing after midnight, and anything
   starting before six (a breakfast setup, a load-in). The end-time grid also
   only ever offered times LATER on the same day, so once a party started at
   10pm the only choices left were 10:30, 11:00 and 11:30. */
const TIME_OPTIONS = (() => {
  const out = [];
  for (let h=0; h<=23; h++) for (const mm of ["00","30"]) out.push(`${String(h).padStart(2,"0")}:${mm}`);
  return out;
})();

/* `after` filters to later times, but only makes sense when both ends are on
   the SAME day. Pass sameDay={false} for an end time on a later date, where
   1:00 AM is perfectly valid despite sorting before a 10:00 PM start. */
function TimeGrid({ value, onChange, after, allowTime, sameDay = true }) {
  const opts = (after && sameDay) ? TIME_OPTIONS.filter(t => t > after) : TIME_OPTIONS;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(84px, 1fr))", gap:6,
                  maxHeight:180, overflowY:"auto", padding:"2px" }}>
      {opts.map(t => {
        const sel = value === t;
        const off = typeof allowTime === "function" && !allowTime(t);
        return (
          <button key={t} type="button" disabled={off}
            title={off ? "Outside this vendor's working hours" : undefined}
            onClick={() => !off && onChange(t)} className="btn"
            style={{ padding:"8px 4px", borderRadius:9, fontSize:12.5, fontWeight: sel?800:600,
                     cursor: off ? "not-allowed" : "pointer",
                     border:`1.5px solid ${sel ? C.orange : C.border}`,
                     background: sel ? "#FFF7ED" : off ? "#F9FAFB" : "#fff",
                     color: sel ? C.orange : off ? "#D1D5DB" : C.black,
                     textDecoration: off ? "line-through" : "none" }}>
            {fmtTime12(t)}
          </button>
        );
      })}
    </div>
  );
}

/* ─── ADDRESS AUTOCOMPLETE (Google Maps) ─────────────────────────────────────
   Real address search so customers pick a precise, findable place. When a
   Google Maps API key is set below, it uses Google Places Autocomplete +
   Place Details to resolve the exact address (street/city/state/zip). If no key
   is set, it falls back to a free geocoder so the field still works.

   TO ENABLE GOOGLE:
     1. In Google Cloud Console, create an API key with "Places API" and
        "Maps JavaScript API" enabled, and billing turned on.
     2. Restrict the key to your site's domain (HTTP referrers). This is the
        important step: a browser key is visible in the bundle no matter where
        you put it, so the referrer restriction is the ONLY thing stopping a
        stranger spending your quota.
     3. Set REACT_APP_GOOGLE_MAPS_KEY in Vercel (Settings → Environment
        Variables) and redeploy. Do not hardcode it here.

   Cost: Autocomplete keystrokes are free when the session ends in a Place
   Details call, which pick() below always does, and it issues a fresh session
   token afterwards. Abandoned sessions are what get billed per request. */
const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || "";

/* Load the Google Maps JS SDK (Places library) once. Resolves with window.google. */
let _gmapsPromise = null;
function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google && window.google.maps && window.google.maps.places) return Promise.resolve(window.google);
  if (_gmapsPromise) return _gmapsPromise;
  _gmapsPromise = new Promise((resolve, reject) => {
    if (!GOOGLE_MAPS_KEY) { reject(new Error("no key")); return; }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places&loading=async`;
    s.async = true; s.defer = true;
    s.onload = () => (window.google?.maps?.places ? resolve(window.google) : reject(new Error("places missing")));
    s.onerror = () => reject(new Error("google maps failed to load"));
    document.head.appendChild(s);
  });
  return _gmapsPromise;
}

/* Parse a Google Place Details result into the app's structured fields. */
function parseGooglePlace(place) {
  const get = (type, short) => {
    const c = (place.address_components || []).find(x => x.types.includes(type));
    return c ? (short ? c.short_name : c.long_name) : "";
  };
  const street = [get("street_number"), get("route")].filter(Boolean).join(" ").trim();
  const city   = get("locality") || get("postal_town") || get("sublocality") || get("administrative_area_level_2");
  const state  = get("administrative_area_level_1", true);   // short → "TX"
  const zip    = get("postal_code");
  return { street, city, state, zip, full: place.formatted_address || street || "" };
}

/* Free fallback geocoder (OpenStreetMap) used only when no Google key is set. */
function parseGeoResult(r) {
  const a = r.address || {};
  const street = [a.house_number || "", a.road || a.pedestrian || a.footway || ""].filter(Boolean).join(" ").trim();
  const city   = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || "";
  return { street, city, state: a.state || "", zip: a.postcode || "", full: r.display_name || street || "" };
}
/* Free fallback used when no Google key is set.
   Photon is built for type-ahead (it matches partial input like "824 wil"),
   which plain Nominatim is not — Nominatim expects a fairly complete address.
   We try Photon first and fall back to Nominatim. */
async function fetchPhotonSuggestions(query) {
  /* Bias toward the Houston market so local addresses rank first. */
  const url = "https://photon.komoot.io/api/?limit=8&lang=en&lat=29.7604&lon=-95.3698&q=" + encodeURIComponent(query);
  try {
    const res = await fetch(url);
    if (!res.ok) { console.warn("[PLUJ] address lookup HTTP", res.status); return { list: [], blocked: false }; }
    const data = await res.json();
    const list = (data.features || []).map(f => {
      const p = f.properties || {};
      const street = [p.housenumber, p.street || p.name].filter(Boolean).join(" ").trim();
      const city   = p.city || p.town || p.village || p.district || p.county || "";
      const full   = [street || p.name, city, p.state, p.postcode].filter(Boolean).join(", ");
      return { street, city, state: p.state || "", zip: p.postcode || "", full,
               precise: !!p.housenumber, kind: "photon" };
    }).filter(x => x.full);
    /* Show exact street addresses before street-level or area matches. */
    list.sort((a, b) => (b.precise ? 1 : 0) - (a.precise ? 1 : 0));
    return { list, blocked: false };
  } catch (e) {
    /* A network/CSP failure throws — that's different from "no results". */
    console.warn("[PLUJ] address lookup blocked or offline:", e && e.message);
    return { list: [], blocked: true };
  }
}

async function fetchOSMSuggestions(query) {
  if (!query || query.trim().length < 3) return { list: [], blocked: false };
  const photon = await fetchPhotonSuggestions(query);
  if (photon.list.length) return photon;
  const url = "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&limit=6&q=" + encodeURIComponent(query);
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return { list: [], blocked: false };
    const data = await res.json();
    /* precise means the match carries a real house number. Without it this is a
       street or an area, not an address, and the person must not be allowed to
       mistake it for one. */
    const list = (Array.isArray(data) ? data : []).map(parseGeoResult).filter(x => x.full)
      .map(x => ({ ...x, kind: "osm", precise: /^\d/.test(x.street || "") }));
    return { list, blocked: false };
  } catch (e) {
    console.warn("[PLUJ] address lookup blocked or offline:", e && e.message);
    return { list: [], blocked: photon.blocked };
  }
}

/* Confirm a typed address against the US Census geocoder — free forever, no API
   key, no account, no billing card. Proxied through our own /api/verify-address
   because the Census API sends no CORS headers, so a direct browser call fails.

   This is what replaced the habit of inventing the house number. Rather than
   grafting the typed number onto a street the geocoder guessed, we ask an
   authoritative source whether that number actually exists on that street.
   It confirms "824 Wilkes St" and refuses "99999 Wilkes St".

   Returns null on every failure path — a slow or unavailable lookup must never
   stop somebody booking. */
async function verifyTypedAddress(query) {
  if (!query || !/[0-9]/.test(query)) return null;   // no number, nothing to confirm
  try {
    const res = await fetch("/api/verify-address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: query }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.match) return null;
    const m = data.match;
    return {
      kind: "census", precise: true,
      street: m.street, city: m.city, state: m.state, zip: m.zip,
      full: [m.street, m.city, [m.state, m.zip].filter(Boolean).join(" ")]
              .filter(Boolean).join(", "),
    };
  } catch { return null; }
}

function AddressAutocomplete({ onSelect, placeholder }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNoMatch, setShowNoMatch] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [gReady, setGReady] = useState(false);
  const timer = useRef(null);
  const acService = useRef(null);      // google AutocompleteService
  const placesSvc = useRef(null);      // google PlacesService (for details)
  const sessionTok = useRef(null);     // billing session token
  const detailsDiv = useRef(null);
  const boxRef = useRef(null);

  /* Dismiss the suggestion list on outside click or Escape so it can never sit
     on top of the fields below it. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey  = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Bring up Google if a key is configured. */
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY) return;
    let cancel = false;
    loadGoogleMaps().then(google => {
      if (cancel) return;
      acService.current = new google.maps.places.AutocompleteService();
      placesSvc.current = new google.maps.places.PlacesService(detailsDiv.current || document.createElement("div"));
      sessionTok.current = new google.maps.places.AutocompleteSessionToken();
      setGReady(true);
    }).catch(err => console.warn("[PLUJ] Google Maps unavailable, using free geocoder:", err?.message));
    return () => { cancel = true; };
  }, []);

  function runGoogle(v) {
    acService.current.getPlacePredictions(
      { input: v, componentRestrictions: { country: "us" }, sessionToken: sessionTok.current },
      (preds, status) => {
        if (status !== "OK" || !preds) { setResults([]); setLoading(false); setShowNoMatch(true); return; }
        setResults(preds.map(p => ({ kind: "google", full: p.description, place_id: p.place_id })));
        setLoading(false); setShowNoMatch(preds.length === 0);
      }
    );
  }

  function onType(v) {
    setQ(v); setOpen(true); setShowNoMatch(false);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 3) { setResults([]); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      if (GOOGLE_MAPS_KEY && gReady && acService.current) { runGoogle(v); }
      else {
        /* Run both at once. Photon is good at streets and cities; Census is the
           only one of the two that knows house numbers. Whichever answers, the
           customer waits for one round trip, not two. */
        const [r, confirmed] = await Promise.all([
          fetchOSMSuggestions(v),
          verifyTypedAddress(v),
        ]);
        /* A confirmed address outranks every guess, so it goes first. */
        const list = confirmed ? [confirmed, ...r.list] : r.list;
        setResults(list); setLoading(false); setBlocked(r.blocked);
        setShowNoMatch(list.length === 0);
      }
    }, 350);
  }

  /* There used to be a withTypedHouseNumber() helper here. When a geocoder
     returned only a STREET ("Wilkes Street") it grafted on the house number the
     person had typed, to avoid "losing" it.

     That was the bug behind wrong addresses. Type "824 wil", let the geocoder
     guess Wilcrest Drive, and it produced "824 Wilcrest Drive" — a complete,
     confident address nobody had entered and which may not exist. A vendor
     driving to it would arrive at the wrong house.

     It is deleted on purpose. We now either return exactly what the address
     database gave us, or we mark the result unverified. We never invent the
     missing part. Do not reinstate this. */

  function pick(r) {
    setOpen(false); setResults([]);
    setQ(r.full);
    if (r.kind === "google" && placesSvc.current) {
      placesSvc.current.getDetails(
        { placeId: r.place_id, fields: ["address_components", "formatted_address", "geometry"], sessionToken: sessionTok.current },
        (place, status) => {
          /* verified only on a real Place Details hit — this is the single
             place in the app allowed to claim an address is confirmed. */
          if (status === "OK" && place) onSelect({ ...parseGooglePlace(place), verified: true });
          else onSelect({ full: r.full, verified: false });
          // new token after a completed session (billing best practice)
          if (window.google?.maps?.places) sessionTok.current = new window.google.maps.places.AutocompleteSessionToken();
        }
      );
    } else if (r.kind === "census") {
      /* Confirmed against the Census address ranges, house number included.
         The only non-Google path allowed to claim an address is verified. */
      onSelect({ ...r, verified: true });
    } else {
      /* Free-geocoder match: usable, but never claimed as verified. */
      onSelect({ ...r, verified: false });
    }
  }

  return (
    <div ref={boxRef} style={{ position:"relative", marginBottom:8 }}>
      <div ref={detailsDiv} style={{ display:"none" }} />
      <input value={q} onChange={e => onType(e.target.value)} onFocus={() => q && setOpen(true)}
        placeholder={placeholder || "🔍 Search the event address…"}
        style={{ width:"100%", height:42, padding:"0 12px", border:`1.5px solid ${C.orange}`,
                 borderRadius:10, fontSize:13, boxSizing:"border-box", background:"#fff" }} />
      {open && (q.trim().length >= 3) && (loading || results.length > 0 || showNoMatch) && (
        <div style={{ position:"absolute", top:46, left:0, right:0, zIndex:30, background:"#fff",
                      border:`1px solid ${C.border}`, borderRadius:10, boxShadow:C.shadowMd,
                      maxHeight:220, overflowY:"auto" }}>
          {loading ? (
            <p style={{ margin:0, padding:"10px 12px", fontSize:12, color:C.midGray }}>Searching…</p>
          ) : results.length === 0 ? (
            <div style={{ padding:"10px 12px", display:"flex", alignItems:"center", gap:8 }}>
              <p style={{ margin:0, fontSize:12, color: blocked ? "#B91C1C" : C.midGray, flex:1 }}>
                {blocked
                  ? "Address lookup is unavailable right now — please enter the address manually below."
                  : "No matches yet — keep typing, or enter the address manually below."}
              </p>
              <button type="button" onClick={()=>setOpen(false)} className="btn"
                style={{ border:"none", background:"#F3F4F6", borderRadius:7, padding:"3px 9px",
                         fontSize:11, fontWeight:700, cursor:"pointer", color:C.midGray }}>Dismiss</button>
            </div>
          ) : results.map((r, i) => (
            <button key={i} type="button" onClick={() => pick(r)} className="btn"
              style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 12px",
                       border:"none", borderTop: i ? `1px solid ${C.border}` : "none",
                       background:"#fff", fontSize:12, color:C.black, cursor:"pointer" }}>
              {r.kind === "census" ? "✓ " : "📍 "}{r.full}
              {/* Confirmed against real US address ranges, house number and all. */}
              {r.kind === "census" && (
                <span style={{ display:"block", marginTop:2, fontSize:10.5,
                               color:"#166534", fontWeight:700 }}>
                  Confirmed address — house number and ZIP checked
                </span>
              )}
              {/* A match with no house number is a street, not an address. Say so
                  rather than letting it be picked as though it were exact. */}
              {r.kind !== "google" && r.kind !== "census" && r.precise === false && (
                <span style={{ display:"block", marginTop:2, fontSize:10.5, color:"#B45309" }}>
                  Street only — no house number. Check this before you use it.
                </span>
              )}
            </button>
          ))}
          {GOOGLE_MAPS_KEY && gReady && (
            <p style={{ margin:0, padding:"6px 12px", fontSize:9, color:C.lightGray, textAlign:"right" }}>powered by Google</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── EVENTS CALENDAR ───────────────────────────────────────────────────────
   Shows a party's past, current, and upcoming bookings on a month grid so both
   customers and vendors can track their dates at a glance. */
export function EventsCalendar({ bookings, role }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selDay, setSelDay] = useState(null);

  const byDate = {};
  for (const b of (bookings || [])) {
    const d = b.eventDate || b.event_date;
    if (!d) continue;
    (byDate[d] = byDate[d] || []).push(b);
  }

  const y = view.getFullYear(), m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const dim = new Date(y, m+1, 0).getDate();
  const cells = [];
  for (let i=0; i<firstDow; i++) cells.push(null);
  for (let d=1; d<=dim; d++) cells.push(new Date(y, m, d));

  const statusColor = s => isConfirmedStatus(s) ? C.green
    : isPendingStatus(s) ? "#D97706"
    : isDeclinedStatus(s) ? "#EF4444" : "#9CA3AF";
  const other = b => role === "vendor" ? (b.userName || "Guest") : (b.vendorName || "Vendor");

  const all = bookings || [];
  /* "Upcoming" has to mean work that is still going to happen. Counting every
     future row told a vendor they had three events this month when two had been
     cancelled — the number that matters most on this screen was the one most
     likely to be wrong. Cancelled and declined bookings stay visible on the
     grid for the record; they just do not count as upcoming.

     `past` is now counted by date rather than as (total − upcoming), because
     with cancellations excluded that subtraction would quietly file every
     cancelled future booking under "past". */
  const dateOf = b => b.eventDate || b.event_date;
  const isLive = b => !isCancelledStatus(b.status) && !isDeclinedStatus(b.status);
  const upcoming = all.filter(b => dateOf(b) && dateOf(b) >= isoDate(today) && isLive(b)).length;
  const past     = all.filter(b => dateOf(b) && dateOf(b) <  isoDate(today)).length;
  const selList = selDay ? (byDate[selDay] || []) : [];

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        <span style={{ fontSize:11, fontWeight:700, background:C.orangeSoft, color:C.orange, padding:"4px 10px", borderRadius:99 }}>
          {upcoming} upcoming
        </span>
        <span style={{ fontSize:11, fontWeight:700, background:"#F3F4F6", color:C.midGray, padding:"4px 10px", borderRadius:99 }}>
          {past} past
        </span>
      </div>

      <div style={{ background:"#fff", border:`1.5px solid ${C.border}`, borderRadius:14, padding:"14px 16px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <button type="button" onClick={() => setView(new Date(y, m-1, 1))} className="btn"
            style={{ border:"none", background:"none", fontSize:18, padding:"2px 8px" }}>‹</button>
          <span style={{ fontSize:14, fontWeight:800 }}>{MONTH_LABELS[m]} {y}</span>
          <button type="button" onClick={() => setView(new Date(y, m+1, 1))} className="btn"
            style={{ border:"none", background:"none", fontSize:18, padding:"2px 8px" }}>›</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
          {WEEKDAY_LABELS.map(w => (
            <div key={w} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:C.lightGray }}>{w}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={"e"+i} />;
            const iso = isoDate(d);
            const evts = byDate[iso] || [];
            const isToday = iso === isoDate(today);
            const isPast = d < today;
            const sel = selDay === iso;
            return (
              <button key={iso} type="button"
                onClick={() => setSelDay(evts.length ? (sel ? null : iso) : null)}
                className="btn"
                style={{ minHeight:44, border: isToday ? `1.5px solid ${C.orange}` : "1px solid transparent",
                         borderRadius:9, padding:"3px 0 4px", display:"flex", flexDirection:"column",
                         alignItems:"center", gap:2, cursor: evts.length ? "pointer" : "default",
                         background: sel ? "#FFF7ED" : evts.length ? "#FAFAFA" : "transparent",
                         opacity: isPast && !evts.length ? 0.45 : 1 }}>
                <span style={{ fontSize:12, fontWeight: isToday ? 800 : 600,
                               color: isToday ? C.orange : isPast ? C.lightGray : C.black }}>{d.getDate()}</span>
                <div style={{ display:"flex", gap:2, flexWrap:"wrap", justifyContent:"center" }}>
                  {evts.slice(0,3).map((b, k) => (
                    <span key={k} style={{ width:6, height:6, borderRadius:99, background:statusColor(b.status) }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ display:"flex", gap:12, marginTop:12, flexWrap:"wrap" }}>
          {[["Confirmed",C.green],["Pending","#D97706"],["Declined","#EF4444"],["Cancelled","#9CA3AF"]].map(([l,c]) => (
            <span key={l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:C.midGray }}>
              <span style={{ width:7, height:7, borderRadius:99, background:c }} />{l}
            </span>
          ))}
        </div>
      </div>

      {selList.length > 0 && (
        <div style={{ marginTop:12 }}>
          <p style={{ fontSize:12, fontWeight:800, margin:"0 0 8px" }}>
            {new Date(selDay+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {selList.map(b => (
              <div key={b.id} style={{ display:"flex", alignItems:"center", gap:10, background:"#F9FAFB",
                                       border:`1px solid ${C.border}`, borderRadius:11, padding:"10px 12px" }}>
                <span style={{ width:9, height:9, borderRadius:99, background:statusColor(b.status), flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:800 }}>{other(b)}</p>
                  <p style={{ margin:"2px 0 0", fontSize:11, color:C.midGray }}>
                    {b.serviceName ? b.serviceName + " · " : ""}{b.eventType || "Event"}
                    {b.startTime ? " · " + fmtTime12(b.startTime) : ""}
                  </p>
                </div>
                <span style={{ fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:99,
                               color:"#fff", background:statusColor(b.status), whiteSpace:"nowrap" }}>
                  {canonicalStatus(b.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {all.length === 0 && (
        <p style={{ textAlign:"center", fontSize:13, color:C.midGray, marginTop:16 }}>
          No events yet. Your bookings will appear here once you {role === "vendor" ? "receive requests" : "send requests"}.
        </p>
      )}
    </div>
  );
}

function BuildEventWizard({ vendorsFor, cart, addToCart, rmFromCart, onView, favorites, onToggleFav, onReviewSend, onExit }) {
  const [phase,   setPhase]   = useState("details"); // details | type | define | cats | review
  const [eventId, setEventId] = useState(null);
  const [social,  setSocial]  = useState("");
  const [catIdx,  setCatIdx]  = useState(0);
  const [answers, setAnswers] = useState({});        // catId -> 'yes' | 'no'
  /* Pre-collected, click-only event details (Step 0). */
  const [wizCity,  setWizCity]  = useState("");
  const [wizDate,  setWizDate]  = useState("");
  const [wizStart, setWizStart] = useState("");
  const [wizEnd,   setWizEnd]   = useState("");
  /* Guest count is collected here rather than at checkout because every step
     after this one filters on it. A venue that holds 80 should never be
     offered to someone expecting 300, and it cannot be hidden if nobody has
     been asked. */
  const [wizGuests, setWizGuests] = useState("");
  /* Empty means "finishes the same day". Storing the absence rather than a
     copy of the start date keeps same-day bookings writing end_date = null,
     which is exactly what the column means. */
  const [wizEndDate, setWizEndDate] = useState("");
  const endSameDay = !wizEndDate || wizEndDate === wizDate;

  const evt = EVENT_PACKAGES.find(p => p.id === eventId);
  const walk = BUILD_CATEGORY_WALK;
  const curCat = walk[catIdx];
  const curCatObj = CATEGORIES.find(c => c.id === curCat);
  const inCart = id => !!cart.find(c => c.id === id);

  /* Every vendor added through the wizard carries the up-front event details,
     so the booking request has the location/date/time without re-asking. */
  function addWithDetails(v) {
    addToCart({ ...v, city: wizCity, eventDate: wizDate, startTime: wizStart, endTime: wizEnd,
                endDate: endSameDay ? "" : wizEndDate });
  }
  const detailsPayload = () => ({
    city: wizCity, eventDate: wizDate, startTime: wizStart, endTime: wizEnd,
    endDate: endSameDay ? "" : wizEndDate,
    guests: String(wizGuests || ""),
    eventType: evt?.label || "Event",
  });
  /* The choices every later step is filtered by. endTime is included so a
     vendor is checked against every hour block the event runs through, not
     just the one it starts in. */
  const wizCtx = { city: wizCity, date: wizDate, startTime: wizStart,
                   endTime: wizEnd, guests: wizGuests };

  function chooseEvent(id) {
    setEventId(id);
    if (id === "social") setPhase("define");
    else { setCatIdx(0); setPhase("cats"); }
  }
  function answer(cat, val) {
    setAnswers(a => ({ ...a, [cat]: val }));
    if (val === "no") advance();
    // on "yes" we stay to show vendors; user taps "Next" to advance
  }
  function advance() {
    if (catIdx < walk.length - 1) setCatIdx(i => i + 1);
    else setPhase("review");
  }

  const Progress = () => (
    <div style={{ display:"flex", gap:5, marginBottom:20 }}>
      {walk.map((c, i) => (
        <div key={c} style={{ flex:1, height:5, borderRadius:99,
          background: i < catIdx ? C.green : i === catIdx ? C.orange : "#E5E7EB" }} />
      ))}
    </div>
  );

  /* ── STEP 0: event details (location / date / time) — all click-based ── */
  if (phase === "details") {
    const ready = wizCity && wizDate && wizStart && wizEnd && Number(wizGuests) > 0;
    return (
      <div className="fade-up" style={{ maxWidth:640, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <h1 style={{ fontFamily:"var(--display)", fontSize:30, fontWeight:900, margin:"0 0 6px" }}>
            Build My Event
          </h1>
          <p style={{ fontSize:14, color:C.midGray, margin:0 }}>First, the where and when. Just tap — no typing needed.</p>
        </div>

        {/* Location */}
        <label style={{ display:"block", fontSize:13, fontWeight:800, marginBottom:7 }}>📍 Location</label>
        <select value={wizCity} onChange={e => setWizCity(e.target.value)}
          style={{ width:"100%", height:46, padding:"0 12px", borderRadius:11, fontSize:14, marginBottom:18,
                   border:`1.5px solid ${wizCity ? C.orange : C.border}`, background:"#fff", cursor:"pointer",
                   fontFamily:"inherit", color: wizCity ? C.black : C.lightGray }}>
          <option value="">Select a city…</option>
          {TX_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Guest count */}
        <label style={{ display:"block", fontSize:13, fontWeight:800, marginBottom:7 }}>👥 How many guests?</label>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:9 }}>
          {[25,50,100,150,200,300,500].map(n => {
            const on = String(wizGuests) === String(n);
            return (
              <button type="button" key={n} onClick={() => setWizGuests(String(n))}
                style={{ padding:"8px 15px", borderRadius:99, fontSize:12.5, fontWeight:700,
                         cursor:"pointer", border:`1.5px solid ${on ? C.orange : C.border}`,
                         background: on ? "#FFF7ED" : "#fff", color: on ? C.orange : C.midGray }}>
                {n}
              </button>
            );
          })}
        </div>
        <input inputMode="numeric" value={wizGuests}
          onChange={e => setWizGuests(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="or type an exact number"
          style={{ width:"100%", height:42, padding:"0 12px", borderRadius:11, fontSize:14,
                   marginBottom:18, boxSizing:"border-box", fontFamily:"inherit",
                   border:`1.5px solid ${wizGuests ? C.orange : C.border}` }} />

        {/* Start date */}
        <label style={{ display:"block", fontSize:13, fontWeight:800, marginBottom:7 }}>
          📅 Start date{wizDate ? <span style={{ color:C.orange }}> · {new Date(wizDate+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"long",day:"numeric",year:"numeric"})}</span> : ""}
        </label>
        <div style={{ marginBottom:18 }}>
          <ClickCalendar value={wizDate} onChange={(d)=>{
            setWizDate(d);
            /* Keep the finish from drifting behind the start. */
            if (wizEndDate && wizEndDate < d) setWizEndDate(d);
          }} />
        </div>

        {/* Start time */}
        <label style={{ display:"block", fontSize:13, fontWeight:800, marginBottom:7 }}>⏰ Start time</label>
        <div style={{ marginBottom:14 }}>
          <TimeGrid value={wizStart}
            allowTime={wizDate === isoDate(new Date()) ? (t => `${wizDate}T${t}` > localStamp()) : undefined}
            onChange={(t)=>{ setWizStart(t); if (endSameDay && wizEnd && wizEnd <= t) setWizEnd(""); }} />
        </div>

        {wizStart && (
          <>
            {/* Finish. Same day by default, because most events are — but one
                tap opens a second calendar for anything running past midnight,
                which the single-date version could not express at all. */}
            <label style={{ display:"block", fontSize:13, fontWeight:800, marginBottom:7 }}>🌙 Finishes</label>
            <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
              {[[true,"Same day"],[false,"Next day or later"]].map(([same,label]) => {
                const on = endSameDay === same;
                return (
                  <button type="button" key={label}
                    onClick={()=>{ setWizEndDate(same ? "" : nextDayIso(wizDate)); setWizEnd(""); }}
                    style={{ padding:"8px 15px", borderRadius:99, fontSize:12.5, fontWeight:700,
                             cursor:"pointer", border:`1.5px solid ${on ? C.orange : C.border}`,
                             background: on ? "#FFF7ED" : "#fff", color: on ? C.orange : C.midGray }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {!endSameDay && (
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:700, marginBottom:6, color:C.midGray }}>
                  End date{wizEndDate ? <span style={{ color:C.orange }}> · {new Date(wizEndDate+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"long",day:"numeric"})}</span> : ""}
                </label>
                <ClickCalendar value={wizEndDate} onChange={setWizEndDate}
                  allowDate={(iso) => !wizDate || iso >= wizDate} />
              </div>
            )}

            <label style={{ display:"block", fontSize:13, fontWeight:800, marginBottom:7 }}>⏰ End time</label>
            <div style={{ marginBottom:18 }}>
              <TimeGrid value={wizEnd} onChange={setWizEnd}
                after={wizStart} sameDay={endSameDay} />
            </div>
          </>
        )}

        <button onClick={() => setPhase("type")} disabled={!ready} className="btn"
          style={{ width:"100%", padding:"14px 0", borderRadius:13, border:"none",
                   background: ready ? C.orange : "#E5E7EB", color: ready ? "#fff" : C.lightGray,
                   fontSize:15, fontWeight:800, cursor: ready ? "pointer" : "default",
                   boxShadow: ready ? C.shadowButton : "none" }}>
          {ready ? "Continue →" : "Select location, guests, date & time to continue"}
        </button>
        <button onClick={onExit} className="btn"
          style={{ width:"100%", marginTop:10, padding:"10px 0", borderRadius:11, border:`1px solid ${C.border}`,
                   background:"#fff", color:C.midGray, fontSize:13, fontWeight:600 }}>
          ✕ Exit
        </button>
      </div>
    );
  }

  /* ── STEP 1: event type ── */
  if (phase === "type") {
    return (
      <div className="fade-up" style={{ maxWidth:900, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <button onClick={() => setPhase("details")} className="btn"
            style={{ background:"none", border:"none", fontSize:13, color:C.midGray, fontWeight:600, marginBottom:8 }}>
            ← Back to details
          </button>
          <h1 style={{ fontFamily:"var(--display)", fontSize:32, fontWeight:900, margin:"0 0 6px" }}>
            Build My Event
          </h1>
          <p style={{ fontSize:14, color:C.midGray, margin:0 }}>
            {wizCity} · {wizDate ? new Date(wizDate+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}) : ""} · {fmtTime12(wizStart)}–{fmtTime12(wizEnd)}
          </p>
          <p style={{ fontSize:15, color:C.black, margin:"10px 0 0", fontWeight:700 }}>What are you planning?</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:12 }}>
          {EVENT_PACKAGES.map(p => (
            <button key={p.id} onClick={() => chooseEvent(p.id)} className="btn"
              style={{ textAlign:"left", padding:"18px 18px", borderRadius:16, cursor:"pointer",
                       border:`1.5px solid ${C.border}`, background:p.color, transition:"transform .1s" }}
              onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
              onMouseLeave={e=>e.currentTarget.style.transform="none"}>
              <div style={{ fontSize:30, marginBottom:8 }}>{p.icon}</div>
              <p style={{ margin:0, fontSize:15, fontWeight:800, color:C.black }}>{p.label}</p>
              <p style={{ margin:"3px 0 0", fontSize:11.5, color:C.midGray, lineHeight:1.5 }}>{p.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ── STEP 1b: define social gathering ── */
  if (phase === "define") {
    return (
      <div className="fade-up" style={{ maxWidth:520, margin:"0 auto", textAlign:"center" }}>
        <div style={{ fontSize:34, marginBottom:8 }}>🥂</div>
        <h2 style={{ fontFamily:"var(--display)", fontSize:24, fontWeight:800, margin:"0 0 6px" }}>
          Tell us about your gathering
        </h2>
        <p style={{ fontSize:13, color:C.midGray, margin:"0 0 18px" }}>
          A reunion, dinner party, holiday get-together… what's the occasion?
        </p>
        <input value={social} onChange={e=>setSocial(e.target.value)} autoFocus
          placeholder="e.g. Family reunion for 40"
          style={{ width:"100%", height:46, padding:"0 14px", borderRadius:11, fontSize:14,
                   border:`1.5px solid ${C.border}`, boxSizing:"border-box", marginBottom:14 }} />
        <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
          <button onClick={() => { setCatIdx(0); setPhase("cats"); }} className="btn"
            style={{ padding:"11px 24px", borderRadius:11, border:"none", background:C.orange,
                     color:"#fff", fontSize:14, fontWeight:700 }}>
            Continue →
          </button>
        </div>
      </div>
    );
  }

  /* ── STEP 2: category-by-category ── */
  if (phase === "cats") {
    const answered = answers[curCat];
    const vendors = answered === "yes" ? vendorsFor(curCat, eventId, wizCtx) : [];
    /* An empty list must say what is blocking it AND name the value that would
       unblock it. "Allow a different guest count" leaves the customer guessing
       at the very moment they are deciding whether to give up; "bring it down
       to 100 guests" is something they can act on in one tap. Only computed
       when the list is actually empty, so the extra passes cost nothing in the
       normal case. */
    let relaxed = [];
    if (answered === "yes" && vendors.length === 0) {
      const out = [];

      /* Guests — say the number, and in which direction. A caterer with a
         50-person minimum and a venue that holds 100 are different problems. */
      const byGuests = vendorsFor(curCat, eventId, { ...wizCtx, guests: "" });
      if (byGuests.length) {
        const want = Number(wizGuests) || 0;
        const fitsAt = g => byGuests.filter(v =>
          (v.capacityMax == null || g <= v.capacityMax) &&
          (v.capacityMin == null || g >= v.capacityMin)).length;
        const ceilings = byGuests.map(v => v.capacityMax).filter(n => n != null && n < want);
        const floors   = byGuests.map(v => v.capacityMin).filter(n => n != null && n > want);
        if (ceilings.length) {
          const best = Math.max(...ceilings);
          out.push({ key:"guests", n: fitsAt(best), label:`you bring it down to ${best} guests` });
        } else if (floors.length) {
          const best = Math.min(...floors);
          out.push({ key:"guests", n: fitsAt(best), label:`you go up to ${best} guests` });
        } else {
          out.push({ key:"guests", n: byGuests.length, label:"you change the guest count" });
        }
      }

      /* Date — name the nearest one that actually works, rather than telling
         them to go hunting through a calendar. */
      if (wizDate) {
        const base = new Date(`${wizDate}T00:00:00`);
        for (let i = 1; i <= 60; i++) {
          const dt = new Date(base);
          dt.setDate(dt.getDate() + i);
          const d = isoDate(dt);
          const hit = vendorsFor(curCat, eventId, { ...wizCtx, date: d });
          if (hit.length) {
            out.push({ key:"date", n: hit.length,
              label:`you move to ${new Date(`${d}T00:00:00`).toLocaleDateString("en-US",
                      { weekday:"long", month:"short", day:"numeric" })}` });
            break;
          }
        }
      }

      /* Area — name where these vendors actually cover, read off their own
         service areas rather than guessed. */
      const byCity = vendorsFor(curCat, eventId, { ...wizCtx, city: "" });
      if (byCity.length) {
        const where = [...new Set(byCity.flatMap(v =>
          String(v.serviceAreas || v.bizCity || "").split(",").map(s => s.trim()).filter(Boolean)))]
          .filter(c => c.toLowerCase() !== String(wizCity).toLowerCase())
          .slice(0, 3);
        out.push({ key:"city", n: byCity.length,
          label: where.length ? `you look in ${where.join(", ")}` : `you look outside ${wizCity}` });
      }

      relaxed = out.filter(r => r.n > 0);
    }
    return (
      <div className="fade-up" style={{ maxWidth:1040, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
          <button onClick={onExit} className="btn"
            style={{ background:"none", border:"none", fontSize:13, color:C.midGray, fontWeight:600, padding:0 }}>
            ✕ Exit
          </button>
          <span style={{ fontSize:12, color:C.midGray }}>
            {evt?.icon} {evt?.label}{eventId==="social" && social ? ` · ${social}` : ""} · Step {catIdx+1} of {walk.length}
          </span>
        </div>
        <Progress />

        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:34, marginBottom:6 }}>{curCatObj?.icon}</div>
          <h2 style={{ fontFamily:"var(--display)", fontSize:26, fontWeight:800, margin:"0 0 4px" }}>
            Do you need {curCatObj?.label}?
          </h2>
          <p style={{ fontSize:13, color:C.midGray, margin:0 }}>
            For your {evt?.label?.toLowerCase()}.
          </p>
        </div>

        {!answered && (
          <div style={{ display:"flex", gap:12, justifyContent:"center", marginBottom:8 }}>
            <button onClick={() => answer(curCat, "yes")} className="btn"
              style={{ padding:"12px 34px", borderRadius:12, border:"none", background:C.orange,
                       color:"#fff", fontSize:15, fontWeight:800 }}>
              Yes
            </button>
            <button onClick={() => answer(curCat, "no")} className="btn"
              style={{ padding:"12px 34px", borderRadius:12, border:`1.5px solid ${C.border}`,
                       background:"#fff", color:C.midGray, fontSize:15, fontWeight:700 }}>
              No
            </button>
          </div>
        )}

        {answered === "yes" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <p style={{ margin:0, fontSize:13, color:C.midGray }}>
                {vendors.length === 0 ? (
                  <>Nothing available for this step.</>
                ) : (
                  <><strong style={{ color:C.black }}>{vendors.length}</strong> {curCatObj?.label} {vendors.length!==1?"vendors":"vendor"} free
                  on your date for {wizGuests} guests — add any you like.</>
                )}
              </p>
              <button onClick={() => { setAnswers(a=>({...a,[curCat]:undefined})); }} className="btn"
                style={{ background:"none", border:"none", fontSize:12, color:C.midGray, textDecoration:"underline" }}>
                Change answer
              </button>
            </div>
            {vendors.length === 0 ? (
              <div style={{ padding:"26px 22px", background:"#F9FAFB", borderRadius:14, border:`1px dashed ${C.border}` }}>
                <p style={{ margin:0, fontSize:14, fontWeight:700, textAlign:"center" }}>
                  No {curCatObj?.label?.toLowerCase()} free on {wizDate ? new Date(wizDate+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}) : "that date"} for {wizGuests} guests in {wizCity}.
                </p>
                {relaxed.length > 0 ? (
                  <>
                    <p style={{ margin:"14px 0 6px", fontSize:12, color:C.midGray, textAlign:"center" }}>
                      What would open it up:
                    </p>
                    <ul style={{ margin:"0 auto", padding:"0 0 0 20px", fontSize:13, color:C.black,
                                 lineHeight:1.9, maxWidth:380 }}>
                      {relaxed.map(r => (
                        <li key={r.key}><strong>{r.n}</strong> {r.n===1?"fits":"fit"} if {r.label}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p style={{ margin:"6px 0 0", fontSize:12, color:C.midGray, textAlign:"center" }}>
                    No {curCatObj?.label?.toLowerCase()} vendors have joined PLUJ yet. Skip this one and check back later.
                  </p>
                )}
                <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:16, flexWrap:"wrap" }}>
                  <button onClick={() => setPhase("details")} className="btn"
                    style={{ padding:"9px 18px", borderRadius:11, border:`1.5px solid ${C.border}`,
                             background:"#fff", color:C.black, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                    ← Change date, guests or city
                  </button>
                </div>
              </div>
            ) : (
              <div className="vendor-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:16 }}>
                {vendors.map(v => (
                  <VCard key={v.id} v={v} inCart={inCart(v.id)}
                    isFav={favorites.includes(v.id)} onAdd={addWithDetails} onRemove={rmFromCart}
                    onView={(vv)=>onView(vv||v)} onToggleFav={onToggleFav} />
                ))}
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"center", marginTop:22 }}>
              <button onClick={advance} className="btn"
                style={{ padding:"12px 30px", borderRadius:12, border:"none", background:C.black,
                         color:"#fff", fontSize:14, fontWeight:800 }}>
                {vendors.length === 0
                  ? (catIdx < walk.length-1
                      ? `Skip ${curCatObj?.label?.toLowerCase()} for now →`
                      : "Review my event →")
                  : (catIdx < walk.length-1 ? "Next category →" : "Review my event →")}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── STEP 3: review + send all ── */
  const picked = cart;
  const total = picked.reduce((a,v)=>a+(v.pv||0),0);
  /* A cart assembled before the customer went back and moved the date, changed
     the city or raised the guest count can still hold vendors who no longer
     fit. Filtering the earlier steps is worthless if the result is allowed to
     go stale on the last screen, so every selection is re-checked against the
     event as it stands now. */
  const stale = picked.filter(v => {
    const fits = vendorsFor(String(v.cat || "").toLowerCase(), eventId, wizCtx);
    return !fits.some(x => x.id === v.id);
  });
  return (
    <div className="fade-up" style={{ maxWidth:720, margin:"0 auto" }}>
      <div style={{ textAlign:"center", marginBottom:22 }}>
        <div style={{ fontSize:34, marginBottom:6 }}>{evt?.icon}</div>
        <h1 style={{ fontFamily:"var(--display)", fontSize:28, fontWeight:900, margin:"0 0 4px" }}>
          Your {evt?.label}
        </h1>
        <p style={{ fontSize:13, color:C.midGray, margin:0 }}>
          Review everything you picked, then send all requests at once.
        </p>
      </div>

      {stale.length > 0 && (
        <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", borderRadius:13,
                      padding:"14px 16px", marginBottom:16 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:800, color:"#B91C1C" }}>
            {stale.length === 1 ? "One selection no longer fits" : `${stale.length} selections no longer fit`} your event
          </p>
          <p style={{ margin:"4px 0 8px", fontSize:12, color:"#7F1D1D", lineHeight:1.6 }}>
            Your date, city or guest count changed after you picked {stale.length === 1 ? "it" : "them"}.
            Sending {stale.length === 1 ? "this request" : "these requests"} would almost certainly come back declined.
          </p>
          {stale.map(v => (
            <div key={v.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                                     gap:10, marginTop:7 }}>
              <span style={{ fontSize:13, fontWeight:700, color:C.black }}>{v.name}</span>
              <button onClick={() => rmFromCart(v.id)} className="btn"
                style={{ padding:"5px 11px", borderRadius:8, border:"1px solid #FCA5A5",
                         background:"#fff", color:"#B91C1C", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {picked.length === 0 ? (
        <div style={{ textAlign:"center", padding:"40px 20px", background:"#F9FAFB", borderRadius:16, border:`1px dashed ${C.border}` }}>
          <p style={{ margin:0, fontSize:15, fontWeight:700 }}>You didn't add any vendors.</p>
          <button onClick={() => { setCatIdx(0); setAnswers({}); setPhase("cats"); }} className="btn"
            style={{ marginTop:14, padding:"10px 20px", borderRadius:11, border:"none", background:C.orange, color:"#fff", fontSize:13, fontWeight:700 }}>
            ← Go back through categories
          </button>
        </div>
      ) : (
        <>
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
            {picked.map(v => (
              <div key={v.id} style={{ display:"flex", gap:12, alignItems:"center", background:"#fff",
                                       border:`1px solid ${C.border}`, borderRadius:13, padding:"12px 14px" }}>
                <img src={v.img} alt="" style={{ width:52, height:52, borderRadius:10, objectFit:"cover", flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontSize:14, fontWeight:800 }}>{v.name}</p>
                  <p style={{ margin:"2px 0 0", fontSize:12, color:C.midGray }}>
                    {(CATEGORIES.find(c=>c.id===v.cat)||{}).label || v.type}
                    {v.selectedPackage?.name ? ` · ${v.selectedPackage.name}` : ""} · {cardPrice(v)}
                  </p>
                </div>
                <button onClick={() => rmFromCart(v.id)} className="btn"
                  style={{ padding:"6px 10px", borderRadius:8, border:"1px solid #FCA5A5",
                           background:"#FEF2F2", color:"#B91C1C", fontSize:11, fontWeight:700 }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:"14px 16px", background:"#F9FAFB", borderRadius:13, marginBottom:18 }}>
            <span style={{ fontSize:13, fontWeight:700 }}>{picked.length} {picked.length!==1?"vendors":"vendor"} selected</span>
            <span style={{ fontSize:15, fontWeight:800 }}>{total>0?`Est. ${fmtAllIn(total)}`:"Contact for pricing"}</span>
          </div>
          <button onClick={() => onReviewSend(detailsPayload())} className="btn"
            style={{ width:"100%", padding:"15px 0", borderRadius:14, border:"none", background:C.orange,
                     color:"#fff", fontSize:15, fontWeight:800, boxShadow:C.shadowButton }}>
            Send all {picked.length} {picked.length!==1?"requests":"request"} →
          </button>
          <button onClick={() => { setCatIdx(0); setPhase("cats"); }} className="btn"
            style={{ width:"100%", marginTop:10, padding:"11px 0", borderRadius:12, border:`1px solid ${C.border}`,
                     background:"#fff", color:C.midGray, fontSize:13, fontWeight:600 }}>
            ← Add more from categories
          </button>
        </>
      )}
    </div>
  );
}

function EventPackagesPage({ onSelectPackage, onPickCat }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div className="fade-up">
      {/* Hero */}
      <div style={{ textAlign:"center", padding:"40px 20px 32px" }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#FFF7ED",
                      borderRadius:99, padding:"6px 16px", marginBottom:16 }}>
          <span style={{ fontSize:14 }}>✦</span>
          <span style={{ fontSize:12, fontWeight:700, color:C.orange }}>One-stop event marketplace</span>
        </div>
        <h1 style={{ fontFamily:"var(--display)", fontSize:34, fontWeight:800,
                     letterSpacing:"-0.03em", margin:"0 0 12px", color:C.black }}>
          What are you planning?
        </h1>
        <p style={{ fontSize:15, color:C.midGray, maxWidth:480, margin:"0 auto",
                    lineHeight:1.75 }}>
          Pick your event type and we'll show you every vendor you need — or browse freely and
          build your own lineup.
        </p>
      </div>

      {/* Package grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",
                    gap:14, padding:"0 0 40px" }}>
        {EVENT_PACKAGES.map(pkg => (
          <button key={pkg.id} className="btn"
            onClick={() => onSelectPackage(pkg)}
            onMouseEnter={() => setHovered(pkg.id)}
            onMouseLeave={() => setHovered(null)}
            style={{ background: hovered===pkg.id ? pkg.color : "#fff",
                     border:`2px solid ${hovered===pkg.id ? pkg.accent : C.border}`,
                     borderRadius:18, padding:"20px 18px", textAlign:"left",
                     transition:"all 0.18s ease",
                     boxShadow: hovered===pkg.id ? `0 8px 28px ${pkg.accent}22` : C.shadowCard,
                     transform: hovered===pkg.id ? "translateY(-2px)" : "none" }}>
            <div style={{ fontSize:32, marginBottom:10, lineHeight:1 }}>{pkg.icon}</div>
            <p style={{ margin:"0 0 4px", fontSize:15, fontWeight:800, color:C.black }}>
              {pkg.label}
            </p>
            <p style={{ margin:"0 0 14px", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
              {pkg.desc}
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {pkg.checklist.slice(0, 4).map(item => (
                <div key={item} style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ width:5, height:5, borderRadius:"50%",
                                  background:pkg.accent, flexShrink:0 }} />
                  <span style={{ fontSize:10, color:C.midGray }}>{item}</span>
                </div>
              ))}
              {pkg.checklist.length > 4 && (
                <span style={{ fontSize:10, color:pkg.accent, fontWeight:700 }}>
                  +{pkg.checklist.length - 4} more
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Browse by category shortcut */}
      <div style={{ background:"#F9FAFB", borderRadius:18, padding:"22px 24px",
                    border:`1px solid ${C.border}`, textAlign:"center" }}>
        <p style={{ margin:"0 0 6px", fontSize:15, fontWeight:800, color:C.black }}>
          Just need one specific thing?
        </p>
        <p style={{ margin:"0 0 16px", fontSize:13, color:C.midGray }}>
          Browse by category to find exactly what you're looking for.
        </p>
        <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
          {[["food","🍽️","Food & Drinks"],["music","🎵","Music"],["production","✨","Production"],["logistics","📦","Logistics"]].map(([id,icon,label]) => (
            <button key={id} onClick={() => onPickCat(id)} className="btn"
              style={{ padding:"8px 16px", borderRadius:99, background:"#fff",
                       border:`1.5px solid ${C.border}`, fontSize:12, fontWeight:700,
                       color:C.black, display:"flex", alignItems:"center", gap:5 }}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── CART PANEL (upgraded with event details) ────────────────────────────────── */
/* ─── RESPONSE DEADLINE ───────────────────────────────────────────────────────
   How long the customer is willing to wait for a vendor's answer. The choice
   only ever TIGHTENS the deadline — the server clamps it to the 5-day ceiling
   (booking_response_deadline_hours) and the "cancel 24 hours before the event"
   rule still sits underneath, so what actually applies is whichever comes
   first. Sending nothing means the old 5-day default, unchanged.            */
const RESPONSE_DEADLINE_OPTIONS = [
  { hours: 24,  label: "Within 24 hours", tag: "urgent"  },
  { hours: 48,  label: "Within 2 days",   tag: ""        },
  { hours: 120, label: "Within 5 days",   tag: "no rush" },
];

/* THE thresholds. They exist in exactly one other place — the SQL function
   public.suggested_response_deadline_hours(date). Change the two together. */
function suggestedResponseDeadlineHours(eventDate) {
  if (!eventDate) return 120;
  const day = 86400000;
  const days = Math.round(
    (new Date(eventDate + "T00:00:00") - new Date(isoDate(new Date()) + "T00:00:00")) / day);
  if (days <   7) return 24;    // under a week away
  if (days <= 30) return 48;    // a week to a month
  return 120;                   // further out
}

/* A deadline that lands after PLUJ would have cancelled the request anyway
   (24 hours before the event) is a promise the platform cannot keep, so it is
   never put in front of the customer. */
function offerableDeadlineOptions(eventDate, startTime) {
  if (!eventDate) return RESPONSE_DEADLINE_OPTIONS;
  const start = new Date(`${eventDate}T${startTime || "00:00"}:00`);
  if (isNaN(start.getTime())) return RESPONSE_DEADLINE_OPTIONS;
  const hoursLeft = (start.getTime() - 24 * 3600000 - Date.now()) / 3600000;
  return RESPONSE_DEADLINE_OPTIONS.filter(o => o.hours <= hoursLeft);
}

/* ── PER-VENDOR TIME SLOT ────────────────────────────────────────────────────
   The event runs 7pm–1am; the DJ plays 9pm–1am; catering serves 7:30–9pm.
   Quoting a DJ for six hours when they are needed for four is a worse quote
   and a confused vendor.

   The slot is stored as `slotStart` / `slotEnd` on the cart line and is ABSENT
   until the customer actually changes it. Absent means "the whole event", which
   is re-read from the event window every time it is needed — so moving the
   event from 7pm to 9pm moves every un-edited vendor with it. Copying the
   window onto each line at add-time would look identical today and quietly go
   stale the moment the customer changed their mind, which is the same class of
   bug the filtering work just removed. */
function SlotEditor({ v, eventStart, eventEnd, sameDay, onChange }) {
  const [open, setOpen] = useState(false);
  const custom = !!(v.slotStart || v.slotEnd);
  const start = v.slotStart || eventStart;
  const end   = v.slotEnd   || eventEnd;
  if (!eventStart || !eventEnd) return null;

  /* An end before its start is only wrong when both are on the same day —
     1:00 AM after a 10:00 PM start is a normal night. */
  const invalid = sameDay && start && end && end <= start;
  /* A slot outside the event itself is always a mistake worth naming. */
  const outside = sameDay && ((start < eventStart) || (end > eventEnd));

  const sel = (val, onPick, label) => (
    <select value={val} aria-label={label} onChange={e => onPick(e.target.value)}
      style={{ height:30, borderRadius:8, fontSize:11.5, fontFamily:"inherit",
               padding:"0 6px", border:`1.5px solid ${C.border}`, background:"#fff",
               color:C.black, cursor:"pointer" }}>
      {TIME_OPTIONS.map(t => <option key={t} value={t}>{fmtTime12(t)}</option>)}
    </select>
  );

  return (
    <div style={{ marginTop:5 }}>
      {!open ? (
        <p style={{ margin:0, fontSize:10.5, color: custom ? "#6D28D9" : C.midGray, lineHeight:1.5 }}>
          🕐 Needed {fmtTimeRange(start, end)}
          {custom ? "" : " (whole event)"}
          <button type="button" onClick={() => setOpen(true)} className="btn"
            style={{ background:"none", border:"none", padding:"0 0 0 6px", fontSize:10.5,
                     color:C.midGray, textDecoration:"underline", cursor:"pointer" }}>
            change
          </button>
        </p>
      ) : (
        <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
          {sel(start, t => onChange({ slotStart:t, slotEnd:end }), "Slot start")}
          <span style={{ fontSize:11, color:C.midGray }}>to</span>
          {sel(end, t => onChange({ slotStart:start, slotEnd:t }), "Slot end")}
          <button type="button" onClick={() => { onChange({ slotStart:null, slotEnd:null }); setOpen(false); }}
            className="btn"
            style={{ background:"none", border:"none", fontSize:10.5, color:C.midGray,
                     textDecoration:"underline", cursor:"pointer", padding:0 }}>
            whole event
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn"
            style={{ background:"none", border:"none", fontSize:10.5, color:C.midGray,
                     cursor:"pointer", padding:0 }}>
            done
          </button>
        </div>
      )}
      {/* Shown whether or not the editor is open. A slot set earlier can be made
          invalid later by moving the event itself, and the customer would never
          reopen the editor to find out. */}
      {(invalid || outside) && (
        <p style={{ margin:"4px 0 0", fontSize:10, color:"#B91C1C", lineHeight:1.45 }}>
          {invalid
            ? "This slot ends before it starts."
            : `This is outside your event (${fmtTimeRange(eventStart, eventEnd)}).`}
        </p>
      )}
    </div>
  );
}

function CartPanel({ cart, onRemove, onUpdateItem, onClose, onSubmitRequests, user, setAuthModal, budget, onSetBudget, initialDetails, onDetailsChange, availByVendor }) {
  /* Unavailable dates per vendor in the cart — blocked days the vendor marked
     off, plus days they already have a confirmed booking. Customers must not
     be able to request those dates. */
  const [vendorAvail, setVendorAvail] = useState({});   // { vendorId: {blocked:[], confirmed:[]} }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = cart
        .map(v => v.vendorId || v.dbId || String(v.id).replace(/^db_/, ""))
        .filter(id => UUID_RE.test(String(id)));
      const out = {};
      for (const id of ids) {
        try { out[id] = await getVendorAvailability(id); } catch { /* ignore */ }
      }
      if (!cancelled) setVendorAvail(out);
    })();
    return () => { cancelled = true; };
  }, [cart]);

  /* All dates that are unavailable for ANY vendor in the cart */
  const unavailableDates = useMemo(() => {
    const set = new Set();
    Object.values(vendorAvail).forEach(a => {
      (a?.blocked   || []).forEach(d => set.add(d));
      (a?.confirmed || []).forEach(d => set.add(d));
    });
    return set;
  }, [vendorAvail]);

  /* Which cart vendors can't take the chosen date/time, and why.
     Returns [{ vendor, reasons[] }]. Covers blocked dates, already-booked
     dates, non-working weekdays and non-working hour blocks. */
  /* endT is passed in rather than read from the closure: this function is
     declared above the useState that creates `endTime`, and a hoisted function
     reading a not-yet-initialised const is how the last temporal-dead-zone
     crash got shipped. Explicit arguments cannot drift. */
  function vendorsUnavailableOn(dateStr, startT, endT) {
    if (!dateStr) return [];
    return cart.map(v => {
      const id = v.vendorId || v.dbId || String(v.id).replace(/^db_/, "");
      /* Check each vendor against the hours THEY are needed, not the hours the
         event runs. A DJ who only works evenings is not a conflict because the
         setup crew starts at 7am — and giving them their own slot is what makes
         the whole-span check below fair rather than punishing. */
      const reasons = vendorConflicts(v, vendorAvail[id], dateStr,
        v.slotStart || startT, v.slotEnd || endT);
      return reasons.length ? { vendor: v, reasons } : null;
    }).filter(Boolean);
  }

  /* Human-readable "X is not available because…" line. */
  function conflictMessage(list) {
    return list.map(({ vendor, reasons }) => `${vendor.name} ${reasons.join(" and ")}`).join("; ")
      + ". Choose another date or time, or remove them from your request.";
  }

  const [eventType,  setEventType]  = useState(initialDetails?.eventType || "");
  const [otherEventNote, setOtherEventNote] = useState(initialDetails?.otherEventNote || "");
  const [eventDate,  setEventDate]  = useState(initialDetails?.eventDate || "");
  const [endDate,    setEndDate]    = useState(initialDetails?.endDate || "");
  /* Paired with booking_submitted, this is the abandonment rate. */
  useEffect(() => { if (cart.length) track("booking_started", { vendors: cart.length }); }, []);
  const [eventGuests,setEventGuests]= useState(initialDetails?.guests || "");
  const [eventVenue, setEventVenue] = useState(initialDetails?.venue || "");   // venue NAME (e.g. "The Grand Ballroom")
  const [message,    setMessage]    = useState(initialDetails?.message || "");
  /* Structured event location — what a vendor needs to physically show up. */
  const [venueType,  setVenueType]  = useState(initialDetails?.venueType || "");
  const [street,     setStreet]     = useState(initialDetails?.street || "");
  const [addr2,      setAddr2]      = useState(initialDetails?.addr2 || "");
  const [city,       setCity]       = useState(initialDetails?.city || "");
  const [stateAbbr,  setStateAbbr]  = useState(initialDetails?.state || (initialDetails?.city ? "TX" : ""));
  const [zip,        setZip]        = useState(initialDetails?.zip || "");
  /* Address is "confirmed" once picked from search (or manually accepted), so
     it's shown back as a summary instead of a row of editable boxes. */
  const [addrConfirmed, setAddrConfirmed] = useState(!!(initialDetails?.city && initialDetails?.street));
  const [manualAddr,    setManualAddr]    = useState(false);
  /* Verification is DERIVED, not tracked. We snapshot the exact address the
     address database returned; the booking counts as verified only while the
     four fields still match that snapshot character for character.

     Doing it this way means every edit path invalidates it automatically — the
     manual boxes, the editable confirmed card, a paste, a future field we
     haven't written yet. Setting a boolean in each onChange would work until
     somebody adds a fifth input and forgets. */
  const [verifiedAddr, setVerifiedAddr] = useState(null);
  const addrVerified = !!verifiedAddr &&
    verifiedAddr === [street.trim(), city.trim(), stateAbbr.trim(), zip.trim()].join("|");
  const [startTime,  setStartTime]  = useState(initialDetails?.startTime || "");
  const [endTime,    setEndTime]    = useState(initialDetails?.endTime || "");
  const [access,     setAccess]     = useState(initialDetails?.access || "");
  /* How fast the customer needs an answer, in hours. */
  const [deadlineHours, setDeadlineHours] =
    useState(() => suggestedResponseDeadlineHours(initialDetails?.eventDate || ""));
  /* The suggestion is a function of how close the event is, so it is re-made
     whenever the event date moves — a "no rush" picked for a date six months
     out means nothing once the event becomes next week. */
  useEffect(() => { setDeadlineHours(suggestedResponseDeadlineHours(eventDate)); }, [eventDate]);
  const deadlineOptions = offerableDeadlineOptions(eventDate, startTime);
  /* Never submit a deadline that is not on offer. When the event is so close
     that none of them can be honoured, send nothing at all and let the
     24-hours-before-the-event rule own the request by itself. */
  const deadlineChoice = deadlineOptions.some(o => o.hours === deadlineHours)
    ? deadlineHours
    : (deadlineOptions.length ? deadlineOptions[deadlineOptions.length - 1].hours : null);
  const [submitting, setSubmitting] = useState(false);
  const [err,        setErr]        = useState("");

  /* Save everything the customer enters here into the shared store, so it's
     prefilled next time and survives a page refresh — no re-typing. Declared
     AFTER every field it reads so none are in the temporal dead zone. */
  useEffect(() => {
    if (!onDetailsChange) return;
    onDetailsChange({
      eventType, otherEventNote, eventDate, endDate, guests: eventGuests, venue: eventVenue, message,
      venueType, street, addr2, city, state: stateAbbr, zip, startTime, endTime, access,
    });
  }, [eventType, otherEventNote, eventDate, endDate, eventGuests, eventVenue, message, venueType, street, addr2, city, stateAbbr, zip, startTime, endTime, access]);

  /* Grey out dates/times none of the cart's vendors can work. */
  const allowDate = makeDateAllower(cart, availByVendor);
  const vendorHoursAllow = makeTimeAllower(cart);
  /* Two separate reasons a time can be unselectable, combined into the one
     predicate TimeGrid understands: the vendor does not work then, or the
     moment has simply gone. The second only bites when the event is today —
     9:00 AM is a fine choice for tomorrow and a dead one at 4pm today. */
  const startIsToday = eventDate === isoDate(new Date());
  const allowTime = (t) => {
    if (vendorHoursAllow && !vendorHoursAllow(t)) return false;
    if (startIsToday && `${eventDate}T${t}` <= localStamp()) return false;
    return true;
  };
  /* Empty end date means "finishes the same day". */
  const endSameDay = !endDate || endDate === eventDate;

  const total = cart.reduce((a,v) => a + (v.pv||0), 0);

  /* If a venue/place is in the cart, the event happens AT that venue, so its
     address IS the event location — the customer shouldn't re-enter it, and
     any other services in the cart are sent to that same address. */
  const placeVendor = cart.find(v => v.cat === "places");
  const placeLoc = placeVendor ? {
    venue:         placeVendor.name || "Venue",
    venueType:     "venue",
    streetAddress: placeVendor.bizAddress || "",
    addressLine2:  "",
    city:          placeVendor.bizCity || "",
    state:         placeVendor.bizState || "",
    zip:           placeVendor.bizZip || "",
  } : null;
  const placeAddrLine = placeLoc
    ? [placeLoc.streetAddress, [placeLoc.city, [placeLoc.state, placeLoc.zip].filter(Boolean).join(" ").trim()].filter(Boolean).join(", ")].filter(Boolean).join(", ")
    : "";

  async function handleSubmit() {
    if (!user) { setAuthModal(true); return; }
    if (!eventDate) { setErr("Event date is required — please choose your event date."); return; }
    /* Belt and braces: the calendar already hides past days and the time
       grid strikes out past hours, but a stale form left open across
       midnight would otherwise submit yesterday. */
    const gone = pastEventReason(eventDate, startTime);
    if (gone) { setErr(`Please pick a new date and time — ${gone}.`); return; }
    /* Guest count and venue type are what a vendor prices and plans against.
       Optional, they arrived blank often enough that the vendor's first act was
       to message the customer asking for them — so the request could not be
       answered until a round trip had already happened. A caterer cannot quote
       for "some people", and a DJ needs to know whether they are loading into a
       ballroom or a back garden.

       Venue type is skipped when a venue is in the cart, because then the venue
       IS the answer and asking again would be nonsense. */
    if (!String(eventGuests).trim()) {
      setErr("How many guests are you expecting? Vendors need this to price your event."); return;
    }
    if (Number(String(eventGuests).replace(/[^0-9]/g, "")) <= 0) {
      setErr("Please enter the number of guests as a number."); return;
    }
    if (!placeVendor && !String(venueType).trim()) {
      setErr("Please choose the venue type so vendors know what kind of space they are coming to."); return;
    }
    if (!placeVendor && !city.trim()) { setErr("Please add at least the event city so the vendor knows where to go."); return; }
    /* A per-vendor slot that ends before it starts, or falls outside the event
       itself, is a typo the vendor cannot interpret. Only meaningful when the
       event begins and ends on the same day — a 1:00 AM finish after a 10:00 PM
       start is an ordinary night, not an error. */
    if (endSameDay) {
      const badSlot = cart.find(v => {
        const s = v.slotStart || startTime, e = v.slotEnd || endTime;
        if (!s || !e) return false;
        return e <= s || s < startTime || e > endTime;
      });
      if (badSlot) {
        setErr(`${badSlot.name || "A vendor"}'s time slot (${fmtTimeRange(badSlot.slotStart || startTime, badSlot.slotEnd || endTime)}) doesn't fit inside your event (${fmtTimeRange(startTime, endTime)}). Fix it or set them back to the whole event.`);
        return;
      }
    }
    const busy = vendorsUnavailableOn(eventDate, startTime, endTime);
    if (busy.length) { setErr(conflictMessage(busy)); return; }
    setSubmitting(true);
    track("booking_submitted", { vendors: cart.length, guests: Number(String(eventGuests).replace(/[^0-9]/g,"")) || 0 });
    /* Location: the venue's address when booking a place, else what the customer entered. */
    const loc = placeLoc || {
      venue: eventVenue, venueType, streetAddress: street, addressLine2: addr2,
      city, state: stateAbbr, zip,
    };
    /* Booking a venue means the address is the venue's OWN registered address,
       supplied by the venue about itself. That is a stronger signal than a
       geocoder guess, so it counts as confirmed. Everything else is confirmed
       only while it still matches a Place Details result. */
    const locVerified = placeLoc ? true : addrVerified;
    const requests = cart.map(vendor => ({
      id:         genRequestId(),
      userId:     user.id,
      userName:   user.displayName || user.name || "Guest",
      /* Live listings carry the real account id in vendorId/dbId. The card id
         is prefixed ("db_<uuid>"), so strip it as a last-resort fallback —
         otherwise a real vendor is mistaken for a sample listing. */
      vendorId:   vendor.vendorId || vendor.dbId || String(vendor.id).replace(/^db_/, ""),
      vendorName: vendor.name || "Vendor",
      serviceId:   vendor.serviceId || null,
      serviceName: vendor.serviceName || vendor.type || null,
      packageName:  vendor.selectedPackage?.name || null,
      packagePrice: vendor.selectedPackage?.price ?? null,
      addons:       (vendor.selectedAddons || []).map(a => ({ name: a.name, price: Number(a.price) || 0 })),
      instant:      vendor.instant === true,
      eventType:  (eventType === "Other" && otherEventNote.trim())
                    ? `Other — ${otherEventNote.trim()}`
                    : (eventType || "Event"),
      eventDate,
      endDate: endSameDay ? "" : endDate,
      responseDeadlineHours: deadlineChoice,
      guests:     eventGuests,
      venue:      loc.venue,               // venue name
      venueType:  loc.venueType,
      streetAddress: loc.streetAddress,
      addressLine2:  loc.addressLine2,
      city:       loc.city,
      state:      loc.state,
      zip:        loc.zip,
      addressVerified: locVerified,
      /* The hours THIS vendor is needed. No slot set means the whole event, so
         the event window is read here rather than copied when they were added. */
      startTime: vendor.slotStart || startTime,
      endTime:   vendor.slotEnd   || endTime,
      accessInstructions: access,
      message,
      status:     "pending",
      createdAt:  Date.now(),
    }));
    /* Sample listings (ids like "v_tacorush") are not real vendor accounts, so
       nobody can receive those requests. Say so plainly instead of showing a
       false "Request sent!". */
    const demoOnly = requests.filter(r => !UUID_RE.test(String(r.vendorId)));
    const realOnes = requests.filter(r => UUID_RE.test(String(r.vendorId)));
    if (realOnes.length === 0) {
      setSubmitting(false);
      setErr("These are sample listings, not real vendors — no one will receive this request. Search for a verified vendor to send a real booking request.");
      return;
    }
    const results = await Promise.all(requests.map(req => RLS.submitRequest(req, user)));
    /* A result is a real success only when it's not an {ok:false} error object. */
    const ok = i => results[i] === true || (results[i] && results[i].ok !== false);
    const sent = requests.filter((_, i) => ok(i));
    const failed = results.filter(r => r && r.ok === false);
    setSubmitting(false);
    if (sent.length > 0) {
      if (demoOnly.length > 0) {
        setErr(`Sent to ${realOnes.length} vendor(s). ${demoOnly.length} sample listing(s) were skipped — they aren't real vendors.`);
      }
      onSubmitRequests(sent);
    }
    else if (failed.length > 0) {
      /* Show the actual reason the database rejected the request. */
      setErr(`Couldn't save your request: ${failed[0].error}. Nothing was sent. (Details in the browser console.)`);
    }
    else setErr("Failed to send requests. Your session may have expired — sign out and back in, then try again.");
  }

  return (
    <div className="modal-overlay" onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:900,
               display:"flex", alignItems:"flex-start", justifyContent:"flex-end",
               paddingTop:70 }}>
      <div onClick={e => e.stopPropagation()} className="fade-up"
        style={{ background:"#fff", width:400, maxWidth:"100vw",
                 height:"calc(100vh - 70px)", display:"flex", flexDirection:"column",
                 boxShadow:"-8px 0 40px rgba(0,0,0,0.12)", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"18px 20px 14px", borderBottom:`1px solid ${C.border}`,
                      display:"flex", justifyContent:"space-between", alignItems:"center",
                      flexShrink:0 }}>
          <div>
            <p style={{ margin:0, fontFamily:"var(--display)", fontSize:17,
                        fontWeight:800 }}>Your request list</p>
            <p style={{ margin:0, fontSize:11, color:C.midGray }}>
              {cart.length} {cart.length!==1?"vendors":"vendor"} · Est. {fmtTotal(cart)}
            </p>
          </div>
          <button onClick={onClose} className="btn"
            style={{ background:"#F3F4F6", border:"none", borderRadius:"50%",
                     width:30, height:30, fontSize:15, color:C.midGray,
                     display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>

        {/* Vendor list */}
        <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>
          {cart.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:C.lightGray }}>
              <div style={{ fontSize:36, marginBottom:8 }}>🛒</div>
              <p style={{ fontSize:13 }}>Your cart is empty</p>
              <p style={{ fontSize:11, marginTop:4 }}>Browse vendors and add them here.</p>
            </div>
          ) : (
            <>
              {/* Vendor cards */}
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:18 }}>
                {cart.map(v => (
                  <div key={v.id} style={{ display:"flex", gap:10, alignItems:"center",
                                            background:"#F9FAFB", borderRadius:12,
                                            padding:"10px 12px", border:`1px solid ${C.border}` }}>
                    {v.img
                      ? <img src={v.img} alt={v.name} style={{ width:44, height:44, borderRadius:8, objectFit:"cover", flexShrink:0 }} />
                      : <div style={{ width:44, height:44, borderRadius:8, background:"#F3F4F6", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🏪</div>
                    }
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:13, fontWeight:800, color:C.black }}>
                        {(v.name && v.name !== "Vendor") ? v.name : (v.serviceName || "Vendor")}
                      </p>
                      {v.serviceName && (
                        <p style={{ margin:"1px 0 0", fontSize:11.5, fontWeight:700, color:"#6D28D9" }}>
                          🛎️ {v.serviceName}
                        </p>
                      )}
                      <p style={{ margin:"1px 0 0", fontSize:11, color:C.midGray }}>
                        {[catLabelOf(v.cat), v.selectedPackage?.name,
                          v.selectedAddons?.length ? `${v.selectedAddons.length} extra${v.selectedAddons.length !== 1 ? "s" : ""}` : null,
                          cardPrice(v)].filter(Boolean).join(" · ")}
                      </p>
                      {(() => {
                        const id = v.vendorId || v.dbId || String(v.id).replace(/^db_/, "");
                        const a = vendorAvail[id];
                        const off = [...new Set([...(a?.blocked||[]), ...(a?.confirmed||[])])]
                          .filter(d => d >= new Date().toISOString().split("T")[0])
                          .sort();
                        if (!off.length) return null;
                        return (
                          <p style={{ margin:"3px 0 0", fontSize:10, color:"#B45309", lineHeight:1.45 }}>
                            🚫 Unavailable: {off.slice(0,4).join(", ")}
                            {off.length > 4 ? ` +${off.length - 4} more` : ""}
                          </p>
                        );
                      })()}
                      {(() => {
                        /* Working days / hours the vendor set at signup, so the
                           customer can pick a date that actually works. */
                        const { days, blocks } = parseSchedule(v.schedule);
                        if (!days && !blocks) return null;
                        return (
                          <p style={{ margin:"2px 0 0", fontSize:10, color:C.midGray, lineHeight:1.45 }}>
                            🕒 Works: {v.schedule}
                          </p>
                        );
                      })()}
                      <SlotEditor v={v} eventStart={startTime} eventEnd={endTime}
                        sameDay={endSameDay}
                        onChange={patch => onUpdateItem && onUpdateItem(v.id, patch)} />
                    </div>
                    <button onClick={() => onRemove(v.id)} className="btn"
                      style={{ background:"none", border:"none", color:C.lightGray,
                               fontSize:15, padding:"2px 4px" }}>✕</button>
                  </div>
                ))}
              </div>

              {/* Event details form */}
              <div style={{ background:"#FFF7ED", borderRadius:14, padding:"14px 16px",
                            border:`1px solid ${C.orangeBorder}`, marginBottom:14 }}>
                <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:800, color:C.orange }}>
                  📋 Event details — sent to all vendors
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <select value={eventType} onChange={e => setEventType(e.target.value)}
                    style={{ height:40, padding:"0 12px", border:`1px solid ${C.border}`,
                             borderRadius:9, fontSize:13, color: eventType ? C.black : C.lightGray,
                             background:"#fff" }}>
                    <option value="">Event type (optional)</option>
                    {EVENT_PACKAGES.filter(p => p.id !== "custom").map(p => (
                      <option key={p.id} value={p.label}>{p.icon} {p.label}</option>
                    ))}
                    <option value="Other">➕ Other</option>
                  </select>
                  {/* Anything we haven't listed — let them describe it. */}
                  {eventType === "Other" && (
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, color:C.orange, display:"block", marginBottom:4 }}>
                        Tell us about your event <span style={{ color:C.lightGray, fontWeight:500 }}>(what kind of occasion is it?)</span>
                      </label>
                      <textarea value={otherEventNote} onChange={e => setOtherEventNote(e.target.value)}
                        rows={2} placeholder="e.g. Retirement dinner, church anniversary, product launch…"
                        style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px",
                                 border:`1.5px solid ${C.orange}`, borderRadius:9, fontSize:12.5,
                                 resize:"vertical", fontFamily:"'Figtree', system-ui, sans-serif", background:"#fff" }} />
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize:10, fontWeight:700, color:C.midGray, display:"block", marginBottom:6 }}>
                      Event date <span style={{ color:C.orange }}>* required</span>
                      {eventDate && <span style={{ color:C.black, fontWeight:800 }}> · {new Date(eventDate+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</span>}
                    </label>
                    <ClickCalendar value={eventDate} allowDate={allowDate} onChange={(d) => {
                      setEventDate(d);
                      const busy = vendorsUnavailableOn(d, startTime, endTime);
                      setErr(busy.length ? conflictMessage(busy) : "");
                    }} />
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns: placeVendor ? "1fr" : "1fr 1fr", gap:8 }}>
                    <input placeholder="Estimated guests *" value={eventGuests}
                      onChange={e => setEventGuests(e.target.value)}
                      style={{ height:40, padding:"0 12px", border:`1px solid ${C.border}`,
                               borderRadius:9, fontSize:13, background:"#fff" }} />
                    {!placeVendor && (
                    <select value={venueType} onChange={e => setVenueType(e.target.value)}
                      style={{ height:40, padding:"0 10px", border:`1px solid ${C.border}`,
                               borderRadius:9, fontSize:13, color: venueType ? C.black : C.lightGray,
                               background:"#fff" }}>
                      <option value="">Venue type *</option>
                      {VENUE_TYPES.map(t => (
                        <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                      ))}
                    </select>
                    )}
                  </div>

                  {placeVendor ? (
                    /* Booking a venue — location is the venue's own address, locked. */
                    <div style={{ background:"#F0FDF4", border:"1px solid #86EFAC", borderRadius:10,
                                  padding:"11px 13px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#065F46" }}>📍 Event location</span>
                        <span style={{ fontSize:10, color:"#047857" }}>— set by the venue</span>
                      </div>
                      <p style={{ margin:"0 0 2px", fontSize:13, fontWeight:800, color:C.black }}>{placeVendor.name}</p>
                      <p style={{ margin:0, fontSize:12, color:C.midGray }}>
                        {placeAddrLine || "Address on file with the venue"}
                      </p>
                    </div>
                  ) : (
                  <>
                  {/* Structured location — a vendor needs this to show up */}
                  <div style={{ display:"flex", alignItems:"center", gap:6, margin:"2px 0 -2px" }}>
                    <span style={{ fontSize:11, fontWeight:800, color:C.orange }}>📍 Event location</span>
                    <span style={{ fontSize:10, color:C.midGray }}>— where the vendor should go</span>
                  </div>
                  <input placeholder="Venue name (optional) — e.g. The Grand Ballroom" value={eventVenue}
                    onChange={e => setEventVenue(e.target.value)}
                    style={{ height:40, padding:"0 12px", border:`1px solid ${C.border}`,
                             borderRadius:9, fontSize:13, background:"#fff" }} />

                  {/* One search fills the whole address. Once picked, it's shown
                      back as a confirmed card instead of five editable boxes. */}
                  {!addrConfirmed ? (
                    <>
                      <AddressAutocomplete
                        placeholder="🔍 Start typing the event address…"
                        onSelect={(a) => {
                          const st = (a.street || "").trim();
                          const ct = (a.city   || "").trim();
                          const sa = (a.state ? toStateAbbr(a.state) : "").trim();
                          const zp = (a.zip    || "").trim();
                          if (st) setStreet(st);
                          if (ct) setCity(ct);
                          if (sa) setStateAbbr(sa);
                          if (zp) setZip(zp);
                          /* Only vouch for an address that came back COMPLETE.
                             A "verified" hit missing its zip or house number is
                             not something to promise a vendor. */
                          setVerifiedAddr(
                            a.verified && st && ct && sa && zp ? [st, ct, sa, zp].join("|") : null
                          );
                          setAddrConfirmed(true);
                          setManualAddr(false);
                          if (err) setErr("");
                        }} />

                      {!manualAddr ? (
                        <button type="button" onClick={()=>setManualAddr(true)} className="btn"
                          style={{ alignSelf:"flex-start", background:"none", border:"none", padding:"2px 0",
                                   color:C.midGray, fontSize:11.5, textDecoration:"underline", cursor:"pointer" }}>
                          Can't find it? Enter the address manually
                        </button>
                      ) : (
                        <>
                          <input placeholder="Street address" value={street}
                            onChange={e => setStreet(e.target.value)}
                            style={{ height:40, padding:"0 12px", border:`1px solid ${C.border}`,
                                     borderRadius:9, fontSize:13, background:"#fff" }} />
                          <div style={{ display:"grid", gridTemplateColumns:"1.6fr 0.9fr 1fr", gap:8 }}>
                            <input placeholder="City *" value={city}
                              onChange={e => { setCity(e.target.value); if (err) setErr(""); }}
                              style={{ height:40, padding:"0 12px", borderRadius:9, fontSize:13, background:"#fff",
                                       border:`1px solid ${!city.trim() && err ? "#FCA5A5" : C.border}` }} />
                            <input placeholder="State" value={stateAbbr}
                              onChange={e => setStateAbbr(e.target.value.toUpperCase().slice(0,3))}
                              style={{ height:40, padding:"0 10px", border:`1px solid ${C.border}`,
                                       borderRadius:9, fontSize:13, background:"#fff", textTransform:"uppercase" }} />
                            <input placeholder="ZIP" value={zip} inputMode="numeric"
                              onChange={e => setZip(e.target.value)}
                              style={{ height:40, padding:"0 10px", border:`1px solid ${C.border}`,
                                       borderRadius:9, fontSize:13, background:"#fff" }} />
                          </div>
                          <button type="button"
                            onClick={()=>{ if (city.trim()) { setAddrConfirmed(true); if (err) setErr(""); } }}
                            className="btn"
                            style={{ alignSelf:"flex-start", padding:"7px 14px", borderRadius:9,
                                     border:`1px solid ${C.orange}`, background:"#FFF7ED",
                                     color:C.orange, fontSize:12, fontWeight:700 }}>
                            ✓ Use this address
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    /* Confirmed address — editable, so a missing house number or
                       a street-level match can be corrected without starting over. */
                    <div style={{ background:"#F0FDF4", border:"1.5px solid #86EFAC",
                                  borderRadius:11, padding:"11px 13px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:8 }}>
                        <p style={{ margin:0, fontSize:10, fontWeight:800, color:"#166534",
                                    textTransform:"uppercase", letterSpacing:"0.05em" }}>✓ Address confirmed</p>
                        <button type="button" onClick={()=>setAddrConfirmed(false)} className="btn"
                          style={{ flexShrink:0, padding:"5px 11px", borderRadius:8, border:`1px solid ${C.border}`,
                                   background:"#fff", color:C.midGray, fontSize:11.5, fontWeight:700 }}>
                          Search again
                        </button>
                      </div>
                      <input value={street} onChange={e => setStreet(e.target.value)}
                        placeholder="Street address — add the house number if missing"
                        style={{ width:"100%", height:38, padding:"0 11px", boxSizing:"border-box",
                                 border:`1px solid ${!street.trim() ? "#FCA5A5" : C.border}`, borderRadius:8,
                                 fontSize:13, fontWeight:700, background:"#fff", marginBottom:6 }} />
                      <div style={{ display:"grid", gridTemplateColumns:"1.6fr 0.8fr 1fr", gap:6, marginBottom:6 }}>
                        <input value={city} onChange={e => setCity(e.target.value)} placeholder="City"
                          style={{ height:34, padding:"0 10px", border:`1px solid ${C.border}`, borderRadius:8,
                                   fontSize:12.5, background:"#fff", boxSizing:"border-box" }} />
                        <input value={stateAbbr} onChange={e => setStateAbbr(e.target.value.toUpperCase().slice(0,2))}
                          placeholder="ST" maxLength={2}
                          style={{ height:34, padding:"0 9px", border:`1px solid ${C.border}`, borderRadius:8,
                                   fontSize:12.5, background:"#fff", textTransform:"uppercase", boxSizing:"border-box" }} />
                        <input value={zip} onChange={e => setZip(e.target.value)} placeholder="ZIP" inputMode="numeric"
                          style={{ height:34, padding:"0 9px", border:`1px solid ${C.border}`, borderRadius:8,
                                   fontSize:12.5, background:"#fff", boxSizing:"border-box" }} />
                      </div>
                      <input placeholder="Apt / suite / unit / floor (optional)" value={addr2}
                        onChange={e => setAddr2(e.target.value)}
                        style={{ width:"100%", height:34, padding:"0 11px", boxSizing:"border-box",
                                 border:`1px solid ${C.border}`, borderRadius:8, fontSize:12.5, background:"#fff" }} />
                      {!street.trim() && (
                        <p style={{ margin:"6px 0 0", fontSize:10.5, color:"#B91C1C", fontWeight:600 }}>
                          Add the street address so the vendor can find the place.
                        </p>
                      )}
                    </div>
                  )}
                  </>
                  )}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <div>
                      <label style={{ fontSize:10, fontWeight:600, color:C.midGray, display:"block", marginBottom:5 }}>
                        Start time{startTime && <span style={{ color:C.orange, fontWeight:800 }}> · {fmtTime12(startTime)}</span>}
                      </label>
                      <TimeGrid value={startTime} allowTime={allowTime} onChange={(t) => {
                        setStartTime(t);
                        if (endTime && endTime <= t) setEndTime("");
                        const busy = vendorsUnavailableOn(eventDate, t, endTime);
                        setErr(busy.length ? conflictMessage(busy) : "");
                      }} />
                    </div>
                    <div>
                      <label style={{ fontSize:10, fontWeight:600, color:C.midGray, display:"block", marginBottom:5 }}>
                        End time{endTime && <span style={{ color:C.orange, fontWeight:800 }}> · {fmtTime12(endTime)}</span>}
                      </label>
                      {/* No past-time filter on the finish: it is bounded by the
                          start, and on a later date every hour is valid. */}
                      <TimeGrid value={endTime} onChange={setEndTime}
                        after={startTime} sameDay={endSameDay}
                        allowTime={endSameDay ? allowTime : vendorHoursAllow} />
                    </div>
                  </div>

                  {/* Finishes same day, or later. Without this the end grid only
                      ever offered times after the start ON THE SAME DAY, so a
                      party starting at 10pm could finish at 11:30pm at the
                      latest — an event running to 1am was unbookable. */}
                  <div>
                    <label style={{ fontSize:10, fontWeight:600, color:C.midGray, display:"block", marginBottom:5 }}>
                      Finishes
                    </label>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {[[true,"Same day"],[false,"Next day or later"]].map(([same,label]) => {
                        const on = endSameDay === same;
                        return (
                          <button type="button" key={label}
                            onClick={()=>{ setEndDate(same ? "" : nextDayIso(eventDate)); setEndTime(""); }}
                            style={{ padding:"7px 14px", borderRadius:99, fontSize:12, fontWeight:700,
                                     cursor:"pointer", border:`1.5px solid ${on ? C.orange : C.border}`,
                                     background: on ? "#FFF7ED" : "#fff", color: on ? C.orange : C.midGray }}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {!endSameDay && (
                      <div style={{ marginTop:8 }}>
                        <label style={{ fontSize:10, fontWeight:600, color:C.midGray, display:"block", marginBottom:5 }}>
                          End date{endDate && <span style={{ color:C.orange, fontWeight:800 }}> · {new Date(endDate+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span>}
                        </label>
                        <ClickCalendar value={endDate} onChange={setEndDate}
                          allowDate={(iso) => !eventDate || iso >= eventDate} />
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:C.black, display:"block", marginBottom:4 }}>
                      🗺️ How to find & access the place <span style={{ color:C.lightGray, fontWeight:500 }}>(optional but helpful)</span>
                    </label>
                    <textarea
                      placeholder="Directions to find it, how to get in, which entrance/gate, parking or loading dock, who to ask for, gate/callbox codes…"
                      value={access} onChange={e => setAccess(e.target.value)} rows={3}
                      style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px", border:`1px solid ${C.border}`, borderRadius:9,
                               fontSize:12, resize:"vertical", fontFamily:"'Figtree', system-ui, sans-serif", background:"#fff" }} />
                  </div>
                  <textarea placeholder="Message to vendors (optional) — describe your event…"
                    value={message} onChange={e => setMessage(e.target.value)} rows={2}
                    style={{ padding:"9px 12px", border:`1px solid ${C.border}`, borderRadius:9,
                             fontSize:12, resize:"none", fontFamily:"'Figtree', system-ui, sans-serif",
                             background:"#fff" }} />
                </div>
              </div>

              {/* ── How soon do you need an answer? ────────────────────────
                  Only ever tightens the deadline. Options that would land
                  after PLUJ cancels the request anyway are not shown.     */}
              {deadlineOptions.length > 0 && (
                <div style={{ padding:"10px 0", borderTop:`1px solid ${C.border}`, marginBottom:4 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:C.black, display:"block", marginBottom:6 }}>
                    ⏱️ How soon do you need an answer?
                  </label>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }} role="radiogroup"
                       aria-label="How soon do you need an answer?">
                    {deadlineOptions.map(o => {
                      const on = o.hours === deadlineChoice;
                      return (
                        <button key={o.hours} type="button" role="radio" aria-checked={on}
                          onClick={() => setDeadlineHours(o.hours)}
                          style={{ flex:"1 1 28%", padding:"8px 10px", borderRadius:10, cursor:"pointer",
                                   border:`1.5px solid ${on ? C.orange : C.border}`,
                                   background: on ? "#FFF7ED" : "#fff",
                                   color: on ? C.black : C.midGray,
                                   fontSize:11, fontWeight: on ? 800 : 600, textAlign:"center",
                                   fontFamily:"'Figtree', system-ui, sans-serif", transition:"all .15s" }}>
                          {o.label}
                          {o.tag && (
                            <span style={{ display:"block", fontSize:9, fontWeight:600, marginTop:1,
                                           color: on ? C.orange : C.lightGray }}>{o.tag}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize:10, color:C.lightGray, marginTop:6, lineHeight:1.5 }}>
                    If nobody replies by then, the request closes and you can book someone else.
                  </p>
                </div>
              )}

              {err && <p style={{ fontSize:12, color:"#EF4444", fontWeight:600, marginBottom:8 }}>{err}</p>}

              {/* Total */}
              <div style={{ padding:"10px 0", borderTop:`1px solid ${C.border}`, marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:13, color:C.midGray, fontWeight:600 }}>Estimated total</span>
                  <span style={{ fontFamily:"var(--display)", fontSize:20, fontWeight:800, color:C.black }}>
                    {fmtTotal(cart)}
                  </span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:11, color:C.midGray, fontWeight:600 }}>Budget:</span>
                  <input type="number" placeholder="Set budget (optional)" value={budget||""}
                    onChange={e=>{ const v=parseInt(e.target.value); onSetBudget?.(isNaN(v)?0:Math.max(0,v)); }}
                    style={{ flex:1, height:30, padding:"0 10px", border:`1px solid ${C.border}`,
                             borderRadius:8, fontSize:12, color:C.black, background:"#fff" }} />
                </div>
                {budget > 0 && (()=>{
                  const spent = allIn(cart.reduce((a,v)=>a+(v.pv||0),0));
                  const pct = budgetPct(spent, budget);
                  const col = budgetColor(pct);
                  return (
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                        <span style={{ fontSize:10, color:C.midGray }}>${spent.toLocaleString()} / ${budget.toLocaleString()}</span>
                        <span style={{ fontSize:10, fontWeight:800, color:col }}>{pct}%</span>
                      </div>
                      <div style={{ height:5, background:C.border, borderRadius:99, overflow:"hidden" }}>
                        <div style={{ width:`${pct}%`, height:"100%", background:col, borderRadius:99,
                                      transition:"width 0.5s cubic-bezier(0.34,1.56,0.64,1)" }} />
                      </div>
                      {pct >= 100 && <p style={{ fontSize:10, color:"#EF4444", fontWeight:700, marginTop:3 }}>⚠️ Over budget by ${(spent-budget).toLocaleString()}</p>}
                    </div>
                  );
                })()}
              </div>

              {/* The event day, in order: when each pro usually arrives for an
                  event that starts at this time. A suggestion to agree with
                  each pro in Messages, not a promise. */}
              {startTime && cart.length > 0 && (() => {
                const SETUP_MIN = { places:60, rentals:180, production:180, av:120, food:90, music:60, photo:30,
                                    staff:60, beauty:180, transport:30, kids:30, logistics:240, other:60 };
                const [h, m] = String(startTime).split(":").map(Number);
                if (!Number.isFinite(h)) return null;
                const start = h * 60 + (m || 0);
                const fmt = (mins) => { const t = ((mins % 1440) + 1440) % 1440;
                  return fmtTime12(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`); };
                const rows = cart.map(v => ({ v, at: start - (SETUP_MIN[v.cat] ?? 60) }))
                  .sort((a, b) => a.at - b.at);
                return (
                  <div style={{ border:"1.5px solid #000", borderRadius:10, padding:"10px 12px", margin:"0 0 12px" }}>
                    <p style={{ margin:"0 0 6px", fontSize:13, fontWeight:800, color:"#000" }}>Your event day</p>
                    {rows.map(({ v, at }) => (
                      <div key={v.id} style={{ display:"grid", gridTemplateColumns:"72px 1fr", gap:8, fontSize:12.5, padding:"3px 0" }}>
                        <span style={{ fontWeight:800 }}>{fmt(at)}</span>
                        <span><span data-no-translate>{(v.name && v.name !== "Vendor") ? v.name : (v.serviceName || "Vendor")}</span> arrives to set up</span>
                      </div>
                    ))}
                    <div style={{ display:"grid", gridTemplateColumns:"72px 1fr", gap:8, fontSize:12.5, padding:"3px 0" }}>
                      <span style={{ fontWeight:800 }}>{fmt(start)}</span><span style={{ fontWeight:700 }}>Your event starts</span>
                    </div>
                    <p style={{ margin:"6px 0 0", fontSize:11.5, color:"#4B5260", lineHeight:1.5 }}>
                      Usual arrival times. Agree the exact time with each pro in Messages.
                    </p>
                  </div>
                );
              })()}

              {(() => {
                const conflicts = vendorsUnavailableOn(eventDate, startTime, endTime);
                const blocked   = !!user && (!eventDate || conflicts.length > 0);
                const disabled  = submitting || blocked;
                return (
                  <button onClick={handleSubmit} disabled={disabled} className="btn"
                    style={{ width:"100%", padding:"14px 0", borderRadius:13, border:"none",
                             background: disabled ? "#F3F4F6" : C.orange,
                             color: disabled ? C.midGray : "#fff",
                             fontSize:14, fontWeight:800,
                             cursor: disabled ? "not-allowed" : "pointer",
                             boxShadow: disabled ? "none" : C.shadowButton }}>
                    {submitting ? "Sending requests…"
                      : !user ? "Sign in to send requests →"
                      : !eventDate ? "Choose an event date to continue"
                      : conflicts.length ? "Vendor unavailable — change date or time"
                      : `Send ${cart.length} booking request${cart.length>1?"s":""}  →`}
                  </button>
                );
              })()}
              <p style={{ fontSize:10, color:C.lightGray, textAlign:"center",
                          marginTop:8, lineHeight:1.6 }}>
                Requests go to each vendor individually. No payment is collected until
                a vendor confirms your booking.
                {paymentsOn() && " When a vendor confirms, you pay in full to secure the date. It stays locked and is released to the vendor in parts, the last part only when you approve it after the event (or 3 days after)."}
              </p>
              {/* Host due diligence, as in the Terms ("Hosts: check vendors before
                  you book") and the box ticked at sign-up. */}
              <p style={{ fontSize:10, color:C.midGray, textAlign:"center",
                          margin:"4px 0 0", lineHeight:1.6 }}>
                Before you book or pay, read each vendor's reviews and confirm the price and terms
                with them in writing. PLUJ reviews vendors but can't guarantee them.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


/* ─── MARKET SELECTOR ─────────────────────────────────────────────────────────── */
function MarketSelector({ market, onSelect, light }) {
  const [open, setOpen] = useState(false);
  const active = MARKETS.filter(m => m.active);
  const soon   = MARKETS.filter(m => !m.active);

  return (
    <div style={{ position:"relative" }}>
      <button onClick={() => setOpen(o=>!o)} className="btn market-pill"
        style={{ background: light ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.05)",
                 border: `1px solid ${light ? "rgba(255,255,255,0.3)" : C.border}`,
                 color: light ? "#fff" : C.black, fontSize:12, fontWeight:700 }}>
        <span>📍</span>
        <span>{market.label}</span>
        <span style={{ fontSize:9, opacity:0.7 }}>▾</span>
      </button>

      {open && (
        <>
          <div style={{ position:"fixed", inset:0, zIndex:999 }} onClick={() => setOpen(false)} />
          <div style={{ position:"absolute", top:"calc(100% + 8px)", left:0, zIndex:1000,
                        background:"#fff", borderRadius:16, minWidth:260,
                        boxShadow:C.shadowModal, border:`1px solid ${C.border}`,
                        overflow:"hidden" }}>
            <div style={{ padding:"12px 14px 8px" }}>
              <p style={{ margin:"0 0 8px", fontSize:11, fontWeight:800, color:C.midGray,
                          textTransform:"uppercase", letterSpacing:"0.08em" }}>Active markets</p>
              {active.map(m => (
                <button key={m.id} onClick={() => { onSelect(m); setOpen(false); }} className="btn"
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"9px 10px",
                           borderRadius:10, background: m.id===market.id ? C.orangeSoft : "transparent",
                           border:"none", textAlign:"left" }}>
                  <span style={{ fontSize:18 }}>{COUNTRIES[m.country]?.flag}</span>
                  <div>
                    <p style={{ margin:0, fontSize:13, fontWeight:700,
                                color: m.id===market.id ? C.orange : C.black }}>{m.label}</p>
                    <p style={{ margin:0, fontSize:10, color:C.lightGray }}>
                      {m.stats?.vendors || 0}+ vendors
                    </p>
                  </div>
                  {m.id===market.id && <span style={{ marginLeft:"auto", fontSize:12, color:C.orange }}>✓</span>}
                </button>
              ))}
            </div>
            <div style={{ padding:"8px 14px 12px", borderTop:`1px solid ${C.border}`,
                          background:C.bgAlt }}>
              <p style={{ margin:"0 0 6px", fontSize:11, fontWeight:800, color:C.midGray,
                          textTransform:"uppercase", letterSpacing:"0.08em" }}>Coming soon</p>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                {soon.slice(0,6).map(m => (
                  <span key={m.id} style={{ fontSize:11, padding:"3px 10px", borderRadius:99,
                                             background:"#fff", border:`1px solid ${C.border}`,
                                             color:C.lightGray, fontWeight:600 }}>
                    {COUNTRIES[m.country]?.flag} {m.city}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── FILTERS BAR ──────────────────────────────────────────────────────────────── */
function FiltersBar({ filters, onChange, totalCount }) {
  const [open, setOpen] = useState(false);

  const Pill = ({ id, label, active }) => (
    <button onClick={() => onChange(id, !active)} className={`filter-pill${active?" active":""} btn`}>
      {label}
    </button>
  );

  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:16 }}>
      <Pill id="instant"  label="⚡ Instant booking" active={filters.instant} />
      <Pill id="spanish"  label="Habla español"      active={filters.spanish} />
      <Pill id="insured"  label="Insurance checked"  active={filters.insured} />
      <Pill id="featured" label="✦ Top rated"        active={filters.featured} />

      {/* Price range */}
      <div style={{ position:"relative" }}>
        <button onClick={() => setOpen(o=>!o)}
          className={`filter-pill btn${(filters.maxPrice < 5000) ? " active":""}`}>
          💰 Budget: {filters.maxPrice >= 5000 ? "Any" : `under $${filters.maxPrice.toLocaleString()}`}
        </button>
        {open && (
          <>
            <div style={{ position:"fixed", inset:0, zIndex:99 }} onClick={() => setOpen(false)} />
            <div style={{ position:"absolute", top:"calc(100% + 6px)", left:0, zIndex:100,
                          background:"#fff", borderRadius:14, padding:"16px 18px", width:240,
                          boxShadow:C.shadowLg, border:`1px solid ${C.border}` }}>
              <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:700 }}>Max price per vendor</p>
              {[500, 1000, 2000, 5000].map(val => (
                <button key={val} onClick={() => { onChange("maxPrice", val); setOpen(false); }}
                  className="btn"
                  style={{ display:"block", width:"100%", padding:"7px 12px", borderRadius:9,
                           marginBottom:5, textAlign:"left", fontSize:12, fontWeight:600,
                           background: filters.maxPrice===val ? C.orangeSoft : "#F9FAFB",
                           border:`1px solid ${filters.maxPrice===val ? C.orange : C.border}`,
                           color: filters.maxPrice===val ? C.orange : C.black }}>
                  Under ${val.toLocaleString()}
                </button>
              ))}
              <button onClick={() => { onChange("maxPrice", 99999); setOpen(false); }}
                className="btn"
                style={{ display:"block", width:"100%", padding:"7px 12px", borderRadius:9,
                         textAlign:"left", fontSize:12, fontWeight:600,
                         background: filters.maxPrice===99999 ? C.orangeSoft : "#F9FAFB",
                         border:`1px solid ${filters.maxPrice===99999 ? C.orange : C.border}`,
                         color: filters.maxPrice===99999 ? C.orange : C.black }}>
                Any price
              </button>
            </div>
          </>
        )}
      </div>

      {/* Min rating */}
      <Pill id="topRated" label="★ 4.8+" active={filters.topRated} />

      {/* Travel radius */}
      <Pill id="nearMe"   label="📍 Within 25 mi" active={filters.nearMe} />

      {/* Results count */}
      <span style={{ fontSize:11, color:C.lightGray, marginLeft:"auto", fontWeight:600,
                     whiteSpace:"nowrap" }}>
        {totalCount} {totalCount!==1?"vendors":"vendor"}
      </span>
    </div>
  );
}

/* ─── RECOMMENDATION STRIP ────────────────────────────────────────────────────── */
function RecommendationStrip({ recs, onAdd, onView, cart }) {
  /* "Your event still needs a photographer. Here are three we know." Curated,
     not crowded: at most three picks, from the parts of the event not in the
     cart yet. */
  if (!recs || recs.length === 0) return null;
  const picks = recs.slice(0, 3);
  return (
    <section aria-label="Three we know" style={{ border:"2px solid #000", borderRadius:6, padding:"16px 18px", marginBottom:20 }}>
      <p style={{ margin:"0 0 2px", fontSize:16, fontWeight:800, color:"#000" }}>
        {picks[0]._needs ? `Your checklist still needs ${subInfo(picks[0]._needs).label}.` : "Your event still needs these"}
      </p>
      <p style={{ margin:"0 0 12px", fontSize:14, color:"#4B5260" }}>Here are three we know.</p>
      <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4 }}>
        {picks.map(v => {
          const added = !!cart.find(c => c.id === v.id);
          return (
            <div key={v.id} style={{ flexShrink:0, background:"#fff", borderRadius:6, padding:"10px 12px", width:210, border:"1px solid #DADADA" }}>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
                <img src={v.img} alt="" style={{ width:40, height:40, borderRadius:4, objectFit:"cover", flexShrink:0 }} />
                <div style={{ minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:800, lineHeight:1.25 }}>{v.name}</p>
                  <p style={{ margin:"2px 0 0", fontSize:12.5, color:"#4B5260" }}>{cardPrice(v)}</p>
                </div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={() => onView(v)} className="btn"
                  style={{ flex:1, minHeight:36, borderRadius:999, background:"#fff", border:"1.5px solid #000", fontSize:12.5, fontWeight:700, color:"#000" }}>
                  View
                </button>
                <button onClick={() => !added && onAdd(v)} className="btn" disabled={added}
                  style={{ flex:1, minHeight:36, borderRadius:999, background: added ? "#F2F2F2" : "#000",
                           border:"none", fontSize:12.5, fontWeight:800, color: added ? "#4B5260" : "#fff" }}>
                  {added ? "✓ In cart" : "Add"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─── EVENT RECAPS ───────────────────────────────────────────────────────────
   A past event a pro posted, crediting the other PLUJ pros who worked it
   (sql/2026-10-08-event-recaps.sql). Each one links to every credited pro, so
   a good event sends hosts to all of them. Shown on the home page, on each
   credited pro's profile, and at /event/<id>. */
export async function fetchRecaps({ vendorId = null, id = null, limit = 12 } = {}) {
  if (IS_PREVIEW) return [];
  let q = sb.from("event_recaps").select("*").order("created_at", { ascending: false }).limit(limit);
  if (id) { if (!UUID_RE.test(id)) return []; q = q.eq("id", id); }
  else if (vendorId) {
    if (!UUID_RE.test(vendorId)) return [];
    q = q.filter(`or=(vendor_id.eq.${vendorId},credited.cs.%7B${vendorId}%7D)`).eq("status", "published");
  } else q = q.eq("status", "published");
  const { data, error } = await q.get();
  if (error) { console.warn("[PLUJ] recaps:", error); return []; }
  return (data || []).map(r => ({ ...r, photos: parsePhotos(r.photos) }));
}
/* Business names for a set of vendor ids (public view only). */
export async function vendorNames(ids) {
  const list = [...new Set((ids || []).filter(x => UUID_RE.test(String(x))))];
  if (IS_PREVIEW || !list.length) return {};
  const { data } = await sb.from("vendor_public").select("id,business_name,biz_legal,category").in("id", list).get();
  const out = {};
  (data || []).forEach(v => { out[v.id] = { name: v.business_name || v.biz_legal || "PLUJ pro", cat: v.category }; });
  return out;
}
export async function searchVendorsByName(text) {
  const t = String(text || "").replace(/[*,()%]/g, " ").trim();
  if (IS_PREVIEW || t.length < 2) return [];
  const { data } = await sb.from("vendor_public").select("id,business_name,category")
    .filter(`business_name=ilike.*${encodeURIComponent(t)}*`).limit(8).get();
  return data || [];
}
export async function saveRecap(row, id = null) {
  if (IS_PREVIEW) return { ok: true };
  const res = id ? await sb.from("event_recaps").eq("id", id).update(row) : await sb.from("event_recaps").insert(row);
  if (res.error) return { ok: false, error: res.error.message || "Couldn't save the event." };
  return { ok: true };
}
export async function deleteRecap(id) {
  if (IS_PREVIEW) return { ok: true };
  const res = await sb.from("event_recaps").eq("id", id).delete();
  return res.error ? { ok: false, error: res.error.message || "Couldn't delete it." } : { ok: true };
}
function recapMeta(r) {
  const occ = EVENT_TYPES.find(t => t.id === r.occasion);
  const when = r.event_date ? new Date(r.event_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";
  return [occ ? occ.label : null, r.city || null, when || null].filter(Boolean).join(" · ");
}
export function RecapCards({ recaps, names, onOpen }) {
  if (!recaps || !recaps.length) return null;
  return (
    <div className="recaps">
      {recaps.map(r => (
        <button key={r.id} className="recap-card" onClick={() => onOpen(r)}>
          <span className="recap-img"><img src={r.photos[0] || LISTING_PLACEHOLDER} alt="" loading="lazy" /></span>
          <span className="recap-title" data-no-translate>{r.title}</span>
          <span className="recap-meta">{recapMeta(r)}</span>
          <span className="recap-by">
            {`${1 + (r.credited || []).length} pro${(r.credited || []).length ? "s" : ""} · by `}
            <span data-no-translate>{names[r.vendor_id]?.name || "a PLUJ pro"}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
export function RecapModal({ recap, names, onClose, onViewVendor }) {
  const [photo, setPhoto] = useState(0);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!recap) return null;
  const pros = [recap.vendor_id, ...(recap.credited || [])];
  const link = `${SITE_ORIGIN}/event/${recap.id}`;
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={recap.title}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1400, display:"flex",
               alignItems:"center", justifyContent:"center", padding:12 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:"#fff", borderRadius:8, width:"100%", maxWidth:960, maxHeight:"94vh", overflowY:"auto" }}>
        <div style={{ position:"relative", background:"#000" }}>
          <img src={recap.photos[photo] || LISTING_PLACEHOLDER} alt=""
            style={{ width:"100%", maxHeight:"58vh", objectFit:"contain", display:"block" }} />
          <button onClick={onClose} className="btn" aria-label="Close"
            style={{ position:"absolute", top:12, right:12, width:40, height:40, borderRadius:99, background:"#fff", color:"#000", fontSize:16 }}>✕</button>
        </div>
        {recap.photos.length > 1 && (
          <div style={{ display:"flex", gap:6, padding:"8px 12px", overflowX:"auto" }}>
            {recap.photos.map((p, i) => (
              <button key={p} onClick={() => setPhoto(i)} className="btn" aria-label={`Photo ${i + 1}`}
                style={{ padding:0, borderRadius:4, outline: i === photo ? "2px solid #000" : "none", flexShrink:0 }}>
                <img src={p} alt="" style={{ width:64, height:48, objectFit:"cover", display:"block", borderRadius:4 }} />
              </button>
            ))}
          </div>
        )}
        <div style={{ padding:"18px 22px 24px" }}>
          <h2 data-no-translate style={{ margin:"0 0 4px", fontSize:"clamp(30px,4vw,48px)", lineHeight:0.95 }}>{recap.title}</h2>
          <p style={{ margin:"0 0 14px", fontSize:14, color:"#4B5260" }}>{recapMeta(recap)}</p>
          {recap.story && <p data-no-translate style={{ margin:"0 0 18px", fontSize:15.5, lineHeight:1.65, color:"#222", maxWidth:"65ch", whiteSpace:"pre-wrap" }}>{recap.story}</p>}
          <h3 style={{ margin:"0 0 8px", fontSize:16, fontWeight:800 }}>The pros on this event</h3>
          <div className="pills sm" style={{ marginBottom:16 }}>
            {pros.map(id => (
              <button key={id} onClick={() => onViewVendor && onViewVendor(id)} data-no-translate>
                {names[id]?.name || "PLUJ pro"}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => { try { navigator.clipboard.writeText(link); } catch { /* no clipboard */ } }}
            style={{ background:"#000", color:"#fff", borderRadius:999, padding:"10px 18px", fontSize:13, fontWeight:800 }}>
            Copy link to this event
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── HOMEPAGE SECTIONS (hero supplement) ────────────────────────────────────── */
function HowItWorks() {
  /* Three steps because there are three: choose, book, enjoy. Numbered
     because the order is the point. */
  const steps = [
    ["Choose your vendors", "Filter by date, place and guest count. Every listing shows its price, what's included and the days it works."],
    ["Book in one go", "Put the whole event in one cart. Instant-booking vendors confirm on the spot; the rest reply by your deadline."],
    ["Enjoy the day", "Message your pros in one place, in English or Spanish. If anything goes wrong, real people at PLUJ help."],
  ];
  return (
    <section style={{ padding:"40px 0 56px" }}>
      <h2 style={{ fontSize:"clamp(26px,3vw,38px)", fontWeight:600, margin:"0 0 26px" }}>
        From idea to booked in minutes
      </h2>
      <div className="steps3">
        {steps.map(([t, d], i) => (
          <div key={t}>
            <span className="n">{i + 1}</span>
            <div className="bar" />
            <h3 style={{ fontSize:20, fontWeight:600, margin:"0 0 6px" }}>{t}</h3>
            <p style={{ fontSize:14.5, color:C.midGray, lineHeight:1.6, margin:0, maxWidth:"30em" }}>{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatsTicker({ market }) {
  const items = [
    `✦ Every vendor application reviewed before listings go live`,
    `⚡ Request several vendors in one go`,
    `📍 Serving ${market?.label || "Houston, TX"} & surrounding areas`,
    `💬 Message vendors directly before you book`,
    `🆓 Free to browse and send requests`,
    `🌍 Expanding to Dallas, Austin, Miami & beyond`,
    `📅 Change or cancel up to 48 hours before your event`,
    `💼 Weddings · Birthdays · Corporate · Concerts · Quinceañeras`,
  ];
  const doubled = [...items, ...items];
  return (
    <div style={{ background:C.black, color:"rgba(255,255,255,0.7)", fontSize:11,
                  fontWeight:600, padding:"10px 0", overflow:"hidden", whiteSpace:"nowrap",
                  borderTop:"1px solid rgba(255,255,255,0.1)" }}>
      <div className="ticker-track" style={{ display:"inline-flex", gap:0 }}>
        {doubled.map((item, i) => (
          <span key={i} style={{ padding:"0 24px", borderRight:"1px solid rgba(255,255,255,0.15)" }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}


/* ─── SAVED VENDORS PANEL (favorites tab — proper component, no IIFE) ───────── */
function SavedVendorsPanel({ userId, allCards }) {
  const [favs, setFavs] = useState([]);
  useEffect(() => {
    getFavorites(userId).then(ids =>
      setFavs((allCards || []).filter(v => ids.includes(v.id)))
    );
  }, [userId, allCards]);

  if (favs.length === 0) return (
    <div style={{ textAlign:"center", padding:"28px 0", color:C.lightGray }}>
      <div style={{ fontSize:36, marginBottom:8 }}>🤍</div>
      <p style={{ fontSize:13, fontWeight:600 }}>No saved vendors yet</p>
      <p style={{ fontSize:11, marginTop:4, lineHeight:1.6 }}>
        Tap the ❤️ on any vendor card to save vendors for later.
      </p>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      <p style={{ margin:"0 0 8px", fontSize:11, color:C.midGray, fontWeight:600 }}>
        {favs.length} saved {favs.length !== 1?"vendors":"vendor"}
      </p>
      {favs.map(v => (
        <div key={v.id} style={{ display:"flex", gap:10, alignItems:"center",
                                  background:"#F9FAFB", borderRadius:12, padding:"10px 12px",
                                  border:`1px solid ${C.border}` }}>
          <img src={v.img} alt={v.name}
            style={{ width:44, height:44, borderRadius:8, objectFit:"cover", flexShrink:0 }} />
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:13, fontWeight:700,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {v.name}
            </p>
            <p style={{ margin:"1px 0 0", fontSize:11, color:C.midGray }}>
              {v.type} · {cardPrice(v)}
            </p>
          </div>
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <p style={{ margin:0, fontSize:11, fontWeight:800, color:"#F59E0B" }}>
              ⭐ {v.rating}
            </p>
            <p style={{ margin:"2px 0 0", fontSize:9, color:C.lightGray }}>
              {v.revCount}+ reviews
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── SECURITY CONFIG PANEL (admin security tab — extracted from IIFE) ──────── */
/* SecurityConfigPanel moved to src/dashboards/AdminPanel.jsx (23 Sep 2026) - loaded on demand. */
/* AdminAccounts moved to src/dashboards/AdminPanel.jsx (23 Sep 2026) - loaded on demand. */
/* AdminPanel moved to src/dashboards/AdminPanel.jsx (23 Sep 2026) - loaded on demand. */
function VendorProfile({ vendor, user, reviews, onBack, onAddReview, onVendorReply, onAddToCart, inCart, onRequireAuth, isFav, onToggleFav, onOpenVendorId }) {
  if (!vendor) { if (onBack) onBack(); return null; }

  /* Always resolve to the clean vendor-account UUID. Some code paths carry a
     prefixed card id ("svc_<uuid>" / "db_<uuid>"); strip it so the profile,
     services, and reviews all query the right account. */
  const rawId = vendor.vendorId || vendor.dbId || vendor.id;
  const vendorId = String(rawId || "").replace(/^svc_/, "").replace(/^db_/, "");
  const [activePhoto, setActivePhoto] = useState(0);

  /* Load the FULL vendor profile + ALL their active services, so this page
     shows everything the vendor entered — name, photos, description, and every
     offering — not just the single card the customer clicked. Falls back to the
     card's own fields while loading or if the fetch is unavailable. */
  const [full,     setFull]     = useState(null);
  const [services, setServices] = useState([]);
  const [selId,    setSelId]    = useState(vendor.serviceId || null);
  const [loadingV, setLoadingV] = useState(!!vendorId && !IS_PREVIEW);
  /* Past events this pro posted or was credited on. */
  const [pastEvents, setPastEvents] = useState([]);
  const [pastNames,  setPastNames]  = useState({});
  const [openPast,   setOpenPast]   = useState(null);
  useEffect(() => {
    let off = false;
    fetchRecaps({ vendorId, limit: 6 }).then(async rs => {
      if (off) return;
      setPastEvents(rs);
      const n = await vendorNames(rs.flatMap(r => [r.vendor_id, ...(r.credited || [])]));
      if (!off) setPastNames(n);
    });
    return () => { off = true; };
  }, [vendorId]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoadingV(!!vendorId && !IS_PREVIEW);
      const [prof, svcs] = await Promise.all([
        getVendorProfileById(vendorId).catch(() => null),
        getPublicServices(vendorId).catch(() => []),
      ]);
      if (cancel) return;
      console.log(`[PLUJ] VendorProfile load: rawId=${rawId} → vendorId=${vendorId} cardName="${vendor.name || ""}" cardService="${vendor.serviceName || ""}" | profile=${prof ? "OK" : "none"} services=${(svcs||[]).length}`);
      setFull(prof);
      const list = Array.isArray(svcs) ? svcs : [];
      setServices(list);
      setSelId(prev => prev || vendor.serviceId || (list[0] && list[0].id) || null);
      setLoadingV(false);
    })();
    return () => { cancel = true; };
  }, [vendorId]);

  /* The offering currently being viewed (defaults to the clicked one / first). */
  const selService = services.find(s => s.id === selId) || null;

  /* Merged display fields: prefer freshly-loaded data, fall back to the card. */
  const disp = {
    name:        full?.business_name || full?.biz_legal || vendor.name || "Vendor",
    type:        selService ? serviceLabel(selService) : (vendor.type || ""),
    city:        [full?.biz_city, full?.biz_state].filter(Boolean).join(", ") || vendor.city || "",
    bizCity:     full?.biz_city || vendor.bizCity || "",
    bizState:    full?.biz_state || vendor.bizState || "",
    blurb:       selService?.description || full?.description || vendor.blurb || "This vendor hasn't added a description yet.",
    capacity:    selService?.capacity || full?.capacity || vendor.capacity || "",
    travelMiles: (selService && selService.travel_miles != null ? selService.travel_miles : (full?.travel_miles ?? vendor.travelMiles)) ?? 0,
    yearsInBiz:  full?.years_in_biz ?? vendor.yearsInBiz ?? 0,
    serviceAreas:selService?.service_areas || full?.service_areas || vendor.serviceAreas || "",
    cat:         selService?.category || vendor.cat,
    revCount:    vendor.revCount || 0,
    rating:      vendor.rating || 0,
    feat:        vendor.feat, instant: selService ? selService.instant_book === true : vendor.instant,
  };

  /* Gallery: ONLY the photos the vendor uploaded for THIS listing. Mixing in
     business photos or other listings' photos made people think they'd opened
     the wrong thing. Falls back to the business photos only when this listing
     has none of its own, so the page is never empty. */
  const galleryPhotos = (() => {
    const own = selService ? parsePhotos(selService.photos) : [];
    if (own.length) return [...new Set(own)];
    /* No photos on this listing yet — fall back so the page still looks right. */
    const fallback = [
      ...parsePhotos(full?.photos),
      ...(vendor.photos || []),
      vendor.img,
    ].filter(Boolean);
    return [...new Set(fallback)];
  })();
  const photos = galleryPhotos.length ? galleryPhotos : [LISTING_PLACEHOLDER];

  /* Pricing for the selected offering. */
  const vendorPkgs = visiblePackages(selService ? selService.packages : vendor.packages);
  const [pickedPkg, setPickedPkg] = useState(vendor.selectedPackage || null);
  useEffect(() => {
    setPickedPkg(vendorPkgs.length ? vendorPkgs.reduce((a, b) => b.price < a.price ? b : a) : null);
    setActivePhoto(0);
  }, [selId, services.length]);

  const basePrice = selService && selService.price_value != null ? Number(selService.price_value)
                  : (vendor.pv || null);
  /* Extras the host ticks are part of the one price: the total on screen, in
     the cart and on the request is the option plus every extra picked. */
  const listingAddons = selService ? parseAddons(selService.addons) : [];
  const [pickedAddons, setPickedAddons] = useState(vendor.selectedAddons || []);
  useEffect(() => { setPickedAddons([]); }, [selId]);
  const addonsTotal = pickedAddons.reduce((n, a) => n + (Number(a.price) || 0), 0);
  const optionPrice = pickedPkg ? Number(pickedPkg.price) : (basePrice || 0);
  const priceLabel = (pickedPkg || basePrice)
                   ? fmtAllIn(optionPrice + addonsTotal)
                   : (vendor.price || "Contact for pricing");

  /* The parent knows only whether the listing that opened this page is in
     the cart; another listing picked on the page isn't, yet. */
  const inCartHere = inCart && (!selService || !vendor.serviceId || selService.id === vendor.serviceId);

  /* Build the cart item for the currently-selected offering. */
  function offeringForCart() {
    const svcLabel = selService ? serviceLabel(selService) : (vendor.serviceName || vendor.type || "");
    /* Prefer real, non-placeholder values from the loaded profile, then the card
       that opened this page, so the request always carries the vendor + service
       even if the live fetch was sparse. */
    const bizName = (full?.business_name || full?.biz_legal)
                  || (vendor.name && vendor.name !== "Vendor" && vendor.name !== "New vendor" ? vendor.name : "")
                  || disp.name;
    /* The page can be switched to another of the vendor's listings, so the
       cart item is built from the listing on screen (its days, hours, limits
       and options), not from the card that opened the page. */
    const base = (selService && full && selService.id !== vendor.serviceId)
      ? { ...vendor, ...dbServiceToCard(selService, { ...full, id: vendorId }) }
      : vendor;
    return {
      ...base,
      vendorId:    vendorId,                       // clean account id (prefix-stripped)
      dbId:        vendorId,
      name:        bizName || "Vendor",
      serviceId:   selService ? selService.id : (vendor.serviceId || null),
      serviceName: svcLabel || null,
      cat:         (selService?.category) || vendor.cat || disp.cat,
      img:         (photos && photos[0]) || vendor.img,
      selectedPackage: pickedPkg,
      selectedAddons:  pickedAddons,
      pv:          optionPrice + addonsTotal,
      price:       priceLabel,
    };
  }

  /* Persisted, booking-gated reviews about THIS vendor (public read). Demo
     catalog vendors (numeric ids) fall back to the seeded in-memory reviews. */
  const seedRevs = reviews[vendor.id] || [];
  const [dbRevs,   setDbRevs]   = useState([]);
  const [canRev,   setCanRev]   = useState(false);   // customer has a confirmed booking here
  const [mine,     setMine]     = useState(null);     // this customer's existing review
  const [revErr,   setRevErr]   = useState("");
  const isLiveVendor = isRealId(vendorId);

  async function loadReviews() {
    if (!isLiveVendor) { setDbRevs([]); return; }
    setDbRevs(await getReviewsAbout(vendorId));
  }
  useEffect(() => { loadReviews(); }, [vendorId]);
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!isLiveVendor || !user || user.type === "guest") { setCanRev(false); setMine(null); return; }
      /* A customer may review this vendor only after a confirmed booking. */
      const allowed = await canReviewSubject(user.id, vendorId, "user_to_vendor");
      const existing = allowed ? await existingReview(user.id, vendorId, "user_to_vendor") : null;
      if (!cancel) { setCanRev(allowed); setMine(existing); }
    })();
    return () => { cancel = true; };
  }, [vendorId, user]);

  /* Use persisted reviews for live vendors, seeded ones for the demo catalog. */
  const vRevs = isLiveVendor
    ? dbRevs.map(r => ({ id: r.id, uid: r.authorId, uname: r.authorName || "Verified customer",
                          rating: r.rating, text: r.body, date: new Date(r.createdAt).toLocaleDateString(), reply: r.reply, dims: r.dims }))
    : seedRevs;

  const REVIEW_DIMS = [
    ["responsiveness", "Responsiveness"],
    ["quality",        "Quality of service"],
    ["punctuality",    "Punctuality"],
    ["recommend",      "Likely to recommend"],
    ["rebook",         "Likely to rebook"],
  ];
  /* Average score for each performance dimension across this vendor's reviews. */
  const dimAverages = REVIEW_DIMS.map(([k, label]) => {
    const vals = vRevs.map(r => r.dims && r.dims[k]).filter(v => v != null && !isNaN(v));
    return { key: k, label, avg: vals.length ? (vals.reduce((a,b)=>a+Number(b),0)/vals.length) : null };
  });

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [dimRatings,     setDimRatings]     = useState({ responsiveness:5, quality:5, punctuality:5, recommend:5, rebook:5 });
  const newRating = Math.round(REVIEW_DIMS.reduce((a,[k]) => a + (dimRatings[k]||0), 0) / REVIEW_DIMS.length);
  const [newText,        setNewText]        = useState("");
  /* Off by default: a review published under a real name should be a decision
     the customer made, not one they discover afterwards. */
  const [showMyName,     setShowMyName]     = useState(false);
  const [replyText,      setReplyText]      = useState({});
  const [replyOpen,      setReplyOpen]      = useState({});
  const [inquiryMsg,     setInquiryMsg]     = useState("");
  const [inquirySent,    setInquirySent]    = useState(false);
  const [inquiryBusy,    setInquiryBusy]    = useState(false);
  const [inquiryErr,     setInquiryErr]     = useState("");
  const [imgLoaded,      setImgLoaded]      = useState(false);

  const avgRating = vRevs.length
    ? ((vRevs.reduce((a,r) => a + r.rating, 0)) / vRevs.length).toFixed(1)
    : (disp.rating || "N/A");

  /* getCurrentUser() returns no `vendorId` key, so this was permanently false:
     the Reply button never rendered and vendors could not answer any review.
     A vendor's account id IS their vendor_profiles.id. */
  const isVendorOwner = user?.type === "vendor" && user?.id === vendorId;
  /* The write-a-review button shows only when the viewer has EARNED it:
     a confirmed booking with this vendor, and hasn't already reviewed. For demo
     catalog vendors we keep the old open behavior so the sample stays lively. */
  const canReview = isLiveVendor ? (canRev && !mine) : RLS.canReview(user);

  const ratingBreakdown = [5,4,3,2,1].map(star => ({
    star,
    count: vRevs.filter(r => r.rating === star).length,
    pct:   vRevs.length ? Math.round(vRevs.filter(r => r.rating === star).length / vRevs.length * 100) : 0,
  }));

  const Stat = ({ icon, label, value, sub, accent }) => (
    <div style={{ background:"#FAFAFA", border:`1px solid ${C.border}`, borderRadius:14,
                  padding:"14px 16px", display:"flex", flexDirection:"column", gap:3 }}>
      <span style={{ fontSize:18 }}>{icon}</span>
      <p style={{ margin:0, fontSize:11, color:C.lightGray, fontWeight:700,
                  textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</p>
      <p style={{ margin:0, fontSize:15, fontWeight:800, color: accent || C.black,
                  fontFamily:"var(--display)", lineHeight:1.2 }}>{value}</p>
      {sub && <p style={{ margin:0, fontSize:10, color:C.midGray, lineHeight:1.4 }}>{sub}</p>}
    </div>
  );

  async function submitReview() {
    if (!newText.trim()) return;
    setRevErr("");
    if (isLiveVendor) {
      const res = await submitReviewDB({
        bookingId: canRev, authorId: user.id, subjectId: vendorId, direction: "user_to_vendor",
        rating: newRating, body: newText.trim(), dims: dimRatings,
        showName: showMyName,
        authorName: user.displayName || user.name || "",
      });
      if (!res.ok) { setRevErr(res.error); return; }
      setNewText(""); setShowReviewForm(false);
      await loadReviews();
      setMine({ rating: newRating });
    } else {
      /* demo catalog vendor — keep in-memory behavior */
      onAddReview(vendor.id, {
        id: uid(), uid: user.id, uname: user.displayName || user.name,
        rating: newRating, text: newText.trim(), date: "Today", reply: null,
      });
      setNewText(""); setShowReviewForm(false);
    }
  }

  async function submitReply(revId) {
    if (!replyText[revId]?.trim()) return;
    if (isLiveVendor) {
      const res = await replyToReviewDB(revId, vendorId, replyText[revId].trim());
      if (res.ok) await loadReviews();
    } else {
      onVendorReply(vendor.id, revId, replyText[revId].trim());
    }
    setReplyText(p => ({...p, [revId]: ""}));
    setReplyOpen(p => ({...p, [revId]: false}));
  }

  return (
    <div className="fade-up" style={{ maxWidth:1040, margin:"0 auto" }}>

      {/* Back */}
      <button onClick={onBack} className="btn"
        style={{ background:"none", border:"none", fontSize:13, color:C.midGray,
                 fontWeight:600, padding:0, marginBottom:20,
                 display:"flex", alignItems:"center", gap:5 }}>
        ← Back to results
      </button>

      {/* Listing identity — stated plainly above the photos so it can never be
          washed out by a bright image the way an overlay caption can. */}
      <div style={{ marginBottom:14 }}>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:7 }}>
          {vendor.feat    && <span style={{ background:C.orangeSoft, color:C.orange, fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:99 }}>✦ Featured</span>}
          {disp.instant && <span style={{ background:C.greenSoft, color:C.green, fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:99 }}>⚡ Instant booking</span>}
          {disp.cat && <span style={{ background:"#F3F4F6", color:C.midGray, fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:99 }}>{catLabelOf(disp.cat)}</span>}
        </div>
        {/* Save sits on the title row, not over the photo. People decide to
            keep a vendor while reading the name and price, and until now the
            only heart was back on the results grid — so saving meant going
            back, finding the card again, and hearting it from there. */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <h1 style={{ margin:0, fontSize:30, fontWeight:800, letterSpacing:"-0.03em",
                         color:C.black, lineHeight:1.15 }}>
              {(selService ? serviceLabel(selService) : (vendor.serviceName || disp.name))}
            </h1>
            <p style={{ margin:"5px 0 0", fontSize:14, color:C.midGray }}>
              by <span style={{ fontWeight:800, color:C.black }}>{disp.name}</span>
              {disp.city ? <span style={{ color:C.lightGray }}> · 📍 {disp.city}</span> : null}
            </p>
          </div>
          {onToggleFav && (
            <button type="button" className="btn"
              onClick={() => { if (!user) { if (onRequireAuth) onRequireAuth(); return; }
                               track("vendor_saved", { from: "profile" });
                               onToggleFav(vendor.id); }}
              title={isFav ? "Remove from saved" : "Save this vendor"}
              aria-pressed={isFav ? "true" : "false"}
              style={{ flexShrink:0, display:"flex", alignItems:"center", gap:7,
                       background: isFav ? "#FEF2F2" : "#fff",
                       border:`1.5px solid ${isFav ? "#FCA5A5" : C.border}`,
                       borderRadius:99, padding:"9px 15px", cursor:"pointer",
                       fontSize:13, fontWeight:700,
                       color: isFav ? "#B91C1C" : C.black }}>
              <span style={{ fontSize:15, lineHeight:1 }}>{isFav ? "❤️" : "🤍"}</span>
              {isFav ? "Saved" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Every listing this vendor has, each named on its own, so a vendor with
          a DJ listing and a photo-booth listing shows two clearly separate
          things. Tapping one switches the whole page to it. */}
      {services.length > 1 && (
        <div style={{ marginBottom:18 }}>
          <p style={{ margin:"0 0 8px", fontSize:11, fontWeight:800, color:C.midGray,
                      textTransform:"uppercase", letterSpacing:"0.06em" }}>
            {services.length} listings by {disp.name}
          </p>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
            {services.map((s, i) => {
              const on = s.id === selId;
              const pic = parsePhotos(s.photos)[0];
              const cheapest = cheapestPackage(s.packages);
              const price = cheapest ? `From ${fmtAllIn(cheapest.price)}`
                          : (s.price_value != null ? fmtAllIn(s.price_value) : "Contact for pricing");
              return (
                <button key={s.id} type="button" className="btn"
                  onClick={() => { setSelId(s.id); track("vendor_listing_switched", {}); }}
                  aria-pressed={on ? "true" : "false"}
                  style={{ flex:"0 0 auto", width:210, textAlign:"left", display:"flex", gap:9, alignItems:"center",
                           padding:"8px 10px", borderRadius:12, cursor:"pointer",
                           border:`1.5px solid ${on ? C.orange : C.border}`,
                           background: on ? "#FFF7ED" : "#fff" }}>
                  {pic
                    ? <img src={pic} alt="" style={{ width:42, height:42, borderRadius:8, objectFit:"cover", flexShrink:0 }} />
                    : <span style={{ width:42, height:42, borderRadius:8, background:"#F3F4F6", flexShrink:0,
                                     display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>
                        {(CATEGORIES.find(c => c.id === s.category) || {}).icon || "🏪"}
                      </span>}
                  <span style={{ minWidth:0 }}>
                    <span style={{ display:"block", fontSize:10, fontWeight:800, color: on ? C.orange : C.lightGray }}>
                      Listing {i + 1}{on ? " · viewing" : ""}
                    </span>
                    <span style={{ display:"block", fontSize:12.5, fontWeight:800, color:C.black,
                                   whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {serviceLabel(s)}
                    </span>
                    <span style={{ display:"block", fontSize:10.5, color:C.midGray,
                                   whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {catLabelOf(s.category)} · {price}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Photo gallery */}
      {/* Every image here sits absolutely inside a box of a known size. Left in
          normal flow, `img { height: 100% }` inside a wrapper whose own height
          is auto is a circular definition, so the browser fell back to the
          intrinsic height of the photo - 925px for a portrait shot. The
          implicit grid row grew to match while the container stayed a fixed
          320px with overflow hidden, so customers saw the top third of every
          photo and nothing below it. Pinning the row and taking the images out
          of flow makes each box exactly the size it claims to be.

          The main image then uses `contain`, so nothing is cropped, over a
          blurred copy of itself: a tall photo is letterboxed either side, and
          the blur makes that read as framing rather than as a grey slab.
          Thumbnails stay `cover` - they are previews, and cropping reads better
          at that size. */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gridTemplateRows:"320px",
                    gap:8, borderRadius:20, overflow:"hidden", height:320, marginBottom:28 }}>
        <div style={{ gridColumn:"1 / 3", position:"relative", cursor:"pointer",
                      overflow:"hidden", background:"#F3F4F6" }}
          onClick={() => setActivePhoto(0)}>
          {!imgLoaded && <div className="skeleton" style={{ position:"absolute", inset:0 }} />}
          <div aria-hidden="true"
            style={{ position:"absolute", inset:0,
                     backgroundImage:`url("${photos[activePhoto]}")`,
                     backgroundSize:"cover", backgroundPosition:"center",
                     filter:"blur(24px) brightness(0.82)", transform:"scale(1.2)",
                     opacity: imgLoaded ? 1 : 0, transition:"opacity 0.3s ease" }} />
          <img src={photos[activePhoto]} alt={disp.name}
            onLoad={() => setImgLoaded(true)}
            style={{ position:"absolute", inset:0, width:"100%", height:"100%",
                     objectFit:"contain",
                     opacity: imgLoaded ? 1 : 0, transition:"opacity 0.3s ease" }} />
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, minHeight:0 }}>
          {photos.slice(1, 3).map((ph, i) => (
            <div key={i} onClick={() => setActivePhoto(i+1)}
              style={{ flex:1, minHeight:0, position:"relative", cursor:"pointer", overflow:"hidden",
                       borderRadius: i === 0 ? "0 20px 0 0" : "0 0 20px 0" }}>
              <img src={ph} alt={`${disp.name} ${i+2}`}
                style={{ position:"absolute", inset:0, width:"100%", height:"100%",
                         objectFit:"cover" }} />
            </div>
          ))}
          {photos.length < 2 && (
            <div style={{ flex:1, minHeight:0, background:"#F3F4F6", display:"flex", alignItems:"center",
                          justifyContent:"center", borderRadius:"0 20px 20px 0" }}>
              <span style={{ fontSize:28 }}>📷</span>
            </div>
          )}
        </div>
      </div>

      {/* Photo dots */}
      {photos.length > 1 && (
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:6, marginBottom:24 }}>
          {photos.map((_, i) => (
            <button key={i} onClick={() => setActivePhoto(i)} className="btn"
              style={{ width: activePhoto===i ? 20 : 8, height:8, borderRadius:99,
                       background: activePhoto===i ? C.orange : "#D1D5DB",
                       border:"none", padding:0, transition:"all 0.2s ease" }} />
          ))}
          <span style={{ marginLeft:8, fontSize:11, color:C.lightGray, fontWeight:600 }}>
            {activePhoto + 1} / {photos.length}
          </span>
        </div>
      )}

      {/* Two-column layout */}
      <div className="pluj-2col"
        style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:24, alignItems:"start" }}>

        {/* LEFT */}
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

          {/* About */}
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:"20px 22px" }}>
            <h2 style={{ fontSize:17, fontWeight:800, margin:"0 0 10px" }}>About</h2>
            <p style={{ fontSize:14, color:C.midGray, lineHeight:1.8, margin:"0 0 14px" }}>
              {disp.blurb}
            </p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
              {(vendor.tags||[]).map(t => <Tag key={t}>{t}</Tag>)}
            </div>
          </div>

          {/* The profile shows ONLY the specific listing that was clicked. */}

          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            <Stat icon="⭐" label="Rating"    value={vRevs.length ? `${avgRating} / 5` : "New"} sub={`${vRevs.length} review${vRevs.length===1?"":"s"}`} accent="#F59E0B" />
            <Stat icon="🏢" label="In business" value={disp.yearsInBiz ? `${disp.yearsInBiz} yrs` : "N/A"} sub="experience" />
            <Stat icon="📍" label="Based in"  value={disp.bizCity || disp.city?.split(",")?.[0] || "Houston"} sub={disp.bizState || "TX"} />
            {disp.cat === "places"
              ? <Stat icon="📍" label="Location" value="Fixed venue" sub="on-site" />
              : <Stat icon="🚗" label="Travel radius" value={disp.travelMiles ? `${disp.travelMiles} mi` : "Ask"} sub="from base" />}
            <Stat icon="👥" label="Capacity"   value={disp.capacity || "Flexible"} sub="guests / event" />
          </div>

          {/* Service areas */}
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:"20px 22px" }}>
            <h2 style={{ fontSize:17, fontWeight:800, margin:"0 0 14px" }}>Service Area & Availability</h2>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div>
                <p style={{ margin:"0 0 6px", fontSize:11, fontWeight:800, color:C.midGray, textTransform:"uppercase", letterSpacing:"0.06em" }}>📍 Areas covered</p>
                <p style={{ margin:0, fontSize:13, color:C.black, lineHeight:1.7 }}>{disp.serviceAreas || disp.city || "Houston, TX"}</p>
              </div>
              <div>
                <p style={{ margin:"0 0 6px", fontSize:11, fontWeight:800, color:C.midGray, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  🗓 Days {selService ? "this listing works" : "worked"}
                </p>
                {(() => {
                  /* The days the vendor marked on THIS listing. A listing with no
                     days marked hasn't said, so it isn't shown as closed. */
                  const days   = selService ? parseEventTypes(selService.avail_days) : parseEventTypes(vendor.availDays);
                  const blocks = selService ? parseEventTypes(selService.avail_blocks) : parseEventTypes(vendor.availBlocks);
                  if (!days.length) {
                    return <p style={{ margin:0, fontSize:13, color:C.black, lineHeight:1.7 }}>
                      {(selService && selService.schedule) || vendor.schedule || "Ask the vendor"}
                    </p>;
                  }
                  return (
                    <>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                        {AVAIL_DAYS.map(d => {
                          const on = days.includes(d);
                          return (
                            <span key={d} title={on ? "Works this day" : "Doesn't work this day"}
                              style={{ minWidth:34, textAlign:"center", padding:"4px 0", borderRadius:7, fontSize:11, fontWeight:800,
                                       background: on ? C.greenSoft : "#F3F4F6", color: on ? "#065F46" : C.lightGray,
                                       border:`1px solid ${on ? "#A7F3D0" : C.border}`,
                                       textDecoration: on ? "none" : "line-through" }}>
                              {d}
                            </span>
                          );
                        })}
                      </div>
                      {blocks.length > 0 && (
                        <p style={{ margin:"6px 0 0", fontSize:12, color:C.midGray, lineHeight:1.6 }}>
                          {TIME_BLOCKS.filter(([id]) => blocks.includes(id)).map(([, l]) => l).join(" · ")}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            {disp.travelMiles && (
              <div style={{ marginTop:14, background:"#EFF6FF", borderRadius:10, padding:"10px 14px", border:"1px solid #BFDBFE" }}>
                <p style={{ margin:0, fontSize:12, color:"#1D4ED8" }}>
                  <strong>🚗 Travel radius:</strong> Up to <strong>{disp.travelMiles} miles</strong> from base. Events outside this range may have a travel fee.
                </p>
              </div>
            )}
          </div>

          {/* What's included */}
          {(vendor.highlights||[]).length > 0 && (
            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:"20px 22px" }}>
              <h2 style={{ fontSize:17, fontWeight:800, margin:"0 0 14px" }}>What's Included</h2>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(vendor.highlights||[]).map((h, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ width:22, height:22, borderRadius:"50%", background:C.greenSoft,
                                   color:C.green, display:"flex", alignItems:"center",
                                   justifyContent:"center", fontSize:11, fontWeight:800, flexShrink:0 }}>✓</span>
                    <span style={{ fontSize:14, color:C.black }}>{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pastEvents.length > 0 && (
            <section aria-label="Past events" style={{ borderTop:"2px solid #000", paddingTop:14 }}>
              <h2 style={{ margin:"0 0 12px", fontSize:28, lineHeight:1 }}>Past events</h2>
              <RecapCards recaps={pastEvents} names={pastNames} onOpen={setOpenPast} />
              {openPast && (
                <RecapModal recap={openPast} names={pastNames} onClose={() => setOpenPast(null)}
                  onViewVendor={(id) => { setOpenPast(null); if (id !== vendorId && onOpenVendorId) onOpenVendorId(id); }} />
              )}
            </section>
          )}

          {/* Reviews */}
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:"20px 22px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div>
                <h2 style={{ fontSize:17, fontWeight:800, margin:"0 0 4px" }}>
                  Reviews <span style={{ fontSize:13, color:C.midGray, fontWeight:500 }}>({vRevs.length})</span>
                </h2>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:26, fontWeight:800, fontFamily:"var(--display)" }}>{avgRating}</span>
                  <div>
                    <Stars r={parseFloat(avgRating)} size={14} />
                    <p style={{ margin:"2px 0 0", fontSize:10, color:C.lightGray }}>out of 5</p>
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4, minWidth:160 }}>
                {ratingBreakdown.map(({ star, count, pct }) => (
                  <div key={star} style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:10, color:C.midGray, width:12, textAlign:"right" }}>{star}</span>
                    <span style={{ fontSize:10 }}>★</span>
                    <div style={{ flex:1, height:6, background:"#F3F4F6", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background: pct > 0 ? "#F59E0B" : "transparent", borderRadius:3 }} />
                    </div>
                    <span style={{ fontSize:10, color:C.lightGray, width:22, textAlign:"right" }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-dimension performance averages */}
            {vRevs.length > 0 && dimAverages.some(d => d.avg != null) && (
              <div style={{ background:"#FAFAFA", border:`1px solid ${C.border}`, borderRadius:12,
                            padding:"12px 16px", marginBottom:16 }}>
                <p style={{ margin:"0 0 10px", fontSize:11, fontWeight:800, color:C.midGray,
                            textTransform:"uppercase", letterSpacing:"0.05em" }}>Performance ratings</p>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 20px" }}>
                  {dimAverages.map(({ key, label, avg }) => (
                    <div key={key} style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:11.5, color:C.black, flex:1, minWidth:0 }}>{label}</span>
                      <div style={{ width:56, height:6, background:"#EEE", borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                        <div style={{ width:`${(avg||0)/5*100}%`, height:"100%", background:C.orange, borderRadius:3 }} />
                      </div>
                      <span style={{ fontSize:12, fontWeight:800, color:C.black, width:26, textAlign:"right", flexShrink:0 }}>
                        {avg != null ? avg.toFixed(1) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canReview && !showReviewForm && (
              <button onClick={() => setShowReviewForm(true)} className="btn"
                style={{ background:C.orangeSoft, color:C.orange, border:`1px solid ${C.orangeBorder}`,
                         borderRadius:99, padding:"7px 16px", fontSize:12, fontWeight:700, marginBottom:16 }}>
                + Write a review
              </button>
            )}

            {/* Explain when a live vendor's viewer can't (yet) review. */}
            {isLiveVendor && !canReview && !isVendorOwner && user && user.type !== "guest" && (
              <p style={{ fontSize:12, color:C.lightGray, marginBottom:16, lineHeight:1.6 }}>
                {mine
                  ? "✓ You've reviewed this vendor. It appears when they've reviewed you too, or in 14 days, so neither side writes in reply to the other."
                  : "You can leave a review after your event, once this vendor has confirmed a booking with you."}
              </p>
            )}

            {revErr && (
              <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", color:"#B91C1C",
                            borderRadius:9, padding:"9px 12px", marginBottom:14, fontSize:12, fontWeight:600 }}>
                ⚠ {revErr}
              </div>
            )}

            {showReviewForm && canReview && (
              <div style={{ background:"#FAFAFA", borderRadius:14, padding:"16px 18px", marginBottom:20, border:`1px solid ${C.border}` }}>
                <p style={{ fontSize:13, fontWeight:800, marginBottom:4 }}>Rate this vendor's performance</p>
                <p style={{ fontSize:11, color:C.midGray, margin:"0 0 12px" }}>Your overall score is the average of these.</p>
                {REVIEW_DIMS.map(([k, label]) => (
                  <div key={k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:9 }}>
                    <span style={{ fontSize:12.5, fontWeight:600, color:C.black }}>{label}</span>
                    <Stars r={dimRatings[k]} size={20} interactive onRate={(v) => setDimRatings(d => ({ ...d, [k]: v }))} />
                  </div>
                ))}
                <div style={{ display:"flex", alignItems:"center", gap:6, borderTop:`1px solid ${C.border}`, paddingTop:10, marginTop:4 }}>
                  <span style={{ fontSize:12.5, fontWeight:800 }}>Overall</span>
                  <Stars r={newRating} size={18} />
                  <span style={{ fontSize:12, fontWeight:800, color:C.orange }}>{newRating}.0</span>
                </div>
                <textarea placeholder="Share your experience with this vendor..."
                  value={newText} onChange={e => setNewText(e.target.value)}
                  style={{ width:"100%", minHeight:90, border:`1px solid ${C.border}`, borderRadius:10,
                           padding:"10px 12px", fontSize:13, color:C.black, resize:"vertical", marginTop:12,
                           background:"#fff", fontFamily:"'Figtree', system-ui, sans-serif" }} />
                {/* Named or not, decided here rather than assumed. Shows the
                    exact name that will appear, so there is no guessing about
                    whether it means a full name or a first name. */}
                <label style={{ display:"flex", alignItems:"flex-start", gap:9, marginTop:12,
                                cursor:"pointer", padding:"10px 12px", borderRadius:10,
                                background:"#fff", border:`1px solid ${C.border}` }}>
                  <input type="checkbox" checked={showMyName}
                    onChange={e => setShowMyName(e.target.checked)}
                    style={{ marginTop:2, width:15, height:15, accentColor:C.orange, cursor:"pointer" }} />
                  <span style={{ fontSize:12, color:C.midGray, lineHeight:1.55 }}>
                    Show my first name on this review{" "}
                    <strong style={{ color:C.black }}>
                      ({String(user?.displayName || user?.name || "").trim().split(" ").filter(Boolean)[0] || "your name"})
                    </strong>
                    <br />
                    <span style={{ color:C.lightGray }}>
                      {showMyName
                        ? "Your first name will be public next to this review."
                        : "Leave unticked and this shows as “Verified customer”."}
                    </span>
                  </span>
                </label>

                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button onClick={submitReview} className="btn"
                    style={{ background:C.orange, color:"#fff", border:"none", borderRadius:10, padding:"9px 20px", fontSize:13, fontWeight:700 }}>
                    Submit
                  </button>
                  <button onClick={() => setShowReviewForm(false)} className="btn"
                    style={{ background:"#F3F4F6", color:C.midGray, border:"none", borderRadius:10, padding:"9px 16px", fontSize:13 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {vRevs.length === 0 && <p style={{ fontSize:13, color:C.lightGray }}>No reviews yet — be the first!</p>}

            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
              {(vRevs||[]).map(rev => (
                <div key={rev.id}>
                  <div style={{ display:"flex", gap:12 }}>
                    <Avatar name={rev.uname} size={36} bg={C.orange} />
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                        <p style={{ margin:0, fontSize:13, fontWeight:700 }}>{rev.uname}</p>
                        <p style={{ margin:0, fontSize:11, color:C.lightGray }}>{rev.date}</p>
                      </div>
                      <Stars r={rev.rating} size={12} />
                      <p style={{ fontSize:13, color:"#374151", lineHeight:1.75, margin:"7px 0 0" }}>{rev.text}</p>
                      {rev.reply && (
                        <div style={{ background:"#F9FAFB", borderLeft:`3px solid ${C.orange}`,
                                      borderRadius:"0 8px 8px 0", padding:"10px 14px", marginTop:12 }}>
                          <p style={{ fontSize:11, fontWeight:700, color:C.orange, margin:"0 0 5px" }}>Response from {disp.name}</p>
                          <p style={{ fontSize:13, color:C.midGray, margin:0, lineHeight:1.65 }}>{rev.reply}</p>
                        </div>
                      )}
                      {isVendorOwner && !rev.reply && (
                        <div style={{ marginTop:10 }}>
                          {!replyOpen[rev.id] ? (
                            <button onClick={() => setReplyOpen(p => ({...p,[rev.id]:true}))} className="btn"
                              style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 12px", fontSize:11, fontWeight:600, color:C.midGray }}>
                              Reply
                            </button>
                          ) : (
                            <div>
                              <textarea placeholder="Write your response..."
                                value={replyText[rev.id] || ""}
                                onChange={e => setReplyText(p => ({...p,[rev.id]:e.target.value}))}
                                style={{ width:"100%", minHeight:70, border:`1px solid ${C.border}`, borderRadius:9, padding:"9px 11px", fontSize:12, color:C.black, resize:"vertical", fontFamily:"'Figtree', system-ui, sans-serif" }} />
                              <div style={{ display:"flex", gap:7, marginTop:7 }}>
                                <button onClick={() => submitReply(rev.id)} className="btn"
                                  style={{ background:C.orange, color:"#fff", border:"none", borderRadius:8, padding:"7px 16px", fontSize:12, fontWeight:700 }}>
                                  Post reply
                                </button>
                                <button onClick={() => setReplyOpen(p => ({...p,[rev.id]:false}))} className="btn"
                                  style={{ background:"#F3F4F6", color:C.midGray, border:"none", borderRadius:8, padding:"7px 12px", fontSize:12 }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ height:1, background:C.border, marginTop:18 }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — booking card. On a phone the grid collapses to one column
            and `pluj-2col-side` pulls this above the description: the price and
            the booking button are what someone opened the page for, and burying
            them under a screen of copy is how a booking gets abandoned. */}
        <div className="pluj-2col-side" style={{ position:"sticky", top:80 }}>
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:18, padding:"20px 20px 22px",
                        boxShadow:"0 0 0 1px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)" }}>
            <p style={{ fontSize:13, fontWeight:600, color:C.midGray, margin:"0 0 2px" }}>Starting at</p>
            <p style={{ fontFamily:"var(--display)", fontSize:28, fontWeight:800, color:C.black, margin:"0 0 4px" }}>
              {priceLabel}
            </p>
            {selService && Number(selService.duration_hours) > 0 && !pickedPkg?.hours && (
              <p style={{ fontSize:12, color:C.black, fontWeight:700, margin:"0 0 4px" }}>
                ⏱ Includes {fmtHours(selService.duration_hours)}
                {selService.extra_hour_price != null && Number(selService.extra_hour_price) > 0
                  ? <span style={{ fontWeight:500, color:C.midGray }}> · extra hour {fmtAllIn(selService.extra_hour_price)}</span> : null}
              </p>
            )}
            {pickedPkg?.hours > 0 && (
              <p style={{ fontSize:12, color:C.black, fontWeight:700, margin:"0 0 4px" }}>
                ⏱ {fmtHours(pickedPkg.hours)}
                {selService && Number(selService.extra_hour_price) > 0
                  ? <span style={{ fontWeight:500, color:C.midGray }}> · extra hour {fmtAllIn(selService.extra_hour_price)}</span> : null}
              </p>
            )}
            <p style={{ fontSize:11, color: paymentsOn() ? "#065F46" : C.lightGray, margin:"0 0 16px", fontWeight: paymentsOn() ? 700 : 400 }}>
              {paymentsOn()
                ? (hostFeePct() > 0 ? "✓ One price: includes PLUJ's service fee. Nothing is added at checkout."
                                    : "✓ One price: no service fee for your first 3 months. Nothing is added at checkout.")
                : "The vendor confirms the final price for your date and guest count."}
            </p>

            {/* Pricing options — only ones the vendor has priced are listed */}
            {vendorPkgs.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <p style={{ margin:"0 0 7px", fontSize:12, fontWeight:800, color:C.black }}>
                  Choose an option
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                  {vendorPkgs.map((p, i) => {
                    const on = pickedPkg && pickedPkg.name === p.name && pickedPkg.price === p.price;
                    return (
                      <button key={i} onClick={() => setPickedPkg(p)} className="btn"
                        style={{ textAlign:"left", padding:"10px 12px", borderRadius:11, cursor:"pointer",
                                 border:`1.5px solid ${on ? C.orange : C.border}`,
                                 background: on ? "#FFF7ED" : "#fff" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:12.5, fontWeight:800, color: on ? C.orange : C.black }}>
                            {on ? "● " : "○ "}{p.name || `Option ${i+1}`}
                          </span>
                          <span style={{ fontSize:13, fontWeight:800, color:C.black, whiteSpace:"nowrap" }}>
                            {fmtAllIn(p.price)}
                          </span>
                        </div>
                        {p.hours > 0 && (
                          <p style={{ margin:"3px 0 0", fontSize:11, color:C.black, fontWeight:700 }}>⏱ {fmtHours(p.hours)}</p>
                        )}
                        {p.description && (
                          <p style={{ margin:"3px 0 0", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
                            <strong style={{ color:C.black }}>Included:</strong> {p.description}
                          </p>
                        )}
                        {p.requirements && (
                          <p style={{ margin:"4px 0 0", fontSize:11, color:"#92400E", lineHeight:1.5,
                                      background:"#FFFBEB", borderRadius:7, padding:"4px 7px" }}>
                            <strong>Needs from you:</strong> {p.requirements}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ background:"#F9FAFB", borderRadius:12, padding:"12px 14px", marginBottom:16, display:"flex", flexDirection:"column", gap:8 }}>
              {[
                ["👥","Capacity", disp.capacity || "Flexible"],
                disp.cat === "places"
                  ? ["📍","Location", "Fixed venue"]
                  : ["🚗","Travel", disp.travelMiles ? `${disp.travelMiles} mi` : "Ask"],
                ["🏢","In business", disp.yearsInBiz ? `${disp.yearsInBiz} yrs` : "N/A"],
              ].map(([icon,label,val]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:12, color:C.midGray }}>{icon} {label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:C.black }}>{val}</span>
                </div>
              ))}
            </div>

            {listingAddons.length > 0 && (
              <fieldset style={{ margin:"0 0 12px", padding:"10px 12px 8px", border:`1px solid ${C.border}`, borderRadius:11 }}>
                <legend style={{ padding:"0 4px", fontSize:12, fontWeight:800, color:C.black }}>Add extras</legend>
                {listingAddons.map((a, i) => {
                  const on = pickedAddons.some(p => p.name === a.name);
                  return (
                    <label key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5, padding:"6px 0", cursor:"pointer",
                                            minHeight:32 }}>
                      <input type="checkbox" checked={on} disabled={inCartHere}
                        onChange={() => setPickedAddons(list => on ? list.filter(p => p.name !== a.name) : [...list, a])} />
                      <span style={{ flex:1, color:C.black }}>{a.name}</span>
                      <span style={{ fontWeight:700, color:C.black, whiteSpace:"nowrap" }}>+{fmtAllIn(a.price)}</span>
                    </label>
                  );
                })}
              </fieldset>
            )}
            {(pickedPkg || basePrice) ? (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:8,
                            borderTop:"2px solid #000", padding:"10px 0 12px", marginBottom:4 }}>
                <span style={{ fontSize:13, fontWeight:800 }}>
                  {pickedAddons.length ? `Total with ${pickedAddons.length} extra${pickedAddons.length !== 1 ? "s" : ""}` : "Total"}
                </span>
                <span style={{ fontFamily:"var(--display)", fontSize:28, fontWeight:900, lineHeight:1 }}>{priceLabel}</span>
              </div>
            ) : null}

            <button onClick={() => {
                if (!user || user.type === "guest") { onRequireAuth?.(); return; }
                if (user.blocked) { window.alert("Your account is blocked.\n\n" + (user.blockedReason || "Contact support for details.")); return; }
                if (!inCartHere) onAddToCart(offeringForCart());
              }} className="btn"
              style={{ width:"100%", padding:"13px 0", borderRadius:13, border:"none",
                       background: inCartHere ? "#F3F4F6" : C.orange,
                       color: inCartHere ? C.midGray : "#fff",
                       fontSize:14, fontWeight:800, marginBottom:8,
                       boxShadow: inCartHere ? "none" : C.shadowButton }}>
              {/* A guest is NOT signed out - the header says "Guest" and offers
                  "Log out" - so telling them to log in is a contradiction they
                  cannot act on. They do not need to log in, they need an
                  account. The helper line below already said so; the button
                  disagreed with it. */}
              {!user ? "🔒 Log in to book"
                : user.type === "guest" ? "🔒 Sign up to book"
                : inCartHere ? "✓ Added — set date & details in cart" : disp.instant ? "⚡ Book now" : "Start booking request"}
            </button>
            <p style={{ fontSize:11, color:C.midGray, textAlign:"center", margin:"0 0 4px", lineHeight:1.5 }}>
              {(!user || user.type === "guest")
                ? "You need an account to send booking requests."
                : disp.instant
                  ? "⚡ Instant booking: open dates 3+ days away are confirmed right away, at this price. Otherwise it goes to the vendor as a request."
                  : "You'll pick the date, time, and location next — no details needed here."}
            </p>

            {/* Inquiry */}
            <div style={{ marginTop:16, borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
              <p style={{ fontSize:12, fontWeight:700, color:C.black, margin:"0 0 8px" }}>Send an inquiry</p>
              {inquirySent ? (
                <p style={{ fontSize:12, color:C.green, fontWeight:600 }}>
                  ✓ Inquiry sent! {disp.name} will respond shortly.
                </p>
              ) : (
                <>
                  {inquiryErr && (
                    <p style={{ fontSize:11, color:"#B91C1C", background:"#FEF2F2", border:"1px solid #FCA5A5",
                                borderRadius:8, padding:"7px 10px", margin:"0 0 8px", fontWeight:600 }}>⚠ {inquiryErr}</p>
                  )}
                  <textarea placeholder={(!user || user.type === "guest") ? "Log in to send an inquiry to this vendor…" : "Ask about availability, custom packages, group rates..."}
                    value={inquiryMsg} onChange={e => setInquiryMsg(e.target.value)}
                    disabled={!user || user.type === "guest"}
                    style={{ width:"100%", minHeight:80, border:`1px solid ${C.border}`, borderRadius:10,
                             padding:"9px 11px", fontSize:12, resize:"vertical", fontFamily:"'Figtree', system-ui, sans-serif",
                             background: (!user || user.type === "guest") ? "#F9FAFB" : "#fff" }} />
                  <button onClick={async () => {
                      if (!user || user.type === "guest") { onRequireAuth?.(); return; }
                      if (!inquiryMsg.trim()) return;
                      setInquiryBusy(true);
                      const res = await sendInquiry({
                        userId: user.id, vendorId,
                        serviceId: selService ? selService.id : (vendor.serviceId || null),
                        serviceName: selService ? serviceLabel(selService) : (vendor.serviceName || null),
                        body: inquiryMsg.trim(),
                      });
                      setInquiryBusy(false);
                      if (res.ok) { setInquirySent(true); setInquiryMsg(""); }
                      else setInquiryErr(res.error || "Could not send your inquiry.");
                    }} className="btn" disabled={inquiryBusy}
                    style={{ width:"100%", padding:"10px 0", borderRadius:10, background:C.black, color:"#fff",
                             border:"none", fontSize:13, fontWeight:700, marginTop:8 }}>
                    {!user ? "🔒 Log in to inquire"
                      : user.type === "guest" ? "🔒 Sign up to inquire"
                      : inquiryBusy ? "Sending…" : "Send inquiry"}
                  </button>
                </>
              )}
            </div>

            {/* What PLUJ actually checked, item by item, instead of a vague
                "verified" badge. Each line is only shown when it is true. */}
            {isLiveVendor && (
              <div style={{ marginTop:16, borderTop:"2px solid #000", paddingTop:12 }}>
                <p style={{ margin:"0 0 8px", fontSize:14, fontWeight:800, color:"#000" }}>What PLUJ checked</p>
                {[
                  [true, "Business reviewed and approved by hand"],
                  [full?.legal_on_file === true, "Legal name, EIN, address and owners on file"],
                  [full?.license_on_file === true, "License or permit number on file"],
                  [full?.coi_checked === true, full?.coi_valid_until
                      ? `Insurance certificate checked, valid until ${new Date(full.coi_valid_until + "T12:00:00").toLocaleDateString("en-US", { month:"short", year:"numeric" })}`
                      : "Insurance certificate checked"],
                  [full?.dshs_checked === true, "Texas DSHS food permit checked"],
                  [full?.tabc_checked === true, "TABC alcohol permit checked"],
                  [Array.isArray(full?.languages) && full.languages.includes("es"), "Habla español"],
                  [true, "Reviews only from confirmed bookings, after the event"],
                ].filter(([ok]) => ok).map(([, t]) => (
                  <p key={t} style={{ margin:"0 0 6px", fontSize:13, color:"#000", display:"flex", gap:8, alignItems:"baseline" }}>
                    <span aria-hidden="true" style={{ width:8, height:8, background:"#FF5C28", transform:"rotate(45deg)", flex:"0 0 auto" }} />
                    {t}
                  </p>
                ))}
                {full?.verified_at && (
                  <p style={{ margin:"4px 0 0", fontSize:12, color:C.lightGray }}>
                    Approved {new Date(full.verified_at).toLocaleDateString("en-US", { month:"short", year:"numeric" })}
                  </p>
                )}
                <p style={{ margin:"8px 0 0", fontSize:12, color:C.midGray, lineHeight:1.5 }}>
                  Still confirm the details with the vendor before your event.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}




/* ─── VENDOR CARD ────────────────────────────────────────────────────────────── */
/* Uber Eats pattern: skeleton shimmer while image loads, inset hover tint */
function VCard({ v, inCart, onAdd, onRemove, onView, isFav, onToggleFav }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const inCartNow = inCart;
  const city = v.bizCity || (v.city || "").split(",")[0];
  const guests = v.capacityMax ? `Up to ${v.capacityMax} guests`
               : (v.capacity && typeof v.capacity === "string" ? `${v.capacity} guests` : "");
  const hasRating = Number(v.revCount) > 0;

  return (
    <article className="vcard2" onClick={() => onView(v)}
      style={{ boxShadow: inCartNow ? `0 0 0 2px ${C.orange}` : "none" }}>
      {/* Photo */}
      <div className="vendor-img-wrap" style={{ position:"relative", aspectRatio:"4 / 3", background:C.bgAlt }}>
        {!imgLoaded && <div className="skeleton" style={{ position:"absolute", inset:0 }} />}
        <img src={v.img} alt={v.serviceName || v.name} loading="lazy"
          onLoad={() => setImgLoaded(true)}
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", display:"block",
                   opacity: imgLoaded ? 1 : 0, transition:"opacity 0.3s ease, transform 0.5s cubic-bezier(0.22,1,0.36,1)" }}
          className="vendor-img" />
        {v.instant && (
          <span style={{ position:"absolute", top:12, left:12, background:"#000", color:"#fff", fontSize:12,
                         fontWeight:800, padding:"4px 10px", borderRadius:99, boxShadow:"0 2px 8px rgba(23,18,15,0.15)" }}>
            ⚡ Instant booking
          </span>
        )}
        <button className={`heart-btn${isFav ? " active" : ""}`}
          onClick={e => { e.stopPropagation(); onToggleFav?.(v.id); }}
          aria-pressed={isFav ? "true" : "false"}
          title={isFav ? "Remove from favorites" : "Save to favorites"}
          aria-label={isFav ? "Remove from favorites" : "Save to favorites"}>
          {isFav ? "❤️" : "🤍"}
        </button>
        {inCartNow && (
          <span style={{ position:"absolute", bottom:12, left:12, background:C.orange, color:"#fff",
                         fontSize:12, fontWeight:800, padding:"4px 10px", borderRadius:99 }}>✓ In your cart</span>
        )}
      </div>

      {/* Details */}
      <div style={{ padding:"14px 16px 16px", display:"flex", flexDirection:"column", flex:1 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
          <h3 style={{ margin:0, fontSize:18, fontWeight:600, lineHeight:1.2, letterSpacing:"-0.01em" }}>
            {v.serviceName || v.name}
          </h3>
          <span style={{ fontSize:13, fontWeight:700, color:C.black, whiteSpace:"nowrap", flexShrink:0 }}>
            {hasRating ? <>★ {v.rating} <span style={{ color:C.lightGray, fontWeight:500 }}>({v.revCount})</span></>
                       : <span style={{ color:C.green, fontWeight:700 }}>New</span>}
          </span>
        </div>
        <p style={{ margin:"4px 0 0", fontSize:13.5, color:C.midGray, lineHeight:1.45 }}>
          {[catLabelOf(v.cat), v.serviceType && v.serviceType !== catLabelOf(v.cat) ? v.serviceType : null].filter(Boolean).join(" · ")}
        </p>
        <p style={{ margin:"2px 0 0", fontSize:13.5, color:C.midGray }}>
          by <span data-no-translate style={{ fontWeight:700, color:C.black }}>{v.name}</span>
          {city ? <> · {city}</> : null}
        </p>
        {(v.insured || v.dshsOk || v.tabcOk || (v.langs || []).includes("es")) && (
          <p style={{ margin:"8px 0 0", display:"flex", gap:6, flexWrap:"wrap" }}>
            {v.insured && <span className="badge-chk">Insured</span>}
            {v.dshsOk && <span className="badge-chk">DSHS permit</span>}
            {v.tabcOk && <span className="badge-chk">TABC permit</span>}
            {(v.langs || []).includes("es") && <span className="badge-chk">Habla español</span>}
          </p>
        )}
        {(guests || v.travelMiles) && (
          <p style={{ margin:"8px 0 0", fontSize:12.5, color:C.midGray, display:"flex", gap:12, flexWrap:"wrap" }}>
            {guests && <span>{`👥 ${guests}`}</span>}
            {v.travelMiles ? <span>{`🚗 Travels ${v.travelMiles} mi`}</span> : null}
          </p>
        )}

        {/* The price stub: torn off along the dashes. */}
        <div style={{ marginTop:"auto", paddingTop:14 }} />
        <div style={{ margin:"0 -16px -16px", padding:"12px 16px 14px", borderTop:"2px dashed #DCDCDE",
                      display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
          <div>
            <p style={{ margin:0, fontFamily:"var(--display)", fontSize:28, lineHeight:1, fontWeight:800, color:"#000" }}>{cardPrice(v)}</p>
            {Number(v.pv) > 0 && <p style={{ margin:0, fontSize:11.5, color:C.lightGray }}>One price, no fees added</p>}
          </div>
          <button onClick={e => { e.stopPropagation(); inCartNow ? onRemove(v.id) : onAdd(v); }}
            className="btn"
            style={{ padding:"10px 16px", borderRadius:99, fontSize:13.5, fontWeight:800, whiteSpace:"nowrap",
                     background: inCartNow ? C.bgAlt : "#000",
                     color: inCartNow ? C.midGray : "#fff", minHeight:40 }}>
            {inCartNow ? "✓ Added" : v.instant ? "⚡ Book now" : "Request to book"}
          </button>
        </div>
      </div>
    </article>
  );
}


/* ─── HERO SLIDESHOW ─────────────────────────────────────────────────────── */
const HERO_SLIDES = [
  { url:"https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1600&q=80", pos:"center 40%" },
  { url:"https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600&q=80", pos:"center 30%" },
  { url:"https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&q=80", pos:"center 40%" },
  { url:"https://images.unsplash.com/photo-1540575467537-78ab5a7e7c92?w=1600&q=80", pos:"center 35%" },
  { url:"https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=1600&q=80", pos:"center 40%" },
  { url:"https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1600&q=80", pos:"center 30%" },
];

/* `dotsBottom` exists because the hero has a stats bar pinned across its
   bottom edge ("Houston, TX / Live now"). The dots used to sit 16px up, which
   put them on top of that bar. The hero owns the bar, so the hero tells the
   slideshow how much room to leave rather than this component guessing. */
function HeroVideo({ poster, dotsBottom = 16 }) {
  const [current, setCurrent] = useState(0);
  const [prev, setPrev]       = useState(null);
  const [fading, setFading]   = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setPrev(current);
      setFading(true);
      setCurrent(c => (c + 1) % HERO_SLIDES.length);
      setTimeout(() => { setPrev(null); setFading(false); }, 1000);
    }, 5000);
    return () => clearInterval(interval);
  }, [current]);

  return (
    <div style={{ width:"100%", height:"100%", position:"relative", overflow:"hidden" }}>
      {/* Previous slide fading out */}
      {prev !== null && (
        <img key={"prev-"+prev} src={HERO_SLIDES[prev].url} alt=""
          style={{ width:"100%", height:"100%", objectFit:"cover",
                   objectPosition: HERO_SLIDES[prev].pos,
                   position:"absolute", inset:0,
                   opacity: fading ? 0 : 1,
                   transition:"opacity 1s ease" }} />
      )}
      {/* Current slide fading in */}
      <img key={"cur-"+current} src={HERO_SLIDES[current].url} alt="Event"
        style={{ width:"100%", height:"100%", objectFit:"cover",
                 objectPosition: HERO_SLIDES[current].pos,
                 position:"absolute", inset:0,
                 opacity: fading ? 1 : 1,
                 transition:"opacity 1s ease" }} />
      {/* Dot indicators */}
      <div style={{ position:"absolute", bottom:dotsBottom, left:"50%", transform:"translateX(-50%)",
                    display:"flex", gap:6, zIndex:5 }}>
        {HERO_SLIDES.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)} className="btn"
            style={{ width: i===current ? 20 : 7, height:7, borderRadius:99, border:"none",
                     background: i===current ? "#fff" : "rgba(255,255,255,0.45)",
                     padding:0, cursor:"pointer", transition:"all 0.3s ease" }} />
        ))}
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   PASSWORD RESET SCREEN
   Shown when the user arrives via a Supabase recovery email link, which puts
   #access_token=...&type=recovery in the URL hash. We use that recovery token
   to set a new password (PUT /auth/v1/user), then send them back to login.
   ══════════════════════════════════════════════════════════════════════════ */
function ResetPasswordScreen({ token, onDone }) {
  const [pw,      setPw]      = useState("");
  const [pw2,     setPw2]     = useState("");
  const [err,     setErr]     = useState("");
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  async function submit() {
    setErr("");
    /* Keep in step with AuthModal.validateStep() and the Supabase Auth settings. */
    if (pw.length < 12) { setErr("Password must be at least 12 characters."); return; }
    if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) ||
        !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw))
      { setErr("Password needs a lowercase letter, an uppercase letter, a number and a symbol (like ! ? # $)."); return; }
    if (pw !== pw2) { setErr("Passwords don't match."); return; }
    setLoading(true);
    const { error } = await sb.updateUserPassword(token, pw);
    setLoading(false);
    if (error) { setErr(error.message || "Could not update password. The reset link may have expired — request a new one."); return; }
    setDone(true);
  }

  return (
    <div className="modal-overlay"
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:2000,
               display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:16, padding:"28px 24px", width:"100%", maxWidth:380,
                    boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
          <span style={{ fontSize:20 }}>🔑</span>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>Reset your password</h2>
        </div>

        {done ? (
          <>
            <p style={{ fontSize:13, color:C.midGray, margin:"8px 0 18px" }}>
              Your password has been updated. You can now sign in with your new password.
            </p>
            <button onClick={onDone} className="btn"
              style={{ width:"100%", padding:"11px 0", borderRadius:10, background:C.green,
                       color:"#fff", border:"none", fontSize:14, fontWeight:700 }}>
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize:13, color:C.midGray, margin:"8px 0 16px" }}>
              Choose a new password for your account.
            </p>
            {err && (
              <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", color:"#B91C1C",
                            borderRadius:9, padding:"9px 12px", marginBottom:12, fontSize:12, fontWeight:600 }}>
                ⚠ {err}
              </div>
            )}
            <PasswordInput placeholder="New password" value={pw} autoComplete="new-password"
              onChange={e=>{ setPw(e.target.value); setErr(""); }}
              style={{ width:"100%", padding:"11px 12px", borderRadius:10, border:`1px solid ${C.border}`,
                       fontSize:14, marginBottom:10, boxSizing:"border-box" }} />
            <PasswordInput placeholder="Confirm new password" value={pw2} autoComplete="new-password"
              onChange={e=>{ setPw2(e.target.value); setErr(""); }}
              onKeyDown={e=>{ if (e.key==="Enter") submit(); }}
              style={{ width:"100%", padding:"11px 12px", borderRadius:10, border:`1px solid ${C.border}`,
                       fontSize:14, marginBottom:14, boxSizing:"border-box" }} />
            <button onClick={submit} disabled={loading} className="btn"
              style={{ width:"100%", padding:"11px 0", borderRadius:10, background:C.black,
                       color:"#fff", border:"none", fontSize:14, fontWeight:700,
                       opacity: loading ? 0.6 : 1 }}>
              {loading ? "Updating…" : "Update password"}
            </button>
            <button onClick={onDone} className="btn"
              style={{ width:"100%", padding:"9px 0", marginTop:8, borderRadius:10, background:"transparent",
                       color:C.midGray, border:"none", fontSize:12, fontWeight:600 }}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   VENDOR LISTING EDITOR
   Lets an approved vendor edit their public listing at any time: service
   description, pricing, category, and photos. Business details captured at
   signup (capacity, project size, years in business, travel radius, service
   areas) are pre-filled and editable here too.
   ══════════════════════════════════════════════════════════════════════════ */
/* ─── SERVICES MANAGER ─────────────────────────────────────────────────────────
   A vendor can offer many services across different categories — e.g. a venue
   that also provides rentals, A/V and a DJ. Each row is one vendor_services
   record; the business details live on vendor_profiles and are shared. */
/* ServicesManager moved to src/dashboards/VendorDashboard.jsx (23 Sep 2026) - loaded on demand. */
/* Languages a vendor can mark (Houston's most spoken). Codes match the
   database check vendor_profiles_languages_known. */
export const VENDOR_LANGUAGES = [
  ["en","English"], ["es","Spanish"], ["vi","Vietnamese"], ["zh","Chinese"], ["ar","Arabic"], ["fr","French"],
  ["hi","Hindi"], ["ur","Urdu"], ["tl","Tagalog"], ["ko","Korean"], ["pt","Portuguese"],
];
function CheckStatus({ at, filled }) {
  if (!filled) return null;
  return (
    <p style={{ margin:"4px 0 0", fontSize:11, fontWeight:700, color: at ? C.green : C.midGray }}>
      {at ? "✓ Checked by PLUJ" : "Waiting for PLUJ to check it"}
    </p>
  );
}
export function VendorListingEditor({ user, onClose, onSaved }) {
  /* Business profile = WHO you are. Since 30 Sep 2026 this no longer asks for
     service types, prices, capacity or availability: those belong to each
     listing, and asking for them here as well is what left vendors staring at
     "Service: Not set" and wondering which of two places to fill in. */
  const [f, setF]           = useState(null);
  const [loading, setLoad]  = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");
  const [ok, setOk]         = useState("");
  const [uploading, setUp]  = useState(false);

  useEffect(() => {
    (async () => {
      const d = await getMyListing(user.id);
      setF({
        business_name: d?.business_name || "",
        description:   d?.description   || "",
        biz_phone:     d?.biz_phone     || "",
        biz_address:   d?.biz_address   || "",
        biz_city:      d?.biz_city      || "",
        biz_zip:       d?.biz_zip       || "",
        service_areas: d?.service_areas || "",
        years_in_biz:  d?.years_in_biz != null ? String(d.years_in_biz) : "",
        biz_legal:     d?.biz_legal     || "",
        biz_license:   d?.biz_license   || "",
        biz_website:   d?.biz_website   || "",
        biz_type:      d?.biz_type      || "",
        biz_state:     d?.biz_state     || "TX",
        ein:           d?.ein           || "",
        managing_members: d?.managing_members || "",
        license_not_required: d?.license_not_required === true,
        photos:        parsePhotos(d?.photos),
        languages:     Array.isArray(d?.languages) && d.languages.length ? d.languages : ["en"],
        coi_insurer:   d?.coi_insurer    || "",
        coi_expires_on:d?.coi_expires_on || "",
        dshs_permit:   d?.dshs_permit    || "",
        tabc_permit:   d?.tabc_permit    || "",
        coi_checked_at:  d?.coi_checked_at  || null,
        dshs_checked_at: d?.dshs_checked_at || null,
        tabc_checked_at: d?.tabc_checked_at || null,
      });
      setLoad(false);
    })();
  }, [user.id]);

  function set(k, v) { setF(p => ({ ...p, [k]: v })); setErr(""); setOk(""); }

  async function addPhotos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const roomLeft = MAX_PHOTOS - (f.photos.length || 0);
    if (files.length > roomLeft) {
      setErr(roomLeft <= 0
        ? `You already have ${MAX_PHOTOS} photos, the maximum. Remove one to add another.`
        : `You can add ${roomLeft} more photo${roomLeft === 1 ? "" : "s"} — ${MAX_PHOTOS} is the maximum.`);
      return;
    }
    setUp(true); setErr("");
    const session = await loadSession();
    const token = session?.access_token;
    const added = [];
    for (const file of files) {
      const { url, error } = await uploadVendorPhoto(user.id, file, token);
      if (error) { setErr(error); break; }
      if (url) added.push(url);
    }
    if (added.length) setF(p => ({ ...p, photos: [...p.photos, ...added] }));
    setUp(false);
  }

  async function save() {
    setErr(""); setOk("");
    const missing = [];
    if (!f.business_name.trim()) missing.push("business name");
    if (!f.description.trim())   missing.push("a short description of your business");
    if (!f.biz_phone.trim())     missing.push("business phone");
    if (!f.biz_city.trim())      missing.push("city");
    if (!f.biz_zip.trim())       missing.push("ZIP code");
    if (!f.service_areas.trim()) missing.push("at least one service area");
    /* Legal information: required before any listing can be posted. */
    if (!f.biz_legal.trim())     missing.push("legal business name");
    if (!f.biz_type)             missing.push("business type");
    if (f.ein.replace(/\D/g, "").length !== 9) missing.push("EIN (9 digits)");
    if (!f.managing_members.trim()) missing.push("owner / managing members");
    if (!f.biz_address.trim())   missing.push("street address");
    if (!f.biz_state.trim())     missing.push("state");
    if (f.biz_zip.trim() && !/^\d{5}(-\d{4})?$/.test(f.biz_zip.trim())) missing.push("a 5-digit ZIP code");
    if (f.biz_phone.replace(/\D/g, "").length < 10) missing.push("a 10-digit business phone");
    if (!f.biz_license.trim() && !f.license_not_required) missing.push("licence / permit number (or tick that you don't need one)");
    if (f.coi_insurer.trim() && !f.coi_expires_on) missing.push("the date your insurance certificate expires");
    if (!f.coi_insurer.trim() && f.coi_expires_on) missing.push("your insurance company's name");
    if (missing.length) { setErr("Please add " + missing.join(", ") + "."); return; }
    setSaving(true);
    const yrs = String(f.years_in_biz || "").replace(/[^0-9]/g, "");
    const res = await saveMyListing(user.id, {
      business_name: f.business_name.trim(),
      description:   f.description.trim(),
      biz_phone:     f.biz_phone.trim(),
      biz_address:   f.biz_address.trim() || null,
      biz_city:      f.biz_city.trim(),
      biz_zip:       f.biz_zip.trim(),
      service_areas: f.service_areas,
      years_in_biz:  yrs === "" ? null : parseInt(yrs, 10),
      biz_legal:     f.biz_legal.trim() || null,
      biz_license:   f.license_not_required ? (f.biz_license.trim() || null) : f.biz_license.trim(),
      biz_website:   f.biz_website.trim() || null,
      biz_type:      f.biz_type,
      biz_state:     f.biz_state.trim().toUpperCase(),
      ein:           (() => { const d = f.ein.replace(/\D/g, ""); return d.slice(0, 2) + "-" + d.slice(2); })(),
      managing_members: f.managing_members.trim(),
      license_not_required: f.license_not_required === true,
      photos:        f.photos,
      languages:     f.languages && f.languages.length ? f.languages : ["en"],
      coi_insurer:   f.coi_insurer.trim() || null,
      coi_expires_on:f.coi_expires_on || null,
      dshs_permit:   f.dshs_permit.trim() || null,
      tabc_permit:   f.tabc_permit.trim() || null,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    setOk("Business details saved.");
    if (onSaved) onSaved();
  }

  const F = { width:"100%", height:42, padding:"0 12px", border:`1px solid ${C.border}`,
              borderRadius:9, fontSize:13, boxSizing:"border-box", background:"#fff" };
  const L = { display:"block", fontSize:11, fontWeight:700, color:C.midGray, margin:"10px 0 4px" };
  const Opt = () => <span style={{ fontWeight:400, color:C.lightGray }}>(optional)</span>;

  return (
    <div className="modal-overlay" onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1200,
               display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:520,
                 maxHeight:"88vh", overflowY:"auto", padding:"22px 22px 26px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:800 }}>🏪 Business details</h2>
          <button onClick={onClose} className="btn"
            style={{ border:"none", background:"#F3F4F6", borderRadius:99, width:28, height:28 }}>✕</button>
        </div>

        {loading || !f ? (
          <p style={{ fontSize:13, color:C.midGray, marginTop:16 }}>Loading…</p>
        ) : (
          <>
            <p style={{ fontSize:12, color:C.midGray, margin:"6px 0 0", lineHeight:1.55 }}>
              Who you are as a business. PLUJ uses this to approve you, and hosts see your name,
              description, photos and service areas. What you sell — prices, capacity, availability —
              goes in each <strong>listing</strong>.
            </p>

            {err && <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", color:"#B91C1C",
                                  borderRadius:9, padding:"9px 12px", marginTop:12, fontSize:12, fontWeight:600 }}>⚠ {err}</div>}
            {ok  && <div style={{ background:C.greenSoft, border:`1px solid ${C.green}55`, color:"#065F46",
                                  borderRadius:9, padding:"9px 12px", marginTop:12, fontSize:12, fontWeight:600 }}>✓ {ok}</div>}

            <label style={L}>Business name * <span style={{ fontWeight:400, color:C.lightGray }}>(what hosts see)</span></label>
            <input style={F} value={f.business_name} onChange={e=>set("business_name", e.target.value)} />

            <label style={L}>About your business *</label>
            <textarea value={f.description} onChange={e=>set("description", e.target.value)}
              rows={3} maxLength={2000} placeholder="Who you are, what you're known for, what makes you different."
              style={{ ...F, height:"auto", padding:"10px 12px", resize:"vertical", fontFamily:"inherit" }} />

            <label style={L}>Business phone * <span style={{ fontWeight:400, color:C.lightGray }}>(private — only PLUJ sees it)</span></label>
            <input style={F} type="tel" value={f.biz_phone} onChange={e=>set("biz_phone", e.target.value)} />

            <label style={L}>Business street address * <span style={{ fontWeight:400, color:C.lightGray }}>(private — only PLUJ sees it)</span></label>
            <input style={F} value={f.biz_address} onChange={e=>set("biz_address", e.target.value)} />
            <div style={{ display:"flex", gap:8 }}>
              <div style={{ flex:2 }}>
                <label style={L}>City *</label>
                <input style={F} value={f.biz_city} onChange={e=>set("biz_city", e.target.value)} />
              </div>
              <div style={{ flex:"0 0 70px" }}>
                <label style={L}>State *</label>
                <input style={F} maxLength={2} value={f.biz_state} onChange={e=>set("biz_state", e.target.value.toUpperCase())} />
              </div>
              <div style={{ flex:1 }}>
                <label style={L}>ZIP *</label>
                <input style={F} inputMode="numeric" maxLength={10} value={f.biz_zip} onChange={e=>set("biz_zip", e.target.value)} />
              </div>
            </div>

            <label style={L}>Where you work * <span style={{ fontWeight:400, color:C.lightGray }}>(tap all that apply)</span></label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {TX_CITIES.map(city => {
                const sel = String(f.service_areas || "").split(",").map(x=>x.trim()).filter(Boolean);
                const on = sel.includes(city);
                return (
                  <button type="button" key={city}
                    onClick={()=> set("service_areas", (on ? sel.filter(c=>c!==city) : [...sel, city]).join(", "))}
                    style={{ padding:"5px 11px", borderRadius:99, fontSize:11.5, fontWeight:600, cursor:"pointer",
                             border:`1.5px solid ${on ? C.orange : C.border}`,
                             background: on ? "#FFF7ED" : "#fff", color: on ? C.orange : C.midGray }}>
                    {on ? "✓ " : ""}{city}
                  </button>
                );
              })}
            </div>

            <label style={L}>Years in business <Opt /></label>
            <input style={F} inputMode="numeric" maxLength={3} value={f.years_in_biz}
              onChange={e=>set("years_in_biz", e.target.value.replace(/[^0-9]/g, ""))} />

            {/* Legal information. Required before any listing can be posted
                (the database enforces it too: require_vendor_legal_info). */}
            <div style={{ background:"#FFFBEB", border:"1px solid #FCD34D", borderRadius:10,
                          padding:"4px 12px 12px", marginTop:14 }}>
              <p style={{ margin:"8px 0 0", fontSize:12, fontWeight:800, color:"#92400E" }}>
                ⚖️ Legal information — required before you can post a listing
              </p>
              <p style={{ margin:"3px 0 0", fontSize:11, color:"#92400E", lineHeight:1.5 }}>
                Private: only PLUJ sees it. Hosts never see your EIN, address or owners.
              </p>
              <label style={L}>Legal business name *</label>
              <input style={F} value={f.biz_legal} onChange={e=>set("biz_legal", e.target.value)}
                placeholder="As registered with the state or IRS" />
              <label style={L}>Business type *</label>
              <select style={F} value={f.biz_type} onChange={e=>set("biz_type", e.target.value)}>
                <option value="">Choose…</option>
                {BIZ_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label style={L}>EIN (Employer Identification Number) *</label>
              <input style={F} inputMode="numeric" maxLength={10} value={f.ein} placeholder="12-3456789"
                onChange={e=>{ const d = e.target.value.replace(/\D/g, "").slice(0, 9);
                               set("ein", d.length > 2 ? d.slice(0, 2) + "-" + d.slice(2) : d); }} />
              <p style={{ margin:"3px 0 0", fontSize:10.5, color:C.midGray, lineHeight:1.5 }}>
                Sole proprietors without one can get an EIN free from the IRS at irs.gov/ein in a few minutes.
              </p>
              <label style={L}>Owner / managing members *</label>
              <input style={F} value={f.managing_members} onChange={e=>set("managing_members", e.target.value)}
                placeholder="Full names, e.g. Maria Lopez, Juan Lopez" />
              <label style={L}>Business license / permit number {f.license_not_required ? <Opt /> : "*"}</label>
              <input style={F} value={f.biz_license} onChange={e=>set("biz_license", e.target.value)}
                placeholder="e.g. food truck permit, TABC, sales tax permit" />
              <label style={{ display:"flex", alignItems:"flex-start", gap:8, marginTop:8, cursor:"pointer" }}>
                <input type="checkbox" checked={f.license_not_required}
                  onChange={e=>set("license_not_required", e.target.checked)}
                  style={{ marginTop:2, accentColor:C.orange }} />
                <span style={{ fontSize:11.5, color:C.midGray, lineHeight:1.5 }}>
                  My service doesn't need a license or permit, and I'm responsible if that's wrong.
                </span>
              </label>
            </div>
            <label style={L}>Website or social page <Opt /></label>
            <input style={F} value={f.biz_website} onChange={e=>set("biz_website", e.target.value)} />

            {/* Languages and the checks PLUJ does by hand (shown to hosts as badges). */}
            <label style={L}>Languages you speak with clients *</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {VENDOR_LANGUAGES.map(([code, label]) => {
                const on = (f.languages || []).includes(code);
                return (
                  <button type="button" key={code} aria-pressed={on}
                    onClick={() => set("languages", on ? (f.languages || []).filter(x => x !== code) : [...(f.languages || []), code])}
                    style={{ padding:"6px 12px", borderRadius:99, fontSize:12, fontWeight:700, cursor:"pointer", minHeight:32,
                             border:`1.5px solid ${on ? "#000" : C.border}`, background: on ? "#000" : "#fff", color: on ? "#fff" : C.black }}>
                    {label}
                  </button>
                );
              })}
            </div>

            <div style={{ border:"1.5px solid #000", borderRadius:10, padding:"4px 12px 12px", marginTop:14 }}>
              <p style={{ margin:"8px 0 0", fontSize:12.5, fontWeight:800, color:C.black }}>Checks that earn you a badge <Opt /></p>
              <p style={{ margin:"3px 0 0", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
                PLUJ checks these by hand with the insurer or the state, then shows hosts a badge. Hosts see the badge, not your numbers.
                Changing a detail means it is checked again.
              </p>
              <label style={L}>Insurance company (certificate of insurance)</label>
              <input style={F} value={f.coi_insurer} onChange={e=>set("coi_insurer", e.target.value)} placeholder="e.g. State Farm, policy GL-123456" />
              <label style={L}>Certificate expires on</label>
              <input style={F} type="date" value={f.coi_expires_on || ""} onChange={e=>set("coi_expires_on", e.target.value)} />
              <CheckStatus at={f.coi_checked_at} filled={!!f.coi_insurer.trim()} />
              <label style={L}>Texas DSHS food permit number <span style={{ fontWeight:400, color:C.lightGray }}>(food trucks and caterers)</span></label>
              <input style={F} value={f.dshs_permit} onChange={e=>set("dshs_permit", e.target.value)} placeholder="Mobile food unit or food establishment permit" />
              <CheckStatus at={f.dshs_checked_at} filled={!!f.dshs_permit.trim()} />
              <label style={L}>TABC permit number <span style={{ fontWeight:400, color:C.lightGray }}>(if you serve alcohol)</span></label>
              <input style={F} value={f.tabc_permit} onChange={e=>set("tabc_permit", e.target.value)} placeholder="e.g. caterer's or seller-server certificate" />
              <CheckStatus at={f.tabc_checked_at} filled={!!f.tabc_permit.trim()} />
            </div>

            <label style={L}>Business photos <span style={{fontWeight:400}}>({f.photos.length}/{MAX_PHOTOS} — logo or team photo; first is the cover)</span></label>
            <PhotoManager photos={f.photos} onChange={(next) => set("photos", next)} size={78} />
            <input type="file" accept="image/*" multiple onChange={addPhotos}
              disabled={uploading || f.photos.length >= MAX_PHOTOS} style={{ fontSize:12 }} />
            {uploading && <p style={{ fontSize:11, color:C.midGray, margin:"6px 0 0" }}>Uploading…</p>}
            {!uploading && f.photos.length > 0 && (
              <p style={{ fontSize:11, color:"#B45309", margin:"6px 0 0", fontWeight:600 }}>
                ⚠ Press “Save business details” below or your photos won't be kept.
              </p>
            )}

            <button onClick={save} disabled={saving || uploading} className="btn"
              style={{ width:"100%", marginTop:18, padding:"12px 0", borderRadius:10, background:C.black,
                       color:"#fff", border:"none", fontSize:14, fontWeight:700,
                       opacity:(saving||uploading)?0.6:1 }}>
              {saving ? "Saving…" : "Save business details"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}



/* ══════════════════════════════════════════════════════════════════════════
   LEGAL & INFO CONTENT
   ══════════════════════════════════════════════════════════════════════════ */
const LEGAL_UPDATED = "October 2026";   /* month + year — update when the documents change */

/* "In plain words": a short summary at the top of each legal page, in
   English and (through the language switch) Spanish. It helps people read the
   page; the full text below it is what governs, and it says so. Keep each line
   true to the full text when either changes. */
const LEGAL_SUMMARY = {
  "Terms": [
    "PLUJ is a marketplace. You book independent local pros, and the contract for the service is between you and the pro.",
    "The price you see is the price you pay. PLUJ's fee is already inside it.",
    "Your money waits in the pro's locked Stripe balance and is paid out in parts. The last part goes only after the event, when you approve it or 3 days later.",
    "If a pro cancels, you get every dollar back and PLUJ finds you a replacement.",
    "If something goes wrong, press Report a problem before the last part is paid out, and the rest is frozen while we look into it.",
    "Disagreements go to individual arbitration in Texas, unless you opt out within 30 days. Claims of sexual assault or sexual harassment can always go to court.",
  ],
  "Privacy": [
    "We collect what bookings need: your account details, your event details and your messages.",
    "We never sell your data and never use it for ads. There are no ad trackers on PLUJ.",
    "If your browser sends Global Privacy Control, we honor it automatically.",
    "You can see, correct, download or delete your data. We answer within 45 days.",
    "We follow the Texas Data Privacy and Security Act for everyone. The Texas Attorney General enforces it.",
  ],
  "Cancellations and refunds": [
    "A request is free to send and free to cancel until the pro accepts it.",
    "Cancel a confirmed booking 7 or more days before and you get back all you paid, less fees. Closer to the date you get back less, and within 48 hours you can't cancel.",
    "If the pro cancels, you get back everything, fees included, and PLUJ finds you a replacement.",
    "If a pro doesn't show up, report it before the last payment is released.",
  ],
  "Marketplace rules": [
    "Tell the truth in everything you post.",
    "Keep your bookings, or cancel early and honestly.",
    "Treat everyone with respect. No harassment, threats or discrimination.",
    "Hold the licenses, permits and insurance your service needs.",
  ],
};

const INFO_CONTENT = {
  "About": [
    ["What PLUJ is", "PLUJ is an event marketplace that connects people planning events with local vendors — food, music, production and decor, and logistics — in one place."],
    ["How we review vendors", "Vendors describe their business and confirm that everything they tell us is true when they apply. Our team reviews each application before a listing goes live, and we can remove a listing at any time if standards are not met. Our review is not a guarantee: before you book, read the vendor's reviews and check them yourself."],
    ["Contact", "For questions, use the Help center or contact the vendor directly through their listing."],
  ],
  /* Plain-language guides, written 30 Sep 2026 for people who have never used
     PLUJ. Keep the button names here in step with the real buttons — a guide
     that says "press Submit" when the button says "Send" is worse than none. */
  "Host guide": [
    ["Who this is for", "A host is anyone planning an event and booking vendors for it — a birthday, a wedding, a corporate party. Browsing PLUJ is free and you don't need an account to look around."],
    ["1. Create your account", "Press Log in / Sign up at the top of the page, choose Sign up, and pick Host. Enter your name, email, a password, your phone number and date of birth (you must be 18 or older). On the next screen answer the quick human check, accept PLUJ's terms, tick the box confirming you'll check vendors yourself before you book, and press Create account & verify email."],
    ["2. Confirm your email", "We send you an email titled Confirm your email address. Open the newest one, tap Confirm my email address, then press Confirm my email on the PLUJ page that opens. The link works once and stops working after 10 minutes — if it has expired, sign up again with the same email or use Forgot password? to get a fresh link."],
    ["3. Find vendors", "Use the search bar at the top — where, when, what service and how many guests — or pick a category such as Food & Drinks or Music & Performance. PLUJ only shows vendors who serve your area, have room for your guest count and are free on your date. Not sure what you need? Build My Event asks a few questions and suggests a full lineup."],
    ["Check before you book", "PLUJ reviews every vendor before they go live, but we can't control or guarantee what vendors post or how they perform. Before you book or pay, read the vendor's reviews and listing, ask questions in Messages, check their website or social media, and get the price, deposit and cancellation terms in writing. If something feels wrong, don't pay, and report the vendor to us."],
    ["4. Build your lineup", "On any listing press Request to book to add it to your cart. Add as many vendors as you need — food, music, decor, rentals. Open the cart, set your event date, time, address and guest count once, and they apply to every vendor in it."],
    ["5. Send your requests", "In the cart press Send booking requests. A request is not a booking yet: each vendor reviews it and accepts or declines. You'll get a notification and an email either way."],
    ["6. Track and change requests", "Open your account (your initials at the top right) and go to My Requests. You can see each request's status, use Edit request to change the date, guests or venue while it's still pending, or cancel it. Cancelling a request that hasn't been accepted is always free."],
    ["7. Talk to your vendors", "Use Messages in your account to ask questions or share details. Conversations stay open until 3 days after the event."],
    ["8. Paying", "Prices on PLUJ are one price: they already include PLUJ's small service fee (none in your first 3 months), so nothing is added at checkout. When online payment is on for your booking, you'll see Pay in full in My Requests once the vendor confirms. You pay the whole price then, after ticking that you accept the payment terms. The vendor can't touch it yet: it's locked in their Stripe balance and released in parts, usually 30% a week before the event, 50% the day after, and 20% when you press Release the rest to the vendor (or automatically 3 days after). For vendors new to PLUJ, everything stays locked until after the event. If something goes wrong, press Report a problem before then and everything not yet released is frozen while PLUJ looks into it. If the vendor cancels, you get every dollar back and PLUJ finds you a replacement. If online payment isn't on for a booking, agree the price, deposit and payment method directly with the vendor. See Cancellations and refunds for what applies."],
    ["9. After the event", "Leave a review for each vendor. It helps other hosts and helps good vendors get booked. You can choose to show your name or stay a Verified customer."],
    ["Forgot your password?", "Press Log in / Sign up, enter your email and press Forgot password?. Open the newest email, tap the link, type your new password twice and press Save new password. You'll be signed in straight away."],
  ],
  "Vendor guide": [
    ["Who this is for", "A vendor is a business that provides a service at events — a DJ, a caterer, a food truck, a venue, a photographer, rentals. On PLUJ you have one business account and as many listings as services you offer."],
    ["1. Create your account", "Press Log in / Sign up, choose Sign up, and pick Vendor. Enter your name, your business name, a short description of your business (at least 40 characters: what you offer, the events you work and how long you've been doing it), your website or social media if you have one, email, password, phone and date of birth. On the next screen answer the human check, accept PLUJ's terms, tick the box confirming your business information is true and that you're responsible for what you post, and press Create vendor account."],
    ["2. Confirm your email", "Open the newest Confirm your email address email, tap the link, and press Confirm my email on the page that opens. The link works once and expires after 10 minutes. You'll land in your vendor dashboard."],
    ["3. Add your business details", "Your dashboard shows a short checklist. The first step is Add business details: business name, a short description of your business, business phone, city and ZIP, and the areas you work in. Then your legal information, which is required before you can post any listing: legal business name, business type, EIN, business street address, owners or managing members, and your license or permit number (or tick that your service doesn't need one). Your phone, address, EIN and owners are private — only PLUJ sees them. You can change all of this later under Business profile."],
    ["4. Create your listings", "A listing is one service hosts can book. A DJ who also rents a photo booth has two listings; a caterer with a taco truck and a dessert truck has two. Go to My listings and press Add listing. For each one set its own name, the category (Rentals can pick as many types as apply, other categories up to 3), a description, a starting price and how long it covers (a 4-hour set, a 24-hour rental, 3 hours of truck service), guest capacity, photos (up to 10, the first is the cover), where you'll travel, and the days and times it's offered. Pricing options can each have their own time, what's included, and anything the host must provide (power, space, parking). Switch on Instant booking for a listing with a fixed price and hosts can book your open dates (3+ days away) on the spot — you're notified straight away. Listings with good photos and a clear description get far more requests."],
    ["5. Approval", "PLUJ reviews your description, business details and listings, usually within 1–2 business days. We may message you to ask for proof that your business is real, such as a website, social media page or license. Your listings stay hidden until you're approved, then go live automatically. You'll get a notification in your dashboard and the checklist turns green."],
    ["6. Answer booking requests", "When a host sends a request it appears under Requests and in Notifications, and we email you. Open it to see the date, time, guest count, venue and message. Press Accept booking to confirm or Decline if you can't do it. Please answer quickly — hosts often send requests to several vendors and book whoever confirms first."],
    ["7. Keep your calendar honest", "Use Availability to block dates you're already booked or away. Days none of your listings work are shown there as Off automatically, and you can tap a listing to see just its days. In each listing you can also set how many events you take per day, how many hours you need between events, and how much notice you need. PLUJ won't show you to hosts for times you can't do."],
    ["8. Messages", "Use Messages to answer host questions before and after you accept. Conversations stay open until 3 days after the event."],
    ["9. Getting paid", "When online payment is on, press Set up payments with Stripe in your dashboard first: you need your own Stripe account (free) before you can confirm paid bookings, and Stripe checks your identity and bank account. When you confirm a booking you enter the total price and tick that you accept the payment terms. The host pays it all upfront into your Stripe balance, where it stays locked (your automatic payouts are off) until PLUJ releases it to your bank: 30% a week before the event, 50% the day after, and 20% when the host approves (or automatically 3 days after). While you're new, more is held until the event is done: 50% on your first PLUJ booking and 30% on your second, and until you have completed 3 bookings the first part is held until the day after the event as a refund reserve. The same reserve applies for 12 months after you cancel a confirmed booking. Stripe's fees come out under your agreement with Stripe, and after your first 3 months PLUJ's 3% service fee does too. If a host cancels 7 or more days before the event they get their money back less fees and you get nothing; closer to the event you keep part of it (30% at 5–7 days, 50% at 3–5 days, 75% at 2–3 days of what is left after fees), and hosts can't cancel within 48 hours. If you cancel, the host is refunded in full from your Stripe balance and PLUJ offers them other vendors. Refunds and card disputes are your responsibility; you answer disputes in your Stripe dashboard. If online payment isn't on, agree the price, deposit and payment method directly with the host, and put your cancellation terms in writing."],
    ["10. After the event", "Hosts can review you, and you can rate the host from the request. Reviews appear under Reviews."],
    ["Pausing or leaving", "Under Account settings you can pause your business (your listings come off the marketplace and come back when you log in again) or close your account for good."],
  ],
  "How it works": [
    ["1. Tell us about your event", "Enter where your event is, when it is, what service you need, and how many guests. We only show vendors who can actually serve those criteria."],
    ["2. Browse and compare", "Review vendor listings, photos, pricing, capacity, service areas and availability."],
    ["3. Send a request", "Send your event details to a vendor. Requests are not confirmed bookings."],
    ["4. The vendor confirms", "The vendor reviews your request and approves or declines it. You are notified either way. A booking is only confirmed once the vendor approves it."],
  ],
  "Help center": [
    ["I sent a request but haven't heard back", "Vendors approve or decline requests themselves. If a vendor has not responded, you can cancel the request and send it to another vendor."],
    ["How do I change or cancel a request?", "Open your account menu, go to My Requests, and use the cancel option on any pending request."],
    ["I'm a vendor — how do I edit my listing?", "Sign in to open your vendor dashboard. Go to My listings to edit a service, its price, photos or availability, or Business profile to edit your business details. Changes appear right away. The Vendor guide walks through everything."],
    ["Where are the step-by-step guides?", "See the Host guide and the Vendor guide, linked at the bottom of every page."],
    ["Why can't I see a vendor?", "Listings only appear once a vendor is approved, and results are filtered by your location, guest count and service criteria. Clearing your search criteria shows more results."],
  ],
  "Terms": [
    ["Agreement", "By creating an account or using PLUJ you agree to these Terms of Service, our Privacy Policy, and our Marketplace Rules. If you do not agree, do not use the platform."],
    ["Eligibility", "You must be at least 18 years old and able to enter into a binding contract. You must provide accurate information about yourself and, if you are a vendor, about your business."],
    ["Your account", "You are responsible for activity on your account and for keeping your password secure. Do not share your account or impersonate anyone else."],
    ["Bookings", "PLUJ is a marketplace. Requests sent through PLUJ are not confirmed until the vendor approves them. Contracts for services are between the customer and the vendor."],
    ["Enforcement — suspension and removal", "If you do not follow these Terms, the Marketplace Rules, or applicable law, we may limit, suspend, block, or permanently remove your account and any listings, with or without notice. This includes fraud or misrepresentation, fake or misleading listings or reviews, harassment or discrimination, unsafe or illegal activity, repeated failure to honor confirmed bookings, or attempts to take payment or users off-platform to avoid our rules."],
    ["What PLUJ is", "PLUJ connects you with local vendors and makes booking them simpler and faster. We are a venue for finding and booking independent vendors. We are not an event planner, a caterer, a venue operator, a staffing agency, an equipment supplier, or a party to any booking. We do not provide, perform, supervise, direct, inspect or control any service listed on the platform. Every contract for services is formed directly between the customer and the vendor."],
    ["Vendors are independent businesses", "Vendors are independent contractors. They are not employees, agents, partners, joint venturers or representatives of PLUJ, and nothing on the platform creates such a relationship. Vendors control their own pricing, staff, equipment, methods and schedules."],
    ["What our review does and does not mean", "We review vendor applications before a listing goes live. That review is limited to the information the vendor supplies about themselves. It is not an inspection, a background check, a criminal or credit check, a licence or insurance verification, a quality assessment, an endorsement, a recommendation, or a guarantee of any kind. We do not independently verify what a vendor tells us. You are solely responsible for satisfying yourself that a vendor is suitable, qualified, licensed and insured for your event."],
    ["Moderation is a right, not a promise", "We may, at our sole discretion and without notice or liability, decline an application, remove a listing, and suspend or permanently remove any vendor or customer. We may do so for poor reviews, complaints from other users, conduct we consider unsafe or dishonest, breach of these Terms or the Marketplace Rules, or any other reason. Nothing in this section obliges us to monitor the platform, investigate any report, act on any complaint, or remove any account, and we are not liable for acting or for declining to act. We do not promise that any particular vendor or customer has been reviewed, is currently in good standing, or will be removed if others complain about them."],
    ["You accept the risks of events", "Events carry inherent risks, including risks from food and beverages, alcohol, cooking and heating equipment, electrical and audio equipment, staging, decorations, structures, vehicles, crowds, venues and premises, and the acts of other people. You knowingly and voluntarily assume all such risks, whether or not foreseeable, arising out of any booking made through PLUJ or any interaction with another user, in person or otherwise."],
    ["Release", "To the maximum extent permitted by law, you release and forever discharge PLUJ and its owners, officers, employees, contractors and suppliers from any and all claims, demands, damages, losses, injuries, liabilities and causes of action, known or unknown, arising out of or relating to: any vendor or the services they provide or fail to provide; any customer or their conduct; any interaction, communication, meeting or event involving other users; the accuracy of any listing, price, photograph, description or availability; and any dispute between users. If you are a California resident you expressly waive California Civil Code section 1542 and any similar law in any jurisdiction."],
    ["No warranty", "The platform is provided as is and as available. To the maximum extent permitted by law, PLUJ disclaims all warranties of any kind, whether express, implied, statutory or otherwise, including any implied warranties of merchantability, fitness for a particular purpose, title, quiet enjoyment, accuracy and non-infringement. We do not warrant that the platform will be uninterrupted, timely, secure or error-free, that defects will be corrected, or that any listing, price, availability, review or vendor representation is accurate, complete or reliable."],
    ["Limitation of liability", "To the maximum extent permitted by law, PLUJ and its owners, officers, employees, contractors and suppliers will not be liable for any indirect, incidental, special, consequential, exemplary or punitive damages, or for any loss of profits, revenue, business, opportunity, data, goodwill, or the cost of substitute services, arising out of or relating to the platform, any booking, any vendor or customer, or any event, under any theory of liability including contract, tort, negligence, strict liability, warranty or statute, and whether or not we were advised of the possibility of such damages. To the maximum extent permitted by law, our total aggregate liability for all claims will not exceed the greater of the total service fees you paid to PLUJ in the twelve months before the event giving rise to the claim, the amount you paid through PLUJ for the specific booking giving rise to the claim, or 500 US dollars. These limitations apply even if a limited remedy fails of its essential purpose, and they are a fundamental basis of the bargain between us."],
    ["Reformation and savings", "If any limitation, disclaimer, release or waiver in these Terms is held unenforceable or overbroad, it will be modified and reformed to the minimum extent necessary to make it enforceable, and will otherwise remain in full force. It will not be struck out entirely, and its partial unenforceability will not affect any other provision. Nothing in these Terms excludes liability that cannot lawfully be excluded, including liability for fraud, gross negligence, willful misconduct, or death or personal injury caused by our negligence, and any such liability is limited to the maximum extent the law allows."],
    ["Vendor obligations and indemnity", "If you list services on PLUJ, you represent and warrant that you hold all licences, permits, certifications and registrations required for your services, including food handling, alcohol service and any venue or occupancy permits, and that you will perform the services safely, lawfully and as described in your listing. You agree to defend, indemnify and hold harmless PLUJ and its owners, officers, employees and suppliers from any claim, demand, investigation, loss, liability, damage, fine or expense, including reasonable legal fees, arising out of or relating to your services, your listings, your conduct, any injury to persons or damage to property connected with your services, your breach of these Terms, or your violation of any law or third-party right. This obligation survives termination of your account."],
    ["Vendors: you are responsible for what you post", "If you are a vendor, you are solely responsible and liable for every listing, photograph, description, price, availability, review response, message and any other content you post, and for the services you provide or fail to provide. Each time you post or update anything, you represent and warrant that all information you give PLUJ or hosts about yourself and your business is true, accurate, current, complete and not misleading; that you are the business or are authorized to act for it; that you actually offer, and are able to deliver, the services you list on the terms you list; and that every photograph shows your own work or work you have the right to use. You must keep this information up to date and correct anything that becomes untrue. You must not use PLUJ to defraud, deceive or scam anyone, including by taking a deposit or payment for services you do not intend to or cannot provide, impersonating another person or business, or posting fake listings. You are liable for any loss, damage or claim caused by information you provide that is false, misleading or inaccurate, and your indemnity in the section above covers it. PLUJ may remove any vendor it believes has provided false information, without notice, and may report suspected fraud to law enforcement and cooperate with any investigation. You confirm this statement separately when you create a vendor account."],
    ["Payments through PLUJ", "When online payment is enabled for a booking, the host pays the full price upfront through PLUJ when the vendor confirms. The payment is processed by Stripe and made directly to the vendor's own Stripe account: the vendor is the seller and the merchant for every payment. PLUJ does not receive or hold booking money; it only receives its service fees. The vendor's automatic payouts are turned off while they use PLUJ, so the money stays locked in the vendor's Stripe balance until PLUJ instructs Stripe to release it to the vendor's bank on the payout schedule below. Vendors must have their own Stripe account, complete Stripe's identity and bank verification, accept Stripe's services agreement, and authorize PLUJ to manage these payouts and to issue refunds from their Stripe balance as these Terms describe."],
    ["Payout schedule", "This schedule is part of the agreement between PLUJ, the host and the vendor for every booking paid through PLUJ. The booking money is released to the vendor's bank in three parts: the first part 7 days before the event starts; the second part at noon the day after the event; and the last part when the host approves the booking in My Requests or, if the host has not reported a problem by then, automatically 3 days after the event ends. The parts are 30%, 50% and 20%. On a vendor's first booking on PLUJ they are 30%, 20% and 50%, and on their second 30%, 40% and 30%. Matched to cancellations: before the event, PLUJ never releases more than the vendor would keep under the Cancellations and refunds page if the host cancelled that day. Refund reserve: until a vendor has 3 fully released bookings on PLUJ, and for 12 months after a vendor cancels a confirmed booking, the first part is held until the day after the event, so a cancellation by the vendor can be refunded in full from the locked balance. When the host pays less than 7 days before the event, a part that is already due is released straight away, subject to the refund reserve. Nothing is released while a problem report or a card dispute on the booking is open. Each booking shows its exact schedule and dates before the host pays and before the vendor confirms."],
    ["How hosts are protected", "Hosts are protected because money is released to the vendor in parts: if the host reports a problem before a part is released, or the host's bank opens a dispute, PLUJ freezes everything not yet released while it looks into it. This is not escrow. PLUJ is not an escrow agent, trustee, bank or payment processor, the money is in the vendor's Stripe balance and not with PLUJ, and PLUJ is not responsible for delays or decisions by Stripe, banks or card issuers, or for a vendor's incomplete Stripe account."],
    ["The PLUJ host guarantee", "PLUJ makes these commitments to every host who books and pays through PLUJ, and they are part of this agreement. One price: the total shown before you pay is the amount you are charged for that booking, including PLUJ's service fee, any extras you chose and any sales tax that applies; nothing is added at checkout. Your money waits for the event: it is released to the vendor only on the payout schedule above, and the last part only after the event. If the vendor cancels a confirmed booking, you get back everything you paid, including fees, from the vendor's Stripe balance, and PLUJ finds you a replacement: within one business day of the cancellation we send you approved vendors who offer the same service, are free on your date and cover your area. If a vendor does not show up or is not what was promised, press Report a problem before the last part is released, and everything not yet released is frozen while we look into it. You can reach real people at PLUJ, in English or Spanish. What the guarantee does not do: it is not insurance, PLUJ does not pay refunds or price differences from its own funds, and while PLUJ will look for a replacement it cannot promise that one is available on your date or at the same price."],
    ["Reporting a problem with a booking", "Until the money is fully released, the host can report a problem, such as a vendor who did not show up, a service that was not what was promised, or suspected fraud. Everything not yet released is then frozen. After considering what both parties tell us, PLUJ may, at its sole discretion, release it to the vendor, refund the host in whole or in part from the vendor's Stripe balance, or keep it frozen while we review. Hosts and vendors agree to cooperate and give us accurate information. PLUJ's decision is final as between PLUJ and the users, does not decide any other claim between them, and PLUJ is not liable for it. PLUJ never repays anything from its own funds. Reports that are knowingly false breach these Terms, and the person who makes one is liable for the loss it causes."],
    ["Instant booking", "A vendor may switch on instant booking for a listing. A host can then book that listing at its listed price for an open date at least 72 hours away, and the booking is confirmed at once on the vendor's behalf, without the vendor reviewing it. By switching it on, the vendor accepts every booking made this way as confirmed, at that price, under these Terms and the payment and cancellation rules, and agrees to keep their calendar and listing up to date. PLUJ only confirms instantly when the date is one the listing works, has not been blocked by the vendor, still has room, and meets the listing's notice and guest limits; otherwise the booking is sent to the vendor as an ordinary request."],
    ["Fees", "Service fees: none during an account's first three months on PLUJ. After that, PLUJ's service fee is 3% of each payment to a vendor, deducted from that payment, and the host pays a 1% service fee; each is counted from that person's own sign-up date. One price: every price a host sees on PLUJ already includes the host's service fee, so the amount shown on a listing is the amount charged and nothing is added at checkout. PLUJ's service fees are collected automatically through Stripe when each payment is made, and are not refunded if the payment is refunded or disputed. Stripe's own fees (card processing, payouts, disputes and any others) are charged by Stripe to the vendor's Stripe account under the vendor's agreement with Stripe; PLUJ does not pay them. Fees that apply are shown before payment. We may change our fees with notice; changes do not affect payments already made."],
    ["Refunds, reversals and chargebacks", "Refunds follow the Cancellations and refunds page, or PLUJ's decision on a reported problem, and are paid from the vendor's Stripe balance. Vendors authorize PLUJ to issue those refunds on their behalf. Refunds, chargebacks, card disputes and any negative balance on a vendor's Stripe account are between the host, the vendor, Stripe and the card issuer; PLUJ is not a party to them, is not responsible for any amount owed under them, and never pays a refund, chargeback or Stripe fee from its own funds. The vendor is responsible for refunds and chargebacks on their bookings, including after money has been released, and answers disputes in their own Stripe dashboard. The host authorizes the full charge when paying, agrees to report any problem on PLUJ before contacting their bank, and is responsible for any loss caused by a chargeback or claim they make that is false or made for a service they received. PLUJ keeps a record of each party's acceptance of these terms and may provide it as evidence in a dispute."],
    ["Insurance is between you and the other party", "PLUJ does not provide, arrange, broker, recommend or procure insurance of any kind, and nothing on the platform, including The PLUJ host guarantee, is an offer of insurance or a promise that PLUJ will pay any amount from its own funds. Vendors are solely responsible for deciding what insurance their business needs and for obtaining it, including any coverage a customer asks them to carry. Customers are solely responsible for deciding whether to obtain their own event or cancellation insurance. Any insurance requirement agreed between a customer and a vendor is a term of their own contract, not of these Terms, and PLUJ is not responsible for verifying that any policy exists, is in force, or covers any particular loss."],
    ["Customer indemnity", "You agree to defend, indemnify and hold harmless PLUJ from any claim arising out of your use of the platform, the content you post, your conduct at or in connection with an event, your breach of these Terms, or your violation of any law or third-party right."],
    ["Content posted by users", "Listings, photographs, descriptions, reviews and messages are created by users, not by PLUJ. We do not adopt, endorse or verify them, and we are not responsible for them. We may remove content at our discretion but are under no obligation to monitor it."],
    ["Hosts: check vendors before you book", "PLUJ does not and cannot control what vendors write or post, whether it is true, or whether a vendor will perform as promised, and our review of vendor applications is limited as described above. Before you book or pay any vendor, you are solely responsible for your own due diligence, including reading the vendor's listing and reviews carefully, asking questions through Messages, checking their website, social media and, where relevant, their licenses, permits and insurance, and getting the price, deposit, cancellation terms and what is included in writing. Reviews are the opinions of other users, and PLUJ does not verify them. Deciding to book and pay a vendor is your decision alone, made at your own risk. To the maximum extent permitted by law, PLUJ is not liable for any loss caused by a vendor's misrepresentation, fraud, non-performance, late or poor performance, or conduct, and the release and limitation of liability above apply. If something seems wrong, do not pay, and report the vendor to us. You confirm this statement separately when you create a host account."],
    ["Disputes between users", "Disagreements about services, quality, timing, damage or payment are between the customer and the vendor. PLUJ is not a party and has no obligation to intervene, mediate, refund or compensate, though we may assist and may act against accounts that breach the Marketplace Rules."],
    ["Talk to us first", "Before starting arbitration or any legal proceeding, you agree to contact us and allow 30 days to resolve the dispute informally. Both sides will negotiate in good faith during that period. Most problems are settled this way."],
    ["Binding arbitration", "If a dispute is not resolved within 30 days, you and PLUJ agree it will be resolved by binding individual arbitration administered by the American Arbitration Association under its Consumer Arbitration Rules, rather than in court, and each of you waives the right to a jury trial. Arbitration will take place in Harris County, Texas, or by video or telephone at your election. Either party may instead bring a qualifying individual claim in small claims court, and either party may seek injunctive relief in court to protect intellectual property. You may opt out of arbitration within 30 days of first accepting these Terms by emailing us your name, your account email, and a statement that you decline arbitration. Opting out does not affect anything else in these Terms."],
    ["Sexual assault and sexual harassment claims", "Nothing in these Terms requires you to arbitrate a claim of sexual assault or sexual harassment, or to bring it on your own rather than together with others. If you have such a claim arising out of or relating to PLUJ, an event booked through PLUJ, or anyone you met through PLUJ, you may choose to bring it in court instead of arbitration, as the Ending Forced Arbitration of Sexual Assault and Sexual Harassment Act of 2021 allows. The choice is yours alone, and PLUJ will not require you to keep the claim or its outcome confidential as a condition of settling it."],
    ["No class actions", "Claims must be brought individually. You and PLUJ each waive any right to bring or participate in a class, collective, consolidated or representative action, except as the section on sexual assault and sexual harassment claims allows. If this waiver is unenforceable for a particular claim, the arbitration agreement does not apply to that claim and it must proceed in court."],
    ["Time limit on claims", "To the maximum extent permitted by law, any claim arising out of or relating to the platform must be filed within one year after it arises, or it is permanently barred."],
    ["Governing law and venue", "These Terms are governed by the laws of the State of Texas, without regard to its conflict of law rules. Subject to the arbitration section, the state and federal courts in Harris County, Texas have exclusive jurisdiction, and both parties consent to that jurisdiction and venue."],
    ["Copyright and takedowns", "Do not post material you do not have the right to use. If you believe content on PLUJ infringes your copyright, email us identifying the work and where it appears, your contact details, a statement of good-faith belief that the use is unauthorised, and a statement under penalty of perjury that your notice is accurate and that you are authorised to act. We remove infringing content and terminate repeat infringers."],
    ["Suspension and termination", "We may suspend or terminate any account that breaches these Terms, the Marketplace Rules or the law, or that creates risk for other users, at our discretion and without liability. You may close your account at any time from your account menu. Provisions that should by their nature survive termination will survive it, including the release, disclaimers, limitations, indemnities and dispute resolution terms."],
    ["Severability and entire agreement", "If any provision is unenforceable, the remainder stays in force. These Terms, together with the Privacy Policy, the Cancellations and refunds page and the Marketplace Rules, are the entire agreement between you and PLUJ."],
    ["Acceptance", "By creating an account, ticking the acceptance box, or using the platform, you agree to these Terms, the Cancellations and refunds page, the Marketplace Rules and the Privacy Policy. When you sign up you also tick a second box: vendors confirm the statement in Vendors: you are responsible for what you post, and hosts confirm the statement in Hosts: check vendors before you book. We record the date and the version you accepted, and the date you ticked the second box. If we change these Terms materially we will ask you to accept the new version."],
    ["Changes", "We may update these Terms. Continuing to use PLUJ after an update means you accept the revised Terms."],
  ],
  "Privacy": [
    ["What we collect", "Account details you provide (name, email, phone, date of birth), vendor business information and documents, listing content and photos, and booking requests you send or receive."],
    ["How we use it", "To operate the marketplace: creating your account, verifying vendors, showing listings, delivering booking requests, and providing support."],
    ["What we share", "When you send a booking request, the vendor receives the event details you provided. Vendor listing information is public. We share data with the service providers listed below only so they can run PLUJ for us. We do not sell your personal information, we do not use it for targeted advertising, and we do not use it for profiling that leads to decisions with legal or similarly significant effects on you."],
    ["Verification documents", "Documents submitted during vendor verification are stored for review and are not shown publicly on listings."],
    ["Your choices", "You can edit your profile and listing information at any time."],
    ["Deleting your account", "You can permanently delete your account and its data at any time from your account menu, under Profile then Account settings. You do not need to contact us. Deletion removes your profile, listings, bookings, messages and reviews, and cannot be undone. If you only want to pause, deactivate instead — in the same place: your listings come down and bookings stop, but nothing is erased."],
    ["How long we keep things", "We keep your account data until you delete it. We may retain limited records where we are legally required to, such as transaction records for tax and accounting, and a record of your acceptance of our Terms."],
    ["Cookies and browser storage", "PLUJ stores your sign-in session, your cart, your saved vendors and your display preferences, including your language, in your browser. These are needed for the site to work. PLUJ uses no advertising cookies, no third-party trackers and no ad pixels. Clearing your browser storage signs you out and empties your cart."],
    ["Who processes data for us", "We use Supabase for our database and sign-in, Vercel for hosting, and Resend for sending email. Where online payment is enabled, Stripe processes payments and receives the information needed to do so, and Stripe verifies vendors' identity and bank details so they can be paid. Each handles data on our behalf under its own terms. We do not sell your personal information, and we do not share it for cross-context behavioural advertising as those terms are defined under California law."],
    ["Staff access", "Our administrators can access account records and, where necessary to investigate a report or a dispute, the messages exchanged between users on the platform. We access messages only when there is a specific reason to."],
    ["Your rights", "Wherever you live, you can ask to see the personal data we hold about you, correct it, delete it, or get a copy in a format you can take elsewhere, and you can opt out of any sale of your data, targeted advertising or profiling (we do none of these). Use the tools in your account menu or email us. We answer every request within 45 days. If we need more time, we may extend that once by up to 45 more days and will tell you why within the first 45. Requests are free, up to twice a year. We will not deny you service, charge you a different price or give you a lower quality of service because you used these rights."],
    ["Texas residents: the Texas Data Privacy and Security Act", "PLUJ is based in Houston and follows the Texas Data Privacy and Security Act (TDPSA) for every user, whether or not the Act applies to a business our size. Under it you have the rights above. We also ask your consent before processing any sensitive data (we do not currently collect any, as the Act defines it), we limit what we collect to what is adequate, relevant and necessary for the purposes on this page, and we keep reasonable security for your data. If we decline a request, we will tell you why, and you can appeal by replying to that email or by emailing us with the subject Privacy appeal. We answer appeals within 60 days and explain our decision in writing. If we deny your appeal, you can file a complaint with the Texas Attorney General at texasattorneygeneral.gov. The Attorney General enforces the TDPSA and can seek civil penalties of up to $7,500 for each violation."],
    ["Global Privacy Control", "If your browser or a browser extension sends a Global Privacy Control (GPC) signal, PLUJ treats it as your request to opt out of the sale of your personal data and of targeted advertising, without you having to do anything else. We do neither in any case, so we also switch off PLUJ's own usage statistics for that browser. A Do Not Track signal is treated the same way."],
    ["If there is a breach", "If a security incident affects your personal information we will notify you, and any regulator required by law, as promptly as we reasonably can."],
  ],
  "Cancellations and refunds": [
    ["What applies today", "Booking requests are free to send and free to cancel. When online payment is enabled for a booking, your booking screen shows the payment schedule; otherwise money changes hands directly between you and the vendor. The terms below govern payments made through PLUJ."],
    ["How payment works", "You pay the full price when the vendor confirms, to secure your date. It goes into the vendor's own Stripe account but stays locked there, and is released to the vendor in parts: usually 30% seven days before the event, 50% the day after, and the last 20% when you approve it in My Requests, or automatically 3 days after the event if you haven't reported a problem. Until a vendor has completed 3 bookings on PLUJ, nothing is released before the day after the event, so a cancellation by the vendor can always be refunded in full. Your booking shows the exact schedule, and the payout schedule in the Terms is part of your agreement."],
    ["Before a vendor accepts", "A request that has not been accepted is not a booking. You can withdraw it at any time at no cost, and nothing is charged."],
    ["What a refund applies to", "A refund applies to what you have paid so far. When a booking is cancelled, payments that weren't due yet are cancelled and never charged."],
    ["If you cancel a confirmed booking", "When online payment is enabled, PLUJ keeps its service fees and Stripe keeps its card processing fee; of what is left, you get back: all of it if you cancel 7 or more days before the event start time (the vendor receives nothing); 70 percent 5 to 7 days before; 50 percent 3 to 5 days before; 25 percent 2 to 3 days before. A paid booking cannot be cancelled by the host within 48 hours of the event. Refunds are paid from the vendor's Stripe balance. When online payment is not enabled, a booking is free to cancel until 48 hours before the event, after which a late-cancellation fee applies. The terms for your booking are shown before you pay and are recorded with the booking, so a vendor changing their policy later cannot change yours."],
    ["What less fees means", "The card processing fee charged by Stripe and PLUJ's service fees are not returned when you cancel. They are charged when the payment is taken and are not recoverable afterwards. A refund described as full means the amount you paid less those fees."],
    ["If the vendor cancels", "You get back everything you paid, including all fees, whatever the timing, from the vendor's Stripe balance, and PLUJ finds you a replacement: within one business day we send you approved vendors who offer the same service, are free on your date and cover your area. See The PLUJ host guarantee in the Terms."],
    ["Changing a confirmed booking", "Changing the date, guest count or location needs the vendor to approve it, and re-opens the request until they do. If they decline, the original booking stands and the schedule above continues to apply. Changes are not accepted within 48 hours of the event."],
    ["If a vendor does not turn up, or something is wrong", "Press Report a problem on the booking in My Requests before the money is fully released (up to 3 days after the event). Everything not yet released is frozen while we look into it with both parties, and PLUJ may refund you in full or in part from the vendor's Stripe balance. After everything has been released, message the vendor and contact us within 7 days and we will help, but PLUJ does not refund money from its own funds. PLUJ does not perform the services and is not the vendor, but no-shows and misrepresentation are grounds for removal from the marketplace."],
    ["Before you contact your bank", "Contact the vendor and us first. A chargeback takes months to resolve, and we can usually help settle it faster. A chargeback is between you, your card issuer, the vendor and Stripe, and raising one does not remove your obligations under these terms."],
  ],

  "Marketplace rules": [
    ["Tell the truth", "Everything you post must be true and reflect what you actually offer: your business details, description, listings, photos, pricing, capacity and availability. Vendors are responsible and liable for every post. Do not post photos of work that is not yours."],
    ["Honor your commitments", "Vendors should respond to requests promptly and honor confirmed bookings. Customers should provide accurate event details."],
    ["Communicate respectfully", "No harassment, hate speech, threats, or discrimination of any kind."],
    ["Keep it legal and safe", "You must hold the licenses, permits and insurance required for the services you provide, and comply with all applicable laws."],
    ["No manipulation", "No fake reviews, fake accounts, or schemes to inflate ratings or bypass platform rules."],
    ["No scams or fraud", "Never take a deposit or payment for a service you don't intend to or can't deliver, impersonate another person or business, post fake listings, or pressure hosts to pay in ways meant to get around PLUJ's rules. Suspected fraud leads to immediate removal and may be reported to law enforcement."],
    ["Hosts: check before you book", "Read each vendor's reviews and listing, ask questions in Messages, and get the price, deposit and cancellation terms in writing before you pay. PLUJ reviews vendor applications but can't guarantee any vendor, and booking a vendor is your decision."],
    ["Consequences", "Breaking these rules can result in a warning, listing removal, suspension, or permanent removal from PLUJ. Serious violations may be reported to the relevant authorities."],
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   PAYMENTS: what hosts and vendors see on a booking
   ══════════════════════════════════════════════════════════════════════════ */
const PAY_KIND = { retainer: "First release", event_day: "Second release", final: "Final release" };
const PROBLEM_KINDS = [
  ["no_show",          "The vendor didn't show up"],
  ["not_as_described", "The service wasn't what was promised"],
  ["scam",             "I think this vendor is a scam"],
  ["other",            "Something else"],
];
export function fmtUSD(cents) {
  return "$" + ((cents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtHouston(iso, withTime = true) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) });
}
function chargedCentsOf(p) {
  return (p.amount_cents || 0) + (p.host_fee_cents || 0) + (p.host_service_fee_cents || 0);
}

/* The payment on one booking: pay in full, then see each part released.
   Renders nothing for bookings without payments. */
export function BookingPayments({ req, user, onChanged }) {
  const [info, setInfo]       = useState(null);
  const [busy, setBusy]       = useState("");
  const [err, setErr]         = useState("");
  const [msg, setMsg]         = useState("");
  const [reporting, setRep]   = useState(false);
  const [kind, setKind]       = useState("");
  const [details, setDetails] = useState("");
  const [agree, setAgree]     = useState(false);

  const reqId = req && req.id;
  const load = React.useCallback(() => {
    if (!reqId) return;
    getBookingPaymentInfo(reqId).then(setInfo).catch(() => {});
  }, [reqId]);
  useEffect(() => { load(); }, [load]);
  /* Payments change in the background (scheduler, webhook): refresh now and then. */
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (!info) return null;
  const { plan, payments, problems } = info;
  const isHost   = user && user.id === plan.host_id;
  const isVendor = user && user.id === plan.vendor_id;
  if (!isHost && !isVendor) return null;

  const openProblem = problems.find(p => p.status === "open");
  const unpaid      = payments.filter(p => p.status === "scheduled" || p.status === "failed");
  const paid        = payments.some(p => p.status === "paid");
  const locked      = payments.filter(p => p.status === "paid" && !p.transferred_at);
  const toPay       = unpaid.reduce((n, p) => n + chargedCentsOf(p), 0);
  const lockedCents = locked.reduce((n, p) => n + Math.max(0, chargedCentsOf(p) - (p.refunded_cents || 0)), 0);

  async function run(label, fn) {
    setBusy(label); setErr(""); setMsg("");
    const r = await fn();
    setBusy("");
    if (r && r.error) { setErr(r.error); return false; }
    if (r && r.url) { window.location.href = r.url; return true; }
    load();
    if (onChanged) onChanged();
    return true;
  }

  const chip = (() => {
    if (plan.status === "on_hold") return ["Frozen", "#FEF2F2", "#B91C1C"];
    if (plan.status === "cancelled") {
      if (plan.refund_state === "pending") return ["Cancelled · refund in progress", "#FFFBEB", "#B45309"];
      if (plan.refund_state === "done")    return ["Cancelled · refunded", "#F3F4F6", C.midGray];
      return ["Cancelled", "#F3F4F6", C.midGray];
    }
    if (plan.status === "released") return ["Fully released", C.greenSoft, C.green];
    if (!paid) return ["Awaiting payment", "#FFF7ED", "#C2410C"];
    return ["Paid · locked in Stripe", "#EFF6FF", "#1D4ED8"];
  })();

  const btn = (bg, fg, bd) => ({ padding:"8px 12px", borderRadius:9, fontSize:12, fontWeight:800, cursor:"pointer",
                                 background:bg, color:fg, border: bd ? `1px solid ${bd}` : "none" });

  return (
    <div onClick={e => e.stopPropagation()}
      style={{ marginTop:10, background:"#fff", border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 12px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:6 }}>
        <p style={{ margin:0, fontSize:12, fontWeight:800, color:C.black }}>💳 Payment · {fmtUSD(plan.total_cents)}</p>
        <span style={{ fontSize:10.5, fontWeight:800, padding:"2px 9px", borderRadius:99, background:chip[1], color:chip[2] }}>
          {chip[0]}
        </span>
      </div>

      {/* Host: pay the full price, after accepting the terms */}
      {isHost && unpaid.length > 0 && plan.status === "active" && (
        <div style={{ background:"#FFF7ED", border:"1px solid #FED7AA", borderRadius:10, padding:"9px 11px", marginBottom:8 }}>
          <p style={{ margin:0, fontSize:12, fontWeight:700, color:C.black, lineHeight:1.5 }}>
            Pay {fmtUSD(toPay)} in full to secure your date. The vendor can't touch it yet: it's locked in their Stripe
            balance and released in parts, and the last part only when you approve it after the event.
          </p>
          <label style={{ display:"flex", gap:8, alignItems:"flex-start", marginTop:7, fontSize:11.5, color:C.black, lineHeight:1.5, cursor:"pointer" }}>
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop:2 }} />
            <span>
              I authorize this charge of the full amount now. I agree to PLUJ's Terms and the Cancellations and refunds
              policy, including how the money is released. I will report any problem on PLUJ before contacting my bank, and
              I understand I am responsible for any chargeback or claim I make that is false.
            </span>
          </label>
          <button className="btn" disabled={!!busy || !agree} style={{ ...btn(C.orange, "#fff"), marginTop:8, opacity: agree ? 1 : 0.55 }}
            onClick={() => run("pay", () => paymentsCall("pay", { booking_id: plan.booking_id, accept_terms: true, lang: getLang() }))}>
            {busy === "pay" ? "Opening…" : `Pay ${fmtUSD(toPay)} in full`}
          </button>
        </div>
      )}

      {/* The three parts and when each is released */}
      {payments.map(p => {
        const amount = isHost ? chargedCentsOf(p) : p.amount_cents;
        let state;
        if (p.status === "cancelled") state = "Cancelled";
        else if (p.status !== "paid") state = "Not paid yet · released " + fmtHouston(p.due_at, false);
        else if (p.transferred_at) state = "Released to the vendor " + fmtHouston(p.transferred_at, false);
        else if (plan.status === "on_hold") state = "Locked · frozen";
        else if (p.kind === "final" && !plan.host_approved_at)
          state = `Locked · released when ${isHost ? "you approve it" : "the host approves it"}, or ${fmtHouston(p.due_at, false)}`;
        else state = "Locked · released " + fmtHouston(p.due_at);
        return (
          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderTop:`1px solid ${C.border}` }}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:C.black }}>{PAY_KIND[p.kind]} · {Number(p.percent)}%</p>
              <p style={{ margin:"1px 0 0", fontSize:11, color:C.midGray }}>
                {state}{p.refunded_cents > 0 ? ` · ${fmtUSD(p.refunded_cents)} refunded` : ""}
              </p>
            </div>
            <span style={{ fontSize:12.5, fontWeight:800, color:C.black }}>{fmtUSD(amount)}</span>
          </div>
        );
      })}

      {/* What happens to the money, in plain words */}
      <p style={{ margin:"8px 0 0", fontSize:11, color:C.midGray, lineHeight:1.55 }}>
        {plan.status === "cancelled" ? (
          plan.refund_percent != null
            ? `This booking was cancelled. ${Number(plan.refund_percent) > 0 ? "Refunds follow PLUJ's cancellation policy." : "Under PLUJ's cancellation policy no refund is due."}`
            : "This booking was cancelled."
        ) : plan.status === "released" ? (
          isHost ? "All the money has been released to the vendor. If something went wrong, message the vendor first, then contact PLUJ."
                 : "All the money has been released to your bank."
        ) : openProblem ? (
          isHost ? `You reported a problem on ${fmtHouston(openProblem.created_at, false)}. Everything not yet released (${fmtUSD(lockedCents)}) is frozen while PLUJ looks into it.`
                 : "The host reported a problem. Everything not yet released to you is frozen while PLUJ looks into it, and we may message you for details."
        ) : plan.status === "on_hold" ? (
          "Releases are frozen" + (plan.hold_reason ? ` (${plan.hold_reason.toLowerCase()}).` : ".")
        ) : !paid ? (
          isHost ? "Nothing is released to the vendor until you've paid, and then only in parts."
                 : "Waiting for the host to pay in full. You'll be notified when they do."
        ) : isHost ? (
          `${fmtUSD(lockedCents)} is still locked. If something goes wrong, press Report a problem before it's released and it stays frozen.`
        ) : (
          "The host paid in full. It's locked in your Stripe balance and released to your bank on the dates above, less Stripe's fees and any PLUJ service fee."
        )}
      </p>

      {/* Host: release the rest, or report a problem */}
      {isHost && !reporting && paid && locked.length > 0 && plan.status !== "cancelled" && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
          {plan.status === "active" && !plan.host_approved_at && !openProblem && (
            <button className="btn" disabled={!!busy} style={btn(C.green, "#fff")}
              onClick={() => {
                if (!window.confirm(`Release the remaining ${fmtUSD(lockedCents)} to the vendor now?\n\nOnly do this once you're happy with the service. It can't be undone.`)) return;
                run("rel", () => paymentsRpc("approve_payment_release", { p_booking_id: plan.booking_id }))
                  .then(ok => ok && setMsg("Released. The vendor gets it within a few minutes."));
              }}>
              {busy === "rel" ? "Releasing…" : "Release the rest to the vendor"}
            </button>
          )}
          {!openProblem && plan.status === "active" && (
            <button className="btn" disabled={!!busy} style={btn("#FEF2F2", "#B91C1C", "#FCA5A5")}
              onClick={() => { setRep(true); setErr(""); }}>
              Report a problem
            </button>
          )}
        </div>
      )}
      {isHost && reporting && (
        <div style={{ marginTop:8, background:"#FEF2F2", border:"1px solid #FCA5A5", borderRadius:10, padding:"9px 11px" }}>
          <p style={{ margin:"0 0 6px", fontSize:12, fontWeight:800, color:"#991B1B" }}>
            What went wrong? Everything not yet released is frozen while PLUJ looks into it.
          </p>
          <select value={kind} onChange={e => setKind(e.target.value)}
            style={{ width:"100%", height:36, borderRadius:8, border:`1px solid ${C.border}`, fontSize:12.5, padding:"0 8px", marginBottom:6 }}>
            <option value="">Choose one…</option>
            {PROBLEM_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={2000}
            placeholder="Tell us what happened: dates, what was promised, what you've tried. False reports breach PLUJ's Terms."
            style={{ width:"100%", minHeight:70, borderRadius:8, border:`1px solid ${C.border}`, fontSize:12.5,
                     padding:"7px 9px", resize:"vertical", boxSizing:"border-box", fontFamily:"'Figtree', system-ui, sans-serif" }} />
          <div style={{ display:"flex", gap:6, marginTop:6 }}>
            <button className="btn" disabled={!!busy || !kind || details.trim().length < 10} style={btn("#B91C1C", "#fff")}
              onClick={() => run("rep", () => paymentsRpc("report_booking_problem",
                { p_booking_id: plan.booking_id, p_kind: kind, p_details: details.trim() }))
                .then(ok => { if (ok) { setRep(false); setKind(""); setDetails("");
                  setMsg("Reported. Everything not yet released is frozen, and PLUJ will contact you."); } })}>
              {busy === "rep" ? "Sending…" : "Send report"}
            </button>
            <button className="btn" disabled={!!busy} style={btn("#fff", C.midGray, C.border)}
              onClick={() => setRep(false)}>Cancel</button>
          </div>
        </div>
      )}

      {err && <p style={{ margin:"8px 0 0", fontSize:11.5, color:"#B91C1C", fontWeight:600 }}>⚠ {err}</p>}
      {msg && <p style={{ margin:"8px 0 0", fontSize:11.5, color:C.green, fontWeight:700 }}>✓ {msg}</p>}
    </div>
  );
}

/* Vendors tick this once per booking they confirm; remembered here so
   confirmPricePayload can send it with the confirmation. */
const _vendorTermsOk = {};

/* Vendor confirming a request while payments are on: they confirm the total
   price, and accept the payment terms. */
export function ConfirmPriceField({ req, value, onChange }) {
  const [ok, setOk] = useState(!!_vendorTermsOk[req.id]);
  if (!paymentsOn()) return null;
  return (
    <div onClick={e => e.stopPropagation()} style={{ marginTop:8 }}>
      <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.midGray, marginBottom:3 }}>
        Total price for this booking (USD)
      </label>
      <input type="number" min="10" step="0.01" inputMode="decimal" value={value}
        placeholder={req.packagePrice != null ? String(Number(req.packagePrice) + (Number(req.addonsTotal) || 0)) : "e.g. 450"}
        onChange={e => onChange(e.target.value)}
        style={{ width:"100%", height:38, borderRadius:9, border:`1px solid ${C.border}`, padding:"0 10px",
                 fontSize:14, fontWeight:700, boxSizing:"border-box" }} />
      <p style={{ margin:"3px 0 0", fontSize:10.5, color:C.lightGray, lineHeight:1.5 }}>
        The host pays it all upfront into your Stripe balance. It's locked there and released to your bank in three parts:
        a week before the event, the day after, and when the host approves (or 3 days after). While you're new to PLUJ,
        more is held until after the event.
      </p>
      <label style={{ display:"flex", gap:8, alignItems:"flex-start", marginTop:6, fontSize:11, color:C.black, lineHeight:1.5, cursor:"pointer" }}>
        <input type="checkbox" checked={ok} style={{ marginTop:2 }}
          onChange={e => { _vendorTermsOk[req.id] = e.target.checked; setOk(e.target.checked); }} />
        <span>
          I will deliver this booking as described. I agree the host's payment stays locked in my Stripe balance until
          PLUJ releases it, that PLUJ may refund the host from it under the cancellation policy or a reported problem,
          and that I alone am responsible for refunds, chargebacks and Stripe's fees on this booking.
        </span>
      </label>
    </div>
  );
}

/* Checks the price and the terms before a vendor confirms; returns the
   update to send, or an error message. */
export function confirmPricePayload(req, draft) {
  if (!paymentsOn()) return { extra: {} };
  const raw = draft !== undefined && draft !== "" ? draft : (req.packagePrice != null ? String(Number(req.packagePrice) + (Number(req.addonsTotal) || 0)) : "");
  const n = Math.round(Number(raw) * 100) / 100;
  if (!isFinite(n) || n < 10) return { error: "Enter the total price for this booking (at least $10) before confirming." };
  if (!_vendorTermsOk[req.id]) return { error: "Tick the box to accept the payment terms before confirming." };
  return { extra: { total_price: n, payment_terms_accepted: true } };
}

/* Vendor dashboard: connect Stripe so hosts can pay you. */
export function VendorPayoutsCard({ user }) {
  const [vp, setVp]     = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");
  useEffect(() => {
    sb.from("vendor_profiles")
      .select("stripe_account_id, stripe_details_submitted, stripe_charges_enabled, stripe_payouts_locked, stripe_payouts_enabled")
      .eq("id", user.id).single().get().then(({ data }) => setVp(data || {}));
  }, [user.id]);
  if (!paymentsOn() || !vp) return null;

  const ready = !!vp.stripe_charges_enabled && !!vp.stripe_payouts_locked;
  const started = !!vp.stripe_account_id;
  async function go(action) {
    setBusy(true); setErr("");
    const r = await paymentsCall(action);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    if (r.url) window.location.href = r.url;
  }
  return (
    <div style={{ background: ready ? C.greenSoft : "#FFF7ED", border:`1px solid ${ready ? C.green + "55" : "#FED7AA"}`,
                  borderRadius:14, padding:"14px 16px", marginBottom:14 }}>
      <p style={{ margin:0, fontSize:14, fontWeight:800, color:C.black }}>
        {ready ? "✓ Stripe payments set up" : "💳 Get paid with Stripe"}
      </p>
      <p style={{ margin:"4px 0 10px", fontSize:12, color:C.midGray, lineHeight:1.55 }}>
        {ready
          ? "Hosts pay in full upfront into your own Stripe balance. PLUJ releases it to your bank in parts (usually 30% a week before the event, 50% the day after, 20% when the host approves; until you've completed 3 bookings nothing is released before the event), so your automatic payouts stay off. Refunds and card disputes are handled in your Stripe dashboard."
          : started
            ? "Stripe still needs a few details (identity and bank account) before hosts can pay you."
            : "You need your own Stripe account (free) before you can confirm paid bookings: hosts pay in full upfront into it, and PLUJ releases the money to your bank in parts. Stripe checks your identity and bank account, which also shows hosts you're a real business. It takes about 5 minutes."}
      </p>
      <button className="btn" disabled={busy} onClick={() => go(ready ? "vendor_dashboard" : "vendor_connect")}
        style={{ padding:"9px 16px", borderRadius:10, border:"none", fontSize:13, fontWeight:800,
                 background: ready ? "#fff" : C.orange, color: ready ? C.black : "#fff",
                 boxShadow: ready ? `inset 0 0 0 1px ${C.border}` : "none" }}>
        {busy ? "Opening Stripe…" : ready ? "Open Stripe dashboard" : started ? "Finish Stripe setup" : "Set up payments with Stripe"}
      </button>
      {err && <p style={{ margin:"8px 0 0", fontSize:11.5, color:"#B91C1C", fontWeight:600 }}>⚠ {err}</p>}
    </div>
  );
}

/* Coming back from Stripe Checkout or Stripe onboarding: /?payment=success…
   or /?stripe=return. Read on the first render, like email links, because
   the "URL follows the view" effect clears the query string right after. */
function readPaymentReturnFromUrl() {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search || "");
  const p = q.get("payment");
  if (p === "success" || p === "cancelled") return { kind: "payment", result: p, booking: q.get("booking") || "" };
  const s = q.get("stripe");
  if (s === "return" || s === "refresh") return { kind: "stripe", result: s };
  return null;
}

export function InfoPageModal({ page, onClose }) {
  /* Fetched on open so a changed address appears without a redeploy. */
  const [contact, setContact] = useState(_platformSettings);
  useEffect(() => { loadPlatformSettings().then(s => setContact({ ...s })); }, []);
  const sections = INFO_CONTENT[page] || [];
  /* Escape closes it. */
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* Mobile browsers report `vh` taller than the visible area (the URL bar is
     counted), which can push a header/footer off-screen and trap the reader.
     Measuring the real viewport avoids that; `dvh` is used where supported. */
  const [vh, setVh] = useState(typeof window !== "undefined" ? window.innerHeight : 800);
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  const panelMax = Math.max(280, Math.round(vh * 0.94));

  /* IMPORTANT: this modal is opened from inside the signup card, which uses a
     CSS transform (the fade-up animation) and overflow:hidden. A transformed
     ancestor becomes the containing block for position:fixed children, so
     without a portal this panel gets clipped inside that small card — which is
     what made the terms unreadable and impossible to scroll. Rendering into
     document.body lifts it out to the real viewport. */
  const body = typeof document !== "undefined" ? document.body : null;

  const ui = (
    <div className="modal-overlay" onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1500,
               display:"flex", alignItems:"center", justifyContent:"center", padding:"10px 12px" }}>

      {/* Always-visible escape hatch, anchored to the viewport itself so it can
          never scroll away or be clipped, whatever the layout does. */}
      <button onClick={onClose} aria-label="Close"
        style={{ position:"fixed", top:14, right:14, zIndex:1600, width:42, height:42,
                 borderRadius:99, border:"none", cursor:"pointer",
                 background:"rgba(255,255,255,0.95)", color:"#111", fontSize:19, lineHeight:1,
                 boxShadow:"0 2px 10px rgba(0,0,0,0.3)", display:"flex",
                 alignItems:"center", justifyContent:"center" }}>✕</button>

      <div onClick={e=>e.stopPropagation()}
        style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:1100,
                 height:panelMax, maxHeight:panelMax,
                 display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Header — stays put while the text scrolls */}
        <div style={{ padding:"14px 20px 10px", borderBottom:`1px solid ${C.border}`,
                      flexShrink:0, background:"#fff" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
            <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>{page}</h2>
            <button onClick={onClose} className="btn" aria-label="Close"
              style={{ border:"none", background:"#F3F4F6", borderRadius:99, width:34, height:34,
                       fontSize:16, lineHeight:1, cursor:"pointer", flexShrink:0, color:C.black }}>✕</button>
          </div>
          <p style={{ fontSize:11, color:"#888", margin:"5px 0 0" }}>
            Last updated {LEGAL_UPDATED} · scroll to read it all
          </p>
          {getLang() === "es" && ["Terms","Privacy","Cancellations and refunds","Marketplace rules"].includes(page) && (
            <p data-no-translate style={{ fontSize:11, color:"#92400E", background:"#FFFBEB", borderRadius:8,
                                          padding:"5px 8px", margin:"6px 0 0", lineHeight:1.5 }}>
              Traducción de cortesía. Si hay alguna diferencia entre esta versión y la versión en inglés, prevalece la versión en inglés.
            </p>
          )}
        </div>

        {/* Only this scrolls. overscrollBehavior keeps the scroll inside the
            panel instead of handing it to the page behind. */}
        <div style={{ overflowY:"scroll", padding:"14px 20px 20px", flex:"1 1 auto", minHeight:0,
                      WebkitOverflowScrolling:"touch", overscrollBehavior:"contain",
                      touchAction:"pan-y" }}>
          {LEGAL_SUMMARY[page] && (
            <section aria-label="In plain words"
              style={{ border:"2px solid #000", borderRadius:6, padding:"14px 16px 6px", margin:"0 0 22px" }}>
              <h3 style={{ margin:"0 0 8px", fontSize:16, fontWeight:800 }}>In plain words</h3>
              <ul style={{ margin:0, padding:"0 0 0 18px" }}>
                {LEGAL_SUMMARY[page].map(t => (
                  <li key={t} style={{ fontSize:14, lineHeight:1.6, color:"#222", margin:"0 0 8px" }}>{t}</li>
                ))}
              </ul>
              <p style={{ margin:"4px 0 8px", fontSize:12, color:"#4B5260", lineHeight:1.5 }}>
                This summary helps you read the page. The full text below is what applies.
              </p>
            </section>
          )}
          {sections.map(([h, body]) => (
            <div key={h} style={{ marginBottom:18 }}>
              <h3 style={{ margin:"0 0 5px", fontSize:14.5, fontWeight:800 }}>{h}</h3>
              <p style={{ margin:0, fontSize:13.5, lineHeight:1.7, color:"#444" }}>{body}</p>
            </div>
          ))}
          {/* Every legal page ends with a way to reach a human. A privacy policy
              that says "contact us" without giving an address is not a policy,
              and commercial email needs a real one. */}
          <div style={{ marginTop:8, padding:"12px 14px", borderRadius:12,
                        background:"#F9FAFB", border:"1px solid " + C.border }}>
            <h3 style={{ margin:"0 0 5px", fontSize:14.5, fontWeight:800 }}>Contact us</h3>
            <p style={{ margin:0, fontSize:13.5, lineHeight:1.7, color:"#444" }}>
              Questions about this page, your data, or a booking? Email{" "}
              <a href={"mailto:" + contact.contact_email}
                 style={{ color:C.orange, fontWeight:700 }}>{contact.contact_email}</a>
              {contact.contact_location ? " · " + contact.contact_location : ""}
              {contact.support_hours ? " · " + contact.support_hours : ""}.
            </p>
            <p style={{ margin:"6px 0 0", fontSize:13.5, lineHeight:1.7, color:"#444" }}>
              To delete your account and everything on it, open your account
              menu, then Profile and Account settings. You do not need to email us.
            </p>
          </div>

          <p style={{ margin:"6px 0 0", fontSize:11, color:C.lightGray, textAlign:"center" }}>
            — end of {page} —
          </p>
        </div>

        {/* Footer — always reachable, however long the document is */}
        <div style={{ padding:"11px 20px 14px", borderTop:`1px solid ${C.border}`,
                      flexShrink:0, background:"#fff" }}>
          <button onClick={onClose} className="btn"
            style={{ width:"100%", padding:"12px 0", borderRadius:11, border:"none",
                     background:C.black, color:"#fff", fontSize:13.5, fontWeight:800, cursor:"pointer" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return body ? createPortal(ui, body) : ui;
}


/* ══════════════════════════════════════════════════════════════════════════
   VENDOR DASHBOARD — the vendor-only app surface.
   Vendors do NOT browse the marketplace or see other vendors. They see their
   own listing, incoming requests, notifications, ratings and key metrics.
   It shares the same database as the customer app, so a request a customer
   sends appears here, and an approval here appears in the customer's account.
   ══════════════════════════════════════════════════════════════════════════ */
/* Lets a vendor rate a customer after a confirmed booking (symmetric with the
   customer reviewing the vendor). Shows the customer's current rating too. */
/* CustomerRating moved to src/dashboards/VendorDashboard.jsx (23 Sep 2026) - loaded on demand. */
export function MessagesPanel({ user, isAdmin = false, focusId = null }) {
  const [convs, setConvs]   = useState([]);
  const [openId, setOpenId] = useState(focusId);
  const [msgs, setMsgs]     = useState([]);
  const [draft, setDraft]   = useState("");
  const [loading, setLoad]  = useState(true);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState("");
  const endRef = useRef(null);

  const loadConvs = React.useCallback(() => {
    setLoad(true);
    getConversations(user.id).then(list => { setConvs(list); setLoad(false); });
  }, [user.id]);
  useEffect(() => { loadConvs(); }, [loadConvs]);

  const openConv = convs.find(c => c.id === openId) || null;

  const loadMsgs = React.useCallback(() => {
    if (!openId) { setMsgs([]); return; }
    getMessages(openId).then(setMsgs);
  }, [openId]);
  useEffect(() => { loadMsgs(); }, [loadMsgs]);

  /* Light polling so replies appear without a manual refresh. */
  useEffect(() => {
    if (!openId) return;
    const t = setInterval(loadMsgs, 12000);
    return () => clearInterval(t);
  }, [openId, loadMsgs]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  async function send() {
    const text = draft.trim();
    if (!text || !openId) return;
    setBusy(true); setErr("");
    const res = await sendMessage(openId, user.id, text);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setDraft(""); loadMsgs(); loadConvs();
  }

  async function stopConv() {
    if (!openConv) return;
    if (!window.confirm("Stop this conversation?\n\nNeither side will be able to send messages in it after this. The history stays visible.")) return;
    setBusy(true);
    const res = await closeConversation(openConv.id, user.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    loadConvs();
  }

  /* Only the admin can end an admin thread. */
  const canStop = openConv && openConv.status === "open" &&
                  (openConv.kind !== "admin" || isAdmin);

  const expiredByDate = openConv && openConv.status === "open" && !openConv.active;

  if (openConv) {
    return (
      <div style={{ display:"flex", flexDirection:"column", height:520, maxHeight:"70vh" }}>
        {/* Thread header */}
        <div style={{ display:"flex", alignItems:"center", gap:10, paddingBottom:10,
                      borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
          <button onClick={()=>setOpenId(null)} className="btn"
            style={{ border:"none", background:"#F3F4F6", borderRadius:8, padding:"6px 10px",
                     fontSize:12, fontWeight:700, cursor:"pointer" }}>← Back</button>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:13.5, fontWeight:800, color:C.black }}>
              {openConv.kind === "admin" ? "🛡️ " : ""}{openConv.otherName}
            </p>
            {openConv.serviceName && (
              <p style={{ margin:0, fontSize:11, color:C.midGray }}>about {openConv.serviceName}</p>
            )}
          </div>
          {canStop && (
            <button onClick={stopConv} disabled={busy} className="btn"
              style={{ border:"1px solid #FCA5A5", background:"#FEF2F2", color:"#B91C1C",
                       borderRadius:8, padding:"6px 11px", fontSize:11.5, fontWeight:700, cursor:"pointer" }}>
              ⛔ Stop
            </button>
          )}
        </div>

        {err && (
          <p style={{ margin:"8px 0 0", fontSize:11.5, color:"#B91C1C", background:"#FEF2F2",
                      border:"1px solid #FCA5A5", borderRadius:8, padding:"7px 10px", fontWeight:600 }}>⚠ {err}</p>
        )}

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"12px 2px", minHeight:0 }}>
          {msgs.length === 0 ? (
            <p style={{ fontSize:12.5, color:C.midGray, textAlign:"center", marginTop:20 }}>
              No messages yet — say hello.
            </p>
          ) : msgs.map(m => {
            const mine = m.senderId === user.id;
            return (
              <div key={m.id} style={{ display:"flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom:8 }}>
                <div style={{ maxWidth:"78%", padding:"9px 12px", borderRadius:13,
                              background: mine ? C.orange : "#F3F4F6",
                              color: mine ? "#fff" : C.black }}>
                  <p style={{ margin:0, fontSize:13, lineHeight:1.5, whiteSpace:"pre-wrap" }}>{m.body}</p>
                  <p style={{ margin:"3px 0 0", fontSize:9.5, opacity:0.75, textAlign:"right" }}>
                    {new Date(m.createdAt).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Composer, or why it's closed */}
        {openConv.status === "closed" ? (
          <div style={{ flexShrink:0, background:"#F3F4F6", borderRadius:10, padding:"11px 13px", textAlign:"center" }}>
            <p style={{ margin:0, fontSize:12, fontWeight:700, color:C.midGray }}>
              ⛔ This conversation was ended. History stays visible.
            </p>
          </div>
        ) : expiredByDate ? (
          <div style={{ flexShrink:0, background:"#FFFBEB", border:"1px solid #FCD34D",
                        borderRadius:10, padding:"11px 13px", textAlign:"center" }}>
            <p style={{ margin:0, fontSize:12, fontWeight:700, color:"#92400E" }}>
              This conversation closed automatically — it's more than 3 days after the event.
            </p>
          </div>
        ) : (
          <div style={{ display:"flex", gap:8, flexShrink:0, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
            <textarea value={draft} onChange={e=>setDraft(e.target.value)}
              onKeyDown={e=>{ if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Write a message…" rows={2}
              style={{ flex:1, padding:"9px 11px", border:`1px solid ${C.border}`, borderRadius:10,
                       fontSize:13, resize:"none", fontFamily:"'Figtree', system-ui, sans-serif" }} />
            <button onClick={send} disabled={busy || !draft.trim()} className="btn"
              style={{ padding:"0 18px", borderRadius:10, border:"none", background:C.orange,
                       color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer",
                       opacity: (busy || !draft.trim()) ? 0.5 : 1 }}>
              {busy ? "…" : "Send"}
            </button>
          </div>
        )}
      </div>
    );
  }

  /* Thread list */
  return (
    <div>
      {loading ? (
        <p style={{ fontSize:13, color:C.midGray }}>Loading messages…</p>
      ) : convs.length === 0 ? (
        <p style={{ fontSize:13, color:C.midGray }}>
          No conversations yet. {isAdmin ? "Message a user or vendor from the Accounts tab." : "They start when you send or receive an inquiry."}
        </p>
      ) : convs.map(c => (
        <button key={c.id} onClick={()=>setOpenId(c.id)} className="btn"
          style={{ display:"block", width:"100%", textAlign:"left", cursor:"pointer",
                   borderTop:`1px solid ${C.border}`, border:"none", borderTopWidth:1,
                   borderTopStyle:"solid", background:"#fff", padding:"11px 2px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
            <p style={{ margin:0, fontSize:13, fontWeight:800, color:C.black }}>
              {c.kind === "admin" ? "🛡️ " : ""}{c.otherName}
              {c.serviceName ? <span style={{ color:C.midGray, fontWeight:600 }}> · {c.serviceName}</span> : null}
            </p>
            <span style={{ fontSize:10, color:C.lightGray, whiteSpace:"nowrap" }}>
              {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString() : ""}
            </span>
          </div>
          <p style={{ margin:"2px 0 0", fontSize:11, color: c.active ? C.green : C.lightGray, fontWeight:600 }}>
            {c.status === "closed" ? "⛔ Ended"
              : c.active ? "● Open" : "⏳ Closed automatically (3 days after event)"}
          </p>
        </button>
      ))}
    </div>
  );
}

/* VendorInquiries moved to src/dashboards/VendorDashboard.jsx (23 Sep 2026) - loaded on demand. */
/* VendorDashboard moved to src/dashboards/VendorDashboard.jsx (23 Sep 2026) - loaded on demand. */
function usePersistentState(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      if (typeof localStorage === "undefined") return initial;
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { if (typeof localStorage !== "undefined") localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

/* ── Loaded on demand (checklist item 6, part two) ──────────────────────────
   The admin panel and the vendor dashboard are about 2,050 lines that almost
   nobody downloads on purpose. A customer browsing food trucks has no use for
   either, and until now shipped both on first paint.

   THE IMPORT POINTS BACK AT THIS FILE, which looks circular and is. The two
   modules import C, sb and the data helpers from here; this file reaches them
   only through import(), which runs after this module has finished evaluating.
   So nothing is read before it exists.

   The alternative - hoisting all 53 shared symbols into a third module - moves
   another ~1,600 lines and produces exactly the same bundles, because shared
   code stays in the main chunk either way. It is the tidier design and worth
   doing when this file is split properly; it is not worth the extra risk in a
   change whose entire value is that the moved code is untouched.

   Suspense fallback is deliberately plain. Both are behind a sign-in, on a fast
   path, and a skeleton that flashes for 80ms is worse than a line of text. */
const AdminPanel      = lazy(() => import("./dashboards/AdminPanel.jsx"));
const VendorDashboard = lazy(() => import("./dashboards/VendorDashboard.jsx"));

function DashboardLoading({ label }) {
  return (
    <div style={{ padding:"64px 20px", textAlign:"center", color:C.midGray, fontSize:14 }}>
      Loading {label}...
    </div>
  );
}

/* ── EMAIL LINK LANDING PAGE ──────────────────────────────────────────────
   Where confirmation and password-reset emails now land: pluj.us, not
   Supabase. Nothing happens until the button is pressed.

   That button is not decoration. Mail providers fetch every link in an
   incoming message to scan it — Outlook and Hotmail always, Gmail and most
   corporate filters often — and the old emails linked straight to Supabase's
   single-use GET endpoint, so the scanner spent the token and the person got
   "this link has expired". A page that does nothing until clicked is immune:
   scanners load pages, they do not press buttons.

   Read the parameters from the query string, not the hash, because that is
   where Supabase puts token_hash and because the hash never reaches a server
   if the flow ever needs one. */
export function EmailLinkScreen({ link, onSession, onFinish, onRequestNew }) {
  const recovery = link.type === "recovery";
  const [stage, setStage] = useState(link.error ? "error" : "ready");   // ready | done | error
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState(link.error || "");
  const [pw,    setPw]    = useState("");
  const [pw2,   setPw2]   = useState("");
  const [who,   setWho]   = useState(null);

  /* Old-style links (from emails sent before 30 Sep) arrive with the session
     already in the URL: Supabase confirmed the address before redirecting.
     Nothing to press for a signup — sign them in and say so. */
  useEffect(() => {
    if (link.accessToken && !recovery) {
      (async () => {
        const u = await onSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
        setWho(u); setStage("done");
      })();
    }
  }, []);

  async function getSession() {
    if (link.accessToken) return { access_token: link.accessToken, refresh_token: link.refreshToken };
    const { data, error } = await sb.verifyTokenHash(link.type, link.tokenHash);
    if (error || !data?.access_token) {
      throw new Error(typeof error === "string" ? error
        : (error?.message || "This link has expired or was already used."));
    }
    return data;
  }

  async function confirm() {
    setBusy(true); setErr("");
    try {
      const session = await getSession();
      const u = await onSession(session);
      setWho(u); setStage("done");
    } catch (e) { setErr(e.message); setStage("error"); }
    setBusy(false);
  }

  async function savePassword() {
    setErr("");
    if (pw.length < 12) { setErr("Password must be at least 12 characters."); return; }
    if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw))
      { setErr("Use a lowercase letter, an uppercase letter, a number and a symbol (like ! ? # $)."); return; }
    if (pw !== pw2) { setErr("The two passwords don't match."); return; }
    setBusy(true);
    try {
      /* The token is only spent here, on a human pressing Save — never on load. */
      const session = await getSession();
      const { error } = await sb.updateUserPassword(session.access_token, pw);
      if (error) throw new Error(error.message || "Could not save the new password.");
      const u = await onSession(session);
      setWho(u); setStage("done");
    } catch (e) {
      const expired = /expired|invalid|already/i.test(e.message);
      setErr(e.message);
      if (expired) setStage("error");
    }
    setBusy(false);
  }

  const field = {
    width:"100%", padding:"13px 14px", borderRadius:12, border:"1px solid rgba(255,255,255,0.18)",
    background:"rgba(255,255,255,0.06)", color:"#fff", fontSize:15, marginBottom:10,
    boxSizing:"border-box", outline:"none",
  };
  const primary = {
    width:"100%", border:"none", borderRadius:999, padding:"14px 24px", fontSize:15,
    fontWeight:800, color:"#fff", background:"linear-gradient(135deg, #FF5C28 0%, #FF8C00 100%)",
    cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1,
  };
  const quiet = {
    marginTop:14, background:"none", border:"none", color:"rgba(255,255,255,0.6)",
    textDecoration:"underline", cursor:"pointer", fontSize:13,
  };

  let title, body, action;
  if (stage === "error") {
    title = "This link didn't work";
    body = (err || "This link has expired or was already used.") +
      " Links stop working after 10 minutes, and each one works only once. Request a new one and use the newest email.";
    action = (
      <>
        <button style={primary} onClick={onRequestNew}>
          {recovery ? "Send me a new reset link" : "Log in / Sign up"}
        </button>
        <button style={quiet} onClick={onFinish}>Go to PLUJ</button>
      </>
    );
  } else if (stage === "done") {
    const vendor = who?.type === "vendor";
    title = recovery ? "Password updated" : "Email confirmed";
    body = recovery
      ? "Your new password is saved and you're signed in."
      : vendor
        ? "You're signed in. Your dashboard walks you through two quick things — your business details and your first listing — and then PLUJ approves you."
        : "You're signed in and ready to start planning your event.";
    action = (
      <button style={primary} onClick={onFinish}>
        {vendor ? "Go to my dashboard" : "Continue to PLUJ"}
      </button>
    );
  } else if (recovery) {
    title = "Choose a new password";
    body = "At least 12 characters, with an uppercase letter, a lowercase letter, a number and a symbol.";
    action = (
      <>
        <PasswordInput placeholder="New password" value={pw} autoFocus autoComplete="new-password"
          iconColor="rgba(255,255,255,0.7)"
          onChange={e=>{ setPw(e.target.value); setErr(""); }} style={field} />
        <PasswordInput placeholder="Confirm new password" value={pw2} autoComplete="new-password"
          iconColor="rgba(255,255,255,0.7)"
          onChange={e=>{ setPw2(e.target.value); setErr(""); }}
          onKeyDown={e=>{ if (e.key === "Enter") savePassword(); }} style={field} />
        {err && <div style={{ color:"#FCA5A5", fontSize:13, margin:"2px 0 12px" }}>{err}</div>}
        <button style={primary} disabled={busy} onClick={savePassword}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </>
    );
  } else {
    title = "Confirm your email";
    body = "One tap and your PLUJ account is ready to use.";
    action = (
      <button style={primary} disabled={busy} onClick={confirm}>
        {busy ? "Confirming…" : "Confirm my email"}
      </button>
    );
  }

  return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:"linear-gradient(135deg, #0A0A0A 0%, #1A1A2E 100%)",
      color:"#fff", padding:"24px", textAlign:"center",
      font:"16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif",
    }}>
      <div style={{ maxWidth:400, width:"100%" }}>
        <div style={{ marginBottom:28 }}><PlujMark size={48} light /></div>
        {stage === "done" && <div style={{ fontSize:44, marginBottom:8 }}>✅</div>}
        <h1 style={{ fontSize:24, fontWeight:800, letterSpacing:"-0.02em", margin:"0 0 10px" }}>{title}</h1>
        <p style={{ margin:"0 0 24px", color:"rgba(255,255,255,0.72)", fontSize:15 }}>{body}</p>
        {action}
      </div>
    </div>
  );
}

/* ── MAINTENANCE SCREEN ───────────────────────────────────────────────────
   What a visitor sees while the site is switched off. Deliberately a real
   page rather than an empty marketplace: "we're working on it" is information,
   an empty grid is a bug report waiting to happen.

   The way back in is the word "Staff" at the bottom. It is not hidden — anyone
   can click it — because hiding it would protect nothing (the login is the
   thing that protects the site) and would mean losing your own way in. */
export function MaintenanceScreen({ onStaff }) {
  return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:"linear-gradient(135deg, #0A0A0A 0%, #1A1A2E 100%)",
      color:"#fff", padding:"24px", textAlign:"center",
      font:"16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif",
    }}>
      <div style={{ maxWidth:440 }}>
        {/* The real brand mark, not a word typed to look like one. */}
        <div style={{ marginBottom:30 }}>
          <PlujMark size={54} light />
        </div>

        <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:"-0.02em", margin:"0 0 12px" }}>
          Down for Maintenance
        </h1>
        <p style={{ margin:"0 0 8px", color:"rgba(255,255,255,0.72)" }}>
          We are making improvements to Your Pluj and we will be back shortly.
        </p>
        <p style={{ margin:0, color:"rgba(255,255,255,0.45)", fontSize:14 }}>
          Thank you for your patience — see you soon.
        </p>

        <button
          onClick={onStaff}
          style={{
            marginTop:40, background:"none", border:"none", cursor:"pointer",
            color:"rgba(255,255,255,0.3)", fontSize:12, letterSpacing:"0.06em",
            textTransform:"uppercase", fontWeight:600, padding:"8px 12px",
          }}
        >Staff</button>
      </div>
    </div>
  );
}

/* The switch itself. Lives in the admin panel and nowhere else.

   Being admin-only here is a convenience, not the control: site_go_private()
   and site_go_public() both start with `if not is_admin() then raise`, so the
   database refuses anyone else regardless of what any UI offers them. Hiding
   the button keeps it out of the way; the database is what keeps it safe.

   Self-contained on purpose — it reads its own status on mount rather than
   being handed it, so it can be dropped into the admin panel (a separate
   lazy-loaded module) without threading state across the boundary. */
export function SiteSwitch() {
  const [isPrivate, setIsPrivate] = useState(null);   // null = still loading
  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState("");

  useEffect(() => { getSiteStatus().then(s => setIsPrivate(s.private)); }, []);

  async function flip() {
    const turningOff = !isPrivate;
    if (turningOff && !window.confirm(
      "Take pluj.us offline?\n\nEveryone except admins will see the " +
      "\"Down for Maintenance\" page until you turn it back on."
    )) return;
    setBusy(true);
    const r = await setSitePublic(isPrivate);   // isPrivate === true means "open it"
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    setMsg("");
    setIsPrivate(!isPrivate);
  }

  const off = isPrivate === true;

  return (
    <div style={{
      border:`1px solid ${off ? "#FECACA" : C.border}`,
      background: off ? C.redSoft : C.white,
      borderRadius:14, padding:"16px 18px", marginBottom:18,
      display:"flex", alignItems:"center", gap:14, flexWrap:"wrap",
    }}>
      <span style={{
        width:10, height:10, borderRadius:999, flexShrink:0,
        background: isPrivate === null ? C.lightGray : (off ? C.red : C.green),
      }} />
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ fontWeight:800, fontSize:15, color:C.darkGray }}>
          {isPrivate === null ? "Checking site status…"
            : off ? "The site is OFF" : "The site is live"}
        </div>
        <div style={{ fontSize:13, color:C.midGray, marginTop:2 }}>
          {isPrivate === null ? " "
            : off ? "Visitors see the Down for Maintenance page. Admins still see the full site."
                  : "Anyone can browse and book on pluj.us."}
        </div>
        {msg && <div style={{ fontSize:13, color:C.red, marginTop:6 }}>{msg}</div>}
      </div>
      <button
        onClick={flip}
        disabled={busy || isPrivate === null}
        style={{
          border:"none", borderRadius:999, padding:"10px 20px",
          fontSize:14, fontWeight:700, color:"#fff",
          background: off ? C.green : C.darkGray,
          cursor: (busy || isPrivate === null) ? "default" : "pointer",
          opacity: (busy || isPrivate === null) ? 0.5 : 1,
        }}
      >{busy ? "Working…" : (off ? "Turn the site on" : "Turn the site off")}</button>
    </div>
  );
}

export default function PlujApp() {
  /* Auth */
  const [user,      setUser]      = useState(null);
  /* Prices are shown all-in for whoever is looking (see allIn). Set during
     render, before any card renders, so every price on screen agrees. */
  setPriceViewer(user);
  /* Emails follow the language the person reads PLUJ in: the EN/ES switch is
     saved on their profile (profiles.lang), and queue_email() translates. */
  useEffect(() => {
    if (!user || !user.id || user.type === "guest" || IS_PREVIEW) return;
    const save = (l) => {
      try { sb.from("profiles").eq("id", user.id).update({ lang: l === "es" ? "es" : "en" }).then(() => {}, () => {}); }
      catch { /* best effort */ }
    };
    save(getLang());
    return onLangChange(save);
  }, [user?.id]);
  /* "Find a replacement" on a booking a vendor cancelled: open the same kind
     of service, filtered to the event's date, guests and city. Registered
     below, once the state it sets exists. */
  const replacementRef = useRef(null);
  useEffect(() => {
    const on = (e) => { if (replacementRef.current) replacementRef.current(e.detail || {}); };
    window.addEventListener("pluj:find-replacement", on);
    return () => window.removeEventListener("pluj:find-replacement", on);
  }, []);
  /* Event recaps: the latest on the home page, and /event/<id> links. */
  const [homeRecaps, setHomeRecaps] = useState([]);
  const [recapNames, setRecapNames] = useState({});
  const [openRecap,  setOpenRecap]  = useState(null);
  useEffect(() => {
    const idsOf = rs => rs.flatMap(r => [r.vendor_id, ...(r.credited || [])]);
    fetchRecaps({ limit: 6 }).then(async rs => {
      setHomeRecaps(rs);
      const n = await vendorNames(idsOf(rs));
      setRecapNames(p => ({ ...p, ...n }));
    });
    if (BOOT_ROUTE.kind === "recap") {
      fetchRecaps({ id: BOOT_ROUTE.id, limit: 1 }).then(async rs => {
        if (!rs[0]) return;
        const n = await vendorNames(idsOf(rs));
        setRecapNames(p => ({ ...p, ...n }));
        setOpenRecap(rs[0]);
      });
    }
  }, []);
  const [authModal, setAuthModal] = useState(false);
  /* Password-recovery: set when arriving via a Supabase recovery email link */
  const [recoveryToken, setRecoveryToken] = useState(null);
  /* Set when the page was opened from a confirmation or reset email. Captured
     during the first render — see readEmailLinkFromUrl for why it cannot wait
     for an effect. */
  const [emailLink, setEmailLink] = useState(readEmailLinkFromUrl);
  /* Back from Stripe Checkout or Stripe onboarding (see readPaymentReturnFromUrl). */
  const [payReturn, setPayReturn] = useState(readPaymentReturnFromUrl);
  const [payBanner, setPayBanner] = useState(null);   // { tone: "ok" | "warn" | "info", text }
  /* Site settings (payments on/off and the rest) load once; re-render when
     they arrive so payment screens appear without a reload. */
  const [, setSettingsTick] = useState(0);
  useEffect(() => { loadPlatformSettings().then(() => setSettingsTick(t => t + 1)); }, []);

  /* ── MAINTENANCE MODE ──
     Starts at false — assume open — rather than null. Starting at "unknown"
     and rendering nothing until the answer arrives would put a network round
     trip in front of first paint for every visitor on every load, to handle a
     state the site is in almost never. The cost of being optimistic is a brief
     flash of an empty marketplace before the maintenance page appears while
     the site is off; the cost of being pessimistic is a slower site always. */
  const [sitePrivate, setSitePrivate] = useState(false);
  useEffect(() => { getSiteStatus().then(s => setSitePrivate(s.private)); }, []);

  /* Turning the site off also ends everyone else's session. Without this, a
     customer or vendor who was already signed in when the switch was flipped
     keeps a valid token in their browser — the maintenance page would hide
     the site from them while their token still answered the REST API, which
     is theatre rather than a closed door. Admins are the exception, since
     they need to be in here to turn it back on. */
  useEffect(() => {
    if (!sitePrivate || !user || user.type === "admin") return;
    clearSession().then(() => setUser(null));
  }, [sitePrivate, user]);

  /* Market / location */
  const [market, setMarket] = useState(DEFAULT_MARKET);

  /* Navigation */
  const [activeCat,  setActiveCat]  = usePersistentState("pluj_view_cat", "all");
  const [activeSub,  setActiveSub]  = usePersistentState("pluj_view_sub", null);
  const [search,     setSearch]     = useState("");
  const [sortBy,     setSortBy]     = useState("featured");
  const [vendorPage, setVendorPage] = useState(null);
  /* Remember WHICH listing was open (by id only) so a refresh returns you to it.
     We re-resolve the id against freshly loaded cards rather than storing the
     card itself, so you never see stale/empty data after a reload. */
  const [openCardId, setOpenCardId] = usePersistentState("pluj_open_card", null);
  useEffect(() => { setOpenCardId(vendorPage ? (vendorPage.id || null) : null); }, [vendorPage]);

  /* Filters */
  const [filters, setFilters] = useState({
    instant: false, featured: false, topRated: false, spanish: false, insured: false,
    nearMe: false, maxPrice: 99999,
  });
  function updateFilter(key, val) {
    setFilters(f => ({ ...f, [key]: val }));
  }

  /* Favorites */
  const [favorites, setFavorites] = useState([]);
  useEffect(() => {
    if (user?.id) getFavorites(user.id).then(setFavorites);
    else setFavorites([]);
  }, [user]);
  async function handleToggleFav(vendorId) {
    if (!user) { setAuthModal(true); return; }
    const next = await toggleFavorite(user.id, vendorId);
    setFavorites(next);
  }

  /* Budget */
  const [budget, setBudget] = useState(0); // 0 = no budget set

  /* Cart */
  /* Cart — persisted so a refresh doesn't lose selections. */
  const [cart,     setCart]     = usePersistentState("pluj_cart_v1", []);
  const [cartOpen, setCartOpen] = useState(false);
  /* Event details entered once (in search, Build My Event, or the cart) and
     reused everywhere so the customer never re-types them. Also persisted. */
  const [eventDetails, setEventDetails] = usePersistentState("pluj_event_details_v1", {});
  const buildDetails = eventDetails;                 // alias kept for existing wiring
  const setBuildDetails = setEventDetails;

  /* Build wizard */
  const [wizStep, setWizStep] = useState(0);
  const [wizAns,  setWizAns]  = useState({});
  const [wizDone, setWizDone] = useState(false);
  const [activePackage, setActivePackage] = useState(null);

  /* Requests + panels */
  const [myBookings,     setMyBookings]     = useState([]);
  const [requestsSent,   setRequestsSent]   = useState(null);
  const [recentlySent,   setRecentlySent]   = useState([]);  // seed account requests instantly
  const [accountOpen,    setAccountOpen]    = useState(false);
  /* Which tab the account panel opens on. A notification sets this before
     opening the panel so the person lands on what they were told about. */
  const [accountTab,     setAccountTab]     = useState("requests");
  /* Which conversation a notification asked us to open, if any. */
  const [accountConvId,  setAccountConvId]  = useState(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminPanelTab,  setAdminPanelTab]  = useState("accounts");

  /* Finish a return from Stripe once we know who is signed in. */
  useEffect(() => {
    if (!payReturn || !user || user.type === "guest") return;
    const pr = payReturn;
    setPayReturn(null);
    (async () => {
      if (pr.kind === "payment") {
        if (pr.result === "cancelled") {
          setPayBanner({ tone: "info", text: "Payment cancelled. Nothing was charged." });
          return;
        }
        setPayBanner({ tone: "info", text: "Confirming your payment with Stripe…" });
        const r = pr.booking ? await paymentsCall("checkout_return", { booking_id: pr.booking }) : {};
        setPayBanner(r && r.error
          ? { tone: "warn", text: "We're still confirming your payment with Stripe. It will show in My Requests within a few minutes." }
          : { tone: "ok", text: "✅ Paid in full. It's locked and released to the vendor in parts; the last part only when you approve it." });
        setAccountTab("requests");
        setAccountOpen(true);
      } else if (pr.kind === "stripe") {
        if (pr.result === "refresh") {
          /* Stripe's onboarding link expired: make a fresh one. */
          const r = await paymentsCall("vendor_connect");
          if (r && r.url) { window.location.href = r.url; return; }
          setPayBanner({ tone: "warn", text: (r && r.error) || "Couldn't reopen Stripe. Try again from your dashboard." });
          return;
        }
        const r = await paymentsCall("vendor_refresh");
        setPayBanner(r && r.transfers_enabled
          ? { tone: "ok", text: "✅ Stripe is set up. Hosts can now pay you in full into your Stripe balance." }
          : { tone: "warn", text: "Stripe still needs a few details before hosts can pay you. Open your dashboard and press Finish Stripe setup." });
      }
    })();
  }, [payReturn, user]);
  const [notifOpen,      setNotifOpen]      = useState(false);
  const [originBlocked,  setOriginBlocked]  = useState(false);

  /* Reviews */
  const [reviews, setReviews] = useState(INIT_REVIEWS);

  /* ── Scroll-aware transparent navbar ── */
  const [navScrolled, setNavScrolled] = useState(false);
  const [critOpen,    setCritOpen]    = useState(false);   // phone: show the search filters
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        if (cartOpen)       { setCartOpen(false);       return; }
        if (accountOpen)    { setAccountOpen(false);    return; }
        if (notifOpen)      { setNotifOpen(false);      return; }
        if (adminPanelOpen) { setAdminPanelOpen(false); return; }
        if (vendorPage)     { setVendorPage(null);      return; }
        if (authModal)      { setAuthModal(false);      return; }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cartOpen, accountOpen, notifOpen, adminPanelOpen, vendorPage, authModal]);

  /* ── Browser Back button ──────────────────────────────────────────────────
     Single-page app: overlays and the vendor page are React state, not URLs,
     so Back has nothing in-app to return to and would unload the site. We keep
     one "guard" entry on the history stack while any layer is open. Pressing
     Back consumes the guard; we then close the top layer (and re-arm if more
     remain). Closing a layer via the UI/Escape instead consumes the guard
     ourselves so no dead entries pile up. Back only leaves the site when the
     user is at the bare marketplace with nothing open — the expected behavior. */
  const backGuardRef = useRef(false);   // true while a guard entry is on the stack
  const selfPopRef   = useRef(false);   // true when we triggered history.back() ourselves

  const anyLayerOpen = !!(vendorPage || cartOpen || accountOpen || notifOpen ||
                          adminPanelOpen || authModal || activePackage ||
                          activeCat === "build" || activeCat !== "all" ||
                          activeSub || search);

  // Number of independently-closable layers currently open.
  const openLayerCount = [
    authModal, cartOpen, notifOpen, accountOpen, adminPanelOpen, vendorPage,
    activePackage, activeSub, search, activeCat !== "all",
  ].filter(Boolean).length;

  // Close exactly one layer, highest-priority first (mirrors Escape order).
  function closeTopLayer() {
    if (authModal)      { setAuthModal(false);      return true; }
    if (cartOpen)       { setCartOpen(false);       return true; }
    if (notifOpen)      { setNotifOpen(false);      return true; }
    if (accountOpen)    { setAccountOpen(false);    return true; }
    if (adminPanelOpen) { setAdminPanelOpen(false); return true; }
    if (vendorPage)     { setVendorPage(null);      return true; }
    if (activePackage)  { setActivePackage(null);   return true; }
    if (activeSub)      { setActiveSub(null);        return true; }
    if (search)         { setSearch("");            return true; }
    if (activeCat !== "all") { setActiveCat("all");  return true; }
    return false;
  }

  // Arm a guard when a layer opens; consume it when everything closes via UI.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (anyLayerOpen && !backGuardRef.current) {
      window.history.pushState({ plujGuard: true }, "");
      backGuardRef.current = true;
    } else if (!anyLayerOpen && backGuardRef.current) {
      backGuardRef.current = false;
      selfPopRef.current = true;          // this pop is our own cleanup
      window.history.back();
    }
  }, [anyLayerOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onPop() {
      if (selfPopRef.current) { selfPopRef.current = false; return; }  // our cleanup pop
      backGuardRef.current = false;
      if (openLayerCount === 0) return;   // nothing open — let Back leave the site
      closeTopLayer();
      if (openLayerCount >= 2) {           // more layers remain — re-arm the guard
        window.history.pushState({ plujGuard: true }, "");
        backGuardRef.current = true;
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openLayerCount, authModal, cartOpen, notifOpen, accountOpen, adminPanelOpen,
      vendorPage, activePackage, activeSub, search, activeCat]);

  /* ── The URL follows the view ──────────────────────────────────────────────
     replaceState, not pushState, on purpose: the back-button guard above keeps
     an exact count of the entries it has pushed, and adding entries here would
     corrupt that accounting. Back still closes layers the way it always did —
     the difference is only that the address bar now says where you are, so the
     page can be linked to and indexed. */
  function viewPath() {
    if (vendorPage) return "/vendor/" + encodeURIComponent(vendorPage.id);
    if (activeCat === "build") return "/build";
    if (activeCat && activeCat !== "all") {
      return "/c/" + encodeURIComponent(activeCat) +
             (activeSub ? "/" + encodeURIComponent(activeSub) : "");
    }
    return "/";
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const want = viewPath();
    try {
      if (window.location.pathname !== want) {
        window.history.replaceState(window.history.state, "", want);
      }
      /* Without this every page claims to be the homepage, which tells a search
         engine to index one URL and discard the rest — the opposite of the
         point of having URLs at all. */
      const link = document.querySelector('link[rel="canonical"]');
      if (link) link.setAttribute("href", SITE_ORIGIN + want);
    } catch { /* history is unavailable in some embedded webviews */ }
  }, [vendorPage, activeCat, activeSub]);


  /* ── Title and description per view ────────────────────────────────────────
     Now that each view has its own URL, each one needs its own title and
     description too. A set of distinct URLs that all share the homepage title
     is arguably worse than one URL: search engines see near-duplicate pages and
     pick one, and a shared link shows the wrong thing in the preview card. */
  useEffect(() => {
    const base = "PLUJ — " + market.label;
    const setMeta = (name, content) => {
      const el = document.querySelector(`meta[name="${name}"]`);
      if (el && content) el.setAttribute("content", content);
    };

    if (vendorPage) {
      const what = vendorPage.serviceName || vendorPage.type || "event services";
      document.title = `${vendorPage.name} — ${what} in ${market.label} | PLUJ`;
      setMeta("description",
        `${vendorPage.name} — ${what} in ${market.label}. ` +
        `Check availability and send a booking request on PLUJ.`);
      return;
    }
    if (activeCat === "build") {
      document.title = `Build My Event — ${base}`;
      setMeta("description",
        `Plan your whole event in one place: venue, food, music, decor and ` +
        `rentals in ${market.label}, all matched to your date and guest count.`);
      return;
    }
    if (activeCat && activeCat !== "all") {
      const label = (CATEGORIES.find(c => c.id === activeCat) || {}).label || activeCat;
      const scope = activeSub ? `${activeSub} · ${label}` : label;
      document.title = `${scope} in ${market.label} | PLUJ`;
      setMeta("description",
        `Compare ${String(label).toLowerCase()} in ${market.label}. ` +
        `See prices and availability, then send booking requests on PLUJ.`);
      return;
    }
    /* Homepage keeps the keyword-rich title from index.html (brand first), so
       search results read "PLUJ — Book Food, Music & Venues…" rather than
       just the city. */
    document.title = `PLUJ — Book Food, Music & Venues for Your Event | ${market.label}`;
    setMeta("description",
      `Build your whole event lineup in one place. Compare food trucks, DJs, ` +
      `venues, decor and rentals in ${market.label}, then send every booking ` +
      `request at once. Free to browse.`);
  }, [vendorPage, activeCat, activeSub, market]);

  /* Security bootstrap — iframe-bust + URL sanitizer
     NOTE: JS-layer origin blocking is intentionally disabled — window.location.origin
     is unreliable inside sandboxed iframes (Claude artifacts, embedded previews).
     Real origin enforcement MUST be done via HTTP headers on the server.
     See Admin Panel → Security Headers for the Nginx/Apache/Express/Vercel configs.  */
  useEffect(() => {
    /* ① CORS: log only — never hard-block */
    const origin = (typeof window !== "undefined" ? window.location.origin : "") || "null";
    if (!isOriginAllowed(origin)) {
      console.warn("[CORS] Unlisted origin:", origin,
        "— add to CORS_CONFIG.allowedOrigins or configure server headers.");
    }

    /* ② Iframe-bust — only fires if parent origin is readable AND unlisted */
    if (typeof window !== "undefined" && window.self !== window.top) {
      try {
        const parentOrigin = window.parent.location.origin;
        if (parentOrigin && parentOrigin !== "null" && !isOriginAllowed(parentOrigin)) {
          console.warn("[Security] Unlisted iframe parent:", parentOrigin);
        }
      } catch { /* cross-origin parent — normal in artifact context */ }
    }

    /* ③ URL sanitizer — strip sensitive params from address bar */
    if (typeof window !== "undefined" && typeof history !== "undefined") {
      try {
        const url = new URL(window.location.href);
        ["token","key","secret","auth","password","api_key","access_token"].forEach(
          p => url.searchParams.delete(p)
        );
        history.replaceState(null, "", url.toString());
      } catch { /* non-http context */ }
    }
  }, []);

  /* Info / legal pages shown from the footer */
  const [infoPage, setInfoPage] = useState(null);

  /* Clicking the logo always returns to a clean home view */
  function goHome() {
    setActiveCat("all"); setActiveSub(null); setSearch(""); setVendorPage(null);
    setActivePackage(null); setInfoPage(null); setAccountOpen(false);
    setCartOpen(false); setNotifOpen(false); setAdminPanelOpen(false);
    if (typeof window !== "undefined") window.scrollTo({ top:0, behavior:"smooth" });
  }

  /* Customer search criteria — where / when / service / how many */
  const [qWhere,  setQWhere]  = useState("");
  const [qWhen,   setQWhen]   = useState("");
  const [qGuests, setQGuests] = useState("");
  const [qEventType, setQEventType] = useState("");
  /* Carry whatever the customer set in the search bar into the shared details
     store, so the cart is prefilled and they aren't asked the same things again. */
  useEffect(() => {
    setEventDetails(d => {
      const next = { ...d };
      if (qWhere && !d.city)      next.city = qWhere;
      if (qWhen && !d.eventDate)  next.eventDate = qWhen;
      if (qGuests && !d.guests)   next.guests = qGuests;
      if (qEventType && !d.eventType) next.eventType = qEventType;
      return next;
    });
  }, [qWhere, qWhen, qGuests, qEventType]);
  /* Availability for live vendors, keyed by vendor id → {blocked:[],confirmed:[]}.
     Only fetched once the customer actually searches a date, so normal browsing
     stays free of extra requests. */
  const [availByVendor, setAvailByVendor] = useState({});

  /* Live vendors from the database (approved sign-ups), merged with the
     built-in demo catalog so real vendors are findable by users. */
  const [dbVendors, setDbVendors] = useState([]);
  const refreshVendors = React.useCallback(() => {
    return getApprovedVendors().then(setDbVendors).catch(()=>{});
  }, []);
  useEffect(() => { refreshVendors(); }, [refreshVendors]);

  /* ── Reopening the last listing from localStorage is RETIRED ────────────────
     This predates routing, when a refresh had no URL to tell it what had been
     open and remembering was the only way not to lose the person's place.

     Now it actively fights the URL, and it is the same bug found twice already
     today in a third disguise: a remembered value outranking an explicit
     request. Asking for /c/food opened whatever listing you last viewed and
     rewrote the address bar to that vendor. Measured on production before
     changing anything — /c/food landed on /vendor/svc_35e85222..., which means
     every category link shared with a returning visitor went somewhere else.
     The guard here only excused BOOT_ROUTE.kind === "vendor", so categories,
     the builder and the homepage all got hijacked.

     No replacement is needed. Every view has a URL, and the sync effect below
     keeps the address bar current, so a refresh on a listing already reloads
     that listing's URL and BOOT_ROUTE opens it. The stored value was doing a
     job the URL now does properly.

     openCardId is still written, so nothing that reads it breaks; it simply no
     longer decides what you see. */

  /* ── The view is restored from the URL, once, on boot ───────────────────────
     Deliberately placed AFTER the dbVendors declaration above. The first
     version of this sat ~100 lines earlier, and its dependency array — which
     React evaluates during render, not after — read dbVendors before the const
     existed. That is a ReferenceError on every page load, which is a blank
     site, and it is the same temporal-dead-zone shape that took the site down
     once before. The lint rule caught it in CI this time. */
  const routedOnce = useRef(false);
  useEffect(() => {
    if (routedOnce.current) return;
    const r = BOOT_ROUTE;
    if (r.kind === "build") { routedOnce.current = true; setActiveCat("build"); return; }
    if (r.kind === "cat") {
      routedOnce.current = true;
      setActiveCat(r.cat);
      if (r.sub) setActiveSub(r.sub);
      return;
    }
    if (r.kind === "vendor") {
      /* Listings arrive asynchronously, so a deep link has to wait for them
         rather than resolving against an empty array and giving up. */
      if (!dbVendors.length) return;
      routedOnce.current = true;
      /* Clear the remembered category, whether or not the vendor resolves.

         A vendor URL that DOES resolve was already fine — vendorPage outranks
         activeCat in both the render and viewPath, so the profile showed and
         the address bar was correct. The gap is the link that does not resolve:
         a listing that was deleted, unapproved, or an id that was mistyped or
         has changed. Nothing was reset, so the persisted category won and the
         visitor landed on whatever they last had open — for anyone who had
         used Build My Event, the event builder, with the URL rewritten to
         /build. A dead listing link should return you to the homepage, not
         silently hand you a different feature.

         Same rule as "/" above: an explicit URL beats a remembered preference.
         This branch just did not apply it. */
      setActiveCat("all");
      setActiveSub(null);
      const found = dbVendors.find(v => String(v.id) === r.id);
      if (found) setVendorPage(found);
      return;
    }
    /* r.kind === "home". Landing on "/" has to CLEAR the remembered category,
       not just decline to set one.

       activeCat is persisted in localStorage, so before URLs existed a returning
       visitor picking up where they left off was the whole intent. Now that every
       view has its own URL that intent has a URL of its own — /c/music — and "/"
       means the homepage. Left as it was, the remembered value won: asking for
       "/" put you on the music category AND the sync effect below rewrote the
       address bar to /c/music, so the homepage was unreachable for anyone who
       had ever clicked a category, and the canonical tag on the URL they asked
       for pointed somewhere else.

       Same principle as the vendor case above: an explicit URL beats whatever
       this browser had open last time. */
    routedOnce.current = true;
    setActiveCat("all");
    setActiveSub(null);
  }, [dbVendors]);

  /* Preload availability for every live vendor (not just when a date is set),
     so the date and already-booked filters apply instantly without listings
     flickering as calendars load in. */
  useEffect(() => {
    const live = dbVendors.filter(v => v.isLive && v.vendorId);
    const missing = [...new Set(live.map(v => v.vendorId))].filter(id => !(id in availByVendor));
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      let found;
      try { found = await getVendorAvailabilityBulk(missing); }
      catch {
        /* Mark them loaded-but-empty rather than leaving them undefined, or
           this effect re-runs forever against the same failing ids. */
        found = Object.fromEntries(missing.map(id => [id, { blocked:[], confirmed:[] }]));
      }
      if (!cancelled) setAvailByVendor(prev => ({ ...prev, ...found }));
    })();
    return () => { cancelled = true; };
  }, [dbVendors, availByVendor]);
  /* Re-read listings when the tab regains focus so vendor edits show up
     without a manual reload. */
  useEffect(() => {
    const onFocus = () => refreshVendors();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshVendors]);

  /* Arriving from a confirmation or password-reset email:
     /auth/confirm?token_hash=...&type=signup|recovery|email|invite

     The token is read and then wiped from the URL immediately. Leaving it in
     the address bar would put a credential in browser history, in the
     referrer of anything the page loads next, and in whatever the person
     pastes when they ask for help with it. */
  useEffect(() => {
    if (!emailLink || typeof window === "undefined") return;
    try { window.history.replaceState(null, "", "/"); } catch { /* older browser */ }
    /* Empty deps on purpose: emailLink is captured at first render and this
       only ever needs to run against that first value. */
  }, []);

  /* Signs in with the session an email link produced and returns the user,
     so the landing page can say "Email confirmed" / "Password updated" and
     who to — instead of dropping people on the homepage and leaving them to
     guess whether anything happened. */
  async function onEmailLinkSession(session) {
    await saveSession(session);
    const u = await getCurrentUser();
    if (u) setUser(sanitizeUser(u));
    return u;
  }

  /* The old effect that looked for #access_token=...&type=recovery lived here.
     It never fired: the "URL follows the view" effect runs first and replaces
     the address with plain "/", hash included. readEmailLinkFromUrl now reads
     the hash during the first render instead. */

  /* Load persisted session on mount */
  useEffect(() => {
    console.log(`%c[PLUJ] build ${BUILD_VERSION}`, "font-weight:bold;color:#F97316");
    (async () => {
      /* getCurrentUser handles session loading, getUser(token), and profile fetch
         in one shot — reusing it avoids the bug where loadSession() returned
         a full session object that was incorrectly passed as a user id. */
      const u = await getCurrentUser();
      if (u) setUser(sanitizeUser(u));
    })();
  }, []);

  /* Load user's bookings whenever they sign in/out */
  useEffect(() => {
    if (user && user.type !== "guest") {
      RLS.getOwnBookings(user.id).then(setMyBookings);
    } else {
      setMyBookings([]);
    }
  }, [user]);

  const searchRef = useRef(null);
  const vendorGridRef = useRef(null);
  function goBrowseVendors() {
    /* Ensure we're on the full vendor list, then scroll to it. */
    pickCat("all");
    setTimeout(() => {
      if (vendorGridRef.current) vendorGridRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    }, 60);
  }
  const subs = CAT_SUBS[activeCat];
  const subObj = subs?.find(s=>s.id===activeSub);
  const catObj = CATEGORIES.find(c=>c.id===activeCat);
  /* Declared BEFORE showSubGrid, which is its first consumer. It used to sit
     18 lines lower, and the only reason that was survivable is that
     `subs && !activeSub && !q` short-circuits: on the home page `subs` is
     falsy so `q` was never evaluated. Clicking a category with
     subcategories made `subs` truthy, `!q` was reached, and the whole page
     died with a temporal-dead-zone ReferenceError. */
  /* `search` is what is in the box. `q` is what the page ACTS on, and it stays
     empty until there are at least two characters.

     Without that threshold the very first letter tore the page apart: `search`
     went non-empty, `isHero` flipped false, the hero collapsed and the results
     view slammed in — after ONE keystroke, before anyone had typed a word. The
     search box lives inside the hero, so it was destroyed mid-type and the rest
     of the letters went nowhere.

     Two characters is also the point below which a substring match is useless:
     "a" matches almost every listing, so the jump bought nothing and cost the
     person their place. Everything the customer sees still reflects `search`,
     so typing feels immediate; only the filtering and the layout switch wait
     for `q`. */
  const MIN_SEARCH = 2;
  const q = search.trim().length >= MIN_SEARCH ? search.trim() : "";
  const showSubGrid = subs && !activeSub && !q && activeCat !== "build";

  /* The nav is transparent only when on the hero (all, no search, no vendor page) */

  const isHero = activeCat === "all" && !q && !vendorPage;

  /* Keeping the box on screen is only half of it: the hero input and the
     sticky-bar input are two different DOM nodes, so React unmounts one and
     mounts the other mid-keystroke and focus falls back to <body>. Both carry
     `searchRef`, so once the swap has happened the ref points at whichever one
     now exists — hand focus back to it and put the caret at the end, and the
     handover is invisible to the person typing. */
  const wasHero = useRef(isHero);
  useEffect(() => {
    if (wasHero.current && !isHero && q) {
      const el = searchRef.current;
      if (el && document.activeElement !== el) {
        el.focus();
        const end = el.value.length;
        try { el.setSelectionRange(end, end); } catch {}
      }
    }
    wasHero.current = isHero;
  }, [isHero, q]);
  const navOnHero = isHero && !navScrolled;

  function pickCat(id) {
    if (id !== activeCat) track("category_selected", { cat: id });
    setActiveCat(id); setActiveSub(null); setSearch(""); setVendorPage(null); setActivePackage(null);
    if (id==="build") { setWizStep(0); setWizAns({}); setWizDone(false); }
  }
  /* Open a pro's profile from their vendor account id (recaps credit pros,
     not listings): their first listing on the marketplace. */
  function viewVendorById(id) {
    const card = dbVendors.find(v => (v.vendorId || v.dbId) === id);
    setOpenRecap(null);
    if (card) { setVendorPage(card); window.scrollTo({ top: 0 }); }
  }
  replacementRef.current = (d) => {
    const card = dbVendors.find(v => d.serviceId && v.serviceId === d.serviceId);
    setAccountOpen(false); setNotifOpen(false); setCartOpen(false);
    pickCat(card && card.cat ? card.cat : "all");
    if (d.date && d.date >= new Date().toISOString().slice(0, 10)) setQWhen(d.date);
    if (d.guests) setQGuests(String(d.guests).replace(/[^0-9]/g, ""));
    if (d.city) setQWhere(d.city);
    requestAnimationFrame(() => {
      const el = document.getElementById("results-top");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  function handleSelectPackage(pkg) {
    setActivePackage(pkg); setActiveCat("all"); setActiveSub(null); setSearch(""); setVendorPage(null);
  }
  function addToCart(v) {
    if (cart.find(c=>c.id===v.id)) return;
    /* Use the full record so pv, img etc are present. Live DB listings are
       already complete, so fall back to the passed object for those. */
    const full = VENDORS.find(vv=>vv.id===v.id) || v;
    setCart(p=>[...p, full]);
    setCartOpen(true);
  }
  function rmFromCart(id) { setCart(p=>p.filter(v=>v.id!==id)); }
  /* Patch one line of the cart — used for the per-vendor time slot. */
  function updateCartItem(id, patch) {
    setCart(p => p.map(v => v.id === id ? { ...v, ...patch } : v));
  }

  function handleSubmitRequests(sentRequests) {
    setCart([]); setCartOpen(false); setRequestsSent(sentRequests); setRecentlySent(sentRequests);
  }

  async function handleLogout() {
    await clearSession();
    setUser(null);
    setMyBookings([]);
    setAccountOpen(false);
  }

  function wizAnswer(k, val) {
    const next = {...wizAns,[k]:val};
    setWizAns(next);
    if (wizStep < WIZARD.length-1) setWizStep(s=>s+1);
    else setWizDone(true);
  }

  function addReview(vendorId, rev) { setReviews(r => ({ ...r, [vendorId]: [...(r[vendorId]||[]), rev] })); }
  function vendorReply(vendorId, revId, reply) {
    setReviews(r => ({ ...r, [vendorId]: (r[vendorId]||[]).map(rv => rv.id===revId ? {...rv, reply} : rv) }));
  }

  /* Suggestions for the "Where" box — drawn from real vendor coverage areas
     so users only see places we actually have vendors for. */
  const whereSuggestions = useMemo(() => {
    const set = new Set();
    [...dbVendors, ...VENDORS].forEach(v => {
      if (v.city) set.add(v.city);
      if (v.bizCity) set.add(v.bizCity + (v.bizState ? ", " + v.bizState : ""));
      String(v.serviceAreas || "").split(",").forEach(a => {
        const t = a.trim();
        if (t && t.length < 40) set.add(t);
      });
    });
    return [...set].sort();
  }, [dbVendors]);

  /* Does this vendor cover the requested location? */
  /* Does this vendor serve the searched location?
     Matches the query against the vendor's city, business city/state and
     service-area list, token by token so "Houston" matches "Houston, TX".
     Per the search rule, a vendor that doesn't cover the location is hidden —
     including live vendors with NO location on file (they haven't shown they
     cover it). Demo catalog vendors are exempt (no real service area). */
  function matchesWhere(v, where) {
    if (!where.trim()) return true;
    const haystack = `${v.city||""} ${v.serviceAreas||""} ${v.bizCity||""} ${v.bizState||""}`.toLowerCase();
    if (!haystack.trim()) return v.isLive ? false : true;
    const q = where.trim().toLowerCase();
    // whole-string match, or every comma/space token of the query is present
    if (haystack.includes(q)) return true;
    const tokens = q.split(/[\s,]+/).filter(t => t.length > 1);
    return tokens.length > 0 && tokens.every(t => haystack.includes(t));
  }

  /* The capacity range behind a card.
     Listings carry capacity_min/capacity_max and are authoritative — both null
     there is a real answer ("no stated limit"), not missing data. Business-level
     profile cards and the demo catalog never had those columns, so for them we
     still read the largest number out of the free text, which is the old guess
     and is all they have. `known` says which of the two we got. */
  function capacityBounds(v) {
    if (v && v.capacityKnown) {
      return {
        min: v.capacityMin != null ? Number(v.capacityMin) : null,
        max: v.capacityMax != null ? Number(v.capacityMax) : null,
        known: true,
      };
    }
    const nums = String((v && v.capacity) || "").match(/\d[\d,]*/g);
    if (!nums || !nums.length) return { min: null, max: null, known: false };
    const parsed = nums.map(x => parseInt(x.replace(/,/g, ""), 10)).filter(x => x > 0);
    if (!parsed.length) return { min: null, max: null, known: false };
    return { min: null, max: Math.max(...parsed), known: true };
  }

  /* Can this vendor handle the requested headcount?
     A match needs the headcount at or below the maximum (or no maximum stated)
     AND at or above the minimum (or no minimum stated) — a caterer with a
     50-person minimum is not a match for 10. Per the search rule, a live vendor
     whose capacity is missing or unreadable is hidden when a headcount is
     entered, since they haven't shown they can host that many. Demo vendors are
     exempt. */
  function matchesGuests(v, guests) {
    const n = parseInt(guests, 10);
    if (!n || n <= 0) return true;
    const cap = capacityBounds(v);
    if (!cap.known) return v.isLive ? false : true;
    if (cap.max != null && n > cap.max) return false;
    if (cap.min != null && n < cap.min) return false;
    return true;
  }

  /* Is this vendor free (and working) on the requested date?
     Demo catalog vendors have no real calendar, so they're never date-filtered.
     Uses the shared vendorConflicts() so search matches the cart's rules:
     blocked dates, already-booked dates, and non-working days. */
  function matchesWhen(v, when, startT, endT) {
    if (!when) return true;
    if (!v.isLive) return true;                 // demo vendors have no live calendar
    const avail = availByVendor[v.vendorId];
    if (avail === undefined) return true;        // not loaded yet — don't hide prematurely
    return vendorConflicts(v, avail, when, startT || "", endT || "").length === 0;
  }

  const filtered = useMemo(() => {
    /* Real approved vendors first, then the built-in catalog. */
    const ALL = [...dbVendors, ...VENDORS];
    let list = ALL.filter(v => {
      /* Category match. A live vendor whose stored category isn't a known tab
         (legacy data) is only hidden when a *specific* category is selected and
         doesn't match — never dropped from "Any service". Matching is
         case-insensitive to survive older mixed-case data. */
      if (activeCat !== "all" && activeCat !== "build") {
        const vc = String(v.cat || "").toLowerCase();
        if (vc !== activeCat.toLowerCase()) return false;
      }
      /* A listing can claim up to three subcategories, so match against all of
         them — a food truck that also does catering belongs in both. Sample
         catalog entries and older listings only have the single `sub`.
         Live listings that picked none still show under their category. */
      if (activeSub) {
        const vSubs = (v.subs && v.subs.length) ? v.subs : (v.sub ? [v.sub] : []);
        if (!vSubs.includes(activeSub) && !(v.isLive && vSubs.length === 0)) return false;
      }
      /* Build My Event: show a vendor for this occasion when EITHER their
         service subcategory is one the package suggests, OR they explicitly
         tagged this event type, OR they're a live listing that hasn't picked a
         subcategory yet (so real vendors — venues especially — aren't hidden). */
      if (activePackage && activePackage.subs.length > 0) {
        const vSubs     = (v.subs && v.subs.length) ? v.subs : (v.sub ? [v.sub] : []);
        const subMatch  = vSubs.some(x => activePackage.subs.includes(x));
        const tagMatch  = parseEventTypes(v.eventTypes).includes(activePackage.id);
        const liveNoSub = v.isLive && vSubs.length === 0;
        if (!(subMatch || tagMatch || liveNoSub)) return false;
      }
      if (q && !`${v.name} ${v.type} ${v.blurb} ${(v.tags||[]).join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
      /* Customer criteria — only show vendors who actually fit */
      if (!matchesWhere(v, qWhere))   return false;
      if (!matchesWhen(v, qWhen))     return false;
      if (!matchesGuests(v, qGuests)) return false;
      if (!matchesEventType(v, qEventType)) return false;
      if (filters.instant  && !v.instant)              return false;
      if (filters.spanish  && !(v.langs || []).includes("es")) return false;
      if (filters.insured  && !v.insured)              return false;
      if (filters.featured && !v.feat)                 return false;
      /* "Top rated" only judges vendors that HAVE ratings — a new vendor with no
         reviews yet shouldn't be hidden as if it were poorly rated. */
      if (filters.topRated && (v.revCount > 0) && v.rating < 4.8) return false;
      /* "Nearby" keeps vendors that travel at least 25mi OR haven't set a radius
         (unset ≠ "doesn't travel"), plus anything based in the searched city. */
      if (filters.nearMe) {
        const miles = Number(v.travelMiles) || 0;
        const sameCity = qWhere && String(v.city || v.bizCity || "").toLowerCase().includes(String(qWhere).toLowerCase());
        if (miles > 0 && miles < 25 && !sameCity) return false;
      }
      if (v.pv > filters.maxPrice)                     return false;
      return true;
    });
    if (sortBy === "rating")  return [...list].sort((a,b)=>b.rating-a.rating);
    if (sortBy === "price")   return [...list].sort((a,b)=>a.pv-b.pv);
    if (sortBy === "newest")  return [...list].sort((a,b)=>(b.yearsInBiz||0)-(a.yearsInBiz||0));
    /* Keep live listings visible near the top so new vendors get discovered. */
    return [...list].sort((a,b)=>((b.feat?1:0)+(b.isLive?1:0))-((a.feat?1:0)+(a.isLive?1:0)));
  }, [activeCat, activeSub, q, sortBy, filters, activePackage, dbVendors, qWhere, qWhen, qGuests, qEventType, availByVendor]);

  /* ── Paging the grid (checklist item 23) ───────────────────────────────────
     Every matching listing used to be rendered at once. Nine of them, so it has
     never been visible — which is exactly why it is worth fixing before it is.
     A card is not cheap: photo, rating, badges, price, availability, two
     buttons. A few hundred of them is a slow scroll on a mid-range phone and a
     lot of images racing for the same connection.

     Deliberately "Load more" and not numbered pages. The filters above the grid
     are how people narrow this catalogue; page 2 of 7 invites you to hunt
     through pages instead, and it breaks the back button's meaning now that
     views have URLs. Load more keeps one scrollable result list.

     HONEST SCOPE: this pages the RENDER, not the query. Area, date, capacity,
     guest count and availability are all evaluated in the browser over the
     whole catalogue, so the rows still have to arrive before anything can be
     filtered — that is what VENDOR_FETCH_LIMIT bounds. Paging the query means
     moving those filters into Postgres so it can count and offset correctly.
     That is a real piece of work and it is not what this is. */
  const PAGE_SIZE = 24;
  const [shownCount, setShownCount] = useState(PAGE_SIZE);

  /* Any change to what is being searched for starts the list again. Without
     this, narrowing a search while scrolled deep would leave you looking at a
     short list that claims to be truncated. */
  useEffect(() => {
    setShownCount(PAGE_SIZE);
  }, [activeCat, activeSub, q, sortBy, filters, activePackage, qWhere, qWhen, qGuests, qEventType]);

  const visible = useMemo(() => filtered.slice(0, shownCount), [filtered, shownCount]);
  const moreCount = Math.max(0, filtered.length - visible.length);

  /* A search that returns nothing is the most useful thing this marketplace can
     tell you: it is a customer who wanted something you do not have yet, and it
     is completely invisible in error logs because nothing went wrong.

     Debounced by 700ms so typing "caterer" records one search rather than seven
     prefixes of it. We keep the LENGTH of the query and the number of results,
     never the text — "are searches failing" is answerable without keeping what
     anybody searched for. */
  useEffect(() => {
    if (!q) return;
    const t = setTimeout(() => {
      track(filtered.length === 0 ? "search_empty" : "search_performed",
            { len: q.length, results: filtered.length, cat: activeCat || "all" });
    }, 700);
    return () => clearTimeout(t);
  }, [q, filtered.length, activeCat]);

  /* Smart recommendations — vendors missing from cart for this event package */
  /* ── TRAFFIC ─────────────────────────────────────────────────────────────
     app_events existed for weeks with the table, the policy and the retention
     job all in place, and recorded nothing — because only three of the thirteen
     permitted events were ever wired, and none of them were the common ones.
     A funnel missing its first three steps measures nothing.

     One page_view per tab, not per render. */
  const viewLoggedRef = useRef(false);
  useEffect(() => {
    if (viewLoggedRef.current) return;
    viewLoggedRef.current = true;
    track("page_view", { ref: (document.referrer || "").slice(0, 80) });
  }, []);

  /* Searches are logged after the typing stops, so "hou" "hous" "houst" is one
     search and not five. An empty result is its own event: what people looked
     for and did not find is the most useful thing this table can tell you. */
  useEffect(() => {
    if (!q) return;
    const t = setTimeout(() => {
      track(filtered.length ? "search_performed" : "search_empty",
            { q: q.slice(0, 60), results: filtered.length,
              cat: activeCat, where: qWhere.slice(0, 40) });
    }, 800);
    return () => clearTimeout(t);
  }, [q, filtered.length, activeCat, qWhere]);

  /* Opening a listing, wherever it was opened from. */
  function viewVendor(v) {
    if (!v) return;
    track("listing_viewed", { id: String(v.id).slice(0, 40), cat: v.cat || "" });
    setVendorPage(v);
  }

  const recs = useMemo(() => getRecommendations(cart, activePackage, dbVendors.length ? dbVendors : VENDORS),
                       [cart, activePackage, dbVendors]);

  /* ── EMAIL LINK ──────────────────────────────────────────────────────────
     Ahead of the maintenance gate on purpose: confirming an address you
     already own, or finishing a reset you already started, is not browsing
     the marketplace. Someone who signed up before the site was switched off
     should still be able to finish the thing they were told to finish. */
  if (emailLink) {
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <EmailLinkScreen
          link={emailLink}
          onSession={onEmailLinkSession}
          onFinish={() => setEmailLink(null)}
          onRequestNew={() => { setEmailLink(null); setAuthModal(true); }}
        />
      </>
    );
  }

  /* ── MAINTENANCE GATE ────────────────────────────────────────────────────
     Placed after every hook in this component and before the vendor routing,
     so nobody — customer or vendor — gets past it while the site is off. The
     one exception is an admin, who has to be able to get in to turn it back
     on; "Staff" on the maintenance page opens the normal login to do it.

     This is a courtesy screen, not the security boundary. The security
     boundary is the database: private mode revokes anonymous read access, so
     even someone who skipped this page entirely would be shown nothing. */
  if (sitePrivate && user?.type !== "admin") {
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <MaintenanceScreen onStaff={() => setAuthModal(true)} />
        {authModal && (
          <AuthModal
            onClose={() => setAuthModal(false)}
            onAuth={u => { setUser(u); setAuthModal(false); }}
          />
        )}
      </>
    );
  }

  /* ── VENDOR ROUTING ──────────────────────────────────────────────────────
     A signed-in vendor gets the vendor dashboard, not the customer
     marketplace. Both surfaces share the same Supabase data, so a request a
     customer sends here shows up there, and vice versa. */
  if (user && user.type === "vendor") {
    return (
      <Suspense fallback={<DashboardLoading label="your dashboard" />}>
        <VendorDashboard user={user} onLogout={handleLogout} />
      </Suspense>
    );
  }

  const recSubs    = RECS[wizAns.eventType] || [];
  const recVendors   = VENDORS.filter(v => recSubs.includes(v.sub) && v.feat);
  const otherVendors = VENDORS.filter(v => !recVendors.find(r=>r.id===v.id));

  return (
    <div className="pluj">
      <style>{GLOBAL_CSS}</style>

      {/* ── AUTH MODAL ─────────────────────────────────────────────────── */}
      {/* ── SECURITY META HEADERS ──────────────────────────────────────────────── */}
      <SecurityMetaHeaders />

      {/* Message after returning from Stripe */}
      {payBanner && (
        <div role="status"
          style={{ position:"fixed", top:80, left:"50%", transform:"translateX(-50%)", zIndex:1100,
                   width:"calc(100% - 32px)", maxWidth:520, borderRadius:12, padding:"12px 44px 12px 14px",
                   fontSize:13, fontWeight:600, lineHeight:1.5, boxShadow:"0 10px 30px rgba(0,0,0,0.18)",
                   background: payBanner.tone === "ok" ? "#ECFDF5" : payBanner.tone === "warn" ? "#FFFBEB" : "#EFF6FF",
                   color: payBanner.tone === "ok" ? "#065F46" : payBanner.tone === "warn" ? "#92400E" : "#1E3A8A",
                   border: `1px solid ${payBanner.tone === "ok" ? "#A7F3D0" : payBanner.tone === "warn" ? "#FCD34D" : "#BFDBFE"}` }}>
          {payBanner.text}
          <button onClick={() => setPayBanner(null)} aria-label="Dismiss" className="btn"
            style={{ position:"absolute", right:8, top:8, width:28, height:28, borderRadius:99, border:"none",
                     background:"rgba(0,0,0,0.06)", cursor:"pointer", fontSize:13 }}>✕</button>
        </div>
      )}

      {/* ── ADMIN PANEL ─────────────────────────────────────────────────────── */}
      {adminPanelOpen && user?.type === "admin" && (
        <Suspense fallback={<DashboardLoading label="the admin panel" />}>
          <AdminPanel user={user} initialTab={adminPanelTab}
            onClose={()=>{ setAdminPanelOpen(false); setAdminPanelTab("accounts"); }} />
        </Suspense>
      )}

      {authModal && <AuthModal onClose={()=>setAuthModal(false)} onAuth={u=>{setUser(u);setAuthModal(false);}} />}

      {infoPage && <InfoPageModal page={infoPage} onClose={()=>setInfoPage(null)} />}

      {/* ── PASSWORD RESET (from recovery email link) ─────────────────── */}
      {recoveryToken && (
        <ResetPasswordScreen
          token={recoveryToken}
          onDone={() => { setRecoveryToken(null); setAuthModal(true); }}
        />
      )}

      {/* ── REQUEST SENT MODAL ──────────────────────────────────────── */}
      {requestsSent && (
        <RequestSentModal
          requests={requestsSent}
          onClose={() => setRequestsSent(null)}
          onViewAccount={() => { setRequestsSent(null); setAccountOpen(true); }}
        />
      )}

      {/* ── ACCOUNT PANEL (dropdown) ─────────────────────────────────── */}
      {accountOpen && user && (
        <AccountPanel
          user={user}
          justSent={recentlySent}
          allCards={dbVendors}
          initialTab={accountTab}
          initialConvId={accountConvId}
          onClose={() => { setAccountOpen(false); setNotifOpen(false); }}
          onLogout={handleLogout}
          onListingSaved={refreshVendors}
        />
      )}

      {openRecap && (
        <RecapModal recap={openRecap} names={recapNames} onClose={() => setOpenRecap(null)} onViewVendor={viewVendorById} />
      )}

      {/* ── CART PANEL ─────────────────────────────────────────────── */}
      {cartOpen && (
        <CartPanel
          cart={cart}
          availByVendor={availByVendor}
          onRemove={rmFromCart}
          onUpdateItem={updateCartItem}
          onClose={() => setCartOpen(false)}
          onSubmitRequests={handleSubmitRequests}
          initialDetails={eventDetails}
          onDetailsChange={setEventDetails}
          user={user}
          setAuthModal={setAuthModal}
          budget={budget}
          onSetBudget={setBudget}
        />
      )}


      {/* ── NAV ────────────────────────────────────────────────────────
          Light and quiet: the logo, the market, the two things people come
          for (find vendors, build an event), the language, the account and
          the cart. Categories live on the page, not in the header. */}
      <nav className={`pluj-nav${navScrolled ? " nav-glass" : ""}`}
        style={{
          position:"sticky", top:0, zIndex:200, height:64,
          display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
          padding:"0 20px",
          background: isHero && !navScrolled ? "#FF5C28" : "rgba(255,255,255,0.96)",
          borderBottom:`1px solid ${navScrolled ? C.border : "transparent"}`,
          backdropFilter:"blur(16px) saturate(160%)",
        }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
          <span onClick={goHome} title="Back to home" role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter") goHome(); }}
            style={{ cursor:"pointer", display:"flex", alignItems:"center" }}>
            <span className="hide-mobile"><PlujMark size={34} /></span>
            <span className="show-mobile"><PlujMark size={32} variant="mark" /></span>
          </span>
          <span className="hide-mobile"><MarketSelector market={market} onSelect={setMarket} light={false} /></span>
        </div>

        <div className="hide-mobile" style={{ display:"flex", alignItems:"center", gap:4 }}>
          {[["all","Find vendors"],["build","Build my event"]].map(([id, label]) => (
            <button key={id} onClick={() => id === "all" ? goBrowseVendors() : pickCat(id)} className="btn"
              style={{ padding:"8px 14px", borderRadius:99, fontSize:14, fontWeight:700,
                       background: activeCat === id && !isHero ? C.bgAlt : "transparent", color:C.black }}>
              {label}
            </button>
          ))}
          <button onClick={() => setInfoPage("Vendor guide")} className="btn"
            style={{ padding:"8px 14px", borderRadius:99, fontSize:14, fontWeight:700, background:"transparent", color:C.midGray }}>
            For vendors
          </button>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <LangToggle />
          {user ? (
            <>
              {user.type !== "guest" && (
                <NotificationBell userId={user.id} open={notifOpen}
                  onClick={() => { setNotifOpen(o=>!o); setAccountOpen(false); }}
                  /* Close the bell and open the account panel on the tab that
                     actually holds the thing they tapped. */
                  onOpenTarget={(t) => {
                    setNotifOpen(false);
                    if (t.admin && user.type === "admin") {
                      setAdminPanelTab(t.adminTab || "accounts");
                      setAccountOpen(false); setAdminPanelOpen(true);
                      return;
                    }
                    if (t.admin && !t.tab) return;
                    setAccountTab(t.tab); setAccountConvId(t.id); setAccountOpen(true); }} />
              )}
              <button onClick={() => { setAccountOpen(o=>!o); setNotifOpen(false); }}
                className="btn"
                style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer",
                          background: user.type==="admin" ? "#000" : "#fff",
                          border:`1px solid ${user.type==="admin" ? "#000" : C.border}`,
                          borderRadius:99, padding:"5px 14px 5px 7px" }}>
                {/* Admins don't need an avatar letter — the 🛡️ badge already
                    identifies the account. Users and vendors keep theirs. */}
                {user.type !== "admin" && (
                  <Avatar name={user.displayName||user.name} size={26}
                    bg={user.type==="vendor"?"#7C3AED":C.orange} />
                )}
                <span style={{ fontSize:13, fontWeight:700,
                               color: user.type==="admin" ? "#fff" : C.black, marginLeft: user.type==="admin" ? 7 : 0 }}>
                  {(user.displayName||user.name||"").split(" ")[0]}
                </span>
                {user.type==="admin"  && <span style={{ fontSize:10, background:"rgba(255,255,255,0.15)", color:"#fff", padding:"1px 7px", borderRadius:99, fontWeight:800 }}>🛡️ Admin</span>}
                {user.type==="vendor" && <span style={{ fontSize:10, background:"#F5F3FF", color:"#7C3AED", padding:"1px 7px", borderRadius:99, fontWeight:700 }}>
                  {user.status==="approved" ? "✓ Vendor" : user.status==="rejected" ? "✗ Vendor" : "⏳ Vendor"}
                </span>}
                {user.type==="admin" && (
                  <button onClick={e=>{e.stopPropagation();setAdminPanelTab("accounts");setAdminPanelOpen(true);}} className="btn"
                    style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:99,
                             padding:"2px 8px", fontSize:10, color:"#fff", fontWeight:700, marginLeft:2 }}>
                    Panel
                  </button>
                )}
              </button>
              <button onClick={async()=>{await clearSession();setUser(null);}} className="btn"
                style={{ background:"transparent",
                         border:"none", borderRadius:99, padding:"7px 13px", fontSize:12,
                         fontWeight:700, color:C.black }}>
                Log out
              </button>
            </>
          ) : (
            <>
              {/* One button. "Log in" and "Sign up" both opened the same
                  modal on the same tab, so two buttons only asked people to
                  make a choice that made no difference. The modal has its own
                  Log in / Sign up switch at the top. */}
              <button onClick={() => setAuthModal(true)} className="btn"
                style={{ background:"#000",
                         border:"none", borderRadius:99, padding:"8px 18px", fontSize:13,
                         fontWeight:800, color:"#fff", whiteSpace:"nowrap" }}><span className="hide-mobile">Log in / Sign up</span><span className="show-mobile">Log in</span></button>
            </>
          )}
          <button onClick={() => { setCartOpen(true); setNotifOpen(false); }} className="btn"
            aria-label={cart.length ? `Cart, ${cart.length} vendors` : "Cart"}
            style={{ position:"relative", background: cart.length ? C.black : C.bgAlt,
                     color: cart.length ? "#fff" : C.black,
                     border:"none", borderRadius:99, padding:"8px 14px", fontSize:13,
                     fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
            <Emoji e="🛒" size={15} />
            {cart.length > 0 && (
              <span style={{ background:C.orange, color:"#fff", borderRadius:99,
                             fontSize:11, fontWeight:800, padding:"0 6px" }}>{cart.length}</span>
            )}
          </button>
        </div>
      </nav>

      {/* One list of places for every "Where" box. */}
      <datalist id="pluj-where-options">
        {whereSuggestions.map(c => <option key={c} value={c} />)}
      </datalist>

      {/* ── STICKY SEARCH (results pages, and the home page once scrolled) ──
          The text search and the four criteria in one row. It replaces two
          stacked bars. On the home page it only appears after the hero, where
          the hero's own search has scrolled away. */}
      {activeCat !== "build" && !vendorPage && (!isHero || navScrolled) && (
        <div style={{ position:"sticky", top:64, zIndex:190, background:"rgba(255,255,255,0.97)",
                      backdropFilter:"blur(16px)", borderBottom:`1px solid ${C.border}`,
                      padding:"10px 16px" }}>
          <div style={{ maxWidth:1240, margin:"0 auto", display:"flex", flexWrap:"wrap", gap:8, alignItems:"stretch" }}>
            <label className="sq" style={{ flex:"2 1 220px", minWidth:180, display:"flex", alignItems:"center", gap:8,
                            border:`1px solid ${C.border}`, borderRadius:12, padding:"0 12px", background:"#fff" }}>
              <span aria-hidden="true">🔍</span>
              <input ref={searchRef} placeholder="Search DJs, catering, flowers, lighting..."
                value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") pickCat("all"); }}
                aria-label="Search vendors"
                style={{ flex:1, border:"none", outline:"none", fontSize:14, height:40, background:"transparent", minWidth:0 }} />
              {search && (
                <button onClick={() => setSearch("")} className="btn" aria-label="Clear search"
                  style={{ background:"none", color:C.lightGray, fontSize:16, padding:"0 2px" }}>✕</button>
              )}
            </label>
            {[
              ["Where", <input value={qWhere} onChange={e=>setQWhere(e.target.value)} placeholder="City or area"
                          list="pluj-where-options" autoComplete="off" aria-label="Where" />],
              ["When", <input type="date" value={qWhen} onChange={e=>setQWhen(e.target.value)} aria-label="When"
                          min={new Date().toISOString().split("T")[0]} style={{ color: qWhen ? C.black : C.lightGray }} />],
              ["Service", <select value={activeCat} onChange={e=>pickCat(e.target.value)} aria-label="Service">
                          {CATEGORIES.filter(c=>c.id!=="build").map(c=>(
                            <option key={c.id} value={c.id}>{c.id==="all" ? "Any service" : c.label}</option>
                          ))}
                        </select>],
              ["Event", <select value={qEventType} onChange={e=>setQEventType(e.target.value)} aria-label="Event type"
                          style={{ color: qEventType ? C.black : C.lightGray }}>
                          <option value="">Any occasion</option>
                          {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                        </select>],
              ["Guests", <input type="number" min="1" value={qGuests} onChange={e=>setQGuests(e.target.value)}
                          placeholder="How many" aria-label="Guests" />],
            ].map(([label, field]) => (
              <label key={label} className={`crit${critOpen ? " open" : ""}`} style={{ flex:"1 1 120px", minWidth:110, border:`1px solid ${C.border}`,
                                         borderRadius:12, padding:"5px 11px", background:"#fff" }}>
                <span style={{ display:"block", fontSize:11, fontWeight:700, color:C.midGray }}>{label}</span>
                {React.cloneElement(field, { style:{ width:"100%", border:"none", outline:"none", fontSize:13.5,
                                             background:"transparent", padding:0, ...(field.props.style || {}) } })}
              </label>
            ))}
            <button type="button" className="btn crit-toggle" onClick={() => setCritOpen(o => !o)} aria-expanded={critOpen}
              style={{ border:`1px solid ${C.border}`, background:"#fff", borderRadius:12, padding:"0 14px",
                       fontSize:13.5, fontWeight:700, minHeight:44 }}>
              {critOpen ? "Hide filters" : "Filters"}
            </button>
            <button onClick={() => {
                if (activeCat === "build") pickCat("all");
                requestAnimationFrame(() => {
                  const el = document.getElementById("results-top");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }} className="btn sgo"
              style={{ background:"#000", color:"#fff", borderRadius:12, padding:"0 20px",
                       fontSize:14, fontWeight:800, whiteSpace:"nowrap", minHeight:44 }}>
              Search
            </button>
            {(qWhere || qWhen || qGuests || qEventType || search) && (
              <button onClick={()=>{setQWhere("");setQWhen("");setQGuests("");setQEventType("");setSearch("");}} className="btn"
                style={{ border:`1px solid ${C.border}`, background:"#fff", borderRadius:12,
                         padding:"0 14px", fontSize:13, fontWeight:700, color:C.midGray, minHeight:44 }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── HERO ─────────────────────────────────────────────────────────
          A marigold field; the artwork is built from the logo's own shapes
          (the dot, the bowl, the half moon) with the event photo set inside
          the bowl. The thesis is the product's difference, one price for the
          whole event, and the ticket shows what that means (an example). */}
      {isHero && (
        <section className="hero-field">
          <div className="home-hero">
            <div>
              <h1>One booking.<br />The whole party.</h1>
              <p className="lede">
                Venues, food, music, photos, decor, rentals and staff for birthdays, weddings, showers,
                graduations and office parties. Every pro is checked by PLUJ, and the price you see is the price you pay.
              </p>

              <div className="hero-search" role="search">
                <label>
                  <span>Where</span>
                  <input value={qWhere} onChange={e=>setQWhere(e.target.value)} placeholder="City or area"
                    list="pluj-where-options" autoComplete="off" />
                </label>
                <label>
                  <span>When</span>
                  <input type="date" value={qWhen} onChange={e=>setQWhen(e.target.value)}
                    min={new Date().toISOString().split("T")[0]} style={{ color: qWhen ? "#000" : "#6B6B6B" }} />
                </label>
                <label>
                  <span>What you need</span>
                  <select value={activeCat} onChange={e=>pickCat(e.target.value)}>
                    {CATEGORIES.filter(c=>c.id!=="build").map(c=>(
                      <option key={c.id} value={c.id}>{c.id==="all" ? "Any service" : c.label}</option>
                    ))}
                  </select>
                </label>
                <label style={{ borderRight:"none" }}>
                  <span>Guests</span>
                  <input type="number" min="1" value={qGuests} onChange={e=>setQGuests(e.target.value)} placeholder="How many" />
                </label>
                <button className="btn go" onClick={() => {
                    requestAnimationFrame(() => {
                      const el = document.getElementById("results-top");
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}>
                  Find vendors
                </button>
              </div>

              <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:18, marginTop:18 }}>
                <button onClick={() => pickCat("build")} className="hero-alt">Plan it step by step instead</button>
                {(qWhere || qGuests || qWhen) && (
                  <button onClick={()=>{setQWhere("");setQWhen("");setQGuests("");setQEventType("");}}
                    className="hero-alt" style={{ fontWeight:600, textDecorationThickness:1 }}>
                    Clear search
                  </button>
                )}
              </div>

              <div className="promise-row">
                <span className="promise"><span><b>One price.</b> Nothing added at checkout</span></span>
                <span className="promise"><span><b>Instant booking</b> on open dates</span></span>
                <span className="promise"><span><b>Checked by hand.</b> Every pro</span></span>
              </div>
            </div>

            <div className="hero-art" aria-hidden="true">
              <span className="shape dot" />
              <div className="hero-photo">
                <img src={market?.hero || "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1400&q=80"} alt="" />
              </div>
              <span className="shape moon" />
              <div className="stamp"><Stamp /></div>
              <div className="ticket">
                <div className="top">
                  <span className="ex">Example</span>
                  <span className="tag">Sat, Nov 14, 150 guests</span>
                  <div className="ev">Wedding reception</div>
                  <div className="row"><span>Food truck, 3 hours</span><span className="lead" /><b>$1,500</b></div>
                  <div className="row"><span>DJ and lighting, 5 hours</span><span className="lead" /><b>$1,200</b></div>
                  <div className="row"><span>Dance floor</span><span className="lead" /><b>$450</b></div>
                </div>
                <div className="tear" />
                <div className="bottom">
                  <div>
                    <div className="ok">⚡ Booked instantly</div>
                    <div className="total">$3,150</div>
                    <div className="note">The total you pay. Nothing added.</div>
                  </div>
                  <div className="barcode" />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── VENDOR PROFILE ─────────────────────────────────────────────── */}
      {vendorPage && (
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"32px 24px" }}>
          <VendorProfile vendor={vendorPage} user={user} reviews={reviews} onOpenVendorId={viewVendorById}
            isFav={favorites.includes(vendorPage.id)}
            onToggleFav={handleToggleFav}
            onBack={()=>setVendorPage(null)}
            onRequireAuth={()=>setAuthModal(true)}
            onAddReview={(vid,rev) => { if(!RLS.canReview(user)){setAuthModal(true);return;} addReview(vid,rev); }}
            onVendorReply={vendorReply}
            onAddToCart={addToCart}
            inCart={!!cart.find(c=>c.id===vendorPage.id)} />
        </div>
      )}

      {/* ── MAIN CONTENT ───────────────────────────────────────────────── */}
      {!vendorPage && (
        <div style={{ maxWidth:1280, margin:"0 auto", padding:`${isHero?"28px":"32px"} 24px 100px` }}>

          {/* Categories. On the home page: a directory, every category with the
              services in it, so a host sees the whole event in one place. While
              browsing: one quiet row of pills. Black and white only. */}
          {isHero ? (
            <nav aria-label="Categories" className="dir" style={{ margin:"48px 0 64px" }}>
              <div className="dir-head">
                <h2>Everything your event needs</h2>
                <p>{`${CATEGORIES.filter(c => CAT_SUBS[c.id]?.length > 1).length} categories and ${Object.values(CAT_SUBS).reduce((n, s) => n + s.filter(x => x.id !== "other").length, 0)} kinds of vendors in ${market?.label?.split(",")[0] || "Houston"}. Mix them in one cart and pay one price.`}</p>
              </div>
              <ul className="dir-grid">
                {CATEGORIES.filter(c => c.id !== "all" && c.id !== "other").map(cat => {
                  const list = (CAT_SUBS[cat.id] || []).filter(s => s.id !== "other");
                  const shown = list.slice(0, 5).map(s => s.l);
                  const more = list.length - shown.length;
                  /* For hosts who don't know where to begin: plan it with PLUJ,
                     or hand the whole thing to an event planner (a vendor). */
                  if (cat.id === "build") return (
                    <li key={cat.id} className="wide">
                      <div className="build">
                        <span className="dir-name">Not sure where to start?</span>
                        <div className="build-ways">
                          <button onClick={()=>pickCat("build")}>
                            <b>Build it step by step</b>
                            <span>Answer a few questions and PLUJ lines up a vendor for each part of your event, in order.</span>
                            <span className="go">Build my event</span>
                          </button>
                          <button onClick={()=>{ pickCat("logistics"); setActiveSub("event-planner"); window.scrollTo({ top:0 }); }}>
                            <b>Hand it to a planner</b>
                            <span>No time or no idea where to begin? Hire an event planner and they take care of everything, from the vendors to the day itself.</span>
                            <span className="go">Hire an event planner</span>
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                  return (
                    <li key={cat.id}>
                      <button onClick={()=>pickCat(cat.id)} aria-current={activeCat===cat.id ? "true" : undefined}>
                        <span className="dir-name">{cat.label}</span>
                        <span className="dir-subs">
                          {/* one text node per service, so each one translates on its own */}
                          {shown.map((l, i) => <React.Fragment key={l}>{i ? ", " : ""}{l}</React.Fragment>)}
                          {more > 0 && <span className="more">{` and ${more} more`}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {/* Every kind of celebration, not weddings or spaces alone. Picking
                  one filters the vendors below to pros who work that occasion. */}
              <div className="occasions">
                <h3>For every kind of celebration</h3>
                <div className="pills sm" role="group" aria-label="Occasions">
                  {["birthday","wedding","baby","graduation","corporate","kids","social","quince","concert","seminar"].map(id => {
                    const t = EVENT_TYPES.find(e => e.id === id);
                    if (!t) return null;
                    return (
                      <button key={id} className={qEventType === id ? "on" : ""} aria-pressed={qEventType === id}
                        onClick={() => {
                          const off = qEventType === id;
                          setQEventType(off ? "" : id);
                          const pkg = EVENT_PACKAGES.find(p => p.id === id);
                          if (off) setActivePackage(null); else if (pkg) handleSelectPackage(pkg);
                          requestAnimationFrame(() => {
                            const el = document.getElementById("results-top");
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                          });
                        }}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </nav>
          ) : (
            <nav aria-label="Categories" className="pills" style={{ margin:"6px 0 28px" }}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={()=>pickCat(cat.id)} aria-current={activeCat===cat.id ? "true" : undefined}
                  className={activeCat===cat.id ? "on" : ""}>
                  {cat.id === "all" ? "Everything" : cat.label}
                </button>
              ))}
            </nav>
          )}

          {/* ── SUBCATEGORY GRID ──────────────────────────────────────── */}
          {showSubGrid && (
            <div className="fade-up">
              <div style={{ marginBottom:18 }}>
                <h2 style={{ fontSize:"clamp(34px, 4vw, 52px)", lineHeight:0.95, margin:"0 0 8px" }}>{catObj?.label}</h2>
                <p style={{ fontSize:15, color:"#4B5260", margin:0 }}>Pick a service, or search above.</p>
              </div>
              <ul className="dir-grid sub" style={{ marginBottom:40 }}>
                {subs.map(s => (
                  <li key={s.id}>
                    <button onClick={()=>setActiveSub(s.id)}>
                      <span className="dir-name">{s.l}</span>
                      <span className="dir-subs">{s.d}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {/* Featured for this category */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:24 }}>
                <h3 style={{ fontSize:18, fontWeight:800, margin:"0 0 16px", letterSpacing:"-0.02em" }}>Featured in {catObj?.label}</h3>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(270px, 1fr))", gap:16 }}>
                  {VENDORS.filter(v=>v.cat===activeCat&&v.feat).slice(0,3).map(v=>(
                    <VCard key={v.id} v={v} inCart={!!cart.find(c=>c.id===v.id)} isFav={favorites.includes(v.id)} onAdd={addToCart} onRemove={rmFromCart} onView={(vv)=>viewVendor(vv||v)} onToggleFav={handleToggleFav} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SUB BREADCRUMB */}
          {activeSub && subObj && (
            <div style={{ marginBottom:20 }} className="fade-up">
              <button onClick={()=>setActiveSub(null)} className="btn"
                style={{ background:"none", border:"none", fontSize:14, color:"#000", fontWeight:700, padding:"6px 0", marginBottom:8 }}>
                ← {catObj?.label}
              </button>
              <h2 style={{ fontSize:"clamp(34px, 4vw, 52px)", lineHeight:0.95, margin:"0 0 8px" }}>{subObj.l}</h2>
              <p style={{ margin:"0 0 16px", fontSize:15, color:"#4B5260", maxWidth:"62ch", lineHeight:1.5 }}>
                {subObj.id === "event-planner"
                  ? "A planner takes the whole event off your hands: they set the budget with you, book every vendor, keep the timeline and run the day. Book them here like any other vendor, at one price."
                  : subObj.d}
              </p>
              <div className="pills sm" role="group" aria-label={`Services in ${catObj?.label || ""}`}>
                {subs.map(s=>(
                  <button key={s.id} onClick={()=>setActiveSub(s.id)} className={activeSub===s.id ? "on" : ""}
                    aria-pressed={activeSub===s.id}>
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── BUILD MY EVENT WIZARD ─────────────────────────────────── */}
          {/* ── EVENT PACKAGES / BUILD PAGE ── */}
          {activeCat === "build" && (
            <BuildEventWizard
              /* Everything the customer has already chosen narrows what the
                 next step offers. A vendor who can't do that date, doesn't
                 cover that area, or can't hold that many people is not shown
                 at all — not greyed out, not shown with a warning. Offering
                 something that cannot be booked is how a customer ended up
                 with a venue in Houston on the 12th and a DJ in Katy on the
                 13th. The wizard also calls this with one field blanked to
                 work out which choice is blocking an empty result. */
              vendorsFor={(catId, eventId, ctx = {}) => {
                const ALL = [...dbVendors, ...VENDORS];
                return ALL.filter(v =>
                  String(v.cat || "").toLowerCase() === catId &&
                  matchesEventType(v, eventId) &&
                  matchesWhere(v, ctx.city || "") &&
                  matchesWhen(v, ctx.date || "", ctx.startTime || "", ctx.endTime || "") &&
                  matchesGuests(v, ctx.guests || ""));
              }}
              cart={cart}
              addToCart={addToCart}
              rmFromCart={rmFromCart}
              onView={(vv)=>setVendorPage(vv)}
              favorites={favorites}
              onToggleFav={handleToggleFav}
              onReviewSend={(details)=>{ setBuildDetails(details); setCartOpen(true); }}
              onExit={()=>pickCat("all")}
            />
          )}

          {/* ── ACTIVE PACKAGE BANNER ── */}
          {activePackage && activeCat !== "build" && !vendorPage && (() => {
            /* The occasion's checklist, tied to booking: each service is
               ticked once something in the cart covers it, and an open one
               takes you straight to those vendors. */
            const pool = dbVendors.length ? dbVendors : VENDORS;
            const have = cartSubs(cart, pool);
            const items = activePackage.subs.slice(0, 14);
            const done = items.filter(x => have.has(x)).length;
            return (
              <section aria-label="Your checklist" style={{ border:"2px solid #000", borderRadius:6, padding:"14px 16px", marginBottom:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12, flexWrap:"wrap", marginBottom:10 }}>
                  <p style={{ margin:0, fontSize:16, fontWeight:800, color:"#000" }}>
                    {`Your ${activePackage.label} checklist`}
                  </p>
                  <span style={{ fontSize:13, color:"#4B5260" }}>{`${done} of ${items.length} booked`}</span>
                  <button onClick={() => setActivePackage(null)} className="btn"
                    style={{ background:"#fff", border:"1.5px solid #000", borderRadius:99, padding:"6px 14px", fontSize:12.5, fontWeight:700, color:"#000" }}>
                    Close checklist
                  </button>
                </div>
                <div className="pills sm">
                  {items.map(x => {
                    const ok = have.has(x);
                    const info = subInfo(x);
                    return (
                      <button key={x} className={ok ? "on" : ""} aria-pressed={ok}
                        onClick={() => { if (!ok) { setActiveCat(info.cat); setActiveSub(x); } }}>
                        {ok ? "✓ " : ""}{info.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })()}



          {/* ── VENDOR GRID ───────────────────────────────────────────── */}
          {/* This used to be hidden whenever the sub-category tiles were on
              screen, so picking "Food & Drinks" showed six tiles and no
              listings — even with three catering listings sitting right there.
              Customers read that as "this category is empty" and left.

              The tiles are a way to narrow down, not a gate to get through. So
              the results now render underneath them, and the count line above
              ("3 vendors in Food & Drinks") tells you what is there before you
              commit to a sub-category. */}
          {activeCat !== "build" && (
            <div className="fade-up" id="results-top" ref={vendorGridRef} style={{ scrollMarginTop:140 }}>
              {isHero && (
                <h2 style={{ fontSize:"clamp(24px,2.6vw,32px)", fontWeight:600, margin:"6px 0 4px" }}>
                  Vendors in {market?.label || "Houston, TX"}
                </h2>
              )}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:16 }}>
                <p style={{ fontSize:13, color:C.midGray, margin:0, fontWeight:500 }}>
                  <strong style={{ color:C.black, fontWeight:700 }}>{filtered.length}</strong> {filtered.length!==1?"vendors":"vendor"}
                  {subObj?` in ${subObj.l}`:catObj&&activeCat!=="all"?` in ${catObj.label}`:""}
                  {search?` for "${search}"`:""}
                </p>
                <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
                  style={{ padding:"7px 14px", borderRadius:99, border:`1px solid ${C.border}`,
                           background:"#fff", fontSize:12, fontWeight:600, color:C.black, cursor:"pointer",
                           transition:"border-color 200ms cubic-bezier(0,0,1,1)" }}>
                  <option value="featured">Best match</option>
                  <option value="rating">Top rated</option>
                  <option value="price">Lowest price</option>
                  <option value="newest">Most experienced</option>
                </select>
              </div>
              {/* Filters bar */}
              <FiltersBar filters={filters} onChange={updateFilter} totalCount={filtered.length} />

              {/* Recommendations strip */}
              <RecommendationStrip recs={recs} onAdd={addToCart} onView={(vv)=>setVendorPage(vv||null)} cart={cart} />

              {/* Vendor grid */}
              <div className="vendor-grid"
                style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(270px, 1fr))", gap:16 }}>
                {filtered.length === 0 && (
                  <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"48px 20px" }}>
                    <p style={{ margin:0, fontSize:16, fontWeight:800 }}>No vendors match yet</p>
                    <p style={{ margin:"6px 0 14px", fontSize:13, color:C.midGray, lineHeight:1.6 }}>
                      {(() => {
                        const crit = [
                          qWhere  && `available in “${qWhere}”`,
                          qWhen   && `free on ${qWhen}`,
                          qGuests && `able to host ${qGuests} guests`,
                        ].filter(Boolean);
                        if (crit.length) {
                          return `No vendors are ${crit.join(", ")}. Vendors that are booked, don't cover that area, or can't fit that headcount are hidden. Try a different date, location, or guest count.`;
                        }
                        return search
                          ? "Try clearing your search — or widen the location or guest count."
                          : "We're onboarding vendors in your area now. Check back soon, or list your business to be one of the first.";
                      })()}
                    </p>
                    {(qWhere || qGuests || search) ? (
                      <button onClick={()=>{setQWhere("");setQGuests("");setQWhen("");setSearch("");}} className="btn"
                        style={{ background:C.black, color:"#fff", border:"none", borderRadius:10,
                                 padding:"10px 18px", fontSize:13, fontWeight:700 }}>
                        Clear filters
                      </button>
                    ) : (
                      <button onClick={()=>setAuthModal(true)} className="btn"
                        style={{ background:"#000", color:"#fff", border:"none", borderRadius:10,
                                 padding:"10px 18px", fontSize:13, fontWeight:700 }}>
                        List my business
                      </button>
                    )}
                  </div>
                )}
                {visible.map(v=><VCard key={v.id} v={v} inCart={!!cart.find(c=>c.id===v.id)} isFav={favorites.includes(v.id)} onAdd={addToCart} onRemove={rmFromCart} onView={(vv)=>viewVendor(vv||v)} onToggleFav={handleToggleFav} />)}
              </div>

              {/* Says how many are left, not just "Load more". A count is the
                  difference between "there is more" and "there are 137 more,
                  narrow your filters" — the second one is actionable. */}
              {moreCount > 0 && (
                <div style={{ textAlign:"center", marginTop:28 }}>
                  <button onClick={() => setShownCount(n => n + PAGE_SIZE)} className="btn"
                    style={{ background:"#fff", color:C.black, border:`1px solid ${C.border}`,
                             borderRadius:99, padding:"12px 28px", fontSize:14, fontWeight:700,
                             letterSpacing:"-0.01em" }}>
                    Show {Math.min(PAGE_SIZE, moreCount)} more
                  </button>
                  <p style={{ margin:"10px 0 0", fontSize:12, color:C.midGray }}>
                    Showing {visible.length} of {filtered.length}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── TRUST + VENDORS (home) ──────────────────────────────────── */}
          {isHero && activeCat==="all" && !q && (
            <>
              <div style={{ marginTop:56 }}><HowItWorks /></div>
              {homeRecaps.length > 0 && (
                <section style={{ marginTop:24, marginBottom:56 }} aria-labelledby="recaps-h">
                  <h2 id="recaps-h" style={{ fontSize:"clamp(36px,4.4vw,60px)", margin:"0 0 6px", lineHeight:0.95 }}>Real events by PLUJ pros</h2>
                  <p style={{ margin:"0 0 20px", fontSize:16, color:"#333" }}>Every pro who worked each one is credited, so you can book the same team.</p>
                  <RecapCards recaps={homeRecaps} names={recapNames} onOpen={setOpenRecap} />
                </section>
              )}
              <section style={{ marginTop:40 }}>
                <h2 style={{ fontSize:"clamp(40px,5vw,68px)", margin:"0 0 22px" }}>The difference, line by line</h2>
                <div className="compare" role="table" aria-label="PLUJ compared with typical event sites">
                  <div className="crow head" role="row">
                    <span role="columnheader" />
                    <span role="columnheader">Typical event sites</span>
                    <span role="columnheader" className="us">PLUJ</span>
                  </div>
                  {[
                    ["Your event", "One piece per site: a venue here, a DJ there", "Every piece in one cart"],
                    ["Celebrations", "Often one kind, like weddings", "Every kind, from birthdays to office parties"],
                    ["Price", "A quote, after you ask and wait", "Shown upfront, one total"],
                    ["Booking", "Wait for each vendor to reply", "Instant on open dates"],
                    ["Fees", "Added at checkout", "Already in the price"],
                    ["Vendors", "Little or no checking", "Legal details checked, approved by hand"],
                    ["Reviews", "Anyone can post", "Only after a real booking, revealed together"],
                    ["If a vendor cancels", "Usually up to you to fix", "We find you a replacement"],
                    ["Language", "English", "English and Spanish"],
                  ].map(([k, a, b]) => (
                    <div className="crow" role="row" key={k}>
                      <span role="rowheader">{k}</span>
                      <span role="cell" className="them">{a}</span>
                      <span role="cell" className="us">{b}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* The PLUJ promise. Worded to what PLUJ delivers today: finding a
                  replacement always; the full refund when the booking was paid
                  through PLUJ (with payment off, money goes host to vendor). */}
              <section className="promise-block" aria-labelledby="promise-h">
                <p className="kicker">The PLUJ promise</p>
                <h2 id="promise-h">If a pro cancels, we find you a replacement.</h2>
                <div className="promise-cols">
                  <p>Pay through PLUJ and you also get back every dollar you paid, fees included, from the pro's locked balance. Your money waits for the event either way: the last part is only paid out after it.</p>
                  <p>It's written into our Terms, not hidden in a help article. And if something goes wrong on the day, you talk to real people at PLUJ, in English or Spanish.</p>
                </div>
                <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                  <button onClick={() => setInfoPage("Terms")} className="btn promise-link"
                    style={{ background:"#000", color:"#fff" }}>Read the guarantee</button>
                  <span className="tag">#weknowaguy</span>
                </div>
              </section>

              <section className="vendor-band" style={{ marginTop:80 }}>
                <div>
                  <p style={{ margin:"0 0 14px", fontSize:15, fontWeight:700, color:"#FF5C28" }}>Pros wanted in Houston</p>
                  <h2>No contracts.<br />No bidding wars.</h2>
                  <p style={{ fontSize:17, color:"rgba(255,255,255,0.78)", lineHeight:1.6, margin:"0 0 26px", maxWidth:"32em" }}>
                    You pay only when you get booked. No subscriptions, no paying for leads that never close, no year-long ad
                    contracts. The hosts who book you already have a date, a guest count and a price.
                  </p>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                    <button onClick={() => setAuthModal(true)} className="btn"
                      style={{ background:"#FF5C28", color:"#000", borderRadius:99, padding:"14px 24px", fontSize:15.5, fontWeight:800 }}>
                      List your business
                    </button>
                    <button onClick={() => setInfoPage("Vendor guide")} className="btn"
                      style={{ background:"transparent", color:"#fff", border:"1.5px solid rgba(255,255,255,0.5)",
                               borderRadius:99, padding:"14px 24px", fontSize:15.5, fontWeight:700 }}>
                      Read the vendor guide
                    </button>
                  </div>
                </div>
                <div>
                  <div className="fact"><b>$0</b><span>to join, list your services and receive requests</span></div>
                  <div className="fact"><b>0%</b><span>service fee for your first three months</span></div>
                  <div className="fact"><b>3%</b><span>after that, and only on bookings you actually get</span></div>
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer className="foot">
        <div className="foot-in">
          <div>
            <span onClick={goHome} title="Back to home" style={{ cursor:"pointer", display:"inline-flex" }}>
              <PlujMark size={28} />
            </span>
            <p style={{ fontSize:14, color:C.midGray, margin:"12px 0 14px", maxWidth:"26em", lineHeight:1.6 }}>
              One booking, the whole party. Houston's marketplace for every kind of celebration, in English and Spanish.
            </p>
            <LangToggle />
          </div>
          {[
            ["For hosts", ["How it works","Host guide","Help center","Cancellations and refunds"]],
            ["For vendors", ["Vendor guide","Become a vendor","Marketplace rules"]],
            ["PLUJ", ["About","Terms","Privacy"]],
          ].map(([h, links]) => (
            <div key={h}>
              <h4>{h}</h4>
              {links.map(l => (
                <button key={l} className="lnk" onClick={() => {
                    if (l === "Become a vendor") { setAuthModal(true); return; }
                    setInfoPage(l);
                  }}>{l}</button>
              ))}
            </div>
          ))}
        </div>
        {/* The wordmark, the full width of the page. */}
        <div className="wordmark" aria-hidden="true"><PlujMark variant="word" size={400} color="#FF5C28" /></div>
        <div style={{ maxWidth:1240, margin:"0 auto", padding:"16px 28px 30px",
                      display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8, fontSize:13.5, color:"#4B5260" }}>
          <span>© 2026 PLUJ, Houston, Texas</span>
          <span>Every pro checked by hand · #weknowaguy</span>
        </div>
      </footer>
    </div>
  );
}
