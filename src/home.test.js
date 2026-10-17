import test from 'node:test';
import assert from 'node:assert/strict';
import {homeSummary,homeLayoutOf,homePrefsWith,migrateHomePrefs,HOME_DEFAULT_IDS,HOME_VERSION,balances,applyTransaction,validateData,portfolioValue,toILS,assetValue} from './finance.js';
import {emptyData,demoData} from './data.js';
import {todayPriceDraft,dailyPricesDraft,setTodayPrice,portfolioGlance,todayPriceField,containerSummary} from './invest.js';

const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<=eps,`${a} ≉ ${b}`);
const NOW='2026-10-17';
// One account of every kind, a dollar account, a holding and the portfolio cash.
function sample(){
  const d=emptyData();d.fx=3.5;
  d.accounts=[
    {id:'bank',name:'עו״ש',kind:'bank',currency:'ILS',balance:10000},
    {id:'usd',name:'עו״ש דולרי',kind:'bank',currency:'USD',balance:100},
    {id:'cash',name:'מזומן',kind:'cash',currency:'ILS',balance:500},
    {id:'sav',name:'חיסכון',kind:'savings',currency:'ILS',balance:20000},
    {id:'dep',name:'פיקדון אישי',kind:'deposit',currency:'ILS',balance:5000,releaseDate:'2028-01-01'},
    {id:'inv',name:'מיטב טרייד',kind:'investment',invType:'broker',currency:'ILS',balance:0},
    {id:'loan',name:'הלוואה',kind:'debt',currency:'ILS',balance:4000,original:10000,payment:500,interest:5},
    {id:'card',name:'כרטיס',kind:'credit',currency:'ILS',balance:1000,billingDay:10,payFrom:'bank'}
  ];
  d.assets=[
    {id:'sofi',name:'SoFi',ticker:'SOFI',type:'מניה',currency:'USD',quantity:10,averagePrice:20,invested:200,currentPrice:25,currentValue:0,mode:'price',accountId:'inv',date:'2026-10-10'},
    {id:'gemel',name:'קופת גמל',ticker:'',type:'קופת גמל להשקעה',currency:'ILS',quantity:0,averagePrice:0,invested:9000,currentPrice:0,currentValue:10000,mode:'value',accountId:'inv',date:'2026-09-30'}
  ];
  d.wallets={ILS:250,USD:0};
  return d;
}

test('checking is the bank accounts only: savings, deposits and investments never count in it',()=>{
  const d=sample(),h=homeSummary(d);
  near(h.checking,10000+100*3.5);
  near(h.cash,500);near(h.savings,20000);near(h.deposits,5000);near(h.saved,25000);
  near(h.investments,10*25*3.5+10000+250);
  near(h.loans,4000);near(h.cards,1000);
  assert.ok(h.checking<h.assets-h.saved-h.investments+1e-6,'nothing saved or invested hides in checking');
});

test('net worth is the sum of the separate parts minus loans and card debt, and equals balances().net',()=>{
  const d=sample(),h=homeSummary(d);
  near(h.net,h.checking+h.cash+h.savings+h.deposits+h.investments-h.loans-h.cards);
  near(h.net,balances(d).net);
  near(h.parts.reduce((s,p)=>s+p.value,0),h.net);
  assert.deepEqual(h.parts.map(p=>p.id),['checking','cash','savings','deposits','investments','loans','cards']);
  // The demo data too.
  const demo=demoData(),hd=homeSummary(demo);near(hd.parts.reduce((s,p)=>s+p.value,0),balances(demo).net);
  near(hd.checking,26450);near(hd.saved,62000);
});

test('an income moves checking and the net worth together; a transfer to savings moves neither the net worth nor counts twice',()=>{
  const d=sample(),before=homeSummary(d);
  applyTransaction(d,{id:'t1',type:'income',amount:1000,currency:'ILS',accountId:'bank',date:NOW,category:'משכורת'});
  const after=homeSummary(d);
  near(after.checking-before.checking,1000);near(after.net-before.net,1000);near(after.saved,before.saved);near(after.investments,before.investments);
  applyTransaction(d,{id:'t2',type:'transfer',amount:3000,toAmount:3000,currency:'ILS',accountId:'bank',toAccountId:'sav',date:NOW,category:'העברה'});
  const moved=homeSummary(d);
  near(moved.checking,after.checking-3000);near(moved.savings,after.savings+3000);near(moved.net,after.net);
});

const IDS=['hero','savings','portfolio','networth','month','upcoming','recent','goals','investments','spending','budgets','safe','worth','assets'];
test('the home layout: no saved layout is the clear 4.2 default, every other widget hidden',()=>{
  const l=homeLayoutOf(undefined,IDS);
  assert.deepEqual(l.order.slice(0,5),HOME_DEFAULT_IDS);
  assert.deepEqual(HOME_DEFAULT_IDS,['hero','savings','portfolio','networth','month']);
  assert.deepEqual(l.order.filter(id=>!l.hidden.includes(id)),HOME_DEFAULT_IDS);
  assert.equal(l.custom,false);
});

test('a layout saved before 4.2 gets the new default once; the user\'s later layout is kept as they left it',()=>{
  const old={home:{order:['hero','month','upcoming','recent','goals','investments','spending','budgets','networth'],hidden:['networth']},theme:'x'};
  // Shown as the new default even before it is saved.
  assert.deepEqual(homeLayoutOf(old,IDS).order.filter(id=>!homeLayoutOf(old,IDS).hidden.includes(id)),HOME_DEFAULT_IDS);
  const migrated=migrateHomePrefs(old,IDS);
  assert.equal(migrated.homeVersion,HOME_VERSION);assert.equal(migrated.theme,'x','other preferences stay');
  assert.deepEqual(migrated.home.order.filter(id=>!migrated.home.hidden.includes(id)),HOME_DEFAULT_IDS);
  assert.equal(migrateHomePrefs(migrated,IDS),null,'never twice');
  // The data stays valid (4.1 validation reads only home.order and home.hidden).
  const d=emptyData();d.prefs=migrated;assert.equal(validateData(d),d);
  // The user customises afterwards: kept, in their order.
  const mine=homePrefsWith(migrated,['month','hero','upcoming'],IDS);
  const l=homeLayoutOf(mine,IDS);assert.equal(l.custom,true);
  assert.deepEqual(l.order.filter(id=>!l.hidden.includes(id)),['month','hero','upcoming']);
  assert.equal(migrateHomePrefs(mine,IDS),null);
  // A 4.1 device saving a layout replaces only `home` (it spreads prefs), so the mark survives and nothing resets.
  const from41={...mine,home:{order:['hero','recent','month'],hidden:['month']}};
  assert.equal(migrateHomePrefs(from41,IDS),null);
  const l41=homeLayoutOf(from41,IDS);assert.deepEqual(l41.order.filter(id=>!l41.hidden.includes(id)),['hero','recent']);
  // No saved layout: nothing to migrate.
  assert.equal(migrateHomePrefs(undefined,IDS),null);assert.equal(migrateHomePrefs({theme:'x'},IDS),null);
});

test('saved layouts survive unknown and new widget ids',()=>{
  const prefs={homeVersion:HOME_VERSION,home:{order:['savings','gone','hero','month'],hidden:['gone','month']}};
  const l=homeLayoutOf(prefs,IDS);
  assert.ok(!l.order.includes('gone'),'an id this version does not know is dropped');
  assert.deepEqual(l.order.filter(id=>!l.hidden.includes(id)),['savings','hero']);
  assert.ok(l.hidden.includes('portfolio')&&l.hidden.includes('worth'),'widgets the layout never saw start hidden');
  assert.deepEqual([...l.order].sort(),[...IDS].sort(),'every widget appears exactly once');
  const noHero={homeVersion:HOME_VERSION,home:{order:['month'],hidden:[]}};
  assert.equal(homeLayoutOf(noHero,IDS).order[0],'hero','the checking card always exists, first');
});

test('one holding\'s price for today saves exactly what the daily update saves for it, and nothing else',()=>{
  const d=sample();
  const one=todayPriceDraft(d,'sofi',26.5,null,NOW),daily=dailyPricesDraft(d,{sofi:'26.5'},new Map(),NOW);
  assert.equal(one.changed,true);assert.deepEqual(daily.changes,['sofi']);
  assert.deepEqual(one.next,daily.next);
  const sofi=one.next.assets.find(a=>a.id==='sofi');
  assert.equal(sofi.currentPrice,26.5);assert.equal(sofi.date,NOW);assert.equal(sofi.priceDate,NOW);assert.equal(sofi.priceSource,'ידני');
  // Only that holding changed; the source data is untouched.
  assert.deepEqual(one.next.assets.find(a=>a.id==='gemel'),d.assets.find(a=>a.id==='gemel'));
  assert.deepEqual({...one.next,assets:[]},{...d,assets:[]});
  assert.equal(d.assets[0].currentPrice,25);
  near(portfolioValue(one.next)-portfolioValue(d),10*1.5*3.5);
});

test('a fetched price keeps its source and trading date, exactly as in the daily update',()=>{
  const d=sample(),r={status:'ok',price:27.12,date:'2026-10-16',source:'Finnhub',flags:[],change:.08};
  const one=todayPriceDraft(d,'sofi',27.12,r,NOW),daily=dailyPricesDraft(d,{sofi:'27.12'},new Map([['sofi',r]]),NOW);
  assert.deepEqual(one.next,daily.next);
  const a=one.next.assets[0];assert.equal(a.priceSource,'Finnhub');assert.equal(a.priceDate,'2026-10-16');assert.equal(a.date,NOW);
  // Typing over the fetched price makes it a typed price.
  const typed=todayPriceDraft(d,'sofi',27,r,NOW).next.assets[0];assert.equal(typed.priceSource,'ידני');assert.equal(typed.priceDate,NOW);
  // The same price as fetched, even unchanged, is recorded as fetched today (the daily update does the same).
  const same=todayPriceDraft(d,'sofi',25,{...r,price:25},NOW);assert.equal(same.changed,true);assert.equal(same.next.assets[0].priceSource,'Finnhub');
});

test('a value-tracked holding updates its total value; an unchanged typed value is no change; bad values are refused',()=>{
  const d=sample();
  assert.equal(todayPriceField(d.assets[1]),'currentValue');
  const v=todayPriceDraft(d,'gemel',10250,null,NOW);
  assert.equal(v.next.assets[1].currentValue,10250);assert.equal(v.next.assets[1].currentPrice,0);
  assert.deepEqual(v.next,dailyPricesDraft(d,{gemel:10250},new Map(),NOW).next);
  assert.equal(todayPriceDraft(d,'sofi',25,null,NOW).changed,false);
  assert.throws(()=>todayPriceDraft(d,'sofi',0,null,NOW),/מחיר תקין/);
  assert.throws(()=>todayPriceDraft(d,'sofi',-3,null,NOW),/מחיר תקין/);
  assert.throws(()=>todayPriceDraft(d,'gemel',-1,null,NOW),/שווי תקין/);
  assert.throws(()=>todayPriceDraft(d,'nope',10,null,NOW),/לא נמצא/);
  // The daily update's live total skips a bad value instead of throwing.
  assert.deepEqual(dailyPricesDraft(d,{sofi:'',gemel:'10300'},new Map(),NOW,false).changes,['gemel']);
  assert.throws(()=>dailyPricesDraft(d,{sofi:''},new Map(),NOW,true));
  // Six decimals at most are kept.
  const a={...d.assets[0]};setTodayPrice(a,1.23456789,null,NOW);assert.equal(a.currentPrice,1.234568);
});

test('the home investments tile: value, lifetime gain and how fresh the prices are',()=>{
  const d=sample(),g=portfolioGlance(d,NOW),list=containerSummary(d);
  near(g.value,portfolioValue(d));
  near(g.profit,list.reduce((s,c)=>s+c.profit,0));near(g.return,g.profit/g.invested);
  assert.equal(g.latest,'2026-10-10');assert.equal(g.days,7);assert.equal(g.stale,false);assert.equal(g.updatedToday,0);
  const later=portfolioGlance(d,'2026-10-20');assert.equal(later.stale,true,'a market price older than a week is overdue');
  const fresh=portfolioGlance(todayPriceDraft(d,'sofi',26,null,NOW).next,NOW);assert.equal(fresh.days,0);assert.equal(fresh.updatedToday,1);
  const none=portfolioGlance(emptyData(),NOW);assert.equal(none.count,0);assert.equal(none.latest,null);assert.equal(none.return,null);
  near(toILS(assetValue(d.assets[0]),'USD',d.fx),875);
});
