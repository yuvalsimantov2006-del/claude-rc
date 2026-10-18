import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DATE_IDEAS, GESTURES, QUESTIONS, QUESTION_LEVELS, THIRTY_SIX, THIRTY_SIX_INTRO, GIFT_PROMPTS, GIFT_CATEGORIES, LOVE_LANGUAGES,
  OCCASIONS, RELATIONS, MOODS, FACT_PLACEHOLDERS, BUDGET_LEVELS, IDEA_WHERE, IDEA_WHEN, IDEA_SEASONS, IDEA_DURATIONS,
  pickDaily, randomPick, contentFilter, seededRandom, seasonOf, gestureOfDay, nextQuestion, giftNeedsHint, giftSuggestions, NOA_LOGIC_ICONS,
} from './content.js';
import { FACT_CATEGORIES, SIZE_FIELDS, LOVE_LANGUAGE_TYPES, PLACE_LOVED_BY, demoData } from './model.js';
import { ICON_PATHS } from './icons.js';

const HEB = /[א-ת]/;
const unique = (arr, what) => assert.equal(new Set(arr).size, arr.length, 'duplicate ' + what + ': ' + arr.filter((x, i) => arr.indexOf(x) !== i).join(', '));
const cleanText = (s, where) => {
  assert.equal(typeof s, 'string', where);
  assert.ok(s.length >= 2, where + ' is empty');
  assert.ok(HEB.test(s), where + ' has Hebrew');
  assert.equal(s, s.trim(), where + ' has edge spaces');
  assert.ok(!/ {2}/.test(s), where + ' has double spaces');
  assert.ok(!/undefined|null|TODO|lorem/i.test(s), where + ' has filler');
};

test('date ideas: ≥ 70, unique, every field valid', () => {
  assert.ok(DATE_IDEAS.length >= 70, 'count ' + DATE_IDEAS.length);
  unique(DATE_IDEAS.map(x => x.id), 'idea id');
  unique(DATE_IDEAS.map(x => x.title), 'idea title');
  unique(DATE_IDEAS.map(x => x.text), 'idea text');
  for (const x of DATE_IDEAS) {
    cleanText(x.title, x.id + ' title');
    cleanText(x.text, x.id + ' text');
    assert.ok(x.text.length >= 40, x.id + ' text is specific enough');
    assert.ok(Number.isInteger(x.budget) && x.budget >= 0 && x.budget <= 3, x.id + ' budget');
    assert.ok(['home', 'out'].includes(x.where), x.id + ' where');
    assert.ok(['day', 'evening', 'any'].includes(x.when), x.id + ' when');
    assert.ok(['summer', 'winter', 'any'].includes(x.season), x.id + ' season');
    assert.ok(Number.isInteger(x.minutes) && x.minutes > 0 && x.minutes <= 4320, x.id + ' minutes');
    assert.ok(Array.isArray(x.tags) && x.tags.length >= 1 && x.tags.every(t => HEB.test(t)), x.id + ' tags');
    assert.ok(typeof x.area === 'string' && x.area, x.id + ' area');
  }
  // A real spread: at home and out, free and splurge, both seasons, day and evening, all over the country.
  const count = f => DATE_IDEAS.filter(f).length;
  assert.ok(count(x => x.where === 'home') >= 15, 'home ideas');
  assert.ok(count(x => x.budget === 0) >= 10, 'free ideas');
  assert.ok(count(x => x.budget === 3) >= 5, 'splurge ideas');
  assert.ok(count(x => x.season === 'summer') >= 8 && count(x => x.season === 'winter') >= 8, 'seasons');
  assert.ok(count(x => x.when === 'day') >= 15 && count(x => x.when === 'evening') >= 15, 'times');
  for (const area of ['תל אביב', 'ירושלים', 'צפון', 'ים המלח']) assert.ok(DATE_IDEAS.some(x => x.area.includes(area)), area);
  for (const t of ['פיקניק בשקיעה בפארק הירקון', 'סיור אוכל בשוק הכרמל', 'זריחה במצדה', 'ערב סושי ביתי', 'טיילת בנמל יפו', 'כוכבים במכתש רמון', 'ערב משחקי קופסה', 'סדנת קרמיקה זוגית', 'שוק הפשפשים ביפו']) assert.ok(DATE_IDEAS.some(x => x.title === t), t);
});

test('gestures: ≥ 60, unique, effort 1..3 with every level present', () => {
  assert.ok(GESTURES.length >= 60, 'count ' + GESTURES.length);
  unique(GESTURES.map(x => x.id), 'gesture id');
  unique(GESTURES.map(x => x.text), 'gesture text');
  for (const g of GESTURES) { cleanText(g.text, g.id); assert.ok([1, 2, 3].includes(g.effort), g.id + ' effort'); }
  for (const e of [1, 2, 3]) assert.ok(GESTURES.filter(g => g.effort === e).length >= 12, 'effort ' + e);
});

test('questions: ≥ 80 in five levels, plus the 36', () => {
  assert.ok(QUESTIONS.length >= 80, 'count ' + QUESTIONS.length);
  assert.deepEqual(QUESTION_LEVELS.map(l => l.label), ['קליל', 'עמוק', 'חלומות', 'זוגיות', 'מצחיק']);
  unique(QUESTIONS.map(q => q.id), 'question id');
  unique(QUESTIONS.map(q => q.text), 'question text');
  const levels = new Set(QUESTION_LEVELS.map(l => l.id));
  const cats = new Set(FACT_CATEGORIES.map(c => c.id));
  for (const q of QUESTIONS) {
    cleanText(q.text, q.id);
    assert.ok(levels.has(q.level), q.id + ' level');
    assert.ok(/[?？]$/.test(q.text) || q.text.endsWith('.'), q.id + ' ends like a question');
    if (q.category) assert.ok(cats.has(q.category), q.id + ' category ' + q.category);
  }
  for (const l of levels) assert.ok(QUESTIONS.filter(q => q.level === l).length >= 14, 'level ' + l);
  assert.equal(THIRTY_SIX.length, 36);
  unique(THIRTY_SIX.map(q => q.id), '36 id');
  unique(THIRTY_SIX.map(q => q.text), '36 text');
  for (const s of [1, 2, 3]) assert.equal(THIRTY_SIX.filter(q => q.set === s).length, 12, 'set ' + s);
  THIRTY_SIX.forEach((q, i) => { assert.equal(q.n, i + 1); cleanText(q.text, q.id); });
  cleanText(THIRTY_SIX_INTRO, '36 intro');
  // No overlap between the deck and the 36 ids.
  for (const q of THIRTY_SIX) assert.ok(!QUESTIONS.some(x => x.id === q.id));
});

test('gift prompts: ≥ 40, valid categories, needs point at real fact categories, sizes and places', () => {
  assert.ok(GIFT_PROMPTS.length >= 40, 'count ' + GIFT_PROMPTS.length);
  unique(GIFT_PROMPTS.map(x => x.id), 'gift id');
  unique(GIFT_PROMPTS.map(x => x.title), 'gift title');
  const cats = new Set(GIFT_CATEGORIES.map(c => c.id));
  const facts = new Set(FACT_CATEGORIES.map(c => c.id)), sizes = new Set(SIZE_FIELDS.map(s => s.id));
  const places = new Set(PLACE_LOVED_BY.map(p => p.id)), loves = new Set(LOVE_LANGUAGE_TYPES.map(l => l.id));
  for (const g of GIFT_PROMPTS) {
    cleanText(g.title, g.id + ' title');
    cleanText(g.text, g.id + ' text');
    assert.ok(cats.has(g.category), g.id + ' category');
    assert.ok(Number.isInteger(g.budget) && g.budget >= 0 && g.budget <= 3, g.id + ' budget');
    if (g.needs) {
      assert.ok(Object.keys(g.needs).length >= 1);
      for (const [k, v] of Object.entries(g.needs)) {
        if (k === 'fact') assert.ok(facts.has(v), g.id + ' fact ' + v);
        else if (k === 'size') assert.ok(sizes.has(v), g.id + ' size ' + v);
        else if (k === 'place') assert.ok(places.has(v), g.id + ' place ' + v);
        else if (k === 'loveLanguage') assert.ok(loves.has(v), g.id + ' love ' + v);
        else assert.fail(g.id + ' unknown need ' + k);
      }
      assert.ok(giftNeedsHint(g).length > 0, g.id + ' hint');
    } else assert.equal(giftNeedsHint(g), '');
  }
  for (const c of cats) assert.ok(GIFT_PROMPTS.filter(g => g.category === c).length >= 2, 'category ' + c);
  assert.ok(GIFT_PROMPTS.filter(g => g.needs).length >= 30, 'most prompts are personal');
  assert.equal(giftNeedsHint(GIFT_PROMPTS.find(g => g.id === 'gp-ring')), 'המידה שלה: טבעת');
  assert.equal(giftNeedsHint(GIFT_PROMPTS.find(g => g.id === 'gp-bouquet')), 'מה רשום אצלך על פרחים');
});

test('love languages: the five ids of the model, three ideas each', () => {
  assert.deepEqual(LOVE_LANGUAGES.map(l => l.id), LOVE_LANGUAGE_TYPES.map(l => l.id));
  for (const l of LOVE_LANGUAGES) {
    cleanText(l.label, l.id);
    cleanText(l.line, l.id + ' line');
    assert.equal(l.ideas.length, 3, l.id);
    l.ideas.forEach((s, i) => cleanText(s, l.id + ' idea ' + i));
  }
});

test('occasions, relations, moods, placeholders and filter labels', () => {
  const labels = OCCASIONS.map(o => o.label);
  for (const want of ['יום הולדת', 'ולנטיין', 'ט״ו באב', 'חג', 'סתם כי בא לי', 'התנצלות']) assert.ok(labels.includes(want), want);
  assert.ok(labels.some(l => l.includes('שנה ביחד')));
  assert.ok(labels.some(l => l.includes('סיום תואר')));
  unique(OCCASIONS.map(o => o.id), 'occasion id');
  assert.ok(RELATIONS.length >= 15);
  unique(RELATIONS, 'relation');
  for (const r of ['אמא', 'אבא', 'אח', 'אחות', 'חברה טובה']) assert.ok(RELATIONS.includes(r), r);
  assert.ok(MOODS.length >= 8);
  unique(MOODS.map(m => m.emoji), 'mood');
  assert.deepEqual(Object.keys(FACT_PLACEHOLDERS).sort(), FACT_CATEGORIES.map(c => c.id).sort());
  for (const [k, v] of Object.entries(FACT_PLACEHOLDERS)) cleanText(v, 'placeholder ' + k);
  assert.deepEqual(BUDGET_LEVELS.map(b => b.short), ['חינם', '₪', '₪₪', '₪₪₪']);
  assert.deepEqual(IDEA_WHERE.map(x => x.id), ['home', 'out']);
  assert.deepEqual(IDEA_WHEN.map(x => x.id), ['day', 'evening', 'any']);
  assert.deepEqual(IDEA_SEASONS.map(x => x.id), ['summer', 'winter', 'any']);
  assert.ok(IDEA_DURATIONS.every((d, i, a) => !i || d.max > a[i - 1].max));
});

test('every icon this lane returns exists in src/icons.js', () => {
  const missing = NOA_LOGIC_ICONS.filter(n => !Object.prototype.hasOwnProperty.call(ICON_PATHS, n));
  assert.deepEqual(missing, []);
  const used = [...OCCASIONS, ...GIFT_CATEGORIES, ...QUESTION_LEVELS, ...IDEA_WHERE, ...IDEA_WHEN, ...IDEA_SEASONS].map(x => x.icon);
  for (const n of used) assert.ok(NOA_LOGIC_ICONS.includes(n), n);
});

test('pickDaily: deterministic, no repeats inside a cycle, exclude and skip', () => {
  const a = pickDaily(GESTURES, '2026-10-18', 'gesture');
  assert.equal(pickDaily(GESTURES, '2026-10-18', 'gesture'), a);
  assert.notEqual(pickDaily(GESTURES, '2026-10-19', 'gesture'), a);
  assert.equal(pickDaily([], '2026-10-18'), null);
  assert.equal(pickDaily(null, '2026-10-18'), null);
  // Cycles are aligned on day numbers from 1970-01-01: a full cycle shows every item exactly once.
  const list = Array.from({ length: 7 }, (_, i) => ({ id: 'x' + i }));
  const seen = [];
  for (let d = 0; d < 7; d++) seen.push(pickDaily(list, new Date(Date.UTC(1970, 0, 1 + 7 * 400 + d)).toISOString().slice(0, 10), 's').id);
  assert.equal(new Set(seen).size, 7);
  // Different salts give different sequences (for some day in a week).
  const seq = salt => Array.from({ length: 14 }, (_, d) => pickDaily(GESTURES, '2026-11-' + String(d + 1).padStart(2, '0'), salt).id).join();
  assert.notEqual(seq('a'), seq('b'));
  // exclude skips; if everything is excluded it still returns something.
  const ex = pickDaily(list, '2026-10-18', 's', { exclude: list.slice(0, 6).map(x => x.id) });
  assert.equal(ex.id, 'x6');
  assert.ok(pickDaily(list, '2026-10-18', 's', { exclude: new Set(list.map(x => x.id)) }));
  // skip → the next pick of the day ("רעיון אחר"), different from the first.
  assert.notEqual(pickDaily(GESTURES, '2026-10-18', 'g', { skip: 1 }).id, pickDaily(GESTURES, '2026-10-18', 'g').id);
});

test('randomPick and contentFilter: filter objects, any, arrays, functions', () => {
  const rng = seededRandom(42);
  const r1 = Array.from({ length: 5 }, () => rng());
  const rng2 = seededRandom(42);
  assert.deepEqual(Array.from({ length: 5 }, () => rng2()), r1, 'seeded is reproducible');
  assert.ok(r1.every(x => x >= 0 && x < 1));
  assert.notDeepEqual(Array.from({ length: 5 }, seededRandom('other')), r1);
  const winterHome = contentFilter(DATE_IDEAS, { where: 'home', season: 'winter' });
  assert.ok(winterHome.length >= 5);
  assert.ok(winterHome.every(x => x.where === 'home' && (x.season === 'winter' || x.season === 'any')), '"any" season suits winter');
  const cheapEvening = contentFilter(DATE_IDEAS, { maxBudget: 1, when: 'evening' });
  assert.ok(cheapEvening.length >= 5 && cheapEvening.every(x => x.budget <= 1 && (x.when === 'evening' || x.when === 'any')));
  assert.ok(contentFilter(DATE_IDEAS, { budget: [0] }).every(x => x.budget === 0));
  assert.ok(contentFilter(DATE_IDEAS, { tags: 'ים' }).every(x => x.tags.includes('ים')));
  assert.ok(contentFilter(DATE_IDEAS, { maxMinutes: 60 }).every(x => x.minutes <= 60));
  assert.equal(contentFilter(DATE_IDEAS, { where: '', season: null }).length, DATE_IDEAS.length, 'empty filter values are ignored');
  assert.equal(contentFilter(DATE_IDEAS, x => x.budget === 3).length, DATE_IDEAS.filter(x => x.budget === 3).length);
  assert.ok(!contentFilter(GESTURES, { exclude: ['g-mirror-note'] }).some(g => g.id === 'g-mirror-note'));
  const pick = randomPick(DATE_IDEAS, { where: 'out', budget: [0, 1] }, seededRandom('x'));
  assert.ok(pick.where === 'out' && pick.budget <= 1);
  assert.equal(randomPick(DATE_IDEAS, { where: 'moon' }), null);
  assert.equal(randomPick([], null), null);
  assert.ok(randomPick(GESTURES, null, () => 0.9999999));
});

test('seasons, gesture of the day, next question', () => {
  assert.equal(seasonOf('2026-07-15'), 'summer');
  assert.equal(seasonOf('2026-04-01'), 'summer');
  assert.equal(seasonOf('2026-10-31'), 'summer');
  assert.equal(seasonOf('2026-11-01'), 'winter');
  assert.equal(seasonOf('2027-02-14'), 'winter');
  const g = gestureOfDay({}, '2026-10-18');
  assert.ok(GESTURES.includes(g));
  assert.equal(gestureOfDay({}, '2026-10-18'), g);
  const done = { gestures: { done: { [g.id]: '2026-10-10' } } };
  assert.notEqual(gestureOfDay(done, '2026-10-18').id, g.id, 'a gesture done last week is skipped');
  const old = { gestures: { done: { [g.id]: '2025-01-01' } } };
  assert.equal(gestureOfDay(old, '2026-10-18').id, g.id, 'one done long ago comes back');
  assert.notEqual(gestureOfDay({}, '2026-10-18', 1).id, g.id, '"רעיון אחר"');
  const q = nextQuestion({}, 'funny', seededRandom(1));
  assert.equal(q.level, 'funny');
  const asked = Object.fromEntries(QUESTIONS.filter(x => x.level === 'deep').slice(1).map(x => [x.id, '2026-01-01']));
  assert.equal(nextQuestion({ asked }, 'deep').id, QUESTIONS.filter(x => x.level === 'deep')[0].id);
  const allAsked = Object.fromEntries(QUESTIONS.map(x => [x.id, '2026-01-01']));
  assert.ok(nextQuestion({ asked: allAsked }, 'light'), 'starts over when every question was asked');
  assert.equal(nextQuestion({}, 'thirtysix').id, 'q36-1');
  assert.equal(nextQuestion({ asked: { 'q36-1': '2026-01-01', 'q36-2': '2026-01-01' } }, 'thirtysix').id, 'q36-3');
  assert.ok(QUESTIONS.includes(nextQuestion({}, null)));
});

test('giftSuggestions: personalised by her facts, sizes and places', () => {
  const data = {
    profile: { sizes: { ring: '52' }, loveLanguages: ['words'] },
    facts: [
      { id: 'f1', category: 'flowers', title: 'אדמוניות', sentiment: 'love', starred: true },
      { id: 'f2', category: 'flowers', title: 'ורדים אדומים', sentiment: 'dislike' },
    ],
    places: [{ id: 'p1', name: 'צימר בגליל', lovedBy: 'want' }],
  };
  const s = giftSuggestions(data);
  assert.equal(s.length, GIFT_PROMPTS.length);
  const bouquet = s.find(x => x.prompt.id === 'gp-bouquet');
  assert.deepEqual(bouquet.facts.map(f => f.title), ['אדמוניות'], 'only what she likes');
  const ring = s.find(x => x.prompt.id === 'gp-ring');
  assert.equal(ring.size, '52');
  const zimmer = s.find(x => x.prompt.id === 'gp-zimmer');
  assert.deepEqual(zimmer.places.map(p => p.name), ['צימר בגליל']);
  const shoes = s.find(x => x.prompt.id === 'gp-shoes');
  assert.ok(s.indexOf(bouquet) < s.indexOf(shoes) && s.indexOf(ring) < s.indexOf(shoes), 'met needs rank above unmet ones');
  assert.ok(s.indexOf(s.find(x => x.prompt.id === 'gp-letter')) < s.indexOf(shoes), 'her top love language counts');
  assert.ok(giftSuggestions(data, { limit: 3 }).length === 3);
  assert.ok(giftSuggestions(data, { category: 'jewelry' }).every(x => x.prompt.category === 'jewelry'));
  assert.ok(giftSuggestions(data, { maxBudget: 1 }).every(x => x.prompt.budget <= 1));
  assert.equal(giftSuggestions(null).length, GIFT_PROMPTS.length, 'works on an empty app');
  const demo = giftSuggestions(demoData('2026-10-18'), { limit: 8 });
  assert.ok(demo.every(x => x.score > 0));
});

// ---- bundle compatibility (the build concatenates src/*.js into one scope and strips import/export lines) ----
const SRC = path.dirname(new URL(import.meta.url).pathname);
const MINE = ['dates.js', 'ics.js', 'search.js', 'content.js'];
const strip = src => src.replace(/^import .*?;\s*$/gm, '').replace(/\bexport\s+(?=(const|function|class|let|async))/g, '');

test('bundle: my files work in one shared scope after stripping import/export', () => {
  for (const f of MINE) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    assert.ok(!/^\s*export\s*\{/m.test(src) && !/^\s*export\s+default/m.test(src), f + ': only `export const|function`');
    assert.ok(!/^import[^;]*$/m.test(src), f + ': imports are single-line');
    assert.ok(!/\bimport\s*\(/.test(src), f + ': no dynamic import');
    assert.ok(!/^(?:const|let|var)\s+\w+\s*=\s*(?:document|window|localStorage|navigator)\b/m.test(src), f + ': no DOM at top level');
  }
  const js = ['model.js', ...MINE].map(f => strip(fs.readFileSync(path.join(SRC, f), 'utf8'))).join('\n');
  const api = new Function(js + '\nreturn {upcoming, buildICS, searchAll, pickDaily, demoData, GESTURES, hebrewDate, countdownText};')();
  const demo = api.demoData('2026-10-18');
  assert.ok(api.upcoming(demo, '2026-10-18', 30).length > 0);
  assert.ok(api.buildICS(demo, { from: '2026-10-18' }).startsWith('BEGIN:VCALENDAR'));
  assert.ok(api.searchAll(demo, 'סושי').length > 0);
  assert.ok(api.pickDaily(api.GESTURES, '2026-10-18', 'g'));
  assert.equal(api.countdownText(2), 'בעוד יומיים');
});

test('bundle: no top-level name of mine clashes with another file in src/', () => {
  const re = /^(?:export\s+)?(?:async\s+)?(?:function\*?\s+([A-Za-z_$][\w$]*)|(?:const|let|class)\s+([A-Za-z_$][\w$]*))/gm;
  const owners = new Map(), clashes = [];
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));
  for (const f of files) {
    for (const m of fs.readFileSync(path.join(SRC, f), 'utf8').matchAll(re)) {
      const name = m[1] || m[2];
      if (owners.has(name) && (MINE.includes(f) || MINE.includes(owners.get(name)))) clashes.push(`${name}: ${owners.get(name)} and ${f}`);
      else owners.set(name, f);
    }
  }
  assert.deepEqual(clashes, []);
});
