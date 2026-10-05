import test from 'node:test';
import assert from 'node:assert/strict';
import {demoData,emptyData} from './data.js';
import {healthScore,detectRecurring,detectAnomalies,monthPace,monteCarlo,yearsToTarget,whatIfCut,suggestCategory,parseQuickEntry,shiftDate,nextMonthlyDate,daysInMonth,fireNumber} from './smart.js';

const NOW='2026-09-30';

test('health score is bounded and explains each factor',()=>{
  const h=healthScore(demoData(),'2026-09');
  assert.ok(h.score>=0&&h.score<=100);
  assert.equal(h.factors.length,5);
  assert.ok(h.factors.every(f=>f.tip&&f.score>=0&&f.score<=100));
  assert.ok(h.score>60,'demo profile is healthy');
});

test('health score on empty data does not throw',()=>{
  const h=healthScore(emptyData(),'2026-09');
  assert.ok(Number.isFinite(h.score));
});

test('recurring charges are detected with stable amounts',()=>{
  const d=demoData(),list=detectRecurring(d,'2026-09');
  const rent=list.find(r=>r.name==='שכר דירה');
  assert.ok(rent,'rent is detected');
  assert.ok(rent.months>=3);
  assert.equal(rent.nextDate,'2026-10-22');
  assert.ok(Math.abs(rent.annual-rent.average*12)<1e-6);
});

test('anomalies flag an unusual expense',()=>{
  const d=demoData();
  d.transactions.push({id:'big',type:'expense',amount:2600,currency:'ILS',date:'2026-09-20',category:'מסעדות',subcategory:'',accountId:'bank',description:'אירוע משפחתי',tags:[],recurring:false});
  const a=detectAnomalies(d,'2026-09');
  assert.ok(a.some(x=>x.kind==='transaction'&&x.id==='big'));
  assert.ok(a.some(x=>x.kind==='category'&&x.category==='מסעדות'));
});

test('month pace uses actual spend for past months and projects the current one',()=>{
  const d=demoData(),past=monthPace(d,'2026-08',NOW);
  assert.equal(past.projected,past.spent);
  const mid=monthPace(d,'2026-09','2026-09-10');
  assert.ok(mid.projected>=mid.spent);
  assert.equal(mid.method,'history');
});

test('monte carlo is deterministic and ordered',()=>{
  const a=monteCarlo({start:100000,monthly:2000,years:10,target:500000}),b=monteCarlo({start:100000,monthly:2000,years:10,target:500000});
  assert.deepEqual(a.final,b.final);
  assert.equal(a.points.length,11);
  for(const p of a.points)assert.ok(p.p10<=p.p50&&p.p50<=p.p90);
  assert.ok(a.probability>=0&&a.probability<=1);
  const flat=monteCarlo({start:1000,monthly:100,years:2,annualReturn:0,volatility:0,inflation:0});
  assert.ok(Math.abs(flat.final.p50-(1000+2400))<1e-6);
});

test('years to target and fire number',()=>{
  assert.equal(yearsToTarget(10,0,5),0);
  assert.equal(yearsToTarget(0,1000,12000,0,0),1);
  assert.equal(fireNumber(120000),3000000);
});

test('what-if cut computes the monthly difference',()=>{
  const r=whatIfCut(demoData(),'מסעדות',50,10,0,'2026-09');
  assert.ok(r.monthly>0);
  assert.ok(Math.abs(r.future-r.monthly*120)<1e-6);
});

test('category suggestions learn from history and keywords',()=>{
  const d=demoData();
  assert.equal(suggestCategory(d,'קפה עם חברים'),'מסעדות');
  assert.equal(suggestCategory(d,'תדלוק בפז'),'דלק');
  assert.equal(suggestCategory(d,'שופרסל דיל'),'קניות בסופר');
  assert.equal(suggestCategory(d,''),null);
});

test('quick entry parses Hebrew free text',()=>{
  const d=demoData();
  const a=parseQuickEntry('קפה 18 אתמול במזומן',d,NOW);
  assert.equal(a.amount,18);assert.equal(a.date,'2026-09-29');assert.equal(a.accountId,'cash');assert.equal(a.category,'מסעדות');assert.equal(a.type,'expense');assert.equal(a.description,'קפה');assert.ok(a.valid);
  const b=parseQuickEntry('משכורת 18,500 ₪',d,NOW);
  assert.equal(b.type,'income');assert.equal(b.amount,18500);assert.equal(b.accountId,'bank');
  const c=parseQuickEntry('טיסה לאילת 1.2 אלף 15/08',d,NOW);
  assert.equal(c.amount,1200);assert.equal(c.date,'2026-08-15');assert.equal(c.category,'נסיעות');
  const e=parseQuickEntry('סושי 92.5 לפני 3 ימים',d,NOW);
  assert.equal(e.amount,92.5);assert.equal(e.date,'2026-09-27');
  const f=parseQuickEntry('ספוטיפיי 20 דולר',d,NOW);
  assert.equal(f.currency,'USD');assert.equal(f.category,'בילויים');
  const g=parseQuickEntry('סתם טקסט',d,NOW);
  assert.equal(g.valid,false);
  const future=parseQuickEntry('מתנה 100 25/12',d,NOW);
  assert.equal(future.date,'2025-12-25','day without a year never lands in the future');
});

test('date helpers clamp month ends',()=>{
  assert.equal(shiftDate('2026-03-01',-1),'2026-02-28');
  assert.equal(nextMonthlyDate('2026-01-31'),'2026-02-28');
  assert.equal(daysInMonth('2028-02'),29);
});
