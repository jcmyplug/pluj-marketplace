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
export function PlujMark({ size = 32, light = false }) {
  return (
    <span
      aria-label="PLUJ"
      role="img"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(size * 0.2),
        color: light ? "#FFFFFF" : "#111111",
        transition: "color 400ms ease",
        flexShrink: 0,
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      {/* Two interlocking links — the chain the wordmark always sat beside. */}
      <svg
        height={Math.round(size * 0.74)}
        viewBox="0 0 46 24"
        aria-hidden="true"
        focusable="false"
        style={{ display: "block", flexShrink: 0, overflow: "visible" }}
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 5h-6a7 7 0 0 0 0 14h6" />
          <path d="M28 5h6a7 7 0 0 1 0 14h-6" />
          <path d="M16.5 12h13" />
        </g>
      </svg>
      <span
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontWeight: 900,
          fontSize: Math.round(size * 0.86),
          letterSpacing: "-0.015em",
        }}
      >
        pluj
      </span>
    </span>
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
        <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, fontWeight:800,
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
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;0,900;1,400&family=Inter:wght@400;500;600;700&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #fff; }
.pluj { font-family: 'Inter', sans-serif; color: #111; background: #fff; min-height: 100vh; }
.pluj button, .pluj input, .pluj select, .pluj textarea { font-family: 'Inter', sans-serif; }
.pluj h1, .pluj h2, .pluj h3 { font-family: 'Playfair Display', serif; }
input { outline: none; }

/* ── Focus rings only on keyboard navigation (Uber Eats pattern) ── */
input:focus-visible { border-color: #276EF1 !important; box-shadow: 0 0 0 3px rgba(39,110,241,0.18) !important; }
input:focus:not(:focus-visible) { border-color: #E5E7EB !important; box-shadow: none !important; }
textarea:focus-visible { outline: 2px solid rgba(39,110,241,0.35) !important; outline-offset: 2px; }
textarea:focus:not(:focus-visible) { outline: none !important; }
select:focus-visible { outline: 2px solid rgba(39,110,241,0.35); outline-offset: 1px; }
select:focus:not(:focus-visible) { outline: none; }

/* ── Buttons: 200ms cubic-bezier(0,0,1,1) — Uber Eats exact timing ── */
.btn {
  transition: background 200ms cubic-bezier(0,0,1,1), color 200ms cubic-bezier(0,0,1,1),
              border-color 200ms cubic-bezier(0,0,1,1), transform 0.1s ease,
              box-shadow 0.15s ease, opacity 0.15s ease;
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
  border-radius: 20px; overflow: hidden; background: #fff;
  border: 1px solid #E5E7EB; transition: all 0.22s ease;
  cursor: pointer;
}
.vcard2:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06);
  border-color: transparent;
}
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
.gradient-text {
  background: linear-gradient(135deg, #FF5C28 0%, #FF8C00 50%, #FFB800 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}

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
  orange: "#FF5C28", orangeHov: "#E84E1E", orangeSoft: "#FFF1EC",
  orangeBorder: "rgba(255,92,40,0.22)", orangeGlow: "rgba(255,92,40,0.35)",

  /* ── Neutrals ── */
  black: "#0A0A0A", darkGray: "#1A1A1A", midGray: "#6B7280",
  lightGray: "#9CA3AF", border: "#E5E7EB", borderLight: "#F3F4F6",
  bg: "#FAFAFA", bgAlt: "#F7F8FC", white: "#fff",

  /* ── Semantic ── */
  green: "#10B981", greenSoft: "#ECFDF5", greenDark: "#065F46",
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
  shadowCard:   "0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
  shadowMd:     "0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
  shadowLg:     "0 12px 32px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)",
  shadowPopover:"0 0 8px rgba(0,0,0,0.10), 0 4px 4px rgba(0,0,0,0.04)",
  shadowDrawer: "-4px 0 40px rgba(0,0,0,0.12)",
  shadowModal:  "0 32px 80px rgba(0,0,0,0.24), 0 8px 24px rgba(0,0,0,0.10)",
  shadowButton: "0 4px 18px rgba(255,92,40,0.42)",
  shadowViolet: "0 4px 18px rgba(122,92,255,0.38)",
};

/* ─── SEED DATA ──────────────────────────────────────────────────────────────── */
export const CATEGORIES = [
  { id:"all",        label:"All",                 icon:"✦" },
  { id:"food",       label:"Food & Drinks",        icon:"🍽️" },
  { id:"music",      label:"Music & Performance",  icon:"🎵" },
  { id:"production", label:"Decor & Styling",     icon:"✨" },
  { id:"logistics",  label:"Logistics",            icon:"📦" },
  { id:"places",     label:"Places & Venues",      icon:"🏛️" },
  { id:"rentals",    label:"Rentals",              icon:"🪑" },
  { id:"av",         label:"Audio & Visual",       icon:"🔊" },
  { id:"other",      label:"Other Services",       icon:"➕" },
  { id:"build",      label:"Build My Event",       icon:"⚡" },
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
];
const PRODUCTION_SUBS = [
  { id:"decor",      l:"Event Decor",        e:"✨", c:"#FFF1F2", a:"#BE123C", d:"Themed décor & centerpieces" },
  { id:"flowers",    l:"Flowers & Florals",  e:"💐", c:"#F0FDF4", a:"#15803D", d:"Floral arrangements & arches" },
  { id:"balloons",   l:"Balloons & Installs",e:"🎈", c:"#FFF7ED", a:"#B45309", d:"Balloon arches & installations" },
  { id:"draping",    l:"Draping & Backdrops",e:"🎀", c:"#F5F3FF", a:"#6D28D9", d:"Fabric draping, backdrops & arches" },
];
const LOGISTICS_SUBS = [
  { id:"truck-rental",  l:"Truck & Van Rental",     e:"🚛", c:"#FFF4ED", a:"#C2410C", d:"Box trucks & cargo vans" },
  { id:"drivers",       l:"Drivers & Transport",     e:"🚗", c:"#EFF6FF", a:"#1D4ED8", d:"Drivers for gear & equipment" },
  { id:"contractors",   l:"Independent Contractors", e:"🔧", c:"#F0FDF4", a:"#15803D", d:"Setup crew & laborers" },
  { id:"decorators",    l:"Decorators",              e:"🎨", c:"#FDF2F8", a:"#BE185D", d:"Professional decorators for hire" },
  { id:"event-planner",  l:"Event Planners",           e:"🗓️", c:"#FFF4ED", a:"#C2410C", d:"Full-service planners for any event type" },
  { id:"event-manager",  l:"Event Managers",           e:"📋", c:"#FEFCE8", a:"#A16207", d:"Day-of coordinators & on-site managers" },
  { id:"security",      l:"Security",                e:"🛡️", c:"#FFF1F2", a:"#BE123C", d:"Event security & VIP detail" },
  { id:"valet",         l:"Valet & Parking",         e:"🅿️", c:"#F5F3FF", a:"#7C3AED", d:"Valet attendants & lot management" },
  { id:"cleanup",       l:"Cleanup Crews",           e:"🧹", c:"#ECFDF5", a:"#059669", d:"Pre/post event cleaning" },
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
/* Every category also gets an "Other" subcategory at the end, so a vendor whose
   service we haven't thought of can still list it (they name it themselves in
   the listing's Business name + description). Added programmatically so any
   category added later gets one automatically. */
export const CAT_SUBS = (() => {
  const base = { food: FOOD_SUBS, music: MUSIC_SUBS, production: PRODUCTION_SUBS,
                 logistics: LOGISTICS_SUBS, places: PLACES_SUBS, rentals: RENTALS_SUBS,
                 av: AV_SUBS, other: [] };
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
const EVENT_TYPES = [
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
    subs:["venues","djs","catering","desserts","decor","event-planner","tables-chairs","linens","sound","lighting","cameras","live-bands","cleanup","drivers","entertainers","restrooms","security"] },
  { id:"quince", icon:"👑", label:"Quinceañera / Sweet 16", color:"#FDF2F8", accent:"#BE185D",
    desc:"Elegant milestone celebrations",
    checklist:["Venue","DJ","Catering","Cake","Décor","Event Planner","Rentals (Linens, Chairs, Tables)","Audio & Visual","Photography","Live Band","Clean Up","Drivers & Transport","Animation / Entertainer","Portable Restrooms","Security","Registry for Gifts"],
    subs:["venues","djs","catering","desserts","decor","event-planner","tables-chairs","linens","sound","lighting","cameras","live-bands","cleanup","drivers","entertainers","restrooms","security"] },
  { id:"corporate", icon:"💼", label:"Corporate Event", color:"#EFF6FF", accent:"#1D4ED8",
    desc:"Meetings, launches, team events & galas",
    checklist:["Venue","DJ / Live Music","Catering","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake","Portable Restrooms","Rentals (Generators / Tables / Chairs)","Security"],
    subs:["venues","djs","live-bands","catering","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security"] },
  { id:"birthday", icon:"🎂", label:"Birthday Party", color:"#FFF7ED", accent:"#EA580C",
    desc:"From intimate dinners to massive blowouts",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Generators / Tables / Chairs)","Security","Registry for Gifts"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security"] },
  { id:"concert", icon:"🎤", label:"Concert / Festival", color:"#F5F3FF", accent:"#7C3AED",
    desc:"Live music events, shows & performances",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Stage / Generators / Tables / Chairs)","Security"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security"] },
  { id:"baby", icon:"🍼", label:"Baby Shower", color:"#ECFDF5", accent:"#059669",
    desc:"Intimate celebrations welcoming new life",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Generators / Tables / Chairs)","Security"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security"] },
  { id:"seminar", icon:"📊", label:"Seminar / Conference", color:"#F0FDF4", accent:"#15803D",
    desc:"Professional speaker events & workshops",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Stage / Generators / Tables / Chairs)","Security","Event Manager"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security","event-manager"] },
  { id:"kids", icon:"🧸", label:"Kids Party", color:"#FFF7ED", accent:"#EA580C",
    desc:"Fun-packed parties for the little ones",
    checklist:["Inflatables","Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor (Balloons)","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Generators / Tables / Chairs)","Security","Face Painting"],
    subs:["inflatables","venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","balloons","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","kids-ent"] },
  { id:"graduation", icon:"🎓", label:"Graduation", color:"#EFF6FF", accent:"#1D4ED8",
    desc:"Celebrate the big achievement",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Stage / Generators / Tables / Chairs)","Security","Event Manager"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security","event-manager"] },
  { id:"social", icon:"🥂", label:"Social Gathering", color:"#FFF1F2", accent:"#BE123C",
    desc:"Reunions, dinners & get-togethers",
    checklist:["Venue","DJ / Live Music","Catering / Food Truck","Bar Service","Décor","Valet / Parking","Audio & Visual","Photography","Clean Up","Animation / Entertainer","Cake / Desserts","Portable Restrooms","Rentals (Generators / Tables / Chairs)","Security"],
    subs:["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security"] },
];

const RECS = {
  "Wedding": ["venues","djs","catering","desserts","decor","event-planner","tables-chairs","linens","sound","lighting","cameras","live-bands","cleanup","drivers","entertainers","restrooms","security"],
  "Quinceañera / Sweet 16": ["venues","djs","catering","desserts","decor","event-planner","tables-chairs","linens","sound","lighting","cameras","live-bands","cleanup","drivers","entertainers","restrooms","security"],
  "Corporate Event": ["venues","djs","live-bands","catering","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security"],
  "Birthday Party": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security"],
  "Concert / Festival": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security"],
  "Baby Shower": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security"],
  "Seminar / Conference": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security","event-manager"],
  "Kids Party": ["inflatables","venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","balloons","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security","kids-ent"],
  "Graduation": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","stages","tables-chairs","power","security","event-manager"],
  "Social Gathering": ["venues","djs","live-bands","catering","food-trucks","mobile-bars","decor","valet","sound","lighting","cameras","cleanup","entertainers","desserts","restrooms","tables-chairs","power","security"],
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
     [{ name, description, price }, ...]
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
  }));
}

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
    /* Up to three, within this listing's category. The database trigger drops
       blanks, de-duplicates, caps at 3 and mirrors the first entry back into
       `subcategory`, so we deliberately do not repeat that logic here. */
    subcategories: Array.isArray(svc.subcategories)
                     ? svc.subcategories.filter(Boolean).slice(0, 3)
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

/* Is there a CONFIRMED booking entitling authorId to review subjectId in this
   direction? Client gate for UX; the RLS policy is the real enforcement. */
async function canReviewSubject(authorId, subjectId, direction) {
  if (IS_PREVIEW || !authorId || !subjectId) return false;
  const col = direction === "vendor_to_user"
    ? { self: "vendor_id", other: "user_id" }
    : { self: "user_id",   other: "vendor_id" };
  const { data } = await sb.from("booking_requests")
    .select("id, status").eq(col.self, authorId).eq(col.other, subjectId).get();
  return (data || []).some(b => isConfirmedStatus(b.status));
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
  if (error) return { ok: false, error: error.message || "You can review only after a confirmed booking with this vendor." };
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
    instant:     false,
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
    .select("id, business_name, biz_legal, category, verification_status, created_at, biz_city, biz_state, photo_count, doc_file_name")
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
  }));
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

async function updateRequestStatus(reqId, status, note = "") {
  if (IS_PREVIEW) {
    const req = await _pGet("req:" + reqId);
    if (!req) return null;
    const updated = { ...req, status, note: note || null, updated_at: new Date().toISOString() };
    await _pSet("req:" + reqId, updated);
    return updated;
  }
  const { data, error } = await sb.from("booking_requests").eq("id", reqId).update({
    status, vendor_note: note || null, updated_at: new Date().toISOString(),
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

function track(event, props) {
  if (IS_PREVIEW || !IS_PRODUCTION_HOST) return;
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
  async respondToRequest(reqId, status, note, sessionUser) {
    if (!sessionUser || sessionUser.type !== "vendor") return false;
    const sid = await this._sid();
    if (!sid || sid !== sessionUser.id) return false;
    /* Fetch request from Supabase to verify ownership */
    const { data: reqData } = await sb.from("booking_requests")
      .select("user_id, vendor_id, event_date").eq("id", reqId).single().get();
    if (!reqData || reqData.vendor_id !== sessionUser.id) return false;
    const updated = await updateRequestStatus(reqId, status, note);
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
  const t = cart.reduce((a,v)=>a+(v.pv||0),0);
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
function getRecommendations(cart, activePackage, allVendors) {
  if (!activePackage) return [];
  const cartSubs = new Set(cart.map(v => allVendors.find(vv=>vv.id===v.id)?.sub).filter(Boolean));
  return activePackage.subs
    .filter(sub => !cartSubs.has(sub))
    .map(sub => allVendors.find(v => v.sub===sub && v.feat && v.instant))
    .filter(Boolean)
    .slice(0, 4);
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
                  fontSize:size*0.37, fontWeight:700, flexShrink:0, fontFamily:"'Playfair Display', serif" }}>
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
        biz_phone:        form.bizPhone      || null,
        biz_website:      form.bizWebsite    || null,
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

  const inp = (placeholder, key, type="text", required=false) => (
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
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:800, margin:"0 0 8px" }}>
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
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:800, margin:"0 0 6px" }}>
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
              <button key={t} onClick={()=>{setTab(t);setErr("");setStep(1);setTosAccepted(false);setLegalRead({ Terms:false, Privacy:false, "Marketplace rules":false });setCaptcha(genCaptcha());setRlState({blocked:false,attemptsLeft:5});}} className="btn"
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
                  <button key={r} onClick={()=>{setRole(r);setStep(1);}} className="btn"
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
                Just the basics now. After you confirm your email, your dashboard walks you
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
function RequestSentModal({ requests, onClose, onViewAccount }) {
  /* requests = array of {id, vendorName, status, eventDate, eventType} */
  const multi = requests.length > 1;
  return (
    <div className="modal-overlay" onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000,
               display:"flex", alignItems:"center", justifyContent:"center", padding:20,
               backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} className="fade-up"
        style={{ background:"#fff", borderRadius:22, maxWidth:420, width:"100%",
                 boxShadow:C.shadowModal, overflow:"hidden" }}>
        <div style={{ padding:"36px 28px 32px", textAlign:"center" }}>
          <div style={{ fontSize:52, lineHeight:1, marginBottom:14 }}>📩</div>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:800, margin:"0 0 8px" }}>
            {multi ? "Requests sent!" : "Request sent!"}
          </h2>
          <p style={{ fontSize:13, color:C.midGray, margin:"0 0 22px", lineHeight:1.65 }}>
            {multi
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
                <span style={{ fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:99,
                               background:"#FFFBEB", color:"#D97706" }}>
                  ⏳ Pending
                </span>
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
            <div style={{ background:"#F3F4F6", borderRadius:10, padding:"10px 14px", marginBottom:14, border:`1px solid ${C.border}` }}>
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:C.midGray }}>You cancelled this request.</p>
            </div>
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
                           color:C.black, resize:"none", fontFamily:"'Inter',sans-serif", background:"#fff" }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.midGray }}>Message to vendor</label>
                <textarea value={form.message} onChange={e => upd("message", e.target.value)}
                  placeholder="Describe your event, special requirements..."
                  rows={3}
                  style={{ width:"100%", padding:"9px 12px", marginTop:4,
                           border:`1px solid ${C.border}`, borderRadius:9, fontSize:12,
                           color:C.black, resize:"none", fontFamily:"'Inter',sans-serif", background:"#fff" }} />
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
                  {lateCancel
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
                  const msg = lateCancel
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

  async function respond(reqId, status) {
    const updated = await RLS.respondToRequest(reqId, status, "", user);
    if (updated) setRequests(r => r.map(req => req.id === reqId ? updated : req));
  }

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
                      {/* Vendor approve / decline buttons */}
                      {user.type === "vendor" && req.status === "pending" && (
                        <div style={{ display:"flex", gap:7, marginTop:6 }}>
                          <button onClick={() => respond(req.id, "confirmed")} className="btn"
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

  useEffect(() => {
    getVendorAvailability(vendorId).then(a => { setAvail(a); setLoading(false); });
  }, [vendorId]);

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
        <strong> Tap a date</strong> to toggle blocked / open.
      </p>

      {/* Legend */}
      <div style={{ display:"flex", gap:10, marginBottom:12, flexWrap:"wrap" }}>
        {[["#F0FDF4","#065F46","✓ Available"],["#FEF2F2","#EF4444","✗ Blocked"],["#EFF6FF","#1D4ED8","✓ Confirmed"]].map(([bg,c,l]) => (
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
        {["S","M","T","W","T","F","S"].map((d,i) => (
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
          return (
            <button key={day} onClick={() => !isPast && toggleDate(dateStr)} className="btn"
              style={{ padding:"6px 0", borderRadius:8, textAlign:"center", fontSize:11, fontWeight:700,
                       border:`1.5px solid ${isConfirmed ? "#93C5FD" : isBlocked ? "#FCA5A5" : "#E5E7EB"}`,
                       background: isConfirmed ? "#EFF6FF" : isBlocked ? "#FEF2F2" : "#F0FDF4",
                       color: isConfirmed ? "#1D4ED8" : isBlocked ? "#EF4444" : "#065F46",
                       opacity: isPast ? 0.35 : 1, cursor: isPast ? "default" : "pointer",
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
   conversation_closed are all conversation events; everything else (new_request,
   request_update, request_sent, booking_cancelled, review) hangs off a booking. */
function notifTarget(n) {
  const t = String((n && n.type) || "");
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
const BUILD_CATEGORY_WALK = ["places","music","food","production","av","logistics","rentals"];

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
          <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:30, fontWeight:900, margin:"0 0 6px" }}>
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
          <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:32, fontWeight:900, margin:"0 0 6px" }}>
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
        <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:24, fontWeight:800, margin:"0 0 6px" }}>
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
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, fontWeight:800, margin:"0 0 4px" }}>
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
                  <><strong style={{ color:C.black }}>{vendors.length}</strong> {curCatObj?.label} vendor{vendors.length!==1?"s":""} free
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
                        <li key={r.key}><strong>{r.n}</strong> fit{r.n===1?"s":""} if {r.label}</li>
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
        <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:28, fontWeight:900, margin:"0 0 4px" }}>
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
                    {v.selectedPackage?.name ? ` · ${v.selectedPackage.name}` : ""} · {v.price}
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
            <span style={{ fontSize:13, fontWeight:700 }}>{picked.length} vendor{picked.length!==1?"s":""} selected</span>
            <span style={{ fontSize:15, fontWeight:800 }}>{total>0?`Est. $${total.toLocaleString()}`:"Contact for pricing"}</span>
          </div>
          <button onClick={() => onReviewSend(detailsPayload())} className="btn"
            style={{ width:"100%", padding:"15px 0", borderRadius:14, border:"none", background:C.orange,
                     color:"#fff", fontSize:15, fontWeight:800, boxShadow:C.shadowButton }}>
            Send all {picked.length} request{picked.length!==1?"s":""} →
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
        <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:34, fontWeight:800,
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
            <p style={{ margin:0, fontFamily:"'Playfair Display',serif", fontSize:17,
                        fontWeight:800 }}>Your request list</p>
            <p style={{ margin:0, fontSize:11, color:C.midGray }}>
              {cart.length} vendor{cart.length!==1?"s":""} · Est. {fmtTotal(cart)}
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
                        {[catLabelOf(v.cat), v.selectedPackage?.name, v.price].filter(Boolean).join(" · ")}
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
                                 resize:"vertical", fontFamily:"'Inter',sans-serif", background:"#fff" }} />
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
                               fontSize:12, resize:"vertical", fontFamily:"'Inter',sans-serif", background:"#fff" }} />
                  </div>
                  <textarea placeholder="Message to vendors (optional) — describe your event…"
                    value={message} onChange={e => setMessage(e.target.value)} rows={2}
                    style={{ padding:"9px 12px", border:`1px solid ${C.border}`, borderRadius:9,
                             fontSize:12, resize:"none", fontFamily:"'Inter',sans-serif",
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
                                   fontFamily:"'Inter',sans-serif", transition:"all .15s" }}>
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
                  <span style={{ fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:800, color:C.black }}>
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
                  const spent = cart.reduce((a,v)=>a+(v.pv||0),0);
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
        {totalCount} vendor{totalCount!==1?"s":""}
      </span>
    </div>
  );
}

/* ─── RECOMMENDATION STRIP ────────────────────────────────────────────────────── */
function RecommendationStrip({ recs, onAdd, onView, cart }) {
  if (!recs || recs.length === 0) return null;
  return (
    <div style={{ background: C.orangeSoft, borderRadius:16, padding:"16px 18px",
                  marginBottom:20, border:`1px solid ${C.orangeBorder}` }}>
      <p style={{ margin:"0 0 10px", fontSize:13, fontWeight:800, color:C.orange }}>
        ✦ You might also need for your event
      </p>
      <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4 }}>
        {recs.map(v => (
          <div key={v.id} style={{ flexShrink:0, background:"#fff", borderRadius:12,
                                    padding:"10px 12px", width:180, border:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
              <img src={v.img} alt={v.name}
                style={{ width:36, height:36, borderRadius:8, objectFit:"cover", flexShrink:0 }} />
              <div>
                <p style={{ margin:0, fontSize:11, fontWeight:800, lineHeight:1.2 }}>{v.name}</p>
                <p style={{ margin:0, fontSize:10, color:C.midGray }}>{v.price}</p>
              </div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={() => onView(v)} className="btn"
                style={{ flex:1, padding:"5px 0", borderRadius:8, background:C.bgAlt,
                         border:`1px solid ${C.border}`, fontSize:10, fontWeight:600,
                         color:C.midGray }}>
                View
              </button>
              <button onClick={() => !cart.find(c=>c.id===v.id) && onAdd(v)} className="btn"
                style={{ flex:1, padding:"5px 0", borderRadius:8,
                         background: cart.find(c=>c.id===v.id) ? "#F3F4F6" : C.orange,
                         border:"none", fontSize:10, fontWeight:700,
                         color: cart.find(c=>c.id===v.id) ? C.midGray : "#fff" }}>
                {cart.find(c=>c.id===v.id) ? "✓" : "+ Add"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── HOMEPAGE SECTIONS (hero supplement) ────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    { icon:"🔍", n:"1", title:"Browse & filter",  desc:"Search by event type, category, budget, location, and availability." },
    { icon:"🛒", n:"2", title:"Build your lineup", desc:"Add multiple vendors to your cart. Mix and match food, music, decor & more." },
    { icon:"📩", n:"3", title:"Send requests",     desc:"Submit booking requests to all vendors at once with your event details." },
    { icon:"✅", n:"4", title:"Vendors confirm",   desc:"Each vendor reviews and confirms. You get notified instantly." },
  ];
  return (
    <div style={{ padding:"56px 0 48px" }}>
      <div style={{ textAlign:"center", marginBottom:40 }}>
        <p style={{ margin:"0 0 8px", fontSize:12, fontWeight:800, color:C.orange,
                    textTransform:"uppercase", letterSpacing:"0.1em" }}>
          How PLUJ works
        </p>
        <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:30, fontWeight:800,
                     letterSpacing:"-0.03em", margin:0, color:C.black }}>
          From idea to event in minutes
        </h2>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:16 }}>
        {steps.map((s, i) => (
          <div key={i} className="step-card">
            <div style={{ fontSize:36, marginBottom:12 }}>{s.icon}</div>
            <div style={{ width:26, height:26, borderRadius:"50%", background:C.orange,
                          color:"#fff", fontSize:11, fontWeight:800, display:"inline-flex",
                          alignItems:"center", justifyContent:"center", marginBottom:8 }}>
              {s.n}
            </div>
            <p style={{ fontFamily:"'Playfair Display',serif", fontSize:15, fontWeight:800,
                        margin:"0 0 8px", color:C.black }}>{s.title}</p>
            <p style={{ fontSize:12, color:C.midGray, lineHeight:1.65, margin:0 }}>{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
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
        {favs.length} saved vendor{favs.length !== 1 ? "s" : ""}
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
              {v.type} · {v.price}
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
function VendorProfile({ vendor, user, reviews, onBack, onAddReview, onVendorReply, onAddToCart, inCart, onRequireAuth, isFav, onToggleFav }) {
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
    feat:        vendor.feat, instant: vendor.instant,
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
  const priceLabel = pickedPkg ? "$" + pickedPkg.price.toLocaleString()
                   : (basePrice ? "$" + basePrice.toLocaleString() : (vendor.price || "Contact for pricing"));

  /* Build the cart item for the currently-selected offering. */
  function offeringForCart() {
    const svcLabel = selService ? serviceLabel(selService) : (vendor.serviceName || vendor.type || "");
    /* Prefer real, non-placeholder values from the loaded profile, then the card
       that opened this page, so the request always carries the vendor + service
       even if the live fetch was sparse. */
    const bizName = (full?.business_name || full?.biz_legal)
                  || (vendor.name && vendor.name !== "Vendor" && vendor.name !== "New vendor" ? vendor.name : "")
                  || disp.name;
    return {
      ...vendor,
      vendorId:    vendorId,                       // clean account id (prefix-stripped)
      dbId:        vendorId,
      name:        bizName || "Vendor",
      serviceId:   selService ? selService.id : (vendor.serviceId || null),
      serviceName: svcLabel || null,
      cat:         (selService?.category) || vendor.cat || disp.cat,
      img:         (photos && photos[0]) || vendor.img,
      selectedPackage: pickedPkg,
      pv:          pickedPkg ? pickedPkg.price : (basePrice || 0),
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
                  fontFamily:"'Playfair Display',serif", lineHeight:1.2 }}>{value}</p>
      {sub && <p style={{ margin:0, fontSize:10, color:C.midGray, lineHeight:1.4 }}>{sub}</p>}
    </div>
  );

  async function submitReview() {
    if (!newText.trim()) return;
    setRevErr("");
    if (isLiveVendor) {
      const res = await submitReviewDB({
        authorId: user.id, subjectId: vendorId, direction: "user_to_vendor",
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
          {vendor.instant && <span style={{ background:C.greenSoft, color:C.green, fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:99 }}>⚡ Instant</span>}
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
                <p style={{ margin:"0 0 6px", fontSize:11, fontWeight:800, color:C.midGray, textTransform:"uppercase", letterSpacing:"0.06em" }}>🗓 Schedule</p>
                <p style={{ margin:0, fontSize:13, color:C.black, lineHeight:1.7 }}>{vendor.schedule || "Contact for availability"}</p>
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

          {/* Reviews */}
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:"20px 22px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div>
                <h2 style={{ fontSize:17, fontWeight:800, margin:"0 0 4px" }}>
                  Reviews <span style={{ fontSize:13, color:C.midGray, fontWeight:500 }}>({vRevs.length})</span>
                </h2>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:26, fontWeight:800, fontFamily:"'Playfair Display',serif" }}>{avgRating}</span>
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
                  ? "✓ You've reviewed this vendor. Thanks for the feedback!"
                  : "You can leave a review once this vendor has confirmed a booking with you."}
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
                           background:"#fff", fontFamily:"'Inter',sans-serif" }} />
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
                                style={{ width:"100%", minHeight:70, border:`1px solid ${C.border}`, borderRadius:9, padding:"9px 11px", fontSize:12, color:C.black, resize:"vertical", fontFamily:"'Inter',sans-serif" }} />
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
            <p style={{ fontFamily:"'Playfair Display',serif", fontSize:28, fontWeight:800, color:C.black, margin:"0 0 4px" }}>
              {priceLabel}
            </p>
            <p style={{ fontSize:11, color:C.lightGray, margin:"0 0 16px" }}>Prices vary by event size and date</p>

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
                            ${p.price.toLocaleString()}
                          </span>
                        </div>
                        {p.description && (
                          <p style={{ margin:"3px 0 0", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
                            {p.description}
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

            {selService && parseAddons(selService.addons).length > 0 && (
              <div style={{ marginBottom:12, padding:"10px 12px", background:"#FFF7ED",
                            border:`1px solid ${C.orangeBorder}`, borderRadius:11 }}>
                <p style={{ margin:"0 0 6px", fontSize:11, fontWeight:800, color:C.orange,
                            textTransform:"uppercase", letterSpacing:"0.04em" }}>Available add-ons</p>
                {parseAddons(selService.addons).map((a, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"2px 0" }}>
                    <span style={{ color:C.black }}>{a.name}</span>
                    <span style={{ fontWeight:700, color:C.black }}>+${a.price.toLocaleString()}</span>
                  </div>
                ))}
                <p style={{ margin:"6px 0 0", fontSize:10, color:C.midGray }}>Mention any add-ons in your request.</p>
              </div>
            )}

            <button onClick={() => {
                if (!user || user.type === "guest") { onRequireAuth?.(); return; }
                if (user.blocked) { window.alert("Your account is blocked.\n\n" + (user.blockedReason || "Contact support for details.")); return; }
                if (!inCart) onAddToCart(offeringForCart());
              }} className="btn"
              style={{ width:"100%", padding:"13px 0", borderRadius:13, border:"none",
                       background: inCart ? "#F3F4F6" : C.orange,
                       color: inCart ? C.midGray : "#fff",
                       fontSize:14, fontWeight:800, marginBottom:8,
                       boxShadow: inCart ? "none" : C.shadowButton }}>
              {/* A guest is NOT signed out - the header says "Guest" and offers
                  "Log out" - so telling them to log in is a contradiction they
                  cannot act on. They do not need to log in, they need an
                  account. The helper line below already said so; the button
                  disagreed with it. */}
              {!user ? "🔒 Log in to book"
                : user.type === "guest" ? "🔒 Sign up to book"
                : inCart ? "✓ Added — set date & details in cart" : disp.instant ? "⚡ Book now" : "Start booking request"}
            </button>
            <p style={{ fontSize:11, color:C.midGray, textAlign:"center", margin:"0 0 4px", lineHeight:1.5 }}>
              {(!user || user.type === "guest")
                ? "You need an account to send booking requests."
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
                             padding:"9px 11px", fontSize:12, resize:"vertical", fontFamily:"'Inter',sans-serif",
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

            {/* Reviewed badge — only on real, approved listings. Demo catalog entries
                are not real businesses, and the uploaded licence file is never
                actually stored, so the previous copy overclaimed twice. */}
            {isLiveVendor && (
            <div style={{ marginTop:14, background:"#F0FDF4", borderRadius:10, padding:"8px 12px", display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:14 }}>✓</span>
              <p style={{ margin:0, fontSize:11, color:"#065F46", lineHeight:1.4 }}>
                <strong>Reviewed by PLUJ.</strong> This vendor's business details were checked before their listing went live.
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

  return (
    <div className="vcard2"
      style={{ boxShadow: inCartNow ? `0 0 0 2.5px ${C.orange}, ${C.shadowCard}` : C.shadowCard }}>

      {/* Image */}
      <div style={{ position:"relative", height:190 }} onClick={() => onView(v)}>
        {!imgLoaded && <div className="skeleton" style={{ position:"absolute", inset:0 }} />}
        <img src={v.img} alt={v.name}
          onLoad={() => setImgLoaded(true)}
          style={{ width:"100%", height:"100%", objectFit:"cover", display:"block",
                   opacity: imgLoaded ? 1 : 0, transition:"opacity 0.3s ease, transform 0.4s ease" }}
          className="vendor-img" />
        <div style={{ position:"absolute", inset:0,
                      background:"linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 55%)" }} />

        {/* Badges top-left */}
        <div style={{ position:"absolute", top:10, left:10, display:"flex", gap:5 }}>
          {v.feat && (
            <span style={{ background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)",
                           color:"#fff", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99 }}>
              ✦ Featured
            </span>
          )}
          {v.instant && (
            <span style={{ background:C.green, color:"#fff", fontSize:10, fontWeight:700,
                           padding:"2px 8px", borderRadius:99, display:"flex",
                           alignItems:"center", gap:3 }}>
              ⚡ Instant
            </span>
          )}
        </div>

        {/* Heart button */}
        <button className={`heart-btn${isFav ? " active" : ""}`}
          onClick={e => { e.stopPropagation(); onToggleFav?.(v.id); }}
          title={isFav ? "Remove from favorites" : "Save to favorites"}>
          {isFav ? "❤️" : "🤍"}
        </button>

        {/* Price bottom-right */}
        <div style={{ position:"absolute", bottom:10, right:10,
                      background:"rgba(255,255,255,0.95)", backdropFilter:"blur(4px)",
                      borderRadius:10, padding:"4px 10px" }}>
          <p style={{ margin:0, fontSize:13, fontWeight:800, color:C.black }}>{v.price}</p>
        </div>

        {/* In-cart checkmark */}
        {inCartNow && (
          <div style={{ position:"absolute", bottom:10, left:10, background:C.orange,
                        color:"#fff", borderRadius:"50%", width:26, height:26,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:12, fontWeight:800 }}>✓</div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding:"12px 14px 14px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
                      gap:8, marginBottom:2 }}>
          <p onClick={() => onView(v)} style={{ margin:0, fontSize:15, fontWeight:800, color:C.black,
                      lineHeight:1.2, flex:1, cursor:"pointer" }}>
            {v.serviceName || v.name}
          </p>
          <div style={{ display:"flex", alignItems:"center", gap:3, flexShrink:0 }}>
            <span style={{ fontSize:12 }}>⭐</span>
            <span style={{ fontSize:12, fontWeight:800, color:C.black }}>{v.rating}</span>
            <span style={{ fontSize:10, color:C.lightGray }}>({v.revCount})</span>
          </div>
        </div>

        {/* Service type · category · experience */}
        <p style={{ margin:"0 0 1px", fontSize:11, color:C.midGray, lineHeight:1.4 }}>
          {[catLabelOf(v.cat), v.serviceType].filter(Boolean).join(" · ") || v.type}
          {v.yearsInBiz ? <span style={{ color:C.lightGray }}> · {v.yearsInBiz}y exp</span> : null}
        </p>

        {/* Which vendor provides it */}
        <p style={{ margin:"0 0 8px", fontSize:11, color:C.lightGray }}>
          by <span style={{ fontWeight:700, color:C.midGray }}>{v.name}</span>
        </p>

        {/* Service area + travel */}
        {(v.bizCity || v.travelMiles) && (
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
            {v.bizCity && (
              <span style={{ fontSize:10, color:C.midGray, display:"flex", alignItems:"center", gap:3 }}>
                📍 {v.bizCity || v.city?.split(",")[0]}
              </span>
            )}
            {v.travelMiles && (
              <span style={{ fontSize:10, color:C.midGray }}>· 🚗 {v.travelMiles}mi radius</span>
            )}
          </div>
        )}

        {/* Capacity */}
        {v.capacity && typeof v.capacity === "string" && (
          <p style={{ margin:"0 0 8px", fontSize:10, color:C.midGray }}>
            👥 {v.capacity}
          </p>
        )}

        {/* Tags */}
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
          {(v.tags||[]).slice(0,3).map(t => (
            <span key={t} style={{ fontSize:9, background:C.bgAlt, color:C.midGray,
                                    padding:"2px 7px", borderRadius:99, fontWeight:600,
                                    border:`1px solid ${C.border}` }}>
              {t}
            </span>
          ))}
        </div>

        {/* CTA */}
        <button onClick={e => { e.stopPropagation(); inCartNow ? onRemove(v.id) : onAdd(v); }}
          className="btn"
          style={{ width:"100%", padding:"9px 0", borderRadius:11, border:"none", fontSize:12,
                   fontWeight:700, background: inCartNow ? "#F3F4F6" : C.orange,
                   color: inCartNow ? C.midGray : "#fff",
                   boxShadow: inCartNow ? "none" : C.shadowButton,
                   transition:"all 0.18s ease" }}>
          {inCartNow ? "✓ Added" : v.instant ? "⚡ Book now" : "Request to book"}
        </button>
      </div>
    </div>
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
            <input type="password" placeholder="New password" value={pw}
              onChange={e=>{ setPw(e.target.value); setErr(""); }}
              style={{ width:"100%", padding:"11px 12px", borderRadius:10, border:`1px solid ${C.border}`,
                       fontSize:14, marginBottom:10, boxSizing:"border-box" }} />
            <input type="password" placeholder="Confirm new password" value={pw2}
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
        photos:        parsePhotos(d?.photos),
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
      biz_license:   f.biz_license.trim() || null,
      biz_website:   f.biz_website.trim() || null,
      photos:        f.photos,
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

            <label style={L}>Street address <Opt /></label>
            <input style={F} value={f.biz_address} onChange={e=>set("biz_address", e.target.value)} />
            <div style={{ display:"flex", gap:8 }}>
              <div style={{ flex:2 }}>
                <label style={L}>City *</label>
                <input style={F} value={f.biz_city} onChange={e=>set("biz_city", e.target.value)} />
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

            <div style={{ background:"#F9FAFB", border:`1px solid ${C.border}`, borderRadius:10,
                          padding:"4px 12px 12px", marginTop:14 }}>
              <p style={{ margin:"8px 0 0", fontSize:11, fontWeight:700, color:C.midGray }}>
                Helps us approve you faster <Opt />
              </p>
              <label style={L}>Legal business name</label>
              <input style={F} value={f.biz_legal} onChange={e=>set("biz_legal", e.target.value)} />
              <label style={L}>Business license / permit number</label>
              <input style={F} value={f.biz_license} onChange={e=>set("biz_license", e.target.value)} />
              <label style={L}>Website or social page</label>
              <input style={F} value={f.biz_website} onChange={e=>set("biz_website", e.target.value)} />
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
const LEGAL_UPDATED = "August 2026";   /* month + year — update when the documents change */

const INFO_CONTENT = {
  "About": [
    ["What PLUJ is", "PLUJ is an event marketplace that connects people planning events with vetted local vendors — food, music, production and decor, and logistics — in one place."],
    ["How we vet vendors", "Vendors submit business details and documentation when they apply. Our team reviews each application before a listing goes live, and we can remove a listing at any time if standards are not met."],
    ["Contact", "For questions, use the Help center or contact the vendor directly through their listing."],
  ],
  /* Plain-language guides, written 30 Sep 2026 for people who have never used
     PLUJ. Keep the button names here in step with the real buttons — a guide
     that says "press Submit" when the button says "Send" is worse than none. */
  "Host guide": [
    ["Who this is for", "A host is anyone planning an event and booking vendors for it — a birthday, a wedding, a corporate party. Browsing PLUJ is free and you don't need an account to look around."],
    ["1. Create your account", "Press Log in / Sign up at the top of the page, choose Sign up, and pick Host. Enter your name, email, a password, your phone number and date of birth (you must be 18 or older). On the next screen answer the quick human check, accept PLUJ's terms, and press Create account & verify email."],
    ["2. Confirm your email", "We send you an email titled Confirm your email address. Open the newest one, tap Confirm my email address, then press Confirm my email on the PLUJ page that opens. The link works once and stops working after 10 minutes — if it has expired, sign up again with the same email or use Forgot password? to get a fresh link."],
    ["3. Find vendors", "Use the search bar at the top — where, when, what service and how many guests — or pick a category such as Food & Drinks or Music & Performance. PLUJ only shows vendors who serve your area, have room for your guest count and are free on your date. Not sure what you need? Build My Event asks a few questions and suggests a full lineup."],
    ["4. Build your lineup", "On any listing press Request to book to add it to your cart. Add as many vendors as you need — food, music, decor, rentals. Open the cart, set your event date, time, address and guest count once, and they apply to every vendor in it."],
    ["5. Send your requests", "In the cart press Send booking requests. A request is not a booking yet: each vendor reviews it and accepts or declines. You'll get a notification and an email either way."],
    ["6. Track and change requests", "Open your account (your initials at the top right) and go to My Requests. You can see each request's status, use Edit request to change the date, guests or venue while it's still pending, or cancel it. Cancelling a request that hasn't been accepted is always free."],
    ["7. Talk to your vendors", "Use Messages in your account to ask questions or share details. Conversations stay open until 3 days after the event."],
    ["8. Paying", "PLUJ doesn't take payment today. Once a vendor accepts, agree the price, deposit and payment method directly with them. See Cancellations and refunds for what applies."],
    ["9. After the event", "Leave a review for each vendor. It helps other hosts and helps good vendors get booked. You can choose to show your name or stay a Verified customer."],
    ["Forgot your password?", "Press Log in / Sign up, enter your email and press Forgot password?. Open the newest email, tap the link, type your new password twice and press Save new password. You'll be signed in straight away."],
  ],
  "Vendor guide": [
    ["Who this is for", "A vendor is a business that provides a service at events — a DJ, a caterer, a food truck, a venue, a photographer, rentals. On PLUJ you have one business account and as many listings as services you offer."],
    ["1. Create your account", "Press Log in / Sign up, choose Sign up, and pick Vendor. Enter your name, your business name, email, password, phone and date of birth. On the next screen answer the human check, accept PLUJ's terms and press Create vendor account. That's all the signup asks."],
    ["2. Confirm your email", "Open the newest Confirm your email address email, tap the link, and press Confirm my email on the page that opens. The link works once and expires after 10 minutes. You'll land in your vendor dashboard."],
    ["3. Add your business details", "Your dashboard shows a short checklist. The first step is Add business details: business name, a short description of your business, business phone, city and ZIP, and the areas you work in. Your phone number is private — only PLUJ sees it. Legal name, license number and website are optional but help us approve you faster. You can change all of this later under Business profile."],
    ["4. Create your listings", "A listing is one service hosts can book. A DJ who also rents a photo booth has two listings; a caterer with a taco truck and a dessert truck has two. Go to My listings and press Add listing. For each one set the category, a description, a starting price, guest capacity, photos (up to 10, the first is the cover), where you'll travel, and when you're available. Listings with good photos and a clear description get far more requests."],
    ["5. Approval", "PLUJ reviews your business details, usually within 1–2 business days. Your listings stay hidden until you're approved, then go live automatically. You'll get a notification in your dashboard and the checklist turns green."],
    ["6. Answer booking requests", "When a host sends a request it appears under Requests and in Notifications, and we email you. Open it to see the date, time, guest count, venue and message. Press Accept booking to confirm or Decline if you can't do it. Please answer quickly — hosts often send requests to several vendors and book whoever confirms first."],
    ["7. Keep your calendar honest", "Use Availability to block dates you're already booked or away. In each listing you can also set how many events you take per day, how many hours you need between events, and how much notice you need. PLUJ won't show you to hosts for times you can't do."],
    ["8. Messages", "Use Messages to answer host questions before and after you accept. Conversations stay open until 3 days after the event."],
    ["9. Getting paid", "PLUJ doesn't take payment today. Once you accept, agree the price, deposit and payment method directly with the host, and put your cancellation terms in writing."],
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
    ["Insurance is between you and the other party", "PLUJ does not provide, arrange, broker, recommend or procure insurance of any kind, and nothing on the platform is an offer of insurance or a guarantee of payment. Vendors are solely responsible for deciding what insurance their business needs and for obtaining it, including any coverage a customer asks them to carry. Customers are solely responsible for deciding whether to obtain their own event or cancellation insurance. Any insurance requirement agreed between a customer and a vendor is a term of their own contract, not of these Terms, and PLUJ is not responsible for verifying that any policy exists, is in force, or covers any particular loss."],
    ["Customer indemnity", "You agree to defend, indemnify and hold harmless PLUJ from any claim arising out of your use of the platform, the content you post, your conduct at or in connection with an event, your breach of these Terms, or your violation of any law or third-party right."],
    ["Content posted by users", "Listings, photographs, descriptions, reviews and messages are created by users, not by PLUJ. We do not adopt, endorse or verify them, and we are not responsible for them. We may remove content at our discretion but are under no obligation to monitor it."],
    ["Disputes between users", "Disagreements about services, quality, timing, damage or payment are between the customer and the vendor. PLUJ is not a party and has no obligation to intervene, mediate, refund or compensate, though we may assist and may act against accounts that breach the Marketplace Rules."],
    ["Talk to us first", "Before starting arbitration or any legal proceeding, you agree to contact us and allow 30 days to resolve the dispute informally. Both sides will negotiate in good faith during that period. Most problems are settled this way."],
    ["Binding arbitration", "If a dispute is not resolved within 30 days, you and PLUJ agree it will be resolved by binding individual arbitration administered by the American Arbitration Association under its Consumer Arbitration Rules, rather than in court, and each of you waives the right to a jury trial. Arbitration will take place in Harris County, Texas, or by video or telephone at your election. Either party may instead bring a qualifying individual claim in small claims court, and either party may seek injunctive relief in court to protect intellectual property. You may opt out of arbitration within 30 days of first accepting these Terms by emailing us your name, your account email, and a statement that you decline arbitration. Opting out does not affect anything else in these Terms."],
    ["No class actions", "Claims must be brought individually. You and PLUJ each waive any right to bring or participate in a class, collective, consolidated or representative action. If this waiver is unenforceable for a particular claim, the arbitration agreement does not apply to that claim and it must proceed in court."],
    ["Time limit on claims", "To the maximum extent permitted by law, any claim arising out of or relating to the platform must be filed within one year after it arises, or it is permanently barred."],
    ["Governing law and venue", "These Terms are governed by the laws of the State of Texas, without regard to its conflict of law rules. Subject to the arbitration section, the state and federal courts in Harris County, Texas have exclusive jurisdiction, and both parties consent to that jurisdiction and venue."],
    ["Copyright and takedowns", "Do not post material you do not have the right to use. If you believe content on PLUJ infringes your copyright, email us identifying the work and where it appears, your contact details, a statement of good-faith belief that the use is unauthorised, and a statement under penalty of perjury that your notice is accurate and that you are authorised to act. We remove infringing content and terminate repeat infringers."],
    ["Suspension and termination", "We may suspend or terminate any account that breaches these Terms, the Marketplace Rules or the law, or that creates risk for other users, at our discretion and without liability. You may close your account at any time from your account menu. Provisions that should by their nature survive termination will survive it, including the release, disclaimers, limitations, indemnities and dispute resolution terms."],
    ["Severability and entire agreement", "If any provision is unenforceable, the remainder stays in force. These Terms, together with the Privacy Policy, the Cancellations and refunds page and the Marketplace Rules, are the entire agreement between you and PLUJ."],
    ["Acceptance", "By creating an account, ticking the acceptance box, or using the platform, you agree to these Terms, the Cancellations and refunds page, the Marketplace Rules and the Privacy Policy. We record the date and the version you accepted. If we change these Terms materially we will ask you to accept the new version."],
    ["Changes", "We may update these Terms. Continuing to use PLUJ after an update means you accept the revised Terms."],
  ],
  "Privacy": [
    ["What we collect", "Account details you provide (name, email, phone, date of birth), vendor business information and documents, listing content and photos, and booking requests you send or receive."],
    ["How we use it", "To operate the marketplace: creating your account, verifying vendors, showing listings, delivering booking requests, and providing support."],
    ["What we share", "When you send a booking request, the vendor receives the event details you provided. Vendor listing information is public. We do not sell your personal information."],
    ["Verification documents", "Documents submitted during vendor verification are stored for review and are not shown publicly on listings."],
    ["Your choices", "You can edit your profile and listing information at any time."],
    ["Deleting your account", "You can permanently delete your account and its data at any time from your account menu, under Profile then Account settings. You do not need to contact us. Deletion removes your profile, listings, bookings, messages and reviews, and cannot be undone. If you only want to pause, deactivate instead — in the same place: your listings come down and bookings stop, but nothing is erased."],
    ["How long we keep things", "We keep your account data until you delete it. We may retain limited records where we are legally required to, such as transaction records for tax and accounting, and a record of your acceptance of our Terms."],
    ["Cookies and browser storage", "PLUJ stores your sign-in session, your cart, your saved vendors and your display preferences in your browser. These are needed for the site to work and are not used for advertising or shared with advertisers. Clearing your browser storage signs you out and empties your cart."],
    ["Who processes data for us", "We use Supabase for our database and sign-in, Vercel for hosting, and Resend for sending email. Where online payment is enabled, Stripe processes payments and receives the information needed to do so. Each handles data on our behalf under its own terms. We do not sell your personal information, and we do not share it for cross-context behavioural advertising as those terms are defined under California law."],
    ["Staff access", "Our administrators can access account records and, where necessary to investigate a report or a dispute, the messages exchanged between users on the platform. We access messages only when there is a specific reason to."],
    ["Your rights", "Depending on where you live, you may have the right to access, correct, delete or export your personal information, and to object to certain processing. Use the deletion tool in your account menu, or contact us. We will not discriminate against you for exercising these rights."],
    ["If there is a breach", "If a security incident affects your personal information we will notify you, and any regulator required by law, as promptly as we reasonably can."],
  ],
  "Cancellations and refunds": [
    ["What applies today", "PLUJ does not currently collect payment. Booking requests are free to send and free to cancel, and money changes hands directly between you and the vendor. The terms below govern payments made through PLUJ and apply from the moment online payment is enabled on a booking. Your booking screen always shows which terms apply to it."],
    ["Before a vendor accepts", "A request that has not been accepted is not a booking. You can withdraw it at any time at no cost, and nothing is charged."],
    ["If you cancel a confirmed booking", "Refunds depend on how long before the event start time you cancel. More than 4 days before: refunded in full, less payment processing fees. Three to four days before: 50 percent. Two days before: 25 percent. Within 48 hours of the event: no refund. Vendors may set their own schedule within limits we publish, and venues commonly set stricter terms because they hold a date exclusively. The exact terms for your booking are shown before you pay and are recorded with the booking, so a vendor changing their policy later cannot change yours."],
    ["What less fees means", "Card processing fees, and any PLUJ service fee, are not returned on a refund. They are charged when the payment is taken and are not recoverable afterwards. A refund described as full means the booking amount less those fees, not the total you were charged."],
    ["If the vendor cancels", "You are refunded in full, including all fees, whatever the timing. Where we can, we will help you find a replacement vendor for your date."],
    ["Changing a confirmed booking", "Changing the date, guest count or location needs the vendor to approve it, and re-opens the request until they do. If they decline, the original booking stands and the schedule above continues to apply. Changes are not accepted within 48 hours of the event."],
    ["If a vendor does not turn up", "Contact us within 7 days. Where payment was taken through PLUJ we will look into it with both parties and may refund you in full. PLUJ does not perform the services and is not the vendor, but no-shows are grounds for removal from the marketplace."],
    ["Before you contact your bank", "Contact us first. A chargeback raised without contacting us costs the vendor money and takes months to resolve, and we can usually settle it faster directly. Raising a chargeback does not remove your obligations under these terms."],
  ],

  "Marketplace rules": [
    ["Be accurate", "Listings, photos, pricing, capacity and availability must reflect what you actually offer. Do not post photos of work that is not yours."],
    ["Honor your commitments", "Vendors should respond to requests promptly and honor confirmed bookings. Customers should provide accurate event details."],
    ["Communicate respectfully", "No harassment, hate speech, threats, or discrimination of any kind."],
    ["Keep it legal and safe", "You must hold the licenses, permits and insurance required for the services you provide, and comply with all applicable laws."],
    ["No manipulation", "No fake reviews, fake accounts, or schemes to inflate ratings or bypass platform rules."],
    ["Consequences", "Breaking these rules can result in a warning, listing removal, suspension, or permanent removal from PLUJ. Serious violations may be reported to the relevant authorities."],
  ],
};

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
        </div>

        {/* Only this scrolls. overscrollBehavior keeps the scroll inside the
            panel instead of handing it to the page behind. */}
        <div style={{ overflowY:"scroll", padding:"14px 20px 20px", flex:"1 1 auto", minHeight:0,
                      WebkitOverflowScrolling:"touch", overscrollBehavior:"contain",
                      touchAction:"pan-y" }}>
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
                       fontSize:13, resize:"none", fontFamily:"'Inter',sans-serif" }} />
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
        <input type="password" placeholder="New password" value={pw} autoFocus
          onChange={e=>{ setPw(e.target.value); setErr(""); }} style={field} />
        <input type="password" placeholder="Confirm new password" value={pw2}
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
  const [authModal, setAuthModal] = useState(false);
  /* Password-recovery: set when arriving via a Supabase recovery email link */
  const [recoveryToken, setRecoveryToken] = useState(null);
  /* Set when the page was opened from a confirmation or reset email. Captured
     during the first render — see readEmailLinkFromUrl for why it cannot wait
     for an effect. */
  const [emailLink, setEmailLink] = useState(readEmailLinkFromUrl);

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
    instant: false, featured: false, topRated: false,
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
  const [notifOpen,      setNotifOpen]      = useState(false);
  const [originBlocked,  setOriginBlocked]  = useState(false);

  /* Reviews */
  const [reviews, setReviews] = useState(INIT_REVIEWS);

  /* ── Scroll-aware transparent navbar ── */
  const [navScrolled, setNavScrolled] = useState(false);
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
    document.title = base;
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

  const recs = useMemo(() => getRecommendations(cart, activePackage, VENDORS), [cart, activePackage]);

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

      {/* ── ADMIN PANEL ─────────────────────────────────────────────────────── */}
      {adminPanelOpen && user?.type === "admin" && (
        <Suspense fallback={<DashboardLoading label="the admin panel" />}>
          <AdminPanel user={user} onClose={()=>setAdminPanelOpen(false)} />
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


      {/* ── NAV — glassmorphism, market selector ─────────────────────── */}
      <nav className={`pluj-nav${navScrolled ? " nav-glass" : ""}`}
        style={{
          position:"sticky", top:0, zIndex:200, height:64,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 28px",
          background: navOnHero ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.88)",
          borderBottom: `1px solid ${navOnHero ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.5)"}`,
          backdropFilter: navOnHero ? "none" : "blur(20px) saturate(180%)",
        }}>

        {/* Logo + market selector */}
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span onClick={goHome} title="Back to home"
            style={{ cursor:"pointer", display:"flex", alignItems:"center" }}>
            <PlujMark size={28} light={navOnHero} />
          </span>
          <MarketSelector market={market} onSelect={setMarket} light={navOnHero} />
        </div>

        {/* Category pills — hide on mobile */}
        <div className="hide-mobile"
          style={{ display:"flex", gap:4, background: navOnHero ? "rgba(255,255,255,0.1)" : C.bgAlt,
                   borderRadius:99, padding:4, border:`1px solid ${navOnHero ? "rgba(255,255,255,0.2)" : C.border}` }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => pickCat(cat.id)} className="btn"
              style={{ padding:"6px 14px", borderRadius:99, fontSize:12, fontWeight:600,
                       border:"none", cursor:"pointer",
                       background: activeCat===cat.id ? (navOnHero ? "rgba(255,255,255,0.2)" : C.black) : "transparent",
                       color: navOnHero ? "#fff" : (activeCat===cat.id ? "#fff" : C.midGray),
                       boxShadow: activeCat===cat.id ? C.shadowXs : "none" }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Right side */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {user ? (
            <>
              {user.type !== "guest" && (
                <NotificationBell userId={user.id} open={notifOpen}
                  onClick={() => { setNotifOpen(o=>!o); setAccountOpen(false); }}
                  /* Close the bell and open the account panel on the tab that
                     actually holds the thing they tapped. */
                  onOpenTarget={(t) => { setAccountTab(t.tab); setAccountConvId(t.id);
                                         setNotifOpen(false); setAccountOpen(true); }} />
              )}
              <button onClick={() => { setAccountOpen(o=>!o); setNotifOpen(false); }}
                className="btn"
                style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer",
                          background: navOnHero ? "rgba(255,255,255,0.12)" : user.type==="admin" ? "#0A0A0A" : C.bgAlt,
                          border:`1px solid ${navOnHero ? "rgba(255,255,255,0.2)" : user.type==="admin" ? "#333" : C.border}`,
                          borderRadius:99, padding:"5px 14px 5px 7px" }}>
                {/* Admins don't need an avatar letter — the 🛡️ badge already
                    identifies the account. Users and vendors keep theirs. */}
                {user.type !== "admin" && (
                  <Avatar name={user.displayName||user.name} size={26}
                    bg={user.type==="vendor"?"#7C3AED":C.orange} />
                )}
                <span style={{ fontSize:12, fontWeight:700,
                               color: "#fff", marginLeft: user.type==="admin" ? 7 : 0 }}>
                  {(user.displayName||user.name||"").split(" ")[0]}
                </span>
                {user.type==="admin"  && <span style={{ fontSize:10, background:"rgba(255,255,255,0.15)", color:"#fff", padding:"1px 7px", borderRadius:99, fontWeight:800 }}>🛡️ Admin</span>}
                {user.type==="vendor" && <span style={{ fontSize:10, background:"#F5F3FF", color:"#7C3AED", padding:"1px 7px", borderRadius:99, fontWeight:700 }}>
                  {user.status==="approved" ? "✓ Vendor" : user.status==="rejected" ? "✗ Vendor" : "⏳ Vendor"}
                </span>}
                {user.type==="admin" && (
                  <button onClick={e=>{e.stopPropagation();setAdminPanelOpen(true);}} className="btn"
                    style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:99,
                             padding:"2px 8px", fontSize:10, color:"#fff", fontWeight:700, marginLeft:2 }}>
                    Panel
                  </button>
                )}
              </button>
              <button onClick={async()=>{await clearSession();setUser(null);}} className="btn"
                style={{ background: navOnHero ? "rgba(255,255,255,0.1)" : "#F3F4F6",
                         border:"none", borderRadius:99, padding:"7px 13px", fontSize:12,
                         fontWeight:600, color: navOnHero ? "rgba(255,255,255,0.8)" : C.midGray }}>
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
                style={{ background: navOnHero ? "#fff" : C.orange,
                         border:"none", borderRadius:99, padding:"8px 18px", fontSize:13,
                         fontWeight:700, color: navOnHero ? C.black : "#fff", whiteSpace:"nowrap",
                         boxShadow: navOnHero ? "none" : C.shadowButton }}>Log in / Sign up</button>
            </>
          )}
          <button onClick={() => { setCartOpen(true); setNotifOpen(false); }} className="btn"
            style={{ position:"relative", background: cart.length ? (navOnHero ? C.orange : C.black) : navOnHero ? "rgba(255,255,255,0.15)" : "#F3F4F6",
                     color: cart.length || navOnHero ? "#fff" : C.midGray,
                     border:"none", borderRadius:99, padding:"8px 15px", fontSize:13,
                     fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
            <Emoji e="🛒" size={15} />
            {cart.length > 0 && (
              <span style={{ background:C.orange, color:"#fff", borderRadius:99,
                             fontSize:10, fontWeight:800, padding:"0 5px" }}>{cart.length}</span>
            )}
          </button>
        </div>
      </nav>


      {/* Always-visible criteria bar (Where / When / Service / How many) */}
      {activeCat !== "build" && (
        <div style={{ position:"sticky", top:64, zIndex:191,
                      background:"rgba(255,255,255,0.98)", backdropFilter:"blur(20px)",
                      borderBottom:`1px solid ${C.border}`, padding:"8px 16px",
                      display:"flex", flexWrap:"wrap", gap:8, alignItems:"stretch",
                      boxShadow:"0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ flex:"1 1 140px", minWidth:120, border:`1px solid ${C.border}`,
                        borderRadius:10, padding:"5px 10px" }}>
            <p style={{ margin:0, fontSize:9, fontWeight:800, color:C.midGray }}>WHERE</p>
            <input value={qWhere} onChange={e=>setQWhere(e.target.value)} placeholder="City or area"
              list="pluj-where-options" autoComplete="off"
              style={{ width:"100%", border:"none", outline:"none", fontSize:13, background:"transparent" }} />
            <datalist id="pluj-where-options">
              {whereSuggestions.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div style={{ flex:"1 1 130px", minWidth:120, border:`1px solid ${C.border}`,
                        borderRadius:10, padding:"5px 10px" }}>
            <p style={{ margin:0, fontSize:9, fontWeight:800, color:C.midGray }}>WHEN</p>
            <input type="date" value={qWhen} onChange={e=>setQWhen(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              style={{ width:"100%", border:"none", outline:"none", fontSize:13,
                       color:qWhen?C.black:C.lightGray, background:"transparent" }} />
          </div>
          <div style={{ flex:"1 1 150px", minWidth:130, border:`1px solid ${C.border}`,
                        borderRadius:10, padding:"5px 10px" }}>
            <p style={{ margin:0, fontSize:9, fontWeight:800, color:C.midGray }}>WHAT SERVICE</p>
            <select value={activeCat} onChange={e=>pickCat(e.target.value)}
              style={{ width:"100%", border:"none", outline:"none", fontSize:13, background:"transparent" }}>
              {CATEGORIES.filter(c=>c.id!=="build").map(c=>(
                <option key={c.id} value={c.id}>{c.id==="all" ? "Any service" : c.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex:"1 1 150px", minWidth:140, border:`1px solid ${C.border}`,
                        borderRadius:10, padding:"5px 10px" }}>
            <p style={{ margin:0, fontSize:9, fontWeight:800, color:C.midGray }}>EVENT TYPE</p>
            <select value={qEventType} onChange={e=>setQEventType(e.target.value)}
              style={{ width:"100%", border:"none", outline:"none", fontSize:13, background:"transparent",
                       color: qEventType ? C.black : C.lightGray }}>
              <option value="">Any occasion</option>
              {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div style={{ flex:"1 1 110px", minWidth:100, border:`1px solid ${C.border}`,
                        borderRadius:10, padding:"5px 10px" }}>
            <p style={{ margin:0, fontSize:9, fontWeight:800, color:C.midGray }}>HOW MANY</p>
            <input type="number" min="1" value={qGuests} onChange={e=>setQGuests(e.target.value)}
              placeholder="Guests"
              style={{ width:"100%", border:"none", outline:"none", fontSize:13, background:"transparent" }} />
          </div>
          {/* The filters apply as you type, so this button changes no results —
              and that is exactly why it has to exist. Filling in five fields and
              being offered nothing but "Clear" reads as an unfinished form:
              people sit there waiting for something to happen, or hunt for the
              submit button that was never there. Every booking site has one.

              Its real job is to take you to the answer. The matches are below
              the fold behind the hero, so it scrolls them into view — which is
              what the person was expecting the button to do anyway. */}
          <button onClick={() => {
              pickCat("all");
              requestAnimationFrame(() => {
                const el = document.getElementById("results-top");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }} className="btn"
            style={{ border:"none", background:C.orange, color:"#fff", borderRadius:10,
                     padding:"0 20px", fontSize:12.5, fontWeight:800, whiteSpace:"nowrap",
                     boxShadow:C.shadowButton, cursor:"pointer" }}>
            🔍 Search
          </button>
          {(qWhere || qWhen || qGuests || qEventType) && (
            <button onClick={()=>{setQWhere("");setQWhen("");setQGuests("");setQEventType("");}} className="btn"
              style={{ border:`1px solid ${C.border}`, background:"#fff", borderRadius:10,
                       padding:"0 14px", fontSize:12, fontWeight:700, color:C.midGray }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Sticky text search — appears when scrolled past the hero, AND whenever
          there is a search term.

          The `search` clause is not cosmetic, it is the whole bug. `isHero` is
          false the moment `search` is non-empty, so the first keystroke in the
          big hero search box unmounted the hero — and with it, the input being
          typed into. At the top of the page `navScrolled` is still false, so
          this bar did not take over either: the page was left with no search
          field at all. One character went in, the box vanished, and the rest of
          the word went nowhere. */}
      {(navScrolled || q) && activeCat !== "build" && !vendorPage && (
        <div style={{ position:"sticky", top:64, zIndex:190,
                      background:"rgba(255,255,255,0.97)", backdropFilter:"blur(20px)",
                      borderBottom:`1px solid ${C.border}`,
                      padding:"10px 28px", display:"flex", alignItems:"center", gap:10,
                      boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
          <span style={{ fontSize:16 }}>🔍</span>
          <input
            ref={searchRef}
            placeholder="Search DJs, catering, flowers, lighting..."
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if(e.key==="Enter") pickCat("all"); }}
            style={{ flex:1, border:"none", outline:"none", fontSize:14,
                     color:C.black, background:"transparent",
                     fontFamily:"'Inter',sans-serif", fontWeight:500 }} />
          {search && (
            <button onClick={() => setSearch("")} className="btn"
              style={{ background:"none", border:"none", color:C.lightGray,
                       fontSize:18, padding:"0 4px", cursor:"pointer" }}>✕</button>
          )}
          <button onClick={() => pickCat("build")} className="btn"
            style={{ background:C.orange, color:"#fff", border:"none", borderRadius:10,
                     padding:"8px 18px", fontSize:13, fontWeight:700,
                     whiteSpace:"nowrap", boxShadow:C.shadowButton }}>
            Build event ✦
          </button>
        </div>
      )}

      {isHero && (
        <div style={{ position:"relative", height:480, overflow:"hidden" }}>
          {/* 78 clears the stats bar below (12px padding, two lines of text,
              12px padding) with a few pixels to spare. */}
          <HeroVideo dotsBottom={78}
            poster={market?.hero || "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1600&q=80"} />
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.2) 100%)" }} />
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", padding:"0 7% 0 6%" }}>
            <div style={{ maxWidth:560 }} className="fade-up">
              <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(255,92,40,0.18)", border:"1px solid rgba(255,92,40,0.35)", borderRadius:99, padding:"5px 14px", marginBottom:16 }}>
                <Emoji e="⚡" size={11} />
                <span style={{ color:C.orange, fontSize:11, fontWeight:800 }}>HOUSTON'S EVENT MARKETPLACE</span>
              </div>
              <h1 style={{ fontFamily:"'Playfair Display', serif", fontSize:"clamp(34px,4.5vw,58px)", fontWeight:900, color:"#fff", lineHeight:1.08, letterSpacing:"-0.04em", margin:"0 0 16px" }}>
                Book the perfect vendor.<br />
                <span style={{ color:C.orange }}>Build your entire event.</span>
              </h1>
              <p style={{ fontSize:16, color:"rgba(255,255,255,0.75)", lineHeight:1.75, margin:"0 0 28px", fontWeight:400 }}>
                Food, music, venues, decor and rentals — build your whole lineup in one cart, then send every request at once.
              </p>
              {/* Search pill — glassmorphism */}
              <div style={{ background:"rgba(255,255,255,0.15)", backdropFilter:"blur(20px)",
                            border:"1.5px solid rgba(255,255,255,0.3)",
                            borderRadius:14, padding:"6px 6px 6px 14px",
                            display:"flex", alignItems:"center", gap:8, maxWidth:520,
                            boxShadow:"0 8px 32px rgba(0,0,0,0.25)" }}>
                <Emoji e="🔍" size={16} />
                <input placeholder="Search DJs, catering, flowers, lighting..."
                  ref={searchRef}
                  style={{ flex:1, border:"none", background:"transparent", fontSize:14,
                           color:"#fff", fontWeight:500, height:38, outline:"none",
                           fontFamily:"'Inter',sans-serif" }}
                  value={search} onChange={e=>setSearch(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter") pickCat("all"); }} />
                <button onClick={()=>pickCat("build")} className="btn"
                  style={{ background:C.orange, color:"#fff", border:"none", borderRadius:10,
                           padding:"10px 20px", fontSize:14, fontWeight:700, whiteSpace:"nowrap",
                           boxShadow:C.shadowButton }}>
                  Build event ✦
                </button>
              </div>

              {/* ── Criteria bar: Where / When / Service / How many ── */}
              <div style={{ background:"#fff", borderRadius:14, marginTop:12, maxWidth:640,
                            display:"flex", flexWrap:"wrap", alignItems:"stretch",
                            boxShadow:"0 8px 32px rgba(0,0,0,0.25)", overflow:"hidden" }}>
                <div style={{ flex:"1 1 150px", padding:"8px 14px", borderRight:`1px solid ${C.border}` }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:800, color:C.black }}>Where</p>
                  <input value={qWhere} onChange={e=>setQWhere(e.target.value)}
                    placeholder="City or area" list="pluj-where-options" autoComplete="off"
                    style={{ width:"100%", border:"none", outline:"none", fontSize:13,
                             color:C.black, background:"transparent", padding:"2px 0" }} />
                </div>
                <div style={{ flex:"1 1 130px", padding:"8px 14px", borderRight:`1px solid ${C.border}` }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:800, color:C.black }}>When</p>
                  <input type="date" value={qWhen} onChange={e=>setQWhen(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    style={{ width:"100%", border:"none", outline:"none", fontSize:13,
                             color: qWhen?C.black:C.lightGray, background:"transparent", padding:"2px 0" }} />
                </div>
                <div style={{ flex:"1 1 150px", padding:"8px 14px", borderRight:`1px solid ${C.border}` }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:800, color:C.black }}>What service</p>
                  <select value={activeCat} onChange={e=>pickCat(e.target.value)}
                    style={{ width:"100%", border:"none", outline:"none", fontSize:13,
                             color:C.black, background:"transparent", padding:"2px 0" }}>
                    {CATEGORIES.filter(c=>c.id!=="build").map(c=>(
                      <option key={c.id} value={c.id}>{c.id==="all" ? "Any service" : c.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex:"1 1 150px", padding:"8px 14px", borderRight:`1px solid ${C.border}` }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:800, color:C.black }}>Event type</p>
                  <select value={qEventType} onChange={e=>setQEventType(e.target.value)}
                    style={{ width:"100%", border:"none", outline:"none", fontSize:13,
                             color: qEventType?C.black:C.lightGray, background:"transparent", padding:"2px 0" }}>
                    <option value="">Any occasion</option>
                    {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div style={{ flex:"1 1 110px", padding:"8px 14px" }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:800, color:C.black }}>How many</p>
                  <input type="number" min="1" value={qGuests} onChange={e=>setQGuests(e.target.value)}
                    placeholder="Guests"
                    style={{ width:"100%", border:"none", outline:"none", fontSize:13,
                             color:C.black, background:"transparent", padding:"2px 0" }} />
                </div>
              </div>
              {(qWhere || qGuests || qWhen || qEventType) && (
                <p style={{ fontSize:12, color:"rgba(255,255,255,0.85)", marginTop:8, fontWeight:600 }}>
                  Showing vendors that fit your criteria ·{" "}
                  <button onClick={()=>{setQWhere("");setQWhen("");setQGuests("");setQEventType("");}}
                    style={{ background:"none", border:"none", color:"#fff", textDecoration:"underline",
                             cursor:"pointer", fontSize:12, fontWeight:700, padding:0 }}>
                    Clear
                  </button>
                </p>
              )}
              {!user && (
                <p style={{ fontSize:13, color:"rgba(255,255,255,0.55)", marginTop:12, fontWeight:500 }}>
                  Or{" "}
                  <button onClick={()=>setAuthModal(true)} className="btn"
                    style={{ background:"none", border:"none", color:"rgba(255,255,255,0.85)",
                             textDecoration:"underline", fontSize:13, fontWeight:600, padding:0, cursor:"pointer" }}>
                    sign in
                  </button>
                  {" "}to save bookings & leave reviews
                </p>
              )}
            </div>
          </div>
          {/* Stats bar */}
          <div className="pluj-stats"
            style={{ position:"absolute", bottom:0, left:0, right:0,
                        background:"rgba(0,0,0,0.65)", backdropFilter:"blur(8px)",
                        padding:"12px 6%", display:"flex", gap:0 }}>
            {[["8","Service categories"],["50+","Service types"],["Houston, TX","Live now"],["Free","To browse & request"]].map(([v,l],i)=>(
              <div key={l} style={{ flex:1, padding:"4px 0",
                                    borderRight: i<3?"1px solid rgba(255,255,255,0.12)":undefined,
                                    paddingLeft: i>0?24:0 }}>
                <p style={{ margin:0, fontSize:17, fontWeight:800, color:"#fff", fontFamily:"'Playfair Display', serif" }}>{v}</p>
                <p style={{ margin:"1px 0 0", fontSize:11, color:"rgba(255,255,255,0.5)", fontWeight:500 }}>{l}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── VENDOR PROFILE ─────────────────────────────────────────────── */}
      {vendorPage && (
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"32px 24px" }}>
          <VendorProfile vendor={vendorPage} user={user} reviews={reviews}
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

          {/* Category tabs */}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:24 }}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={()=>pickCat(cat.id)} className="pill btn"
                style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 18px",
                         borderRadius:99, fontSize:13, fontWeight:700, border:"none",
                         background: activeCat===cat.id ? (cat.id==="build"?"#111":C.black) : cat.id==="build" ? C.orangeSoft : "#F3F4F6",
                         color: activeCat===cat.id ? "#fff" : cat.id==="build" ? C.orange : C.midGray,
                         boxShadow: activeCat===cat.id ? "0 2px 10px rgba(0,0,0,0.18)" : "none" }}>
                {cat.icon === "✦"
                  ? <span style={{ fontSize:14 }}>✦</span>
                  : <Emoji e={cat.icon} size={15} />
                } {cat.label}
              </button>
            ))}
          </div>

          {/* ── SUBCATEGORY GRID ──────────────────────────────────────── */}
          {showSubGrid && (
            <div className="fade-up">
              <div style={{ marginBottom:24 }}>
                <h2 style={{ fontSize:22, fontWeight:800, margin:"0 0 4px", letterSpacing:"-0.03em" }}>{catObj?.label}</h2>
                <p style={{ fontSize:13, color:C.midGray, margin:0, fontWeight:500 }}>Browse by type or use the search bar above.</p>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(170px, 1fr))", gap:10, marginBottom:36 }}>
                {subs.map((s,i) => (
                  <button key={s.id} onClick={()=>setActiveSub(s.id)} className="subcard btn"
                    style={{ background:s.c, border:"1.5px solid transparent", borderRadius:16,
                             padding:"18px 14px", textAlign:"left", width:"100%",
                             animation:`fadeUp 0.3s ${i*0.035}s ease both` }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=s.a}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="transparent"}>
                    <div style={{ marginBottom:10 }}><Emoji e={s.e} size={28} /></div>
                    <div style={{ fontSize:13, fontWeight:800, color:s.a, marginBottom:2, fontFamily:"'Playfair Display', serif" }}>{s.l}</div>
                    <div style={{ fontSize:11, color:"#6B7280", lineHeight:1.5, marginTop:4 }}>{s.d}</div>
                  </button>
                ))}
              </div>
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
                style={{ background:"none", border:"none", fontSize:12, color:C.midGray, fontWeight:600, padding:0, marginBottom:12 }}>
                ← {catObj?.label}
              </button>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                <div style={{ width:46, height:46, background:subObj.c, borderRadius:13,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              flexShrink:0, border:`1px solid ${C.border}` }}>
                  <Emoji e={subObj.e} size={26} />
                </div>
                <div>
                  <h2 style={{ fontSize:21, fontWeight:800, margin:0, letterSpacing:"-0.02em" }}>{subObj.l}</h2>
                  <p style={{ margin:"2px 0 0", fontSize:11, color:C.midGray, fontWeight:500 }}>{subObj.d}</p>
                </div>
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {subs.map(s=>(
                  <button key={s.id} onClick={()=>setActiveSub(s.id)} className="pill btn"
                    style={{ padding:"5px 13px", borderRadius:99, fontSize:11, fontWeight:600,
                             border:`1.5px solid ${activeSub===s.id?s.a:C.border}`,
                             background: activeSub===s.id?s.c:"#fff", color: activeSub===s.id?s.a:C.midGray,
                             display:"inline-flex", alignItems:"center", gap:5 }}>
                    <Emoji e={s.e} size={12} /> {s.l}
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
          {activePackage && activeCat !== "build" && !vendorPage && (
            <div style={{ background: activePackage.color, borderRadius:14, padding:"12px 18px",
                          marginBottom:20, border:`1.5px solid ${activePackage.accent}33`,
                          display:"flex", alignItems:"center", justifyContent:"space-between",
                          flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:22 }}>{activePackage.icon}</span>
                <div>
                  <p style={{ margin:0, fontSize:13, fontWeight:800, color:C.black }}>
                    Building: {activePackage.label}
                  </p>
                  <p style={{ margin:0, fontSize:11, color:C.midGray }}>
                    Suggested: {activePackage.checklist.slice(0,3).join(" · ")}{activePackage.checklist.length>3?` +${activePackage.checklist.length-3} more`:""}
                  </p>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {activePackage.subs.map(s => {
                  const count = cart.filter(v => VENDORS.find(vv=>vv.id===v.id)?.sub===s).length;
                  return (
                    <span key={s} style={{ fontSize:10, padding:"3px 9px", borderRadius:99, fontWeight:600,
                                           background: count>0 ? C.greenSoft : "#fff",
                                           color: count>0 ? C.green : C.lightGray,
                                           border:`1px solid ${count>0 ? C.green+"44" : C.border}` }}>
                      {count>0?"✓ ":""}{s.replace(/-/g," ")}
                    </span>
                  );
                })}
              </div>
              <button onClick={() => setActivePackage(null)} className="btn"
                style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:99,
                         padding:"4px 12px", fontSize:11, color:C.midGray }}>
                Clear
              </button>
            </div>
          )}


          {isHero && !q && !activePackage && activeCat === "all" && !vendorPage && (
            <HowItWorks />
          )}

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
            <div className="fade-up" id="results-top" ref={vendorGridRef}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <p style={{ fontSize:13, color:C.midGray, margin:0, fontWeight:500 }}>
                  <strong style={{ color:C.black, fontWeight:700 }}>{filtered.length}</strong> vendor{filtered.length!==1?"s":""}
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
                        style={{ background:C.orange, color:"#fff", border:"none", borderRadius:10,
                                 padding:"10px 18px", fontSize:13, fontWeight:700 }}>
                        List my business
                      </button>
                    )}
                  </div>
                )}
                {visible.map(v=><VCard key={v.id} v={v} inCart={!!cart.find(c=>c.id===v.id)} isFav={favorites.includes(v.id)} onAdd={addToCart} onRemove={rmFromCart} onView={(vv)=>viewVendor(vv||v)} onToggleFav={handleToggleFav} />)}
                {filtered.length===0 && (
                  <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"64px 0" }}>
                    <div style={{ marginBottom:12, display:"flex", justifyContent:"center" }}><Emoji e="🔍" size={40} /></div>
                    <p style={{ color:C.midGray, fontSize:15, fontWeight:600, letterSpacing:"-0.01em" }}>No vendors match your filters.</p>
                    <button onClick={() => setFilters({instant:false,featured:false,topRated:false,nearMe:false,maxPrice:99999})} className="btn"
                      style={{ marginTop:12, background:C.orange, color:"#fff", border:"none",
                               borderRadius:99, padding:"9px 22px", fontSize:13, fontWeight:700,
                               boxShadow:C.shadowButton }}>
                      Clear all filters
                    </button>
                  </div>
                )}
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

          {/* ── INFO CARDS (home) ─────────────────────────────────────── */}
          {isHero && activeCat==="all" && !q && (
            <div style={{ marginTop:48, borderTop:`1px solid ${C.border}`, paddingTop:40 }}>
              <h2 style={{ fontSize:22, fontWeight:800, margin:"0 0 24px", letterSpacing:"-0.03em" }}>Get more from PLUJ</h2>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:16 }}>
                {[
                  { img:"https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600&q=80", title:"Plan your next event", desc:"Use Build My Event to get matched with the best vendors for your occasion.", cta:"Start planning →", action:()=>pickCat("build") },
                  { img:"https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&q=80", title:"List your services", desc:"Are you a vendor or service provider? Sign up and get discovered by thousands.", cta:"Become a vendor →", action:()=>setAuthModal(true) },
                  { img:"https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=600&q=80", title:"Book with confidence", desc:"Every vendor application is reviewed before their listing goes live. Compare prices, message directly, request in minutes.", cta:"Browse vendors →", action:goBrowseVendors },
                ].map(card=>(
                  <div key={card.title} className="card"
                    style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:18,
                             overflow:"hidden", cursor:"pointer", boxShadow:C.shadowCard }}
                    onClick={card.action}>
                    <img src={card.img} alt={card.title} style={{ width:"100%", height:180, objectFit:"cover", display:"block" }} />
                    <div style={{ padding:"16px 18px 20px" }}>
                      <h3 style={{ fontSize:17, fontWeight:800, margin:"0 0 7px", letterSpacing:"-0.02em" }}>{card.title}</h3>
                      <p style={{ fontSize:13, color:C.midGray, lineHeight:1.65, margin:"0 0 12px", fontWeight:400 }}>{card.desc}</p>
                      <span style={{ fontSize:13, fontWeight:700, color:C.black, textDecoration:"underline", textUnderlineOffset:3 }}>{card.cta}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <div style={{ background:C.black, padding:"28px 6%", display:"flex",
                    justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <span onClick={goHome} title="Back to home" style={{ cursor:"pointer", display:"flex", alignItems:"center" }}>
            <PlujMark size={28} light={true} />
          </span>
          <span style={{ fontSize:11, color:"#555", marginLeft:6 }}>Houston, TX · © 2026</span>
        </div>
        {/* flexWrap is load-bearing. Eight links in a nowrap row measure ~521px,
            which on a 375px phone made the whole DOCUMENT 543px wide — so every
            page scrolled sideways and the header Sign up button sat off-screen.
            One un-wrapped row in the footer was doing that to every screen on
            the site. */}
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", justifyContent:"center" }}>
          {["About","How it works","Host guide","Vendor guide","Become a vendor","Help center","Cancellations and refunds","Terms","Privacy","Marketplace rules"].map(l=>(
            <span key={l} onClick={()=>{
                if (l==="Become a vendor") { setAuthModal(true); return; }
                setInfoPage(l);
              }}
              style={{ fontSize:12, color:"#555", fontWeight:500, cursor:"pointer",
                                   transition:"color 200ms cubic-bezier(0,0,1,1)" }}
              onMouseEnter={e=>e.currentTarget.style.color="#888"}
              onMouseLeave={e=>e.currentTarget.style.color="#555"}>
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
