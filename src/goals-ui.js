import {money,monthLabel,dateLabel,assetContainerId} from './finance.js';
import {palette} from './charts.js';
import {accountAllocations,freeMoney,hasAllocation} from './savings.js';

// The goals page (4.1): a three-number summary, one compact card per goal — name, progress, saved of target,
// what it takes per month, the expected date, ONE primary action ("הפקדה") and a small menu — the full forecast
// in a "פרטים" dialog, and the accounts the goals live in ("envelopes"), equally simple.
// Built on the UI helpers and state from app.js; the standing deposit comes from money-ui.js when it exists.

const allocIcon={bank:'Wallet',cash:'Wallet',savings:'PiggyBank',investment:'TrendingUp',deposit:'Lock'};
const goalColor=goal=>palette[Math.max(0,data.goals.findIndex(g=>g.id===goal.id))%palette.length];
const GOAL_ICONS={'קרן חירום':'ShieldCheck','רכב':'Car','לימודים':'BookOpen','חופשה':'Plane','דירה':'House'};
const goalIconOf=g=>GOAL_ICONS[g.type]||'Target';
const monthYear=date=>monthLabel(String(date).slice(0,7));
const goalStandingLine=g=>{try{return typeof recurringDepositLine==='function'?recurringDepositLine({goalId:g.id}):'';}catch{return '';}};

function goalsSummary(){
  const total=data.goals.reduce((sum,g)=>sum+goalDetails(g).saved,0),monthly=data.goals.reduce((sum,g)=>sum+(Number(g.monthly)||0),0),free=freeMoney(data);
  return `<section class="card goals-summary"><div><span>בחיסכון ליעדים</span><b dir="ltr">${money(total)}</b></div><div><span>הפקדות בחודש</span><b dir="ltr">${money(monthly)}</b></div><div><span>כסף פנוי</span><b dir="ltr" class="${free.total<0?'negative':''}">${money(free.total)}</b></div></section>`;
}
// Where a goal stands, in one short line: [tone, text].
function goalStatus(g,v){
  if(v.hasTarget&&v.progress>=100)return ['ok','היעד הושג'];
  if(v.past)return ['muted','התאריך חלף. מוצגת היתרה הקיימת.'];
  if(v.hasTarget&&v.needed==null)return ['muted','התאריך הגיע'];
  if(!v.hasTarget)return ['muted',g.monthly?`${v.months} הפקדות חודשיות עד ${monthYear(g.date)}`:'בלי הפקדה חודשית — התחזית היא היתרה הקיימת'];
  if(!g.monthly)return ['warn',safe(`כדי להגיע בזמן צריך ${amt(v.needed)} בחודש`)];
  if(v.projected>=g.target)return ['ok','בקצב הנכון להגיע בזמן'];
  return ['warn',safe(`עוד ${amt(Math.max(0,v.needed-g.monthly))} בחודש יביאו אותך ליעד בזמן`)];
}
function goalFacts(g,v){
  if(!v.hasTarget)return [['הפקדה חודשית',safe(amt(g.monthly))],[`צפוי ב־${monthYear(g.date)}`,safe(amt(v.projected))]];
  const done=v.progress>=100;
  return [['בחודש כדי להגיע בזמן',done?'הושג':v.needed==null?'—':safe(amt(v.needed))],['צפי הגעה',done?'כבר עכשיו':v.estimatedDate?monthYear(v.estimatedDate):g.monthly?'—':'צריך הפקדה חודשית']];
}
function goalMenu(g){
  const items=[['Edit3','עריכה','edit:goal:'+g.id],['Repeat','הפקדה חודשית אוטומטית','goal-auto:'+g.id],['Trash2','מחיקה','remove:goal:'+g.id,'danger']];
  return `<details class="goal-menu"><summary class="icon-button" aria-label="${e('עוד פעולות ל'+g.name)}" title="עוד פעולות">${icon('Ellipsis',19)}</summary><div class="goal-menu-list">${items.map(([ic,label,action,cls])=>`<button type="button" class="goal-menu-item${cls?' '+cls:''}" data-action="${e(action)}">${icon(ic,16)}<span>${e(label)}</span></button>`).join('')}</div></details>`;
}
function goalCard(g,i){
  const v=goalDetails(g),linked=data.accounts.find(a=>a.id===g.accountId),done=v.hasTarget&&v.progress>=100,[tone,status]=goalStatus(g,v);
  const bar=v.hasTarget?v.progress:v.projected>0?v.saved/v.projected*100:0,invest=linked?.kind==='investment';
  return card(`<div class="goal-top"><span class="goal-icon ${i%2?'purple':'gold'}">${icon(goalIconOf(g),21)}</span><div class="goal-title"><h2>${e(g.name)}</h2><small>עד ${e(monthYear(g.date))}${linked?` · ${e(linked.name)}`:''}</small></div>${goalMenu(g)}</div>
    <div class="goal-amounts"><b dir="ltr">${money(v.saved)}</b><span>${v.hasTarget?`מתוך ${amt(g.target)}`:`היום · צפוי ${amt(v.projected)}`}</span>${v.hasTarget?`<em dir="ltr">${Math.round(Math.min(999,v.progress))}%</em>`:''}</div>
    ${progress(bar,done?'green':i%2?'purple':'')}
    <div class="goal-facts">${goalFacts(g,v).map(([label,value])=>`<div><span>${e(label)}</span><b>${e(value)}</b></div>`).join('')}</div>
    <p class="goal-status ${tone}"><span>${e(status)}</span></p>${goalStandingLine(g)}
    <div class="goal-actions lg-goal-deposit">${invest?btn('הפקדה לתיק','goal-invest:'+g.id,'TrendingUp','primary'):btn('הפקדה','goal-deposit:'+g.id,'PiggyBank','primary')}${btn('פרטים','goal-info:'+g.id,'Info')}</div>`,'goal-card saving-card');
}
// "פרטים": the whole forecast — what is saved, the planned deposits, the target, the linked account and the assumptions.
function openGoalInfo(id){
  const g=data.goals.find(x=>x.id===id);if(!g)return;
  const v=goalDetails(g),linked=data.accounts.find(a=>a.id===g.accountId),[tone,status]=goalStatus(g,v);
  const currentShare=v.projected>0?Math.max(0,Math.min(100,v.saved/v.projected*100)):0;
  const rows=[['סוג',g.type||'—'],['תאריך היעד',dateLabel(g.date)],['הפקדה חודשית מתוכננת',safe(amt(g.monthly))],['הפקדות עד התאריך',String(v.months)],['חשבון מקושר',linked?safe(`${e(linked.name)} · ${hasAllocation(g)?'הקצאה של '+amt(Number(g.allocation)):'מה שלא הוקצה ליעדים אחרים'}`):'סכום ידני']];
  if(v.hasTarget){rows.push(['כדי להגיע בזמן',v.needed==null?'אין הפקדות נוספות לפני התאריך':safe(amt(v.needed)+' בחודש')]);rows.push(['צפי הגעה',v.estimate]);}
  const auto=typeof openRecurringDeposit==='function';
  showDialog(g.name,`<div class="goal-info">
    <div class="saving-forecast"><span>צפוי להיות לך ב־${e(dateLabel(g.date))}</span><strong dir="ltr">${money(v.projected)}</strong></div>
    <div class="saving-parts"><div><span><i class="gold-dot"></i>כבר בחיסכון</span><b dir="ltr">${money(v.saved)}</b></div><div><span><i class="purple-dot"></i>הפקדות מתוכננות</span><b dir="ltr">+${money(v.contributions)}</b></div></div>
    <div class="savings-composition" role="img" aria-label="${e('הסכום הקיים '+money(v.saved)+'; הפקדות מתוכננות '+money(v.contributions))}"><span style="width:${currentShare}%"></span><span style="width:${v.projected>0?100-currentShare:0}%"></span></div>
    ${v.hasTarget?`<div class="saving-target"><div class="row-between"><span>היעד: <b dir="ltr">${money(g.target)}</b></span><b>${Math.round(v.progress)}%</b></div>${progress(v.progress)}<small>${v.remaining>0?safe(amt(v.remaining)+' נותרו לחיסכון'):'כל סכום היעד כבר בחיסכון'}</small></div>`:''}
    <div class="goal-details">${rows.map(([label,value])=>`<div><span>${e(label)}</span><b dir="auto">${e(value)}</b></div>`).join('')}</div>
    <p class="goal-status ${tone}"><span>${e(status)}</span></p>${goalStandingLine(g)}
    <p class="saving-assumption">${v.past?'התאריך חלף. מוצגת היתרה הקיימת בלבד.':`לפי היתרה הנוכחית ו־${v.months} הפקדות חודשיות, ללא ריבית או תשואה. ההפקדה הראשונה בתחזית בעוד חודש, ואחריה באותו יום בכל חודש. הפקדות מתוכננות אינן משנות את היתרה בפועל.`}</p>
  </div><div class="form-actions">${btn('עריכה','edit:goal:'+g.id,'Edit3','primary')}${linked&&linked.kind!=='investment'?btn('חלוקה בחשבון','alloc:'+linked.id,'Target'):''}${auto?btn('הפקדה חודשית אוטומטית','goal-auto:'+g.id,'Repeat'):''}${btn('סגירה','dialog-close')}</div>`,true);
}
function openGoalAuto(id){
  const g=data.goals.find(x=>x.id===id);if(!g)return;
  if(typeof openRecurringDeposit!=='function'){toast('הפקדה חודשית אוטומטית עוד לא זמינה בגרסה הזו.',true);return;}
  openRecurringDeposit({goalId:g.id,accountId:g.accountId||''});
}
// A goal on an investment account grows through an action in the portfolio: a deposit (straight into a fund
// tracked by value when that account has one).
function openGoalInvest(id){
  const g=data.goals.find(x=>x.id===id);if(!g)return;
  const fund=data.assets.find(a=>a.mode==='value'&&assetContainerId(data,a)===g.accountId);
  openEntity('activity',null,{type:'deposit',assetId:fund?.id||''});
}

function allocationAccounts(){
  // A restricted deposit, like the portfolio, appears only when a goal is linked to it: it is never free money (§B.3).
  return data.accounts.filter(a=>['bank','cash','savings'].includes(a.kind)||(['investment','deposit'].includes(a.kind)&&data.goals.some(g=>g.accountId===a.id)));
}
// The accounts the goals live in: one row each — name and balance, a bar of who owns what, and one action.
function allocationCard(){
  const accounts=allocationAccounts(),free=freeMoney(data);
  const rows=accounts.map(a=>{
    const info=accountAllocations(data,a.id),parts=[...info.shares].map(([id,amount])=>({goal:data.goals.find(g=>g.id===id),amount})).filter(p=>p.goal&&p.amount>.004),width=n=>info.balance>0?n/info.balance*100:0;
    const standing=(()=>{try{return ['savings','deposit'].includes(a.kind)&&typeof recurringDepositLine==='function'?recurringDepositLine({accountId:a.id}):'';}catch{return '';}})();
    return `<div class="alloc-row"><div class="alloc-head"><span class="asset-icon ${a.kind==='savings'||a.kind==='deposit'?'purple':a.kind==='investment'?'gold':'blue'}">${icon(allocIcon[a.kind]||'Wallet',19)}</span><div><b>${e(a.name)}</b><small>${e(accountKinds[a.kind])}${a.institution?' · '+e(a.institution):''}</small></div><b dir="ltr" class="alloc-balance">${money(info.balance)}</b></div>
    <div class="alloc-bar" role="img" aria-label="${e(parts.map(p=>`${p.goal.name} ${money(p.amount)}`).concat(`פנוי ${money(info.free)}`).join(', '))}">${parts.map(p=>`<span style="width:${width(p.amount)}%;background:${goalColor(p.goal)}" title="${e(p.goal.name)}: ${money(p.amount)}"></span>`).join('')}<span class="free" style="width:${width(info.free)}%"></span></div>
    <div class="alloc-foot"><div class="alloc-legend">${parts.map(p=>`<span><i style="background:${goalColor(p.goal)}"></i>${e(p.goal.name)} <b dir="ltr">${money(p.amount)}</b></span>`).join('')}<span><i class="free"></i>${a.kind==='investment'?'לא מוקצה':'פנוי'} <b dir="ltr">${money(info.free)}</b></span></div>
    <div class="alloc-actions"><button type="button" class="text-button" data-action="alloc:${e(a.id)}">${icon('Target',15)}חלוקה ליעדים</button>${['savings','deposit'].includes(a.kind)&&typeof openRecurringDeposit==='function'?`<button type="button" class="text-button" data-action="deposit-auto:acc:${e(a.id)}">${icon('Repeat',15)}הפקדה אוטומטית</button>`:''}</div></div>
    ${info.overAllocated?notice(safe(`ההקצאות (${amt(info.requested)}) גבוהות מהיתרה. כל יעד מקבל חלק יחסי, עד שתעדכן את החלוקה.`),'error'):''}${standing}</div>`;
  }).join('');
  return card(head('החשבונות של היעדים',safe(`${amt(free.allocated)} שייכים ליעדים · ${amt(free.total)} כסף פנוי`))+(accounts.length?`<div class="alloc-list">${rows}</div>`:empty('אין חשבונות לחלוקה','הוסף חשבון בנק או חיסכון, ואז חלק את היתרה בין היעדים שלך.',btn('הוספת חשבון','open:account','Plus'))),'alloc-card');
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

// The goal menu (<details>): one open at a time; a click outside or on an item closes it.
function closeGoalMenus(except=null){for(const m of document.querySelectorAll('.goal-menu[open]'))if(m!==except)m.open=false;}
document.addEventListener('click',event=>{
  const menu=event.target.closest?.('.goal-menu');
  if(!menu||event.target.closest('.goal-menu-item'))closeGoalMenus();else closeGoalMenus(menu);
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.querySelector('.goal-menu[open]'))closeGoalMenus();});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,a]=button.dataset.action.split(':');
  try{
    if(action==='alloc')openAllocation(a);
    else if(action==='goal-info')openGoalInfo(a);
    else if(action==='goal-auto'){closeGoalMenus();openGoalAuto(a);}
    else if(action==='goal-invest')openGoalInvest(a);
    else if(action==='alloc-auto'){const form=document.querySelector('#alloc-form');if(form)autoAllocate(form);}
  }catch(err){toast(err.message,true);}
});
document.addEventListener('input',event=>{if(event.target.dataset.alloc!=null){const form=event.target.closest('#alloc-form');if(form)refreshAllocSummary(form);}});
document.addEventListener('submit',event=>{
  if(event.target.id!=='alloc-form')return;
  event.preventDefault();
  try{saveAllocation(event.target);}catch(err){const box=event.target.querySelector('.form-error');if(box)box.innerHTML=notice(err.message,'error');else toast(err.message,true);}
});
