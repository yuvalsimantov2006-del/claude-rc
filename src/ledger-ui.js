// Ledger 4.1 UI: installment plans card and dialogs, goal deposit dialog, card actions (WS-LEDGER).
import {today,money,dateLabel,toILS,accountsOf,TRANSFER_FROM_KINDS} from './finance.js';
import {goalDeposit,planProgress,payOffPlan,removePlan} from './ledger.js';
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

// ---------- Installment plans (§D.3, §B.5) ----------
// "עסקאות בתשלומים" on the accounts page: every plan with its progress; unfinished ones first, newest first.
function plansCard(){
  const plans=(data.installments||[]).map(p=>({p,g:planProgress(data,p,today())})).sort((a,b)=>Number(a.g.done)-Number(b.g.done)||String(b.p.purchaseDate).localeCompare(String(a.p.purchaseDate)));
  if(!plans.length)return '';
  const active=plans.filter(x=>!x.g.done),leftTotal=active.reduce((s,x)=>s+toILS(x.g.leftAmount,x.p.currency,x.p.fx||data.fx),0);
  const rows=plans.map(({p,g})=>{
    const account=data.accounts.find(a=>a.id===p.accountId)?.name||'חשבון שנמחק',desc=p.description||p.category;
    const sub=g.done?`הסתיימה ב־${dateLabel(g.lastDate)}`:`${account} · התשלום הבא ${dateLabel(g.nextDate)}`;
    return `<div class="lg-plan-row${g.done?' done':''}">${categoryBadge(p.category)}<div class="lg-plan-main"><div class="lg-plan-title"><b>${e(desc)}</b><small>${e(sub)}</small></div>${progress(g.recorded/g.of*100,g.done?'green':'purple')}<span class="lg-plan-left">${g.done?`שולמו כל ${g.of} התשלומים`:`נשארו ${g.left} מתוך ${g.of} · ${amt(g.leftAmount,p.currency)}`}</span></div><div class="lg-plan-actions">${ib('Edit3','עריכת '+desc,'plan-edit:'+p.id)}${g.done?'':textBtn('פירעון מוקדם','plan-payoff:'+p.id)}${ib('Trash2','מחיקת '+desc,'plan-remove:'+p.id)}</div></div>`;
  }).join('');
  return card(head('עסקאות בתשלומים',safe(`${active.length} ${active.length===1?'פעילה':'פעילות'} · ${amt(leftTotal)} נותרו לתשלום`))+`<div class="lg-plan-list">${rows}</div>`,'lg-plans-card');
}
const findPlan=id=>(data.installments||[]).find(p=>p.id===id);
function openPlanEdit(planId){
  const p=findPlan(planId);if(!p)throw Error('העסקה בתשלומים לא נמצאה.');
  const cats=data.categories.filter(c=>!/משכורת|הכנס|מענק|דיבידנד/.test(c));
  showDialog('עריכת עסקה בתשלומים',`<form id="plan-form" data-plan="${e(p.id)}"><div class="form-error"></div><div class="form-grid">${field('תיאור',input('description',p.description,'text','required maxlength="120"'))}${field('קטגוריה',select('category',cats.includes(p.category)?cats:[...cats,p.category],p.category))}${notice('השינוי חל על התשלומים הבאים בלבד.')}</div><div class="form-actions">${submit('שמירה','Check')}${btn('ביטול','dialog-close')}</div></form>`);
}
function savePlanEdit(form){
  const f=new FormData(form),description=String(f.get('description')||'').trim().slice(0,120),category=String(f.get('category')||'');
  if(!description)throw Error('יש להזין תיאור.');if(!category)throw Error('יש לבחור קטגוריה.');
  mutate(next=>{const p=(next.installments||[]).find(x=>x.id===form.dataset.plan);if(!p)throw Error('העסקה בתשלומים לא נמצאה.');p.description=description;p.category=category;},'השינויים נשמרו',{undo:true});
  closeDialog();
}
function confirmPayoff(planId){
  const p=findPlan(planId);if(!p)throw Error('העסקה בתשלומים לא נמצאה.');
  const g=planProgress(data,p,today()),account=data.accounts.find(a=>a.id===p.accountId)?.name||'החשבון';
  confirm('פירעון מוקדם',`יירשם היום תשלום אחד של ${money(g.leftAmount,p.currency)} מ־${account}, והעסקה תסומן כגמורה.`,()=>mutate(next=>{payOffPlan(next,planId,today());},`נרשם פירעון מוקדם של ${money(g.leftAmount,p.currency)}`,{undo:true}),false,'פירעון');
}
function confirmPlanRemove(planId){
  if(!findPlan(planId))throw Error('העסקה בתשלומים לא נמצאה.');
  confirm('למחוק את העסקה בתשלומים?','התשלומים שכבר נרשמו יישארו בתנועות. התשלומים העתידיים לא יירשמו.',()=>mutate(next=>{removePlan(next,planId);},'הפריט נמחק',{undo:true}),true);
}
// ---------- Card actions (§D.3) ----------
// "תשלום לכרטיס": a transfer from the paying bank to the card for what it owes now. "עסקה בתשלומים": the
// transaction form with installments on, on this card.
function openCardPay(cardId){
  const c=data.accounts.find(a=>a.id===cardId&&a.kind==='credit');if(!c)return;
  const from=data.accounts.find(a=>a.id===c.payFrom&&a.kind==='bank')||data.accounts.find(a=>a.kind==='bank');
  openEntity('transaction',null,{type:'transfer',accountId:from?.id||'',toAccountId:c.id,toAmount:'',amount:Math.max(0,Math.round(Number(c.balance)*100)/100)||'',description:'תשלום ל'+c.name});
}
function openCardPlan(cardId){
  const c=data.accounts.find(a=>a.id===cardId&&a.kind==='credit');if(!c)return;
  openEntity('transaction',null,{type:'expense',accountId:c.id,planOn:true,recurring:false});
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,a]=button.dataset.action.split(':');
  try{
    if(action==='goal-deposit')openGoalDeposit(a);
    else if(action==='plan-edit')openPlanEdit(a);
    else if(action==='plan-payoff')confirmPayoff(a);
    else if(action==='plan-remove')confirmPlanRemove(a);
    else if(action==='card-pay')openCardPay(a);
    else if(action==='card-plan')openCardPlan(a);
  }catch(err){toast(err.message,true);}
});
const refreshGoalDepositNote=event=>{const form=event.target.closest?.('#goal-deposit-form');if(!form)return;const g=data.goals.find(x=>x.id===form.dataset.goal),box=form.querySelector('#goal-deposit-note');if(g&&box)box.innerHTML=goalDepositNote(g,goalDepositValues(form));};
document.addEventListener('input',refreshGoalDepositNote);
document.addEventListener('change',refreshGoalDepositNote);
document.addEventListener('submit',event=>{
  if(event.target.id==='plan-form'){event.preventDefault();try{savePlanEdit(event.target);}catch(err){showFormError(event.target,err);}return;}
  if(event.target.id!=='goal-deposit-form')return;
  event.preventDefault();
  try{saveGoalDeposit(event.target);}catch(err){showFormError(event.target,err);}
});
