// The app frame: five hubs instead of a long menu, sub-tabs inside each hub, a "more" sheet on
// phones, and the light/dark theme. Built on the UI helpers and state from app.js.

const HUBS=[
  {id:'home',label:'בית',icon:'House',pages:['dashboard']},
  {id:'money',label:'הכסף שלי',icon:'Wallet',pages:['accounts','transactions','budgets','bills','capture']},
  {id:'wealth',label:'חיסכון והשקעות',short:'חיסכון',icon:'PiggyBank',pages:['goals','investments','performance','monthly']},
  {id:'plan',label:'תכנון וכלים',short:'תכנון',icon:'FlaskConical',pages:['lab','wishlist','split','tools','insights']},
  {id:'ai',label:'Claude',icon:'Sparkles',pages:['copilot']}
];
const PAGE_LABELS={dashboard:'בית',accounts:'חשבונות',transactions:'תנועות',budgets:'תקציבים',bills:'תזרים',capture:'קליטה חכמה',goals:'יעדים',investments:'השקעות',performance:'ביצועים',monthly:'עדכון חודשי',lab:'מה יקרה אם',wishlist:'קנייה חכמה',split:'חלוקת הוצאות',tools:'מחשבונים',insights:'תובנות',copilot:'Claude',settings:'הגדרות'};
const PAGE_ICONS={dashboard:'House',accounts:'Landmark',transactions:'ArrowLeftRight',budgets:'SlidersHorizontal',bills:'CalendarDays',capture:'ScanLine',goals:'Target',investments:'TrendingUp',performance:'ChartNoAxesCombined',monthly:'RefreshCw',lab:'FlaskConical',wishlist:'ShoppingBag',split:'Users',tools:'Calculator',insights:'Sparkles',copilot:'Bot',settings:'Settings'};
const hubOf=page=>HUBS.find(h=>h.pages.includes(page))||null;
const hubLast={};
const hubTarget=hub=>hub.pages.includes(hubLast[hub.id])?hubLast[hub.id]:hub.pages[0];
const brandMark=(size=30)=>`<svg class="brand-svg" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="ofek-brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22D3EE"/><stop offset=".55" stop-color="#2B6FE0"/><stop offset="1" stop-color="#4F46E5"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#ofek-brand)"/><path d="M8.5 21.5V16M13.5 21.5V12.5M18.5 21.5V17M23.5 21.5V9.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>`;
const firstLetter=()=>e(data.profile?.trim().slice(0,1)||'א');

// ---------- Theme ----------
const THEME_KEY='ofek-theme';
function themePref(){try{return localStorage.getItem(THEME_KEY)||'system';}catch{return 'system';}}
function resolvedTheme(pref=themePref()){
  if(pref==='light'||pref==='dark')return pref;
  return typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
}
function applyTheme(){
  if(typeof document==='undefined'||!document.documentElement?.setAttribute)return;
  const theme=resolvedTheme();
  document.documentElement.setAttribute('data-theme',theme);
  const meta=document.querySelector?.('meta[name="theme-color"]');
  if(meta&&typeof getComputedStyle==='function'){const bg=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();if(bg)meta.setAttribute('content',bg);}
}
function setTheme(pref){try{localStorage.setItem(THEME_KEY,pref);}catch{}applyTheme();render();}
function themeButton(){const dark=resolvedTheme()==='dark';return ib(dark?'Sun':'Moon',dark?'מעבר למצב בהיר':'מעבר למצב כהה','theme-toggle');}

// ---------- Frame ----------
function sidebarHTML(){
  const current=hubOf(ui.page);
  if(current)hubLast[current.id]=ui.page;
  return `<aside class="sidebar" aria-label="תפריט"><div class="brand">${brandMark(34)}<div><b>אופק</b><small>הכסף שלך, בבהירות</small></div></div><nav class="hub-nav" aria-label="ניווט ראשי">${HUBS.map(h=>`<button type="button" class="hub-item${current?.id===h.id?' active':''}" data-action="hub:${h.id}"${current?.id===h.id?' aria-current="page"':''}>${icon(h.icon,20)}<span>${h.label}</span></button>`).join('')}</nav><button type="button" class="sidebar-ai" data-action="navigate:copilot">${icon('Sparkles',18)}<span><b>שאל את Claude</b><small>למשל: כמה אפשר להוציא על חופשה?</small></span></button><div class="sidebar-bottom"><button type="button" class="hub-item${ui.page==='settings'?' active':''}" data-action="navigate:settings"${ui.page==='settings'?' aria-current="page"':''}>${icon('Settings',20)}<span>הגדרות וגיבוי</span></button><div class="local-status">${syncBadge()}</div><button type="button" class="profile" data-action="navigate:settings"><span class="avatar">${firstLetter()}</span><div><b>${e(data.profile||'המרחב האישי שלי')}</b><small>החשבון האישי שלך</small></div></button></div></aside>`;
}
function topbarHTML(){
  const hub=hubOf(ui.page),privacy=document.documentElement.classList.contains('privacy');
  return `<header class="topbar"><div class="topbar-start"><button type="button" class="icon-button topbar-menu" aria-label="כל העמודים" data-action="more">${icon('Menu',20)}</button><span class="topbar-brand">${brandMark(28)}</span><div class="breadcrumb">${hub&&hub.id!=='home'&&hub.pages.length>1?`<span>${e(hub.label)}</span>${icon('ChevronLeft',14)}`:''}<b>${e(PAGE_LABELS[ui.page]||'')}</b></div></div><div class="topbar-actions">${fxChip()}<button type="button" class="palette-trigger" data-action="palette" aria-label="חיפוש ופעולה מהירה">${icon('Search',17)}<span>חיפוש, פעולה או שאלה</span><kbd>Ctrl K</kbd></button>${themeButton()}${ib(privacy?'Eye':'EyeOff',privacy?'הצגת סכומים':'מצב פרטיות — הסתרת סכומים','privacy')}${alertsButton()}<button type="button" class="top-avatar" aria-label="הגדרות החשבון" data-action="navigate:settings">${firstLetter()}</button></div></header>`;
}
function subTabsHTML(){
  const hub=hubOf(ui.page);
  if(!hub||hub.pages.length<2)return '';
  return `<nav class="subtabs" aria-label="${e(hub.label)}">${hub.pages.map(p=>`<button type="button" class="subtab${ui.page===p?' active':''}" data-action="navigate:${p}"${ui.page===p?' aria-current="page"':''}>${icon(PAGE_ICONS[p],16)}<span>${PAGE_LABELS[p]}</span></button>`).join('')}</nav>`;
}
function openMoreSheet(){
  const tile=p=>`<button type="button" class="more-tile${ui.page===p?' active':''}" data-action="navigate:${p}">${icon(PAGE_ICONS[p],22)}<span>${PAGE_LABELS[p]}</span></button>`;
  const dark=resolvedTheme()==='dark';
  showDialog('כל העמודים',`<div class="more-sheet">${HUBS.filter(h=>h.id!=='home').map(h=>`<section class="more-group"><h3>${e(h.label)}</h3><div class="more-tiles">${h.pages.map(tile).join('')}</div></section>`).join('')}<section class="more-group"><h3>עוד</h3><div class="more-tiles">${tile('settings')}<button type="button" class="more-tile" data-action="theme-toggle">${icon(dark?'Sun':'Moon',22)}<span>${dark?'מצב בהיר':'מצב כהה'}</span></button><button type="button" class="more-tile" data-action="whats-new">${icon('Sparkles',22)}<span>מה חדש</span></button></div></section></div>`);
  document.querySelector('dialog')?.classList.add('sheet');
}

document.addEventListener('click',event=>{
  if(event.target.closest('.more-tile[data-action^="navigate:"]'))closeDialog();
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,a]=button.dataset.action.split(':');
  try{
    if(action==='hub'){const hub=HUBS.find(h=>h.id===a);if(hub)navigate(hubTarget(hub));}
    else if(action==='more')openMoreSheet();
    else if(action==='theme-toggle'){const inSheet=!!button.closest('.more-sheet');setTheme(resolvedTheme()==='dark'?'light':'dark');if(inSheet)closeDialog();}
  }catch(err){toast(err.message,true);}
});
document.addEventListener('change',event=>{if(event.target.matches?.('[data-theme-select]'))setTheme(event.target.value);});
applyTheme();
if(typeof matchMedia==='function'){try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(themePref()==='system'){applyTheme();render();}});}catch{}}
