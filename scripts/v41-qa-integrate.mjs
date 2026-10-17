// 4.1 browser checks for WS-INTEGRATE (§E.4): auto-recorded bills (feature 4) and standing deposits.
// Salary 9,000 on the 10th with "כמה בדיוק?", a 500 ₪ monthly deposit to a goal on the 1st, the bills table
// (pause, resume, "how many are left"), the bell, the three-kind form, background recording that waits for an
// open dialog, and phone + dark screenshots. Runs only under QA41_ONLY=all.
import {emptyData} from '../src/data.js';

export function fixtureI(){
  const d={...emptyData(),createdAt:'2026-09-01',fx:3.65,fxDate:'2026-10-10',profile:'נועה',overallBudget:8000,lastBackup:'2026-10-01'};
  const acc=(id,name,kind,balance)=>({id,name,institution:'',kind,currency:'ILS',balance,original:0,payment:0,interest:0});
  d.accounts=[acc('bank','עו״ש','bank',5000),acc('sav','חיסכון','savings',10000)];
  d.goals=[{id:'g1',name:'קרן חירום',type:'קרן חירום',target:20000,saved:0,monthly:500,date:'2027-12-01',accountId:'sav'},{id:'g2',name:'טיול ליפן',type:'חופשה',target:12000,saved:1000,monthly:400,date:'2027-08-01',accountId:''}];
  d.bills=[
    {id:'sal',name:'משכורת',type:'income',amount:9000,currency:'ILS',frequency:'monthly',day:10,category:'משכורת',accountId:'bank',autopay:true,confirm:true,recordedThrough:'2026-09-30',paid:[]},
    {id:'dep',name:'הפקדה לקרן חירום',type:'expense',kind:'transfer',goalId:'g1',toAccountId:'',amount:500,currency:'ILS',frequency:'monthly',day:1,category:'העברה',accountId:'bank',autopay:true,confirm:false,recordedThrough:'2026-09-30',paid:[]},
    {id:'rent',name:'שכר דירה',type:'expense',amount:3500,currency:'ILS',frequency:'monthly',day:12,category:'חשבונות',accountId:'bank',autopay:true,recordedThrough:'2026-10-01',paid:[]}
  ];
  return d;
}

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
const tallEnough=(page,selector)=>page.evaluate(sel=>[...document.querySelectorAll(sel)].filter(el=>el.checkVisibility()).map(el=>[el.textContent.trim()||el.name,Math.round(el.getBoundingClientRect().height)]).filter(([,h])=>h<44),selector);

export async function run(qa){
  const {assert}=qa;
  // ---------- 1. Load on 10/10: the deposit of 10/01 and the salary of 10/10 are recorded once ----------
  let s=await qa.open({data:fixtureI(),now:'2026-10-10T12:00:00Z'});
  let {page}=s;
  await page.waitForFunction(()=>/נרשמו אוטומטית|נרשם אוטומטית/.test(document.querySelector('.toast')?.textContent||''),null,{timeout:4000});
  await settle(page);
  let d=await s.stored();
  const sal=d.transactions.find(t=>t.id==='bill-sal-2026-10-10'),dep=d.transactions.find(t=>t.id==='bill-dep-2026-10-01');
  assert.ok(sal&&dep,'the salary and the deposit are recorded');
  assert.equal(sal.type,'income');assert.equal(sal.auto.confirm,true);
  assert.deepEqual([dep.type,dep.accountId,dep.toAccountId,dep.goalId],['transfer','bank','sav','g1']);
  assert.equal(await balance(s,'bank'),13500);assert.equal(await balance(s,'sav'),10500);
  assert.equal(d.bills.find(b=>b.id==='sal').recordedThrough,'2026-10-10');
  // The home hero and the month follow: 13,500 in the bank, income 9,000, the deposit is not an expense.
  assert.match(await page.locator('.hero-balance').textContent(),/13,500/);
  // 4.2: the home month card is in · out · left; the deposit is a transfer, never "out".
  const monthText=await page.locator('.month-card').textContent();
  assert.match(monthText,/9,000/);assert.doesNotMatch(await page.locator('.month-figures > div').nth(1).textContent(),/500/);

  // ---------- 2. Home: "המשכורת נכנסה? כמה בדיוק?" → 8,650 → undo → 9,000 ----------
  const prompt=page.locator('.home-board .confirm-item',{hasText:'המשכורת נכנסה? כמה בדיוק?'});   // 4.2: under the checking card
  await prompt.waitFor();
  await shot(qa,page,'v41-I01-home-confirm.png');
  await prompt.locator('input[name=amount]').fill('8650');
  await prompt.locator('button[type=submit]').click();
  await page.waitForFunction(()=>/עודכן ל/.test(document.querySelector('.toast')?.textContent||''));
  d=await s.stored();
  assert.equal(d.transactions.find(t=>t.id==='bill-sal-2026-10-10').amount,8650);assert.equal(await balance(s,'bank'),13150);
  assert.equal(await page.locator('.confirm-item').count(),0,'the prompt is gone');
  await page.locator('.toast-undo').click();
  await page.waitForFunction(()=>/השינוי בוטל/.test(document.querySelector('.toast')?.textContent||''));
  d=await s.stored();
  assert.equal(d.transactions.find(t=>t.id==='bill-sal-2026-10-10').amount,9000);assert.equal(await balance(s,'bank'),13500);
  assert.equal(d.transactions.find(t=>t.id==='bill-sal-2026-10-10').auto.confirm,true,'undo brings the prompt back');

  // ---------- 3. The bell lists the confirmation ----------
  await page.locator('[data-action="alerts"]').first().click();
  await page.locator('dialog .alert-row',{hasText:'המשכורת נכנסה? כמה בדיוק?'}).waitFor();
  await page.keyboard.press('Escape');

  // ---------- 4. "עוד לא נכנסה" → the agenda shows ממתין and התקבל; paying moves it to paid ----------
  await go(page,'bills');
  await page.locator('.confirm-card .confirm-item',{hasText:'המשכורת נכנסה'}).waitFor();
  await page.locator('.confirm-card [data-action="auto-hold:bill-sal-2026-10-10"]').click();
  await page.waitForFunction(()=>/הורדנו את הרישום/.test(document.querySelector('.toast')?.textContent||''));
  d=await s.stored();
  assert.deepEqual(d.bills.find(b=>b.id==='sal').waiting,['2026-10-10']);assert.equal(await balance(s,'bank'),4500);
  const waiting=page.locator('.agenda-item',{hasText:'משכורת'}).filter({hasText:'ממתין'});
  await waiting.waitFor();
  assert.equal(await waiting.locator('.pay-button').textContent(),'התקבל');
  await shot(qa,page,'v41-I02-bills-waiting.png',true);
  await waiting.locator('.pay-button').click();
  await page.locator('#bill-pay-form').waitFor();
  await page.locator('#bill-pay-form [name=amount]').fill('8800');
  await page.locator('#bill-pay-form button[type=submit]').click();
  await page.locator('.toast').waitFor();
  d=await s.stored();
  const salBill=d.bills.find(b=>b.id==='sal');
  assert.equal(salBill.waiting,undefined);assert.ok(salBill.paid.includes('2026-10-10'));assert.equal(await balance(s,'bank'),13300);

  // ---------- 5. The table: standing deposit row, pause → מושהה, resume; "עוד 3 תשלומים" ----------
  const depRow=page.locator('.bills-table tr',{hasText:'הפקדה לקרן חירום'});
  assert.match(await depRow.textContent(),/מ־עו״ש ל־קרן חירום/);
  await depRow.locator('[data-action="bill-pause:dep"]').click();
  await page.waitForFunction(()=>/הושהה/.test(document.querySelector('.toast')?.textContent||''));
  assert.match(await page.locator('.bills-table tr',{hasText:'הפקדה לקרן חירום'}).textContent(),/מושהה/);
  d=await s.stored();assert.equal(d.bills.find(b=>b.id==='dep').active,false);
  assert.equal(await page.locator('.flow-table').count(),1);
  await page.locator('.bills-table [data-action="bill-resume:dep"]').click();
  await page.waitForFunction(()=>/חודש\./.test(document.querySelector('.toast')?.textContent||''));
  d=await s.stored();assert.equal(d.bills.find(b=>b.id==='dep').active,true);assert.equal(d.bills.find(b=>b.id==='dep').recordedThrough,'2026-10-10');
  await page.locator('.bills-table [data-action="bill-edit:rent"]').click();
  await page.locator('#bill-form [name=remaining]').fill('3');
  await page.locator('#bill-form button[type=submit]').click();
  await page.locator('.toast').waitFor();
  assert.match(await page.locator('.bills-table tr',{hasText:'שכר דירה'}).textContent(),/עוד 3 תשלומים/);
  d=await s.stored();assert.equal(d.bills.find(b=>b.id==='rent').endDate,'2026-12-12');

  // ---------- 6. "הוספה": the three kinds; a fixed income on the 1st and a deposit to an unlinked goal ----------
  await page.locator('.bills-card [data-action="bill-new"]').click();
  await page.locator('#bill-form').waitFor();
  assert.deepEqual(await page.locator('#bill-form .bill-kinds button').allTextContents(),['הכנסה קבועה','הוצאה קבועה','הפקדה קבועה']);
  assert.equal(await page.locator('#bill-form [name=day]').inputValue(),'1','day 1 by default');
  await page.locator('#bill-form [data-action="bill-kind:income"]').click();
  assert.equal(await page.locator('dialog .modal-head h2').textContent(),'הכנסה קבועה חדשה');
  assert.ok(await page.locator('#bill-form [name=autopay]').isChecked());assert.ok(await page.locator('#bill-form [name=confirm]').isChecked());
  await page.locator('#bill-form [name=name]').fill('קצבה');
  await page.locator('#bill-form [name=amount]').fill('1000');
  assert.match(await page.locator('#bill-note').textContent(),/ב־1 בכל חודש אופק תרשום הכנסה של[\s⁦-⁩]*1,000/);
  await page.locator('#bill-form button[type=submit]').click();
  await page.waitForFunction(()=>/ההכנסה הקבועה נוספה/.test(document.querySelector('.toast')?.textContent||''));
  d=await s.stored();
  const allowance=d.bills.find(b=>b.name==='קצבה');
  assert.deepEqual([allowance.type,allowance.day,allowance.autopay,allowance.confirm,allowance.recordedThrough],['income',1,true,true,'2026-10-10']);
  await page.locator('.bills-card [data-action="bill-new"]').click();
  await page.locator('#bill-form [data-action="bill-kind:transfer"]').click();
  assert.equal(await page.locator('dialog .modal-head h2').textContent(),'הפקדה קבועה לחיסכון או ליעד');
  await page.locator('#bill-form [name=target]').selectOption('goal:g2');
  await page.locator('#bill-form [name=dest]').waitFor();
  assert.equal(await page.locator('#bill-form [name=amount]').inputValue(),'400','the goal brings its monthly amount');
  assert.equal(await page.locator('#bill-form [name=name]').inputValue(),'הפקדה לטיול ליפן');
  assert.match(await page.locator('#bill-note').textContent(),/יעברו[\s⁦-⁩]*400[\s⁦-⁩]*₪[\s⁦-⁩]*מ־עו״ש ל־חיסכון, לטובת ״טיול ליפן״/);
  await shot(qa,page,'v41-I03-deposit-form.png');
  await page.locator('#bill-form button[type=submit]').click();
  await page.waitForFunction(()=>/ההפקדה הקבועה נשמרה/.test(document.querySelector('.toast')?.textContent||''));
  d=await s.stored();
  const trip=d.bills.find(b=>b.goalId==='g2');
  assert.deepEqual([trip.kind,trip.type,trip.accountId,trip.toAccountId,trip.amount,trip.day,trip.autopay],['transfer','expense','bank','sav',400,1,true]);
  // openRecurringDeposit (the goal and savings cards call it): the existing deposit of a goal opens for editing.
  await act(page,'deposit-auto:goal:g1');
  assert.equal(await page.locator('dialog .modal-head h2').textContent(),'עריכת הפקדה קבועה');
  assert.equal(await page.locator('#bill-form [name=target]').inputValue(),'goal:g1');
  await page.keyboard.press('Escape');

  // ---------- 7. Background recording waits while a dialog is open, then runs ----------
  const rows=(await s.stored()).transactions.length;
  await page.clock.setFixedTime(new Date('2026-11-01T12:00:00Z'));
  await page.locator('.bills-card [data-action="bill-new"]').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(300);
  assert.equal((await s.stored()).transactions.length,rows,'nothing is recorded while a form is open');
  await page.keyboard.press('Escape');await page.waitForTimeout(100);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(()=>/נרשמו אוטומטית/.test(document.querySelector('.toast')?.textContent||''));
  d=await s.stored();
  assert.deepEqual(d.transactions.filter(t=>t.date==='2026-11-01'&&t.auto).map(t=>t.id).sort(),['bill-dep-2026-11-01',`bill-${allowance.id}-2026-11-01`,`bill-${trip.id}-2026-11-01`].sort());
  assert.equal(d.goals.find(g=>g.id==='g2').saved,1400,'the unlinked goal grows with its deposit');
  await go(page,'goals');await go(page,'bills');
  await shot(qa,page,'v41-I04-bills.png',true);
  await s.context.close();

  // ---------- 8. Phone, dark: the prompt, the table and the form fit with 44px targets ----------
  s=await qa.open({data:fixtureI(),now:'2026-10-10T12:00:00Z',width:390,height:844,theme:'dark'});
  page=s.page;await settle(page);
  await page.locator('.home-board .confirm-item').first().waitFor();
  await s.noOverflow('home with the prompt');
  assert.deepEqual(await tallEnough(page,'.confirm-item .button, .confirm-item input'),[]);
  await shot(qa,page,'v41-I05-phone-home-dark.png',true);
  await go(page,'bills');await s.noOverflow('bills');
  assert.deepEqual(await tallEnough(page,'.confirm-card .button, .confirm-card input, .bills-table .icon-button'),[]);
  await shot(qa,page,'v41-I06-phone-bills-dark.png',true);
  await page.locator('.bills-card [data-action="bill-new"]').click();
  await page.locator('#bill-form [data-action="bill-kind:transfer"]').click();
  await s.noOverflow('deposit form');
  assert.deepEqual(await tallEnough(page,'#bill-form .bill-kinds button, #bill-form input:not([type=hidden]):not([type=checkbox]), #bill-form select, #bill-form .form-actions .button'),[]);
  await shot(qa,page,'v41-I07-phone-deposit-form-dark.png');
  await s.context.close();
  console.log('integrate: auto-recorded salary and deposits, "כמה בדיוק?" with undo, hold and pay, pause/resume, stop after N, the three-kind form, the bell, waiting for dialogs, phone + dark');
}
