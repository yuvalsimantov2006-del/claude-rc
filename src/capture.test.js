import test from 'node:test';
import assert from 'node:assert/strict';
import {demoData} from './data.js';
import {parseDate,parseStatementRows,captureCategory,markDuplicates,prepareCapture} from './capture.js';
import {textToRows} from './xlsx.js';

const NOW='2026-10-11';

test('dates in Israeli, ISO and Excel formats',()=>{
  assert.equal(parseDate('05/10/2026'),'2026-10-05');
  assert.equal(parseDate('5.10.26'),'2026-10-05');
  assert.equal(parseDate('2026-10-05'),'2026-10-05');
  assert.equal(parseDate(46300),'2026-10-05');
  assert.equal(parseDate('31/02/2026'),null);
  assert.equal(parseDate('לא תאריך'),null);
});

test('card statement (Max style) with charge amounts and categories',()=>{
  const rows=[['כרטיס 1234 - פירוט עסקאות'],[],['תאריך עסקה','שם בית העסק','קטגוריה','4 ספרות אחרונות של כרטיס האשראי','סוג עסקה','סכום חיוב','מטבע חיוב','סכום עסקה מקורי','מטבע עסקה מקורי','תאריך חיוב','הערות'],
    ['01-10-2026','שופרסל דיל רמת גן','מזון ומשקאות','1234','רגילה','245.90','₪','245.90','₪','10-11-2026',''],
    ['03-10-2026','ארומה תל אביב','מסעדות, קפה וברים','1234','רגילה','38','₪','38','₪','10-11-2026',''],
    ['04-10-2026','NETFLIX.COM','פנאי, בידור וספורט','1234','רגילה','54.90','₪','14.99','$','10-11-2026','חיוב בדולר'],
    ['05-10-2026','זיכוי - שופרסל','מזון ומשקאות','1234','זיכוי','-30','₪','-30','₪','10-11-2026',''],
    ['','סה"כ','','','','308.80','','','','','']];
  const r=parseStatementRows(rows,NOW);
  assert.equal(r.kind,'card');
  assert.equal(r.items.length,4);
  assert.deepEqual(r.items.map(x=>x.type),['expense','expense','expense','income']);
  assert.equal(r.items[2].amount,54.9,'the charge in shekels is used, not the original dollar amount');
  assert.equal(r.items[0].date,'2026-10-01');
  assert.equal(r.items[1].issuerCategory,'מסעדות, קפה וברים');
  assert.equal(r.items[3].refund,true);
  assert.equal(captureCategory(demoData(),r.items[3]),'קניות בסופר','a refund takes the expense category of the merchant');
});

test('bank statement with debit and credit columns',()=>{
  const r=parseStatementRows(textToRows('תאריך,הפעולה,פרטים,חובה,זכות,יתרה\n02/10/2026,העברה,משכורת חודשית,,18500.00,40000\n03/10/2026,הוראת קבע,שכר דירה,4500.00,,35500\n05/10/2026,כרטיס אשראי,ישראכרט,"2,310.45",,33189.55'),NOW);
  assert.equal(r.kind,'bank');
  assert.deepEqual(r.items.map(x=>[x.type,x.amount]),[['income',18500],['expense',4500],['expense',2310.45]]);
  assert.deepEqual(r.items.map(x=>x.description),['משכורת חודשית','שכר דירה','ישראכרט']);
});

test('signed bank exports treat negative amounts as expenses',()=>{
  const r=parseStatementRows(textToRows('Date,Description,Amount\n2026-10-02,Coffee,-12.50\n2026-10-03,Groceries,-210\n2026-10-04,Refund,40'),NOW);
  assert.deepEqual(r.items.map(x=>x.type),['expense','expense','income']);
});

test('future dates and rows without amounts are skipped with a reason',()=>{
  const r=parseStatementRows(textToRows('תאריך,תיאור,סכום\n05/10/2026,קפה,12\n20/12/2026,טיסה,900\n06/10/2026,ריק,'),NOW);
  assert.equal(r.items.length,1);
  assert.deepEqual(r.skipped.map(x=>x.reason),['תאריך עתידי','סכום חסר']);
  assert.throws(()=>parseStatementRows([['שם','מחיר'],['a','1']],NOW));
});

test('categories come from history, then the card category, then keywords',()=>{
  const d=demoData();
  assert.equal(captureCategory(d,{type:'expense',description:'ארוחת צהריים',issuerCategory:'שונות'}),'מסעדות','exact merchant history wins');
  assert.equal(captureCategory(d,{type:'expense',description:'ABC LTD',issuerCategory:'מזון ומשקאות'}),'קניות בסופר');
  assert.equal(captureCategory(d,{type:'expense',description:'פז אילת',issuerCategory:''}),'דלק');
});

test('duplicates against recorded transactions and inside the file',()=>{
  const d=demoData();
  const existing=d.transactions.find(t=>t.description==='קפה עם חברים'&&t.date.startsWith('2026-09'));
  const items=markDuplicates(d,[{type:'expense',date:existing.date,amount:existing.amount,description:'קפה עם חברים - תל אביב'},{type:'expense',date:existing.date,amount:existing.amount,description:'משהו אחר לגמרי'},{type:'expense',date:'2026-10-05',amount:19,description:'קפה'},{type:'expense',date:'2026-10-05',amount:19,description:'קפה'}]);
  assert.deepEqual(items.map(x=>x.status),['duplicate','possible','new','repeat']);
  const prepared=prepareCapture(d,items);
  assert.equal(prepared[0].include,false);assert.equal(prepared[1].include,true);
  assert.ok(prepared.every(x=>d.categories.includes(x.category)));
});
