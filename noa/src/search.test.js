import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, searchTokens, searchAll, groupResults, highlight, highlightParts, SEARCH_SECTIONS, SEARCH_ROUTES } from './search.js';
import { demoData } from './model.js';

test('normalize: niqqud, geresh/gershayim, quotes, final letters, Latin, spaces', () => {
  assert.equal(normalize('בְּתֵל־אָבִיב'), 'בתל אביב');
  assert.equal(normalize('אֲדָמוֹת'), 'אדמות');
  assert.equal(normalize('צ׳יפס'), 'ציפס');
  assert.equal(normalize("צ'יפס"), 'ציפס');
  assert.equal(normalize('ט״ו באב'), 'טו באב');
  assert.equal(normalize('ט"ו באב'), 'טו באב');
  assert.equal(normalize('“שלום” ‘עולם’'), 'שלומ עולמ');
  assert.equal(normalize('ךםןףץ'), 'כמנפצ');
  assert.equal(normalize('מלך גדול'), 'מלכ גדול');
  assert.equal(normalize('CAFÉ Crème'), 'cafe creme');
  assert.equal(normalize('Taylor   Swift!!'), 'taylor swift');
  assert.equal(normalize('  רווחים \t\n כפולים  '), 'רווחימ כפולימ');
  assert.equal(normalize('סושי, פיצה; פסטה.'), 'סושי פיצה פסטה');
  assert.equal(normalize('💛 אוהבת 🥰'), 'אוהבת');
  assert.equal(normalize('36 (מותן 27)'), '36 מותנ 27');
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
  assert.equal(normalize(38), '38');
  assert.deepEqual(searchTokens(' תל  אביב '), ['תל', 'אביב']);
  assert.deepEqual(searchTokens('!!!'), []);
});

const D = {
  profile: { her: 'נועה', herBirthday: '2004-06-02', sizes: { shoes: '38', ring: '52', notes: 'אוהבת גזרות רחבות' }, loveLanguages: ['time', 'words'] },
  facts: [
    { id: 'f1', category: 'food', title: 'כוסברה', details: 'טעם של סבון', sentiment: 'never', starred: true, tags: [] },
    { id: 'f2', category: 'food', title: 'סושי סלמון', details: '', sentiment: 'love', tags: ['יפני'] },
    { id: 'f3', category: 'sweets', title: 'עוגת גבינה', details: 'כמו של סבתא, בלי צימוקים', sentiment: 'love', tags: [] },
    { id: 'f4', category: 'flowers', title: 'אדמוניות', details: '', sentiment: 'love', tags: [] },
    { id: 'f5', category: 'drinks', title: 'הפוך על שיבולת שועל', details: 'בלי סוכר', sentiment: 'love', tags: [] },
    { id: 'f6', category: 'music', title: 'מוזיקה יוונית', details: '', sentiment: 'dislike', tags: [] },
  ],
  people: [{ id: 'p1', name: 'מיכל', relation: 'אמא', birthday: '1970-11-07', phone: '050-1234567', notes: 'אוהבת סחלבים' }],
  places: [
    { id: 'pl1', name: 'הסושי בר בפלורנטין', kind: 'restaurant', lovedBy: 'her', area: 'תל אביב', address: 'רחוב פלורנטין 10', notes: '', tags: [] },
    { id: 'pl2', name: 'בית הקפה בנווה צדק', kind: 'cafe', lovedBy: 'us', area: 'תל־אביב', address: '', notes: 'הדייט הראשון שלנו', tags: ['רומנטי'] },
    { id: 'pl3', name: 'מכתש רמון', kind: 'nature', lovedBy: 'us', area: 'מצפה רמון', address: '', notes: 'כוכבים', tags: [] },
  ],
  dates: [{ id: 'd1', title: 'יום השנה של ההורים שלה', kind: 'anniversary', date: '1995-03-10', recurring: 'yearly', notes: '' }],
  gifts: [
    { id: 'g1', title: 'שרשרת עם תליון ירח', status: 'idea', occasion: 'd1', price: 380, whereToBuy: 'דיזנגוף', notes: '' },
    { id: 'g2', title: 'זר אדמוניות', status: 'given', occasion: 'יום הולדת', price: null, whereToBuy: '', notes: '' },
  ],
  plans: [{ id: 'pn1', title: 'פיקניק', type: 'date', due: '2026-10-28', done: false, placeId: 'pl3', notes: 'להביא שמיכה' }],
  memories: [{ id: 'm1', date: '2025-01-01', title: 'לילה של כוכבים', text: 'ספרנו כוכבים נופלים', placeId: 'pl3' }],
};
const ids = r => r.map(x => x.section + ':' + x.id);

test('searchAll: shape, routes and empty queries', () => {
  assert.deepEqual(searchAll(D, ''), []);
  assert.deepEqual(searchAll(D, '   '), []);
  assert.deepEqual(searchAll(D, '?!'), []);
  assert.deepEqual(searchAll(null, 'נועה'), []);
  const r = searchAll(D, 'כוסברה');
  assert.equal(r[0].section, 'facts');
  assert.equal(r[0].id, 'f1');
  for (const k of ['section', 'sectionLabel', 'id', 'title', 'subtitle', 'score', 'route']) assert.ok(k in r[0], k);
  assert.equal(r[0].route, 'her/fact/f1');
  assert.equal(r[0].sectionLabel, 'דברים עליה');
  assert.match(r[0].subtitle, /בשום אופן/);
  assert.match(r[0].subtitle, /אוכל/);
  assert.equal(SEARCH_ROUTES.place('x'), 'places/place/x');
  assert.deepEqual(SEARCH_SECTIONS.map(s => s.id), ['profile', 'facts', 'people', 'places', 'dates', 'gifts', 'plans', 'memories']);
});

test('searchAll finds every section by its fields', () => {
  assert.ok(ids(searchAll(D, 'נועה')).includes('profile:her'));
  assert.deepEqual(ids(searchAll(D, 'נעליים')), ['profile:sizes']);
  assert.ok(ids(searchAll(D, 'מידות')).includes('profile:sizes'));
  assert.ok(ids(searchAll(D, 'זמן איכות')).includes('profile:loveLanguages'));
  assert.ok(ids(searchAll(D, 'סבון')).includes('facts:f1'), 'fact details');
  assert.ok(ids(searchAll(D, 'מתוקים')).includes('facts:f3'), 'category label');
  assert.ok(ids(searchAll(D, 'יפני')).includes('facts:f2'), 'tags');
  assert.ok(ids(searchAll(D, 'לא אוהבת')).includes('facts:f6'), 'sentiment label');
  assert.ok(ids(searchAll(D, 'אמא')).includes('people:p1'), 'relation');
  assert.ok(ids(searchAll(D, 'סחלבים')).includes('people:p1'), 'person notes');
  assert.ok(ids(searchAll(D, '0501234567')).includes('people:p1'), 'phone digits');
  assert.ok(ids(searchAll(D, 'פלורנטין 10')).includes('places:pl1'), 'address');
  assert.ok(ids(searchAll(D, 'מסעדה')).includes('places:pl1'), 'kind label');
  assert.ok(ids(searchAll(D, 'רומנטי')).includes('places:pl2'), 'place tags');
  assert.ok(ids(searchAll(D, 'ההורים')).includes('dates:d1'));
  assert.ok(ids(searchAll(D, 'דיזנגוף')).includes('gifts:g1'), 'where to buy');
  assert.ok(ids(searchAll(D, 'יום השנה של ההורים')).includes('gifts:g1'), 'occasion resolved from a date id');
  assert.ok(ids(searchAll(D, 'שמיכה')).includes('plans:pn1'), 'plan notes');
  assert.ok(ids(searchAll(D, 'פיקניק רמון')).includes('plans:pn1'), 'plan place name');
  assert.ok(ids(searchAll(D, 'נופלים')).includes('memories:m1'), 'memory text');
});

test('Hebrew-aware matching: final letters, niqqud, geresh, maqaf and one-letter prefixes', () => {
  assert.ok(ids(searchAll(D, 'אדמוני')).includes('facts:f4'), 'ן typed as נ mid-word');
  assert.ok(ids(searchAll(D, 'אֲדְמוֹנִיּוֹת')).includes('facts:f4'), 'niqqud in the query');
  assert.ok(ids(searchAll(D, 'תל אביב')).includes('places:pl2'), 'maqaf in the data');
  assert.ok(ids(searchAll(D, 'תל־אביב')).includes('places:pl1'), 'maqaf in the query');
  assert.ok(ids(searchAll(D, 'בתל אביב')).includes('places:pl1'), 'ב prefix in the query');
  assert.ok(ids(searchAll(D, 'קפה')).includes('places:pl2'), 'ה prefix in the data');
  assert.ok(ids(searchAll(D, 'CAFE')).length === 0);
});

test('multi-word queries AND-match', () => {
  assert.deepEqual(ids(searchAll(D, 'סושי סלמון')), ['facts:f2']);
  assert.deepEqual(ids(searchAll(D, 'סושי בפלורנטין')).filter(x => x.startsWith('places')), ['places:pl1']);
  assert.deepEqual(searchAll(D, 'סושי כוכבים'), []);
});

test('ranking: exact > prefix > word start > inside a word; title > notes', () => {
  const data = {
    facts: [
      { id: 'inside', category: 'other', title: 'טעם של מסושי', sentiment: 'like' },
      { id: 'word', category: 'other', title: 'אוהבת סושי טרי', sentiment: 'like' },
      { id: 'prefix', category: 'other', title: 'סושיה', sentiment: 'like' },
      { id: 'exact', category: 'other', title: 'סושי', sentiment: 'like' },
      { id: 'notes', category: 'other', title: 'משהו אחר', details: 'סושי', sentiment: 'like' },
    ],
  };
  const order = searchAll(data, 'סושי').map(r => r.id);
  assert.deepEqual(order.slice(0, 3), ['exact', 'prefix', 'word']);
  assert.ok(order.indexOf('notes') > order.indexOf('word'));
  assert.ok(order.includes('inside'));
  const s = Object.fromEntries(searchAll(data, 'סושי').map(r => [r.id, r.score]));
  assert.ok(s.exact > s.prefix && s.prefix > s.word && s.word > s.inside);
  // Starred items win ties.
  const tie = { facts: [{ id: 'a', category: 'other', title: 'פיצה', sentiment: 'like' }, { id: 'b', category: 'other', title: 'פיצה', sentiment: 'like', starred: true }] };
  assert.deepEqual(searchAll(tie, 'פיצה').map(r => r.id), ['b', 'a']);
  // One-letter queries only match at word starts.
  const one = searchAll({ facts: [{ id: 'x', category: 'other', title: 'אבטיח', sentiment: 'like' }, { id: 'y', category: 'other', title: 'בננה', sentiment: 'like' }] }, 'ט');
  assert.deepEqual(one, []);
});

test('results are grouped by section, groups ordered by their best hit', () => {
  const r = searchAll(D, 'אדמוניות');
  assert.deepEqual(ids(r), ['facts:f4', 'gifts:g2']);
  const many = searchAll(demoData('2026-10-18'), 'תל אביב');
  const sections = many.map(x => x.section);
  const seen = new Set();
  for (let i = 0; i < sections.length; i++) {
    if (i && sections[i] !== sections[i - 1]) assert.ok(!seen.has(sections[i]), 'section ' + sections[i] + ' is contiguous');
    seen.add(sections[i]);
  }
  const groups = groupResults(many);
  assert.equal(groups.map(g => g.items.length).reduce((a, b) => a + b, 0), many.length);
  for (let i = 1; i < groups.length; i++) assert.ok(groups[i - 1].items[0].score >= groups[i].items[0].score);
  for (const g of groups) {
    assert.ok(g.label && g.icon);
    for (let i = 1; i < g.items.length; i++) assert.ok(g.items[i - 1].score >= g.items[i].score);
  }
  assert.ok(searchAll(demoData('2026-10-18'), 'ה', { limit: 5 }).length <= 5);
  assert.deepEqual([...new Set(searchAll(D, 'אדמוניות', { sections: ['gifts'] }).map(x => x.section))], ['gifts']);
});

test('demo data: common searches', () => {
  const demo = demoData('2026-10-18');
  assert.equal(searchAll(demo, 'כוסברה')[0].title, 'כוסברה');
  assert.equal(searchAll(demo, 'מיכל')[0].section, 'people');
  assert.ok(searchAll(demo, 'פיסטוק').length >= 1);
  assert.ok(searchAll(demo, 'רמון').some(r => r.section === 'memories'));
});

test('highlight: ranges into the original text, merged, niqqud kept with its letter', () => {
  assert.deepEqual(highlight('סושי סלמון', 'סושי'), [{ start: 0, end: 4 }]);
  assert.deepEqual(highlight('אוהבת סושי וגם סושיה', 'סושי'), [{ start: 6, end: 10 }, { start: 15, end: 19 }]);
  assert.deepEqual(highlight('תֵּל־אָבִיב', 'תל אביב'), [{ start: 0, end: 4 }, { start: 5, end: 11 }]);
  const t = 'שָׁלוֹם עֲלֵיכֶם';
  const [r] = highlight(t, 'שלו');
  assert.equal(t.slice(r.start, r.end), 'שָׁלוֹ', 'the holam stays inside the mark');
  assert.deepEqual(highlight('Café', 'cafe'), [{ start: 0, end: 4 }]);
  assert.deepEqual(highlight('צ׳יפס', 'ציפס'), [{ start: 0, end: 5 }]);
  assert.deepEqual(highlight('אבגד', 'בג גד'), [{ start: 1, end: 4 }], 'overlapping ranges merge');
  assert.deepEqual(highlight('שלום', 'ביי'), []);
  assert.deepEqual(highlight('', 'x'), []);
  assert.deepEqual(highlight('abc', ''), []);
});

test('highlightParts: plain-text segments that rebuild the original (no HTML)', () => {
  const text = 'היא אמרה <b>סושי</b> & "עוד"';
  const parts = highlightParts(text, 'סושי');
  assert.equal(parts.map(p => p.text).join(''), text);
  assert.deepEqual(parts.filter(p => p.match).map(p => p.text), ['סושי']);
  assert.ok(parts.some(p => p.text.includes('<b>')), 'markup in user text is returned as text, untouched');
  assert.deepEqual(highlightParts('שלום', 'xyz'), [{ text: 'שלום', match: false }]);
  assert.deepEqual(highlightParts('', 'x'), [{ text: '', match: false }]);
});
