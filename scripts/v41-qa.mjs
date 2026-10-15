// Browser QA for 4.1. Run: [OFEK_APP=file.html] [QA41_ONLY=ledger|modules|all] node scripts/v41-qa.mjs [screenshot-dir]
// ledger → v41-qa-ledger.mjs · modules → v41-qa-modules.mjs · all → both, then v41-qa-integrate.mjs.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {run as ledger} from './v41-qa-ledger.mjs';
import {run as modules} from './v41-qa-modules.mjs';
import {run as integrate} from './v41-qa-integrate.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/opt/node22/lib/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),shots=process.argv[2]||path.join(root,'.qa');
const app='file://'+(process.env.OFEK_APP?path.resolve(process.env.OFEK_APP):path.join(root,'dist/index.html'));
const only=process.env.QA41_ONLY||'all';
if(!['ledger','modules','all'].includes(only))throw new Error('QA41_ONLY must be ledger, modules or all');
fs.mkdirSync(shots,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
// Each section gets fresh contexts through qa.open(): fixed clock, seeded storage, error capture.
// The dollar-rate services are mocked (as in v4-qa.mjs), so runs are offline and deterministic.
const qa={assert,shots,app,errors,path,
  async open({data=null,now='2026-10-14T12:00:00Z',width=1280,height=900,theme='light',extra={}}={}){
    const context=await browser.newContext({viewport:{width,height},locale:'he-IL',colorScheme:theme});
    await context.route(/api\.frankfurter\.dev|cdn\.jsdelivr\.net|open\.er-api\.com/,route=>{const u=new URL(route.request().url()),date=u.searchParams.get('date')||now.slice(0,10);route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify({date,base:'USD',quote:'ILS',rate:3.65})});});
    await context.clock.setFixedTime(new Date(now));
    await context.addInitScript(([data,theme,extra])=>{if(localStorage.getItem('qa-seeded'))return;localStorage.setItem('qa-seeded','1');
      localStorage.setItem('ofek-seen-version','4.1');localStorage.setItem('ofek-theme',theme);
      if(data)localStorage.setItem('ofek-finance-v1',JSON.stringify(data));for(const [k,v] of Object.entries(extra))localStorage.setItem(k,v);},[data,theme,extra]);
    const page=await context.newPage();
    page.on('pageerror',err=>errors.push(err.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
    await page.goto(app);
    if(await page.locator('dialog .whats-new').count())await page.keyboard.press('Escape');
    return {context,page,stored:()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1'))),
      noOverflow:async label=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,`${label}: no horizontal scroll`)};
  }};
try{
  if(only!=='modules')await ledger(qa);
  if(only!=='ledger')await modules(qa);
  if(only==='all')await integrate(qa);
  assert.deepEqual(errors,[],'no page errors');
}finally{await browser.close();}
console.log(`4.1 QA passed (${only}) · screenshots in ${shots}`);
