import {uid,today,money,toILS,dateLabel,applyTransaction} from './finance.js';
import {emptyData} from './data.js';
import {parseNumber} from './xlsx.js';

// First-run setup ("how much is in your checking account?") and the checking-balance editor.
// The balance the user types is the truth: it replaces the stored balance. Optionally the
// difference is recorded as an adjustment transaction so monthly totals stay explainable.

const ISRAELI_BANKS=['בנק לאומי','בנק הפועלים','בנק דיסקונט','מזרחי טפחות','הבנק הבינלאומי','וואן זירו','פפר','בנק ירושלים','בנק מרכנתיל','בנק אחר'];
const setupState={step:0,profile:'',bank:'',balance:'',cash:'',savings:'',salary:'',salaryDay:'10',budget:''};
const SETUP_STEPS=4;

// ---------- Checking balance ----------
const checkingAccounts=d=>d.accounts.filter(a=>a.kind==='bank');
function checkingTotal(d){return checkingAccounts(d).reduce((s,a)=>s+toILS(a.balance,a.currency,d.fx),0);}
// How fresh a typed-in balance is: a week-old balance still counts as current; never typed = stale.
function balanceFreshness(date){
  if(!date)return 'stale never';
  return Math.round((new Date(today())-new Date(date))/864e5)<8?'fresh':'stale';
}
function updatedLabel(date){
  if(!date)return 'עדכון היתרה מהבנק עוזר לדיוק';
  const days=Math.round((new Date(today())-new Date(date))/864e5);
  return days<=0?'היתרה עודכנה היום':days===1?'היתרה עודכנה אתמול':days<8?`היתרה עודכנה לפני ${days} ימים`:`היתרה עודכנה ב־${dateLabel(date)}`;
}
function openBalanceEditor(accountId){
  const accounts=data.accounts.filter(a=>['bank','cash','savings'].includes(a.kind));
  if(!accounts.length){openSetupAccount();return;}
  const account=accounts.find(a=>a.id===accountId)||checkingAccounts(data)[0]||accounts[0];
  showDialog('עדכון יתרה',`<form id="balance-form" class="balance-form" novalidate><div class="form-error"></div>${accounts.length>1?field('חשבון',select('accountId',accounts.map(a=>[a.id,a.name]),account.id,'data-balance-account')):`<input type="hidden" name="accountId" value="${e(account.id)}">`}<div class="balance-current"><span>היתרה הרשומה עכשיו</span><b dir="ltr" data-balance-current>${money(account.balance,account.currency,wholeOrCents(account.balance))}</b></div><label class="balance-amount"><span class="balance-label">כמה יש בחשבון לפי הבנק?</span><span class="balance-input"><input name="balance" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="0" aria-label="היתרה בחשבון" value=""><span class="balance-currency" data-balance-currency>${account.currency==='USD'?'$':'₪'}</span></span></label><div class="balance-diff" data-balance-diff hidden></div><label class="check-field balance-record"><input type="checkbox" name="record"><span>לרשום את ההפרש כתנועת ״התאמת יתרה״<small>כך ההפרש יופיע בתנועות של החודש. בלי הסימון, רק היתרה מתעדכנת.</small></span></label><div class="form-actions">${submit('שמירת היתרה','Check')}${btn('ביטול','dialog-close')}</div></form>`);
  const dialog=document.querySelector('dialog');dialog?.classList.add('sheet');
  setTimeout(()=>dialog?.querySelector('[name=balance]')?.focus(),80);
}
// Whole shekels show no agorot ("26,450 ₪", like the hero); a balance with agorot keeps them.
const wholeOrCents=n=>Number.isInteger(Math.round(n*100)/100)?0:2;
function refreshBalanceForm(form){
  const account=data.accounts.find(a=>a.id===form.accountId.value);if(!account)return;
  form.querySelector('[data-balance-current]').textContent=money(account.balance,account.currency,wholeOrCents(account.balance));
  form.querySelector('[data-balance-currency]').textContent=account.currency==='USD'?'$':'₪';
  const value=parseNumber(form.balance.value),box=form.querySelector('[data-balance-diff]');
  if(!Number.isFinite(value)||form.balance.value.trim()===''){box.hidden=true;return;}
  const diff=Math.round((value-account.balance)*100)/100;
  box.hidden=false;box.className=`balance-diff ${diff>0?'up':diff<0?'down':'same'}`;
  box.textContent=diff===0?'בדיוק כמו שרשום — מצוין.':`${diff>0?'יותר':'פחות'} ב־${money(Math.abs(diff),account.currency,wholeOrCents(diff))} ממה שרשום`;
}
function saveBalance(form){
  const account=data.accounts.find(a=>a.id===form.accountId.value),value=parseNumber(form.balance.value);
  if(!account)throw Error('בחר חשבון.');
  if(form.balance.value.trim()===''||!Number.isFinite(value))throw Error('הזן את היתרה לפי הבנק (אפשר גם מינוס).');
  const diff=Math.round((value-account.balance)*100)/100,record=form.record.checked&&diff!==0;
  closeDialog();
  mutate(next=>{
    const a=next.accounts.find(x=>x.id===account.id);
    if(record){
      if(!next.categories.includes('התאמת יתרה'))next.categories.push('התאמת יתרה');
      const t={id:uid(),type:diff>0?'income':'expense',amount:Math.abs(diff),currency:a.currency,fx:next.fx,date:today(),category:'התאמת יתרה',subcategory:'',accountId:a.id,description:'התאמת יתרה לפי הבנק',tags:['התאמה'],recurring:false};
      applyTransaction(next,t);next.transactions.push(t);
    }
    a.balance=value;a.balanceUpdated=today();
  },`היתרה ב״${account.name}״ עודכנה: ${money(value,account.currency,Number.isInteger(value)?0:2)}`);
}

// ---------- First-run setup ----------
function openSetup(step=0){
  setupState.step=step;
  const s=setupState,dots=`<div class="setup-dots" aria-hidden="true">${Array.from({length:SETUP_STEPS},(_,i)=>`<i class="${i+1<=s.step?'on':''}"></i>`).join('')}</div>`;
  const nav=(next='הבא',skip=false)=>`<div class="form-actions setup-actions">${submit(next,s.step===SETUP_STEPS?'Check':'ArrowLeft')}${skip?btn('דילוג','setup-skip'):''}${s.step>1?btn('חזרה','setup-back'):''}</div>`;
  const amount=(name,label,hint='')=>`<label class="setup-amount"><span>${e(label)}</span><span class="balance-input"><input name="${name}" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${e(s[name])}"><span class="balance-currency">₪</span></span>${hint?`<small>${e(hint)}</small>`:''}</label>`;
  let body;
  if(step===0)body=`<div class="setup-welcome"><span class="setup-logo">${brandMark(64)}</span><h2>ברוך הבא לאופק</h2><p>המקום שבו הכסף שלך ברור: כמה יש בעו״ש, כמה בטוח לבזבז היום, לאן הכסף הולך ומתי תגיע ליעדים. הכול נשמר רק במכשיר שלך.</p><div class="setup-choices"><button type="button" class="button primary big" data-action="setup-begin">${icon('ArrowLeft',18)}<span>להתחיל עם הנתונים שלי</span></button><button type="button" class="button" data-action="setup-demo"><span>להציץ קודם בהדגמה</span></button></div><p class="muted small">ההגדרה לוקחת פחות מדקה, ואפשר לשנות הכול אחר כך.</p></div>`;
  else if(step===1)body=`<form id="setup-form" class="setup-form" novalidate>${dots}<h2>איך לקרוא לך?</h2><p class="muted">ככה נפתח איתך כל בוקר.</p>${field('השם שלך',input('profile',s.profile,'text','autocomplete="given-name" placeholder="למשל: נועה" enterkeyhint="next"'))}<div class="form-error"></div>${nav()}</form>`;
  else if(step===2)body=`<form id="setup-form" class="setup-form" novalidate>${dots}<h2>כמה כסף יש לך עכשיו בעו״ש?</h2><p class="muted">הסתכל באפליקציה של הבנק והקלד את היתרה. מינוס? הקלד עם סימן מינוס.</p>${amount('balance','היתרה בעו״ש')}${field('הבנק שלך (לא חובה)',select('bank',[['','בחירה'],...ISRAELI_BANKS.map(b=>[b,b])],s.bank))}<div class="form-error"></div>${nav()}</form>`;
  else if(step===3)body=`<form id="setup-form" class="setup-form" novalidate>${dots}<h2>עוד כסף שכדאי לספור</h2><p class="muted">לא חובה — אפשר להשאיר ריק ולהוסיף אחר כך.</p>${amount('cash','מזומן בארנק')}${amount('savings','חיסכון או פיקדון','למשל: קרן חירום, פיקדון בבנק, מענק השחרור שעוד לא נגעת בו')}<div class="form-error"></div>${nav('הבא',true)}</form>`;
  else body=`<form id="setup-form" class="setup-form" novalidate>${dots}<h2>הכנסה והוצאות</h2><p class="muted">כדי שאופק תדע כמה בטוח לבזבז כל יום. גם זה לא חובה.</p>${amount('salary','משכורת חודשית (נטו)')}${field('באיזה יום בחודש היא נכנסת?',input('salaryDay',s.salaryDay,'number','min="1" max="31" inputmode="numeric"'))}${amount('budget','כמה אתה רוצה להוציא בחודש?','יעד ההוצאות החודשי — אופק תתריע כשמתקרבים אליו')}<div class="form-error"></div>${nav('סיום')}</form>`;
  showDialog(step===0?'אופק':'הגדרה ראשונה',body,step===0);
  const dialog=document.querySelector('dialog');dialog?.classList.add('setup-dialog',step===0?'setup-welcome-dialog':'setup-step-dialog');
  setTimeout(()=>dialog?.querySelector('input:not([type=hidden])')?.focus(),80);
}
function readSetup(form){for(const [k,v] of new FormData(form))setupState[k]=String(v).trim();}
function finishSetup(){
  const s=setupState,num=v=>{const n=parseNumber(v);return Number.isFinite(n)?Math.round(n*100)/100:0;};
  const next={...emptyData(),...(data.prefs?{prefs:data.prefs}:{}),fx:data.fx,fxDate:data.fxDate,...(data.fxSource?{fxSource:data.fxSource}:{})};
  next.profile=s.profile.slice(0,40);
  next.accounts=[{id:'bank',name:'חשבון עו״ש',institution:s.bank&&s.bank!=='בנק אחר'?s.bank:'',kind:'bank',currency:'ILS',balance:num(s.balance),balanceUpdated:today()}];
  if(num(s.cash)>0)next.accounts.push({id:'cash',name:'מזומן',institution:'ארנק',kind:'cash',currency:'ILS',balance:num(s.cash),balanceUpdated:today()});
  if(num(s.savings)>0)next.accounts.push({id:'savings',name:'חיסכון',institution:'',kind:'savings',currency:'ILS',balance:num(s.savings),balanceUpdated:today()});
  const day=Math.min(31,Math.max(1,Math.round(num(s.salaryDay))||10));
  if(num(s.salary)>0)next.bills=[{id:uid(),name:'משכורת',type:'income',amount:num(s.salary),currency:'ILS',day,frequency:'monthly',category:'משכורת',accountId:'bank',autopay:true,active:true,paid:[]}];
  if(num(s.budget)>0)next.overallBudget=num(s.budget);
  closeDialog();
  commit(next,'',true);
  ui.month=today().slice(0,7);ui.monthly=null;ui.monthlyDone=null;
  Object.assign(ui.filters,{from:today().slice(0,7)+'-01',to:today().slice(0,7)+'-31'});
  ui.calendarMonth=today().slice(0,7);
  try{localStorage.setItem(WHATS_NEW_KEY,WHATS_NEW_VERSION);}catch{}
  navigate('dashboard');
  toast(`הכול מוכן${next.profile?`, ${next.profile}`:''}! זה המרחב שלך.`);
}
function openSetupAccount(){toast('קודם צריך חשבון עו״ש — בוא נגדיר אותו.');openSetup(2);}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,a]=button.dataset.action.split(':');
  try{
    if(action==='balance-edit')openBalanceEditor(a);
    else if(action==='setup-start'){
      if(data.demo||!data.accounts.length)openSetup(0);
      else confirm('להתחיל מחדש?','ההגדרה הראשונה יוצרת מרחב חדש ומחליפה את הנתונים שבמכשיר. הנתונים הנוכחיים יישמרו בהיסטוריית הגרסאות.',()=>setTimeout(()=>openSetup(1),0),true);
    }
    else if(action==='setup-begin')openSetup(1);
    else if(action==='setup-demo'){closeDialog();try{localStorage.setItem(WHATS_NEW_KEY,WHATS_NEW_VERSION);}catch{}toast('זו הדגמה. כשתהיה מוכן — ״להתחיל עם הנתונים שלי״ בראש המסך.');}
    else if(action==='setup-back'){const form=document.querySelector('#setup-form');if(form)readSetup(form);openSetup(Math.max(1,setupState.step-1));}
    else if(action==='setup-skip'){openSetup(setupState.step+1);}
  }catch(err){toast(err.message,true);}
});
document.addEventListener('input',event=>{const form=event.target.closest?.('#balance-form');if(form)refreshBalanceForm(form);});
document.addEventListener('change',event=>{const form=event.target.closest?.('#balance-form');if(form)refreshBalanceForm(form);});
document.addEventListener('submit',event=>{
  const form=event.target;
  if(form.id==='balance-form'){event.preventDefault();try{saveBalance(form);}catch(err){form.querySelector('.form-error').innerHTML=notice(err.message,'error');}}
  if(form.id==='setup-form'){
    event.preventDefault();
    try{
      readSetup(form);
      if(setupState.step===2&&!Number.isFinite(parseNumber(setupState.balance)))throw Error('הקלד את היתרה בעו״ש — אפשר גם 0.');
      if(setupState.step>=SETUP_STEPS)finishSetup();else openSetup(setupState.step+1);
    }catch(err){form.querySelector('.form-error').innerHTML=notice(err.message,'error');}
  }
});
