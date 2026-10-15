// 4.1 browser checks for WS-MODULES (§E.3): backup safety (steps 1–2), app lock (step 7) and the phone
// screenshots (step 8). The benefits, salary, deposit and annual-check steps (3–6) are added by part 2.
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
  if(await page.evaluate(()=>!!navigator.storage?.estimate))await page.waitForFunction(()=>/נפח בשימוש/.test(document.querySelector('.bk-card')?.textContent||''),null,{timeout:6000});
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
  await Promise.all([page.waitForEvent('load'),wipe.click()]);
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
    await shot(qa,page,`v41-M8-forgot-${theme}-${size}.png`,true);
    await context.close();
  }
  console.log('modules: screenshots v41-M8-* (light/dark, phone/desktop), no horizontal scroll, keypad ≥ 44px');
}

export async function run(qa){
  await backupSection(qa);
  await lockSection(qa);
  await screens(qa);
}
