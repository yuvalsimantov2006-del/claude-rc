// The look of the app on this device: the colour palette and the light/dark theme. Both are device preferences
// (localStorage 'noa-palette' and 'noa-theme'), never part of the data or the backups. The pre-paint script in
// scripts/build.mjs applies both before the first frame (LIGHT and rose by default; "system" follows the device
// only when he picks it). The colours themselves live in src/ui/tokens.css, one [data-palette] block per theme;
// scripts/palette-check.mjs fails the build when the two drift apart, and checks every palette's contrast.
// The list and the small pure helpers are importable by Node (build, checks); the picker UI below them runs only
// in the page (it uses helpers from core.js / ui.js at call time).
export const PALETTE_KEY='noa-palette';
export const THEME_KEY='noa-theme';
export const DEFAULT_PALETTE='rose';
export const DEFAULT_THEME='light';
export const NOA_PALETTES=[
  {id:'rose',name:'ורד',hint:'ורד, אפרסק ושזיף'},
  {id:'rosegold',name:'זהב־ורוד',hint:'ורוד חם, שמפניה וסגול עתיק'},
  {id:'bloom',name:'פריחה',hint:'ורד, אפרסק ואלמוג'},
  {id:'peach',name:'אפרסק',hint:'אפרסק, אלמוג ומשמש'},
  {id:'sunset',name:'שקיעה',hint:'כתום, ורוד וסגול'},
  {id:'cherry',name:'דובדבן',hint:'דובדבן, מג׳נטה ושזיף'},
  {id:'lavender',name:'לבנדר',hint:'סגול, אינדיגו וורוד'},
  {id:'midnight',name:'חצות',hint:'אינדיגו, שמיים וסגול'},
  {id:'ocean',name:'אוקיינוס',hint:'כחול, תכלת וטורקיז'},
  {id:'mint',name:'מנטה',hint:'מנטה, טורקיז וליים'},
  {id:'forest',name:'יער',hint:'ירוק, ליים וטורקיז'}
];
export const THEME_CHOICES=[{id:'light',label:'בהיר',icon:'Sun'},{id:'dark',label:'כהה',icon:'Moon'},{id:'system',label:'לפי המכשיר',icon:'Smartphone'}];
export function normalizePalette(v){return NOA_PALETTES.some(p=>p.id===v)?v:DEFAULT_PALETTE;}
export function paletteById(id){return NOA_PALETTES.find(p=>p.id===normalizePalette(id));}
export function stepPalette(id,delta){const i=NOA_PALETTES.findIndex(p=>p.id===normalizePalette(id)),n=NOA_PALETTES.length;return NOA_PALETTES[((i+delta)%n+n)%n].id;}
export function normalizeThemePref(v){return v==='light'||v==='dark'||v==='system'?v:DEFAULT_THEME;}

// ---------- In the page ----------
function readPalette(){try{return normalizePalette(localStorage.getItem(PALETTE_KEY));}catch{return DEFAULT_PALETTE;}}
function readThemePref(){try{return normalizeThemePref(localStorage.getItem(THEME_KEY));}catch{return DEFAULT_THEME;}}
function resolvedTheme(pref=readThemePref()){
  if(pref==='light'||pref==='dark')return pref;
  try{return matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}catch{return 'light';}
}
// Writes html[data-theme] and html[data-palette], and the browser-bar colour (the palette's --theme-color).
function applyLook(){
  if(typeof document==='undefined'||!document.documentElement?.setAttribute)return;
  const root=document.documentElement;
  root.setAttribute('data-theme',resolvedTheme());root.setAttribute('data-palette',readPalette());
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta){const bar=getComputedStyle(root).getPropertyValue('--theme-color').trim();if(bar)meta.setAttribute('content',bar);}
}
// A short cross-fade between the old and the new colours where the browser can (and motion is welcome).
function lookTransition(fn){
  const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!calm&&typeof document.startViewTransition==='function'){try{document.startViewTransition(fn);return;}catch{}}
  fn();
}
function setPalette(id){
  const next=normalizePalette(id),changed=next!==readPalette();
  try{localStorage.setItem(PALETTE_KEY,next);}catch{}
  lookTransition(()=>{
    applyLook();
    for(const el of document.querySelectorAll('.pl-swatch')){const on=el.dataset.palette===next;el.setAttribute('aria-checked',String(on));el.tabIndex=on?0:-1;}
  });
  if(changed)toast(`הצבעים עודכנו · ${paletteById(next).name}`);
}
function setThemePref(pref){
  const next=normalizeThemePref(pref);
  try{localStorage.setItem(THEME_KEY,next);}catch{}
  lookTransition(()=>{applyLook();for(const b of document.querySelectorAll('[data-theme-choice]'))b.setAttribute('aria-pressed',String(b.dataset.themeChoice===next));});
}
function toggleTheme(){setThemePref(resolvedTheme()==='dark'?'light':'dark');}

// One swatch: a tiny window of the palette — its page colour under its glows, three dots and a gradient bar —
// with the name, and a check on the chosen one. data-palette scopes the palette's tokens to the swatch, so it
// previews itself in the current theme. The grid is a radio group (arrow keys move and choose).
function paletteSwatch(p,current){
  const on=p.id===current;
  return `<button type="button" role="radio" class="pl-swatch" data-palette="${p.id}" data-action="palette:${p.id}" aria-checked="${on}" tabindex="${on?0:-1}" aria-label="${esc(p.name)}: ${esc(p.hint)}"><span class="pl-preview" aria-hidden="true"><span class="pl-dots"><i></i><i></i><i></i></span><span class="pl-bar"></span></span><span class="pl-name">${esc(p.name)}</span><span class="pl-check" aria-hidden="true">${icon('Check',13)}</span></button>`;
}
function paletteGrid(){const current=readPalette();return `<div class="pl-grid" role="radiogroup" aria-label="צבעי האפליקציה">${NOA_PALETTES.map(p=>paletteSwatch(p,current)).join('')}</div>`;}
function themeSegmented(){
  const pref=readThemePref();
  return `<div class="segmented full theme-seg" role="group" aria-label="מראה">${THEME_CHOICES.map(t=>`<button type="button" data-action="theme:${t.id}" data-theme-choice="${t.id}" aria-pressed="${pref===t.id}">${icon(t.icon,16)}<span>${esc(t.label)}</span></button>`).join('')}</div>`;
}
function openPaletteSheet(){
  openDialog({title:'צבעים ומראה',cls:'pl-sheet',body:`<p class="dlg-lead">שלושה צבעים שהולכים יחד, לכל האפליקציה. לוחצים — ורואים מיד.</p>${paletteGrid()}<div class="pl-theme">${themeSegmented()}</div>`,
    focus:'.pl-swatch[aria-checked="true"]'});
}

if(typeof document!=='undefined'&&document.addEventListener){
  applyLook();
  onAction('palette',id=>setPalette(id));
  onAction('theme',pref=>setThemePref(pref));
  onAction('theme-toggle',()=>toggleTheme());
  onAction('open-palette',()=>openPaletteSheet());
  try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(readThemePref()==='system')applyLook();});}catch{}
  // Radio-group keys: Left/Right follow the screen (in RTL, Left is the next swatch), Up/Down go back/forward.
  document.addEventListener('keydown',event=>{
    const sw=event.target.closest?.('.pl-swatch');if(!sw)return;
    const rtl=getComputedStyle(sw).direction==='rtl';
    const map={ArrowDown:1,ArrowUp:-1,ArrowLeft:rtl?1:-1,ArrowRight:rtl?-1:1};
    let next=null;
    if(event.key in map)next=stepPalette(sw.dataset.palette,map[event.key]);
    else if(event.key==='Home')next=NOA_PALETTES[0].id;
    else if(event.key==='End')next=NOA_PALETTES.at(-1).id;
    if(!next)return;
    event.preventDefault();setPalette(next);
    sw.closest('.pl-grid')?.querySelector(`.pl-swatch[data-palette="${next}"]`)?.focus();
  });
}
