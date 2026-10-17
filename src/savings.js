import {today,validDate,toILS,containerValue,FREE_KINDS} from './finance.js';

// Future deposits retain the original calendar day, clamped in shorter months.
export function savingsDepositDate(from,offset){
  if(!validDate(from)||!Number.isInteger(offset)||offset<0)throw new Error('מועד ההפקדה אינו תקין.');
  const [year,month,day]=from.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1+offset,1));
  const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,lastDay));
  return date.toISOString().slice(0,10);
}

export function savingsDepositCount(from,to){
  if(!validDate(from)||!validDate(to))throw new Error('יש להזין תאריך תקין לחישוב החיסכון.');
  if(to<=from)return 0;
  const [year,month]=from.split('-').map(Number);
  const [endYear,endMonth]=to.split('-').map(Number);
  let count=(endYear-year)*12+endMonth-month;
  if(count>0&&savingsDepositDate(from,count)>to)count--;
  return Math.max(0,count);
}

export function savingsProjection(goal,from=today()){
  const {saved,monthly,date}=goal;
  if(!Number.isFinite(saved)||saved<0||!Number.isFinite(monthly)||monthly<0)throw new Error('יש להזין סכום נוכחי והפקדה חודשית שאינם שליליים.');
  const hasTarget=goal.target!==null&&goal.target!==undefined&&goal.target!=='';
  if(hasTarget&&(!Number.isFinite(goal.target)||goal.target<=0))throw new Error('סכום יעד, אם הוזן, צריך להיות חיובי.');
  const months=savingsDepositCount(from,date);
  const contributions=monthly*months;
  const projected=saved+contributions;
  if(!Number.isFinite(projected))throw new Error('סכומי החיסכון גדולים מדי לחישוב.');
  const target=hasTarget?goal.target:projected;
  const remaining=hasTarget?Math.max(0,target-saved):contributions;
  const needed=hasTarget?(remaining===0?0:months>0?remaining/months:null):null;
  const installments=hasTarget&&remaining>0&&monthly>0?Math.ceil(remaining/monthly):0;
  let estimatedDate=null;
  if(hasTarget&&remaining===0)estimatedDate=from;
  else if(installments>0&&installments<=12000)estimatedDate=savingsDepositDate(from,installments);
  return {saved,monthly,date,hasTarget,target,months,contributions,projected,remaining,needed,progress:target>0?saved/target*100:0,estimatedDate,firstDepositDate:months?savingsDepositDate(from,1):null,past:date<from,due:date<=from};
}

export const hasAllocation=goal=>goal.allocation!=null&&goal.allocation!==''&&Number.isFinite(Number(goal.allocation));
// An investment account is a container (§4.1): its value is its holdings (and the portfolio cash, when it holds it).
export function accountBalanceILS(data,account){
  return Math.max(0,account.kind==='investment'?containerValue(data,account.id):toILS(account.balance,account.currency,data.fx));
}

// One account can fund several goals. A goal with an `allocation` gets that amount (scaled down
// pro rata if the balance dropped below the total); goals linked without an allocation share
// whatever is left. Every shekel belongs to at most one goal, so nothing is counted twice.
export function accountAllocations(data,accountId){
  const account=data.accounts.find(a=>a.id===accountId);
  if(!account)return null;
  const balance=accountBalanceILS(data,account),goals=data.goals.filter(g=>g.accountId===accountId);
  const fixed=goals.filter(hasAllocation),rest=goals.filter(g=>!hasAllocation(g));
  const requested=fixed.reduce((s,g)=>s+Math.max(0,Number(g.allocation)),0),scale=requested>balance?balance/requested:1;
  const shares=new Map(fixed.map(g=>[g.id,Math.max(0,Number(g.allocation))*scale]));
  const remainder=Math.max(0,balance-requested*scale);
  for(const g of rest)shares.set(g.id,remainder/rest.length);
  const allocated=[...shares.values()].reduce((s,v)=>s+v,0);
  return {account,balance,requested,overAllocated:requested>balance+.005,shares,allocated,free:Math.max(0,balance-allocated)};
}

export function effectiveGoalSavings(data,goal){
  if(!data.accounts.some(a=>a.id===goal.accountId))return goal.saved;
  const id=goal.id||'__draft',goals=[...data.goals.filter(g=>g.id!==id),{...goal,id}];
  return accountAllocations({...data,goals},goal.accountId).shares.get(id)||0;
}

// Unallocated money in bank, cash and savings accounts — available for anything — minus what credit cards owe
// (that money is already spent). The total can be negative. A restricted deposit is never free money.
export function freeMoney(data){
  const accounts=data.accounts.filter(a=>FREE_KINDS.includes(a.kind)).map(a=>accountAllocations(data,a.id)),free=accounts.reduce((s,x)=>s+x.free,0),committed=data.accounts.filter(a=>a.kind==='credit').reduce((s,a)=>s+Math.max(0,toILS(a.balance,a.currency,data.fx)),0);
  return {total:free-committed,free,committed,allocated:accounts.reduce((s,x)=>s+x.allocated,0),accounts};
}

export function savingsProjectionSeries(goal,from=today()){
  const result=savingsProjection(goal,from),points=[{date:from,value:goal.saved,contributions:0}];
  const count=Math.min(18,result.months);
  for(let i=1;i<=count;i++){
    const n=Math.ceil(result.months*i/count);
    points.push({date:savingsDepositDate(from,n),value:goal.saved+goal.monthly*n,contributions:goal.monthly*n});
  }
  if(result.date>from&&points.at(-1).date!==result.date)points.push({date:result.date,value:result.projected,contributions:result.contributions});
  return points;
}
