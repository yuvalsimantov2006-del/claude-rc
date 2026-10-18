// נועה — date logic: calendar-day arithmetic, Hebrew countdowns, milestones, the Hebrew calendar (Intl) and the
// merged "upcoming" list. Pure functions, no DOM. Every date is an ISO calendar day 'YYYY-MM-DD'; arithmetic runs on
// day numbers from Date.UTC, so Israeli DST weeks (late March, late October) never shift a day.
// Internal helpers are prefixed _dt (the bundle shares one top-level scope).

export const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export const HEB_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const HEB_WEEKDAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const _DT_DAY = 86400000;

// ---------- ISO day helpers ----------

// 'YYYY-MM-DD' (or a Date, read in local time) → {y, m, d} with m 1..12, or null when invalid.
export function isoParse(value) {
  if (value instanceof Date) {
    if (isNaN(value)) return null;
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  }
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const y = +match[1], m = +match[2], d = +match[3];
  if (m < 1 || m > 12 || d < 1 || d > _dtDim(y, m)) return null;
  return { y, m, d };
}

export function isoValid(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !!isoParse(value); }

export function isoMake(y, m, d) { return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }

// Local calendar day of a Date (default: now) as 'YYYY-MM-DD'.
export function isoToday(now = new Date()) { return isoMake(now.getFullYear(), now.getMonth() + 1, now.getDate()); }

// Normalise anything date-like (ISO string or Date) to an ISO day, or null.
export function isoOf(value) {
  const p = isoParse(value);
  return p ? isoMake(p.y, p.m, p.d) : null;
}
// A reference day argument ("from", "on", "today"): missing → today.
function _dtRef(value) { return value == null || value === '' ? isoToday() : isoOf(value); }

export function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

function _dtDim(y, m) { return m === 2 ? (isLeapYear(y) ? 29 : 28) : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
export function daysInMonth(y, m) { return _dtDim(y, m); }

function _dtNum(p) { return Math.round(Date.UTC(p.y, p.m - 1, p.d) / _DT_DAY); }
function _dtFromNum(n) { const t = new Date(n * _DT_DAY); return isoMake(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
// 0 = Sunday … 6 = Saturday
export function isoWeekday(value) { const p = isoParse(value); return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : null; }

// Calendar days from a to b (b − a), DST-proof. null when either is invalid.
export function daysBetween(a, b) {
  const pa = isoParse(_dtRef(a)), pb = isoParse(_dtRef(b));
  if (!pa || !pb) return null;
  return _dtNum(pb) - _dtNum(pa);
}

export function isoAddDays(value, n) { const p = isoParse(value); return p ? _dtFromNum(_dtNum(p) + n) : null; }

// Add calendar months, clamping to the month's last day (Jan 31 + 1 month → Feb 28/29).
export function isoAddMonths(value, n) {
  const p = isoParse(value);
  if (!p) return null;
  const total = p.y * 12 + (p.m - 1) + n, y = Math.floor(total / 12), m = total - y * 12 + 1;
  return isoMake(y, m, Math.min(p.d, _dtDim(y, m)));
}

// The anniversary of `value` in year y (Feb 29 → Feb 28 in common years).
export function occurrenceInYear(value, y) {
  const p = isoParse(value);
  if (!p) return null;
  return isoMake(y, p.m, Math.min(p.d, _dtDim(y, p.m)));
}

// Next date ≥ from on which the date happens. recurring 'yearly' → this year's or next year's anniversary (never
// before the original date itself); anything else ('none'/'once') → the date if it is still ahead, else null.
export function nextOccurrence(date, recurring = 'yearly', from) {
  const base = isoParse(date), f = _dtRef(from);
  if (!base || !f) return null;
  const iso = isoMake(base.y, base.m, base.d);
  if (iso >= f) return iso;
  if (recurring !== 'yearly') return null;
  const fy = isoParse(f).y;
  const here = occurrenceInYear(iso, fy);
  return here >= f ? here : occurrenceInYear(iso, fy + 1);
}

// Every occurrence of a date inside [from, to] (inclusive), at most `max`.
export function occurrencesBetween(date, recurring, from, to, max = 50) {
  const base = isoParse(date), f = _dtRef(from), t = isoOf(to);
  if (!base || !f || !t || t < f) return [];
  const iso = isoMake(base.y, base.m, base.d);
  if (recurring !== 'yearly') return iso >= f && iso <= t ? [iso] : [];
  const out = [];
  for (let y = Math.max(base.y, isoParse(f).y); y <= isoParse(t).y && out.length < max; y++) {
    const occ = occurrenceInYear(iso, y);
    if (occ >= f && occ <= t && occ >= iso) out.push(occ);
  }
  return out;
}

// ---------- Hebrew counting ----------

const _DT_UNITS = {
  day: ['יום אחד', 'יומיים', 'ימים', 'יום'],
  week: ['שבוע', 'שבועיים', 'שבועות', 'שבוע'],
  month: ['חודש', 'חודשיים', 'חודשים', 'חודש'],
  year: ['שנה', 'שנתיים', 'שנים', 'שנה'],
  hour: ['שעה', 'שעתיים', 'שעות', 'שעה'],
};

// 1234 → '1,234'
export function formatCount(n) { return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

// heCount(1,'day') 'יום אחד' · (2,'day') 'יומיים' · (5,'day') '5 ימים' · (1,'year') 'שנה' · (2,'month') 'חודשיים'.
// bare: 1 → 'יום' instead of 'יום אחד' (inside a list: "שנה, חודש ויום").
export function heCount(n, unit = 'day', bare = false) {
  const u = _DT_UNITS[unit] || _DT_UNITS.day, a = Math.abs(Math.trunc(n));
  if (a === 1) return bare ? u[3] : u[0];
  if (a === 2) return u[1];
  return formatCount(a) + ' ' + u[2];
}

// Hebrew "and": prefixes ו to the last item, with a maqaf before a digit ("ו־3 ימים").
export function heAnd(parts) {
  const list = parts.filter(Boolean);
  if (list.length < 2) return list[0] || '';
  const last = list[list.length - 1];
  const joined = (/^\d/.test(last) ? 'ו־' : 'ו') + last;
  return list.slice(0, -1).join(', ') + ' ' + joined;
}

// Natural Hebrew countdown for a number of days ahead. Negative → relativePast. opts.precise keeps exact days;
// opts.prefix replaces 'בעוד' (e.g. 'עוד' for "עוד 12 ימים").
export function countdownText(days, opts = {}) {
  if (days == null || isNaN(days)) return '';
  days = Math.round(days);
  if (days < 0) return relativePast(-days);
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  const pre = (opts.prefix ?? 'בעוד') + ' ';
  if (opts.precise || days < 30) {
    if (!opts.precise && days % 7 === 0) return pre + heCount(days / 7, 'week');
    return pre + heCount(days, 'day');
  }
  return pre + _dtApprox(days);
}

// "חודש", "חודש וחצי", "3 חודשים", "שנה", "שנה וחצי", "שנתיים" — for spans of 30 days and more.
function _dtApprox(days) {
  if (days < 40) return 'חודש';
  if (days < 53) return 'חודש וחצי';
  if (days < 350) return heCount(Math.min(11, Math.round(days / 30.44)), 'month');
  const y = days / 365.25;
  if (y < 1.25) return 'שנה';
  if (y < 1.75) return 'שנה וחצי';
  return heCount(Math.round(y), 'year');
}

// "היום", "אתמול", "לפני יומיים", "לפני 5 ימים", "לפני שבוע", "לפני חודש וחצי", "לפני 3 שנים" (days ago ≥ 0).
export function relativePast(daysAgo) {
  if (daysAgo == null || isNaN(daysAgo)) return '';
  const d = Math.round(Math.abs(daysAgo));
  if (d === 0) return 'היום';
  if (d === 1) return 'אתמול';
  if (d < 7) return 'לפני ' + heCount(d, 'day');
  if (d < 30) return 'לפני ' + heCount(Math.floor(d / 7), 'week');
  return 'לפני ' + _dtApprox(d);
}

// Relative text for a date seen from `from`: future → countdownText, past → relativePast.
export function relativeText(date, from, opts) {
  const n = daysBetween(_dtRef(from), date);
  if (n == null) return '';
  return n >= 0 ? countdownText(n, opts) : relativePast(-n);
}

// ---------- ages and time together ----------

// Completed years on `on` (default today); a Feb 29 birthday counts on Feb 28 in common years. null if invalid/future.
export function age(birthday, on) {
  const b = isoParse(birthday), o = isoParse(_dtRef(on));
  if (!b || !o) return null;
  let years = o.y - b.y;
  if (isoMake(o.y, o.m, o.d) < occurrenceInYear(isoMake(b.y, b.m, b.d), o.y)) years--;
  return years < 0 ? null : years;
}

// Calendar breakdown from → to: whole months counted from the original day (clamped), then the remaining days.
// → {years, months, days, totalDays, text, short} or null if invalid / to < from.
export function togetherBreakdown(from, to) {
  const f = isoParse(from), t = isoParse(_dtRef(to));
  if (!f || !t) return null;
  const fIso = isoMake(f.y, f.m, f.d), tIso = isoMake(t.y, t.m, t.d);
  const totalDays = daysBetween(fIso, tIso);
  if (totalDays < 0) return null;
  let k = (t.y - f.y) * 12 + (t.m - f.m);
  while (k > 0 && isoAddMonths(fIso, k) > tIso) k--;
  const days = daysBetween(isoAddMonths(fIso, k), tIso);
  const years = Math.floor(k / 12), months = k % 12;
  const parts = [];
  if (years) parts.push(heCount(years, 'year', true));
  if (months) parts.push(heCount(months, 'month', true));
  if (days) parts.push(heCount(days, 'day', true));
  const text = parts.length ? heAnd(parts) : 'היום הראשון';
  return { years, months, days, totalDays, text, short: totalDays === 0 ? 'היום הראשון' : heCount(totalDays, 'day') };
}

// Day-count milestones: the spec's list, then every 500 days.
export const MILESTONE_DAYS = [100, 200, 300, 365, 500, 700, 1000, 1500, 2000, 2500, 3000];
function _dtMilestoneDayList(maxDays) {
  const list = MILESTONE_DAYS.slice();
  for (let n = 3500; n <= maxDays; n += 500) list.push(n);
  return list.filter(n => n <= maxDays);
}

function _dtYearsTogether(n) { return heCount(n, 'year') + ' ביחד'; }

// Monthly anniversaries ("חודשייה") of the first year plus the half-year marks (6 and 18 months), as
// {date, months, title}. Generated from the original day (clamped), never chained.
export function monthiversaries(together, maxMonths = 18) {
  const t = isoOf(together);
  if (!t || !isoParse(together)) return [];
  const out = [];
  for (let m = 1; m <= maxMonths; m++) {
    if (m >= 12 && m !== 18) continue;
    const title = m === 6 ? 'חצי שנה ביחד' : m === 18 ? 'שנה וחצי ביחד' : heCount(m, 'month') + ' ביחד';
    out.push({ date: isoAddMonths(t, m), months: m, title });
  }
  return out;
}

// Milestones of a relationship that fall within [from, from + horizonDays] (both inclusive), sorted by date.
// Each: {key, date, kind: 'milestone'|'anniversary'|'monthiversary', title, label, days?|years?|months?, daysLeft}.
// When 365 days lands on the first anniversary the two merge into the anniversary (with days: 365).
export function milestones(together, from, horizonDays = 365) {
  const start = isoParse(together), f = _dtRef(from);
  if (!start || !f) return [];
  const t = isoMake(start.y, start.m, start.d), end = isoAddDays(f, horizonDays);
  const inWin = d => d >= f && d <= end;
  const out = [], byDate = new Map();
  const push = item => { item.daysLeft = daysBetween(f, item.date); out.push(item); byDate.set(item.date, item); };
  const endY = isoParse(end).y;
  for (let y = start.y + 1; y <= endY; y++) {
    const date = occurrenceInYear(t, y), n = y - start.y;
    if (inWin(date)) push({ key: 'anniversary:' + n, date, kind: 'anniversary', years: n, title: _dtYearsTogether(n), label: 'יום השנה שלנו' });
  }
  const maxDays = daysBetween(t, end);
  for (const n of _dtMilestoneDayList(maxDays)) {
    const date = isoAddDays(t, n);
    if (!inWin(date)) continue;
    const same = byDate.get(date);
    if (same && same.kind === 'anniversary') { same.days = n; continue; }
    push({ key: 'days:' + n, date, kind: 'milestone', days: n, title: formatCount(n) + ' ימים ביחד', label: 'אבן דרך' });
  }
  for (const mv of monthiversaries(t)) {
    if (!inWin(mv.date) || byDate.has(mv.date)) continue;
    push({ key: 'months:' + mv.months, date: mv.date, kind: 'monthiversary', months: mv.months, title: mv.title, label: 'חודשייה' });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---------- formatting ----------

// formatDate('2026-06-02', style):
//  'short' (default) "2 ביוני" · 'year' "2 ביוני 2026" · 'long' "יום ג׳, 2 ביוני 2026" · 'full' "יום שלישי, 2 ביוני 2026"
//  'weekday' "יום ג׳, 2 ביוני" · 'month' "יוני 2026" · 'numeric' "2.6.2026" · 'auto' = 'short' in ref's year else 'year'.
export function formatDate(value, style = 'short', ref) {
  const p = isoParse(value);
  if (!p) return '';
  const dm = p.d + ' ב' + HEB_MONTHS[p.m - 1];
  const wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  switch (style) {
    case 'year': return dm + ' ' + p.y;
    case 'long': return 'יום ' + HEB_WEEKDAYS_SHORT[wd] + ', ' + dm + ' ' + p.y;
    case 'full': return 'יום ' + HEB_WEEKDAYS[wd] + ', ' + dm + ' ' + p.y;
    case 'weekday': return 'יום ' + HEB_WEEKDAYS_SHORT[wd] + ', ' + dm;
    case 'month': return HEB_MONTHS[p.m - 1] + ' ' + p.y;
    case 'numeric': return p.d + '.' + p.m + '.' + p.y;
    case 'auto': { const r = isoParse(_dtRef(ref)); return r && r.y === p.y ? dm : dm + ' ' + p.y; }
    default: return dm;
  }
}

export function monthName(m) { return HEB_MONTHS[(m - 1 + 1200) % 12]; }
export function weekdayShort(value) { const w = isoWeekday(value); return w == null ? '' : HEB_WEEKDAYS_SHORT[w]; }
export function weekdayName(value) { const w = isoWeekday(value); return w == null ? '' : HEB_WEEKDAYS[w]; }

// ---------- Hebrew calendar (Intl) ----------

let _dtHebFmt; // undefined = not tried, null = unsupported
function _dtHebrewFormatter() {
  if (_dtHebFmt !== undefined) return _dtHebFmt;
  _dtHebFmt = null;
  try {
    const f = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (f.resolvedOptions().calendar === 'hebrew') {
      const probe = Object.fromEntries(f.formatToParts(new Date(Date.UTC(2026, 8, 12, 12))).map(x => [x.type, x.value]));
      if (+probe.year > 5000 && _dtMonthKey(probe.month)) _dtHebFmt = f;
    }
  } catch (e) { _dtHebFmt = null; }
  return _dtHebFmt;
}
export function hebrewCalendarSupported() { return !!_dtHebrewFormatter(); }

// ICU's English month names (with common alternative spellings) → stable keys.
function _dtMonthKey(name) {
  const s = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (/^adar\s*(i|1)$/.test(s)) return 'adar1';
  if (/^adar\s*(ii|2)$/.test(s)) return 'adar2';
  if (/^adar$/.test(s)) return 'adar';
  if (/^tis/.test(s)) return 'tishri';
  if (/sh?van$/.test(s)) return 'heshvan';
  if (/^kis/.test(s)) return 'kislev';
  if (/^tev/.test(s)) return 'tevet';
  if (/^sh?e?vat$|^sebat$/.test(s)) return 'shevat';
  if (/^nis/.test(s)) return 'nisan';
  if (/^iy/.test(s)) return 'iyar';
  if (/^siv/.test(s)) return 'sivan';
  if (/^tam/.test(s)) return 'tamuz';
  if (/^av$|^ab$/.test(s)) return 'av';
  if (/^elul/.test(s)) return 'elul';
  return null;
}

export const HEB_HEBREW_MONTHS = {
  tishri: 'תשרי', heshvan: 'חשוון', kislev: 'כסלו', tevet: 'טבת', shevat: 'שבט', adar1: 'אדר א׳', adar: 'אדר',
  adar2: 'אדר ב׳', nisan: 'ניסן', iyar: 'אייר', sivan: 'סיוון', tamuz: 'תמוז', av: 'אב', elul: 'אלול',
};

const _dtHebCache = new Map();
// {day, monthKey, month (Hebrew name), year} for an ISO day, or null when Intl has no Hebrew calendar.
export function hebrewParts(value) {
  const iso = isoOf(value);
  if (!iso) return null;
  if (_dtHebCache.has(iso)) return _dtHebCache.get(iso);
  const f = _dtHebrewFormatter();
  let res = null;
  if (f) {
    const p = isoParse(iso);
    const parts = Object.fromEntries(f.formatToParts(new Date(Date.UTC(p.y, p.m - 1, p.d, 12))).map(x => [x.type, x.value]));
    const monthKey = _dtMonthKey(parts.month);
    if (monthKey) res = { day: +parts.day, monthKey, month: HEB_HEBREW_MONTHS[monthKey], year: +parts.year };
  }
  if (_dtHebCache.size > 4000) _dtHebCache.clear();
  _dtHebCache.set(iso, res);
  return res;
}

// Hebrew numerals: 17 → 'י״ז', 15 → 'ט״ו', 5 → 'ה׳', 5787 → 'תשפ״ז', 5780 → 'תש״ף' (thousands dropped).
export function gematria(n) {
  n = Math.trunc(n) % 1000;
  if (n <= 0) return '';
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  let s = '', h = Math.floor(n / 100), r = n % 100;
  while (h >= 4) { s += 'ת'; h -= 4; }
  s += ['', 'ק', 'ר', 'ש'][h];
  if (r === 15) s += 'טו';
  else if (r === 16) s += 'טז';
  else s += tens[Math.floor(r / 10)] + ones[r % 10];
  if (s.length === 1) return s + '׳';
  // Years end in a final letter when the last one has one: תש״ף, תש״ם, תש״ץ.
  const last = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' }[s.slice(-1)] || s.slice(-1);
  return s.slice(0, -1) + '״' + last;
}

// "י״ז בתשרי תשפ״ז" (opts.numerals 'latin' → "17 בתשרי 5787"; opts.year false drops the year). null if unsupported.
export function hebrewDate(value, opts = {}) {
  const h = hebrewParts(value);
  if (!h) return null;
  const latin = opts.numerals === 'latin';
  const dm = (latin ? h.day : gematria(h.day)) + ' ב' + h.month;
  return opts.year === false ? dm : dm + ' ' + (latin ? h.year : gematria(h.year));
}

// Hebrew-calendar holidays for the Gregorian years (scanned day by day through Intl, cached per year).
const _DT_HOLIDAY_DEFS = [
  { key: 'tubeav', month: ['av'], day: 15, title: 'ט״ו באב', subtitle: 'חג האהבה העברי', icon: 'Heart', eve: false, remindDays: [7, 1] },
  { key: 'roshhashana', month: ['tishri'], day: 1, title: 'ראש השנה', subtitle: 'החג נכנס בערב שלפני', icon: 'Sprout', eve: true, remindDays: [7] },
  { key: 'hanukkah', month: ['kislev'], day: 24, title: 'נר ראשון של חנוכה', subtitle: 'מדליקים בערב', icon: 'Flame', eve: false, remindDays: [3] },
  { key: 'purim', month: ['adar', 'adar2'], day: 14, title: 'פורים', subtitle: 'החג נכנס בערב שלפני', icon: 'PartyPopper', eve: true, remindDays: [7] },
  { key: 'pesach', month: ['nisan'], day: 15, title: 'פסח', subtitle: 'ליל הסדר בערב שלפני', icon: 'Wine', eve: true, remindDays: [7] },
  { key: 'shavuot', month: ['sivan'], day: 6, title: 'שבועות', subtitle: 'החג נכנס בערב שלפני', icon: 'Cherry', eve: true, remindDays: [3] },
];
const _dtHolidayYearCache = new Map();
function _dtHebrewHolidaysOfYear(y) {
  if (_dtHolidayYearCache.has(y)) return _dtHolidayYearCache.get(y);
  const out = [];
  if (_dtHebrewFormatter()) {
    const startN = _dtNum({ y, m: 1, d: 1 }), endN = _dtNum({ y, m: 12, d: 31 });
    for (let n = startN; n <= endN; n++) {
      const iso = _dtFromNum(n), h = hebrewParts(iso);
      if (!h) continue;
      for (const def of _DT_HOLIDAY_DEFS) if (h.day === def.day && def.month.includes(h.monthKey)) out.push({ def, date: iso, hebrewYear: h.year });
    }
  }
  _dtHolidayYearCache.set(y, out);
  return out;
}

// holidays(2026) or holidays(2026, 2028) → [{key, id, date, title, subtitle, icon, kind:'holiday', eve, hebrew,
// remindDays}] sorted by date. Valentine's (14.2) always; the Hebrew-calendar ones only when Intl supports it.
export function holidays(fromYear, toYear = fromYear) {
  const out = [];
  for (let y = fromYear; y <= toYear; y++) {
    out.push({ key: 'valentine', id: 'valentine-' + y, date: isoMake(y, 2, 14), title: 'ולנטיין', subtitle: 'יום האהבה', icon: 'Heart', kind: 'holiday', eve: null, remindDays: [7, 1] });
    for (const hit of _dtHebrewHolidaysOfYear(y)) {
      const d = hit.def;
      out.push({ key: d.key, id: d.key + '-' + hit.hebrewYear, date: hit.date, title: d.title, subtitle: d.subtitle, icon: d.icon, kind: 'holiday', eve: d.eve ? isoAddDays(hit.date, -1) : null, remindDays: d.remindDays.slice() });
    }
  }
  for (const h of out) h.hebrew = hebrewDate(h.date);
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---------- the merged upcoming list ----------

// Icon names as in src/icons.js (Lucide, PascalCase); the date kinds match model.js DATE_KINDS.
export const DATE_KIND_ICONS = { birthday: 'Cake', anniversary: 'Heart', holiday: 'Sparkles', event: 'PartyPopper', other: 'CalendarDays', milestone: 'Sparkles', monthiversary: 'CalendarHeart', task: 'ListChecks', plan: 'CalendarHeart' };
const _DT_PLAN_ICONS = { task: 'ListChecks', date: 'Wine', surprise: 'Gift', bucket: 'Rocket' };
export const DEFAULT_REMIND = { herBirthday: [14, 7, 1], anniversary: [7, 1], monthiversary: [1], milestone: [3, 1], person: [3], task: [1], plan: [1], date: [] };

const _DT_KIND_ORDER = { birthday: 0, anniversary: 1, monthiversary: 2, milestone: 3, event: 4, other: 5, holiday: 6, task: 7, plan: 8 };

// upcoming(data, from, horizonDays, options) → [{key, date, daysLeft, title, subtitle, kind, icon, source:{type,id},
// hebrew, remindDays, recurring, turns?, years?, days?, months?, overdue?, eve?}] sorted by date, within
// [from, from + horizonDays]. options: holidays (default data.prefs.holidays), milestones (true), tasks (true),
// people (true), overdue (false: also include open tasks whose due date has passed, flagged overdue:true), limit.
export function upcoming(data, from, horizonDays = 365, options = {}) {
  const f = _dtRef(from);
  if (!f || !data) return [];
  const end = isoAddDays(f, horizonDays);
  const profile = data.profile || {};
  const her = (profile.her || 'נועה').trim() || 'נועה';
  const out = [];
  const add = (item) => {
    item.daysLeft = daysBetween(f, item.date);
    if (item.hebrew === undefined) item.hebrew = hebrewDate(item.date);
    if (!item.icon) item.icon = DATE_KIND_ICONS[item.kind] || 'CalendarDays';
    if (!Array.isArray(item.remindDays)) item.remindDays = [];
    out.push(item);
  };
  const turnsAt = (birth, occ) => { const b = isoParse(birth), o = isoParse(occ); const n = b && o ? o.y - b.y : 0; return n > 0 && n < 130 ? n : null; };

  if (isoParse(profile.herBirthday)) {
    for (const occ of occurrencesBetween(profile.herBirthday, 'yearly', f, end)) {
      const turns = turnsAt(profile.herBirthday, occ);
      add({ key: 'her-birthday:' + occ, date: occ, title: 'יום ההולדת של ' + her, subtitle: turns ? 'בת ' + turns : '', turns, kind: 'birthday', icon: 'Cake', source: { type: 'profile', id: 'herBirthday' }, remindDays: DEFAULT_REMIND.herBirthday.slice(), recurring: 'yearly', isHer: true });
    }
  }
  if (isoParse(profile.together) && options.milestones !== false) {
    for (const m of milestones(profile.together, f, horizonDays)) {
      add({ key: 'together:' + m.key + ':' + m.date, date: m.date, title: m.title, subtitle: m.label, kind: m.kind, source: { type: 'profile', id: 'together' }, remindDays: (DEFAULT_REMIND[m.kind] || []).slice(), recurring: m.kind === 'anniversary' ? 'yearly' : 'none', years: m.years, days: m.days, months: m.months });
    }
  }
  const linkedBirthdays = new Set();
  for (const d of data.dates || []) {
    if (!d || !isoParse(d.date)) continue;
    if (d.kind === 'birthday' && d.personId) linkedBirthdays.add(d.personId);
    const recurring = d.recurring === 'yearly' ? 'yearly' : 'none';
    for (const occ of occurrencesBetween(d.date, recurring, f, end)) {
      const kind = ['birthday', 'anniversary', 'holiday', 'event', 'other'].includes(d.kind) ? d.kind : 'other';
      const years = recurring === 'yearly' ? isoParse(occ).y - isoParse(d.date).y : 0;
      const turns = kind === 'birthday' && years > 0 && years < 130 ? years : null;
      add({ key: 'date:' + d.id + ':' + occ, date: occ, title: d.title || 'תאריך', subtitle: '', kind, source: { type: 'date', id: d.id }, remindDays: Array.isArray(d.remindDays) ? d.remindDays.filter(n => Number.isFinite(n) && n > 0) : [], recurring, years: years > 0 ? years : undefined, turns });
    }
  }
  if (options.people !== false) {
    for (const p of data.people || []) {
      if (!p || !isoParse(p.birthday) || linkedBirthdays.has(p.id)) continue;
      for (const occ of occurrencesBetween(p.birthday, 'yearly', f, end)) {
        const turns = turnsAt(p.birthday, occ);
        add({ key: 'person:' + p.id + ':' + occ, date: occ, title: 'יום ההולדת של ' + (p.name || ''), subtitle: p.relation || '', turns, kind: 'birthday', icon: 'Cake', source: { type: 'person', id: p.id }, remindDays: DEFAULT_REMIND.person.slice(), recurring: 'yearly' });
      }
    }
  }
  const wantHolidays = options.holidays ?? !!(data.prefs && data.prefs.holidays);
  if (wantHolidays) {
    for (const h of holidays(isoParse(f).y, isoParse(end).y)) {
      if (h.date < f || h.date > end) continue;
      add({ key: 'holiday:' + h.id, date: h.date, title: h.title, subtitle: h.subtitle, kind: 'holiday', icon: h.icon, source: { type: 'holiday', id: h.key }, remindDays: h.remindDays, recurring: 'none', hebrew: h.hebrew, eve: h.eve });
    }
  }
  if (options.tasks !== false) {
    for (const p of data.plans || []) {
      if (!p || p.done || !isoParse(p.due)) continue;
      const due = isoOf(p.due), overdue = due < f;
      if (due > end || (overdue && !options.overdue)) continue;
      const kind = p.type === 'task' || !p.type ? 'task' : 'plan';
      add({ key: 'plan:' + p.id, date: due, title: p.title || 'משימה', subtitle: overdue ? 'באיחור' : '', kind, icon: _DT_PLAN_ICONS[p.type] || 'ListChecks', source: { type: 'plan', id: p.id }, remindDays: DEFAULT_REMIND[kind].slice(), recurring: 'none', overdue: overdue || undefined, planType: p.type || 'task' });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (_DT_KIND_ORDER[a.kind] ?? 9) - (_DT_KIND_ORDER[b.kind] ?? 9) || (a.isHer ? -1 : 0) - (b.isHer ? -1 : 0) || String(a.title).localeCompare(String(b.title), 'he'));
  return options.limit ? out.slice(0, options.limit) : out;
}

// Items whose reminder is due today: daysLeft is one of remindDays, or the day itself (daysLeft 0).
// Each gets {reminder: 'today'|'ahead', text: "היום: …" / "בעוד 7 ימים: …"}.
export function dueReminders(data, today, options = {}) {
  const t = _dtRef(today);
  if (!t) return [];
  return upcoming(data, t, options.horizonDays ?? 400, options)
    .filter(i => i.daysLeft === 0 || i.remindDays.includes(i.daysLeft))
    .map(i => Object.assign(i, { reminder: i.daysLeft === 0 ? 'today' : 'ahead', text: countdownText(i.daysLeft) + ': ' + i.title }));
}
