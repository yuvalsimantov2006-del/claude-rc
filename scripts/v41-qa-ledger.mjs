// 4.1 browser checks for WS-LEDGER (§E.2): transfers, the ATM shortcut, paying a loan, refunds, "הפקדתי עכשיו",
// undo (and its refusal across tabs), the 4.0 upgrade and the phone layout; the card body, installments (step 5)
// and the bank-statement card line (step 8).
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
  const cardBody=await page.locator('.account-card.lg-credit').textContent();
  assert.match(cardBody,/החיוב הבא/);assert.match(cardBody,/הערכה/);assert.match(cardBody,/יורד מחשבון\s*עו״ש/);assert.match(cardBody,/ב־10 לחודש/);
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

  // ---------- 5. Installments on the card: 12 × 3,600 bought 2026-09-20 ----------
  await page.locator('[data-action="card-plan:card"]').click();
  assert.ok(await page.locator('#entity-form [name=planOn]').isChecked(),'the card opens the form with installments on');
  assert.match(await page.locator('#entity-form').textContent(),/מחיר מלא/);
  await page.locator('#entity-form [name=amount]').fill('3600');
  await page.locator('#entity-form [name=installments]').fill('12');
  await page.locator('#entity-form [name=date]').fill('2026-09-20');
  await page.locator('#entity-form [name=description]').fill('אייפון');
  await page.locator('#entity-form [name=category]').selectOption('קניות');
  await page.waitForFunction(()=>/12 תשלומים של/.test(document.querySelector('#plan-preview')?.textContent||''));
  const preview=await page.locator('#plan-preview').textContent();
  assert.match(preview,/הראשון ב־/);assert.match(preview,/כל תשלום נספר בחודש שבו הוא יורד מהכרטיס/);
  assert.equal(await page.locator('#entity-form [name=alreadyCharged]').inputValue(),'0');
  await shot(qa,page,'v41-L06-plan-form.png');
  await page.locator('#entity-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#entity-form'));
  assert.match(await toastText(page),/נוספה עסקה בתשלומים: אייפון · 12 ×/);
  d=await s.stored();
  assert.equal(d.installments.length,1);assert.equal(d.installments[0].next,2);
  assert.equal(d.transactions.find(t=>t.id===`inst-${d.installments[0].id}-1`)?.amount,300,'payment 1 (10/10) is recorded');
  assert.equal(await balance(s,'card'),330);
  const plans=page.locator('.lg-plans-card');
  assert.match(await plans.textContent(),/נשארו 11 מתוך 12/);
  assert.match(await page.locator('.account-card.lg-credit').textContent(),/בתשלומים\s*1 עסקה/);
  await shot(qa,page,'v41-L07-plans.png',true);

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

  // ---------- 8. Capture: a bank line that pays the card becomes a transfer to it ----------
  {
    const fx=fixtureL();fx.accounts.find(a=>a.id==='card').institution='ישראכרט';
    const c=await qa.open({data:fx});await settle(c.page);
    await go(c.page,'capture');
    await c.page.locator('[data-action="capture-paste"]').click();
    await c.page.locator('#capture-text').fill('תאריך\tתיאור\tחובה\tזכות\n12/10/2026\tישראכרט\t850\t\n13/10/2026\tמקסים מסעדה\t120\t');
    await c.page.locator('[data-action="capture-parse-text"]').click();
    const line=c.page.locator('.capture-table tbody tr',{hasText:'חיוב כרטיס'});
    await line.waitFor();
    assert.equal(await line.count(),1,'only the card company line is a card payment');
    assert.equal(await line.locator('select[data-cap$=".type"]').inputValue(),'transfer');
    assert.match(await line.locator('select[data-cap$=".type"]').textContent(),/העברה ל־מקס/);
    assert.match(await line.textContent(),/לעדכון/);assert.match(await line.textContent(),/החיוב הרשום הוא הערכה/);
    assert.match(await c.page.locator('.capture-sum').textContent(),/העברות\s*1/);
    await shot(qa,c.page,'v41-L08-capture.png',true);
    await c.page.locator('[data-action="capture-save"]').click();
    await c.page.waitForFunction(()=>/נקלטו 2 תנועות/.test(document.querySelector('.toast')?.textContent||''));
    const cd=await c.stored(),st=cd.transactions.find(t=>t.id==='card-card-2026-10-10');
    assert.equal(st.amount,850,'the estimated statement is updated to the bank amount');assert.equal(st.toAmount,850);assert.equal(st.auto.confirm,false);
    assert.equal(cd.transactions.filter(t=>t.type==='transfer').length,1,'no second card charge');
    assert.equal(cd.accounts.find(a=>a.id==='bank').balance,6000-850-120);assert.equal(cd.accounts.find(a=>a.id==='card').balance,580-850);
    await c.context.close();
  }

  // ---------- 9. Undo is refused after another tab saved ----------
  await go(page,'transactions');
  const victim=d.transactions.find(t=>t.type==='expense'&&t.id==='e2');
  await page.locator(`[data-action="remove:transaction:${victim.id}"]`).click();
  await page.locator('dialog [data-action="confirm"]').click();
  await page.waitForFunction(()=>/התנועה נמחקה/.test(document.querySelector('.toast')?.textContent||''));
  // Every toast tab A shows from here on (the storage event's own toast may replace the refusal one).
  await page.evaluate(()=>{window.__toasts=[];new MutationObserver(()=>{const t=document.querySelector('.toast')?.textContent;if(t&&window.__toasts.at(-1)!==t)window.__toasts.push(t);}).observe(document.body,{childList:true});});
  // Another tab saves (here: a profile name), written straight to storage as that tab would. Playwright pages on
  // file:// do not reliably share one localStorage, so the second tab is simulated in tab A. The storage event
  // has not arrived yet, the strictest case: undo must still be refused, from the stored string alone.
  const saved=await page.evaluate(()=>{const v=JSON.parse(localStorage.getItem('ofek-finance-v1'));v.profile='נועם מהלשונית השנייה';const text=JSON.stringify(v);localStorage.setItem('ofek-finance-v1',text);return text;});
  await act(page,'undo');
  await page.waitForFunction(()=>window.__toasts.some(t=>/אי אפשר לבטל/.test(t)),null,{polling:100});
  assert.ok(!(await page.evaluate(()=>window.__toasts)).some(t=>/השינוי בוטל/.test(t)),'nothing was undone');
  assert.equal(await page.evaluate(()=>localStorage.getItem('ofek-finance-v1')),saved,'the refused undo changes nothing');
  await page.evaluate(saved=>window.dispatchEvent(new StorageEvent('storage',{key:'ofek-finance-v1',newValue:saved})),saved);
  await page.waitForFunction(()=>window.__toasts.some(t=>/מלשונית אחרת/.test(t)),null,{polling:100});   // and then the tab follows the other one
  await s.context.close();

  // ---------- 10. 4.0 data loads unchanged ----------
  const f40=fixture40();
  s=await qa.open({data:f40});
  await settle(s.page);
  const stored40=await s.stored(),norm=x=>JSON.stringify({...x,fx:0,fxDate:'',fxSource:''});   // the daily dollar rate may update fx, fxDate and fxSource, as in 4.0
  for(const key of new Set([...Object.keys(stored40),...Object.keys(f40)]))if(!['fx','fxDate','fxSource'].includes(key))assert.equal(JSON.stringify(stored40[key]),JSON.stringify(f40[key]),`4.0 data unchanged: ${key}`);
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
    const small=await tallEnough(p,'#entity-form select, #entity-form input:not([type=hidden]), #entity-form .segmented button');
    assert.deepEqual(small,[],`transfer form controls ≥ 44px: ${JSON.stringify(small)}`);
    await shot(qa,p,`v41-L4-${theme}-transfer-form.png`);
    await p.keyboard.press('Escape');
    await act(p,'open:account');
    await p.locator('#entity-form [name=kind]').selectOption('credit');
    await p.locator('#entity-form [name=billingDay]').waitFor();
    await s.noOverflow(`card form ${theme}`);
    assert.deepEqual(await tallEnough(p,'#entity-form select, #entity-form input:not([type=hidden])'),[],'card form controls ≥ 44px');
    await shot(qa,p,`v41-L6-${theme}-card-form.png`,true);
    await p.keyboard.press('Escape');
    await act(p,'card-plan:card');
    await p.locator('#entity-form [name=amount]').fill('3600');
    await p.locator('#entity-form [name=installments]').fill('12');
    await p.locator('#entity-form [name=date]').fill('2026-09-20');
    await p.waitForFunction(()=>/12 תשלומים של/.test(document.querySelector('#plan-preview')?.textContent||''));
    await s.noOverflow(`plan form ${theme}`);
    await shot(qa,p,`v41-L7-${theme}-plan-form.png`);
    await p.locator('#entity-form [type=submit]').click();
    await p.waitForFunction(()=>!document.querySelector('#entity-form'));
    await go(p,'accounts');await s.noOverflow(`accounts with plans ${theme}`);
    assert.deepEqual(await tallEnough(p,'.lg-plan-actions .icon-button, .lg-plan-actions .text-button, .account-actions .button'),[],'plan and card actions ≥ 44px');
    await p.locator('.lg-plans-card').scrollIntoViewIfNeeded();
    await shot(qa,p,`v41-L8-${theme}-plans.png`);
    await go(p,'capture');
    await p.locator('[data-action="capture-paste"]').click();
    await p.locator('#capture-text').fill('תאריך\tתיאור\tחובה\tזכות\n12/10/2026\tמקס איט\t850\t\n13/10/2026\tויזה כאל\t120\t');
    await p.locator('[data-action="capture-parse-text"]').click();
    await p.locator('.capture-table').waitFor();
    await s.noOverflow(`capture ${theme}`);
    await shot(qa,p,`v41-L9-${theme}-capture.png`,true);
    await go(p,'goals');await s.noOverflow(`goals ${theme}`);
    assert.deepEqual(await tallEnough(p,'.lg-goal-deposit .button'),[],'"הפקדתי עכשיו" ≥ 44px');
    await shot(qa,p,`v41-L5-${theme}-goals.png`,true);
    await s.context.close();
  }
  console.log('ledger: card body, transfers, ATM, loan payment, installments, refund, goal deposit, capture card lines, undo and its refusal, 4.0 upgrade, phone layout — OK');
  await runInvest(qa);
}

// ======================= Investment accounts, the daily update, goals and "everything connects" =======================
// Fixture I: a bank account and three holdings with NO investment account (as a 4.0 user who never made one).
function fixtureI(){
  const d={...emptyData(),createdAt:'2026-09-01',fx:3.65,fxDate:'2026-10-14',profile:'נועה',wallets:{ILS:1000,USD:0}};
  d.accounts=[{id:'bank',name:'עו״ש',institution:'',kind:'bank',currency:'ILS',balance:10000,original:0,payment:0,interest:0}];
  const asset=(id,name,ticker,currency,quantity,price,extra={})=>({id,name,ticker,type:'קרן סל',currency,quantity,averagePrice:price,invested:quantity*price,currentPrice:price,currentValue:quantity*price,mode:'price',date:'2026-10-01',notes:'',...extra});
  d.assets=[asset('voo','Vanguard S&P 500','VOO','USD',10,500),asset('ta','תכלית ת״א 125','TA125','ILS',100,477),asset('btc','Bitcoin','BTC','USD',.1,60000,{type:'קריפטו'})];
  d.goals=[{id:'g1',name:'קרן חירום',type:'קרן חירום',target:30000,saved:0,date:'2027-12-31',monthly:1000,accountId:'bank',allocation:5000},{id:'g2',name:'חופשה',type:'חופשה',target:null,saved:2000,date:'2027-06-30',monthly:500,accountId:''}];
  return d;
}
const containers=d=>d.accounts.filter(a=>a.kind==='investment');
export async function runInvest(qa){
  const {assert}=qa;
  // ---------- Containers: the virtual "התיק שלי", a new provident fund, a direct deposit, moving and deleting ----------
  let s=await qa.open({data:fixtureI()});
  const {page}=s;await settle(page);
  await go(page,'investments');
  assert.equal(await page.locator('.container-card').count(),1,'one (virtual) container before any exists');
  assert.match(await page.locator('.container-card h2').first().textContent(),/התיק שלי/);
  assert.equal(await page.locator('.container-card .holding-row').count(),4,'three holdings and the portfolio cash');
  assert.equal(containers(await s.stored()).length,0,'viewing the page writes nothing');
  // A new provident fund: "התיק שלי" is created first for the three holdings.
  await page.locator('[data-action="container-new"]').click();
  await page.locator('#entity-form [name=name]').fill('אלטשולר שחם · גמל');
  await page.locator('#entity-form [name=invType]').selectOption('gemel');
  await page.locator('#entity-form [name=institution]').fill('אלטשולר שחם');
  await page.locator('#entity-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#entity-form'));
  let d=await s.stored();
  assert.deepEqual(containers(d).map(a=>[a.name,a.invType]),[['התיק שלי','broker'],['אלטשולר שחם · גמל','gemel']]);
  const mine=containers(d)[0].id,gemel=containers(d)[1].id;
  assert.ok(d.assets.every(a=>a.accountId===mine),'the existing holdings went to "התיק שלי"');
  assert.match(await toastText(page),/התיק שלי/);
  // A track inside the fund (value mode), then a monthly deposit from the bank straight into it.
  await page.locator(`[data-action="container-add:${gemel}"]`).click();
  assert.equal(await page.locator('#entity-form [name=mode]').inputValue(),'value');
  assert.equal(await page.locator('#entity-form [name=accountId]').inputValue(),gemel);
  await page.locator('#entity-form [name=name]').fill('מסלול מניות');
  await page.locator('#entity-form [name=currentValue]').fill('50000');
  await page.locator('#entity-form [name=invested]').fill('40000');
  await page.locator('#entity-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#entity-form'));
  d=await s.stored();const track=d.assets.find(a=>a.name==='מסלול מניות');
  assert.equal(track.accountId,gemel);assert.equal(track.mode,'value');
  await page.locator('[data-action="open:activity"]').click();
  await page.locator('#entity-form [name=assetId]').selectOption(track.id);
  await page.locator('#entity-form [name=amount]').fill('1000');
  await page.locator('#entity-form [name=accountId]').selectOption('bank');
  await page.locator('#entity-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#entity-form'));
  d=await s.stored();
  const t2=d.assets.find(a=>a.id===track.id);
  assert.equal(t2.currentValue,51000);assert.equal(t2.invested,41000);
  assert.equal(d.accounts.find(a=>a.id==='bank').balance,9000);assert.equal(d.wallets.ILS,1000,'a direct deposit never sits in the portfolio cash');
  const gemelCard=page.locator('.container-card',{hasText:'אלטשולר שחם · גמל'});
  assert.match(await gemelCard.locator('.container-value').textContent(),/51,000/);
  // Rename "התיק שלי", move TA125 to the fund through the holding form, then delete the fund (holdings move back).
  await page.locator(`[data-action="container-edit:${mine}"]`).click();
  await page.locator('#entity-form [name=name]').fill('מיטב טרייד');
  await page.locator('#entity-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#entity-form'));
  await page.locator('[data-action="edit:asset:ta"]').click();
  await page.locator('#entity-form [name=accountId]').selectOption(gemel);
  await page.locator('#entity-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#entity-form'));
  d=await s.stored();assert.equal(d.assets.find(a=>a.id==='ta').accountId,gemel);
  assert.equal(await gemelCard.locator('.holding-row').count(),2);
  await page.waitForTimeout(1200);   // the figures count up after a change
  const values=await page.evaluate(()=>[...document.querySelectorAll('.container-value')].map(el=>Number(el.textContent.replace(/[^\d.]/g,''))));
  const total=Number((await page.locator('.metric',{hasText:'שווי תיק ההשקעות'}).locator('.metric-value').textContent()).replace(/[^\d.]/g,''));
  assert.ok(Math.abs(values.reduce((a,b)=>a+b,0)-total)<=2,`the accounts add up to the portfolio (${values} vs ${total})`);
  await shot(qa,page,'v41-I01-containers.png',true);
  await page.locator(`[data-action="container-remove:${gemel}"]`).click();
  await page.locator('#container-remove-form [name=target]').selectOption(mine);
  await page.locator('#container-remove-form [type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#container-remove-form'));
  d=await s.stored();
  assert.deepEqual(containers(d).map(a=>a.name),['מיטב טרייד']);assert.ok(d.assets.every(a=>a.accountId===mine),'the fund holdings moved');
  await go(page,'accounts');
  assert.match(await page.locator('.account-card',{hasText:'מיטב טרייד'}).textContent(),/חשבון מסחר/);
  await s.context.close();
  console.log('invest: containers (virtual default, new fund, direct deposit, rename, move, delete with move) — OK');

  // ---------- The daily update: fetched where possible (mocked sources), typed elsewhere, no snapshot ----------
  const unix=date=>Date.parse(date+'T20:00:00Z')/1000;
  const quoteRoutes=async(context,{finnhub=true}={})=>context.route(/api\.coingecko\.com|api\.coinbase\.com|finnhub\.io|api\.twelvedata\.com/,route=>{
    const u=new URL(route.request().url()),json=body=>route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(body)});
    if(u.hostname==='api.coingecko.com')return json({bitcoin:{usd:61000,ils:222650,last_updated_at:unix('2026-10-14')}});
    if(u.hostname==='finnhub.io'&&finnhub)return json(u.searchParams.get('symbol')==='VOO'?{c:512.3,pc:505,t:unix('2026-10-13')}:{c:0,pc:0,t:0});
    return route.abort('failed');
  });
  s=await qa.open({data:fixtureI(),extra:{'ofek-quotes-v1':JSON.stringify({provider:'finnhub',key:'qa-key'})}});
  await quoteRoutes(s.context);
  let p=s.page;await settle(p);await go(p,'investments');
  const snapsBefore=(await s.stored()).snapshots.length;
  await p.locator('[data-action="daily-update"]').click();
  await p.waitForFunction(()=>/כל 2 המחירים נמשכו אוטומטית/.test(document.querySelector('#daily-progress')?.textContent||''));
  assert.equal(await p.locator('#daily-form [name=q_voo]').inputValue(),'512.3');
  assert.equal(await p.locator('#daily-form [name=q_btc]').inputValue(),'61000');
  assert.match(await p.locator('#ds-voo').textContent(),/Finnhub.*מחיר מסחר של/);
  assert.match(await p.locator('#ds-ta').textContent(),/בורסת ת״א/);
  await p.locator('#daily-form [name=q_ta]').fill('480');
  assert.match(await p.locator('#daily-total').textContent(),/שווי התיק אחרי העדכון/);
  await shot(qa,p,'v41-I02-daily-update.png');
  await p.locator('#daily-form [type=submit]').click();
  await p.waitForFunction(()=>!document.querySelector('#daily-form'));
  d=await s.stored();
  const asset=id=>d.assets.find(a=>a.id===id);
  assert.deepEqual([asset('voo').currentPrice,asset('voo').priceSource,asset('voo').priceDate,asset('voo').date],[512.3,'Finnhub','2026-10-13','2026-10-14']);
  assert.deepEqual([asset('btc').currentPrice,asset('btc').priceSource],[61000,'CoinGecko']);
  assert.deepEqual([asset('ta').currentPrice,asset('ta').priceSource,asset('ta').priceDate],[480,'ידני','2026-10-14']);
  assert.equal(d.snapshots.length,snapsBefore,'the daily update never makes a snapshot');
  assert.match(await toastText(p),/עודכנו 3 נכסים/);
  assert.match(await p.locator('.invest-updates').textContent(),/כל המחירים עודכנו היום/);
  assert.equal(await p.locator('.holding-fresh.fresh').count(),3);
  const expected=Math.round(10*512.3*3.65+100*480+.1*61000*3.65+1000);
  const metricValue=label=>p.evaluate(label=>{const m=[...document.querySelectorAll('.metric')].find(x=>x.textContent.includes(label));return Number(m?.querySelector('.metric-value')?.textContent.replace(/[^\d.]/g,''));},label);
  await p.waitForFunction(([label,expected])=>{const m=[...document.querySelectorAll('.metric')].find(x=>x.textContent.includes(label));return Math.abs(Number(m?.querySelector('.metric-value')?.textContent.replace(/[^\d.]/g,''))-expected)<=1;},['שווי תיק ההשקעות',expected],{timeout:4000}).catch(()=>{});
  const shown=await metricValue('שווי תיק ההשקעות');
  assert.ok(Math.abs(shown-expected)<=1,`the portfolio total follows the new prices (${shown} vs ${expected})`);
  await go(p,'dashboard');
  const homeHas=text=>p.waitForFunction(text=>document.querySelector('.page-content')?.textContent.includes(text),text,{timeout:4000}).then(()=>true,()=>false);
  assert.ok(await homeHas(expected.toLocaleString('en-US')),'the home investments widget shows the new total');
  assert.ok(await homeHas((expected+10000).toLocaleString('en-US')),'and the net worth includes it');
  await s.context.close();
  // Without a key the US stock is typed (with a way to connect a source); an unreachable source never blocks typing.
  s=await qa.open({data:fixtureI(),width:390,height:844,theme:'dark'});
  await quoteRoutes(s.context,{finnhub:false});
  p=s.page;await settle(p);await go(p,'investments');await s.noOverflow('investments phone');
  await shot(qa,p,'v41-I03-investments-phone.png',true);
  await p.locator('[data-action="daily-update"]').click();
  await p.waitForFunction(()=>/המחיר נמשך אוטומטית/.test(document.querySelector('#daily-progress')?.textContent||''));
  assert.match(await p.locator('#ds-voo').textContent(),/מפתח חינמי/);
  assert.equal(await p.locator('#daily-form [data-action="quotes-settings"]').count(),1);
  await s.noOverflow('daily update phone');
  assert.deepEqual(await tallEnough(p,'#daily-form input, #daily-form .form-actions .button'),[],'daily update controls ≥ 44px');
  await shot(qa,p,'v41-I04-daily-phone.png');
  await p.locator('#daily-form [name=q_voo]').fill('505');
  await p.locator('#daily-form [type=submit]').click();
  await p.waitForFunction(()=>!document.querySelector('#daily-form'));
  d=await s.stored();assert.equal(d.assets.find(a=>a.id==='voo').currentPrice,505);
  await p.locator('.toast [data-action="undo"]').click();
  await p.waitForFunction(()=>/השינוי בוטל/.test(document.querySelector('.toast')?.textContent||''));
  assert.equal((await s.stored()).assets.find(a=>a.id==='voo').currentPrice,500,'undo puts the old prices back');
  // The key dialog: saved on the device only, never in the data.
  await act(p,'quotes-settings');
  await p.locator('#quotes-form [name=key]').fill('my-free-key');
  await p.locator('#quotes-form [type=submit]').click();
  await p.waitForFunction(()=>!document.querySelector('#quotes-form'));
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('ofek-quotes-v1')).key),'my-free-key');
  assert.ok(!(await p.evaluate(()=>localStorage.getItem('ofek-finance-v1'))).includes('my-free-key'),'the key is not in the data');
  await s.context.close();
  console.log('invest: daily update (CoinGecko + Finnhub mocked, typed TASE, no snapshot, totals and home follow, undo, key on device) — OK');

  // ---------- Goals: compact cards, one primary action, the menu, "פרטים", "הפקדה חודשית אוטומטית" ----------
  s=await qa.open({data:fixtureI()});p=s.page;await settle(p);await go(p,'goals');
  assert.equal(await p.locator('.goal-card').count(),2);
  const g1=p.locator('.goal-card',{hasText:'קרן חירום'});
  assert.match(await g1.locator('.goal-amounts').textContent(),/5,000.*מתוך.*30,000/s);
  assert.match(await g1.locator('.goal-facts').textContent(),/בחודש כדי להגיע בזמן.*צפי הגעה/s);
  assert.equal(await g1.locator('.goal-actions .button.primary').count(),1,'one primary action');
  assert.equal(await g1.locator('.goal-menu-list').isVisible(),false,'the menu starts closed');
  await g1.locator('.goal-menu summary').click();
  assert.ok(await g1.locator('.goal-menu-list').isVisible());
  assert.deepEqual(await g1.locator('.goal-menu-item').allTextContents(),['עריכה','הפקדה חודשית אוטומטית','מחיקה']);
  await p.locator('.goals-head h2').click();
  assert.equal(await p.locator('.goal-menu[open]').count(),0,'a click outside closes the menu');
  await g1.locator('[data-action="goal-info:g1"]').click();
  assert.match(await p.locator('dialog .goal-info').textContent(),/צפוי להיות לך.*כבר בחיסכון.*חשבון מקושר/s);
  await p.keyboard.press('Escape');
  await g1.locator('.goal-menu summary').click();
  await g1.locator('[data-action="goal-auto:g1"]').click();
  await p.waitForFunction(()=>document.querySelector('dialog')||/לא זמינה/.test(document.querySelector('.toast')?.textContent||''));
  if(await p.evaluate(()=>typeof openRecurringDeposit==='function'))assert.equal(await p.locator('dialog #bill-form').count(),1,'"הפקדה חודשית אוטומטית" opens the standing-deposit form');
  if(await p.locator('dialog').count())await p.keyboard.press('Escape');
  // ---------- Everything connects: 1,000 ₪ of income through the form moves every screen ----------
  const figure=async(route,selector)=>{await go(p,route);await p.waitForTimeout(1300);return Number((await p.locator(selector).first().textContent()).replace(/[^\d.-]/g,''));};
  const before={free:await figure('goals','.goals-summary > div:nth-child(3) b'),net:await figure('accounts','.metric:has-text("שווי נקי") .metric-value'),bank:await figure('accounts','.account-card:has-text("עו״ש") .large-number')};
  await act(p,'open:transaction');
  await p.locator('#entity-form [data-action="entity-type:income"]').click();
  await p.locator('#entity-form [name=amount]').fill('1000');
  await p.locator('#entity-form [name=category]').selectOption('משכורת');
  await p.locator('#entity-form [name=accountId]').selectOption('bank');
  await p.locator('#entity-form [type=submit]').click();
  await p.waitForFunction(()=>!document.querySelector('#entity-form'));
  const after={free:await figure('goals','.goals-summary > div:nth-child(3) b'),net:await figure('accounts','.metric:has-text("שווי נקי") .metric-value'),bank:await figure('accounts','.account-card:has-text("עו״ש") .large-number')};
  assert.deepEqual({free:after.free-before.free,net:after.net-before.net,bank:after.bank-before.bank},{free:1000,net:1000,bank:1000},'free money, net worth and the bank card all follow the income');
  await go(p,'transactions');
  assert.ok(await p.waitForFunction(()=>/1,000/.test(document.querySelector('#transaction-metrics')?.textContent||''),null,{timeout:4000}).then(()=>true,()=>false),'the month\'s income shows it');
  await s.context.close();
  // Phone, both themes: the goals page fits, its controls are ≥ 44px.
  for(const theme of ['light','dark']){
    s=await qa.open({data:fixtureI(),width:390,height:844,theme});p=s.page;await settle(p);await go(p,'goals');
    await s.noOverflow(`goals ${theme}`);
    assert.deepEqual(await tallEnough(p,'.goal-actions .button, .goal-menu > summary, .goals-head .button, .alloc-actions .text-button'),[],'goal controls ≥ 44px');
    await shot(qa,p,`v41-I05-${theme}-goals.png`,true);
    await s.context.close();
  }
  console.log('invest: goals (compact card, menu, details, standing deposit), 1,000 ₪ income moves every screen, phone layout — OK');
}
