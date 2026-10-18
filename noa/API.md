# נועה — the foundation API (for section modules)

Everything below is a plain global in the one shared bundle scope (`scripts/build.mjs` concatenates `src/*.js` in
a fixed order and strips `import`/`export`). Section files may keep `import` lines for readability/tests — they are
removed at build time. **See every component live at `#gallery`** (Settings → על האפליקציה → גלריית רכיבים).

- [Files and the build](#files-and-the-build) · [Views and routes](#views-and-routes) · [Quick add, home cards, settings cards](#quick-add-home-cards-settings-cards)
- [Data: read, save, delete, undo](#data) · [Forms, dialogs, sheets](#forms-dialogs-sheets) · [HTML helpers](#html-helpers)
- [Actions](#actions-clicks-and-changes) · [Dates](#dates) · [Photos](#photos) · [Search](#search) · [CSS](#css-and-design-tokens) · [Checklist](#checklist-for-a-section-lane)

## Files and the build

Build order (`JS_FILES` in `scripts/build.mjs`; files that do not exist yet are skipped):

```
model.js dates.js content.js search.js ics.js            ← pure logic (tested with node --test)
icons.js core.js photos.js ui.js palette.js lock.js backup.js shell.js   ← foundation
home.js setup.js settings.js gallery.js                  ← foundation screens
her.js gifts.js plans.js questions.js places.js dates-ui.js memories.js  ← SECTION LANES (yours)
stubs.js app.js                                          ← placeholders, then boot
```

CSS order (`CSS_FILES`): `tokens.css base.css components.css home.css settings.css` then
`her.css gifts.css plans.css questions.css places.css dates.css memories.css` (yours, in `src/ui/`).

- **One scope, unique names.** Every top-level `function/const/let/class` name must be unique across all files — the
  build fails on a duplicate. Prefix your private helpers with a short section prefix (`pl` places, `hr` her,
  `gf` gifts, `pn` plans, `qs` questions, `dt`… is taken by dates.js — use `du` for dates-ui, `mm` memories).
  Taken prefixes: `md` model, `cr` core, `ph` photos, `ui` ui, `sh` shell, `hm` home, `su` setup, `st` settings,
  `lk` lock, `bk` backup, `gl` gallery, `sb` stubs, `_dt _sr _ct _ics` logic.
- Top-level code runs at load in that order, so register things at top level; do DOM work only inside functions or
  guarded by `if(typeof document!=='undefined')`.
- `NOA_OUT=<file> node noa/scripts/build.mjs` writes a private build (nothing else). `node noa/scripts/build.mjs`
  writes `noa/index.html` + `noa/dist/index.html` and copies the manifest, service worker and icons.
- `cd noa && npm test` runs every `src/*.test.js`. `node noa/scripts/palette-check.mjs` checks colour contrast.

## Views and routes

```js
registerView({
  ...navSection('places'),          // id, title, icon, nav ('tab'|'more'), order — keeps the nav consistent
  subtitle: ctx => `${ctx.data.places.length} מקומות`,   // optional: string or fn, shown under the <h1>
  headActions: ctx => button('מקום חדש','pl-add',{icon:'Plus',variant:'primary'}),  // optional, beside the <h1>
  render(ctx) { return '…html…'; },  // REQUIRED. Return a string; escape every user string.
  afterRender(mainEl, ctx) {},       // optional: wire widgets, focus, etc. Photos are already hydrated.
  openItem(kind, id, ctx) {},        // optional: deep link '#places/place/<id>' → open that item (sheet, scroll…)
  hideHead: false,                   // true = no page <h1> (home uses its own hero)
});
```

- `navSection(id)` ids: `home her places dates gifts plans memories questions settings` (core.js `NAV_SECTIONS`):
  tabs on the phone are בית · עליה · [+] · מקומות · תאריכים · עוד; the rest live in the "עוד" sheet and the sidebar.
- `ctx = {data, today, params, query, route, view, her}` — `data` is the current data (treat as read-only),
  `today` 'YYYY-MM-DD', `params` the route parts after the view (`'#her/fact/abc'` → `['fact','abc']`),
  `query` from `?a=b`, `her` her display name.
- **Routes**: `#<view>[/<kind>/<id>]`, e.g. `#places/place/<id>`, `#her/fact/<id>`, `#her/person/<id>`, `#her/sizes`,
  `#her/love`, `#dates/date/<id>`, `#gifts/gift/<id>`, `#plans/plan/<id>`, `#memories/memory/<id>` (search.js and
  the home cards link to these). Your own sub-pages are free: `#her/category/food`, `#plans/ideas`…
- Without `openItem`, the shell scrolls to `[data-id="<id>"]` in your page and flashes it — so give list rows
  `data-id` (listRow does). `flashItem(id)` does that on demand.
- `go('places/place/abc')` navigates (also closes open dialogs cleanly). Links can be plain `<a href="#places">`.
- The whole page re-renders after every data change (`render(ctx)` again); keep transient UI state (filters, tab)
  in a module-level object of yours, e.g. `const plState={filter:'all'}`, and re-render with `renderApp()`.
- `subTabs([{id,label,icon,href,count}], activeId)` draws a strip of section sub-pages.
- A real view replaces the "בקרוב" stub with the same id automatically (stubs are registered with `stub:true`);
  you never need to edit or delete `stubs.js`.

## Quick add, home cards, settings cards

```js
// The "+" sheet. Ids already used by the working stub forms: fact, place, date, gift, plan, memory —
// register the same id to replace the stub with your richer form.
registerQuickAdd({id:'place', label:'מקום', hint:'שהיא אוהבת, שאתם רוצים לנסות', icon:'MapPin', order:20, run(){ plOpenForm(); }});

// A card on the home screen. Return '' to hide it. size 'full' | 'half' (half cards pair up in two columns on
// wide screens and stack on a phone). label = its name in Settings → "מה מופיע בבית" (omit to make it fixed).
registerHomeCard({id:'places-try', order:80, size:'half', label:'מקום לנסות', render(ctx){ return card('…',{title:'…',icon:'MapPin',tone:'2'}); }});

// A card in Settings (e.g. a section's own preferences).
registerSettingsCard({id:'dates-prefs', order:35, render(ctx){ return card('…',{title:'…'}); }});
```

Home orders in use: hero 10 · start-here 12 · reminders 15 · next-up 20 · on-this-day 25 · gift nudge 30 ·
gesture 40 · remember 50 · milestones 55 · stats 60 · backup reminder 95. Settings: profile 10 · look 20 ·
reminders 30 · home cards 40 · lock 50 · backup 60 · about 990. Pick orders around them (default 100 / 500).

## Data

The data model is SPEC §4; vocabularies with Hebrew labels and icons are in `model.js`:
`FACT_CATEGORIES SENTIMENTS PLACE_KINDS PLACE_LOVED_BY DATE_KINDS GIFT_STATUSES PLAN_TYPES LOVE_LANGUAGE_TYPES SIZE_FIELDS DATA_LISTS`
(+ `vocabLabel(list,id)`, `vocabItem(list,id)`). content.js adds `LOVE_LANGUAGES` (with ideas), `OCCASIONS`,
`RELATIONS`, `MOODS`, `FACT_PLACEHOLDERS`, `DATE_IDEAS`, `GESTURES`, `QUESTIONS`, `THIRTY_SIX`, `GIFT_PROMPTS`…

```js
getData()                         // the current data object — never mutate it
findItem('places', id)            // one item or null
saveItem('places', {id?, ...fields}, {message, undo:true, silent:false})
                                  // add (no id / unknown id) or edit (merged over the existing item, so fields you
                                  // don't know survive). Sets id/created/updated. Toast "נשמר 💛" + "ביטול". Returns the item.
removeItem('places', id, {message:'המקום נמחק'})   // delete with an undo toast (exact snapshot restore)
toggleStar('places', id)          // ♥ on/off (no toast). heartButton(list,id,on) does this by itself, with a pop.
update(d => { d.places.find(p=>p.id===id).visits.push(today); }, {message:'נוסף ביקור', undo:true})
                                  // any change in ONE call: mutate the draft (a deep copy). Validated, saved,
                                  // re-rendered, undoable. Throws a Hebrew Error if the result is invalid.
setProfile({her, me, together, herBirthday, loveLanguages, sizes, photo}, {message})   // merge into profile
setPrefs({…})                     // merge into prefs (silent, no undo)
undoLast()                        // what the toast's "ביטול" calls (also Ctrl+Z)
onDataChange((next, prev) => {})  // after every commit / undo / other-tab change (the shell already re-renders)
herName(), myName()               // display names ("נועה" by default)
```

- Every save goes through `validateData` (model.js): it fills defaults, normalises enums, rejects broken dates.
  Unknown fields are preserved — you may add fields to your items (document them in your file header).
- Saves are safe: temp key → read back → previous save kept in `noa-data-v1-prev` → swap. Never write
  `localStorage` yourself for data; device-only preferences of your own must use keys starting with `noa-`.
- A deleted item's photos are not deleted immediately (undo brings the item back); a clean-up removes photos nothing
  refers to, later.

## Forms, dialogs, sheets

All dialogs are native modal `<dialog>`s: the page behind is inert, Tab stays inside, Esc / ✕ / backdrop tap /
**Android back** close them, focus returns to the opener. On a phone (≤ 760px) every dialog is a bottom sheet you can
drag down. They stack (a confirm over a form).

```js
openForm({
  title:'מקום חדש', intro:'שורת הסבר (לא חובה)', submitLabel:'שמירה', submitIcon:'Check',
  values: place || {lovedBy:'her'},
  fields:[
    {name:'name', label:'שם המקום', required:true, maxLength:80, autofocus:true},
    {name:'lovedBy', label:'של מי?', type:'chips', required:true, options:PLACE_LOVED_BY.map(x=>({id:x.id,label:x.label,icon:x.icon}))},
    {name:'kind', label:'סוג', type:'select', options:PLACE_KINDS},
    {name:'rating', label:'דירוג', type:'stars'},
    {name:'priceLevel', label:'מחיר', type:'chips', options:[{id:'1',label:'₪'},{id:'2',label:'₪₪'},{id:'3',label:'₪₪₪'}]},
    {name:'link', label:'קישור', type:'url', hint:'Google Maps או אתר'},
    {name:'visits', type:'custom', html:v=>'…', read:form=>[…]},
    {name:'yearly', label:'חוזר כל שנה', type:'switch', sub:'שורת הסבר'},
    {name:'remindDays', label:'להזכיר לי', type:'multichips', numeric:true, options:[{id:'1',label:'יום לפני'},{id:'7',label:'שבוע'}]},
    {name:'mood', label:'איך זה הרגיש', type:'emoji', options:MOODS.map(m=>({id:m.emoji,label:m.label,emoji:m.emoji}))},
    {name:'photos', label:'תמונות', type:'photos', max:12},
    {name:'due', label:'עד מתי', type:'date', min:todayISO(), show:v=>v.type==='task'},   // conditional field
    {name:'price', label:'מחיר', type:'price', min:0, validate:(v,all)=>v>5000?'זה הרבה… בטוח?':null},
  ],
  onSubmit(values){ saveItem('places', {...place, ...values}); },   // return false (or throw) to keep it open
  onDelete: place ? () => removeItem('places', place.id, {message:'המקום נמחק'}) : null, deleteLabel:'מחיקה',
});
```

Field types: `text` (default) `textarea` `number` `price` (₪) `date` (with a "היום" chip; `quickToday:false` hides
it) `select` `chips` (one) `multichips` (several; `numeric:true` → numbers) `stars` (0–5) `switch` `tags` (comma
separated → array) `url` `tel` `email` `password` `photos` (ids; uploads resize into IndexedDB) `emoji` `hidden`
`section` (a sub-heading) `custom` (`html(values)` + `read(form)`). Options: `required, requiredMessage, placeholder,
hint, min, max, maxLength, rows, full, integer, validate(value, values)→message|null, show(values)→bool, autofocus,
dir, inputmode, sub (switch)`. Values come back cleaned: trimmed strings, numbers or `null`, arrays, booleans,
dates as 'YYYY-MM-DD' or `null`. Validation messages are Hebrew and inline under each field.

For your own dialog layout: `formFields(fields, values)` → html, `readForm(formEl, fields)`, `validateForm(formEl, fields)`.

```js
const ok = await confirmAsk({title:'למחוק?', text:'…', confirm:'מחיקה', danger:true, icon:'Trash2', requireWord:'מחיקה'});
openDialog({title, body:html, foot:html, cls:'my-sheet', wide:true, focus:'.selector', onClose(result){}}) // → <dialog>
closeDialog(el?)                  // the top one by default; elements with data-dialog-close close their dialog
openMenu({title:'סושי בר', items:[{label:'עריכה', icon:'Pencil', run(){…}}, {label:'מחיקה', icon:'Trash2', danger:true, run(){…}}]})
toast('נשמר 💛', {undo:true, error:false, icon:'Check', action:{label:'פתיחה', run(){…}}, ms:4200})
celebrate(el)                     // light confetti (skipped with reduced motion) — milestones, "done!"
popHeart(btn)                     // the ♥ pop (heartButton does it already)
```

## HTML helpers

Every helper returns a string. Text parameters are escaped for you; parameters named `…Html`, `body`, `actions`,
`meta`, `foot` are inserted as-is — build them from these helpers or `esc()`.

| helper | what |
|---|---|
| `esc(v)` `escLines(v)` `safeUrl(v)` | escape text / keep line breaks as `<br>` / only http(s)/tel/mailto/geo links |
| `icon(name,size=20)` | Lucide icon (names in `src/icons.js`, e.g. `MapPin Heart Gift CalendarHeart BookHeart Navigation Shuffle Star`) |
| `button(label, action, {icon, iconEnd, variant:'primary'|'soft'|'ghost'|'quiet'|'danger'|'danger-solid', size:'small'|'big', full, href, external, type, attrs, disabled})` | button or link |
| `iconButton(icon, label, action, {variant:'soft'|'outline'|'quiet', href, pressed})` | square icon button with an accessible name |
| `heartButton(list, id, on)` | the favourite ♥ (toggles `starred`) |
| `card(bodyHtml, {title, sub, icon, tone, actions, cls, id, hero})` · `cardHead(title, {…})` | frosted card (hero = palette gradient, white text) |
| `sectionTitle(title, {sub, actions})` | heading for a block of cards |
| `iconTile(icon, tone='1'|'2'|'3'|'love'|'grad'|'neutral'|'danger', size)` | rounded icon square |
| `badge(text, tone='accent'|'tone-2'|'tone-3'|'love'|'positive'|'warning'|'negative'|'neutral'|'star', {icon, emoji})` | small label |
| `chip(label, {action, active, emoji, icon, count, tone, href})` · `chipRow(chips, {wrap, label})` · `filterChips(options, value, action)` | filters (horizontal scroll, never widens the page) |
| `segmented(options, value, action, {full, href:id=>'#…'})` | tab switch |
| `subTabs(items, activeId)` | section sub-pages |
| `listRow({id, icon, tone, emoji, thumbHtml, title, sub, subHtml, meta, action|href, heart:{list,on}, actions, done})` · `listOf(rows)` | list rows (main area is one button/link; heart & actions beside it) |
| `emptyState({icon, title, text, actions, compact})` | friendly empty state with one clear action |
| `statTile({icon, value, label, tone, href})` | a count tile (`.stats-row` grid holds 4 / 2 on phone) |
| `notice(text, {tone:'info'|'success'|'warning'|'error'|'love', title, actions})` | inline message |
| `infoRows([[label, value], …])` | read-only label/value tiles (e.g. her sizes) |
| `starsDisplay(n)` `priceLevel(n)` `countdownChip(days, {text})` `progressBar(v, max)` `avatar(name, {photoId, size:'big'})` | small displays |
| `photoImg(id, {size:'thumb'|'full', alt, cls})` | an `<img>` filled from IndexedDB after render |

## Actions (clicks and changes)

```js
// <button data-action="pl-visit:abc">…</button>  → handler(arg='abc', el, event)
onAction('pl-visit', (id, el, event) => { … });
// <select data-change="pl-sort">  (fires on 'change')   <input data-input="pl-q"> (fires on every 'input')
onChange('pl-sort', (value, el, event, arg) => { plState.sort = value; renderApp(); });
```

- **Prefix your action names** with your section prefix (`pl-…`, `gf-…`); a second registration of a name wins and
  warns in the console. Foundation names: `star quick quick-add more search go undo toast-close theme theme-toggle
  palette open-palette lock-* backup-* demo-* reset-all export-ics notify-ask settings-profile su-* gesture-* fact-next
  home-* gl-* install-app`.
- A thrown `Error` with a Hebrew message (or a rejected promise) shows as an error toast; other errors show
  "משהו השתבש. נסה שוב." and are logged.
- Keyboard: Ctrl/⌘+K or `/` search, `n` quick add, Ctrl/⌘+Z undo.

## Dates

Use **dates.js** (logic lane) for everything about dates, so the whole app speaks one dialect:
`formatDate(iso, 'short'|'year'|'long'|'full'|'weekday'|'month'|'numeric'|'auto')` · `relativeText(iso, from)` ·
`countdownText(days)` · `relativePast(days)` · `daysBetween(a,b)` · `nextOccurrence(date, recurring, from)` ·
`age(birthday, on)` · `togetherBreakdown(from, to)` · `milestones(together, from, horizon)` · `hebrewDate(iso)` ·
`holidays(y1, y2)` · `upcoming(data, from, horizon, {holidays, milestones, tasks, people, overdue, limit})` ·
`dueReminders(data, today)` · `heCount(n,'day'|'week'|'month'|'year')` · `isoAddDays` `isoToday` `isoParse`.
**ics.js**: `buildICS(data, {alarmHour})`, `icsFileName(today)` (Settings already offers the download; call
`downloadFile(name, text, 'text/calendar')` from your page too).

core.js conveniences (delegate to dates.js): `todayISO()` · `fmtDate(iso, {weekday, year})` → "2 ביוני" /
"יום ג׳, 2 ביוני 2026" · `fmtRelative(isoOrDays)` → "היום" / "בעוד 3 ימים" · `fmtMonth('2026-06')` → "יוני 2026" ·
`daysUntil(iso, from)` · `addDaysISO(iso, n)` · `spanWords(n)`. `downloadFile(name, content, mime)` saves a file.

## Photos

```js
const id = await putPhoto(file)   // resizes to ≤1600px JPEG + a ≤400px thumbnail, stores in IndexedDB 'noa-photos'
getPhoto(id) / getThumb(id)       // → Blob | null
photoURL(id, 'thumb'|'full')      // → object URL (cached)
photoImg(id, {size, alt})         // markup; the shell hydrates it after every render (hydratePhotos(root) for your own DOM)
deletePhoto(id)                   // rarely needed: unreferenced photos are cleaned up automatically
photoIdsIn(data)                  // every id the data refers to (items with `photos` arrays or a `photo` field)
```
Store photo ids in an item's `photos: []` (memories) or `photo` (people, places…) — then backups ("כולל תמונות")
and the clean-up find them automatically. The `photos` form field does the upload UI for you.

## Search

`search.js` (logic lane) already indexes every list and returns routes like `places/place/<id>`; the shell's search
sheet renders them. If your section shows a list's items in another view, call `registerItemRoute('people','her')`.
Implement `openItem(kind, id)` in your view (or render rows with `data-id`) so a result lands on the item.

## CSS and design tokens

- Your styles go in `src/ui/<section>.css`. **No raw colours** — tokens only (`tokens.css`), logical properties only
  (`margin-inline-start`, `inset-inline-end`, `padding-block`…), and `@media (max-width: 760px)` for the phone.
- Surfaces: `.card` (frosted pane) · `--glass-tile` for rows/tiles inside cards (no blur) · `--surface` for inputs.
- Text: `--text` `--text-muted` `--text-subtle`; accent text `--accent-text`; the palette's other two colours as
  text `--accent-2` `--accent-3`; tints `--accent-soft` `--accent-2-soft` `--accent-3-soft`; fills `--accent-grad`
  (text on it: `--accent-contrast`), `--hero-gradient` (text `--hero-text`); semantic `--positive` `--negative`
  `--warning` (+`-soft`), love `--love` `--love-soft` `--love-vivid`, rating `--star`, neutral `--neutral-ink`
  `--neutral-soft`; marks `--chart-1…6`. All contrast-checked in every palette × theme.
- Radii `--r-xs/sm/md/lg/xl`, spacing `--sp-1…16`, motion `--dur-fast/base/slow` `--ease-out` `--ease-spring`
  (all zero under reduced motion), `--touch` (44px minimum hit area on phone).
- Ready classes: `.card .card-head .card-actions .card-lead .card-note(.subtle) .section-title .btn(.primary…)
  .icon-btn .heart-btn .badge .chip .chip-row .segmented .subtabs .list .row .row-main .empty .stats-row .stat
  .notice .info-rows .stars .price-level .countdown-chip .progress .avatar .icon-tile(.tone-*) .photo
  .setting-rows .switch-row .select-row .action-row .reminder-strip .form-grid .field .choice-chips`.
- No horizontal scroll at 360px: give flex children `min-width:0`, let chip rows scroll inside themselves.

## Checklist for a section lane

1. `registerView({...navSection('<id>'), render, afterRender?, openItem?})` in `src/<section>.js` (top level).
2. Replace the stub quick-add (`registerQuickAdd` with the same id) with your richer form (`openForm`).
3. Save with `saveItem` / `update`, delete with `removeItem` — the undo toast comes for free.
4. Rows: `listRow({id, …, heart:{list, on:item.starred}})`; empty lists: `emptyState({…, actions:button(…)})`.
5. Optional home card (`registerHomeCard`) and settings card (`registerSettingsCard`).
6. Hebrew copy: to him in masculine ("הוסף", "שלך"), about her in feminine ("היא אוהבת"); escape everything.
7. Private build + screenshots at 390×844 and 1280×900, light and dark, ≥ 3 palettes; look at them; no console
   errors; no horizontal overflow.
