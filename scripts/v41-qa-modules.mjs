// 4.1 browser checks for WS-MODULES (§E.3): backup safety (steps 1–2), after discharge and the points wizard
// (steps 3–5), the annual check (step 6), app lock (step 7) and the phone/desktop screenshots (step 8).
import {demoData} from '../src/data.js';

// Fixture M: non-demo 4.0-shaped data, 30 transactions, never backed up.
function fixtureM(){
  const d=demoData();
  d.demo=false;d.lastBackup=null;d.profile='דנה';
  d.transactions=d.transactions.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);
  delete d.installments;delete d.createdAt;delete d.benefits;delete d.annualChecks;
  return d;
}
// Opens Fixture M and waits out the start-up dialog timer (what's new), closing whatever it opened.
// The start-up dialog (what's new) opens 900 ms after the scripts run; wait for that moment, then close it.
async function settle(page){
  await page.waitForTimeout(900);
  await page.waitForFunction(()=>performance.now()>1600);
  if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}
async function openM(qa,opts={}){
  const s=await qa.open({data:fixtureM(),...opts});
  await settle(s.page);
  return s;
}
// Headless Chromium sometimes starts a reloaded file:// page in a new renderer whose localStorage is empty
// (the harness then re-seeds Fixture M; seen as the lock record "disappearing"). That is the test browser,
// not the app: when the page's own storage did not survive, put it back and reload again.
async function reloadKeep(page,opts={}){
  const snap=await page.evaluate(()=>{localStorage.setItem('qa-reload',String(Math.random()));return Object.fromEntries(Object.entries(localStorage));});
  for(let i=0;i<4;i++){
    await page.reload(opts);
    if(await page.evaluate(want=>localStorage.getItem('qa-reload')===want,snap['qa-reload']))return;
    console.log('modules: the test browser lost localStorage on reload; restoring it and reloading again');
    await page.evaluate(snap=>{localStorage.clear();for(const [k,v] of Object.entries(snap))localStorage.setItem(k,v);},snap);
    await page.waitForTimeout(300);
  }
  throw Error('localStorage did not survive a reload four times');
}
const go=async(page,id)=>{await page.evaluate(id=>{location.hash=id;},id);await page.waitForFunction(id=>document.querySelector('.page-heading')&&location.hash==='#'+id,id);await page.waitForTimeout(250);};
const shot=(qa,page,name,full=false)=>page.screenshot({path:qa.path.join(qa.shots,name),fullPage:full});
// No visible element on the page shows an amount (₪) while the lock screen is up.
const amountsVisible=page=>page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>![...el.children].length&&/₪/.test(el.textContent||'')&&el.checkVisibility({visibilityProperty:true,opacityProperty:true})).length);
async function typePin(page,pin){for(const d of pin)await page.locator(`#lock-screen [data-lk-key="${d}"]`).click();}
const lockMsg=page=>page.locator('#lock-screen .lk-msg').textContent();

async function backupSection(qa){
  const {assert}=qa;
  const {context,page}=await openM(qa);
  // 1. Settings: the card, one of the three persist texts, and the request button.
  await go(page,'settings');
  const card=page.locator('.bk-card');
  await card.waitFor();
  assert.match(await card.locator('h2').textContent(),/הגיבוי והאחסון שלך/);
  const texts=['הדפדפן לא ימחק את הנתונים של אופק כשחסר מקום.','הדפדפן עלול למחוק נתונים של אתרים כשחסר מקום במכשיר. גיבוי מוצפן שומר עליך גם אז.','הדפדפן הזה לא מאפשר לבקש אחסון קבוע. גיבוי מוצפן הוא ההגנה שלך.'];
  const persistText=await card.locator('.bk-row').first().locator('small').textContent();
  assert.ok(texts.includes(persistText),`one of the three persist texts (got: ${persistText})`);
  assert.match(await card.textContent(),/עוד לא נשמר גיבוי/);
  assert.match(await card.locator('.badge').textContent(),/כדאי לגבות/);
  const ask=card.locator('[data-action="persist-request"]');
  if(await ask.count()){
    await ask.click();
    await page.waitForFunction(()=>/האחסון הקבוע אושר|הדפדפן לא אישר אחסון קבוע/.test(document.querySelector('.toast')?.textContent||''),null,{timeout:7000});
    const rec=await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-persist-v1')));
    assert.equal(rec.asked,'2026-10-14','the request is recorded on the device');
  }else console.log('modules: persist request button not shown (granted or unsupported in this browser)');
  // The usage row appears once the estimate arrives.
  // (only when the browser reports a usage above zero; a zero estimate says nothing useful)
  if(await page.evaluate(async()=>((await navigator.storage?.estimate?.())?.usage||0)>0))await page.waitForFunction(()=>/נפח בשימוש/.test(document.querySelector('.bk-card')?.textContent||''),null,{timeout:6000});
  // 2. The bell lists the reminder; clicking it leaves the encrypted-backup form open.
  await page.locator('.alerts-button').first().click();
  const row=page.locator('dialog .alert-row',{hasText:'זמן לגיבוי מוצפן'});
  await row.waitFor();
  assert.match(await row.textContent(),/עוד לא שמרת גיבוי/);
  await row.click();
  await page.locator('dialog #backup-form').waitFor();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('dialog #backup-form').isVisible(),true,'the backup form stays open after the alerts dialog closes');
  await page.keyboard.press('Escape');
  // The settings button opens the same form; so does the palette entry.
  await page.locator('.bk-card [data-action="alert-backup"]').click();
  await page.locator('dialog #backup-form').waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+K');
  await page.locator('#palette-input').fill('גיבוי מוצפן');
  await page.locator('.palette-item',{hasText:'גיבוי מוצפן'}).first().click();
  await page.locator('dialog #backup-form').waitFor();
  await page.keyboard.press('Escape');
  // An encrypted backup clears the reminder and turns the row recent.
  await page.locator('.bk-card [data-action="alert-backup"]').click();
  await page.fill('#backup-form [name=passphrase]','סיסמה ארוכה מאוד');
  await page.fill('#backup-form [name=confirm]','סיסמה ארוכה מאוד');
  const download=page.waitForEvent('download');
  await page.locator('#backup-form [type=submit]').click();
  await download;
  await page.waitForFunction(()=>/היום/.test(document.querySelector('.bk-card')?.textContent||''));
  const after=await page.evaluate(()=>[...document.querySelectorAll('.alerts-button')].map(b=>b.getAttribute('aria-label')).join());
  await page.locator('.alerts-button').first().click();
  await page.locator('dialog[open]').waitFor();
  assert.equal(await page.locator('dialog .alert-row',{hasText:'זמן לגיבוי מוצפן'}).count(),0,`no backup reminder after a backup (${after})`);
  await page.keyboard.press('Escape');
  await context.close();

  // The first real save asks for persistent storage once (a fresh device with no record). A start-up save
  // (the dollar rate, a recorded schedule) may already count; otherwise the settings save does.
  const second=await openM(qa);
  if(!(await second.page.evaluate(()=>localStorage.getItem('ofek-persist-v1')))){
    await go(second.page,'settings');
    await second.page.locator('#settings-form [type=submit]').click();
  }
  await second.page.waitForFunction(()=>!!localStorage.getItem('ofek-persist-v1'),null,{timeout:7000});
  assert.equal(JSON.parse(await second.page.evaluate(()=>localStorage.getItem('ofek-persist-v1'))).asked,'2026-10-14');
  await second.context.close();

  // A demo never gets the reminder.
  const demo=await qa.open({data:{...demoData(),lastBackup:null}});
  await settle(demo.page);
  assert.equal(await demo.page.evaluate(()=>localStorage.getItem('ofek-persist-v1')),null,'the demo never asks for persistent storage');
  await demo.page.locator('.alerts-button').first().click();
  await demo.page.locator('dialog[open]').waitFor();
  assert.equal(await demo.page.locator('dialog .alert-row',{hasText:'זמן לגיבוי מוצפן'}).count(),0,'no reminder for the demo');
  await demo.context.close();
  console.log('modules: backup safety OK (settings card, persist request, bell → encrypted backup, palette, first-save request, demo)');
}


// The §E.3 profile: a man, army, combat, discharged 2026-08-31 after 32 months, 45 combat reserve days in 2025.
const PROFILE={gender:'m',serviceKind:'army',track:'combat',dischargeDate:'2026-08-31',monthsServed:32,reserveDays:{'2025':45}};
const toastText=page=>page.evaluate(()=>document.querySelector('.toast')?.textContent||'');
async function waitToast(page,re){await page.waitForFunction(src=>new RegExp(src).test(document.querySelector('.toast')?.textContent||''),re.source,{timeout:7000});}
async function fillProfile(page){
  const form=page.locator('dialog #benefits-form');
  await form.waitFor();
  await form.locator('[data-bn-seg="gender"][data-value="m"]').click();
  await form.locator('[name=serviceKind]').selectOption('army');
  await form.locator('[name=track]').selectOption('combat');
  await form.locator('[name=dischargeDate]').fill('2026-08-31');
  await form.locator('[name=monthsServed]').fill('32');
  await form.locator('[name=reservePrev]').fill('45');
  return form;
}

// 3–5. The benefits page, the profile, the grant, the work tracker, the points wizard and the deposit account.
async function benefitsSection(qa){
  const {assert}=qa;
  const {context,page}=await openM(qa);
  await go(page,'benefits');
  // 3a. No profile: the empty state and the "לא שירתת?" card.
  await page.locator('.bn-start .empty').waitFor();
  assert.match(await page.locator('.bn-start').textContent(),/מה מגיע לך אחרי השחרור\?/);
  assert.match(await page.locator('.bn-nonserved').textContent(),/נקודות זיכוי ובדיקה שנתית רלוונטיות לכולם/);
  assert.match(await page.locator('.page-content > .notice').first().textContent(),/נכון ל־14.10.2026/);
  // 3b. The profile dialog: errors first, then the §E.3 profile.
  await page.locator('.bn-start [data-action="bn-profile"]').click();
  const form=await fillProfile(page);
  assert.equal(await form.locator('[name=track]').isVisible(),true,'army shows the track');
  await form.locator('[name=monthsServed]').fill('');
  await form.locator('[type=submit]').click();
  await form.locator('.form-error',{hasText:'חודשי השירות צריכים להיות מספר שלם בין 1 ל־60.'}).waitFor();
  await form.locator('[name=serviceKind]').selectOption('national');
  assert.equal(await form.locator('[name=track]').isVisible(),false,'national hides the track');
  await form.locator('[name=serviceKind]').selectOption('army');
  await form.locator('[name=monthOnly]').check();
  assert.equal(await form.locator('[name=dischargeMonth]').inputValue(),'2026-08','month-only keeps the month');
  assert.equal(await form.locator('[name=dischargeDate]').isVisible(),false);
  await form.locator('[name=monthOnly]').uncheck();
  await form.locator('[name=monthsServed]').fill('32');
  await form.locator('[type=submit]').click();
  await waitToast(page,/הפרטים נשמרו/);
  const b=(await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')))).benefits;
  assert.deepEqual([b.gender,b.serviceKind,b.track,b.dischargeDate,b.monthsServed,b.reserveDays['2025']],['m','army','combat','2026-08-31',32,45]);
  // 3c. The summary: rounded estimates, each labelled; the cards carry "נכון ל־"; the points metric.
  const metrics=page.locator('.bn-summary .metric');
  assert.match(await metrics.nth(0).textContent(),/21,983/);assert.match(await metrics.nth(0).textContent(),/הערכה/);
  assert.match(await metrics.nth(1).textContent(),/32,003/);assert.match(await metrics.nth(1).textContent(),/הערכה/);
  assert.match(await metrics.nth(2).textContent(),/3\.67/);
  for(const [cls,amount] of [['.bn-grant','21,983'],['.bn-deposit','32,003']]){
    const est=page.locator(`${cls} .bn-estimate`).first();
    assert.match(await est.textContent(),new RegExp(amount));assert.match(await est.textContent(),/הערכה/);assert.match(await est.textContent(),/נכון ל־/);
  }
  assert.match(await page.locator('.bn-grant').textContent(),/עד 30\.10\.2026/);
  assert.match(await page.locator('.bn-deposit').textContent(),/14\.9\.2026/);
  assert.match(await page.locator('.bn-deposit').textContent(),/31\.8\.2031/);
  assert.match(await page.locator('.bn-work').textContent(),/31\.8\.2028/);
  assert.match(await page.locator('.bn-work').textContent(),/28\.2\.2030/);
  assert.match(await page.locator('.bn-work .bn-estimate').textContent(),/11,461/);
  const hrefs=await page.locator('.bn-sources a').evaluateAll(list=>list.map(a=>a.href));
  assert.ok(hrefs.some(h=>h.includes('hachvana.mod.gov.il')),'sources list hachvana');
  assert.ok(hrefs.some(h=>h.includes('btl.gov.il')),'sources list btl');
  const links=await page.locator('main a[target=_blank]').evaluateAll(list=>list.map(a=>[a.rel,a.querySelector('bdi[dir=ltr]')?1:0]));
  assert.ok(links.length&&links.every(([rel,bdi])=>rel==='noopener noreferrer'&&bdi),'external links: rel and the domain in a bdi');
  // 3d. "המענק נכנס": records the income and marks the grant received.
  await page.locator('.bn-grant [data-action="bn-grant"]').click();
  const grant=page.locator('dialog #grant-form');
  await grant.waitFor();
  assert.equal(await grant.locator('[name=amount]').inputValue(),'21982.72','prefilled with the estimate');
  await grant.locator('[name=amount]').fill('21500');
  await grant.locator('[type=submit]').click();
  await waitToast(page,/המענק נרשם/);
  let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')));
  const row=stored.transactions.find(t=>t.description==='מענק שחרור');
  assert.ok(row&&row.type==='income'&&row.amount===21500&&row.category==='מענקים'&&row.tags.includes('שחרור'),'the grant is an income row');
  assert.ok(stored.categories.includes('מענקים'));
  assert.deepEqual([stored.benefits.grantReceived,stored.benefits.grantAmount],['2026-10-14',21500]);
  await page.locator('.bn-grant .badge',{hasText:'התקבל'}).waitFor();
  // 3e. The work tracker: + twice, agriculture, start month.
  await page.locator('.bn-work [data-action="bn-work:1"]').click();
  await page.locator('.bn-work [data-action="bn-work:1"]').click();
  await page.locator('.bn-work [data-bn-agri]').check();
  await page.locator('.bn-work [data-bn-start]').fill('2026-09');
  await page.locator('.bn-work [data-bn-start]').dispatchEvent('change');
  stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')));
  assert.deepEqual(stored.benefits.work,{months:2,agriculture:true,startMonth:'2026-09',claimed:null});
  assert.match(await page.locator('.bn-work').textContent(),/4 חודשים בחקלאות/);
  assert.match(await page.locator('.bn-work .bn-estimate').textContent(),/7,641/);
  await page.locator('.bn-work [data-action="bn-work:-1"]').click();
  await page.locator('.bn-work [data-bn-agri]').uncheck();
  // 4. Tools → salary → "חישוב הנקודות שלי" → "שימוש במחשבון השכר".
  await go(page,'tools');
  await page.locator('.bn-points-hint [data-action="points-wizard"]').click();
  const wizard=page.locator('dialog #points-form');
  await wizard.waitFor();
  assert.match(await wizard.locator('.bn-result').textContent(),/סך הכול 3\.67 נקודות/);
  assert.match(await wizard.locator('.bn-result').textContent(),/נכון ל־/);
  await wizard.locator('[name=reserveDays]').fill('110');
  await page.waitForFunction(()=>/סך הכול 6\.92 נקודות/.test(document.querySelector('#points-form .bn-result')?.textContent||''));
  await wizard.locator('[name=reserveDays]').fill('45');
  await wizard.locator('[type=submit]').click();
  await waitToast(page,/נקודות הזיכוי עודכנו: 3\.67 \(הערכה\)/);
  await page.waitForFunction(()=>location.hash==='#tools');
  assert.equal(await page.locator('[data-tool="salary.points"]').inputValue(),'3.67');
  stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')));
  assert.ok(Math.abs(stored.benefits.points.total-3.6667)<.001,`benefits.points.total ≈ 3.6667 (${stored.benefits.points.total})`);
  assert.match(await page.locator('.bn-points-hint').textContent(),/לפי האשף: 3\.67 נקודות/);
  assert.equal(stored.benefits.dischargeDate,'2026-08-31','the wizard keeps the exact discharge date');
  // 5. The deposit as a restricted account (only when LEDGER's deposit kind is built).
  await go(page,'benefits');
  const add=page.locator('.bn-deposit [data-action="bn-deposit-account"]');
  if(await add.count()){
    await add.click();
    const entity=page.locator('dialog #entity-form');
    await entity.waitFor();
    assert.equal(await entity.locator('[name=kind]').inputValue(),'deposit');
    assert.equal(await entity.locator('[name=releaseDate]').inputValue(),'2031-08-31');
    assert.equal(await entity.locator('[name=name]').inputValue(),'פיקדון אישי');
    await entity.locator('[type=submit]').click();
    await page.locator('dialog #entity-form').waitFor({state:'detached'});
    await go(page,'accounts');
    const accountCard=page.locator('.account-card',{hasText:'פיקדון אישי'});
    assert.match(await accountCard.textContent(),/פיקדון מוגבל/);
    assert.match(await accountCard.locator('.bn-account-link').textContent(),/מה מותר לעשות בפיקדון\?/);
    stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')));
    const dep=stored.accounts.find(a=>a.kind==='deposit');
    assert.deepEqual([dep.releaseDate,dep.balance,dep.institution],['2031-08-31',32003,'משרד הביטחון']);
    await go(page,'benefits');
    await page.locator('.bn-deposit [data-action="navigate:accounts"]').waitFor();
  }else console.log('modules: skipped: deposit kind not built yet');
  // Palette entries.
  await page.keyboard.press('Control+K');
  await page.locator('#palette-input').fill('אשף נקודות');
  await page.locator('.palette-item',{hasText:'אשף נקודות הזיכוי'}).first().click();
  await page.locator('dialog #points-form').waitFor();
  await page.keyboard.press('Escape');
  await context.close();

  // The bell: the grant is late 60 days after discharge; the tax refund reminder; the action opens the page.
  const late=fixtureM();late.benefits={gender:'f',serviceKind:'army',track:'support',dischargeDate:'2021-08-01',monthsServed:24};
  const second=await qa.open({data:{...late,benefits:{...late.benefits,dischargeDate:'2026-08-01'}}});
  await settle(second.page);
  await second.page.locator('.alerts-button').first().click();
  const lateRow=second.page.locator('dialog .alert-row',{hasText:'מענק השחרור עוד לא נכנס?'});
  await lateRow.waitFor();
  await lateRow.click();
  await second.page.waitForFunction(()=>location.hash==='#benefits');
  await second.page.locator('.bn-grant .notice.warning',{hasText:'עברו 60 יום והמענק לא נכנס?'}).waitFor();
  await second.context.close();
  const third=await qa.open({data:late});
  await settle(third.page);
  await third.page.locator('.alerts-button').first().click();
  await third.page.locator('dialog .alert-row',{hasText:'ייתכן שמגיע לך החזר מס'}).waitFor();
  await third.page.keyboard.press('Escape');
  await go(third.page,'benefits');
  assert.match(await third.page.locator('.bn-points').textContent(),/2021, 2022, 2023, 2024/);
  await third.context.close();
  console.log('modules: after discharge OK (empty state, profile errors and save, estimates with הערכה/נכון ל־, grant row, work tracker, wizard → salary 3.67, deposit account, bell, palette)');
}

// 6. The annual check on the insights page, its bell reminder and the palette entry.
async function annualSection(qa){
  const {assert}=qa;
  const {context,page}=await openM(qa);
  await go(page,'insights');
  const card=page.locator('.an-card');
  await card.waitFor();
  assert.match(await card.locator('h2').textContent(),/הבדיקה השנתית שלך/);
  assert.match(await card.locator('.notice.warning').textContent(),/זהירות מאתרים מתחזים/);
  assert.equal(await card.locator('.an-row').count(),6);
  assert.match(await card.locator('.section-head .badge').textContent(),/6 לבדיקה/);
  const hrefs=await card.locator('.an-row a[target=_blank]').evaluateAll(list=>list.map(a=>a.getAttribute('href')));
  assert.deepEqual(hrefs,['https://www.creditdata.org.il/publications/report/','https://harb.cma.gov.il','https://itur.mof.gov.il','https://www.swiftness.co.il','https://www.gov.il/he/service/itc135','https://www.btl.gov.il/benefits/children/HisahoLayeled/Pages/default.aspx']);
  await card.locator('[data-action="annual-done:credit-report"]').click();
  await page.locator('.an-row[data-annual="credit-report"] .badge',{hasText:'נבדק ב־'}).waitFor();
  let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')));
  assert.equal(stored.annualChecks['credit-report'].done,'2026-10-14');
  assert.match(await page.locator('.an-card .section-head .badge').textContent(),/5 לבדיקה/);
  await page.locator('[data-action="annual-skip:pension"]').click();
  await page.locator('.an-row[data-annual="pension"] .badge',{hasText:'לא רלוונטי'}).waitFor();
  assert.deepEqual((await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')))).annualChecks.pension,{skip:true});
  await page.locator('[data-action="annual-skip:pension"]').click();
  await page.locator('.an-row[data-annual="pension"] .badge',{hasText:'לא נבדק השנה'}).waitFor();
  await page.locator('[data-action="annual-undo:credit-report"]').click();
  await page.locator('.an-row[data-annual="credit-report"] .badge',{hasText:'לא נבדק השנה'}).waitFor();
  stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')));
  assert.deepEqual(stored.annualChecks,{},'undo and un-skip leave no record');
  await card.locator('[data-action="annual-done:credit-report"]').click();
  await page.locator('.an-row[data-annual="credit-report"] .badge',{hasText:'נבדק ב־'}).waitFor();
  // The bell lists the yearly reminder (no createdAt → the 30-day grace does not apply); it opens insights.
  await go(page,'dashboard');
  await page.locator('.alerts-button').first().click();
  const row=page.locator('dialog .alert-row',{hasText:'הבדיקה השנתית מחכה לך'});
  await row.waitFor();
  assert.match(await row.textContent(),/5 בדיקות קצרות/);
  await row.click();
  await page.waitForFunction(()=>location.hash==='#insights');
  await page.keyboard.press('Control+K');
  await page.locator('#palette-input').fill('הבדיקה השנתית');
  await page.locator('.palette-item',{hasText:'הבדיקה השנתית'}).first().click();
  await page.locator('.an-card').waitFor();
  await context.close();
  // A new user (createdAt 10 days ago) gets no yearly reminder yet.
  const fresh=await qa.open({data:{...fixtureM(),createdAt:'2026-10-04'}});
  await settle(fresh.page);
  await fresh.page.locator('.alerts-button').first().click();
  await fresh.page.locator('dialog[open]').waitFor();
  assert.equal(await fresh.page.locator('dialog .alert-row',{hasText:'הבדיקה השנתית מחכה לך'}).count(),0,'no reminder in the first 30 days');
  await fresh.context.close();
  console.log('modules: annual check OK (six rows and official URLs, scam warning, בדקתי/לא רלוונטי/ביטול, bell after 30 days, palette)');
}

async function lockSection(qa){
  const {assert}=qa;
  // A damaged record fails open, with the toast.
  const damaged=await qa.open({data:fixtureM(),extra:{'ofek-lock-v1':'{bad'}});
  await damaged.page.waitForFunction(()=>/הגדרות הנעילה נפגמו/.test(document.querySelector('.toast')?.textContent||''));
  assert.equal(await damaged.page.locator('#lock-screen').count(),0,'a damaged record never locks');
  assert.equal(await damaged.page.evaluate(()=>localStorage.getItem('ofek-lock-v1')),null,'the damaged record is removed');
  await damaged.context.close();

  const {context,page}=await openM(qa);
  // 7a. Set up a PIN (the acknowledgement is required), then lock now.
  await go(page,'settings');
  const card=page.locator('.lk-card');
  assert.match(await card.textContent(),/היא לא מצפינה את הנתונים/);
  assert.match(await card.locator('.badge').textContent(),/כבויה/);
  await card.locator('[data-action="lock-setup"]').click();
  const form=page.locator('dialog #lock-form');
  await form.waitFor();
  await form.locator('[name=pin]').fill('12');await form.locator('[name=pin2]').fill('12');
  await form.locator('[type=submit]').click();
  await form.locator('.form-error',{hasText:'הקוד צריך להיות 4 עד 8 ספרות.'}).waitFor();
  await form.locator('[name=pin]').fill('1234');await form.locator('[name=pin2]').fill('1235');
  await form.locator('[type=submit]').click();
  await form.locator('.form-error',{hasText:'הקודים אינם תואמים.'}).waitFor();
  await form.locator('[name=pin2]').fill('1234');
  await form.locator('[type=submit]').click();
  await form.locator('.form-error',{hasText:'צריך לאשר שהבנת שאין שחזור לקוד.'}).waitFor();
  await form.locator('[name=ack]').check();
  await form.locator('[type=submit]').click();
  await page.waitForFunction(()=>/הנעילה הופעלה/.test(document.querySelector('.toast')?.textContent||''),null,{timeout:10000});
  const rec=await page.evaluate(()=>localStorage.getItem('ofek-lock-v1'));
  assert.ok(rec&&!rec.includes('1234'),'the PIN itself is not stored');
  const parsed=JSON.parse(rec);
  assert.equal(parsed.pin.iterations,310000);assert.equal(parsed.pin.length,4);
  assert.ok(!(await page.evaluate(()=>localStorage.getItem('ofek-finance-v1'))).includes('ofek-lock'),'the lock is not part of the data');
  assert.match(await card.locator('.badge').textContent(),/פעילה/);
  await shot(qa,page,'v41-M7-lock-settings-desktop.png',true);
  await card.locator('[data-action="lock-now"]').click();
  await page.locator('#lock-screen').waitFor();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#root')).visibility),'hidden');
  assert.equal(await page.evaluate(()=>document.querySelector('#root').inert),true);
  assert.equal(await amountsVisible(page),0,'no amount is visible while locked');
  await shot(qa,page,'v41-M7-lock-screen-desktop.png');
  // 7b. Ctrl+K opens nothing; dialogs are blocked.
  await page.keyboard.press('Control+K');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('dialog[open]').count(),0,'Ctrl+K opens no dialog while locked');
  // 7c. Wrong PINs: the countdown of tries, then the wait. A hardware keyboard works too.
  await page.keyboard.type('1111');
  await page.waitForFunction(()=>document.querySelector('#lock-screen .lk-msg')?.textContent==='הקוד שגוי.');
  await typePin(page,'2222');
  await page.waitForFunction(()=>/נשארו 3 ניסיונות/.test(document.querySelector('#lock-screen .lk-msg')?.textContent||''));
  for(const [pin,left] of [['3333',2],['4444',1]]){await typePin(page,pin);await page.waitForFunction(n=>new RegExp(`נשארו ${n} ניסיונות`).test(document.querySelector('#lock-screen .lk-msg')?.textContent||''),left);}
  await typePin(page,'5555');
  await page.waitForFunction(()=>/יותר מדי ניסיונות. אפשר לנסות שוב בעוד 30 שניות./.test(document.querySelector('#lock-screen .lk-msg')?.textContent||''));
  assert.equal(await page.locator('#lock-screen [data-lk-key="1"]').isDisabled(),true,'the keypad waits');
  await page.waitForTimeout(600);
  await shot(qa,page,'v41-M7-lock-wait-desktop.png');
  await context.clock.setFixedTime(new Date(Date.parse('2026-10-14T12:00:00Z')+31000));
  await page.waitForFunction(()=>!document.querySelector('#lock-screen [data-lk-key="1"]')?.disabled);
  await typePin(page,'1234');
  await page.locator('#lock-screen').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('locked')),false);
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('ofek-lock-v1'))).failures,0,'a correct PIN resets the failures');
  // 7d. Leaving the app with "lock right away" locks it; a dialog that was open comes back after unlocking.
  await go(page,'settings');
  await page.selectOption('.lk-card [data-lock-minutes]','0');
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('ofek-lock-v1'))).minutes,0);
  await page.locator('.bk-card [data-action="alert-backup"]').click();
  await page.fill('#backup-form [name=passphrase]','טיוטה');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.locator('#lock-screen').waitFor();
  assert.equal(await page.locator('dialog[open]').count(),0,'the open dialog is put away while locked');
  await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
  await typePin(page,'1234');
  await page.locator('#lock-screen').waitFor({state:'detached'});
  assert.equal(await page.inputValue('dialog[open] #backup-form [name=passphrase]'),'טיוטה','the draft is back after unlocking');
  await page.keyboard.press('Escape');
  // 7e. A reload is locked before any amount is painted.
  await reloadKeep(page,{waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('locked')&&!!document.querySelector('#lock-screen')),true,'locked at load');
  assert.equal(await amountsVisible(page),0,'no amount painted at load');
  // 7f. Turning the lock off needs the current PIN.
  await typePin(page,'1234');
  await page.locator('#lock-screen').waitFor({state:'detached'});
  await go(page,'settings');
  await page.locator('.lk-card [data-action="lock-off"]').click();
  await page.fill('#lock-off-form [name=current]','9999');
  await page.locator('#lock-off-form [type=submit]').click();
  await page.locator('#lock-off-form .form-error',{hasText:'הקוד שגוי.'}).waitFor();
  await page.fill('#lock-off-form [name=current]','1234');
  await page.locator('#lock-off-form [type=submit]').click();
  await page.waitForFunction(()=>/הנעילה כובתה/.test(document.querySelector('.toast')?.textContent||''),null,{timeout:10000});
  assert.equal(await page.evaluate(()=>localStorage.getItem('ofek-lock-v1')),null);
  assert.match(await page.locator('.lk-card .badge').textContent(),/כבויה/);
  // 7g. Forgot the code: the honest wipe.
  await page.locator('.lk-card [data-action="lock-setup"]').click();
  await page.fill('#lock-form [name=pin]','2580');await page.fill('#lock-form [name=pin2]','2580');
  await page.locator('#lock-form [name=ack]').check();
  await page.locator('#lock-form [type=submit]').click();
  await page.waitForFunction(()=>!!localStorage.getItem('ofek-lock-v1'),null,{timeout:10000});
  await reloadKeep(page);
  await page.locator('#lock-screen').waitFor();
  await page.locator('#lock-screen [data-action="lock-forgot"]').click();
  const wipe=page.locator('#lock-screen [data-action="lock-wipe"]');
  assert.equal(await wipe.isDisabled(),true,'the wipe waits for the confirmation word');
  await page.fill('#lock-screen [name=confirmWipe]','מחיק');
  assert.equal(await wipe.isDisabled(),true);
  await shot(qa,page,'v41-M7-lock-forgot-desktop.png');
  await page.fill('#lock-screen [name=confirmWipe]','מחיקה');
  assert.equal(await wipe.isDisabled(),false);
  // The wipe ends in location.reload(); the same test-browser storage loss as in reloadKeep() would re-seed
  // Fixture M and look like a failed wipe, so that case is detected (qa-reload has no ofek- prefix and
  // survives a real wipe) and the wipe is repeated from the restored state.
  for(let attempt=1;;attempt++){
    const snap=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
    await Promise.all([page.waitForEvent('load'),page.locator('#lock-screen [data-action="lock-wipe"]').click()]);
    if(await page.evaluate(want=>localStorage.getItem('qa-reload')===want,snap['qa-reload']))break;
    assert.ok(attempt<4,'localStorage did not survive the wipe reload four times');
    console.log('modules: the test browser lost localStorage on the wipe reload; restoring it and wiping again');
    await page.evaluate(snap=>{localStorage.clear();for(const [k,v] of Object.entries(snap))localStorage.setItem(k,v);},snap);
    await reloadKeep(page);
    await page.locator('#lock-screen [data-action="lock-forgot"]').click();
    await page.fill('#lock-screen [name=confirmWipe]','מחיקה');
  }
  await page.locator('dialog .setup-welcome').waitFor({timeout:5000});
  // 4.0 saves its start-up data (the demo) on a fresh device, so the key may exist again — but only as the demo.
  const keys=await page.evaluate(()=>Object.keys(localStorage));
  assert.ok(!keys.includes('ofek-lock-v1')&&!keys.includes('ofek-persist-v1')&&!keys.includes('ofek-finance-v1-recovery'),`no lock and no old records after the wipe (${keys})`);
  const fresh=await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')||'null'));
  assert.ok(!fresh||(fresh.demo===true&&fresh.profile!=='דנה'),'the old data is gone (only the fresh start-up demo, if any)');
  assert.equal(await page.locator('#lock-screen').count(),0);
  await context.close();
  console.log('modules: app lock OK (setup errors, lock now, amounts hidden, Ctrl+K, back-off and wait, auto-lock, reload, turn off, wipe)');
}

// 8. Phone (390×844) and desktop, light and dark: the cards, the bell, the lock screen and the wipe screen.
async function screens(qa){
  const {assert}=qa;
  for(const theme of ['light','dark'])for(const [size,width,height] of [['phone',390,844],['desktop',1280,900]]){
    const {context,page,noOverflow}=await openM(qa,{theme,width,height});
    // After discharge: the empty state, the profile dialog, the filled page and the wizard.
    await go(page,'benefits');
    await page.locator('.bn-start').waitFor();
    await noOverflow(`benefits empty ${theme} ${size}`);
    await shot(qa,page,`v41-M8-benefits-empty-${theme}-${size}.png`);
    await page.locator('.bn-start [data-action="bn-profile"]').click();
    await fillProfile(page);
    await page.waitForTimeout(350);
    await shot(qa,page,`v41-M8-benefits-profile-${theme}-${size}.png`);
    await page.locator('dialog #benefits-form [type=submit]').click();
    await page.locator('.bn-summary').waitFor();
    await page.locator('.bn-work [data-action="bn-work:1"]').click();
    await page.locator('.bn-work [data-action="bn-work:1"]').click();
    await page.waitForTimeout(300);
    await noOverflow(`benefits ${theme} ${size}`);
    await shot(qa,page,`v41-M8-benefits-${theme}-${size}.png`,true);
    await page.locator('.bn-points [data-action="points-wizard"]').click();
    await page.locator('dialog #points-form').waitFor();
    await page.waitForTimeout(350);
    await noOverflow(`wizard ${theme} ${size}`);
    await shot(qa,page,`v41-M8-wizard-${theme}-${size}.png`);
    await page.locator('dialog #points-form .bn-result').screenshot({path:qa.path.join(qa.shots,`v41-M8-wizard-result-${theme}-${size}.png`)});
    await page.keyboard.press('Escape');
    await go(page,'tools');
    await page.locator('.bn-points-hint').screenshot({path:qa.path.join(qa.shots,`v41-M8-salary-hint-${theme}-${size}.png`)});
    // The annual check card.
    await go(page,'insights');
    await page.locator('[data-action="annual-done:insurance"]').click();
    await page.locator('[data-action="annual-skip:pension"]').click();
    await page.locator('.an-card').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await noOverflow(`insights ${theme} ${size}`);
    const tapTargets=await page.evaluate(()=>[...document.querySelectorAll('.an-card .an-actions > *,.bn-stepper > button')].map(b=>Math.round(b.getBoundingClientRect().height)));
    if(size==='phone')assert.ok(tapTargets.every(h=>h>=40),`annual and stepper targets on phone (${tapTargets})`);
    await page.locator('.an-card').screenshot({path:qa.path.join(qa.shots,`v41-M8-annual-${theme}-${size}.png`)});
    await go(page,'settings');
    await page.locator('.bk-card').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await noOverflow(`settings ${theme} ${size}`);
    await page.locator('.personal-cards').screenshot({path:qa.path.join(qa.shots,`v41-M8-settings-cards-${theme}-${size}.png`)});
    await page.locator('.alerts-button').first().click();
    await page.locator('dialog .alert-row').first().waitFor();
    await page.waitForTimeout(400);
    await shot(qa,page,`v41-M8-alerts-${theme}-${size}.png`);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>localStorage.setItem('ofek-lock-v1',JSON.stringify({v:1,pin:{salt:'AAAAAAAAAAAAAAAAAAAAAA==',iterations:1000,hash:btoa(String.fromCharCode(...new Uint8Array(32))),length:4},minutes:1,bio:{id:'AAEC',created:'2026-10-14'},failures:2,retryAt:0,created:'2026-10-14'})));
    await reloadKeep(page);
    await page.locator('#lock-screen').waitFor();
    await page.locator('#lock-screen [data-lk-key="1"]').click();
    await noOverflow(`lock ${theme} ${size}`);
    const sizes=await page.evaluate(()=>[...document.querySelectorAll('#lock-screen .lk-key')].map(b=>{const r=b.getBoundingClientRect();return Math.min(r.width,r.height);}));
    assert.ok(sizes.length>=11&&sizes.every(s=>s>=44),`keypad targets ≥ 44px (${sizes})`);
    await shot(qa,page,`v41-M8-lock-${theme}-${size}.png`);
    await page.locator('#lock-screen [data-action="lock-forgot"]').click();
    await page.waitForTimeout(200);
    await noOverflow(`forgot ${theme} ${size}`);
    await shot(qa,page,`v41-M8-forgot-${theme}-${size}.png`);
    await context.close();
  }
  console.log('modules: screenshots v41-M8-* (light/dark, phone/desktop): benefits, wizard, annual, settings, lock; no horizontal scroll, keypad ≥ 44px');
}

export async function run(qa){
  await backupSection(qa);
  await benefitsSection(qa);
  await annualSection(qa);
  await lockSection(qa);
  await screens(qa);
}
