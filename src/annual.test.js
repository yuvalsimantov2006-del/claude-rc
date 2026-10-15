import test from 'node:test';
import assert from 'node:assert/strict';
import {ANNUAL_CHECKS,annualStatus,annualAlert,annualDueOn} from './annual.js';

const state=(checks,now,id)=>annualStatus({annualChecks:checks},now).items.find(i=>i.id===id).state;

test('the six checks, their ids and official URLs (a guard against typos in official domains)',()=>{
  assert.deepEqual(ANNUAL_CHECKS.map(c=>[c.id,c.url]),[
    ['credit-report','https://www.creditdata.org.il/publications/report/'],
    ['insurance','https://harb.cma.gov.il'],
    ['lost-money','https://itur.mof.gov.il'],
    ['pension','https://www.swiftness.co.il'],
    ['tax-refund','https://www.gov.il/he/service/itc135'],
    ['child-savings','https://www.btl.gov.il/benefits/children/HisahoLayeled/Pages/default.aspx']
  ]);
  assert.deepEqual(ANNUAL_CHECKS.map(c=>c.icon),['FileJson','ShieldCheck','Search','PiggyBank','Banknote','Gift']);
  assert.deepEqual(ANNUAL_CHECKS.map(c=>c.domain),['creditdata.org.il','harb.cma.gov.il','itur.mof.gov.il','swiftness.co.il','gov.il','btl.gov.il']);
  for(const c of ANNUAL_CHECKS){assert.ok(c.title&&c.why&&c.cost,c.id);assert.match(c.url,/^https:\/\//);}
});

test('calendar-year checks are due again on January 1',()=>{
  assert.equal(state({'credit-report':{done:'2025-12-30'}},'2026-01-02','credit-report'),'due');
  assert.equal(state({'credit-report':{done:'2025-12-30'}},'2025-12-31','credit-report'),'done');
  assert.equal(state({'tax-refund':{done:'2026-01-01'}},'2026-12-31','tax-refund'),'done');
  assert.equal(annualDueOn(ANNUAL_CHECKS[0],'2025-12-30'),'2026-01-01');
});

test('12-month checks are due on the same day a year later',()=>{
  assert.equal(state({insurance:{done:'2025-10-15'}},'2026-10-15','insurance'),'due');
  assert.equal(state({insurance:{done:'2025-10-15'}},'2026-10-14','insurance'),'done');
  assert.equal(annualDueOn(ANNUAL_CHECKS[1],'2024-02-29'),'2025-02-28');
});

test('skipped checks are never due; unchecked ones are; bad records are ignored',()=>{
  assert.equal(state({pension:{skip:true}},'2026-10-14','pension'),'skip');
  assert.equal(state({pension:{skip:true,done:'2020-01-01'}},'2026-10-14','pension'),'skip');
  assert.equal(state({},'2026-10-14','lost-money'),'due');
  assert.equal(state({'lost-money':{done:'nope'}},'2026-10-14','lost-money'),'due');
  assert.equal(annualStatus({},'2026-10-14').due,6);
  assert.equal(annualStatus({annualChecks:[]},'2026-10-14').due,6);
  const all=Object.fromEntries(ANNUAL_CHECKS.map(c=>[c.id,{done:'2026-10-01'}]));
  assert.equal(annualStatus({annualChecks:all},'2026-10-14').due,0);
});

test('annualAlert: id annual-YYYY, only when something is due and the data is at least 30 days old',()=>{
  const a=annualAlert({annualChecks:{}},'2026-10-14');
  assert.deepEqual([a.id,a.type,a.icon,a.color,a.action],['annual-2026','reminders','ClipboardCheck','blue','navigate:insights']);
  assert.equal(a.body,'6 בדיקות קצרות שעוד לא עשית השנה — דוח אשראי, הר הביטוח ועוד.');
  assert.equal(annualAlert({annualChecks:{},createdAt:'2026-09-20'},'2026-10-14'),null,'24 days old');
  assert.equal(annualAlert({annualChecks:{},createdAt:'2026-09-14'},'2026-10-14').id,'annual-2026','30 days old');
  const all=Object.fromEntries(ANNUAL_CHECKS.map(c=>[c.id,{skip:true}]));
  assert.equal(annualAlert({annualChecks:all},'2026-10-14'),null,'nothing due');
  assert.equal(annualAlert(null,'2026-10-14'),null);
});
