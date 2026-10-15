// Ledger 4.1 UI: installment plans card and dialogs, goal deposit dialog, card actions (WS-LEDGER).
import {today,money,accountsOf,TRANSFER_FROM_KINDS} from './finance.js';
import {goalDeposit} from './ledger.js';
import {hasAllocation} from './savings.js';

// Built on the UI helpers and state from app.js (globals in the build). Top level only registers listeners.

// ---------- "הפקדתי עכשיו" (§D.2, §B.8 E12) ----------
// A linked goal: a transfer into its account (or, from outside Ofek, a balance update), plus the fixed allocation.
// An unlinked goal: "כבר בחיסכון" grows; a transfer is recorded only when both sides are accounts.
function goalDepositNote(g,{amount,fromId,toId}){
  const linked=data.accounts.find(a=>a.id===g.accountId),from=data.accounts.find(a=>a.id===fromId),value=amt(Number(amount)>0?Number(amount):0);
  if(linked){
    if(from)return `תירשם העברה מ־${e(from.name)} ל־${e(linked.name)}${hasAllocation(g)?`, וההקצאה ליעד תגדל ב־${value}`:''}. זו לא הוצאה.`;
    return `היתרה ב־${e(linked.name)} תגדל ב־${value}, כמו עדכון יתרה — בלי לרשום הכנסה.`;
  }
  const to=data.accounts.find(a=>a.id===toId);
  if(from&&to)return `תירשם העברה מ־${e(from.name)} ל־${e(to.name)}, והסכום יתווסף ל״כבר בחיסכון״ של היעד.`;
  return 'הסכום יתווסף ל״כבר בחיסכון״ של היעד. אף חשבון באופק לא משתנה.';
}
function goalDepositValues(form){const f=new FormData(form);return {amount:f.get('amount'),fromId:String(f.get('fromId')||'outside'),toId:String(f.get('toId')||''),date:String(f.get('date')||'')};}
function openGoalDeposit(goalId){
  const g=data.goals.find(x=>x.id===goalId);if(!g)return;
  const linked=data.accounts.find(a=>a.id===g.accountId);
  const sources=accountsOf(data,TRANSFER_FROM_KINDS).filter(a=>a.id!==linked?.id).map(a=>[a.id,a.name]);
  const source=data.accounts.find(a=>a.kind==='bank'&&a.id!==linked?.id)?.id||'outside';
  const dests=[['','לא לחשבון באופק'],...accountsOf(data,['bank','cash','savings','deposit']).map(a=>[a.id,a.name])];
  showDialog('הפקדה ל'+g.name,`<form id="goal-deposit-form" data-goal="${e(g.id)}"><div class="form-error"></div><div class="form-grid">${field('כמה הפקדת? (₪)',input('amount','','number','required min="0.01" step="any" autofocus'))}${field('מאיפה הכסף?',select('fromId',[...sources,['outside','כסף שלא נמצא באופק']],source))}${linked?'':field('לאן הכסף הלך?',select('toId',dests,''))}${field('תאריך',input('date',today(),'date',`required max="${today()}"`))}</div><p class="muted small lg-goal-note" id="goal-deposit-note" aria-live="polite">${goalDepositNote(g,{amount:0,fromId:source,toId:''})}</p><div class="form-actions">${submit('שמירת ההפקדה','Check')}${btn('ביטול','dialog-close')}</div></form>`);
}
function saveGoalDeposit(form){
  const g=data.goals.find(x=>x.id===form.dataset.goal);if(!g)throw Error('היעד לא נמצא.');
  const v=goalDepositValues(form),amount=Number(v.amount);
  mutate(next=>{goalDeposit(next,g.id,{amount,fromId:v.fromId,toId:v.toId,date:v.date},today());},`הפקדה של ${money(amount)} ל״${g.name}״ נרשמה`,{undo:true});
  closeDialog();
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,a]=button.dataset.action.split(':');
  try{
    if(action==='goal-deposit')openGoalDeposit(a);
  }catch(err){toast(err.message,true);}
});
const refreshGoalDepositNote=event=>{const form=event.target.closest?.('#goal-deposit-form');if(!form)return;const g=data.goals.find(x=>x.id===form.dataset.goal),box=form.querySelector('#goal-deposit-note');if(g&&box)box.innerHTML=goalDepositNote(g,goalDepositValues(form));};
document.addEventListener('input',refreshGoalDepositNote);
document.addEventListener('change',refreshGoalDepositNote);
document.addEventListener('submit',event=>{
  if(event.target.id!=='goal-deposit-form')return;
  event.preventDefault();
  try{saveGoalDeposit(event.target);}catch(err){showFormError(event.target,err);}
});
