import {money,minusMoney,today,dateLabel,portfolioValue,investAccounts,containerAssets,DEFAULT_CONTAINER_NAME} from './finance.js';
import {palette,paletteSoft} from './charts.js';
import {QUOTES_KEY,QUOTE_PROVIDERS,QUOTE_REASONS,quoteRoute,fetchQuotes} from './quotes.js';

// The daily update (4.1): one dialog with today's price of every holding. Whatever has a free source is filled
// in automatically (crypto always; US stocks and ETFs with the user's free key); everything else — Tel Aviv
// papers, mutual funds, provident funds — is typed from the broker's app. Fetching never blocks typing, nothing
// is saved until "עדכון", and saving never creates a monthly snapshot: it updates each holding's price, its
// date and source, and through them every total, chart and widget.
// Built on the UI helpers and state from app.js; the dollar rate comes from fx-ui.js (rateFor, fxAuto).

function readQuoteSettings(){
  try{const v=JSON.parse(localStorage.getItem(QUOTES_KEY)||'null');if(v&&typeof v==='object')return {provider:QUOTE_PROVIDERS[v.provider]?v.provider:'finnhub',key:typeof v.key==='string'?v.key.trim():''};}catch{}
  return {provider:'finnhub',key:''};
}
function writeQuoteSettings(v){try{localStorage.setItem(QUOTES_KEY,JSON.stringify(v));return true;}catch{return false;}}
const daily={run:0,results:new Map(),fx:null,busy:false,reopen:false};
const dailyGroups=()=>{const list=investAccounts(data);return list.length>1?list.map(a=>[a.name,containerAssets(data,a.id)]).filter(([,x])=>x.length):[['',data.assets]];};
const dailyField=a=>a.mode==='price'?'currentPrice':'currentValue';
const dailySign=n=>Math.abs(n)<.5?money(0):n>0?'+'+money(n):minusMoney(n);
const tradingDay=date=>date&&date!==today()?`מחיר מסחר של ${dateLabel(date)}`:'מחיר של היום';

function dailyStatus(a,r){
  if(!r)return ['busy','מושך את המחיר…'];
  if(r.status==='manual')return ['manual',QUOTE_REASONS[r.why]||'מקלידים'];
  if(r.status==='error')return ['error',`${QUOTE_REASONS[r.why]||'לא הצלחנו להביא מחיר'} · אפשר להקליד`];
  const move=r.change==null?'':` · ${r.change>=0?'+':'−'}${Math.abs(r.change*100).toLocaleString('he-IL',{maximumFractionDigits:1})}%`;
  return r.flags?.includes('jump')?['warn',`שינוי חריג${move} — כדאי לבדוק · ${r.source}`]:['ok',`נמשך אוטומטית · ${r.source} · ${tradingDay(r.date)}${move}`];
}
function dailyRow(a){
  const i=Math.max(0,data.assets.indexOf(a)),r=daily.results.get(a.id),[cls,text]=dailyStatus(a,r),key=dailyField(a);
  const label=(a.ticker||'').trim().slice(0,5)||a.name.slice(0,2);
  return `<div class="daily-row" data-daily="${e(a.id)}"><span class="ticker-icon${label.length>3?' long':''}" style="color:${palette[i%palette.length]};background:${paletteSoft[i%paletteSoft.length]}">${e(label)}</span><div class="daily-name"><b>${e(a.name)}</b><small>${a.mode==='price'?'מחיר ליחידה':'שווי כולל'} · עכשיו <bdi dir="ltr">${money(a[key],a.currency,a.mode==='price'?2:0)}</bdi></small></div><label class="currency-input daily-input"><input name="q_${e(a.id)}" type="number" step="any" min="0" inputmode="decimal" required value="${e(a[key])}" aria-label="${e((a.mode==='price'?'המחיר של היום ל':'השווי של היום ל')+a.name)}"><span>${a.currency==='USD'?'$':'₪'}</span></label><small class="daily-status ${cls}" id="ds-${e(a.id)}">${e(text)}</small></div>`;
}
function dailyTotalHTML(form){
  const next=dailyDraft(form,false),before=portfolioValue(data),after=next?portfolioValue(next):before;
  return `<span>שווי התיק אחרי העדכון</span><b dir="ltr">${money(after)}</b><small dir="ltr" class="${after-before>=0?'positive':'negative'}">${dailySign(after-before)}</small>`;
}
function dailyProgress(){
  const auto=data.assets.filter(a=>quoteRoute(a,readQuoteSettings()).kind!=='manual'),done=auto.filter(a=>daily.results.has(a.id)).length,ok=auto.filter(a=>daily.results.get(a.id)?.status==='ok').length;
  if(!auto.length)return `${icon('Info',15)}<span>אין כרגע נכסים עם מקור מחירים חינמי — מקלידים את המחירים מהאפליקציה של בית ההשקעות.</span>`;
  if(daily.busy)return `<span class="daily-spinner" aria-hidden="true"></span><span>מושך מחירים מהאינטרנט… ${done} מתוך ${auto.length}</span>`;
  const text=ok===auto.length?(ok===1?'המחיר נמשך אוטומטית.':`כל ${ok} המחירים נמשכו אוטומטית.`):`${ok} מתוך ${auto.length} מחירים נמשכו אוטומטית. את השאר אפשר להקליד.`;
  return `${icon(ok===auto.length?'Check':'Info',15)}<span>${text}</span>`;
}

function openDailyUpdate(){
  if(!data.assets.length){toast('עוד אין נכסים בתיק. הוסף השקעה ואז אפשר לעדכן מחירים.',true);return;}
  daily.results=new Map();daily.fx=null;
  const settings=readQuoteSettings(),usd=data.assets.some(a=>a.currency==='USD'),needsKey=data.assets.some(a=>quoteRoute(a,settings).why==='needs-key');
  const groups=dailyGroups().map(([title,list])=>`<div class="daily-group">${title?`<h3>${e(title)}</h3>`:''}${list.map(dailyRow).join('')}</div>`).join('');
  showDialog('עדכון יומי · המחירים של היום',`<form id="daily-form" novalidate><div class="form-error"></div><p class="confirm-text">מה שאפשר נמשך אוטומטית מהאינטרנט; את השאר מקלידים מהאפליקציה של בית ההשקעות. שום דבר לא נשמר עד שלוחצים ״עדכון״.</p><div id="daily-progress" class="daily-progress" aria-live="polite">${dailyProgress()}</div>${needsKey?`<div class="daily-key">${notice('מניות וקרנות סל בארה״ב יכולות להתעדכן לבד עם מפתח חינמי (דקה של הרשמה).')}<button type="button" class="text-button" data-action="quotes-settings">${icon('KeyRound',15)}חיבור מקור מחירים</button></div>`:''}${usd?`<div class="daily-fx">${field('שער הדולר',`<div class="currency-input">${input('fx',data.fx,'number','step="any" min="0.001" inputmode="decimal" required')}<span>₪</span></div>`,fxAuto()?'מתעדכן אוטומטית':'שער ידני')}</div>`:''}<div class="daily-list">${groups}</div><div id="daily-total" class="daily-total" aria-live="polite"></div><div class="form-actions">${submit('עדכון','Check')}${btn('ביטול','dialog-close')}</div></form>`,true);
  refreshDailyTotal();runDailyFetch();
}
async function runDailyFetch(only=null){
  const run=++daily.run,settings=readQuoteSettings(),assets=(only||data.assets).map(a=>({...a}));
  daily.busy=true;refreshDailyProgress();
  const fxJob=(async()=>{
    if(only||!data.assets.some(a=>a.currency==='USD')||typeof fxAuto!=='function'||!fxAuto()||typeof rateFor!=='function')return;
    try{const r=await rateFor(null);if(run!==daily.run)return;daily.fx=r;const box=document.querySelector('#daily-form [name=fx]');if(box&&!box.dataset.touched&&r?.rate>0){box.value=String(r.rate);setDailyHint(box,`${r.source||'שער אוטומטי'} · ${r.date&&r.date!==today()?`נכון ל־${dateLabel(r.date)}`:'היום'}`);}}catch{}
  })();
  await Promise.all([fxJob,fetchQuotes(assets,settings,{onResult:(id,r)=>{if(run!==daily.run)return;daily.results.set(id,r);applyDailyResult(id,r);}})]);
  if(run!==daily.run)return;
  daily.busy=false;refreshDailyProgress();refreshDailyTotal();
}
function setDailyHint(box,text){const f=box.closest('.field');if(!f)return;let hint=f.querySelector('small');if(!hint){hint=document.createElement('small');f.append(hint);}hint.textContent=text;}
function applyDailyResult(id,r){
  const row=document.querySelector(`#daily-form [data-daily="${CSS.escape(id)}"]`),a=data.assets.find(x=>x.id===id);if(!row||!a)return;
  const box=row.querySelector('input'),status=row.querySelector('.daily-status'),[cls,text]=dailyStatus(a,r);
  if(r.status==='ok'&&box&&!box.dataset.touched){box.value=String(r.price);row.classList.add('filled');}
  if(status){status.className=`daily-status ${cls}`;status.textContent=text;}
  refreshDailyProgress();refreshDailyTotal();
}
function refreshDailyProgress(){const el=document.querySelector('#daily-progress');if(el)el.innerHTML=dailyProgress();}
function refreshDailyTotal(){const form=document.querySelector('#daily-form'),el=form?.querySelector('#daily-total');if(el)el.innerHTML=dailyTotalHTML(form);}
// The data as it would be saved. strict: throw on a missing or invalid value (on save); otherwise skip it.
function dailyDraft(form,strict=true){
  const f=new FormData(form),next=structuredClone(data),now=today(),changes=[];
  const fxRaw=f.get('fx');
  if(fxRaw!=null&&String(fxRaw).trim()!==''){const r=Number(fxRaw);if(!(r>0)){if(strict)throw Error('יש להזין שער דולר חיובי.');}else if(Math.abs(r-next.fx)>=1e-4){next.fx=r;next.fxDate=now;next.fxSource=daily.fx&&Math.abs(daily.fx.rate-r)<1e-4?daily.fx.source||'':'';changes.push('fx');}}
  else if(fxRaw!=null&&strict)throw Error('יש להזין שער דולר.');
  for(const a of next.assets){
    const raw=f.get('q_'+a.id);if(raw==null)continue;
    const v=Number(raw),key=dailyField(a);
    if(String(raw).trim()===''||!Number.isFinite(v)||v<0||(a.mode==='price'&&v===0)){if(strict)throw Error(`יש להזין ${a.mode==='price'?'מחיר':'שווי'} תקין ל״${a.name}״.`);continue;}
    const r=daily.results.get(a.id),fetched=r?.status==='ok'&&Math.abs(r.price-v)<1e-9;
    if(Math.abs(v-a[key])<1e-9&&!fetched)continue;
    a[key]=Math.round(v*1e6)/1e6;a.date=now;a.priceDate=fetched?r.date:now;a.priceSource=fetched?r.source:'ידני';
    changes.push(a.id);
  }
  return strict?{next,changes}:next;
}
function saveDaily(form){
  const {next,changes}=dailyDraft(form,true),assets=changes.filter(id=>id!=='fx');
  daily.run++;
  if(!changes.length){closeDialog();toast('לא היו שינויים — המחירים נשארו כמו שהם.');return;}
  const before=portfolioValue(data),after=portfolioValue(next);
  closeDialog();
  commit(next,`${assets.length?`עודכנו ${assets.length===1?'נכס אחד':`${assets.length} נכסים`}`:'שער הדולר עודכן'} · שווי התיק ${money(after)} (${dailySign(after-before)})`,false,{undo:true});
  // A monthly update in progress follows the new prices (it would otherwise keep the old ones).
  if(ui.monthly&&!ui.monthlyDone){for(const id of assets){const a=next.assets.find(x=>x.id===id);if(a)ui.monthly.values[id]=a[dailyField(a)];}if(changes.includes('fx'))ui.monthly.fx=next.fx;}
}

// ---------- The price source (a free personal key, kept on this device only) ----------
function openQuoteSettings(){
  const s=readQuoteSettings(),masked=s.key?'••••'+s.key.slice(-4):'';
  showDialog('מקור מחירים למניות בארה״ב',`<form id="quotes-form"><div class="form-error"></div><p class="confirm-text">קריפטו מתעדכן לבד, בלי הרשמה. למניות ולקרנות סל בבורסות ארה״ב צריך מפתח אישי חינמי מאחד המקורות: נרשמים באתר שלהם (דקה), מעתיקים את המפתח ומדביקים כאן.</p><div class="form-grid">${field('מקור',select('provider',Object.entries(QUOTE_PROVIDERS).map(([id,p])=>[id,`${p.label} · ${p.limit}`]),s.provider))}${field('מפתח API',input('key','','password',`autocomplete="off" dir="ltr" spellcheck="false" placeholder="${s.key?e(masked)+' · השאר ריק כדי לשמור':'הדבק כאן את המפתח'}"`))}</div><ul class="quotes-facts"><li>המפתח נשמר רק במכשיר הזה. הוא לא נכנס לגיבוי ולא לסנכרון.</li><li>למקור נשלח רק הסימול (למשל VOO) — בלי כמויות, בלי סכומים ובלי שום פרט אישי.</li><li>ניירות בבורסת תל אביב, קרנות נאמנות, קופות גמל וקרנות השתלמות אינם זמינים במקורות החינמיים. אותם מקלידים בעדכון היומי.</li></ul><p class="quotes-links">${Object.values(QUOTE_PROVIDERS).map(p=>`<a href="${e(p.signup)}" target="_blank" rel="noopener noreferrer">הרשמה ל־${e(p.label)}${icon('ArrowUpLeft',14)}</a>`).join('')}</p><div id="quotes-test-result" class="quotes-test" aria-live="polite"></div><div class="form-actions">${submit('שמירה')}${btn('בדיקת המפתח','quotes-test','Search')}${s.key?btn('הסרת המפתח','quotes-clear','Trash2','danger'):''}${btn('ביטול','dialog-close')}</div></form>`);
}
function quoteFormSettings(form){const f=new FormData(form),old=readQuoteSettings(),key=String(f.get('key')||'').trim();return {provider:QUOTE_PROVIDERS[f.get('provider')]?String(f.get('provider')):'finnhub',key:key||old.key};}
async function testQuoteKey(form){
  const s=quoteFormSettings(form),box=form.querySelector('#quotes-test-result');
  if(!s.key){box.innerHTML=notice('הדבק מפתח כדי לבדוק אותו.','warning');return;}
  box.innerHTML=`<span class="daily-spinner" aria-hidden="true"></span><span>בודק מול ${e(QUOTE_PROVIDERS[s.provider].label)}…</span>`;
  const probe={id:'probe',name:'SPY',ticker:'SPY',type:'קרן סל',currency:'USD',mode:'price',currentPrice:0};
  const r=(await fetchQuotes([probe],s)).get('probe');
  if(!box.isConnected)return;
  box.innerHTML=r?.status==='ok'?notice(safe(`המפתח עובד: SPY ב־${amtText(money(r.price,'USD',2))} (${e(tradingDay(r.date))}).`),'success'):notice(QUOTE_REASONS[r?.why]||'הבדיקה נכשלה.','error');
}
function quotesCard(){
  const s=readQuoteSettings(),p=QUOTE_PROVIDERS[s.provider];
  return card(head('מחירי השקעות אוטומטיים','העדכון היומי מושך את המחירים של היום מהאינטרנט. מה שאין לו מקור חינמי — מקלידים.',badge(s.key?`מחובר · ${p.label}`:'קריפטו בלבד',s.key?'green':'neutral'))+`<div class="quotes-rows"><div><span>${icon('Check',15)}קריפטו</span><b>אוטומטי, בלי הרשמה (CoinGecko)</b></div><div><span>${icon(s.key?'Check':'KeyRound',15)}מניות וקרנות סל בארה״ב</span><b>${s.key?`אוטומטי (${e(p.label)})`:'צריך מפתח חינמי'}</b></div><div><span>${icon('Edit3',15)}ת״א, קרנות נאמנות וקופות גמל</span><b>מקלידים בעדכון היומי</b></div></div><div class="actions">${btn(s.key?'החלפת מקור או מפתח':'חיבור מקור מחירים','quotes-settings','KeyRound')}</div>`,'quotes-card');
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  try{
    if(action==='daily-update')openDailyUpdate();
    else if(action==='quotes-settings'){daily.reopen=!!button.closest('#daily-form');openQuoteSettings();}
    else if(action==='quotes-test'){const form=button.closest('#quotes-form');if(form)testQuoteKey(form);}
    else if(action==='quotes-clear'){const s=readQuoteSettings();writeQuoteSettings({provider:s.provider,key:''});closeDialog();toast('המפתח הוסר מהמכשיר');render();}
  }catch(err){toast(err.message,true);}
});
document.addEventListener('input',event=>{
  const form=event.target.closest?.('#daily-form');if(!form)return;
  if(event.isTrusted&&event.target.name)event.target.dataset.touched='1';
  if(event.target.name==='fx'&&event.isTrusted)setDailyHint(event.target,'שער ידני');
  refreshDailyTotal();
});
document.addEventListener('submit',event=>{
  const form=event.target;
  if(form.id==='daily-form'){event.preventDefault();try{saveDaily(form);}catch(err){const box=form.querySelector('.form-error');if(box)box.innerHTML=notice(err.message,'error');else toast(err.message,true);}}
  else if(form.id==='quotes-form'){event.preventDefault();const s=quoteFormSettings(form);if(!writeQuoteSettings(s)){form.querySelector('.form-error').innerHTML=notice('לא הצלחנו לשמור במכשיר הזה (האחסון חסום).','error');return;}closeDialog();toast(s.key?`מקור המחירים נשמר: ${QUOTE_PROVIDERS[s.provider].label}`:'נשמר');if(daily.reopen){daily.reopen=false;openDailyUpdate();return;}render();}
});
