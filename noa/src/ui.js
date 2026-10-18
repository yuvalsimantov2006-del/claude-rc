// נועה — shared UI helpers. Every helper returns an HTML string (or opens a dialog). Text parameters are escaped
// by the helper; parameters whose name ends in "Html" (and `body`, `actions`, `meta`) are inserted as they are, so
// build them from these helpers or escape with esc(). See noa/API.md for the full list and #gallery for every
// component in its states. Private helpers are prefixed "ui".

// ---------- Buttons ----------
// button('שמירה','save-thing:42',{icon:'Check',variant:'primary'|'ghost'|'danger'|'soft'|'quiet',size:'small'|'big',
//   full:true, href:'#places' (renders a link), type:'submit', attrs:'data-x="1"', disabled:true, iconEnd:'ChevronLeft'})
function uiAttrs(o){return (o.attrs?` ${o.attrs}`:'')+(o.title?` title="${esc(o.title)}"`:'')+(o.disabled?' disabled aria-disabled="true"':'');}
function button(label,action='',o={}){
  const cls=['btn',o.variant,o.size,o.full?'full':'',o.cls].filter(Boolean).join(' ');
  const inner=`${o.icon?icon(o.icon,o.size==='small'?16:18):''}${label?`<span>${esc(label)}</span>`:''}${o.iconEnd?icon(o.iconEnd,16):''}`;
  if(o.href)return `<a class="${cls}" href="${esc(o.href)}"${action?` data-action="${esc(action)}"`:''}${o.external?' target="_blank" rel="noopener noreferrer"':''}${uiAttrs(o)}>${inner}</a>`;
  return `<button type="${o.type||'button'}" class="${cls}"${action?` data-action="${esc(action)}"`:''}${uiAttrs(o)}>${inner}</button>`;
}
// A square icon-only button with an accessible name: iconButton('Pencil','עריכה','edit:42',{variant:'soft'})
function iconButton(name,label,action='',o={}){
  const cls=['icon-btn',o.variant,o.size,o.cls].filter(Boolean).join(' ');
  if(o.href)return `<a class="${cls}" href="${esc(o.href)}" aria-label="${esc(label)}"${o.external?' target="_blank" rel="noopener noreferrer"':''}${uiAttrs(o)}>${icon(name,o.iconSize||19)}</a>`;
  return `<button type="button" class="${cls}" aria-label="${esc(label)}"${action?` data-action="${esc(action)}"`:''}${o.pressed!=null?` aria-pressed="${!!o.pressed}"`:''}${uiAttrs(o)}>${icon(name,o.iconSize||19)}</button>`;
}
// The favourite heart on any item: heartButton('places', id, on). Click toggles (with a pop) — no extra code.
function heartButton(list,id,on,o={}){
  return `<button type="button" class="heart-btn${on?' on':''}${o.cls?' '+o.cls:''}" data-action="star:${esc(list)}:${esc(id)}" aria-pressed="${!!on}" aria-label="${on?'הסרה מהמועדפים':'הוספה למועדפים'}">${icon('Heart',o.size||20)}</button>`;
}

// ---------- Cards and headings ----------
// card(bodyHtml,{title,sub,icon,tone:'1'|'2'|'3'|'love'|'grad',actions:html,cls,attrs,tag:'section',hero:true})
function card(body,o={}){
  const tag=o.tag||'section';
  const head=o.title?cardHead(o.title,o):'';
  return `<${tag} class="card${o.hero?' hero':''}${o.cls?' '+o.cls:''}"${o.id?` id="${esc(o.id)}"`:''}${o.attrs?' '+o.attrs:''}>${head}${body}</${tag}>`;
}
function cardHead(title,o={}){
  return `<div class="card-head">${o.icon?`<span class="icon-tile tone-${o.tone||'1'}">${icon(o.icon,19)}</span>`:''}<div class="card-head-text"><h2>${esc(title)}</h2>${o.sub?`<p>${esc(o.sub)}</p>`:''}</div>${o.actions?`<div class="card-head-actions">${o.actions}</div>`:''}</div>`;
}
// A heading for a block of the page that is not itself a card.
function sectionTitle(title,o={}){return `<div class="section-title"><div><h2>${esc(title)}</h2>${o.sub?`<p>${esc(o.sub)}</p>`:''}</div>${o.actions?`<div class="section-title-actions">${o.actions}</div>`:''}</div>`;}
// A rounded icon square: iconTile('Gift','2') — tones '1','2','3' (the palette's colours), 'love', 'grad', 'neutral'.
function iconTile(name,tone='1',size=20,o={}){return `<span class="icon-tile tone-${tone}${o.cls?' '+o.cls:''}"${o.big?' data-big':''}>${icon(name,size)}</span>`;}

// ---------- Badges, chips, segmented ----------
// badge('נקנתה','positive') — tones: accent, tone-2, tone-3, love, positive, warning, negative, neutral, star
function badge(text,tone='accent',o={}){return `<span class="badge ${tone}${o.cls?' '+o.cls:''}">${o.icon?icon(o.icon,13):''}${o.emoji?`<span class="emoji" aria-hidden="true">${esc(o.emoji)}</span>`:''}${esc(text)}</span>`;}
// chip('אוהבת',{action:'filter:love', active:true, emoji:'❤️', icon:'Heart', count:4, tone:'love', href})
function chip(label,o={}){
  const cls=['chip',o.active?'active':'',o.tone?`tone-${o.tone}`:'',o.cls].filter(Boolean).join(' ');
  const inner=`${o.emoji?`<span class="emoji" aria-hidden="true">${esc(o.emoji)}</span>`:''}${o.icon?icon(o.icon,15):''}<span>${esc(label)}</span>${o.count!=null?`<b class="chip-count">${esc(o.count)}</b>`:''}`;
  if(o.href)return `<a class="${cls}" href="${esc(o.href)}"${o.active?' aria-current="page"':''}${o.attrs?' '+o.attrs:''}>${inner}</a>`;
  return `<button type="button" class="${cls}"${o.action?` data-action="${esc(o.action)}"`:''} aria-pressed="${!!o.active}"${o.attrs?' '+o.attrs:''}>${inner}</button>`;
}
// A horizontally scrolling row of chips (never wraps the page wider than the screen).
function chipRow(chips,o={}){return `<div class="chip-row${o.wrap?' wrap':''}${o.cls?' '+o.cls:''}" role="group"${o.label?` aria-label="${esc(o.label)}"`:''}>${chips.join('')}</div>`;}
// Filter chips: one choice from options [{id,label,emoji,icon,count}], each click runs `${action}:${id}`.
function filterChips(options,value,action,o={}){return chipRow(options.map(x=>chip(x.label,{action:`${action}:${x.id}`,active:x.id===value,emoji:x.emoji,icon:x.icon,count:x.count,tone:x.tone})),o);}
// segmented([{id,label,icon,count}], value, 'action') — a compact tab switch. o.full stretches it; o.href(id) makes links.
function segmented(options,value,action,o={}){
  return `<div class="segmented${o.full?' full':''}${o.cls?' '+o.cls:''}" role="group"${o.label?` aria-label="${esc(o.label)}"`:''}>${options.map(x=>{
    const on=x.id===value,inner=`${x.icon?icon(x.icon,16):''}<span>${esc(x.label)}</span>${x.count!=null?`<b class="seg-count">${esc(x.count)}</b>`:''}`;
    return o.href?`<a href="${esc(o.href(x.id))}" class="${on?'active':''}"${on?' aria-current="page"':''}>${inner}</a>`:`<button type="button" data-action="${esc(action)}:${esc(x.id)}" aria-pressed="${on}">${inner}</button>`;}).join('')}</div>`;
}
// Sub-pages of a section as a strip of tabs (links): subTabs([{id,label,icon,count,href}], activeId)
function subTabs(items,active,o={}){
  return `<nav class="subtabs" aria-label="${esc(o.label||'תתי־עמודים')}">${items.map(x=>`<a class="subtab${x.id===active?' active':''}" href="${esc(x.href)}"${x.id===active?' aria-current="page"':''}>${x.icon?icon(x.icon,16):''}<span>${esc(x.label)}</span>${x.count?`<b>${esc(x.count)}</b>`:''}</a>`).join('')}</nav>`;
}

// A search field for filtering a list inside a page: searchBox('חיפוש במקומות…', plState.q, 'pl-q')
// → <input data-input="pl-q">; register onChange('pl-q', v=>…) (fires on every keystroke).
function searchBox(placeholder,value,inputAction,o={}){
  return `<label class="search-box${o.cls?' '+o.cls:''}">${icon('Search',18)}<input type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="${esc(placeholder)}" aria-label="${esc(o.label||placeholder)}" value="${esc(value||'')}" data-input="${esc(inputAction)}"></label>`;
}
// A compact inline select (sorting, a filter): selectBox([{id,label}], value, 'pl-sort', {label:'מיון', icon:'ArrowUpDown'})
// → <select data-change="pl-sort">; register onChange('pl-sort', v=>…).
function selectBox(options,value,changeAction,o={}){
  return `<label class="select-box${o.cls?' '+o.cls:''}">${o.icon?icon(o.icon,16):''}<select data-change="${esc(changeAction)}" aria-label="${esc(o.label||'')}">${options.map(x=>`<option value="${esc(x.id)}"${String(x.id)===String(value)?' selected':''}>${esc(x.label)}</option>`).join('')}</select></label>`;
}

// ---------- Lists ----------
// listRow({id, icon, tone, emoji, thumbHtml, title, sub, meta:html, action, href, heart:{list,on}, actions:html, cls, done})
// The row's main area is one button (or link); the heart and extra actions sit beside it, never nested.
function listRow(o){
  const lead=o.thumbHtml?`<span class="row-thumb">${o.thumbHtml}</span>`:o.emoji?`<span class="row-emoji" aria-hidden="true">${esc(o.emoji)}</span>`:o.icon?iconTile(o.icon,o.tone||'1',18):'';
  const text=`<span class="row-text"><b>${esc(o.title)}</b>${o.sub?`<small>${esc(o.sub)}</small>`:''}${o.subHtml?`<small>${o.subHtml}</small>`:''}</span>${o.meta?`<span class="row-meta">${o.meta}</span>`:''}`;
  const main=o.href?`<a class="row-main" href="${esc(o.href)}">${lead}${text}</a>`:o.action?`<button type="button" class="row-main" data-action="${esc(o.action)}">${lead}${text}</button>`:`<div class="row-main">${lead}${text}</div>`;
  const heart=o.heart?heartButton(o.heart.list,o.id,o.heart.on,{size:18}):'';
  return `<div class="row${o.done?' done':''}${o.cls?' '+o.cls:''}"${o.id?` data-id="${esc(o.id)}"`:''}>${main}${heart}${o.actions||''}</div>`;
}
function listOf(rows,o={}){return `<div class="list${o.cls?' '+o.cls:''}"${o.label?` role="list" aria-label="${esc(o.label)}"`:''}>${rows.join('')}</div>`;}

// ---------- Empty states, stats, notices ----------
// emptyState({icon:'MapPin', title, text, actions:html, compact:true, art:'heart'})
function emptyState(o={}){
  return `<div class="empty${o.compact?' compact':''}${o.cls?' '+o.cls:''}"><span class="empty-art" aria-hidden="true">${icon(o.icon||'Heart',o.compact?24:30)}<i class="empty-spark s1"></i><i class="empty-spark s2"></i><i class="empty-spark s3"></i></span><h3>${esc(o.title||'')}</h3>${o.text?`<p>${esc(o.text)}</p>`:''}${o.actions?`<div class="empty-actions">${o.actions}</div>`:''}</div>`;
}
// statTile({icon, value, label, tone, href})
function statTile(o){
  const inner=`${iconTile(o.icon||'Heart',o.tone||'1',18)}<span class="stat-text"><b>${esc(o.value)}</b><small>${esc(o.label)}</small></span>`;
  return o.href?`<a class="stat" href="${esc(o.href)}">${inner}</a>`:`<div class="stat">${inner}</div>`;
}
// notice('טקסט',{tone:'info'|'success'|'warning'|'error'|'love', icon, title, actions:html})
function notice(text,o={}){
  const tone=o.tone||'info',ic=o.icon||{info:'Info',success:'CircleCheck',warning:'TriangleAlert',error:'TriangleAlert',love:'Heart'}[tone];
  return `<div class="notice ${tone}${o.cls?' '+o.cls:''}" role="${tone==='error'?'alert':'note'}">${icon(ic,18)}<div class="notice-text">${o.title?`<b>${esc(o.title)}</b>`:''}<span>${esc(text)}</span>${o.actions?`<div class="notice-actions">${o.actions}</div>`:''}</div></div>`;
}
// Read-only label/value rows: infoRows([['מידה','36'],['הערות','…']]) — values are text.
function infoRows(rows,o={}){return `<dl class="info-rows${o.cls?' '+o.cls:''}">${rows.filter(r=>r&&r[1]!==''&&r[1]!=null).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;}
// ★★★★☆ (display only). starsDisplay(4) · starsDisplay(3,{max:5,size:14})
function starsDisplay(n,o={}){const max=o.max||5,v=Math.max(0,Math.min(max,Math.round(Number(n)||0)));return `<span class="stars" role="img" aria-label="${v} מתוך ${max} כוכבים">${Array.from({length:max},(_,i)=>`<span class="${i<v?'on':''}">${icon('Star',o.size||14)}</span>`).join('')}</span>`;}
// ₪₪₪ price level (0 = free / unknown → '')
function priceLevel(n){const v=Math.max(0,Math.min(3,Number(n)||0));return v?`<span class="price-level" aria-label="רמת מחיר ${v} מתוך 3"><b>${'₪'.repeat(v)}</b>${'₪'.repeat(3-v)}</span>`:'';}
// A countdown chip with urgency: today/tomorrow wear the gradient, this week the tint, later neutral.
function countdownChip(days,o={}){
  if(!Number.isFinite(days))return '';
  const tone=days<0?'neutral':days<=1?'hot':days<=7?'warm':days<=30?'soft':'neutral';
  const text=o.text||(typeof countdownText==='function'?countdownText(days):fmtRelative(days));
  return `<span class="countdown-chip ${tone}">${esc(text)}</span>`;
}
// A thin progress bar (value 0..max).
function progressBar(value,max=100,o={}){const p=max>0?Math.max(0,Math.min(100,value/max*100)):0;return `<div class="progress${o.cls?' '+o.cls:''}" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"${o.label?` aria-label="${esc(o.label)}"`:''}><span style="width:${p.toFixed(1)}%"></span></div>`;}
// A round avatar: the photo when there is one, else the first letter on the gradient.
function avatar(name,o={}){
  const letter=esc(String(name||'').trim().slice(0,1)||'♡');
  return `<span class="avatar${o.size?' '+o.size:''}${o.cls?' '+o.cls:''}" aria-hidden="true">${o.photoId?photoImg(o.photoId,{size:'thumb',alt:''}):letter}</span>`;
}

// ---------- Dialogs and sheets ----------
// openDialog({title, body:html, foot:html, cls, wide, onClose(result), focus:'selector', form:true (wraps in a <form>),
//   labelHidden}) → the <dialog>. Native modal: the page behind is inert and Tab stays inside. On a phone it is a bottom
// sheet (drag the handle down to close). Esc, the ✕, a tap on the backdrop and the Android back button all close it,
// and focus returns to what opened it. Dialogs stack (a confirm over a form).
const UI_DLG={stack:[],ignorePop:0,pendingRoute:null,seq:0};
function openDialog(o={}){
  if(typeof isLocked==='function'&&isLocked())return null;
  const el=document.createElement('dialog');
  const id=`dlg-${++UI_DLG.seq}`;
  el.className=['modal',o.cls,o.wide?'wide':''].filter(Boolean).join(' ');
  el.setAttribute('aria-labelledby',id+'-title');
  const head=`<div class="modal-head"><span class="sheet-handle" aria-hidden="true"></span><h2 id="${id}-title" tabindex="-1"${o.labelHidden?' class="visually-hidden"':''}>${esc(o.title||'')}</h2><button type="button" class="icon-btn modal-close" data-dialog-close aria-label="סגירה">${icon('X',19)}</button></div>`;
  const inner=`${head}<div class="modal-body">${o.body||''}</div>${o.foot?`<div class="modal-foot">${o.foot}</div>`:''}`;
  el.innerHTML=o.form?`<form class="modal-form" novalidate>${inner}</form>`:inner;
  document.body.append(el);
  const act=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const entry={el,o,opener:act,openerKey:act?.dataset?.action?`[data-action="${CSS.escape(act.dataset.action)}"]`:act?.id?`#${CSS.escape(act.id)}`:null,closed:false};
  UI_DLG.stack.push(entry);
  try{el.showModal();}catch{el.setAttribute('open','');}
  try{history.pushState({noaDlg:UI_DLG.stack.length},'');}catch{}
  // Focus: a requested element; else the first field on a hardware keyboard; else the title (announced, no keyboard pop-up).
  const fine=(()=>{try{return matchMedia('(pointer: fine)').matches;}catch{return true;}})();
  const want=(o.focus&&el.querySelector(o.focus))||el.querySelector('[autofocus]')||(fine&&el.querySelector('.modal-body :is(input:not([type=hidden]):not([type=radio]):not([type=checkbox]),textarea,select)'))||el.querySelector(`#${id}-title`);
  try{want?.focus({preventScroll:true});}catch{}
  el.addEventListener('cancel',event=>{event.preventDefault();closeDialog(el);});
  el.addEventListener('click',event=>{
    if(event.target===el){closeDialog(el);return;}
    if(event.target.closest('[data-dialog-close]')){event.preventDefault();closeDialog(el);return;}
    // In-app links inside a dialog navigate without leaving a stale dialog step in the history.
    const a=event.target.closest('a[href^="#"]');
    if(a&&!a.hasAttribute('data-action')){event.preventDefault();go(a.getAttribute('href').slice(1));}
  });
  uiSheetDrag(el);
  return el;
}
function uiEntry(el){return el?UI_DLG.stack.find(x=>x.el===el):UI_DLG.stack.at(-1);}
// Close a dialog (default: the top one) and every dialog above it. `result` reaches its onClose.
function closeDialog(el,{result,fromHistory=false}={}){
  const entry=uiEntry(el);if(!entry||entry.closed)return;
  const i=UI_DLG.stack.indexOf(entry);
  const gone=UI_DLG.stack.splice(i);
  for(const x of gone.reverse()){
    x.closed=true;
    try{x.el.close();}catch{}x.el.remove();
    try{x.o.onClose?.(x===entry?result:undefined);}catch(err){try{console.error(err);}catch{}}
  }
  // Focus goes back to what opened the dialog — or to its twin after a re-render replaced it.
  const back=entry.opener?.isConnected?entry.opener:entry.openerKey?document.querySelector(`#root ${entry.openerKey}`):null;
  if(back&&!UI_DLG.stack.length)try{back.focus({preventScroll:true});}catch{}
  else if(UI_DLG.stack.length)try{UI_DLG.stack.at(-1).el.querySelector('h2')?.focus({preventScroll:true});}catch{}
  if(!fromHistory&&(history.state?.noaDlg||0)>UI_DLG.stack.length){UI_DLG.ignorePop+=1;try{history.go(-gone.length);}catch{UI_DLG.ignorePop=0;}}
}
function closeAllDialogs(opts){if(UI_DLG.stack.length)closeDialog(UI_DLG.stack[0].el,opts);}
const dialogOpen=()=>UI_DLG.stack.length>0;
// Drag a phone sheet down by its head to close it.
function uiSheetDrag(el){
  const head=el.querySelector('.modal-head');if(!head)return;
  let y0=null,dy=0;
  head.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||e.target.closest('button'))return;if(!matchMedia('(max-width: 760px)').matches)return;y0=e.clientY;dy=0;head.setPointerCapture?.(e.pointerId);el.style.transition='none';});
  head.addEventListener('pointermove',e=>{if(y0==null)return;dy=Math.max(0,e.clientY-y0);el.style.transform=`translateY(${dy}px)`;});
  const end=()=>{if(y0==null)return;y0=null;el.style.transition='';el.style.transform='';if(dy>90)closeDialog(el);};
  head.addEventListener('pointerup',end);head.addEventListener('pointercancel',end);
}
if(typeof window!=='undefined'&&window.addEventListener){
  // The Android back button (or browser back) closes the top dialog instead of leaving the page under it.
  window.addEventListener('popstate',()=>{
    if(UI_DLG.ignorePop>0){UI_DLG.ignorePop-=1;if(!UI_DLG.ignorePop&&UI_DLG.pendingRoute!=null){const r=UI_DLG.pendingRoute;UI_DLG.pendingRoute=null;go(r);}return;}
    const depth=history.state?.noaDlg||0;
    while(UI_DLG.stack.length>depth)closeDialog(UI_DLG.stack.at(-1).el,{fromHistory:true});
  });
}

// confirmAsk({title, text, bodyHtml, confirm:'מחיקה', cancel:'ביטול', danger:true, icon, requireWord:'מחיקה'})
// → Promise<boolean>. With requireWord the confirm button stays disabled until he types that word.
function confirmAsk(o={}){
  return new Promise(resolve=>{
    let answered=false;
    const word=o.requireWord?`<label class="field full confirm-word"><span class="field-label">כדי לאשר, הקלד: ${esc(o.requireWord)}</span><input type="text" data-confirm-word autocomplete="off" autocapitalize="off" spellcheck="false"></label>`:'';
    const el=openDialog({title:o.title||'בטוח?',cls:'confirm',body:`${o.text?`<p class="dlg-lead">${esc(o.text)}</p>`:''}${o.bodyHtml||''}${word}`,
      foot:`${button(o.cancel||'ביטול','',{attrs:'data-dialog-close'})}${button(o.confirm||'אישור','',{variant:o.danger?'danger-solid':'primary',attrs:'data-confirm-yes',icon:o.icon,disabled:!!o.requireWord})}`,
      focus:o.requireWord?'[data-confirm-word]':'[data-confirm-yes]',onClose:r=>{if(!answered){answered=true;resolve(r===true);}}});
    if(!el){resolve(false);return;}
    const yes=el.querySelector('[data-confirm-yes]');
    el.querySelector('[data-confirm-word]')?.addEventListener('input',e=>{const ok=e.target.value.trim()===o.requireWord;yes.disabled=!ok;yes.toggleAttribute('aria-disabled',!ok);});
    yes.addEventListener('click',()=>{if(yes.disabled)return;answered=true;resolve(true);closeDialog(el,{result:true});});
  });
}
// A small action sheet: openMenu({title, items:[{label, icon, run(), danger, sub}]})
function openMenu(o={}){
  const el=openDialog({title:o.title||'פעולות',cls:'menu-sheet',body:`<div class="menu-list">${(o.items||[]).map((it,i)=>`<button type="button" class="menu-item${it.danger?' danger':''}" data-menu-i="${i}">${icon(it.icon||'ChevronLeft',19)}<span><b>${esc(it.label)}</b>${it.sub?`<small>${esc(it.sub)}</small>`:''}</span></button>`).join('')}</div>`});
  el?.addEventListener('click',event=>{const b=event.target.closest('[data-menu-i]');if(!b)return;const it=o.items[+b.dataset.menuI];closeDialog(el);setTimeout(()=>runAction(it.run),0);});
  return el;
}
function runAction(fn){try{const r=fn?.();if(r&&typeof r.then==='function')r.catch(err=>toast(uiErrText(err),{error:true}));}catch(err){toast(uiErrText(err),{error:true});}}
const uiErrText=err=>err&&/[֐-׿]/.test(err.message||'')?err.message:(console.error?.(err),'משהו השתבש. נסה שוב.');

// ---------- Forms ----------
// openForm({title, intro, fields:[…], values:{}, submitLabel:'שמירה', submitIcon, onSubmit(values)→ (false keeps it open),
//   onDelete(), deleteLabel, cls, wide}) → {dialog, form}. Fields:
//   {name, label, type:'text'|'textarea'|'number'|'price'|'date'|'select'|'chips'|'multichips'|'stars'|'switch'|'tags'|
//    'url'|'tel'|'photos'|'emoji'|'hidden'|'section'|'custom', required, placeholder, hint, options:[{id,label,emoji,icon}],
//    min, max, maxLength, rows, half (two short fields side by side on wide screens; default is a full row),
//    numeric (multichips → numbers), validate(value, values)→'הודעה'|null,
//    show(values)→bool, autofocus, dir, inputmode, html(values) + read(form) for 'custom'}
// Validation is inline and in Hebrew: on submit, then live as he fixes things. values come back cleaned: trimmed
// strings, numbers or null, arrays for chips/tags/photos, booleans for switches.
const UI_REQ='צריך למלא את השדה הזה';
let uiFormSeq=0;
function openForm(o={}){
  const fid=`frm${++uiFormSeq}`;
  const values={...(o.values||{})};
  const body=`${o.intro?`<p class="dlg-lead">${esc(o.intro)}</p>`:''}<div class="form-error" role="alert" hidden></div><div class="form-grid">${formFields(o.fields||[],values,fid)}</div>`;
  const foot=`${o.onDelete?button(o.deleteLabel||'מחיקה','',{variant:'ghost-danger',icon:'Trash2',attrs:'data-form-delete',cls:'foot-start'}):''}${button('ביטול','',{attrs:'data-dialog-close'})}${button(o.submitLabel||'שמירה','',{variant:'primary',type:'submit',icon:o.submitIcon||'Check'})}`;
  const dialog=openDialog({title:o.title,body,foot,form:true,cls:['form-dialog',o.cls].filter(Boolean).join(' '),wide:o.wide,onClose:o.onClose,
    focus:(o.fields||[]).find(f=>f.autofocus)?`[name="${(o.fields.find(f=>f.autofocus)).name}"]`:undefined});
  if(!dialog)return null;
  const form=dialog.querySelector('form');
  let tried=false;
  uiBindFields(form,o.fields||[]);
  uiApplyShow(form,o.fields||[]);
  form.addEventListener('input',()=>{uiApplyShow(form,o.fields||[]);if(tried)validateForm(form,o.fields||[],{quiet:true});});
  form.addEventListener('change',()=>{uiApplyShow(form,o.fields||[]);if(tried)validateForm(form,o.fields||[],{quiet:true});});
  form.querySelector('[data-form-delete]')?.addEventListener('click',()=>{closeDialog(dialog);setTimeout(()=>runAction(o.onDelete),0);});
  form.addEventListener('submit',async event=>{
    event.preventDefault();tried=true;
    const box=form.querySelector('.form-error');box.hidden=true;box.textContent='';
    if(!validateForm(form,o.fields||[]))return;
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{
      const vals=readForm(form,o.fields||[]);
      const r=await o.onSubmit?.(vals,{form,dialog});
      if(r!==false)closeDialog(dialog,{result:vals});
    }catch(err){box.textContent=uiErrText(err);box.hidden=false;box.scrollIntoView?.({block:'nearest'});}
    finally{if(submit.isConnected)submit.disabled=false;}
  });
  return {dialog,form};
}
function uiFieldId(fid,name){return `${fid}-${String(name).replace(/[^\w-]/g,'_')}`;}
// The fields' HTML (for a custom dialog: wrap in <form> yourself and use readForm/validateForm).
function formFields(fields,values={},fid=`frm${++uiFormSeq}`){return fields.map(f=>uiField(f,values[f.name],fid,values)).join('');}
function uiField(f,v,fid,values){
  const id=uiFieldId(fid,f.name),err=`${id}-err`,hint=f.hint?`<small class="field-hint" id="${id}-hint">${esc(f.hint)}</small>`:'';
  const described=`aria-describedby="${err}${f.hint?` ${id}-hint`:''}"`;
  const wrap=(control,extra='')=>`<div class="field${f.half&&!['textarea','chips','multichips','photos','emoji','section','tags','custom','switch','stars'].includes(f.type)?'':' full'}${extra}" data-field="${esc(f.name)}"${f.show?' data-conditional':''}>${control}${hint}<small class="field-error" id="${err}" aria-live="polite"></small></div>`;
  const label=`<label class="field-label" for="${id}">${esc(f.label||'')}${f.required?'<span class="req" aria-hidden="true"> *</span>':f.optionalNote===false?'':''}</label>`;
  const common=`id="${id}" name="${esc(f.name)}" ${described}${f.required?' aria-required="true"':''}${f.autofocus?' autofocus':''}`;
  const val=v==null?'':v;
  switch(f.type){
    case 'section':return `<div class="form-section full" data-field="${esc(f.name||'')}"><h3>${esc(f.label||'')}</h3>${f.hint?`<p>${esc(f.hint)}</p>`:''}</div>`;
    case 'hidden':return `<input type="hidden" name="${esc(f.name)}" value="${esc(val)}">`;
    case 'textarea':return wrap(`${label}<textarea ${common} rows="${f.rows||3}"${f.maxLength?` maxlength="${f.maxLength}"`:''}${f.placeholder?` placeholder="${esc(f.placeholder)}"`:''}>${esc(val)}</textarea>`);
    case 'select':return wrap(`${label}<select ${common}>${f.required?'':`<option value="">${esc(f.emptyLabel||'—')}</option>`}${(f.options||[]).map(x=>`<option value="${esc(x.id)}"${String(x.id)===String(val)?' selected':''}>${esc(x.label)}</option>`).join('')}</select>`);
    case 'date':return wrap(`${label}<div class="date-input"><input type="date" ${common} value="${esc(isIsoDate(val)?val:'')}"${f.min?` min="${esc(f.min)}"`:''}${f.max?` max="${esc(f.max)}"`:''}>${f.quickToday!==false?`<button type="button" class="chip mini" data-date-today="${id}">היום</button>`:''}</div>`);
    case 'number':case 'price':return wrap(`${label}<div class="num-input${f.type==='price'?' price':''}"><input type="text" inputmode="decimal" dir="ltr" autocomplete="off" ${common} value="${esc(val)}"${f.placeholder?` placeholder="${esc(f.placeholder)}"`:''}>${f.type==='price'?'<span aria-hidden="true">₪</span>':f.suffix?`<span aria-hidden="true">${esc(f.suffix)}</span>`:''}</div>`);
    case 'switch':return wrap(`<label class="switch-row" for="${id}"><span><b>${esc(f.label||'')}</b>${f.sub?`<small>${esc(f.sub)}</small>`:''}</span><input type="checkbox" class="switch" ${common}${val===true||val==='true'?' checked':''}></label>`,' switch-field');
    case 'chips':case 'emoji':{
      const opts=f.type==='emoji'&&!f.required?[{id:'',label:'ללא',emoji:''},...(f.options||[])]:(f.options||[]);
      return wrap(`<fieldset ${described}><legend class="field-label">${esc(f.label||'')}${f.required?'<span class="req" aria-hidden="true"> *</span>':''}</legend><div class="choice-chips${f.type==='emoji'?' emoji-chips':''}">${opts.map((x,i)=>`<label class="chip${x.tone?` tone-${x.tone}`:''}"><input type="radio" name="${esc(f.name)}" value="${esc(x.id)}"${String(x.id)===String(val??'')||(val==null&&i===0&&f.type==='emoji'&&!f.required)?' checked':''}${f.required?' required':''}>${x.emoji?`<span class="emoji" aria-hidden="true">${esc(x.emoji)}</span>`:''}${x.icon?icon(x.icon,15):''}<span${f.type==='emoji'&&x.id?' class="visually-hidden"':''}>${esc(x.label||x.id)}</span></label>`).join('')}</div></fieldset>`);
    }
    case 'multichips':{
      const set=new Set((Array.isArray(val)?val:[]).map(String));
      return wrap(`<fieldset ${described}><legend class="field-label">${esc(f.label||'')}</legend><div class="choice-chips">${(f.options||[]).map(x=>`<label class="chip"><input type="checkbox" name="${esc(f.name)}" value="${esc(x.id)}"${set.has(String(x.id))?' checked':''}>${x.emoji?`<span class="emoji" aria-hidden="true">${esc(x.emoji)}</span>`:''}${x.icon?icon(x.icon,15):''}<span>${esc(x.label)}</span></label>`).join('')}</div></fieldset>`);
    }
    case 'stars':{
      const n=Math.round(Number(val)||0),max=f.max||5;
      return wrap(`<fieldset ${described}><legend class="field-label">${esc(f.label||'')}</legend><div class="stars-input">${Array.from({length:max+1},(_,i)=>`<label class="${i===0?'star-none':'star'}"><input type="radio" name="${esc(f.name)}" value="${i}"${i===n?' checked':''}><span class="visually-hidden">${i===0?'בלי דירוג':`${i} כוכבים`}</span>${i===0?icon('Ban',16):icon('Star',24)}</label>`).join('')}</div></fieldset>`);
    }
    case 'tags':return wrap(`${label}<input type="text" ${common} value="${esc(Array.isArray(val)?val.join(', '):val)}" placeholder="${esc(f.placeholder||'מילים מופרדות בפסיקים')}" autocomplete="off">`);
    case 'photos':{
      const ids=Array.isArray(val)?val:[];
      return wrap(`<fieldset ${described}><legend class="field-label">${esc(f.label||'תמונות')}</legend><div class="photo-field" data-photo-field="${esc(f.name)}" data-max="${f.max||12}">${ids.map(uiPhotoChip).join('')}<label class="photo-add"><input type="file" accept="image/*" ${f.max===1?'':'multiple'} data-photo-input>${icon('Camera',22)}<span>${esc(f.addLabel||'הוספת תמונה')}</span></label></div></fieldset>`);
    }
    case 'custom':return wrap(f.html?f.html(values,{id,name:f.name}):'');
    default:{
      const type=['url','tel','email','password'].includes(f.type)?f.type:'text';
      const im=f.inputmode||(type==='tel'?'tel':type==='url'?'url':'');
      return wrap(`${label}<input type="${type}" ${common} value="${esc(val)}"${f.maxLength?` maxlength="${f.maxLength}"`:''}${f.placeholder?` placeholder="${esc(f.placeholder)}"`:''}${im?` inputmode="${im}"`:''}${f.dir||type!=='text'?` dir="${f.dir||'ltr'}"`:''} autocomplete="${f.autocomplete||'off'}">`);
    }
  }
}
function uiPhotoChip(id){return `<span class="photo-chip" data-photo-id="${esc(id)}">${photoImg(id,{size:'thumb',alt:''})}<button type="button" class="photo-remove" data-photo-remove aria-label="הסרת התמונה">${icon('X',14)}</button></span>`;}
function uiBindFields(form,fields){
  form.addEventListener('click',event=>{
    const t=event.target.closest('[data-date-today]');
    if(t){const input=form.querySelector('#'+CSS.escape(t.dataset.dateToday));if(input){input.value=todayISO();input.dispatchEvent(new Event('input',{bubbles:true}));}}
    const rm=event.target.closest('[data-photo-remove]');
    if(rm){rm.closest('.photo-chip')?.remove();form.dispatchEvent(new Event('input',{bubbles:true}));}
  });
  form.addEventListener('change',async event=>{
    const input=event.target.closest('[data-photo-input]');if(!input||!input.files?.length)return;
    const box=input.closest('[data-photo-field]'),max=Number(box.dataset.max)||12;
    const files=[...input.files].slice(0,Math.max(0,max-box.querySelectorAll('.photo-chip').length));input.value='';
    if(!files.length){toast(`אפשר עד ${max} תמונות`,{error:true});return;}
    box.classList.add('busy');
    try{
      for(const file of files){const id=await putPhoto(file);box.querySelector('.photo-add').insertAdjacentHTML('beforebegin',uiPhotoChip(id));}
      hydratePhotos(box);
    }catch(err){toast(uiErrText(err),{error:true});}
    finally{box.classList.remove('busy');form.dispatchEvent(new Event('input',{bubbles:true}));}
  });
  void fields;
}
function uiApplyShow(form,fields){
  const conditional=fields.filter(f=>typeof f.show==='function');if(!conditional.length)return;
  const vals=readForm(form,fields);
  for(const f of conditional){const el=form.querySelector(`[data-field="${CSS.escape(f.name)}"]`);if(el)el.hidden=!f.show(vals);}
}
const uiNum=s=>{const t=String(s??'').replace(/[,\s₪]/g,'').trim();if(!t)return null;const n=Number(t);return Number.isFinite(n)?n:NaN;};
// Read the cleaned values of a form built from `fields`.
function readForm(form,fields){
  const out={};
  for(const f of fields){
    if(!f.name||f.type==='section')continue;
    const sel=`[name="${CSS.escape(f.name)}"]`;
    switch(f.type){
      case 'switch':out[f.name]=!!form.querySelector(sel)?.checked;break;
      case 'chips':case 'emoji':{const c=form.querySelector(`${sel}:checked`);out[f.name]=c?(c.value===''?null:c.value):null;break;}
      case 'multichips':out[f.name]=[...form.querySelectorAll(`${sel}:checked`)].map(x=>f.numeric?Number(x.value):x.value);break;
      case 'stars':{const c=form.querySelector(`${sel}:checked`);out[f.name]=c?Number(c.value):0;break;}
      case 'number':case 'price':{const n=uiNum(form.querySelector(sel)?.value);out[f.name]=n;break;}
      case 'tags':out[f.name]=[...new Set(String(form.querySelector(sel)?.value||'').split(/[,،\n]/).map(s=>s.trim()).filter(Boolean))];break;
      case 'photos':out[f.name]=[...form.querySelectorAll(`[data-photo-field="${CSS.escape(f.name)}"] .photo-chip`)].map(x=>x.dataset.photoId);break;
      case 'custom':out[f.name]=f.read?f.read(form):undefined;break;
      case 'date':{const v=form.querySelector(sel)?.value||'';out[f.name]=v||null;break;}
      default:{const el=form.querySelector(sel);out[f.name]=el?String(el.value).trim():'';}
    }
  }
  return out;
}
// Validate; shows inline Hebrew messages, focuses the first problem (unless quiet). Returns true when all is well.
function validateForm(form,fields,{quiet=false}={}){
  const vals=readForm(form,fields);let first=null;
  for(const f of fields){
    if(!f.name||f.type==='section'||f.type==='hidden')continue;
    const box=form.querySelector(`[data-field="${CSS.escape(f.name)}"]`);if(!box)continue;
    if(box.hidden){uiSetError(box,'');continue;}
    const msg=uiCheck(f,vals[f.name],vals,box);
    uiSetError(box,msg);
    if(msg&&!first)first=box;
  }
  if(first&&!quiet){const t=first.querySelector('input:not([type=hidden]),textarea,select');try{t?.focus();}catch{}first.scrollIntoView?.({block:'center',behavior:'smooth'});}
  return !first;
}
function uiSetError(box,msg){
  const e=box.querySelector('.field-error');if(e)e.textContent=msg||'';
  box.classList.toggle('invalid',!!msg);
  for(const c of box.querySelectorAll('input:not([type=hidden]),textarea,select,fieldset'))c.toggleAttribute('aria-invalid',!!msg);
}
function uiCheck(f,v,vals,box){
  const empty=v==null||v===''||(Array.isArray(v)&&!v.length)||(f.type==='stars'&&!v)||(f.type==='switch'&&v!==true);
  const raw=box.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),textarea')?.value??'';
  if(f.type==='date'&&raw===''&&box.querySelector('input[type=date]')?.validity?.badInput)return 'התאריך לא שלם';
  if(empty){if(f.required)return f.requiredMessage||(f.type==='photos'?'צריך להוסיף לפחות תמונה אחת':['chips','emoji','stars'].includes(f.type)?'צריך לבחור אחת מהאפשרויות':f.type==='multichips'?'צריך לבחור לפחות אחת':UI_REQ);}
  else{
    if((f.type==='number'||f.type==='price')){
      if(Number.isNaN(v))return 'צריך לכתוב מספר';
      if(f.min!=null&&v<f.min)return f.max!=null?`מספר בין ${f.min} ל־${f.max}`:`לפחות ${f.min}`;
      if(f.max!=null&&v>f.max)return f.min!=null?`מספר בין ${f.min} ל־${f.max}`:`עד ${f.max}`;
      if(f.integer&&!Number.isInteger(v))return 'צריך מספר שלם';
    }
    if(f.type==='date'){
      if(!isIsoDate(v))return 'התאריך לא תקין';
      if(f.min&&v<f.min)return `התאריך צריך להיות מ־${fmtDate(f.min,{year:true})} והלאה`;
      if(f.max&&v>f.max)return `התאריך צריך להיות עד ${fmtDate(f.max,{year:true})}`;
    }
    if(f.type==='url'&&!/^(https?:\/\/|www\.)\S+\.\S+/i.test(String(v)))return 'הקישור לא נראה תקין (למשל https://…)';
    if(f.type==='tel'&&!/^[+\d][\d\s\-()]{5,}$/.test(String(v)))return 'מספר הטלפון לא נראה תקין';
    if(f.maxLength&&String(v).length>f.maxLength)return `עד ${f.maxLength} תווים`;
  }
  if(typeof f.validate==='function'){try{const m=f.validate(v,vals);if(m)return String(m);}catch{}}
  return '';
}

// ---------- Delight ----------
// A light confetti burst from an element (or the middle of the screen). Skipped when he prefers less motion.
function celebrate(fromEl,{count=26}={}){
  if(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const r=fromEl?.getBoundingClientRect?.()||{left:innerWidth/2-20,top:innerHeight/3,width:40,height:40};
  const layer=document.createElement('div');layer.className='confetti';layer.setAttribute('aria-hidden','true');
  const cx=r.left+r.width/2,cy=r.top+r.height/2;
  for(let i=0;i<count;i++){
    const p=document.createElement('i');const a=(Math.PI*2*i)/count+Math.random()*.5,d=60+Math.random()*90;
    p.style.cssText=`left:${cx}px;top:${cy}px;--dx:${(Math.cos(a)*d).toFixed(0)}px;--dy:${(Math.sin(a)*d-50).toFixed(0)}px;--rot:${Math.round(Math.random()*540-270)}deg;--delay:${Math.round(Math.random()*90)}ms`;
    p.className=`c${1+i%5}${i%3===0?' heart':''}`;layer.append(p);
  }
  document.body.append(layer);setTimeout(()=>layer.remove(),1500);
}
// The heart pop on a favourite button (after the re-render, the new button pops).
function popHeart(btn){
  if(!btn)return;btn.classList.remove('pop');void btn.offsetWidth;btn.classList.add('pop');
  if(!btn.classList.contains('on')||(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches))return;
  const r=btn.getBoundingClientRect(),layer=document.createElement('div');layer.className='heart-burst';layer.setAttribute('aria-hidden','true');
  layer.style.cssText=`left:${r.left+r.width/2}px;top:${r.top+r.height/2}px`;
  for(let i=0;i<6;i++){const h=document.createElement('i');h.style.setProperty('--a',`${i*60}deg`);h.innerHTML=icon('Heart',10);layer.append(h);}
  document.body.append(layer);setTimeout(()=>layer.remove(),800);
}

if(typeof document!=='undefined'&&document.addEventListener){
  onAction('star',arg=>{
    const i=arg.indexOf(':');const list=arg.slice(0,i),id=arg.slice(i+1);
    toggleStar(list,id);
    popHeart(document.querySelector(`[data-action="star:${CSS.escape(list)}:${CSS.escape(id)}"]`));
  });
}
