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
