export const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const today = () => new Date().toISOString().slice(0,10);
// Intl's he-IL text ("\u200f18,500 \u200f₪") carries bidi marks that, inside the left-to-right amount boxes,
// push a gap in front of the number and glue the ₪ to it. Drop them, and wrap the amount in a left-to-right
// isolate (U+2066 … U+2069) so it reads "6,000 ₪" everywhere: in amount boxes and inside Hebrew sentences alike.
// A negative amount keeps an LRM so "−250 ₪" stays together. Text that leaves the HTML UI (share text,
// clipboard, notifications, prompts) goes through plainText() to drop the isolate marks.
export const LRI='\u2066',PDI='\u2069';
export const plainText=v=>String(v??'').replace(/[\u2066-\u2069]/g,'');
export const money = (n,c='ILS',digits=0) => {
  const value=Number.isFinite(+n)?+n:0,rounded=Math.round(value*10**digits)/10**digits;
  const text=new Intl.NumberFormat('he-IL',{style:'currency',currency:c,maximumFractionDigits:digits,minimumFractionDigits:digits}).format(rounded||0).replace(/[\u200e\u200f]/g,'');
  return LRI+(text.startsWith('-')?'\u200e−'+text.slice(1):text)+PDI;
};
// An amount that is taken off, e.g. "−1,200 ₪" (nothing to take off reads "0 ₪", not "−0 ₪"). The minus sits
// inside the isolate, so it stays on the number's left in Hebrew sentences too.
export const minusMoney = (n,c='ILS',digits=0) => Math.abs(+n)>=(digits?10**-digits/2:.5)?money(-Math.abs(+n),c,digits):money(0,c,digits);
// Percentages: whole numbers from 10% up (43%), one decimal below that (8.9%, 0.9%).
const percentText=(n,digits)=>{
  if(n==null||!Number.isFinite(n))return 'אין מספיק נתונים';
  const text=new Intl.NumberFormat('he-IL',{style:'percent',maximumFractionDigits:Math.abs(digits),minimumFractionDigits:digits<0?-digits:0}).format(n).replace(/[\u200e\u200f]/g,'');
  return text.startsWith('-')?(/^-0(\.0+)?%$/.test(text)?'0%':'\u200e−'+text.slice(1)):text;
};
export const pct = n => percentText(n,Number.isFinite(n)&&Math.abs(n)>=.1?0:1);
// Two decimals where precision is the point: returns, XIRR, benchmark gaps, fees.
// Two fixed decimals (a negative digits value means "exactly"), so a column of returns lines up: 15.00%, 16.04%.
export const pctPrecise = n => percentText(n,-2);
export const dateLabel = d => new Date(d+'T12:00:00').toLocaleDateString('he-IL');
export const monthLabel = m => new Date(m+'-01T12:00:00').toLocaleDateString('he-IL',{month:'long',year:'numeric'});
export const toILS=(n,c,fx)=>Number(n)*(c==='USD'?fx:1);
export const assetValue=a=>a.mode==='value'?Number(a.currentValue):Number(a.quantity)*Number(a.currentPrice);
export const portfolioValue=d=>d.assets.reduce((s,a)=>s+toILS(assetValue(a),a.currency,d.fx),0)+(d.wallets.ILS||0)+(d.wallets.USD||0)*d.fx;
// 4.1 types and account kinds (§A.3). A transfer moves money between the user's own accounts and is never
// income or spending; a refund is money back for an expense and lowers spending in its category.
export const TX_TYPES=['income','expense','refund','transfer'];
export const TX_TYPE_LABELS={income:'הכנסה',expense:'הוצאה',refund:'החזר',transfer:'העברה'};
export const ACCOUNT_KINDS=['bank','cash','savings','investment','debt','credit','deposit'];
export const LIABILITY_KINDS=['debt','credit'];                       // balance = owed
export const LIQUID_KINDS=['bank','cash'];                            // forecast start, safe-to-spend cash side
export const FREE_KINDS=['bank','cash','savings'];                    // free money (unchanged set)
export const TX_KINDS=['bank','cash','savings','credit','deposit'];   // accept income/expense/refund
export const TRANSFER_FROM_KINDS=['bank','cash','savings','credit','deposit'];
export const TRANSFER_TO_KINDS=['bank','cash','savings','credit','deposit','debt'];
export const GOAL_LINK_KINDS=['bank','cash','savings','deposit','investment'];
export const PORTFOLIO_LINK_KINDS=['bank','cash','savings'];          // investment deposit/withdrawal accounts
export const isLiability=a=>LIABILITY_KINDS.includes(a?.kind);
export const accountsOf=(d,kinds)=>d.accounts.filter(a=>kinds.includes(a.kind));
export const amountILS=(d,t)=>toILS(t.amount,t.currency||'ILS',t.fx||d.fx);
export const spendILS=(d,t)=>t.type==='expense'?amountILS(d,t):t.type==='refund'?-amountILS(d,t):0;
// Net worth includes the restricted deposit and subtracts what cards and loans owe; `debt` stays loans only.
export const balances=d=>{const sum=kinds=>d.accounts.filter(a=>kinds.includes(a.kind)).reduce((s,a)=>s+toILS(a.balance,a.currency,d.fx),0);const cash=sum(LIQUID_KINDS),savings=sum(['savings']),restricted=sum(['deposit']),debt=sum(['debt']),credit=sum(['credit']),investments=portfolioValue(d),total=cash+savings+restricted+investments,liabilities=debt+credit;return {cash,savings,restricted,investments,debt,credit,liabilities,total,net:total-liabilities};};
export const externalFlow=a=>['deposit','withdrawal','distribution','opening'].includes(a.type)?(a.type==='withdrawal'||a.type==='distribution'?-1:1)*toILS(a.amount,a.currency,a.fx):0;
export function dietz(start,end,activities){if(!start||!end||end.date<=start.date)return {profit:null,return:null,flows:0};const duration=new Date(end.date)-new Date(start.date);const flows=activities.filter(a=>a.date>start.date&&a.date<=end.date&&externalFlow(a)!==0);const net=flows.reduce((s,a)=>s+externalFlow(a),0);const weighted=flows.reduce((s,a)=>s+externalFlow(a)*(new Date(end.date)-new Date(a.date))/duration,0);const profit=end.value-start.value-net;const denominator=start.value+weighted;return {profit,return:denominator>0?profit/denominator:null,flows:net};}
export function xirr(flows){if(flows.length<2||!flows.some(f=>f.amount<0)||!flows.some(f=>f.amount>0))return null;const sorted=[...flows].sort((a,b)=>a.date.localeCompare(b.date));const first=new Date(sorted[0].date);const years=sorted.map(f=>(new Date(f.date)-first)/(365*86400000));if(Math.max(...years)<=0)return null;const f=x=>sorted.reduce((s,v,i)=>s+v.amount*Math.exp(-x*years[i]),0);let brackets=[];let prevX=-20,prev=f(prevX);for(let x=-19.9;x<=20.001;x+=.1){const v=f(x);if(Number.isFinite(prev)&&Number.isFinite(v)&&prev*v<0)brackets.push([prevX,x]);prevX=x;prev=v;}if(brackets.length!==1)return null;let [lo,hi]=brackets[0];for(let i=0;i<160;i++){const mid=(lo+hi)/2;if(f(lo)*f(mid)<=0)hi=mid;else lo=mid;}const result=Math.expm1((lo+hi)/2);return Number.isFinite(result)?result:null;}
export function performance(d,startDate,endDate){const snaps=[...d.snapshots].sort((a,b)=>a.date.localeCompare(b.date));const end=snaps.filter(s=>s.date<=endDate).at(-1);const start=snaps.filter(s=>s.date<=startDate).at(-1)||snaps[0];if(!start||!end||start.date>=end.date)return {start,end,profit:null,return:null,annual:null,series:[],benchmarks:{}};const selected=snaps.filter(s=>s.date>=start.date&&s.date<=end.date);const result=dietz(start,end,d.activities);let compounded=1;let valid=true;const series=selected.map((s,i)=>{if(i){const r=dietz(selected[i-1],s,d.activities).return;if(r==null)valid=false;else compounded*=1+r;}const b={};for(const name of ['sp500','ta125']){const v=s.benchmarks?.[name],base=start.benchmarks?.[name];b[name]=v>0&&base>0?(name==='sp500'?((v*s.fx)/(base*start.fx)-1)*100:(v/base-1)*100):null;}const accumulated=dietz(start,s,d.activities);return {date:s.date,label:new Date(s.date+'T12:00:00').toLocaleDateString('he-IL',{month:'short',year:'2-digit'}),value:s.value,net:s.netWorth,profit:i?accumulated.profit:0,portfolio:valid?(compounded-1)*100:null,...b};});const investorFlows=[{date:start.date,amount:-start.value},...d.activities.filter(a=>a.date>start.date&&a.date<=end.date&&externalFlow(a)).map(a=>({date:a.date,amount:-externalFlow(a)})),{date:end.date,amount:end.value}];return {start,end,...result,return:valid?compounded-1:null,annual:xirr(investorFlows),series,benchmarks:{sp500:series.at(-1)?.sp500,ta125:series.at(-1)?.ta125}};}
export function rangeStart(end,period){const date=new Date(end+'T12:00:00');if(period==='all')return '1900-01-01';if(period==='ytd')return `${date.getFullYear()-1}-12-31`;const day=date.getDate();date.setDate(1);date.setMonth(date.getMonth()-Number(period));date.setDate(Math.min(day,new Date(date.getFullYear(),date.getMonth()+1,0).getDate()));return date.toISOString().slice(0,10);}
// Expenses are net of refunds (a refund lowers spending); transfers count nowhere.
export function monthlySummary(d,month){let income=0,gross=0,refunds=0;for(const t of d.transactions){if(!t.date.startsWith(month))continue;const v=amountILS(d,t);if(t.type==='income')income+=v;else if(t.type==='expense')gross+=v;else if(t.type==='refund')refunds+=v;}const expenses=gross-refunds;return {income,expenses,saved:income-expenses,rate:income>0?(income-expenses)/income:null,refunds,grossExpenses:gross};}
// Net spending in a category: expenses minus refunds. It can be negative; UI bars clamp with Math.max(0,…).
export const categorySpend=(d,category,month)=>d.transactions.filter(t=>t.category===category&&t.date.startsWith(month)).reduce((s,t)=>s+spendILS(d,t),0);
export function monthOffset(month,offset){const date=new Date(month+'-01T12:00:00');date.setMonth(date.getMonth()+offset);return date.toISOString().slice(0,7);}
export function budgetComparison(d,category,month,count){return Array.from({length:count},(_,i)=>categorySpend(d,category,monthOffset(month,-i-1))).reduce((s,n)=>s+n,0)/count;}
// The one sign table (§B.1). How much transaction t changes account a's balance (in a's currency) when applied
// once. Asset accounts hold money; liability accounts (credit, debt) hold what you owe.
export function accountDelta(d,a,t){
  const fx=Number(t.fx)||d.fx,inAccount=(amount,currency)=>currency===a.currency?Number(amount):toILS(amount,currency,fx)/(a.currency==='USD'?fx:1);
  const owes=isLiability(a);
  if(t.type==='transfer'){
    let delta=0;
    if(t.accountId===a.id){const out=inAccount(t.amount,t.currency||a.currency);delta+=owes?out:-out;}   // cash advance raises what a card owes
    if(t.toAccountId===a.id)delta+=owes?-Number(t.toAmount):Number(t.toAmount);                      // toAmount is already in a's currency
    return delta;
  }
  if(t.accountId!==a.id)return 0;
  const amount=inAccount(t.amount,t.currency||a.currency),comesIn=t.type==='income'||t.type==='refund';
  return owes?(comesIn?-amount:amount):(comesIn?amount:-amount);
}
export function applyTransaction(d,t,direction=1){
  if(!TX_TYPES.includes(t.type))throw new Error('סוג התנועה אינו תקין.');
  const from=d.accounts.find(a=>a.id===t.accountId);
  if(!from)throw new Error('יש לבחור חשבון תקין.');
  if(t.type==='transfer'){
    const to=d.accounts.find(a=>a.id===t.toAccountId);
    if(!to||to.id===from.id)throw new Error('יש לבחור חשבון יעד אחר מחשבון המקור.');
    if(!TRANSFER_FROM_KINDS.includes(from.kind)||!TRANSFER_TO_KINDS.includes(to.kind))throw new Error('אי אפשר להעביר כסף בין החשבונות האלה. הפקדה לתיק ההשקעות רושמים כפעולה בתיק.');
    if(!(Number(t.toAmount)>0))throw new Error('סכום ההעברה אינו תקין.');
    for(const a of [from,to])a.balance+=accountDelta(d,a,t)*direction;
    return;
  }
  if(!TX_KINDS.includes(from.kind))throw new Error('לתנועות רגילות יש לבחור חשבון בנק, מזומן, חיסכון, כרטיס אשראי או פיקדון. תשלום להלוואה רושמים כהעברה לחשבון ההלוואה.');
  from.balance+=accountDelta(d,from,t)*direction;
}
export function applyActivity(d,a){if(!(Number(a.amount)>0)||!Number.isFinite(Number(a.amount)))throw new Error('יש להזין סכום חיובי.');a.fx=Number(a.fx)||d.fx;if(!(a.fx>0)||!Number.isFinite(a.fx))throw new Error('שער הדולר אינו תקין.');a.id ||=uid();const asset=['buy','sell','dividend','distribution'].includes(a.type)?d.assets.find(x=>x.id===a.assetId):undefined;a.currency=asset?.currency||a.currency||'ILS';const amount=Number(a.amount);if(['deposit','withdrawal','distribution'].includes(a.type)&&a.accountId){const account=d.accounts.find(x=>x.id===a.accountId);if(!account||!PORTFOLIO_LINK_KINDS.includes(account.kind))throw new Error('חשבון המקור או היעד אינו תקין.');const transferred=toILS(amount,a.currency,a.fx)/(account.currency==='USD'?a.fx:1);if(a.type==='deposit'&&account.balance<transferred)throw new Error('אין מספיק יתרה בחשבון המקור.');a.linkedAmount=transferred;}const cash=d.wallets[a.currency]||0;if(['withdrawal','buy','fee'].includes(a.type)&&amount>cash+1e-6)throw new Error('אין מספיק מזומן בתיק. יש להזין הפקדה תחילה.');if(a.type==='deposit'||a.type==='dividend')d.wallets[a.currency]=cash+amount;if(['withdrawal','fee'].includes(a.type))d.wallets[a.currency]=cash-amount;if(['buy','sell'].includes(a.type)){if(!asset||asset.mode==='value')throw new Error('לקנייה או מכירה יש לבחור נכס שמנוהל לפי מחיר וכמות.');const quantity=Number(a.quantity);if(!(quantity>0))throw new Error('יש להזין כמות חיובית.');if(a.type==='sell'&&quantity>asset.quantity+1e-6)throw new Error('כמות המכירה גדולה מהכמות בתיק.');if(a.type==='buy'){asset.invested+=amount;asset.quantity+=quantity;asset.averagePrice=asset.quantity?asset.invested/asset.quantity:0;d.wallets[a.currency]=cash-amount;}else{const cost=asset.averagePrice*quantity;a.costBasis=cost;a.realizedProfit=amount-cost;asset.invested=Math.max(0,asset.invested-cost);asset.quantity=Math.max(0,asset.quantity-quantity);d.wallets[a.currency]=cash+amount;}}if(a.linkedAmount!=null){const account=d.accounts.find(x=>x.id===a.accountId);account.balance+=a.linkedAmount*(a.type==='deposit'?-1:1);}d.activities.push(a);return d;}
export function snapshot(d,date,benchmarks){return {id:uid(),date,value:portfolioValue(d),netWorth:balances(d).net,fx:d.fx,wallets:{...d.wallets},holdings:d.assets.map(a=>({id:a.id,value:assetValue(a),quantity:a.quantity,price:a.currentPrice,currency:a.currency})),benchmarks};}
export function validateData(d){if(!d||d.version!==1)throw new Error('קובץ הגיבוי אינו בפורמט של אופק.');for(const key of ['accounts','assets','transactions','activities','snapshots','budgets','goals','categories'])if(!Array.isArray(d[key]))throw new Error('קובץ הגיבוי חסר נתונים נדרשים.');if(!Number.isFinite(d.fx)||!(d.fx>0)||!d.wallets||!Number.isFinite(d.wallets.ILS)||!Number.isFinite(d.wallets.USD))throw new Error('נתוני המטבע אינם תקינים.');if(d.categories.some(c=>typeof c!=='string'||!c.trim())||!Number.isFinite(d.overallBudget)||d.overallBudget<0)throw new Error('נתוני הקטגוריות או יעד ההוצאות אינם תקינים.');const ids=new Set(d.accounts.map(a=>a.id));for(const a of d.accounts)if(!a.name||!ACCOUNT_KINDS.includes(a.kind)||!['ILS','USD'].includes(a.currency)||!Number.isFinite(a.balance)||(a.kind==='credit'&&!creditFieldsValid(d,a))||(a.kind==='deposit'&&!(a.releaseDate==null||a.releaseDate===''||validDate(a.releaseDate))))throw new Error('נתוני החשבונות אינם תקינים.');for(const t of d.transactions)if(typeof t.category!=='string'||(t.tags!=null&&(!Array.isArray(t.tags)||t.tags.some(v=>typeof v!=='string')))||!ids.has(t.accountId)||!Number.isFinite(t.amount)||!(t.amount>0)||!['ILS','USD'].includes(t.currency||'ILS')||!TX_TYPES.includes(t.type)||!validDate(t.date)||(t.fx!=null&&(!Number.isFinite(t.fx)||!(t.fx>0)))||!txShapeValid(d,t))throw new Error('נתוני התנועות אינם תקינים.');for(const a of d.assets)if(!a.id||!a.name||!['ILS','USD'].includes(a.currency)||![a.quantity,a.averagePrice,a.invested,a.currentPrice,a.currentValue].every(n=>Number.isFinite(n)&&n>=0))throw new Error('נתוני ההשקעות אינם תקינים.');if(new Set(d.snapshots.map(s=>s.date)).size!==d.snapshots.length)throw new Error('קובץ הגיבוי מכיל תמונות מצב עם תאריכים כפולים.');for(const list of [d.accounts,d.assets,d.transactions,d.activities,d.snapshots,d.budgets,d.goals])if(new Set(list.map(v=>v.id)).size!==list.length||list.some(v=>!v.id))throw new Error('מזהים חסרים או כפולים בקובץ הגיבוי.');for(const s of d.snapshots)if((s.holdings!=null&&!Array.isArray(s.holdings))||!validDate(s.date)||!Number.isFinite(s.value)||s.value<0||!Number.isFinite(s.netWorth)||!(s.fx>0))throw new Error('נתוני ההיסטוריה אינם תקינים.');for(const a of d.activities)if(!validDate(a.date)||!Number.isFinite(a.amount)||!(a.amount>0)||!Number.isFinite(a.fx)||!(a.fx>0)||!['ILS','USD'].includes(a.currency)||!['deposit','withdrawal','opening','buy','sell','dividend','distribution','fee'].includes(a.type))throw new Error('נתוני פעולות ההשקעה אינם תקינים.');for(const b of d.budgets)if(!b.category||!Number.isFinite(b.limit)||!(b.limit>0))throw new Error('נתוני התקציבים אינם תקינים.');for(const g of d.goals)if(!g.name||![g.saved,g.monthly].every(Number.isFinite)||(g.target!=null&&g.target!==''&&(!Number.isFinite(g.target)||g.target<=0))||!(g.saved>=0)||!(g.monthly>=0)||!validDate(g.date))throw new Error('נתוני היעדים אינם תקינים.');if(d.accounts.some(a=>a.kind==='debt'&&(![a.original,a.payment,a.interest].every(n=>Number.isFinite(n)&&n>=0)||a.original<a.balance)))throw new Error('נתוני ההלוואות אינם תקינים.');validateExtras(d);return d;}
// 4.1 additions to validateData (§A.8). Every check is conditional on a value 4.0 never wrote (P1).
const isPlainObject=v=>v!=null&&typeof v==='object'&&!Array.isArray(v);
function creditFieldsValid(d,a){return Number.isInteger(a.billingDay)&&a.billingDay>=1&&a.billingDay<=28&&((a.payFrom??'')===''||d.accounts.some(x=>x.id===a.payFrom&&x.kind==='bank'))&&(a.creditLimit==null||(Number.isFinite(a.creditLimit)&&a.creditLimit>0))&&(a.last4==null||a.last4===''||/^\d{4}$/.test(a.last4))&&(a.statementsThrough==null||validDate(a.statementsThrough));}
export const installmentShapeValid=i=>isPlainObject(i)&&typeof i.planId==='string'&&!!i.planId&&Number.isInteger(i.n)&&i.n>=1&&Number.isInteger(i.of)&&i.of>=i.n&&i.of<=60;
function txShapeValid(d,t){
  const kindOf=id=>d.accounts.find(a=>a.id===id)?.kind;
  if(t.type==='refund'&&(!TX_KINDS.includes(kindOf(t.accountId))||t.recurring||t.installment))return false;
  if(t.type==='transfer'&&(typeof t.toAccountId!=='string'||!d.accounts.some(a=>a.id===t.toAccountId)||t.toAccountId===t.accountId||!TRANSFER_FROM_KINDS.includes(kindOf(t.accountId))||!TRANSFER_TO_KINDS.includes(kindOf(t.toAccountId))||!Number.isFinite(t.toAmount)||!(t.toAmount>0)||t.recurring||t.installment))return false;
  if(t.installment!=null&&(t.type!=='expense'||!installmentShapeValid(t.installment)))return false;
  if(t.auto!=null&&(!isPlainObject(t.auto)||!['bill','card'].includes(t.auto.source)||typeof t.auto.ref!=='string'||!validDate(t.auto.date)||(t.auto.confirm!=null&&typeof t.auto.confirm!=='boolean')))return false;
  return t.goalId==null||typeof t.goalId==='string';
}
export function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d||'')&&!Number.isNaN(new Date(d).valueOf())&&new Date(d).toISOString().slice(0,10)===d;}
export function parseCSV(text){const rows=[];let row=[],cell='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}if(quote)throw new Error('קובץ CSV מכיל מרכאות לא סגורות.');row.push(cell);if(row.some(Boolean))rows.push(row);return rows;}
export const csvCell=v=>'"'+plainText(v).replaceAll('"','""')+'"';

export function assetProfit(d,a){const events=d.activities.filter(f=>f.assetId===a.id);const realized=events.filter(f=>f.type==='sell').reduce((s,f)=>s+(f.realizedProfit||0),0);const income=events.filter(f=>['dividend','distribution'].includes(f.type)).reduce((s,f)=>s+toILS(f.amount,f.currency,f.fx)/(a.currency==='USD'?f.fx:1),0);const fees=events.filter(f=>f.type==='fee').reduce((s,f)=>s+toILS(f.amount,f.currency,f.fx)/(a.currency==='USD'?f.fx:1),0);const invested=a.invested+events.filter(f=>f.type==='sell').reduce((s,f)=>s+(f.costBasis||0),0);const profit=assetValue(a)-a.invested+realized+income-fees;return {profit,realized,income,fees,invested,return:invested>0?profit/invested:null};}
export function assetPeriod(d,a,start,end){if(!start||!end||start.date>=end.date)return {profit:null,return:null};const first=start.holdings?.find(h=>h.id===a.id),last=end.holdings?.find(h=>h.id===a.id);const events=d.activities.filter(f=>f.assetId===a.id&&f.date>start.date&&f.date<=end.date);if(!last||(!first&&start.value>0&&!events.some(f=>f.type==='opening')))return {profit:null,return:null};const flows=events.filter(f=>['buy','sell','opening','dividend','distribution'].includes(f.type)).map(f=>({...f,type:['buy','opening'].includes(f.type)?'deposit':'withdrawal'}));const fees=events.filter(f=>f.type==='fee').reduce((s,f)=>s+toILS(f.amount,f.currency,f.fx),0);return dietz({date:start.date,value:first?toILS(first.value,first.currency,start.fx):0},{date:end.date,value:toILS(last.value,last.currency,end.fx)-fees},flows);}

// Optional collections added in 2.1: fixed payments, shared-expense groups and the wishlist.
export function validateExtras(d){
  const uniqueIds=list=>list.every(v=>v&&v.id)&&new Set(list.map(v=>v.id)).size===list.length;
  if(d.bills!=null&&(!Array.isArray(d.bills)||!uniqueIds(d.bills)||d.bills.some(b=>!b.name||!Number.isFinite(b.amount)||!(b.amount>0)||!Number.isInteger(b.day)||b.day<1||b.day>31||!['monthly','bimonthly','quarterly','yearly'].includes(b.frequency)||!['income','expense'].includes(b.type||'expense')||!['ILS','USD'].includes(b.currency||'ILS')||(b.startMonth!=null&&b.startMonth!==''&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.startMonth))||(b.paid!=null&&(!Array.isArray(b.paid)||b.paid.some(x=>!validDate(x))))||(b.active!=null&&typeof b.active!=='boolean')||(b.confirm!=null&&typeof b.confirm!=='boolean')||![b.pausedOn,b.endDate,b.recordedThrough].every(x=>x==null||validDate(x))||(b.waiting!=null&&(!Array.isArray(b.waiting)||!b.waiting.every(validDate))))))throw new Error('נתוני התשלומים הקבועים אינם תקינים.');
  if(d.groups!=null){
    if(!Array.isArray(d.groups)||!uniqueIds(d.groups))throw new Error('נתוני חלוקת ההוצאות אינם תקינים.');
    for(const g of d.groups){
      const members=new Set(Array.isArray(g.members)?g.members.map(m=>m.id):[]),expenses=g.expenses,settlements=g.settlements||[];
      const badShares=x=>x.split==='exact'&&(!x.shares||Object.keys(x.shares).some(id=>!members.has(id))||Object.values(x.shares).some(v=>!Number.isFinite(v)||v<0)||Math.abs(Object.values(x.shares).reduce((s,v)=>s+v,0)-x.amount)>.011);
      if(!g.name||!Array.isArray(g.members)||!g.members.length||members.size!==g.members.length||g.members.some(m=>!m.id||!m.name)||!Array.isArray(expenses)||!Array.isArray(settlements)||!uniqueIds(expenses)||!uniqueIds(settlements)||expenses.some(x=>!(x.amount>0)||!Number.isFinite(x.amount)||!members.has(x.paidBy)||!validDate(x.date)||(x.participants!=null&&(!Array.isArray(x.participants)||x.participants.some(p=>!members.has(p))))||badShares(x))||settlements.some(s=>!(s.amount>0)||!members.has(s.from)||!members.has(s.to)||s.from===s.to))throw new Error('נתוני חלוקת ההוצאות אינם תקינים.');
    }
  }
  if(d.goals.some(g=>g.allocation!=null&&(!Number.isFinite(g.allocation)||g.allocation<0)))throw new Error('הקצאות היעדים אינן תקינות.');
  const home=d.prefs?.home;
  if(d.prefs!=null&&(typeof d.prefs!=='object'||Array.isArray(d.prefs)||(home!=null&&(!Array.isArray(home.order)||!Array.isArray(home.hidden)||[...home.order,...home.hidden].some(v=>typeof v!=='string')))))throw new Error('העדפות התצוגה אינן תקינות.');
  // 4.1: installment plans, the after-discharge profile, the annual check and the creation date (§A.8).
  if(d.installments!=null){const planKinds=['bank','cash','savings','credit'];
    if(!Array.isArray(d.installments)||!uniqueIds(d.installments)||d.installments.some(p=>!planKinds.includes(d.accounts.find(a=>a.id===p.accountId)?.kind)||typeof p.description!=='string'||typeof p.category!=='string'||!p.category||!Number.isFinite(p.total)||!(p.total>0)||!Number.isInteger(p.count)||p.count<2||p.count>60||!validDate(p.purchaseDate)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.firstMonth||'')||!Number.isInteger(p.next)||p.next<1||p.next>p.count+1||!['ILS','USD'].includes(p.currency)||!Number.isFinite(p.fx)||!(p.fx>0)||(p.tags!=null&&(!Array.isArray(p.tags)||!p.tags.every(x=>typeof x==='string')))))throw new Error('נתוני העסקאות בתשלומים אינם תקינים.');}
  if((d.benefits!=null&&!isPlainObject(d.benefits))||(d.annualChecks!=null&&(!isPlainObject(d.annualChecks)||!Object.values(d.annualChecks).every(c=>isPlainObject(c)&&(c.done==null||validDate(c.done))&&(c.skip==null||typeof c.skip==='boolean'))))||(d.createdAt!=null&&!validDate(d.createdAt)))throw new Error('נתוני ההטבות או הבדיקות השנתיות אינם תקינים.');
  if(d.wishlist!=null&&(!Array.isArray(d.wishlist)||!uniqueIds(d.wishlist)||d.wishlist.some(w=>!w.name||!Number.isFinite(w.price)||!(w.price>0)||!validDate(w.added)||!['waiting','bought','skipped'].includes(w.status))))throw new Error('נתוני רשימת המשאלות אינם תקינים.');
}
