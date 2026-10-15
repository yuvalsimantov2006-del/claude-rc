import test from 'node:test';
import assert from 'node:assert/strict';
import {DISCHARGE_FACTS,normalizeBenefits,dischargeMonthOf,dischargeDay,soldierPoints,reservePoints,creditPoints,releaseGrantEstimate,depositEstimate,workGrantStatus,refundYears,benefitAlerts,bnAddMonths,bnWeakest} from './benefits.js';

const near=(a,b,eps=.0001)=>assert.ok(Math.abs(a-b)<=eps,`${a} ≈ ${b}`);
const man32={gender:'m',serviceKind:'army',track:'combat',dischargeDate:'2026-08-31',monthsServed:32};
const ids=list=>list.map(a=>a.id);

test('reserve tiers for tax years 2026–2027',()=>{
  for(const [days,points] of [[0,0],[29,0],[30,.5],[39,.5],[40,.75],[49,.75],[50,1],[54,1],[55,1.25],[60,1.5],[109,3.75],[110,4],[200,4]])
    assert.equal(reservePoints(days,2026).points,points,`${days} days`);
  assert.equal(reservePoints(45,2027).points,.75);
  assert.equal(reservePoints(45,2026).status,'partly');
  assert.deepEqual([reservePoints(110,2028).points,reservePoints(110,2028).status],[0,'unknown']);
  assert.equal(reservePoints(110,2025).status,'unknown');
  assert.equal(reservePoints('abc',2026).points,0);
});

test('discharged-soldier points: 36 months after the discharge month, split by calendar year',()=>{
  const per={2026:2/3,2027:2,2028:2,2029:4/3,2030:0,2025:0};
  for(const [y,p] of Object.entries(per))near(soldierPoints(man32,+y).points,p);
  assert.equal(soldierPoints(man32,2026).months,4);
  assert.equal(soldierPoints(man32,2029).months,8);
  const sum=[2025,2026,2027,2028,2029,2030].reduce((s,y)=>s+soldierPoints(man32,y).points,0);
  near(sum,6);
  assert.equal(soldierPoints(man32,2026).perYear,2);
  assert.equal(soldierPoints(man32,2026).status,'verified');
});

test('discharged-soldier tiers: full service by gender, shorter service, national service',()=>{
  assert.equal(soldierPoints({...man32,gender:'f',monthsServed:22},2027).perYear,2);
  assert.equal(soldierPoints({...man32,monthsServed:22},2027).perYear,1);
  assert.equal(soldierPoints({...man32,monthsServed:23},2027).perYear,2);
  assert.equal(soldierPoints({...man32,gender:null,monthsServed:22},2027).perYear,1,'unknown gender uses 23');
  assert.equal(soldierPoints({...man32,monthsServed:12},2027).perYear,1);
  assert.equal(soldierPoints({...man32,monthsServed:12},2027).status,'partly');
  const short=soldierPoints({...man32,monthsServed:11},2027);
  assert.equal(short.perYear,0);assert.equal(short.points,0);assert.match(short.note,/פחות מ־12 חודשים/);
  const monthOnly={gender:'m',serviceKind:'army',track:'combat',dischargeMonth:'2026-08',monthsServed:32};
  for(const y of [2026,2027,2028,2029])near(soldierPoints(monthOnly,y).points,soldierPoints(man32,y).points);
  const national=soldierPoints({gender:'f',serviceKind:'national',dischargeDate:'2026-08-31',monthsServed:24},2027);
  assert.equal(national.perYear,2);assert.equal(national.status,'conflicting');assert.match(national.note,/24 חודשים/);
  assert.equal(soldierPoints({serviceKind:'national',dischargeDate:'2026-08-31',monthsServed:18},2027).perYear,1);
  assert.equal(soldierPoints({serviceKind:'none'},2027).points,0);
  assert.equal(soldierPoints({...man32,dischargeDate:'2026-12-15'},2026).months,0,'December discharge starts next year');
  assert.equal(soldierPoints({...man32,dischargeDate:'2026-12-15'},2029).months,12);
});

test('credit points: base + soldier + reserve, monthly value and the weakest status',()=>{
  const c=creditPoints({...man32,reserveDays:{'2025':45}},2026);
  near(c.total,3.6667);near(c.monthly,887.33,.01);
  assert.equal(c.base,2.25);near(c.soldier,.6667);assert.equal(c.reserve,.75);
  assert.equal(c.status,'partly');assert.equal(c.asOf,'2026-10-14');
  assert.deepEqual(c.lines.map(l=>l.id),['base','soldier','reserve']);
  assert.equal(c.lines[1].label,'חייל/ת משוחרר/ת · 4 חודשים ב־2026');
  const woman=creditPoints({gender:'f',serviceKind:'none'},2026);
  assert.equal(woman.base,2.75);assert.equal(woman.total,2.75);assert.deepEqual(woman.lines.map(l=>l.id),['base']);
  const unknown=creditPoints({},2026);
  assert.equal(unknown.base,2.25);assert.match(unknown.lines[0].note,/2.25/);
  assert.equal(creditPoints({gender:'f',serviceKind:'national',dischargeDate:'2026-08-31',monthsServed:24},2027).status,'conflicting');
  assert.equal(bnWeakest(['verified','partly','conflicting']),'conflicting');
  assert.equal(DISCHARGE_FACTS.points.value*12,DISCHARGE_FACTS.points.yearValue);
});

test('release grant: months × rate for the track, statuses from FACTS',()=>{
  const combat=releaseGrantEstimate(man32);
  near(combat.amount,21982.72,.001);assert.equal(combat.status,'verified');assert.equal(combat.dueBy,'2026-10-30');
  near(releaseGrantEstimate({...man32,track:'support',monthsServed:20}).amount,11441,.001);
  const other=releaseGrantEstimate({...man32,track:'other',monthsServed:24});
  near(other.amount,10971.6,.001);assert.equal(other.status,'partly');
  assert.equal(releaseGrantEstimate({...man32,serviceKind:'national'}).eligible,false);
  assert.equal(releaseGrantEstimate({...man32,track:null}).eligible,false);
  assert.equal(DISCHARGE_FACTS.grant.asOf,'2026-07-01');
});

test('personal deposit: months × rate, available from day 14, released after 5 years',()=>{
  const dep=depositEstimate(man32);
  near(dep.amount,32002.56,.001);assert.equal(dep.eligible,true);
  assert.equal(dep.availableFrom,'2026-09-14');assert.equal(dep.releaseDate,'2031-08-31');
  assert.equal(depositEstimate({...man32,monthsServed:11}).eligible,false);
  assert.equal(depositEstimate({...man32,monthsServed:12}).eligible,true);
  near(depositEstimate({...man32,track:'support',monthsServed:12}).amount,10000.8,.001);
  const national=depositEstimate({serviceKind:'national',dischargeDate:'2026-08-31',monthsServed:24});
  assert.equal(national.eligible,true);assert.equal(national.amount,null,'no rate is known for national service');
  assert.equal(depositEstimate({...man32,dischargeDate:null,dischargeMonth:'2026-08'}).releaseDate,'2031-08-31','month only → last day');
  assert.equal(depositEstimate({...man32,dischargeDate:'2024-02-29'}).releaseDate,'2029-02-28');
});

test('required-work grant: target, 24-month window, 42-month claim deadline, amounts',()=>{
  const w=workGrantStatus(man32,'2026-10-14');
  assert.equal(w.windowEnd,'2028-08-31');assert.equal(w.claimBy,'2030-02-28');
  assert.equal(w.amount,11461);assert.equal(w.target,6);assert.equal(w.done,false);assert.equal(w.eligible,true);
  const agri=workGrantStatus({...man32,work:{months:4,agriculture:true}},'2026-10-14');
  assert.equal(agri.amount,7641);assert.equal(agri.target,4);assert.equal(agri.done,true);
  assert.equal(workGrantStatus({...man32,work:{months:9}},'2026-10-14').months,0,'out-of-range months are rejected');
  assert.equal(workGrantStatus({serviceKind:'none'},'2026-10-14').eligible,false);
  assert.equal(bnAddMonths('2026-01-31',1),'2026-02-28');assert.equal(bnAddMonths('2026-11-30',3),'2027-02-28');assert.equal(bnAddMonths('2026-05-15',-6),'2025-11-15');
});

test('discharge month and day: exact date, or the last day of the month',()=>{
  assert.equal(dischargeMonthOf(man32),'2026-08');
  assert.equal(dischargeDay({dischargeMonth:'2026-02'}),'2026-02-28');
  assert.equal(dischargeDay({dischargeMonth:'2028-02'}),'2028-02-29');
  assert.equal(dischargeDay({dischargeDate:'2026-08-10',dischargeMonth:'2026-03'}),'2026-08-10');
  assert.equal(dischargeDay({}),null);
});

test('refund years: soldier-point years within the last 6',()=>{
  assert.deepEqual(refundYears({...man32,dischargeDate:'2021-03-31'},'2026-10-14'),[2021,2022,2023,2024]);
  assert.deepEqual(refundYears({...man32,dischargeDate:'2018-06-30'},'2026-10-14'),[2020,2021]);
  assert.deepEqual(refundYears(man32,'2026-10-14'),[]);
  assert.deepEqual(refundYears({serviceKind:'none'},'2026-10-14'),[]);
});

test('bell reminders: grant, tax refund and its deadline, work window, deposit release',()=>{
  const d=b=>({benefits:b,accounts:[],annualChecks:{}});
  assert.ok(ids(benefitAlerts(d(man32),'2026-10-30')).includes('grant-late-2026-08'));
  assert.ok(!ids(benefitAlerts(d(man32),'2026-10-29')).includes('grant-late-2026-08'));
  assert.ok(!ids(benefitAlerts(d({...man32,grantReceived:'2026-10-01',grantAmount:21000}),'2026-10-30')).includes('grant-late-2026-08'));
  assert.ok(!ids(benefitAlerts(d(man32),'2027-03-01')).includes('grant-late-2026-08'),'not after 180 days');
  const late=benefitAlerts(d(man32),'2026-10-30').find(a=>a.id==='grant-late-2026-08');
  assert.equal(late.type,'reminders');assert.equal(late.action,'navigate:benefits');
  const in2021={...man32,dischargeDate:'2021-05-31'},in2019={...man32,dischargeDate:'2019-05-31'};
  assert.ok(ids(benefitAlerts(d(in2021),'2026-10-14')).includes('tax-refund-2026'));
  assert.ok(!ids(benefitAlerts(d(in2019),'2026-10-14')).includes('tax-refund-2026'));
  assert.ok(!ids(benefitAlerts({...d(in2021),annualChecks:{'tax-refund':{done:'2026-02-01'}}},'2026-10-14')).includes('tax-refund-2026'),'checked this year');
  assert.ok(ids(benefitAlerts({...d(in2021),annualChecks:{'tax-refund':{done:'2025-12-30'}}},'2026-10-14')).includes('tax-refund-2026'),'checked last year');
  const refund=benefitAlerts(d(in2021),'2026-10-14').find(a=>a.id==='tax-refund-2026');
  assert.deepEqual([refund.icon,refund.color,refund.title],['Banknote','green','ייתכן שמגיע לך החזר מס']);
  const in2018={...man32,dischargeDate:'2018-05-31'};
  const deadline=benefitAlerts(d(in2018),'2026-11-01').find(a=>a.id==='tax-deadline-2026');
  assert.ok(deadline);assert.equal(deadline.title,'עד 31.12.2026: אחרון לבקש החזר על 2020');assert.equal(deadline.color,'red');
  assert.ok(!ids(benefitAlerts(d(in2018),'2026-10-14')).includes('tax-deadline-2026'));
  assert.ok(!ids(benefitAlerts(d({...man32,dischargeDate:'2016-05-31'}),'2026-11-01')).includes('tax-deadline-2026'),'2020 had no soldier months');
  assert.deepEqual(benefitAlerts(d({serviceKind:'none',dischargeDate:'2021-05-31'}),'2026-11-01'),[]);
  assert.deepEqual(benefitAlerts(d({}),'2026-11-01'),[]);
  assert.ok(!ids(benefitAlerts(d({...in2021,monthsServed:8}),'2026-10-14')).includes('tax-refund-2026'),'no points, no refund reminder');
  // Required work: the window closes in ≤ 60 days, or the claim deadline in ≤ 90 days.
  const work={...man32,dischargeDate:'2024-08-31',work:{months:3}};
  assert.ok(ids(benefitAlerts(d(work),'2026-07-02')).includes('work-window-2026-08-31'));
  assert.equal(benefitAlerts(d(work),'2026-07-02').find(a=>a.id==='work-window-2026-08-31').title,'נשארו 60 ימים לצבור עבודה מועדפת');
  assert.ok(!ids(benefitAlerts(d(work),'2026-07-01')).includes('work-window-2026-08-31'));
  const claim={...man32,dischargeDate:'2023-03-31',work:{months:6}};
  assert.ok(ids(benefitAlerts(d(claim),'2026-08-01')).includes('work-claim-2026-09-30'));
  assert.ok(!ids(benefitAlerts(d({...claim,work:{months:6,claimed:'2026-07-01'}}),'2026-08-01')).includes('work-claim-2026-09-30'));
  // Deposit release in the next 60 days: from an account, or from the estimate.
  assert.ok(ids(benefitAlerts(d({...man32,dischargeDate:'2021-11-30'}),'2026-10-14')).includes('deposit-release-2026-11-30'));
  const acc={benefits:{},accounts:[{id:'p',kind:'deposit',releaseDate:'2026-12-01'}]};
  assert.deepEqual(ids(benefitAlerts(acc,'2026-10-14')),['deposit-release-2026-12-01']);
  assert.deepEqual(ids(benefitAlerts(acc,'2026-09-30')),[]);
  assert.deepEqual(benefitAlerts(null,'2026-10-14'),[]);
});

test('normalizeBenefits: garbage in, valid defaults out, never throws',()=>{
  const n=normalizeBenefits({gender:5,dischargeDate:'x',reserveDays:[],work:'x',points:{total:'a'},monthsServed:99,serviceKind:'navy'});
  assert.deepEqual([n.gender,n.dischargeDate,n.monthsServed,n.serviceKind,n.points],[null,null,null,null,null]);
  assert.deepEqual(n.reserveDays,{});assert.deepEqual(n.work,{months:0,agriculture:false,startMonth:null,claimed:null});
  for(const raw of [null,undefined,[],'x',5,{reserveDays:{'2025':'45',x:3,'2024':-1}}])assert.doesNotThrow(()=>normalizeBenefits(raw));
  assert.deepEqual(normalizeBenefits({reserveDays:{'2025':'45',x:3,'2024':-1}}).reserveDays,{'2025':45});
  const ok=normalizeBenefits({...man32,reserveDays:{'2025':45},points:{total:3.6667,month:'2026-10',at:'2026-10-14'},future:1});
  assert.equal(ok.dischargeDate,'2026-08-31');assert.equal(ok.points.total,3.6667);assert.equal(ok.future,1,'unknown keys are kept');
  assert.equal(normalizeBenefits({dischargeDate:'2026-02-30'}).dischargeDate,null);
});

test('every fact carries a date, a status and sources with an https link',()=>{
  for(const key of ['points','soldier','reserve','grant','deposit','work','refund']){
    const f=DISCHARGE_FACTS[key];
    assert.match(f.asOf,/^\d{4}-\d{2}-\d{2}$/,key);assert.ok(f.sources.length,key);
    for(const id of f.sources){const s=DISCHARGE_FACTS.sources[id];assert.ok(s,`${key}: ${id}`);assert.match(s.url,/^https:\/\//);assert.ok(['verified','partly','conflicting'].includes(s.status));}
  }
  assert.deepEqual(DISCHARGE_FACTS.grant.rates,{combat:686.96,support:572.05,other:457.15});
  assert.deepEqual(DISCHARGE_FACTS.deposit.rates,{combat:1000.08,support:833.40,other:666.72});
  assert.deepEqual([DISCHARGE_FACTS.work.full,DISCHARGE_FACTS.work.agriculture],[11461,7641]);
  assert.equal(DISCHARGE_FACTS.sources['btl-work'].domain,'btl.gov.il');
  assert.equal(DISCHARGE_FACTS.links.refund,'https://www.gov.il/he/service/itc135');
});
