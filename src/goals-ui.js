import {money} from './finance.js';
import {palette} from './charts.js';
import {accountAllocations,freeMoney,hasAllocation} from './savings.js';

// Splitting account balances between savings goals ("envelopes") and the free-money view.
// Built on the UI helpers and state from app.js.

const allocIcon={bank:'Wallet',cash:'Wallet',savings:'PiggyBank',investment:'TrendingUp',deposit:'Lock'};
const goalColor=goal=>palette[Math.max(0,data.goals.findIndex(g=>g.id===goal.id))%palette.length];
function allocationAccounts(){
  // A restricted deposit, like the portfolio, appears only when a goal is linked to it: it is never free money (§B.3).
  return data.accounts.filter(a=>['bank','cash','savings'].includes(a.kind)||(['investment','deposit'].includes(a.kind)&&data.goals.some(g=>g.accountId===a.id)));
}
function allocationCard(){
  const accounts=allocationAccounts(),free=freeMoney(data);
  const rows=accounts.map(a=>{
    const info=accountAllocations(data,a.id),parts=[...info.shares].map(([id,amount])=>({goal:data.goals.find(g=>g.id===id),amount})).filter(p=>p.goal&&p.amount>.004),width=n=>info.balance>0?n/info.balance*100:0;
    return `<div class="alloc-row"><div class="alloc-head"><span class="asset-icon ${a.kind==='savings'||a.kind==='deposit'?'purple':a.kind==='investment'?'gold':'blue'}">${icon(allocIcon[a.kind]||'Wallet',19)}</span><div><b>${e(a.name)}</b><small>${e(accountKinds[a.kind])}${a.institution?' · '+e(a.institution):''}</small></div><b dir="ltr" class="alloc-balance">${money(info.balance)}</b><div class="alloc-actions">${btn('חלוקה ליעדים','alloc:'+a.id,'Target')}${ib('Edit3','עריכת '+a.name,'edit:account:'+a.id)}</div></div>
    <div class="alloc-bar" role="img" aria-label="${e(parts.map(p=>`${p.goal.name} ${money(p.amount)}`).concat(`פנוי ${money(info.free)}`).join(', '))}">${parts.map(p=>`<span style="width:${width(p.amount)}%;background:${goalColor(p.goal)}" title="${e(p.goal.name)}: ${money(p.amount)}"></span>`).join('')}<span class="free" style="width:${width(info.free)}%"></span></div>
    <div class="alloc-legend">${parts.map(p=>`<span><i style="background:${goalColor(p.goal)}"></i>${e(p.goal.name)} <b dir="ltr">${money(p.amount)}</b>${hasAllocation(p.goal)?'':'<small>(מה שלא הוקצה)</small>'}</span>`).join('')}<span><i class="free"></i>${a.kind==='investment'?'לא מוקצה':'פנוי'} <b dir="ltr">${money(info.free)}</b></span></div>
    ${info.overAllocated?notice(safe(`ההקצאות (${amt(info.requested)}) גבוהות מהיתרה. כל יעד מקבל חלק יחסי, עד שתעדכן את החלוקה.`),'error'):''}</div>`;
  }).join('');
  return card(head('הכסף שלך, לפי יעדים',safe(`${amt(free.allocated)} מוקצים ליעדים · ${amt(free.total)} כסף פנוי`),btn('הוספת חשבון','open:account','Plus'))+(accounts.length?`<div class="alloc-list">${rows}</div>`:empty('אין חשבונות לחלוקה','הוסף חשבון בנק או חיסכון, ואז חלק את היתרה בין היעדים שלך.')),'alloc-card');
}
function allocSummary(balance,total){
  const free=balance-total,over=free<-.005;
  return `<div class="row-between"><span>הוקצה ליעדים</span><b dir="ltr">${money(total)}</b></div><div class="row-between"><span>${over?'חריגה מהיתרה':'נשאר כסף פנוי'}</span><b dir="ltr" class="${over?'negative':'positive'}">${money(Math.abs(free))}</b></div>${progress(balance?Math.min(100,total/balance*100):0,over?'red':'')}`;
}
function openAllocation(accountId){
  const info=accountAllocations(data,accountId);if(!info)return;
  if(!data.goals.length){toast('אין עדיין יעדים לחלוקה. צור תוכנית חיסכון קודם.',true);return;}
  const rows=data.goals.map(g=>({g,value:g.accountId===accountId?Math.round((info.shares.get(g.id)||0)*100)/100:'',other:g.accountId&&g.accountId!==accountId?data.accounts.find(a=>a.id===g.accountId)?.name||'':''}));
  const total=rows.reduce((s,r)=>s+(Number(r.value)||0),0);
  showDialog(`חלוקת ״${info.account.name}״ בין היעדים`,`<form id="alloc-form" data-account="${e(accountId)}" data-balance="${info.balance}"><div class="form-error"></div><p class="confirm-text">יתרה של <b dir="ltr">${money(info.balance)}</b>. קבע כמה מתוכה שייך לכל יעד — מה שלא יוקצה יישאר כסף פנוי.</p><div class="alloc-inputs">${rows.map(({g,value,other})=>`<label class="alloc-input"><i style="background:${goalColor(g)}"></i><span><b>${e(g.name)}</b><small>${other?`כרגע מקושר ל״${e(other)}״ — הקצאה כאן תעביר אותו`:g.target?`סכום היעד: ${amt(g.target)}`:'ללא סכום יעד'}</small></span><input type="number" min="0" step="any" name="g_${e(g.id)}" value="${e(value)}" placeholder="0" data-alloc aria-label="הקצאה ל${e(g.name)}"></label>`).join('')}</div><div id="alloc-summary" class="alloc-summary">${allocSummary(info.balance,total)}</div><div class="form-actions">${submit('שמירת החלוקה')}${btn('חלוקה אוטומטית','alloc-auto','Sparkles')}${btn('ביטול','dialog-close')}</div></form>`,true);
}
function refreshAllocSummary(form){
  const total=[...form.querySelectorAll('[data-alloc]')].reduce((s,el)=>s+(Number(el.value)||0),0),box=form.querySelector('#alloc-summary');
  if(box)box.innerHTML=allocSummary(Number(form.dataset.balance),total);
}
// Emergency fund first, then the nearest goals, each up to its target.
function autoAllocate(form){
  let left=Number(form.dataset.balance);
  const order=[...data.goals].sort((a,b)=>(b.type==='קרן חירום')-(a.type==='קרן חירום')||a.date.localeCompare(b.date));
  for(const g of order){
    const box=form.querySelector(`[name="g_${CSS.escape(g.id)}"]`);if(!box)continue;
    const want=Number(g.target)>0?Number(g.target):0,give=Math.max(0,Math.min(want,left));
    box.value=give?Math.round(give*100)/100:'';left-=give;
  }
  refreshAllocSummary(form);
}
function saveAllocation(form){
  const accountId=form.dataset.account,info=accountAllocations(data,accountId),values=new Map();
  for(const g of data.goals){const raw=String(new FormData(form).get('g_'+g.id)||'').trim();const v=raw===''?0:Number(raw);if(!(v>=0))throw Error(`הסכום ל״${g.name}״ אינו תקין.`);values.set(g.id,Math.round(v*100)/100);}
  const total=[...values.values()].reduce((s,v)=>s+v,0);
  if(total>info.balance+.005)throw Error(`הקצית ${money(total)}, אבל ביתרה יש ${money(info.balance)}. הקטן את אחד הסכומים.`);
  mutate(next=>{
    for(const g of next.goals){
      const v=values.get(g.id)||0;
      if(v>0){g.accountId=accountId;g.allocation=v;}
      else if(g.accountId===accountId){g.saved=Math.round((info.shares.get(g.id)||0)*100)/100;g.accountId='';g.allocation=null;}
    }
  },`החלוקה של ״${info.account.name}״ נשמרה`);
  closeDialog();
}
function goalAllocationHint(v){
  const others={...data,goals:data.goals.filter(g=>g.id!==v.id)},info=accountAllocations(others,v.accountId);
  return info?safe(`יתרת החשבון ${amt(info.balance)} · ${amt(Math.max(0,info.balance-info.requested))} עדיין לא הוקצו ליעדים אחרים`):'';
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,a]=button.dataset.action.split(':');
  try{
    if(action==='alloc')openAllocation(a);
    else if(action==='alloc-auto'){const form=document.querySelector('#alloc-form');if(form)autoAllocate(form);}
  }catch(err){toast(err.message,true);}
});
document.addEventListener('input',event=>{if(event.target.dataset.alloc!=null){const form=event.target.closest('#alloc-form');if(form)refreshAllocSummary(form);}});
document.addEventListener('submit',event=>{
  if(event.target.id!=='alloc-form')return;
  event.preventDefault();
  try{saveAllocation(event.target);}catch(err){const box=event.target.querySelector('.form-error');if(box)box.innerHTML=notice(err.message,'error');else toast(err.message,true);}
});
