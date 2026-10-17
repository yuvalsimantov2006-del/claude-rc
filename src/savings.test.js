import test from 'node:test';
import assert from 'node:assert/strict';
import {savingsDepositDate,savingsDepositCount,savingsProjection,savingsProjectionSeries,effectiveGoalSavings} from './savings.js';
import {emptyData,demoData} from './data.js';
import {validateData} from './finance.js';

const goal=(overrides={})=>({id:'goal',name:'חיסכון',target:null,saved:10000,monthly:1000,date:'2027-10-05',accountId:'',...overrides});

test('blank target projects existing balance plus scheduled deposits',()=>{
  const r=savingsProjection(goal(),'2026-10-05');
  assert.equal(r.hasTarget,false);assert.equal(r.months,12);assert.equal(r.projected,22000);assert.equal(r.contributions,12000);assert.equal(r.firstDepositDate,'2026-11-05');
});
test('partial month does not invent a fractional or extra deposit',()=>{
  assert.equal(savingsDepositCount('2026-10-05','2027-10-04'),11);
  assert.equal(savingsProjection(goal({date:'2026-10-31'}),'2026-10-05').projected,10000);
});
test('month end keeps original anchor after a short month',()=>{
  assert.equal(savingsDepositDate('2026-01-31',1),'2026-02-28');
  assert.equal(savingsDepositDate('2026-01-31',2),'2026-03-31');
  assert.equal(savingsDepositCount('2026-01-31','2026-03-30'),1);
  assert.equal(savingsDepositCount('2026-01-31','2026-03-31'),2);
  assert.equal(savingsDepositCount('2028-01-31','2028-02-28'),0);
  assert.equal(savingsDepositCount('2028-01-31','2028-02-29'),1);
});
test('today, past date and zero deposits produce only existing savings',()=>{
  assert.equal(savingsProjection(goal({date:'2026-10-05'}),'2026-10-05').projected,10000);
  assert.equal(savingsProjection(goal({date:'2025-01-01'}),'2026-10-05').projected,10000);
  assert.equal(savingsProjection(goal({monthly:0}),'2026-10-05').projected,10000);
});
test('fixed target stays distinct from the computed forecast',()=>{
  const r=savingsProjection(goal({target:25000}),'2026-10-05');
  assert.equal(r.target,25000);assert.equal(r.projected,22000);assert.equal(r.needed,1250);assert.equal(r.progress,40);assert.equal(r.estimatedDate,'2028-01-05');
  const zero=savingsProjection(goal({target:25000,date:'2026-10-31'}),'2026-10-05');
  assert.equal(zero.needed,null);
});
test('zero balance and monthly amount never produce NaN or a false achievement',()=>{
  const r=savingsProjection(goal({saved:0,monthly:0}),'2026-10-05');
  assert.equal(r.projected,0);assert.equal(r.progress,0);assert.equal(r.hasTarget,false);
});
test('linked accounts use effective ILS balance; missing link retains manual balance',()=>{
  const d=emptyData();d.accounts.push({id:'usd',name:'dollar savings',kind:'savings',currency:'USD',balance:1000});d.fx=3.65;
  assert.equal(effectiveGoalSavings(d,goal({accountId:'usd'})),3650);
  assert.equal(effectiveGoalSavings(d,goal({accountId:'missing'})),10000);
  const demo=demoData();assert.equal(effectiveGoalSavings(demo,goal({accountId:'broker'})),257800);
});
test('old backups remain valid and optional targets round-trip as null',()=>{
  const d=demoData();assert.equal(validateData(d),d);
  d.goals.push(goal());assert.equal(validateData(JSON.parse(JSON.stringify(d))).goals.at(-1).target,null);
  d.goals.at(-1).target=0;assert.throws(()=>validateData(d));
});
test('invalid inputs are rejected before any saving',()=>{
  for(const target of [-1,0,Infinity,NaN,'invalid'])assert.throws(()=>savingsProjection(goal({target}),'2026-10-05'));
  assert.throws(()=>savingsProjection(goal({monthly:-1}),'2026-10-05'));
  assert.throws(()=>savingsProjection(goal({saved:Infinity}),'2026-10-05'));
  assert.throws(()=>savingsProjection(goal({date:'2026-02-30'}),'2026-10-05'));
});
test('projection series remains bounded and matches the projected final amount',()=>{
  const g=goal({date:'2076-10-05'}),rows=savingsProjectionSeries(g,'2026-10-05');
  assert.ok(rows.length<=20);assert.equal(rows.at(-1).value,savingsProjection(g,'2026-10-05').projected);
});

test('one account can fund several goals without double counting',async()=>{
  const {accountAllocations,freeMoney}=await import('./savings.js');
  const d=demoData();
  d.accounts.find(a=>a.id==='saving').balance=20000;
  d.goals=[{id:'e',name:'חירום',target:30000,saved:0,monthly:0,date:'2027-12-01',accountId:'saving',allocation:12000},{id:'t',name:'טיול',target:10000,saved:0,monthly:0,date:'2027-12-01',accountId:'saving',allocation:8000}];
  assert.equal(effectiveGoalSavings(d,d.goals[0]),12000);
  assert.equal(effectiveGoalSavings(d,d.goals[1]),8000);
  assert.equal(accountAllocations(d,'saving').free,0);
  d.goals[1].allocation=5000;
  assert.equal(accountAllocations(d,'saving').free,3000);
  assert.equal(freeMoney(d).total,26450+2000+3000+20000);
  d.accounts.find(a=>a.id==='saving').balance=10000;
  const info=accountAllocations(d,'saving');
  assert.equal(info.overAllocated,true);
  assert.ok(Math.abs(effectiveGoalSavings(d,d.goals[0])-10000*12/17)<1e-9,'scaled pro rata when the balance drops');
});

test('goals linked without an allocation share the remainder',()=>{
  const d=demoData();
  d.accounts.find(a=>a.id==='saving').balance=20000;
  d.goals=[{id:'a',name:'א',target:null,saved:0,monthly:0,date:'2027-12-01',accountId:'saving',allocation:5000},{id:'b',name:'ב',target:null,saved:0,monthly:0,date:'2027-12-01',accountId:'saving'},{id:'c',name:'ג',target:null,saved:0,monthly:0,date:'2027-12-01',accountId:'saving'}];
  assert.equal(effectiveGoalSavings(d,d.goals[1]),7500);
  assert.equal(effectiveGoalSavings(d,d.goals[2]),7500);
  assert.equal(effectiveGoalSavings(d,{id:'draft',accountId:'saving',allocation:'',saved:0}),5000,'a draft shares the remainder with the other unallocated goals');
});

test('a goal linked to an investment account uses that account\'s holdings, not the whole portfolio (4.1 containers)',async()=>{
  const {containerValue,portfolioValue}=await import('./finance.js');
  const d=demoData();
  d.accounts.push({id:'gemel',name:'גמל',institution:'',kind:'investment',invType:'gemel',currency:'ILS',balance:0,original:0,payment:0,interest:0});
  d.assets.push({id:'track',name:'מסלול',ticker:'',type:'קופת גמל להשקעה',currency:'ILS',quantity:0,averagePrice:0,invested:20000,currentPrice:0,currentValue:25000,mode:'value',date:'2026-09-30',notes:'',accountId:'gemel'});
  d.goals.push({id:'g4',name:'דירה',type:'דירה',target:100000,saved:0,date:'2030-01-01',monthly:0,accountId:'gemel'});
  assert.equal(effectiveGoalSavings(d,d.goals.at(-1)),25000);
  d.goals.push({id:'g5',name:'פרישה',type:'מטרה אישית',target:null,saved:0,date:'2040-01-01',monthly:0,accountId:'broker'});
  assert.equal(effectiveGoalSavings(d,d.goals.at(-1)),containerValue(d,'broker'));
  assert.ok(containerValue(d,'broker')<portfolioValue(d));
  validateData(d);
});
