/* Extracted from PlujMarketplace.jsx on 23 September 2026 so it can be loaded
   on demand. See the note on the lazy import in PlujMarketplace.jsx for why
   the import points back at that file rather than at a shared module.
   Nothing here was rewritten - the moved code is byte-identical to what it
   replaced, so any behaviour change would be a bug, not a decision. */

import React, { useState, useEffect, useMemo, useRef } from "react";

import {
  C,
  CORS_CONFIG,
  MessagesPanel,
  RLS,
  SECURITY_HEADERS,
  SiteSwitch,
  adminDeleteAccount,
  adminListAccounts,
  adminSendMessage,
  adminSetBlocked,
  getVendorApps,
  isOriginAllowed,
  maskEmail,
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
  const [busy,       setBusy]      = useState(false);
  const [actionErr,  setActionErr] = useState("");
  const origin = (typeof window !== "undefined" ? window.location.origin : "") || "null";
  const originOk = isOriginAllowed(origin);

  /* Re-read on every tab switch, not only when the panel opens. The Accounts
     tab can approve or reject a vendor too, and the Vendors tab used to keep
     showing that vendor as pending — badge and all — until the whole panel
     was closed and reopened. */
  const refreshVendorApps = React.useCallback(() => getVendorApps().then(setVendorApps), []);
  useEffect(() => { refreshVendorApps(); }, [atab, refreshVendorApps]);

  async function handleAction(vendorId, action) {
    setBusy(true);
    setActionErr("");
    const res = await setVendorStatus(vendorId, action === "approve" ? "approved" : "rejected",
      action === "reject" ? "Did not meet verification requirements." : "");
    if (!res || !res.ok) {
      setActionErr((res && res.error) || "Action failed — the change did not save.");
      setBusy(false);
      return;
    }
    setVendorApps(await getVendorApps());
    setBusy(false);
  }

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
          <div style={{ display:"flex", gap:2, marginTop:12 }}>
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

              {actionErr && (
                <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", color:"#B91C1C",
                              borderRadius:9, padding:"9px 12px", marginBottom:10, fontSize:12, fontWeight:600 }}>
                  ⚠ {actionErr}
                </div>
              )}

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
                    {app.status === "pending" && (
                      <div style={{ display:"flex", gap:8, marginTop:10 }}>
                        <button onClick={()=>handleAction(app.vendorId,"approve")}
                          disabled={busy} className="btn"
                          style={{ flex:1, padding:"8px 0", borderRadius:9, background:C.green,
                                   color:"#fff", border:"none", fontSize:12, fontWeight:700 }}>
                          ✓ Approve vendor
                        </button>
                        <button onClick={()=>handleAction(app.vendorId,"reject")}
                          disabled={busy} className="btn"
                          style={{ flex:1, padding:"8px 0", borderRadius:9, background:"#FEF2F2",
                                   color:"#EF4444", border:"1px solid #FCA5A5", fontSize:12, fontWeight:700 }}>
                          ✗ Reject
                        </button>
                      </div>
                    )}
                    {app.reason && (
                      <p style={{ margin:"8px 0 0", fontSize:10, color:C.midGray, fontStyle:"italic" }}>
                        Review note: {app.reason}
                      </p>
                    )}
                  </div>
                ))
              )}

              <div style={{ background:"#EFF6FF", borderRadius:10, padding:"12px 14px", marginTop:8 }}>
                <p style={{ margin:0, fontSize:10, color:"#1D4ED8", lineHeight:1.65 }}>
                  <strong>Privacy note:</strong> Full application details (license #, EIN, address, managing members)
                  are stored in the vendor's private encrypted storage. Only non-sensitive summaries appear here.
                  Contact vendors at their registered email to request verification documents.
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
