import {today,dateLabel} from './finance.js';
import {fetchUsdIls,rememberRate,cachedRate} from './fx.js';

// The dollar rate, automatically: the current rate is refreshed daily (and every few hours while the
// app is open), and forms that need a rate for a specific date (USD transactions and investment actions,
// the monthly update) get that day's rate filled in. Typing a rate by hand always wins.

const FX_CACHE_KEY='ofek-fx-cache',FRESH_MS=6*3600e3;
const fxRuntime={busy:false,error:null,pending:null};
const fxAuto=()=>data.fxAuto!==false;
const formatRate=rate=>Number(rate).toLocaleString('he-IL',{minimumFractionDigits:4,maximumFractionDigits:4});
function readFxCache(){try{return JSON.parse(localStorage.getItem(FX_CACHE_KEY)||'null')||{};}catch{return {};}}
function writeFxCache(cache){try{localStorage.setItem(FX_CACHE_KEY,JSON.stringify(cache));}catch{}}
function fxDateLine(){
  const date=data.fxDate,source=data.fxSource;
  if(!fxAuto())return `שער ידני · נקבע ב־${dateLabel(date)}`;
  return `${date===today()?'עודכן היום':`נכון ל־${dateLabel(date)}`}${source?` · ${source}`:''}`;
}

// Today's rate (cached for a few hours) or a historical one (cached forever).
async function rateFor(date){
  const cache=readFxCache();
  if(!date||date>=today()){
    if(cache.latest&&Date.now()-new Date(cache.latest.at).getTime()<FRESH_MS)return cache.latest;
    const result=await fetchUsdIls();
    writeFxCache(rememberRate(cache,null,result));
    return result;
  }
  const hit=cachedRate(cache,date);if(hit)return hit;
  const result=await fetchUsdIls({date});
  writeFxCache(rememberRate(readFxCache(),date,result));
  return result;
}

async function autoFx(force=false){
  if(!fxAuto()||fxRuntime.busy||loadError)return;
  // Do not re-render under someone typing on the page; try again shortly.
  const active=document.activeElement;
  if(!force&&active&&active.closest?.('#content')&&/INPUT|TEXTAREA|SELECT/.test(active.tagName)){clearTimeout(fxRuntime.pending);fxRuntime.pending=setTimeout(()=>autoFx(),30000);return;}
  fxRuntime.busy=true;refreshFxUI();
  try{
    const result=await rateFor(null),date=result.date||today();
    fxRuntime.error=null;
    const changed=Math.abs(result.rate-data.fx)>=0.0001||data.fxDate!==date||data.fxSource!==result.source;
    if(changed&&fxAuto())commit({...data,fx:result.rate,fxDate:date,fxSource:result.source},force?`שער הדולר עודכן: ${formatRate(result.rate)} ₪`:'');
    else if(force)toast('שער הדולר כבר מעודכן');
  }catch(err){
    fxRuntime.error=err.message;
    if(force)toast(err.message,true);
  }finally{fxRuntime.busy=false;refreshFxUI();}
}

function fxCard(){
  const auto=fxAuto();
  return card(head('שער הדולר',auto?'מתעדכן לבד כל יום, ממקורות ציבוריים חינמיים.':'שער ידני — אופק לא תשנה אותו.',badge(auto?'אוטומטי':'ידני',auto?'green':'neutral'))+`<div class="fx-now"><span class="fx-symbol" aria-hidden="true">$</span><div><b dir="ltr">${formatRate(data.fx)} ₪</b><small>${e(fxDateLine())}</small></div>${auto?btn(fxRuntime.busy?'מעדכן…':'עדכון עכשיו','fx-refresh','RefreshCw'):''}</div><label class="notify-row"><span><b>עדכון אוטומטי</b><small>השער היומי, וגם שער לפי תאריך בתנועות דולריות ובעדכון החודשי</small></span><input type="checkbox" class="switch" data-fx-auto ${auto?'checked':''}></label>${auto?'':`<form id="fx-form" class="fx-manual">${field('שער ידני (₪ לדולר אחד)',input('fx',data.fx,'number','min="0.001" step="any" required inputmode="decimal"'))}<div class="form-actions">${submit('שמירת השער')}</div></form>`}${fxRuntime.error&&auto?notice('לא הצלחנו להתעדכן כרגע — משתמשים בשער האחרון שנשמר. ננסה שוב אוטומטית.','error'):''}`,'fx-card" id="fx-card');
}
function fxChip(){return `<span class="fx-chip" title="${e(fxDateLine())}">${icon('CircleDollarSign',15)}<span>דולר <b dir="ltr">${formatRate(data.fx)} ₪</b></span>${fxAuto()?'<i>אוטומטי</i>':''}</span>`;}
function refreshFxUI(){const box=document.querySelector('#fx-card');if(box)box.outerHTML=fxCard();}

// ---------- Filling forms with the rate for their date ----------
function setFxHint(input,text){
  const field=input.closest('.field');if(!field)return;
  let hint=field.querySelector('.fx-hint');
  if(!hint){hint=document.createElement('small');hint.className='fx-hint';field.append(hint);}
  hint.textContent=text;
}
async function fillFormRate(form){
  const input=form?.querySelector('[name=fx]');
  if(!input||!fxAuto()||input.dataset.fxManual)return;
  const date=form.querySelector('[name=date]')?.value||today();
  if(input.dataset.fxFor===date)return;
  input.dataset.fxFor=date;
  setFxHint(input,'מביא את שער הדולר לתאריך…');
  try{
    const result=await rateFor(date);
    if(!input.isConnected||input.dataset.fxManual||input.dataset.fxFor!==date)return;
    input.value=String(result.rate);
    if(form.id==='entity-form'&&dialogState?.v)dialogState.v.fx=result.rate;
    if(form.id==='monthly-form'&&ui.monthly)ui.monthly.fx=result.rate;
    setFxHint(input,`השער ${date>=today()?'של היום':`ל־${dateLabel(date)}`}${result.date&&result.date!==date&&date<today()?` (יום המסחר ${dateLabel(result.date)})`:''} · ${result.source}. אפשר לשנות ידנית.`);
  }catch{
    if(input.isConnected&&input.dataset.fxFor===date)setFxHint(input,'לא הצלחנו להביא שער אוטומטי — אפשר להקליד ידנית.');
  }
}
function fillOpenForms(){for(const id of ['#entity-form','#monthly-form'])fillFormRate(document.querySelector(id));}

document.addEventListener('input',event=>{
  const el=event.target;
  if(el.name==='fx'&&event.isTrusted&&el.closest?.('#entity-form,#monthly-form')){el.dataset.fxManual='1';setFxHint(el,'שער ידני');}
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.matches?.('[data-fx-auto]')){
    const on=el.checked;
    commit({...data,fxAuto:on},on?'שער הדולר יתעדכן אוטומטית':'עברת לשער ידני');
    if(on)autoFx(true);
    return;
  }
  if(el.name==='date'&&el.closest?.('#entity-form,#monthly-form')){const box=el.form?.querySelector('[name=fx]');if(box&&!box.dataset.fxManual){delete box.dataset.fxFor;fillFormRate(el.form);}}
});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  if(button.dataset.action==='fx-refresh'){writeFxCache({...readFxCache(),latest:null});autoFx(true);}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='fx-form')return;
  event.preventDefault();
  const rate=Number(new FormData(event.target).get('fx'));
  if(!(rate>0))return toast('הזן שער חיובי',true);
  commit({...data,fx:rate,fxDate:today(),fxSource:''},'השער נשמר');
});

if(typeof setTimeout==='function'&&typeof setInterval==='function'&&typeof document!=='undefined'&&document.head&&typeof MutationObserver==='function'){
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;setTimeout(()=>{queued=false;fillOpenForms();},60);}).observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>autoFx(),1500);
  setInterval(()=>{if(document.visibilityState==='visible')autoFx();},3*3600e3);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')autoFx();});
}
