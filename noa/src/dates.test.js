// Run in Israel's time zone, so the DST weeks (late March, late October) are exercised for real.
process.env.TZ = 'Asia/Jerusalem';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoParse, isoValid, isoMake, isoToday, isoOf, isLeapYear, daysInMonth, isoWeekday, daysBetween, isoAddDays, isoAddMonths,
  occurrenceInYear, nextOccurrence, occurrencesBetween, formatCount, heCount, heAnd, countdownText, relativePast, relativeText,
  age, togetherBreakdown, monthiversaries, milestones, MILESTONE_DAYS, formatDate, monthName, weekdayShort, weekdayName,
  hebrewCalendarSupported, hebrewParts, gematria, hebrewDate, holidays, upcoming, dueReminders, DATE_KIND_ICONS, DEFAULT_REMIND,
} from './dates.js';
import { NOA_LOGIC_ICONS } from './content.js';

test('ISO parsing and validation', () => {
  assert.deepEqual(isoParse('2026-06-02'), { y: 2026, m: 6, d: 2 });
  assert.equal(isoParse('2026-02-29'), null);
  assert.deepEqual(isoParse('2028-02-29'), { y: 2028, m: 2, d: 29 });
  assert.equal(isoParse('2026-13-01'), null);
  assert.equal(isoParse('2026-00-10'), null);
  assert.equal(isoParse('2026-04-31'), null);
  assert.equal(isoParse(''), null);
  assert.equal(isoParse(null), null);
  assert.equal(isoParse(20260602), null);
  assert.equal(isoParse(new Date('invalid')), null);
  assert.deepEqual(isoParse('2026-06-02T10:00:00.000Z'), { y: 2026, m: 6, d: 2 });
  assert.equal(isoValid('2026-06-02'), true);
  assert.equal(isoValid('2026-6-2'), false);
  assert.equal(isoValid('2026-06-02T00:00'), false);
  assert.equal(isoMake(987, 1, 5), '0987-01-05');
  assert.equal(isoOf('2026-06-02T23:59:00Z'), '2026-06-02');
  assert.equal(isoOf(null), null);
});

test('local "today" in Israel, including just after midnight on DST change days', () => {
  assert.equal(isoToday(new Date(2026, 2, 27, 0, 30)), '2026-03-27'); // DST starts Fri 27.3.2026
  assert.equal(isoToday(new Date(2026, 9, 25, 0, 30)), '2026-10-25'); // DST ends Sun 25.10.2026
  assert.equal(isoToday(new Date(2026, 9, 24, 23, 59)), '2026-10-24');
  assert.equal(isoOf(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  assert.match(isoToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test('leap years and month lengths', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2026), false);
  assert.equal(isLeapYear(2028), true);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 12), 31);
  assert.equal(daysInMonth(2026, 4), 30);
});

test('daysBetween counts calendar days across DST, year ends and leap days', () => {
  assert.equal(daysBetween('2026-03-26', '2026-03-28'), 2);
  assert.equal(daysBetween('2026-03-27', '2026-03-28'), 1);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(daysBetween('2026-10-25', '2026-10-26'), 1);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2);
  assert.equal(daysBetween('2027-02-28', '2027-03-01'), 1);
  assert.equal(daysBetween('2026-06-02', '2026-06-02'), 0);
  assert.equal(daysBetween('2026-06-10', '2026-06-02'), -8);
  assert.equal(daysBetween('2025-01-14', '2026-10-18'), 642);
  assert.equal(daysBetween('2026-01-01', '2027-01-01'), 365);
  assert.equal(daysBetween('2028-01-01', '2029-01-01'), 366);
  assert.equal(daysBetween('bad', '2026-01-01'), null);
  // Every day of 2026 is exactly one day after the previous one (no DST hour leaks into a day count).
  let d = '2026-01-01';
  for (let i = 0; i < 365; i++) { const n = isoAddDays(d, 1); assert.equal(daysBetween(d, n), 1, d); d = n; }
  assert.equal(d, '2027-01-01');
});

test('adding days and months', () => {
  assert.equal(isoAddDays('2026-03-26', 3), '2026-03-29');
  assert.equal(isoAddDays('2026-10-24', 2), '2026-10-26');
  assert.equal(isoAddDays('2026-12-31', 1), '2027-01-01');
  assert.equal(isoAddDays('2028-02-28', 1), '2028-02-29');
  assert.equal(isoAddDays('2027-03-01', -1), '2027-02-28');
  assert.equal(isoAddDays('nope', 1), null);
  assert.equal(isoAddMonths('2025-01-31', 1), '2025-02-28');
  assert.equal(isoAddMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(isoAddMonths('2025-01-31', 2), '2025-03-31');
  assert.equal(isoAddMonths('2025-11-15', 3), '2026-02-15');
  assert.equal(isoAddMonths('2025-03-31', -1), '2025-02-28');
  assert.equal(isoAddMonths('2025-01-14', 12), '2026-01-14');
  assert.equal(isoAddMonths('2025-01-14', -13), '2023-12-14');
});

test('weekdays', () => {
  assert.equal(isoWeekday('2026-06-02'), 2); // Tuesday
  assert.equal(weekdayShort('2026-06-02'), 'ג׳');
  assert.equal(weekdayName('2026-10-18'), 'ראשון');
  assert.equal(weekdayShort('2026-10-24'), 'ש׳');
  assert.equal(weekdayShort('x'), '');
});

test('nextOccurrence: yearly, once, Feb 29 → Feb 28 in common years', () => {
  assert.equal(nextOccurrence('2004-06-02', 'yearly', '2026-05-01'), '2026-06-02');
  assert.equal(nextOccurrence('2004-06-02', 'yearly', '2026-06-02'), '2026-06-02');
  assert.equal(nextOccurrence('2004-06-02', 'yearly', '2026-06-03'), '2027-06-02');
  assert.equal(nextOccurrence('2004-01-05', 'yearly', '2026-12-20'), '2027-01-05');
  assert.equal(nextOccurrence('2004-12-31', 'yearly', '2027-01-01'), '2027-12-31');
  assert.equal(nextOccurrence('2004-02-29', 'yearly', '2026-03-01'), '2027-02-28');
  assert.equal(nextOccurrence('2004-02-29', 'yearly', '2027-02-28'), '2027-02-28');
  assert.equal(nextOccurrence('2004-02-29', 'yearly', '2027-03-01'), '2028-02-29');
  assert.equal(nextOccurrence('2004-02-29', 'yearly', '2028-01-01'), '2028-02-29');
  assert.equal(nextOccurrence('2004-02-29', 'yearly', '2028-02-29'), '2028-02-29');
  // A yearly date that has not happened yet starts on its own date.
  assert.equal(nextOccurrence('2027-03-01', 'yearly', '2026-10-18'), '2027-03-01');
  // Once: still ahead → itself; today → itself; past → null.
  assert.equal(nextOccurrence('2026-11-01', 'none', '2026-10-18'), '2026-11-01');
  assert.equal(nextOccurrence('2026-10-18', 'none', '2026-10-18'), '2026-10-18');
  assert.equal(nextOccurrence('2026-10-17', 'none', '2026-10-18'), null);
  assert.equal(nextOccurrence('2026-10-17', 'once', '2026-10-18'), null);
  assert.equal(nextOccurrence('bad', 'yearly', '2026-10-18'), null);
  assert.match(nextOccurrence('2000-01-01'), /^\d{4}-01-01$/); // default: yearly from today
  assert.equal(occurrenceInYear('2004-02-29', 2026), '2026-02-28');
  assert.equal(occurrenceInYear('2004-02-29', 2028), '2028-02-29');
});

test('occurrencesBetween lists every yearly hit in a window', () => {
  assert.deepEqual(occurrencesBetween('2004-06-02', 'yearly', '2026-01-01', '2028-06-02'), ['2026-06-02', '2027-06-02', '2028-06-02']);
  assert.deepEqual(occurrencesBetween('2004-06-02', 'yearly', '2026-06-03', '2027-06-01'), []);
  assert.deepEqual(occurrencesBetween('2026-07-01', 'none', '2026-01-01', '2026-12-31'), ['2026-07-01']);
  assert.deepEqual(occurrencesBetween('2026-07-01', 'none', '2026-08-01', '2026-12-31'), []);
  assert.deepEqual(occurrencesBetween('2027-03-01', 'yearly', '2026-01-01', '2028-12-31'), ['2027-03-01', '2028-03-01']);
  assert.deepEqual(occurrencesBetween('2004-02-29', 'yearly', '2026-01-01', '2028-12-31'), ['2026-02-28', '2027-02-28', '2028-02-29']);
});

test('Hebrew counting: singular, dual and plural forms', () => {
  assert.equal(heCount(1, 'day'), 'יום אחד');
  assert.equal(heCount(1, 'day', true), 'יום');
  assert.equal(heCount(2, 'day'), 'יומיים');
  assert.equal(heCount(3, 'day'), '3 ימים');
  assert.equal(heCount(1000, 'day'), '1,000 ימים');
  assert.equal(heCount(1, 'week'), 'שבוע');
  assert.equal(heCount(2, 'week'), 'שבועיים');
  assert.equal(heCount(3, 'week'), '3 שבועות');
  assert.equal(heCount(1, 'month'), 'חודש');
  assert.equal(heCount(2, 'month'), 'חודשיים');
  assert.equal(heCount(11, 'month'), '11 חודשים');
  assert.equal(heCount(1, 'year'), 'שנה');
  assert.equal(heCount(2, 'year'), 'שנתיים');
  assert.equal(heCount(10, 'year'), '10 שנים');
  assert.equal(heCount(2, 'hour'), 'שעתיים');
  assert.equal(formatCount(1234567), '1,234,567');
  assert.equal(formatCount(999), '999');
  assert.equal(heAnd(['שנה']), 'שנה');
  assert.equal(heAnd(['שנה', 'חודש']), 'שנה וחודש');
  assert.equal(heAnd(['שנה', '9 חודשים', '3 ימים']), 'שנה, 9 חודשים ו־3 ימים');
  assert.equal(heAnd(['שנתיים', 'יומיים']), 'שנתיים ויומיים');
  assert.equal(heAnd([]), '');
});

test('countdownText: natural Hebrew for days ahead', () => {
  const cases = {
    0: 'היום', 1: 'מחר', 2: 'מחרתיים', 3: 'בעוד 3 ימים', 6: 'בעוד 6 ימים', 7: 'בעוד שבוע', 8: 'בעוד 8 ימים',
    12: 'בעוד 12 ימים', 14: 'בעוד שבועיים', 21: 'בעוד 3 שבועות', 28: 'בעוד 4 שבועות', 29: 'בעוד 29 ימים',
    30: 'בעוד חודש', 39: 'בעוד חודש', 45: 'בעוד חודש וחצי', 60: 'בעוד חודשיים', 92: 'בעוד 3 חודשים',
    200: 'בעוד 7 חודשים', 340: 'בעוד 11 חודשים', 365: 'בעוד שנה', 548: 'בעוד שנה וחצי', 730: 'בעוד שנתיים', 1100: 'בעוד 3 שנים',
  };
  for (const [n, text] of Object.entries(cases)) assert.equal(countdownText(+n), text, 'days ' + n);
  assert.equal(countdownText(45, { precise: true }), 'בעוד 45 ימים');
  assert.equal(countdownText(14, { precise: true }), 'בעוד 14 ימים');
  assert.equal(countdownText(2, { precise: true }), 'בעוד יומיים');
  assert.equal(countdownText(3, { prefix: 'עוד' }), 'עוד 3 ימים');
  assert.equal(countdownText(12, { prefix: 'עוד' }), 'עוד 12 ימים');
  assert.equal(countdownText(-1), 'אתמול');
  assert.equal(countdownText(null), '');
  assert.equal(countdownText(NaN), '');
});

test('relativePast: natural Hebrew for days ago', () => {
  const cases = {
    0: 'היום', 1: 'אתמול', 2: 'שלשום', 5: 'לפני 5 ימים', 7: 'לפני שבוע', 10: 'לפני שבוע', 14: 'לפני שבועיים',
    21: 'לפני 3 שבועות', 30: 'לפני חודש', 45: 'לפני חודש וחצי', 61: 'לפני חודשיים', 100: 'לפני 3 חודשים',
    366: 'לפני שנה', 500: 'לפני שנה וחצי', 760: 'לפני שנתיים', 1500: 'לפני 4 שנים',
  };
  for (const [n, text] of Object.entries(cases)) assert.equal(relativePast(+n), text, 'days ' + n);
  assert.equal(relativeText('2026-10-11', '2026-10-18'), 'לפני שבוע');
  assert.equal(relativeText('2026-10-20', '2026-10-18'), 'מחרתיים');
  assert.equal(relativeText('2026-10-16', '2026-10-18'), 'שלשום');
  assert.equal(relativeText('2026-10-18', '2026-10-18'), 'היום');
  assert.equal(relativeText('nope', '2026-10-18'), '');
});

test('age: completed years, Feb 29 birthdays turn on Feb 28', () => {
  assert.equal(age('2004-06-02', '2026-06-01'), 21);
  assert.equal(age('2004-06-02', '2026-06-02'), 22);
  assert.equal(age('2004-06-02', '2026-12-31'), 22);
  assert.equal(age('2004-02-29', '2026-02-27'), 21);
  assert.equal(age('2004-02-29', '2026-02-28'), 22);
  assert.equal(age('2004-02-29', '2028-02-28'), 23);
  assert.equal(age('2004-02-29', '2028-02-29'), 24);
  assert.equal(age('2027-01-01', '2026-10-18'), null);
  assert.equal(age('2026-10-18', '2026-10-18'), 0);
  assert.equal(age('bad', '2026-10-18'), null);
});

test('togetherBreakdown: years, months, days and the Hebrew sentence', () => {
  const b = togetherBreakdown('2025-01-14', '2026-10-17');
  assert.deepEqual({ ...b, text: undefined, short: undefined }, { years: 1, months: 9, days: 3, totalDays: 641, text: undefined, short: undefined });
  assert.equal(b.text, 'שנה, 9 חודשים ו־3 ימים');
  assert.equal(b.short, '641 ימים');
  assert.equal(togetherBreakdown('2024-10-18', '2026-10-18').text, 'שנתיים');
  assert.equal(togetherBreakdown('2023-09-17', '2026-10-18').text, '3 שנים, חודש ויום');
  assert.equal(togetherBreakdown('2026-08-16', '2026-10-18').text, 'חודשיים ויומיים');
  assert.equal(togetherBreakdown('2025-10-13', '2026-10-18').text, 'שנה ו־5 ימים');
  assert.equal(togetherBreakdown('2026-10-17', '2026-10-18').text, 'יום');
  assert.equal(togetherBreakdown('2026-10-16', '2026-10-18').text, 'יומיים');
  const zero = togetherBreakdown('2026-10-18', '2026-10-18');
  assert.equal(zero.totalDays, 0);
  assert.equal(zero.text, 'היום הראשון');
  // Month-end: Jan 31 + 1 month is Feb 28, so Mar 1 is "a month and a day".
  const me = togetherBreakdown('2025-01-31', '2025-03-01');
  assert.equal(me.months, 1);
  assert.equal(me.days, 1);
  assert.equal(me.text, 'חודש ויום');
  // Leap day start: on Feb 28 of a common year it is a full year.
  assert.equal(togetherBreakdown('2024-02-29', '2025-02-28').text, 'שנה');
  assert.equal(togetherBreakdown('2026-10-19', '2026-10-18'), null);
  assert.equal(togetherBreakdown('nope', '2026-10-18'), null);
  // Across Israeli DST changes nothing shifts.
  assert.equal(togetherBreakdown('2026-03-20', '2026-03-30').totalDays, 10);
});

test('monthiversaries: the first year plus the half-year marks', () => {
  const mv = monthiversaries('2025-01-31');
  assert.equal(mv.length, 12);
  assert.deepEqual(mv.map(m => m.months), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18]);
  assert.equal(mv[0].date, '2025-02-28');
  assert.equal(mv[1].date, '2025-03-31');
  assert.equal(mv[0].title, 'חודש ביחד');
  assert.equal(mv[1].title, 'חודשיים ביחד');
  assert.equal(mv[2].title, '3 חודשים ביחד');
  assert.equal(mv[5].title, 'חצי שנה ביחד');
  assert.equal(mv[11].title, 'שנה וחצי ביחד');
  assert.deepEqual(monthiversaries('bad'), []);
});

test('milestones: day counts, anniversaries and monthiversaries inside the window', () => {
  const all = milestones('2025-01-14', '2025-01-14', 3000);
  const dates = all.map(m => m.date);
  assert.deepEqual(dates, [...dates].sort(), 'sorted by date');
  const byKey = Object.fromEntries(all.map(m => [m.key, m]));
  assert.equal(byKey['days:100'].date, '2025-04-24');
  assert.equal(byKey['days:100'].title, '100 ימים ביחד');
  assert.equal(byKey['days:1000'].date, isoAddDays('2025-01-14', 1000));
  assert.equal(byKey['days:1000'].title, '1,000 ימים ביחד');
  assert.equal(byKey['days:2500'].title, '2,500 ימים ביחד');
  assert.equal(byKey['anniversary:1'].title, 'שנה ביחד');
  assert.equal(byKey['anniversary:2'].title, 'שנתיים ביחד');
  assert.equal(byKey['anniversary:3'].title, '3 שנים ביחד');
  assert.equal(byKey['anniversary:1'].date, '2026-01-14');
  // 365 days lands on the first anniversary (no Feb 29 in between) → merged into it.
  assert.equal(byKey['days:365'], undefined);
  assert.equal(byKey['anniversary:1'].days, 365);
  assert.equal(byKey['months:1'].title, 'חודש ביחד');
  assert.equal(byKey['months:6'].title, 'חצי שנה ביחד');
  assert.equal(byKey['months:1'].label, 'חודשייה');
  assert.equal(byKey['months:12'], undefined);
  for (const n of MILESTONE_DAYS.filter(n => n !== 365)) assert.ok(byKey['days:' + n], 'has ' + n);
  for (const m of all) assert.equal(m.daysLeft, daysBetween('2025-01-14', m.date));
  // A Feb 29 inside the first year: 365 days is the day before the anniversary → both stay.
  const leap = milestones('2027-06-01', '2027-06-01', 400);
  const k = Object.fromEntries(leap.map(m => [m.key, m]));
  assert.equal(k['days:365'].date, '2028-05-31');
  assert.equal(k['anniversary:1'].date, '2028-06-01');
  // Window is inclusive on both ends; nothing before `from`.
  const win = milestones('2025-01-14', '2025-04-24', 0);
  assert.deepEqual(win.map(m => m.key), ['days:100']);
  assert.deepEqual(milestones('2025-01-14', '2026-10-18', 30), []);
  const next = milestones('2025-01-14', '2026-10-18', 60);
  assert.deepEqual(next.map(m => m.key), ['days:700']);
  assert.equal(next[0].daysLeft, 58);
  // Together since Feb 29: anniversaries on Feb 28 in common years.
  const f29 = milestones('2024-02-29', '2024-02-29', 1500);
  assert.equal(f29.find(m => m.key === 'anniversary:1').date, '2025-02-28');
  assert.equal(f29.find(m => m.key === 'anniversary:4').date, '2028-02-29');
  assert.deepEqual(milestones('bad', '2026-01-01', 100), []);
  // Far horizons keep going every 500 days.
  const far = milestones('2000-01-01', '2026-01-01', 1000);
  assert.ok(far.some(m => m.key === 'days:9500'), 'every 500 days after 3,000');
});

test('formatDate styles and month names', () => {
  assert.equal(formatDate('2026-06-02'), '2 ביוני');
  assert.equal(formatDate('2026-06-02', 'year'), '2 ביוני 2026');
  assert.equal(formatDate('2026-06-02', 'long'), 'יום ג׳, 2 ביוני 2026');
  assert.equal(formatDate('2026-06-02', 'full'), 'יום שלישי, 2 ביוני 2026');
  assert.equal(formatDate('2026-06-02', 'weekday'), 'יום ג׳, 2 ביוני');
  assert.equal(formatDate('2026-06-06', 'long'), 'שבת, 6 ביוני 2026');
  assert.equal(formatDate('2026-06-06', 'weekday'), 'שבת, 6 ביוני');
  assert.equal(formatDate('2026-06-06', 'full'), 'יום שבת, 6 ביוני 2026');
  assert.equal(formatDate('2026-06-05', 'long'), 'יום ו׳, 5 ביוני 2026');
  assert.equal(formatDate('2026-06-02', 'month'), 'יוני 2026');
  assert.equal(formatDate('2026-06-02', 'numeric'), '2.6.2026');
  assert.equal(formatDate('2026-06-02', 'auto', '2026-01-01'), '2 ביוני');
  assert.equal(formatDate('2027-06-02', 'auto', '2026-01-01'), '2 ביוני 2027');
  assert.equal(formatDate('2026-01-31'), '31 בינואר');
  assert.equal(formatDate('2026-03-15'), '15 במרץ');
  assert.equal(formatDate('bad'), '');
  assert.equal(monthName(1), 'ינואר');
  assert.equal(monthName(12), 'דצמבר');
});

test('gematria (Hebrew numerals)', () => {
  const cases = { 1: 'א׳', 5: 'ה׳', 10: 'י׳', 11: 'י״א', 15: 'ט״ו', 16: 'ט״ז', 17: 'י״ז', 20: 'כ׳', 24: 'כ״ד', 29: 'כ״ט', 30: 'ל׳', 5787: 'תשפ״ז', 5786: 'תשפ״ו', 5715: 'תשט״ו', 5716: 'תשט״ז', 5500: 'ת״ק', 5800: 'ת״ת', 5781: 'תשפ״א', 5790: 'תש״ץ', 5780: 'תש״ף', 5740: 'תש״ם', 5750: 'תש״ן', 5720: 'תש״ך', 5760: 'תש״ס' };
  for (const [n, s] of Object.entries(cases)) assert.equal(gematria(+n), s, String(n));
  assert.equal(gematria(5000), '');
});

const heb = hebrewCalendarSupported();

test('hebrewDate via Intl (or null when the runtime has no Hebrew calendar)', { skip: !heb && 'no Hebrew calendar in this runtime' }, () => {
  assert.equal(hebrewDate('2026-09-12'), 'א׳ בתשרי תשפ״ז');
  assert.equal(hebrewDate('2026-10-08'), 'כ״ז בתשרי תשפ״ז');
  assert.equal(hebrewDate('2026-10-18'), 'ז׳ בחשוון תשפ״ז');
  assert.equal(hebrewDate('2027-03-23'), 'י״ד באדר ב׳ תשפ״ז');
  assert.equal(hebrewDate('2027-02-20'), 'י״ג באדר א׳ תשפ״ז');
  assert.equal(hebrewDate('2026-03-03'), 'י״ד באדר תשפ״ו');
  assert.equal(hebrewDate('2026-07-29'), 'ט״ו באב תשפ״ו');
  assert.equal(hebrewDate('2026-10-08', { numerals: 'latin' }), '27 בתשרי 5787');
  assert.equal(hebrewDate('2026-10-08', { year: false }), 'כ״ז בתשרי');
  assert.deepEqual(hebrewParts('2027-04-22'), { day: 15, monthKey: 'nisan', month: 'ניסן', year: 5787 });
  // Day boundaries do not depend on the local clock: the Hebrew date of a civil day, every day of a DST week.
  assert.equal(hebrewParts('2026-03-27').day, hebrewParts('2026-03-26').day + 1);
  assert.equal(hebrewDate('bad'), null);
});

// Verified against the Hebrew calendar (Intl, ICU) and published calendars: Rosh Hashana 5787 = 12.9.2026,
// Pesach 5787 = 22.4.2027, Purim 5787 in Adar II = 23.3.2027, Hanukkah's first candle = the evening of 24 Kislev.
const KNOWN = {
  2026: { purim: '2026-03-03', pesach: '2026-04-02', shavuot: '2026-05-22', tubeav: '2026-07-29', roshhashana: '2026-09-12', hanukkah: '2026-12-04', valentine: '2026-02-14' },
  2027: { purim: '2027-03-23', pesach: '2027-04-22', shavuot: '2027-06-11', tubeav: '2027-08-18', roshhashana: '2027-10-02', hanukkah: '2027-12-24', valentine: '2027-02-14' },
  2028: { purim: '2028-03-12', pesach: '2028-04-11', shavuot: '2028-05-31', tubeav: '2028-08-07', roshhashana: '2028-09-21', hanukkah: '2028-12-12', valentine: '2028-02-14' },
};

test('holidays 2026–2028 match the known dates', { skip: !heb && 'no Hebrew calendar in this runtime' }, () => {
  const list = holidays(2026, 2028);
  assert.deepEqual(list.map(h => h.date), [...list.map(h => h.date)].sort());
  for (const [y, want] of Object.entries(KNOWN)) {
    const got = Object.fromEntries(list.filter(h => h.date.startsWith(y)).map(h => [h.key, h.date]));
    assert.deepEqual(got, want, 'year ' + y);
  }
  const pesach27 = list.find(h => h.id === 'pesach-5787');
  assert.equal(pesach27.date, '2027-04-22');
  assert.equal(pesach27.eve, '2027-04-21');
  assert.equal(pesach27.title, 'פסח');
  assert.equal(pesach27.hebrew, 'ט״ו בניסן תשפ״ז');
  assert.equal(list.find(h => h.id === 'roshhashana-5787').date, '2026-09-12');
  assert.equal(list.find(h => h.id === 'hanukkah-5787').hebrew, 'כ״ד בכסלו תשפ״ז');
  assert.equal(list.find(h => h.id === 'purim-5787').hebrew, 'י״ד באדר ב׳ תשפ״ז');
  assert.equal(list.find(h => h.key === 'tubeav').title, 'ט״ו באב');
  for (const h of list) {
    assert.equal(h.kind, 'holiday');
    assert.ok(h.title && h.icon && Array.isArray(h.remindDays));
    assert.ok(NOA_LOGIC_ICONS.includes(h.icon), h.icon);
  }
});

test('holiday structure holds for 2026–2040 (fixed gaps of the Hebrew calendar)', { skip: !heb && 'no Hebrew calendar in this runtime' }, () => {
  const list = holidays(2026, 2040);
  for (let y = 2026; y <= 2040; y++) {
    const of = key => list.filter(h => h.key === key && h.date.startsWith(String(y)));
    for (const key of ['valentine', 'purim', 'pesach', 'shavuot', 'tubeav', 'roshhashana']) assert.equal(of(key).length, 1, key + ' ' + y);
    const p = of('pesach')[0].date;
    assert.equal(daysBetween(of('purim')[0].date, p), 30, 'Purim → Pesach ' + y);
    assert.equal(daysBetween(p, of('shavuot')[0].date), 50, 'Pesach → Shavuot ' + y);
    assert.equal(daysBetween(p, of('tubeav')[0].date), 118, 'Pesach → Tu BeAv ' + y);
    assert.equal(daysBetween(p, of('roshhashana')[0].date), 163, 'Pesach → Rosh Hashana ' + y);
    assert.ok([0, 2, 4, 6].includes(isoWeekday(p)), 'לא בד״ו פסח: ' + y);
    assert.ok([1, 2, 4, 6].includes(isoWeekday(of('roshhashana')[0].date)), 'לא אד״ו ראש: ' + y);
  }
  // Hanukkah's first candle: 24 Kislev, once a year (a December date in this range).
  for (const h of list.filter(h => h.key === 'hanukkah')) { assert.equal(hebrewParts(h.date).day, 24); assert.equal(hebrewParts(h.date).monthKey, 'kislev'); }
});

test('holidays without a Hebrew calendar still give Valentine’s Day', () => {
  const list = holidays(2030);
  assert.ok(list.some(h => h.key === 'valentine' && h.date === '2030-02-14'));
});

const DATA = {
  version: 1,
  profile: { her: 'נועה', me: 'איתי', together: '2025-01-14', herBirthday: '2004-10-30' },
  dates: [
    { id: 'd-mom', title: 'יום ההולדת של אמא שלה', kind: 'birthday', date: '1970-11-07', recurring: 'yearly', remindDays: [7, 1], personId: 'p-mom' },
    { id: 'd-show', title: 'ההופעה בפארק', kind: 'event', date: '2026-11-12', recurring: 'none', remindDays: [3] },
    { id: 'd-old', title: 'משהו שעבר', kind: 'event', date: '2026-10-01', recurring: 'none', remindDays: [] },
    { id: 'd-newyear', title: 'ערב ראש השנה האזרחית', kind: 'other', date: '2025-12-31', recurring: 'yearly', remindDays: [2] },
    { id: 'd-bad', title: 'פגום', kind: 'event', date: 'not-a-date', recurring: 'none' },
  ],
  people: [
    { id: 'p-mom', name: 'מיכל', relation: 'אמא', birthday: '1970-11-07' },
    { id: 'p-sis', name: 'שירה', relation: 'אחות', birthday: '1999-12-02' },
    { id: 'p-none', name: 'דן', relation: 'אח', birthday: null },
  ],
  plans: [
    { id: 't1', title: 'להזמין מקום', type: 'task', due: '2026-10-21', done: false },
    { id: 't2', title: 'נעשה כבר', type: 'task', due: '2026-10-22', done: true },
    { id: 't3', title: 'באיחור', type: 'task', due: '2026-10-15', done: false },
    { id: 't4', title: 'הפתעה', type: 'surprise', due: '2026-10-30', done: false },
    { id: 't5', title: 'בלי תאריך', type: 'task', due: null, done: false },
  ],
  prefs: { holidays: false },
};

test('upcoming merges every source, sorted, with the full item shape', () => {
  const list = upcoming(DATA, '2026-10-18', 60);
  const dates = list.map(i => i.date);
  assert.deepEqual(dates, [...dates].sort());
  const keys = list.map(i => i.key);
  assert.equal(new Set(keys).size, keys.length, 'unique keys');
  for (const i of list) {
    for (const f of ['key', 'date', 'daysLeft', 'title', 'kind', 'icon', 'source', 'remindDays']) assert.ok(i[f] !== undefined, f + ' on ' + i.key);
    assert.ok('hebrew' in i);
    assert.equal(i.daysLeft, daysBetween('2026-10-18', i.date));
    assert.ok(i.daysLeft >= 0 && i.daysLeft <= 60);
    assert.ok(NOA_LOGIC_ICONS.includes(i.icon), i.icon);
    assert.ok(Array.isArray(i.remindDays));
  }
  const her = list.find(i => i.source.id === 'herBirthday');
  assert.equal(her.title, 'יום ההולדת של נועה');
  assert.equal(her.turns, 22);
  assert.equal(her.subtitle, 'בת 22');
  assert.equal(her.date, '2026-10-30');
  assert.equal(her.daysLeft, 12);
  assert.deepEqual(her.remindDays, DEFAULT_REMIND.herBirthday);
  // Her birthday sorts before the surprise planned for the same day.
  assert.ok(list.indexOf(her) < list.findIndex(i => i.source.id === 't4'));
  // The mom's birthday comes from the dated entry (linked person) and is not duplicated from people.
  const mom = list.filter(i => i.title.includes('אמא') || i.title.includes('מיכל'));
  assert.equal(mom.length, 1);
  assert.equal(mom[0].source.type, 'date');
  assert.equal(mom[0].turns, 56);
  assert.deepEqual(mom[0].remindDays, [7, 1]);
  const sis = list.find(i => i.source.type === 'person');
  assert.equal(sis.title, 'יום ההולדת של שירה');
  assert.equal(sis.subtitle, 'אחות');
  assert.equal(sis.turns, 27);
  assert.ok(list.some(i => i.source.id === 'd-show' && i.date === '2026-11-12'));
  assert.ok(!list.some(i => i.source.id === 'd-old'), 'a past one-off date is gone');
  assert.ok(!list.some(i => i.source.id === 'd-bad'));
  assert.ok(!list.some(i => i.source.id === 't2'), 'done tasks are skipped');
  assert.ok(!list.some(i => i.source.id === 't3'), 'overdue tasks only on request');
  assert.ok(!list.some(i => i.source.id === 't5'));
  const task = list.find(i => i.source.id === 't1');
  assert.equal(task.kind, 'task');
  assert.equal(task.icon, 'ListChecks');
  assert.equal(list.find(i => i.source.id === 't4').kind, 'plan');
  const ms = list.find(i => i.kind === 'milestone');
  assert.equal(ms.title, '700 ימים ביחד');
  assert.equal(ms.date, '2026-12-15');
  assert.ok(!list.some(i => i.kind === 'holiday'), 'holidays off in prefs');
});

test('upcoming: holidays, overdue tasks, options, year boundary', () => {
  const withHol = upcoming(DATA, '2026-10-18', 60, { holidays: true });
  const hanukkah = withHol.find(i => i.kind === 'holiday');
  if (heb) {
    assert.equal(hanukkah.title, 'נר ראשון של חנוכה');
    assert.equal(hanukkah.date, '2026-12-04');
    assert.equal(hanukkah.source.type, 'holiday');
  }
  const prefsOn = upcoming({ ...DATA, prefs: { holidays: true } }, '2026-10-18', 60);
  assert.equal(prefsOn.some(i => i.kind === 'holiday'), heb);
  const over = upcoming(DATA, '2026-10-18', 60, { overdue: true });
  const t3 = over.find(i => i.source.id === 't3');
  assert.equal(t3.overdue, true);
  assert.equal(t3.daysLeft, -3);
  assert.equal(over[0].source.id, 't3', 'overdue first');
  assert.ok(!upcoming(DATA, '2026-10-18', 60, { tasks: false }).some(i => i.kind === 'task'));
  assert.ok(!upcoming(DATA, '2026-10-18', 60, { milestones: false }).some(i => i.source.id === 'together'));
  assert.ok(!upcoming(DATA, '2026-10-18', 60, { people: false }).some(i => i.source.type === 'person'));
  assert.equal(upcoming(DATA, '2026-10-18', 60, { limit: 2 }).length, 2);
  // Across New Year: the yearly Dec 31 entry and Shira's birthday, then next year's anniversary.
  const ny = upcoming(DATA, '2026-12-20', 30);
  const nyE = ny.find(i => i.source.id === 'd-newyear');
  assert.equal(nyE.date, '2026-12-31');
  assert.equal(nyE.daysLeft, 11);
  assert.equal(ny.find(i => i.kind === 'anniversary').date, '2027-01-14');
  assert.equal(ny.find(i => i.kind === 'anniversary').title, 'שנתיים ביחד');
  // Horizon is inclusive: exactly 12 days ahead.
  assert.ok(upcoming(DATA, '2026-10-18', 12).some(i => i.source.id === 'herBirthday'));
  assert.ok(!upcoming(DATA, '2026-10-18', 11).some(i => i.source.id === 'herBirthday'));
  // A long horizon lists each yearly date once per year.
  const two = upcoming(DATA, '2026-10-18', 800).filter(i => i.source.id === 'herBirthday');
  assert.deepEqual(two.map(i => i.date), ['2026-10-30', '2027-10-30', '2028-10-30']);
  assert.deepEqual(two.map(i => i.turns), [22, 23, 24]);
  // Empty or missing data.
  assert.deepEqual(upcoming({}, '2026-10-18'), []);
  assert.deepEqual(upcoming(null, '2026-10-18'), []);
  assert.deepEqual(upcoming({ profile: { her: '' } }, '2026-10-18'), []);
  // Her name falls back to נועה; a renamed her is used.
  assert.equal(upcoming({ profile: { her: 'מאיה', herBirthday: '2000-10-20' } }, '2026-10-18')[0].title, 'יום ההולדת של מאיה');
  assert.equal(upcoming({ profile: { her: '  ', herBirthday: '2000-10-20' } }, '2026-10-18')[0].title, 'יום ההולדת של נועה');
});

test('upcoming across the Israeli DST weeks keeps whole-day counts', () => {
  const d = { profile: { herBirthday: '2000-03-29', together: null }, dates: [{ id: 'x', title: 'א', kind: 'event', date: '2026-10-27', recurring: 'none', remindDays: [] }] };
  assert.equal(upcoming(d, '2026-03-26', 10)[0].daysLeft, 3);
  assert.equal(upcoming(d, '2026-10-24', 10)[0].daysLeft, 3);
});

test('dueReminders: remind days and the day itself', () => {
  // 2026-10-23: her birthday in 7 days ([14,7,1]) and the task due in -2 (not overdue by default).
  let due = dueReminders(DATA, '2026-10-23');
  assert.ok(due.some(i => i.source.id === 'herBirthday' && i.reminder === 'ahead' && i.text === 'בעוד שבוע: יום ההולדת של נועה'));
  assert.ok(due.every(i => i.daysLeft === 0 || i.remindDays.includes(i.daysLeft)));
  due = dueReminders(DATA, '2026-10-30');
  const b = due.find(i => i.source.id === 'herBirthday');
  assert.equal(b.reminder, 'today');
  assert.equal(b.text, 'היום: יום ההולדת של נועה');
  // The show (remind [3]) three days before; nothing on a day without a reminder.
  assert.ok(dueReminders(DATA, '2026-11-09').some(i => i.source.id === 'd-show'));
  assert.ok(!dueReminders(DATA, '2026-11-08').some(i => i.source.id === 'd-show'));
  // A date with no remind days still reminds on the day.
  assert.ok(dueReminders({ dates: [{ id: 'z', title: 'ז', kind: 'event', date: '2026-11-01', recurring: 'none', remindDays: [] }] }, '2026-11-01').length === 1);
  assert.deepEqual(dueReminders({}, '2026-10-18'), []);
});

test('date-kind icons are shared names', () => {
  for (const icon of Object.values(DATE_KIND_ICONS)) assert.ok(NOA_LOGIC_ICONS.includes(icon), icon);
});
