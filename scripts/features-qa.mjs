// Browser QA for the AI copilot, future lab, command palette and smart widgets.
// Uses a mocked Messages API, so no API key or network access is needed.
// Run: node scripts/features-qa.mjs [screenshot-dir]
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/opt/node22/lib/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),shots=process.argv[2]||path.join(root,'.qa');
fs.mkdirSync(shots,{recursive:true});

const sse=events=>events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const start={type:'message_start',message:{id:'msg',model:'claude-opus-5-5',usage:{input_tokens:1200,output_tokens:1}}};
const text=t=>sse([start,{type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'',signature:''}},{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'בודק את הנתונים של החודש.'}},{type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'sig'}},{type:'content_block_stop',index:0},{type:'content_block_start',index:1,content_block:{type:'text',text:''}},{type:'content_block_delta',index:1,delta:{type:'text_delta',text:t}},{type:'content_block_stop',index:1},{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:180}}]);
const tool=(name,input)=>sse([start,{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'tu_'+name,name,input:{}}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(input)}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:60}}]);
const requests=[];
function reply(body){
  requests.push(body);
  const last=body.messages.at(-1),prompt=JSON.stringify(last.content);
  if(last.content.some?.(b=>b.type==='tool_result'))return text(prompt.includes('approved\\":true')?'מעולה — **2 תנועות** נוספו.':'### סיכום\nההוצאות שלך **יציבות**.\n- מסעדות: 580 ₪\n- סופר: 1,970 ₪\n\n| קטגוריה | סכום |\n|---|---|\n| חשבונות | 5,390 ₪ |');
  if(prompt.includes('קבלה'))return tool('propose_transactions',{note:'מתוך הקבלה',transactions:[{type:'expense',amount:84.9,date:'2026-09-28',category:'קניות בסופר',description:'שופרסל דיל',account:'חשבון עו״ש'},{type:'expense',amount:32,date:'2026-09-28',category:'מסעדות',description:'קפה ומאפה'}]});
  if(prompt.includes('גרף'))return tool('render_chart',{chart_type:'bar',title:'הוצאות לפי חודש',labels:['אפר','מאי','יוני','יולי','אוג','ספט'],series:[{name:'הוצאות',values:[9800,10100,10300,10500,10700,11200]}],unit:'ILS'});
  return tool('get_financial_overview',{});
}

const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
async function newPage(viewport){
  const context=await browser.newContext({viewport,locale:'he-IL'});
  // The one-time "what's new" tour is covered by its own checks; keep it out of the way here.
  await context.addInitScript(()=>{try{localStorage.setItem('ofek-seen-version','3.0');}catch{}});
  const page=await context.newPage();
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.route('https://api.anthropic.com/**',async route=>{const body=JSON.parse(route.request().postData());const h=route.request().headers();assert.equal(h['anthropic-dangerous-direct-browser-access'],'true');assert.equal(h['x-api-key'],'sk-ant-test');await route.fulfill({status:200,headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'},body:reply(body)});});
  await page.goto('file://'+path.join(root,'dist/index.html'));
  return page;
}

const page=await newPage({width:1440,height:1000});
await page.getByRole('heading',{name:'התמונה הפיננסית שלך'}).waitFor();
assert.ok(await page.locator('[data-widget="health"] .score-ring').count(),'health ring on dashboard');
await page.screenshot({path:path.join(shots,'01-dashboard.png'),fullPage:true});

for(const [route,heading] of [['insights','התובנות שלך'],['lab','מעבדת העתיד'],['budgets','התקציבים שלך'],['copilot','אופק AI'],['settings','הגדרות וגיבוי']]){
  await page.locator(`.nav-item[data-action="navigate:${route}"]`).first().click();
  await page.getByRole('heading',{name:heading,level:1}).waitFor();
  await page.screenshot({path:path.join(shots,`02-${route}.png`),fullPage:true});
}

// Future lab reacts to sliders.
await page.locator('.nav-item[data-action="navigate:lab"]').click();
const before=await page.locator('#lab-results .metric-value').first().textContent();
await page.locator('input[data-lab="monthly"]').fill('9000');
await page.waitForTimeout(100);
const after=await page.locator('#lab-results .metric-value').first().textContent();
assert.notEqual(before,after,'lab recalculates');

// Command palette quick add.
const count=await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')||'null')?.transactions.length??0);
await page.keyboard.press('Control+k');
await page.locator('#palette-input').fill('קפה 18 אתמול במזומן');
await page.screenshot({path:path.join(shots,'03-palette.png')});
await page.keyboard.press('Enter');
await page.locator('.toast').waitFor();
const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')));
assert.equal(saved.transactions.length,count+(count?1:saved.transactions.length));
const added=saved.transactions.at(-1);
assert.equal(added.amount,18);assert.equal(added.accountId,'cash');assert.equal(added.category,'מסעדות');

// Privacy mode.
await page.locator('[data-action="privacy"]').click();
assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('privacy')));
await page.locator('[data-action="privacy"]').click();

// Connect Claude.
await page.locator('.nav-item[data-action="navigate:copilot"]').click();
await page.locator('#ai-key-form [name=apiKey]').fill('sk-ant-test');
await page.locator('#ai-key-form button[type=submit]').click();
await page.locator('#ai-input').waitFor();
await page.screenshot({path:path.join(shots,'04-copilot-empty.png')});

// Question → tool → streamed answer with markdown table.
await page.locator('[data-action="ai-prompt:month"]').click();
await page.locator('.ai-text table').waitFor();
assert.ok(await page.locator('.ai-tool.done').count(),'tool chip shown');
assert.ok(await page.locator('.ai-thinking').count(),'thinking summary shown');
const second=requests.at(-1);
assert.equal(second.messages.length,3);assert.equal(second.messages[1].content[0].type,'tool_use');assert.equal(second.messages[2].content[0].type,'tool_result');
assert.equal(second.fallbacks,'default');assert.match(second.messages[0].content[0].text,/^<financial_context>/);

// Chart drawn inside chat.
await page.locator('#ai-input').fill('צייר לי גרף של ההוצאות');
await page.keyboard.press('Enter');
await page.locator('.ai-chart .bar-chart').waitFor();
assert.ok(!JSON.stringify(requests.at(-1).messages.at(-3).content).includes('financial_context'),'context is not re-sent when unchanged');

// Receipt → proposal → approve → saved.
await page.locator('#ai-file').setInputFiles({name:'receipt.csv',mimeType:'text/csv',buffer:Buffer.from('מוצר,מחיר\nחלב,6.9\nלחם,12')});
await page.locator('.ai-attachment').waitFor();
await page.locator('#ai-input').fill('תוסיף את הקבלה');
await page.locator('[data-action="ai-send"]').click();
await page.locator('.ai-proposal.pending').waitFor();await page.waitForTimeout(400);
await page.screenshot({path:path.join(shots,'05-copilot-proposal.png'),fullPage:true});
const beforeApprove=(await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')))).transactions.length;
await page.locator('[data-action^="ai-approve"]').click();
await page.getByText('2 תנועות').first().waitFor();await page.waitForTimeout(400);
const afterApprove=await page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')));
assert.equal(afterApprove.transactions.length,beforeApprove+2);
assert.deepEqual(afterApprove.transactions.at(-1).tags,['AI']);
const docBlock=requests.find(r=>JSON.stringify(r.messages).includes('receipt.csv'));
assert.ok(docBlock,'attachment sent as a document block');
await page.screenshot({path:path.join(shots,'06-copilot-chat.png'),fullPage:true});

// Conversation survives reload (without thinking blocks or attachment payloads).
await page.reload();
await page.locator('.ai-proposal').first().waitFor();
const stored=await page.evaluate(()=>localStorage.getItem('ofek-ai-chat-v1'));
assert.ok(!stored.includes('"thinking"'));assert.ok(!stored.includes('חלב,6.9'));

// Monthly letter.
await page.locator('.nav-item[data-action="navigate:insights"]').click();
await page.locator('[data-action="ai-letter"]').click();
await page.locator('#ai-letter .ai-text, #ai-letter h4, #ai-letter p').first().waitFor();
await page.waitForFunction(()=>!document.querySelector('[data-action="ai-letter-stop"]'));
assert.ok(await page.evaluate(()=>!!JSON.parse(localStorage.getItem('ofek-ai-letters-v1'))['2026-09']));

// Transaction form suggests a category from the description.
await page.locator('.nav-item[data-action="navigate:dashboard"]').click();
await page.locator('.heading-actions [data-action="open:transaction"]').click();
await page.locator('dialog [name=description]').fill('תדלוק בפז');
assert.equal(await page.locator('dialog [name=category]').inputValue(),'דלק');
await page.keyboard.press('Escape');

// Mobile layouts.
const mobile=await newPage({width:390,height:844});
await mobile.evaluate(()=>localStorage.setItem('ofek-ai-v1',JSON.stringify({apiKey:'sk-ant-test'})));
for(const route of ['dashboard','copilot','lab','insights']){
  await mobile.goto('file://'+path.join(root,'dist/index.html#'+route));
  await mobile.waitForTimeout(150);
  const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=1,`${route} has no horizontal scroll on mobile (overflow ${overflow})`);
  await mobile.screenshot({path:path.join(shots,`07-mobile-${route}.png`),fullPage:true});
}

assert.deepEqual(errors,[],'no page errors');
await browser.close();
console.log(`Features QA passed · ${requests.length} mocked API calls · screenshots in ${shots}`);
