// The colour palette picker (4.2): a settings card ("צבעי האפליקציה"), the same picker in a sheet (the phone
// "more" sheet, the command palette), and applying a choice. A choice applies at once — html[data-palette] and
// the browser-bar colour, no re-render: every colour is a CSS token — and is kept on this device only
// ('ofek-palette' in localStorage, like the light/dark theme), never in the data, backups or sync.
// The swatches are a radio group: arrow keys move and choose, Home/End jump, Tab leaves the group.
import {onModuleHook} from './hooks.js';
import {APP_PALETTES,APP_PALETTE_KEY,DEFAULT_APP_PALETTE,normalizeAppPalette,appPaletteById,stepAppPalette} from './palette.js';

function readAppPalette(){try{return normalizeAppPalette(localStorage.getItem(APP_PALETTE_KEY));}catch{return DEFAULT_APP_PALETTE;}}
function applyAppPalette(id=readAppPalette()){
  if(typeof document==='undefined'||!document.documentElement?.setAttribute)return;
  document.documentElement.setAttribute('data-palette',normalizeAppPalette(id));
  // The browser bar follows theme + palette (shell-ui.js reads --theme-color).
  if(typeof applyTheme==='function')applyTheme();
}
function setAppPalette(id){
  const next=normalizeAppPalette(id),changed=next!==readAppPalette();
  try{localStorage.setItem(APP_PALETTE_KEY,next);}catch{}
  const swap=()=>{
    applyAppPalette(next);
    for(const el of document.querySelectorAll('.pl-swatch')){const on=el.dataset.palette===next;el.setAttribute('aria-checked',String(on));el.tabIndex=on?0:-1;}
  };
  // A short cross-fade between the old and the new colours where the browser can (and motion is welcome).
  const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(changed&&!calm&&typeof document.startViewTransition==='function'){try{document.startViewTransition(swap);}catch{swap();}}
  else swap();
  if(changed&&typeof toast==='function')toast(`הצבעים עודכנו · ${appPaletteById(next).name}`);
}

// One swatch: a tiny window of the palette — its page colour under its three glows, three dots and a
// gradient "button" — with the name, and a check on the chosen one. data-palette scopes the palette's
// tokens to the swatch (tokens.css), so it previews itself in the current theme.
function appPaletteSwatch(p,current){
  const on=p.id===current;
  return `<button type="button" role="radio" class="pl-swatch${p.calm?' pl-calm':''}" data-palette="${p.id}" data-action="app-palette:${p.id}" aria-checked="${on}" tabindex="${on?0:-1}" aria-label="${e(p.name)}: ${e(p.hint)}"><span class="pl-preview" aria-hidden="true"><span class="pl-dots"><i></i><i></i><i></i></span><span class="pl-bar"></span></span><span class="pl-text"><b class="pl-name">${e(p.name)}</b>${p.calm?`<small>${e(p.hint)}</small>`:''}</span><span class="pl-check" aria-hidden="true">${icon('Check',13)}</span></button>`;
}
function appPaletteGrid(){
  const current=readAppPalette();
  return `<div class="pl-grid" role="radiogroup" aria-label="צבעי האפליקציה">${APP_PALETTES.map(p=>appPaletteSwatch(p,current)).join('')}</div>`;
}
function appPaletteCard(){
  return card(head('צבעי האפליקציה','שלושה צבעים שהולכים יחד, לכל האפליקציה. הבחירה נשמרת רק במכשיר הזה.')+appPaletteGrid(),'pl-card');
}
function openAppColors(){
  showDialog('צבעי האפליקציה',`<p class="pl-sub">שלושה צבעים שהולכים יחד, לכל האפליקציה. לוחצים — ורואים מיד.</p>${appPaletteGrid()}`);
  const dlg=document.querySelector('dialog');dlg?.classList.add('sheet','pl-sheet');
  dlg?.querySelector('.pl-swatch[aria-checked="true"]')?.focus?.();
}

onModuleHook('settings',()=>appPaletteCard());
onModuleHook('palette',()=>[{icon:'Palette',title:'צבעי האפליקציה',sub:`${APP_PALETTES.length} שילובי צבעים: ${appPaletteById(readAppPalette()).name} עכשיו`,run:()=>{closeDialog();openAppColors();}}]);

if(typeof document!=='undefined'&&document.addEventListener){
  applyAppPalette();
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-action]');if(!button)return;
    const [action,id]=button.dataset.action.split(':');
    try{
      if(action==='app-palette')setAppPalette(id);
      else if(action==='app-colors')openAppColors();
    }catch(err){toast(err.message,true);}
  });
  // Radio-group keys. Left/Right follow the screen (in RTL, Left is the next swatch), Up/Down go back/forward.
  document.addEventListener('keydown',event=>{
    const sw=event.target.closest?.('.pl-swatch');if(!sw)return;
    const rtl=getComputedStyle(sw).direction==='rtl';
    const map={ArrowDown:1,ArrowUp:-1,ArrowLeft:rtl?1:-1,ArrowRight:rtl?-1:1};
    let next=null;
    if(event.key in map)next=stepAppPalette(sw.dataset.palette,map[event.key]);
    else if(event.key==='Home')next=APP_PALETTES[0].id;
    else if(event.key==='End')next=APP_PALETTES.at(-1).id;
    if(!next)return;
    event.preventDefault();
    setAppPalette(next);
    sw.closest('.pl-grid')?.querySelector(`.pl-swatch[data-palette="${next}"]`)?.focus();
  });
}
