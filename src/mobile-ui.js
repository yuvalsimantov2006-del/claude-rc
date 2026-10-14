import {uid,today,money,plainText,dateLabel,validDate,applyTransaction,categorySpend} from './finance.js';
import {detectAnomalies,suggestCategory,shiftDate} from './smart.js';
import {scheduledItems} from './money.js';
import {parseNumber} from './xlsx.js';

// The phone experience: a bottom tab bar for one-handed use, a quick-add sheet, installing to the
// home screen (manifest + service worker when served over https), an alerts center behind the bell,
// and optional device notifications for the monthly update, upcoming charges, unusual spending and
// budget overruns. Everything runs on the device; there is no push server.

const hasNavigator=typeof navigator!=='undefined';
const servedOnline=()=>typeof location!=='undefined'&&/^https?:$/.test(location.protocol||'');
const isStandalone=()=>typeof matchMedia==='function'&&(matchMedia('(display-mode: standalone)').matches||(hasNavigator&&navigator.standalone===true));
const isIOS=()=>hasNavigator&&(/iPhone|iPad|iPod/.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
const mobileRuntime={installPrompt:null};
const readJSON=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
const writeJSON=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};

// ---------- Bottom navigation ----------
function mobileNav(){
  const hub=hubOf(ui.page)?.id,more=['plan','ai'].includes(hub)||ui.page==='settings';
  const tab=(id,label,ic)=>`<button type="button" class="bottom-tab${hub===id?' active':''}" data-action="hub:${id}"${hub===id?' aria-current="page"':''}>${icon(ic,22)}<span>${label}</span></button>`;
  return `<nav class="bottom-nav" aria-label="ניווט מהיר">${tab('home','בית','House')}${tab('money','הכסף שלי','Wallet')}<button type="button" class="bottom-add" data-action="quick-add" aria-label="הוספת תנועה">${icon('Plus',26)}</button>${tab('wealth','חיסכון','PiggyBank')}<button type="button" class="bottom-tab${more?' active':''}" data-action="more" aria-label="עוד עמודים">${icon('Menu',22)}<span>עוד</span></button></nav>`;
}

// ---------- Quick add ----------
function quickCategories(type){
  const since=shiftDate(today(),-120),count=new Map();
  for(const t of data.transactions)if(t.type===type&&t.date>=since&&data.categories.includes(t.category))count.set(t.category,(count.get(t.category)||0)+1);
  const list=[...count].sort((a,b)=>b[1]-a[1]).map(([c])=>c);
  const incomeLike=c=>/משכורת|הכנס|מענק|החזר|דיבידנד/.test(c);
  for(const c of data.categories)if(list.length<8&&!list.includes(c)&&(type==='income'?incomeLike(c):!incomeLike(c)))list.push(c);
  return list.slice(0,8);
}
function quickAccounts(){return data.accounts.filter(a=>!['investment','debt'].includes(a.kind));}
function quickChips(){
  const q=ui.quick,list=quickCategories(q.type);
  if(q.category&&!list.includes(q.category))list.unshift(q.category);
  return list.map(c=>`<button type="button" class="quick-cat ${c===q.category?'active':''}" role="radio" aria-checked="${c===q.category}" data-quick-cat="${e(c)}">${e(c)}</button>`).join('')+`<select class="quick-more" aria-label="קטגוריה אחרת" data-quick-more><option value="">אחרת…</option>${options(data.categories.filter(c=>!list.includes(c)),'')}</select>`;
}
function openQuickAdd(prefill={}){
  const accounts=quickAccounts();
  if(!accounts.length){toast('כדי לרשום תנועה צריך קודם חשבון בנק או מזומן.',true);navigate('accounts');return;}
  const type=prefill.type==='income'?'income':'expense';
  ui.quick={type,category:prefill.category||'',manual:!!prefill.category};
  const last=[...data.transactions].filter(t=>t.type===type).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const accountId=prefill.accountId||(accounts.some(a=>a.id===last?.accountId)?last.accountId:(accounts.find(a=>a.kind==='bank')||accounts[0]).id);
  const symbol=id=>data.accounts.find(a=>a.id===id)?.currency==='USD'?'$':'₪';
  const descriptions=[...new Set([...data.transactions].sort((a,b)=>b.date.localeCompare(a.date)).map(t=>t.description).filter(Boolean))].slice(0,40);
  showDialog('הוספה מהירה',`<form id="quick-form" class="quick-form" novalidate><div class="form-error"></div><div class="segmented quick-type" role="group" aria-label="סוג התנועה"><button type="button" class="${type==='expense'?'active':''}" data-quick-type="expense">הוצאה</button><button type="button" class="${type==='income'?'active':''}" data-quick-type="income">הכנסה</button></div><label class="quick-amount ${type}"><span class="quick-sign" aria-hidden="true">${type==='income'?'+':'−'}</span><input name="amount" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0" aria-label="סכום" value="${e(prefill.amount||'')}"><span class="quick-currency">${symbol(accountId)}</span></label><div class="quick-effect" data-quick-effect aria-live="polite"></div><div class="quick-cats" role="radiogroup" aria-label="קטגוריה">${quickChips()}</div><div class="quick-fields">${field('תיאור',input('description',prefill.description||'','text','list="quick-desc" autocomplete="off" enterkeyhint="done" placeholder="על מה? (לא חובה)"'))}<div class="quick-row">${field('חשבון',select('accountId',accounts.map(a=>[a.id,a.name]),accountId))}${field('תאריך',input('date',prefill.date||today(),'date',`max="${today()}"`))}</div></div><datalist id="quick-desc">${descriptions.map(d=>`<option value="${e(d)}">`).join('')}</datalist><div class="form-actions quick-actions"><button class="button primary" type="submit">${icon('Check',17)}<span data-quick-save>שמירה</span></button>${btn('לטופס המלא','quick-full')}</div></form>`);
  refreshQuickEffect();
  const dialog=document.querySelector('dialog');dialog?.classList.add('sheet');
  setTimeout(()=>dialog?.querySelector('[name=amount]')?.focus(),80);
}
function refreshQuick(){
  const form=document.querySelector('#quick-form');if(!form||!ui.quick)return;
  const q=ui.quick;
  form.querySelectorAll('[data-quick-type]').forEach(b=>b.classList.toggle('active',b.dataset.quickType===q.type));
  const amount=form.querySelector('.quick-amount');amount.classList.toggle('income',q.type==='income');amount.classList.toggle('expense',q.type==='expense');
  amount.querySelector('.quick-sign').textContent=q.type==='income'?'+':'−';
  form.querySelector('.quick-cats').innerHTML=quickChips();
  refreshQuickEffect();
}
// Under the amount: what the account balance becomes, and the amount in the other currency.
function refreshQuickEffect(){
  const form=document.querySelector('#quick-form');if(!form||!ui.quick)return;
  const amount=parseNumber(form.amount.value),account=data.accounts.find(a=>a.id===form.accountId.value),box=form.querySelector('[data-quick-effect]'),save=form.querySelector('[data-quick-save]');
  const kind=ui.quick.type==='income'?'הכנסה':'הוצאה';
  if(!(amount>0)||!account){box.textContent='';box.hidden=true;save.textContent=`שמירת ${kind}`;return;}
  const after=account.balance+(ui.quick.type==='income'?amount:-amount),other=account.currency==='USD'?`≈ ${money(amount*data.fx)}`:`≈ ${money(amount/data.fx,'USD',2)}`;
  box.hidden=false;box.innerHTML=`<span>היתרה ב״${e(account.name)}״ תהיה <b dir="ltr" class="${after<0?'negative':''}">${money(after,account.currency)}</b></span><span class="quick-fx" dir="ltr">${other}</span>`;
  save.textContent=`שמירת ${kind} · ${money(amount,account.currency,Number.isInteger(amount)?0:2)}`;
}
function quickValues(form){const f=new FormData(form);return {type:ui.quick?.type||'expense',category:ui.quick?.category||'',amount:String(f.get('amount')||'').trim(),description:String(f.get('description')||'').trim(),accountId:String(f.get('accountId')||''),date:String(f.get('date')||today())};}
function saveQuick(form){
  const v=quickValues(form),amount=parseNumber(v.amount),account=data.accounts.find(a=>a.id===v.accountId);
  if(!(amount>0))throw Error('יש להזין סכום חיובי.');
  if(!v.category)throw Error('בחר קטגוריה.');
  if(!account)throw Error('בחר חשבון.');
  if(!validDate(v.date)||v.date>today())throw Error('התאריך אינו תקין.');
  const t={id:uid(),type:v.type,amount:Math.round(amount*100)/100,currency:account.currency,fx:data.fx,date:v.date,category:v.category,subcategory:'',accountId:account.id,description:v.description.slice(0,120),tags:[],recurring:false};
  closeDialog();
  mutate(next=>{if(!next.categories.includes(t.category))next.categories.push(t.category);applyTransaction(next,t);next.transactions.push(t);},'');
  try{navigator.vibrate?.(12);}catch{}
  undoToast(`${t.type==='income'?'הכנסה':'הוצאה'} של ${money(t.amount,t.currency,Number.isInteger(t.amount)?0:2)} נרשמה · ${t.category}`,t.id);
}
function undoToast(message,id){
  toast(message);
  const el=document.querySelector('.toast');if(!el)return;
  const undo=document.createElement('button');undo.type='button';undo.className='toast-undo';undo.textContent='ביטול';
  undo.addEventListener('click',()=>{el.remove();mutate(next=>{const t=next.transactions.find(x=>x.id===id);if(!t)return;applyTransaction(next,t,-1);next.transactions=next.transactions.filter(x=>x.id!==id);},'התנועה בוטלה');});
  el.insertBefore(undo,el.querySelector('.icon-button'));
}

// ---------- Alerts (bell) and notifications ----------
const NOTIFY_KEY='ofek-notify-v1',SEEN_KEY='ofek-alerts-seen',SENT_KEY='ofek-alerts-sent';
const NOTIFY_TYPES=[['monthly','תזכורת לעדכון החודשי','כשעבר חודש מאז העדכון האחרון של התיק'],['bills','חיובים קרובים','יום לפני תשלום קבוע או הוראת קבע'],['anomalies','הוצאות חריגות','כשהוצאה או קטגוריה גבוהות בהרבה מהרגיל'],['budgets','חריגה מתקציב','כשקטגוריה עוברת את התקציב החודשי']];
const notifySettings=()=>({monthly:false,bills:false,anomalies:false,budgets:false,...readJSON(NOTIFY_KEY,{})});
function currentAlerts(){
  const now=today(),month=now.slice(0,7),list=[],last=sortedSnapshots().at(-1);
  if(data.assets.length&&(!last||(new Date(now)-new Date(last.date))/864e5>=30))list.push({id:`monthly-${month}`,type:'monthly',icon:'CalendarDays',color:'gold',title:'זמן לעדכון החודשי',body:last?`העדכון האחרון של התיק היה ב־${dateLabel(last.date)}.`:'עוד לא נשמר עדכון ראשון לתיק.',action:'navigate:monthly'});
  for(const x of scheduledItems(data,now,shiftDate(now,2)).filter(x=>!x.paid&&x.type!=='income'))list.push({id:`bill-${x.key}`,type:'bills',icon:'Receipt',color:'purple',title:`${x.date===now?'היום':x.date===shiftDate(now,1)?'מחר':'בעוד יומיים'}: ${x.name}`,body:`${money(x.amount)} ${x.autopay?'יירדו אוטומטית':'לתשלום'}`,action:'navigate:bills'});
  for(const a of detectAnomalies(data,month).slice(0,3))list.push({id:`anomaly-${a.kind}-${a.id||a.title}-${month}`,type:'anomalies',icon:'TriangleAlert',color:'red',title:a.kind==='category'?`ההוצאות על ${a.title} גבוהות מהרגיל`:`הוצאה חריגה: ${a.title}`,body:`${money(a.amount)} לעומת כ־${money(a.typical)} בדרך כלל`,action:'navigate:insights'});
  for(const b of data.budgets){const spent=categorySpend(data,b.category,month);if(b.limit>0&&spent>b.limit)list.push({id:`budget-${b.category}-${month}`,type:'budgets',icon:'SlidersHorizontal',color:'red',title:`חריגה מתקציב ${b.category}`,body:`${money(spent)} מתוך ${money(b.limit)} החודש`,action:'navigate:budgets'});}
  return list;
}
function unseenAlerts(){const seen=new Set(readJSON(SEEN_KEY,[]));return currentAlerts().filter(a=>!seen.has(a.id));}
function alertsButton(){
  const n=unseenAlerts().length;
  return `<button type="button" class="icon-button alerts-button" aria-label="${n?`התראות: ${n} חדשות`:'התראות'}" title="התראות" data-action="alerts">${icon('Bell',19)}${n?`<span class="alerts-dot">${n>9?'9+':n}</span>`:''}</button>`;
}
function openAlerts(){
  const list=currentAlerts();
  writeJSON(SEEN_KEY,[...new Set([...readJSON(SEEN_KEY,[]),...list.map(a=>a.id)])].slice(-300));
  showDialog('התראות',`${list.length?`<div class="alerts-list">${list.map(a=>`<button type="button" class="alert-row" data-action="${e(a.action)}"><span class="asset-icon ${a.color}">${icon(a.icon,17)}</span><div><b>${e(a.title)}</b><small>${e(a.body)}</small></div>${icon('ChevronLeft',15)}</button>`).join('')}</div>`:`<div class="all-clear">${icon('ShieldCheck',22)}<div><b>אין התראות כרגע</b><small>אין חריגות, אין חיובים ביומיים הקרובים והתיק מעודכן.</small></div></div>`}<div class="form-actions">${btn('התובנות שלך','navigate:insights','Sparkles')}${btn('הגדרת התראות','alerts-settings','BellRing')}</div>`);
  refreshBell();
}
function refreshBell(){
  const button=document.querySelector('.alerts-button');if(button)button.outerHTML=alertsButton();
  const n=unseenAlerts().length;
  try{if(hasNavigator&&navigator.setAppBadge)(n?navigator.setAppBadge(n):navigator.clearAppBadge())?.catch?.(()=>{});}catch{}
}
async function showSystemNotification(title,body,tag,url){
  const options={body:plainText(body),tag,dir:'rtl',lang:'he',icon:'icons/icon-192.png',badge:'icons/badge-96.png',data:{url}};
  try{const reg=await navigator.serviceWorker?.getRegistration?.();title=plainText(title);if(reg){await reg.showNotification(title,options);return true;}}catch{}
  try{new Notification(title,options);return true;}catch{return false;}
}
// Reminders the service worker already showed in the background (same ids), so nothing repeats.
function shownInBackground(){
  return new Promise(resolve=>{
    try{
      if(typeof indexedDB==='undefined')return resolve({});
      const request=indexedDB.open('ofek-notify',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('kv');
      request.onsuccess=()=>{try{const q=request.result.transaction('kv').objectStore('kv').get('shown');q.onsuccess=()=>resolve(q.result||{});q.onerror=()=>resolve({});}catch{resolve({});}};
      request.onerror=()=>resolve({});
    }catch{resolve({});}
  });
}
async function checkAlerts(){
  refreshBell();
  const st=notifySettings();
  if(!Object.values(st).some(Boolean)||typeof Notification==='undefined'||Notification.permission!=='granted')return;
  const sent=readJSON(SENT_KEY,{}),background=await shownInBackground(),fresh=currentAlerts().filter(a=>st[a.type]&&!sent[a.id]&&!background[a.id]);
  for(const a of fresh.slice(0,3))if(await showSystemNotification(a.title,a.body,a.id,`./#${a.action.split(':')[1]||'dashboard'}`))sent[a.id]=today();
  const cutoff=shiftDate(today(),-90);for(const [id,date] of Object.entries(sent))if(date<cutoff)delete sent[id];
  writeJSON(SENT_KEY,sent);
  sendDigest(st,sent);
}
// Reminders for the coming weeks, handed to the service worker for periodic background checks
// (supported by installed apps in Chromium browsers).
async function sendDigest(st,sent){
  if(!servedOnline()||!hasNavigator||!navigator.serviceWorker)return;
  const now=today(),items=[];
  if(st.bills)for(const x of scheduledItems(data,shiftDate(now,1),shiftDate(now,21)).filter(x=>!x.paid&&x.type!=='income'))items.push({id:`bill-${x.key}`,at:`${shiftDate(x.date,-1)}T09:00`,title:`מחר: ${x.name}`,body:`${money(x.amount)} ${x.autopay?'יירדו אוטומטית':'לתשלום'}`,url:'./#bills'});
  const last=sortedSnapshots().at(-1);
  if(st.monthly&&data.assets.length&&last){const due=shiftDate(last.date,30);items.push({id:`monthly-${due.slice(0,7)}`,at:`${due}T10:00`,title:'זמן לעדכון החודשי',body:'כמה דקות, ותראה איך התיק התקדם.',url:'./#monthly'});}
  try{
    const reg=await navigator.serviceWorker.ready;
    reg.active?.postMessage({type:'ofek-digest',items:items.filter(x=>!sent[x.id]).map(x=>({...x,title:plainText(x.title),body:plainText(x.body)}))});
    if(reg.periodicSync&&items.length){const status=await navigator.permissions.query({name:'periodic-background-sync'});if(status.state==='granted')await reg.periodicSync.register('ofek-reminders',{minInterval:6*3600e3});}
  }catch{}
}
async function toggleNotify(type,on,box){
  if(on){
    if(typeof Notification==='undefined'){box.checked=false;toast('הדפדפן הזה לא תומך בהתראות.',true);return;}
    if(Notification.permission!=='granted'){
      const result=await Notification.requestPermission();
      if(result!=='granted'){box.checked=false;toast('ההתראות לא אושרו בדפדפן.',true);render();return;}
    }
  }
  writeJSON(NOTIFY_KEY,{...notifySettings(),[type]:on});
  toast(on?'ההתראה הופעלה במכשיר הזה':'ההתראה כובתה');
  if(on)checkAlerts();
}

// ---------- Settings cards ----------
function appCard(){
  let body;
  if(isStandalone())body=`<div class="app-status">${icon('Check',18)}<div><b>אופק מותקנת במכשיר הזה</b><small>נפתחת במסך מלא ועובדת גם בלי אינטרנט.</small></div></div>`;
  else if(mobileRuntime.installPrompt)body=`<p class="confirm-text">אפשר להתקין את אופק כאפליקציה: אייקון במסך הבית, מסך מלא ועבודה גם בלי רשת.</p>${btn('התקנה למסך הבית','app-install','Download','primary')}`;
  else if(!servedOnline())body=notice('כדי להתקין את אופק בטלפון, פתח אותה מכתובת אינטרנט (למשל מ־GitHub Pages) ולא מקובץ שמור. ההוראות ב־README.');
  else if(isIOS())body=`<ol class="sync-steps"><li>ב־Safari, לחץ על כפתור השיתוף ${icon('Share',15)}.</li><li>בחר ״הוספה למסך הבית״.</li><li>מעכשיו פתח את אופק מהאייקון — במסך מלא.</li></ol>`;
  else body=`<ol class="sync-steps"><li>פתח את תפריט הדפדפן (⋮).</li><li>בחר ״התקנת האפליקציה״ או ״הוספה למסך הבית״.</li></ol>`;
  return card(head('אופק כאפליקציה','התקנה למסך הבית, ניווט ביד אחת והוספה מהירה מהכפתור שבתחתית המסך.',isStandalone()?badge('מותקנת','green'):textBtn('מה חדש ב־4.0','whats-new'))+body+`<div class="app-perks"><span>${icon('Smartphone',16)}ניווט ביד אחת</span><span>${icon('Plus',16)}הוספה מהירה</span><span>${icon('WifiOff',16)}עובדת בלי רשת</span><span>${icon('BellRing',16)}התראות לבחירתך</span></div>`,'app-card" id="app-card');
}
function notifyCard(){
  const st=notifySettings(),supported=typeof Notification!=='undefined',permission=supported?Notification.permission:'unsupported';
  return card(head('התראות','בחר על מה לקבל התראה במכשיר הזה. ההתראות נוצרות במכשיר עצמו, בלי שרת.',permission==='granted'&&Object.values(st).some(Boolean)?badge('פעילות','green'):badge('כבויות','neutral'))+`<div class="notify-list">${NOTIFY_TYPES.map(([id,label,hint])=>`<label class="notify-row"><span><b>${label}</b><small>${hint}</small></span><input type="checkbox" class="switch" data-notify="${id}" ${st[id]&&permission==='granted'?'checked':''} ${supported?'':'disabled'}></label>`).join('')}</div>${permission==='denied'?notice('ההתראות חסומות בדפדפן. אפשר לאשר אותן בהגדרות האתר ואז להפעיל כאן.','error'):''}${!supported?notice(isIOS()?'באייפון, התראות זמינות אחרי התקנת אופק למסך הבית (iOS 16.4 ומעלה).':'הדפדפן הזה לא תומך בהתראות.'):''}<div class="actions">${btn('התראת ניסיון','notify-test','BellRing')}<span class="muted small">כל ההתראות מופיעות גם בפעמון שבראש המסך.</span></div>`,'notify-card');
}
function appCards(){return `<div class="two-columns app-cards">${appCard()}${notifyCard()}</div>`;}

// ---------- Events ----------
document.addEventListener('click',event=>{
  const quickType=event.target.closest('[data-quick-type]');
  if(quickType&&ui.quick){ui.quick={...ui.quick,type:quickType.dataset.quickType,category:'',manual:false};refreshQuick();return;}
  const chip=event.target.closest('[data-quick-cat]');
  if(chip&&ui.quick){ui.quick={...ui.quick,category:chip.dataset.quickCat,manual:true};refreshQuick();return;}
  if(event.target.closest('.alert-row'))closeDialog();
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action]=button.dataset.action.split(':');
  try{
    if(action==='quick-add')openQuickAdd();
    else if(action==='quick-full'){const form=document.querySelector('#quick-form'),v=form?quickValues(form):{};closeDialog();const prefill=Object.fromEntries(Object.entries({type:v.type,amount:parseNumber(v.amount)||'',category:v.category,description:v.description,accountId:v.accountId,date:v.date}).filter(([,x])=>x!==''&&x!=null));openEntity('transaction',null,prefill);}
    else if(action==='alerts')openAlerts();
    else if(action==='alerts-settings'){closeDialog();navigate('settings');setTimeout(()=>document.querySelector('.notify-card')?.scrollIntoView({behavior:'smooth',block:'start'}),50);}
    else if(action==='app-install'&&mobileRuntime.installPrompt){const p=mobileRuntime.installPrompt;mobileRuntime.installPrompt=null;p.prompt();p.userChoice?.then(r=>{if(r?.outcome!=='accepted')toast('אפשר להתקין בכל זמן מההגדרות');render();});}
    else if(action==='notify-test'){
      if(typeof Notification==='undefined'||Notification.permission!=='granted'){toast('קודם הפעל לפחות התראה אחת ואשר התראות בדפדפן.',true);return;}
      showSystemNotification('אופק · התראת ניסיון','ככה ייראו התזכורות וההתראות שבחרת.','ofek-test','./#dashboard').then(ok=>toast(ok?'נשלחה התראת ניסיון':'לא הצלחנו להציג התראה',!ok));
    }
  }catch(err){toast(err.message,true);}
});
document.addEventListener('change',event=>{
  // The amount is saved in the account's currency, so the label follows the chosen account.
  if(event.target.name==='accountId'&&event.target.closest?.('#quick-form')){const label=event.target.closest('#quick-form').querySelector('.quick-currency');if(label)label.textContent=data.accounts.find(a=>a.id===event.target.value)?.currency==='USD'?'$':'₪';refreshQuickEffect();return;}
  const more=event.target.closest?.('[data-quick-more]');
  if(more&&ui.quick&&more.value){ui.quick={...ui.quick,category:more.value,manual:true};refreshQuick();return;}
  const box=event.target.closest?.('[data-notify]');
  if(box)toggleNotify(box.dataset.notify,box.checked,box);
});
document.addEventListener('input',event=>{
  if(event.target.name==='amount'&&event.target.closest?.('#quick-form'))refreshQuickEffect();
  if(event.target.name!=='description'||!event.target.closest?.('#quick-form')||!ui.quick||ui.quick.manual)return;
  const guess=suggestCategory(data,event.target.value,ui.quick.type);
  if(guess&&guess!==ui.quick.category){ui.quick={...ui.quick,category:guess};refreshQuick();}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='quick-form')return;
  event.preventDefault();
  try{saveQuick(event.target);}catch(err){const box=event.target.querySelector('.form-error');if(box)box.innerHTML=notice(err.message,'error');}
});

// ---------- Start ----------
if(typeof window!=='undefined'&&window.addEventListener&&typeof document!=='undefined'&&document.head){
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();mobileRuntime.installPrompt=event;const box=document.querySelector('#app-card');if(box)box.outerHTML=appCard();});
  window.addEventListener('appinstalled',()=>{mobileRuntime.installPrompt=null;toast('אופק הותקנה במסך הבית');const box=document.querySelector('#app-card');if(box)box.outerHTML=appCard();});
  if(servedOnline()){
    const link=document.createElement('link');link.rel='manifest';link.href='manifest.webmanifest';document.head.append(link);
    if(hasNavigator&&navigator.serviceWorker)navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
  if(typeof location!=='undefined'&&/[?&]quick=1/.test(location.search||'')){history.replaceState(null,'',location.pathname+location.hash);setTimeout(()=>openQuickAdd(),250);}
  if(typeof setTimeout==='function'&&typeof setInterval==='function'){
    setTimeout(checkAlerts,2500);
    setInterval(checkAlerts,30*60e3);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkAlerts();});
  }
}
