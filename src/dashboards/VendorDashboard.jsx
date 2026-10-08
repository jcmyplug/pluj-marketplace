/* Extracted from PlujMarketplace.jsx on 23 September 2026 so it can be loaded
   on demand. See the note on the lazy import in PlujMarketplace.jsx for why
   the import points back at that file rather than at a shared module.
   Nothing here was rewritten - the moved code is byte-identical to what it
   replaced, so any behaviour change would be a bug, not a decision. */

import React, { useState, useEffect, useMemo, useRef } from "react";

import {
  AVAIL_DAYS,
  AvailabilityCalendar,
  C,
  CATEGORIES,
  CAT_SUBS,
  EventsCalendar,
  GLOBAL_CSS,
  MAX_PHOTOS,
  MessagesPanel,
  PhotoManager,
  PlujMark,
  RLS,
  Stars,
  TIME_BLOCKS,
  TX_CITIES,
  VendorListingEditor,
  deleteService,
  existingReview,
  fmtTimeRange,
  formatEventLocation,
  getMyListing,
  getMyServices,
  InfoPageModal,
  getNotifs,
  getReviewsAbout,
  getVendorInquiries,
  isCancelledStatus,
  isConfirmedStatus,
  isDeclinedStatus,
  isRealId,
  loadSession,
  markNotifsRead,
  parseAddons,
  parseEventTypes,
  parsePackages,
  parsePhotos,
  ratingSummary,
  replyToInquiry,
  saveService,
  sb,
  submitReviewDB,
  uploadVendorPhoto,
  BookingPayments,
  ConfirmPriceField,
  confirmPricePayload,
  VendorPayoutsCard,
  subcatMax,
  fmtHours,
  TIMED_CATEGORIES,
  getLegalMissing,
} from "../PlujMarketplace.jsx";

function CustomerRating({ vendorId, customerId, customerName, bookingId }) {
  const [mine,   setMine]   = useState(undefined);   // undefined = loading
  const [summary,setSummary]= useState({ avg:null, count:0 });
  const [open,   setOpen]   = useState(false);
  const [stars,  setStars]  = useState(5);
  const [note,   setNote]   = useState("");
  const [err,    setErr]    = useState("");
  const [busy,   setBusy]   = useState(false);

  async function load() {
    const [ex, revs] = await Promise.all([
      existingReview(vendorId, customerId, "vendor_to_user").catch(()=>null),
      getReviewsAbout(customerId).catch(()=>[]),
    ]);
    setMine(ex);
    setSummary(ratingSummary(revs.filter(r => r.direction === "vendor_to_user")));
  }
  useEffect(() => { load(); }, [customerId]);

  async function submit() {
    setBusy(true); setErr("");
    const res = await submitReviewDB({
      bookingId, authorId: vendorId, subjectId: customerId,
      direction: "vendor_to_user", rating: stars, body: note.trim() || null,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setOpen(false); setNote(""); load();
  }

  return (
    <div style={{ marginTop:10, borderTop:`1px dashed ${C.border}`, paddingTop:10 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        <span style={{ fontSize:11, color:C.midGray }}>
          {customerName}{summary.count > 0 ? ` · ★ ${summary.avg} (${summary.count})` : " · no ratings yet"}
        </span>
        {mine === undefined ? null : mine ? (
          <span style={{ fontSize:11, color:C.green, fontWeight:700 }}>✓ You rated ★{mine.rating}</span>
        ) : !open ? (
          <button onClick={() => setOpen(true)} className="btn"
            style={{ padding:"5px 11px", borderRadius:8, border:`1px solid ${C.border}`,
                     background:"#fff", fontSize:11, fontWeight:700, color:C.black }}>
            Rate customer
          </button>
        ) : null}
      </div>
      {open && !mine && (
        <div style={{ marginTop:8, background:"#FAFAFA", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px" }}>
          <Stars r={stars} size={20} interactive onRate={setStars} />
          <textarea value={note} onChange={e=>setNote(e.target.value)}
            placeholder="How was working with this customer? (optional)"
            style={{ width:"100%", minHeight:56, marginTop:8, border:`1px solid ${C.border}`,
                     borderRadius:9, padding:"8px 10px", fontSize:12, resize:"vertical", fontFamily:"inherit" }} />
          {err && <p style={{ color:"#B91C1C", fontSize:11, margin:"6px 0 0", fontWeight:600 }}>⚠ {err}</p>}
          <div style={{ display:"flex", gap:7, marginTop:8 }}>
            <button onClick={submit} disabled={busy} className="btn"
              style={{ padding:"7px 16px", borderRadius:8, border:"none", background:C.orange,
                       color:"#fff", fontSize:12, fontWeight:700 }}>
              {busy ? "Saving…" : "Submit rating"}
            </button>
            <button onClick={()=>setOpen(false)} className="btn"
              style={{ padding:"7px 12px", borderRadius:8, border:"none", background:"#F3F4F6", color:C.midGray, fontSize:12 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Vendor's inquiry inbox — customer questions with a reply box. */
/* ─── MESSAGES ───────────────────────────────────────────────────────────────
   One inbox used by customers, vendors and the admin. Threads stay open until
   3 days after the event or until someone presses Stop; admin threads only the
   admin can end. */


/* The red message under a field that has a problem. */
function FieldError({ on, msg }) {
  if (!on || !msg) return null;
  return <p role="alert" style={{ margin:"4px 0 0", fontSize:11.5, color:"#B91C1C", fontWeight:700 }}>⚠ {msg}</p>;
}

/* Which listing field a save error from the database is about. */
function fieldForSaveError(msg) {
  const m = String(msg || "").toLowerCase();
  if (/capacity_max|maximum guests/.test(m)) return "capacity_max";
  if (/capacity|minimum guests|guests/.test(m)) return "capacity_min";
  if (/price/.test(m)) return "price_value";
  if (/description|describe/.test(m)) return "description";
  if (/photo|image|upload/.test(m)) return "photos";
  if (/\bname\b/.test(m)) return "name";
  return null;
}

/* Database wording a vendor can't act on ("permission denied for function
   …", constraint names) becomes a sentence they can. */
function friendlySaveError(msg) {
  const m = String(msg || "");
  if (/permission denied|row-level security|violates row-level/i.test(m)) {
    return "We couldn't save this listing because of a problem on our side, not anything you entered. Please try again in a minute; if it keeps happening, contact PLUJ.";
  }
  if (/violates check constraint/i.test(m) && /capacity/i.test(m)) {
    return "Check the guest numbers: the minimum can't be more than the maximum, and the maximum must be at least 1.";
  }
  if (/failed to fetch|network/i.test(m)) return "Couldn't reach PLUJ. Check your connection and try again.";
  return m || "Something went wrong saving this listing. Please try again.";
}

function ServicesManager({ vendorId, onOpenBusiness, legalKey }) {
  const [services, setServices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);   // service object or "new"
  const [err,      setErr]      = useState("");
  const [errField, setErrField] = useState(null);   // which field the error is about, to highlight it
  const [ok,       setOk]       = useState("");
  const [busy,     setBusy]     = useState(false);
  const [uploading,setUploading]= useState(false);
  const fieldRefs  = useRef({});
  const formErrRef = useRef(null);
  /* Legal information still missing (null = unknown). No listing can be
     posted until it is complete; the database refuses it as well. */
  const [legalMissing, setLegalMissing] = useState(null);
  const [legalNudge,   setLegalNudge]   = useState(false);
  useEffect(() => { getLegalMissing(vendorId).then(setLegalMissing); }, [vendorId, legalKey]);
  const legalBlocked = Array.isArray(legalMissing) && legalMissing.length > 0;

  /* Show an error where the vendor is looking: highlight the field it is
     about and scroll to it (or to the message next to Save), instead of only
     printing it at the top of the page, out of sight. */
  function fail(message, field = null) {
    setErr(friendlySaveError(message)); setErrField(field);
    setTimeout(() => {
      const el = (field && fieldRefs.current[field]) || formErrRef.current;
      if (!el) return;
      try { el.scrollIntoView({ behavior:"smooth", block:"center" }); } catch { el.scrollIntoView(); }
      if (field && el.focus) { try { el.focus({ preventScroll:true }); } catch { /* not focusable */ } }
    }, 50);
  }

  const blank = { category:"food", subcategory:"", subcategories:[], name:"", service_type:"", description:"",
                  price_value:"", duration_hours:"", extra_hour_price:"", capacity_min:"", capacity_max:"", photos:[], packages:[], active:true, offsite:false, travel_miles:"", service_areas:"", addons:[], avail_days:[], avail_blocks:[], max_per_day:1, gap_hours:2, simultaneous:false, min_notice_hours:0,
                  instant_book:false, instant_terms_accepted_at:null, instant_tick:false };

  async function load() {
    setLoading(true);
    const list = await getMyServices(vendorId);
    if (list && list.__error) { setErr(list.__error); setServices([]); }
    else setServices(Array.isArray(list) ? list : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [vendorId]);

  function startEdit(s) {
    setErr(""); setOk("");
    if (!s && legalBlocked) { setLegalNudge(true); return; }
    setLegalNudge(false);
    setEditing(s ? {
      ...s,
      price_value: s.price_value != null ? String(s.price_value) : "",
      duration_hours: s.duration_hours != null ? String(Number(s.duration_hours)) : "",
      extra_hour_price: s.extra_hour_price != null ? String(Number(s.extra_hour_price)) : "",
      photos: parsePhotos(s.photos),
      packages: parsePackages(s.packages),
      subcategory: s.subcategory || "",
      /* Older listings predate the array and only have the single value. */
      subcategories: Array.isArray(s.subcategories) && s.subcategories.length
                       ? s.subcategories
                       : (s.subcategory ? [s.subcategory] : []),
      offsite: s.offsite === true,
      travel_miles: s.travel_miles != null ? String(s.travel_miles) : "",
      service_areas: s.service_areas || "",
      addons: parseAddons(s.addons),
      avail_days: parseEventTypes(s.avail_days),
      avail_blocks: parseEventTypes(s.avail_blocks),
      max_per_day: s.max_per_day == null ? 1 : s.max_per_day,
      gap_hours: s.gap_hours == null ? 2 : s.gap_hours,
      min_notice_hours: s.min_notice_hours == null ? 0 : s.min_notice_hours,
      simultaneous: s.simultaneous === true,
      instant_book: s.instant_book === true,
      instant_terms_accepted_at: s.instant_terms_accepted_at || null,
      instant_tick: !!s.instant_terms_accepted_at,
      name: s.name || "",
      service_type: s.service_type || "",
      description: s.description || "",
      /* Held as strings so the inputs can be genuinely empty — "" means the
         vendor stated nothing, which is not the same as 0. */
      capacity_min: s.capacity_min != null ? String(s.capacity_min) : "",
      capacity_max: s.capacity_max != null ? String(s.capacity_max) : "",
    } : { ...blank });
    setErrField(null);
  }

  function setField(k, v) {
    setEditing(e => {
      const next = { ...e, [k]: v };
      /* Subs differ per category, so changing the category clears both the
         array and the mirrored primary — otherwise a food truck that switches
         to Rentals keeps claiming "catering". */
      if (k === "category") { next.subcategory = ""; next.subcategories = []; }
      return next;
    });
    setErr(""); setErrField(null);
  }

  async function addPhotos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const roomLeft = MAX_PHOTOS - (editing.photos.length || 0);
    if (files.length > roomLeft) {
      fail(roomLeft <= 0
        ? `You already have ${MAX_PHOTOS} photos, the maximum. Remove one to add another.`
        : `You can add ${roomLeft} more photo${roomLeft === 1 ? "" : "s"} — ${MAX_PHOTOS} is the maximum.`, "photos");
      return;
    }
    setUploading(true); setErr("");
    const session = await loadSession();
    const added = [];
    for (const file of files) {
      const { url, error } = await uploadVendorPhoto(vendorId, file, session?.access_token);
      if (error) { fail(error, "photos"); break; }
      if (url) added.push(url);
    }
    if (added.length) setEditing(p => ({ ...p, photos: [...p.photos, ...added] }));
    setUploading(false);
  }

  async function save() {
    if (!editing.description.trim()) { fail("Please describe this service.", "description"); return; }
    /* Capacity is two optional numbers. Blank is allowed and meaningful, but a
       value that is there has to make sense, and the pair has to agree — the
       database enforces the same three rules, so catching them here is only
       about giving the vendor a sentence instead of a constraint name. */
    const capMinRaw = String(editing.capacity_min ?? "").trim();
    const capMaxRaw = String(editing.capacity_max ?? "").trim();
    const capMin = capMinRaw === "" ? null : Number(capMinRaw);
    const capMax = capMaxRaw === "" ? null : Number(capMaxRaw);
    if (capMin !== null && (!Number.isInteger(capMin) || capMin < 0)) {
      fail("Minimum guests must be a whole number, 0 or more — or leave it blank.", "capacity_min"); return;
    }
    if (capMax !== null && (!Number.isInteger(capMax) || capMax < 1)) {
      fail("Maximum guests must be a whole number of 1 or more — or leave it blank for no limit.", "capacity_max"); return;
    }
    if (capMin !== null && capMax !== null && capMin > capMax) {
      fail(`Your minimum (${capMin}) is larger than your maximum (${capMax}). Swap them, or clear one.`, "capacity_min"); return;
    }
    if (editing.instant_book) {
      const hasPrice = Number(editing.price_value) > 0
        || (editing.packages || []).some(p => Number(p.price) > 0);
      if (!hasPrice) { fail("Instant booking needs a price: add a starting price or a priced option.", "price_value"); return; }
      if (!editing.instant_tick) { fail("Tick the box to accept the instant booking terms, or switch instant booking off.", "instant_book"); return; }
    }
    if (String(editing.extra_hour_price ?? "").trim() !== "" && !(Number(editing.extra_hour_price) >= 0)) {
      fail("The extra-hour price must be a number, or leave it blank.", "extra_hour_price"); return;
    }
    setBusy(true);
    const res = await saveService(vendorId, editing);
    setBusy(false);
    if (!res.ok) {
      if (/legal information/i.test(res.error || "")) {
        setLegalNudge(true); getLegalMissing(vendorId).then(setLegalMissing);
        fail(res.error, null); return;
      }
      fail(res.error, fieldForSaveError(res.error)); return;
    }
    setOk("Service saved."); setEditing(null); load();
    setTimeout(() => setOk(""), 2500);
  }

  async function remove(s) {
    if (!window.confirm("Delete this service? Customers will no longer see it.")) return;
    setBusy(true);
    const res = await deleteService(vendorId, s.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    load();
  }

  const F = { width:"100%", height:42, padding:"0 12px", border:`1px solid ${C.border}`,
              borderRadius:9, fontSize:13, boxSizing:"border-box", background:"#fff" };
  const L = { display:"block", fontSize:11, fontWeight:700, color:C.midGray, margin:"10px 0 4px" };
  /* Red outline on the field an error is about. */
  const bad = (k, base) => errField === k
    ? { ...base, border:"1.5px solid #DC2626", boxShadow:"0 0 0 3px #FEE2E2", background:"#FFFBFB" } : base;
  const catLabel = id => (CATEGORIES.find(c => c.id === id) || {}).label || id;

  return (
    <div style={{ marginTop:18, borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <p style={{ margin:0, fontSize:13, fontWeight:800, color:C.black }}>Your listings</p>
          <p style={{ margin:"2px 0 0", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
            Offer as many as you like, in different categories — a venue can also
            list rentals, A/V or a DJ. Each appears as its own listing.
          </p>
        </div>
        {!editing && (
          <button onClick={() => startEdit(null)} className="btn"
            style={{ padding:"8px 14px", borderRadius:9, border:"none", background:C.orange,
                     color:"#fff", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>
            + Add listing
          </button>
        )}
      </div>

      {(legalNudge || (legalBlocked && !editing)) && legalBlocked && (
        <div role="alert" style={{ background:"#FFFBEB", border:"1px solid #FCD34D", borderRadius:10,
                                   padding:"11px 13px", marginTop:10 }}>
          <p style={{ margin:0, fontSize:12.5, fontWeight:800, color:"#92400E" }}>
            ⚖️ Add your legal information before posting a listing
          </p>
          <p style={{ margin:"4px 0 8px", fontSize:11.5, color:"#92400E", lineHeight:1.55 }}>
            Still missing: {legalMissing.join(", ")}. It's private — only PLUJ sees it.
          </p>
          {onOpenBusiness && (
            <button type="button" onClick={onOpenBusiness} className="btn"
              style={{ padding:"7px 14px", borderRadius:8, border:"none", background:C.black, color:"#fff",
                       fontSize:12, fontWeight:700 }}>
              Open Business details
            </button>
          )}
        </div>
      )}

      {err && !editing && <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", color:"#B91C1C",
                            borderRadius:9, padding:"9px 12px", marginTop:10, fontSize:12, fontWeight:600 }}>⚠ {err}</div>}
      {ok  && <div style={{ background:C.greenSoft, border:`1px solid ${C.green}55`, color:"#065F46",
                            borderRadius:9, padding:"9px 12px", marginTop:10, fontSize:12, fontWeight:600 }}>✓ {ok}</div>}

      {/* Existing services */}
      {loading ? (
        <p style={{ fontSize:12, color:C.lightGray, marginTop:12 }}>Loading services…</p>
      ) : !editing && (
        <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:8 }}>
          {services.length === 0 && (
            <p style={{ fontSize:12, color:C.midGray, background:"#F9FAFB", border:`1px dashed ${C.border}`,
                        borderRadius:10, padding:"14px", textAlign:"center" }}>
              No listings yet. Tap "+ Add listing" to create your first one.
            </p>
          )}
          {services.map((s, idx) => {
            const pics = parsePhotos(s.photos);
            return (
              <div key={s.id} style={{ display:"flex", gap:10, alignItems:"center", background:"#F9FAFB",
                                       border:`1px solid ${C.border}`, borderRadius:11, padding:"10px 12px" }}>
                {pics[0]
                  ? <img src={pics[0]} alt="" style={{ width:42, height:42, borderRadius:8, objectFit:"cover", flexShrink:0 }} />
                  : <div style={{ width:42, height:42, borderRadius:8, background:"#EEE", flexShrink:0,
                                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🏪</div>}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:700, color:C.black }}>
                    {services.length > 1 && (
                      <span style={{ fontSize:10, fontWeight:800, color:C.orange, background:C.orangeSoft,
                                     borderRadius:99, padding:"1px 7px", marginRight:6, verticalAlign:"middle" }}>
                        Listing {idx + 1}
                      </span>
                    )}
                    {s.name || s.service_type || s.subcategory || catLabel(s.category)}
                  </p>
                  <p style={{ margin:"1px 0 0", fontSize:11, color:C.midGray }}>
                    {[s.service_type, catLabel(s.category)].filter(Boolean).join(" · ")}
                    {s.price_value != null ? ` · $${Number(s.price_value).toLocaleString()}` : " · Contact for pricing"}
                    {Number(s.duration_hours) > 0 ? ` · ⏱ ${fmtHours(s.duration_hours)}` : ""}
                    {s.instant_book ? " · ⚡ Instant booking" : ""}
                    {s.category !== "places" ? (s.offsite ? " · 🚗 off-site OK" : " · 📍 on-site only") : ""}
                    {s.active === false ? " · hidden" : ""}
                  </p>
                </div>
                <button onClick={() => startEdit(s)} className="btn"
                  style={{ padding:"6px 10px", borderRadius:8, border:`1px solid ${C.border}`,
                           background:"#fff", fontSize:11, fontWeight:700, color:C.black }}>Edit</button>
                <button onClick={() => remove(s)} disabled={busy} className="btn"
                  style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #FCA5A5",
                           background:"#FEF2F2", fontSize:11, fontWeight:700, color:"#B91C1C" }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / edit form */}
      {editing && (
        <div style={{ marginTop:12, background:"#fff", border:`1.5px solid ${C.orangeBorder}`,
                      borderRadius:12, padding:"12px 14px" }}>
          <p style={{ margin:0, fontSize:12, fontWeight:800, color:C.orange }}>
            {editing.id ? "Edit service" : "New service"}
          </p>

          <label style={L}>Business name * <span style={{ color:C.lightGray, fontWeight:500 }}>(the name clients will see)</span></label>
          <input style={bad("name", F)} value={editing.name || ""}
            ref={el => { fieldRefs.current.name = el; }} aria-invalid={errField === "name"}
            onChange={e => setField("name", e.target.value)}
            placeholder="e.g. DJ Juanchis Entertainers, El Fuego Taco Truck" />
          <p style={{ margin:"3px 0 0", fontSize:10.5, color:C.lightGray }}>
            This is the headline customers see for this listing. Give each listing its own name so they can tell your offerings apart.
          </p>
          <FieldError on={errField === "name"} msg={err} />

          <label style={L}>Service type *</label>
          <select style={F} value={editing.category}
            onChange={e => { const c=e.target.value; setField("category", c);
                             setField("service_type", (CATEGORIES.find(x=>x.id===c)||{}).label || c); }}>
            {CATEGORIES.filter(c => c.id !== "all" && c.id !== "build").map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>

          {(CAT_SUBS[editing.category] || []).length > 0 && (() => {
            /* A food truck is often also catering, and sometimes a mobile bar.
               One subcategory forced vendors to pick the single best lie about
               their business, and customers browsing "Catering" never saw them.

               Three is the cap (Rentals has none: a rental company really can
               rent tables, tents, linens and dance floors). Without one, the
               rational move for every vendor is to tick everything, and then
               these filters stop meaning anything for the customer. */
            const MAX = Math.min(subcatMax(editing.category), (CAT_SUBS[editing.category] || []).length);
            const picked = Array.isArray(editing.subcategories) ? editing.subcategories : [];
            const toggle = (id) => {
              const has = picked.includes(id);
              if (!has && picked.length >= MAX) return;   // at the cap, ignore
              const next = has ? picked.filter(x => x !== id) : [...picked, id];
              setEditing(e => ({ ...e, subcategories: next, subcategory: next[0] || "" }));
              setErr("");
            };
            return (
              <>
                <label style={L}>
                  What this service covers{" "}
                  <span style={{ fontWeight:500, color:C.midGray }}>
                    — {MAX >= (CAT_SUBS[editing.category] || []).length ? "pick all that apply" : `pick up to ${MAX}`} ({picked.length}/{MAX})
                  </span>
                </label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:4 }}>
                  {(CAT_SUBS[editing.category] || []).map(s => {
                    const on   = picked.includes(s.id);
                    const full = !on && picked.length >= MAX;
                    return (
                      <button key={s.id} type="button" onClick={() => toggle(s.id)}
                        disabled={full}
                        title={full ? `Remove one first — ${MAX} is the maximum` : s.d || s.l}
                        className="btn"
                        style={{ padding:"7px 12px", borderRadius:99, fontSize:12, fontWeight:700,
                                 cursor: full ? "not-allowed" : "pointer",
                                 border:`1.5px solid ${on ? C.orange : C.border}`,
                                 background: on ? C.orangeSoft : "#fff",
                                 color: on ? C.orange : (full ? C.lightGray : C.midGray),
                                 opacity: full ? 0.55 : 1 }}>
                        {on ? "✓ " : ""}{s.e} {s.l}
                      </button>
                    );
                  })}
                </div>
                <p style={{ margin:"0 0 4px", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
                  {picked.length === 0
                    ? "Optional, but listings that pick at least one show up in far more searches."
                    : picked.length >= MAX
                      ? `That's the maximum. The first one, ${
                          ((CAT_SUBS[editing.category]||[]).find(x=>x.id===picked[0])||{}).l || picked[0]
                        }, is what customers see on your card.`
                      : `Customers browsing any of these will find this listing. The first one, ${
                          ((CAT_SUBS[editing.category]||[]).find(x=>x.id===picked[0])||{}).l || picked[0]
                        }, shows on your card.`}
                </p>
              </>
            );
          })()}

          <label style={L}>Describe this service *</label>
          <textarea value={editing.description} onChange={e => setField("description", e.target.value)}
            ref={el => { fieldRefs.current.description = el; }} aria-invalid={errField === "description"}
            rows={3} placeholder="What's included, and what makes it different."
            style={{ ...bad("description", F), height:"auto", padding:"10px 12px", resize:"vertical", fontFamily:"inherit" }} />
          <FieldError on={errField === "description"} msg={err} />

          <div style={{ display:"flex", gap:8 }}>
            <div style={{ flex:1 }}>
              <label style={L}>Starting price</label>
              <input style={bad("price_value", F)} type="number" min="0" value={editing.price_value}
                ref={el => { fieldRefs.current.price_value = el; }} aria-invalid={errField === "price_value"}
                onChange={e => setField("price_value", e.target.value)} placeholder="Blank = contact us" />
            </div>
            <div style={{ flex:1 }}>
              <label style={L}>Guest capacity</label>
              <div style={{ display:"flex", gap:8 }}>
                <input style={bad("capacity_min", F)} type="number" min="0" step="1" inputMode="numeric"
                  ref={el => { fieldRefs.current.capacity_min = el; }} aria-invalid={errField === "capacity_min"}
                  value={editing.capacity_min ?? ""}
                  onChange={e => setField("capacity_min", e.target.value)}
                  placeholder="Min (optional)" aria-label="Minimum guests (optional)" />
                <input style={bad("capacity_max", F)} type="number" min="1" step="1" inputMode="numeric"
                  ref={el => { fieldRefs.current.capacity_max = el; }} aria-invalid={errField === "capacity_max"}
                  value={editing.capacity_max ?? ""}
                  onChange={e => setField("capacity_max", e.target.value)}
                  placeholder="Max" aria-label="Maximum guests" />
              </div>
            </div>
          </div>
          <FieldError on={errField === "capacity_min" || errField === "capacity_max" || errField === "price_value"} msg={err} />

          {/* These two numbers decide which searches you appear in and which
              requests you are allowed to accept, so they are worth getting
              right — this is why the old free-text box is gone. */}
          <p style={{ margin:"6px 0 0", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
            <strong>Minimum guests</strong> is optional — set it only if you turn down events below a
            certain size. <strong>Leave the maximum blank if you have no limit</strong>; blank means
            no limit, not zero. Customers searching for a headcount outside this range won't see
            this listing, and you won't be able to accept a request outside it.
          </p>

          {/* Service time: how long the starting price lasts (a DJ's 4-hour set,
              a 24-hour rental, a food truck's 3-hour service) and what each
              extra hour costs. Pricing options can each set their own hours
              below. */}
          <div style={{ marginTop:12, background:"#F9FAFB", border:`1px solid ${C.border}`, borderRadius:11, padding:"12px 14px" }}>
            <p style={{ margin:0, fontSize:12.5, fontWeight:800 }}>
              {editing.category === "rentals" ? "⏱ Rental period" : "⏱ Service time"}
              {TIMED_CATEGORIES.includes(editing.category) ? "" : <span style={{ fontWeight:500, color:C.lightGray }}> (optional)</span>}
            </p>
            <p style={{ margin:"3px 0 9px", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
              {editing.category === "rentals"
                ? "How long the starting price rents it for — e.g. 24 hours, or a full weekend."
                : editing.category === "music"
                  ? "How long you perform or play for the starting price — e.g. a 4-hour set."
                  : editing.category === "food"
                    ? "How long you serve for the starting price — e.g. 3 hours of truck service."
                    : "How long the starting price covers. Hosts see it next to the price."}
            </p>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              <div style={{ flex:"1 1 160px" }}>
                <label style={{ ...L, marginTop:0 }}>Starting price includes</label>
                <select style={F} value={editing.duration_hours || ""}
                  onChange={e => setField("duration_hours", e.target.value)}>
                  <option value="">Not time-based</option>
                  {[1,1.5,2,2.5,3,4,5,6,7,8,10,12,24,48,72,168].map(h => <option key={h} value={h}>{fmtHours(h)}</option>)}
                </select>
              </div>
              <div style={{ flex:"1 1 160px" }}>
                <label style={{ ...L, marginTop:0 }}>{editing.category === "rentals" ? "Each extra hour" : "Each extra hour"} ($)</label>
                <input style={bad("extra_hour_price", F)} type="number" min="0" value={editing.extra_hour_price || ""}
                  ref={el => { fieldRefs.current.extra_hour_price = el; }} aria-invalid={errField === "extra_hour_price"}
                  onChange={e => setField("extra_hour_price", e.target.value)} placeholder="Blank = not offered" />
              </div>
            </div>
            <FieldError on={errField === "extra_hour_price"} msg={err} />
          </div>

          {/* Off-site availability — key for venues whose sub-services (decor,
              sound, DJs, catering…) can also travel to other events. */}
          {editing.category !== "places" && (
            <div style={{ marginTop:12, background:"#F9FAFB", border:`1px solid ${C.border}`, borderRadius:11, padding:"12px 14px" }}>
              <p style={{ margin:0, fontSize:12.5, fontWeight:800 }}>
                Can you provide this at the customer's location (off-site)?
              </p>
              <p style={{ margin:"3px 0 10px", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
                Choose "Yes" if you'll travel to other events — not only at your own venue/space.
              </p>
              <div style={{ display:"flex", gap:8 }}>
                {[["yes","🚗 Yes — I travel off-site", true],["no","📍 No — on-site / my location only", false]].map(([k,l,val]) => {
                  const on = (editing.offsite === true) === val;
                  return (
                    <button key={k} type="button" onClick={() => setField("offsite", val)} className="btn"
                      style={{ flex:1, padding:"9px 8px", borderRadius:9, fontSize:12, fontWeight:700, cursor:"pointer",
                               border:`1.5px solid ${on ? C.orange : C.border}`,
                               background: on ? "#FFF7ED" : "#fff", color: on ? C.orange : C.midGray }}>
                      {l}
                    </button>
                  );
                })}
              </div>

              {/* Per-listing travel radius + service areas — a vendor may serve
                  different areas from different listings/locations. */}
              <div style={{ marginTop:12 }}>
                <label style={L}>Travel radius (miles) for this listing</label>
                <input style={{ ...F, maxWidth:180 }} type="number" min="0" value={editing.travel_miles || ""}
                  onChange={e => setField("travel_miles", e.target.value)} placeholder="e.g. 50" />
              </div>
              <div style={{ marginTop:12 }}>
                <label style={L}>Service areas for this listing <span style={{ color:C.lightGray, fontWeight:500 }}>(tap all that apply)</span></label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
                  {TX_CITIES.map(city => {
                    const sel = (editing.service_areas || "").split(",").map(x => x.trim()).filter(Boolean);
                    const on = sel.includes(city);
                    return (
                      <button type="button" key={city}
                        onClick={() => {
                          const next = on ? sel.filter(c => c !== city) : [...sel, city];
                          setField("service_areas", next.join(", "));
                        }}
                        style={{ padding:"5px 11px", borderRadius:99, fontSize:11.5, fontWeight:600, cursor:"pointer",
                                 border:`1.5px solid ${on ? C.orange : C.border}`,
                                 background: on ? "#FFF7ED" : "#fff", color: on ? C.orange : C.midGray }}>
                        {on ? "✓ " : ""}{city}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p style={{ margin:"6px 0 0", fontSize:10.5, color:C.lightGray }}>
                Leave travel radius blank and no cities selected to use your account defaults.
              </p>
            </div>
          )}

          {/* Availability for THIS listing — click-only, no typing. */}
          <div style={{ marginTop:12, background:"#F9FAFB", border:`1px solid ${C.border}`,
                        borderRadius:11, padding:"12px 14px" }}>
            {/* Deliberately no longer called "availability". Vendors also have a
                calendar on their profile, and two things with the same name
                answering different questions is what made this confusing. This
                one is the recurring weekly pattern for ONE service; the calendar
                is the specific dates the whole business is away. */}
            <p style={{ margin:0, fontSize:12.5, fontWeight:800 }}>When is this service offered?</p>
            <p style={{ margin:"3px 0 9px", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
              The days and times <em>this particular service</em> runs — a venue might be all day
              while your DJ listing is evenings only.{" "}
              <strong>Specific dates you're away are set once</strong> on your Availability tab and
              apply to every listing, so there's no need to repeat them here.
            </p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:9 }}>
              {AVAIL_DAYS.map(d => {
                const cur = parseEventTypes(editing.avail_days);
                const on = cur.includes(d);
                return (
                  <button type="button" key={d}
                    onClick={()=> setField("avail_days", on ? cur.filter(x=>x!==d) : [...cur, d])}
                    style={{ padding:"6px 13px", borderRadius:99, fontSize:11.5, fontWeight:700, cursor:"pointer",
                             border:`1.5px solid ${on ? C.orange : C.border}`,
                             background: on ? "#FFF7ED" : "#fff", color: on ? C.orange : C.midGray }}>
                    {d}
                  </button>
                );
              })}
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {TIME_BLOCKS.map(([id, label]) => {
                const cur = parseEventTypes(editing.avail_blocks);
                const on = cur.includes(id);
                return (
                  <button type="button" key={id}
                    onClick={()=> setField("avail_blocks", on ? cur.filter(x=>x!==id) : [...cur, id])}
                    style={{ padding:"6px 12px", borderRadius:99, fontSize:11.5, fontWeight:600, cursor:"pointer",
                             border:`1.5px solid ${on ? C.orange : C.border}`,
                             background: on ? "#FFF7ED" : "#fff", color: on ? C.orange : C.midGray }}>
                    {on ? "✓ " : ""}{label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* How many events can this listing cover in one day? */}
          <div style={{ marginTop:12, background:"#F9FAFB", border:`1px solid ${C.border}`,
                        borderRadius:11, padding:"12px 14px" }}>
            <p style={{ margin:0, fontSize:12.5, fontWeight:800 }}>
              Can you do more than one event per day with this listing?
            </p>
            <p style={{ margin:"3px 0 9px", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
              This stops double-bookings you can't actually cover.
            </p>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {[["one","One event per day",1,false],
                ["multi","Several, with a gap between",2,false],
                ["same","Several at the same time",99,true]].map(([k,label,defMax,sim]) => {
                const on = sim ? editing.simultaneous === true
                               : (editing.simultaneous !== true && (k === "one"
                                   ? (Number(editing.max_per_day) || 1) <= 1
                                   : (Number(editing.max_per_day) || 1) > 1));
                return (
                  <button key={k} type="button"
                    onClick={()=>{ setField("simultaneous", sim); setField("max_per_day", defMax); }}
                    style={{ flex:"1 1 150px", padding:"9px 10px", borderRadius:9, fontSize:11.5,
                             fontWeight:700, cursor:"pointer",
                             border:`1.5px solid ${on ? C.orange : C.border}`,
                             background: on ? "#FFF7ED" : "#fff", color: on ? C.orange : C.midGray }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Follow-ups only when they're relevant */}
            {editing.simultaneous !== true && (Number(editing.max_per_day) || 1) > 1 && (
              <div style={{ display:"flex", gap:10, marginTop:11 }}>
                <div style={{ flex:1 }}>
                  <label style={L}>Max events per day</label>
                  <select style={F} value={editing.max_per_day || 2}
                    onChange={e => setField("max_per_day", e.target.value)}>
                    {[2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label style={L}>Hours needed between events</label>
                  <select style={F} value={editing.gap_hours || 2}
                    onChange={e => setField("gap_hours", e.target.value)}>
                    {[1,2,3,4,5,6,8,12].map(n => <option key={n} value={n}>{n} hour{n===1?"":"s"}</option>)}
                  </select>
                </div>
              </div>
            )}
            {editing.simultaneous === true && (
              <div style={{ marginTop:11 }}>
                <label style={L}>How many at the same time?</label>
                <select style={{ ...F, maxWidth:200 }} value={editing.max_per_day || 2}
                  onChange={e => setField("max_per_day", e.target.value)}>
                  {[2,3,4,5,6,8,10].map(n => <option key={n} value={n}>{n} at once</option>)}
                  <option value={99}>No limit</option>
                </select>
              </div>
            )}
          </div>

          {/* How much warning do you need?
              Stored as hours rather than a number plus a unit, so "same day, 12
              hours" and "two weeks" are the same field and the booking check is
              one comparison instead of a unit conversion. */}
          <div style={{ marginTop:12, background:"#F9FAFB", border:`1px solid ${C.border}`,
                        borderRadius:11, padding:"12px 14px" }}>
            <p style={{ margin:0, fontSize:12.5, fontWeight:800 }}>
              How much notice do you need before an event?
            </p>
            <p style={{ margin:"3px 0 9px", fontSize:11, color:C.midGray, lineHeight:1.5 }}>
              Customers won't be able to request this service any later than this. Use it to stop
              last-minute requests you cannot realistically prepare for.
            </p>
            <select style={{ ...F, maxWidth:240 }}
              value={editing.min_notice_hours == null ? 0 : editing.min_notice_hours}
              onChange={e => setField("min_notice_hours", e.target.value)}>
              <option value={0}>No minimum — same day is fine</option>
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>1 day</option>
              <option value={48}>2 days</option>
              <option value={72}>3 days</option>
              <option value={168}>1 week</option>
              <option value={336}>2 weeks</option>
              <option value={720}>1 month</option>
            </select>
          </div>

          {/* Instant booking: hosts book open dates without waiting for a reply. */}
          <div ref={el => { fieldRefs.current.instant_book = el; }}
            style={{ marginTop:12, background: editing.instant_book ? "#F0FDF4" : "#F9FAFB",
                     border:`1.5px solid ${errField === "instant_book" ? "#DC2626" : editing.instant_book ? "#86EFAC" : C.border}`,
                     borderRadius:11, padding:"12px 14px" }}>
            <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
              <input type="checkbox" checked={editing.instant_book === true}
                onChange={e => setField("instant_book", e.target.checked)}
                style={{ width:18, height:18, accentColor:C.green }} />
              <span style={{ fontSize:12.5, fontWeight:800 }}>⚡ Instant booking</span>
              <span style={{ fontSize:10.5, fontWeight:700, color:"#065F46", background:C.greenSoft,
                             borderRadius:99, padding:"2px 8px" }}>Gets more bookings</span>
            </label>
            <p style={{ margin:"5px 0 0", fontSize:11, color:C.midGray, lineHeight:1.55 }}>
              Hosts can book this listing on the spot, at your listed price, for open dates at least
              3 days away — no back-and-forth. PLUJ only confirms days this listing works, dates you
              haven't blocked, and days you still have room. Anything else still comes to you as a request.
            </p>
            {editing.instant_book && (
              <label style={{ display:"flex", alignItems:"flex-start", gap:8, marginTop:9, cursor:"pointer" }}>
                <input type="checkbox" checked={editing.instant_tick === true}
                  onChange={e => setField("instant_tick", e.target.checked)}
                  style={{ marginTop:2, accentColor:C.orange }} />
                <span style={{ fontSize:11.5, color:C.black, lineHeight:1.5 }}>
                  I accept bookings made this way as confirmed, at the price shown on this listing, under
                  PLUJ's payment and cancellation terms. I'll keep my calendar up to date and block dates I can't do.
                </span>
              </label>
            )}
            <FieldError on={errField === "instant_book"} msg={err} />
          </div>

          {/* Photos for this specific service */}
          <label style={L}>
            Photos for this service{" "}
            <span style={{ fontWeight:400, color:C.midGray }}>
              ({(editing.photos || []).length}/{MAX_PHOTOS} — the first one is the cover customers see)
            </span>
          </label>
          <PhotoManager
            photos={editing.photos}
            onChange={(next) => setEditing(e => ({ ...e, photos: next }))}
            size={72} />
          <input type="file" accept="image/*" multiple onChange={addPhotos}
            ref={el => { fieldRefs.current.photos = el; }}
            disabled={(editing.photos || []).length >= MAX_PHOTOS}
            style={{ fontSize:11, color:C.midGray }} />
          <FieldError on={errField === "photos"} msg={err} />
          {uploading && <p style={{ fontSize:11, color:C.orange, margin:"4px 0 0" }}>Uploading…</p>}

          {/* Pricing options / packages */}
          <div style={{ marginTop:14, borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <p style={{ margin:0, fontSize:12, fontWeight:800, color:C.black }}>Pricing options</p>
                <p style={{ margin:"2px 0 0", fontSize:10.5, color:C.midGray, lineHeight:1.5 }}>
                  Offer tiers — e.g. “4 hours”, “6 hours + lighting”. Under each one, say what's
                  included and anything the host must provide. Customers only see an option once it has a price.
                </p>
              </div>
              {(editing.packages || []).length < 6 && (
                <button onClick={() => setEditing(e => ({ ...e,
                    packages: [...(e.packages || []), { name:`Option ${(e.packages||[]).length + 1}`, description:"", price:"", hours:"", requirements:"" }] }))}
                  className="btn"
                  style={{ padding:"6px 11px", borderRadius:8, border:`1px solid ${C.orange}`,
                           background:"#fff", color:C.orange, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
                  + Add option
                </button>
              )}
            </div>

            {(editing.packages || []).length === 0 && (
              <p style={{ margin:"8px 0 0", fontSize:11, color:C.lightGray }}>
                No options yet — the single starting price above is used instead.
              </p>
            )}

            {(editing.packages || []).map((p, i) => {
              const priced = Number.isFinite(Number(p.price)) && Number(p.price) > 0;
              return (
                <div key={i} style={{ marginTop:8, padding:"10px 11px", borderRadius:10,
                                      background: priced ? "#F9FAFB" : "#FFFBEB",
                                      border:`1px solid ${priced ? C.border : "#FCD34D"}` }}>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <input value={p.name} placeholder={`Option ${i+1}`}
                      onChange={e => setEditing(ed => ({ ...ed,
                        packages: ed.packages.map((x, j) => j===i ? { ...x, name:e.target.value } : x) }))}
                      style={{ ...F, height:36, flex:1, fontWeight:700 }} />
                    <input type="number" min="0" value={p.price} placeholder="Price"
                      onChange={e => setEditing(ed => ({ ...ed,
                        packages: ed.packages.map((x, j) => j===i ? { ...x, price:e.target.value } : x) }))}
                      style={{ ...F, height:36, width:100 }} />
                    <button onClick={() => setEditing(ed => ({ ...ed,
                        packages: ed.packages.filter((_, j) => j !== i) }))}
                      className="btn"
                      style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #FCA5A5",
                               background:"#FEF2F2", color:"#B91C1C", fontSize:11, fontWeight:700 }}>✕</button>
                  </div>
                  <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:6 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:C.midGray, whiteSpace:"nowrap" }}>⏱ Time</span>
                    <select value={p.hours == null ? "" : p.hours}
                      onChange={e => setEditing(ed => ({ ...ed,
                        packages: ed.packages.map((x, j) => j===i ? { ...x, hours:e.target.value } : x) }))}
                      style={{ ...F, height:34, flex:1 }}>
                      <option value="">{TIMED_CATEGORIES.includes(editing.category) ? "Choose how long…" : "Not time-based"}</option>
                      {[1,1.5,2,2.5,3,4,5,6,7,8,10,12,24,48,72,168].map(h => <option key={h} value={h}>{fmtHours(h)}</option>)}
                    </select>
                  </div>
                  <label style={{ display:"block", fontSize:10.5, fontWeight:700, color:C.midGray, margin:"7px 0 3px" }}>
                    What's included
                  </label>
                  <textarea value={p.description} rows={2}
                    placeholder="e.g. DJ, sound system for 150 guests, 2 wireless mics, basic lighting"
                    onChange={e => setEditing(ed => ({ ...ed,
                      packages: ed.packages.map((x, j) => j===i ? { ...x, description:e.target.value } : x) }))}
                    style={{ ...F, height:"auto", padding:"8px 10px", resize:"vertical", fontFamily:"inherit", fontSize:12 }} />
                  <label style={{ display:"block", fontSize:10.5, fontWeight:700, color:"#92400E", margin:"7px 0 3px" }}>
                    Requirements / notes for the host <span style={{ fontWeight:500, color:C.lightGray }}>(optional)</span>
                  </label>
                  <textarea value={p.requirements || ""} rows={2}
                    placeholder="e.g. Needs a standard outlet within 50 ft, a 10×10 ft flat area, and parking for a 20 ft truck"
                    onChange={e => setEditing(ed => ({ ...ed,
                      packages: ed.packages.map((x, j) => j===i ? { ...x, requirements:e.target.value } : x) }))}
                    style={{ ...F, height:"auto", padding:"8px 10px", resize:"vertical", fontFamily:"inherit", fontSize:12,
                             background:"#FFFBEB", borderColor:"#FCD34D" }} />
                  {!priced && (
                    <p style={{ margin:"6px 0 0", fontSize:10.5, color:"#B45309", fontWeight:600 }}>
                      ⚠ Hidden from customers — add a price to show this option.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add-ons — optional extras a customer can add on top of the booking */}
          <div style={{ marginTop:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <p style={{ margin:0, fontSize:12, fontWeight:800, color:C.black }}>Add-ons (optional extras)</p>
                <p style={{ margin:"2px 0 0", fontSize:10.5, color:C.lightGray }}>
                  Extras customers can add on top — e.g. "Fog machine +$100". Not separate listings.
                </p>
              </div>
              {(editing.addons || []).length < 8 && (
                <button type="button" onClick={() => setEditing(e => ({ ...e,
                    addons: [...(e.addons || []), { name:"", price:"" }] }))}
                  className="btn"
                  style={{ padding:"6px 11px", borderRadius:8, border:`1px solid ${C.orange}`,
                           background:"#FFF7ED", color:C.orange, fontSize:11.5, fontWeight:700 }}>
                  + Add add-on
                </button>
              )}
            </div>
            {(editing.addons || []).map((a, i) => (
              <div key={i} style={{ display:"flex", gap:6, alignItems:"center", marginTop:8 }}>
                <input value={a.name} placeholder={`Add-on ${i+1} (e.g. Extra hour)`}
                  onChange={e => setEditing(ed => ({ ...ed,
                    addons: ed.addons.map((x, j) => j===i ? { ...x, name:e.target.value } : x) }))}
                  style={{ ...F, height:36, flex:1 }} />
                <span style={{ fontSize:13, color:C.midGray }}>+$</span>
                <input type="number" min="0" value={a.price} placeholder="0"
                  onChange={e => setEditing(ed => ({ ...ed,
                    addons: ed.addons.map((x, j) => j===i ? { ...x, price:e.target.value } : x) }))}
                  style={{ ...F, height:36, width:90 }} />
                <button onClick={() => setEditing(ed => ({ ...ed,
                    addons: ed.addons.filter((_, j) => j !== i) }))}
                  className="btn"
                  style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #FCA5A5",
                           background:"#FEF2F2", color:"#B91C1C", fontSize:11, fontWeight:700 }}>✕</button>
              </div>
            ))}
          </div>


          {/* Same promise the vendor made at sign-up, repeated where each post
              is made (Terms: "Vendors: you are responsible for what you post"). */}
          <p style={{ margin:"12px 0 0", fontSize:11, color:C.midGray, lineHeight:1.55 }}>
            By saving, you confirm this listing is true and accurate, that the photos are your own
            work, that you can deliver it as described, and that you're responsible for it.
          </p>
          {err && (
            <div ref={formErrRef} role="alert"
              style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", color:"#B91C1C",
                       borderRadius:9, padding:"9px 12px", marginTop:10, fontSize:12, fontWeight:600, lineHeight:1.5 }}>
              ⚠ {err}{errField ? " The field is highlighted in red above." : ""}
              {/legal information/i.test(err) && onOpenBusiness && (
                <div style={{ marginTop:8 }}>
                  <button type="button" onClick={onOpenBusiness} className="btn"
                    style={{ padding:"7px 14px", borderRadius:8, border:"none", background:C.black, color:"#fff",
                             fontSize:12, fontWeight:700 }}>
                    Open Business details
                  </button>
                </div>
              )}
            </div>
          )}
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <button onClick={save} disabled={busy || uploading} className="btn"
              style={{ flex:1, padding:"10px 0", borderRadius:10, border:"none",
                       background: busy ? "#F3F4F6" : C.orange, color: busy ? C.midGray : "#fff",
                       fontSize:13, fontWeight:700 }}>
              {busy ? "Saving…" : "Save service"}
            </button>
            <button onClick={() => { setEditing(null); setErr(""); setErrField(null); }} className="btn"
              style={{ flex:1, padding:"10px 0", borderRadius:10, border:"none",
                       background:"#F3F4F6", color:C.midGray, fontSize:13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VendorInquiries({ vendorId }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoad]  = useState(true);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [err, setErr]       = useState("");

  const load = React.useCallback(() => {
    setLoad(true);
    getVendorInquiries(vendorId).then(list => { setItems(list); setLoad(false); });
  }, [vendorId]);
  useEffect(() => { load(); }, [load]);

  async function send(id) {
    const text = (drafts[id] || "").trim();
    if (!text) return;
    setBusyId(id); setErr("");
    const res = await replyToInquiry(id, text);
    setBusyId(null);
    if (!res.ok) { setErr(res.error); return; }
    setDrafts(d => ({ ...d, [id]: "" }));
    load();
  }

  return (
    <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px" }}>
      <h3 style={{ margin:"0 0 4px", fontSize:14, fontWeight:800 }}>Inquiries</h3>
      <p style={{ margin:"0 0 12px", fontSize:12, color:C.midGray }}>
        Questions from customers about your listings. Replying notifies them.
      </p>
      {err && (
        <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", color:"#B91C1C",
                      borderRadius:9, padding:"9px 12px", marginBottom:12, fontSize:12, fontWeight:600 }}>⚠ {err}</div>
      )}
      {loading ? (
        <p style={{ fontSize:13, color:C.midGray, margin:0 }}>Loading inquiries…</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize:13, color:C.midGray, margin:0 }}>No inquiries yet.</p>
      ) : items.map(q => (
        <div key={q.id} style={{ borderTop:`1px solid ${C.border}`, padding:"12px 0" }}>
          <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
            <p style={{ margin:0, fontSize:13, fontWeight:800 }}>
              👤 {q.userName}{q.serviceName ? <span style={{ color:C.midGray, fontWeight:600 }}> · about {q.serviceName}</span> : null}
            </p>
            <span style={{ fontSize:10.5, color:C.lightGray }}>
              {new Date(q.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p style={{ margin:"6px 0 0", fontSize:12.5, color:"#444", fontStyle:"italic", lineHeight:1.5 }}>
            “{q.body}”
          </p>
          {q.reply ? (
            <div style={{ marginTop:8, background:"#F0FDF4", border:"1px solid #BBF7D0",
                          borderRadius:10, padding:"9px 12px" }}>
              <p style={{ margin:0, fontSize:10.5, fontWeight:800, color:C.green,
                          textTransform:"uppercase", letterSpacing:"0.04em" }}>✓ Your reply</p>
              <p style={{ margin:"3px 0 0", fontSize:12.5, color:"#166534", lineHeight:1.5 }}>{q.reply}</p>
            </div>
          ) : (
            <div style={{ display:"flex", gap:8, marginTop:9 }}>
              <input value={drafts[q.id] || ""} onChange={e => setDrafts(d => ({ ...d, [q.id]: e.target.value }))}
                placeholder="Write your reply…"
                style={{ flex:1, height:38, padding:"0 11px", border:`1px solid ${C.border}`,
                         borderRadius:9, fontSize:12.5, background:"#fff" }} />
              <button onClick={() => send(q.id)} disabled={busyId === q.id} className="btn"
                style={{ padding:"0 16px", borderRadius:9, background:C.orange, color:"#fff",
                         border:"none", fontSize:12.5, fontWeight:700 }}>
                {busyId === q.id ? "Sending…" : "Reply"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function VendorDashboard({ user, onLogout }) {
  const [tab,      setTab]      = useState("overview");
  const [reqView,  setReqView]  = useState("list");   // 'list' | 'calendar'
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [listing,  setListing]  = useState(null);
  const [notifs,   setNotifs]   = useState([]);
  const [editing,  setEditing]  = useState(false);
  const [busyId,   setBusyId]   = useState(null);
  const [err,      setErr]      = useState("");
  /* Reviews written ABOUT this vendor. The rating tile used to be the only
     mention of them anywhere in the dashboard, and it linked to Requests — so
     a vendor could see they had 5.0 stars and had no way to read why. */
  const [revs,     setRevs]     = useState([]);
  /* How many listings this vendor has. Drives step 2 of the setup checklist. */
  const [svcCount, setSvcCount] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  /* Account settings. Vendors had no way to leave: deactivate and delete lived
     only in the customer panel, which a vendor account never opens. Same two
     RPCs, which already clear vendor_profiles and vendor_services, so a vendor
     who leaves does not strand live listings on the marketplace. */
  const [acctBusy,      setAcctBusy]      = useState(false);
  const [acctErr,       setAcctErr]       = useState("");
  const [confirmAction, setConfirmAction] = useState(null);  // null | "deactivate" | "delete"

  async function doDeactivate() {
    setAcctBusy(true); setAcctErr("");
    const { error } = await sb.rpc("deactivate_my_account");
    setAcctBusy(false);
    if (error) { setConfirmAction(null); setAcctErr(error.message || "Could not deactivate your account."); return; }
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

  const reload = React.useCallback(async (opts) => {
    /* quiet: background re-checks must not flash the loading state. */
    if (!(opts && opts.quiet)) setLoading(true);
    const [r, l, n, rv, sv] = await Promise.all([
      RLS.getMyRequests(user).catch(()=>[]),
      getMyListing(user.id).catch(()=>null),
      getNotifs(user.id).catch(()=>[]),
      getReviewsAbout(user.id).catch(()=>[]),
      getMyServices(user.id).catch(()=>[]),
    ]);
    setSvcCount(Array.isArray(sv) ? sv.length : 0);
    setRequests(Array.isArray(r) ? r : []);
    setListing(l);
    setNotifs(Array.isArray(n) ? n : []);
    setRevs(Array.isArray(rv) ? rv : []);
    setLoading(false);
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  /* Approval happens in someone else's browser. Without this the vendor kept
     seeing "under review" until they happened to reload the page, so an
     approval looked like it had not happened. Re-check when they come back to
     the tab, and once a minute while they are still waiting. */
  const waitingForApproval = (listing?.verification_status || user.status) !== "approved";
  useEffect(() => {
    const onFocus = () => reload({ quiet: true });
    window.addEventListener("focus", onFocus);
    const t = waitingForApproval ? setInterval(() => reload({ quiet: true }), 60000) : null;
    return () => { window.removeEventListener("focus", onFocus); if (t) clearInterval(t); };
  }, [reload, waitingForApproval]);

  async function respond(reqId, status, extra = {}) {
    setBusyId(reqId); setErr("");
    const updated = await RLS.respondToRequest(reqId, status, "", user, extra);
    setBusyId(null);
    if (!updated || updated.__error) {
      setErr((updated && updated.__error)
        ? `Could not update: ${String(updated.__error).replace(/^.*?ERROR:\s*/, "")}`
        : "Could not update that request. Check the browser console for details.");
      return;
    }
    reload();
  }
  /* Total price typed when confirming with payments on, per request. */
  const [priceDraft, setPriceDraft] = useState({});

  const pending   = requests.filter(r => r.status === "pending");
  const confirmed = requests.filter(r => r.status === "confirmed");
  const declined  = requests.filter(r => r.status === "declined");
  const isApproved = (listing?.verification_status || user.status) === "approved";
  const unread = notifs.filter(n => !n.read).length;

  /* The three things a new vendor has to do, in order. Business details are
     what PLUJ approves; a listing is what hosts book. */
  const legalDone   = !!(listing?.biz_legal && listing?.biz_type && String(listing?.ein || "").replace(/\D/g, "").length === 9 &&
                         listing?.managing_members && listing?.biz_address && listing?.biz_state &&
                         (listing?.biz_license || listing?.license_not_required));
  const detailsDone = !!(listing?.business_name && listing?.description && listing?.biz_phone &&
                         listing?.biz_city && listing?.biz_zip && listing?.service_areas) && legalDone;
  const hasListing  = (svcCount || 0) > 0;
  const setupDone   = detailsDone && hasListing && isApproved;

  const Metric = ({ label, value, sub, accent }) => (
    <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14,
                  padding:"14px 16px", flex:"1 1 130px", minWidth:130 }}>
      <p style={{ margin:0, fontSize:10, fontWeight:800, color:C.midGray, letterSpacing:"0.05em" }}>{label}</p>
      <p style={{ margin:"4px 0 0", fontSize:24, fontWeight:800, color: accent || C.black }}>{value}</p>
      {sub && <p style={{ margin:"2px 0 0", fontSize:11, color:C.lightGray }}>{sub}</p>}
    </div>
  );

  const TABS = [["overview","Overview"],["requests","Requests"],["inquiries","Messages"],
                ["listings","My listings"],["business","Business profile"],
                ["reviews","Reviews"],["calendar","Availability"],["notifs","Notifications"],
                ["account","Account settings"]];

  return (
    <div className="pluj" style={{ minHeight:"100vh", background:"#F7F8FA" }}>
      <style>{GLOBAL_CSS}</style>
      {showGuide && <InfoPageModal page="Vendor guide" onClose={()=>setShowGuide(false)} />}

      {/* Vendor header — no marketplace nav, no other vendors */}
      <div style={{ background:"#fff", borderBottom:`1px solid ${C.border}`,
                    padding:"12px 20px", display:"flex", alignItems:"center",
                    justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={() => window.location.reload()} className="btn" title="Refresh"
            style={{ border:"none", background:"none", padding:0, cursor:"pointer", display:"flex", alignItems:"center" }}>
            <PlujMark size={26} />
          </button>
          <span style={{ fontSize:12, fontWeight:800, background:C.black, color:"#fff",
                         padding:"3px 9px", borderRadius:99 }}>VENDOR</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:13, fontWeight:700 }}>
            {listing?.business_name || user.name || "My business"}
          </span>
          <button onClick={()=>setShowGuide(true)} className="btn"
            style={{ border:`1px solid ${C.border}`, background:"#fff", borderRadius:9,
                     padding:"6px 12px", fontSize:12, fontWeight:700, color:C.black }}>
            📘 Vendor guide
          </button>
          <button onClick={onLogout} className="btn"
            style={{ border:`1px solid ${C.border}`, background:"#fff", borderRadius:9,
                     padding:"6px 12px", fontSize:12, fontWeight:700, color:C.midGray }}>
            Log out
          </button>
        </div>
      </div>

      <div style={{ maxWidth:1000, margin:"0 auto", padding:"18px 16px 60px" }}>

        {/* Stripe payouts (only while PLUJ payments are switched on) */}
        <VendorPayoutsCard user={user} />

        {/* SETUP CHECKLIST — shown until the vendor is approved and has a
            listing. Replaces two banners that each described a different
            "Step 2", and a "Complete my listing" button that opened the
            business editor rather than a listing. */}
        {svcCount !== null && !setupDone && (
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14,
                        padding:"16px 18px", marginBottom:14 }}>
            <p style={{ margin:0, fontSize:15, fontWeight:800 }}>Get your business live on PLUJ</p>
            <p style={{ margin:"3px 0 12px", fontSize:12, color:C.midGray }}>
              Three steps. Your listings go live as soon as step 3 is done.{" "}
              <span onClick={()=>setShowGuide(true)} style={{ color:C.orange, fontWeight:700, cursor:"pointer" }}>
                Read the vendor guide
              </span>
            </p>
            {[
              { done: detailsDone, n: 1, title: "Add your business details and legal information",
                text: "Name, a short description, phone, where you work, and your legal information (legal name, business type, EIN, address, owners, license). Required before you can post a listing.",
                cta: "Add business details", go: () => setEditing(true) },
              { done: hasListing, n: 2, title: "Create your first listing",
                text: "One listing per service you offer — a DJ set, a taco truck, a venue. Each has its own price, photos and availability.",
                cta: "Create a listing", go: () => setTab("listings") },
              { done: isApproved, n: 3, title: "PLUJ approves your business",
                text: isApproved ? "Approved — you're live." :
                      detailsDone ? "We're reviewing your details, usually within 1–2 business days. You'll get a notification here." :
                                    "Starts once your business details are in.",
                cta: null },
            ].map(st => (
              <div key={st.n} style={{ display:"flex", gap:12, alignItems:"flex-start",
                                       padding:"10px 0", borderTop:`1px solid ${C.border}` }}>
                <span style={{ width:26, height:26, borderRadius:99, flexShrink:0, display:"flex",
                               alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800,
                               background: st.done ? C.green : "#F3F4F6", color: st.done ? "#fff" : C.midGray }}>
                  {st.done ? "✓" : st.n}
                </span>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:800,
                              color: st.done ? C.midGray : C.black,
                              textDecoration: st.done ? "line-through" : "none" }}>{st.title}</p>
                  <p style={{ margin:"2px 0 0", fontSize:12, color:C.midGray, lineHeight:1.5 }}>{st.text}</p>
                </div>
                {!st.done && st.cta && (
                  <button onClick={st.go} className="btn"
                    style={{ background:C.orange, color:"#fff", border:"none", borderRadius:9,
                             padding:"8px 13px", fontSize:12, fontWeight:800, whiteSpace:"nowrap" }}>
                    {st.cta}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {err && (
          <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", color:"#B91C1C",
                        borderRadius:10, padding:"10px 12px", marginBottom:14, fontSize:12, fontWeight:600 }}>
            ⚠ {err}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
          {TABS.map(([k,l]) => (
            <button key={k} onClick={()=>setTab(k)} className="btn"
              style={{ padding:"7px 14px", borderRadius:99, fontSize:12, fontWeight:700,
                       border:`1px solid ${tab===k?C.black:C.border}`,
                       background: tab===k ? C.black : "#fff",
                       color: tab===k ? "#fff" : C.midGray }}>
              {l}{k==="requests" && pending.length ? ` (${pending.length})` : ""}
              {k==="notifs" && unread ? ` (${unread})` : ""}
            </button>
          ))}
        </div>

        {loading ? <p style={{ fontSize:13, color:C.midGray }}>Loading your dashboard…</p> : (
        <>
          {/* OVERVIEW */}
          {tab === "overview" && (
            <>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
                <div onClick={()=>setTab("requests")} style={{ cursor:"pointer", flex:"1 1 140px" }} title="View requests">
                  <Metric label="NEW REQUESTS" value={pending.length} sub="tap to review" accent={C.orange} />
                </div>
                <div onClick={()=>setTab("requests")} style={{ cursor:"pointer", flex:"1 1 140px" }} title="View confirmed bookings">
                  <Metric label="CONFIRMED"    value={confirmed.length} sub="tap to view" accent={C.green} />
                </div>
                <div onClick={()=>setTab("requests")} style={{ cursor:"pointer", flex:"1 1 140px" }} title="View declined">
                  <Metric label="DECLINED"     value={declined.length} sub="tap to view" />
                </div>
                <div onClick={()=>setTab("reviews")} style={{ cursor:"pointer", flex:"1 1 140px" }} title="Read your reviews">
                  <Metric label="RATING"       value={listing?.rating ? Number(listing.rating).toFixed(1) : "—"}
                    sub={revs.length ? `read ${revs.length} review${revs.length===1?"":"s"}` : "from reviews"} accent="#F59E0B" />
                </div>
                <div onClick={()=>setTab("listings")} style={{ cursor:"pointer", flex:"1 1 140px" }} title="Your listings">
                  <Metric label="LISTINGS"     value={svcCount ?? "—"} sub="tap to manage" />
                </div>
              </div>

              <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px" }}>
                <h3 style={{ margin:"0 0 10px", fontSize:14, fontWeight:800 }}>Latest requests</h3>
                {pending.length === 0 ? (
                  <p style={{ fontSize:13, color:C.midGray, margin:0 }}>
                    No new requests right now. Customers who match your service area and capacity will appear here.
                  </p>
                ) : pending.slice(0,3).map(r => (
                  <div key={r.id} style={{ borderTop:`1px solid ${C.border}`, padding:"10px 0" }}>
                    <p style={{ margin:0, fontSize:13, fontWeight:700 }}>
                      {r.eventType || "Event"} · {r.guests || "?"} guests
                    </p>
                    <p style={{ margin:"2px 0 0", fontSize:12, color:C.midGray }}>
                      {r.eventDate || "Date TBD"} · {r.venue || "Venue TBD"}
                    </p>
                  </div>
                ))}
                {pending.length > 0 && (
                  <button onClick={()=>setTab("requests")} className="btn"
                    style={{ marginTop:10, background:C.black, color:"#fff", border:"none",
                             borderRadius:9, padding:"8px 14px", fontSize:12, fontWeight:700 }}>
                    Review all requests
                  </button>
                )}
              </div>
            </>
          )}

          {/* INQUIRIES — customer questions + vendor replies */}
          {tab === "inquiries" && (
            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px" }}>
              <h3 style={{ margin:"0 0 4px", fontSize:14, fontWeight:800 }}>Messages</h3>
              <p style={{ margin:"0 0 12px", fontSize:12, color:C.midGray }}>
                Talk with customers about their events. Threads stay open until 3 days after the event.
              </p>
              <MessagesPanel user={user} />
            </div>
          )}

          {/* REQUESTS — approve / decline */}
          {tab === "requests" && (
            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px" }}>
              <h3 style={{ margin:"0 0 4px", fontSize:14, fontWeight:800 }}>Booking requests</h3>
              <p style={{ margin:"0 0 12px", fontSize:12, color:C.midGray }}>
                You decide every booking — a request is only confirmed when you approve it.
              </p>
              <div style={{ display:"flex", gap:6, marginBottom:14, background:"#F3F4F6", borderRadius:10, padding:3, maxWidth:280 }}>
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
                <EventsCalendar bookings={requests} role="vendor" />
              ) : requests.length === 0 ? (
                <p style={{ fontSize:13, color:C.midGray, margin:0 }}>No requests yet.</p>
              ) : requests.map(r => (
                <div key={r.id} style={{ borderTop:`1px solid ${C.border}`, padding:"14px 0" }}>
                  {/* Header: what service + status */}
                  <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap", marginBottom:8 }}>
                    <div style={{ flex:1, minWidth:200 }}>
                      <p style={{ margin:0, fontSize:14, fontWeight:800 }}>
                        🛎️ {r.serviceName || r.eventType || "Service request"}
                        {r.packageName ? <span style={{ color:C.midGray, fontWeight:600 }}> · {r.packageName}</span> : null}
                      </p>
                      <p style={{ margin:"3px 0 0", fontSize:10, color:C.lightGray, fontFamily:"monospace" }}>
                        Request {r.id}
                      </p>
                    </div>
                    <span style={{ alignSelf:"flex-start", padding:"4px 11px", borderRadius:99,
                                   fontSize:11, fontWeight:800,
                                   background: isConfirmedStatus(r.status) ? C.greenSoft : isDeclinedStatus(r.status) ? "#FEF2F2" : isCancelledStatus(r.status) ? "#F3F4F6" : "#FFFBEB",
                                   color: isConfirmedStatus(r.status) ? C.green : isDeclinedStatus(r.status) ? "#EF4444" : isCancelledStatus(r.status) ? C.midGray : "#D97706" }}>
                      {isConfirmedStatus(r.status) ? "✓ Confirmed" : isDeclinedStatus(r.status) ? "✗ Declined"
                        : isCancelledStatus(r.status) ? "Cancelled" : "⏳ Pending — awaiting your response"}
                    </span>
                  </div>

                  {/* Full detail grid */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))", gap:"8px 16px",
                                background:"#F9FAFB", border:`1px solid ${C.border}`, borderRadius:11, padding:"12px 14px" }}>
                    {[
                      ["👤 Requested by", r.userName || "Host"],
                      ["🎉 Event type",   r.eventType || "—"],
                      ["📅 Date",         r.eventDate || "TBD"],
                      ["🕐 Time",         fmtTimeRange(r.startTime, r.endTime) || "TBD"],
                      ["👥 Guests",       r.guests || "—"],
                      ["📍 Location",     formatEventLocation(r) || r.venue || "TBD"],
                      ...(r.venueType ? [["🏛️ Venue type", r.venueType]] : []),
                    ].map(([label, val]) => (
                      <div key={label}>
                        <p style={{ margin:0, fontSize:10, fontWeight:700, color:C.lightGray, textTransform:"uppercase", letterSpacing:"0.04em" }}>{label}</p>
                        <p style={{ margin:"1px 0 0", fontSize:12.5, fontWeight:600, color:C.black, wordBreak:"break-word" }}>{val}</p>
                      </div>
                    ))}
                  </div>

                  {/* How to find / access the place */}
                  {r.accessInstructions && (
                    <div style={{ marginTop:8, background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:10, padding:"9px 12px" }}>
                      <p style={{ margin:0, fontSize:10, fontWeight:800, color:"#92400E", textTransform:"uppercase", letterSpacing:"0.04em" }}>🗺️ How to find & access</p>
                      <p style={{ margin:"2px 0 0", fontSize:12.5, color:"#78350F", lineHeight:1.5 }}>{r.accessInstructions}</p>
                    </div>
                  )}

                  {/* Customer message */}
                  {r.message && (
                    <p style={{ margin:"8px 0 0", fontSize:12.5, color:"#444", fontStyle:"italic", lineHeight:1.5 }}>
                      💬 “{r.message}”
                    </p>
                  )}

                  {/* Payment schedule and problem reports (payments on) */}
                  <BookingPayments req={r} user={user} />

                  {r.status === "pending" && (
                    <ConfirmPriceField req={r} value={priceDraft[r.id] ?? ""}
                      onChange={v => setPriceDraft(d => ({ ...d, [r.id]: v }))} />
                  )}
                  {r.status === "pending" && (
                    <div style={{ display:"flex", gap:8, marginTop:12 }}>
                      <button onClick={()=>{
                          const pp = confirmPricePayload(r, priceDraft[r.id]);
                          if (pp.error) { setErr(pp.error); return; }
                          respond(r.id, "confirmed", pp.extra);
                        }} disabled={busyId===r.id} className="btn"
                        style={{ flex:1, padding:"9px 0", borderRadius:9, background:C.green,
                                 color:"#fff", border:"none", fontSize:12, fontWeight:700 }}>
                        ✓ Accept booking
                      </button>
                      <button onClick={()=>respond(r.id,"declined")} disabled={busyId===r.id} className="btn"
                        style={{ flex:1, padding:"9px 0", borderRadius:9, background:"#FEF2F2",
                                 color:"#EF4444", border:"1px solid #FCA5A5", fontSize:12, fontWeight:700 }}>
                        ✗ Decline
                      </button>
                    </div>
                  )}
                  {isConfirmedStatus(r.status) && (
                    <div style={{ display:"flex", gap:8, marginTop:12 }}>
                      <button onClick={()=>{
                          const when = r.eventDate ? new Date(`${r.eventDate}T${r.startTime || "00:00"}:00`) : null;
                          const hrs = when && !isNaN(when.getTime()) ? (when.getTime() - Date.now())/3600000 : null;
                          const soon = hrs != null && hrs < 48;
                          const msg = soon
                            ? "Cancel this confirmed booking?\n\n⚠️ The event is less than 48 hours away. The customer will be refunded in full and we'll help them find a replacement. Late vendor cancellations affect your standing on PLUJ."
                            : "Cancel this confirmed booking?\n\nThe customer will be refunded in full and notified so they can rebook.";
                          if (window.confirm(msg)) respond(r.id, "cancelled");
                        }}
                        disabled={busyId===r.id} className="btn"
                        style={{ padding:"8px 16px", borderRadius:9, background:"#FEF2F2",
                                 color:"#EF4444", border:"1px solid #FCA5A5", fontSize:12, fontWeight:700 }}>
                        Cancel this booking
                      </button>
                    </div>
                  )}
                  {isConfirmedStatus(r.status) && isRealId(r.userId) && (
                    <CustomerRating vendorId={user.id} customerId={r.userId}
                      customerName={r.userName || "the customer"} bookingId={r.id} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* MY LISTINGS — what you sell. Each listing has its own service,
              description, price, capacity, photos and availability. */}
          {tab === "listings" && (
            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px" }}>
              <h3 style={{ margin:"0 0 4px", fontSize:14, fontWeight:800 }}>My listings</h3>
              <p style={{ margin:"0 0 12px", fontSize:12, color:C.midGray, lineHeight:1.55 }}>
                A listing is one service hosts can book. Offer a DJ set and a photo booth? That's two
                listings — each with its own price, photos and availability.
                {!isApproved && " They go live when PLUJ approves your business."}
              </p>
              <ServicesManager vendorId={user.id} onOpenBusiness={() => setEditing(true)} legalKey={listing} />
            </div>
          )}

          {/* BUSINESS PROFILE — who you are. Nothing here repeats a listing field. */}
          {tab === "business" && (
            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, gap:10 }}>
                <div>
                  <h3 style={{ margin:0, fontSize:14, fontWeight:800 }}>Business profile</h3>
                  <p style={{ margin:"2px 0 0", fontSize:12, color:C.midGray }}>Who you are. Your listings say what you sell.</p>
                </div>
                <button onClick={()=>setEditing(true)} className="btn"
                  style={{ background:C.black, color:"#fff", border:"none", borderRadius:9,
                           padding:"8px 14px", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>
                  Edit business details
                </button>
              </div>
              {(listing?.photos || []).length > 0 && (
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                  {listing.photos.slice(0,6).map((u,i)=>(
                    <img key={i} src={u} alt={"Business photo " + (i+1)}
                      style={{ width:84, height:84, objectFit:"cover", borderRadius:9,
                               border:`1px solid ${C.border}` }} />
                  ))}
                </div>
              )}
              {[["Business name", listing?.business_name, true],
                ["About", listing?.description, true],
                ["Business phone", listing?.biz_phone, true],
                ["City / ZIP", [listing?.biz_city, listing?.biz_zip].filter(Boolean).join(" ") || null, true],
                ["Where you work", listing?.service_areas, true],
                ["Years in business", listing?.years_in_biz, false],
                ["Legal business name", listing?.biz_legal, false],
                ["License / permit", listing?.biz_license, false],
                ["Website", listing?.biz_website, false],
              ].map(([k,v,req]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:12,
                                      padding:"8px 0", borderTop:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12, color:C.midGray, fontWeight:600 }}>{k}</span>
                  <span style={{ fontSize:12, fontWeight:700, textAlign:"right", maxWidth:360 }}>
                    {(v || v === 0) ? v : (req
                      ? <span style={{ color:"#DC2626" }}>Needed</span>
                      : <span style={{ color:C.lightGray, fontWeight:500 }}>—</span>)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ACCOUNT SETTINGS — the only place these two live, deliberately.
              Neither runs straight off its button: each opens the dialog below,
              which spells out what is about to happen and asks a second time. */}
          {tab === "account" && (
            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px" }}>
              <h3 style={{ margin:"0 0 4px", fontSize:14, fontWeight:800 }}>Account settings</h3>
              <p style={{ margin:"0 0 14px", fontSize:12, color:C.midGray }}>
                Pause your business or close it down for good.
              </p>

              {acctErr && (
                <p style={{ margin:"0 0 12px", fontSize:12, color:"#B91C1C", fontWeight:600 }}>{acctErr}</p>
              )}

              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:14 }}>
                <p style={{ margin:0, fontSize:13, fontWeight:800 }}>Deactivate my account</p>
                <p style={{ margin:"3px 0 9px", fontSize:11.5, color:C.midGray, lineHeight:1.6 }}>
                  Your listings come off the marketplace and customers can no longer find or book you.
                  Nothing is deleted — log back in any time to pick up where you left off.
                </p>
                <button type="button" onClick={() => { setAcctErr(""); setConfirmAction("deactivate"); }}
                  disabled={acctBusy} className="btn"
                  style={{ background:"#fff", color:C.black, border:`1.5px solid ${C.border}`,
                           borderRadius:10, padding:"9px 16px", fontSize:12.5, fontWeight:700,
                           cursor: acctBusy ? "default" : "pointer" }}>
                  Deactivate account
                </button>
              </div>

              <div style={{ borderTop:`1px solid ${C.border}`, marginTop:16, paddingTop:14 }}>
                <p style={{ margin:0, fontSize:13, fontWeight:800, color:"#B91C1C" }}>Delete my account</p>
                <p style={{ margin:"3px 0 9px", fontSize:11.5, color:C.midGray, lineHeight:1.6 }}>
                  Permanent. Your business profile, every listing, your photos and your booking history
                  are removed and cannot be recovered.
                </p>
                <button type="button" onClick={() => { setAcctErr(""); setConfirmAction("delete"); }}
                  disabled={acctBusy} className="btn"
                  style={{ background:"#B91C1C", color:"#fff", border:"none",
                           borderRadius:10, padding:"9px 16px", fontSize:12.5, fontWeight:700,
                           cursor: acctBusy ? "default" : "pointer" }}>
                  Delete account
                </button>
              </div>

              {/* Confirmation. Deliberately not window.confirm: that cannot say
                  what is about to happen in any detail and reads like a scam
                  prompt. */}
              {confirmAction && (() => {
                const isDelete = confirmAction === "delete";
                return (
                  <div role="dialog" aria-modal="true"
                    style={{ position:"fixed", inset:0, zIndex:900, background:"rgba(0,0,0,0.45)",
                             display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
                    onClick={() => !acctBusy && setConfirmAction(null)}>
                    <div onClick={(e) => e.stopPropagation()}
                      style={{ background:"#fff", borderRadius:16, maxWidth:430, width:"100%",
                               padding:"20px 22px", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
                      <p style={{ margin:0, fontSize:16, fontWeight:800,
                                  color: isDelete ? "#B91C1C" : C.black }}>
                        {isDelete ? "Delete your account for good?" : "Deactivate your account?"}
                      </p>
                      <p style={{ margin:"9px 0 0", fontSize:12.5, color:C.midGray, lineHeight:1.65 }}>
                        {isDelete
                          ? "This cannot be undone. Your business profile, all of your listings and photos, and your booking history will be permanently deleted. Customers with a confirmed booking will lose the record of it."
                          : "Your listings will be hidden from the marketplace straight away and customers will not be able to book you. Your data is kept, and logging back in reactivates everything."}
                      </p>
                      <p style={{ margin:"12px 0 0", fontSize:12, color:C.midGray }}>
                        You will be signed out {isDelete ? "immediately." : "and can return whenever you like."}
                      </p>
                      <div style={{ display:"flex", gap:8, marginTop:18, justifyContent:"flex-end" }}>
                        <button type="button" onClick={() => setConfirmAction(null)} disabled={acctBusy}
                          className="btn"
                          style={{ background:"#F3F4F6", color:C.black, border:"none", borderRadius:10,
                                   padding:"10px 16px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                          Keep my account
                        </button>
                        <button type="button" onClick={isDelete ? doDeleteAccount : doDeactivate}
                          disabled={acctBusy} className="btn"
                          style={{ background: isDelete ? "#B91C1C" : C.black, color:"#fff", border:"none",
                                   borderRadius:10, padding:"10px 16px", fontSize:13, fontWeight:700,
                                   opacity: acctBusy ? 0.6 : 1, cursor: acctBusy ? "default" : "pointer" }}>
                          {acctBusy ? "Working…" : isDelete ? "Yes, delete everything" : "Yes, deactivate"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* REVIEWS RECEIVED */}
          {tab === "reviews" && (
            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px" }}>
              <h3 style={{ margin:"0 0 4px", fontSize:14, fontWeight:800 }}>Reviews you have received</h3>
              <p style={{ margin:"0 0 14px", fontSize:12, color:C.midGray }}>
                Written by customers after a confirmed booking. You can reply to any of them from your
                public profile page.
              </p>

              {revs.length === 0 ? (
                <p style={{ fontSize:13, color:C.midGray, margin:0 }}>
                  No reviews yet. They appear here once a customer reviews a completed booking.
                </p>
              ) : (
                <>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14,
                                paddingBottom:14, borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:30, fontWeight:800, fontFamily:"'Playfair Display', serif" }}>
                      {(revs.reduce((a,r)=>a+(Number(r.rating)||0),0) / revs.length).toFixed(1)}
                    </span>
                    <div>
                      <Stars r={Math.round(revs.reduce((a,r)=>a+(Number(r.rating)||0),0) / revs.length)} size={14} />
                      <p style={{ margin:"2px 0 0", fontSize:11, color:C.midGray }}>
                        {revs.length} review{revs.length===1?"":"s"}
                      </p>
                    </div>
                  </div>

                  {revs.map(r => (
                    <div key={r.id} style={{ borderTop:`1px solid ${C.border}`, padding:"12px 0" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <Stars r={r.rating} size={13} />
                          <span style={{ fontSize:12, fontWeight:700 }}>
                            {r.authorName || "Verified customer"}
                          </span>
                        </div>
                        <span style={{ fontSize:10.5, color:C.lightGray }}>
                          {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}
                        </span>
                      </div>
                      {r.body && (
                        <p style={{ margin:"6px 0 0", fontSize:13, color:C.midGray, lineHeight:1.65 }}>{r.body}</p>
                      )}
                      {r.reply && (
                        <div style={{ marginTop:8, marginLeft:12, paddingLeft:12,
                                      borderLeft:`2px solid ${C.border}` }}>
                          <p style={{ margin:0, fontSize:10.5, fontWeight:800, color:C.orange }}>Your reply</p>
                          <p style={{ margin:"2px 0 0", fontSize:12.5, color:C.midGray, lineHeight:1.6 }}>{r.reply}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* AVAILABILITY — dates only. The weekly pattern (which days and what
              times a given service runs) lives on each listing, because a venue
              can be all day while a DJ listing is evenings only. This calendar
              is the one that applies to everything you offer. */}
          {tab === "calendar" && (
            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px" }}>
              <h3 style={{ margin:"0 0 4px", fontSize:14, fontWeight:800 }}>Days off &amp; booked dates</h3>
              <p style={{ margin:"0 0 12px", fontSize:12, color:C.midGray }}>
                Mark the dates you're unavailable. <strong>This applies to every listing you have.</strong>{" "}
                The days of the week and times each service runs are set on the listing itself, under
                “When this service is offered”. Customers see this before requesting — but you still
                approve every booking.
              </p>
              <AvailabilityCalendar vendorId={user.id} />
            </div>
          )}

          {/* NOTIFICATIONS */}
          {tab === "notifs" && (
            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <h3 style={{ margin:0, fontSize:14, fontWeight:800 }}>Notifications</h3>
                {unread > 0 && (
                  <button onClick={async()=>{ await markNotifsRead(user.id); reload(); }} className="btn"
                    style={{ border:`1px solid ${C.border}`, background:"#fff", borderRadius:9,
                             padding:"6px 12px", fontSize:11, fontWeight:700, color:C.midGray }}>
                    Mark all read
                  </button>
                )}
              </div>
              {notifs.length === 0 ? (
                <p style={{ fontSize:13, color:C.midGray, margin:0 }}>No notifications yet.</p>
              ) : notifs.map((n,i) => (
                <div key={n.id || i} style={{ borderTop:`1px solid ${C.border}`, padding:"10px 0",
                                              background: n.read ? "transparent" : "#F8FAFF" }}>
                  <p style={{ margin:0, fontSize:13, fontWeight: n.read ? 500 : 700 }}>
                    {n.title || n.message || "Update"}
                  </p>
                  {n.body && <p style={{ margin:"2px 0 0", fontSize:12, color:C.midGray }}>{n.body}</p>}
                  {n.created_at && (
                    <p style={{ margin:"3px 0 0", fontSize:10, color:C.lightGray }}>
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
        )}
      </div>

      {editing && (
        <VendorListingEditor user={user} onClose={()=>setEditing(false)} onSaved={reload} />
      )}
    </div>
  );
}

/* Persist a piece of state to the browser so a page refresh doesn't wipe it
   (cart contents, in-progress booking details). Falls back gracefully if
   localStorage is unavailable. */


export default VendorDashboard;
