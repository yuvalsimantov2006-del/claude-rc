// Ledger 4.1: transfers, cards, installments (WS-LEDGER).
import {uid,today,money,toILS,monthOffset,validDate,csvCell,parseCSV,accountDelta,applyTransaction,accountsOf,amountILS,TX_TYPE_LABELS,TRANSFER_FROM_KINDS,TRANSFER_TO_KINDS,installmentShapeValid} from './finance.js';
import {hasAllocation} from './savings.js';

// Pure rules for the 4.1 ledger. No DOM. Private helpers use the lg prefix (money.js already declares
// onDay/round2/sumBy, smart.js shiftDate).
const lgRound=n=>Math.round(n*100)/100;
const lgDays=month=>new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).getUTCDate();
const lgOnDay=(month,day)=>`${month}-${String(Math.min(day,lgDays(month))).padStart(2,'0')}`;
const lgShift=(date,days)=>{const x=new Date(date+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+days);return x.toISOString().slice(0,10);};
const lgConvert=(amount,from,to,fx)=>from===to?amount:from==='USD'?amount*fx:amount/fx;
const lgAccount=(d,id)=>d.accounts.find(a=>a.id===id);

// ---------- Transfers (feature 2) ----------
const LG_KIND_ERROR='אי אפשר להעביר כסף בין החשבונות האלה. הפקדה לתיק ההשקעות רושמים כפעולה בתיק.';

// Builds a transfer row (not applied). `amount` is in the FROM account's currency; `toAmount` is what reaches the
// TO account, in its currency: the given value rounded to cents, or the amount converted at `fx`.
export function makeTransfer(d,{fromId,toId,amount,date=today(),fx,toAmount,description,goalId}={}){
  const from=lgAccount(d,fromId),to=lgAccount(d,toId),rate=Number(fx)||d.fx,value=Number(amount);
  const given=toAmount===''||toAmount==null?NaN:Number(toAmount);
  const credited=Number.isFinite(given)&&given>0?lgRound(given):from&&to&&value>0?lgRound(lgConvert(value,from.currency,to.currency,rate)):NaN;
  const t={id:uid(),type:'transfer',amount:value,currency:from?.currency||'ILS',fx:rate,date,category:'העברה',subcategory:'',accountId:fromId||'',toAccountId:toId||'',toAmount:credited,description:String(description||'').trim()||(to?`העברה ל${to.name}`:'העברה'),tags:[],recurring:false};
  if(goalId)t.goalId=goalId;
  return t;
}

// '' when the transfer can be saved, otherwise a Hebrew sentence. With `editing` (the stored row being edited),
// the old row's effect on the debt is added back before the cap is checked.
export function transferProblem(d,t,now=today()){
  const from=lgAccount(d,t.accountId),to=lgAccount(d,t.toAccountId);
  if(!from)return 'יש לבחור חשבון תקין.';
  if(!to||to.id===from.id)return 'יש לבחור חשבון יעד אחר מחשבון המקור.';
  if(!TRANSFER_FROM_KINDS.includes(from.kind)||!TRANSFER_TO_KINDS.includes(to.kind))return LG_KIND_ERROR;
  if(!(Number(t.amount)>0)||!Number.isFinite(Number(t.amount)))return 'יש להזין סכום חיובי.';
  if(!(Number(t.toAmount)>0)||!Number.isFinite(Number(t.toAmount)))return 'סכום ההעברה אינו תקין.';
  if(!(Number(t.fx)>0))return 'שער הדולר אינו תקין.';
  if(!validDate(t.date)||t.date>now)return 'יש להזין תאריך תקין שאינו בעתיד.';
  if(to.kind==='debt'){
    const owed=Number(to.balance)-(t.editing?accountDelta(d,to,t.editing):0);
    if(Number(t.toAmount)>owed+0.005)return `הסכום גבוה מיתרת החוב (${money(Math.max(0,owed),to.currency)}).`;
  }
  return '';
}

// "הפקדתי עכשיו" (§B.8 E12, §D.2). Mutates d. `amount` is in shekels.
// Linked goal: a transfer from an account into the goal's account, or (source outside Ofek) the balance-editor
// path: the account balance grows, no row. A fixed allocation grows by the amount.
// Unlinked goal: "כבר בחיסכון" grows; a transfer row only when both source and destination are accounts.
export function goalDeposit(d,goalId,{amount,fromId='outside',toId='',date}={},now=today()){
  const goal=d.goals.find(g=>g.id===goalId);if(!goal)throw new Error('היעד לא נמצא.');
  const ils=lgRound(Number(amount));if(!(ils>0))throw new Error('יש להזין סכום חיובי.');
  date ||=now;if(!validDate(date)||date>now)throw new Error('יש להזין תאריך תקין שאינו בעתיד.');
  const linked=goal.accountId?lgAccount(d,goal.accountId):null,outside=!fromId||fromId==='outside';
  let transaction=null;
  const transfer=(sourceId,destId)=>{const source=lgAccount(d,sourceId),dest=lgAccount(d,destId);if(!source||!dest)throw new Error('יש לבחור חשבון תקין.');
    const t=makeTransfer(d,{fromId:sourceId,toId:destId,amount:lgRound(lgConvert(ils,'ILS',source.currency,d.fx)),date,description:`הפקדה ל${goal.name}`,goalId:goal.id});
    const problem=transferProblem(d,t,now);if(problem)throw new Error(problem);applyTransaction(d,t);d.transactions.push(t);return t;};
  if(linked){
    if(linked.kind==='investment')throw new Error('יעד שמקושר לתיק ההשקעות מתעדכן דרך פעולת הפקדה בתיק.');
    if(outside){linked.balance=lgRound(linked.balance+lgConvert(ils,'ILS',linked.currency,d.fx));linked.balanceUpdated=now;}
    else transaction=transfer(fromId,linked.id);
    if(hasAllocation(goal))goal.allocation=lgRound(Number(goal.allocation)+ils);
  }else{
    if(!outside&&toId)transaction=transfer(fromId,toId);
    goal.saved=lgRound((Number(goal.saved)||0)+ils);
  }
  return {transaction};
}

// ---------- Sync guard, automatic rows and totals ----------
// True when the data holds anything a 4.0 device cannot read (§F.8).
export const hasV41Content=d=>d.accounts.some(a=>a.kind==='credit'||a.kind==='deposit')||d.transactions.some(t=>t.type==='refund'||t.type==='transfer'||t.auto!=null||t.installment!=null)||!!d.installments?.length;
// Rows of next that prev does not have, in date order.
export function addedRows(prev,next){const ids=new Set((prev?.transactions||[]).map(t=>t.id));return (next?.transactions||[]).filter(t=>!ids.has(t.id)).sort((a,b)=>a.date.localeCompare(b.date));}
export function autoRecordedMessage(rows){
  if(!rows?.length)return '';
  const name=t=>t.description||t.category;
  if(rows.length===1)return `נרשם אוטומטית: ${name(rows[0])} ${money(rows[0].amount,rows[0].currency||'ILS')}`;
  return `נרשמו אוטומטית ${rows.length} תנועות: ${name(rows[0])}, ${name(rows[1])}${rows.length>2?' ועוד':''}`;
}
// Totals for a list of transactions, in shekels: expenses are net of refunds; transfers are only counted.
export function txTotals(d,list){let income=0,gross=0,refunds=0,transfers=0;for(const t of list){if(t.type==='income')income+=amountILS(d,t);else if(t.type==='expense')gross+=amountILS(d,t);else if(t.type==='refund')refunds+=amountILS(d,t);else if(t.type==='transfer')transfers++;}return {income,expenses:gross-refunds,grossExpenses:gross,refunds,transfers};}

// ---------- CSV (§C.2.10) ----------
// Columns 1–13 are exactly the 4.0 ones; the 4.1 columns are appended, so 4.0 readers keep working.
const LG_CSV_HEADERS=['מזהה','תאריך','סוג','סכום','מטבע','קטגוריה','תת קטגוריה','חשבון','תיאור','תגיות','חוזרת','שער דולר','מזהה תנועה חוזרת','חשבון יעד','סכום ביעד','תשלום','מזהה עסקת תשלומים','מזהה יעד'];
export function transactionsCSV(d,list){
  const name=id=>lgAccount(d,id)?.name;
  const rows=list.map(t=>[t.id,t.date,TX_TYPE_LABELS[t.type]||t.type,t.amount,t.currency||'ILS',t.category,t.subcategory,name(t.accountId),t.description,t.tags?.join(','),t.recurring?'כן':'לא',t.fx||d.fx,t.recurringParent||'',t.type==='transfer'?name(t.toAccountId)||'':'',t.type==='transfer'?t.toAmount??'':'',t.installment?`${t.installment.n}/${t.installment.of}`:'',t.installment?.planId||'',t.goalId||'']);
  return [LG_CSV_HEADERS,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');
}
const LG_TYPE_BY_LABEL=Object.fromEntries(Object.entries(TX_TYPE_LABELS).map(([k,v])=>[v,k]));
// Rows in the "ofek-transactions" JSON shape (accountName/toAccountName instead of ids). A 4.0 file gives the 4.0 rows.
export function parseTransactionsCSV(d,text){
  const rows=parseCSV(String(text).replace(/^﻿/,'')),headers=rows.shift()||[];
  if(!['תאריך','סוג','סכום','חשבון','קטגוריה'].every(k=>headers.includes(k)))throw new Error('כותרות CSV אינן תואמות. השתמש בפורמט של קובץ התנועות המיוצא מאופק.');
  const get=(r,k)=>headers.includes(k)?r[headers.indexOf(k)]||'':'';
  return rows.map(r=>{
    const t={id:get(r,'מזהה')||uid(),date:get(r,'תאריך'),type:LG_TYPE_BY_LABEL[get(r,'סוג')]||'invalid',amount:+get(r,'סכום'),currency:get(r,'מטבע')||'ILS',category:get(r,'קטגוריה'),subcategory:get(r,'תת קטגוריה'),accountName:get(r,'חשבון'),description:get(r,'תיאור'),tags:get(r,'תגיות').split(',').filter(Boolean),recurring:get(r,'חוזרת')==='כן',recurringParent:get(r,'מזהה תנועה חוזרת')||undefined,fx:+get(r,'שער דולר')||d.fx};
    const to=get(r,'חשבון יעד'),toAmount=get(r,'סכום ביעד'),part=get(r,'תשלום').match(/^(\d+)\/(\d+)$/),planId=get(r,'מזהה עסקת תשלומים'),goalId=get(r,'מזהה יעד');
    if(to)t.toAccountName=to;
    if(toAmount!=='')t.toAmount=+toAmount;
    if(part&&planId)t.installment={planId,n:+part[1],of:+part[2]};
    if(goalId)t.goalId=goalId;
    return t;
  });
}
// Normalises one imported row's 4.1 fields (§A.9): `auto` is dropped, an invalid `installment` is dropped.
export function cleanImportedRow(row){const t={...row};delete t.auto;if(t.installment!=null&&!installmentShapeValid(t.installment))delete t.installment;if(t.type!=='transfer'){delete t.toAccountId;delete t.toAccountName;delete t.toAmount;delete t.goalId;}return t;}

// ---------- Credit-card cycle (§B.4) ----------
export function billingDates(card,from,to){const out=[];for(let m=from.slice(0,7),i=0;m<=to.slice(0,7)&&i<240;m=monthOffset(m,1),i++){const date=lgOnDay(m,card.billingDay);if(date>=from&&date<=to)out.push(date);}return out;}

// What the statement on billing date B charges, in the card's currency.
export function cardStatementAmount(d,card,B){
  let owed=Number(card.balance);
  for(const t of d.transactions){
    if(t.date<B||(t.accountId!==card.id&&t.toAccountId!==card.id))continue;
    if(t.date===B&&t.type==='expense'&&t.installment&&t.accountId===card.id)continue;   // B's installments stay on B's statement
    owed-=accountDelta(d,card,t);                                                        // remove later movements
  }
  return lgRound(owed);
}

// Records due statements (B in (statementsThrough, now]); deterministic id; idempotent.
export function materializeCardStatements(d,now=today()){
  let changed=false;
  for(const card of accountsOf(d,['credit'])){
    if(!card.statementsThrough){card.statementsThrough=now;changed=true;continue;}       // lazy init (§A.9)
    const bank=d.accounts.find(a=>a.id===card.payFrom&&a.kind==='bank');
    for(const B of billingDates(card,lgShift(card.statementsThrough,1),now)){
      const id=`card-${card.id}-${B}`;
      if(bank&&!d.transactions.some(t=>t.id===id)){
        const owed=cardStatementAmount(d,card,B);
        if(owed>0.005){const t={id,type:'transfer',amount:lgRound(lgConvert(owed,card.currency,bank.currency,d.fx)),currency:bank.currency,fx:d.fx,date:B,category:'העברה',subcategory:'',accountId:bank.id,toAccountId:card.id,toAmount:owed,description:`חיוב ${card.name}`,tags:['חיוב אשראי'],recurring:false,auto:{source:'card',ref:card.id,date:B,confirm:true}};applyTransaction(d,t);d.transactions.push(t);}
      }
      card.statementsThrough=B;changed=true;          // advances only on billing days → no daily rewrites
    }
  }
  return changed;
}

// Future statements (B > now, B ≤ to) in ILS, from what is owed now plus card-paid items expected before each B.
// `items` = scheduledItems' bills/recurring/installments (amounts in ILS).
export function projectCardStatements(d,card,items,now,to){
  if(!d.accounts.some(a=>a.id===card.payFrom&&a.kind==='bank'))return [];
  const own=items.filter(x=>x.accountId===card.id&&x.source!=='card'&&!x.paid&&x.date>=now).sort((a,b)=>a.date.localeCompare(b.date));
  let carry=toILS(card.balance,card.currency,d.fx),i=0;const out=[];
  for(const B of billingDates(card,lgShift(now,1),to)){
    for(;i<own.length&&(own[i].date<B||(own[i].date===B&&own[i].source==='installment'));i++)carry+=own[i].type==='income'?-own[i].amount:own[i].amount;
    const amount=lgRound(carry);
    if(amount>0.005){out.push({date:B,amount});carry=0;}
  }
  return out;
}

// ---------- Installment plans (§B.5) ----------
export const installmentAmount=(plan,n)=>{const each=lgRound(plan.total/plan.count);return n<plan.count?each:lgRound(plan.total-each*(plan.count-1));};
export function firstPlanMonth(d,accountId,purchaseDate){const a=lgAccount(d,accountId),m=purchaseDate.slice(0,7);if(a?.kind!=='credit')return m;return lgOnDay(m,a.billingDay)>purchaseDate?m:monthOffset(m,1);}
export function installmentDate(d,plan,n){const a=lgAccount(d,plan.accountId),month=monthOffset(plan.firstMonth,n-1);return lgOnDay(month,a?.kind==='credit'?a.billingDay:Number(plan.purchaseDate.slice(8)));}
export function installmentsBefore(d,plan,date){let n=0;while(n<plan.count&&installmentDate(d,plan,n+1)<date)n++;return n;}
const LG_PLAN_KINDS=['bank','cash','savings','credit'];
// The default "already charged" count: payments that fell in months before the current one (§B.5).
export function defaultAlreadyCharged(d,{accountId,purchaseDate,count},now=today()){
  if(!lgAccount(d,accountId)||!validDate(purchaseDate)||!(Number(count)>=2))return 0;
  const plan={accountId,purchaseDate,count:Math.round(Number(count)),firstMonth:firstPlanMonth(d,accountId,purchaseDate)};
  return Math.min(plan.count-1,installmentsBefore(d,plan,now.slice(0,7)+'-01'));
}
export function createInstallmentPlan(d,{accountId,total,count,purchaseDate,description='',category,subcategory='',tags=[],alreadyCharged,fx=d.fx},now=today()){
  const account=lgAccount(d,accountId);
  if(!account||!LG_PLAN_KINDS.includes(account.kind))throw new Error('בתשלומים אפשר לשלם מחשבון בנק, מזומן, חיסכון או כרטיס אשראי.');
  count=Number(count);if(!Number.isInteger(count)||count<2||count>60)throw new Error('מספר התשלומים צריך להיות בין 2 ל־60.');
  total=lgRound(Number(total));if(!(total>0)||!Number.isFinite(total))throw new Error('יש להזין מחיר חיובי.');
  if(!validDate(purchaseDate)||purchaseDate>now)throw new Error('תאריך הקנייה לא יכול להיות בעתיד.');
  const plan={id:uid(),accountId,description:String(description||'').trim().slice(0,120),category:String(category||''),subcategory:subcategory||'',tags:Array.isArray(tags)?tags.filter(x=>typeof x==='string'):[],total,count,purchaseDate,firstMonth:firstPlanMonth(d,accountId,purchaseDate),next:1,currency:account.currency,fx:Number(fx)>0?Number(fx):d.fx,createdAt:now};
  const charged=alreadyCharged===''||alreadyCharged==null?installmentsBefore(d,plan,now.slice(0,7)+'-01'):Number(alreadyCharged);
  if(!Number.isInteger(charged)||charged<0||charged>count-1)throw new Error('מספר התשלומים שכבר ירדו אינו תקין.');
  plan.next=charged+1;
  return plan;
}
export function materializeInstallments(d,now=today()){
  let changed=false;
  for(const plan of d.installments||[]){
    if(!d.accounts.some(a=>a.id===plan.accountId))continue;
    for(let guard=0;plan.next<=plan.count&&guard<120;guard++){
      const n=plan.next,date=installmentDate(d,plan,n);if(date>now)break;
      const id=`inst-${plan.id}-${n}`;
      if(!d.transactions.some(t=>t.id===id)){const t={id,type:'expense',amount:installmentAmount(plan,n),currency:plan.currency,fx:plan.fx,date,category:plan.category,subcategory:plan.subcategory||'',accountId:plan.accountId,description:plan.description,tags:[...new Set([...(plan.tags||[]),'תשלומים'])],recurring:false,installment:{planId:plan.id,n,of:plan.count}};applyTransaction(d,t);d.transactions.push(t);}
      plan.next=n+1;changed=true;
    }
  }
  return changed;
}
export function planProgress(d,plan,now=today()){
  const recorded=Math.min(plan.count,plan.next-1),done=plan.next>plan.count;let leftAmount=0;
  for(let n=plan.next;n<=plan.count;n++)leftAmount+=installmentAmount(plan,n);
  return {recorded,left:plan.count-recorded,of:plan.count,each:installmentAmount(plan,1),last:installmentAmount(plan,plan.count),leftAmount:lgRound(leftAmount),nextDate:done?null:installmentDate(d,plan,plan.next),lastDate:installmentDate(d,plan,plan.count),done,overdue:!done&&installmentDate(d,plan,plan.next)<=now};
}
// Early payoff: one expense today for what is left; the plan is then finished.
export function payOffPlan(d,planId,now=today()){
  const plan=(d.installments||[]).find(p=>p.id===planId);if(!plan)throw new Error('העסקה בתשלומים לא נמצאה.');
  const {leftAmount,done}=planProgress(d,plan,now);if(done||!(leftAmount>0))throw new Error('העסקה הזו כבר שולמה במלואה.');
  const t={id:`inst-${plan.id}-payoff`,type:'expense',amount:leftAmount,currency:plan.currency,fx:plan.fx,date:now,category:plan.category,subcategory:plan.subcategory||'',accountId:plan.accountId,description:`${plan.description} · פירעון מוקדם`,tags:[...new Set([...(plan.tags||[]),'תשלומים'])],recurring:false};
  if(d.transactions.some(x=>x.id===t.id))t.id=uid();
  applyTransaction(d,t);d.transactions.push(t);plan.next=plan.count+1;
  return t;
}
// Deletes the plan; payments already recorded stay in the transactions.
export function removePlan(d,planId){d.installments=(d.installments||[]).filter(p=>p.id!==planId);}
// What a new plan would look like (the transaction form's live preview): amounts and the first and last dates.
export function previewPlan(d,{accountId,total,count,purchaseDate}){
  const value=lgRound(Number(total)),n=Number(count);
  if(!lgAccount(d,accountId)||!(value>0)||!Number.isInteger(n)||n<2||n>60||!validDate(purchaseDate))return null;
  const plan={accountId,purchaseDate,total:value,count:n,firstMonth:firstPlanMonth(d,accountId,purchaseDate)};
  return {each:installmentAmount(plan,1),last:installmentAmount(plan,n),first:installmentDate(d,plan,1),lastDate:installmentDate(d,plan,n),onCard:lgAccount(d,accountId).kind==='credit'};
}
// The card's account-page numbers: unfinished plans on it, what they still owe, and the credit line in use
// (what is owed now plus the payments still to come, as card companies count it).
export function cardSummary(d,card,now=today()){
  const plans=(d.installments||[]).filter(p=>p.accountId===card.id&&p.next<=p.count);
  const left=lgRound(plans.reduce((s,p)=>s+planProgress(d,p,now).leftAmount,0));
  return {plans:plans.length,left,used:lgRound(Math.max(0,Number(card.balance))+left),limit:Number(card.creditLimit)>0?Number(card.creditLimit):null};
}
