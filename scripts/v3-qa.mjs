// Browser QA for the 3.0 features: customizable home, goal allocations, cash-flow forecast,
// holdings import, risk, what-if simulator, smart capture, encrypted sync between two devices
// (mocked GitHub API), the phone experience (served over http for the service worker) and the tour.
// Run: node scripts/v3-qa.mjs [screenshot-dir]
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/opt/node22/lib/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),shots=process.argv[2]||path.join(root,'.qa'),app='file://'+path.join(root,'dist/index.html');
fs.mkdirSync(shots,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],expected=/ERR_INTERNET_DISCONNECTED|status of 401/;
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')));
async function newPage({viewport={width:1440,height:1000},tour=false,...options}={}){
  const context=await browser.newContext({viewport,locale:'he-IL',...options});
  // Dollar rate sources are mocked: the app fetches the USD/ILS rate on start.
  await context.route(/api\.frankfurter\.dev|cdn\.jsdelivr\.net|open\.er-api\.com/,route=>{const url=new URL(route.request().url());route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:JSON.stringify({base:'USD',quote:'ILS',rate:3.65,date:url.searchParams.get('date')||'2026-10-12'})});});
  if(!tour)await context.addInitScript(()=>{try{localStorage.setItem('ofek-seen-version','4.0');}catch{}});
  const page=await context.newPage();
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error'&&!expected.test(msg.text()))errors.push(msg.text());});
  return {page,context};
}

try{
  // ---------- Tour ----------
  {
    const {page}=await newPage({tour:true});
    await page.goto(app);await page.locator('dialog [data-action="setup-begin"]').waitFor();
    assert.ok(await page.locator('dialog [data-action="setup-demo"]').count(),'first visit: welcome with setup or demo');
    await page.locator('dialog [data-action="setup-demo"]').click();
    await page.waitForTimeout(400);await page.reload();await page.waitForTimeout(1300);
    assert.equal(await page.locator('dialog').count(),0,'welcome shows once');
  }

  // ---------- Customizable home ----------
  const {page}=await newPage();
  await page.goto(app);await page.locator('.home-board').waitFor();
  const widgets=()=>page.locator('.home-cell').evaluateAll(cells=>cells.map(c=>c.dataset.widget));
  const defaults=await widgets();
  assert.deepEqual(defaults,['hero','month','upcoming','recent','goals','investments','spending','budgets'],'calm default home with the balance hero first');
  await page.screenshot({path:path.join(shots,'v3-01-home.png'),fullPage:true});
  await page.locator('[data-action="home-edit"]').click();
  await page.locator('[data-action="home-toggle:spending"]').click();
  await page.locator('[data-action="home-toggle:cashflow"]').click();
  await page.locator('[data-action="home-move:budgets:-1"]').click();
  let now=await widgets();
  assert.ok(!now.includes('spending')&&now.at(-1)==='cashflow'&&now.indexOf('budgets')<now.indexOf('investments'),'hide, add and reorder: '+now.join());
  await page.screenshot({path:path.join(shots,'v3-02-home-editor.png')});
  await page.locator('[data-action="home-preset:investor"]').click();
  assert.deepEqual(await widgets(),['hero','investments','free','worth','goals','assets'],'preset');
  await page.waitForTimeout(1200);// Chromium writes localStorage to its store asynchronously; give it time before reloading
  await page.reload();await page.locator('.home-board').waitFor();
  assert.deepEqual(await widgets(),['hero','investments','free','worth','goals','assets'],'layout persists in data.prefs.home');
  assert.equal((await stored(page)).prefs.home.order[0],'hero');
  await page.locator('[data-action="home-edit"]').click();await page.locator('[data-action="home-preset:calm"]').click();
  assert.deepEqual(await widgets(),defaults,'calm preset restores the default');

  // ---------- Goal allocations ----------
  await page.goto(app+'#goals');await page.locator('.alloc-card').waitFor();
  await page.locator('[data-action="alloc:saving"]').click();
  await page.locator('[data-action="alloc-auto"]').click();
  await page.locator('#alloc-form button[type=submit]').click();await page.waitForTimeout(300);
  let d=await stored(page);
  const saving=d.accounts.find(a=>a.id==='saving'),linked=d.goals.filter(g=>g.accountId==='saving');
  assert.ok(linked.length&&linked.reduce((s,g)=>s+(g.allocation||0),0)<=saving.balance+.01,'allocations never exceed the account balance');
  await page.locator('.alloc-card').screenshot({path:path.join(shots,'v3-03-allocations.png')});

  // ---------- Cash-flow forecast ----------
  await page.goto(app+'#bills');await page.locator('.flow-calendar').waitFor();
  await page.locator('[data-action="flow-days:180"]').click();
  assert.ok(await page.locator('.flow-table tbody tr').count()>=6,'monthly summary for six months');
  await page.locator('.flow-day.ok, .flow-day.low').nth(3).click();
  assert.equal(await page.locator('.flow-detail').count(),1,'day detail');
  await page.screenshot({path:path.join(shots,'v3-04-cashflow.png'),fullPage:true});

  // ---------- Holdings import + risk ----------
  await page.goto(app+'#investments');await page.locator('.risk-card').waitFor();
  assert.ok((await page.locator('.risk-card').textContent()).includes('דולר'),'risk card shows USD exposure');
  await page.goto(app+'#monthly');await page.locator('[data-action="holdings-import"]').click();
  await page.locator('#holdings-form [name=report]').fill('שם נייר\tסימול\tכמות\tשער\tשווי\nVanguard S&P 500\tVOO\t60\t541.20\t32,472\nInvesco QQQ\tQQQ\t40\t495.10\t19,804\nתכלית ת"א 125\tTA125\t100\t49,850\t49,850');
  await page.locator('#holdings-form button[type=submit]').click();
  await page.locator('[data-action="holdings-apply"]').waitFor();
  await page.screenshot({path:path.join(shots,'v3-05-holdings-review.png')});
  await page.locator('[data-action="holdings-apply"]').click();await page.waitForTimeout(200);
  assert.equal(await page.locator('[name="asset_voo"]').inputValue(),'541.2');
  assert.equal(await page.locator('[name="asset_ta"]').inputValue(),'498.5','agorot converted for shekel assets');

  // ---------- What-if simulator ----------
  await page.goto(app+'#lab');await page.locator('[data-action="lab-tab:whatif"]').click();
  await page.locator('[data-action="scn-add:car"]').click();
  await page.locator('[data-action="scn-add:grant"]').click();
  await page.locator('[data-scn="1.target"]').selectOption({label:'ליעד ״החופשה הבאה״'});
  await page.waitForTimeout(150);
  assert.ok((await page.locator('.page-content').textContent()).includes('עכשיו יושג'),'grant makes a goal reachable');
  await page.screenshot({path:path.join(shots,'v3-06-whatif.png'),fullPage:true});

  // ---------- Smart capture ----------
  const win1255=s=>Buffer.from([...s].map(ch=>{const c=ch.codePointAt(0);return c>=0x5d0&&c<=0x5ea?0xe0+(c-0x5d0):c<128?c:0x3f;}));
  await page.goto(app+'#capture');
  const before=(await stored(page)).transactions.length;
  await page.locator('#capture-file').setInputFiles({name:'max.csv',mimeType:'text/csv',buffer:win1255('תאריך עסקה,שם בית העסק,קטגוריה,סכום חיוב\n01/10/2026,שופרסל דיל,מזון ומשקאות,245.90\n03/10/2026,ארומה,מסעדות,38\n05/10/2026,פז,דלק,310\n30/09/2026,קפה עם חברים,מסעדות,75\n05/10/2026,החזר,שונות,-30')});
  await page.locator('.capture-table').waitFor();
  assert.deepEqual(await page.locator('.capture-table tbody tr .badge').allTextContents(),['חדשה','חדשה','חדשה','כבר קיימת','חדשה'],'duplicate detected');
  await page.screenshot({path:path.join(shots,'v3-07-capture.png'),fullPage:true});
  await page.locator('[data-action="capture-save"]').click();await page.waitForTimeout(300);
  assert.equal((await stored(page)).transactions.length-before,4,'duplicate not imported');

  // ---------- Encrypted sync between two devices (mocked GitHub) ----------
  const gists=new Map();let gistCount=0;
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type, Accept, X-GitHub-Api-Version','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS'};
  const github=async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method();
    if(method==='OPTIONS')return route.fulfill({status:204,headers:cors});
    const json=(status,body)=>route.fulfill({status,headers:{...cors,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(req.headers().authorization!=='Bearer ghp_qa_token')return json(401,{message:'Bad credentials'});
    if(url.pathname==='/user')return json(200,{login:'qa-user'});
    if(url.pathname==='/gists'&&method==='GET')return json(200,[...gists.values()].map(g=>({id:g.id,files:{'ofek-sync.json':{}}})));
    if(url.pathname==='/gists'&&method==='POST'){const id='g'+(++gistCount),body=JSON.parse(req.postData());assert.equal(body.public,false);gists.set(id,{id,versions:[body.files['ofek-sync.json'].content]});return json(201,{id});}
    const m=url.pathname.match(/^\/gists\/(\w+)(?:\/(\w+))?$/),g=gists.get(m?.[1]);
    if(!g)return json(404,{message:'Not Found'});
    if(method==='PATCH'){g.versions.push(JSON.parse(req.postData()).files['ofek-sync.json'].content);return json(200,{});}
    const content=m[2]?g.versions[Number(m[2].slice(1))]:g.versions.at(-1);
    return json(200,{id:g.id,files:{'ofek-sync.json':{content}},history:g.versions.map((_,i)=>({version:'v'+i,committed_at:new Date(Date.UTC(2026,9,11,8,i)).toISOString()})).reverse()});
  };
  const device=async name=>{const {page,context}=await newPage();await context.route('https://api.github.com/**',github);await page.goto(app+'#settings');await page.locator('#sync-card').waitFor();return page;};
  const connect=async(p,name)=>{await p.locator('[data-action="sync-setup"]').click();await p.locator('#sync-form [name=token]').fill('ghp_qa_token');await p.locator('#sync-form [name=passphrase]').fill('סיסמת-בדיקה-ארוכה');await p.locator('#sync-form [name=confirm]').fill('סיסמת-בדיקה-ארוכה');await p.locator('#sync-form [name=device]').fill(name);await p.locator('#sync-form [type=submit]').click();};
  const quickAdd=async(p,description,amount)=>{await p.locator('[data-action="quick-add"]').first().evaluate(b=>b.click());await p.locator('#quick-form [name=amount]').fill(String(amount));await p.locator('#quick-form [name=description]').fill(description);await p.locator('#quick-form .quick-cat').first().click();await p.locator('#quick-form [type=submit]').click();await p.waitForTimeout(150);};
  const A=await device('A');
  await connect(A,'המחשב');
  await A.waitForFunction(()=>JSON.parse(localStorage.getItem('ofek-sync-v1')||'null')?.gistId,null,{timeout:20000});
  const first=[...gists.values()][0].versions[0];
  assert.ok(JSON.parse(first).encrypted.format==='ofek-encrypted'&&!first.includes('משכורת'),'only ciphertext reaches GitHub');
  await quickAdd(A,'בדיקת סנכרון',31);
  await A.waitForTimeout(3300);
  assert.equal([...gists.values()][0].versions.length,2,'changes are pushed automatically');
  const B=await device('B');
  await B.locator('[data-action="clear-demo"]').first().click();await B.locator('dialog [data-action="confirm"]').click();
  await B.locator('[data-action="navigate:settings"]').first().click();
  await connect(B,'הטלפון');
  await B.locator('dialog [data-action="sync-choose:pull"]').click({timeout:20000});
  await B.waitForFunction(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')).transactions.some(t=>t.description==='בדיקת סנכרון'),null,{timeout:20000});
  await quickAdd(B,'מהטלפון',12);await B.waitForTimeout(3300);
  await A.locator('[data-action="navigate:settings"]').first().click();await A.locator('[data-action="sync-now"]').click();
  await A.waitForFunction(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')).transactions.some(t=>t.description==='מהטלפון'),null,{timeout:20000});
  await A.locator('#sync-card').screenshot({path:path.join(shots,'v3-08-sync.png')});
  // encrypted backup round-trip and a wrong passphrase
  await B.locator('[data-action="navigate:settings"]').first().click();
  await B.locator('[data-action="backup-encrypted"]').click();
  await B.locator('#backup-form [name=passphrase]').fill('גיבוי-מוצפן-1');await B.locator('#backup-form [name=confirm]').fill('גיבוי-מוצפן-1');
  const [download]=await Promise.all([B.waitForEvent('download'),B.locator('#backup-form [type=submit]').click()]);
  const backup=fs.readFileSync(await download.path());
  assert.equal(JSON.parse(backup).format,'ofek-encrypted');
  await B.locator('#import-file').setInputFiles({name:'backup.ofek',mimeType:'application/octet-stream',buffer:backup});
  await B.locator('#decrypt-form [name=passphrase]').fill('לא נכון');await B.locator('#decrypt-form [type=submit]').click();
  await B.locator('#decrypt-form .form-error .notice').waitFor();
  await B.locator('#decrypt-form [name=passphrase]').fill('גיבוי-מוצפן-1');await B.locator('#decrypt-form [type=submit]').click();
  await B.locator('dialog [data-action="confirm"]').waitFor();await B.locator('dialog [data-action="dialog-close"]').last().click();
  assert.ok((await B.locator('#versions-list').textContent()).includes('לפני'),'versions kept before replacing data');

  // ---------- Phone experience over http (manifest, service worker, offline) ----------
  const server=spawn(process.execPath,[path.join(root,'scripts/serve.mjs')],{env:{...process.env,PORT:'5199'},stdio:'pipe'});
  try{
    await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
    const {page:phone,context}=await newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await phone.goto('http://localhost:5199/');await phone.locator('.bottom-nav').waitFor();
    assert.ok(await phone.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;return !!reg.active&&!!document.querySelector('link[rel=manifest]');}),'manifest and service worker');
    const start=await stored(phone);
    await phone.locator('.bottom-add').tap();
    await phone.locator('#quick-form [name=amount]').fill('42.5');await phone.locator('#quick-form [name=description]').fill('קפה עם חברים');
    await phone.waitForTimeout(100);
    assert.equal(await phone.locator('.quick-cat.active').textContent(),'מסעדות','category from history');
    await phone.screenshot({path:path.join(shots,'v3-09-quick-add.png')});
    await phone.locator('#quick-form [type=submit]').tap();await phone.waitForTimeout(150);
    let after=await stored(phone);
    assert.equal(after.transactions.length,start.transactions.length+1);
    assert.equal(after.accounts.find(a=>a.id==='bank').balance,start.accounts.find(a=>a.id==='bank').balance-42.5);
    await phone.locator('.toast-undo').tap();await phone.waitForTimeout(150);
    after=await stored(phone);
    assert.equal(after.transactions.length,start.transactions.length,'undo');assert.equal(after.accounts.find(a=>a.id==='bank').balance,start.accounts.find(a=>a.id==='bank').balance);
    await phone.locator('[data-action="alerts"]').tap();await phone.locator('dialog').waitFor();await phone.locator('dialog [data-action="dialog-close"]').first().tap();
    await phone.locator('.bottom-nav [data-action="more"]').tap();await phone.locator('dialog .more-sheet').waitFor();
    await phone.screenshot({path:path.join(shots,'v3-10-phone-menu.png')});
    await context.setOffline(true);await phone.reload();await phone.locator('.home-board').waitFor();
    await context.setOffline(false);
  }finally{server.kill();}
}finally{await browser.close();}
assert.deepEqual(errors,[]);
console.log(`3.0 QA passed · screenshots in ${shots}`);
