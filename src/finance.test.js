import test from 'node:test';
import assert from 'node:assert/strict';
import {dietz,xirr,applyActivity,portfolioValue,balances,performance,validateData,parseCSV,csvCell,applyTransaction,monthlySummary,rangeStart,snapshot,monthOffset,assetProfit,assetPeriod} from './finance.js';
import {emptyData,demoData,materializeRecurring} from './data.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const start={date:'2026-01-01',value:100000},end={date:'2026-01-31',value:112000};
test('deposit is excluded from profit and weighted by its date',()=>{const a={type:'deposit',date:'2026-01-16',amount:10000,currency:'ILS',fx:3.65};near(dietz(start,{...end,value:110000},[a]).profit,0);near(dietz(start,end,[a]).return,2000/105000);});
test('withdrawal adjusts return denominator',()=>near(dietz(start,{...end,value:92000},[{type:'withdrawal',date:'2026-01-16',amount:10000,currency:'ILS',fx:3.65}]).return,2000/95000));
test('closing-date deposit with no opening exposure has unavailable return',()=>assert.equal(dietz({...start,value:0},{...end,value:10000},[{type:'deposit',date:end.date,amount:10000,currency:'ILS',fx:3.65}]).return,null));
test('fees lower profit; externally paid dividends count as returns',()=>{near(dietz({...start,value:10000},{...end,value:9900},[{type:'fee',date:end.date,amount:100,currency:'ILS',fx:1}]).return,-.01);near(dietz({...start,value:10000},{...end,value:10000},[{type:'distribution',date:end.date,amount:200,currency:'ILS',fx:1}]).return,.02);});
test('XIRR uses investor perspective and actual dates',()=>{near(xirr([{date:'2025-01-01',amount:-10000},{date:'2026-01-01',amount:11000}]),.1);near(xirr([{date:'2025-01-01',amount:-10000},{date:'2025-07-02',amount:-5000},{date:'2026-01-01',amount:16000}]),.080265844);assert.equal(xirr([{date:'2025-01-01',amount:100},{date:'2026-01-01',amount:110}]),null);});
test('internal buy/sell preserves portfolio value and cost basis',()=>{const d=emptyData();d.wallets.ILS=10000;d.assets.push({id:'a',name:'a',currency:'ILS',quantity:0,currentPrice:100,averagePrice:0,invested:0,mode:'price',currentValue:0});applyActivity(d,{type:'buy',assetId:'a',amount:5000,quantity:50,currency:'ILS',date:end.date});near(portfolioValue(d),10000);d.assets[0].currentPrice=110;near(portfolioValue(d),10500);applyActivity(d,{type:'sell',assetId:'a',amount:2200,quantity:20,currency:'ILS',date:end.date});near(portfolioValue(d),10500);near(d.assets[0].invested,3000);});
test('linked deposits transfer tracked cash without increasing net worth',()=>{const d=emptyData();d.accounts.push({id:'b',name:'bank',kind:'bank',currency:'ILS',balance:10000});const old=balances(d).net;applyActivity(d,{type:'deposit',date:end.date,amount:1000,currency:'ILS',accountId:'b'});near(balances(d).net,old);near(d.accounts[0].balance,9000);applyActivity(d,{type:'withdrawal',date:end.date,amount:500,currency:'ILS',accountId:'b'});near(balances(d).net,old);near(d.accounts[0].balance,9500);});
test('insufficient cash cannot buy or withdraw',()=>{const d=emptyData();assert.throws(()=>applyActivity(d,{type:'withdrawal',date:end.date,amount:100,currency:'ILS'}));});
test('historical flow FX is preserved',()=>{const d=emptyData();d.fx=3.65;applyActivity(d,{type:'deposit',date:end.date,amount:100,currency:'USD',fx:3});near(d.activities[0].fx,3);near(dietz({...start,value:0},{...end,value:300},d.activities).profit,0);});
test('monthly percentages link geometrically; USD benchmark converts to ILS',()=>{const d=emptyData();d.snapshots=[{date:'2026-01-01',value:100,netWorth:100,fx:3.5,benchmarks:{sp500:100,ta125:100}},{date:'2026-02-01',value:105,netWorth:105,fx:3.5,benchmarks:{sp500:105,ta125:102}},{date:'2026-03-01',value:110.25,netWorth:110.25,fx:3.7,benchmarks:{sp500:110,ta125:104}}];const p=performance(d,'2026-01-01','2026-03-01');near(p.return,.1025);near(p.benchmarks.sp500,16.2857142857143);near(p.benchmarks.ta125,4);});
test('snapshot retains historical FX independently of future changes',()=>{const d=emptyData();d.fx=3.5;d.wallets.USD=100;const s=snapshot(d,'2026-01-01',{});d.fx=4;near(s.value,350);near(s.fx,3.5);});
test('ordinary transaction rejects debt accounts',()=>{const d=emptyData();d.accounts.push({id:'debt',kind:'debt',currency:'ILS',balance:1000});assert.throws(()=>applyTransaction(d,{accountId:'debt',amount:100,type:'expense',currency:'ILS'}));});
test('historical expense FX is unchanged by current FX changes',()=>{const d=emptyData();d.fx=4;d.transactions=[{type:'expense',date:'2026-01-15',amount:100,currency:'USD',fx:3.5}];near(monthlySummary(d,'2026-01').expenses,350);});
test('restore rejects duplicate snapshots and invalid amounts',()=>{const d=demoData();assert.equal(validateData(d),d);d.snapshots.push({...d.snapshots[0],id:'duplicate'});assert.throws(()=>validateData(d));const bad=demoData();bad.transactions[0].amount=Infinity;assert.throws(()=>validateData(bad));});
test('CSV round-trips quoted Hebrew, commas and line breaks',()=>{const rows=[['תאריך','תיאור'],['2026-01-01','קפה, "טעים"\nשורה שנייה']];const csv=rows.map(r=>r.map(csvCell).join(',')).join('\r\n');assert.deepEqual(parseCSV(csv),rows);assert.throws(()=>parseCSV('"unclosed'));});
test('range dates clamp short months',()=>assert.equal(rangeStart('2026-03-31','1'),'2026-02-28'));
test('demo holdings reconcile with last snapshot',()=>{const d=demoData();near(portfolioValue(d),257800);near(balances(d).net,322750);});
test('USD account native transaction and reversal do not depend on current FX',()=>{const d=emptyData();d.fx=3.65;d.accounts.push({id:'usd',name:'dollar',kind:'bank',currency:'USD',balance:1000});const t={accountId:'usd',type:'expense',amount:100,currency:'USD',fx:3};applyTransaction(d,t);near(d.accounts[0].balance,900);d.fx=4;applyTransaction(d,t,-1);near(d.accounts[0].balance,1000);});
test('direct outside dividend is return and can credit a tracked bank',()=>{const d=emptyData();d.accounts.push({id:'bank',name:'bank',kind:'bank',currency:'ILS',balance:0});d.wallets.ILS=10000;applyActivity(d,{type:'distribution',date:end.date,amount:200,currency:'ILS',accountId:'bank'});near(portfolioValue(d),10000);near(d.accounts[0].balance,200);near(dietz({...start,value:10000},{...end,value:10000},d.activities).return,.02);});
test('recurring materialization does not duplicate an existing generated child',()=>{const d=emptyData();d.accounts=[{id:'b',name:'bank',kind:'bank',currency:'ILS',balance:1000}];const now=new Date();const month=now.toISOString().slice(0,7);const prev=new Date(now.getFullYear(),now.getMonth()-1,1).toISOString().slice(0,7);d.transactions=[{id:'root',accountId:'b',type:'expense',amount:100,currency:'ILS',date:prev+'-01',category:'חשבונות',recurring:true},{id:'child',recurringParent:'root',accountId:'b',type:'expense',amount:100,currency:'ILS',date:month+'-01',category:'חשבונות',recurring:false}];const next=materializeRecurring(d);assert.equal(next.transactions.length,2);near(next.accounts[0].balance,1000);});
test('recurring materialization does not duplicate a month after schedule changes',()=>{const d=emptyData();d.accounts.push({id:'bank',name:'bank',kind:'bank',currency:'ILS',balance:1000});const m=new Date().toISOString().slice(0,7),prior=monthOffset(m,-1);d.transactions=[{id:'root',date:prior+'-01',type:'expense',amount:100,currency:'ILS',fx:3.65,category:'חשבונות',accountId:'bank',recurring:true},{id:'child',recurringParent:'root',date:m+'-02',type:'expense',amount:100,currency:'ILS',fx:3.65,category:'חשבונות',accountId:'bank',recurring:false}];assert.equal(materializeRecurring(d).transactions.length,2);});

test('asset total profit includes realized sale gains and dividends',()=>{const d=emptyData();d.wallets.ILS=0;const a={id:'a',name:'a',currency:'ILS',quantity:100,averagePrice:100,invested:10000,currentPrice:120,currentValue:0,mode:'price'};d.assets.push(a);applyActivity(d,{type:'sell',assetId:'a',amount:2400,quantity:20,currency:'ILS',date:'2026-02-01'});applyActivity(d,{type:'dividend',assetId:'a',amount:100,currency:'ILS',date:'2026-02-01'});const p=assetProfit(d,a);near(p.profit,2100);near(p.return,.21);});
test('asset period return treats purchase/sale as flows across the asset boundary',()=>{const d=emptyData(),a={id:'a',currency:'ILS'};d.activities=[{assetId:'a',type:'buy',date:'2026-01-16',amount:5000,currency:'ILS',fx:1},{assetId:'a',type:'dividend',date:'2026-01-31',amount:100,currency:'ILS',fx:1}];const p=assetPeriod(d,a,{date:'2026-01-01',value:10000,fx:1,holdings:[{id:'a',value:10000,currency:'ILS'}]},{date:'2026-01-31',value:16000,fx:1,holdings:[{id:'a',value:16000,currency:'ILS'}]});near(p.profit,1100);near(p.return,1100/12500);});

// ---------- 4.1 investment containers ----------
{
  const {investAccounts,assetContainerId,cashContainerId,containerValue,containerAssets,ensureDefaultContainer,INVEST_TYPES}=await import('./finance.js');
  const holding=(id,extra={})=>({id,name:id,currency:'ILS',quantity:10,averagePrice:100,invested:1000,currentPrice:120,currentValue:0,mode:'price',...extra});
  const inv=(id,invType,extra={})=>({id,name:id,institution:'',kind:'investment',currency:'ILS',balance:0,original:0,payment:0,interest:0,...(invType?{invType}:{}),...extra});
  test('containers: before any exists every holding and the cash sit in the virtual one (id ""), worth the whole portfolio',()=>{
    const d=emptyData();d.wallets={ILS:500,USD:10};d.fx=3.5;d.assets=[holding('a'),holding('b',{currency:'USD'})];
    assert.equal(assetContainerId(d,d.assets[0]),'');assert.equal(cashContainerId(d),'');
    near(containerValue(d,''),portfolioValue(d));
  });
  test('containers: a missing or stale id means the first container; the cash shows in the first trading account; they add up',()=>{
    const d=emptyData();d.fx=3.65;d.wallets={ILS:1000,USD:100};
    d.accounts=[inv('gemel','gemel'),inv('meitav','broker'),inv('old',null)];
    d.assets=[holding('a',{accountId:'meitav'}),holding('b'),holding('c',{accountId:'deleted-long-ago'}),holding('d',{accountId:'old',currency:'USD'})];
    assert.equal(assetContainerId(d,d.assets[1]),'gemel');assert.equal(assetContainerId(d,d.assets[2]),'gemel');
    assert.equal(cashContainerId(d),'meitav','the first broker account holds the portfolio cash (a fund never does)');
    assert.deepEqual(containerAssets(d,'gemel').map(a=>a.id),['b','c']);
    near(containerValue(d,'meitav'),1200+1000+365);near(containerValue(d,'old'),1200*3.65);
    near(investAccounts(d).reduce((s,a)=>s+containerValue(d,a.id),0),portfolioValue(d));
    const noType=emptyData();noType.accounts=[inv('x',null)];assert.equal(cashContainerId(noType),'x','an investment account without a type is a trading account');
  });
  test('containers: ensureDefaultContainer creates "התיק שלי" once, only when none exists, and adopts the holdings without one',()=>{
    const d=emptyData();d.assets=[holding('a'),holding('b',{accountId:'gone'})];
    const id=ensureDefaultContainer(d);
    assert.equal(d.accounts.length,1);assert.equal(d.accounts[0].name,'התיק שלי');assert.equal(d.accounts[0].invType,'broker');
    assert.ok(d.assets.every(a=>a.accountId===id));
    assert.equal(ensureDefaultContainer(d),id);assert.equal(d.accounts.length,1,'idempotent');
    validateData(d);
    const e2=emptyData();e2.accounts=[inv('f','gemel')];e2.assets=[holding('x')];
    assert.equal(ensureDefaultContainer(e2),'f');assert.equal(e2.accounts.length,1,'an existing container is reused');
  });
  test('containers: validation is lenient on 4.0 shapes and stale ids, strict only on the new fields',()=>{
    const d=demoData();validateData(d);
    d.assets[0].accountId='no-such-account';validateData(d);
    d.accounts.find(a=>a.kind==='investment').invType='gemel';d.assets[1].priceDate='2026-10-14';d.assets[1].priceSource='Finnhub';validateData(d);
    assert.throws(()=>validateData({...d,accounts:d.accounts.map(a=>a.kind==='investment'?{...a,invType:'toString'}:a)}),/החשבונות/);
    assert.throws(()=>validateData({...d,assets:d.assets.map((a,i)=>i?a:{...a,priceDate:'2026-13-01'})}),/ההשקעות/);
    assert.throws(()=>validateData({...d,assets:d.assets.map((a,i)=>i?a:{...a,accountId:7})}),/ההשקעות/);
    assert.ok(Object.keys(INVEST_TYPES).includes('gemel'));
  });
  test('a deposit straight into a value-tracked fund raises its value and cost, never the portfolio cash; a withdrawal realizes its share',()=>{
    const d=emptyData();d.accounts=[{id:'bank',name:'bank',kind:'bank',currency:'ILS',balance:5000}];
    d.assets=[{id:'f',name:'מסלול מניות',currency:'ILS',quantity:0,averagePrice:0,invested:8000,currentPrice:0,currentValue:10000,mode:'value'},holding('p')];
    const net=balances(d).net;
    applyActivity(d,{type:'deposit',date:'2026-10-01',amount:1000,currency:'ILS',assetId:'f',accountId:'bank'});
    assert.equal(d.assets[0].currentValue,11000);assert.equal(d.assets[0].invested,9000);assert.equal(d.wallets.ILS,0);assert.equal(d.accounts[0].balance,4000);
    near(balances(d).net,net);
    assert.equal(assetProfit(d,d.assets[0]).profit,2000);
    applyActivity(d,{type:'withdrawal',date:'2026-10-05',amount:5500,currency:'ILS',assetId:'f'});
    assert.equal(d.assets[0].currentValue,5500);near(d.assets[0].invested,4500);near(d.activities.at(-1).costBasis,4500);
    near(assetProfit(d,d.assets[0]).profit,2000,'the withdrawn half keeps its profit as realized');
    assert.throws(()=>applyActivity(d,{type:'withdrawal',date:'2026-10-06',amount:9999,currency:'ILS',assetId:'f'}),/גדול משווי/);
    assert.throws(()=>applyActivity(d,{type:'deposit',date:'2026-10-06',amount:10,currency:'ILS',assetId:'p'}),/שווי כולל/);
    const flows=d.activities.filter(a=>a.assetId==='f');assert.equal(flows.length,2);
    near(dietz({date:'2026-09-30',value:10000},{date:'2026-10-31',value:5500},d.activities).flows,1000-5500,'both stay external flows for the returns');
  });
  test('snapshots record each holding\'s container',()=>{
    const d=emptyData();d.accounts=[inv('m','broker')];d.assets=[holding('a')];
    assert.equal(snapshot(d,'2026-10-01',{}).holdings[0].accountId,'m');
  });
}
