import test from 'node:test';
import assert from 'node:assert/strict';
import {demoData,emptyData} from './data.js';
import {validateData} from './finance.js';
import {IL_TAX_2026,incomeTax,marginalRate,netSalary,grossForNet,loanSchedule,loanByYear,debtPayoff,feeImpact,maaserSummary,expenseShares,groupBalances,settleUp,groupSummary,splitTotals,billOccurrences,scheduledItems,monthlyFixed,estimatedIncome,cashflowForecast,safeToSpend,purchaseCheck,wishStatus,wishlistSummary} from './money.js';

const near=(a,b,eps=.01)=>assert.ok(Math.abs(a-b)<=eps,`${a} ≉ ${b}`);
const NOW='2026-10-06';

test('2026 income-tax brackets are applied progressively',()=>{
  near(incomeTax(7010),701);
  near(incomeTax(10000),701+2990*.14);
  near(incomeTax(19000),701+3050*.14+8940*.2);
  near(incomeTax(70000),701+427+1788+6100*.31+21590*.35+13440*.47+9870*.5);
  assert.equal(marginalRate(18000),.2);assert.equal(marginalRate(25100),.31);assert.equal(marginalRate(25101),.35);assert.equal(marginalRate(1e6),.5);
});

test('net salary matches a hand-computed 10,000 ₪ payslip',()=>{
  const s=netSalary({gross:10000,creditPoints:2.25,pensionRate:.06});
  near(s.tax,1119.6-544.5-210);
  near(s.ni,7703*.0104+2297*.07);
  near(s.health,7703*.0323+2297*.0517);
  near(s.pension,600);
  near(s.net,10000-365.1-240.9012-367.5618-600,.02);
  assert.ok(s.effectiveRate>0&&s.effectiveRate<.2);
});

test('low salaries pay no income tax and insurance is capped',()=>{
  const low=netSalary({gross:5000,pensionRate:0});
  assert.equal(low.tax,0);near(low.ni+low.health,5000*.0427);
  const a=netSalary({gross:IL_TAX_2026.insurance.max}),b=netSalary({gross:IL_TAX_2026.insurance.max+20000});
  near(a.ni,b.ni);near(a.health,b.health);
  assert.throws(()=>netSalary({gross:-1}));
});

test('gross-for-net inverts the payslip',()=>{
  const gross=grossForNet(12000,{creditPoints:2.75,pensionRate:.06});
  const net=netSalary({gross,creditPoints:2.75,pensionRate:.06}).net;
  assert.ok(net>=12000&&net-12000<2,`net ${net}`);
});

test('spitzer loan payment and totals',()=>{
  const l=loanSchedule({principal:100000,annualRate:5,years:10});
  near(l.firstPayment,1060.66);
  assert.equal(l.months,120);
  near(l.rows.at(-1).balance,0);
  near(l.totalPaid,1060.66*120,1);
  const extra=loanSchedule({principal:100000,annualRate:5,years:10,extraMonthly:500});
  assert.ok(extra.months<l.months&&extra.totalInterest<l.totalInterest);
  const zero=loanSchedule({principal:12000,annualRate:0,years:1});
  near(zero.firstPayment,1000);near(zero.totalInterest,0);
});

test('equal-principal and CPI-linked schedules',()=>{
  const eq=loanSchedule({principal:120000,annualRate:6,years:10,method:'equal'});
  near(eq.rows[0].principal,1000);near(eq.rows[0].interest,600);
  assert.ok(eq.lastPayment<eq.firstPayment);
  const cpi=loanSchedule({principal:100000,annualRate:3,years:20,cpiLinked:true,inflation:3});
  const plain=loanSchedule({principal:100000,annualRate:3,years:20});
  assert.ok(cpi.totalIndexation>0&&cpi.maxPayment>cpi.firstPayment&&cpi.totalPaid>plain.totalPaid);
  near(cpi.rows.at(-1).balance,0,.05);
  assert.equal(loanByYear(plain.rows).length,20);
  assert.throws(()=>loanSchedule({principal:0,annualRate:3,years:5}));
});

test('debt avalanche never costs more interest than snowball',()=>{
  const debts=[{name:'אשראי',balance:8000,rate:18,payment:300},{name:'רכב',balance:25000,rate:6,payment:900},{name:'הלוואה קטנה',balance:2000,rate:9,payment:150}];
  const a=debtPayoff(debts,{extra:500,strategy:'avalanche'}),s=debtPayoff(debts,{extra:500,strategy:'snowball'});
  assert.ok(a.feasible&&s.feasible);
  assert.ok(a.totalInterest<=s.totalInterest+.01);
  assert.equal(s.order[0].name,'הלוואה קטנה');assert.equal(a.order[0].name,'אשראי');
  assert.ok(debtPayoff(debts,{extra:0}).months>a.months);
  const stuck=debtPayoff([{balance:10000,rate:24,payment:100}]);
  assert.equal(stuck.feasible,false);
  assert.equal(debtPayoff([]).months,0);
});

test('lower fees leave more money',()=>{
  const f=feeImpact({balance:100000,monthly:2000,years:30,annualReturn:5,accumulationFee:.5,depositFee:2,compareAccumulation:.15,compareDeposit:1});
  assert.ok(f.difference>0&&f.yours.fees>f.better.fees);
  assert.equal(f.yours.points.length,31);
  const free=feeImpact({balance:1000,monthly:0,years:1,annualReturn:0,accumulationFee:0,depositFee:0,compareAccumulation:0,compareDeposit:0});
  near(free.yours.final,1000);near(free.difference,0);
  assert.throws(()=>feeImpact({years:0}));
});

test('maaser tracks income and donations',()=>{
  const m=maaserSummary(demoData(),{year:'2026',rate:.1,categories:['תרומות']});
  near(m.income,18500*7);near(m.due,18500*.7);
  assert.ok(m.donated>1000&&m.remaining>0);near(m.taxCredit,m.donated*.35);
});

test('group balances sum to zero and settle in few transfers',()=>{
  const d=demoData(),eilat=d.groups[0],net=groupBalances(eilat);
  near(Object.values(net).reduce((s,v)=>s+v,0),0);
  near(net.me,1390);near(net['m-noa'],-370);near(net['m-omer'],-490);near(net['m-michal'],-530);
  const t=settleUp(net);
  assert.equal(t.length,3);assert.ok(t.every(x=>x.to==='me'));
  near(t.reduce((s,x)=>s+x.amount,0),1390);
  const home=groupSummary(d.groups[1]);
  near(home.myBalance,-55);assert.deepEqual(home.transfers,[{from:'me',to:'m-roni',amount:55}]);
  const totals=splitTotals(d);near(totals.owedToMe,1390);near(totals.iOwe,55);
  const exact=expenseShares(eilat,{amount:100,split:'exact',shares:{me:70,'m-noa':30}});
  assert.deepEqual(exact,{me:70,'m-noa':30});
});

test('settle-up handles many members with a single creditor chain',()=>{
  const t=settleUp({a:100,b:50,c:-60,d:-40,e:-50});
  near(t.reduce((s,x)=>s+x.amount,0),150);
  assert.ok(t.length<=4);
  const after={a:100,b:50,c:-60,d:-40,e:-50};for(const x of t){after[x.from]+=x.amount;after[x.to]-=x.amount;}
  for(const v of Object.values(after))near(v,0);
});

test('bill occurrences respect frequency, anchor and short months',()=>{
  assert.deepEqual(billOccurrences({frequency:'monthly',day:31},'2026-01-15','2026-04-30'),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
  assert.deepEqual(billOccurrences({frequency:'bimonthly',day:15,startMonth:'2026-01'},'2026-10-01','2027-01-31'),['2026-11-15','2027-01-15']);
  assert.deepEqual(billOccurrences({frequency:'yearly',day:1,startMonth:'2026-12'},'2026-10-01','2028-01-01'),['2026-12-01','2027-12-01']);
  assert.deepEqual(billOccurrences({frequency:'quarterly',day:5,startMonth:'2027-02'},'2026-10-01','2027-06-30'),['2027-02-05','2027-05-05']);
});

test('scheduled items include bills and unmaterialized recurring transactions',()=>{
  const d=emptyData();
  d.accounts=[{id:'bank',name:'עו״ש',kind:'bank',currency:'ILS',balance:5000}];
  d.transactions=[{id:'r',type:'expense',amount:300,currency:'ILS',date:'2026-08-12',category:'חשבונות',subcategory:'',accountId:'bank',description:'סלולר',tags:[],recurring:true}];
  d.transactions.push({...d.transactions[0],id:'r-9',recurring:false,recurringParent:'r',date:'2026-09-12'});
  d.bills=[{id:'b',name:'ארנונה',amount:900,day:20,frequency:'monthly',type:'expense',paid:['2026-10-20']}];
  validateData(d);
  const items=scheduledItems(d,'2026-09-01','2026-11-30');
  assert.deepEqual(items.map(x=>x.key),['b@2026-09-20','r@2026-10-12','b@2026-10-20','r@2026-11-12','b@2026-11-20']);
  assert.equal(items.find(x=>x.key==='b@2026-10-20').paid,true);
  near(monthlyFixed(d),1200);
});

test('cash-flow forecast finds the lowest point and overdraft date',()=>{
  const d=emptyData();
  d.accounts=[{id:'bank',name:'עו״ש',kind:'bank',currency:'ILS',balance:3000}];
  d.bills=[{id:'rent',name:'שכירות',amount:4000,day:10,frequency:'monthly',type:'expense'},{id:'sal',name:'משכורת',amount:9000,day:1,frequency:'monthly',type:'income'}];
  const f=cashflowForecast(d,{days:60,now:'2026-10-06'});
  assert.equal(f.overdraft,'2026-10-10');
  near(f.lowest.balance,-1000);assert.equal(f.lowest.date,'2026-10-10');
  near(f.end,3000-4000+9000-4000+9000,.01);
  assert.equal(f.points.length,61);assert.equal(f.estimatedIncome,false);
});

test('income is estimated from history when nothing is scheduled',()=>{
  const d=demoData();d.bills=[];
  const est=estimatedIncome(d,'2026-10-07','2026-12-05',NOW);
  assert.deepEqual(est.map(x=>x.date),['2026-11-01','2026-12-01']);
  near(est[0].amount,18500);
  const f=cashflowForecast(d,{days:60,now:NOW});
  assert.equal(f.estimatedIncome,true);
});

test('safe to spend subtracts the rest of the month fixed payments',()=>{
  const d=demoData(),s=safeToSpend(d,NOW);
  near(s.upcomingFixed,4500+220+23+680+620);
  near(s.available,12000-0-s.upcomingFixed);
  assert.equal(s.daysLeft,26);near(s.perDay,s.available/26);
});

test('purchase check gives a sensible verdict',()=>{
  const d=demoData();
  const small=purchaseCheck(d,{price:300,now:NOW}),huge=purchaseCheck(d,{price:60000,now:NOW}),split=purchaseCheck(d,{price:3600,installments:12,now:NOW});
  assert.equal(small.verdict,'green');assert.equal(huge.verdict,'red');
  near(split.monthlyCost,300);
  assert.ok(small.hours>0&&small.opportunity20>small.opportunity10&&small.opportunity10>300);
  assert.equal(small.goal.name,'קרן חירום');
  assert.throws(()=>purchaseCheck(d,{price:0}));
});

test('wishlist cooling-off status and totals',()=>{
  const d=demoData(),w=wishStatus(d.wishlist[0],NOW);
  assert.equal(w.ready,'2026-10-20');assert.equal(w.left,14);assert.equal(w.isReady,false);
  assert.equal(wishStatus(d.wishlist[1],NOW).isReady,true);
  const s=wishlistSummary(d);
  assert.equal(s.waiting,8350);assert.equal(s.skipped,3300);assert.equal(s.count,2);
});

test('cash-flow includes planned goal deposits and monthly summaries',async()=>{
  const {goalDepositItems}=await import('./money.js');
  const d=emptyData();
  d.accounts=[{id:'bank',name:'עו״ש',kind:'bank',currency:'ILS',balance:10000},{id:'sav',name:'חיסכון',kind:'savings',currency:'ILS',balance:0}];
  d.goals=[{id:'trip',name:'טיול',type:'חופשה',target:null,saved:0,monthly:1000,date:'2027-06-01',accountId:'sav'},{id:'pocket',name:'בצד',type:'מטרה אישית',target:null,saved:0,monthly:500,date:'2027-06-01',accountId:'bank'},{id:'car',name:'רכב',type:'רכב',target:1500,saved:0,monthly:1000,date:'2027-06-01',accountId:''}];
  const items=goalDepositItems(d,'2026-10-07','2027-01-31','2026-10-06');
  assert.deepEqual(items.filter(x=>x.goalId==='trip').map(x=>x.date),['2026-11-06','2026-12-06','2027-01-06']);
  assert.equal(items.some(x=>x.goalId==='pocket'),false,'money set aside inside the bank account does not leave it');
  assert.equal(items.filter(x=>x.goalId==='car').length,2,'deposits stop once the target is reached');
  const f=cashflowForecast(d,{days:90,now:'2026-10-06'});
  near(f.end,10000-2000-2000,.01);
  assert.equal(f.months.length,4);
  near(f.months[1].deposits,2000);
  near(f.months[0].start,10000);near(f.months.at(-1).end,f.end);
  const without=cashflowForecast(d,{days:90,now:'2026-10-06',includeGoals:false});
  near(without.end,10000);
  assert.equal(cashflowForecast(d,{days:365,now:'2026-10-06'}).points.length,366);
});
