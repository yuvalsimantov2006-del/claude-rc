import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,demoData,materializeAll} from './data.js';
import {validateData,applyTransaction,balances,monthlySummary,categorySpend} from './finance.js';
import {freeMoney,effectiveGoalSavings} from './savings.js';
import {scheduledItems,monthlyFixed,cashflowForecast,safeToSpend,billHandled,findManualTwin,billNameMatch,billEndDate,billRemaining,billEnded,pendingConfirmations,confirmAutoAmount,holdAutoBill,dropAutoCard,pauseBill,resumeBill,makeBill,markBillPaid,nextBillDate,billKind,depositRoute,depositBillFor,goalDepositItems,materializeBills} from './money.js';

// Feature 4 (§B.6, §B.8 E10–E11) and the standing deposits: autopay bills become real rows on their date,
// and every derived number follows.
const near=(a,b,eps=.01)=>assert.ok(Math.abs(a-b)<=eps,`${a} ≉ ${b}`);
const acc=(id,kind,balance,extra={})=>({id,name:extra.name||id,institution:'',kind,currency:'ILS',balance,original:0,payment:0,interest:0,...extra});
const tx=(id,type,amount,date,accountId,extra={})=>({id,type,amount,currency:'ILS',date,category:extra.category||'קניות',subcategory:'',accountId,description:extra.description||id,tags:[],recurring:false,...extra});
function fixture(accounts,{rows=[],bills=[],goals=[],...extra}={}){const d={...emptyData(),fx:3.7,overallBudget:6000,...extra,accounts,bills,goals};for(const t of rows){applyTransaction(d,t);d.transactions.push(t);}return d;}
const bal=(d,id)=>d.accounts.find(a=>a.id===id).balance;
const bill=(id,extra={})=>({id,name:id,type:'expense',amount:100,currency:'ILS',frequency:'monthly',day:1,category:'חשבונות',accountId:'bank',autopay:true,paid:[],...extra});
const salary=extra=>bill('sal',{name:'משכורת',type:'income',amount:9000,day:10,category:'משכורת',confirm:true,recordedThrough:'2026-09-30',...extra});

test('E10 auto-recorded salary: recorded, confirmed with the real amount',()=>{
  const d=fixture([acc('bank','bank',5000)],{bills:[salary()]});
  const a=materializeAll(d,'2026-10-10');validateData(a);
  const t=a.transactions.find(x=>x.id==='bill-sal-2026-10-10');
  assert.ok(t);assert.equal(t.type,'income');assert.equal(t.amount,9000);assert.deepEqual(t.auto,{source:'bill',ref:'sal',date:'2026-10-10',confirm:true});
  assert.deepEqual(t.tags,['תשלום קבוע','אוטומטי']);
  assert.equal(a.bills[0].recordedThrough,'2026-10-10');assert.equal(bal(a,'bank'),14000);
  assert.deepEqual(pendingConfirmations(a).map(x=>x.id),['bill-sal-2026-10-10']);
  assert.equal(materializeAll(a,'2026-10-10'),a,'idempotent');
  assert.equal(materializeAll(a,'2026-10-25'),a,'nothing until the next occurrence');
  // "המשכורת נכנסה? כמה בדיוק?" → 8,650: the bank nets −350 and the prompt is gone.
  const c=structuredClone(a);assert.equal(confirmAutoAmount(c,'bill-sal-2026-10-10',8650),true);
  assert.equal(bal(c,'bank'),13650);assert.equal(c.transactions[0].auto.confirm,false);assert.equal(pendingConfirmations(c).length,0);
  near(monthlySummary(c,'2026-10').income,8650);validateData(c);
  const same=structuredClone(a);assert.equal(confirmAutoAmount(same,'bill-sal-2026-10-10',9000),false);assert.equal(bal(same,'bank'),14000);
  assert.throws(()=>confirmAutoAmount(structuredClone(a),'bill-sal-2026-10-10',0),/סכום חיובי/);
});

test('E10 a manual salary on 10/09 is the twin: no row, the occurrence is paid',()=>{
  const d=fixture([acc('bank','bank',5000)],{bills:[salary()],rows:[tx('m','income',8650,'2026-10-09','bank',{category:'משכורת',description:'משכורת אוקטובר'})]});
  const a=materializeAll(d,'2026-10-10');
  assert.equal(a.transactions.length,1);assert.deepEqual(a.bills[0].paid,['2026-10-10']);assert.equal(a.bills[0].recordedThrough,'2026-10-10');
  assert.equal(bal(a,'bank'),13650);
});

test('E10 "עוד לא נכנסה": the row goes away, the occurrence waits, paying it moves it to paid',()=>{
  const a=materializeAll(fixture([acc('bank','bank',5000)],{bills:[salary()]}),'2026-10-10');
  const h=structuredClone(a);holdAutoBill(h,'bill-sal-2026-10-10');
  assert.equal(bal(h,'bank'),5000);assert.equal(h.transactions.length,0);assert.deepEqual(h.bills[0].waiting,['2026-10-10']);validateData(h);
  const item=scheduledItems(h,'2026-10-01','2026-10-31','2026-10-12').find(x=>x.billId==='sal');
  assert.equal(item.paid,false);assert.equal(item.autopay,false);assert.equal(item.waiting,true);
  assert.equal(materializeAll(h,'2026-10-12'),h,'a waiting occurrence is not recorded again');
  markBillPaid(h,'sal','2026-10-10',{record:true,amount:9000,date:'2026-10-12',accountId:'bank'},'2026-10-12');
  assert.equal(h.bills[0].waiting,undefined);assert.deepEqual(h.bills[0].paid,['2026-10-10']);assert.equal(bal(h,'bank'),14000);
  assert.deepEqual(h.transactions[0].tags,['תשלום קבוע']);assert.equal(h.transactions[0].auto,undefined);
  assert.ok(billHandled(h.bills[0],'2026-10-10'));
  // The next month records as usual.
  const n=materializeAll(h,'2026-11-10');assert.ok(n.transactions.some(t=>t.id==='bill-sal-2026-11-10'));
  // A deposit or a card row cannot be put on hold; a card statement can be dropped.
  assert.throws(()=>holdAutoBill(structuredClone(a),'nope'),/כבר לא קיים/);
});

test('E11 pause and stop after N payments',()=>{
  const gym=bill('gym',{name:'מנוי לחדר כושר',amount:220,day:8,category:'כושר',recordedThrough:'2026-10-14'});
  assert.equal(billEndDate(gym,3,'2026-10-14'),'2027-01-08');
  gym.endDate=billEndDate(gym,3,'2026-10-14');assert.equal(billRemaining(gym,'2026-10-14'),3);
  let d=fixture([acc('bank','bank',5000)],{bills:[gym]});
  d=materializeAll(d,'2026-11-08');assert.ok(d.transactions.some(t=>t.id==='bill-gym-2026-11-08'));assert.equal(billRemaining(d.bills[0],'2026-11-08'),2);
  pauseBill(d,'gym','2026-11-20');assert.equal(d.bills[0].active,false);assert.equal(d.bills[0].pausedOn,'2026-11-20');validateData(d);
  assert.equal(materializeAll(d,'2026-12-31'),d,'12/08 is not recorded while paused');
  assert.equal(scheduledItems(d,'2026-12-01','2026-12-31','2026-11-20').filter(x=>x.billId==='gym').length,0);
  assert.equal(cashflowForecast(d,{days:60,now:'2026-11-20'}).items.filter(x=>x.billId==='gym').length,0);
  assert.equal(monthlyFixed(d,'2026-11-20'),0);
  resumeBill(d,'gym','2027-01-02');assert.equal(d.bills[0].recordedThrough,'2027-01-02');assert.equal(d.bills[0].active,true);assert.equal(d.bills[0].pausedOn,null);
  d=materializeAll(d,'2027-01-08');
  assert.deepEqual(d.transactions.filter(t=>t.auto).map(t=>t.date),['2026-11-08','2027-01-08']);
  assert.equal(billRemaining(d.bills[0],'2027-01-08'),0);assert.ok(billEnded(d.bills[0],'2027-01-08'));
  assert.equal(materializeAll(d,'2027-03-10'),d,'nothing after endDate');
  assert.equal(monthlyFixed(d,'2027-01-09'),0,'an ended bill leaves the fixed payments');
  assert.equal(billEndDate(gym,0),null);assert.equal(billEndDate(gym,''),null);
});

test('lazy init records nothing in the past, not even today',()=>{
  const d=fixture([acc('bank','bank',5000)],{bills:[bill('rent',{amount:4000,day:14}),bill('sal',{type:'income',amount:9000,day:1}),bill('manual',{autopay:false,day:3})]});
  const a=materializeAll(d,'2026-10-14');
  assert.equal(a.transactions.length,0);assert.equal(bal(a,'bank'),5000);
  assert.deepEqual(a.bills.map(b=>b.recordedThrough),['2026-10-14','2026-10-14',undefined]);
  assert.equal(materializeAll(a,'2026-10-14'),a);
  // The occurrences up to the through-date are handled: the agenda shows them as done, not overdue.
  assert.ok(scheduledItems(a,'2026-10-01','2026-10-14','2026-10-14').filter(x=>x.billId!=='manual').every(x=>x.paid));
  const b=materializeAll(a,'2026-11-14');
  assert.deepEqual(b.transactions.map(t=>t.id).sort(),['bill-rent-2026-11-14','bill-sal-2026-11-01']);
  assert.equal(bal(b,'bank'),5000+9000-4000);
  // The income defaults to confirm (the salary prompt); the expense does not.
  assert.deepEqual(b.transactions.map(t=>[t.type,t.auto.confirm]).sort(),[['expense',false],['income',true]]);
});

test('first-run salary (no recordedThrough, no confirm) is recorded from the next payday and asks how much',()=>{
  const setup=fixture([acc('bank','bank',3200)],{bills:[{id:'s1',name:'משכורת',type:'income',amount:8000,currency:'ILS',day:10,frequency:'monthly',category:'משכורת',accountId:'bank',autopay:true,active:true,paid:[]}]});
  const first=materializeAll(setup,'2026-10-17');assert.equal(first.transactions.length,0);assert.equal(first.bills[0].recordedThrough,'2026-10-17');
  const pay=materializeAll(first,'2026-11-10');
  assert.equal(bal(pay,'bank'),11200);assert.equal(pendingConfirmations(pay)[0].id,'bill-s1-2026-11-10');
  assert.ok(scheduledItems(pay,'2026-11-01','2026-11-30','2026-11-10').find(x=>x.billId==='s1').paid,'it no longer disappears from the agenda: it is done');
});

test('twin rules',()=>{
  const d=fixture([acc('bank','bank',5000)],{bills:[bill('el',{name:'חשמל',amount:100,day:10,category:'חשבונות'})]});
  const b=d.bills[0],add=t=>{d.transactions=[t];return findManualTwin(d,b,'2026-10-10');};
  assert.ok(add(tx('a','expense',130,'2026-10-14','bank',{category:'חשבונות',description:'משהו'})),'4 days and within max(20,35%)');
  assert.equal(add(tx('a','expense',136,'2026-10-14','bank',{category:'חשבונות'})),null,'over 35%');
  assert.equal(add(tx('a','expense',100,'2026-10-15','bank',{category:'חשבונות'})),null,'5 days');
  assert.ok(add(tx('a','expense',115,'2026-10-08','bank',{category:'דיור',description:'חברת החשמל'})),'another category, matching name');
  assert.equal(add(tx('a','expense',100,'2026-10-10','bank',{category:'דיור',description:'גז'})),null);
  assert.equal(add(tx('a','income',100,'2026-10-10','bank',{category:'חשבונות'})),null,'another type');
  assert.equal(add(tx('a','expense',100,'2026-10-10','bank',{category:'חשבונות',auto:{source:'bill',ref:'x',date:'2026-10-10'}})),null,'an auto row is never a twin');
  // Small amounts: the 20 ₪ floor.
  b.amount=30;assert.ok(add(tx('a','expense',49,'2026-10-10','bank',{category:'חשבונות'})));
  assert.ok(billNameMatch('נטפליקס חודשי','Netflix נטפליקס'));assert.ok(billNameMatch('ארנונה','ארנונה עירייה'));assert.equal(billNameMatch('גז','חשמל'),false);assert.equal(billNameMatch('',''),false);
});

test('paused bills leave scheduledItems; ended bills leave monthlyFixed',()=>{
  const d=fixture([acc('bank','bank',5000)],{bills:[bill('a',{amount:300,active:false,pausedOn:'2026-10-01'}),bill('b',{amount:200,endDate:'2026-09-01'}),bill('c',{amount:100})]});
  assert.deepEqual([...new Set(scheduledItems(d,'2026-10-01','2026-12-31','2026-10-14').map(x=>x.billId))],['c']);
  near(monthlyFixed(d,'2026-10-14'),100);
});

test('4.0 data loads byte-identical except recordedThrough',()=>{
  const F=demoData();delete F.installments;delete F.createdAt;F.demo=false;for(const t of F.transactions)t.recurring=false;
  const text=JSON.stringify(F),out=materializeAll(validateData(structuredClone(F)),'2026-10-14');
  assert.notEqual(JSON.stringify(out),text);
  for(const b of out.bills)delete b.recordedThrough;
  assert.equal(JSON.stringify(out),text);
});

test('materializeAll order: a bill paid by card is recorded before that card\'s statement',()=>{
  const d=fixture([acc('bank','bank',6000),acc('max','credit',0,{name:'מקס',billingDay:10,payFrom:'bank',statementsThrough:'2026-09-25'})],{bills:[bill('nf',{name:'נטפליקס',amount:55,day:5,category:'בילויים',accountId:'max',recordedThrough:'2026-10-01'})]});
  const a=materializeAll(d,'2026-10-10');
  assert.ok(a.transactions.some(t=>t.id==='bill-nf-2026-10-05'&&t.accountId==='max'));
  const s=a.transactions.find(t=>t.id==='card-max-2026-10-10');assert.equal(s.amount,55);
  assert.equal(bal(a,'bank'),5945);assert.equal(bal(a,'max'),0);
  near(monthlySummary(a,'2026-10').expenses,55);   // the card purchase counts once, the statement never
  // The card statement prompt can be dropped: the amount stays owed.
  const c=structuredClone(a);assert.equal(pendingConfirmations(c)[0].id,'card-max-2026-10-10');dropAutoCard(c,'card-max-2026-10-10');
  assert.equal(bal(c,'bank'),6000);assert.equal(bal(c,'max'),55);assert.throws(()=>dropAutoCard(c,'bill-nf-2026-10-05'),/כרטיס/);assert.throws(()=>holdAutoBill(c,'card-max-2026-10-10'),/כבר לא קיים/);
});

test('deterministic and idempotent: two devices produce identical records',()=>{
  const make=()=>fixture([acc('bank','bank',5000),acc('sav','savings',1000)],{bills:[salary(),bill('dep',{name:'הפקדה לחיסכון',kind:'transfer',toAccountId:'sav',amount:500,day:1,category:'העברה',confirm:false,recordedThrough:'2026-09-30'})]});
  const one=materializeAll(make(),'2026-12-15'),two=materializeAll(make(),'2026-12-15');
  assert.equal(JSON.stringify(one),JSON.stringify(two));
  assert.deepEqual(one.transactions.map(t=>t.id).sort(),['bill-dep-2026-10-01','bill-dep-2026-11-01','bill-dep-2026-12-01','bill-sal-2026-10-10','bill-sal-2026-11-10','bill-sal-2026-12-10']);
  assert.equal(materializeAll(one,'2026-12-15'),one);
  // A deleted auto row is not recreated.
  const t=one.transactions.find(x=>x.id==='bill-dep-2026-11-01');applyTransaction(one,t,-1);one.transactions=one.transactions.filter(x=>x!==t);
  assert.equal(materializeAll(one,'2026-12-15'),one);
});

// ---------- Everything stays connected ----------
test('fixed income on the 1st: checking, month income, forecast, safe-to-spend and net worth follow',()=>{
  const d=fixture([acc('bank','bank',4000,{name:'עו״ש'}),acc('cash','cash',300)],{bills:[bill('allow',{name:'דמי כיס',type:'income',amount:1000,day:1,category:'משכורת',recordedThrough:'2026-10-17'})]});
  const before={bank:bal(d,'bank'),income:monthlySummary(d,'2026-11').income,start:cashflowForecast(d,{now:'2026-11-01'}).start,net:balances(d).net,cash:balances(d).cash};
  const a=materializeAll(d,'2026-11-01');validateData(a);
  assert.equal(bal(a,'bank'),before.bank+1000);
  assert.equal(monthlySummary(a,'2026-11').income,before.income+1000);
  assert.equal(monthlySummary(a,'2026-11').expenses,0);
  assert.equal(cashflowForecast(a,{now:'2026-11-01'}).start,before.start+1000);
  assert.equal(balances(a).net,before.net+1000);assert.equal(balances(a).cash,before.cash+1000);
  // Safe to spend counts the income once: as expected before it lands, as money in the bank after.
  assert.equal(safeToSpend(d,'2026-11-01').cash,safeToSpend(a,'2026-11-01').cash);
  assert.ok(scheduledItems(a,'2026-11-01','2026-11-01','2026-11-01')[0].paid);
  // The next month is still in the forecast as income; the budgets do not see it.
  const f=cashflowForecast(a,{days:45,now:'2026-11-01',includeVariable:false});
  near(f.months.find(m=>m.month==='2026-12').income,1000);assert.equal(categorySpend(a,'משכורת','2026-11'),0);
  assert.equal(pendingConfirmations(a)[0].auto.confirm,true,'income asks "כמה בדיוק?" by default');
});

test('a monthly 500 ₪ goal deposit: checking −500, savings +500, goal +500, month summary unchanged',()=>{
  const goal={id:'g',name:'קרן חירום',type:'קרן חירום',target:20000,saved:0,monthly:500,date:'2027-12-01',accountId:'sav'};
  const dep=bill('dep',{name:'הפקדה לקרן חירום',kind:'transfer',goalId:'g',toAccountId:'',amount:500,day:1,category:'העברה',confirm:false,recordedThrough:'2026-10-17'});
  const d=fixture([acc('bank','bank',4000),acc('sav','savings',10000)],{bills:[dep],goals:[goal],rows:[tx('food','expense',600,'2026-11-01','bank',{category:'קניות בסופר'})]});
  validateData(d);
  const before={summary:monthlySummary(d,'2026-11'),net:balances(d).net,goal:effectiveGoalSavings(d,d.goals[0]),free:freeMoney(d)};
  const a=materializeAll(d,'2026-11-01');validateData(a);
  assert.equal(bal(a,'bank'),3400-500+600-600);assert.equal(bal(a,'sav'),10500);
  assert.equal(effectiveGoalSavings(a,a.goals[0]),before.goal+500);
  assert.deepEqual(monthlySummary(a,'2026-11'),before.summary);
  assert.equal(balances(a).net,before.net);
  near(freeMoney(a).free+freeMoney(a).allocated,before.free.free+before.free.allocated);
  const t=a.transactions.find(x=>x.id==='bill-dep-2026-11-01');
  assert.deepEqual([t.type,t.accountId,t.toAccountId,t.toAmount,t.goalId,t.category,t.auto.confirm],['transfer','bank','sav',500,'g','העברה',false]);
  assert.equal(pendingConfirmations(a).length,0);
  // Never income or spending: budgets, fixed payments and the budget side of safe-to-spend ignore it.
  assert.equal(monthlyFixed(a,'2026-11-01'),0);
  const item=scheduledItems(a,'2026-12-01','2026-12-31','2026-11-01')[0];
  assert.deepEqual([item.type,item.source,item.liquid,item.goalId,item.toAccountId],['transfer','bill',-500,'g','sav']);
  // The forecast moves 500 out of the bank on 12/01 as a deposit, once: the goal's planned deposit is the bill.
  assert.equal(goalDepositItems(a,'2026-11-02','2027-01-31','2026-11-01').length,0);
  const f=cashflowForecast(a,{days:45,now:'2026-11-01',includeVariable:false});
  const dec=f.months.find(m=>m.month==='2026-12');near(dec.deposits,500);near(dec.fixed,0);near(dec.income,0);near(f.end,f.start-500);
  // Safe to spend: the budget side ignores the deposit, the cash side keeps the money for it.
  const mid=fixture([acc('bank','bank',4000),acc('sav','savings',10000)],{bills:[{...dep,day:20}],goals:[goal]});
  const s=safeToSpend(mid,'2026-11-15');near(s.depositDue,500);near(s.available,6000);near(s.cash,3500);
});

test('standing deposits: fixed allocation, unlinked goals, a plain savings account and USD',()=>{
  const linked={id:'g',name:'רכב',target:30000,saved:0,monthly:500,date:'2027-12-01',accountId:'sav',allocation:3000};
  const d=fixture([acc('bank','bank',4000),acc('sav','savings',10000)],{goals:[linked],bills:[bill('dep',{kind:'transfer',goalId:'g',amount:500,category:'העברה',recordedThrough:'2026-10-17'})]});
  const a=materializeAll(d,'2026-11-01');assert.equal(a.goals[0].allocation,3500);assert.equal(effectiveGoalSavings(a,a.goals[0]),3500);
  // An unlinked goal with a destination account: a transfer, and "כבר בחיסכון" grows.
  const trip={id:'t',name:'טיול',target:8000,saved:1000,monthly:300,date:'2027-08-01',accountId:''};
  const u=materializeAll(fixture([acc('bank','bank',4000),acc('sav','savings',0)],{goals:[trip],bills:[bill('dep',{kind:'transfer',goalId:'t',toAccountId:'sav',amount:300,category:'העברה',recordedThrough:'2026-10-17'})]}),'2026-11-01');
  assert.deepEqual([bal(u,'bank'),bal(u,'sav'),u.goals[0].saved],[3700,300,1300]);assert.equal(u.transactions[0].goalId,'t');
  // Without a destination: only the goal grows (as "הפקדתי עכשיו"); no row, still once per occurrence.
  const g=materializeAll(fixture([acc('bank','bank',4000)],{goals:[trip],bills:[bill('dep',{kind:'transfer',goalId:'t',toAccountId:'',amount:300,category:'העברה',recordedThrough:'2026-10-17'})]}),'2026-12-01');
  assert.deepEqual([bal(g,'bank'),g.goals[0].saved,g.transactions.length],[4000,1600,0]);assert.equal(materializeAll(g,'2026-12-01'),g);
  assert.equal(scheduledItems(g,'2027-01-01','2027-01-31','2026-12-01')[0].liquid,0);
  // A plain savings account; the goal on that account then has no planned deposit of its own.
  const p=fixture([acc('bank','bank',4000),acc('sav','savings',0)],{goals:[{...linked,allocation:undefined}],bills:[bill('dep',{kind:'transfer',toAccountId:'sav',amount:250,category:'העברה',recordedThrough:'2026-10-17'})]});
  const pa=materializeAll(p,'2026-11-01');assert.deepEqual([bal(pa,'bank'),bal(pa,'sav')],[3750,250]);
  assert.equal(goalDepositItems(pa,'2026-11-02','2027-02-01','2026-11-01').length,0);
  assert.equal(depositBillFor(pa,{accountId:'sav'}).id,'dep');assert.equal(depositBillFor(pa,{goalId:'g'}),null);
  // From a USD savings account into a shekel account: converted at the day's rate, rounded to cents.
  const usd=materializeAll(fixture([acc('usd','savings',1000,{currency:'USD'}),acc('bank','bank',0)],{bills:[bill('dep',{kind:'transfer',accountId:'usd',toAccountId:'bank',amount:370,category:'העברה',recordedThrough:'2026-10-17'})]}),'2026-11-01');
  assert.deepEqual([usd.transactions[0].amount,usd.transactions[0].currency,usd.transactions[0].toAmount],[100,'USD',370]);
  // A deposit whose account is gone waits (nothing recorded, the through-date stays) and the table can say why.
  const gone=fixture([acc('bank','bank',4000)],{bills:[bill('dep',{kind:'transfer',toAccountId:'sav',amount:250,category:'העברה',recordedThrough:'2026-10-17'})]});
  assert.equal(materializeAll(gone,'2026-11-01'),gone);assert.equal(depositRoute(gone,gone.bills[0]).problem,'חסר חשבון יעד');
  assert.equal(depositRoute(gone,{...gone.bills[0],toAccountId:'bank'}).problem,'חשבון היעד אינו מתאים');
});

test('a manual deposit around the date is the twin of a standing deposit',()=>{
  const d=fixture([acc('bank','bank',4000),acc('sav','savings',0)],{bills:[bill('dep',{kind:'transfer',toAccountId:'sav',amount:500,category:'העברה',recordedThrough:'2026-10-17'})],
    rows:[{...tx('m','transfer',500,'2026-10-30','bank'),category:'העברה',toAccountId:'sav',toAmount:500}]});
  const a=materializeAll(d,'2026-11-01');assert.equal(a.transactions.length,1);assert.deepEqual(a.bills[0].paid,['2026-11-01']);
});

test('makeBill: the three kinds, defaults, through-date and "how many are left"',()=>{
  const d=fixture([acc('bank','bank',4000),acc('sav','savings',0,{name:'חיסכון'}),acc('inv','investment',0)],{goals:[{id:'g',name:'קרן חירום',target:1,saved:0,monthly:500,date:'2027-12-01',accountId:'sav'},{id:'t',name:'טיול',target:1,saved:0,monthly:300,date:'2027-12-01',accountId:''},{id:'i',name:'פנסיה',target:1,saved:0,monthly:1,date:'2027-12-01',accountId:'inv'}]});
  const NOW='2026-10-17';
  const inc=makeBill(d,{kind:'income',name:'משכורת',amount:'9000',day:'1',frequency:'monthly',category:'משכורת',accountId:'bank',autopay:true,confirm:true},null,NOW);
  assert.deepEqual([billKind(inc),inc.type,inc.autopay,inc.confirm,inc.recordedThrough,'endDate' in inc],['income','income',true,true,NOW,false]);
  assert.equal(nextBillDate(inc,NOW),'2026-11-01');
  const dep=makeBill(d,{kind:'transfer',target:'goal:g',from:'bank',amount:'500',day:'1',frequency:'monthly',remaining:'12'},null,NOW);
  assert.deepEqual([dep.type,dep.kind,dep.goalId,dep.toAccountId,dep.accountId,dep.autopay,dep.confirm,dep.name,dep.endDate],['expense','transfer','g','','bank',true,false,'הפקדה לקרן חירום','2027-10-01']);
  const d2=structuredClone(d);d2.bills=[inc,dep];validateData(d2);   // a deposit bill passes the 4.0/4.1 bills validation
  const toAcc=makeBill(d,{kind:'transfer',target:'acc:sav',from:'bank',amount:'200',day:'5'},null,NOW);assert.deepEqual([toAcc.toAccountId,toAcc.goalId,toAcc.name],['sav',undefined,'הפקדה לחיסכון']);
  const unlinked=makeBill(d,{kind:'transfer',target:'goal:t',from:'bank',dest:'sav',amount:'300',day:'1'},null,NOW);assert.deepEqual([unlinked.goalId,unlinked.toAccountId],['t','sav']);
  assert.throws(()=>makeBill(d,{kind:'transfer',target:'goal:i',from:'bank',amount:'1',day:'1'},null,NOW),/תיק ההשקעות/);
  assert.throws(()=>makeBill(d,{kind:'transfer',target:'acc:bank',from:'bank',amount:'1',day:'1'},null,NOW),/אינו מתאים/);
  assert.throws(()=>makeBill(d,{kind:'transfer',target:'',from:'bank',amount:'1',day:'1'},null,NOW),/לאן להפקיד/);
  assert.throws(()=>makeBill(d,{kind:'expense',name:'',amount:'1',day:'1'},null,NOW),/שם/);
  assert.throws(()=>makeBill(d,{kind:'expense',name:'x',amount:'1',day:'32'},null,NOW),/בין 1 ל־31/);
  assert.throws(()=>makeBill(d,{kind:'expense',name:'x',amount:'1',day:'3',autopay:true,accountId:''},null,NOW),/בחר חשבון/);
  // Edits keep the through-date; switching autopay on restarts it; an empty "left" clears the end; 0 stops it.
  const manual={...makeBill(d,{kind:'expense',name:'ארנונה',amount:'900',day:'15',accountId:'bank',remaining:'3'},null,'2026-09-01'),recordedThrough:'2026-09-01'};
  assert.equal(manual.endDate,'2026-11-15');
  const kept=makeBill(d,{kind:'expense',name:'ארנונה',amount:'950',day:'15',accountId:'bank',remaining:''},manual,NOW);assert.deepEqual([kept.id,kept.recordedThrough,kept.endDate,kept.amount],[manual.id,'2026-09-01',null,950]);
  const auto=makeBill(d,{kind:'expense',name:'ארנונה',amount:'950',day:'15',accountId:'bank',autopay:true},manual,NOW);assert.equal(auto.recordedThrough,NOW);
  const stop=makeBill(d,{kind:'expense',name:'ארנונה',amount:'950',day:'15',accountId:'bank',remaining:'0'},manual,NOW);assert.equal(stop.endDate,'2026-10-16');assert.ok(billEnded(stop,NOW));
  // Switching an income bill to a deposit and back drops the deposit fields.
  const back=makeBill(d,{kind:'income',name:'x',amount:'1',day:'1',accountId:'bank'},dep,NOW);assert.equal(back.kind,undefined);assert.equal(back.goalId,undefined);assert.equal(back.type,'income');
});

test('markBillPaid records a standing deposit early and the date is then handled',()=>{
  const d=fixture([acc('bank','bank',4000),acc('sav','savings',0)],{bills:[bill('dep',{kind:'transfer',toAccountId:'sav',amount:500,category:'העברה',recordedThrough:'2026-10-17'})]});
  markBillPaid(d,'dep','2026-11-01',{record:true,amount:500,date:'2026-10-20',accountId:'bank'},'2026-10-20');
  assert.deepEqual([bal(d,'bank'),bal(d,'sav'),d.transactions[0].type],[3500,500,'transfer']);
  assert.equal(materializeAll(d,'2026-11-01').transactions.length,1,'the 11/01 occurrence is not recorded again');
  assert.equal(materializeBills(structuredClone(d),'2026-11-01'),true);
});

test('moving the day after this month was recorded does not record the month twice',()=>{
  const a=materializeAll(fixture([acc('bank','bank',5000)],{bills:[salary()]}),'2026-10-10');
  const moved=structuredClone(a);moved.bills[0]=makeBill(moved,{kind:'income',name:'משכורת',amount:'9000',day:'15',frequency:'monthly',category:'משכורת',accountId:'bank',autopay:true,confirm:true},moved.bills[0],'2026-10-12');
  const b=materializeAll(moved,'2026-10-20');
  assert.deepEqual(b.transactions.map(t=>t.id),['bill-sal-2026-10-10']);assert.ok(b.bills[0].paid.includes('2026-10-15'));assert.equal(bal(b,'bank'),14000);
  const c=materializeAll(b,'2026-11-15');assert.deepEqual(c.transactions.map(t=>t.id),['bill-sal-2026-10-10','bill-sal-2026-11-15']);
  // A deposit cannot be put on hold (it has no "כמה בדיוק?").
  const dep=materializeAll(fixture([acc('bank','bank',4000),acc('sav','savings',0)],{bills:[bill('dep',{kind:'transfer',toAccountId:'sav',amount:500,category:'העברה',recordedThrough:'2026-10-17'})]}),'2026-11-01');
  assert.throws(()=>holdAutoBill(dep,'bill-dep-2026-11-01'),/אפשר לדחות רק/);
});
