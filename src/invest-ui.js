import {money,pct,pctPrecise,minusMoney,today,dateLabel,assetValue,INVEST_TYPES,DEFAULT_CONTAINER_NAME,investAccounts,investType,containerAssets} from './finance.js';
import {effectiveGoalSavings} from './savings.js';
import {palette,paletteSoft} from './charts.js';
import {riskProfile,stressTest,historyRisk,STRESS_SCENARIOS,parseHoldingsRows,matchHoldings,SECTORS,containerSummary} from './invest.js';
import {readXlsx,isXlsx,textToRows} from './xlsx.js';
import {aiReady} from './ai.js';

// Investments: the accounts (containers) with their holdings, the risk & diversification card and the quick
// update from a broker report. Built on the UI helpers and state from app.js.

// ---------- Investment accounts (4.1 containers) ----------
// Each `investment` account holds holdings: "מיטב טרייד" with its stocks, "אלטשולר שחם · קופת גמל להשקעה" with
// its track. Before the user creates one, the holdings sit in a virtual "התיק שלי" (id ''), made real on demand.
const CONTAINER_ICONS={broker:'ChartNoAxesCombined',gemel:'PiggyBank',hishtalmut:'BookOpen',pension:'ShieldCheck',other:'Briefcase'};
const CONTAINER_ASSET_TYPES={gemel:'קופת גמל להשקעה',hishtalmut:'קרן השתלמות',pension:'פנסיה'};
const containerOptions=()=>{const list=investAccounts(data);return list.length?list.map(a=>[a.id,a.name]):[['',DEFAULT_CONTAINER_NAME]];};
const signedMoney=(n,c='ILS')=>Math.abs(n)<.5?money(0,c):n>0?'+'+money(n,c):minusMoney(n,c);
// How fresh a holding's price is: market prices go stale after a week, values typed from a report after ~5 weeks.
function holdingFreshness(a){
  if(!a.date)return {label:'עוד לא עודכן',cls:'stale'};
  const days=Math.round((new Date(today())-new Date(a.date))/864e5),limit=a.mode==='value'?35:7;
  return {label:days<=0?'עודכן היום':days===1?'עודכן אתמול':days<31?`עודכן לפני ${days} ימים`:`עודכן ב־${dateLabel(a.date)}`,cls:days<=1?'fresh':days<=limit?'':'stale'};
}
function holdingRow(h){
  const a=h.asset,i=Math.max(0,data.assets.indexOf(a)),color=palette[i%palette.length],soft=paletteSoft[i%paletteSoft.length],fresh=holdingFreshness(a);
  const detail=a.mode==='price'?`<bdi dir="ltr">${(+a.quantity).toLocaleString('he-IL',{maximumFractionDigits:6})} × ${money(a.currentPrice,a.currency,2)}</bdi>`:e(a.type||'שווי לפי דוח');
  return `<button type="button" class="holding-row" data-action="edit:asset:${e(a.id)}" aria-label="${e('עריכת '+a.name)}"><span class="ticker-icon${tickerLabel(a).length>3?' long':''}" style="color:${color};background:${soft}">${e(tickerLabel(a))}</span><span class="holding-main"><b>${e(a.name)}</b><small>${a.ticker&&a.mode==='price'?`<bdi dir="ltr">${e(a.ticker)}</bdi> · `:''}${detail}</small><small class="holding-fresh ${fresh.cls}">${e(fresh.label)}</small></span><span class="holding-figures"><b dir="ltr">${money(h.value)}</b>${a.currency==='USD'?`<small class="muted" dir="ltr">${money(assetValue(a),'USD')}</small>`:''}<small dir="ltr" class="${h.profit>=0?'positive':'negative'}">${signedMoney(h.profit)} · ${pct(h.return)}</small></span></button>`;
}
function containerCard(c){
  const type=INVEST_TYPES[c.type],sub=[type,c.institution!==type&&c.institution].filter(Boolean).join(' · '),several=data.accounts.filter(a=>a.kind==='investment').length>1;
  const rows=c.holdings.map(holdingRow).join('')+(c.holdsCash?`<div class="holding-row cash-row"><span class="ticker-icon neutral">${icon('Wallet',17)}</span><span class="holding-main"><b>מזומן בחשבון</b><small><bdi dir="ltr">${money(data.wallets.ILS)}</bdi> · <bdi dir="ltr">${money(data.wallets.USD,'USD')}</bdi></small></span><span class="holding-figures"><b dir="ltr">${money(c.cash)}</b></span></div>`:'');
  return card(`<div class="container-head"><span class="asset-icon ${c.type==='broker'?'blue':c.type==='other'?'neutral':'purple'}">${icon(CONTAINER_ICONS[c.type]||'Briefcase',20)}</span><div><h2>${e(c.name)}</h2><small>${e(sub)}</small></div><div class="container-actions">${ib('Edit3','עריכת '+c.name,'container-edit:'+c.id)}${c.virtual?'':ib('Trash2','מחיקת '+c.name,'container-remove:'+c.id)}</div></div>
    <div class="container-figures"><div><span>שווי</span><b dir="ltr" class="container-value">${money(c.value)}</b></div><div><span>רווח / הפסד</span><b dir="ltr" class="${c.profit>=0?'positive':'negative'}">${signedMoney(c.profit)}</b><small dir="ltr">${pct(c.return)}</small></div>${several?`<div><span>מהתיק</span><b dir="ltr">${pct(c.share)}</b></div>`:''}</div>
    ${rows?`<div class="holding-list">${rows}</div>`:`<p class="muted container-empty">${c.type==='broker'||c.type==='other'?'עוד אין נכסים בחשבון הזה.':'הוסף את המסלול שלך ואת השווי מהדוח האחרון.'}</p>`}
    <div class="container-foot"><button type="button" class="text-button" data-action="container-add:${e(c.id)}">${icon('Plus',15)}${e(c.type==='broker'||c.type==='other'?'הוספת נכס':'הוספת מסלול')}</button></div>`,'container-card');
}
function containersSection(){
  const list=containerSummary(data),count=data.assets.length;
  return `<div class="section-head invest-section-head"><div><h2>החשבונות שלך</h2><p>${list.length===1&&list[0].virtual?'אפשר לפצל את התיק לפי חשבון מסחר, קופת גמל או קרן השתלמות.':`${list.length} ${list.length===1?'חשבון':'חשבונות'} · ${count} ${count===1?'נכס':'נכסים'}`}</p></div><div class="actions">${btn('חשבון השקעות חדש','container-new','Plus')}${btn('הוספת השקעה','open:asset','Plus','primary')}</div></div>
  <div class="container-grid">${list.map(containerCard).join('')}</div>`;
}
// New or edited container: the account form with the investment kind. Editing the virtual "התיק שלי" creates it
// as the first container, so the holdings without one simply belong to it.
function openContainer(id=null){
  if(id==null)return openEntity('account',null,{kind:'investment',invType:'broker',currency:'ILS',name:'',institution:''});
  const account=investAccounts(data).find(a=>a.id===id);
  if(account)return openEntity('account',account);
  openEntity('account',null,{kind:'investment',invType:'broker',currency:'ILS',name:DEFAULT_CONTAINER_NAME,institution:'',adopt:'1'});
}
function addToContainer(id){
  const account=investAccounts(data).find(a=>a.id===id),kind=investType(account),fund=CONTAINER_ASSET_TYPES[kind];
  openEntity('asset',null,{accountId:id,...(fund?{type:fund,mode:'value',currency:'ILS',ticker:''}:{})});
}
// Deleting a container moves its holdings (and so the portfolio cash it shows) to another one; the only
// container with holdings cannot be deleted — rename it instead.
function openContainerRemove(id){
  const account=investAccounts(data).find(a=>a.id===id);if(!account)return;
  const holdings=containerAssets(data,id),others=investAccounts(data).filter(a=>a.id!==id),linked=data.goals.filter(g=>g.accountId===id);
  if(!holdings.length){confirm(`למחוק את ״${account.name}״?`,`החשבון ריק ויימחק.${linked.length?` ${linked.length===1?'יעד אחד שמקושר אליו יעבור':`${linked.length} יעדים שמקושרים אליו יעברו`} לסכום ידני.`:''}`,()=>removeContainer(id,''),true,'מחיקה');return;}
  if(!others.length){toast('זה חשבון ההשקעות היחיד, ויש בו נכסים. אפשר לשנות לו שם, או למחוק קודם את הנכסים שבו.',true);return;}
  showDialog(`מחיקת ״${account.name}״`,`<form id="container-remove-form" data-container="${e(id)}"><div class="form-error"></div><p class="confirm-text">בחשבון ${holdings.length===1?'נכס אחד':`${holdings.length} נכסים`}. לאן להעביר ${holdings.length===1?'אותו':'אותם'}? ההיסטוריה, הפעולות והשווי נשמרים.</p><div class="form-grid">${field('להעביר אל',select('target',others.map(a=>[a.id,a.name])),'','full')}</div>${linked.length?notice('יעדים שמקושרים לחשבון הזה יעברו לסכום ידני.'):''}<div class="form-actions">${submit('מחיקה והעברה','Trash2')}${btn('ביטול','dialog-close')}</div></form>`);
}
function removeContainer(id,targetId){
  const account=investAccounts(data).find(a=>a.id===id);if(!account)return;
  const next=structuredClone(data),moved=containerAssets(next,id);
  if(moved.length&&!investAccounts(next).some(a=>a.id===targetId&&a.id!==id))throw Error('יש לבחור חשבון יעד לנכסים.');
  for(const a of moved)a.accountId=targetId;
  next.goals=next.goals.map(g=>g.accountId===id?{...g,accountId:'',allocation:null,saved:Math.round(effectiveGoalSavings(data,g)*100)/100}:g);
  next.accounts=next.accounts.filter(a=>a.id!==id);
  closeDialog();
  commit(next,moved.length?`״${account.name}״ נמחק · ${moved.length} נכסים עברו ל״${next.accounts.find(a=>a.id===targetId)?.name}״`:`״${account.name}״ נמחק`,false,{undo:true});
}

const levelText={high:['ריכוז גבוה','red'],medium:['ריכוז בינוני','gold'],low:['מפוזר היטב','green'],none:['אין נכסים','neutral']};
function shareBars(list,limit=7){
  return `<div class="share-bars">${list.slice(0,limit).map((x,i)=>`<div class="share-bar"><div class="row-between"><span><i style="background:${palette[i%palette.length]}"></i>${e(x.name)}</span><b dir="ltr">${pct(x.share)}</b></div><div class="share-track"><span style="width:${Math.max(1,x.share*100)}%;background:${palette[i%palette.length]}"></span></div></div>`).join('')}</div>`;
}
function riskCard(){
  const r=riskProfile(data);
  if(!r.total)return '';
  const h=historyRisk(data),[levelLabel,levelColor]=levelText[r.concentration],tests=STRESS_SCENARIOS.map(s=>stressTest(data,s));
  const notes=[];
  if(r.largest&&r.largest.share>.25)notes.push(`${r.largest.fullName} מהווה ${pct(r.largest.share)} מהתיק. נכס יחיד גדול מגדיל את הסיכון.`);
  if(r.usdShare>.5)notes.push(safe(`${pct(r.usdShare)} מהתיק חשוף לדולר. התחזקות של 10% בשקל תוריד כ־${amt(r.usd*.1)} מהשווי בשקלים.`));
  const crypto=r.bySector.find(x=>x.name==='קריפטו');if(crypto&&crypto.share>.05)notes.push(`קריפטו מהווה ${pct(crypto.share)} מהתיק — נכס תנודתי במיוחד.`);
  if(r.effective>=4&&!notes.length)notes.push('התיק מפוזר בין כמה נכסים ותחומים. כדאי לבדוק את הפיזור מחדש בכל עדכון חודשי.');
  return card(head('סיכון ופיזור','לפי השווי הנוכחי של התיק · הערכה בלבד, לא ייעוץ השקעות',aiReady()?btn('ניתוח עם Claude','ai-prompt:risk','Sparkles'):'')+`
  <div class="risk-kpis">
    <div><span>הנכס הגדול</span><b>${e(r.largest?.name||'—')}</b><small>${pct(r.largest?.share||0)} מהתיק</small></div>
    <div><span>ריכוז</span><b>${badge(levelLabel,levelColor)}</b><small>כמו ${r.effective.toLocaleString('he-IL',{maximumFractionDigits:1})} נכסים שווים</small></div>
    <div><span>חשיפה לדולר</span><b dir="ltr">${pct(r.usdShare)}</b><small>${amt(r.usd)}</small></div>
    <div><span>תנודתיות שנתית</span><b dir="ltr">${h?pct(h.annualVolatility):'—'}</b><small>${h?`ירידה מרבית ${pct(h.maxDrawdown)} · ${h.months} חודשים`:'נדרשות 3 תמונות מצב'}</small></div>
  </div>
  ${notes.length?`<ul class="risk-notes">${notes.map(n=>`<li>${e(n)}</li>`).join('')}</ul>`:''}
  <div class="risk-columns"><div><h3>לפי תחום</h3>${shareBars(r.bySector)}${r.byContainer.length>1?`<h3 class="risk-sub">לפי חשבון</h3>${shareBars(r.byContainer)}`:''}</div><div><h3>לפי סוג נכס</h3>${shareBars(r.byType)}<h3 class="risk-sub">לפי מטבע</h3>${shareBars([{name:'דולר',share:r.usdShare},{name:'שקל',share:1-r.usdShare}].filter(x=>x.share>0))}</div></div>
  <h3 class="risk-sub">מה יקרה לתיק אם…</h3>
  <div class="table-wrap"><table class="stress-table"><thead><tr><th>תרחיש</th><th>שינוי בתיק</th><th>מהתיק</th><th>שווי נקי אחרי</th><th>בחודשי הוצאות</th></tr></thead><tbody>${tests.map(t=>`<tr><td><b>${e(t.name)}</b><small class="muted">${e(t.detail)}</small></td><td dir="ltr" data-label="שינוי בתיק" class="${t.change<0?'negative':''}">${t.change<0?'−':''}${money(Math.abs(t.change))}</td><td dir="ltr" data-label="מהתיק" class="${t.change<0?'negative':''}">${pct(t.share)}</td><td dir="ltr" data-label="שווי נקי אחרי">${money(t.netWorthAfter)}</td><td data-label="בחודשי הוצאות">${t.months==null?'—':`${Math.abs(t.months).toLocaleString('he-IL',{maximumFractionDigits:1})} חודשים`}</td></tr>`).join('')}</tbody></table></div>
  <p class="muted small">התרחישים משתמשים ברגישות משוערת של כל תחום לשוק המניות (למשל טכנולוגיה ×1.3, אג״ח ×0.15, קריפטו ×2.2). אפשר לקבוע תחום לכל נכס בעריכת הנכס.</p>`,'risk-card');
}

// ---------- Quick update from a broker report ----------
const holdingsImport={result:null,container:'*'};
const flagText={agorot:'הומר מאגורות לשקלים',quantity:'הכמות בדוח שונה — רשום קנייה או מכירה',jump:'שינוי חריג — כדאי לבדוק'};
function openHoldingsImport(){
  holdingsImport.result=null;
  showDialog('עדכון מהיר מדוח בית ההשקעות',`<form id="holdings-form"><div class="form-error"></div><p class="confirm-text">העתק את טבלת האחזקות מאתר בית ההשקעות או מ־Excel והדבק כאן, או בחר קובץ CSV / Excel. נזהה את הנכסים ונציג את השינויים לבדיקה לפני שהם נכנסים לעדכון.</p>${investAccounts(data).length>1?`<div class="form-grid">${field('מאיזה חשבון הדוח?',select('container',[['*','כל החשבונות'],...investAccounts(data).map(a=>[a.id,a.name])],holdingsImport.container??'*'),'נתאים רק לנכסים שבחשבון הזה','full')}</div>`:''}${field('טבלת האחזקות',`<textarea name="report" rows="8" dir="auto" placeholder="שם נייר	סימול	כמות	שער	שווי&#10;Vanguard S&amp;P 500	VOO	60	541.20	32,472"></textarea>`,'','full')}<div class="import-file-row"><label class="button">${icon('Upload',17)}<span>בחירת קובץ</span><input type="file" id="holdings-file" class="visually-hidden" accept=".csv,.tsv,.txt,.xlsx"></label><small class="muted">CSV, TSV או Excel (xlsx).${aiReady()?' יש רק צילום מסך? צרף אותו בשיחה עם Claude והוא יכין את העדכון.':''}</small></div><div class="form-actions">${submit('ניתוח הדוח','Search')}${btn('ביטול','dialog-close')}</div></form>`,true);
}
function analyzeHoldings(rows){
  const parsed=parseHoldingsRows(rows),box=document.querySelector('#holdings-form [name=container]');
  if(box)holdingsImport.container=box.value;
  if(!parsed.length)throw Error('לא מצאנו שורות עם מחירים או שווי. ודא שהעתקת גם את כותרות הטבלה.');
  const scope=holdingsImport.container&&holdingsImport.container!=='*'&&investAccounts(data).some(a=>a.id===holdingsImport.container)?holdingsImport.container:null;
  holdingsImport.result=matchHoldings(data,parsed,{accountId:scope});
  showHoldingsReview();
}
function showHoldingsReview(){
  const {matches,unmatched,missing}=holdingsImport.result;
  showDialog('בדיקת העדכון לפני החלה',`<div class="holdings-review">${matches.length?`<div class="table-wrap"><table><thead><tr><th aria-label="בחירה"></th><th>נכס</th><th>עכשיו</th><th>בדוח</th><th>שינוי</th></tr></thead><tbody>${matches.map((m,i)=>`<tr><td><input type="checkbox" data-holding="${i}" checked aria-label="לעדכן את ${e(m.asset.name)}"></td><td><b>${e(m.asset.name)}</b><small class="muted">${m.field==='currentPrice'?'מחיר ליחידה':'שווי כולל'}${m.flags.length?' · '+m.flags.map(f=>flagText[f]).join(' · '):''}</small></td><td dir="ltr">${money(m.old,m.asset.currency,2)}</td><td dir="ltr"><b>${money(m.next,m.asset.currency,2)}</b></td><td dir="ltr" class="${m.change>=0?'positive':'negative'}">${m.change==null?'—':pctPrecise(m.change)}</td></tr>`).join('')}</tbody></table></div>`:notice('אף שורה בדוח לא הותאמה לנכס קיים באופק.','error')}
  ${unmatched.length?`<details class="import-notes"><summary>${unmatched.length} שורות לא זוהו</summary><p class="muted small">${unmatched.map(r=>e(r.name||r.symbol)).join(' · ')}</p><p class="small">נכס חדש מוסיפים במסך ההשקעות ואז מעדכנים שוב.</p></details>`:''}
  ${missing.length?`<p class="muted small">${missing.length} נכסים לא הופיעו בדוח ויישארו בערכם הנוכחי: ${missing.map(a=>e(a.ticker||a.name)).join(', ')}.</p>`:''}</div><div class="form-actions">${matches.length?btn(`החלה על העדכון החודשי`,'holdings-apply','Check','primary'):''}${btn('חזרה','holdings-import')}${btn('ביטול','dialog-close')}</div>`,true);
}
function applyHoldings(selected){
  const {matches}=holdingsImport.result,chosen=matches.filter((_,i)=>selected.includes(i));
  if(!chosen.length)throw Error('לא נבחרו נכסים לעדכון.');
  if(ui.page==='monthly')captureMonthly();
  initMonthly();
  for(const m of chosen)ui.monthly.values[m.asset.id]=m.next;
  ui.monthly.imported=chosen.map(m=>m.asset.id);
  closeDialog();
  if(ui.page==='monthly')render();else navigate('monthly');
  toast(`${chosen.length} נכסים עודכנו מהדוח. בדוק את השער, הוסף פעולות ושמור תמונת מצב.`);
}
async function readHoldingsFile(file){
  const buffer=new Uint8Array(await file.arrayBuffer());
  return isXlsx(buffer)?readXlsx(buffer):textToRows(new TextDecoder().decode(buffer));
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  try{
    const arg=action.includes(':')?action.slice(action.indexOf(':')+1):'';
    if(action.startsWith('container-new'))openContainer();
    else if(action.startsWith('container-edit:'))openContainer(arg);
    else if(action.startsWith('container-add:'))addToContainer(arg);
    else if(action.startsWith('container-remove:'))openContainerRemove(arg);
    else if(action==='holdings-import')openHoldingsImport();
    else if(action==='holdings-apply')applyHoldings([...document.querySelectorAll('[data-holding]')].filter(x=>x.checked).map(x=>+x.dataset.holding));
  }catch(err){toast(err.message,true);}
});
document.addEventListener('change',async event=>{
  if(event.target.id!=='holdings-file')return;
  const file=event.target.files[0];event.target.value='';
  if(!file)return;
  try{if(file.size>5*1024*1024)throw Error('הקובץ גדול מדי (עד 5MB).');analyzeHoldings(await readHoldingsFile(file));}
  catch(err){const box=document.querySelector('#holdings-form .form-error');if(box)box.innerHTML=notice(err.message,'error');else toast(err.message,true);}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='container-remove-form')return;
  event.preventDefault();
  try{removeContainer(event.target.dataset.container,String(new FormData(event.target).get('target')||''));}
  catch(err){const box=event.target.querySelector('.form-error');if(box)box.innerHTML=notice(err.message,'error');else toast(err.message,true);}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='holdings-form')return;
  event.preventDefault();
  try{const text=new FormData(event.target).get('report');if(!String(text||'').trim())throw Error('הדבק את טבלת האחזקות או בחר קובץ.');analyzeHoldings(textToRows(text));}
  catch(err){const box=event.target.querySelector('.form-error');if(box)box.innerHTML=notice(err.message,'error');}
});
