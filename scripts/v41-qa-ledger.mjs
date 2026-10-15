// 4.1 browser checks for WS-LEDGER (§E.2): transfers, the ATM shortcut, paying a loan, refunds, "הפקדתי עכשיו",
// undo (and its refusal across tabs), the 4.0 upgrade and the phone layout. Part 2 adds the card body,
// installments (step 5) and the bank-statement card line (step 8).
import {demoData,emptyData} from '../src/data.js';
import {applyTransaction} from '../src/finance.js';

// Fixture L (§E.2): bank, cash, savings, a car loan and a card ("מקס", billing day 10) with the E4 rows.
function fixtureL(){
  const d={...emptyData(),createdAt:'2026-09-01',fx:3.65,fxDate:'2026-10-14',profile:'נועם'};
  const acc=(id,name,kind,balance,extra={})=>({id,name,institution:'',kind,currency:'ILS',balance,original:0,payment:0,interest:0,...extra});
  d.accounts=[acc('bank','עו״ש','bank',6000,{balanceUpdated:'2026-10-14'}),acc('cash','מזומן','cash',300),acc('sav','חיסכון S','savings',2000),acc('loan','הלוואת רכב','debt',25500,{original:45000,payment:1250,interest:5.5}),acc('card','מקס','credit',0,{institution:'מקס',billingDay:10,payFrom:'bank',statementsThrough:'2026-09-25',createdAt:'2026-09-25'})];
  const tx=(id,type,amount,date,category,description)=>({id,type,amount,currency:'ILS',fx:3.65,date,category,subcategory:'',accountId:'card',description,tags:[],recurring:false});
  for(const t of [tx('e1','expense',400,'2026-10-03','קניות בסופר','שופרסל'),tx('e2','expense',150,'2026-10-09','מסעדות','מסעדה'),tx('e3','expense',80,'2026-10-10','דלק','דלק'),tx('e4','refund',50,'2026-10-12','קניות בסופר','זיכוי שופרסל')]){applyTransaction(d,t);d.transactions.push(t);}
  d.budgets=[{id:'b1',category:'קניות בסופר',limit:2500}];
  d.goals=[{id:'g1',name:'קרן חירום',type:'קרן חירום',target:20000,saved:0,date:'2027-12-31',monthly:500,accountId:'sav',allocation:1000}];
  return d;
}
// The 4.0 demo, as a real user's 4.0 data: no 4.1 fields at all.
function fixture40(){const d=demoData();d.demo=false;delete d.installments;delete d.createdAt;return d;}

async function settle(page){
  await page.waitForFunction(()=>performance.now()>1600);
  if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}
const go=async(page,id)=>{await page.evaluate(id=>{location.hash=id;},id);await page.waitForFunction(id=>document.querySelector('.page-heading')&&location.hash==='#'+id,id);await page.waitForTimeout(200);};
const shot=(qa,page,name,full=false)=>page.screenshot({path:qa.path.join(qa.shots,name),fullPage:full});
const balance=async(s,id)=>(await s.stored()).accounts.find(a=>a.id===id).balance;
const toastText=page=>page.locator('.toast').last().textContent();
const act=(page,action)=>page.evaluate(action=>{const b=document.createElement('button');b.dataset.action=action;b.hidden=true;document.body.append(b);b.click();b.remove();},action);
// Every visible new button (and the form controls in a dialog) is at least 44px tall on the phone.
const tallEnough=(page,selector)=>page.evaluate(sel=>[...document.querySelectorAll(sel)].filter(el=>el.checkVisibility()).map(el=>[el.textContent.trim()||el.name,Math.round(el.getBoundingClientRect().height)]).filter(([,h])=>h<44),selector);

export async function run(qa){
  const {assert}=qa;
  // ---------- 1. Load: the card statement that came due is recorded once, with a toast ----------
  let s=await qa.open({data:fixtureL()});
  const {page}=s;
  await page.waitForFunction(()=>/נרשם אוטומטית/.test(document.querySelector('.toast')?.textContent||''),null,{timeout:4000});
  assert.match(await toastText(page),/חיוב מקס/);
  await settle(page);
  let d=await s.stored();
  const statement=d.transactions.find(t=>t.id==='card-card-2026-10-10');
  assert.ok(statement,'the 10/10 statement is recorded');assert.equal(statement.amount,550);assert.equal(statement.type,'transfer');
  assert.equal(await balance(s,'bank'),5450);assert.equal(await balance(s,'card'),30);
  await go(page,'accounts');
  assert.match(await page.locator('.metric',{hasText:'סך התחייבויות'}).textContent(),/הלוואות.*כרטיסים/s);
  await shot(qa,page,'v41-L01-accounts.png',true);

  // ---------- 2. Full-form transfer bank → cash 200, then undo restores the exact stored string ----------
  await go(page,'transactions');
  const beforeTransfer=await page.evaluate(()=>localStorage.getItem('ofek-finance-v1'));
  await page.locator('[data-action="open:transaction"]').first().click();
  await page.locator('#entity-form [data-action="entity-type:transfer"]').click();
  await page.locator('#entity-form [name=accountId]').selectOption('bank');
  await page.locator('#entity-form [name=toAccountId]').selectOption('cash');
  await page.locator('#entity-form [name=amount]').fill('200');
  assert.match(await page.locator('#entity-form').textContent(),/היא לא הכנסה ולא הוצאה/);
  await shot(qa,page,'v41-L02-transfer-form.png');
  await page.locator('#entity-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#entity-form'));
  assert.equal(await balance(s,'bank'),5250);assert.equal(await balance(s,'cash'),500);
  assert.match(await toastText(page),/העברה של .*200.* נרשמה: מ־עו״ש ל־מזומן/);
  const row=page.locator('.tx-table tbody tr',{hasText:'מ־עו״ש ל־מזומן'}).first();
  assert.match(await row.textContent(),/העברה/);
  await page.locator('.toast [data-action="undo"]').click();
  await page.waitForFunction(()=>/השינוי בוטל/.test(document.querySelector('.toast')?.textContent||''));
  assert.equal(await page.evaluate(()=>localStorage.getItem('ofek-finance-v1')),beforeTransfer,'undo puts back the exact stored data');

  // ---------- 3. Quick add: the ATM chip, both effect lines before saving ----------
  await act(page,'quick-add');
  await page.locator('#quick-form [data-quick-type="transfer"]').click();
  await page.locator('#quick-form [data-quick-preset]',{hasText:'משיכה מכספומט'}).click();
  await page.locator('#quick-form [name=amount]').fill('100');
  const lines=page.locator('#quick-form .lg-effect-lines > span');
  assert.equal(await lines.count(),2,'one effect line per account');
  assert.match(await lines.nth(0).textContent(),/עו״ש/);assert.match(await lines.nth(1).textContent(),/מזומן/);
  assert.match(await page.locator('#quick-form [data-quick-save]').textContent(),/שמירת העברה/);
  await page.locator('#quick-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#quick-form'));
  assert.equal(await balance(s,'cash'),400);assert.equal(await balance(s,'bank'),5350);
  assert.equal((await s.stored()).transactions.at(-1).description,'משיכה מכספומט');

  // ---------- 4. Paying the loan: over the debt is refused, 1,250 brings it to 24,250 ----------
  await go(page,'accounts');
  await page.locator('[data-action="transfer-new:bank:loan"]').click();
  assert.equal(await page.locator('#entity-form [name=amount]').inputValue(),'1250');
  assert.match(await page.locator('#entity-form').textContent(),/נשאר לשלם/);
  await page.locator('#entity-form [name=amount]').fill('30000');
  await page.locator('#entity-form [type=submit]').click();
  await page.locator('#entity-error .notice').waitFor();
  assert.match(await page.locator('#entity-error').textContent(),/הסכום גבוה מיתרת החוב/);
  await page.locator('#entity-form [name=amount]').fill('1250');
  await page.locator('#entity-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#entity-form'));
  assert.equal(await balance(s,'loan'),24250);

  // ---------- 6. Refund: 50 in קניות בסופר shows on the budget card ----------
  await go(page,'transactions');
  await page.locator('[data-action="open:transaction"]').first().click();
  await page.locator('#entity-form [data-action="entity-type:refund"]').click();
  assert.match(await page.locator('#entity-form').textContent(),/ההחזר מקטין את ההוצאה בה/);
  assert.equal(await page.locator('#entity-form [name=category] option',{hasText:'משכורת'}).count(),0,'refunds offer spending categories only');
  await page.locator('#entity-form [name=amount]').fill('50');
  await page.locator('#entity-form [name=category]').selectOption('קניות בסופר');
  await page.locator('#entity-form [name=accountId]').selectOption('bank');
  await page.locator('#entity-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#entity-form'));
  assert.equal((await s.stored()).transactions.at(-1).type,'refund');
  await go(page,'budgets');
  assert.match(await page.locator('.budget-card',{hasText:'קניות בסופר'}).textContent(),/כולל זיכוי של/);
  await shot(qa,page,'v41-L03-budgets.png');

  // ---------- 7. "הפקדתי עכשיו" from the bank, 500 ----------
  await go(page,'goals');
  const bankBefore=await balance(s,'bank');
  await page.locator('[data-action="goal-deposit:g1"]').click();
  await page.locator('#goal-deposit-form [name=amount]').fill('500');
  await page.locator('#goal-deposit-form [name=fromId]').selectOption('bank');
  assert.match(await page.locator('#goal-deposit-note').textContent(),/תירשם העברה מ־עו״ש ל־חיסכון S, וההקצאה ליעד תגדל ב־/);
  await shot(qa,page,'v41-L04-goal-deposit.png');
  await page.locator('#goal-deposit-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#goal-deposit-form'));
  d=await s.stored();
  assert.equal(d.goals[0].allocation,1500);assert.equal(d.accounts.find(a=>a.id==='sav').balance,2500);assert.equal(await balance(s,'bank'),bankBefore-500);
  assert.equal(d.transactions.at(-1).goalId,'g1');

  // ---------- 9. Undo is refused after another tab saved ----------
  await go(page,'transactions');
  const victim=d.transactions.find(t=>t.type==='expense'&&t.id==='e2');
  await page.locator(`[data-action="remove:transaction:${victim.id}"]`).click();
  await page.locator('dialog [data-action="confirm"]').click();
  await page.waitForFunction(()=>/התנועה נמחקה/.test(document.querySelector('.toast')?.textContent||''));
  const other=await s.context.newPage();
  other.on('pageerror',err=>qa.errors.push(err.message));
  await other.goto(qa.app);await settle(other);
  await go(other,'settings');
  await other.locator('#settings-form [name=profile]').fill('נועם מהלשונית השנייה');
  await other.locator('#settings-form [type=submit]').click();
  await other.waitForFunction(()=>/נועם מהלשונית השנייה/.test(localStorage.getItem('ofek-finance-v1')));
  const saved=await other.evaluate(()=>localStorage.getItem('ofek-finance-v1'));
  await page.waitForTimeout(300);
  await act(page,'undo');
  await page.waitForFunction(()=>/אי אפשר לבטל/.test(document.querySelector('.toast')?.textContent||''));
  assert.equal(await page.evaluate(()=>localStorage.getItem('ofek-finance-v1')),saved,'the refused undo changes nothing');
  await other.close();await s.context.close();

  // ---------- 10. 4.0 data loads unchanged ----------
  const f40=fixture40();
  s=await qa.open({data:f40});
  await settle(s.page);
  const stored40=await s.stored(),norm=x=>JSON.stringify({...x,fx:0,fxDate:''});   // the daily dollar rate may update fx/fxDate, as in 4.0
  for(const key of new Set([...Object.keys(stored40),...Object.keys(f40)]))if(!['fx','fxDate'].includes(key))assert.equal(JSON.stringify(stored40[key]),JSON.stringify(f40[key]),`4.0 data unchanged: ${key}`);
  assert.equal(norm(stored40),norm(f40),'4.0 data is stored byte-identical (apart from the dollar rate)');
  for(const route of ['dashboard','transactions','accounts','budgets','bills','goals'])await go(s.page,route);
  await s.context.close();

  // ---------- 11. Phone, light and dark ----------
  for(const theme of ['light','dark']){
    s=await qa.open({data:fixtureL(),width:390,height:844,theme});
    const p=s.page;await settle(p);
    await go(p,'accounts');await s.noOverflow(`accounts ${theme}`);
    assert.deepEqual(await tallEnough(p,'.account-actions .button'),[],'account buttons ≥ 44px');
    await shot(qa,p,`v41-L1-${theme}-accounts.png`,true);
    await go(p,'transactions');await s.noOverflow(`transactions ${theme}`);
    await shot(qa,p,`v41-L2-${theme}-transactions.png`);
    await act(p,'quick-add');
    await p.locator('#quick-form [data-quick-type="transfer"]').click();
    await p.locator('#quick-form [data-quick-preset]').first().click();
    await p.locator('#quick-form [name=amount]').fill('250');
    await s.noOverflow(`quick transfer ${theme}`);
    assert.deepEqual(await tallEnough(p,'#quick-form .lg-presets .quick-cat, #quick-form select, #quick-form [data-quick-type]'),[],'quick transfer controls ≥ 44px');
    await shot(qa,p,`v41-L3-${theme}-quick-transfer.png`);
    await p.keyboard.press('Escape');
    await act(p,'transfer-new:bank:loan');
    await s.noOverflow(`transfer form ${theme}`);
    assert.deepEqual(await tallEnough(p,'#entity-form select, #entity-form input:not([type=hidden]), #entity-form .segmented button'),[],'transfer form controls ≥ 44px');
    await shot(qa,p,`v41-L4-${theme}-transfer-form.png`);
    await p.keyboard.press('Escape');
    await go(p,'goals');await s.noOverflow(`goals ${theme}`);
    assert.deepEqual(await tallEnough(p,'.lg-goal-deposit .button'),[],'"הפקדתי עכשיו" ≥ 44px');
    await shot(qa,p,`v41-L5-${theme}-goals.png`,true);
    await s.context.close();
  }
  console.log('ledger: transfers, ATM, loan payment, refund, goal deposit, undo and its refusal, 4.0 upgrade, phone layout — OK');
}
