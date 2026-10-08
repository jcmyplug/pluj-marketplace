/* Extracted from PlujMarketplace.jsx on 23 September 2026 so it can be loaded
   on demand. See the note on the lazy import in PlujMarketplace.jsx for why
   the import points back at that file rather than at a shared module.
   Nothing here was rewritten - the moved code is byte-identical to what it
   replaced, so any behaviour change would be a bug, not a decision. */

import React, { useState, useEffect, useMemo, useRef } from "react";

import {
  C,
  CATEGORIES,
  CORS_CONFIG,
  MessagesPanel,
  RLS,
  SECURITY_HEADERS,
  SiteSwitch,
  adminDeleteAccount,
  adminListAccounts,
  adminSendMessage,
  adminSetBlocked,
  getVendorApplication,
  getVendorApps,
  paymentsCall,
  paymentsOn,
  adminLoadPayments,
  setPaymentsEnabled,
  fmtUSD,
  sb,
  isOriginAllowed,
  maskEmail,
  parsePhotos,
  sendMessage,
  setVendorStatus,
  startConversation,
} from "../PlujMarketplace.jsx";

function SecurityConfigPanel() {
  const [plat, setPlat] = useState("nginx");

  const csp  = SECURITY_HEADERS.server["Content-Security-Policy"];
  const hsts = SECURITY_HEADERS.server["Strict-Transport-Security"];
  const xfo  = SECURITY_HEADERS.server["X-Frame-Options"];
  const xcto = SECURITY_HEADERS.server["X-Content-Type-Options"];
  const rp   = SECURITY_HEADERS.server["Referrer-Policy"];
  const pp   = SECURITY_HEADERS.server["Permissions-Policy"];
  const cc   = SECURITY_HEADERS.server["Cache-Control"];
  const coop = SECURITY_HEADERS.server["Cross-Origin-Opener-Policy"];
  const corp = SECURITY_HEADERS.server["Cross-Origin-Resource-Policy"];

  const cfgs = {
    nginx:
`# Nginx — add inside server {} block
add_header Content-Security-Policy "${csp}" always;
add_header Strict-Transport-Security "${hsts}" always;
add_header X-Frame-Options "${xfo}" always;
add_header X-Content-Type-Options "${xcto}" always;
add_header Referrer-Policy "${rp}" always;
add_header Permissions-Policy "${pp}" always;
add_header Cache-Control "${cc}" always;
add_header Cross-Origin-Opener-Policy "${coop}" always;
add_header Cross-Origin-Resource-Policy "${corp}" always;`,
    express:
`// npm install helmet
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc:["'self'"], scriptSrc:["'self'","'unsafe-inline'","'unsafe-eval'"],
    styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],
    fontSrc:["'self'","https://fonts.gstatic.com","data:"],
    imgSrc:["'self'","https://images.unsplash.com","https://cdn.jsdelivr.net","data:","blob:"],
    connectSrc:["'self'","https://api.anthropic.com","https://*.supabase.co","wss://*.supabase.co","https://api.resend.com"],
    frameAncestors:["'self'","https://claude.ai"],
  }},
  hsts:{ maxAge:63072000, includeSubDomains:true, preload:true },
  frameguard:{ action:"sameorigin" },
  referrerPolicy:{ policy:"strict-origin-when-cross-origin" },
}));`,
    vercel:
`// vercel.json
{ "headers": [{ "source":"/(.*)", "headers": [
  {"key":"Content-Security-Policy","value":"${csp}"},
  {"key":"Strict-Transport-Security","value":"${hsts}"},
  {"key":"X-Frame-Options","value":"${xfo}"},
  {"key":"X-Content-Type-Options","value":"${xcto}"},
  {"key":"Referrer-Policy","value":"${rp}"},
  {"key":"Permissions-Policy","value":"${pp}"},
  {"key":"Cache-Control","value":"${cc}"}
]}]}`,
  };

  return (
    <div style={{ marginTop:14 }}>
      <p style={{ margin:"0 0 8px", fontSize:11, fontWeight:700, color:C.black }}>
        Deploy config — copy for your platform:
      </p>
      <div style={{ display:"flex", gap:4, marginBottom:8 }}>
        {[["nginx","Nginx"],["express","Express"],["vercel","Vercel"]].map(([k,l])=>(
          <button key={k} onClick={()=>setPlat(k)} className="btn"
            style={{ padding:"4px 12px", borderRadius:99, fontSize:10, fontWeight:700,
                     border:`1.5px solid ${plat===k?"#111":C.border}`,
                     background:plat===k?"#111":"#fff", color:plat===k?"#fff":C.midGray }}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ position:"relative" }}>
        <pre style={{ background:"#0d1117", color:"#7ee787", borderRadius:10,
                      padding:"12px 48px 12px 14px", fontSize:9, lineHeight:1.8,
                      overflowX:"auto", margin:0, fontFamily:"monospace",
                      whiteSpace:"pre-wrap", wordBreak:"break-word",
                      maxHeight:220, overflowY:"auto" }}>
          {cfgs[plat]}
        </pre>
        <button onClick={()=>navigator.clipboard?.writeText(cfgs[plat])} className="btn"
          style={{ position:"absolute", top:6, right:6, background:"rgba(255,255,255,0.08)",
                   border:"1px solid rgba(255,255,255,0.15)", borderRadius:6,
                   padding:"3px 9px", fontSize:9, color:"#7ee787", fontWeight:700 }}>
          Copy
        </button>
      </div>
    </div>
  );
}


/* ── Vendor application review ───────────────────────────────────────────────
   Everything a vendor has told PLUJ, on one screen, so the admin can decide
   whether this is a real business before approving it. Opened from the
   Vendors tab ("Review application") and from a vendor's row in Accounts.
   Approve and Decline live here; Decline asks for a reason, which the vendor
   sees in their notifications. */

const DESC_MIN = 40;   // same minimum as vendor sign-up (VENDOR_DESC_MIN)

const DECLINE_REASONS = [
  "We couldn't verify that this is a real business.",
  "The description doesn't explain what event service you offer.",
  "This business isn't allowed under PLUJ's Marketplace Rules.",
];

function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

/* Vendor-typed links open only as http(s). Anything else ("@handle", a
   javascript: URL) is shown as plain text. */
function safeHref(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s
    : /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s) ? "https://" + s : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    return (u.protocol === "https:" || u.protocol === "http:") ? u.href : null;
  } catch { return null; }
}

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" :
    d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}

function catLabel(id) {
  const c = (CATEGORIES || []).find(x => x.id === id);
  return c ? c.label : (id || "");
}

function VendorReview({ vendorId, onDecided }) {
  const [app, setApp]           = useState(null);
  const [err, setErr]           = useState("");
  const [busy, setBusy]         = useState(false);
  const [declining, setDecl]    = useState(false);
  const [reason, setReason]     = useState("");

  const load = React.useCallback(() => {
    setErr("");
    getVendorApplication(vendorId).then(r => { if (r.ok) setApp(r); else setErr(r.error); });
  }, [vendorId]);
  useEffect(() => { load(); }, [load]);

  async function decide(status) {
    if (status === "rejected" && !reason.trim()) { setErr("Write a short reason. The vendor will see it."); return; }
    setBusy(true); setErr("");
    const res = await setVendorStatus(vendorId, status, status === "rejected" ? reason.trim() : "");
    setBusy(false);
    if (!res || !res.ok) { setErr((res && res.error) || "The change did not save."); return; }
    setDecl(false); setReason("");
    load();
    if (onDecided) onDecided(status);
  }

  if (!app) {
    return (
      <p style={{ margin:"10px 0 0", fontSize:12, color: err ? "#B91C1C" : C.midGray }}>
        {err ? `⚠ ${err}` : "Loading application…"}
      </p>
    );
  }

  const v = app.vendor, p = app.profile, listings = app.listings;
  const desc   = String(v.description || "").trim();
  const age    = ageFrom(p.dob);
  const phone  = v.biz_phone || p.phone || "";
  const siteHref = safeHref(v.biz_website);
  const status = v.verification_status || "pending";
  const photos = [...new Set([
    ...parsePhotos(v.photos),
    ...listings.flatMap(l => parsePhotos(l.photos)),
  ])].filter(u => typeof u === "string" && /^https:\/\//i.test(u));

  const checks = [
    [!!p.responsibility_accepted_at, "Confirmed their information is true",
                                    "Signed up before the truthfulness box existed"],
    [!!p.email_verified,            "Email confirmed",                       "Email not confirmed yet"],
    [desc.length >= DESC_MIN,       "Business description given",
                                    desc ? "Business description is very short" : "No business description"],
    [String(phone).replace(/\D/g,"").length >= 10, "Phone number given",     "No phone number"],
    [!!String(v.biz_website || "").trim(), "Website or social media given",  "No website or social media"],
    [listings.length > 0,           `${listings.length} listing${listings.length===1?"":"s"} added`, "No listings yet"],
    [photos.length > 0,             `${photos.length} photo${photos.length===1?"":"s"} uploaded`,     "No photos yet"],
  ];

  const ein = String(v.ein || "").replace(/\D/g, "");
  const rows = [
    ["Business name",     v.business_name],
    ["Legal name",        v.biz_legal],
    ["Contact person",    p.full_name || p.display_name],
    ["Email",             p.email ? `${p.email}${p.email_verified ? "  ✓ confirmed" : "  ✗ not confirmed"}` : ""],
    ["Phone",             phone],
    ["Age",               age != null ? String(age) : ""],
    ["Business address",  [v.biz_address, v.biz_city, v.biz_state, v.biz_zip].filter(Boolean).join(", ")],
    ["Service areas",     v.service_areas],
    ["Years in business", v.years_in_biz != null ? String(v.years_in_biz) : ""],
    ["Business type",     v.biz_type],
    ["License #",         v.biz_license],
    ["EIN",               ein ? `••••${ein.slice(-4)}` : ""],
    ["Owners / managers", v.managing_members],
    ["Signed up",         fmtDate(p.created_at || v.created_at)],
    ["Accepted terms",    fmtDate(p.terms_accepted_at)],
    ["Confirmed true",    p.responsibility_accepted_at
                            ? `${fmtDate(p.responsibility_accepted_at)} (information true, responsible for posts)` : ""],
    ["Sign-up location",  p.geo_signal && p.geo_signal.tz_city ? p.geo_signal.tz_city : ""],
    ["Document",          v.doc_file_name],
  ].filter(([, val]) => val != null && String(val).trim() !== "");

  const H = ({ children }) => (
    <p style={{ margin:"14px 0 6px", fontSize:10, fontWeight:800, color:C.midGray,
                textTransform:"uppercase", letterSpacing:"0.08em" }}>{children}</p>
  );

  return (
    <div style={{ marginTop:10, background:"#fff", border:`1px solid ${C.border}`, borderRadius:12,
                  padding:"4px 14px 14px" }}>
      <H>About the business</H>
      {desc ? (
        <p style={{ margin:0, fontSize:13, color:C.black, lineHeight:1.6, whiteSpace:"pre-wrap",
                    wordBreak:"break-word" }}>{desc}</p>
      ) : (
        <p style={{ margin:0, fontSize:12.5, color:"#B45309", fontWeight:600 }}>
          ⚠ This vendor hasn't described their business yet. Message them and ask before approving.
        </p>
      )}

      <H>Quick checks</H>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {checks.map(([ok, good, bad]) => (
          <span key={good} style={{ fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:99,
                                    background: ok ? C.greenSoft : "#FFFBEB",
                                    color: ok ? C.green : "#B45309" }}>
            {ok ? "✓ " + good : "⚠ " + bad}
          </span>
        ))}
      </div>

      <H>Details</H>
      <div style={{ display:"grid", gridTemplateColumns:"minmax(110px,auto) 1fr", columnGap:12, rowGap:5 }}>
        {rows.map(([k, val]) => (
          <React.Fragment key={k}>
            <span style={{ fontSize:11.5, color:C.midGray }}>{k}</span>
            <span style={{ fontSize:12, color:C.black, fontWeight:600, wordBreak:"break-word" }}>{val}</span>
          </React.Fragment>
        ))}
        {String(v.biz_website || "").trim() && (
          <>
            <span style={{ fontSize:11.5, color:C.midGray }}>Website / social</span>
            <span style={{ fontSize:12, fontWeight:600, wordBreak:"break-word" }}>
              {siteHref ? (
                <a href={siteHref} target="_blank" rel="noopener noreferrer nofollow"
                   style={{ color:"#1D4ED8" }}>{v.biz_website} ↗</a>
              ) : <span style={{ color:C.black }}>{v.biz_website}</span>}
            </span>
          </>
        )}
      </div>

      <H>Listings ({listings.length})</H>
      {listings.length === 0 ? (
        <p style={{ margin:0, fontSize:12, color:C.midGray }}>
          None yet. Vendors add listings from their dashboard after confirming their email.
        </p>
      ) : listings.map(l => (
        <div key={l.id} style={{ padding:"8px 10px", background:"#F9FAFB", borderRadius:9, marginBottom:6 }}>
          <p style={{ margin:0, fontSize:12.5, fontWeight:700, color:C.black }}>
            {l.name || l.service_type || "Untitled listing"}
            <span style={{ fontWeight:500, color:C.midGray }}>
              {" · "}{catLabel(l.category)}{l.subcategory ? ` · ${l.subcategory}` : ""}
              {l.price_value != null ? ` · $${Number(l.price_value).toLocaleString("en-US")}` : ""}
              {l.active === false ? " · hidden" : ""}
            </span>
          </p>
          {l.description && (
            <p style={{ margin:"3px 0 0", fontSize:11.5, color:C.midGray, lineHeight:1.5,
                        whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
              {String(l.description).slice(0, 400)}{String(l.description).length > 400 ? "…" : ""}
            </p>
          )}
        </div>
      ))}

      {photos.length > 0 && (
        <>
          <H>Photos</H>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {photos.slice(0, 12).map(u => (
              <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                <img src={u} alt="" loading="lazy"
                  style={{ width:64, height:64, objectFit:"cover", borderRadius:8, border:`1px solid ${C.border}` }} />
              </a>
            ))}
          </div>
        </>
      )}

      {status === "rejected" && v.rejection_reason && (
        <p style={{ margin:"12px 0 0", fontSize:11.5, color:"#B91C1C" }}>
          Declined: {v.rejection_reason}
        </p>
      )}
      {status === "approved" && (
        <p style={{ margin:"12px 0 0", fontSize:11.5, color:C.green, fontWeight:700 }}>
          ✓ Approved{v.verified_at ? ` on ${fmtDate(v.verified_at)}` : ""}
        </p>
      )}

      {err && <p style={{ margin:"10px 0 0", fontSize:12, color:"#B91C1C", fontWeight:600 }}>⚠ {err}</p>}

      {declining ? (
        <div style={{ marginTop:12 }}>
          <p style={{ margin:"0 0 6px", fontSize:12, fontWeight:700, color:C.black }}>
            Why are you declining? The vendor will see this.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:6 }}>
            {DECLINE_REASONS.map(r => (
              <button key={r} type="button" onClick={()=>setReason(r)} className="btn"
                style={{ textAlign:"left", fontSize:11.5, padding:"6px 9px", borderRadius:8, cursor:"pointer",
                         border:`1px solid ${reason===r ? "#FCA5A5" : C.border}`,
                         background: reason===r ? "#FEF2F2" : "#fff", color:C.black }}>{r}</button>
            ))}
          </div>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}
            placeholder="Or write your own reason…"
            style={{ width:"100%", minHeight:64, padding:"8px 10px", border:`1px solid ${C.border}`,
                     borderRadius:9, fontSize:12.5, resize:"vertical", boxSizing:"border-box",
                     fontFamily:"'Inter',sans-serif" }} />
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <button onClick={()=>{ setDecl(false); setReason(""); setErr(""); }} disabled={busy} className="btn"
              style={{ flex:1, padding:"9px 0", borderRadius:9, border:`1px solid ${C.border}`,
                       background:"#fff", fontSize:12, fontWeight:700, color:C.midGray }}>Cancel</button>
            <button onClick={()=>decide("rejected")} disabled={busy || !reason.trim()} className="btn"
              style={{ flex:1, padding:"9px 0", borderRadius:9, border:"none", background:"#B91C1C",
                       color:"#fff", fontSize:12, fontWeight:800, opacity: (!reason.trim()) ? 0.5 : 1 }}>
              {busy ? "Saving…" : "Decline vendor"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          {status !== "approved" && (
            <button onClick={()=>decide("approved")} disabled={busy} className="btn"
              style={{ flex:1, padding:"9px 0", borderRadius:9, background:C.green, color:"#fff",
                       border:"none", fontSize:12.5, fontWeight:800 }}>
              {busy ? "Saving…" : "✓ Approve vendor"}
            </button>
          )}
          {status !== "rejected" && (
            <button onClick={()=>{ setDecl(true); setErr(""); }} disabled={busy} className="btn"
              style={{ flex:1, padding:"9px 0", borderRadius:9, background:"#FEF2F2", color:"#B91C1C",
                       border:"1px solid #FCA5A5", fontSize:12.5, fontWeight:800 }}>
              ✗ {status === "approved" ? "Revoke approval" : "Decline"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Payments: Stripe status, the on/off switch, reported problems, and every
   booking's payment, locked in the vendor's Stripe balance. Server side: supabase/functions/payments. */
const PROBLEM_LABEL = {
  no_show: "Vendor didn't show up", not_as_described: "Not what was promised",
  scam: "Possible scam", other: "Something else",
};
const KIND_SHORT = { retainer: "Retainer", event_day: "Event day", final: "Final" };

function planMoney(plan) {
  const pays = plan.booking_payments || [];
  const paid = pays.filter(p => p.status === "paid");
  const charged = p => (p.amount_cents || 0) + (p.host_fee_cents || 0) + (p.host_service_fee_cents || 0);
  const collected = paid.reduce((n, p) => n + charged(p), 0);
  const refunded  = paid.reduce((n, p) => n + (p.refunded_cents || 0), 0);
  const plujFees  = paid.reduce((n, p) => n + (p.platform_fee_cents || 0), 0);
  const released  = paid.reduce((n, p) => n + (p.transferred_cents || 0), 0);
  const locked    = paid.filter(p => !p.transferred_at).reduce((n, p) => n + charged(p) - (p.refunded_cents || 0), 0);
  return { collected, refunded, plujFees, released, locked, pays };
}

function AdminPayments({ onChanged }) {
  const [st, setSt]         = useState(null);
  const [data, setData]     = useState({ plans: [], problems: [] });
  const [names, setNames]   = useState({});
  const [busy, setBusy]     = useState("");
  const [err, setErr]       = useState("");
  const [ok, setOk]         = useState("");
  const [amt, setAmt]       = useState({});   // partial refund, dollars, per booking
  const [note, setNote]     = useState({});   // note to host/vendor, per booking
  const [loading, setLoad]  = useState(true);

  const load = React.useCallback(async () => {
    const [s, d, accts] = await Promise.all([paymentsCall("status"), adminLoadPayments(), adminListAccounts()]);
    setSt(s); setData(d);
    const m = {};
    (accts || []).forEach(a => { m[a.id] = a.businessName || a.displayName || a.email; });
    setNames(m); setLoad(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(label, fn, okText) {
    setBusy(label); setErr(""); setOk("");
    const r = await fn();
    setBusy("");
    if (r && r.error) { setErr(r.error); return; }
    if (okText) setOk(typeof okText === "function" ? okText(r) : okText);
    await load();
    if (onChanged) onChanged();
  }

  const on = paymentsOn();
  const plansById = Object.fromEntries((data.plans || []).map(p => [p.booking_id, p]));
  const openProblems = (data.problems || []).filter(p => p.status === "open");
  const card = { background:"#F9FAFB", border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 14px", marginBottom:10 };
  const sbtn = (bg, fg, bd) => ({ padding:"6px 11px", borderRadius:8, fontSize:11.5, fontWeight:700, cursor:"pointer",
                                  background:bg, color:fg, border: bd ? `1px solid ${bd}` : "none" });

  return (
    <div>
      {err && <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", color:"#B91C1C", borderRadius:9,
                            padding:"9px 12px", marginBottom:10, fontSize:12, fontWeight:600 }}>⚠ {err}</div>}
      {ok && <div style={{ background:C.greenSoft, border:`1px solid ${C.green}55`, color:C.green, borderRadius:9,
                           padding:"9px 12px", marginBottom:10, fontSize:12, fontWeight:700 }}>✓ {ok}</div>}

      {/* Stripe + switch */}
      <div style={{ ...card, background:"#fff" }}>
        <p style={{ margin:0, fontSize:13, fontWeight:800 }}>Stripe</p>
        {!st ? <p style={{ margin:"4px 0 0", fontSize:12, color:C.midGray }}>Checking…</p> : st.error ? (
          <p style={{ margin:"4px 0 0", fontSize:12, color:"#B91C1C" }}>⚠ {st.error}</p>
        ) : (
          <>
            <p style={{ margin:"4px 0 0", fontSize:12, color: st.configured ? C.green : "#B45309", fontWeight:700 }}>
              {st.configured ? `✓ Connected · ${st.mode === "live" ? "LIVE (real money)" : "TEST mode (no real money)"}` : "Not connected yet"}
            </p>
            {!st.configured && (
              <p style={{ margin:"4px 0 0", fontSize:11.5, color:C.midGray, lineHeight:1.6 }}>
                In Supabase → Edge Functions → Secrets, add <strong>STRIPE_SECRET_KEY</strong> with your Stripe secret key.
                Start with the test key (sk_test_…), then come back here.
              </p>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, flexWrap:"wrap" }}>
              {st.webhook_connected ? (
                <span style={{ fontSize:12, color:C.green, fontWeight:700 }}>✓ Stripe webhook connected</span>
              ) : (
                <button className="btn" disabled={!st.configured || !!busy} style={sbtn(C.black, "#fff")}
                  onClick={() => act("wh", () => paymentsCall("admin_connect_webhook"), "Stripe webhook connected.")}>
                  {busy === "wh" ? "Connecting…" : "Connect Stripe webhook"}
                </button>
              )}
            </div>
          </>
        )}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginTop:10,
                      paddingTop:10, borderTop:`1px solid ${C.border}` }}>
          <div>
            <p style={{ margin:0, fontSize:12.5, fontWeight:800 }}>Payments are {on ? "ON" : "OFF"}</p>
            <p style={{ margin:"2px 0 0", fontSize:11, color:C.midGray }}>
              {on ? "New confirmed bookings are paid in full and released 30 / 50 / 20." : "Bookings work as before: no payment is taken through PLUJ."}
            </p>
          </div>
          <button className="btn" disabled={!!busy} style={sbtn(on ? "#FEF2F2" : C.green, on ? "#B91C1C" : "#fff", on ? "#FCA5A5" : null)}
            onClick={() => {
              if (!on && st && !st.configured) { setErr("Connect Stripe first (add the secret key), then turn payments on."); return; }
              const q = on
                ? "Turn payments OFF?\n\nNew bookings won't be charged. Payments already scheduled on existing bookings still run."
                : `Turn payments ON${st && st.mode === "live" ? " with REAL money" : " (Stripe TEST mode)"}?\n\nFrom now on, vendors need their own Stripe account to confirm bookings. The host pays in full upfront into the vendor's locked Stripe balance, released in parts (30/50/20; 30/20/50 and 30/40/30 on a vendor's first two bookings). PLUJ only collects its service fees.\n\nOnly turn on LIVE payments after Stripe confirms vendors can't pay themselves out.`;
              if (!window.confirm(q)) return;
              act("sw", () => setPaymentsEnabled(!on), on ? "Payments turned off." : "Payments turned on.");
            }}>
            {busy === "sw" ? "Saving…" : on ? "Turn off" : "Turn on"}
          </button>
        </div>
      </div>

      {loading && <p style={{ fontSize:12, color:C.midGray }}>Loading payments…</p>}

      {/* Problems first: unreleased money is frozen until one of these is decided */}
      <h3 style={{ margin:"16px 0 8px", fontSize:14, fontWeight:800 }}>
        Problems reported {openProblems.length > 0 && <span style={{ color:"#B91C1C" }}>({openProblems.length})</span>}
      </h3>
      {openProblems.length === 0 ? (
        <p style={{ fontSize:12, color:C.midGray, margin:"0 0 6px" }}>None open.</p>
      ) : openProblems.map(pr => {
        const plan = plansById[pr.booking_id] || {};
        const m = plan.booking_id ? planMoney(plan) : { locked: 0 };
        const b = plan.booking_requests || {};
        return (
          <div key={pr.id} style={{ ...card, background:"#FEF2F2", borderColor:"#FCA5A5" }}>
            <p style={{ margin:0, fontSize:12.5, fontWeight:800, color:"#991B1B" }}>
              🚩 {PROBLEM_LABEL[pr.kind] || pr.kind} · {b.service_name || "Booking"} · {b.event_date || ""}
            </p>
            <p style={{ margin:"3px 0 0", fontSize:11.5, color:C.midGray }}>
              Host {names[plan.host_id] || "—"} → vendor {names[plan.vendor_id] || "—"} · locked {fmtUSD(m.locked)} ·
              reported {new Date(pr.created_at).toLocaleString("en-US", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })}
            </p>
            <p style={{ margin:"6px 0 0", fontSize:12.5, color:C.black, whiteSpace:"pre-wrap", lineHeight:1.55 }}>{pr.details}</p>
            <input value={note[pr.booking_id] || ""} onChange={e => setNote(n => ({ ...n, [pr.booking_id]: e.target.value }))}
              placeholder="Note to host and vendor (optional)"
              style={{ width:"100%", height:34, marginTop:8, borderRadius:8, border:`1px solid ${C.border}`, padding:"0 9px",
                       fontSize:12, boxSizing:"border-box" }} />
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
              <button className="btn" disabled={!!busy} style={sbtn(C.green, "#fff")}
                onClick={() => window.confirm("Close this report and release everything still locked to the vendor now?")
                  && act("pr" + pr.id, () => paymentsCall("admin_release", { booking_id: pr.booking_id, note: note[pr.booking_id] }),
                         r => `Released ${fmtUSD(r.sent_cents || 0)} to the vendor.`)}>
                Release to vendor
              </button>
              <button className="btn" disabled={!!busy} style={sbtn("#B91C1C", "#fff")}
                onClick={() => window.confirm("Refund everything the host paid, from the vendor's Stripe balance, and cancel the booking's releases?\n\nPLUJ's service fees are not returned.")
                  && act("pr" + pr.id, () => paymentsCall("admin_refund", { booking_id: pr.booking_id, note: note[pr.booking_id] }),
                         r => `Refunded ${fmtUSD(r.refunded_cents || 0)} to the host.`)}>
                Refund host in full
              </button>
              <button className="btn" disabled={!!busy} style={sbtn("#fff", C.midGray, C.border)}
                onClick={() => window.confirm("Dismiss this report? The locked money is released on its normal dates.")
                  && act("pr" + pr.id, () => paymentsCall("admin_dismiss", { problem_id: pr.id, note: note[pr.booking_id] }), "Report dismissed.")}>
                Dismiss
              </button>
            </div>
          </div>
        );
      })}

      {/* Every booking with payments */}
      <h3 style={{ margin:"16px 0 8px", fontSize:14, fontWeight:800 }}>Bookings with payments ({(data.plans || []).length})</h3>
      {(data.plans || []).length === 0 && !loading && (
        <p style={{ fontSize:12, color:C.midGray }}>None yet. They appear here when a vendor confirms a booking while payments are on.</p>
      )}
      {(data.plans || []).map(plan => {
        const m = planMoney(plan);
        const b = plan.booking_requests || {};
        const label = plan.status === "on_hold" ? ["Frozen", "#FEF2F2", "#B91C1C"]
          : plan.status === "released" ? ["Fully released", C.greenSoft, C.green]
          : plan.status === "cancelled" ? [plan.refund_state === "failed" ? "Cancelled · refund FAILED" : "Cancelled", "#F3F4F6", C.midGray]
          : m.collected === 0 ? ["Awaiting payment", "#FFF7ED", "#C2410C"]
          : plan.host_approved_at ? ["Host released", C.greenSoft, C.green] : ["Locked", "#EFF6FF", "#1D4ED8"];
        return (
          <div key={plan.booking_id} style={card}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:8, alignItems:"flex-start" }}>
              <div style={{ minWidth:0 }}>
                <p style={{ margin:0, fontSize:12.5, fontWeight:800 }}>{b.service_name || "Booking"} · {b.event_date || ""}</p>
                <p style={{ margin:"2px 0 0", fontSize:11, color:C.midGray }}>
                  {names[plan.host_id] || "Host"} → {names[plan.vendor_id] || "Vendor"} ·{" "}
                  <span style={{ fontFamily:"monospace" }}>{plan.booking_id}</span>
                </p>
              </div>
              <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:99, background:label[1], color:label[2], flexShrink:0 }}>
                {label[0]}
              </span>
            </div>
            <p style={{ margin:"6px 0 0", fontSize:11.5, color:C.black }}>
              Total {fmtUSD(plan.total_cents)} · paid {fmtUSD(m.collected)} · locked {fmtUSD(m.locked)} ·
              released {fmtUSD(m.released)} · PLUJ service fees {fmtUSD(m.plujFees)}{m.refunded ? ` · refunded ${fmtUSD(m.refunded)}` : ""}
            </p>
            <p style={{ margin:"2px 0 0", fontSize:11, color:C.midGray }}>
              {m.pays.map(p => `${KIND_SHORT[p.kind]} ${p.status}`).join(" · ")}
              {" · last part auto-released "}{new Date(plan.release_at).toLocaleDateString("en-US", { month:"short", day:"numeric" })}
            </p>
            {plan.hold_reason && plan.status === "on_hold" && <p style={{ margin:"2px 0 0", fontSize:11, color:"#B91C1C" }}>Frozen: {plan.hold_reason}</p>}
            {plan.last_error && <p style={{ margin:"2px 0 0", fontSize:11, color:"#B45309" }}>Last issue: {plan.last_error}</p>}
            {(plan.status !== "released" || m.collected - m.refunded > 0) && (
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, alignItems:"center" }}>
                {plan.status === "active" && (
                  <button className="btn" disabled={!!busy} style={sbtn("#fff", "#B91C1C", "#FCA5A5")}
                    onClick={() => act("h" + plan.booking_id, () => paymentsCall("admin_hold", { booking_id: plan.booking_id, hold: true, reason: "Frozen by PLUJ" }), "Frozen.")}>
                    Freeze
                  </button>
                )}
                {plan.status === "on_hold" && !openProblems.some(p => p.booking_id === plan.booking_id) && (
                  <button className="btn" disabled={!!busy} style={sbtn("#fff", C.black, C.border)}
                    onClick={() => act("h" + plan.booking_id, () => paymentsCall("admin_hold", { booking_id: plan.booking_id, hold: false }), "Unfrozen.")}>
                    Unfreeze
                  </button>
                )}
                {m.locked > 0 && plan.status !== "cancelled" && (
                  <button className="btn" disabled={!!busy} style={sbtn(C.green, "#fff")}
                    onClick={() => window.confirm("Release everything still locked to the vendor now?")
                      && act("r" + plan.booking_id, () => paymentsCall("admin_release", { booking_id: plan.booking_id }),
                             r => `Released ${fmtUSD(r.sent_cents || 0)} to the vendor.`)}>
                    Release now
                  </button>
                )}
                {m.collected - m.refunded > 0 && (
                  <>
                    <input type="number" min="0" step="0.01" placeholder="$ amount"
                      value={amt[plan.booking_id] || ""} onChange={e => setAmt(a => ({ ...a, [plan.booking_id]: e.target.value }))}
                      style={{ width:92, height:30, borderRadius:8, border:`1px solid ${C.border}`, padding:"0 7px", fontSize:12 }} />
                    <button className="btn" disabled={!!busy} style={sbtn("#FEF2F2", "#B91C1C", "#FCA5A5")}
                      onClick={() => {
                        const dollars = Number(amt[plan.booking_id]);
                        const cents = amt[plan.booking_id] ? Math.round(dollars * 100) : null;
                        if (cents !== null && !(cents > 0)) { setErr("Enter a refund amount, or leave it empty to refund everything."); return; }
                        if (!window.confirm((cents ? `Refund ${fmtUSD(cents)} to the host` : "Refund everything the host paid")
                          + " from the vendor's Stripe balance?\n\nPLUJ's service fees are not returned.")) return;
                        act("f" + plan.booking_id, () => paymentsCall("admin_refund", { booking_id: plan.booking_id, amount_cents: cents }),
                            r => `Refunded ${fmtUSD(r.refunded_cents || 0)}.`);
                      }}>
                      Refund
                    </button>
                  </>
                )}
                {(plan.last_error || plan.refund_state === "failed") && (
                  <button className="btn" disabled={!!busy} style={sbtn("#fff", C.black, C.border)}
                    onClick={() => act("t" + plan.booking_id, () => paymentsCall("admin_retry", { booking_id: plan.booking_id }), "Retried.")}>
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Admin moderation console: every user and vendor, with actions. */

function AdminAccounts({ adminId, onChanged }) {
  const [rows, setRows]     = useState([]);
  const [loading, setLoad]  = useState(true);
  const [q, setQ]           = useState("");
  const [kindFilter, setKF] = useState("all");   // all | user | vendor
  const [busyId, setBusyId] = useState(null);
  const [err, setErr]       = useState("");
  const [msgFor, setMsgFor] = useState(null);    // account we're messaging
  const [msgKind, setMsgKind] = useState("message");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [okNote, setOkNote] = useState("");
  const [reviewFor, setReviewFor] = useState(null);   // vendor row whose application is open

  const load = React.useCallback(() => {
    setLoad(true);
    adminListAccounts().then(list => { setRows(list); setLoad(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  function flash(t) { setOkNote(t); setTimeout(() => setOkNote(""), 2600); }

  async function act(row, what) {
    setErr(""); setBusyId(row.id);
    let res;
    if (what === "approve")      res = await setVendorStatus(row.id, "approved");
    else if (what === "decline") res = await setVendorStatus(row.id, "rejected", "Did not meet verification requirements.");
    else if (what === "block")   res = await adminSetBlocked(row.id, true, window.prompt("Reason for blocking (the account will see this):") || "Violation of marketplace rules.");
    else if (what === "unblock") res = await adminSetBlocked(row.id, false);
    else if (what === "delete") {
      const label = row.businessName || row.displayName || row.email;
      if (!window.confirm(`Permanently delete ${label}?\n\nThis removes their listings, bookings and reviews. This cannot be undone.`)) { setBusyId(null); return; }
      res = await adminDeleteAccount(row.id);
    }
    setBusyId(null);
    if (res && res.ok === false) { setErr(res.error || "Action failed."); return; }
    flash(what === "delete" ? "Account deleted." : "Done.");
    load();
    /* Keep the Vendors tab and its pending badge in step with what was just
       done here. */
    if (onChanged) onChanged();
  }

  async function sendMsg() {
    if (!msgBody.trim()) return;
    setBusyId(msgFor.id); setErr("");
    if (msgKind === "warning") {
      /* A formal warning is a one-way notice on the record. */
      const res = await adminSendMessage(msgFor.id, "warning", msgSubject.trim(), msgBody.trim());
      setBusyId(null);
      if (!res.ok) { setErr(res.error); return; }
      flash("Warning sent.");
    } else {
      /* A message opens a real conversation the person can reply to, and which
         only the admin can end. */
      const conv = await startConversation({
        otherId: msgFor.id, kind: "admin", selfId: adminId,
        subject: msgSubject.trim() || "PLUJ Support",
      });
      if (!conv.ok) { setBusyId(null); setErr(conv.error); return; }
      const sent = await sendMessage(conv.id, adminId, msgBody.trim());
      setBusyId(null);
      if (!sent.ok) { setErr(sent.error); return; }
      flash("Message sent — they can reply in Messages.");
    }
    setMsgFor(null); setMsgSubject(""); setMsgBody(""); setMsgKind("message");
  }

  const list = rows.filter(r => {
    if (kindFilter === "vendor" && r.role !== "vendor") return false;
    if (kindFilter === "user"   && r.role !== "user")   return false;
    if (!q.trim()) return true;
    const hay = `${r.email} ${r.displayName} ${r.businessName}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const Btn = ({ onClick, disabled, bg, fg, bd, children }) => (
    <button onClick={onClick} disabled={disabled} className="btn"
      style={{ padding:"5px 10px", borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer",
               background:bg, color:fg, border:bd ? `1px solid ${bd}` : "none", opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );

  return (
    <div>
      {err && (
        <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", color:"#B91C1C",
                      borderRadius:9, padding:"9px 12px", marginBottom:10, fontSize:12, fontWeight:600 }}>⚠ {err}</div>
      )}
      {okNote && (
        <div style={{ background:C.greenSoft, border:`1px solid ${C.green}55`, color:C.green,
                      borderRadius:9, padding:"9px 12px", marginBottom:10, fontSize:12, fontWeight:700 }}>✓ {okNote}</div>
      )}

      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="🔍 Search name, business or email…"
        style={{ width:"100%", height:38, padding:"0 12px", border:`1px solid ${C.border}`,
                 borderRadius:9, fontSize:12.5, marginBottom:8, boxSizing:"border-box" }} />
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        {[["all","Everyone"],["user","Hosts"],["vendor","Vendors"]].map(([k,l]) => (
          <button key={k} onClick={()=>setKF(k)} className="btn"
            style={{ padding:"5px 12px", borderRadius:99, fontSize:11.5, fontWeight:700, cursor:"pointer",
                     border:`1px solid ${kindFilter===k?C.orange:C.border}`,
                     background: kindFilter===k ? "#FFF7ED" : "#fff",
                     color: kindFilter===k ? C.orange : C.midGray }}>{l}</button>
        ))}
        <span style={{ marginLeft:"auto", fontSize:11, color:C.lightGray, alignSelf:"center" }}>
          {list.length} account{list.length===1?"":"s"}
        </span>
      </div>

      {loading ? (
        <p style={{ fontSize:13, color:C.midGray }}>Loading accounts…</p>
      ) : list.length === 0 ? (
        <p style={{ fontSize:13, color:C.midGray }}>No accounts match.</p>
      ) : list.map(r => {
        const blocked = r.accountStatus === "blocked";
        const isVendor = r.role === "vendor";
        const isAdminRow = r.role === "admin";
        return (
          <div key={r.id} style={{ borderTop:`1px solid ${C.border}`, padding:"11px 0" }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:180 }}>
                <p style={{ margin:0, fontSize:13, fontWeight:800, color:C.black }}>
                  {r.businessName || r.displayName || r.email}
                  <span style={{ marginLeft:6, fontSize:9.5, fontWeight:800, padding:"2px 7px", borderRadius:99,
                                 background: isAdminRow ? "#EDE9FE" : isVendor ? "#EFF6FF" : "#F3F4F6",
                                 color: isAdminRow ? "#6D28D9" : isVendor ? "#1D4ED8" : C.midGray }}>
                    {isAdminRow ? "ADMIN" : isVendor ? "VENDOR" : "HOST"}
                  </span>
                  {blocked && (
                    <span style={{ marginLeft:5, fontSize:9.5, fontWeight:800, padding:"2px 7px",
                                   borderRadius:99, background:"#FEF2F2", color:"#EF4444" }}>BLOCKED</span>
                  )}
                </p>
                <p style={{ margin:"2px 0 0", fontSize:11, color:C.midGray }}>
                  {r.email}
                  {isVendor && r.vendorStatus ? ` · ${r.vendorStatus}` : ""}
                  {` · ${r.listings} listing${r.listings===1?"":"s"} · ${r.bookings} booking${r.bookings===1?"":"s"}`}
                </p>
              </div>
            </div>

            {!isAdminRow && (
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                {isVendor && (
                  <Btn onClick={()=>setReviewFor(id => id === r.id ? null : r.id)} disabled={busyId===r.id}
                    bg={C.orange} fg="#fff">{reviewFor === r.id ? "▴ Close review" : "📋 Review"}</Btn>
                )}
                {isVendor && r.vendorStatus !== "approved" && (
                  <Btn onClick={()=>act(r,"approve")} disabled={busyId===r.id} bg={C.green} fg="#fff">✓ Accept</Btn>
                )}
                {isVendor && r.vendorStatus !== "rejected" && (
                  <Btn onClick={()=>act(r,"decline")} disabled={busyId===r.id} bg="#FFFBEB" fg="#B45309" bd="#FCD34D">✗ Decline</Btn>
                )}
                <Btn onClick={()=>{ setMsgFor(r); setMsgKind("message"); }} disabled={busyId===r.id}
                  bg="#EFF6FF" fg="#1D4ED8" bd="#BFDBFE">💬 Message</Btn>
                <Btn onClick={()=>{ setMsgFor(r); setMsgKind("warning"); }} disabled={busyId===r.id}
                  bg="#FFFBEB" fg="#B45309" bd="#FCD34D">⚠️ Warn</Btn>
                {blocked ? (
                  <Btn onClick={()=>act(r,"unblock")} disabled={busyId===r.id} bg={C.greenSoft} fg={C.green} bd={C.green+"55"}>↩ Unblock</Btn>
                ) : (
                  <Btn onClick={()=>act(r,"block")} disabled={busyId===r.id} bg="#FEF2F2" fg="#B91C1C" bd="#FCA5A5">🚫 Block</Btn>
                )}
                <Btn onClick={()=>act(r,"delete")} disabled={busyId===r.id} bg="#111" fg="#fff">🗑 Delete</Btn>
              </div>
            )}
            {isVendor && reviewFor === r.id && (
              <VendorReview vendorId={r.id}
                onDecided={() => { load(); if (onChanged) onChanged(); }} />
            )}
          </div>
        );
      })}

      {/* Message / warning composer */}
      {msgFor && (
        <div onClick={()=>setMsgFor(null)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1200,
                   display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:"#fff", borderRadius:16, padding:"20px 22px", width:"100%", maxWidth:440 }}>
            <p style={{ margin:"0 0 3px", fontSize:15, fontWeight:800 }}>
              {msgKind === "warning" ? "⚠️ Send a warning" : "💬 Send a message"}
            </p>
            <p style={{ margin:"0 0 12px", fontSize:12, color:C.midGray }}>
              To {msgFor.businessName || msgFor.displayName || msgFor.email}
            </p>
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              {[["message","💬 Message"],["warning","⚠️ Warning"]].map(([k,l]) => (
                <button key={k} onClick={()=>setMsgKind(k)} className="btn"
                  style={{ flex:1, padding:"7px 0", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer",
                           border:`1.5px solid ${msgKind===k?C.orange:C.border}`,
                           background: msgKind===k ? "#FFF7ED" : "#fff",
                           color: msgKind===k ? C.orange : C.midGray }}>{l}</button>
              ))}
            </div>
            <input value={msgSubject} onChange={e=>setMsgSubject(e.target.value)}
              placeholder="Subject (optional)"
              style={{ width:"100%", height:38, padding:"0 11px", border:`1px solid ${C.border}`,
                       borderRadius:9, fontSize:12.5, marginBottom:8, boxSizing:"border-box" }} />
            <textarea value={msgBody} onChange={e=>setMsgBody(e.target.value)}
              placeholder={msgKind === "warning"
                ? "Explain what needs to change and what happens if it doesn't…"
                : "Write your message…"}
              style={{ width:"100%", minHeight:100, padding:"9px 11px", border:`1px solid ${C.border}`,
                       borderRadius:9, fontSize:12.5, resize:"vertical", boxSizing:"border-box",
                       fontFamily:"'Inter',sans-serif" }} />
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button onClick={()=>setMsgFor(null)} className="btn"
                style={{ flex:1, padding:"9px 0", borderRadius:9, border:`1px solid ${C.border}`,
                         background:"#fff", fontSize:12.5, fontWeight:700, color:C.midGray }}>Cancel</button>
              <button onClick={sendMsg} disabled={!msgBody.trim() || busyId===msgFor.id} className="btn"
                style={{ flex:1, padding:"9px 0", borderRadius:9, border:"none",
                         background: msgKind==="warning" ? "#B45309" : C.orange,
                         color:"#fff", fontSize:12.5, fontWeight:800,
                         opacity: !msgBody.trim() ? 0.5 : 1 }}>
                {busyId===msgFor.id ? "Sending…" : msgKind==="warning" ? "Send warning" : "Send message"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminPanel({ user, onClose, initialTab }) {
  /* initialTab lets a notification open the panel on the right tab, e.g. the
     "new vendor waiting for approval" alert opens straight onto Vendors. */
  const [atab,       setAtab]      = useState(initialTab || "accounts");
  const [vendorApps, setVendorApps]= useState([]);
  const [reviewing,  setReviewing] = useState(null);   // vendorId whose application is open
  const origin = (typeof window !== "undefined" ? window.location.origin : "") || "null";
  const originOk = isOriginAllowed(origin);

  /* Re-read on every tab switch, not only when the panel opens. The Accounts
     tab can approve or reject a vendor too, and the Vendors tab used to keep
     showing that vendor as pending — badge and all — until the whole panel
     was closed and reopened. */
  const refreshVendorApps = React.useCallback(() => getVendorApps().then(setVendorApps), []);
  useEffect(() => { refreshVendorApps(); }, [atab, refreshVendorApps]);
  /* Open payment problems, for the Payments tab badge. */
  const [openProblems, setOpenProblems] = useState(0);
  const refreshProblems = React.useCallback(() => {
    sb.from("booking_problems").select("id").eq("status", "open").get()
      .then(({ data }) => setOpenProblems((data || []).length)).catch(() => {});
  }, []);
  useEffect(() => { refreshProblems(); }, [atab, refreshProblems]);

  const pendingCount = vendorApps.filter(v => v.status === "pending").length;

  const PolicyRow = ({ name, rule, ok }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
                  padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
      <div style={{ flex:1 }}>
        <p style={{ margin:0, fontSize:11, fontWeight:700, color:C.black, fontFamily:"monospace" }}>{name}</p>
        <p style={{ margin:"2px 0 0", fontSize:10, color:C.midGray, fontFamily:"monospace" }}>{rule}</p>
      </div>
      <span style={{ background: ok ? C.greenSoft : "#FEF2F2", color: ok ? C.green : "#EF4444",
                     fontSize:9, fontWeight:800, padding:"3px 8px", borderRadius:99,
                     flexShrink:0, marginLeft:10 }}>
        {ok ? "✓ ACTIVE" : "✗ BLOCKED"}
      </span>
    </div>
  );

  const tabs = [
    ["accounts","👥 Accounts", 0],
    ["messages","💬 Messages", 0],
    ["vendors","🏪 Vendors", pendingCount],
    ["payments","💳 Payments", openProblems],
    ["cors",   "🌐 CORS",   0],
    ["rls",    "🔒 RLS",    0],
    ["sec",    "🛡️ Headers",0],
    ["settings","⚙️ Settings",0],
    ["acct",   "👤 Account",0],
  ];

  return (
    <div className="modal-overlay" onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1000,
               display:"flex", alignItems:"center", justifyContent:"center", padding:20,
               backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} className="fade-up"
        style={{ background:"#fff", borderRadius:22, maxWidth:580, width:"100%",
                 maxHeight:"88vh", display:"flex", flexDirection:"column",
                 boxShadow:C.shadowModal, overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"20px 26px 16px", background:"#0A0A0A", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:18 }}>🛡️</span>
              <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:19, fontWeight:800,
                           color:"#fff", margin:0 }}>Admin Panel</h2>
            </div>
            <button onClick={onClose} className="btn"
              style={{ background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"50%",
                       width:30, height:30, fontSize:15, color:"rgba(255,255,255,0.7)",
                       display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>
          {/* Tab bar */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:2, marginTop:12 }}>
            {tabs.map(([k,l,badge]) => (
              <button key={k} onClick={()=>setAtab(k)} className="btn"
                style={{ padding:"7px 12px", borderRadius:"8px 8px 0 0", fontSize:11, fontWeight:700,
                         border:"none", background: atab===k ? "#fff" : "rgba(255,255,255,0.08)",
                         color: atab===k ? C.black : "rgba(255,255,255,0.6)",
                         display:"flex", alignItems:"center", gap:5 }}>
                {l}
                {badge > 0 && (
                  <span style={{ background:"#EF4444", color:"#fff", fontSize:9, fontWeight:800,
                                  padding:"1px 5px", borderRadius:99 }}>{badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 26px" }}>

          {/* ── VENDOR APPLICATIONS ── */}
          {atab === "accounts" && <AdminAccounts adminId={user.id} onChanged={refreshVendorApps} />}
          {atab === "messages" && <MessagesPanel user={user} isAdmin />}

          {atab === "payments" && <AdminPayments onChanged={refreshProblems} />}

          {atab === "vendors" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <h3 style={{ margin:0, fontSize:14, fontWeight:800 }}>
                  Vendor Applications
                  <span style={{ marginLeft:8, fontSize:11, fontWeight:400, color:C.midGray }}>
                    {vendorApps.length} total · {pendingCount} pending
                  </span>
                </h3>
                <button onClick={()=>getVendorApps().then(setVendorApps)} className="btn"
                  style={{ fontSize:11, padding:"5px 12px", borderRadius:99,
                           border:`1px solid ${C.border}`, background:"#fff", color:C.midGray }}>
                  ↻ Refresh
                </button>
              </div>



              {vendorApps.length === 0 ? (
                <div style={{ textAlign:"center", padding:"36px 0", color:C.lightGray }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>🏪</div>
                  <p style={{ fontSize:13 }}>No vendor applications yet.</p>
                  <p style={{ fontSize:11, marginTop:4 }}>New vendor sign-ups will appear here for review.</p>
                </div>
              ) : (
                vendorApps.sort((a,b) => (a.status==="pending"?-1:1)).map(app => (
                  <div key={app.vendorId} style={{ background:"#F9FAFB", borderRadius:12,
                                                    padding:"14px 16px", marginBottom:10,
                                                    border:`1px solid ${C.border}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ margin:0, fontSize:13, fontWeight:800 }}>{app.name}</p>
                        <p style={{ margin:"2px 0 0", fontSize:11, color:C.midGray }}>{app.email}</p>
                        <div style={{ display:"flex", gap:8, marginTop:3, flexWrap:"wrap" }}>
                          <span style={{ fontFamily:"monospace", fontSize:9, color:C.lightGray }}>{app.vendorId}</span>
                          <span style={{ fontSize:10, color:C.midGray }}>· {app.category}</span>
                          <span style={{ fontSize:10, color:C.lightGray }}>
                            · {new Date(app.submittedAt||Date.now()).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                          </span>
                          {app.geoSignal?.tz_city && (
                            <span style={{ fontSize:10, color:"#1D4ED8", background:"#EFF6FF",
                                           padding:"1px 6px", borderRadius:99 }}>
                              📍 {app.geoSignal.tz_city} · {app.geoSignal.lang}
                            </span>
                          )}
                          {app.docFileName && (
                            <span style={{ fontSize:10, color:C.green, background:C.greenSoft,
                                           padding:"1px 6px", borderRadius:99 }}>
                              📎 Doc uploaded: {app.docFileName}
                            </span>
                          )}
                          {!app.docFileName && app.status==="pending" && (
                            <span style={{ fontSize:10, color:"#D97706", background:"#FFFBEB",
                                           padding:"1px 6px", borderRadius:99 }}>
                              ⚠ No document uploaded
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ padding:"3px 10px", borderRadius:99, fontSize:10, fontWeight:800, flexShrink:0,
                                     background: app.status==="approved" ? C.greenSoft : app.status==="rejected" ? "#FEF2F2" : "#FFFBEB",
                                     color: app.status==="approved" ? C.green : app.status==="rejected" ? "#EF4444" : "#D97706" }}>
                        {app.status==="approved" ? "✓ Approved" : app.status==="rejected" ? "✗ Rejected" : "⏳ Pending"}
                      </span>
                    </div>
                    {/* A two-line preview of their description, so the list
                        alone shows who wrote something real. */}
                    {app.description ? (
                      <p style={{ margin:"8px 0 0", fontSize:11.5, color:C.black, lineHeight:1.5,
                                  display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical",
                                  overflow:"hidden", wordBreak:"break-word" }}>
                        {app.description}
                      </p>
                    ) : (
                      <p style={{ margin:"8px 0 0", fontSize:11, color:"#B45309", fontWeight:600 }}>
                        ⚠ No business description yet
                      </p>
                    )}
                    {/* Approve and Decline live inside the review, so every
                        decision is made with the whole application in view. */}
                    <button onClick={()=>setReviewing(r => r === app.vendorId ? null : app.vendorId)}
                      className="btn"
                      style={{ width:"100%", marginTop:10, padding:"8px 0", borderRadius:9, fontSize:12,
                               fontWeight:800, cursor:"pointer",
                               border: app.status === "pending" ? "none" : `1px solid ${C.border}`,
                               background: app.status === "pending" ? C.black : "#fff",
                               color: app.status === "pending" ? "#fff" : C.black }}>
                      {reviewing === app.vendorId ? "▴ Close review" : "📋 Review application"}
                    </button>
                    {reviewing === app.vendorId && (
                      <VendorReview vendorId={app.vendorId}
                        onDecided={() => { refreshVendorApps(); }} />
                    )}
                    {app.reason && reviewing !== app.vendorId && (
                      <p style={{ margin:"8px 0 0", fontSize:10, color:C.midGray, fontStyle:"italic" }}>
                        Review note: {app.reason}
                      </p>
                    )}
                  </div>
                ))
              )}

              <div style={{ background:"#EFF6FF", borderRadius:10, padding:"12px 14px", marginTop:8 }}>
                <p style={{ margin:0, fontSize:10, color:"#1D4ED8", lineHeight:1.65 }}>
                  <strong>Before approving:</strong> open <strong>Review application</strong> to see everything
                  the vendor has given PLUJ: their description, contact details, listings and photos. Only
                  admins can see this. If something looks off, message them from the Accounts tab and ask for
                  proof (a website, social media page or business license) before approving.
                </p>
              </div>
            </div>
          )}

          {/* ── CORS ORIGIN POLICY ── */}
          {atab === "cors" && (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                <span style={{ fontSize:16 }}>🌐</span>
                <h3 style={{ margin:0, fontSize:14, fontWeight:800 }}>CORS / Origin Policy</h3>
                <span style={{ background: originOk ? C.greenSoft : "#FEF2F2",
                               color: originOk ? C.green : "#EF4444",
                               fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:99 }}>
                  {originOk ? "✓ Enforced" : "⚠ Current origin unlisted"}
                </span>
              </div>
              <div style={{ background:"#F9FAFB", borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
                <p style={{ margin:"0 0 4px", fontSize:9, fontWeight:800, color:C.midGray,
                            textTransform:"uppercase", letterSpacing:"0.1em" }}>Current origin</p>
                <p style={{ margin:0, fontFamily:"monospace", fontSize:13, fontWeight:700,
                            color: originOk ? C.black : "#EF4444" }}>{origin}</p>
                <p style={{ margin:"4px 0 0", fontSize:10, color: originOk ? C.green : "#EF4444", fontWeight:600 }}>
                  {originOk ? "✓ On allowlist" : "✗ Not on allowlist — add to CORS_CONFIG.allowedOrigins"}
                </p>
              </div>
              <p style={{ margin:"0 0 8px", fontSize:12, fontWeight:700 }}>
                Allowed origins ({CORS_CONFIG.allowedOrigins.length})
              </p>
              {CORS_CONFIG.allowedOrigins.map((o, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8,
                                      background:"#F3F4F6", borderRadius:8, padding:"6px 12px", marginBottom:4 }}>
                  <span style={{ fontSize:10, color:C.green, fontWeight:800 }}>✓</span>
                  <span style={{ fontFamily:"monospace", fontSize:11, color:C.black, wordBreak:"break-all" }}>
                    {o.toString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── RLS POLICIES ── */}
          {atab === "rls" && (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                <span style={{ fontSize:16 }}>🔒</span>
                <h3 style={{ margin:0, fontSize:14, fontWeight:800 }}>Row Level Security — Active Policies</h3>
              </div>
              <PolicyRow name="user_isolation"           rule="USING (session.userId = record.id)"                                  ok />
              <PolicyRow name="booking_isolation (read)" rule="USING (session.userId = booking.userId)"                            ok />
              <PolicyRow name="booking_isolation (write)"rule="WITH CHECK (session.userId = NEW.userId AND type != 'guest')"       ok />
              <PolicyRow name="review_auth"              rule="WITH CHECK (session.type IN ('user','vendor'))"                     ok />
              <PolicyRow name="admin_only"               rule="USING (session.type = 'admin' AND session.userId = record.adminId)" ok />
              <PolicyRow name="cors_origin"              rule="USING (window.location.origin IN CORS_CONFIG.allowedOrigins)"       ok={originOk} />
            </div>
          )}

          {/* ── SECURITY HEADERS ── */}
          {atab === "sec" && (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <span style={{ fontSize:16 }}>🔐</span>
                <h3 style={{ margin:0, fontSize:14, fontWeight:800 }}>Security Headers</h3>
              </div>
              <p style={{ margin:"0 0 12px", fontSize:11, color:C.midGray, lineHeight:1.6 }}>
                Headers marked <strong>server only</strong> must be set on your web server — cannot be set by JavaScript.
              </p>
              {Object.entries(SECURITY_HEADERS.server).map(([name, val]) => {
                const meta = name === "Content-Security-Policy" || name === "Referrer-Policy";
                return (
                  <div key={name} style={{ display:"flex", justifyContent:"space-between",
                                           alignItems:"flex-start", padding:"7px 0",
                                           borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ flex:1, minWidth:0, paddingRight:8 }}>
                      <p style={{ margin:0, fontSize:10, fontWeight:700, color:C.black, fontFamily:"monospace" }}>{name}</p>
                      <p style={{ margin:"1px 0 0", fontSize:9, color:C.lightGray,
                                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {val.length > 80 ? val.slice(0,80)+"…" : val}
                      </p>
                    </div>
                    <span style={{ flexShrink:0, fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:99,
                                   background: meta ? "#EFF6FF" : "#FFFBEB",
                                   color: meta ? "#1D4ED8" : "#92400E" }}>
                      {meta ? "✓ meta + server" : "⚠ server only"}
                    </span>
                  </div>
                );
              })}
              <SecurityConfigPanel />
            </div>
          )}

          {/* ── SETTINGS ──
              Its own tab rather than sitting above all of them. Repeating a
              control on every tab is a way of saying it belongs to none of
              them; this one belongs here. It is also not in Account, which is
              about this admin's own login, not about the site. */}
          {atab === "settings" && (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <span style={{ fontSize:16 }}>⚙️</span>
                <h3 style={{ margin:0, fontSize:14, fontWeight:800 }}>Site Settings</h3>
              </div>
              <SiteSwitch />
            </div>
          )}

          {/* ── ADMIN ACCOUNT ── */}
          {atab === "acct" && (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <span style={{ fontSize:16 }}>👤</span>
                <h3 style={{ margin:0, fontSize:14, fontWeight:800 }}>Your Admin Account</h3>
              </div>
              <div style={{ background:"#F9FAFB", borderRadius:12, padding:"14px 16px", border:`1px solid ${C.border}` }}>
                {[
                  ["Admin ID",    user.id,               "monospace"],
                  ["Name",        user.name,              "normal"],
                  ["Email",       maskEmail(user.email),  "normal"],
                  ["Type",        "Administrator 🛡️",     "normal"],
                  ["Created",     new Date(user.createdAt||Date.now()).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}), "normal"],
                ].map(([label, val, ff]) => (
                  <div key={label} style={{ display:"flex", justifyContent:"space-between",
                                            padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:11, color:C.midGray, fontWeight:600 }}>{label}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:C.black,
                                   fontFamily: ff==="monospace" ? "monospace" : "inherit" }}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}


export default AdminPanel;
