import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,demoData} from './data.js';
import {simulatePlan,compareScenario} from './scenario.js';

const near=(a,b,eps=.01)=>assert.ok(Math.abs(a-b)<=eps,`${a} ≉ ${b}`);
const NOW='2026-10-11';
function plan(){
  const d=emptyData();
  d.accounts=[{id:'bank',name:'עו״ש',kind:'bank',currency:'ILS',balance:20000},{id:'sav',name:'חיסכון',kind:'savings',currency:'ILS',balance:6000}];
  for(const m of ['2026-07','2026-08','2026-09']){d.transactions.push({id:'i'+m,type:'income',amount:12000,currency:'ILS',date:m+'-01',category:'משכורת',subcategory:'',accountId:'bank',description:'משכורת',tags:[],recurring:false},{id:'e'+m,type:'expense',amount:8000,currency:'ILS',date:m+'-05',category:'חשבונות',subcategory:'',accountId:'bank',description:'הוצאות',tags:[],recurring:false});}
  d.goals=[{id:'trip',name:'טיול',type:'חופשה',target:12000,saved:0,monthly:1000,date:'2029-01-01',accountId:'sav'}];
  return d;
}

test('baseline follows the monthly surplus and goal deposits',()=>{
  const r=simulatePlan(plan(),[],{horizon:12,annualReturn:0,now:NOW});
  near(r.surplus,4000);
  assert.equal(r.goals[0].achieved,6,'6,000 saved + 6 × 1,000 reaches 12,000');
  assert.equal(r.goals[0].achievedMonth,'2027-04');
  near(r.final.free,20000+12*4000-6000);
  near(r.final.goals,12000);
  assert.equal(r.points.length,13);
});

test('a grant to a goal brings its date forward; a purchase from free money lowers it',()=>{
  const d=plan();
  const grant=compareScenario(d,[{type:'grant',amount:3000,month:1,target:'goal:trip'}],{horizon:12,annualReturn:0,now:NOW});
  assert.equal(grant.goals[0].baseline,6);assert.equal(grant.goals[0].scenario,3);assert.equal(grant.goals[0].delta,-3);
  const car=compareScenario(d,[{type:'purchase',amount:30000,month:2,target:'free'}],{horizon:12,annualReturn:0,now:NOW});
  near(car.freeDelta,-30000);
  assert.equal(car.scenario.negative,2,'free money goes negative the month of the purchase');
});

test('a purchase on a loan spreads the cost; running costs are monthly',()=>{
  const d=plan();
  const r=compareScenario(d,[{type:'purchase',amount:60000,month:1,funding:'loan',loanRate:0,loanYears:5,monthlyCost:500}],{horizon:12,annualReturn:0,now:NOW});
  near(r.freeDelta,-(11*1000+11*500));
  near(r.scenario.final.debt,60000-11*1000);
  assert.equal(r.scenario.negative,null);
});

test('deposit changes and income changes move goals and free money',()=>{
  const d=plan();
  const faster=compareScenario(d,[{type:'deposit',amount:1000,month:1,goal:'trip'}],{horizon:12,annualReturn:0,now:NOW});
  assert.equal(faster.goals[0].scenario,3);
  const raise=compareScenario(d,[{type:'income',amount:2000,month:4}],{horizon:12,annualReturn:0,now:NOW});
  near(raise.freeDelta,9*2000);
  const rent=compareScenario(d,[{type:'expense',amount:1500,month:1,duration:6}],{horizon:12,annualReturn:0,now:NOW});
  near(rent.freeDelta,-6*1500);
});

test('purchase funded from a goal takes its savings first',()=>{
  const d=plan();
  const r=compareScenario(d,[{type:'purchase',amount:8000,month:1,funding:'goal:trip'}],{horizon:24,annualReturn:0,now:NOW});
  assert.ok(r.goals[0].scenario>r.goals[0].baseline,'goal reached later');
  assert.ok(r.scenario.final.free<r.baseline.final.free,'the part beyond the goal savings comes from free money');
});

test('demo plan runs with investments growth and debt paydown',()=>{
  const r=compareScenario(demoData(),[{type:'grant',amount:15000,month:1,target:'free'}],{horizon:36,annualReturn:5,now:NOW});
  near(r.freeDelta,15000);
  assert.ok(r.baseline.final.investments>r.baseline.points[0].investments);
  assert.ok(r.baseline.final.debt<r.baseline.points[0].debt);
  assert.equal(r.goals.length,3);
});
