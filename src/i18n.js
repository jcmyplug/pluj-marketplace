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
     in the dictionary; {#0} matches a number only; a placeholder glued to a
     word ("photo{1}") may be empty, for the singular; a value inside a
     template is itself looked up (exact, then templates);
   - dates like "Oct 16, 2026" and "Sat, Oct 18" get Spanish month names;
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
const DAYS_SHORT = { Mon:"lun", Tue:"mar", Wed:"mié", Thu:"jue", Fri:"vie", Sat:"sáb", Sun:"dom" };

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
  /* Placeholders: {0} is any text; {#0} is a number only ("{#0} hours" must
     not turn "Business hours" into "Business horas"); a placeholder glued to a
     word ("photo{1}") may be empty, so the singular "1 photo uploaded" matches
     the same entry as "3 photos uploaded". The Spanish side always uses {0}. */
  const templates = Object.entries(raw.templates || {}).map(([en, es]) => {
    const parts = en.split(/(\{#?\d+\})/);
    const order = [];
    const src = parts.map((p, i) => {
      const m = /^\{(#?)(\d+)\}$/.exec(p);
      if (m) {
        order.push(Number(m[2]));
        if (m[1]) return "(\\d[\\d.,]*)";
        return /[A-Za-z]$/.test(parts[i - 1] || "") ? "(.*?)" : "(.+?)";
      }
      return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    return { re: new RegExp("^" + src + "$"), order, out: es };
  });
  const lower = {};
  for (const [en, es] of Object.entries(raw.exact || {})) {
    const k = en.toLowerCase();
    if (!(k in lower)) lower[k] = es;
  }
  dict = { exact: raw.exact || {}, templates, lower };
  return dict;
}

/* A value the code put inside a sentence ("photographers" in "Find
   photographers near you"): the same word in the dictionary, matched without
   case, keeps the sentence's lower case. */
function lowerHit(v) {
  if (!v || v !== v.toLowerCase()) return null;
  const es = dict.lower[v];
  if (es == null) return null;
  return /^\p{Lu}\p{Ll}/u.test(es) ? es[0].toLowerCase() + es.slice(1) : es;
}

function translateDates(s) {
  let out = s.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.? (\d{1,2}),? (\d{4})\b/g,
    (_, m, d, y) => `${d} ${MONTHS[m]} ${y}`);
  out = out.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)( \d{1,2})?(,? \d{4})?\b/g,
    (_, m, d, y) => d ? `${d.trim()} de ${MONTHS_LONG[m]}${y ? " de " + y.replace(/[, ]/g, "") : ""}` : `${MONTHS_LONG[m]}${y ? " de " + y.replace(/[, ]/g, "") : ""}`);
  out = out.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, d => DAYS_LONG[d]);
  /* A date without a year ("Sat, Oct 18"): "sáb, 18 oct". */
  out = out.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.? (\d{1,2})\b(?!,? \d{4})(?!:)/g,
    (_, m, d) => `${d} ${MONTHS[m]}`);
  out = out.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (?=\d{1,2} (ene|feb|mar|abr|may|jun|jul|ago|sept|oct|nov|dic)\b)/g,
    (_, d) => DAYS_SHORT[d] + ", ");
  /* "01 nov at 06:00 PM" (from the database's reminders): "01 nov a las 06:00 PM". */
  out = out.replace(/\b(\d{1,2} (?:ene|feb|mar|abr|may|jun|jul|ago|sept|oct|nov|dic)) at (\d{1,2}:\d{2} ?[AP]M)\b/g, "$1 a las $2");
  return out;
}

/* One whitespace-collapsed string → Spanish, or null. `depth` stops a value
   inside a template from recursing forever (each step is strictly shorter). */
function lookup(key, depth) {
  const hit = dict.exact[key];
  if (hit != null) return hit;
  for (const t of dict.templates) {
    const m = t.re.exec(key);
    if (m) {
      let out = t.out;
      t.order.forEach((n, i) => {
        const v = m[i + 1];
        const vk = v.replace(/\s+/g, " ").trim();
        /* An empty plural ending: drop the placeholder and the space before
           it, so "pagos {0}?" with nothing in it reads "pagos?". */
        if (!vk) { out = out.replace(new RegExp("\\s?\\{" + n + "\\}", "g"), ""); return; }
        let tv = dict.exact[vk];
        /* A phrase the code built and then put in a sentence ("48 hours" in
           "needs at least 48 hours notice"). */
        if (tv == null && depth < 3 && vk.length < key.length && /[A-Za-z]/.test(vk)) tv = lookup(vk, depth + 1);
        if (tv == null) tv = lowerHit(vk);
        /* A list the code joined with commas ("business name, city"):
           translate each item it knows. */
        if (tv == null && /,\s/.test(v)) {
          const parts = v.split(/,\s*/);
          const done = parts.map(x => dict.exact[x.trim()] ?? x);
          if (done.some((x, j) => x !== parts[j])) tv = done.join(", ");
        }
        out = out.split("{" + n + "}").join(tv != null ? tv : v);
      });
      return translateDates(out);
    }
  }
  /* Labels joined in code ("Food & Drinks · Food Trucks"): piece by piece. */
  if (key.includes(" · ")) {
    const parts = key.split(" · ");
    const done = parts.map(p => dict.exact[p.trim()] ?? translateDates(p));
    if (done.some((v, i) => v !== parts[i])) return done.join(" · ");
  }
  /* A list the code joined with commas ("legal business name, EIN (9 digits)"),
     when every item is a known phrase. */
  if (key.includes(", ")) {
    const parts = key.split(", ");
    if (parts.every(x => dict.exact[x.trim()] != null)) return parts.map(x => dict.exact[x.trim()]).join(", ");
  }
  const dated = translateDates(key);
  return dated !== key ? dated : null;
}

/* English → Spanish for one string, or null when there's nothing to change. */
export function translate(s) {
  if (!dict || lang !== "es" || s == null) return null;
  const str = String(s);
  const key = str.replace(/\s+/g, " ").trim();
  if (!key || !/[A-Za-z]/.test(key)) return null;
  const lead = str.match(/^\s*/)[0], trail = str.match(/\s*$/)[0];
  const found = lookup(key, 0);
  if (found != null) return lead + found + trail;
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

/* attrsOnly: a <textarea>'s own placeholder/title is translated, never what
   is typed in it (31 Oct: the pro's "Describe your business" hint was English). */
function skip(el, attrsOnly = false) {
  for (let e = el; e && e.nodeType === 1; e = e.parentNode) {
    const tag = e.tagName;
    if (tag === "TEXTAREA" && attrsOnly && e === el) continue;
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
  if (root.nodeType === 1 && skip(root)) { if (!skip(root, true)) doAttrs(root); return; }
  if (root.nodeType === 1) doAttrs(root);
  const w = document.createTreeWalker(root, 1 | 4);   // elements | text
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 1) {
      if (skip(n)) { if (!skip(n, true)) doAttrs(n); continue; }
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
      else if (m.type === "attributes") { if (!skip(m.target, true)) doAttrs(m.target); }
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
