// Browser QA for 4.2 (home lane): the clear home and "מחיר היום" beside every holding.
// Run: [OFEK_APP=file.html] node scripts/v42-qa.mjs [app.html] [screenshot-dir]
// The home: the default order, checking without the net worth, the savings and investments tiles, "השווי שלי"
// as the sum of its parts, an income that moves checking, the month and the net worth at once, the one-time move
// of a layout saved before 4.2, empty states, privacy and no sideways scroll at 390px.
// The holdings: today's price of one holding typed (TASE), fetched (Finnhub with a key, CoinGecko), a holding
// tracked by value, inline validation, undo, and the home tile following. Quote and rate services are mocked.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {emptyData} from '../src/data.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/opt/node22/lib/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..');
const argv=process.argv.slice(2),htmlArg=argv.find(a=>/\.html?$/i.test(a)),shots=argv.find(a=>a!==htmlArg)||path.join(root,'.qa');
const app='file://'+(process.env.OFEK_APP?path.resolve(process.env.OFEK_APP):htmlArg?path.resolve(htmlArg):path.join(root,'dist/index.html'));
fs.mkdirSync(shots,{recursive:true});
// The "what's new" dialog stays away: the app sees its own version as already seen.
const SEEN=(fs.readFileSync(new URL(app),'utf8').match(/WHATS_NEW_VERSION='([^']+)'/)||[])[1]||'4.2';
const NOW='2026-10-17',UNIX=Math.floor(new Date(NOW+'T08:00:00Z').getTime()/1000);

// 12,000 in checking; 30,000 savings (18,000 of it for a goal) and an 8,000 deposit; four holdings worth 45,700
// at 3.6 ₪/$ (SoFi 4,320 · Bitcoin 2,880 · TA125 22,500 · a provident fund by value 16,000); a 5,000 loan.
// Net worth 12,000 + 400 + 30,000 + 8,000 + 45,700 − 5,000 = 91,100. October: in 9,000, out 1,200.
export function fixture({prefs}={}){
  const d={...emptyData(),createdAt:'2026-01-01',fx:3.6,fxDate:NOW,profile:'נועה',overallBudget:8000,lastBackup:NOW};
  const acc=(id,name,kind,balance,extra={})=>({id,name,institution:'',kind,currency:'ILS',balance,original:0,payment:0,interest:0,...extra});
  d.accounts=[acc('bank','עו״ש לאומי','bank',12000,{balanceUpdated:NOW}),acc('cash','מזומן','cash',400),acc('sav','חיסכון','savings',30000),acc('dep','פיקדון אישי','deposit',8000,{releaseDate:'2027-03-01'}),acc('inv','מיטב טרייד','investment',0,{invType:'broker'}),acc('loan','הלוואת רכב','debt',5000,{original:10000,payment:500,interest:4})];
  d.goals=[{id:'g1',name:'קרן חירום',type:'קרן חירום',target:40000,saved:0,monthly:1000,date:'2027-12-01',accountId:'sav',allocation:18000}];
  const h=(id,name,ticker,type,currency,quantity,price,invested,extra={})=>({id,name,ticker,type,currency,quantity,averagePrice:quantity?invested/quantity:0,invested,currentPrice:price,currentValue:0,mode:'price',accountId:'inv',date:'2026-10-15',...extra});
  d.assets=[h('sofi','SoFi Technologies','SOFI','מניה','USD',100,12,1000),h('btc','Bitcoin','BTC','קריפטו','USD',.01,80000,600),h('ta','תכלית ת״א 125','TA125','קרן סל','ILS',50,450,20000),
    h('gemel','אלטשולר גמל','','קופת גמל להשקעה','ILS',0,0,15000,{mode:'value',currentValue:16000,date:'2026-09-30'})];
  const tx=(id,type,amount,date,category)=>({id,type,amount,currency:'ILS',date,category,subcategory:'',accountId:'bank',description:category,tags:[],recurring:false});
  d.transactions=[tx('sal','income',9000,'2026-10-01','משכורת'),tx('x1','expense',1200,'2026-10-05','קניות בסופר')];
  if(prefs)d.prefs=prefs;
  return d;
}

const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],requests=[];
async function open({data=fixture(),width=390,height=844,theme='light',quotes=true}={}){
  const phone=width<=760,context=await browser.newContext({viewport:{width,height},locale:'he-IL',colorScheme:theme,reducedMotion:'reduce',...(phone?{isMobile:true,hasTouch:true}:{})});
  const json=(route,body)=>route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(body)});
  await context.route(/api\.frankfurter\.dev|cdn\.jsdelivr\.net|open\.er-api\.com/,route=>json(route,{date:NOW,base:'USD',quote:'ILS',rate:3.6,usd:{ils:3.6},rates:{ILS:3.6}}));
  await context.route(/finnhub\.io/,route=>{requests.push(route.request().url());const s=new URL(route.request().url()).searchParams.get('symbol');json(route,s==='SOFI'?{c:12.5,pc:12,t:UNIX}:{c:0,t:0});});
  await context.route(/api\.coingecko\.com/,route=>{requests.push(route.request().url());json(route,{bitcoin:{usd:82000,ils:295200,last_updated_at:UNIX}});});
  await context.route(/api\.coinbase\.com|api\.twelvedata\.com/,route=>route.abort());
  await context.clock.setFixedTime(new Date(NOW+'T09:00:00Z'));
  await context.addInitScript(([data,theme,quotes,seen])=>{if(localStorage.getItem('qa-seeded'))return;localStorage.setItem('qa-seeded','1');
    localStorage.setItem('ofek-seen-version',seen);localStorage.setItem('ofek-theme',theme);
    if(quotes)localStorage.setItem('ofek-quotes-v1',JSON.stringify({provider:'finnhub',key:'qa-key'}));
    if(data)localStorage.setItem('ofek-finance-v1',JSON.stringify(data));},[data,theme,quotes,SEEN]);
  const page=await context.newPage();
  page.on('pageerror',err=>errors.push(err.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.goto(app+'#dashboard');
  await page.locator('.home-board').waitFor();
  if(await page.locator('dialog .whats-new').count())await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  return {context,page,stored:()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ofek-finance-v1')))};
}
const num=text=>{const m=String(text).replace(/[⁦-⁩‎‏]/g,'').match(/[−-]?\d[\d,]*(\.\d+)?/);return m?Number(m[0].replace(/,/g,'').replace('−','-')):NaN;};
const plain=s=>String(s??'').replace(/[\u2066-\u2069\u200e\u200f]/g,'').replace(/[\u00a0\u202f]/g,' ');
const text=async(page,sel)=>plain(await page.locator(sel).first().textContent());
const widgets=page=>page.$$eval('.home-board [data-widget]',els=>els.map(x=>x.dataset.widget));
const overflow=page=>page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
const go=async(page,id)=>{await page.evaluate(id=>{location.hash=id;},id);await page.waitForFunction(id=>location.hash==='#'+id&&document.querySelector('.page-heading'),id);await page.waitForTimeout(250);};
const toastText=async page=>plain(await page.locator('.toast').last().textContent());
const shot=(page,name,full=false)=>page.screenshot({path:path.join(shots,name),fullPage:full});
// Numbers count up on navigation (off here: reduced motion); a short wait lets a re-render land.
const settled=async page=>{await page.waitForTimeout(300);};

try{
  // ---------- 1. The home: order, checking alone, the tiles, the net worth as a sum, the month ----------
  {
    const {context,page,stored}=await open();
    await settled(page);
    assert.deepEqual(await widgets(page),['hero','savings','portfolio','networth','month'],'the new default home, in order');
    const hero=await text(page,'[data-widget="hero"]');
    assert.match(hero,/בעו״ש עכשיו/);assert.equal(num(await text(page,'.hero-balance')),12000,'checking only: the bank account');
    assert.match(hero,/בטוח לבזבז היום/);assert.match(hero,/עדכון יתרה/);
    assert.doesNotMatch(hero,/השווי|91,100|38,000|45,700/,'no net worth, savings or investments in the checking card');
    assert.equal(await page.locator('[data-widget="hero"] [data-action="balance-edit"]').count(),1);
    assert.equal(num(await text(page,'.savings-tile .home-tile-value')),38000,'savings: the savings account and the deposit');
    assert.match(await text(page,'.savings-tile'),/מתוכם 18,000 ₪ ליעדים/);
    assert.equal(num(await text(page,'.portfolio-tile .home-tile-value')),45700,'investments: the holdings at 3.6 ₪/$');
    assert.match(await text(page,'.portfolio-tile .home-tile-gain'),/\+/);
    assert.match(await text(page,'.portfolio-tile .home-tile-fresh'),/לפני 2 ימים/);
    assert.equal(await page.locator('.portfolio-tile [data-action="daily-update"]').count(),1,'a clear daily-update button in the investments tile');
    const total=num(await text(page,'.worth-total'));assert.equal(total,91100,'net worth');
    const parts=await page.$$eval('.worth-legend li',els=>els.map(li=>[li.querySelector('span').textContent,li.querySelector('b').textContent]));
    assert.deepEqual(parts.map(p=>p[0]),['עו״ש','מזומן','חסכונות','פיקדון','השקעות','הלוואות']);
    assert.equal(parts.reduce((s,[,v])=>s+num(v),0),total,'the legend adds up to the net worth');
    assert.equal(await page.locator('.worth-bar > span').count(),5,'the bar shows the five parts that are owned');
    const month=await page.$$eval('.month-figures b',els=>els.map(b=>b.textContent));
    assert.deepEqual(month.map(num),[9000,1200,7800],'this month: in, out, left');
    assert.ok(await overflow(page)<=1,'home: no sideways scroll at 390px');
    // Tiles side by side on the phone.
    const [s,p]=await Promise.all(['savings','portfolio'].map(id=>page.locator(`[data-widget="${id}"]`).boundingBox()));
    assert.ok(Math.abs(s.y-p.y)<2&&s.width<200&&p.width<200,'the two tiles share one row on the phone');
    await shot(page,'v42-H01-home-phone.png',true);
    // Each tile opens its page.
    await page.locator('.savings-tile .home-tile-link').click();await page.waitForFunction(()=>location.hash==='#goals');
    await go(page,'dashboard');await page.locator('.portfolio-tile .home-tile-link').click();await page.waitForFunction(()=>location.hash==='#investments');
    await go(page,'dashboard');await page.locator('.portfolio-tile [data-action="daily-update"]').click();
    await page.locator('#daily-form').waitFor();assert.equal(await page.evaluate(()=>location.hash),'#dashboard','the daily update opens over home');
    await page.keyboard.press('Escape');

    // ---------- 2. A 1,000 ₪ income moves checking, the month and the net worth together ----------
    await page.locator('[data-action="quick-add"]:visible').first().click();
    await page.locator('#quick-form [data-quick-type="income"]').click();
    await page.locator('#quick-form [name=amount]').fill('1000');
    await page.locator('#quick-form .quick-cat').first().click();
    await page.locator('#quick-form button[type=submit]').click();
    await page.waitForFunction(()=>!document.querySelector('#quick-form'));await settled(page);
    assert.equal(num(await text(page,'.hero-balance')),13000,'checking +1,000');
    assert.equal(num(await text(page,'.worth-total')),92100,'net worth +1,000');
    assert.deepEqual((await page.$$eval('.month-figures b',els=>els.map(b=>b.textContent))).map(num),[10000,1200,8800],'the month follows');
    assert.equal(num(await text(page,'.savings-tile .home-tile-value')),38000,'savings unchanged');
    assert.equal(num(await text(page,'.portfolio-tile .home-tile-value')),45700,'investments unchanged');
    assert.equal((await stored()).accounts.find(a=>a.id==='bank').balance,13000);
    await context.close();
  }

  // ---------- 3. "מחיר היום": typed, fetched, by value; validation; undo; the home tile follows ----------
  {
    const {context,page,stored}=await open();
    await go(page,'investments');
    assert.equal(await page.locator('.holding-row [data-action^="asset-today:"]').count(),4,'a today button on every holding');
    assert.match(await text(page,'[data-action="asset-today:gemel"]'),/שווי/,'a holding tracked by value gets "שווי היום"');
    assert.match(await text(page,'[data-action="asset-today:ta"]'),/מחיר/);
    const tall=await page.$$eval('.holding-today:not(.is-gap)',els=>els.map(b=>[Math.round(b.getBoundingClientRect().width),Math.round(b.getBoundingClientRect().height)]));
    assert.ok(tall.every(([w,h])=>w>=44&&h>=44),`today buttons are at least 44px on the phone: ${JSON.stringify(tall)}`);
    assert.ok(await overflow(page)<=1,'investments: no sideways scroll at 390px');
    await shot(page,'v42-I01-holdings-phone.png');
    const before=await stored();

    // Typed (TASE: no free source): prefilled with the last price, selected; validation; save.
    await page.locator('[data-action="asset-today:ta"]').click();
    const box=page.locator('#today-form [name=price]');await box.waitFor();await page.waitForTimeout(150);
    assert.equal(await box.inputValue(),'450');
    assert.deepEqual(await box.evaluate(b=>[b.selectionStart,b.selectionEnd,document.activeElement===b,b.inputMode]),[0,3,true,'decimal'],'the last price is selected for typing over');
    assert.match(await text(page,'#today-form .balance-current'),/450\.00[^]*17\.10|15\.10\.2026/);
    assert.match(await text(page,'#today-status'),/מקלידים/);
    assert.ok(await overflow(page)<=1,'the sheet: no sideways scroll');
    await shot(page,'v42-I02-sheet-typed-phone.png');
    for(const [value,re] of [['abc',/לא נראה כמו מחיר/],['0',/גדול מאפס/],['-4',/גדול מאפס/],['1.1234567',/6 ספרות/],['',/להקליד את המחיר/]]){
      await box.fill(value);await page.locator('#today-form button[type=submit]').click();
      assert.match(await text(page,'#today-error'),re,`inline error for "${value}"`);
      assert.equal(await box.getAttribute('aria-invalid'),'true');
    }
    assert.deepEqual((await stored()).assets,before.assets,'nothing saved on an invalid price');
    await box.fill('460');assert.match(await text(page,'#today-preview'),/23,000[^]*\+500/);
    await page.locator('#today-form button[type=submit]').click();
    await page.waitForFunction(()=>!document.querySelector('#today-form'));
    assert.match(await toastText(page),/המחיר של תכלית ת״א 125 עודכן · שווי 23,000 ₪ \(\+500 ₪\)/);
    let d=await stored(),ta=d.assets.find(a=>a.id==='ta');
    assert.deepEqual([ta.currentPrice,ta.date,ta.priceDate,ta.priceSource],[460,NOW,NOW,'ידני']);
    for(const id of ['sofi','btc','gemel'])assert.deepEqual(d.assets.find(a=>a.id===id),before.assets.find(a=>a.id===id),`${id} unchanged`);
    assert.equal(d.snapshots.length,before.snapshots.length,'no monthly snapshot');
    // Undo puts the old price back, exactly.
    await page.locator('.toast-undo').click();await page.waitForFunction(()=>/השינוי בוטל/.test(document.querySelector('.toast')?.textContent||''));
    assert.deepEqual((await stored()).assets,before.assets,'undo');
    await page.locator('[data-action="asset-today:ta"]').click();await box.waitFor();await box.fill('460');await page.locator('#today-form button[type=submit]').click();
    await page.waitForFunction(()=>!document.querySelector('#today-form'));

    // Fetched: SoFi through Finnhub (the free key), Bitcoin through CoinGecko.
    await page.locator('[data-action="asset-today:sofi"]').click();
    await page.waitForFunction(()=>document.querySelector('#today-form [name=price]')?.value==='12.5');
    assert.match(await text(page,'#today-status'),/נמשך אוטומטית · Finnhub/);
    assert.match(await text(page,'#today-form'),/\$/);
    await shot(page,'v42-I03-sheet-fetched-phone.png');
    await page.locator('#today-form button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#today-form'));
    assert.match(await toastText(page),/המחיר של SoFi Technologies עודכן/);
    await page.locator('[data-action="asset-today:btc"]').click();
    await page.waitForFunction(()=>document.querySelector('#today-form [name=price]')?.value==='82000');
    assert.match(await text(page,'#today-status'),/CoinGecko/);
    await page.locator('#today-form button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#today-form'));
    // By value: the provident fund.
    await page.locator('[data-action="asset-today:gemel"]').click();
    await page.locator('#today-form').waitFor();
    assert.match(await page.locator('dialog .modal-head h2').textContent(),/שווי היום/);
    assert.match(await text(page,'#today-status'),/שווי כולל/);
    await page.locator('#today-form [name=price]').fill('16,500');await page.locator('#today-form button[type=submit]').click();
    await page.waitForFunction(()=>!document.querySelector('#today-form'));
    assert.match(await toastText(page),/השווי של אלטשולר גמל עודכן/);
    d=await stored();const by=id=>d.assets.find(a=>a.id===id);
    assert.deepEqual([by('sofi').currentPrice,by('sofi').priceSource,by('sofi').priceDate],[12.5,'Finnhub',NOW]);
    assert.deepEqual([by('btc').currentPrice,by('btc').priceSource],[82000,'CoinGecko']);
    assert.deepEqual([by('gemel').currentValue,by('gemel').priceSource,by('gemel').currentPrice],[16500,'ידני',0]);
    assert.equal(by('ta').currentPrice,460);
    assert.ok(requests.every(u=>/symbol=SOFI|coingecko/.test(u)),'only the ticker is asked for');
    assert.match(await text(page,'.holding-row[data-asset-row="sofi"] .holding-fresh'),/עודכן היום/);
    // The edit tap on a row still opens the holding.
    await page.locator('.holding-row[data-asset-row="ta"] .holding-open').click();await page.locator('#entity-form').waitFor();await page.keyboard.press('Escape');
    // Home: the investments tile and the net worth follow. 4,500 + 2,952 + 23,000 + 16,500 = 46,952.
    await go(page,'dashboard');await settled(page);
    assert.equal(num(await text(page,'.portfolio-tile .home-tile-value')),46952);
    assert.match(await text(page,'.portfolio-tile .home-tile-fresh'),/עודכנו היום/);
    assert.equal(num(await text(page,'.worth-total')),91100+1252);
    await context.close();
  }

  // ---------- 4. A layout saved before 4.2 moves to the new home once; later choices are kept ----------
  {
    const old={home:{order:['hero','month','upcoming','recent','goals','investments','spending','budgets','networth'],hidden:['networth']}};
    const {context,page,stored}=await open({data:fixture({prefs:old}),width:1280,height:900});
    assert.deepEqual(await widgets(page),['hero','savings','portfolio','networth','month']);
    let d=await stored();assert.equal(d.prefs.homeVersion,2);assert.deepEqual(d.prefs.home.order.slice(0,5),['hero','savings','portfolio','networth','month']);
    // The user adds "חיובים קרובים" back: kept after a reload, never reset again.
    await page.locator('[data-action="home-edit"]:visible').first().click();
    await page.locator('[data-action="home-toggle:upcoming"]').click();
    await page.locator('[data-action="home-done"]').first().click();
    await page.reload();await page.locator('.home-board').waitFor();
    assert.deepEqual(await widgets(page),['hero','savings','portfolio','networth','month','upcoming']);
    d=await stored();assert.equal(d.prefs.homeVersion,2);
    // Desktop: checking and the two tiles on one row; privacy blurs the amounts.
    const top=await Promise.all(['hero','savings','portfolio'].map(id=>page.locator(`[data-widget="${id}"]`).boundingBox()));
    assert.ok(top.every(b=>Math.abs(b.y-top[0].y)<2),'desktop: checking and the tiles share the first row');
    await shot(page,'v42-H02-home-desktop.png');
    await page.locator('[data-action="privacy"]').first().click();await page.waitForTimeout(400);
    const blurred=await page.$$eval('.hero-balance, .home-tile-value, .worth-total, .worth-legend b, .month-figures b, .hero-safe > b',els=>els.filter(el=>!/blur/.test(getComputedStyle(el).filter)).map(el=>el.className||el.tagName));
    assert.deepEqual(blurred,[],'privacy blurs every amount on home');
    await page.locator('[data-action="privacy"]').first().click();
    await context.close();
  }

  // ---------- 5. Empty states: each card invites the first step instead of "0 ₪" ----------
  {
    const d={...emptyData(),createdAt:'2026-01-01',fxDate:NOW,profile:'דנה',lastBackup:NOW};
    d.accounts=[{id:'cash',name:'מזומן',institution:'',kind:'cash',currency:'ILS',balance:300,original:0,payment:0,interest:0}];
    const {context,page}=await open({data:d});
    assert.match(await text(page,'[data-widget="hero"]'),/עוד לא הגדרת חשבון עו״ש/);
    assert.equal(await page.locator('[data-widget="hero"] [data-action="home-new-account:bank"]').count(),1,'with data already in, a checking account is added — not a new setup');
    assert.match(await text(page,'.savings-tile'),/עוד אין חשבון חיסכון/);
    assert.match(await text(page,'.portfolio-tile'),/עוד אין השקעות/);
    assert.equal(await page.locator('.savings-tile .home-tile-value, .portfolio-tile .home-tile-value').count(),0,'no "0 ₪" in empty tiles');
    assert.ok(await overflow(page)<=1);
    await page.locator('.savings-tile [data-action="home-new-account:savings"]').click();
    await page.locator('#entity-form').waitFor();assert.equal(await page.locator('#entity-form [name=kind]').inputValue(),'savings');
    await page.keyboard.press('Escape');
    await shot(page,'v42-H03-home-empty-phone.png',true);
    await context.close();
  }

  // ---------- 6. Dark theme on the phone: home, holdings and the sheet render without errors ----------
  {
    const {context,page}=await open({theme:'dark'});
    await settled(page);await shot(page,'v42-H04-home-phone-dark.png',true);
    await go(page,'investments');await page.locator('[data-action="asset-today:btc"]').click();
    await page.waitForFunction(()=>document.querySelector('#today-form [name=price]')?.value==='82000');
    await shot(page,'v42-I04-sheet-phone-dark.png');
    assert.ok(await overflow(page)<=1);
    await context.close();
  }
  assert.deepEqual(errors,[],'no page errors');
}finally{await browser.close();}
console.log(`4.2 home QA passed · screenshots in ${shots}`);
