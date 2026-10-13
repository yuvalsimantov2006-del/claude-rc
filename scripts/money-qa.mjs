// Browser QA for bills & cash-flow, shared expenses, smart purchases and the toolkit.
// Run: node scripts/money-qa.mjs [screenshot-dir]
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/opt/node22/lib/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),shots=process.argv[2]||path.join(root,'.qa');
fs.mkdirSync(shots,{recursive:true});

const sse=events=>events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const start={type:'message_start',message:{id:'msg',model:'claude-opus-5-5',usage:{input_tokens:900,output_tokens:1}}};
const text=t=>sse([start,{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:t}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:40}}]);
const tool=(name,input)=>sse([start,{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'tu_'+name,name,input:{}}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(input)}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:30}}]);
const requests=[];
function reply(body){
  requests.push(body);
  const last=body.messages.at(-1);
  if(last.content.some?.(b=>b.type==='tool_result'))return text('ההוצאה נוספה לקבוצה ✔');
  return tool('propose_split_expense',{group:'אילת',description:'ארוחת צהריים',amount:300,paid_by:'אני'});
}

const HUB_OF={dashboard:'home',accounts:'money',transactions:'money',budgets:'money',bills:'money',capture:'money',goals:'wealth',investments:'wealth',performance:'wealth',monthly:'wealth',lab:'plan',wishlist:'plan',split:'plan',tools:'plan',insights:'plan',copilot:'ai'};
// Navigate the way a person does: the hub in the sidebar, then the tab inside it.
async function goTo(page,route){
  if(route==='settings'){await page.locator('.sidebar [data-action="navigate:settings"]').first().click();return;}
  await page.locator(`.hub-item[data-action="hub:${HUB_OF[route]}"]`).click();
  const tab=page.locator(`.subtab[data-action="navigate:${route}"]`);
  if(await tab.count())await tab.click();
  await page.waitForTimeout(120);
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
async function newPage(viewport){
  const context=await browser.newContext({viewport,locale:'he-IL'});
  // The one-time "what's new" tour is covered by its own checks; keep it out of the way here.
  await context.addInitScript(()=>{try{localStorage.setItem('ofek-seen-version','4.0');}catch{}});
  const page=await context.newPage();
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.route('https://api.anthropic.com/**',route=>route.fulfill({status:200,headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'},body:reply(JSON.parse(route.request().postData()))}));
  await page.goto('file://'+path.join(root,'dist/index.html'));
  return page;
}
const page=await newPage({width:1440,height:1000});
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')));
const go=route=>goTo(page,route);
const settle=()=>page.waitForTimeout(350);

// Grouped navigation and dashboard row.
await page.locator('.hero-card').waitFor();
assert.equal(await page.locator('.hub-nav .hub-item').count(),5,'five hubs');
assert.ok(await page.locator('[data-widget="safe"] .safe-number').count(),'safe-to-spend on dashboard');
await page.screenshot({path:path.join(shots,'m01-dashboard.png'),fullPage:true});

// Bills & cash-flow.
await go('bills');
await page.getByRole('heading',{name:'תשלומים ותזרים',level:1}).waitFor();
assert.ok(await page.locator('.flow-card .native-chart').count());
assert.ok(await page.locator('.agenda-item').count()>=3);
const before=await saved();
await page.locator('.agenda .pay-button').first().click();
await page.locator('#bill-pay-form').waitFor();
await page.locator('#bill-pay-form button[type=submit]').click();
await page.locator('.toast').waitFor();
let after=await saved();
assert.equal(after.transactions.length,before.transactions.length+1,'paying a bill records a transaction');
assert.ok(after.bills.some(b=>b.paid.length===1));
assert.deepEqual(after.transactions.at(-1).tags,['תשלום קבוע']);
await page.locator('[data-action="bill-new"]').first().click();
await page.locator('#bill-form [name=name]').fill('ביטוח בריאות');
await page.locator('#bill-form [name=amount]').fill('140');
await page.locator('#bill-form [name=day]').fill('1');
await page.locator('#bill-form button[type=submit]').click();
await settle();
after=await saved();
assert.ok(after.bills.some(b=>b.name==='ביטוח בריאות'&&b.amount===140));
const suggestions=await page.locator('[data-action^="bill-suggest"]').count();
if(suggestions){await page.locator('[data-action^="bill-suggest"]').first().click();await page.locator('#bill-form button[type=submit]').click();await settle();assert.equal((await saved()).bills.length,after.bills.length+1,'suggestion adds a bill');}
await page.locator('[data-action="flow-days:90"]').click();
assert.ok(await page.locator('[data-action="flow-days:90"].active').count());
await page.screenshot({path:path.join(shots,'m02-bills.png'),fullPage:true});

// Shared expenses.
await go('split');
assert.equal(await page.locator('.split-card').count(),2);
await page.locator('.split-card').first().click();
await page.locator('.group-title h2',{hasText:'טיול לאילת'}).waitFor();
assert.equal(await page.locator('.transfer').count(),3);
await page.locator('[data-action="gx-new"]').first().click();
await page.locator('#gx-form [name=description]').fill('פיצה');
await page.locator('#gx-form [name=amount]').fill('240');
await page.locator('#gx-form [name=paidBy]').selectOption({label:'נועה'});
await page.locator('#gx-form button[type=submit]').click();
await settle();
let eilat=(await saved()).groups[0];
assert.equal(eilat.expenses.length,5);
// Exact split must add up.
await page.locator('[data-action="gx-new"]').first().click();
await page.locator('#gx-form [name=description]').fill('מונית');
await page.locator('#gx-form [name=amount]').fill('100');
const shareInputs=page.locator('#gx-form .share-row input[type=number]');
await shareInputs.nth(0).fill('50');await shareInputs.nth(1).fill('40');await shareInputs.nth(2).fill('5');await shareInputs.nth(3).fill('1');
await page.locator('#gx-form button[type=submit]').click();
await page.locator('#gx-form .form-error .notice').waitFor();
await shareInputs.nth(3).fill('5');
await page.locator('#gx-form button[type=submit]').click();
await settle();
eilat=(await saved()).groups[0];
assert.deepEqual(eilat.expenses.at(-1).shares,{me:50,'m-noa':40,'m-omer':5,'m-michal':5});
await page.locator('[data-action="settle:0"]').click();
await page.locator('dialog [data-action="confirm"]').click();
await settle();
assert.equal((await saved()).groups[0].settlements.length,1);
await page.locator('[data-action="group-share"]').click();
assert.match(await page.locator('#share-text').inputValue(),/טיול לאילת/);
await page.screenshot({path:path.join(shots,'m03-split-share.png')});
await page.keyboard.press('Escape');
await page.screenshot({path:path.join(shots,'m04-split-group.png'),fullPage:true});
await page.locator('[data-action="group-close"]').click();
await page.locator('[data-action="group-new"]').first().click();
await page.locator('#group-form [name=name]').fill('ארוחת שישי');
await page.locator('#group-form [name=members]').fill('דנה, יואב');
await page.locator('#group-form button[type=submit]').click();
await page.locator('.group-title h2',{hasText:'ארוחת שישי'}).waitFor();
assert.equal((await saved()).groups.at(-1).members.length,3);

// Smart purchase & wishlist.
await go('wishlist');
await page.locator('[data-buy="name"]').fill('טלוויזיה');
await page.locator('[data-buy="price"]').fill('4800');
await page.locator('#buy-result .verdict').waitFor();
await page.locator('[data-buy="installments"]').selectOption('12');
assert.match(await page.locator('#buy-result').textContent(),/400/);
await page.screenshot({path:path.join(shots,'m05-wishlist.png'),fullPage:true});
await page.locator('[data-action="wish-from-check"]').click();
await page.locator('#wish-form button[type=submit]').click();
await settle();
let wishes=(await saved()).wishlist;
assert.equal(wishes.at(-1).name,'טלוויזיה');assert.equal(wishes.at(-1).price,4800);
await page.locator(`[data-action="wish-skip:${wishes.at(-1).id}"]`).click();
await settle();
assert.equal((await saved()).wishlist.at(-1).status,'skipped');
const goals=(await saved()).goals.length;
await page.locator('[data-action^="wish-goal:"]').first().click();
await settle();
assert.equal((await saved()).goals.length,goals+1);

// Toolkit.
await go('tools');
await page.locator('[data-tool="salary.gross"]').fill('10000');
await page.waitForTimeout(80);
assert.match(await page.locator('.salary-result .big-number').textContent(),/8,426/);
await page.screenshot({path:path.join(shots,'m06-tools-salary.png'),fullPage:true});
await page.locator('[data-action="tool-tab:loan"]').click();
await page.locator('[data-tool="loan.extra"]').fill('1000');
await page.locator('.extra-impact').waitFor();
await page.screenshot({path:path.join(shots,'m07-tools-loan.png'),fullPage:true});
await page.locator('[data-action="tool-tab:debt"]').click();
assert.equal(await page.locator('.plan-card').count(),2);
await page.locator('[data-action="tool-debt-add"]').click();
assert.equal(await page.locator('.debt-row').count(),2);
await page.locator('[data-action="tool-tab:fees"]').click();
assert.ok(await page.locator('#tool-output .native-chart').count());
await page.locator('[data-action="tool-tab:maaser"]').click();
assert.ok(await page.locator('.maaser-status .big-number').count());
await page.screenshot({path:path.join(shots,'m08-tools-maaser.png'),fullPage:true});

// Command palette jumps to a calculator.
await page.keyboard.press('Control+k');
await page.locator('#palette-input').fill('משכנתא');
await page.keyboard.press('Enter');
await page.locator('[data-action="tool-tab:loan"].active').waitFor();

// Claude proposes a shared expense; the user approves it.
await page.evaluate(()=>localStorage.setItem('ofek-ai-v1',JSON.stringify({apiKey:'sk-ant-test'})));
await page.reload();
await go('copilot');
await page.locator('#ai-input').fill('תחלק את ארוחת הצהריים באילת');
await page.keyboard.press('Enter');
await page.locator('.ai-proposal.pending').waitFor();
const groupExpenses=(await saved()).groups[0].expenses.length;
await page.locator('[data-action^="ai-approve"]').click();
await page.getByText('ההוצאה נוספה לקבוצה ✔').waitFor();
assert.equal((await saved()).groups[0].expenses.length,groupExpenses+1);
assert.ok(requests[0].tools.some(t=>t.name==='propose_split_expense'));
assert.match(requests[0].messages[0].content[0].text,/split_groups/);

// Mobile layouts.
const mobile=await newPage({width:390,height:844});
await mobile.evaluate(()=>localStorage.setItem('ofek-ui-qa','1'));
for(const route of ['bills','split','wishlist','tools','dashboard']){
  await mobile.goto('file://'+path.join(root,'dist/index.html#'+route));
  await mobile.waitForTimeout(200);
  if(route==='split'){await mobile.locator('.split-card').first().click();await mobile.waitForTimeout(150);}
  const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=1,`${route} has no horizontal scroll on mobile (overflow ${overflow})`);
  await mobile.screenshot({path:path.join(shots,`m09-mobile-${route}.png`),fullPage:true});
}

assert.deepEqual(errors,[],'no page errors');
await browser.close();
console.log(`Money QA passed · screenshots in ${shots}`);
