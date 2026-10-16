import {uid,today,money,dateLabel,applyTransaction,validDate,toILS,TX_KINDS} from './finance.js';
import {parseStatementRows,prepareCapture,captureCategory} from './capture.js';
import {makeTransfer,transferProblem} from './ledger.js';
import {readXlsx,isXlsx,textToRows} from './xlsx.js';
import {aiReady,aiSettings,runAgent,AI_TOOLS,financialContext,attachmentBlock} from './ai.js';

// Smart expense capture page: statements (Excel/CSV/pasted text) parsed on the device, receipts and
// PDFs read by Claude. Every row is reviewed and editable before it is saved.

const captureStatus={duplicate:['כבר קיימת','neutral'],possible:['ייתכן כפילות','gold'],repeat:['חוזרת בקובץ','gold'],new:['חדשה','green']};
// The card company a bank line names, to prefill "הוספת כרטיס".
const CAPTURE_ISSUERS=[['ישראכרט',/ישראכרט|isracard/i],['מקס',/מקס|max/i],['כאל',/כאל|\bcal\b/i],['אמריקן אקספרס',/אמריקן|amex/i],['דיינרס',/דיינרס|diners/i],['לאומי קארד',/לאומי קארד/i]];
const captureKinds={card:'פירוט כרטיס אשראי',bank:'דף חשבון בנק',receipt:'קבלה או מסמך'};
function captureState(){
  if(!ui.capture)ui.capture={items:[],source:'',kind:'',skipped:[],accountId:data.accounts.find(a=>a.kind==='bank')?.id||data.accounts.find(a=>TX_KINDS.includes(a.kind))?.id||'',busy:false,error:null,hideDuplicates:false,abort:null};
  return ui.capture;
}
// Review rows from the parsed items for the chosen target account (§C.3): on a bank account a card-payment line becomes a
// transfer to its card. `raw` keeps the parsed items so a new target account (or a card added meanwhile) re-reads them.
const captureCards=()=>data.accounts.filter(a=>a.kind==='credit').map(a=>a.id).join(',');
function prepareCaptureRows(st,previous=[]){
  st.cards=captureCards();
  return prepareCapture(data,st.raw||[],{accountId:st.accountId}).map((x,i)=>{
    const old=previous[i];if(!old)return {...x,touched:false};
    // Keep what the user already edited; the type, card and duplicate status follow the new target.
    const kept={date:old.date,description:old.description,amount:old.amount,include:old.include,touched:old.touched};
    if(old.touched&&x.type!=='transfer'&&old.type!=='transfer')kept.category=old.category;
    return {...x,...kept};
  });
}
function loadCaptureItems(items,source,kind,skipped=[]){
  const st=captureState();
  st.raw=items;
  Object.assign(st,{items:prepareCaptureRows(st),source,kind,skipped,busy:false,error:null});
  if(!st.items.length)st.error='לא נמצאו תנועות לקליטה בקובץ.';
  render();
}
async function decodeText(bytes){
  const utf8=new TextDecoder('utf-8').decode(bytes);
  if(!utf8.includes('�'))return utf8;
  try{return new TextDecoder('windows-1255').decode(bytes);}catch{return utf8;}
}
async function handleCaptureFile(file){
  const st=captureState();st.error=null;
  try{
    const name=file.name||'קובץ',type=file.type||'';
    if(type.startsWith('image/')||type==='application/pdf'||/\.(pdf|png|jpe?g|webp|heic|gif)$/i.test(name)){
      if(!aiReady())throw Error('כדי לקרוא צילום קבלה או PDF צריך לחבר את Claude במסך אופק AI. קובצי Excel ו־CSV נקראים גם בלי חיבור.');
      return await captureWithClaude(file);
    }
    if(file.size>5*1024*1024)throw Error('הקובץ גדול מדי (עד 5MB).');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const rows=isXlsx(bytes)?await readXlsx(bytes):textToRows(await decodeText(bytes));
    const parsed=parseStatementRows(rows);
    loadCaptureItems(parsed.items,name,parsed.kind,parsed.skipped);
  }catch(err){st.busy=false;st.error=err.message;render();}
}
async function captureWithClaude(file){
  const st=captureState(),attachment=await readAttachment(file);
  Object.assign(st,{busy:true,error:null,abort:new AbortController()});render();
  let captured=null;
  try{
    await runAgent({settings:aiSettings(),signal:st.abort.signal,tools:AI_TOOLS.filter(t=>t.name==='propose_transactions'),
      messages:[{role:'user',content:[{type:'text',text:financialContext(data,ui.month)},attachmentBlock(attachment),{type:'text',text:'חלץ את כל התנועות מהמסמך המצורף (קבלה, חשבונית או דף פירוט) וקרא ל־propose_transactions פעם אחת עם כולן, עם קטגוריה מתוך הקטגוריות שלי. אל תכתוב הסבר.'}]}],
      ctx:{get data(){return data;},month:ui.month,approve:async req=>{captured=req.items;return {approved:true,saved:req.items.length,note:'moved to the review screen'};}}});
    if(!captured?.length)throw Error('Claude לא מצא תנועות במסמך. נסה צילום חד יותר או קובץ אחר.');
    loadCaptureItems(captured.map(x=>({date:x.date,description:x.description,amount:x.amount,type:x.type,category:x.category,issuerCategory:''})),file.name||'מסמך','receipt');
  }catch(err){Object.assign(st,{busy:false,error:err?.name==='AbortError'?'הקריאה נעצרה.':err.message});render();}
  finally{st.abort=null;}
}
function captureIntro(st){
  return card(`<div class="capture-drop" data-capture-drop><span class="capture-orb">${icon('ScanLine',30)}</span><h2>גרור לכאן פירוט עסקאות או צילום קבלה</h2><p>Max, ישראכרט, כאל, אמריקן אקספרס ודפי חשבון מהבנק — בקובץ Excel או CSV. פירוט מחברת האשראי? בחר את הכרטיס כחשבון היעד. הקבצים נקראים במכשיר שלך. צילומי קבלות ו־PDF נקראים על ידי Claude${aiReady()?'':' (דורש חיבור)'}.</p><div class="actions"><label class="button primary">${icon('Upload',17)}<span>בחירת קובץ</span><input type="file" id="capture-file" class="visually-hidden" accept=".csv,.tsv,.txt,.xlsx,image/*,application/pdf,.pdf"></label>${btn('הדבקת טקסט','capture-paste','Edit3')}</div>${ui.capturePaste?`<div class="capture-paste">${field('טקסט מהאתר של הבנק או של חברת האשראי',`<textarea id="capture-text" rows="7" dir="auto" placeholder="תאריך	תיאור	סכום"></textarea>`,'','full')}${btn('ניתוח הטקסט','capture-parse-text','Search','primary')}</div>`:''}</div>`,'capture-intro')+card(head('איך זה עובד')+`<ol class="capture-steps"><li><b>מעלים</b> קובץ פירוט או צילום.</li><li><b>אופק מציע</b> קטגוריה לכל תנועה — לפי מה שבחרת בעבר, לפי הקטגוריה של חברת האשראי ולפי מילות מפתח.</li><li><b>כפילויות מסומנות</b> אוטומטית: תנועה שכבר קיימת לא תיבחר.</li><li><b>מתקנים</b> מה שצריך ושומרים. שינוי קטגוריה חל על כל העסקאות מאותו בית עסק.</li></ol>`);
}
// The type and status cells of one review row. A card-payment line (§D.3) can be a transfer to its card, shows the
// "חיוב כרטיס" badge, and explains an update of the estimated automatic statement or a missing card account.
function captureTypeCell(x,i){
  const card=x.toAccountId?data.accounts.find(a=>a.id===x.toAccountId):null;
  const types=[['expense','הוצאה'],['income','הכנסה'],['refund','החזר'],...(x.cardPayment&&card?[['transfer','העברה ל־'+card.name]]:[])];
  return `<select data-cap="${i}.type" aria-label="סוג התנועה">${options(types,x.type)}</select>`;
}
function captureStatusParts(x){
  const card=x.toAccountId?data.accounts.find(a=>a.id===x.toAccountId):null,transfer=x.type==='transfer'&&card;
  const update=transfer&&x.status==='possible'&&x.update,[label,color]=update?['לעדכון','blue']:captureStatus[x.status]||captureStatus.new;
  const title=transfer&&x.status==='duplicate'?`חיוב ${card.name} · ${dateLabel(x.date)}`:x.matchedLabel||'';
  const notes=[update?`<small class="lg-cap-note">החיוב הרשום הוא הערכה (${amt(x.updateFrom)}). שמירה תעדכן אותו לסכום מהבנק.</small>`:'',
    x.cardHint&&x.type!=='transfer'?`<small class="lg-cap-note">נראה כמו חיוב של כרטיס אשראי. כדאי להוסיף את הכרטיס כחשבון — אז הקניות לא ייספרו פעמיים.</small>${textBtn('הוספת כרטיס','capture-add-card')}`:''].join('');
  const onBank=data.accounts.find(a=>a.id===captureState().accountId)?.kind==='bank';
  return {badges:`<div class="lg-cap-status">${x.cardPayment&&onBank?badge('חיוב כרטיס','blue'):''}<span title="${e(title)}">${badge(label,color)}</span></div>`,notes};
}
function captureReview(st){
  if(st.raw&&st.cards!==captureCards())st.items=prepareCaptureRows(st,st.items);   // a card was added or removed meanwhile
  const shown=st.items.map((x,i)=>({x,i})).filter(({x})=>!(st.hideDuplicates&&x.status==='duplicate')),chosen=st.items.filter(x=>x.include);
  const expenses=chosen.reduce((s,x)=>s+(x.type==='expense'?x.amount:x.type==='refund'?-x.amount:0),0),income=chosen.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0),transfers=chosen.filter(x=>x.type==='transfer').length,dups=st.items.filter(x=>x.status==='duplicate').length;
  const accounts=data.accounts.filter(a=>TX_KINDS.includes(a.kind));
  return card(head(`${st.items.length} תנועות מ״${st.source}״`,`${captureKinds[st.kind]||''}${dups?` · ${dups} כבר קיימות באופק ולא נבחרו`:''}${st.skipped.length?` · ${st.skipped.length} שורות דולגו`:''}`,btn('קובץ אחר','capture-reset','RotateCcw'))+`
  <div class="capture-toolbar">${field('לאיזה חשבון (כולל כרטיס אשראי)',`<select data-cap-account>${options(accounts.map(a=>[a.id,a.name]),st.accountId)}</select>`)}<div class="capture-bulk">${btn('בחירת הכול','capture-all','Check')}${btn('ניקוי הבחירה','capture-none','X')}<label class="check-field"><input type="checkbox" data-cap-hide ${st.hideDuplicates?'checked':''}>הסתרת כפילויות</label></div><div class="capture-sum"><span>נבחרו <b>${chosen.length}</b></span><span>הוצאות <b dir="ltr">${money(expenses,'ILS',2)}</b></span>${income?`<span>הכנסות <b dir="ltr" class="positive">${money(income,'ILS',2)}</b></span>`:''}${transfers?`<span>העברות <b>${transfers}</b></span>`:''}</div></div>
  <div class="table-wrap"><table class="capture-table"><thead><tr><th aria-label="בחירה"></th><th>תאריך</th><th>תיאור</th><th>קטגוריה</th><th>סוג</th><th>סכום (₪)</th><th>מצב</th></tr></thead><tbody>${shown.map(({x,i})=>`<tr class="${x.include?'':'off'}${x.cardPayment?' lg-cap-card':''}"><td class="cap-check"><label class="cap-check-hit"><input type="checkbox" data-cap="${i}.include" ${x.include?'checked':''} aria-label="לכלול את ${e(x.description)}"></label></td><td><input type="date" data-cap="${i}.date" value="${e(x.date)}" max="${today()}"></td><td><input type="text" data-cap="${i}.description" value="${e(x.description)}">${x.issuerCategory?`<small class="muted">${e(x.issuerCategory)}</small>`:''}${captureStatusParts(x).notes}</td><td>${x.type==='transfer'?`<select disabled aria-label="קטגוריה">${options([['העברה','העברה']],'העברה')}</select>`:`<select data-cap="${i}.category">${options(data.categories.includes(x.category)?data.categories:[...data.categories,x.category],x.category)}</select>`}</td><td>${captureTypeCell(x,i)}</td><td><input type="number" data-cap="${i}.amount" value="${e(x.amount)}" min="0.01" step="any" dir="ltr"></td><td>${captureStatusParts(x).badges}</td></tr>`).join('')}</tbody></table></div>
  ${st.skipped.length?`<details class="import-notes"><summary>${st.skipped.length} שורות דולגו</summary><p class="muted small">${st.skipped.slice(0,30).map(x=>`${e(x.description||'ללא תיאור')} (${e(x.reason)})`).join(' · ')}</p></details>`:''}
  <div class="form-actions capture-save">${btn(`שמירת ${chosen.length} תנועות`,'capture-save','Check','primary')}${btn('ביטול','capture-reset')}</div>`,'capture-review');
}
function captureView(){
  const st=captureState();
  if(st.busy)return card(`<div class="capture-busy"><div class="ai-typing"><span></span><span></span><span></span><small>Claude קורא את המסמך ומחלץ את התנועות…</small></div>${btn('עצירה','capture-stop','Square')}</div>`);
  return `${st.error?`<div class="ai-error">${icon('TriangleAlert',17)}<span>${e(st.error)}</span></div>`:''}${st.items.length?captureReview(st):captureIntro(st)}`;
}
function saveCapture(){
  const st=captureState(),chosen=st.items.filter(x=>x.include);
  if(!chosen.length)throw Error('לא נבחרו תנועות לשמירה.');
  if(!data.accounts.some(a=>a.id===st.accountId&&TX_KINDS.includes(a.kind)))throw Error('יש לבחור חשבון בנק, מזומן, חיסכון או כרטיס אשראי.');
  for(const x of chosen){
    if(!(Number(x.amount)>0))throw Error(`הסכום של ״${x.description}״ אינו תקין.`);
    if(!validDate(x.date)||x.date>today())throw Error(`התאריך של ״${x.description}״ אינו תקין.`);
  }
  const dates=chosen.map(x=>x.date).sort();
  mutate(next=>{
    for(const x of chosen){
      const amount=Math.round(Number(x.amount)*100)/100,description=String(x.description||'').trim().slice(0,120);
      if(x.type==='transfer'){
        // A card payment (§C.3): a row that updates the estimated automatic statement, or a new transfer to the card.
        const old=x.update?next.transactions.find(t=>t.id===x.update&&t.type==='transfer'&&t.accountId===st.accountId&&t.toAccountId===x.toAccountId):null;
        if(old){
          const row=structuredClone(old),to=next.accounts.find(a=>a.id===row.toAccountId);
          row.amount=amount;row.date=x.date;row.toAmount=to&&to.currency===row.currency?amount:Math.round(toILS(amount,row.currency,row.fx||next.fx)/(to?.currency==='USD'?(row.fx||next.fx):1)*100)/100;
          if(row.auto)row.auto={...row.auto,confirm:false};
          const problem=transferProblem(next,{...row,editing:old});if(problem)throw Error(`${x.description}: ${problem}`);
          applyTransaction(next,old,-1);applyTransaction(next,row);next.transactions[next.transactions.indexOf(old)]=row;
          continue;
        }
        const t=makeTransfer(next,{fromId:st.accountId,toId:x.toAccountId,amount,date:x.date,description:description||undefined});t.tags=['ייבוא'];
        const problem=transferProblem(next,t);if(problem)throw Error(`${x.description}: ${problem}`);
        applyTransaction(next,t);next.transactions.push(t);continue;
      }
      const category=String(x.category||'').trim()||'קניות';
      if(!next.categories.includes(category))next.categories.push(category);
      const t={id:uid(),type:['income','refund'].includes(x.type)?x.type:'expense',amount,currency:'ILS',fx:next.fx,date:x.date,category,subcategory:'',accountId:st.accountId,description,tags:['ייבוא'],recurring:false};
      applyTransaction(next,t);next.transactions.push(t);
    }
  },`נקלטו ${chosen.length} תנועות`,{undo:true});
  ui.capture=null;
  Object.assign(ui.filters,{query:'',category:'',type:'',account:'',day:'',min:'',max:'',from:dates[0],to:dates.at(-1)});
  navigate('transactions');
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action,st=ui.capture;
  try{
    if(action==='capture-paste'){ui.capturePaste=!ui.capturePaste;render();setTimeout(()=>document.querySelector('#capture-text')?.focus());}
    else if(action==='capture-parse-text'){const text=document.querySelector('#capture-text')?.value||'';if(!text.trim())throw Error('הדבק קודם את הטקסט.');const parsed=parseStatementRows(textToRows(text));loadCaptureItems(parsed.items,'טקסט שהודבק',parsed.kind,parsed.skipped);}
    else if(action==='capture-reset'){ui.capture=null;render();}
    else if(action==='capture-stop')st?.abort?.abort();
    else if(action==='capture-all'){st.items.forEach(x=>x.include=true);render();}
    else if(action==='capture-none'){st.items.forEach(x=>x.include=false);render();}
    else if(action==='capture-save')saveCapture();
    else if(action==='capture-add-card'){const hint=st?.items.find(x=>x.cardHint&&x.type!=='transfer');openEntity('account',null,{kind:'credit',institution:CAPTURE_ISSUERS.find(([,re])=>re.test(hint?.description||''))?.[0]||'מקס'});}
  }catch(err){toast(err.message,true);}
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='capture-file'){const file=el.files[0];el.value='';if(file)handleCaptureFile(file);return;}
  if(el.dataset.capAccount!=null){const st=captureState();st.accountId=el.value;if(st.raw)st.items=prepareCaptureRows(st,st.items);render();return;}
  if(el.dataset.capHide!=null){captureState().hideDuplicates=el.checked;render();return;}
  if(!el.dataset.cap)return;
  const st=captureState(),[i,key]=el.dataset.cap.split('.'),item=st.items[+i];if(!item)return;
  if(key==='include'){item.include=el.checked;render();return;}
  if(key==='category'){
    item.category=el.value;item.touched=true;
    const same=st.items.filter(x=>x!==item&&!x.touched&&x.description.trim()===item.description.trim()&&x.category!==el.value);
    same.forEach(x=>x.category=el.value);
    if(same.length)toast(`הקטגוריה עודכנה גם ל־${same.length} עסקאות נוספות של ״${item.description}״`);
    render();return;
  }
  if(key==='type'){
    const was=item.type;item.type=el.value;
    if(el.value==='transfer')item.category='העברה';
    else if(was==='transfer'||(item.type==='refund')!==(was==='refund')&&!item.touched)item.category=captureCategory(data,{...item,category:''});
    render();return;
  }
});
document.addEventListener('input',event=>{
  const el=event.target;if(!el.dataset.cap||el.type==='checkbox'||el.tagName==='SELECT')return;
  const [i,key]=el.dataset.cap.split('.'),item=captureState().items[+i];if(!item)return;
  item[key]=key==='amount'?Number(el.value):el.value;
});
document.addEventListener('dragover',event=>{const zone=event.target.closest?.('[data-capture-drop]');if(zone&&event.dataTransfer?.types?.includes('Files')){event.preventDefault();zone.classList.add('dragging');}});
document.addEventListener('dragleave',event=>{const zone=event.target.closest?.('[data-capture-drop]');if(zone&&!zone.contains(event.relatedTarget))zone.classList.remove('dragging');});
document.addEventListener('drop',event=>{const zone=event.target.closest?.('[data-capture-drop]');if(!zone)return;event.preventDefault();zone.classList.remove('dragging');const file=event.dataTransfer?.files?.[0];if(file)handleCaptureFile(file);});
