import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
// Must match the `files` list in scripts/build.mjs (same order).
const files=['finance.js','hooks.js','data.js','icons.js','charts.js','savings.js','smart.js','xlsx.js','invest.js','capture.js','sync.js','fx.js','ledger.js','money.js','scenario.js','benefits.js','annual.js','backup.js','lock.js','ai.js','features.js','money-ui.js','goals-ui.js','invest-ui.js','scenario-ui.js','capture-ui.js','sync-ui.js','shell-ui.js','setup-ui.js','fx-ui.js','home-ui.js','mobile-ui.js','polish-ui.js','ledger-ui.js','benefits-ui.js','annual-ui.js','backup-ui.js','lock-ui.js','app.js'];
const source=files.map(f=>fs.readFileSync('src/'+f,'utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport\s+(?=(const|function|class|let|async))/g,'')).join('\n');
const storage=new Map(),events={},elements=[],dom=new Map();const root={innerHTML:''};
function element(tag){return {tag,innerHTML:'',className:'',classList:{add(){},remove(){}},setAttribute(){},addEventListener(){},showModal(){},close(){},remove(){const i=elements.indexOf(this);if(i>=0)elements.splice(i,1);},click(){}};}
const context=vm.createContext({console,Date,Intl,Math,JSON,Number,String,Array,Map,Set,Object,RegExp,Error,Blob,structuredClone,URL,crypto:globalThis.crypto,FormData,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location:{hash:''},document:{querySelector:s=>s==='#root'?root:s==='dialog'?elements.find(e=>e.tag==='dialog')||null:dom.get(s)||null,createElement:element,documentElement:{classList:{contains:()=>false,add(){},remove(){},toggle(){}}},body:{append:e=>elements.push(e)},addEventListener:(name,fn)=>events[name]=fn},window:{addEventListener(){},scrollTo(){}},setTimeout:()=>1,clearTimeout(){}});
vm.runInContext(source,context);
const run=script=>vm.runInContext(script,context);
assert.ok(root.innerHTML.includes('בעו״ש עכשיו'));assert.equal(run('data.snapshots.length'),10);
for(const route of ['dashboard','transactions','investments','monthly','performance','budgets','goals','accounts','insights','settings','copilot','lab','bills','split','wishlist','tools','benefits']){run(`navigate('${route}')`);assert.ok(root.innerHTML.includes('<h1>'));assert.ok(root.innerHTML.length>5000);}
run("openEntity('transaction');dialogState.v.amount=125;dialogState.v.description='בדיקה';dialogState.v.date='2026-10-01';saveEntity();");assert.equal(run("data.accounts.find(a=>a.id==='bank').balance"),26325);assert.equal(run('data.transactions.length'),127);
run("ui.filters.query='בדיקה';ui.filters.from='2026-01-01';ui.filters.to='2026-12-31'");assert.equal(run('filteredTransactions().length'),1);
run("navigate('monthly');ui.monthly.date='2026-10-01';ui.monthly.values.voo=538;ui.monthly.flows=[{id:uid(),type:'deposit',date:'2026-10-01',amount:1000,currency:'ILS',fx:3.65,accountId:'bank',quantity:0}];saveMonthly()");assert.equal(run('data.snapshots.length'),11);assert.equal(run('data.snapshots.at(-1).value'),260990);assert.equal(run("data.accounts.find(a=>a.id==='bank').balance"),25325);assert.equal(run('ui.monthlyDone.profit'),2190);assert.ok(root.innerHTML.includes('עוד חודש בדרך שלך.'));
assert.throws(()=>run("ui.monthly.date='2026-10-01';saveMonthly()"));assert.equal(run('data.snapshots.length'),11);
run("openEntity('budget');dialogState.v.category='בריאות';dialogState.v.limit=1000;saveEntity()");assert.equal(run('data.budgets.length'),7);
assert.throws(()=>run("openEntity('budget');dialogState.v.category='בריאות';dialogState.v.limit=1000;saveEntity()"));
run("openEntity('goal');dialogState.v.name='יעד בדיקה';dialogState.v.target=10000;dialogState.v.saved=1000;dialogState.v.monthly=500;saveEntity()");assert.equal(run('data.goals.length'),4);
const fixedGoals=run('JSON.stringify(data.goals)');
run("openEntity('goal')");
const targetInput=elements.find(e=>e.tag==='dialog').innerHTML.match(/<input\b[^>]*name="target"[^>]*>/)?.[0];
assert.ok(targetInput);assert.ok(!targetInput.includes('required'));
const goalFields=new Map(Object.entries({name:'תחזית בדיקה',type:'חופשה',target:'',saved:'10000',monthly:'1000',date:run('savingsDepositDate(today(),12)'),accountId:''}));
const form={fields:goalFields},preview={innerHTML:''},savedField={readOnly:false,get value(){return goalFields.get('saved');},set value(value){goalFields.set('saved',String(value));}};
dom.set('#entity-form',form);dom.set('#goal-live-preview',preview);dom.set('#entity-form [name=saved]',savedField);
context.FormData=class{constructor(form){this.fields=form.fields;}[Symbol.iterator](){return this.fields[Symbol.iterator]();}};
events.input({target:{closest:s=>s==='#entity-form'?form:null,dataset:{},setCustomValidity(){}}});
assert.ok(preview.innerHTML.includes('22,000'));assert.equal(run('dialogState.v.target'),'');
goalFields.set('monthly','2000');events.input({target:{closest:s=>s==='#entity-form'?form:null,dataset:{},setCustomValidity(){}}});assert.ok(preview.innerHTML.includes('34,000'));
goalFields.set('accountId','bank');events.change({target:{dataset:{goalAccount:''},value:'bank',closest:()=>null}});
assert.equal(savedField.readOnly,true);assert.equal(+savedField.value,25325);assert.ok(preview.innerHTML.includes('49,325'));
goalFields.set('accountId','');events.change({target:{dataset:{goalAccount:''},value:'',closest:()=>null}});assert.equal(savedField.readOnly,false);
savedField.value='10000';goalFields.set('monthly','1000');run('saveEntity()');dom.clear();context.FormData=FormData;
assert.equal(run('data.goals.length'),5);assert.equal(run('data.goals.at(-1).target'),null);assert.equal(run('goalDetails(data.goals.at(-1)).projected'),22000);
assert.equal(run('JSON.stringify(data.goals.slice(0,4))'),fixedGoals);
run("openEntity('goal',data.goals.at(-1));dialogState.v.monthly=1500;saveEntity()");assert.equal(run('goalDetails(data.goals.at(-1)).projected'),28000);assert.equal(run('data.goals.at(-1).target'),null);
const savedGoals=storage.get('ofek-finance-v1');
assert.throws(()=>run("openEntity('goal',data.goals.at(-1));dialogState.v.target=0;saveEntity()"));assert.equal(storage.get('ofek-finance-v1'),savedGoals);run('closeDialog()');
assert.equal(JSON.parse(savedGoals).goals.at(-1).target,null);
const zeroCard=run("savingsCard({...data.goals.at(-1),saved:0,monthly:0,accountId:''},0)");
assert.ok(zeroCard.includes('<span style="width:0%"></span><span style="width:0%"></span>'));
console.log('PASS: optional goal target, live forecast input events, linked account balance/read-only behavior, create/edit persistence and JSON backup, fixed target preservation, invalid target cannot alter saved data.');
run("openEntity('category');dialogState.v.name='חיות מחמד';saveEntity()");assert.ok(run("data.categories.includes('חיות מחמד')"));
run("openEntity('asset');dialogState.v.name='נכס לקנייה';dialogState.v.currency='ILS';dialogState.v.currentPrice=100;dialogState.v.quantity=0;saveEntity()");assert.equal(run('data.assets.length'),5);
run("openEntity('activity');dialogState.v.type='buy';dialogState.v.assetId=data.assets.at(-1).id;dialogState.v.currency='ILS';dialogState.v.quantity=10;dialogState.v.amount=1000;dialogState.v.date='2026-10-02';saveEntity()");assert.equal(run('data.assets.at(-1).quantity'),10);
run("data.activities.push({id:uid(),type:'deposit',amount:1,currency:'ILS',fx:3.65,date:'2026-10-04'});ui.monthly.date='2026-10-03'");assert.throws(()=>run('monthlyDraft()'));run("data.activities.pop();ui.monthly.date='2026-10-05'");
const persisted=JSON.parse(storage.get('ofek-finance-v1'));assert.equal(persisted.snapshots.length,11);assert.equal(persisted.assets.at(-1).quantity,10);
run("ui.period='custom';ui.from='2026-01-01';ui.to='2026-10-01';ui.chartMetric='portfolio';navigate('performance')");assert.ok(root.innerHTML.includes('S&amp;P')||root.innerHTML.includes('S&P'));
fs.writeFileSync('qa-rendered.html',root.innerHTML);
console.log('PASS: 10 routes render, transaction account balance/search, monthly price update + linked deposit produce ₪2,190 profit, immutable snapshots/duplicate rejection, budgets/duplicate category guard, goals, custom categories, zero holding + buy, persisted state. DOM interactions require browser QA.');

// 4.1 forms in the bundle: a transfer, a loan payment over the debt (refused), a refund and a deposit account.
{
  const bal=id=>run(`data.accounts.find(a=>a.id==='${id}').balance`),bank=bal('bank'),cash=bal('cash'),loan=bal('loan');
  run("openTransfer('bank','cash');dialogState.v.amount=200;dialogState.v.date=today()");assert.ok(elements.find(x=>x.tag==='dialog').innerHTML.includes('לחשבון'));run('saveEntity()');
  assert.equal(bal('bank'),bank-200);assert.equal(bal('cash'),cash+200);assert.equal(run("data.transactions.at(-1).type"),'transfer');
  assert.throws(()=>run("openTransfer('bank','loan');dialogState.v.amount=999999;saveEntity()"),/הסכום גבוה מיתרת החוב/);run('closeDialog()');assert.equal(bal('loan'),loan);
  run("openEntity('transaction',null,{type:'refund'});dialogState.v.amount=50;dialogState.v.category='קניות בסופר';dialogState.v.date=today();saveEntity()");assert.equal(bal('bank'),bank-150);assert.equal(run("data.transactions.at(-1).type"),'refund');
  run("openEntity('account');dialogState.v.kind='deposit';entityDialog();dialogState.v.name='פיקדון אישי';dialogState.v.balance=25000;dialogState.v.releaseDate='2031-03-01';saveEntity()");
  assert.equal(run("data.accounts.at(-1).kind"),'deposit');assert.equal(run('balances(data).restricted'),25000);run("navigate('accounts')");assert.ok(root.innerHTML.includes('ישתחרר ב־'));
  for(const route of ['transactions','budgets','goals','bills','dashboard'])run(`navigate('${route}')`);
  console.log('PASS: 4.1 transfer, debt cap, refund and restricted deposit through the real forms.');
}

// E13 (§B.8, §C.9): undo puts back the exact previous data, byte for byte, and refuses after any other change.
{
  const lastToast=()=>elements.filter(x=>x.tag==='div'&&String(x.className).startsWith('toast')).at(-1)?.innerHTML||'';
  const before=storage.get('ofek-finance-v1'),id=run('data.transactions.find(t=>!t.recurring&&t.type===\'expense\').id');
  run(`removeEntity('transaction','${id}')`);run('confirmAction();closeDialog()');
  assert.notEqual(storage.get('ofek-finance-v1'),before);assert.ok(lastToast().includes('התנועה נמחקה')&&lastToast().includes('data-action="undo"'));
  run('undoLast()');assert.equal(storage.get('ofek-finance-v1'),before);assert.ok(lastToast().includes('השינוי בוטל'));
  run(`removeEntity('transaction','${id}')`);run('confirmAction();closeDialog()');run("commit({...data,profile:'x'})");
  const changed=storage.get('ofek-finance-v1');
  run('undoLast()');assert.equal(storage.get('ofek-finance-v1'),changed);assert.ok(lastToast().includes('אי אפשר לבטל'));
  run(`removeEntity('transaction','${run('data.transactions.find(t=>!t.recurring&&t.type===\'expense\').id')}')`);run('confirmAction();closeDialog()');
  run(`data=validateData(JSON.parse(${JSON.stringify(changed)}))`);                     // what the storage listener does
  const other=storage.get('ofek-finance-v1');run('undoLast()');assert.equal(storage.get('ofek-finance-v1'),other);assert.ok(lastToast().includes('אי אפשר לבטל'));
  run(`commit(validateData(JSON.parse(${JSON.stringify(changed)})))`);
  console.log('PASS: E13 undo restores the stored data byte for byte and is refused after another save or another tab.');
}
run("loadError='bad-data'");assert.throws(()=>run('commit(emptyData())'));assert.equal(JSON.parse(storage.get('ofek-finance-v1')).snapshots.length,11);run("commit(emptyData(),'explicit restore',true)");assert.equal(run('data.snapshots.length'),0);console.log('PASS: snapshots cannot precede recorded activities; unreadable stored data cannot be overwritten by ordinary saves.');
