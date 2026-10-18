// נועה — global search across every section, with Hebrew-aware normalisation (niqqud, geresh/gershayim and quotes
// stripped, final letters unified, Latin lower-cased and accent-free). Pure; no DOM. Results carry plain text
// only; highlight() returns index ranges into the original text, so the UI renders with textContent (XSS-safe).
// Internal helpers are prefixed _sr (the bundle shares one top-level scope).
import { FACT_CATEGORIES, SENTIMENTS, PLACE_KINDS, PLACE_LOVED_BY, DATE_KINDS, GIFT_STATUSES, PLAN_TYPES, SIZE_FIELDS, LOVE_LANGUAGE_TYPES } from './model.js';
import { formatDate, isoParse } from './dates.js';

const _SR_FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }; // ך→כ ם→מ ן→נ ף→פ ץ→צ
// Combining marks: Hebrew niqqud and cantillation, Latin accents after NFD. (Maqaf, paseq, sof pasuq, geresh and
// gershayim are punctuation, not marks: maqaf separates words, geresh/gershayim are dropped below.)
const _SR_POINTS = /\p{M}/gu;
// Geresh, gershayim and every kind of quote/apostrophe vanish inside a word: צ'יפס → ציפס, תשפ"ז → תשפז.
const _SR_QUOTES = /[׳״'`´‘’‚‛“”„‟′″"]/;
const _SR_WORD = /[\p{L}\p{N}]/u;

// One original code point → its normalised form ('' = dropped, ' ' = separator).
function _srChar(ch) {
  if (_SR_QUOTES.test(ch)) return '';
  let s = ch.normalize('NFD').replace(_SR_POINTS, '').toLowerCase();
  if (!s) return '';
  let out = '';
  for (const c of s) {
    if (_SR_FINALS[c]) out += _SR_FINALS[c];
    else if (_SR_WORD.test(c)) out += c;
    else out += ' ';
  }
  return out;
}

// Normalised text plus, for every normalised character, the original [start, end) it came from.
function _srMap(text) {
  const src = String(text ?? '');
  let str = '';
  const starts = [], ends = [];
  let i = 0;
  for (const ch of src) {
    const n = _srChar(ch);
    // A dropped combining mark (niqqud) stays with its letter, so a highlight never splits a letter from its point.
    if (!n && ends.length && /\p{M}/u.test(ch) && ends[ends.length - 1] === i) ends[ends.length - 1] = i + ch.length;
    for (const c of n) {
      if (c === ' ' && (str === '' || str.endsWith(' '))) continue;
      str += c; starts.push(i); ends.push(i + ch.length);
    }
    i += ch.length;
  }
  if (str.endsWith(' ')) { str = str.slice(0, -1); starts.pop(); ends.pop(); }
  return { str, starts, ends };
}

// "בְּתֵל־אָבִיב" → "בתל אביב"; "שוקולד מריר!" → "שוקולד מריר"; "Café" → "cafe"; "כוסברה ונענע" stays; ם → מ…
export function normalize(text) { return _srMap(text).str; }

export function searchTokens(query) { const q = normalize(query); return q ? q.split(' ') : []; }

const _SR_PREFIX_LETTERS = 'והבלמשכ';

// Best match of one token in one normalised field: 100 whole field · 70 field start · 60 word start ·
// 50 word start after a one-letter Hebrew prefix (ו/ה/ב/ל/מ/ש/כ: "הקפה" for "קפה") · 25 inside a word (tokens of
// 2+ chars) · 0.
function _srScoreToken(field, tok) {
  if (!field || !tok) return 0;
  if (field === tok) return 100;
  if (field.startsWith(tok)) return 70;
  let best = 0, at = field.indexOf(tok);
  while (at !== -1 && best < 60) {
    const prev = field[at - 1];
    if (prev === ' ') best = 60;
    else if (_SR_PREFIX_LETTERS.includes(prev) && (at === 1 || field[at - 2] === ' ')) best = Math.max(best, 50);
    else if (tok.length >= 2) best = Math.max(best, 25);
    at = field.indexOf(tok, at + 1);
  }
  return best;
}

const _srLabel = (list, id) => (list.find(x => x.id === id) || {}).label || '';
const _srShort = (s, n = 60) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

// Sections in display order, with the Hebrew label and icon (src/icons.js names).
export const SEARCH_SECTIONS = [
  { id: 'profile', label: 'עליה', icon: 'User' },
  { id: 'facts', label: 'דברים עליה', icon: 'Heart' },
  { id: 'people', label: 'אנשים שחשובים לה', icon: 'Users' },
  { id: 'places', label: 'מקומות', icon: 'MapPin' },
  { id: 'dates', label: 'תאריכים', icon: 'CalendarDays' },
  { id: 'gifts', label: 'מתנות', icon: 'Gift' },
  { id: 'plans', label: 'תוכניות ורעיונות', icon: 'ListChecks' },
  { id: 'memories', label: 'זיכרונות', icon: 'BookHeart' },
];

// Route strings: '<tab>' or '<tab>/<kind>/<id>' (the shell maps them to screens).
export const SEARCH_ROUTES = {
  profile: () => 'her', sizes: () => 'her/sizes', loveLanguages: () => 'her/love',
  fact: id => 'her/fact/' + id, person: id => 'her/person/' + id, place: id => 'places/place/' + id,
  date: id => 'dates/date/' + id, gift: id => 'gifts/gift/' + id, plan: id => 'plans/plan/' + id, memory: id => 'memories/memory/' + id,
};

// Every searchable record as {section, id, title, subtitle, route, starred, fields:[{text, w}]}.
function _srRecords(data) {
  const d = data || {}, recs = [];
  const p = d.profile || {};
  const her = String(p.her || 'נועה');
  recs.push({ section: 'profile', id: 'her', title: her, subtitle: p.herBirthday ? 'יום הולדת: ' + formatDate(p.herBirthday, 'year') : 'הפרופיל שלה', route: SEARCH_ROUTES.profile(), fields: [{ text: her, w: 1 }, { text: 'פרופיל', w: 0.4 }] });
  const sizes = p.sizes || {};
  const sizeParts = [];
  for (const f of SIZE_FIELDS) if (sizes[f.id]) sizeParts.push(f.label + ': ' + sizes[f.id]);
  if (sizeParts.length || sizes.notes) {
    recs.push({ section: 'profile', id: 'sizes', title: 'המידות שלה', subtitle: _srShort(sizeParts.join(' · ') || sizes.notes), route: SEARCH_ROUTES.sizes(), fields: [{ text: 'המידות שלה מידה מידות', w: 0.8 }, ...sizeParts.map(t => ({ text: t, w: 0.8 })), { text: sizes.notes, w: 0.5 }] });
  }
  if (Array.isArray(p.loveLanguages) && p.loveLanguages.length) {
    const labels = p.loveLanguages.map(id => _srLabel(LOVE_LANGUAGE_TYPES, id)).filter(Boolean);
    recs.push({ section: 'profile', id: 'loveLanguages', title: 'שפות האהבה שלה', subtitle: labels.join(' · '), route: SEARCH_ROUTES.loveLanguages(), fields: [{ text: 'שפות אהבה שפת אהבה', w: 0.8 }, ...labels.map(t => ({ text: t, w: 0.7 }))] });
  }
  const places = new Map((d.places || []).filter(Boolean).map(x => [x.id, x]));
  const datesById = new Map((d.dates || []).filter(Boolean).map(x => [x.id, x]));
  for (const x of d.facts || []) {
    if (!x) continue;
    const cat = _srLabel(FACT_CATEGORIES, x.category), sent = SENTIMENTS.find(s => s.id === x.sentiment);
    recs.push({ section: 'facts', id: x.id, title: x.title || '', subtitle: [sent ? sent.emoji + ' ' + sent.label : '', cat].filter(Boolean).join(' · '), route: SEARCH_ROUTES.fact(x.id), starred: x.starred,
      fields: [{ text: x.title, w: 1 }, { text: x.details, w: 0.6 }, { text: cat, w: 0.5 }, { text: (x.tags || []).join(' '), w: 0.7 }, { text: x.notes, w: 0.5 }, { text: sent && sent.label, w: 0.35 }] });
  }
  for (const x of d.people || []) {
    if (!x) continue;
    recs.push({ section: 'people', id: x.id, title: x.name || '', subtitle: [x.relation, x.birthday ? formatDate(x.birthday) : ''].filter(Boolean).join(' · '), route: SEARCH_ROUTES.person(x.id), starred: x.starred,
      fields: [{ text: x.name, w: 1 }, { text: x.relation, w: 0.7 }, { text: x.notes, w: 0.5 }, { text: x.phone ? String(x.phone).replace(/\D/g, '') : '', w: 0.5 }, { text: (x.tags || []).join(' '), w: 0.6 }] });
  }
  for (const x of d.places || []) {
    if (!x) continue;
    const kind = _srLabel(PLACE_KINDS, x.kind), by = _srLabel(PLACE_LOVED_BY, x.lovedBy);
    recs.push({ section: 'places', id: x.id, title: x.name || '', subtitle: [kind, x.area, by].filter(Boolean).join(' · '), route: SEARCH_ROUTES.place(x.id), starred: x.starred,
      fields: [{ text: x.name, w: 1 }, { text: x.area, w: 0.7 }, { text: x.address, w: 0.6 }, { text: x.notes, w: 0.5 }, { text: (x.tags || []).join(' '), w: 0.7 }, { text: kind, w: 0.5 }, { text: by, w: 0.35 }] });
  }
  for (const x of d.dates || []) {
    if (!x) continue;
    const kind = _srLabel(DATE_KINDS, x.kind);
    recs.push({ section: 'dates', id: x.id, title: x.title || '', subtitle: [isoParse(x.date) ? formatDate(x.date, x.recurring === 'yearly' ? 'short' : 'year') : '', kind].filter(Boolean).join(' · '), route: SEARCH_ROUTES.date(x.id), starred: x.starred,
      fields: [{ text: x.title, w: 1 }, { text: x.notes, w: 0.5 }, { text: kind, w: 0.4 }, { text: (x.tags || []).join(' '), w: 0.6 }] });
  }
  for (const x of d.gifts || []) {
    if (!x) continue;
    const status = _srLabel(GIFT_STATUSES, x.status);
    const occ = datesById.has(x.occasion) ? datesById.get(x.occasion).title : x.occasion;
    recs.push({ section: 'gifts', id: x.id, title: x.title || '', subtitle: [status, occ, x.price != null && x.price !== '' ? '₪' + x.price : ''].filter(Boolean).join(' · '), route: SEARCH_ROUTES.gift(x.id), starred: x.starred,
      fields: [{ text: x.title, w: 1 }, { text: x.whereToBuy, w: 0.6 }, { text: occ, w: 0.6 }, { text: x.notes, w: 0.5 }, { text: (x.tags || []).join(' '), w: 0.6 }, { text: status, w: 0.3 }] });
  }
  for (const x of d.plans || []) {
    if (!x) continue;
    const type = _srLabel(PLAN_TYPES, x.type), place = places.get(x.placeId);
    recs.push({ section: 'plans', id: x.id, title: x.title || '', subtitle: [type, x.due ? formatDate(x.due) : '', x.done ? 'בוצע' : ''].filter(Boolean).join(' · '), route: SEARCH_ROUTES.plan(x.id), starred: x.starred,
      fields: [{ text: x.title, w: 1 }, { text: x.notes, w: 0.5 }, { text: type, w: 0.4 }, { text: place && place.name, w: 0.5 }, { text: (x.tags || []).join(' '), w: 0.6 }] });
  }
  for (const x of d.memories || []) {
    if (!x) continue;
    const place = places.get(x.placeId);
    recs.push({ section: 'memories', id: x.id, title: x.title || '', subtitle: [isoParse(x.date) ? formatDate(x.date, 'year') : '', place && place.name, _srShort(x.text, 40)].filter(Boolean).join(' · '), route: SEARCH_ROUTES.memory(x.id), starred: x.starred,
      fields: [{ text: x.title, w: 1 }, { text: x.text, w: 0.6 }, { text: place && place.name, w: 0.5 }, { text: (x.tags || []).join(' '), w: 0.6 }, { text: x.notes, w: 0.5 }] });
  }
  return recs;
}

// Score of a record for the query tokens (all must match: AND), or 0.
function _srScoreRecord(rec, tokens, phrase) {
  const fields = rec.fields.map(f => ({ n: normalize(f.text), w: f.w })).filter(f => f.n);
  let total = 0;
  for (const tok of tokens) {
    let best = 0;
    for (const f of fields) { const s = _srScoreToken(f.n, tok) * f.w; if (s > best) best = s; }
    // A query word with a one-letter Hebrew prefix ("בתל", "לסושי") also finds the bare word, a little lower.
    if (!best && tok.length >= 3 && _SR_PREFIX_LETTERS.includes(tok[0])) {
      const bare = tok.slice(1);
      for (const f of fields) { const s = _srScoreToken(f.n, bare) * f.w * 0.8; if (s > best) best = s; }
    }
    if (!best) return 0;
    total += best;
  }
  if (tokens.length > 1) {
    let bonus = 0;
    for (const f of fields) if (f.n.includes(phrase)) bonus = Math.max(bonus, 20 * f.w);
    total += bonus;
  }
  if (rec.starred) total += 3;
  return Math.round(total * 10) / 10;
}

// searchAll(data, query, {limit = 60, sections}) → [{section, sectionLabel, id, title, subtitle, score, route}]
// grouped by section (groups ordered by their best score, then the SEARCH_SECTIONS order), best first inside each
// group. Empty query → [].
export function searchAll(data, query, opts = {}) {
  const tokens = searchTokens(query);
  if (!tokens.length || !data || typeof data !== 'object') return [];
  const phrase = tokens.join(' ');
  const only = Array.isArray(opts.sections) ? new Set(opts.sections) : null;
  const hits = [];
  for (const rec of _srRecords(data)) {
    if (only && !only.has(rec.section)) continue;
    const score = _srScoreRecord(rec, tokens, phrase);
    if (score > 0) hits.push({ section: rec.section, id: rec.id, title: rec.title, subtitle: rec.subtitle, score, route: rec.route });
  }
  const order = new Map(SEARCH_SECTIONS.map((s, i) => [s.id, i]));
  const best = new Map();
  for (const h of hits) best.set(h.section, Math.max(best.get(h.section) || 0, h.score));
  hits.sort((a, b) => (best.get(b.section) - best.get(a.section)) || (order.get(a.section) - order.get(b.section)) || (b.score - a.score) || String(a.title).localeCompare(String(b.title), 'he'));
  const limit = opts.limit ?? 60;
  const out = hits.slice(0, limit);
  for (const h of out) h.sectionLabel = (SEARCH_SECTIONS.find(s => s.id === h.section) || {}).label || '';
  return out;
}

// The flat results as groups: [{section, label, icon, items}] in result order.
export function groupResults(results) {
  const groups = [];
  for (const r of results || []) {
    let g = groups[groups.length - 1];
    if (!g || g.section !== r.section) {
      const s = SEARCH_SECTIONS.find(x => x.id === r.section) || { label: r.section, icon: 'Search' };
      g = { section: r.section, label: s.label, icon: s.icon, items: [] };
      groups.push(g);
    }
    g.items.push(r);
  }
  return groups;
}

// Ranges [{start, end}] (end exclusive, indexes into the original text) where the query's words occur,
// matched after normalisation (so "תל אביב" highlights "תֵּל־אָבִיב"). Sorted and merged; [] when nothing matches.
export function highlight(text, query) {
  const src = String(text ?? '');
  const tokens = searchTokens(query);
  if (!src || !tokens.length) return [];
  const { str, starts, ends } = _srMap(src);
  const raw = [];
  for (const tok of tokens) {
    let at = str.indexOf(tok);
    while (at !== -1) {
      raw.push({ start: starts[at], end: ends[at + tok.length - 1] });
      at = str.indexOf(tok, at + tok.length);
    }
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}

// The text split into [{text, match}] segments for rendering with textContent / <mark> built in the DOM.
export function highlightParts(text, query) {
  const src = String(text ?? '');
  const parts = [];
  let pos = 0;
  for (const r of highlight(src, query)) {
    if (r.start > pos) parts.push({ text: src.slice(pos, r.start), match: false });
    parts.push({ text: src.slice(r.start, r.end), match: true });
    pos = r.end;
  }
  if (pos < src.length || !parts.length) parts.push({ text: src.slice(pos), match: false });
  return parts;
}
