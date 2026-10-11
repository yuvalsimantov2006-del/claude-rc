import {today,balances,monthOffset,monthlySummary,toILS} from './finance.js';
import {averageMonth} from './smart.js';
import {effectiveGoalSavings,freeMoney} from './savings.js';

// "What if" simulator: month by month, compares the current plan with a plan that includes events
// such as a car purchase, a discharge grant or a change in the monthly deposit.
//
// Period m = 1 is next month. Each period: the usual monthly surplus (average income − expenses)
// lands in free money, planned goal deposits move from free money to their goals until each goal
// reaches its target or date, investments grow, and debts are paid down.
export const EVENT_TYPES={
  deposit:'שינוי בהפקדה החודשית',
  purchase:'רכישה גדולה',
  grant:'מענק או הכנסה חד־פעמית',
  income:'שינוי בהכנסה החודשית',
  expense:'הוצאה חודשית חדשה'
};

function loanPayment(principal,annualRate,years){
  const n=Math.max(1,Math.round(years*12)),r=annualRate/1200;
  return r?principal*r/(1-Math.pow(1+r,-n)):principal/n;
}

export function simulatePlan(d,events=[],{horizon=36,annualReturn=5,now=today()}={}){
  horizon=Math.max(6,Math.min(120,Math.round(horizon)));
  const nowMonth=now.slice(0,7),avg=averageMonth(d,nowMonth,3),cur=monthlySummary(d,nowMonth);
  const surplus=avg.months?avg.income-avg.expenses:cur.income-cur.expenses;
  const b=balances(d),growth=Math.pow(1+annualReturn/100,1/12);
  const goals=d.goals.map(g=>({id:g.id,name:g.name,target:Number(g.target)>0?Number(g.target):null,saved:effectiveGoalSavings(d,g),monthly:Math.max(0,Number(g.monthly)||0),end:g.date.slice(0,7),achieved:null}));
  for(const g of goals)if(g.target&&g.saved>=g.target)g.achieved=0;
  const debts=d.accounts.filter(a=>a.kind==='debt'&&a.balance>0).map(a=>({balance:toILS(a.balance,a.currency,d.fx),rate:Number(a.interest)||0,payment:toILS(a.payment||0,a.currency,d.fx)}));
  let free=freeMoney(d).total,investments=b.investments;
  const loans=[],points=[{month:0,label:'היום',free,goals:goals.reduce((s,g)=>s+g.saved,0),investments,debt:debts.reduce((s,x)=>s+x.balance,0)}];
  let lowest={month:0,free},negative=null;
  const at=(e,m)=>Math.max(1,Math.round(Number(e.month)||1))===m;
  const active=(e,m)=>{const start=Math.max(1,Math.round(Number(e.month)||1)),duration=Math.round(Number(e.duration)||0);return m>=start&&(!duration||m<start+duration);};
  const goalById=id=>goals.find(g=>g.id===id);
  for(let m=1;m<=horizon;m++){
    const month=monthOffset(nowMonth,m);
    let net=surplus;
    for(const e of events){
      const amount=Number(e.amount)||0;
      if(e.type==='income'&&active(e,m))net+=amount;
      if(e.type==='expense'&&active(e,m))net-=amount;
      if(e.type==='purchase'&&Number(e.monthlyCost)>0&&m>Math.max(1,Math.round(Number(e.month)||1)))net-=Number(e.monthlyCost);
    }
    for(const loan of loans)if(loan.left>0&&m>loan.start){const interest=loan.balance*loan.rate/1200,pay=Math.min(loan.payment,loan.balance+interest);loan.balance=Math.max(0,loan.balance+interest-pay);loan.left--;net-=pay;}
    for(const x of debts)if(x.balance>0){const interest=x.balance*x.rate/1200;x.balance=Math.max(0,x.balance+interest-x.payment);}
    // One-time events of this month.
    for(const e of events.filter(e=>at(e,m))){
      const amount=Math.max(0,Number(e.amount)||0),target=String(e.target||e.funding||'free');
      if(e.type==='grant'){
        if(target.startsWith('goal:')&&goalById(target.slice(5)))goalById(target.slice(5)).saved+=amount;
        else if(target==='invest')investments+=amount;
        else free+=amount;
      }
      if(e.type==='purchase'){
        if(target==='loan'){loans.push({balance:amount,rate:Number(e.loanRate)||0,payment:loanPayment(amount,Number(e.loanRate)||0,Number(e.loanYears)||5),left:Math.round((Number(e.loanYears)||5)*12),start:m});}
        else if(target.startsWith('goal:')&&goalById(target.slice(5))){const g=goalById(target.slice(5)),take=Math.min(g.saved,amount);g.saved-=take;free-=amount-take;}
        else free-=amount;
      }
    }
    // Planned goal deposits (with deposit-change events) until each goal is reached or due.
    const extra=new Map(),shareAll=events.filter(e=>e.type==='deposit'&&active(e,m)&&(!e.goal||e.goal==='all')).reduce((s,e)=>s+(Number(e.amount)||0),0);
    for(const e of events)if(e.type==='deposit'&&active(e,m)&&e.goal&&e.goal!=='all')extra.set(e.goal,(extra.get(e.goal)||0)+(Number(e.amount)||0));
    const open=goals.filter(g=>month<=g.end&&!(g.target&&g.saved>=g.target)),base=open.reduce((s,g)=>s+g.monthly,0);
    for(const g of open){
      const share=shareAll?(base>0?g.monthly/base:1/open.length)*shareAll:0;
      let deposit=Math.max(0,g.monthly+(extra.get(g.id)||0)+share);
      if(g.target)deposit=Math.min(deposit,g.target-g.saved);
      g.saved+=deposit;free-=deposit;
      if(g.target&&g.achieved==null&&g.saved>=g.target-.005)g.achieved=m;
    }
    for(const g of goals)if(g.target&&g.achieved==null&&g.saved>=g.target-.005)g.achieved=m;
    free+=net;investments*=growth;
    const debt=debts.reduce((s,x)=>s+x.balance,0)+loans.reduce((s,x)=>s+x.balance,0),goalsTotal=goals.reduce((s,g)=>s+g.saved,0);
    points.push({month:m,label:new Date(month+'-01T12:00:00').toLocaleDateString('he-IL',{month:'short',year:'2-digit'}),free,goals:goalsTotal,investments,debt,netWorth:free+goalsTotal+investments-debt});
    if(free<lowest.free)lowest={month:m,free};
    if(free<0&&negative==null)negative=m;
  }
  points[0].netWorth=points[0].free+points[0].goals+points[0].investments-points[0].debt;
  return {surplus,points,final:points.at(-1),lowest,negative,goals:goals.map(g=>({id:g.id,name:g.name,target:g.target,saved:g.saved,achieved:g.achieved,achievedMonth:g.achieved!=null?monthOffset(nowMonth,g.achieved):null,end:g.end,missedDeadline:g.achieved==null&&g.end<=monthOffset(nowMonth,horizon)})),horizon,nowMonth};
}

export function compareScenario(d,events,options={}){
  const baseline=simulatePlan(d,[],options),scenario=simulatePlan(d,events,options);
  const goals=baseline.goals.map((g,i)=>{const s=scenario.goals[i];return {...g,baseline:g.achieved,scenario:s.achieved,scenarioMissed:s.missedDeadline,baselineMonth:g.achievedMonth,scenarioMonth:s.achievedMonth,delta:g.achieved!=null&&s.achieved!=null?s.achieved-g.achieved:null,savedAtEnd:{baseline:g.saved,scenario:s.saved}};});
  return {baseline,scenario,goals,freeDelta:scenario.final.free-baseline.final.free,netWorthDelta:scenario.final.netWorth-baseline.final.netWorth};
}
