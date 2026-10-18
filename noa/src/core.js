// נועה — the core: the data store (safe saves, the previous save, undo), the registries every screen plugs into
// (views, quick-add, home cards, settings cards, item routes), click/change actions, HTML escaping, Hebrew date
// formatting and the toast. The store itself is a pure factory (createStore) so node tests can drive it with a
// fake storage; the page creates one over localStorage. Everything a section module needs is a plain global
// function in the shared bundle scope — see noa/API.md.
import {DATA_KEY,DATA_LISTS,emptyData,validateData,uid,localToday,isIsoDate} from './model.js';

export const PREV_KEY=DATA_KEY+'-prev';
export const TMP_KEY=DATA_KEY+'-tmp';
export const BROKEN_KEY=DATA_KEY+'-unreadable';
export const UNDO_LIMIT=12;

// ---------- The store (pure: storage is injected) ----------
// Saving never loses data: the new JSON goes to a temp key first and is read back; then the current save is
// copied to `-prev`, the main key is written, and the temp key removed. Loading prefers a complete temp copy (a
// save that was cut off between the steps), then the main key. An unreadable main key is kept aside (once) and
// never overwritten silently: the store reports `loadError` and refuses commits until he restores or resets.
export function createStore(storage,{now=()=>new Date()}={}){
  const read=k=>{try{return storage.getItem(k);}catch{return null;}};
  let data=null,loadError=null,from='empty';
  const undoStack=[];
  const listeners=new Set();
  function parse(raw){return validateData(JSON.parse(raw),now().toISOString());}
  function load(){
    undoStack.length=0;loadError=null;
    const tmp=read(TMP_KEY),main=read(DATA_KEY);
    if(tmp){try{data=parse(tmp);from='tmp';try{write(data);}catch{}return api;}catch{try{storage.removeItem(TMP_KEY);}catch{}}}
    if(main==null){data=emptyData();from='empty';return api;}
    try{data=parse(main);from='main';}
    catch{
      from='broken';data=emptyData();
      loadError='לא הצלחנו לקרוא את הנתונים השמורים. הם לא נמחקו. אפשר לשחזר את השמירה הקודמת או לייבא גיבוי בהגדרות.';
      try{if(read(BROKEN_KEY)==null)storage.setItem(BROKEN_KEY,main);}catch{}
    }
    return api;
  }
  function write(next){
    const json=JSON.stringify(next);
    try{
      storage.setItem(TMP_KEY,json);
      if(read(TMP_KEY)!==json)throw new Error('verify');
      const current=read(DATA_KEY);
      if(current!=null&&current!==json){
        let ok=false;try{validateData(JSON.parse(current));ok=true;}catch{}
        if(ok)storage.setItem(PREV_KEY,current);else if(read(BROKEN_KEY)==null)storage.setItem(BROKEN_KEY,current);
      }
      storage.setItem(DATA_KEY,json);
      storage.removeItem(TMP_KEY);
    }catch(err){
      try{storage.removeItem(TMP_KEY);}catch{}
      const e=new Error('השמירה נכשלה: האחסון בדפדפן מלא או חסום. השינוי לא נשמר — כדאי להוריד גיבוי ולפנות מקום.');
      e.noaStorage=true;e.cause=err;throw e;
    }
  }
  // Commit a complete next state. `undo` (a label) records a snapshot so undo() brings back exactly `data`.
  function commit(next,{undo=null,force=false}={}){
    if(loadError&&!force)throw new Error('אי אפשר לשמור מעל נתונים שלא נקראו. שחזר את השמירה הקודמת, ייבא גיבוי, או אפס בהגדרות.');
    const valid=validateData(next,now().toISOString());
    write(valid);
    const before=data;data=valid;
    if(force){loadError=null;undoStack.length=0;}
    if(undo&&before){undoStack.push({before,after:valid,label:String(undo),at:now().getTime()});if(undoStack.length>UNDO_LIMIT)undoStack.shift();}
    for(const fn of listeners)try{fn(valid,before);}catch{}
    return valid;
  }
  // Undo the latest snapshot — only if nothing else changed the data since (another tab, an import…).
  function undo(){
    const top=undoStack.pop();
    if(!top)return {ok:false,reason:'none'};
    let stored=null;try{stored=read(DATA_KEY);}catch{}
    if(data!==top.after||stored!==JSON.stringify(top.after)){undoStack.length=0;return {ok:false,reason:'changed'};}
    write(top.before);const before=data;data=top.before;
    for(const fn of listeners)try{fn(data,before);}catch{}
    return {ok:true,label:top.label};
  }
  function prev(){const raw=read(PREV_KEY);if(!raw)return null;try{return parse(raw);}catch{return null;}}
  const api={
    load,commit,undo,prev,
    get:()=>data,
    get loadError(){return loadError;},
    get from(){return from;},
    canUndo:()=>undoStack.length>0,
    undoLabel:()=>undoStack.at(-1)?.label||'',
    clearUndo:()=>{undoStack.length=0;},
    subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},
    // Another tab saved: take its data (and drop undo snapshots that no longer apply).
    reloadFromStorage(){const before=data;load();for(const fn of listeners)try{fn(data,before);}catch{}return data;}
  };
  return api;
}

// A list item as it is saved: id, created/updated stamps and the shared optional fields, merged over the existing
// item with the same id (so fields another screen added survive an edit). Pure; used by saveItem().
export function mergeItem(existing,patch,nowIso){
  if(existing)return {...existing,...patch,id:existing.id,created:existing.created||nowIso,updated:nowIso};
  return {starred:false,tags:[],notes:'',...patch,id:patch.id||uid(),created:nowIso,updated:nowIso};
}

// ---------- HTML escaping ----------
const ESC_MAP={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'};
// Escape any value for HTML text and attribute values (null/undefined → '').
export function esc(v){return String(v??'').replace(/[&<>"'`]/g,c=>ESC_MAP[c]);}
// Escape, keeping line breaks as <br> (multi-line notes).
export function escLines(v){return esc(v).replace(/\r?\n/g,'<br>');}
// A safe href: only http(s), tel:, mailto: and geo:/intent-free map links; anything else becomes '#'.
export function safeUrl(v){const s=String(v??'').trim();return /^(https?:|tel:|mailto:|geo:)/i.test(s)?s:/^www\./i.test(s)?'https://'+s:'';}

// ---------- Dates (Hebrew) ----------
export const HE_MONTHS=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
export const HE_WEEKDAYS=['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','שבת'];
export function todayISO(){return localToday();}
const crParts=iso=>iso.split('-').map(Number);
const crUtc=iso=>{const [y,m,d]=crParts(iso);return Date.UTC(y,m-1,d);};
// Whole days from `from` to `iso` (positive = in the future). Local calendar days, no DST drift.
export function daysUntil(iso,from=todayISO()){return isIsoDate(iso)&&isIsoDate(from)?Math.round((crUtc(iso)-crUtc(from))/864e5):NaN;}
export function addDaysISO(iso,days){return new Date(crUtc(iso)+days*864e5).toISOString().slice(0,10);}
// "2 ביוני" (this year) · "2 ביוני 2025" (another year) · {weekday:true} → "יום ג׳, 2 ביוני 2026" ·
// {year:true|false} forces the year on or off · {month:'short'}… not needed: Hebrew months are short already.
export function fmtDate(iso,{weekday=false,year}={}){
  if(!isIsoDate(iso))return '';
  // In the page this is dates.js formatDate (one dialect app-wide); the fallback below keeps node tests standalone.
  if(typeof formatDate==='function'&&typeof isoParse==='function'){const thisYear=Number(todayISO().slice(0,4)),y=Number(iso.slice(0,4)),withYear=year??(weekday||y!==thisYear);return formatDate(iso,weekday?(withYear?'long':'weekday'):(withYear?'year':'short'));}
  const [y,m,d]=crParts(iso),showYear=year??(weekday||y!==Number(todayISO().slice(0,4)));
  const wd=new Date(Date.UTC(y,m-1,d)).getUTCDay();
  const day=weekday?(wd===6?'שבת, ':`יום ${HE_WEEKDAYS[wd]}, `):'';
  return `${day}${d} ב${HE_MONTHS[m-1]}${showYear?` ${y}`:''}`;
}
// "ביוני 2026" for month headings (timeline groups).
export function fmtMonth(yyyymm){const [y,m]=String(yyyymm).split('-').map(Number);return m>=1&&m<=12?`${HE_MONTHS[m-1]} ${y}`:'';}
// How far away a day is, in words: היום · מחר · מחרתיים · בעוד 5 ימים · בעוד שבוע · בעוד חודשיים · אתמול · לפני שבועיים …
export function fmtRelative(isoOrDays,from=todayISO()){
  const n=typeof isoOrDays==='number'?isoOrDays:daysUntil(isoOrDays,from);
  if(!Number.isFinite(n))return '';
  if(typeof countdownText==='function')return countdownText(n); // dates.js, in the page
  if(n===0)return 'היום';if(n===1)return 'מחר';if(n===2)return 'מחרתיים';if(n===-1)return 'אתמול';if(n===-2)return 'שלשום';
  const a=Math.abs(n),pre=n>0?'בעוד ':'לפני ';
  return pre+spanWords(a);
}
// A span of days in words: 5 ימים · שבוע · 10 ימים · שבועיים · חודש · 3 חודשים · שנה · שנתיים · 4 שנים
export function spanWords(a){
  if(a===1)return 'יום';if(a===2)return 'יומיים';
  if(a<7)return `${a} ימים`;if(a===7)return 'שבוע';if(a<14)return `${a} ימים`;if(a===14)return 'שבועיים';
  if(a<30)return `${a} ימים`;
  if(a<45)return 'חודש';if(a<75)return 'חודשיים';
  if(a<350){const mo=Math.round(a/30.44);return mo===12?'שנה':`${mo} חודשים`;}
  const y=Math.round(a/365.25);return y<=1?'שנה':y===2?'שנתיים':`${y} שנים`;
}
// Count with the right noun: plural('ימים','יום',n) → "יום אחד" / "2 ימים" (2 → the dual when given).
export function countWord(n,one,many,two=''){return n===1?`${one} אחד`:n===2&&two?two:`${n.toLocaleString('he-IL')} ${many}`;}

// ---------- Registries ----------
// The section routes, their place in the navigation and their look. Section modules spread these into
// registerView({...navSection('places'), render…}) so the bottom nav, sidebar and "עוד" stay consistent.
export const NAV_SECTIONS=[
  {id:'home',title:'בית',icon:'House',nav:'tab',order:10},
  {id:'her',title:'עליה',icon:'Heart',nav:'tab',order:20},
  {id:'places',title:'מקומות',icon:'MapPin',nav:'tab',order:30},
  {id:'dates',title:'תאריכים',icon:'CalendarHeart',nav:'tab',order:40},
  {id:'gifts',title:'מתנות',icon:'Gift',nav:'more',order:50},
  {id:'plans',title:'תוכניות ורעיונות',navLabel:'תוכניות',icon:'ListChecks',nav:'more',order:60},
  {id:'memories',title:'זיכרונות',icon:'BookHeart',nav:'more',order:70},
  {id:'questions',title:'שאלות לשיחה',icon:'MessagesSquare',nav:'more',order:80},
  {id:'settings',title:'הגדרות',icon:'Settings',nav:'more',order:900}
];
export function navSection(id){const s=NAV_SECTIONS.find(x=>x.id===id);return s?{...s}:{id};}
const VIEWS=new Map();
const QUICK_ADDS=new Map();
const HOME_CARDS=new Map();
const SETTINGS_CARDS=new Map();
const ITEM_ROUTES=new Map(Object.entries({facts:'her',people:'her',places:'places',dates:'dates',gifts:'gifts',plans:'plans',memories:'memories'}));
// A view: {id, title, icon, nav:'tab'|'more'|'none', order, render(ctx)→html, afterRender?(el,ctx),
//   openItem?(id,ctx), subtitle?: string|fn(ctx), headActions?: fn(ctx)→html, hideHead?:bool, stub?:bool}
// A real view replaces a stub with the same id whatever the order they load in; a stub never replaces a real one.
export function registerView(def){
  if(!def||typeof def.id!=='string'||typeof def.render!=='function')throw new Error('registerView: id and render() are required');
  const old=VIEWS.get(def.id);
  if(old&&!old.stub&&def.stub)return;
  if(old&&!old.stub&&!def.stub)try{console.warn(`registerView: "${def.id}" registered twice; the later one wins`);}catch{}
  VIEWS.set(def.id,{nav:'none',order:100,title:'',icon:'Heart',...def});
}
export const getView=id=>VIEWS.get(id)||null;
export const allViews=()=>[...VIEWS.values()].sort((a,b)=>a.order-b.order);
// Quick add ("+"): {id, label, icon, order, hint?, run()}. Same id replaces.
// A stub (stub:true — stubs.js) never replaces a real entry, and a real one always replaces a stub.
function crPut(map,def,defaults){const old=map.get(def.id);if(old&&!old.stub&&def.stub)return;map.set(def.id,{...defaults,...def});}
export function registerQuickAdd(def){crPut(QUICK_ADDS,def,{order:100,icon:'Plus'});}
export const quickAdds=()=>[...QUICK_ADDS.values()].sort((a,b)=>a.order-b.order);
// Home cards: {id, order, size:'full'|'half', render(ctx)→html|''}. '' (or null) hides the card. Lower order = higher.
export function registerHomeCard(def){crPut(HOME_CARDS,def,{order:100,size:'full'});}
export const homeCards=()=>[...HOME_CARDS.values()].sort((a,b)=>a.order-b.order);
// Settings cards: {id, order, render(ctx)→html}. The foundation's own cards use orders 10–90 and 900+.
export function registerSettingsCard(def){crPut(SETTINGS_CARDS,def,{order:500});}
export const settingsCards=()=>[...SETTINGS_CARDS.values()].sort((a,b)=>a.order-b.order);
// Which view shows the items of a list (search results, deep links). Defaults above; a section may change it.
export function registerItemRoute(list,viewId){ITEM_ROUTES.set(list,viewId);}
export const itemRoute=list=>ITEM_ROUTES.get(list)||null;

// ---------- Actions ----------
// Clicks: any element with data-action="name" or data-action="name:arg" calls the handler registered with
// onAction(name, (arg, el, event)=>{}). Changes: data-change="name[:arg]" on an input/select calls
// onChange(name, (value, el, event)=>{}) on 'change'; data-input="name[:arg]" calls it on every 'input'.
// A thrown error (or a rejected promise) shows its message as an error toast.
const ACTIONS=new Map(),CHANGES=new Map();
export function onAction(name,fn){if(ACTIONS.has(name))try{console.warn(`onAction: "${name}" registered twice; the later one wins`);}catch{}ACTIONS.set(name,fn);}
export function onChange(name,fn){CHANGES.set(name,fn);}
export const hasAction=name=>ACTIONS.has(name);
export function splitAction(raw){const s=String(raw||''),i=s.indexOf(':');return i<0?[s,'']:[s.slice(0,i),s.slice(i+1)];}
function reportError(err){
  const msg=err&&typeof err.message==='string'&&/[\u0590-\u05FF]/.test(err.message)?err.message:'משהו השתבש. נסה שוב.';
  if(!(err&&err.message&&/[\u0590-\u05FF]/.test(err.message)))try{console.error(err);}catch{}
  toast(msg,{error:true});
}
function runHandler(fn,args){try{const r=fn(...args);if(r&&typeof r.then==='function')r.catch(reportError);}catch(err){reportError(err);}}

// ---------- The page's store and the helpers every screen uses ----------
const crHasDom=typeof document!=='undefined'&&!!document.addEventListener;
// localStorage, or (when the browser blocks it — a private window, blocked site data) a memory stand-in, so the
// app still works for this visit; storageBlocked() then says so on every page.
let crMemoryOnly=false;
function crStorage(){
  try{const s=globalThis.localStorage;const k='noa-probe';s.setItem(k,'1');s.removeItem(k);return s;}
  catch{crMemoryOnly=true;const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),key:i=>[...m.keys()][i]??null,get length(){return m.size;}};}
}
export const storageBlocked=()=>crMemoryOnly;
const store=crHasDom?createStore(crStorage()):null;
export function getData(){return store.get();}
export function findItem(list,id){return (store.get()[list]||[]).find(x=>x.id===id)||null;}
// Change the data in one call: mutate the draft (a deep copy) or return a whole new object. Records an undo
// snapshot (unless undo:false), saves, re-renders, and shows `message` (with a "ביטול" button when undoable).
export function update(mutator,{message='',undo=true,silent=false}={}){
  const draft=structuredClone(store.get());
  const out=mutator(draft);
  const next=out&&typeof out==='object'&&out!==draft&&'version' in out?out:draft;
  const saved=store.commit(next,{undo:undo?(message||'השינוי'):null});
  if(!silent&&message)toast(message,{undo});
  return saved;
}
// Add or edit one list item (merged over the existing item with the same id). Returns the saved item.
export function saveItem(list,item,{message,undo=true,silent=false}={}){
  if(!DATA_LISTS.some(l=>l.id===list))throw new Error(`saveItem: unknown list ${list}`);
  const nowIso=new Date().toISOString();let saved=null;
  const isNew=!item.id||!findItem(list,item.id);
  update(d=>{
    const arr=d[list];const i=item.id?arr.findIndex(x=>x.id===item.id):-1;
    saved=mergeItem(i>=0?arr[i]:null,item,nowIso);
    if(i>=0)arr[i]=saved;else arr.push(saved);
  },{message:message??(isNew?'נשמר 💛':'השינויים נשמרו'),undo,silent});
  return findItem(list,saved.id)||saved;
}
// Delete one item, with an undo toast. `message` defaults to "נמחק".
export function removeItem(list,id,{message='נמחק'}={}){
  if(!findItem(list,id))return false;
  update(d=>{d[list]=d[list].filter(x=>x.id!==id);},{message,undo:true});
  return true;
}
// Star / un-star an item (no toast; the button pops a heart). Returns the new state.
export function toggleStar(list,id){
  const it=findItem(list,id);if(!it)return false;
  const on=!it.starred;
  update(d=>{const x=d[list].find(y=>y.id===id);if(x){x.starred=on;x.updated=new Date().toISOString();}},{undo:false,silent:true});
  return on;
}
export function setProfile(patch,{message='נשמר',undo=true,silent=false}={}){return update(d=>{d.profile={...d.profile,...patch};},{message,undo,silent}).profile;}
export function setPrefs(patch,{message='',undo=false,silent=true}={}){return update(d=>{d.prefs={...d.prefs,...patch};},{message,undo,silent}).prefs;}
export function undoLast(){
  const r=store.undo();
  if(r.ok)toast('בוטל ✓');
  else toast(r.reason==='changed'?'אי אפשר לבטל: היו שינויים נוספים מאז.':'אין מה לבטל.',{error:r.reason==='changed'});
  return r.ok;
}
// Her name (the brand follows it) and small grammar helpers.
// Listen to every data change (after a commit, an undo, or another tab's save): fn(next, previous).
export function onDataChange(fn){return store.subscribe(fn);}
export function herName(){const n=store?.get()?.profile?.her;return (n&&String(n).trim())||'נועה';}
export function myName(){return (store?.get()?.profile?.me||'').trim();}

// ---------- Files ----------
// Hand the user a file (backups, the .ics calendar). Works offline; no network.
export function downloadFile(name,content,type='application/json'){
  const blob=content instanceof Blob?content:new Blob([content],{type:type+';charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.rel='noopener';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}

// ---------- Toast ----------
let crToastTimer=null;
// toast(message, {undo:bool, error:bool, icon:'Name', action:{label, run}, ms})
export function toast(message,opts={}){
  if(!crHasDom)return;
  clearTimeout(crToastTimer);document.querySelector('.toast')?.remove();
  const el=document.createElement('div');
  el.className='toast'+(opts.error?' error':'');
  el.setAttribute('role',opts.error?'alert':'status');
  const ic=opts.icon||(opts.error?'Info':'Check');
  el.innerHTML=`${icon(ic,19)}<span>${esc(message)}</span>${opts.undo&&store.canUndo()?'<button type="button" class="toast-btn" data-action="undo">ביטול</button>':''}${opts.action?`<button type="button" class="toast-btn" data-toast-action>${esc(opts.action.label)}</button>`:''}<button type="button" class="icon-button toast-close" data-action="toast-close" aria-label="סגירת ההודעה">${icon('X',16)}</button>`;
  if(opts.action)el.querySelector('[data-toast-action]').addEventListener('click',()=>{el.remove();runHandler(opts.action.run,[]);});
  document.body.append(el);
  crToastTimer=setTimeout(()=>el.remove(),opts.ms||(opts.undo||opts.action?8000:4200));
}

if(crHasDom){
  store.load();
  document.addEventListener('click',event=>{
    const el=event.target.closest?.('[data-action]');if(!el||el.closest('[inert]')||el.disabled)return;
    const [name,arg]=splitAction(el.dataset.action);const fn=ACTIONS.get(name);if(!fn)return;
    if(el.tagName==='A')event.preventDefault();
    runHandler(fn,[arg,el,event]);
  });
  const onField=type=>event=>{
    const el=event.target;const attr=type==='input'?el?.dataset?.input:el?.dataset?.change;if(!attr)return;
    const [name,arg]=splitAction(attr);const fn=CHANGES.get(name);if(!fn)return;
    const value=el.type==='checkbox'?el.checked:el.value;
    runHandler(fn,[value,el,event,arg]);
  };
  document.addEventListener('change',onField('change'));
  document.addEventListener('input',onField('input'));
  onAction('undo',()=>{document.querySelector('.toast')?.remove();undoLast();});
  onAction('toast-close',(a,el)=>el.closest('.toast')?.remove());
  // Ctrl/⌘+Z outside a text field undoes the last change.
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&event.key.toLowerCase()==='z'&&!event.target.closest?.('input,textarea,select,[contenteditable]')&&!document.querySelector('dialog[open]')&&store.canUndo()){event.preventDefault();undoLast();}
  });
  // Another tab (or window) saved: follow it.
  window.addEventListener('storage',event=>{if(event.key===DATA_KEY&&event.newValue!==JSON.stringify(store.get()))store.reloadFromStorage();});
}
