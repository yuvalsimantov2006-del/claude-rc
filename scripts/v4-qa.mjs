// Browser QA for 4.0: first-run setup, the checking-balance hero and balance editor, the automatic dollar
// rate (latest and by date, mocked), the five hubs with remembered sub-tabs, light/dark theme, the phone
// "more" sheet, dialogs opening without a focus ring on the close button, and charts whose labels stay
// inside the chart at phone width. Run: node scripts/v4-qa.mjs [screenshot-dir]
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/opt/node22/lib/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),shots=process.argv[2]||path.join(root,'.qa'),app='file://'+path.join(root,'dist/index.html');
fs.mkdirSync(shots,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1280,height:900},locale:'he-IL'});
// The rate services answer like Frankfurter does: today's rate, or the rate of the requested date.
const fxCalls=[];
await context.route(/api\.frankfurter\.dev|cdn\.jsdelivr\.net|open\.er-api\.com/,route=>{const u=new URL(route.request().url());fxCalls.push(u.pathname+u.search);const date=u.searchParams.get('date');route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(date?{date,base:'USD',quote:'ILS',rate:3.7012}:{date:'2026-10-13',base:'USD',quote:'ILS',rate:3.6123})});});
const page=await context.newPage(),errors=[];
page.on('pageerror',err=>errors.push(err.message));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')));
const heading=()=>page.locator('h1').first().textContent();

try{
  // ---------- First-run setup ----------
  await page.goto(app);
  await page.locator('dialog.setup-welcome-dialog [data-action="setup-begin"]').waitFor();
  assert.ok(await page.locator('dialog [data-action="setup-demo"]').count(),'welcome offers the demo');
  assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'DIALOG','dialogs open focused on themselves, not on the close button');
  await page.screenshot({path:path.join(shots,'v4-01-welcome.png')});
  await page.locator('[data-action="setup-begin"]').click();
  await page.locator('#setup-form [name=profile]').fill('נועה');await page.locator('#setup-form [type=submit]').click();
  await page.locator('#setup-form [name=balance]').fill('');await page.locator('#setup-form [type=submit]').click();
  assert.match(await page.locator('#setup-form .form-error').textContent(),/יתרה/,'an empty balance is rejected');
  await page.locator('#setup-form [name=balance]').fill('12,345.50');await page.locator('#setup-form [name=bank]').selectOption('בנק לאומי');await page.locator('#setup-form [type=submit]').click();
  await page.locator('#setup-form [name=cash]').fill('500');await page.locator('#setup-form [type=submit]').click();
  await page.locator('#setup-form [name=salary]').fill('9000');await page.locator('#setup-form [name=budget]').fill('6000');await page.locator('#setup-form [type=submit]').click();
  await page.locator('.hero-card .hero-balance').waitFor();
  let d=await stored();
  assert.equal(d.profile,'נועה');assert.equal(d.demo,false);assert.equal(d.overallBudget,6000);
  assert.equal(d.accounts[0].balance,12345.5);assert.equal(d.accounts[0].institution,'בנק לאומי');
  assert.equal(d.accounts.length,2,'checking + cash');assert.equal(d.bills.length,1,'salary as a scheduled income');
  assert.match(await page.locator('.hero-balance').textContent(),/12,345\.50/,'the hero shows the checking balance');
  assert.ok(await page.locator('.hero-balance .hero-cur').count(),'the shekel sign is its own element in the hero');
  assert.ok(await page.locator('.hero-updated.fresh').count(),'a balance typed in today is fresh');
  await page.screenshot({path:path.join(shots,'v4-02-home.png'),fullPage:true});

  // ---------- Automatic dollar rate ----------
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')).fxSource==='Frankfurter',null,{timeout:8000});
  d=await stored();
  assert.equal(d.fx,3.6123,'the latest rate is saved');
  assert.match(await page.locator('.topbar .fx-chip').textContent(),/3\.612/,'the dollar chip shows it');

  // ---------- Balance editor ----------
  await page.locator('.hero-edit').click();
  await page.locator('#balance-form [name=balance]').fill('11000');
  assert.match(await page.locator('[data-balance-diff]').textContent(),/פחות/,'the difference from the recorded balance is shown');
  await page.locator('#balance-form [name=record]').check();await page.locator('#balance-form [type=submit]').click();
  await page.locator('#balance-form').waitFor({state:'detached'});
  d=await stored();
  assert.equal(d.accounts[0].balance,11000);
  assert.equal(d.transactions.at(-1).category,'התאמת יתרה');assert.equal(d.transactions.at(-1).amount,1345.5,'the gap is recorded as an adjustment');

  // ---------- Hubs and sub-tabs ----------
  await page.locator('.hub-item[data-action="hub:money"]').click();
  assert.equal(await page.locator('.subtabs .subtab').count(),5,'the money hub has five tabs');
  await page.locator('.subtab[data-action="navigate:transactions"]').click();
  assert.match(await heading(),/תנועות/);
  await page.locator('.hub-item[data-action="hub:home"]').click();await page.locator('.hub-item[data-action="hub:money"]').click();
  assert.match(await heading(),/תנועות/,'a hub reopens on its last tab');
  assert.ok(await page.locator('.tx-table .table-actions .icon-button[aria-label]').count(),'row actions are labelled icon buttons');

  // ---------- Dollar rate of the transaction date ----------
  await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('ofek-finance-v1'));d.accounts.push({id:'usd',name:'דולרי',institution:'',kind:'bank',currency:'USD',balance:100});localStorage.setItem('ofek-finance-v1',JSON.stringify(d));});
  await page.waitForTimeout(1200);// Chromium writes localStorage to its store asynchronously
  await page.reload();await page.locator('.hub-item').first().waitFor();
  await page.locator('.hub-item[data-action="hub:money"]').click();
  await page.locator('[data-action="open:transaction"]').first().click();
  await page.locator('#entity-form [name=accountId]').selectOption('usd');
  await page.locator('#entity-form [name=date]').fill('2026-09-30');await page.locator('#entity-form [name=date]').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#entity-form [name=fx]')?.value==='3.7012',null,{timeout:5000});
  assert.ok(fxCalls.some(c=>c.includes('date=2026-09-30')),'the rate is fetched for the transaction date');
  await page.keyboard.press('Escape');

  // ---------- Theme ----------
  const before=await page.evaluate(()=>document.documentElement.dataset.theme);
  await page.locator('.topbar [data-action="theme-toggle"]').click();
  const after=await page.evaluate(()=>document.documentElement.dataset.theme);
  assert.notEqual(before,after,'the theme toggles');
  assert.equal(await page.evaluate(()=>localStorage.getItem('ofek-theme')),after,'the choice is remembered');

  // ---------- Phone: more sheet, privacy, no horizontal scroll, charts inside their box ----------
  await page.setViewportSize({width:390,height:844});
  await page.locator('.bottom-nav [data-action="more"]').click();
  assert.ok(await page.locator('dialog .more-tile').count()>=12,'the more sheet lists every page');
  await page.locator('dialog .more-tile[data-action="privacy"]').click();
  assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('privacy')),'privacy mode from the more sheet');
  assert.equal(await page.locator('dialog').count(),0,'the sheet closes');
  await page.locator('.bottom-nav [data-action="more"]').click();await page.locator('dialog .more-tile[data-action="privacy"]').click();
  for(const route of ['dashboard','transactions','bills','performance','lab','tools','settings']){
    await page.evaluate(r=>{location.hash=r;},route);await page.waitForTimeout(350);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,`${route}: no horizontal scroll on phone (${overflow}px)`);
  }
  await page.evaluate(()=>{location.hash='bills';});await page.waitForTimeout(600);
  const outside=await page.evaluate(()=>[...document.querySelectorAll('.native-chart')].flatMap(chart=>{const box=chart.getBoundingClientRect();return [...chart.querySelectorAll('svg text')].filter(t=>t.style.visibility!=='hidden').map(t=>t.getBoundingClientRect()).filter(r=>r.width&&(r.left<box.left-1||r.right>box.right+1));}).length);
  assert.equal(outside,0,'chart labels stay inside the chart at phone width');
  await page.screenshot({path:path.join(shots,'v4-03-phone-bills.png'),fullPage:true});

  assert.deepEqual(errors,[],'no page errors');
}finally{await browser.close();}
console.log(`4.0 QA passed · ${fxCalls.length} mocked rate calls · screenshots in ${shots}`);
