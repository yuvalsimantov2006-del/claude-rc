import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildICS, icsEscape, icsFold, icsEventCount, icsFileName } from './ics.js';
import { hebrewCalendarSupported } from './dates.js';

const NOW = new Date(Date.UTC(2026, 9, 18, 7, 5, 9));
const DATA = {
  version: 1,
  profile: { her: 'נועה', together: '2025-01-14', herBirthday: '2004-02-29' },
  dates: [
    { id: 'd1', title: 'יום ההולדת של אמא שלה, מיכל; לא לשכוח סחלבים!', kind: 'birthday', date: '1970-11-07', recurring: 'yearly', remindDays: [7, 1], personId: 'p-mom', notes: 'שורה ראשונה\nשורה שנייה עם \\ לוכסן' },
    { id: 'd2', title: 'ההופעה', kind: 'event', date: '2026-12-31', recurring: 'none', remindDays: [3] },
    { id: 'd3', title: 'יום מעוברת', kind: 'other', date: '2028-02-28', recurring: 'none', remindDays: [] },
    { id: 'd/4 weird id', title: 'מזהה מוזר', kind: 'other', date: '2026-11-01', recurring: 'none', remindDays: [0, -2, 400, 2, 2] },
    { id: 'd5', title: 'פגום', kind: 'other', date: 'xx', recurring: 'none' },
  ],
  people: [
    { id: 'p-mom', name: 'מיכל', relation: 'אמא', birthday: '1970-11-07' },
    { id: 'p-sis', name: 'שירה', relation: 'אחות', birthday: '1999-12-02' },
  ],
  plans: [
    { id: 't1', title: 'להזמין מקום', type: 'task', due: '2026-10-21', done: false },
    { id: 't2', title: 'כבר בוצע', type: 'task', due: '2026-10-22', done: true },
  ],
  prefs: { holidays: true },
};

// Physical lines → logical lines (RFC 5545 §3.1 unfolding).
const unfold = text => text.replace(/\r\n[ \t]/g, '');
const logical = text => unfold(text).split('\r\n').filter(Boolean);
const events = text => {
  const out = [];
  let cur = null;
  for (const l of logical(text)) {
    if (l === 'BEGIN:VEVENT') cur = [];
    else if (l === 'END:VEVENT') { out.push(cur); cur = null; }
    else if (cur) cur.push(l);
  }
  return out;
};
const prop = (ev, name) => { const l = ev.find(x => x.startsWith(name + ':') || x.startsWith(name + ';')); return l ? l.slice(l.indexOf(':') + 1) : null; };
const unescape = v => v.replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1');

test('escaping TEXT values', () => {
  assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  assert.equal(icsEscape('שורה\r\nשנייה\rשלישית'), 'שורה\\nשנייה\\nשלישית');
  assert.equal(icsEscape(null), '');
  assert.equal(icsEscape(42), '42');
  assert.equal(unescape(icsEscape('x, y; z \\ w\nq')), 'x, y; z \\ w\nq');
});

test('folding at 75 octets never splits a UTF-8 character', () => {
  const samples = [
    'SUMMARY:' + 'יום ההולדת של נועה '.repeat(12),
    'DESCRIPTION:' + 'a'.repeat(200),
    'SUMMARY:' + '💛🎂🌅'.repeat(30),
    'X:' + 'אב'.repeat(3) + 'a' + 'ג'.repeat(80),
    'SHORT:ok',
  ];
  for (const s of samples) {
    const folded = icsFold(s);
    const lines = folded.split('\r\n');
    lines.forEach((l, i) => {
      assert.ok(Buffer.byteLength(l, 'utf8') <= 75, `line ${i} is ${Buffer.byteLength(l)} octets`);
      if (i > 0) assert.equal(l[0], ' ', 'continuation starts with a space');
      // No lone surrogate at either edge (emoji kept whole) and the bytes decode back to the same text.
      assert.equal(Buffer.from(l, 'utf8').toString('utf8'), l);
      assert.ok(!/[\uD800-\uDBFF]$/.test(l) && !/^ ?[\uDC00-\uDFFF]/.test(l));
    });
    assert.equal(folded.replace(/\r\n /g, ''), s, 'unfolds to the original');
    if (Buffer.byteLength(s) <= 75) assert.equal(lines.length, 1);
  }
  // A 75-octet line is not folded; 76 is.
  assert.equal(icsFold('X:' + 'a'.repeat(73)).split('\r\n').length, 1);
  assert.equal(icsFold('X:' + 'a'.repeat(74)).split('\r\n').length, 2);
  // Hebrew letters are 2 octets: 'X:' + 36 letters = 74 octets fits; 37 letters = 76 folds.
  assert.equal(icsFold('X:' + 'ש'.repeat(36)).split('\r\n').length, 1);
  assert.equal(icsFold('X:' + 'ש'.repeat(37)).split('\r\n').length, 2);
});

test('calendar envelope: CRLF everywhere, headers, name', () => {
  const ics = buildICS(DATA, { from: '2026-10-18', now: NOW });
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'no bare LF');
  assert.ok(!/\r(?!\n)/.test(ics), 'no bare CR');
  for (const l of ics.split('\r\n')) assert.ok(Buffer.byteLength(l) <= 75, l);
  const L = logical(ics);
  assert.equal(L[0], 'BEGIN:VCALENDAR');
  assert.equal(L[L.length - 1], 'END:VCALENDAR');
  for (const h of ['VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:נועה']) assert.ok(L.includes(h), h);
  assert.ok(L.some(l => /^PRODID:-\/\/.+\/\/HE$/.test(l)));
  assert.equal(L.filter(l => l === 'BEGIN:VEVENT').length, L.filter(l => l === 'END:VEVENT').length);
  assert.equal(L.filter(l => l === 'BEGIN:VALARM').length, L.filter(l => l === 'END:VALARM').length);
  assert.equal(icsEventCount(ics), events(ics).length);
  assert.ok(buildICS({ profile: { her: 'מאיה' } }, { now: NOW }).includes('X-WR-CALNAME:מאיה\r\n'), 'the brand follows her name');
});

test('every event: UID@noa unique and stable, DTSTAMP UTC, all-day dates', () => {
  const a = buildICS(DATA, { from: '2026-10-18', now: NOW });
  const b = buildICS(DATA, { from: '2026-10-18', now: new Date(Date.UTC(2027, 0, 1)) });
  const evA = events(a), evB = events(b);
  const uids = evA.map(e => prop(e, 'UID'));
  assert.equal(new Set(uids).size, uids.length, 'unique UIDs');
  assert.deepEqual(evB.map(e => prop(e, 'UID')), uids, 'stable across exports');
  for (const e of evA) {
    assert.match(prop(e, 'UID'), /^[A-Za-z0-9._-]+@noa$/);
    assert.equal(prop(e, 'DTSTAMP'), '20261018T070509Z');
    const start = e.find(l => l.startsWith('DTSTART'));
    const end = e.find(l => l.startsWith('DTEND'));
    assert.match(start, /^DTSTART;VALUE=DATE:\d{8}$/);
    assert.match(end, /^DTEND;VALUE=DATE:\d{8}$/);
    const s = start.slice(-8), en = end.slice(-8);
    const next = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6) + 1)).toISOString().slice(0, 10).replace(/-/g, '');
    assert.equal(en, next, 'DTEND is the next day');
    assert.ok(prop(e, 'SUMMARY'));
    assert.equal(prop(e, 'TRANSP'), 'TRANSPARENT');
  }
  assert.ok(uids.includes('date-d-4-weird-id@noa'), 'unsafe id characters are replaced');
});

test('recurring dates get RRULE:FREQ=YEARLY; Feb 29 uses the last day of February', () => {
  const ev = events(buildICS(DATA, { from: '2026-10-18', now: NOW }));
  const byUid = Object.fromEntries(ev.map(e => [prop(e, 'UID'), e]));
  const her = byUid['her-birthday@noa'];
  assert.equal(unescape(prop(her, 'SUMMARY')), 'יום ההולדת של נועה');
  assert.equal(prop(her, 'DTSTART'), '20040229');
  assert.equal(prop(her, 'RRULE'), 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
  assert.equal(prop(byUid['date-d1@noa'], 'RRULE'), 'FREQ=YEARLY');
  assert.equal(prop(byUid['date-d2@noa'], 'RRULE'), null, 'one-off dates do not repeat');
  assert.equal(prop(byUid['date-d2@noa'], 'DTSTART'), '20261231');
  assert.equal(prop(byUid['date-d2@noa'], 'DTEND'), '20270101', 'DTEND crosses the year');
  assert.equal(prop(byUid['date-d3@noa'], 'DTEND'), '20280229', 'DTEND lands on a leap day');
  const anniv = byUid['together-anniversary@noa'];
  assert.equal(prop(anniv, 'DTSTART'), '20260114', 'the series starts at the first anniversary');
  assert.equal(prop(anniv, 'RRULE'), 'FREQ=YEARLY');
  const leapTogether = events(buildICS({ profile: { together: '2024-02-29' } }, { now: NOW, includeMilestones: false }));
  assert.equal(prop(leapTogether[0], 'DTSTART'), '20250228');
  assert.equal(prop(leapTogether[0], 'RRULE'), 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
});

test('titles and notes survive escaping and folding', () => {
  const ev = events(buildICS(DATA, { from: '2026-10-18', now: NOW }));
  const d1 = ev.find(e => prop(e, 'UID') === 'date-d1@noa');
  assert.equal(unescape(prop(d1, 'SUMMARY')), DATA.dates[0].title);
  assert.equal(unescape(prop(d1, 'DESCRIPTION')), DATA.dates[0].notes);
  assert.ok(prop(d1, 'SUMMARY').includes('\\,') && prop(d1, 'SUMMARY').includes('\\;'));
});

test('alarms: -P{n}D per remind day plus the same-day 09:00 alarm', () => {
  const ev = events(buildICS(DATA, { from: '2026-10-18', now: NOW }));
  const triggers = e => e.filter(l => l.startsWith('TRIGGER:')).map(l => l.slice(8));
  const byUid = Object.fromEntries(ev.map(e => [prop(e, 'UID'), e]));
  assert.deepEqual(triggers(byUid['date-d1@noa']), ['-P7D', '-P1D', 'PT9H']);
  assert.deepEqual(triggers(byUid['date-d2@noa']), ['-P3D', 'PT9H']);
  assert.deepEqual(triggers(byUid['date-d3@noa']), ['PT9H']);
  assert.deepEqual(triggers(byUid['date-d-4-weird-id@noa']), ['-P2D', 'PT9H'], 'invalid and repeated remind days dropped');
  assert.deepEqual(triggers(byUid['her-birthday@noa']), ['-P14D', '-P7D', '-P1D', 'PT9H']);
  for (const e of ev) {
    const a = e.join('\n');
    const alarms = a.split('BEGIN:VALARM').slice(1);
    assert.ok(alarms.length >= 1);
    for (const al of alarms) { assert.ok(al.includes('ACTION:DISPLAY')); assert.ok(/DESCRIPTION:.+/.test(al)); assert.ok(/TRIGGER:/.test(al)); }
  }
  // alarmHour moves every alarm to that hour (and stays valid RFC 5545 durations).
  const at8 = events(buildICS(DATA, { from: '2026-10-18', now: NOW, alarmHour: 8 }));
  const d1 = at8.find(e => prop(e, 'UID') === 'date-d1@noa');
  assert.deepEqual(triggers(d1), ['-P6DT16H', '-PT16H', 'PT8H']);
  for (const t of at8.flatMap(triggers)) assert.match(t, /^-?P(\d+D)?(T\d+H)?$/);
});

test('sources: people, tasks, milestones, holidays', () => {
  const ics = buildICS(DATA, { from: '2026-10-18', now: NOW });
  const uids = events(ics).map(e => prop(e, 'UID'));
  assert.ok(uids.includes('person-p-sis-birthday@noa'));
  assert.ok(!uids.includes('person-p-mom-birthday@noa'), 'a person with a linked birthday date is not duplicated');
  assert.ok(uids.includes('plan-t1@noa'));
  assert.ok(!uids.includes('plan-t2@noa'), 'done plans are skipped');
  assert.ok(!uids.some(u => u.includes('d5')), 'invalid dates are skipped');
  assert.ok(uids.includes('milestone-days-700@noa'));
  assert.ok(uids.includes('milestone-days-1000@noa'));
  assert.ok(!uids.some(u => u.startsWith('milestone-days-100@')), 'past milestones are not exported');
  assert.ok(uids.includes('holiday-valentine@noa'));
  if (hebrewCalendarSupported()) {
    assert.ok(uids.includes('holiday-pesach-5787@noa'));
    assert.ok(uids.includes('holiday-roshhashana-5788@noa'));
    const pesach = events(ics).find(e => prop(e, 'UID') === 'holiday-pesach-5787@noa');
    assert.equal(prop(pesach, 'DTSTART'), '20270422');
    assert.equal(unescape(prop(pesach, 'SUMMARY')), 'פסח');
  }
  const noExtras = events(buildICS(DATA, { from: '2026-10-18', now: NOW, includeHolidays: false, includeMilestones: false })).map(e => prop(e, 'UID'));
  assert.ok(!noExtras.some(u => u.startsWith('holiday-') || u.startsWith('milestone-')));
  assert.ok(noExtras.includes('together-anniversary@noa'), 'the anniversary always comes along');
  // Default for holidays follows prefs.holidays.
  const prefsOff = events(buildICS({ ...DATA, prefs: { holidays: false } }, { from: '2026-10-18', now: NOW })).map(e => prop(e, 'UID'));
  assert.ok(!prefsOff.some(u => u.startsWith('holiday-')));
});

test('empty data still makes a valid calendar', () => {
  const ics = buildICS({}, { now: NOW });
  assert.equal(icsEventCount(ics), 0);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(buildICS(null, { now: NOW }).includes('X-WR-CALNAME:נועה'));
});

test('file name', () => {
  assert.equal(icsFileName('2026-10-18'), 'noa-dates-2026-10-18.ics');
  assert.match(icsFileName(), /^noa-dates-\d{4}-\d{2}-\d{2}\.ics$/);
});
