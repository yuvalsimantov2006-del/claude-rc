// נועה — the app frame: the router (location.hash: '#view' or '#view/kind/id'), the frosted sidebar (desktop), the top
// bar, the bottom nav on phones (four tabs, the central "+", and "עוד"), the "עוד" sheet, the quick-add sheet and the
// global search (search.js). Views come from registerView() (core.js); this file only draws them.
// Private helpers are prefixed "sh".

const shState={route:null,lastView:null,entering:false,root:null,searchQuery:''};

// ---------- Routes ----------
// '#places/place/abc?x=1' → {view:'places', params:['place','abc'], query:{x:'1'}, path:'places/place/abc'}
function parseRoute(hash=location.hash){
  const raw=decodeURIComponent(String(hash||'').replace(/^#/,''));
  const [path,qs='']=raw.split('?');
  const parts=path.split('/').filter(Boolean);
  const query={};for(const pair of qs.split('&').filter(Boolean)){const [k,v='']=pair.split('=');query[k]=v;}
  return {view:parts[0]||'home',params:parts.slice(1),query,path:parts.join('/')||'home'};
}
// Go to a route ('places', 'her/fact/abc'). From inside a dialog it closes the dialogs first and replaces their
// history step, so Back never reopens a dialog page.
function go(route){
  const r=String(route||'home').replace(/^#/,'');
  if(UI_DLG.ignorePop>0){UI_DLG.pendingRoute=r;return;}
  if(dialogOpen()){
    closeAllDialogs({fromHistory:true});
    try{history.replaceState(null,'','#'+r);}catch{location.hash=r;return;}
    shRouteChanged();return;
  }
  if(('#'+r)===location.hash)shRouteChanged(true);else location.hash=r;
}
function currentRoute(){return shState.route||parseRoute();}

// ---------- The frame ----------
// The brand mark: a soft rounded heart in the palette gradient (its colours come from CSS, so it follows the palette).
let shMarkSeq=0;
function brandMark(size=32){
  const g=`bm${++shMarkSeq}`;
  return `<svg class="brand-mark" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="bm-s1"/><stop offset=".55" class="bm-s2"/><stop offset="1" class="bm-s3"/></linearGradient></defs><rect width="48" height="48" rx="15" fill="url(#${g})"/><path class="bm-heart" d="M24 36.2c-.5 0-1-.2-1.4-.5C16.4 30.9 12 26.9 12 21.6 12 18 14.8 15.2 18.3 15.2c2.3 0 4.3 1.2 5.7 3.1 1.4-1.9 3.4-3.1 5.7-3.1 3.5 0 6.3 2.8 6.3 6.4 0 5.3-4.4 9.3-10.6 14.1-.4.3-.9.5-1.4.5z"/><path class="bm-shine" d="M17.4 19.4c.9-1.2 2.3-1.7 3.5-1.5"/></svg>`;
}
function shNavViews(){
  const all=allViews().filter(v=>v.nav==='tab'||v.nav==='more');
  return {tabs:all.filter(v=>v.nav==='tab'),more:all.filter(v=>v.nav==='more'&&v.id!=='settings')};
}
function shSidebar(active){
  const {tabs,more}=shNavViews(),d=getData();
  const item=v=>`<a class="side-item${active===v.id?' active':''}" href="#${v.id}"${active===v.id?' aria-current="page"':''}>${icon(v.icon,20)}<span>${esc(v.navLabel||v.title)}</span>${v.badge?`<b class="side-badge">${esc(v.badge(d))}</b>`:''}</a>`;
  const settings=getView('settings');
  return `<aside class="sidebar" aria-label="תפריט ראשי"><a class="brand" href="#home" aria-label="${esc(herName())} — בית">${brandMark(40)}<span class="brand-text"><b>${esc(herName())}</b><small>כל מה שחשוב לדעת ולעשות</small></span></a>
    ${button('הוספה מהירה','quick-add',{icon:'Plus',variant:'primary',full:true,cls:'side-add'})}
    <nav class="side-nav" aria-label="ניווט ראשי">${tabs.map(item).join('')}${more.length?`<span class="side-label">עוד</span>${more.map(item).join('')}`:''}</nav>
    <div class="side-bottom">${settings?item(settings):''}<button type="button" class="side-item" data-action="search">${icon('Search',20)}<span>חיפוש</span><kbd>Ctrl K</kbd></button><p class="side-private">${icon('ShieldCheck',14)}<span>נשמר רק במכשיר הזה</span></p></div></aside>`;
}
function shTopbar(view){
  const locked=typeof lockEnabled==='function'&&lockEnabled();
  return `<header class="topbar"><div class="topbar-start"><a class="topbar-brand" href="#home" aria-label="${esc(herName())} — בית">${brandMark(32)}<b>${esc(herName())}</b></a><span class="topbar-title">${esc(view?.title||'')}</span></div>
    <div class="topbar-actions"><button type="button" class="search-trigger" data-action="search" aria-label="חיפוש בכל האפליקציה">${icon('Search',18)}<span>חיפוש עליה, מקומות, תאריכים…</span><kbd>Ctrl K</kbd></button>
    ${iconButton(resolvedTheme()==='dark'?'Sun':'Moon',resolvedTheme()==='dark'?'מעבר למראה בהיר':'מעבר למראה כהה','theme-toggle',{cls:'top-theme'})}
    ${locked?iconButton('Lock','נעילה עכשיו','lock-now',{cls:'top-lock'}):''}</div></header>`;
}
function shBottomNav(active){
  const {tabs,more}=shNavViews();
  const t=v=>`<a class="bottom-tab${active===v.id?' active':''}" href="#${v.id}"${active===v.id?' aria-current="page"':''}>${icon(v.icon,22)}<span>${esc(v.navLabel||v.title)}</span></a>`;
  const first=tabs.slice(0,2),rest=tabs.slice(2,4);
  const moreActive=!tabs.slice(0,4).some(v=>v.id===active)&&active!=='home';
  return `<nav class="bottom-nav" aria-label="ניווט">${first.map(t).join('')}<button type="button" class="bottom-add" data-action="quick-add" aria-label="הוספה מהירה">${icon('Plus',26)}</button>${rest.map(t).join('')}<button type="button" class="bottom-tab${moreActive?' active':''}" data-action="more" aria-haspopup="dialog">${icon('LayoutGrid',22)}<span>עוד</span></button></nav>`;
  void more;
}
function shPageHead(view,ctx){
  if(view.hideHead)return '';
  const sub=typeof view.subtitle==='function'?view.subtitle(ctx):view.subtitle;
  const actions=typeof view.headActions==='function'?view.headActions(ctx):'';
  return `<div class="page-head"><div class="page-head-text"><h1>${esc(view.title)}</h1>${sub?`<p>${esc(sub)}</p>`:''}</div>${actions?`<div class="page-head-actions">${actions}</div>`:''}</div>`;
}
function shBanners(){
  const d=getData();let out='';
  if(store.loadError)out+=notice(store.loadError,{tone:'error',title:'משהו לא בסדר עם הנתונים השמורים',actions:`${button('לשחזור ולגיבוי','',{href:'#settings/backup',variant:'soft',size:'small'})}`});
  if(d.demo)out+=`<div class="demo-banner" role="note">${icon('Sparkles',18)}<span><b>נתוני דוגמה</b> — הכול כאן בדוי, רק כדי לראות איך זה נראה.</span>${button('להתחיל משלי','demo-clear',{size:'small',variant:'soft'})}</div>`;
  return out;
}
// The context every view's render(ctx) receives.
function viewContext(view,route){
  return {data:getData(),today:todayISO(),params:route.params,query:route.query,route:route.path,view:view.id,her:herName()};
}

// ---------- Render ----------
function renderApp(){
  const root=shState.root||(shState.root=document.getElementById('root'));if(!root)return;
  const route=currentRoute();
  let view=getView(route.view);
  if(!view||(view.nav==='hidden-dev'&&!route.query.dev&&false)){view=getView('home');}
  const needsSetup=typeof setupNeeded==='function'&&setupNeeded()&&!['setup','gallery','settings'].includes(view.id);
  if(needsSetup)view=getView('setup')||view;
  const ctx=viewContext(view,route);
  shState.entering=shState.lastView!==view.id;shState.lastView=view.id;
  const keep=shFocusKey();
  let content='';
  try{content=view.render(ctx);}catch(err){try{console.error(err);}catch{}content=card(emptyState({icon:'TriangleAlert',title:'משהו השתבש בעמוד הזה',text:'הנתונים שלך בטוחים. נסה לחזור לבית ולפתוח שוב.',actions:button('חזרה לבית','',{href:'#home',variant:'primary'})}));}
  document.title=view.id==='home'?herName():`${view.title} · ${herName()}`;
  document.documentElement.classList.toggle('bare',!!view.bare);
  if(view.bare){
    root.innerHTML=`<main id="main" class="bare-main" tabindex="-1">${content}</main>`;
  }else{
    root.innerHTML=`<div class="app"><a class="skip-link" href="#main" data-action="skip">דילוג לתוכן</a>${shSidebar(view.id)}<div class="main-col">${shTopbar(view)}<main id="main" tabindex="-1" class="view-${esc(view.id)}">${shBanners()}${shPageHead(view,ctx)}<div class="page${shState.entering?' enter':''}">${content}</div><footer class="app-foot">${icon('Heart',13)}<span>${esc(herName())} · נשמר רק במכשיר שלך, בלי שרתים ובלי חשבונות.</span></footer></main></div>${shBottomNav(view.id)}</div>`;
  }
  const main=root.querySelector('#main');
  hydratePhotos(main);
  try{view.afterRender?.(main,ctx);}catch(err){try{console.error(err);}catch{}}
  for(const fn of SH_AFTER_RENDER)try{fn(main,ctx);}catch{}
  shRestoreFocus(keep);
  return {view,ctx};
}
const SH_AFTER_RENDER=[];
// Run something after every render (e.g. to hydrate a custom widget): onAfterRender((mainEl, ctx)=>{})
function onAfterRender(fn){SH_AFTER_RENDER.push(fn);}
// Keep keyboard focus on "the same" control across a re-render (e.g. the heart you just pressed).
function shFocusKey(){
  const a=document.activeElement;if(!a||a===document.body||!shState.root?.contains(a))return null;
  return a.dataset.action?`[data-action="${CSS.escape(a.dataset.action)}"]`:a.id?`#${CSS.escape(a.id)}`:a.getAttribute('href')?`[href="${CSS.escape(a.getAttribute('href'))}"]`:null;
}
function shRestoreFocus(sel){if(!sel)return;const el=shState.root.querySelector(sel);if(el)try{el.focus({preventScroll:true});}catch{}}
function shRouteChanged(force=false){
  const prev=shState.route,next=parseRoute();
  shState.route=next;
  const viewChanged=!prev||prev.view!==next.view;
  const {view,ctx}=renderApp()||{};
  if(viewChanged||force){window.scrollTo({top:0,behavior:'instant'});}
  // Deep links ('#places/place/<id>'): the view opens the item; otherwise scroll to [data-id] and flash it.
  if(view&&next.params.length&&(viewChanged||force||prev?.path!==next.path)){
    const [kind,id]=next.params;
    if(typeof view.openItem==='function'){try{view.openItem(kind,id,ctx);}catch(err){try{console.error(err);}catch{}}}
    else if(id)flashItem(id);
  }
  if(viewChanged)try{document.getElementById('main')?.focus({preventScroll:true});}catch{}
}
// Scroll an item ([data-id]) into view and make it glow for a moment.
function flashItem(id){
  const el=document.querySelector(`#main [data-id="${CSS.escape(id)}"]`);if(!el)return false;
  el.scrollIntoView({block:'center',behavior:'smooth'});el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');
  return true;
}

// ---------- Sheets: "עוד", quick add, search ----------
function openMoreSheet(){
  const {more}=shNavViews(),active=currentRoute().view;
  const tile=(label,ic,attrs,on=false)=>`<${attrs.startsWith('href')?'a':'button type="button"'} class="more-tile${on?' active':''}" ${attrs}>${icon(ic,22)}<span>${esc(label)}</span></${attrs.startsWith('href')?'a':'button'}>`;
  const dark=resolvedTheme()==='dark',locked=typeof lockEnabled==='function'&&lockEnabled();
  openDialog({title:'עוד',cls:'more-sheet',body:`<div class="more-tiles sections">${more.map(v=>tile(v.navLabel||v.title,v.icon,`href="#${v.id}"`,active===v.id)).join('')}</div>
    <div class="more-tiles small">${tile('הגדרות','Settings','href="#settings"',active==='settings')}${tile('חיפוש','Search','data-action="search"')}${tile('צבעים','Palette','data-action="open-palette"')}${tile(dark?'מראה בהיר':'מראה כהה',dark?'Sun':'Moon','data-action="theme-toggle"')}${locked?tile('נעילה עכשיו','Lock','data-action="lock-now"'):''}</div>`});
}
function openQuickAdd(){
  const items=quickAdds();
  const el=openDialog({title:'מה מוסיפים?',cls:'quick-sheet',body:items.length?`<div class="quick-grid">${items.map((q,i)=>`<button type="button" class="quick-item" data-quick="${i}">${iconTile(q.icon,['1','2','3'][i%3],22)}<span><b>${esc(q.label)}</b>${q.hint?`<small>${esc(q.hint)}</small>`:''}</span></button>`).join('')}</div>`:emptyState({title:'עוד אין מה להוסיף',compact:true})});
  el?.addEventListener('click',event=>{const b=event.target.closest('[data-quick]');if(!b)return;const q=items[+b.dataset.quick];closeDialog(el);setTimeout(()=>runAction(q.run),0);});
}
// Global search: one field, results grouped by section as he types (search.js does the matching).
function openSearch(initial=''){
  if(UI_DLG.stack.some(x=>x.el.classList.contains('search-sheet')))return;
  const el=openDialog({title:'חיפוש בכל מקום',cls:'search-sheet',focus:'.search-input input',
    body:`<div class="search-input">${icon('Search',20)}<input type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="מה מחפשים? אוכל, מקום, שם, תאריך…" aria-label="חיפוש בכל האפליקציה" value="${esc(initial)}"></div><div class="search-results" aria-live="polite"></div>`});
  if(!el)return;
  const input=el.querySelector('input'),box=el.querySelector('.search-results');
  let active=-1;
  const draw=()=>{
    const q=input.value;shState.searchQuery=q;active=-1;
    if(!q.trim()){box.innerHTML=shSearchHint();return;}
    const results=typeof searchAll==='function'?searchAll(getData(),q,{limit:60}):[];
    if(!results.length){box.innerHTML=emptyState({icon:'Search',title:'לא מצאנו',text:`אין כלום עם "${q.trim()}". נסה מילה אחרת או חלק ממנה.`,compact:true});return;}
    const groups=typeof groupResults==='function'?groupResults(results):[{label:'',icon:'Search',items:results}];
    box.innerHTML=groups.map(g=>`<section class="search-group"><h3>${icon(g.icon,15)}${esc(g.label)}<b>${g.items.length}</b></h3>${g.items.map(r=>`<a class="search-hit" href="#${esc(r.route)}"><span class="hit-text"><b>${shMark(r.title,q)}</b>${r.subtitle?`<small>${shMark(r.subtitle,q)}</small>`:''}</span>${icon('ChevronLeft',16)}</a>`).join('')}</section>`).join('');
  };
  input.addEventListener('input',draw);
  input.addEventListener('keydown',event=>{
    const hits=[...box.querySelectorAll('.search-hit')];if(!hits.length)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+hits.length)%hits.length;hits.forEach((h,i)=>h.classList.toggle('active',i===active));hits[active].scrollIntoView({block:'nearest'});}
    else if(event.key==='Enter'){event.preventDefault();(hits[Math.max(0,active)]).click();}
  });
  box.addEventListener('click',event=>{const chipEl=event.target.closest('[data-search-q]');if(chipEl){input.value=chipEl.dataset.searchQ;draw();input.focus();}});
  draw();
}
// Highlighted text: every part escaped; matches wrapped in <mark>.
function shMark(text,q){
  if(typeof highlightParts!=='function')return esc(text);
  return highlightParts(text,q).map(p=>p.match?`<mark>${esc(p.text)}</mark>`:esc(p.text)).join('');
}
function shSearchHint(){
  const d=getData();
  const tries=[...new Set([...(d.facts||[]).filter(f=>f.starred).map(f=>f.title.split(/[ —,]/)[0]),...(d.places||[]).slice(0,3).map(p=>p.name.split(' ')[0])].filter(w=>w&&w.length>1))].slice(0,6);
  return `<div class="search-hint"><p>אפשר לחפש בכל מקום באפליקציה: מה היא אוהבת, מקומות, אנשים, תאריכים, מתנות, תוכניות וזיכרונות.</p>${tries.length?chipRow(tries.map(t=>`<button type="button" class="chip" data-search-q="${esc(t)}">${esc(t)}</button>`),{label:'נסה לחפש',wrap:true}):''}</div>`;
}

// ---------- Wiring ----------
if(typeof document!=='undefined'&&document.addEventListener){
  onAction('quick-add',()=>openQuickAdd());
  onAction('more',()=>openMoreSheet());
  onAction('search',()=>{if(UI_DLG.stack.some(x=>x.el.classList.contains('more-sheet')))closeAllDialogs();setTimeout(()=>openSearch(),0);});
  onAction('go',route=>go(route));
  onAction('skip',()=>{try{document.getElementById('main')?.focus();}catch{}});
  onAction('demo-clear',async()=>{
    const ok=await confirmAsk({title:'ניקוי נתוני הדוגמה',text:'כל נתוני הדוגמה יימחקו ותתחיל דף חדש משלך. אפשר לטעון אותם שוב מההגדרות.',confirm:'ניקוי והתחלה',icon:'Sparkles'});
    if(!ok)return;
    update(()=>emptyData(),{message:'הדוגמה נוקתה. בוא נתחיל 💛',undo:true});
    go('home');
  });
  // Theme toggles from inside the "עוד" sheet close it; palette opens its own sheet.
  document.addEventListener('click',event=>{
    if(event.target.closest('.more-sheet [data-action="theme-toggle"], .more-sheet [data-action="open-palette"], .more-sheet [data-action="lock-now"]'))closeAllDialogs();
  },true);
  window.addEventListener('hashchange',()=>shRouteChanged());
  // Ctrl/⌘+K or "/" opens the search; "n" opens quick add (outside text fields).
  document.addEventListener('keydown',event=>{
    if(typeof isLocked==='function'&&isLocked())return;
    const inField=event.target.closest?.('input,textarea,select,[contenteditable]');
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openSearch();}
    else if(!inField&&!dialogOpen()&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      if(event.key==='/'){event.preventDefault();openSearch();}
      else if(event.key==='n'||event.key==='מ'){event.preventDefault();openQuickAdd();}
    }
  });
  // Re-render on every data change (commit, undo, another tab).
  onDataChange(()=>{if(shState.root)renderApp();});
}
