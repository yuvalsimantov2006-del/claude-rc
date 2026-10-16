import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,demoData,materializeAll} from './data.js';
import {validateData,applyTransaction,accountDelta,balances,monthlySummary,categorySpend,plainText,TX_TYPES,ACCOUNT_KINDS,parseCSV} from './finance.js';
import {makeTransfer,transferProblem,goalDeposit,hasV41Content,addedRows,autoRecordedMessage,txTotals,transactionsCSV,parseTransactionsCSV,cleanImportedRow,createInstallmentPlan,materializeInstallments,planProgress,installmentAmount,cardStatementAmount,payOffPlan,removePlan} from './ledger.js';
import {freeMoney} from './savings.js';
import {cashflowForecast,safeToSpend,monthlyFixed,nextCardCharge,scheduledItems,maaserSummary} from './money.js';
import {parseQuickEntry,suggestCategory,detectRecurring,monthPace} from './smart.js';
import {simulatePlan} from './scenario.js';

// Intl puts a no-break space before ₪; compare sentences with plain spaces.
const text=v=>plainText(v).replace(/\u00a0/g,' ');
const near=(a,b,eps=.01)=>assert.ok(Math.abs(a-b)<=eps,`${a} ≉ ${b}`);
const NOW='2026-10-14';
const acc=(id,kind,balance,extra={})=>({id,name:extra.name||id,institution:'',kind,currency:'ILS',balance,original:0,payment:0,interest:0,...extra});
const tx=(id,type,amount,date,accountId,extra={})=>({id,type,amount,currency:'ILS',date,category:extra.category||'קניות',subcategory:'',accountId,description:extra.description||id,tags:[],recurring:false,...extra});
// Builds a fixture from emptyData(); rows are applied through the sign table like the app does.
function fixture(accounts,rows=[],extra={}){const d={...emptyData(),fx:3.7,...extra,accounts};for(const t of rows){applyTransaction(d,t);d.transactions.push(t);}return d;}
const book=(d,t)=>{applyTransaction(d,t);d.transactions.push(t);return t;};

test('E1 transfer between ILS accounts',()=>{
  const d=fixture([acc('bank','bank',5000),acc('cash','cash',300)]);
  const t=makeTransfer(d,{fromId:'bank',toId:'cash',amount:200,date:'2026-10-11'});
  assert.equal(transferProblem(d,t,NOW),'');
  assert.deepEqual([t.type,t.currency,t.toAmount,t.category,t.recurring],['transfer','ILS',200,'העברה',false]);
  book(d,t);validateData(d);
  assert.deepEqual(d.accounts.map(a=>a.balance),[4800,500]);
  const s=monthlySummary(d,'2026-10');assert.equal(s.income,0);assert.equal(s.expenses,0);
  assert.equal(balances(d).net,5300);
  applyTransaction(d,t,-1);d.transactions=d.transactions.filter(x=>x.id!==t.id);
  assert.deepEqual(d.accounts.map(a=>a.balance),[5000,300]);
});

test('E2 USD to ILS transfer and its edit',()=>{
  const d=fixture([acc('usd','savings',1000,{currency:'USD'}),acc('bank','bank',0)]);
  const before=balances(d).net;
  const t=makeTransfer(d,{fromId:'usd',toId:'bank',amount:500,fx:3.65,date:'2026-10-11'});
  assert.deepEqual({amount:t.amount,currency:t.currency,fx:t.fx,toAmount:t.toAmount},{amount:500,currency:'USD',fx:3.65,toAmount:1825});
  book(d,t);
  assert.deepEqual(d.accounts.map(a=>a.balance),[500,1825]);
  near(balances(d).net-before,-25);
  assert.equal(monthlySummary(d,'2026-10').expenses,0);
  const edited=makeTransfer(d,{fromId:'usd',toId:'bank',amount:400,fx:3.65,date:'2026-10-11'});edited.id=t.id;
  applyTransaction(d,t,-1);applyTransaction(d,edited);
  near(d.accounts[0].balance,600);near(d.accounts[1].balance,1460);
});

test('E3 loan payment and the debt cap',()=>{
  const d=fixture([acc('bank','bank',30000),acc('loan','debt',25500,{original:45000,payment:1250,interest:5.5})]);
  const pay=makeTransfer(d,{fromId:'bank',toId:'loan',amount:1250,date:'2026-10-11'});
  assert.equal(transferProblem(d,pay,NOW),'');book(d,pay);validateData(d);
  assert.equal(d.accounts[1].balance,24250);assert.equal(d.accounts[0].balance,28750);
  assert.equal(monthlySummary(d,'2026-10').expenses,0);
  const tooMuch=makeTransfer(d,{fromId:'bank',toId:'loan',amount:30000,date:'2026-10-11'});
  assert.equal(text(transferProblem(d,tooMuch,NOW)),'הסכום גבוה מיתרת החוב (24,250 ₪).');
  // Editing the 1,250 payment: its own effect is added back before the cap.
  const edit={...makeTransfer(d,{fromId:'bank',toId:'loan',amount:25500,date:'2026-10-11'}),editing:pay};
  assert.equal(transferProblem(d,edit,NOW),'');
  assert.equal(text(transferProblem(d,{...edit,toAmount:25501,amount:25501},NOW)),'הסכום גבוה מיתרת החוב (25,500 ₪).');
  // Kinds and dates.
  const fromLoan=makeTransfer(d,{fromId:'loan',toId:'bank',amount:10,date:'2026-10-11'});
  assert.match(transferProblem(d,fromLoan,NOW),/אי אפשר להעביר/);
  assert.match(transferProblem(d,makeTransfer(d,{fromId:'bank',toId:'bank',amount:10}),NOW),/חשבון יעד אחר/);
  assert.match(transferProblem(d,makeTransfer(d,{fromId:'bank',toId:'loan',amount:10,date:'2026-10-20'}),NOW),/תאריך/);
});

// E4 fixture: card "מקס" created 2026-09-25 owing 0, billing day 10, paid from the bank.
function cardFixture(){
  const d=fixture([acc('bank','bank',6000),acc('max','credit',0,{name:'מקס',institution:'ישראכרט',billingDay:10,payFrom:'bank',statementsThrough:'2026-09-25',createdAt:'2026-09-25'})]);
  return d;
}
const e4rows=()=>[tx('c1','expense',400,'2026-10-03','max',{category:'קניות בסופר'}),tx('c2','expense',150,'2026-10-09','max',{category:'מסעדות'}),tx('c3','expense',80,'2026-10-10','max',{category:'דלק'}),tx('c4','refund',50,'2026-10-12','max',{category:'קניות בסופר'})];

test('E4 card cycle',()=>{
  const d=cardFixture();for(const t of e4rows())book(d,t);validateData(d);
  const a=materializeAll(d,'2026-10-14');
  const st=a.transactions.find(t=>t.id==='card-max-2026-10-10');
  assert.ok(st);assert.equal(st.amount,550);assert.equal(st.type,'transfer');assert.equal(st.auto.source,'card');
  assert.equal(a.accounts[0].balance,5450);assert.equal(a.accounts[1].balance,30);
  assert.equal(a.accounts[1].statementsThrough,'2026-10-10');
  validateData(a);
  const b=materializeAll(a,'2026-11-10');
  assert.equal(b.transactions.find(t=>t.id==='card-max-2026-11-10').amount,30);
  assert.equal(b.accounts[0].balance,5420);assert.equal(b.accounts[1].balance,0);
  assert.equal(monthlySummary(b,'2026-10').expenses,580);
  assert.equal(monthlySummary(b,'2026-11').expenses,0);
  assert.equal(categorySpend(b,'קניות בסופר','2026-10'),350);
});

test('E5 card installments',()=>{
  const d=cardFixture();
  const plan=createInstallmentPlan(d,{accountId:'max',total:3600,count:12,purchaseDate:'2026-09-20',description:'אייפון',category:'קניות'},'2026-09-25');
  assert.equal(plan.firstMonth,'2026-10');assert.equal(plan.next,1);
  d.installments=[plan];for(const t of e4rows())book(d,t);
  const a=materializeAll(d,'2026-10-10');
  const p1=a.transactions.find(t=>t.id===`inst-${plan.id}-1`);
  assert.equal(p1.amount,300);assert.equal(p1.date,'2026-10-10');assert.deepEqual(p1.installment,{planId:plan.id,n:1,of:12});
  assert.equal(a.transactions.find(t=>t.id==='card-max-2026-10-10').amount,850);
  assert.equal(a.installments[0].next,2);
  const pr=planProgress(a,a.installments[0],NOW);assert.equal(pr.left,11);assert.equal(pr.leftAmount,3300);
  assert.equal(monthlySummary(a,'2026-10').expenses,580+300);
  const later=materializeAll(a,NOW);  // the refund on 10/12 is already booked; nothing new is due
  assert.equal(nextCardCharge(later,later.accounts[1],NOW).amount,330);
  assert.equal(nextCardCharge(later,later.accounts[1],NOW).date,'2026-11-10');
  near(monthlyFixed(later),300);
  validateData(later);
});

test('E6 bank installments and a back-dated purchase',()=>{
  const d=fixture([acc('bank','bank',10000)]);
  const plan=createInstallmentPlan(d,{accountId:'bank',total:2400,count:4,purchaseDate:NOW,description:'קורס',category:'לימודים'},NOW);
  d.installments=[plan];
  assert.ok(materializeInstallments(d,NOW));
  assert.equal(d.transactions.length,1);assert.equal(d.transactions[0].date,NOW);assert.equal(d.accounts[0].balance,9400);
  const f=cashflowForecast(d,{days:61,now:NOW,includeVariable:false,includeGoals:false});
  assert.deepEqual(f.items.filter(x=>x.source==='installment').map(x=>[x.date,x.amount]),[['2026-11-14',600],['2026-12-14',600]]);
  const back=createInstallmentPlan(d,{accountId:'bank',total:1200,count:12,purchaseDate:'2026-07-05',description:'ספה',category:'קניות'},NOW);
  assert.equal(back.next,4);
  d.installments.push(back);materializeInstallments(d,NOW);
  assert.equal(back.next,5);
  const row=d.transactions.find(t=>t.id===`inst-${back.id}-4`);assert.equal(row.date,'2026-10-05');
  assert.equal(planProgress(d,back,NOW).left,8);
  validateData(d);
  assert.deepEqual([1,2,3].map(n=>installmentAmount({total:1000,count:3},n)),[333.33,333.33,333.34]);
  assert.throws(()=>createInstallmentPlan(d,{accountId:'bank',total:100,count:1,purchaseDate:NOW,category:'קניות'},NOW),/בין 2 ל־60/);
  assert.throws(()=>createInstallmentPlan(d,{accountId:'bank',total:100,count:3,purchaseDate:'2026-10-20',category:'קניות'},NOW),/בעתיד/);
  assert.throws(()=>createInstallmentPlan(d,{accountId:'bank',total:100,count:3,purchaseDate:NOW,category:'קניות',alreadyCharged:3},NOW),/שכבר ירדו/);
  // Early payoff and removal keep the recorded rows.
  const payoff=payOffPlan(d,back.id,NOW);assert.equal(payoff.amount,800);assert.equal(back.next,13);
  removePlan(d,back.id);assert.equal(d.installments.length,1);assert.ok(d.transactions.some(t=>t.id===`inst-${back.id}-4`));
  validateData(d);
});

test('E7 refund',()=>{
  const d=fixture([acc('bank','bank',20000)],[tx('s','income',9000,'2026-10-01','bank',{category:'משכורת'}),tx('k','expense',800,'2026-10-05','bank',{category:'קניות'}),tx('o','expense',2200,'2026-10-06','bank',{category:'חשבונות'})]);
  const before=d.accounts[0].balance;
  book(d,tx('r','refund',200,'2026-10-20','bank',{category:'קניות'}));validateData(d);
  assert.equal(categorySpend(d,'קניות','2026-10'),600);
  const s=monthlySummary(d,'2026-10');
  assert.deepEqual({income:s.income,expenses:s.expenses,refunds:s.refunds,grossExpenses:s.grossExpenses,saved:s.saved},{income:9000,expenses:2800,refunds:200,grossExpenses:3000,saved:6200});
  near(s.rate,.6889,.0001);
  assert.equal(d.accounts[0].balance-before,200);
  book(d,tx('r2','refund',200,'2026-11-02','bank',{category:'קניות'}));
  assert.equal(categorySpend(d,'קניות','2026-11'),-200);
  assert.deepEqual(txTotals(d,d.transactions),{income:9000,expenses:2600,grossExpenses:3000,refunds:400,transfers:0});
  // Maaser: a refund in a giving category lowers what was donated.
  const m=fixture([acc('bank','bank',0)],[tx('i','income',1000,'2026-03-01','bank',{category:'משכורת'}),tx('g','expense',100,'2026-03-02','bank',{category:'תרומות'}),tx('gr','refund',30,'2026-03-03','bank',{category:'תרומות'})]);
  assert.equal(maaserSummary(m,{year:'2026'}).donated,70);
});

test('E8 restricted deposit and net worth',()=>{
  const d=fixture([acc('bank','bank',5000),acc('cash','cash',300),acc('sav','savings',2000),acc('dep','deposit',25000,{releaseDate:'2031-03-01'}),acc('card','credit',330,{billingDay:10,payFrom:'bank',statementsThrough:NOW}),acc('loan','debt',24250,{original:45000,payment:1250})]);
  validateData(d);
  const b=balances(d);
  assert.deepEqual({cash:b.cash,savings:b.savings,restricted:b.restricted,total:b.total,debt:b.debt,credit:b.credit,liabilities:b.liabilities,net:b.net},{cash:5300,savings:2000,restricted:25000,total:32300,debt:24250,credit:330,liabilities:24580,net:7720});
  const f=freeMoney(d);assert.equal(f.total,6970);assert.equal(f.free,7300);assert.equal(f.committed,330);
  assert.equal(cashflowForecast(d,{now:NOW}).start,5300);
  d.overallBudget=1e6;
  assert.equal(Math.round(safeToSpend(d,NOW).cash+safeToSpend(d,NOW).cardDue),5300);
  const plan=simulatePlan(d,[],{now:NOW});
  assert.equal(plan.points[0].restricted,25000);
  near(plan.points[0].netWorth,6970+25000-24250);
});

test('E9 safe to spend with cards',()=>{
  const d=fixture([acc('bank','bank',5800),acc('a','credit',0,{name:'כרטיס א',billingDay:10,payFrom:'bank',statementsThrough:NOW})],[tx('spent','expense',2000,'2026-10-05','bank')],{overallBudget:6000,bills:[{id:'rent',name:'שכר דירה',amount:2500,day:20,frequency:'monthly',type:'expense',category:'חשבונות',accountId:'bank'},{id:'nf',name:'נטפליקס',amount:55,day:25,frequency:'monthly',type:'expense',category:'בילויים',accountId:'a'}]});
  assert.equal(d.accounts[0].balance,3800);
  const s=safeToSpend(d,NOW);
  assert.equal(s.daysLeft,18);near(s.available,1445);near(s.cash,1300);near(s.perDay,72.22);assert.equal(s.limitedBy,'cash');assert.equal(s.cardDue,0);
  d.accounts.push(acc('b','credit',900,{name:'כרטיס ב',billingDay:20,payFrom:'bank',statementsThrough:NOW}));
  const t=safeToSpend(d,NOW);
  near(t.cardDue,900);near(t.cash,400);near(t.perDay,22.22);assert.equal(t.cardCharges[0].date,'2026-10-20');
});

test('cash-flow skips card purchases and books the statement',()=>{
  const d=fixture([acc('bank','bank',5000),acc('card','credit',300,{name:'מקס',billingDay:10,payFrom:'bank',statementsThrough:NOW})],[],{bills:[{id:'nf',name:'נטפליקס',amount:55,day:25,frequency:'monthly',type:'expense',category:'בילויים',accountId:'card'}],goals:[]});
  const f=cashflowForecast(d,{days:40,now:NOW,includeVariable:false});
  const oct=f.months.find(m=>m.month==='2026-10'),nov=f.months.find(m=>m.month==='2026-11');
  assert.equal(oct.fixed,0);assert.equal(oct.end,5000);       // Netflix on 10/25 is on the card
  assert.equal(nov.card,355);assert.equal(f.cardCharges,355);assert.equal(f.deposits,0);
  assert.equal(f.points.find(p=>p.date==='2026-11-10').balance,5000-355);
  const items=scheduledItems(d,'2026-10-15','2026-11-30',NOW);
  assert.ok(items.find(x=>x.billId==='nf').onCard);
  const st=items.find(x=>x.source==='card');assert.deepEqual([st.accountId,st.toAccountId,st.type,st.onCard],['bank','card','transfer',false]);
});

test('E12 goal deposit, linked and unlinked',()=>{
  const d=fixture([acc('bank','bank',5000),acc('S','savings',12000)],[],{goals:[{id:'g1',name:'קרן חירום',type:'קרן חירום',saved:0,monthly:0,date:'2027-12-31',target:null,accountId:'S',allocation:10000},{id:'g2',name:'טיול',type:'חופשה',saved:1000,monthly:0,date:'2027-12-31',target:null}]});
  const before=monthlySummary(d,'2026-10');
  const {transaction}=goalDeposit(d,'g1',{amount:500,fromId:'bank'},NOW);
  assert.equal(transaction.goalId,'g1');assert.equal(transaction.type,'transfer');
  assert.equal(d.accounts[0].balance,4500);assert.equal(d.accounts[1].balance,12500);assert.equal(d.goals[0].allocation,10500);
  assert.deepEqual(monthlySummary(d,'2026-10'),before);
  const r=goalDeposit(d,'g2',{amount:300,fromId:'outside'},NOW);
  assert.equal(r.transaction,null);assert.equal(d.goals[1].saved,1300);assert.deepEqual(d.accounts.map(a=>a.balance),[4500,12500]);
  d.goals[1].saved=1000;
  const r2=goalDeposit(d,'g2',{amount:300,fromId:'bank',toId:'S'},NOW);
  assert.equal(r2.transaction.toAccountId,'S');assert.equal(d.goals[1].saved,1300);assert.deepEqual(d.accounts.map(a=>a.balance),[4200,12800]);
  const n=d.transactions.length,r3=goalDeposit(d,'g1',{amount:200,fromId:'outside'},NOW);
  assert.equal(r3.transaction,null);assert.equal(d.transactions.length,n);assert.equal(d.accounts[1].balance,13000);assert.equal(d.accounts[1].balanceUpdated,NOW);assert.equal(d.goals[0].allocation,10700);
  validateData(d);
});

test('sign table',()=>{
  const kinds={bank:0,cash:0,savings:0,deposit:0,credit:0,debt:0};
  const d=fixture(Object.keys(kinds).map(k=>acc(k,k,k==='debt'?1000:0,k==='debt'?{original:5000}:k==='credit'?{billingDay:5,payFrom:'bank'}:{})));
  const get=k=>d.accounts.find(a=>a.id===k);
  const assets=['bank','cash','savings','deposit'];
  for(const k of ['bank','cash','savings','deposit','credit']){
    const owes=k==='credit';
    assert.equal(accountDelta(d,get(k),tx('i','income',100,NOW,k)),owes?-100:100,`income on ${k}`);
    assert.equal(accountDelta(d,get(k),tx('e','expense',100,NOW,k)),owes?100:-100,`expense on ${k}`);
    assert.equal(accountDelta(d,get(k),tx('r','refund',100,NOW,k)),owes?-100:100,`refund on ${k}`);
    assert.equal(accountDelta(d,get('bank'),tx('e','expense',100,NOW,k)),k==='bank'?-100:0,'other accounts untouched');
  }
  for(const from of ['bank','cash','savings','deposit','credit'])for(const to of ['bank','cash','savings','deposit','credit','debt']){
    if(from===to)continue;
    const t={...tx('t','transfer',100,NOW,from),toAccountId:to,toAmount:100};
    assert.equal(accountDelta(d,get(from),t),from==='credit'?100:-100,`transfer out of ${from}`);   // a cash advance raises what the card owes
    assert.equal(accountDelta(d,get(to),t),['credit','debt'].includes(to)?-100:100,`transfer into ${to}`);
    assert.ok(assets.includes(to)||['credit','debt'].includes(to));
  }
  // USD: the FROM side converts at the row's rate; toAmount is already in the TO currency.
  const u=fixture([acc('usd','bank',0,{currency:'USD'}),acc('ils','bank',0)]);
  assert.equal(accountDelta(u,u.accounts[0],tx('x','expense',365,NOW,'usd',{currency:'ILS',fx:3.65})),-100);
  assert.equal(accountDelta(u,u.accounts[1],{...tx('t','transfer',100,NOW,'usd',{currency:'USD',fx:3.65}),toAccountId:'ils',toAmount:365}),365);
  // applyTransaction refuses the wrong kinds.
  const inv=fixture([acc('inv','investment',0),acc('bank','bank',0),acc('loan','debt',100,{original:100})]);
  assert.throws(()=>applyTransaction(inv,tx('e','expense',1,NOW,'loan')),/תשלום להלוואה/);
  assert.throws(()=>applyTransaction(inv,{...tx('t','transfer',1,NOW,'bank'),toAccountId:'inv',toAmount:1}),/תיק ההשקעות/);
  assert.throws(()=>applyTransaction(inv,{...tx('t','transfer',1,NOW,'bank'),toAccountId:'bank',toAmount:1}),/חשבון יעד אחר/);
  assert.throws(()=>applyTransaction(inv,tx('x','gift',1,NOW,'bank')),/סוג התנועה/);
  assert.deepEqual(TX_TYPES,['income','expense','refund','transfer']);assert.equal(ACCOUNT_KINDS.length,7);
});

// A 4.0 object: what 4.0's emptyData() produced (no installments, createdAt, benefits or annualChecks).
const as40=d=>{const x=structuredClone(d);delete x.installments;delete x.createdAt;return x;};

test('validation accepts every 4.0 shape',()=>{
  for(const d of [demoData(),emptyData(),as40(demoData()),as40(emptyData()),{...as40(demoData()),demo:false}])assert.doesNotThrow(()=>validateData(d));
  // 4.0 test fixtures: a recurring template, a USD row, a debt, bills with paid dates, legacy goals.
  const d=as40(emptyData());
  d.accounts=[acc('b','bank',100),acc('u','savings',10,{currency:'USD'}),acc('l','debt',10,{original:20,payment:1,interest:3})];
  d.transactions=[tx('t1','income',5,'2026-01-01','b',{recurring:true}),tx('t2','expense',5,'2026-02-01','u',{currency:'USD',fx:3.6})];
  d.bills=[{id:'x',name:'חשמל',amount:300,day:31,frequency:'bimonthly',paid:['2026-01-31'],autopay:true,active:true}];
  assert.doesNotThrow(()=>validateData(d));
});

test('validation rejects malformed 4.1 rows',()=>{
  const base=()=>fixture([acc('bank','bank',100),acc('cash','cash',0),acc('inv','investment',0),acc('card','credit',0,{billingDay:10,payFrom:'bank'}),acc('sav','savings',0)]);
  const tr=(extra)=>({...tx('t','transfer',10,NOW,'bank'),toAccountId:'cash',toAmount:10,...extra});
  const bad=[
    d=>d.transactions.push((({toAccountId,...t})=>t)(tr())),
    d=>d.transactions.push(tr({toAccountId:'bank'})),
    d=>d.transactions.push(tr({accountId:'inv'})),
    d=>d.transactions.push(tr({toAmount:0})),
    d=>d.transactions.push(tx('r','refund',10,NOW,'bank',{recurring:true})),
    d=>d.transactions.push(tx('r','refund',10,NOW,'inv')),
    d=>d.transactions.push(tx('i','income',10,NOW,'bank',{installment:{planId:'p',n:1,of:3}})),
    d=>d.transactions.push(tx('e','expense',10,NOW,'bank',{installment:{planId:'p',n:1,of:61}})),
    d=>d.transactions.push(tx('e','expense',10,NOW,'bank',{installment:{planId:'p',n:4,of:3}})),
    d=>{d.accounts[3].billingDay=29;},
    d=>{d.accounts[3].payFrom='sav';},
    d=>{d.accounts[3].last4='12a4';},
    d=>{d.accounts[3].creditLimit=0;},
    d=>{d.accounts.push(acc('dep','deposit',0,{releaseDate:'2031-02-30'}));},
    d=>d.transactions.push(tx('e','expense',10,NOW,'bank',{auto:{source:'x',ref:'a',date:NOW}})),
    d=>d.transactions.push(tx('e','expense',10,NOW,'bank',{goalId:5})),
    d=>{d.installments=[{id:'p',accountId:'bank',description:'',category:'קניות',total:100,count:1,purchaseDate:NOW,firstMonth:'2026-10',next:1,currency:'ILS',fx:3.7}];},
    d=>{d.installments=[{id:'p',accountId:'inv',description:'',category:'קניות',total:100,count:2,purchaseDate:NOW,firstMonth:'2026-10',next:1,currency:'ILS',fx:3.7}];},
    d=>{d.annualChecks={'tax-refund':{done:'2026-13-01'}};},
    d=>{d.benefits=[];},
    d=>{d.createdAt='yesterday';},
    d=>{d.bills=[{id:'b',name:'x',amount:1,day:1,frequency:'monthly',waiting:['nope']}];},
    d=>{d.bills=[{id:'b',name:'x',amount:1,day:1,frequency:'monthly',recordedThrough:'2026-02-31'}];},
  ];
  for(const [i,mutate] of bad.entries()){const d=base();mutate(d);assert.throws(()=>validateData(d),Error,`case ${i}`);}
  const ok=base();ok.transactions.push(tr(),tx('r','refund',10,NOW,'card'),tx('e','expense',10,NOW,'card',{installment:{planId:'p',n:2,of:3},auto:{source:'card',ref:'card',date:NOW,confirm:false}}));
  ok.installments=[{id:'p',accountId:'card',description:'',category:'קניות',total:100,count:3,purchaseDate:NOW,firstMonth:'2026-11',next:4,currency:'ILS',fx:3.7,tags:['x']}];
  ok.benefits={gender:'f'};ok.annualChecks={'tax-refund':{done:NOW,skip:false}};ok.createdAt=NOW;
  ok.bills=[{id:'b',name:'x',amount:1,day:1,frequency:'monthly',active:false,pausedOn:NOW,endDate:null,recordedThrough:NOW,waiting:[NOW],confirm:true}];
  assert.doesNotThrow(()=>validateData(ok));
});

test('4.0 data loads byte-identical',()=>{
  const F=as40({...demoData(),demo:false});
  for(const t of F.transactions)t.recurring=false;   // no due recurring template (4.0 would add rows too)
  const text=JSON.stringify(F),loaded=validateData(structuredClone(F)),out=materializeAll(loaded,NOW);
  assert.equal(out,loaded);assert.equal(JSON.stringify(out),text);
  assert.equal(hasV41Content(F),false);
});

test('materialization is idempotent and deterministic',()=>{
  const d=cardFixture();for(const t of e4rows())book(d,t);
  const plan=createInstallmentPlan(d,{accountId:'max',total:3600,count:12,purchaseDate:'2026-09-20',description:'אייפון',category:'קניות'},'2026-09-25');d.installments=[plan];
  const once=materializeAll(d,'2026-12-14');assert.notEqual(once,d);
  assert.equal(materializeAll(once,'2026-12-14'),once);
  const again=materializeAll(structuredClone(d),'2026-12-14');
  assert.equal(JSON.stringify(again),JSON.stringify(once));
  assert.deepEqual(once.transactions.filter(t=>t.auto||t.installment).map(t=>t.id).sort(),[`inst-${plan.id}-1`,'card-max-2026-10-10',`inst-${plan.id}-2`,'card-max-2026-11-10',`inst-${plan.id}-3`,'card-max-2026-12-10'].sort());
  assert.deepEqual(once.transactions.filter(t=>t.auto).map(t=>t.amount),[850,330,300]);
  // A card created without statementsThrough (lazy init): nothing in the past is recorded, not even today.
  const lazy=fixture([acc('bank','bank',100),acc('c','credit',50,{billingDay:14,payFrom:'bank'})]);
  const l=materializeAll(lazy,NOW);assert.equal(l.accounts[1].statementsThrough,NOW);assert.equal(l.transactions.length,0);
  assert.equal(materializeAll(l,NOW),l);
});

test('deleting an auto row does not bring it back',()=>{
  const d=cardFixture();for(const t of e4rows())book(d,t);
  const plan=createInstallmentPlan(d,{accountId:'max',total:3600,count:12,purchaseDate:'2026-09-20',description:'אייפון',category:'קניות'},'2026-09-25');d.installments=[plan];
  const a=structuredClone(materializeAll(d,NOW));
  for(const id of ['card-max-2026-10-10',`inst-${plan.id}-1`]){const t=a.transactions.find(x=>x.id===id);applyTransaction(a,t,-1);a.transactions=a.transactions.filter(x=>x.id!==id);}
  const b=materializeAll(a,NOW);assert.equal(b,a);
  assert.equal(a.accounts[1].statementsThrough,'2026-10-10');assert.equal(a.installments[0].next,2);
  // The statement amount still owed rolls into the next one.
  assert.equal(cardStatementAmount(a,a.accounts[1],'2026-11-10'),a.accounts[1].balance);
});

test('card without a pays-from bank',()=>{
  const d=fixture([acc('bank','bank',1000),acc('c','credit',0,{billingDay:10,payFrom:'',statementsThrough:'2026-09-25'})],[tx('p','expense',120,'2026-10-02','c')]);
  const a=materializeAll(d,NOW);
  assert.equal(a.transactions.length,1);assert.equal(a.accounts[1].statementsThrough,'2026-10-10');assert.equal(a.accounts[1].balance,120);assert.equal(a.accounts[0].balance,1000);
  const b=materializeAll(a,'2026-11-12');assert.equal(b.accounts[1].statementsThrough,'2026-11-10');assert.equal(b.accounts[1].balance,120);
  assert.equal(nextCardCharge(b,b.accounts[1],'2026-11-12'),null);
});

test('CSV: 4.0 files unchanged, 4.1 round trip',()=>{
  const d=fixture([acc('bank','bank',10000,{name:'עו״ש'}),acc('cash','cash',0,{name:'מזומן'}),acc('loan','debt',500,{name:'הלוואה',original:500})]);
  // The 4.0 parser, verbatim, as the reference for 13-column files.
  const v40=text=>{const rows=parseCSV(text.replace(/^﻿/,'')),headers=rows.shift();const get=(r,k)=>r[headers.indexOf(k)]||'';return rows.map(r=>({id:get(r,'מזהה')||'x',date:get(r,'תאריך'),type:get(r,'סוג')==='הכנסה'?'income':get(r,'סוג')==='הוצאה'?'expense':'invalid',amount:+get(r,'סכום'),currency:get(r,'מטבע')||'ILS',category:get(r,'קטגוריה'),subcategory:get(r,'תת קטגוריה'),accountName:get(r,'חשבון'),description:get(r,'תיאור'),tags:get(r,'תגיות').split(',').filter(Boolean),recurring:get(r,'חוזרת')==='כן',recurringParent:get(r,'מזהה תנועה חוזרת')||undefined,fx:+get(r,'שער דולר')||d.fx}));};
  const csv40='﻿"מזהה","תאריך","סוג","סכום","מטבע","קטגוריה","תת קטגוריה","חשבון","תיאור","תגיות","חוזרת","שער דולר","מזהה תנועה חוזרת"\r\n"a1","2026-10-01","הוצאה","50","ILS","קפה","","עו״ש","קפה, הפוך","x,y","לא","3.65",""\r\n"a2","2026-10-02","הכנסה","900","USD","משכורת","","עו״ש","","","כן","3.7","p1"';
  assert.deepEqual(parseTransactionsCSV(d,csv40),v40(csv40));
  const rows=[makeTransfer(d,{fromId:'bank',toId:'cash',amount:200,date:'2026-10-11',goalId:'g1'}),makeTransfer(d,{fromId:'bank',toId:'loan',amount:100,date:'2026-10-11'}),tx('r','refund',30,'2026-10-12','bank',{category:'קניות'}),tx('i','expense',300,'2026-10-10','bank',{installment:{planId:'p9',n:2,of:12},auto:{source:'card',ref:'c',date:'2026-10-10'}})];
  for(const t of rows)book(d,t);
  const text=transactionsCSV(d,d.transactions);
  assert.equal(text.split('\r\n')[0].split(',').length,18);
  const back=parseTransactionsCSV(d,text);
  assert.deepEqual(back.map(t=>t.type),['transfer','transfer','refund','expense']);
  assert.deepEqual([back[0].toAccountName,back[0].toAmount,back[0].goalId],['מזומן',200,'g1']);
  assert.equal(back[1].toAccountName,'הלוואה');
  assert.deepEqual(back[3].installment,{planId:'p9',n:2,of:12});assert.equal(back[3].auto,undefined);
  for(const [i,t] of back.entries())for(const k of ['id','date','amount','currency','category','description'])assert.equal(t[k],rows[i][k],`${i}.${k}`);
  assert.equal(cleanImportedRow({...rows[3]}).auto,undefined);
  assert.equal(cleanImportedRow({...rows[3],installment:{planId:'',n:1,of:2}}).installment,undefined);
  assert.equal(parseTransactionsCSV(d,'"תאריך","סוג","סכום","חשבון","קטגוריה"\r\n"2026-01-01","מתנה","5","עו״ש","x"')[0].type,'invalid');
});

test('quick-entry parser: refunds and cards',()=>{
  const d=fixture([acc('bank','bank',0,{name:'עו״ש'}),acc('card','credit',0,{name:'ויזה',billingDay:2,payFrom:'bank'})]);
  const r=parseQuickEntry('זיכוי 50 סופר',d,NOW);assert.equal(r.type,'refund');assert.equal(r.amount,50);assert.equal(r.category,'קניות בסופר');
  assert.equal(parseQuickEntry('החזר מס 1200',d,NOW).type,'income');
  assert.equal(parseQuickEntry('קיבלתי החזר 80 על נעליים',d,NOW).type,'refund');
  assert.equal(parseQuickEntry('קפה 18 באשראי',d,NOW).accountId,'card');
  assert.equal(parseQuickEntry('קפה 18',d,NOW).accountId,'bank');
  assert.equal(suggestCategory(d,'סופר','transfer'),null);
});

test('detectors ignore installments, transfers and auto bills',()=>{
  const d=fixture([acc('bank','bank',99999)]);
  for(const m of ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'])book(d,tx('i'+m,'expense',300,m+'-10','bank',{description:'אייפון',installment:{planId:'p',n:1,of:12}}));
  assert.equal(detectRecurring(d,'2026-10').length,0);
  const p=fixture([acc('bank','bank',99999)],[tx('a','expense',100,'2026-09-25','bank'),tx('b','refund',40,'2026-09-28','bank')]);
  assert.equal(monthPace(p,'2026-10','2026-10-14').projected,60);
});

test('messages and the sync guard helpers',()=>{
  const row=(id,description,amount,date)=>({...tx(id,'expense',amount,date,'bank'),description});
  assert.equal(text(autoRecordedMessage([row('a','חשמל',300,NOW)])),'נרשם אוטומטית: חשמל 300 ₪');
  assert.equal(text(autoRecordedMessage([row('a','חשמל',300,NOW),row('b','מים',90,NOW)])),'נרשמו אוטומטית 2 תנועות: חשמל, מים');
  assert.equal(text(autoRecordedMessage([row('a','חשמל',300,NOW),row('b','מים',90,NOW),row('c','גז',50,NOW)])),'נרשמו אוטומטית 3 תנועות: חשמל, מים ועוד');
  assert.equal(autoRecordedMessage([]),'');
  const prev={transactions:[row('a','x',1,'2026-01-02')]},next={transactions:[row('a','x',1,'2026-01-02'),row('c','z',1,'2026-01-05'),row('b','y',1,'2026-01-03')]};
  assert.deepEqual(addedRows(prev,next).map(t=>t.id),['b','c']);
  const d=as40(demoData());assert.equal(hasV41Content(d),false);
  for(const change of [x=>x.accounts.push(acc('c','credit',0,{billingDay:1,payFrom:''})),x=>x.accounts.push(acc('p','deposit',0)),x=>x.transactions.push(tx('r','refund',1,NOW,'bank')),x=>x.transactions[0].auto={source:'bill',ref:'b',date:NOW},x=>x.transactions[0].installment={planId:'p',n:1,of:2},x=>{x.installments=[{}];},x=>x.transactions.push({...tx('t','transfer',1,NOW,'bank'),toAccountId:'cash',toAmount:1})]){
    const c=structuredClone(d);change(c);assert.equal(hasV41Content(c),true);
  }
});

test('capture: card refunds become refund rows and match legacy refunds',async()=>{
  const {parseStatementRows,prepareCapture,markDuplicates}=await import('./capture.js');
  const d=fixture([acc('bank','bank',5000,{name:'עו״ש'})],[tx('old','income',30,'2026-10-05','bank',{description:'זיכוי שופרסל',category:'קניות בסופר'})]);
  const card=parseStatementRows([['תאריך','בית עסק','סכום'],['01-10-2026','שופרסל דיל','245.90'],['03-10-2026','ארומה','38'],['05-10-2026','זיכוי - שופרסל','-30']],NOW);
  assert.equal(card.kind,'card');
  const items=prepareCapture(d,card.items);
  assert.deepEqual(items.map(x=>x.type),['expense','expense','refund']);
  assert.equal(items[2].category,'קניות בסופר','a refund takes the expense category');
  assert.equal(items[2].status,'duplicate','a 4.0 refund recorded as income is the same row');
  const bank=parseStatementRows([['תאריך','תיאור','חובה','זכות'],['02-10-2026','משכורת','','9000'],['03-10-2026','החזר מס הכנסה','','1200'],['04-10-2026','זיכוי ביטול עסקה','','80'],['05-10-2026','סופר','120','']],NOW);
  assert.equal(bank.kind,'bank');
  assert.deepEqual(prepareCapture(d,bank.items).map(x=>x.type),['income','income','refund','expense']);
  assert.equal(markDuplicates(d,[{type:'refund',date:'2026-10-05',amount:30,description:'זיכוי שופרסל'}])[0].status,'duplicate');
});

test('capture: card-payment lines, duplicates and updates of the automatic statement',async()=>{
  const {parseStatementRows,prepareCapture,matchCard}=await import('./capture.js');
  const {textToRows}=await import('./xlsx.js');
  const d=fixture([acc('bank','bank',6000,{name:'עו״ש'}),acc('isra','credit',0,{name:'הכרטיס',institution:'ישראכרט',billingDay:10,payFrom:'bank',statementsThrough:'2026-09-25'})]);
  const bank=parseStatementRows([['תאריך','תיאור','חובה','זכות'],['02-10-2026','משכורת','','9000'],['10-10-2026','ישראכרט','850',''],['11-10-2026','מקסים מסעדה','120','']],NOW);
  assert.equal(bank.kind,'bank');
  assert.equal(bank.items[1].cardPayment,true);assert.ok(!bank.items[2].cardPayment,'"מקסים" is not the card company מקס');
  const rows=prepareCapture(d,bank.items,{accountId:'bank'});
  assert.equal(rows[1].type,'transfer');assert.equal(rows[1].toAccountId,'isra');assert.equal(rows[1].category,'העברה');assert.equal(rows[1].status,'new');
  assert.equal(rows[2].type,'expense');
  // Imported into the card itself, a line stays a purchase.
  assert.equal(prepareCapture(d,bank.items,{accountId:'isra'})[1].type,'expense');
  // No matching card: an expense with the hint to add the card.
  const noCard=fixture([acc('bank','bank',6000)]);
  const hint=prepareCapture(noCard,bank.items,{accountId:'bank'})[1];assert.equal(hint.type,'expense');assert.equal(hint.cardHint,true);
  // The automatic statement of the same amount within 7 days is the same charge; another amount is an update.
  book(d,{id:'card-isra-2026-10-10',type:'transfer',amount:850,currency:'ILS',fx:3.7,date:'2026-10-10',category:'העברה',subcategory:'',accountId:'bank',toAccountId:'isra',toAmount:850,description:'חיוב הכרטיס',tags:['חיוב אשראי'],recurring:false,auto:{source:'card',ref:'isra',date:'2026-10-10',confirm:true}});
  assert.equal(prepareCapture(d,bank.items,{accountId:'bank'})[1].status,'duplicate');
  const other=parseStatementRows([['תאריך','תיאור','חובה','זכות'],['12-10-2026','ישראכרט','830','']],NOW);
  const upd=prepareCapture(d,other.items,{accountId:'bank'})[0];
  assert.equal(upd.status,'possible');assert.equal(upd.update,'card-isra-2026-10-10');assert.equal(upd.updateFrom,850);
  // Pasted text works the same way; last 4 digits pick the card first.
  const two=fixture([acc('bank','bank',6000),acc('a','credit',0,{institution:'מקס',billingDay:2,payFrom:'bank',last4:'1234'}),acc('b','credit',0,{institution:'מקס',billingDay:2,payFrom:'bank',last4:'9876'})]);
  assert.equal(matchCard(two,{description:'מקס איט 9876',last4:'9876'}),'b');
  const pasted=parseStatementRows(textToRows('תאריך\tתיאור\tחובה\tזכות\n10/10/2026\tישראכרט\t850\t'),NOW);
  assert.equal(prepareCapture(fixture([acc('bank','bank',6000),acc('isra','credit',0,{institution:'ישראכרט',billingDay:10,payFrom:'bank'})]),pasted.items,{accountId:'bank'})[0].type,'transfer');
});

test('Claude tools: refunds, totals and propose_transfer',async()=>{
  const {executeAiTool,normalizeProposedTransaction,financialContext,AI_TOOLS}=await import('./ai.js');
  const d=fixture([acc('bank','bank',5000,{name:'עו״ש'}),acc('cash','cash',300,{name:'מזומן'}),acc('loan','debt',25500,{name:'הלוואת רכב',original:45000,payment:1250}),acc('dep','deposit',25000,{name:'פיקדון אישי',releaseDate:'2031-03-01'})],
    [tx('a','expense',800,'2026-10-02','bank'),tx('b','refund',200,'2026-10-03','bank'),tx('c','income',9000,'2026-10-01','bank',{category:'משכורת'})]);
  book(d,makeTransfer(d,{fromId:'bank',toId:'cash',amount:100,date:'2026-10-04'}));
  assert.equal(normalizeProposedTransaction(d,{type:'refund',amount:50,date:'2026-10-01',category:'משכורת'},NOW).draft.category,'קניות');
  assert.ok(AI_TOOLS.some(t=>t.name==='propose_transfer'));
  const q=await executeAiTool('query_transactions',{},{data:d,now:NOW});
  assert.deepEqual([q.total_income,q.total_expense,q.total_refunds,q.transfers_count],[9000,600,200,1]);
  assert.equal(q.transactions.find(t=>t.type==='transfer').to_account,'מזומן');
  const s=await executeAiTool('spending_breakdown',{from:'2026-10-01',to:'2026-10-31',group_by:'category'},{data:d,now:NOW});
  assert.equal(s.total,600);
  let asked=null;
  const r=await executeAiTool('propose_transfer',{from:'עו״ש',to:'הלוואת רכב',amount:1250},{data:d,now:NOW,toolUseId:'t1',approve:async req=>{asked=req;return {approved:true};}});
  assert.equal(r.approved,true);assert.equal(asked.kind,'transfer');assert.deepEqual([asked.transfer.accountId,asked.transfer.toAccountId,asked.transfer.toAmount],['bank','loan',1250]);
  await assert.rejects(executeAiTool('propose_transfer',{from:'עו״ש',to:'הלוואת רכב',amount:30000},{data:d,now:NOW,approve:async()=>({approved:true})}),/הסכום גבוה מיתרת החוב/);
  const c=financialContext(d,'2026-10',NOW);
  assert.match(c,/restricted_deposit 25000/);assert.match(c,/− loans 25500/);assert.match(c,/\[id dep, deposit, ILS\] 25000 \(restricted until 2031-03-01\)/);
});
