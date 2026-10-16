import {today,validDate,toILS} from './finance.js';
import {suggestCategory,shiftDate} from './smart.js';
import {parseNumber,excelDate} from './xlsx.js';

// Smart capture: reading card and bank statements (Max, Isracard, Cal, bank exports, generic CSV),
// suggesting categories and flagging duplicates before anything is saved.

const COLUMNS={
  chargeDate:/תאריך חיוב|מועד חיוב|billing date|charge date/i,
  date:/תאריך עסקה|תאריך רכישה|תאריך העסקה|תאריך ביצוע|^תאריך$|תאריך ערך|transaction date|^date$|posted/i,
  description:/שם בית ה?עסק|בית ה?עסק|תיאור|פרטים|description|merchant|payee|details|narrative/i,
  action:/^הפעולה$|^פעולה$|סוג פעולה|^אסמכתא$/i,
  originalAmount:/סכום (ה)?עסקה|סכום מקורי|original amount/i,
  amount:/סכום חיוב|סכום החיוב|חיוב בש["״]ח|סכום בש["״]ח|^סכום$|^₪ ?סכום|charged|amount/i,
  debit:/^חובה$|debit|withdrawal|^יציאה|^חיוב$/i,
  credit:/^זכות$|credit|deposit|^כניסה|^זיכוי$/i,
  currency:/מטבע חיוב|^מטבע|currency/i,
  category:/ענף|קטגוריה|category/i,
  notes:/הערות|פירוט נוסף|notes|memo/i
};
function detectColumns(row){
  const map={};
  row.forEach((cell,i)=>{
    const text=String(cell??'').replace(/[‎‏]/g,'').trim();if(!text)return;
    for(const [key,re] of Object.entries(COLUMNS))if(map[key]==null&&re.test(text)){if(key==='date'&&map.chargeDate===i)continue;map[key]=i;break;}
  });
  return map;
}

// "05/10/2026", "5.10.26", "2026-10-05", Excel serial numbers. Day comes first (Israeli format).
export function parseDate(value){
  if(typeof value==='number'&&value>20000&&value<80000)return excelDate(value);
  const s=String(value??'').trim();
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m){const iso=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;return validDate(iso)?iso:null;}
  m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if(m){let year=Number(m[3]);if(year<100)year+=2000;const iso=`${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return validDate(iso)?iso:null;}
  return null;
}

// Rows (from xlsx or text) → {items, skipped, columns, kind}.
export function parseStatementRows(rows,now=today()){
  const clean=rows.map(r=>r.map(c=>typeof c==='string'?c.replace(/[‎‏]/g,'').trim():c));
  let start=-1,map={};
  for(let i=0;i<Math.min(clean.length,30);i++){const m=detectColumns(clean[i]);if((m.date!=null||m.chargeDate!=null)&&(m.amount!=null||m.debit!=null||m.credit!=null||m.originalAmount!=null)){start=i;map=m;break;}}
  if(start<0)throw new Error('לא זיהינו בקובץ עמודות של תאריך וסכום. ודא שזה פירוט עסקאות מהבנק או מחברת האשראי.');
  if(map.date==null)map.date=map.chargeDate;
  if(map.amount==null&&map.debit==null&&map.credit==null)map.amount=map.originalAmount;
  const items=[],skipped=[],signed=[];
  for(const row of clean.slice(start+1)){
    const description=String(row[map.description??-1]||row[map.action??-1]||'').replace(/\s+/g,' ').trim(),date=parseDate(row[map.date]);
    if(/סה"כ|סה״כ|total|יתרה|^סך /i.test(description)||!row.some(c=>c!==''&&c!=null)){continue;}
    let amount=null,sign=0;
    if(map.debit!=null||map.credit!=null){const debit=parseNumber(row[map.debit??-1]),credit=parseNumber(row[map.credit??-1]);if(debit){amount=Math.abs(debit);sign=-1;}else if(credit){amount=Math.abs(credit);sign=1;}}
    else{const value=parseNumber(row[map.amount]);if(value!=null&&value!==0){amount=Math.abs(value);sign=Math.sign(value);signed.push(sign);}}
    if(!date||!amount){if(description||amount)skipped.push({description,reason:!date?'תאריך חסר':'סכום חסר'});continue;}
    if(date>shiftDate(now,1)){skipped.push({description,reason:'תאריך עתידי'});continue;}
    items.push({date,description:description||'ללא תיאור',amount:Math.round(amount*100)/100,sign,currency:String(row[map.currency??-1]??'').trim(),issuerCategory:String(row[map.category??-1]??'').trim(),notes:String(row[map.notes??-1]??'').trim()});
  }
  // Card statements list charges as positive numbers; bank statements show expenses as negative ones.
  const debitColumns=map.debit!=null||map.credit!=null,mostlyPositive=signed.filter(s=>s>0).length>=signed.filter(s=>s<0).length;
  const kind=debitColumns?'bank':mostlyPositive?'card':'bank';
  // Money back on a card statement, or a bank credit that says זיכוי/החזר (not החזר מס), is a refund (§C.5). The parsed
  // rows keep the 4.0 shape (type 'income' + refund:true); prepareCapture turns them into type 'refund'.
  for(const item of items){item.type=debitColumns?(item.sign<0?'expense':'income'):(mostlyPositive?(item.sign>0?'expense':'income'):(item.sign<0?'expense':'income'));if(item.type==='income'&&(kind==='card'||CAPTURE_REFUND_RE.test(`${item.description} ${item.notes||''}`)))item.refund=true;delete item.sign;
    // A bank line that pays a credit card (§C.3): money out whose text names a card company. prepareCapture turns it
    // into a transfer to the matching card account, so the card's purchases are never counted twice.
    if(kind==='bank'&&item.type==='expense'&&CARD_PAYMENT_RE.test(`${item.description} ${item.notes||''}`)){item.cardPayment=true;const digits=String(item.description).match(/\b(\d{4})\b/);if(digits)item.last4=digits[1];}}
  return {items,skipped,columns:map,kind};
}

// Issuer and card names must stand as words (one Hebrew prefix letter allowed, as in "למקס"), so "מקסים" or
// "maximum" never turn a real expense into a card payment.
const capWord=word=>new RegExp(`(?<!\\p{L}\\p{L})(?:${word})(?!\\p{L})`,'iu');
const capEscape=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// A bank line that pays a credit card (§C.3): the spec's word list, matched as whole words.
export const CARD_PAYMENT_RE=capWord('ישראכרט|isracard|מקס|max it|לאומי קארד|כאל|cal|ויזה|visa|מסטרקארד|mastercard|אמריקן אקספרס|amex|דיינרס|diners|כרטיס(?:י)? אשראי');
const CARD_ISSUER_WORDS={'מקס':capWord('מקס|max'),'ישראכרט':capWord('ישראכרט|isracard'),'כאל':capWord('כאל|cal'),'אמריקן אקספרס':capWord('אמריקן|amex|american express'),'דיינרס':capWord('דיינרס|diners'),'לאומי קארד':capWord('לאומי קארד|leumi card')};
// The credit account a bank line pays: by the last 4 digits, then by the issuer or the card's name in the text.
export function matchCard(d,item){
  const cards=d.accounts.filter(a=>a.kind==='credit'),text=`${item.description||''} ${item.notes||''}`;
  const byDigits=item.last4&&cards.find(a=>a.last4&&a.last4===item.last4);if(byDigits)return byDigits.id;
  const byIssuer=cards.find(a=>a.institution&&a.institution!=='אחר'&&(CARD_ISSUER_WORDS[a.institution]||capWord(capEscape(a.institution.trim()))).test(text));if(byIssuer)return byIssuer.id;
  const byName=cards.find(a=>a.name&&a.name.trim().length>1&&capWord(capEscape(a.name.trim())).test(text));
  return byName?.id||'';
}
const CAPTURE_REFUND_RE=/זיכוי|החזר(?! מס)|ביטול עסקה|refund/i;
const ISSUER_CATEGORIES=[[/מסעד|קפה|ברים|מזון מהיר|food|restaurant|cafe/i,'מסעדות'],[/סופר|מזון ומשקאות|מכולת|grocer|supermarket/i,'קניות בסופר'],[/דלק|תחנות|fuel|gas station/i,'דלק'],[/רכב|תחבורה|חניה|מוסך|car|parking|transport/i,'רכב'],[/תקשורת|סלולר|אינטרנט|חשמל|מים|גז|עירי|ארנונה|ביטוח|utilities|insurance|telecom/i,'חשבונות'],[/רפוא|בריאות|מרקחת|פארם|health|pharm|medical/i,'בריאות'],[/ספורט|כושר|gym|fitness/i,'כושר'],[/פנאי|בידור|תרבות|קולנוע|entertainment|leisure/i,'בילויים'],[/אופנה|הלבשה|ביגוד|הנעלה|קניות|fashion|clothing|shopping|אלקטרוניקה|מחשבים|עיצוב הבית|ריהוט|home/i,'קניות'],[/תיירות|טיסות|מלונות|travel|airline|hotel/i,'נסיעות'],[/חינוך|לימוד|ספרים|education/i,'לימודים'],[/תרומ|donat|charity/i,'תרומות'],[/מתנ|gift/i,'מתנות']];
const normalize=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\b\d+\b/g,' ').replace(/\s+/g,' ').trim();

// Exact history first (what you chose before for this merchant), then the card company's category,
// then keywords and partial history.
export function captureCategory(d,item){
  // A refund on a card offsets an expense, so it takes an expense category.
  if(item.type==='refund'||(item.type==='income'&&(item.refund||/החזר|זיכוי|refund|ביטול עסקה/i.test(`${item.description} ${item.notes||''}`))))return captureCategory(d,{...item,type:'expense',refund:false});
  const key=normalize(item.description),counts=new Map();
  if(key)for(const t of d.transactions)if(t.type===item.type&&normalize(t.description)===key)counts.set(t.category,(counts.get(t.category)||0)+1);
  const best=[...counts].sort((a,b)=>b[1]-a[1])[0];
  if(best)return best[0];
  for(const [re,category] of ISSUER_CATEGORIES)if(re.test(item.issuerCategory||'')&&d.categories.includes(category))return category;
  return suggestCategory(d,item.description,item.type)||(item.type==='income'?(d.categories.includes('משכורת')?'משכורת':d.categories[0]):d.categories.includes('קניות')?'קניות':d.categories[0]);
}

const daysApart=(a,b)=>Math.abs(new Date(a+'T12:00:00Z')-new Date(b+'T12:00:00Z'))/86400000;
const similar=(a,b)=>{const x=normalize(a),y=normalize(b);if(!x||!y)return false;if(x.includes(y)||y.includes(x))return true;const words=x.split(' ').filter(w=>w.length>2);return words.some(w=>y.split(' ').includes(w));};
// Flags each item: 'duplicate' (already recorded), 'possible' (same amount around the same date) or 'new'.
export function markDuplicates(d,items){
  const seen=[],updating=new Set();
  return items.map(item=>{
    // A card payment: the transfer into that card within 7 days. The same amount is the same charge; a different one is
    // the estimated automatic statement, which saving updates to the bank's amount (§C.3, Errata 8).
    if(item.type==='transfer'&&item.toAccountId){
      const near=d.transactions.filter(t=>t.type==='transfer'&&t.toAccountId===item.toAccountId&&daysApart(t.date,item.date)<=7).map(t=>({t,gap:Math.abs(toILS(t.amount,t.currency||'ILS',t.fx||d.fx)-item.amount)})).sort((a,b)=>a.gap-b.gap||daysApart(a.t.date,item.date)-daysApart(b.t.date,item.date));
      const same=near.find(x=>x.gap<.01),estimate=!same&&near.find(x=>x.t.auto?.source==='card'&&!updating.has(x.t.id)),matched=same?.t||estimate?.t||near[0]?.t||null;
      if(estimate)updating.add(estimate.t.id);
      const {update:_old,...rest}=item;
      return {...rest,status:same?'duplicate':near.length?'possible':'new',matchedId:matched?.id||null,matchedLabel:matched?`${matched.description||'חיוב כרטיס'} · ${matched.date}`:'',...(estimate?{update:estimate.t.id,updateFrom:toILS(estimate.t.amount,estimate.t.currency||'ILS',estimate.t.fx||d.fx)}:{})};
    }
    const candidates=d.transactions.filter(t=>(t.type===item.type||(item.type==='refund'&&t.type==='income'))&&Math.abs(toILS(t.amount,t.currency||'ILS',t.fx||d.fx)-item.amount)<.01&&daysApart(t.date,item.date)<=3);
    const match=candidates.find(t=>similar(t.description,item.description)||similar(t.category,item.description));
    let status=match?'duplicate':candidates.length?'possible':'new',matched=match||candidates[0]||null;
    if(status==='new'&&seen.some(x=>x.date===item.date&&x.amount===item.amount&&normalize(x.description)===normalize(item.description)))status='repeat';
    seen.push(item);
    return {...item,status,matchedId:matched?.id||null,matchedLabel:matched?`${matched.description||matched.category} · ${matched.date}`:''};
  });
}

// Items → review rows. `accountId` is the target account: on a bank account, a card-payment line becomes a transfer to
// the matching card (or keeps its expense type with a hint to add the card); on a card, rows stay expenses and refunds.
export function prepareCapture(d,items,{accountId}={}){
  const target=d.accounts.find(a=>a.id===accountId);
  items=items.map(item=>{
    item=item.type==='income'&&item.refund?{...item,type:'refund'}:{...item};
    if(item.cardPayment){
      delete item.cardHint;
      if(target?.kind==='bank'){const card=matchCard(d,item);if(card)Object.assign(item,{type:'transfer',toAccountId:card,category:'העברה'});else item.cardHint=true;}
      if(target?.kind!=='bank'&&item.type==='transfer'){item.type='expense';delete item.toAccountId;delete item.category;}
    }
    return item;
  });
  return markDuplicates(d,items).map((item,i)=>({...item,key:`c${i}`,category:item.type==='transfer'?'העברה':item.category&&d.categories.includes(item.category)?item.category:captureCategory(d,item),include:item.status!=='duplicate'}));
}
