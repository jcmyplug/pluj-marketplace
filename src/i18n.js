/* ─── ENGLISH / SPANISH ──────────────────────────────────────────────────────
   PLUJ is written in English in the source. Spanish is applied to what is on
   screen: every text node, placeholder, title and aria-label is looked up in
   i18n-es.json (built from the strings in the source and translated by hand
   for Houston, US Latino Spanish, "tú"), and swapped in place. Switching back
   to English restores the originals.

   Why on screen and not with t() calls: the app is one 13,000-line file with
   about 2,000 strings; wrapping each would touch every line and break
   something. Text nodes are only ever re-written in place (nodeValue), never
   removed or wrapped, which is what keeps React happy (the "Google Translate
   breaks React" problem comes from wrapping text in <font> elements).

   Rules:
   - exact matches first (whitespace collapsed), keeping leading and trailing
     spaces so "by " + name still reads right;
   - then templates: strings built with ${…} in the source, written as {0}, {1}
     in the dictionary;
   - dates like "Oct 16, 2026" get Spanish month names;
   - nothing inside [data-no-translate], inputs, textareas, scripts or styles
     (people's names, messages and reviews stay as they were written);
   - <option> elements without a value keep their English text as the value,
     so a translated label never changes what the form submits;
   - alert/confirm/prompt messages are translated too.
   To add a string: add it to i18n-es.json under "exact" (or "templates"). */

const KEY = "pluj_lang";
let lang = "en";
let dict = null;           // { exact: {en: es}, templates: [{re, out}] }
let observer = null;
const listeners = new Set();
const textOrig = new WeakMap();   // text node → { en, es }
const attrOrig = new WeakMap();   // element → { attr: { en, es } }
const ATTRS = ["placeholder", "title", "aria-label"];

const MONTHS = { Jan:"ene", Feb:"feb", Mar:"mar", Apr:"abr", May:"may", Jun:"jun", Jul:"jul",
                 Aug:"ago", Sep:"sept", Sept:"sept", Oct:"oct", Nov:"nov", Dec:"dic" };
const MONTHS_LONG = { January:"enero", February:"febrero", March:"marzo", April:"abril", May:"mayo",
                      June:"junio", July:"julio", August:"agosto", September:"septiembre",
                      October:"octubre", November:"noviembre", December:"diciembre" };
const DAYS_LONG = { Monday:"lunes", Tuesday:"martes", Wednesday:"miércoles", Thursday:"jueves",
                    Friday:"viernes", Saturday:"sábado", Sunday:"domingo" };

export function getLang() { return lang; }
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function safeGet() { try { return localStorage.getItem(KEY); } catch { return null; } }
function safeSet(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } }

/* The language to start in: the visitor's choice, else their browser's. */
export function initialLang() {
  const saved = safeGet();
  if (saved === "es" || saved === "en") return saved;
  try { if (String(navigator.language || "").toLowerCase().startsWith("es")) return "es"; } catch { /* no navigator */ }
  return "en";
}

async function loadDict() {
  if (dict) return dict;
  const mod = await import("./i18n-es.json");
  const raw = mod.default || mod;
  const templates = Object.entries(raw.templates || {}).map(([en, es]) => {
    const parts = en.split(/(\{\d+\})/);
    const order = [];
    const src = parts.map(p => {
      const m = /^\{(\d+)\}$/.exec(p);
      if (m) { order.push(Number(m[1])); return "(.+?)"; }
      return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    return { re: new RegExp("^" + src + "$"), order, out: es };
  });
  dict = { exact: raw.exact || {}, templates };
  return dict;
}

function translateDates(s) {
  let out = s.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.? (\d{1,2}),? (\d{4})\b/g,
    (_, m, d, y) => `${d} ${MONTHS[m]} ${y}`);
  out = out.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)( \d{1,2})?(,? \d{4})?\b/g,
    (_, m, d, y) => d ? `${d.trim()} de ${MONTHS_LONG[m]}${y ? " de " + y.replace(/[, ]/g, "") : ""}` : `${MONTHS_LONG[m]}${y ? " de " + y.replace(/[, ]/g, "") : ""}`);
  out = out.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, d => DAYS_LONG[d]);
  return out;
}

/* English → Spanish for one string, or null when there's nothing to change. */
export function translate(s) {
  if (!dict || lang !== "es" || s == null) return null;
  const str = String(s);
  const key = str.replace(/\s+/g, " ").trim();
  if (!key || !/[A-Za-z]/.test(key)) return null;
  const lead = str.match(/^\s*/)[0], trail = str.match(/\s*$/)[0];
  const hit = dict.exact[key];
  if (hit != null) return lead + hit + trail;
  for (const t of dict.templates) {
    const m = t.re.exec(key);
    if (m) {
      let out = t.out;
      t.order.forEach((n, i) => {
        const v = m[i + 1];
        const tv = dict.exact[v.replace(/\s+/g, " ").trim()];
        out = out.split("{" + n + "}").join(tv != null ? tv : v);
      });
      return lead + translateDates(out) + trail;
    }
  }
  /* Labels joined in code ("Food & Drinks · Food Trucks"): piece by piece. */
  if (key.includes(" · ")) {
    const parts = key.split(" · ");
    const done = parts.map(p => dict.exact[p.trim()] ?? translateDates(p));
    if (done.some((v, i) => v !== parts[i])) return lead + done.join(" · ") + trail;
  }
  const dated = translateDates(key);
  if (dated !== key) return lead + dated + trail;
  /* Multi-line messages (alerts, notices): translate line by line. */
  if (key !== str.trim() && /\n/.test(str)) {
    const lines = str.split("\n").map(l => translate(l) ?? l);
    const joined = lines.join("\n");
    return joined !== str ? joined : null;
  }
  return null;
}

/* For JS strings the app builds itself (alerts, document.title). */
export function tr(s) { const t = translate(s); return t == null ? s : t; }

function skip(el) {
  for (let e = el; e && e.nodeType === 1; e = e.parentNode) {
    const tag = e.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "CODE" || tag === "PRE") return true;
    if (e.isContentEditable) return true;
    if (e.hasAttribute && e.hasAttribute("data-no-translate")) return true;
  }
  return false;
}

function doText(node) {
  const cur = node.nodeValue;
  const rec = textOrig.get(node);
  if (rec && cur === rec.es) return;               // our own write
  const en = cur;
  const es = lang === "es" ? translate(en) : null;
  if (es == null || es === en) { if (rec) textOrig.delete(node); return; }
  const parent = node.parentNode;
  if (parent && parent.tagName === "OPTION" && !parent.hasAttribute("value")) {
    parent.setAttribute("value", en.trim());
  }
  textOrig.set(node, { en, es });
  node.nodeValue = es;
}

function doAttrs(el) {
  let rec = attrOrig.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    const r = rec && rec[a];
    if (r && cur === r.es) continue;
    const es = lang === "es" ? translate(cur) : null;
    if (es == null || es === cur) { if (r) delete rec[a]; continue; }
    if (!rec) { rec = {}; attrOrig.set(el, rec); }
    rec[a] = { en: cur, es };
    el.setAttribute(a, es);
  }
}

function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { if (!skip(root.parentNode)) doText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1 && skip(root)) return;
  if (root.nodeType === 1) doAttrs(root);
  const w = document.createTreeWalker(root, 1 | 4);   // elements | text
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 1) {
      if (skip(n)) continue;
      doAttrs(n);
    } else if (!skip(n.parentNode)) {
      doText(n);
    }
  }
}

function restore(root) {
  const w = document.createTreeWalker(root, 1 | 4);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) {
      const rec = textOrig.get(n);
      if (rec) { if (n.nodeValue === rec.es) n.nodeValue = rec.en; textOrig.delete(n); }
    } else {
      const rec = attrOrig.get(n);
      if (rec) {
        for (const a of Object.keys(rec)) if (n.getAttribute(a) === rec[a].es) n.setAttribute(a, rec[a].en);
        attrOrig.delete(n);
      }
    }
  }
}

function startObserver() {
  if (observer || typeof MutationObserver === "undefined") return;
  observer = new MutationObserver(muts => {
    if (lang !== "es") return;
    for (const m of muts) {
      if (m.type === "characterData") { if (!skip(m.target.parentNode)) doText(m.target); }
      else if (m.type === "attributes") { if (!skip(m.target)) doAttrs(m.target); }
      else m.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRS,
  });
}

/* alert / confirm / prompt speak the page's language too. */
let dialogsWrapped = false;
function wrapDialogs() {
  if (dialogsWrapped || typeof window === "undefined") return;
  dialogsWrapped = true;
  for (const name of ["alert", "confirm", "prompt"]) {
    const orig = window[name] && window[name].bind(window);
    if (!orig) continue;
    window[name] = (msg, ...rest) => orig(lang === "es" ? tr(msg) : msg, ...rest);
  }
}

export async function setLang(next) {
  next = next === "es" ? "es" : "en";
  if (next === "es") await loadDict();
  lang = next;
  safeSet(next);
  try { document.documentElement.lang = next; } catch { /* no document */ }
  wrapDialogs();
  startObserver();
  /* The whole document, so the <title> follows the language too. */
  if (next === "es") walk(document.documentElement);
  else restore(document.documentElement);
  listeners.forEach(fn => { try { fn(next); } catch { /* a listener's problem */ } });
}

/* Called once before the app renders. Never throws: English is the fallback. */
export async function initI18n() {
  try {
    const want = initialLang();
    if (want === "es") await setLang("es");
    else { try { document.documentElement.lang = "en"; } catch { /* no document */ } }
  } catch (e) {
    console.warn("[PLUJ] Spanish couldn't load; showing English.", e);
  }
}
