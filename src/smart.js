import {today,toILS,balances,portfolioValue,assetValue,monthlySummary,categorySpend,monthOffset,validDate} from './finance.js';

// Local intelligence: everything here runs offline, on the device, with no AI calls.

const txILS=(d,t)=>toILS(t.amount,t.currency||'ILS',t.fx||d.fx);
const clamp=(n,lo=0,hi=100)=>Math.max(lo,Math.min(hi,n));
export const daysInMonth=month=>new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).getUTCDate();

export function shiftDate(date,days){
  const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}

export function recentMonths(month,count){return Array.from({length:count},(_,i)=>monthOffset(month,-i-1));}

// Average monthly figures over the previous months that actually have data.
export function averageMonth(d,month,count=3){
  const rows=recentMonths(month,count).map(m=>monthlySummary(d,m)).filter(s=>s.income||s.expenses);
  if(!rows.length)return {income:0,expenses:0,saved:0,rate:null,months:0};
  const income=rows.reduce((s,r)=>s+r.income,0)/rows.length,expenses=rows.reduce((s,r)=>s+r.expenses,0)/rows.length;
  return {income,expenses,saved:income-expenses,rate:income>0?(income-expenses)/income:null,months:rows.length};
}

export function healthScore(d,month){
  const b=balances(d),current=monthlySummary(d,month),avg=averageMonth(d,month,3);
  const income=avg.months?avg.income:current.income,expenses=avg.months?avg.expenses:current.expenses;
  const rate=income>0?(income-expenses)/income:null;
  const liquid=b.cash+b.savings,cover=expenses>0?liquid/expenses:null;
  const debtRatio=b.total>0?b.debt/b.total:b.debt>0?1:0;
  const budgets=d.budgets.map(x=>categorySpend(d,x.category,month)<=x.limit);
  const overall=current.expenses<=d.overallBudget;
  const adherence=(budgets.filter(Boolean).length+(overall?1:0))/(budgets.length+1);
  const values=d.assets.map(a=>toILS(assetValue(a),a.currency,d.fx)).filter(v=>v>0),invested=values.reduce((s,v)=>s+v,0);
  const maxShare=invested>0?Math.max(...values)/invested:null;
  const factors=[
    {key:'savings',label:'שיעור חיסכון',weight:30,score:rate==null?0:clamp(rate/.3*100),value:rate,
      tip:rate==null?'הוסף הכנסות והוצאות כדי למדוד את שיעור החיסכון.':rate>=.2?'שיעור חיסכון מצוין. שקול להפנות את העודף להשקעה לטווח ארוך.':'יעד טוב הוא לחסוך לפחות 20% מההכנסה. התחל מקטגוריה אחת לצמצום.'},
    {key:'emergency',label:'כרית ביטחון',weight:25,score:cover==null?0:clamp(cover/6*100),value:cover,
      tip:cover==null?'אין עדיין נתוני הוצאות לחישוב.':cover>=6?'יש לך כרית של חצי שנה ומעלה. מעבר לכך, כסף נזיל עשוי להישחק באינפלציה.':`כדאי להגיע ל־6 חודשי הוצאות בכסף נזיל. חסרים כ־${Math.max(0,Math.round(6*expenses-liquid)).toLocaleString('he-IL')} ₪.`},
    {key:'debt',label:'מינוף וחובות',weight:15,score:clamp(100-debtRatio*250),value:debtRatio,
      tip:debtRatio<.1?'רמת החוב נמוכה ביחס לנכסים.':'החובות מהווים חלק משמעותי מהנכסים. פירעון חוב בריבית גבוהה הוא תשואה בטוחה.'},
    {key:'budget',label:'עמידה בתקציב',weight:15,score:clamp(adherence*100),value:adherence,
      tip:adherence>=1?'כל התקציבים בשליטה החודש.':'יש תקציבים שחרגו החודש. בדוק את הקטגוריות המסומנות באדום.'},
    {key:'diversification',label:'פיזור השקעות',weight:15,score:maxShare==null?35:clamp((1-maxShare)/.7*100),value:maxShare,
      tip:maxShare==null?'עוד אין השקעות במעקב. השקעה מפוזרת לטווח ארוך בונה הון.':maxShare>.6?'נכס יחיד מהווה יותר מ־60% מהתיק. פיזור רחב יותר מקטין סיכון.':'התיק מפוזר בין כמה נכסים.'}
  ];
  const score=Math.round(factors.reduce((s,f)=>s+f.score*f.weight,0)/factors.reduce((s,f)=>s+f.weight,0));
  const grade=score>=85?'מצוין':score>=70?'טוב מאוד':score>=55?'טוב':score>=40?'בינוני':'דורש תשומת לב';
  return {score,grade,factors,liquid,cover,rate,debtRatio};
}

const normalizeText=s=>String(s||'').toLowerCase().replace(/[0-9.,:/\\#*"'״׳()\-]+/g,' ').replace(/\s+/g,' ').trim();

// Charges that repeat at a similar amount in at least three different months.
export function detectRecurring(d,month,lookback=6){
  const months=new Set([month,...recentMonths(month,lookback-1)]),groups=new Map();
  for(const t of d.transactions){
    if(t.type!=='expense'||!months.has(t.date.slice(0,7)))continue;
    const key=(normalizeText(t.description)||'—')+'|'+t.category;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(t);
  }
  const result=[];
  for(const list of groups.values()){
    const byMonth=new Map();
    for(const t of list)byMonth.set(t.date.slice(0,7),(byMonth.get(t.date.slice(0,7))||0)+txILS(d,t));
    if(byMonth.size<3||list.length>byMonth.size*2)continue;
    const amounts=[...byMonth.values()],average=amounts.reduce((s,n)=>s+n,0)/amounts.length;
    const spread=Math.max(...amounts.map(a=>Math.abs(a/average-1)));
    if(spread>.15)continue;
    const last=[...list].sort((a,b)=>b.date.localeCompare(a.date))[0];
    result.push({name:last.description||last.category,category:last.category,average,annual:average*12,months:byMonth.size,lastDate:last.date,nextDate:nextMonthlyDate(last.date),stable:spread<=.02,automatic:list.some(t=>t.recurring||t.recurringParent)});
  }
  return result.sort((a,b)=>b.average-a.average);
}

export function nextMonthlyDate(date){
  const [y,m,day]=date.split('-').map(Number),next=new Date(Date.UTC(y,m,1)),last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();
  next.setUTCDate(Math.min(day,last));return next.toISOString().slice(0,10);
}

// Unusual single expenses and categories that spike against their own history.
export function detectAnomalies(d,month){
  const history=recentMonths(month,6),items=[];
  for(const t of d.transactions.filter(t=>t.type==='expense'&&t.date.startsWith(month))){
    const past=d.transactions.filter(x=>x.type==='expense'&&x.category===t.category&&history.includes(x.date.slice(0,7))).map(x=>txILS(d,x));
    if(past.length<4)continue;
    const mean=past.reduce((s,n)=>s+n,0)/past.length,sd=Math.sqrt(past.reduce((s,n)=>s+(n-mean)**2,0)/past.length),amount=txILS(d,t);
    if(amount>mean+2.5*sd&&amount>mean*1.5&&amount-mean>50)items.push({kind:'transaction',id:t.id,title:t.description||t.category,category:t.category,amount,typical:mean,ratio:amount/mean,date:t.date});
  }
  for(const category of d.categories){
    const current=categorySpend(d,category,month),past=history.slice(0,3).map(m=>categorySpend(d,category,m)).filter(n=>n>0);
    if(past.length<2)continue;
    const avg=past.reduce((s,n)=>s+n,0)/past.length;
    if(current>avg*1.4&&current-avg>150)items.push({kind:'category',title:category,category,amount:current,typical:avg,ratio:current/avg});
  }
  return items.sort((a,b)=>b.ratio-a.ratio);
}

// End-of-month projection: actual spend so far + what usually happens in the rest of the month.
export function monthPace(d,month,now=today()){
  const days=daysInMonth(month),spent=monthlySummary(d,month).expenses,currentMonth=now.slice(0,7);
  if(month!==currentMonth)return {spent,projected:spent,elapsed:month<currentMonth?days:0,days,complete:month<currentMonth,budget:d.overallBudget,method:'actual'};
  const elapsed=Number(now.slice(8,10)),rest=[];
  for(const m of recentMonths(month,3)){
    const tx=d.transactions.filter(t=>t.type==='expense'&&t.date.startsWith(m));
    if(!tx.length)continue;
    const cutoff=Math.round(elapsed/days*daysInMonth(m));
    rest.push(tx.filter(t=>Number(t.date.slice(8,10))>cutoff).reduce((s,t)=>s+txILS(d,t),0));
  }
  const projected=rest.length?spent+rest.reduce((s,n)=>s+n,0)/rest.length:elapsed?spent/elapsed*days:spent;
  return {spent,projected,elapsed,days,complete:false,budget:d.overallBudget,method:rest.length?'history':'linear'};
}

// Deterministic PRNG so simulations are stable between renders.
export function seededRandom(seed=42){
  let a=seed>>>0;
  return ()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}

// Monte Carlo of a portfolio with monthly contributions. Values are in today's money (real terms).
export function monteCarlo({start=0,monthly=0,years=20,annualReturn=.07,volatility=.15,inflation=.025,runs=1000,target=null,seed=7}={}){
  if(![start,monthly,years,annualReturn,volatility,inflation].every(Number.isFinite))throw new Error('יש להזין ערכים מספריים לסימולציה.');
  years=Math.max(1,Math.min(60,Math.round(years)));runs=Math.max(50,Math.min(5000,Math.round(runs)));
  const random=seededRandom(seed),months=years*12;
  const mu=Math.log(1+annualReturn)/12-volatility**2/24,sigma=volatility/Math.sqrt(12),deflate=Math.log(1+inflation)/12;
  const yearly=Array.from({length:years+1},()=>new Float64Array(runs));
  let hits=0;
  for(let r=0;r<runs;r++){
    let value=start;yearly[0][r]=start;let reached=target!=null&&start>=target;
    for(let m=1;m<=months;m++){
      const u1=random()||1e-12,u2=random(),z=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
      value=value*Math.exp(mu+sigma*z-deflate)+monthly;
      if(m%12===0)yearly[m/12][r]=value;
    }
    if(target!=null&&(reached||value>=target))hits++;
  }
  const pick=(arr,p)=>{const s=[...arr].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.max(0,Math.floor(p*(s.length-1))))];};
  const points=yearly.map((arr,year)=>({year,p10:pick(arr,.1),p50:pick(arr,.5),p90:pick(arr,.9),contributed:start+monthly*12*year}));
  return {points,final:points.at(-1),probability:target==null?null:hits/runs,runs,years};
}

export const fireNumber=(annualExpenses,withdrawalRate=.04)=>withdrawalRate>0?annualExpenses/withdrawalRate:null;

// Years until a target is reached with deterministic growth (real terms); null if never within 100 years.
export function yearsToTarget(start,monthly,target,annualReturn=.07,inflation=.025){
  if(start>=target)return 0;
  const r=(1+annualReturn)/(1+inflation),monthlyRate=Math.pow(r,1/12)-1;let value=start;
  for(let m=1;m<=1200;m++){value=value*(1+monthlyRate)+monthly;if(value>=target)return m/12;}
  return null;
}

// Future value of cutting a category by a percentage and investing the difference.
export function whatIfCut(d,category,percent,years=10,annualReturn=.06,month=today().slice(0,7)){
  const avg=recentMonths(month,3).reduce((s,m)=>s+categorySpend(d,category,m),0)/3,monthly=avg*percent/100,rate=Math.pow(1+annualReturn,1/12)-1,n=years*12;
  const future=rate?monthly*((1+rate)**n-1)/rate:monthly*n;
  return {category,average:avg,monthly,yearly:monthly*12,future,contributed:monthly*n,years};
}

// --- Category suggestions learned from the user's own history + a Hebrew keyword dictionary.
const KEYWORDS={
  'מסעדות':['קפה','מסעדה','מסעדת','פיצה','סושי','המבורגר','וולט','wolt','תן ביס','ארוחת','בורגר','שווארמה','פלאפל','בית קפה','ארומה','קפה קפה','לנדוור','גלידה','מאפה'],
  'קניות בסופר':['סופר','שופרסל','רמי לוי','ויקטורי','יוחננוף','מגה','אושר עד','טיב טעם','מכולת','ירקות','פירות','קניות שבועיות','am:pm','חצי חינם'],
  'דלק':['דלק','תדלוק','פז','סונול','דור אלון','דלק טן','yellow','ten'],
  'רכב':['מוסך','טסט','ביטוח רכב','חניה','חנייה','פנגו','סלופארק','צמיגים','כביש 6','רישוי'],
  'חשבונות':['חשמל','מים','ארנונה','אינטרנט','סלולר','פלאפון','סלקום','פרטנר','הוט','בזק','שכר דירה','שכירות','ועד בית','גז','yes'],
  'בריאות':['רופא','תרופות','תרופה','סופר פארם','בית מרקחת','קופת חולים','שיניים','רופא שיניים','משקפיים','טיפול'],
  'כושר':['חדר כושר','כושר','יוגה','פילאטיס','מנוי כושר','אימון','הולמס פלייס','ספורט'],
  'לימודים':['קורס','ספרים','ספר','שכר לימוד','אוניברסיטה','מכללה','סדנה','לימודים'],
  'מתנות':['מתנה','מתנות','יום הולדת','חתונה','בר מצווה','בת מצווה'],
  'נסיעות':['טיסה','מלון','רכבת','אוטובוס','מונית','גט','gett','רב קו','airbnb','booking','חופשה','נופש'],
  'קניות':['ביגוד','בגדים','נעליים','זארה','אמזון','amazon','עלי אקספרס','aliexpress','קסטרו','איקאה','ikea','אלקטרוניקה','שיין'],
  'בילויים':['סרט','קולנוע','הופעה','בר','מסיבה','נטפליקס','netflix','ספוטיפיי','spotify','דיסני','הצגה','פאב'],
  'משכורת':['משכורת','שכר','תלוש'],
  'השקעות':['השקעה','מניות','קרן סל','ברוקר'],
  'חיסכון':['חיסכון','פיקדון','קופת גמל']
};
const INCOME_WORDS=['משכורת','הכנסה','קיבלתי','החזר','בונוס','זיכוי','מענק','שכר','תלוש','החזר מס','פרילנס','מכרתי'];

export function suggestCategory(d,text,type='expense'){
  const q=normalizeText(text);if(!q)return null;
  const words=q.split(' ').filter(w=>w.length>1),scores=new Map();
  const add=(cat,n)=>{if(d.categories.includes(cat))scores.set(cat,(scores.get(cat)||0)+n);};
  for(const t of d.transactions){
    if(t.type!==type)continue;
    const desc=normalizeText(t.description);if(!desc)continue;
    if(desc===q)add(t.category,6);
    else for(const w of words)if(desc.split(' ').includes(w))add(t.category,1.5);
  }
  for(const [cat,list] of Object.entries(KEYWORDS))for(const k of list)if(q.includes(k.toLowerCase()))add(cat,k.length>3?3:2);
  const best=[...scores.entries()].sort((a,b)=>b[1]-a[1])[0];
  return best?best[0]:null;
}

const HEB_NUMBERS={'אלף':1000,'אלפיים':2000,'מאה':100,'מאתיים':200,'חמישים':50,'עשרים':20,'שלושים':30,'ארבעים':40,'עשר':10};

// Parses free Hebrew text such as "קפה 18 אתמול במזומן" into a transaction draft.
export function parseQuickEntry(text,d,now=today()){
  const raw=String(text||'').trim();if(!raw)return null;
  let rest=' '+raw.replace(/₪/g,' ₪ ').replace(/\$/g,' $ ')+' ';
  let amount=null,currency='ILS',date=now,dateFound=false;
  const dateLike=rest.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)|(?:^|\s)(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?=\s)/);
  if(dateLike){
    const day=+(dateLike[1]||dateLike[4]),mon=+(dateLike[2]||dateLike[5]),explicit=dateLike[3]||dateLike[6];let year=explicit?+explicit:+now.slice(0,4);if(year<100)year+=2000;
    const candidate=`${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if(validDate(candidate)){date=!explicit&&candidate>now?`${year-1}${candidate.slice(4)}`:candidate;dateFound=true;rest=rest.replace(dateLike[0],' ');}
  }
  const num=rest.match(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k|K|אלף)?/);
  if(num){amount=Number(num[1].replace(/,/g,'')+(num[2]?'.'+num[2]:''))*(num[3]?1000:1);rest=rest.replace(num[0],' ');}
  else for(const [word,value] of Object.entries(HEB_NUMBERS))if(new RegExp(`(^|\\s)${word}(\\s|$)`).test(rest)){amount=value;rest=rest.replace(word,' ');break;}
  if(/\$|דולר|usd/i.test(rest)){currency='USD';rest=rest.replace(/\$|דולרים|דולר|usd/gi,' ');}
  rest=rest.replace(/₪|שקלים|שקל|ש"ח|ש״ח|ils/gi,' ');
  const rel=[[/(^|\s)היום(\s|$)/,0],[/(^|\s)אתמול(\s|$)/,-1],[/(^|\s)שלשום(\s|$)/,-2]];
  for(const [re,offset] of rel)if(re.test(rest)){date=shiftDate(now,offset);dateFound=true;rest=rest.replace(re,' ');break;}
  const ago=rest.match(/לפני\s+(\d+)\s+(ימים|יום|שבועות|שבוע)/);
  if(ago){date=shiftDate(now,-Number(ago[1])*(ago[2].startsWith('שבוע')?7:1));dateFound=true;rest=rest.replace(ago[0],' ');}
  const days=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const dayMatch=rest.match(/(?:ביום|יום)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|(^|\s)ב?(שבת)(\s|$)/);
  if(dayMatch&&!dateFound){
    const target=days.indexOf(dayMatch[1]||dayMatch[3]),cur=new Date(now+'T12:00:00Z').getUTCDay();
    date=shiftDate(now,-(((cur-target)+7)%7||7));dateFound=true;rest=rest.replace(dayMatch[0],' ');
  }
  let account=null;
  const usable=d.accounts.filter(a=>!['investment','debt'].includes(a.kind));
  for(const a of [...usable].sort((x,y)=>y.name.length-x.name.length)){
    if(a.name&&rest.includes(a.name)){account=a;rest=rest.replace(new RegExp('ב?'+a.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),' ');break;}
  }
  if(!account&&/(^|\s)ב?מזומן(\s|$)/.test(rest)){account=usable.find(a=>a.kind==='cash')||null;rest=rest.replace(/(^|\s)ב?מזומן(\s|$)/,' ');}
  if(!account&&/(^|\s)(ב?אשראי|בכרטיס)(\s|$)/.test(rest)){account=usable.find(a=>a.kind==='bank')||null;rest=rest.replace(/(^|\s)(ב?אשראי|בכרטיס)(\s|$)/,' ');}
  account ||=usable.find(a=>a.kind==='bank'&&a.currency===currency)||usable.find(a=>a.kind==='bank')||usable[0]||null;
  const lower=raw.toLowerCase(),type=INCOME_WORDS.some(w=>lower.includes(w))?'income':'expense';
  const description=rest.replace(/(^|\s)(על|עבור|שילמתי|הוצאתי|קניתי|ב|ל)(?=\s)/g,' ').replace(/\s+/g,' ').trim();
  const category=suggestCategory(d,description||raw,type)||(type==='income'?(d.categories.includes('משכורת')?'משכורת':d.categories[0]):d.categories.includes('קניות')?'קניות':d.categories[0]);
  return {type,amount,currency,date,category,accountId:account?.id||'',description,valid:amount>0&&!!account,dateFound};
}

// Compact monthly series used by charts and by the AI context.
export function monthlySeries(d,month,count=6){
  return Array.from({length:count},(_,i)=>monthOffset(month,i-count+1)).map(m=>({month:m,...monthlySummary(d,m)}));
}

export function netWorthNow(d){return balances(d).net;}
export function investableNow(d){const b=balances(d);return b.savings+portfolioValue(d);}
