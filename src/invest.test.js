import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {demoData} from './data.js';
import {assetSector,riskProfile,stressTest,historyRisk,STRESS_SCENARIOS,parseHoldingsRows,matchHoldings} from './invest.js';
import {readXlsx,parseNumber,textToRows,excelDate} from './xlsx.js';

const near=(a,b,eps=.01)=>assert.ok(Math.abs(a-b)<=eps,`${a} ≉ ${b}`);

test('numbers are parsed in Israeli and international formats',()=>{
  assert.equal(parseNumber('1,234.56'),1234.56);
  assert.equal(parseNumber('1.234,56'),1234.56);
  assert.equal(parseNumber('12,5'),12.5);
  assert.equal(parseNumber('1,234'),1234);
  assert.equal(parseNumber('₪ 89.90'),89.9);
  assert.equal(parseNumber('120.00-'),-120);
  assert.equal(parseNumber('(45)'),-45);
  assert.equal(parseNumber('−3.5%'),-3.5);
  assert.equal(parseNumber('abc'),null);
  assert.equal(parseNumber(''),null);
});

test('pasted tables are split by tabs, CSV, semicolons or aligned spaces',()=>{
  assert.deepEqual(textToRows('a\tb\n1\t2'),[['a','b'],['1','2']]);
  assert.deepEqual(textToRows('name,value\n"VOO, ETF","1,234.5"\nQQQ,10'),[['name','value'],['VOO, ETF','1,234.5'],['QQQ','10']]);
  assert.deepEqual(textToRows('a;b\n1,5;2'),[['a','b'],['1,5','2']]);
  assert.deepEqual(textToRows('VOO    60    528.00\nQQQ    40    483.00'),[['VOO','60','528.00'],['QQQ','40','483.00']]);
  assert.deepEqual(textToRows('Bitcoin    0.055    91,200\nVOO    60    530.5    31,830'),[['Bitcoin','0.055','91,200'],['VOO','60','530.5','31,830']]);
  assert.deepEqual(textToRows('Bitcoin 0.055 91,200'),[['Bitcoin','0.055','91,200']]);
});

test('sectors are inferred from tickers, names and types',()=>{
  assert.equal(assetSector({ticker:'VOO',name:'x'}),'מניות ארה״ב');
  assert.equal(assetSector({ticker:'',name:'קרן מחקה ת"א 125'}),'מניות ישראל');
  assert.equal(assetSector({name:'Bitcoin',type:'קריפטו'}),'קריפטו');
  assert.equal(assetSector({name:'קרן השתלמות מסלול כללי',type:'קרן השתלמות'}),'חיסכון ארוך טווח');
  assert.equal(assetSector({name:'אג"ח ממשלתי שקלי'}),'אג״ח');
  assert.equal(assetSector({name:'כלשהו',sector:'נדל״ן'}),'נדל״ן');
});

test('risk profile measures concentration, currency and sectors',()=>{
  const d=demoData(),r=riskProfile(d);
  near(r.invested,257800-6886.25);
  near(r.total,257800);
  assert.equal(r.largest.name,'VOO');
  near(r.largest.share,31680*3.65/257800);
  assert.ok(r.effective>2&&r.effective<4);
  near(r.usdShare,(31680+19320+4675)*3.65/257800);
  assert.equal(r.bySector[0].name,'מניות ארה״ב');
  near(r.bySector.reduce((s,x)=>s+x.share,0),1);
});

test('stress tests apply sector sensitivity and currency moves',()=>{
  const d=demoData(),r=riskProfile(d);
  const shekel=stressTest(d,STRESS_SCENARIOS.find(s=>s.id==='shekel'));
  near(shekel.change,-r.usd*.1);
  const crypto=stressTest(d,STRESS_SCENARIOS.find(s=>s.id==='crypto'));
  near(crypto.change,-4675*3.65*.6);
  const crash=stressTest(d,STRESS_SCENARIOS.find(s=>s.id==='crash'));
  assert.ok(crash.change<-80000&&crash.share>-.6);
  assert.ok(crash.months>0);
});

test('history risk uses flow-adjusted monthly returns',()=>{
  const h=historyRisk(demoData());
  assert.equal(h.months,9);
  assert.ok(h.annualVolatility>0&&h.maxDrawdown<=0&&h.best>=h.worst);
  const d=demoData();d.snapshots=d.snapshots.slice(0,2);
  assert.equal(historyRisk(d),null);
});

test('broker tables with Hebrew headers and agorot are parsed and matched',()=>{
  const d=demoData();
  const rows=textToRows('שם נייר\tסימול\tכמות\tשער (אג\')\tשווי (₪)\nתכלית ת"א 125\tTA125\t100\t49,850\t49,850\nVanguard S&P 500\tVOO\t60\t541.20\t118,522\nסה"כ\t\t\t\t168,372');
  const parsed=parseHoldingsRows(rows);
  assert.equal(parsed.length,2);
  assert.equal(parsed[0].price,49850);assert.equal(parsed[0].agorot,true);
  const m=matchHoldings(d,parsed);
  assert.equal(m.matches.length,2);
  const ta=m.matches.find(x=>x.asset.id==='ta');
  assert.equal(ta.next,498.5);near(ta.change,498.5/477-1);assert.deepEqual(ta.flags,['agorot']);
  assert.equal(m.matches.find(x=>x.asset.id==='voo').next,541.2);
  assert.deepEqual(m.missing.map(a=>a.id),['qqq','btc']);
});

test('English CSV exports, quantity changes and unknown rows',()=>{
  const d=demoData();
  const parsed=parseHoldingsRows(textToRows('Symbol,Description,Quantity,Last Price,Market Value,Unrealized P&L\nQQQ,Invesco QQQ Trust,45,"490.10","22,054.50",1200\nARKK,ARK Innovation,10,50,500,-20'));
  const m=matchHoldings(d,parsed);
  assert.equal(m.matches.length,1);
  assert.deepEqual(m.matches[0].flags,['quantity']);
  assert.equal(m.matches[0].reportQuantity,45);
  assert.equal(m.unmatched[0].symbol,'ARKK');
});

test('rows without headers are matched by name and known quantity',()=>{
  const d=demoData();
  const m=matchHoldings(d,parseHoldingsRows(textToRows('Bitcoin    0.055    91,200\nVOO    60    530.5    31,830')));
  assert.equal(m.matches.find(x=>x.asset.id==='btc').next,91200);
  assert.equal(m.matches.find(x=>x.asset.id==='voo').next,530.5);
});

function zip(files){
  const parts=[],central=[];let offset=0;
  for(const [name,content,deflate] of files){
    const raw=Buffer.from(content),data=deflate?zlib.deflateRawSync(raw):raw,nameBytes=Buffer.from(name);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(deflate?8:0,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(nameBytes.length,26);
    const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(deflate?8:0,10);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(raw.length,24);dir.writeUInt16LE(nameBytes.length,28);dir.writeUInt32LE(offset,42);
    parts.push(local,nameBytes,data);central.push(dir,nameBytes);offset+=30+nameBytes.length+data.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...parts,cd,end]);
}

test('xlsx files are read with shared strings, inline strings and dates',async()=>{
  const shared='<sst><si><t>תאריך עסקה</t></si><si><t>שם בית העסק</t></si><si><r><t>סכום </t></r><r><t>חיוב</t></r></si><si><t>שופרסל &amp; שות\'</t></si></sst>';
  const sheet='<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2"><v>46296</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>84.9</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>05/10/2026</t></is></c><c r="C3"><v>12</v></c></row></sheetData></worksheet>';
  const file=zip([['xl/sharedStrings.xml',shared,true],['xl/worksheets/sheet1.xml',sheet,true],['[Content_Types].xml','<Types/>',false]]);
  const rows=await readXlsx(file);
  assert.deepEqual(rows[0],['תאריך עסקה','שם בית העסק','סכום חיוב']);
  assert.deepEqual(rows[1],[46296,"שופרסל & שות'",84.9]);
  assert.deepEqual(rows[2],['05/10/2026','',12]);
  assert.equal(excelDate(46296),'2026-10-01');
  await assert.rejects(readXlsx(Buffer.from('not a zip at all, sorry')));
});

// ---------- 4.1 investment containers ----------
test('containerSummary: one entry per investment account, values add up to the portfolio, profit in ₪',async()=>{
  const {containerSummary}=await import('./invest.js');const {portfolioValue}=await import('./finance.js');
  const d=demoData();
  const one=containerSummary(d);
  assert.equal(one.length,1);assert.equal(one[0].id,'broker');assert.equal(one[0].holdings.length,4);
  near(one[0].value,portfolioValue(d));assert.ok(one[0].holdsCash);near(one[0].share,1);
  d.accounts.push({id:'gemel',name:'אלטשולר שחם',institution:'אלטשולר שחם',kind:'investment',invType:'gemel',currency:'ILS',balance:0,original:0,payment:0,interest:0});
  d.assets.push({id:'track',name:'מסלול כללי',ticker:'',type:'קופת גמל להשקעה',currency:'ILS',quantity:0,averagePrice:0,invested:30000,currentPrice:0,currentValue:33000,mode:'value',date:'2026-09-30',notes:'',accountId:'gemel'});
  const two=containerSummary(d);
  assert.deepEqual(two.map(c=>[c.id,c.type,c.holdings.length]),[['broker','broker',4],['gemel','gemel',1]]);
  near(two.reduce((s,c)=>s+c.value,0),portfolioValue(d));
  assert.equal(two[1].profit,3000);near(two[1].return,.1);assert.equal(two[1].cash,0);
  const voo=two[0].holdings.find(h=>h.asset.id==='voo');near(voo.profit,(31680-27300)*d.fx);
  const none=containerSummary({...demoData(),accounts:demoData().accounts.filter(a=>a.kind!=='investment')});
  assert.equal(none.length,1);assert.ok(none[0].virtual);assert.equal(none[0].name,'התיק שלי');
});
test('risk profile and holdings import know the containers',()=>{
  const d=demoData();
  d.accounts.push({id:'gemel',name:'גמל',institution:'',kind:'investment',invType:'gemel',currency:'ILS',balance:0,original:0,payment:0,interest:0});
  d.assets.find(a=>a.id==='ta').accountId='gemel';
  const r=riskProfile(d);
  assert.deepEqual(r.byContainer.map(x=>x.name).sort(),['גמל','תיק השקעות'].sort());
  near(r.byContainer.reduce((s,x)=>s+x.share,0),1);
  const rows=[{symbol:'TA125',name:'תכלית',price:480},{symbol:'VOO',name:'Vanguard',price:530}];
  const scoped=matchHoldings(d,rows,{accountId:'gemel'});
  assert.deepEqual(scoped.matches.map(m=>m.asset.id),['ta']);assert.equal(scoped.unmatched.length,1);assert.deepEqual(scoped.missing,[]);
  assert.equal(matchHoldings(d,rows).matches.length,2,'without a scope every holding can match');
});
