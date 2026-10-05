import {today,validDate,toILS,portfolioValue} from './finance.js';

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

export function effectiveGoalSavings(data,goal){
  const account=data.accounts.find(a=>a.id===goal.accountId);
  if(!account)return goal.saved;
  return Math.max(0,account.kind==='investment'?portfolioValue(data):toILS(account.balance,account.currency,data.fx));
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
