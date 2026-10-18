// נועה — iCalendar (RFC 5545) export of every date, so the phone's calendar app reminds him even when the app is
// closed. All-day events (DTSTART;VALUE=DATE + DTEND next day), RRULE:FREQ=YEARLY for recurring dates, one VALARM
// per remind day, stable UIDs (re-importing updates instead of duplicating), CRLF, 75-octet folding that never
// splits a UTF-8 character. Pure; no DOM.
//
// Feb 29 choice: a yearly date on Feb 29 is exported with RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1 — the last day
// of February — so it shows on Feb 29 in leap years and Feb 28 otherwise (the same rule as dates.js nextOccurrence).
// A plain FREQ=YEARLY on Feb 29 would silently skip three years out of four (RFC 5545 §3.3.10).
//
// Alarms: TRIGGER:-P{n}D for each remind day, plus a same-day alarm at TRIGGER:PT{hour}H (default 09:00).
// options.alarmHour (0..23) also moves the n-days-before alarms to that hour (-P{n-1}DT{24-hour}H) instead of
// midnight.
import { isoParse, isoMake, isoAddDays, isoToday, milestones, holidays, DEFAULT_REMIND } from './dates.js';

// TEXT escaping (§3.3.11): backslash, semicolon, comma, newline.
export function icsEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

function _icsCpBytes(cp) { return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; }

// Folds one content line to ≤ 75 octets per physical line (§3.1); continuation lines start with one space.
// Splits only between code points, so multi-byte Hebrew letters and emoji stay whole. Returns lines joined by CRLF.
export function icsFold(line) {
  const out = [];
  let cur = '', bytes = 0, limit = 75;
  for (const ch of String(line)) {
    const b = _icsCpBytes(ch.codePointAt(0));
    if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

function _icsDate(iso) { return iso.replace(/-/g, ''); }
function _icsStamp(now) {
  const d = now instanceof Date ? now : new Date(now ?? Date.now());
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function _icsUidPart(s) { return String(s ?? '').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 80) || 'x'; }

function _icsAlarms(remindDays, alarmHour, sameDayHour, title) {
  const lines = [];
  const desc = icsEscape(title);
  const seen = new Set();
  for (const raw of remindDays || []) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n <= 0 || n > 365 || seen.has(n)) continue;
    seen.add(n);
    let trigger = '-P' + n + 'D';
    if (Number.isInteger(alarmHour) && alarmHour > 0 && alarmHour < 24) trigger = '-P' + (n - 1 > 0 ? (n - 1) + 'D' : '') + 'T' + (24 - alarmHour) + 'H';
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + desc, 'TRIGGER:' + trigger, 'END:VALARM');
  }
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + desc, 'TRIGGER:PT' + sameDayHour + 'H', 'END:VALARM');
  return lines;
}

// buildICS(data, {from, includeHolidays, includeMilestones, now, alarmHour, holidayYears, milestoneYears, calName})
// → the .ics text. from: ISO day the export is made (default today) — milestones and holidays start there;
// includeHolidays (default data.prefs.holidays): built-in holidays for holidayYears (default 3) years;
// includeMilestones (default true): day-count milestones and first-year monthly anniversaries for milestoneYears
// (default 5) years. Yearly anniversaries of "together" are always included when the date is set.
export function buildICS(data, options = {}) {
  data = data || {};
  const profile = data.profile || {};
  const her = String(profile.her || '').trim() || 'נועה';
  const from = isoParse(options.from) ? options.from : isoToday();
  const stamp = _icsStamp(options.now);
  const alarmHour = options.alarmHour;
  const sameDayHour = Number.isInteger(alarmHour) && alarmHour >= 0 && alarmHour < 24 ? alarmHour : 9;
  const includeHolidays = options.includeHolidays ?? !!(data.prefs && data.prefs.holidays);
  const includeMilestones = options.includeMilestones !== false;
  const events = [];
  const usedUids = new Set();

  const addEvent = ({ uid, date, title, description, yearly, lastOfFeb, remindDays, categories }) => {
    const p = isoParse(date);
    if (!p) return;
    const start = isoMake(p.y, p.m, p.d);
    let u = uid, i = 2;
    while (usedUids.has(u)) u = uid.replace('@noa', '') + '-' + (i++) + '@noa';
    usedUids.add(u);
    const lines = ['BEGIN:VEVENT', 'UID:' + u, 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + _icsDate(start), 'DTEND;VALUE=DATE:' + _icsDate(isoAddDays(start, 1)), 'SUMMARY:' + icsEscape(title)];
    if (yearly) lines.push((p.m === 2 && p.d === 29) || lastOfFeb ? 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'RRULE:FREQ=YEARLY');
    if (description) lines.push('DESCRIPTION:' + icsEscape(description));
    if (categories) lines.push('CATEGORIES:' + icsEscape(categories));
    lines.push('TRANSP:TRANSPARENT');
    lines.push(..._icsAlarms(remindDays, alarmHour, sameDayHour, title));
    lines.push('END:VEVENT');
    events.push({ start, lines });
  };

  if (isoParse(profile.herBirthday)) {
    addEvent({ uid: 'her-birthday@noa', date: profile.herBirthday, title: 'יום ההולדת של ' + her, yearly: true, remindDays: DEFAULT_REMIND.herBirthday, categories: 'יום הולדת' });
  }
  if (isoParse(profile.together)) {
    const t = isoParse(profile.together);
    // The series starts at the first anniversary (the "together" day itself is not one). Together since Feb 29 →
    // it starts on Feb 28 of the next (common) year with the last-day-of-February rule.
    const leapDay = t.m === 2 && t.d === 29;
    addEvent({ uid: 'together-anniversary@noa', date: isoMake(t.y + 1, t.m, leapDay ? 28 : t.d), lastOfFeb: leapDay, title: 'יום השנה שלנו', description: 'ביחד מאז ' + profile.together, yearly: true, remindDays: DEFAULT_REMIND.anniversary, categories: 'יום שנה' });
    if (includeMilestones) {
      const years = options.milestoneYears ?? 5;
      for (const m of milestones(profile.together, from, Math.round(years * 365.25))) {
        if (m.kind === 'anniversary') continue;
        addEvent({ uid: 'milestone-' + _icsUidPart(m.key.replace(':', '-')) + '@noa', date: m.date, title: m.title, description: m.label, remindDays: DEFAULT_REMIND[m.kind] || [], categories: m.label });
      }
    }
  }
  const linked = new Set();
  for (const d of data.dates || []) {
    if (!d || !isoParse(d.date)) continue;
    if (d.kind === 'birthday' && d.personId) linked.add(d.personId);
    addEvent({ uid: 'date-' + _icsUidPart(d.id) + '@noa', date: d.date, title: d.title || 'תאריך', description: d.notes || '', yearly: d.recurring === 'yearly', remindDays: Array.isArray(d.remindDays) ? d.remindDays : [] });
  }
  for (const p of data.people || []) {
    if (!p || !isoParse(p.birthday) || linked.has(p.id)) continue;
    addEvent({ uid: 'person-' + _icsUidPart(p.id) + '-birthday@noa', date: p.birthday, title: 'יום ההולדת של ' + (p.name || ''), description: p.relation || '', yearly: true, remindDays: DEFAULT_REMIND.person, categories: 'יום הולדת' });
  }
  for (const p of data.plans || []) {
    if (!p || p.done || !isoParse(p.due)) continue;
    addEvent({ uid: 'plan-' + _icsUidPart(p.id) + '@noa', date: p.due, title: p.title || 'משימה', description: p.notes || '', remindDays: DEFAULT_REMIND.task });
  }
  if (includeHolidays) {
    const y = isoParse(from).y, years = options.holidayYears ?? 3;
    for (const h of holidays(y, y + years - 1)) {
      if (h.date < from) continue;
      if (h.key === 'valentine') continue; // exported once below as a yearly event
      addEvent({ uid: 'holiday-' + _icsUidPart(h.id) + '@noa', date: h.date, title: h.title, description: [h.subtitle, h.hebrew].filter(Boolean).join(' · '), remindDays: h.remindDays, categories: 'חג' });
    }
    addEvent({ uid: 'holiday-valentine@noa', date: isoMake(y, 2, 14), title: 'ולנטיין', description: 'יום האהבה', yearly: true, remindDays: [7, 1], categories: 'חג' });
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Noa//Noa Relationship Organizer//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEscape(options.calName || her), 'X-WR-CALDESC:' + icsEscape('התאריכים החשובים — מהאפליקציה ' + her)];
  for (const e of events) lines.push(...e.lines);
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

// Count of VEVENTs in an .ics text (for "ייצאנו 12 תאריכים").
export function icsEventCount(text) { return (String(text).match(/^BEGIN:VEVENT\r?$/gm) || []).length; }

// 'noa-dates-2026-10-18.ics' (ASCII, so every download manager keeps it).
export function icsFileName(today) { return 'noa-dates-' + (isoParse(today) ? today : isoToday()) + '.ics'; }
