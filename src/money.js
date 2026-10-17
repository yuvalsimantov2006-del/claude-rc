import {uid,today,toILS,balances,monthlySummary,monthOffset,spendILS,amountILS,applyTransaction,validDate,LIQUID_KINDS,TX_KINDS,TRANSFER_TO_KINDS,accountsOf} from './finance.js';
import {installmentAmount,installmentDate,billingDates,projectCardStatements,makeTransfer,transferProblem,goalDeposit} from './ledger.js';
import {daysInMonth,shiftDate,averageMonth} from './smart.js';
import {savingsDepositDate,effectiveGoalSavings} from './savings.js';

// Money toolkit: Israeli payroll, loans, debt payoff, pension fees, maaser, shared expenses,
// bills & cash-flow and purchase decisions. Pure functions over the data object, no DOM.

const sumBy=(list,fn)=>list.reduce((s,x)=>s+fn(x),0);
const round2=n=>Math.round(n*100)/100;
const txAmount=(d,t)=>toILS(t.amount,t.currency||'ILS',t.fx||d.fx);

// ---------- Israeli net salary ----------
// Monthly payroll parameters for 2026 (₪): income-tax brackets incl. the 3% surtax band,
// credit point value, National Insurance + health tax for employees, and the pension tax credit.
export const IL_TAX_2026={
  year:2026,
  brackets:[[7010,.10],[10060,.14],[19000,.20],[25100,.31],[46690,.35],[60130,.47],[Infinity,.50]],
  creditPoint:242,
  insurance:{threshold:7703,max:51910,niLow:.0104,niHigh:.07,healthLow:.0323,healthHigh:.0517},
  pension:{creditRate:.35,maxRate:.07,salaryCap:9700},
  hoursPerMonth:182
};

export function incomeTax(taxable,brackets=IL_TAX_2026.brackets){
  let tax=0,prev=0;
  for(const [top,rate] of brackets){if(taxable<=prev)break;tax+=(Math.min(taxable,top)-prev)*rate;prev=top;}
  return tax;
}
export const marginalRate=(income,brackets=IL_TAX_2026.brackets)=>(brackets.find(([top])=>income<=top)||brackets.at(-1))[1];

export function netSalary({gross,creditPoints=2.25,pensionRate=.06,studyFundRate=0},p=IL_TAX_2026){
  gross=Number(gross);creditPoints=Number(creditPoints);pensionRate=Number(pensionRate);studyFundRate=Number(studyFundRate);
  if(!Number.isFinite(gross)||gross<0)throw new Error('יש להזין שכר ברוטו שאינו שלילי.');
  if(!(creditPoints>=0&&creditPoints<=20)||!(pensionRate>=0&&pensionRate<=.2)||!(studyFundRate>=0&&studyFundRate<=.1))throw new Error('נקודות הזיכוי או שיעורי ההפרשה אינם תקינים.');
  const before=incomeTax(gross,p.brackets),credits=creditPoints*p.creditPoint,pension=gross*pensionRate;
  const pensionCredit=Math.min(pension,Math.min(gross,p.pension.salaryCap)*p.pension.maxRate)*p.pension.creditRate;
  const tax=Math.max(0,before-credits-pensionCredit);
  const insured=Math.min(gross,p.insurance.max),low=Math.min(insured,p.insurance.threshold),high=insured-low;
  const ni=low*p.insurance.niLow+high*p.insurance.niHigh,health=low*p.insurance.healthLow+high*p.insurance.healthHigh;
  const studyFund=gross*studyFundRate,net=gross-tax-ni-health-pension-studyFund;
  return {gross,net,tax,taxBeforeCredits:before,credits,pensionCredit,ni,health,pension,studyFund,mandatory:tax+ni+health,effectiveRate:gross?(tax+ni+health)/gross:0,marginal:marginalRate(gross,p.brackets),hourly:net/p.hoursPerMonth};
}

// Gross salary needed for a target take-home pay (net grows monotonically with gross).
export function grossForNet(target,options={},p=IL_TAX_2026){
  target=Number(target);
  if(!(target>0))throw new Error('יש להזין שכר נטו חיובי.');
  let lo=0,hi=target*3+5000;
  for(let i=0;i<90;i++){const mid=(lo+hi)/2;if(netSalary({...options,gross:mid},p).net<target)lo=mid;else hi=mid;}
  return Math.ceil(hi);
}

// ---------- Loans & mortgages ----------
// Spitzer (equal payments) or equal-principal schedules; CPI-linked loans index the balance monthly.
// Extra monthly payments go to principal and shorten the loan.
export function loanSchedule({principal,annualRate,years,extraMonthly=0,method='shpitzer',cpiLinked=false,inflation=2.5}){
  principal=+principal;annualRate=+annualRate;years=+years;extraMonthly=+extraMonthly||0;inflation=+inflation||0;
  if(!(principal>0))throw new Error('יש להזין סכום הלוואה חיובי.');
  if(!(annualRate>=0&&annualRate<50))throw new Error('הריבית השנתית צריכה להיות בין 0% ל־50%.');
  if(!(years>0&&years<=40))throw new Error('תקופת ההלוואה צריכה להיות עד 40 שנה.');
  if(extraMonthly<0||!(inflation>-10&&inflation<30))throw new Error('ההפקדה הנוספת או האינפלציה אינן תקינות.');
  const n=Math.round(years*12),r=annualRate/1200,idx=cpiLinked?Math.pow(1+inflation/100,1/12):1;
  const basePayment=r?principal*r/(1-Math.pow(1+r,-n)):principal/n,rows=[];
  let balance=principal,index=1;
  for(let m=1;m<=n&&balance>.005;m++){
    index*=idx;const indexation=balance*(idx-1);balance+=indexation;
    const interest=balance*r;
    const scheduled=method==='equal'?principal*index/n:basePayment*index-interest;
    const principalPart=Math.min(Math.max(0,scheduled),balance),extra=Math.min(extraMonthly,balance-principalPart);
    balance-=principalPart+extra;
    rows.push({month:m,payment:principalPart+interest,extra,interest,principal:principalPart+extra,indexation,balance:Math.max(0,balance)});
  }
  return {firstPayment:rows[0]?.payment||0,maxPayment:Math.max(0,...rows.map(x=>x.payment)),lastPayment:rows.at(-1)?.payment||0,months:rows.length,totalInterest:sumBy(rows,x=>x.interest),totalIndexation:sumBy(rows,x=>x.indexation),totalPaid:sumBy(rows,x=>x.payment+x.extra),rows};
}

export function loanByYear(rows){
  const years=[];
  for(const row of rows){const y=Math.ceil(row.month/12);years[y-1] ||={year:y,interest:0,principal:0,indexation:0,balance:0};const v=years[y-1];v.interest+=row.interest;v.principal+=row.principal;v.indexation+=row.indexation;v.balance=row.balance;}
  return years;
}

// ---------- Debt payoff: avalanche (highest rate first) vs snowball (smallest balance first) ----------
export function debtPayoff(debts,{extra=0,strategy='avalanche'}={}){
  const list=debts.map((x,i)=>({id:x.id??String(i),name:x.name||`חוב ${i+1}`,balance:Number(x.balance)||0,rate:Number(x.rate)||0,payment:Number(x.payment)||0})).filter(x=>x.balance>0);
  if(list.some(x=>x.rate<0||x.payment<0||!Number.isFinite(x.balance)))throw new Error('נתוני החובות אינם תקינים.');
  const budget=sumBy(list,x=>x.payment)+Math.max(0,Number(extra)||0),series=[{month:0,balance:sumBy(list,x=>x.balance)}],order=[];
  let month=0,totalInterest=0;
  while(list.some(x=>x.balance>.005)&&month<600){
    month++;let available=budget;
    for(const x of list)if(x.balance>.005){const i=x.balance*x.rate/1200;x.balance+=i;totalInterest+=i;}
    for(const x of list)if(x.balance>.005){const pay=Math.min(x.payment,x.balance,available);x.balance-=pay;available-=pay;}
    const targets=list.filter(x=>x.balance>.005).sort(strategy==='snowball'?(a,b)=>a.balance-b.balance:(a,b)=>b.rate-a.rate||a.balance-b.balance);
    for(const x of targets){if(available<=0)break;const pay=Math.min(available,x.balance);x.balance-=pay;available-=pay;}
    for(const x of list)if(x.balance<=.005&&!order.some(o=>o.id===x.id)){x.balance=0;order.push({id:x.id,name:x.name,month});}
    series.push({month,balance:sumBy(list,x=>x.balance)});
    if(month===12&&series[12].balance>=series[0].balance)break;
  }
  const feasible=!list.some(x=>x.balance>.005);
  return {feasible,months:feasible?month:null,totalInterest:feasible?totalInterest:null,order,series,budget,strategy};
}

// ---------- Pension / savings management fees ----------
// Percent inputs (5 = 5%). Accumulation fee is charged on the balance, deposit fee on each deposit.
export function feeImpact({balance=0,monthly=0,years=30,annualReturn=5,accumulationFee=.5,depositFee=2,compareAccumulation=.15,compareDeposit=1}){
  const nums=[balance,monthly,years,annualReturn,accumulationFee,depositFee,compareAccumulation,compareDeposit].map(Number);
  if(nums.some(n=>!Number.isFinite(n))||nums[0]<0||nums[1]<0||!(nums[2]>0&&nums[2]<=60)||nums.slice(4).some(n=>n<0||n>10))throw new Error('יש להזין ערכים תקינים: שנים עד 60 ודמי ניהול בין 0% ל־10%.');
  [balance,monthly,years,annualReturn,accumulationFee,depositFee,compareAccumulation,compareDeposit]=nums;
  const run=(acc,dep)=>{
    const growth=Math.pow(1+annualReturn/100,1/12),keep=Math.pow(1-acc/100,1/12),points=[{year:0,value:balance}];
    let value=balance,fees=0;
    for(let m=1;m<=years*12;m++){const grown=value*growth;fees+=grown*(1-keep)+monthly*dep/100;value=grown*keep+monthly*(1-dep/100);if(m%12===0)points.push({year:m/12,value});}
    return {final:value,fees,points};
  };
  const yours=run(accumulationFee,depositFee),better=run(compareAccumulation,compareDeposit);
  return {yours,better,difference:better.final-yours.final,contributed:balance+monthly*years*12};
}

// ---------- Maaser (giving 10% / 20% of income) ----------
export function maaserSummary(d,{year=today().slice(0,4),rate=.1,categories=['תרומות']}={}){
  const inYear=t=>t.date.startsWith(String(year));
  const income=sumBy(d.transactions.filter(t=>t.type==='income'&&inYear(t)),t=>txAmount(d,t));
  const donated=sumBy(d.transactions.filter(t=>inYear(t)&&categories.includes(t.category)),t=>spendILS(d,t));
  const due=income*rate;
  return {year:String(year),rate,income,due,donated,remaining:due-donated,progress:due>0?donated/due:0,taxCredit:donated*.35};
}

// ---------- Shared expenses ----------
export function expenseShares(group,x){
  if(x.split==='exact'&&x.shares)return Object.fromEntries(Object.entries(x.shares).map(([id,v])=>[id,Number(v)]));
  const people=x.participants?.length?x.participants:group.members.map(m=>m.id),each=x.amount/people.length;
  return Object.fromEntries(people.map(id=>[id,each]));
}
// Positive = the group owes this member; negative = this member owes the group.
export function groupBalances(group){
  const net=Object.fromEntries(group.members.map(m=>[m.id,0]));
  for(const x of group.expenses||[]){net[x.paidBy]+=x.amount;for(const [id,share] of Object.entries(expenseShares(group,x)))net[id]-=share;}
  for(const s of group.settlements||[]){net[s.from]+=s.amount;net[s.to]-=s.amount;}
  return net;
}
// Greedy matching of the largest debtor with the largest creditor: at most n-1 transfers.
export function settleUp(net){
  const creditors=Object.entries(net).filter(([,v])=>v>.009).map(([id,v])=>({id,v})).sort((a,b)=>b.v-a.v);
  const debtors=Object.entries(net).filter(([,v])=>v<-.009).map(([id,v])=>({id,v:-v})).sort((a,b)=>b.v-a.v);
  const transfers=[];let i=0,j=0;
  while(i<debtors.length&&j<creditors.length){
    const amount=Math.min(debtors[i].v,creditors[j].v);
    if(amount>=.01)transfers.push({from:debtors[i].id,to:creditors[j].id,amount:round2(amount)});
    debtors[i].v-=amount;creditors[j].v-=amount;
    if(debtors[i].v<.01)i++;
    if(creditors[j].v<.01)j++;
  }
  return transfers;
}
export function groupSummary(group){
  const net=groupBalances(group),me=group.members.find(m=>m.me)?.id||null;
  const myShare=me?sumBy(group.expenses||[],x=>expenseShares(group,x)[me]||0):0;
  return {total:sumBy(group.expenses||[],x=>x.amount),net,transfers:settleUp(net),me,myBalance:me?net[me]:0,myShare};
}
export function splitTotals(d){
  let owedToMe=0,iOwe=0;
  for(const g of d.groups||[]){const s=groupSummary(g);if(s.myBalance>.009)owedToMe+=s.myBalance;else if(s.myBalance<-.009)iOwe-=s.myBalance;}
  return {owedToMe,iOwe,groups:(d.groups||[]).length};
}

// ---------- Bills, recurring items & cash-flow ----------
export const BILL_STEPS={monthly:1,bimonthly:2,quarterly:3,yearly:12};
const monthsBetween=(a,b)=>(+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(5,7)-+a.slice(5,7));
const onDay=(month,day)=>`${month}-${String(Math.min(day,daysInMonth(month))).padStart(2,'0')}`;

export function billOccurrences(bill,from,to){
  const step=BILL_STEPS[bill.frequency]||1,anchor=bill.startMonth||from.slice(0,7),out=[];
  const gap=monthsBetween(anchor,from.slice(0,7));
  let month=gap>0?monthOffset(anchor,Math.floor(gap/step)*step):anchor;
  for(let i=0;i<60;i++){const date=onDay(month,bill.day);if(date>to)break;if(date>=from)out.push(date);month=monthOffset(month,step);}
  return out;
}
export const billMonthly=(d,b)=>toILS(b.amount,b.currency||'ILS',d.fx)/(BILL_STEPS[b.frequency]||1);

// ---------- Bill kinds and auto-recorded bills (§A.5, §B.6) ----------
// A fixed item is an income, an expense, or a standing deposit between your own accounts ("הפקדה קבועה"):
// kind:'transfer', from accountId into toAccountId and/or a goal (goalId). A deposit keeps type:'expense' so the
// bills validation of 4.0 and 4.1 (type ∈ income|expense, §A.5) still accepts it; read it only through billKind().
// A deposit is never income or spending: it is recorded as a transfer, and the forecast moves money between accounts.
export const isDepositBill=b=>b?.kind==='transfer';
export const billKind=b=>isDepositBill(b)?'transfer':b?.type==='income'?'income':'expense';
export const DEPOSIT_FROM_KINDS=['bank','cash','savings'];
export const DEPOSIT_TO_KINDS=['savings','deposit','bank','cash'];
const billDayGap=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/864e5);

// Where a standing deposit goes today. A goal follows its current link; an unlinked goal uses the chosen account,
// or none ("only the goal grows", as in "הפקדתי עכשיו"). `problem` is a short Hebrew reason it cannot be recorded.
export function depositRoute(d,b){
  const goal=b.goalId?(d.goals||[]).find(g=>g.id===b.goalId)||null:null;
  const linked=goal?.accountId?d.accounts.find(a=>a.id===goal.accountId)||null:null;
  const from=d.accounts.find(a=>a.id===b.accountId&&DEPOSIT_FROM_KINDS.includes(a.kind))||null;
  const chosen=b.toAccountId?d.accounts.find(a=>a.id===b.toAccountId)||null:null,to=goal?linked||chosen:chosen;
  let problem='';
  if(b.goalId&&!goal)problem='היעד נמחק';
  else if(!from)problem='חסר חשבון שממנו יוצא הכסף';
  else if(linked?.kind==='investment')problem='יעד שמקושר לתיק ההשקעות מתעדכן דרך פעולה בתיק';
  else if(!goal&&!to)problem='חסר חשבון יעד';
  else if(to&&(to.id===from.id||!TRANSFER_TO_KINDS.includes(to.kind)))problem='חשבון היעד אינו מתאים';
  return {from,to,goal,linked,problem};
}
// How a deposit changes bank + cash (the forecast's money), in shekels: out of a liquid account, into one, or both.
// A goal-only deposit (an unlinked goal, no destination account) moves no account at all.
const depositLiquid=(d,route,amount)=>!route.to?0:(LIQUID_KINDS.includes(route.to.kind)?amount:0)-(route.from&&LIQUID_KINDS.includes(route.from.kind)?amount:0);

// An occurrence is handled when it was marked paid, or when it is an autopay occurrence on or before
// recordedThrough that the user did not put back on hold ("עוד לא נכנסה").
export const billHandled=(b,date)=>(b.paid||[]).includes(date)||(!!b.autopay&&!!b.recordedThrough&&date<=b.recordedThrough&&!(b.waiting||[]).includes(date));

// Two names match when, as letters and digits only, one contains the other or they share a word of 3+ letters.
const billNameKey=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function billNameMatch(a,b){
  const x=billNameKey(a),y=billNameKey(b);if(!x||!y)return false;
  const xs=x.replace(/ /g,''),ys=y.replace(/ /g,'');if(xs.includes(ys)||ys.includes(xs))return true;
  const words=new Set(x.split(' ').filter(w=>w.length>2));return y.split(' ').some(w=>w.length>2&&words.has(w));
}
// A row the user recorded by hand for this occurrence: same kind, within 4 days and max(20 ₪, 35%) of the amount,
// and the same category or a matching name (a deposit: the same accounts or the same goal). Auto rows never match.
export function findManualTwin(d,b,date){
  const kind=billKind(b),billILS=toILS(b.amount,b.currency||'ILS',d.fx),tolerance=Math.max(20,.35*billILS),route=kind==='transfer'?depositRoute(d,b):null;
  return d.transactions.find(t=>!t.auto&&t.type===kind&&Math.abs(billDayGap(t.date,date))<=4&&Math.abs(amountILS(d,t)-billILS)<=tolerance&&
    (route?t.accountId===b.accountId&&((!!route.to&&t.toAccountId===route.to.id)||(!!b.goalId&&t.goalId===b.goalId)):(t.category===b.category||billNameMatch(t.description,b.name))))||null;
}

// Records one occurrence (mutates d). Income and expense rows go to the bill's account, converted to its currency;
// a deposit is a transfer (a goal deposit goes through goalDeposit, so a fixed allocation grows with it).
function recordBillRow(d,b,date,id,now){
  const kind=billKind(b),ils=round2(toILS(b.amount,b.currency||'ILS',d.fx)),tags=['תשלום קבוע','אוטומטי'],auto={source:'bill',ref:b.id,date,confirm:kind==='transfer'?false:b.confirm??(kind==='income')};
  const inCurrency=a=>a.currency===(b.currency||'ILS')?Number(b.amount):round2(a.currency==='USD'?ils/d.fx:ils);
  if(kind==='transfer'){
    const {from,to,goal}=depositRoute(d,b);let t=null;
    if(goal)t=goalDeposit(d,goal.id,{amount:ils,fromId:from.id,toId:to?.id||'',date},now).transaction;
    else{t=makeTransfer(d,{fromId:from.id,toId:to.id,amount:inCurrency(from),date,description:b.name});const problem=transferProblem(d,t,now);if(problem)throw new Error(problem);applyTransaction(d,t);d.transactions.push(t);}
    if(t)Object.assign(t,{id,description:b.name,tags,auto});
    return t;
  }
  const account=d.accounts.find(a=>a.id===b.accountId),category=b.category||(kind==='income'?'משכורת':'חשבונות');
  const t={id,type:kind,amount:inCurrency(account),currency:account.currency,fx:d.fx,date,category,subcategory:'',accountId:account.id,description:b.name,tags,recurring:false,auto};
  if(!d.categories.includes(category))d.categories.push(category);
  applyTransaction(d,t);d.transactions.push(t);
  return t;
}
// Autopay occurrences in (recordedThrough, now] become real rows with deterministic ids (§B.6, §B.7). A bill first
// seen without recordedThrough starts today: nothing in the past is recorded, not even today (§A.9). A matching
// manual row marks the occurrence paid instead. A bill whose account is missing waits (the table says why).
export function materializeBills(d,now=today()){
  let changed=false;
  for(const b of d.bills||[]){
    if(!b.autopay||b.active===false)continue;
    if(!b.recordedThrough){b.recordedThrough=now;changed=true;continue;}
    if(b.recordedThrough>=now)continue;
    if(isDepositBill(b)?depositRoute(d,b).problem:!d.accounts.some(a=>a.id===b.accountId&&TX_KINDS.includes(a.kind)))continue;
    const to=b.endDate&&b.endDate<now?b.endDate:now,step=BILL_STEPS[b.frequency]||1;
    // Already recorded in this period (the day was moved after the row was written): handled, not recorded twice.
    const recorded=date=>d.transactions.some(t=>t.auto?.source==='bill'&&t.auto.ref===b.id&&Math.abs(monthsBetween(t.auto.date.slice(0,7),date.slice(0,7)))<step);
    for(const date of billOccurrences(b,shiftDate(b.recordedThrough,1),to)){
      if(!(b.paid||[]).includes(date)&&!(b.waiting||[]).includes(date)){
        const twin=findManualTwin(d,b,date)||recorded(date),id=`bill-${b.id}-${date}`;
        if(twin)b.paid=[...new Set([...(b.paid||[]),date])].sort().slice(-36);
        else if(!d.transactions.some(t=>t.id===id)){try{recordBillRow(d,b,date,id,now);}catch{break;}}   // retried next time
      }
      b.recordedThrough=date;changed=true;   // advances only on occurrence days → no daily rewrites
    }
  }
  return changed;
}

// The next `count` occurrences on or after `from` that are not handled (windows of four years: billOccurrences
// stops after 60 steps).
function billUpcoming(b,from,count,until='9999-12-31'){
  const out=[];let start=from;
  for(let guard=0;out.length<count&&start<=until&&guard<30;guard++){
    const stop=`${monthOffset(start.slice(0,7),47)}-31`;
    for(const date of billOccurrences(b,start,stop<until?stop:until))if(!billHandled(b,date)&&out.length<count)out.push(date);
    start=`${monthOffset(start.slice(0,7),48)}-01`;
  }
  return out;
}
// "Stop after N payments": the N-th occurrence from today that is not handled yet; null clears it.
export function billEndDate(b,n,now=today()){n=Number(n);if(!Number.isInteger(n)||n<1||n>600)return null;return billUpcoming(b,now,n)[n-1]||null;}
// Occurrences left until endDate (from today, not handled); null when the bill has no end.
export const billRemaining=(b,now=today())=>!b.endDate?null:b.endDate<now?0:billUpcoming(b,now,600,b.endDate).length;
export const billEnded=(b,now=today())=>!!b.endDate&&(b.endDate<now||billRemaining(b,now)===0);

// Auto rows that wait for "כמה בדיוק?", newest first.
export const pendingConfirmations=d=>d.transactions.filter(t=>t.auto?.confirm===true).sort((a,b)=>b.date.localeCompare(a.date)||String(a.id).localeCompare(String(b.id)));
// Confirms an auto row with the real amount (edit = undo + apply). A transfer's toAmount follows (same currency:
// equal; otherwise at the row's rate). Returns whether the amount changed.
export function confirmAutoAmount(d,txId,amount){
  const i=d.transactions.findIndex(t=>t.id===txId),t=d.transactions[i];if(!t)throw new Error('הרישום כבר לא קיים.');
  const value=round2(Number(amount));if(!(value>0)||!Number.isFinite(value))throw new Error('יש להזין סכום חיובי.');
  const next={...t,amount:value,auto:{...t.auto,confirm:false}};
  if(t.type==='transfer'){const to=d.accounts.find(a=>a.id===t.toAccountId),from=d.accounts.find(a=>a.id===t.accountId),fx=Number(t.fx)||d.fx;next.toAmount=!to||!from||from.currency===to.currency?value:round2(from.currency==='USD'?value*fx:value/fx);}
  applyTransaction(d,t,-1);applyTransaction(d,next);d.transactions[i]=next;
  return Math.abs(value-t.amount)>.004;
}
// "עוד לא נכנסה / עוד לא ירד": the row goes away and the occurrence waits (shown as manual and overdue).
export function holdAutoBill(d,txId){
  const t=d.transactions.find(x=>x.id===txId);if(!t)throw new Error('הרישום כבר לא קיים.');
  if(t.auto?.source!=='bill'||t.type==='transfer')throw new Error('אפשר לדחות רק הכנסה או תשלום קבוע שנרשמו אוטומטית.');
  applyTransaction(d,t,-1);d.transactions=d.transactions.filter(x=>x.id!==txId);
  const b=(d.bills||[]).find(x=>x.id===t.auto.ref);
  if(b)b.waiting=[...new Set([...(b.waiting||[]),t.auto.date])].sort();
  return b||null;
}
// "מחיקת החיוב" of an automatic card statement: the amount stays owed on the card until the next statement.
export function dropAutoCard(d,txId){
  const t=d.transactions.find(x=>x.id===txId);if(!t)throw new Error('הרישום כבר לא קיים.');
  if(t.auto?.source!=='card')throw new Error('זה לא חיוב כרטיס אוטומטי.');
  applyTransaction(d,t,-1);d.transactions=d.transactions.filter(x=>x.id!==txId);
}
const findBill=(d,id)=>{const b=(d.bills||[]).find(x=>x.id===id);if(!b)throw new Error('התשלום הקבוע לא נמצא.');return b;};
export function pauseBill(d,id,now=today()){const b=findBill(d,id);b.active=false;b.pausedOn=now;return b;}
// Resuming never back-fills the paused period.
export function resumeBill(d,id,now=today()){const b=findBill(d,id);b.active=true;b.pausedOn=null;b.recordedThrough=now;return b;}
// A new or edited bill from the form's values (strings). Every new bill starts recording tomorrow
// (recordedThrough=today); an edit keeps its through-date unless autopay is switched on now. `remaining`
// ("כמה תשלומים נשארו") sets endDate; empty clears it; 0 stops it.
export function makeBill(d,v,previous=null,now=today()){
  const kind=['income','expense','transfer'].includes(v.kind)?v.kind:'expense',amount=round2(Number(v.amount)),day=Math.round(Number(v.day)),left=String(v.remaining??'').trim();
  if(!(amount>0)||!Number.isFinite(amount))throw new Error('יש להזין סכום חיובי.');
  if(!(day>=1&&day<=31))throw new Error('יום בחודש צריך להיות בין 1 ל־31.');
  if(left!==''&&!(Number.isInteger(Number(left))&&+left>=0&&+left<=120))throw new Error('מספר התשלומים שנשארו צריך להיות בין 1 ל־120, או ריק.');
  const bill={paid:[],...previous,id:previous?.id||uid(),amount,currency:'ILS',frequency:BILL_STEPS[v.frequency]?v.frequency:'monthly',day};
  if(/^\d{4}-(0[1-9]|1[0-2])$/.test(v.startMonth||''))bill.startMonth=v.startMonth;
  if(kind==='transfer'){
    const [tk,tid]=String(v.target||'').split(':'),goal=tk==='goal'?(d.goals||[]).find(g=>g.id===tid):null,account=tk==='acc'?d.accounts.find(a=>a.id===tid):null;
    if(!goal&&!account)throw new Error('בחר לאן להפקיד: חשבון חיסכון או יעד.');
    const linked=goal&&d.accounts.some(a=>a.id===goal.accountId);
    Object.assign(bill,{type:'expense',kind:'transfer',accountId:String(v.from||''),toAccountId:goal?(linked?'':String(v.dest||'')):account.id,category:'העברה',autopay:true,confirm:false});
    if(goal)bill.goalId=goal.id;else delete bill.goalId;
    const {problem}=depositRoute(d,bill);if(problem)throw new Error(problem+'.');
    bill.name=String(v.name||'').trim().slice(0,80)||`הפקדה ל${goal?goal.name:account.name}`;
  }else{
    const name=String(v.name||'').trim().slice(0,80);if(!name)throw new Error('יש להזין שם.');
    delete bill.kind;delete bill.toAccountId;delete bill.goalId;
    Object.assign(bill,{name,type:kind,category:String(v.category||''),accountId:String(v.accountId||''),autopay:!!v.autopay,confirm:!!v.confirm});
    if(bill.autopay&&!d.accounts.some(a=>a.id===bill.accountId&&TX_KINDS.includes(a.kind)))throw new Error('כדי שאופק תרשום את זה לבד, בחר חשבון.');
  }
  if(!previous||!previous.recordedThrough||(bill.autopay&&!previous.autopay))bill.recordedThrough=now;
  if(left==='')bill.endDate=null;
  else if(+left===0)bill.endDate=previous?.endDate&&previous.endDate<=now?previous.endDate:shiftDate(now,-1);
  else bill.endDate=billEndDate(bill,+left,now);
  if(!previous&&bill.endDate==null)delete bill.endDate;
  return bill;
}
// The first occurrence a new bill will record or show (strictly after today), or null.
export const nextBillDate=(b,now=today())=>billUpcoming({...b,paid:[],waiting:[],recordedThrough:now,autopay:true},shiftDate(now,1),1,b.endDate||'9999-12-31')[0]||null;
// "שולם / התקבל / הופקד" from the agenda (mutates d): the occurrence is handled, a waiting one stops waiting, and
// with `record` a row is added: income or expense on the chosen account, or the deposit itself (a transfer).
export function markBillPaid(d,billId,occurrence,{record=false,amount,date,accountId}={},now=today()){
  const b=findBill(d,billId);
  if(record){
    const value=round2(Number(amount));
    if(!(value>0)||!Number.isFinite(value))throw new Error('יש להזין סכום חיובי.');
    if(!validDate(date)||date>now)throw new Error('יש לבחור תאריך שאינו בעתיד.');
    if(isDepositBill(b)){
      const route=depositRoute(d,{...b,accountId:accountId||b.accountId});if(route.problem)throw new Error(route.problem+'.');
      if(route.goal)goalDeposit(d,route.goal.id,{amount:value,fromId:route.from.id,toId:route.to?.id||'',date},now);
      else{const t=makeTransfer(d,{fromId:route.from.id,toId:route.to.id,amount:route.from.currency==='USD'?round2(value/d.fx):value,date,description:b.name});const problem=transferProblem(d,t,now);if(problem)throw new Error(problem);t.tags=['תשלום קבוע'];applyTransaction(d,t);d.transactions.push(t);}
    }else{
      if(!d.accounts.some(a=>a.id===accountId&&TX_KINDS.includes(a.kind)))throw new Error('יש לבחור חשבון.');
      const kind=billKind(b),t={id:uid(),type:kind,amount:value,currency:'ILS',fx:d.fx,date,category:b.category||(kind==='income'?'משכורת':'חשבונות'),subcategory:'',accountId,description:b.name,tags:['תשלום קבוע'],recurring:false};
      if(!d.categories.includes(t.category))d.categories.push(t.category);
      applyTransaction(d,t);d.transactions.push(t);
    }
  }
  b.paid=[...new Set([...(b.paid||[]),occurrence])].sort().slice(-36);
  if(b.waiting){b.waiting=b.waiting.filter(x=>x!==occurrence);if(!b.waiting.length)delete b.waiting;}
  return b;
}
// The standing deposit of a goal, or of an account (one without a goal), if there is one.
export function depositBillFor(d,{goalId='',accountId=''}={}){
  const list=(d.bills||[]).filter(isDepositBill);
  if(goalId)return list.find(b=>b.goalId===goalId)||null;
  return accountId?list.find(b=>!b.goalId&&b.toAccountId===accountId)||null:null;
}

// Bills, recurring transactions, installment payments and card statements that fall between two dates
// (inclusive). `onCard` items are paid by a credit card: they move the card, not the bank, and reach the bank
// only through the card's statement (source 'card').
export function scheduledItems(d,from,to,now=today()){
  const items=[],kindOf=id=>d.accounts.find(a=>a.id===id)?.kind,onCard=id=>kindOf(id)==='credit';
  for(const b of d.bills||[]){
    if(b.active===false)continue;
    const kind=billKind(b),route=kind==='transfer'?depositRoute(d,b):null,amount=toILS(b.amount,b.currency||'ILS',d.fx);
    for(const date of billOccurrences(b,from,b.endDate&&b.endDate<to?b.endDate:to)){
      const waiting=(b.waiting||[]).includes(date),item={key:`${b.id}@${date}`,date,name:b.name,amount,type:kind,category:b.category||'',source:'bill',billId:b.id,autopay:!!b.autopay&&!waiting,waiting,paid:billHandled(b,date),accountId:b.accountId||'',onCard:!route&&onCard(b.accountId)};
      if(route)Object.assign(item,{toAccountId:route.to?.id||'',goalId:b.goalId||'',liquid:depositLiquid(d,route,amount)});
      items.push(item);
    }
  }
  for(const t of d.transactions.filter(t=>t.recurring&&!t.recurringParent)){
    const day=Number(t.date.slice(8,10));
    for(let month=from.slice(0,7),guard=0;month<=to.slice(0,7)&&guard<24;month=monthOffset(month,1),guard++){
      const date=onDay(month,day);
      if(date<from||date>to||month<=t.date.slice(0,7))continue;
      if(d.transactions.some(x=>x.recurringParent===t.id&&x.date.slice(0,7)===month))continue;
      items.push({key:`${t.id}@${date}`,date,name:t.description||t.category,amount:txAmount(d,t),type:t.type,category:t.category,source:'recurring',autopay:true,paid:false,accountId:t.accountId,onCard:onCard(t.accountId)});
    }
  }
  for(const plan of d.installments||[]){
    if(!kindOf(plan.accountId))continue;
    for(let n=Math.max(1,plan.next);n<=plan.count;n++){
      const date=installmentDate(d,plan,n);if(date>to)break;if(date<from)continue;
      items.push({key:`inst-${plan.id}-${n}@${date}`,date,name:`${plan.description} · ${n}/${plan.count}`,amount:toILS(installmentAmount(plan,n),plan.currency,plan.fx),type:'expense',category:plan.category,source:'installment',planId:plan.id,n,of:plan.count,autopay:true,paid:false,accountId:plan.accountId,onCard:onCard(plan.accountId)});
    }
  }
  const cards=accountsOf(d,['credit']).filter(c=>d.accounts.some(a=>a.id===c.payFrom&&a.kind==='bank'));
  if(cards.length){
    const own=items.slice();
    for(const card of cards){
      const base={type:'transfer',category:'העברה',source:'card',name:`חיוב ${card.name}`,accountId:card.payFrom,toAccountId:card.id,cardId:card.id,autopay:true,onCard:false};
      for(const B of billingDates(card,from,to<now?to:now)){
        const t=d.transactions.find(x=>x.id===`card-${card.id}-${B}`)||d.transactions.find(x=>x.type==='transfer'&&x.toAccountId===card.id&&x.auto?.source==='card'&&x.auto.date===B);
        if(t)items.push({...base,key:`card-${card.id}@${B}`,date:B,amount:txAmount(d,t),paid:true});
      }
      if(to>now)for(const x of projectCardStatements(d,card,own,now,to))if(x.date>=from)items.push({...base,key:`card-${card.id}@${x.date}`,date:x.date,amount:x.amount,paid:false});
    }
  }
  return items.sort((a,b)=>a.date.localeCompare(b.date)||b.amount-a.amount);
}

// The first future statement of a card (within about two months), in ILS, or null.
export function nextCardCharge(d,card,now=today()){
  const to=shiftDate(now,62);
  return projectCardStatements(d,card,scheduledItems(d,now,to,now),now,to)[0]||null;
}

// Monthly cost of fixed expenses: bills (monthly equivalent) + recurring expense transactions + the next payment
// of every unfinished installment plan. Paused, ended and deposit bills are not fixed spending.
export function monthlyFixed(d,now=today()){
  return sumBy((d.bills||[]).filter(b=>b.active!==false&&billKind(b)==='expense'&&!(b.endDate&&b.endDate<now)),b=>billMonthly(d,b))+sumBy(d.transactions.filter(t=>t.recurring&&!t.recurringParent&&t.type==='expense'),t=>txAmount(d,t))+sumBy((d.installments||[]).filter(p=>p.next<=p.count),p=>toILS(installmentAmount(p,p.next),p.currency,p.fx));
}

// Salary-like incomes seen in at least two of the last three months, projected forward.
export function estimatedIncome(d,from,to,now=today()){
  const current=now.slice(0,7),window=[current,monthOffset(current,-1),monthOffset(current,-2),monthOffset(current,-3)],groups=new Map();
  for(const t of d.transactions)if(t.type==='income'&&window.includes(t.date.slice(0,7))){const key=(t.description||t.category).trim();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
  const items=[];
  for(const [name,list] of groups){
    const months=new Set(list.map(t=>t.date.slice(0,7)));
    if(months.size<2)continue;
    const last=[...list].sort((a,b)=>b.date.localeCompare(a.date))[0],amount=sumBy(list,t=>txAmount(d,t))/months.size,day=Number(last.date.slice(8,10));
    for(let month=from.slice(0,7),guard=0;month<=to.slice(0,7)&&guard<24;month=monthOffset(month,1),guard++){
      const date=onDay(month,day);
      if(date<from||date>to||months.has(month))continue;
      items.push({key:`est-${name}@${date}`,date,name,amount,type:'income',category:last.category,source:'estimate',autopay:true,paid:false});
    }
  }
  return items;
}

// Planned monthly deposits to savings goals that move money out of the bank (to a savings or
// investment account, or set aside by hand). Goals funded inside a bank or cash account are skipped:
// that money never leaves the account. Deposits stop once a goal reaches its target.
// A goal with a standing deposit (a deposit bill to the goal or to its account) is skipped: the bill is that plan.
export function goalDepositItems(d,from,to,now=today()){
  const items=[],standing=new Set((d.bills||[]).filter(b=>isDepositBill(b)&&b.active!==false&&!(b.endDate&&b.endDate<now)).flatMap(b=>[b.goalId&&'g:'+b.goalId,b.toAccountId&&!b.goalId&&'a:'+b.toAccountId]).filter(Boolean));
  for(const g of d.goals||[]){
    const account=d.accounts.find(a=>a.id===g.accountId);
    if(!(g.monthly>0)||!(g.date>now)||(account&&['bank','cash','deposit'].includes(account.kind))||standing.has('g:'+g.id)||(g.accountId&&standing.has('a:'+g.accountId)))continue;
    let saved=effectiveGoalSavings(d,g);
    for(let k=1;k<=600;k++){
      const date=savingsDepositDate(now,k);
      if(date>to||date>g.date)break;
      if(g.target>0&&saved>=g.target)break;
      saved+=g.monthly;
      if(date>=from)items.push({key:`goal-${g.id}@${date}`,date,name:`הפקדה ל${g.name}`,amount:g.monthly,type:'transfer',category:'חיסכון',source:'goal',goalId:g.id,autopay:false,paid:false});
    }
  }
  return items;
}

// Day-by-day projection of bank + cash: fixed payments and incomes, recurring transactions,
// planned goal deposits and average variable spending, with a summary for every month.
export function cashflowForecast(d,{days=60,now=today(),includeGoals=true,includeVariable=true}={}){
  days=Math.max(7,Math.min(400,Math.round(days)));
  const start=sumBy(d.accounts.filter(a=>LIQUID_KINDS.includes(a.kind)),a=>toILS(a.balance,a.currency,d.fx));
  const from=shiftDate(now,1),end=shiftDate(now,days);
  let items=scheduledItems(d,from,end,now).filter(x=>!x.paid);
  const hasIncome=items.some(x=>x.type==='income')||(d.bills||[]).some(b=>b.type==='income'&&b.active!==false)||d.transactions.some(t=>t.recurring&&!t.recurringParent&&t.type==='income');
  const estimated=hasIncome?[]:estimatedIncome(d,from,end,now);
  items=[...items,...estimated,...(includeGoals?goalDepositItems(d,from,end,now):[])].sort((a,b)=>a.date.localeCompare(b.date));
  const avg=averageMonth(d,now.slice(0,7),3),fixed=monthlyFixed(d,now),variableDaily=includeVariable?Math.max(0,avg.expenses-fixed)/30.4:0;
  const byDate=new Map();for(const x of items){if(!byDate.has(x.date))byDate.set(x.date,[]);byDate.get(x.date).push(x);}
  let balance=start,lowest={date:now,balance:start},overdraft=null;
  const points=[{date:now,balance,events:[]}],months=new Map();
  for(let i=1;i<=days;i++){
    const date=shiftDate(now,i),events=byDate.get(date)||[],month=date.slice(0,7);
    if(!months.has(month))months.set(month,{month,start:balance,income:0,fixed:0,deposits:0,card:0,variable:0,end:balance,lowest:{date,balance},days:0});
    const m=months.get(month);
    balance-=variableDaily;m.variable+=variableDaily;m.days++;
    for(const x of events){
      if(x.onCard)continue;                              // paid by card: reaches the bank in the card statement
      if(x.type==='income'){balance+=x.amount;m.income+=x.amount;}
      else if(x.source==='card'){balance-=x.amount;m.card+=x.amount;}
      else if(x.type==='transfer'){const v=x.liquid??-x.amount;balance+=v;m.deposits-=v;}   // a standing deposit moves only what leaves bank + cash
      else{balance-=x.amount;m.fixed+=x.amount;}
    }
    m.end=balance;if(balance<m.lowest.balance)m.lowest={date,balance};
    points.push({date,balance,events});
    if(balance<lowest.balance)lowest={date,balance};
    if(balance<0&&!overdraft)overdraft=date;
  }
  return {start,end:balance,points,lowest,overdraft,items,variableDaily,fixed,estimatedIncome:estimated.length>0,days,months:[...months.values()],deposits:sumBy(items.filter(x=>x.type==='transfer'&&x.source!=='card'),x=>-(x.liquid??-x.amount)),cardCharges:sumBy(items.filter(x=>x.source==='card'),x=>x.amount)};
}

// How much can be spent per day for the rest of the month: the monthly target minus spending so far and the
// fixed spending still to come (budget side), capped by bank + cash after this month's charges (cash side).
export function safeToSpend(d,now=today()){
  const month=now.slice(0,7),spent=monthlySummary(d,month).expenses,days=daysInMonth(month),daysLeft=days-Number(now.slice(8,10))+1,end=`${month}-${String(days).padStart(2,'0')}`;
  const items=scheduledItems(d,now,end,now).filter(x=>!x.paid);
  const upcoming=items.filter(x=>x.type==='expense');                       // this month's spending still to come (bank or card)
  const upcomingFixed=sumBy(upcoming,x=>x.amount),available=d.overallBudget-spent-upcomingFixed;
  const liquid=sumBy(d.accounts.filter(a=>LIQUID_KINDS.includes(a.kind)),a=>toILS(a.balance,a.currency,d.fx));
  const cardCharges=items.filter(x=>x.source==='card'),cardDue=sumBy(cardCharges,x=>x.amount);
  const bankOut=sumBy(upcoming.filter(x=>!x.onCard),x=>x.amount),incomeDue=sumBy(items.filter(x=>x.type==='income'),x=>x.amount);
  const depositDue=-sumBy(items.filter(x=>x.source==='bill'&&x.type==='transfer'),x=>x.liquid||0);   // standing deposits leaving bank + cash: never budget, but not cash to spend
  const cash=liquid-bankOut-cardDue-depositDue+incomeDue,room=Math.min(available,cash);
  return {perDay:Math.max(0,room)/daysLeft,available,spent,upcomingFixed,daysLeft,budget:d.overallBudget,upcoming,cash,cardDue,cardCharges,depositDue,limitedBy:cash<available?'cash':'budget'};
}

// ---------- Purchase decisions & wishlist ----------
export function purchaseCheck(d,{price,installments=1,now=today()}){
  price=Number(price);installments=Math.max(1,Math.min(36,Math.round(Number(installments)||1)));
  if(!(price>0)||!Number.isFinite(price))throw new Error('יש להזין מחיר חיובי.');
  const month=now.slice(0,7),avg=averageMonth(d,month,3),cur=monthlySummary(d,month);
  const income=avg.months?avg.income:cur.income,expenses=avg.months?avg.expenses:cur.expenses;
  const hourly=income>0?income/IL_TAX_2026.hoursPerMonth:null,s=safeToSpend(d,now),monthlyCost=price/installments;
  const b=balances(d),liquid=b.cash+b.savings-Math.max(0,b.credit),coverAfter=expenses>0?(liquid-price)/expenses:null;
  const goal=[...(d.goals||[])].filter(g=>g.monthly>0&&g.date>now).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const room=Math.max(0,s.available);
  const verdict=monthlyCost>room||(coverAfter!=null&&coverAfter<1)?'red':monthlyCost<=room*.35&&(coverAfter==null||coverAfter>=3)?'green':'yellow';
  return {price,installments,monthlyCost,hourly,hours:hourly?price/hourly:null,available:s.available,shareOfAvailable:room>0?monthlyCost/room:null,coverAfter,liquid,opportunity10:price*Math.pow(1.05,10),opportunity20:price*Math.pow(1.05,20),goal:goal?{name:goal.name,delayMonths:price/goal.monthly}:null,verdict};
}

export const COOLING_DAYS=30;
export function wishStatus(item,now=today()){
  const total=item.coolDays??COOLING_DAYS,ready=shiftDate(item.added,total),left=Math.max(0,Math.round((new Date(ready+'T12:00:00Z')-new Date(now+'T12:00:00Z'))/86400000));
  return {ready,left,total,progress:total?Math.min(1,(total-left)/total):1,isReady:left===0};
}
export function wishlistSummary(d){
  const list=d.wishlist||[],sum=status=>sumBy(list.filter(x=>x.status===status),x=>x.price);
  return {waiting:sum('waiting'),skipped:sum('skipped'),bought:sum('bought'),count:list.filter(x=>x.status==='waiting').length,ready:list.filter(x=>x.status==='waiting'&&wishStatus(x).isReady).length};
}
