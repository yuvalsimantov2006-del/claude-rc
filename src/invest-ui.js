import {money,pct} from './finance.js';
import {palette} from './charts.js';
import {riskProfile,stressTest,historyRisk,STRESS_SCENARIOS,parseHoldingsRows,matchHoldings,SECTORS} from './invest.js';
import {readXlsx,isXlsx,textToRows} from './xlsx.js';
import {aiReady} from './ai.js';

// Investments: risk & diversification card and the quick update from a broker report.
// Built on the UI helpers and state from app.js.

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
  if(r.usdShare>.5)notes.push(`${pct(r.usdShare)} מהתיק חשוף לדולר. התחזקות של 10% בשקל תוריד כ־${money(r.usd*.1)} מהשווי בשקלים.`);
  const crypto=r.bySector.find(x=>x.name==='קריפטו');if(crypto&&crypto.share>.05)notes.push(`קריפטו מהווה ${pct(crypto.share)} מהתיק — נכס תנודתי במיוחד.`);
  if(r.effective>=4&&!notes.length)notes.push('התיק מפוזר בין כמה נכסים ותחומים. כדאי לבדוק את הפיזור מחדש בכל עדכון חודשי.');
  return card(head('סיכון ופיזור','לפי השווי הנוכחי של התיק · הערכה בלבד, לא ייעוץ השקעות',aiReady()?btn('ניתוח עם Claude','ai-prompt:risk','Sparkles'):'')+`
  <div class="risk-kpis">
    <div><span>הנכס הגדול</span><b>${e(r.largest?.name||'—')}</b><small>${pct(r.largest?.share||0)} מהתיק</small></div>
    <div><span>ריכוז</span><b>${badge(levelLabel,levelColor)}</b><small>כמו ${r.effective.toLocaleString('he-IL',{maximumFractionDigits:1})} נכסים שווים</small></div>
    <div><span>חשיפה לדולר</span><b dir="ltr">${pct(r.usdShare)}</b><small>${money(r.usd)}</small></div>
    <div><span>תנודתיות שנתית</span><b dir="ltr">${h?pct(h.annualVolatility):'—'}</b><small>${h?`ירידה מרבית ${pct(h.maxDrawdown)} · ${h.months} חודשים`:'נדרשות 3 תמונות מצב'}</small></div>
  </div>
  ${notes.length?`<ul class="risk-notes">${notes.map(n=>`<li>${e(n)}</li>`).join('')}</ul>`:''}
  <div class="risk-columns"><div><h3>לפי תחום</h3>${shareBars(r.bySector)}</div><div><h3>לפי סוג נכס</h3>${shareBars(r.byType)}<h3 class="risk-sub">לפי מטבע</h3>${shareBars([{name:'דולר',share:r.usdShare},{name:'שקל',share:1-r.usdShare}].filter(x=>x.share>0))}</div></div>
  <h3 class="risk-sub">מה יקרה לתיק אם…</h3>
  <div class="table-wrap"><table class="stress-table"><thead><tr><th>תרחיש</th><th>שינוי בתיק</th><th>מהתיק</th><th>שווי נקי אחרי</th><th>בחודשי הוצאות</th></tr></thead><tbody>${tests.map(t=>`<tr><td><b>${e(t.name)}</b><small class="muted">${e(t.detail)}</small></td><td dir="ltr" data-label="שינוי בתיק" class="${t.change<0?'negative':''}">${t.change<0?'−':''}${money(Math.abs(t.change))}</td><td dir="ltr" data-label="מהתיק">${pct(t.share)}</td><td dir="ltr" data-label="שווי נקי אחרי">${money(t.netWorthAfter)}</td><td data-label="בחודשי הוצאות">${t.months==null?'—':`${Math.abs(t.months).toLocaleString('he-IL',{maximumFractionDigits:1})} חודשים`}</td></tr>`).join('')}</tbody></table></div>
  <p class="muted small">התרחישים משתמשים ברגישות משוערת של כל תחום לשוק המניות (למשל טכנולוגיה ×1.3, אג״ח ×0.15, קריפטו ×2.2). אפשר לקבוע תחום לכל נכס בעריכת הנכס.</p>`,'risk-card');
}

// ---------- Quick update from a broker report ----------
const holdingsImport={result:null};
const flagText={agorot:'הומר מאגורות לשקלים',quantity:'הכמות בדוח שונה — רשום קנייה או מכירה',jump:'שינוי חריג — כדאי לבדוק'};
function openHoldingsImport(){
  holdingsImport.result=null;
  showDialog('עדכון מהיר מדוח בית ההשקעות',`<form id="holdings-form"><div class="form-error"></div><p class="confirm-text">העתק את טבלת האחזקות מאתר בית ההשקעות או מ־Excel והדבק כאן, או בחר קובץ CSV / Excel. נזהה את הנכסים ונציג את השינויים לבדיקה לפני שהם נכנסים לעדכון.</p>${field('טבלת האחזקות',`<textarea name="report" rows="8" dir="auto" placeholder="שם נייר	סימול	כמות	שער	שווי&#10;Vanguard S&amp;P 500	VOO	60	541.20	32,472"></textarea>`,'','full')}<div class="import-file-row"><label class="button">${icon('Upload',17)}<span>בחירת קובץ</span><input type="file" id="holdings-file" class="visually-hidden" accept=".csv,.tsv,.txt,.xlsx"></label><small class="muted">CSV, TSV או Excel (xlsx).${aiReady()?' יש רק צילום מסך? צרף אותו בשיחה עם Claude והוא יכין את העדכון.':''}</small></div><div class="form-actions">${submit('ניתוח הדוח','Search')}${btn('ביטול','dialog-close')}</div></form>`,true);
}
function analyzeHoldings(rows){
  const parsed=parseHoldingsRows(rows);
  if(!parsed.length)throw Error('לא מצאנו שורות עם מחירים או שווי. ודא שהעתקת גם את כותרות הטבלה.');
  holdingsImport.result=matchHoldings(data,parsed);
  showHoldingsReview();
}
function showHoldingsReview(){
  const {matches,unmatched,missing}=holdingsImport.result;
  showDialog('בדיקת העדכון לפני החלה',`<div class="holdings-review">${matches.length?`<div class="table-wrap"><table><thead><tr><th aria-label="בחירה"></th><th>נכס</th><th>עכשיו</th><th>בדוח</th><th>שינוי</th></tr></thead><tbody>${matches.map((m,i)=>`<tr><td><input type="checkbox" data-holding="${i}" checked aria-label="לעדכן את ${e(m.asset.name)}"></td><td><b>${e(m.asset.name)}</b><small class="muted">${m.field==='currentPrice'?'מחיר ליחידה':'שווי כולל'}${m.flags.length?' · '+m.flags.map(f=>flagText[f]).join(' · '):''}</small></td><td dir="ltr">${money(m.old,m.asset.currency,2)}</td><td dir="ltr"><b>${money(m.next,m.asset.currency,2)}</b></td><td dir="ltr" class="${m.change>=0?'positive':'negative'}">${m.change==null?'—':pct(m.change)}</td></tr>`).join('')}</tbody></table></div>`:notice('אף שורה בדוח לא הותאמה לנכס קיים באופק.','error')}
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
    if(action==='holdings-import')openHoldingsImport();
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
  if(event.target.id!=='holdings-form')return;
  event.preventDefault();
  try{const text=new FormData(event.target).get('report');if(!String(text||'').trim())throw Error('הדבק את טבלת האחזקות או בחר קובץ.');analyzeHoldings(textToRows(text));}
  catch(err){const box=event.target.querySelector('.form-error');if(box)box.innerHTML=notice(err.message,'error');}
});
