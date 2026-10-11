import {today,toILS,balances,monthlySummary,monthOffset} from './finance.js';
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
  const donated=sumBy(d.transactions.filter(t=>t.type==='expense'&&inYear(t)&&categories.includes(t.category)),t=>txAmount(d,t));
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

// Bills and recurring transactions that fall between two dates (inclusive).
export function scheduledItems(d,from,to){
  const items=[];
  for(const b of d.bills||[]){
    if(b.active===false)continue;
    for(const date of billOccurrences(b,from,to))items.push({key:`${b.id}@${date}`,date,name:b.name,amount:toILS(b.amount,b.currency||'ILS',d.fx),type:b.type||'expense',category:b.category||'',source:'bill',billId:b.id,autopay:!!b.autopay,paid:(b.paid||[]).includes(date),accountId:b.accountId||''});
  }
  for(const t of d.transactions.filter(t=>t.recurring&&!t.recurringParent)){
    const day=Number(t.date.slice(8,10));
    for(let month=from.slice(0,7),guard=0;month<=to.slice(0,7)&&guard<24;month=monthOffset(month,1),guard++){
      const date=onDay(month,day);
      if(date<from||date>to||month<=t.date.slice(0,7))continue;
      if(d.transactions.some(x=>x.recurringParent===t.id&&x.date.slice(0,7)===month))continue;
      items.push({key:`${t.id}@${date}`,date,name:t.description||t.category,amount:txAmount(d,t),type:t.type,category:t.category,source:'recurring',autopay:true,paid:false,accountId:t.accountId});
    }
  }
  return items.sort((a,b)=>a.date.localeCompare(b.date)||b.amount-a.amount);
}

// Monthly cost of fixed expenses: bills (monthly equivalent) + recurring expense transactions.
export function monthlyFixed(d){
  return sumBy((d.bills||[]).filter(b=>b.active!==false&&(b.type||'expense')==='expense'),b=>billMonthly(d,b))+sumBy(d.transactions.filter(t=>t.recurring&&!t.recurringParent&&t.type==='expense'),t=>txAmount(d,t));
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
export function goalDepositItems(d,from,to,now=today()){
  const items=[];
  for(const g of d.goals||[]){
    const account=d.accounts.find(a=>a.id===g.accountId);
    if(!(g.monthly>0)||!(g.date>now)||(account&&['bank','cash'].includes(account.kind)))continue;
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
  const start=sumBy(d.accounts.filter(a=>['bank','cash'].includes(a.kind)),a=>toILS(a.balance,a.currency,d.fx));
  const from=shiftDate(now,1),end=shiftDate(now,days);
  let items=scheduledItems(d,from,end).filter(x=>!x.paid);
  const hasIncome=items.some(x=>x.type==='income')||(d.bills||[]).some(b=>b.type==='income'&&b.active!==false)||d.transactions.some(t=>t.recurring&&!t.recurringParent&&t.type==='income');
  const estimated=hasIncome?[]:estimatedIncome(d,from,end,now);
  items=[...items,...estimated,...(includeGoals?goalDepositItems(d,from,end,now):[])].sort((a,b)=>a.date.localeCompare(b.date));
  const avg=averageMonth(d,now.slice(0,7),3),fixed=monthlyFixed(d),variableDaily=includeVariable?Math.max(0,avg.expenses-fixed)/30.4:0;
  const byDate=new Map();for(const x of items){if(!byDate.has(x.date))byDate.set(x.date,[]);byDate.get(x.date).push(x);}
  let balance=start,lowest={date:now,balance:start},overdraft=null;
  const points=[{date:now,balance,events:[]}],months=new Map();
  for(let i=1;i<=days;i++){
    const date=shiftDate(now,i),events=byDate.get(date)||[],month=date.slice(0,7);
    if(!months.has(month))months.set(month,{month,start:balance,income:0,fixed:0,deposits:0,variable:0,end:balance,lowest:{date,balance},days:0});
    const m=months.get(month);
    balance-=variableDaily;m.variable+=variableDaily;m.days++;
    for(const x of events){
      if(x.type==='income'){balance+=x.amount;m.income+=x.amount;}
      else if(x.type==='transfer'){balance-=x.amount;m.deposits+=x.amount;}
      else{balance-=x.amount;m.fixed+=x.amount;}
    }
    m.end=balance;if(balance<m.lowest.balance)m.lowest={date,balance};
    points.push({date,balance,events});
    if(balance<lowest.balance)lowest={date,balance};
    if(balance<0&&!overdraft)overdraft=date;
  }
  return {start,end:balance,points,lowest,overdraft,items,variableDaily,fixed,estimatedIncome:estimated.length>0,days,months:[...months.values()],deposits:sumBy(items.filter(x=>x.type==='transfer'),x=>x.amount)};
}

// How much can be spent per day for the rest of the month without breaking the monthly target.
export function safeToSpend(d,now=today()){
  const month=now.slice(0,7),spent=monthlySummary(d,month).expenses,days=daysInMonth(month),daysLeft=days-Number(now.slice(8,10))+1;
  const upcoming=scheduledItems(d,now,`${month}-${String(days).padStart(2,'0')}`).filter(x=>!x.paid&&x.type==='expense');
  const upcomingFixed=sumBy(upcoming,x=>x.amount),available=d.overallBudget-spent-upcomingFixed;
  return {perDay:Math.max(0,available)/daysLeft,available,spent,upcomingFixed,daysLeft,budget:d.overallBudget,upcoming};
}

// ---------- Purchase decisions & wishlist ----------
export function purchaseCheck(d,{price,installments=1,now=today()}){
  price=Number(price);installments=Math.max(1,Math.min(36,Math.round(Number(installments)||1)));
  if(!(price>0)||!Number.isFinite(price))throw new Error('יש להזין מחיר חיובי.');
  const month=now.slice(0,7),avg=averageMonth(d,month,3),cur=monthlySummary(d,month);
  const income=avg.months?avg.income:cur.income,expenses=avg.months?avg.expenses:cur.expenses;
  const hourly=income>0?income/IL_TAX_2026.hoursPerMonth:null,s=safeToSpend(d,now),monthlyCost=price/installments;
  const b=balances(d),liquid=b.cash+b.savings,coverAfter=expenses>0?(liquid-price)/expenses:null;
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
