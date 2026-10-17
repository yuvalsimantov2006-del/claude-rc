import {uid,today,money,minusMoney,plainText,pct,dateLabel,monthLabel,monthOffset,applyTransaction,validDate,toILS,TX_KINDS,LIQUID_KINDS} from './finance.js';
import {palette,tone,graph} from './charts.js';
import {shiftDate,detectRecurring} from './smart.js';
import {IL_TAX_2026,netSalary,grossForNet,loanSchedule,loanByYear,debtPayoff,feeImpact,maaserSummary,expenseShares,groupSummary,splitTotals,billMonthly,billOccurrences,scheduledItems,monthlyFixed,cashflowForecast,safeToSpend,purchaseCheck,COOLING_DAYS,wishStatus,wishlistSummary,billKind,isDepositBill,depositRoute,billRemaining,billEnded,pendingConfirmations,confirmAutoAmount,holdAutoBill,dropAutoCard,pauseBill,resumeBill,makeBill,markBillPaid,nextBillDate,depositBillFor,DEPOSIT_FROM_KINDS,DEPOSIT_TO_KINDS} from './money.js';
import {aiReady} from './ai.js';
import {moduleHook} from './hooks.js';

// Money pages: bills & cash-flow, shared expenses, smart purchases and the calculators toolkit.
// Rendered inside the shell from app.js and built on its UI helpers and state (e, icon, card, data, ui, commit…).

const moneyItems=key=>Array.isArray(data[key])?data[key]:[];
const freqLabels={monthly:'כל חודש',bimonthly:'כל חודשיים',quarterly:'כל רבעון',yearly:'פעם בשנה'};
const priorityLabels={1:'חשוב מאוד',2:'רצוי',3:'נחמד שיהיה'};
const trackedAccounts=()=>data.accounts.filter(a=>TX_KINDS.includes(a.kind));
const shortDate=d=>new Date(d+'T12:00:00').toLocaleDateString('he-IL',{day:'numeric',month:'short'});
const weekday=d=>new Date(d+'T12:00:00').toLocaleDateString('he-IL',{weekday:'short'});
const exact=n=>money(n,'ILS',Math.abs(n)%1>.004?2:0);
function mutate(change,message,opts={}){
  const next=structuredClone(data);
  for(const key of ['bills','groups','wishlist'])if(!Array.isArray(next[key]))next[key]=[];
  change(next);commit(next,message,false,opts);
}
function showFormError(form,err){const box=form?.querySelector('.form-error');if(box)box.innerHTML=notice(err.message,'error');else toast(err.message,true);}

// ---------- Bills & cash-flow ----------
// Fixed items are incomes, expenses or standing deposits ("הפקדה קבועה", a transfer between your own accounts).
const paidWord=kind=>kind==='income'?'התקבל':kind==='transfer'?'הופקד':'שולם';
const billAccountName=id=>data.accounts.find(a=>a.id===id)?.name||'';
// "מ־עו״ש ל־קרן חירום": where a standing deposit moves money (a goal shows its name).
function depositPath(b){
  const r=depositRoute(data,b),dest=r.goal?(r.to&&r.to.id!==r.goal.accountId?`${r.goal.name} (${r.to.name})`:r.goal.name):r.to?.name||'—';
  return `מ־${r.from?.name||billAccountName(b.accountId)||'—'} ל־${dest}`;
}
function agendaItems(now=today()){
  const pending=new Set(pendingConfirmations(data).filter(t=>t.auto?.source==='bill').map(t=>`${t.auto.ref}@${t.auto.date}`));
  return scheduledItems(data,shiftDate(now,-14),shiftDate(now,30),now).filter(x=>x.date>=now||(x.source==='bill'&&!x.paid&&!x.autopay)||pending.has(x.key)).map(x=>pending.has(x.key)?{...x,confirming:true}:x);
}
// The sign of an item for bank + cash: income comes in; a deposit only when it leaves bank or cash.
const itemSign=x=>x.type==='income'?'+':x.type==='transfer'&&x.source==='bill'&&!(x.liquid<0)?'':'−';
const itemClass=x=>x.type==='income'?'positive':x.type==='transfer'&&x.source==='bill'?'transfer-amount':'';
function agendaHTML(items,now=today()){
  if(!items.length)return empty('אין תשלומים קרובים','הוסף הכנסות ותשלומים קבועים כמו משכורת, שכירות וארנונה, ותראה כאן מה נכנס, מה יורד ומתי.');
  const days=new Map();for(const x of items){if(!days.has(x.date))days.set(x.date,[]);days.get(x.date).push(x);}
  const status=x=>x.paid?(x.confirming?badge('לאישור','purple'):badge(paidWord(x.type),'green')):x.source==='bill'?`<button type="button" class="pay-button" data-action="bill-pay:${e(x.billId)}:${x.date}">${paidWord(x.type)}</button>`:'';
  return `<div class="agenda">${[...days].map(([date,list])=>`<div class="agenda-day ${date<now?'overdue':date===now?'today':''}"><div class="agenda-date"><b>${Number(date.slice(8))}</b><small>${date===now?'היום':date<now?'באיחור':weekday(date)}</small></div><div class="agenda-items">${list.map(x=>`<div class="agenda-item">${agendaIcon(x)}<div><b>${e(x.name)}</b><small>${x.waiting?badge('ממתין','gold')+' ':''}${e(agendaSub(x))}</small></div><b dir="ltr" class="${itemClass(x)}">${itemSign(x)}${money(x.amount)}</b>${status(x)}</div>`).join('')}</div></div>`).join('')}</div>`;
}
// Card statements and installment payments have their own look; items paid by card say which card (§C.2.8).
function agendaIcon(x){const [ic,color]=x.source==='card'?['CreditCard','blue']:x.source==='installment'?['CreditCard','purple']:x.type==='income'?['ArrowDownLeft','green']:x.type==='transfer'?['PiggyBank','blue']:x.source==='recurring'?['Repeat','purple']:['Receipt','gold'];return `<span class="asset-icon ${color}">${icon(ic,16)}</span>`;}
function agendaSub(x){
  if(x.source==='card')return `חיוב כרטיס · יורד מ־${billAccountName(x.accountId)}`;
  if(x.source==='installment')return [x.category,`תשלום ${x.n} מתוך ${x.of}`,x.onCard?`בכרטיס ${billAccountName(x.accountId)}`:''].filter(Boolean).join(' · ');
  if(x.type==='transfer'&&x.source==='bill'){const b=moneyItems('bills').find(v=>v.id===x.billId);return [b?depositPath(b):'הפקדה',x.autopay?'אוטומטית':'ממתינה'].join(' · ');}
  return [x.category,x.onCard?`בכרטיס ${billAccountName(x.accountId)}`:x.autopay?(x.type==='income'?'נרשמת אוטומטית':'חיוב אוטומטי'):'תשלום ידני',x.source==='recurring'?'תנועה חוזרת':''].filter(Boolean).join(' · ');
}
// The safe-to-spend detail line (§B.3): limited by the budget or by the cash in the bank, with the card charge.
function safeDetail(s){const card=s.cardDue>0?` · כולל חיוב כרטיס של ${amt(s.cardDue)} ב־${Number(s.cardCharges[0].date.slice(8))} לחודש`:'',deposit=s.depositDue>0&&s.limitedBy==='cash'?` · אחרי הפקדות של ${amt(s.depositDue)} לחיסכון`:'';return (s.limitedBy==='cash'?`${amt(Math.max(0,s.cash))} בעו״ש ובמזומן אחרי החיובים עד סוף החודש`:`${amt(Math.max(0,s.available))} נשארו מיעד החודש, אחרי ${amt(s.upcomingFixed)} תשלומים קבועים · ${s.daysLeft} ימים`)+card+deposit;}
// One status for a fixed item (§D.4): paused, ended, cannot be recorded, or how many payments are left.
function billStatus(b,now=today()){
  const kind=billKind(b),left=billRemaining(b,now);
  if(b.active===false)return [badge('מושהה','neutral'),b.pausedOn?`מושהה מאז ${dateLabel(b.pausedOn)}`:''];
  if(billEnded(b,now))return [badge('הסתיים','neutral'),''];
  const problem=kind==='transfer'?depositRoute(data,b).problem:b.autopay&&!data.accounts.some(a=>a.id===b.accountId&&TX_KINDS.includes(a.kind))?'חסר חשבון':'';
  if(problem)return [badge('לא נרשם','red'),problem];
  return ['',left?`עוד ${left===1?'תשלום אחד':`${left} תשלומים`}`:''];
}
function billsTable(bills){
  if(!bills.length)return empty('עוד אין כאן קבועים','משכורת, שכר דירה, ארנונה, מנויים או הפקדה חודשית לחיסכון — מוסיפים פעם אחת, ואופק רושמת אותם בזמן ומראה תחזית.',btn('הוספה ראשונה','bill-new','','primary'));
  const now=today(),rank=b=>(b.active===false||billEnded(b,now)?10:0)+{expense:0,transfer:1,income:2}[billKind(b)];
  const sorted=[...bills].sort((a,b)=>rank(a)-rank(b)||billMonthly(data,b)-billMonthly(data,a));
  const row=b=>{
    const kind=billKind(b),[flag,state]=billStatus(b,now),off=b.active===false||billEnded(b,now);
    const ic=kind==='income'?['ArrowDownLeft','green']:kind==='transfer'?['PiggyBank','transfer']:['Receipt',''];
    const parts=kind==='transfer'?[depositPath(b),state||'אוטומטית']:[b.category,state,b.autopay?(kind==='income'?'נרשמת אוטומטית':'נרשם אוטומטית'):'תשלום ידני'];
    const amount=kind==='income'?`<b dir="ltr" class="positive">${money(b.amount)}</b>`:kind==='transfer'?`<b dir="ltr" class="transfer-amount">${money(b.amount)}</b>`:`<b dir="ltr">${minusMoney(b.amount)}</b>`;
    return `<tr class="${off?'bill-off':''}"><td><div class="transaction-name"><span class="transaction-icon ${ic[1]}">${icon(ic[0],16)}</span><div><b>${e(b.name)}</b><small class="bill-sub">${flag}${flag?' ':''}${e(parts.filter(Boolean).join(' · '))}</small></div></div></td><td class="muted">${freqLabels[b.frequency]}<small>ב־${b.day} לחודש</small></td><td class="amount">${amount}${b.frequency!=='monthly'?`<small class="muted">כ־${amt(billMonthly(data,b))} בחודש</small>`:''}</td><td><div class="row-actions">${b.active===false?ib('Play','חידוש '+b.name,'bill-resume:'+b.id):billEnded(b,now)?'':ib('Pause','השהיית '+b.name,'bill-pause:'+b.id)}${ib('Edit3','עריכת '+b.name,'bill-edit:'+b.id)}${ib('Trash2','מחיקת '+b.name,'bill-remove:'+b.id)}</div></td></tr>`;
  };
  return `<div class="table-wrap"><table class="bills-table"><thead><tr><th>פריט</th><th>מתי</th><th>סכום</th><th aria-label="פעולות"></th></tr></thead><tbody>${sorted.map(row).join('')}</tbody></table></div>`;
}
// "המשכורת נכנסה? כמה בדיוק?" (§D.4): auto rows that wait for the real amount, with the actions for each.
function confirmTitle(t){
  if(t.auto?.source==='card')return `חיוב ${billAccountName(t.toAccountId)||'הכרטיס'} ירד? כמה בדיוק?`;
  if(t.type==='income')return t.category==='משכורת'?'המשכורת נכנסה? כמה בדיוק?':`${t.description||t.category} נכנסה? כמה בדיוק?`;
  return `${t.description||t.category} ירד? כמה בדיוק?`;
}
function confirmItem(t){
  const card=t.auto?.source==='card',symbol=(t.currency||'ILS')==='USD'?'$':'₪';
  const second=card?btn('מחיקת החיוב','auto-drop:'+t.id,'','danger'):btn(t.type==='income'?'עוד לא נכנסה':'עוד לא ירד','auto-hold:'+t.id);
  return `<div class="confirm-item"><span class="asset-icon ${t.type==='income'?'green':card?'blue':'purple'}">${icon(t.type==='income'?'ArrowDownLeft':card?'CreditCard':'Receipt',17)}</span><div class="confirm-copy"><b>${e(confirmTitle(t))}</b><small>רשמנו ${amt(t.amount,t.currency||'ILS',Number.isInteger(t.amount)?0:2)} ב־${dateLabel(t.date)} לפי ${card?'הקניות בכרטיס (הערכה)':'הסכום הקבוע'}.</small></div><form class="confirm-form" data-tx="${e(t.id)}"><label class="currency-input"><input name="amount" type="number" inputmode="decimal" min="0.01" step="any" required value="${e(t.amount)}" aria-label="${e('הסכום בפועל: '+confirmTitle(t))}"><span>${symbol}</span></label>${submit('זה הסכום','Check')}</form><div class="confirm-more">${second}</div></div>`;
}
// The card at the top of the bills page (all of them) and, in the home "חיובים קרובים" card, the first two.
function confirmPromptsCard(limit=Infinity){
  const list=pendingConfirmations(data);if(!list.length)return '';
  return card(`<div class="confirm-list">${list.slice(0,limit).map(confirmItem).join('')}</div>${list.length>limit?`<div class="confirm-foot">${textBtn(`ועוד ${list.length-limit}`,'navigate:bills')}</div>`:''}`,'confirm-card');
}
// Recurring charges that look like fixed payments and are not on the bills calendar yet.
const BILL_LIKE=['חשבונות','רכב','כושר','לימודים','בריאות','תרומות','חיסכון','השקעות'];
function billSuggestions(){
  const bills=moneyItems('bills');
  return detectRecurring(data,today().slice(0,7)).filter(r=>(r.stable||BILL_LIKE.includes(r.category))&&!bills.some(b=>b.name.includes(r.name)||r.name.includes(b.name)||(b.category===r.category&&Math.abs(billMonthly(data,b)-r.average)/r.average<.15))).slice(0,6);
}
function flowCard(f,days){
  const step=Math.max(1,Math.ceil(f.points.length/120)),chart=f.points.filter((p,i)=>i%step===0||i===f.points.length-1||p.date===f.lowest.date);
  const toggles=`<div class="flow-toggles"><label class="check-field"><input type="checkbox" data-flow="flowGoals" ${ui.flowGoals!==false?'checked':''}>הפקדות מתוכננות ליעדים</label><label class="check-field"><input type="checkbox" data-flow="flowVariable" ${ui.flowVariable!==false?'checked':''}>הוצאות משתנות ממוצעות</label></div>`;
  return card(head('תחזית היתרה בעו״ש',safe(`יתרה של ${amt(f.start)} היום · ${f.deposits>=.5?`${amt(f.deposits)} הפקדות לחיסכון וליעדים · `:''}${f.cardCharges>0?`${amt(f.cardCharges)} חיובי כרטיס · `:''}הוצאה משתנה של כ־${amt(f.variableDaily)} ביום`),`<div class="segmented mini">${[[30,'חודש'],[90,'3 חודשים'],[180,'חצי שנה'],[365,'שנה']].map(([v,l])=>`<button class="${days===v?'active':''}" data-action="flow-days:${v}">${l}</button>`).join('')}</div>`)+toggles+graph(chart.map(p=>({date:p.date,label:shortDate(p.date),balance:p.balance})),[{key:'balance',name:'יתרה צפויה',color:f.overdraft?tone.negative:palette[0]}],{height:240,area:true})+`<div class="chart-footer"><span><i class="gold-dot"></i>יתרה צפויה בעו״ש ובמזומן</span><span>${f.estimatedIncome?'ההכנסות מוערכות לפי ההיסטוריה':'לפי לוח התשלומים, התנועות החוזרות וההפקדות ליעדים'}</span></div>`,'flow-card');
}
function flowCalendarCard(f,now){
  const months=[...new Set(f.points.map(p=>p.date.slice(0,7)))],shown=ui.flowAllMonths?months:months.slice(0,2),byDate=new Map(f.points.map(p=>[p.date,p]));
  const low=Math.max(500,f.variableDaily*7),selected=byDate.get(ui.flowDay)||null;
  const grid=m=>{const first=new Date(m+'-01T12:00:00').getDay(),count=new Date(+m.slice(0,4),+m.slice(5),0).getDate();return `<div class="flow-month"><b>${monthLabel(m)}</b><div class="flow-grid">${['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map(d=>`<span class="flow-week">${d}</span>`).join('')}${'<span></span>'.repeat(first)}${Array.from({length:count},(_,i)=>{const date=`${m}-${String(i+1).padStart(2,'0')}`,p=byDate.get(date);if(!p)return `<span class="flow-day past"><i>${i+1}</i></span>`;const level=p.balance<0?'neg':p.balance<low?'low':'ok',kinds=new Set((p.events||[]).filter(x=>!x.onCard).map(x=>x.source==='card'?'card':x.type));return `<button type="button" class="flow-day ${level} ${date===now?'today':''} ${ui.flowDay===date?'selected':''}" data-action="flow-day:${date}" aria-label="${e(`${dateLabel(date)}: ${money(p.balance)}`)}"><i>${i+1}</i><b class="amt">${compactAmount(p.balance)}</b><span class="flow-dots">${[...kinds].map(k=>`<em class="k-${k}"></em>`).join('')}</span></button>`;}).join('')}</div></div>`;};
  const detail=selected?`<div class="flow-detail"><div class="row-between"><b>${dateLabel(selected.date)}</b><b dir="ltr" class="${selected.balance<0?'negative':''}">${money(selected.balance)}</b></div>${(selected.events||[]).length?selected.events.map(x=>`<div class="flow-event"><span>${e(x.name)}</span><b dir="ltr" class="${itemClass(x)}">${itemSign(x)}${money(x.amount)}</b></div>`).join(''):'<small class="muted">אין תשלומים קבועים ביום הזה — רק הוצאה משתנה ממוצעת.</small>'}</div>`:'<p class="muted small">לחץ על יום כדי לראות מה צפוי בו.</p>';
  return card(head('יתרה צפויה בכל יום','ירוק — מצב טוב · צהוב — יתרה נמוכה · אדום — מינוס',months.length>2?btn(ui.flowAllMonths?'פחות חודשים':`כל ${months.length} החודשים`,'flow-months',''):'')+`<div class="flow-calendar">${shown.map(grid).join('')}</div>${detail}<div class="flow-legend"><span><em class="k-income"></em>הכנסה</span><span><em class="k-expense"></em>תשלום</span><span><em class="k-transfer"></em>הפקדה לחיסכון</span><span><em class="k-card"></em>חיוב כרטיס</span></div>`,'flow-calendar-card');
}
function flowMonthsCard(f){
  return card(head('סיכום לפי חודשים','כמה נכנס, כמה יוצא וכמה נשאר בסוף כל חודש')+`<div class="table-wrap"><table class="flow-table"><thead><tr><th>חודש</th><th>פתיחה</th><th>הכנסות</th><th>תשלומים</th><th>חיובי כרטיס</th><th>הפקדות</th><th>משתנות</th><th>סגירה</th><th>שפל</th></tr></thead><tbody>${f.months.map(m=>`<tr><td><b>${monthLabel(m.month)}</b>${m.days<new Date(+m.month.slice(0,4),+m.month.slice(5),0).getDate()?`<small class="muted">${m.days} ימים</small>`:''}</td><td dir="ltr" data-label="פתיחה">${money(m.start)}</td><td dir="ltr" data-label="הכנסות" class="${m.income>=.5?'positive':'muted'}">${m.income>=.5?'+':''}${money(m.income)}</td><td dir="ltr" data-label="תשלומים">${minusMoney(m.fixed)}</td><td dir="ltr" data-label="חיובי כרטיס">${minusMoney(m.card||0)}</td><td dir="ltr" data-label="הפקדות">${minusMoney(m.deposits)}</td><td dir="ltr" data-label="משתנות">${minusMoney(m.variable)}</td><td dir="ltr" data-label="סגירה"><b class="${m.end<0?'negative':''}">${money(m.end)}</b></td><td dir="ltr" data-label="שפל" class="${m.lowest.balance<0?'negative':'muted'}">${money(m.lowest.balance)}</td></tr>`).join('')}</tbody></table></div>`,'flow-months-card');
}
function billsView(){
  const now=today(),days=ui.flowDays||90,f=cashflowForecast(data,{days,now,includeGoals:ui.flowGoals!==false,includeVariable:ui.flowVariable!==false}),s=safeToSpend(data,now),bills=moneyItems('bills'),fixed=monthlyFixed(data,now),suggestions=billSuggestions();
  ui.flowCache=f;
  ui.billSuggestions=suggestions;
  const live=bills.filter(b=>b.active!==false&&!billEnded(b,now)),expenseCount=live.filter(b=>billKind(b)==='expense').length;
  const monthlyOf=kind=>live.filter(b=>billKind(b)===kind).reduce((sum,b)=>sum+billMonthly(data,b),0),incomes=monthlyOf('income'),deposits=monthlyOf('transfer');
  const sub=[`${amt(fixed)} תשלומים בחודש`,incomes?`${amt(incomes)} הכנסות`:'',deposits?`${amt(deposits)} הפקדות`:''].filter(Boolean).join(' · ');
  return `${confirmPromptsCard()}<div class="three-metrics">${metric('בטוח לבזבז היום',money(s.perDay),safeDetail(s),'Wallet','green')}${metric('תשלומים קבועים בחודש',money(fixed),`${expenseCount} תשלומים במעקב · ${amt(fixed*12)} בשנה`,'Repeat','purple')}${metric('נקודת השפל בעו״ש',money(f.lowest.balance),f.overdraft?`<span class="negative">צפוי מינוס ב־${dateLabel(f.overdraft)}</span>`:`ב־${dateLabel(f.lowest.date)} · עו״ש ומזומן`,'TrendingDown',f.overdraft?'red':'gold')}</div>
  ${f.overdraft?notice(safe(`בקצב הנוכחי היתרה בעו״ש תרד מתחת לאפס ב־${dateLabel(f.overdraft)} ותגיע עד ${amt(f.lowest.balance)}. אפשר להעביר כסף מחיסכון, לדחות תשלום ידני או לצמצם הוצאות משתנות.`),'error'):''}
  ${flowCard(f,days)}
  ${flowCalendarCard(f,now)}
  ${flowMonthsCard(f)}
  <div class="bills-layout">${card(head('לוח התשלומים','30 הימים הקרובים',aiReady()?btn('האם צפוי לי מינוס?','ai-prompt:bills','Sparkles'):'')+agendaHTML(agendaItems(now),now),'agenda-card')}${card(head('הכנסות, תשלומים והפקדות קבועים',safe(sub),btn('הוספה','bill-new','Plus','primary'))+billsTable(bills),'bills-card')}</div>
  ${suggestions.length?card(head('זיהינו תשלומים חוזרים','להוסיף אותם ללוח? בלחיצה אחת, וכל הפרטים ניתנים לעריכה.')+`<div class="suggestions">${suggestions.map((r,i)=>`<div class="suggestion"><span class="asset-icon purple">${icon('Repeat',16)}</span><div><b>${e(r.name)}</b><small>${e(r.category)} · כ־${amt(r.average)} בחודש · בסביבות ה־${Number(r.lastDate.slice(8))} לחודש</small></div><button type="button" class="button" data-action="bill-suggest:${i}">${icon('Plus',15)}<span>הוספה</span></button></div>`).join('')}</div>`,'suggest-card'):''}`;
}
// ---------- The add / edit form: a fixed income, a fixed expense or a standing deposit (§D.4) ----------
const BILL_KIND_TABS=[['income','הכנסה קבועה','ArrowDownLeft'],['expense','הוצאה קבועה','Receipt'],['transfer','הפקדה קבועה','PiggyBank']];
const BILL_KIND_HINTS={income:'משכורת, קצבה או דמי כיס שנכנסים כל חודש.',expense:'שכר דירה, ארנונה, ביטוח או מנוי.',transfer:'הפקדה קבועה לחיסכון או ליעד: כסף שעובר מחשבון לחשבון ביום שבחרת. זו לא הוצאה, והיא לא נספרת בתקציב.'};
const billDialogTitle=(kind,editing)=>editing?{income:'עריכת הכנסה קבועה',expense:'עריכת הוצאה קבועה',transfer:'עריכת הפקדה קבועה'}[kind]:{income:'הכנסה קבועה חדשה',expense:'הוצאה קבועה חדשה',transfer:'הפקדה קבועה לחיסכון או ליעד'}[kind];
const defaultCategory=kind=>{const want=kind==='income'?'משכורת':'חשבונות';return data.categories.includes(want)?want:data.categories[0]||'';};
const depositSources=()=>data.accounts.filter(a=>DEPOSIT_FROM_KINDS.includes(a.kind));
const depositGoals=()=>(data.goals||[]).filter(g=>data.accounts.find(a=>a.id===g.accountId)?.kind!=='investment');
const depositAccounts=()=>data.accounts.filter(a=>DEPOSIT_TO_KINDS.includes(a.kind)).sort((a,b)=>DEPOSIT_TO_KINDS.indexOf(a.kind)-DEPOSIT_TO_KINDS.indexOf(b.kind));
function depositTarget(v){const [k,id]=String(v.target||'').split(':');return {goal:k==='goal'?(data.goals||[]).find(g=>g.id===id)||null:null,account:k==='acc'?data.accounts.find(a=>a.id===id)||null:null};}
const autoDepositName=v=>{const t=depositTarget(v);return t.goal?`הפקדה ל${t.goal.name}`:t.account?`הפקדה ל${t.account.name}`:'';};
// A deposit needs a target and a source; a goal brings its planned monthly amount, an unlinked goal a savings account.
function withDepositDefaults(v){
  if(v.kind!=='transfer')return v;
  const next={...v};let t=depositTarget(next);
  if(!t.goal&&!t.account){const a=depositAccounts().find(x=>x.kind==='savings'),g=depositGoals()[0];next.target=a?`acc:${a.id}`:g?`goal:${g.id}`:depositAccounts()[0]?`acc:${depositAccounts()[0].id}`:'';t=depositTarget(next);}
  if(t.goal&&(next.amount===''||next.amount==null)&&t.goal.monthly>0)next.amount=t.goal.monthly;
  const to=t.account||(t.goal&&data.accounts.find(a=>a.id===t.goal.accountId));
  if(t.goal&&!to&&next.dest==null)next.dest=depositAccounts().find(a=>a.kind==='savings')?.id||'';
  const sources=depositSources().filter(a=>a.id!==(to?.id||next.dest));
  if(!sources.some(a=>a.id===next.from))next.from=sources.find(a=>a.kind==='bank')?.id||sources[0]?.id||'';
  if(!next.name||next.name===next.autoName)next.name=autoDepositName(next);
  return next;
}
// The form's values as strings, from a stored bill (edit) or from the defaults and a prefill (new). Day 1 by default.
function billDraft(id,prefill={}){
  const existing=id?moneyItems('bills').find(x=>x.id===id):null,bank=data.accounts.find(a=>a.kind==='bank')?.id||'';
  if(existing){
    const kind=billKind(existing),left=billRemaining(existing);
    return {id,kind,name:existing.name,amount:existing.amount,frequency:existing.frequency,day:existing.day,startMonth:existing.startMonth||today().slice(0,7),category:existing.category||defaultCategory(kind),accountId:existing.accountId||'',autopay:!!existing.autopay,confirm:existing.confirm??kind==='income',remaining:left==null?'':left,
      target:existing.goalId?`goal:${existing.goalId}`:existing.toAccountId?`acc:${existing.toAccountId}`:'',from:existing.accountId||bank,dest:existing.goalId?existing.toAccountId||'':undefined,touched:'autopay,confirm',autoName:kind==='transfer'&&existing.name===autoDepositName({target:existing.goalId?`goal:${existing.goalId}`:`acc:${existing.toAccountId}`})?existing.name:''};
  }
  const kind=prefill.kind||'expense';
  return withDepositDefaults({kind,name:'',amount:'',frequency:'monthly',day:1,startMonth:today().slice(0,7),category:defaultCategory(kind),accountId:bank,autopay:kind!=='expense',confirm:kind==='income',remaining:'',target:'',from:bank,touched:'',...prefill});
}
function billFormValues(form){
  const f=new FormData(form),v={id:form.dataset.id||''};
  for(const [k,value] of f)v[k]=String(value);
  v.autopay=f.get('autopay')==='on';v.confirm=f.get('confirm')==='on';
  if(!form.querySelector('[name=dest]'))delete v.dest;
  return v;
}
// Switching the kind keeps what was typed; defaults the user did not touch follow the new kind.
function switchBillKind(v,kind){
  const touched=String(v.touched||'').split(','),next={...v,kind};
  if(!touched.includes('autopay'))next.autopay=kind!=='expense';
  if(!touched.includes('confirm'))next.confirm=kind==='income';
  if(!v.category||v.category===defaultCategory(v.kind))next.category=defaultCategory(kind);
  if(!next.accountId)next.accountId=v.from||data.accounts.find(a=>a.kind==='bank')?.id||'';
  if(v.kind==='transfer'&&v.name===v.autoName)next.name='';
  if(kind==='transfer'&&v.accountId&&depositSources().some(a=>a.id===v.accountId))next.from=v.accountId;
  return withDepositDefaults(next);
}
// What will happen, in one sentence that follows the form as it is typed.
function billNote(v){
  const amount=Number(v.amount),day=Math.round(Number(v.day)),frequency=freqLabels[v.frequency]?v.frequency:'monthly';
  if(!(amount>0)||!(day>=1&&day<=31))return '';
  const first=nextBillDate({frequency,day,startMonth:v.startMonth},today()),when=frequency==='monthly'?`ב־${day} בכל חודש`:`${freqLabels[frequency]}, ב־${day} בחודש`;
  const firstText=first?` ${v.id?'הפעם הבאה':'הפעם הראשונה'}: ${dateLabel(first)}.`:'',value=amt(amount);
  if(v.kind==='transfer'){
    const t=depositTarget(v),from=billAccountName(v.from),linked=t.goal&&data.accounts.find(a=>a.id===t.goal.accountId),to=t.account||linked||(t.goal&&data.accounts.find(a=>a.id===v.dest));
    if(t.goal&&!to)return `${when} יתווספו ${value} ל״כבר בחיסכון״ של ״${e(t.goal.name)}״. אף חשבון באופק לא משתנה.${firstText}`;
    if(!to)return '';
    return `${when} יעברו ${value} מ־${e(from)} ל־${e(to.name)}${t.goal?`, לטובת ״${e(t.goal.name)}״`:''}. זו העברה בין החשבונות שלך — לא הוצאה ולא הכנסה.${firstText}`;
  }
  const income=v.kind==='income',account=billAccountName(v.accountId);
  if(!v.autopay)return `${when} זה יופיע בלוח התשלומים, ותסמן ״${income?'התקבל':'שולם'}״ כש${income?'זה ייכנס':'תשלם'}.${firstText}`;
  if(!account)return 'כדי שאופק תרשום את זה לבד, בחר חשבון.';
  return `${when} אופק תרשום ${income?'הכנסה':'הוצאה'} של ${value} ${income?'ל':'מ'}${e(account)}${v.confirm?` ותשאל אותך כמה ${income?'נכנס':'ירד'} בדיוק`:''}.${firstText}`;
}
function billFormHTML(id,v){
  const kind=v.kind,deposit=kind==='transfer',income=kind==='income',t=depositTarget(v),unlinked=!!t.goal&&!data.accounts.some(a=>a.id===t.goal.accountId);
  const tabs=`<div class="segmented full bill-kinds" role="radiogroup" aria-label="מה מוסיפים?">${BILL_KIND_TABS.map(([k,label,ic])=>`<button type="button" role="radio" aria-checked="${k===kind}" class="${k===kind?'active':''}" data-action="bill-kind:${k}">${icon(ic,15)}<span>${label}</span></button>`).join('')}</div>`;
  const hidden=`<input type="hidden" name="kind" value="${kind}"><input type="hidden" name="touched" value="${e(v.touched||'')}"><input type="hidden" name="autoName" value="${e(deposit?autoDepositName(v):'')}">`;
  const when=field(income?'כמה נכנס בכל פעם? (₪)':deposit?'כמה להפקיד בכל פעם? (₪)':'סכום לכל חיוב (₪)',input('amount',v.amount,'number','required min="0.01" step="any" inputmode="decimal"'))
    +field('באיזה יום בחודש?',input('day',v.day,'number','required min="1" max="31" step="1" inputmode="numeric"'),'בחודש קצר — היום האחרון בחודש')
    +field('כל כמה זמן?',select('frequency',Object.entries(freqLabels),v.frequency,'data-bill-redraw'))
    +(v.frequency!=='monthly'?field('חודש שבו היה חיוב',input('startMonth',v.startMonth||today().slice(0,7),'month'),'קובע את המחזור'):`<input type="hidden" name="startMonth" value="${e(v.startMonth||'')}">`);
  const left=field('כמה תשלומים נשארו? (לא חובה)',input('remaining',v.remaining,'number','min="0" max="120" step="1" inputmode="numeric"'),deposit?'ריק — בלי סוף. למשל: 12 הפקדות ואז עוצרים.':'ריק — בלי סוף. למשל: מנוי שנגמר אחרי 3 חיובים.');
  let body;
  if(deposit){
    const goals=depositGoals(),accounts=depositAccounts();
    const target=`<select name="target" required data-bill-redraw>${goals.length?`<optgroup label="יעדים">${options(goals.map(g=>[`goal:${g.id}`,g.name]),v.target)}</optgroup>`:''}${accounts.length?`<optgroup label="חשבונות">${options(accounts.map(a=>[`acc:${a.id}`,a.name.includes(accountKinds[a.kind])?a.name:`${a.name} · ${accountKinds[a.kind]}`]),v.target)}</optgroup>`:''}</select>`;
    const linkedName=t.goal&&!unlinked?billAccountName(t.goal.accountId):'';
    body=field('לאן להפקיד?',target,linkedName?`היעד מקושר ל״${linkedName}״ — לשם יעבור הכסף.`:'')
      +(unlinked?field('לאיזה חשבון הכסף עובר?',select('dest',[...accounts.map(a=>[a.id,a.name]),['','לא לחשבון באופק — רק להוסיף ליעד']],v.dest??'','data-bill-redraw'),`היעד ״${t.goal.name}״ לא מקושר לחשבון, אז הסכום יתווסף גם ל״כבר בחיסכון״ שלו.`):'')
      +field('מאיזה חשבון?',select('from',depositSources().map(a=>[a.id,a.name]),v.from))
      +when+field('שם',input('name',v.name,'text','maxlength="80"'))+left;
  }else{
    const accounts=trackedAccounts().filter(a=>!income||a.kind!=='credit');
    body=field('שם',input('name',v.name,'text',`required maxlength="80" placeholder="${income?'למשל: משכורת':'למשל: ארנונה'}"`))+when
      +field('קטגוריה',select('category',data.categories.includes(v.category)||!v.category?data.categories:[...data.categories,v.category],v.category))
      +field(income?'נכנס לחשבון':'יורד מחשבון / כרטיס',select('accountId',[['','ללא'],...accounts.map(a=>[a.id,a.name])],v.accountId))+left
      +`<label class="check-field"><input name="autopay" type="checkbox" data-touch="autopay" ${v.autopay?'checked':''}>${income?'נכנס אוטומטית — אופק תרשום את ההכנסה לבד ביום שבחרת':'חיוב אוטומטי — אופק תרשום אותו לבד ביום החיוב'}</label>`
      +`<label class="check-field"><input name="confirm" type="checkbox" data-touch="confirm" ${v.confirm?'checked':''}>לשאול אותי כמה בדיוק ${income?'נכנס':'ירד'}</label>`;
  }
  return `<form id="bill-form" data-id="${e(id||'')}"><div class="form-error"></div>${tabs}${hidden}<p class="bill-kind-hint">${e(BILL_KIND_HINTS[kind])}</p><div class="form-grid">${body}</div><p class="bill-note" id="bill-note" aria-live="polite">${billNote(v)}</p><div class="form-actions">${submit(id?'שמירה':'הוספה',id?'Save':'Plus')}${btn('ביטול','dialog-close')}</div></form>`;
}
function openBillForm(id=null,prefill={}){
  const v=billDraft(id,prefill);
  showDialog(billDialogTitle(v.kind,!!id),billFormHTML(id,v),true);
}
function redrawBillForm(form,patch={}){
  const id=form.dataset.id||null,current=billFormValues(form);
  const v=patch.kind&&patch.kind!==current.kind?switchBillKind(current,patch.kind):withDepositDefaults({...current,...patch});
  form.outerHTML=billFormHTML(id,v);
  const title=document.querySelector('dialog .modal-head h2');if(title)title.textContent=billDialogTitle(v.kind,!!id);
  document.querySelector('dialog')?.setAttribute('aria-label',billDialogTitle(v.kind,!!id));
}
function saveBillForm(form){
  const id=form.dataset.id||null,previous=id?moneyItems('bills').find(x=>x.id===id):null,now=today();
  const bill=makeBill(data,billFormValues(form),previous,now),kind=billKind(bill),first=nextBillDate(bill,now),day=bill.frequency==='monthly'?`ב־${bill.day} בכל חודש`:`ב־${bill.day} בחודש`;
  const message=previous?'השינויים נשמרו':kind==='transfer'?`ההפקדה הקבועה נשמרה: ${money(bill.amount)} ${day}${first?` · הראשונה ב־${dateLabel(first)}`:''}`:kind==='income'?`ההכנסה הקבועה נוספה${bill.autopay&&first?` · תירשם לבד ב־${dateLabel(first)}`:''}`:'התשלום הקבוע נוסף ללוח';
  mutate(next=>{const i=next.bills.findIndex(x=>x.id===bill.id);if(i>=0)next.bills[i]=bill;else next.bills.push(bill);},message,previous?{undo:true}:{});
  closeDialog();
}
// "הפקדה חודשית אוטומטית" from a goal or a savings card: the deposit form, preset (the existing one when there is).
// Also a click action: data-action="deposit-auto:goal:<goalId>" or "deposit-auto:acc:<accountId>".
export function openRecurringDeposit({goalId='',accountId=''}={}){
  const existing=depositBillFor(data,{goalId,accountId});
  if(existing){openBillForm(existing.id);return;}
  const goal=goalId?(data.goals||[]).find(g=>g.id===goalId):null,account=accountId?data.accounts.find(a=>a.id===accountId):null;
  openBillForm(null,{kind:'transfer',target:goal?`goal:${goal.id}`:account?`acc:${account.id}`:'',day:1});
}
// One line for a goal or a savings card: the standing deposit that feeds it, if any (with its edit action).
export function recurringDepositLine({goalId='',accountId=''}={}){
  const b=depositBillFor(data,{goalId,accountId});if(!b)return '';
  const off=b.active===false?' · מושהית':billEnded(b)?' · הסתיימה':'';
  return `<div class="bill-standing">${icon('Repeat',14)}<span>הפקדה אוטומטית: ${amt(b.amount)} ${b.frequency==='monthly'?`ב־${b.day} בכל חודש`:`${e(freqLabels[b.frequency])}, ב־${b.day} בחודש`}${off}</span>${textBtn('עריכה','bill-edit:'+b.id)}</div>`;
}
function openPayDialog(billId,date){
  const b=moneyItems('bills').find(x=>x.id===billId);if(!b)return;
  const kind=billKind(b),deposit=kind==='transfer',income=kind==='income',accounts=deposit?depositSources():trackedAccounts();
  const title=deposit?'סימון הפקדה שבוצעה':income?'סימון הכנסה שהתקבלה':'סימון תשלום ששולם',record=deposit?'לרשום את ההפקדה (העברה בין החשבונות שלך)':`לרשום כ${income?'הכנסה':'הוצאה'} בתנועות`;
  showDialog(title,`<form id="bill-pay-form" data-bill="${e(billId)}" data-date="${e(date)}"><div class="form-error"></div><p class="confirm-text">${e(b.name)} · ${dateLabel(date)}${deposit?' · '+e(depositPath(b)):''}</p><div class="form-grid">${field(deposit?'כמה הופקד? (₪)':'סכום בפועל (₪)',input('amount',b.amount,'number','required min="0.01" step="any"'))}${field('תאריך',input('date',date>today()?today():date,'date',`required max="${today()}"`))}${accounts.length?field(deposit?'מאיזה חשבון?':'חשבון',select('accountId',accounts.map(a=>[a.id,a.name]),accounts.some(a=>a.id===b.accountId)?b.accountId:accounts[0].id)):''}<label class="check-field"><input type="checkbox" name="record" ${accounts.length?'checked':'disabled'}>${record}</label></div><div class="form-actions">${submit(paidWord(kind),'Check')}${btn('ביטול','dialog-close')}</div></form>`);
}
function savePayForm(form){
  const f=new FormData(form),billId=form.dataset.bill,occurrence=form.dataset.date,record=f.get('record')==='on';
  const values={record,amount:Number(f.get('amount')),date:String(f.get('date')||''),accountId:String(f.get('accountId')||'')};
  if(!(values.amount>0))throw Error('יש להזין סכום חיובי.');
  if(!validDate(values.date)||values.date>today())throw Error('יש לבחור תאריך שאינו בעתיד.');
  const deposit=isDepositBill(moneyItems('bills').find(x=>x.id===billId));
  mutate(next=>{markBillPaid(next,billId,occurrence,values,today());},record?(deposit?`ההפקדה נרשמה: ${money(values.amount)} · ${billName(billId)}`:`${billName(billId)} נרשם והיתרה עודכנה`):'סומן בלוח התשלומים',{undo:true});
  closeDialog();
}
// The "כמה בדיוק?" actions (§D.4); each one can be undone from the toast.
function saveConfirmForm(form){
  const id=form.dataset.tx,t=data.transactions.find(x=>x.id===id);if(!t)throw Error('הרישום כבר לא קיים.');
  const amount=Number(new FormData(form).get('amount'));if(!(amount>0))throw Error('יש להזין סכום חיובי.');
  const changed=Math.abs(Math.round(amount*100)/100-t.amount)>.004;
  if(form.closest('dialog'))closeDialog();
  mutate(next=>{confirmAutoAmount(next,id,amount);},changed?`עודכן ל־${money(amount,t.currency||'ILS',Number.isInteger(amount)?0:2)}.`:'מעולה — נשמר.',{undo:true});
}
function holdAuto(id){
  const t=data.transactions.find(x=>x.id===id);if(!t)throw Error('הרישום כבר לא קיים.');
  mutate(next=>{holdAutoBill(next,id);},t.type==='income'?'הורדנו את הרישום. תוכל לסמן ״התקבל״ בלוח התשלומים כשזה ייכנס.':'הורדנו את הרישום. תוכל לסמן ״שולם״ בלוח התשלומים כשזה ירד.',{undo:true});
}
function dropAuto(id){mutate(next=>{dropAutoCard(next,id);},'החיוב נמחק. הסכום נשאר כחוב בכרטיס עד החיוב הבא.',{undo:true});}
function openAutoAmount(id){
  const t=data.transactions.find(x=>x.id===id&&x.auto);if(!t)throw Error('הרישום כבר לא קיים.');
  showDialog(confirmTitle(t),`<form id="auto-amount-form" class="confirm-form" data-tx="${e(id)}"><div class="form-error"></div><p class="confirm-text">רשמנו ${amt(t.amount,t.currency||'ILS',Number.isInteger(t.amount)?0:2)} ב־${dateLabel(t.date)}. כמה ${t.type==='income'?'נכנס':'ירד'} בפועל?</p><div class="form-grid">${field('הסכום בפועל',`<span class="currency-input"><input name="amount" type="number" inputmode="decimal" min="0.01" step="any" required value="${e(t.amount)}"><span>${(t.currency||'ILS')==='USD'?'$':'₪'}</span></span>`)}</div><div class="form-actions">${submit('זה הסכום','Check')}${btn('ביטול','dialog-close')}</div></form>`);
}
const billName=id=>moneyItems('bills').find(x=>x.id===id)?.name||'התשלום';

// ---------- Shared expenses ----------
const currentGroup=()=>moneyItems('groups').find(g=>g.id===ui.splitGroup)||null;
const memberLabel=(g,id)=>{const m=g.members.find(x=>x.id===id);return m?(m.me?'אני':m.name):'—';};
// A stable colour per group (1-6 → --chart-N tokens), so it does not change when the list order does.
const groupTone=g=>[...String(g.id)].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7)%6+1;
function groupCard(g,i){
  const s=groupSummary(g),status=s.myBalance>.009?badge(`חייבים לך ${exact(s.myBalance)}`,'green'):s.myBalance<-.009?badge(`אתה חייב ${exact(-s.myBalance)}`,'red'):badge('מאוזן','neutral');
  return `<button type="button" class="card split-card" data-action="group-open:${e(g.id)}"><div class="row-between"><span class="group-avatar" data-tone="${groupTone(g)}">${e(g.name.slice(0,1))}</span>${status}</div><h3>${e(g.name)}</h3><div class="member-row">${g.members.slice(0,6).map(m=>`<span class="member-dot" title="${e(m.name)}">${e(m.name.slice(0,1))}</span>`).join('')}${g.members.length>6?`<span class="member-dot">+${g.members.length-6}</span>`:''}</div><div class="split-card-foot"><span>${g.expenses.length} הוצאות</span><b dir="ltr">${money(s.total)}</b></div></button>`;
}
function splitView(){
  const groups=moneyItems('groups'),g=currentGroup();
  if(g)return splitGroupView(g);
  const t=splitTotals(data),total=groups.reduce((s,x)=>s+groupSummary(x).total,0);
  return `<div class="three-metrics">${metric('חייבים לך',exact(t.owedToMe),'סך היתרות לטובתך בכל הקבוצות','ArrowDownLeft','green')}${metric('אתה חייב',exact(t.iOwe),t.iOwe>0?'כדאי לסגור בקרוב':'אין לך חובות פתוחים','ArrowUpLeft','purple')}${metric('הוצאות משותפות',money(total),`${groups.length} קבוצות`,'ArrowLeftRight')}</div>
  <div class="section-head"><div><h2>הקבוצות שלך</h2>${groups.length?`<p>${groups.length===1?'קבוצה אחת':`${groups.length} קבוצות`} · ${(open=>open?`${open===1?'אחת':open} עם חשבון פתוח`:'הכול סגור')(groups.filter(x=>groupSummary(x).transfers.length).length)}</p>`:''}</div><div class="actions">${aiReady()&&groups.length?btn('מי חייב למי?','ai-prompt:split','Sparkles'):''}${btn('קבוצה חדשה','group-new','Plus','primary')}</div></div>
  ${groups.length?`<div class="split-grid">${groups.map(groupCard).join('')}</div>`:card(empty('עוד אין קבוצות','צרו קבוצה לטיול, לדירה משותפת או לאירוע. מוסיפים הוצאות, ואופק מחשב מי חייב למי ואיך לסגור בכמה שפחות העברות.',btn('קבוצה ראשונה','group-new','','primary')))}`;
}
function splitGroupView(g){
  const s=groupSummary(g),max=Math.max(1,...Object.values(s.net).map(Math.abs)),expenses=[...g.expenses].sort((a,b)=>b.date.localeCompare(a.date));
  const people=x=>{const shares=expenseShares(g,x),ids=Object.keys(shares);return x.split==='exact'?'חלוקה מדויקת':ids.length===g.members.length?'כולם':ids.map(id=>memberLabel(g,id)).join(', ');};
  return `<div class="group-head"><button type="button" class="text-button back" data-action="group-close">${icon('ChevronRight',15)}כל הקבוצות</button><div class="group-title"><span class="group-avatar">${e(g.name.slice(0,1))}</span><div><h2>${e(g.name)}</h2><p class="muted">${g.members.map(m=>e(m.me?'אני':m.name)).join(' · ')}</p></div></div><div class="actions">${btn('שיתוף סיכום','group-share','Upload')}${btn('עריכה','group-edit','Edit3')}${btn('הוצאה חדשה','gx-new','Plus','primary')}</div></div>
  <div class="three-metrics">${metric('סך ההוצאות',money(s.total),`${g.expenses.length} הוצאות`,'Receipt')}${s.me?metric('החלק שלך',exact(s.myShare),'כמה הקבוצה באמת עלתה לך','PiggyBank','purple'):''}${s.me?metric(s.myBalance>=-.009?'חייבים לך':'אתה חייב',exact(Math.abs(s.myBalance)),s.myBalance>.009?'אחרי כל ההחזרים שסומנו':s.myBalance<-.009?'כדאי להעביר בקרוב':'הכול מאוזן','Wallet',s.myBalance<-.009?'red':'green'):''}</div>
  <div class="split-layout">${card(head('הוצאות','',aiReady()?btn('סריקת קבלה','ai-attach','ScanLine'):'')+(expenses.length?`<div class="table-wrap"><table><thead><tr><th>הוצאה</th><th>שילם</th><th>מתחלק בין</th><th>סכום</th><th aria-label="פעולות"></th></tr></thead><tbody>${expenses.map(x=>`<tr><td><b>${e(x.description)}</b><small class="muted">${dateLabel(x.date)}</small></td><td data-label="שילם">${e(memberLabel(g,x.paidBy))}</td><td class="muted" data-label="מתחלק בין">${e(people(x))}</td><td data-label="סכום"><b dir="ltr">${exact(x.amount)}</b></td><td><div class="table-actions">${ib('Pencil','עריכת ההוצאה','gx-edit:'+x.id)}${ib('Trash2','מחיקת ההוצאה','gx-remove:'+x.id)}</div></td></tr>`).join('')}</tbody></table></div>`:empty('עוד אין הוצאות','מי שילם על מה? מוסיפים כל הוצאה, וחלוקה שווה או מדויקת מחושבת אוטומטית.',btn('הוצאה ראשונה','gx-new','','primary'))),'split-expenses')}
  <div class="split-side">${card(head('המאזן בקבוצה','חיובי — מגיע לו כסף. שלילי — הוא חייב.')+`<div class="balances">${g.members.map(m=>{const v=s.net[m.id]||0;return `<div class="balance-row"><span>${e(m.me?'אני':m.name)}</span><div class="balance-bar"><span class="${v>=0?'pos':'neg'}" style="width:${Math.abs(v)/max*50}%"></span></div><b dir="ltr" class="${v>.009?'positive':v<-.009?'negative':'muted'}">${v>.009?'+':v<-.009?'−':''}${exact(Math.abs(v))}</b></div>`;}).join('')}</div>`)}
  ${card(head('איך סוגרים חשבון?',s.transfers.length?`${s.transfers.length} העברות וסיימנו`:'')+(s.transfers.length?`<div class="transfers">${s.transfers.map((t,i)=>`<div class="transfer"><b>${e(memberLabel(g,t.from))}</b>${icon('ChevronLeft',15)}<b>${e(memberLabel(g,t.to))}</b><span dir="ltr">${exact(t.amount)}</span><button type="button" class="pay-button" data-action="settle:${i}">סומן כשולם</button></div>`).join('')}</div>`:`<div class="all-clear">${icon('Check',20)}<div><b>הכול מאוזן</b><small>אף אחד לא חייב כלום לאף אחד.</small></div></div>`)+((g.settlements||[]).length?`<details class="settled"><summary>${g.settlements.length} החזרים שסומנו</summary>${g.settlements.map(x=>`<div><span>${e(memberLabel(g,x.from))} ← ${e(memberLabel(g,x.to))}</span><b dir="ltr">${exact(x.amount)}</b><small>${dateLabel(x.date)}</small></div>`).join('')}</details>`:''))}</div></div>
  <div class="danger-zone">${btn('מחיקת הקבוצה','group-remove','Trash2','danger')}</div>`;
}
function openGroupForm(id=null){
  const g=id?moneyItems('groups').find(x=>x.id===id):null;
  showDialog(g?'עריכת קבוצה':'קבוצה חדשה',`<form id="group-form" data-id="${e(id||'')}"><div class="form-error"></div><div class="form-grid">${field('שם הקבוצה',input('name',g?.name||'','text','required placeholder="למשל: טיול לאילת"'),'','full')}${field(g?'הוספת משתתפים':'מי עוד בקבוצה?',`<textarea name="members" rows="2" placeholder="נועה, עומר, מיכל"></textarea>`,g?'שמות מופרדים בפסיק.':'שמות מופרדים בפסיק. את/ה כבר בקבוצה בתור ״אני״.','full')}${g?`<div class="field full"><span>משתתפים</span><div class="member-chips">${g.members.map(m=>`<span class="category-pill">${e(m.me?'אני':m.name)}</span>`).join('')}</div></div>`:''}</div><div class="form-actions">${submit(g?'שמירה':'יצירת קבוצה')}${btn('ביטול','dialog-close')}</div></form>`);
}
function saveGroupForm(form){
  const f=new FormData(form),id=form.dataset.id,name=String(f.get('name')||'').trim(),names=[...new Set(String(f.get('members')||'').split(/[,،\n]/).map(s=>s.trim()).filter(Boolean))];
  if(!name)throw Error('יש להזין שם לקבוצה.');
  mutate(next=>{
    let g=next.groups.find(x=>x.id===id);
    if(!g){if(!names.length)throw Error('יש להוסיף לפחות משתתף אחד מלבדך.');g={id:uid(),name,created:today(),members:[{id:uid(),name:'אני',me:true}],expenses:[],settlements:[]};next.groups.push(g);ui.splitGroup=g.id;}
    g.name=name;
    for(const n of names){if(n==='אני'||g.members.some(m=>m.name===n))throw Error(`״${n}״ כבר בקבוצה.`);g.members.push({id:uid(),name:n});}
  },id?'הקבוצה עודכנה':'הקבוצה נוצרה — אפשר להוסיף הוצאות',id?{undo:true}:{});
  closeDialog();
}
function openSplitExpense(expenseId=null){
  const g=currentGroup();if(!g)return;
  const x=expenseId?g.expenses.find(v=>v.id===expenseId):null,me=g.members.find(m=>m.me),shares=x?expenseShares(g,x):null,chosen=x?Object.keys(shares):g.members.map(m=>m.id),accounts=trackedAccounts();
  showDialog(x?'עריכת הוצאה משותפת':'הוצאה משותפת חדשה',`<form id="gx-form" data-id="${e(expenseId||'')}"><div class="form-error"></div><div class="form-grid">${field('על מה?',input('description',x?.description||'','text','required placeholder="ארוחת ערב, מלון, דלק…"'))}${field('סכום כולל (₪)',input('amount',x?.amount??'','number','required min="0.01" step="any"'))}${field('מי שילם?',select('paidBy',g.members.map(m=>[m.id,m.me?'אני':m.name]),x?.paidBy||me?.id||g.members[0].id))}${field('תאריך',input('date',x?.date||today(),'date',`required max="${today()}"`))}<div class="field full"><span>מתחלק בין</span><div class="share-rows">${g.members.map(m=>`<label class="share-row"><input type="checkbox" name="p_${e(m.id)}" ${chosen.includes(m.id)?'checked':''}><span>${e(m.me?'אני':m.name)}</span><input type="number" name="s_${e(m.id)}" min="0" step="any" placeholder="חלק שווה" value="${x?.split==='exact'?e(shares[m.id]??''):''}" aria-label="סכום מדויק עבור ${e(m.name)}"></label>`).join('')}</div><small>השאר את הסכומים ריקים לחלוקה שווה, או מלא סכום מדויק לכל מי שמסומן.</small></div>${me&&!x&&accounts.length?`<label class="check-field full"><input type="checkbox" name="record">לרשום את החלק שלי כהוצאה באופק</label>${field('מאיזה חשבון',select('accountId',accounts.map(a=>[a.id,a.name]),accounts.find(a=>a.kind==='bank')?.id||accounts[0].id))}${field('קטגוריה',select('category',data.categories,data.categories.includes('בילויים')?'בילויים':data.categories[0]))}<small class="muted full">רק החלק שלך נרשם כהוצאה. החזרים בין חברים אינם משנים יתרות באופק.</small>`:''}</div><div class="form-actions">${submit()}${btn('ביטול','dialog-close')}</div></form>`,true);
}
function saveSplitExpense(form){
  const g=currentGroup();if(!g)throw Error('הקבוצה לא נמצאה.');
  const f=new FormData(form),id=form.dataset.id,amount=Math.round(Number(f.get('amount'))*100)/100,description=String(f.get('description')||'').trim(),date=String(f.get('date')||''),paidBy=String(f.get('paidBy')||'');
  if(!description)throw Error('יש לתאר את ההוצאה.');
  if(!(amount>0))throw Error('יש להזין סכום חיובי.');
  if(!validDate(date)||date>today())throw Error('יש לבחור תאריך שאינו בעתיד.');
  const chosen=g.members.filter(m=>f.get('p_'+m.id)==='on').map(m=>m.id);
  if(!chosen.length)throw Error('יש לבחור לפחות משתתף אחד.');
  const typed=chosen.map(mid=>String(f.get('s_'+mid)||'').trim());
  let expense={id:id||uid(),description,amount,paidBy,date};
  if(typed.some(Boolean)){
    if(typed.some(v=>v===''))throw Error('בחלוקה מדויקת יש למלא סכום לכל משתתף מסומן.');
    const shares=Object.fromEntries(chosen.map((mid,i)=>[mid,Math.round(Number(typed[i])*100)/100]));
    if(Object.values(shares).some(v=>!(v>=0)))throw Error('סכומי החלוקה צריכים להיות חיוביים.');
    const total=Object.values(shares).reduce((s,v)=>s+v,0);
    if(Math.abs(total-amount)>.01)throw Error(`סכומי החלוקה (${money(total,'ILS',2)}) צריכים להסתכם ב־${money(amount,'ILS',2)}.`);
    expense={...expense,split:'exact',shares};
  }else if(chosen.length<g.members.length)expense.participants=chosen;
  const me=g.members.find(m=>m.me),record=f.get('record')==='on'&&me&&chosen.includes(me.id);
  mutate(next=>{
    const group=next.groups.find(x=>x.id===g.id),i=group.expenses.findIndex(v=>v.id===expense.id);
    if(i>=0)group.expenses[i]=expense;else group.expenses.push(expense);
    if(record){
      const accountId=String(f.get('accountId')||''),share=Math.round(expenseShares(group,expense)[me.id]*100)/100,category=String(f.get('category')||'בילויים');
      if(!accountId)throw Error('יש לבחור חשבון.');
      if(share>0){const t={id:uid(),type:'expense',amount:share,currency:'ILS',fx:next.fx,date,category,subcategory:'',accountId,description:`${description} · ${group.name}`,tags:['חלוקת הוצאות'],recurring:false};applyTransaction(next,t);next.transactions.push(t);}
    }
  },id?'ההוצאה עודכנה':record?'ההוצאה נוספה, והחלק שלך נרשם בתנועות':'ההוצאה נוספה לקבוצה',id?{undo:true}:{});
  closeDialog();
}
function splitShareText(g){
  const s=groupSummary(g),name=id=>{const m=g.members.find(x=>x.id===id);return m?.me?(data.profile||'אני'):m?.name||'';};
  return plainText([`${g.name} — סיכום הוצאות`,`סה״כ ${money(s.total)}`,'',...[...g.expenses].sort((a,b)=>a.date.localeCompare(b.date)).slice(-25).map(x=>`• ${x.description}: ${exact(x.amount)} (שילם/ה ${name(x.paidBy)})`),'',s.transfers.length?'כדי לסגור חשבון:':'הכול מאוזן 🎉',...s.transfers.map(t=>`${name(t.from)} מעביר/ה ל${name(t.to)} ${exact(t.amount)}`),'','נשלח מאופק'].join('\n'));
}
function openShareDialog(g){
  const text=splitShareText(g);
  showDialog('שיתוף סיכום הקבוצה',`<textarea id="share-text" class="share-text" rows="10" readonly>${e(text)}</textarea><div class="form-actions">${btn('העתקה','share-copy','Download','primary')}<a class="button" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer">${icon('Send',17)}<span>שליחה בוואטסאפ</span></a>${btn('סגירה','dialog-close')}</div>`);
}

// ---------- Smart purchases & wishlist ----------
const buyVerdicts={green:['אפשר בנחת','הקנייה נכנסת בנוחות במה שנשאר החודש, וכרית הביטחון נשארת יציבה.','green'],yellow:['אפשר — אבל כדאי לחשוב פעמיים','זה חלק משמעותי ממה שנשאר החודש. אפשר לחכות לחודש הבא, לפרוס לתשלומים או להוסיף לרשימה.','gold'],red:['לא עכשיו','הקנייה חורגת ממה שנשאר החודש או מקטינה מדי את כרית הביטחון. הוסף לרשימה ותן לזה 30 יום.','red']};
function buyResultHTML(){
  const b=ui.buy||{};
  if(!(Number(b.price)>0))return `<div class="buy-placeholder">${icon('ShoppingBag',22)}<span>הזן מחיר כדי לראות כמה זה באמת עולה לך — בשעות עבודה, בתקציב ובעתיד.</span></div>`;
  let r;try{r=purchaseCheck(data,{price:b.price,installments:b.installments});}catch(err){return notice(err.message,'error');}
  const [title,text,color]=buyVerdicts[r.verdict];
  const facts=[
    r.hours!=null?['בשעות עבודה',`כ־${Math.max(1,Math.round(r.hours)).toLocaleString('he-IL')} שעות`,'לפי ההכנסה הממוצעת שלך']:null,
    ['עלות חודשית',safe(amt(r.monthlyCost)),r.installments>1?`${r.installments} תשלומים`:'תשלום אחד'],
    ['מתוך מה שנשאר החודש',r.shareOfAvailable==null?'לא נשאר תקציב':pct(r.shareOfAvailable),safe(`נשארו ${amt(Math.max(0,r.available))} מהיעד החודשי`)],
    r.coverAfter!=null?['כרית ביטחון אחרי',`${Math.max(0,r.coverAfter).toLocaleString('he-IL',{maximumFractionDigits:1})} חודשים`,'כסף נזיל ביחס להוצאות']:null,
    ['אם היה מושקע',safe(`${amt(r.opportunity10)} · ${amt(r.opportunity20)}`),'בעוד 10 · 20 שנה, בתשואה ריאלית של 5%'],
    r.goal?['עיכוב ביעד',`${r.goal.delayMonths.toLocaleString('he-IL',{maximumFractionDigits:1})} חודשים`,`ליעד ״${r.goal.name}״`]:null
  ].filter(Boolean);
  return `<div class="verdict ${r.verdict}"><span class="asset-icon ${color}">${icon(r.verdict==='green'?'Check':r.verdict==='yellow'?'Info':'TriangleAlert',20)}</span><div><b>${title}</b><small>${text}</small></div></div><div class="buy-facts">${facts.map(([l,v,s])=>`<div><span>${e(l)}</span><b>${e(v)}</b><small>${e(s)}</small></div>`).join('')}</div><div class="actions">${btn('לרשימה ל־30 יום','wish-from-check','Target','primary')}${aiReady()?btn('לשאול את Claude','ai-buy','Sparkles'):''}</div>`;
}
function wishCard(w){
  const s=wishStatus(w),done=w.status!=='waiting',safeUrl=/^https?:\/\//i.test(w.url||'')?w.url:'';
  const status=w.status==='skipped'?badge('ויתרת — נחסך','green'):w.status==='bought'?badge('נקנה','neutral'):s.isReady?badge('הצינון הסתיים','gold'):badge(`עוד ${s.left} ימים`,'purple');
  return card(`<div class="row-between"><span class="category-pill">${e(priorityLabels[w.priority]||'רצוי')}</span>${status}</div><h3>${e(w.name)}</h3><div class="wish-price" dir="ltr">${money(w.price)}</div>${w.note?`<p class="muted small">${e(w.note)}</p>`:''}${safeUrl?`<a class="text-button" href="${e(safeUrl)}" target="_blank" rel="noopener noreferrer">לקישור${icon('ChevronLeft',13)}</a>`:''}${done?'':`<div class="cooling">${progress(s.progress*100,s.isReady?'green':'purple')}<small>${s.isReady?'עברו הימים. עדיין רוצה את זה?':`נוסף ב־${dateLabel(w.added)} · אפשר להחליט ב־${dateLabel(s.ready)}`}</small></div>`}<div class="wish-actions">${done?ib('Trash2','מחיקה','wish-remove:'+w.id):`${btn('קניתי','wish-bought:'+w.id,'Check')}${btn('ויתרתי','wish-skip:'+w.id,'X')}${ib('Target','הפיכה ליעד חיסכון','wish-goal:'+w.id)}${ib('Trash2','מחיקה','wish-remove:'+w.id)}`}</div>`,`wish-card ${w.status}`);
}
function wishlistView(){
  const w=wishlistSummary(data),items=moneyItems('wishlist'),buy=ui.buy||(ui.buy={name:'',price:'',installments:1});
  const order={waiting:0,bought:1,skipped:2},sorted=[...items].sort((a,b)=>order[a.status]-order[b.status]||(a.priority||2)-(b.priority||2)||a.added.localeCompare(b.added));
  return `<div class="buy-layout">${card(head('האם כדאי לקנות?','בדיקה מהירה מול התקציב, כרית הביטחון והיעדים שלך.')+`<div class="buy-form">${field('מה רוצים לקנות?',input('name',buy.name,'text','placeholder="למשל: אוזניות חדשות" data-buy="name"'))}<div class="form-grid">${field('מחיר (₪)',input('price',buy.price,'number','min="1" step="any" placeholder="0" data-buy="price"'))}${field('תשלומים',select('installments',[1,2,3,4,6,10,12,18,24,36].map(n=>[n,n===1?'תשלום אחד':`${n} תשלומים`]),buy.installments,'data-buy="installments"'))}</div></div><div id="buy-result" aria-live="polite">${buyResultHTML()}</div>`,'buy-card')}<div class="wish-stats">${metric('ברשימת ההמתנה',money(w.waiting),`${w.count} פריטים${w.ready?` · ${w.ready} סיימו צינון`:''}`,'Target','purple')}${metric('חסכת בזכות ויתורים',money(w.skipped),'דברים שרצית — ובסוף לא היית צריך','PiggyBank','green')}</div></div>
  <div class="section-head"><div><h2>רשימת המשאלות</h2><p>כלל ${COOLING_DAYS} הימים: מוסיפים, מחכים, ורק אז מחליטים. רוב הרצונות האימפולסיביים נעלמים מעצמם.</p></div>${btn('פריט חדש','wish-new','Plus','primary')}</div>
  ${items.length?`<div class="wish-grid">${sorted.map(wishCard).join('')}</div>`:card(empty('הרשימה ריקה','בפעם הבאה שמשהו קורץ לך — הוסף אותו לכאן במקום לקנות מיד.',btn('הוספת פריט','wish-new','','primary')))}`;
}
function openWishForm(prefill={}){
  showDialog('פריט חדש ברשימת המשאלות',`<form id="wish-form"><div class="form-error"></div><div class="form-grid">${field('מה?',input('name',prefill.name||'','text','required'))}${field('מחיר (₪)',input('price',prefill.price||'','number','required min="1" step="any"'))}${field('עדיפות',select('priority',[[1,'חשוב מאוד'],[2,'רצוי'],[3,'נחמד שיהיה']],prefill.priority||2))}${field('ימי צינון',input('coolDays',prefill.coolDays??COOLING_DAYS,'number','min="0" max="365" step="1"'))}${field('קישור',input('url',prefill.url||'','url','dir="ltr" placeholder="https://"'),'','full')}${field('למה אני רוצה את זה?',`<textarea name="note" rows="2">${e(prefill.note||'')}</textarea>`,'','full')}</div><div class="form-actions">${submit('הוספה לרשימה','Plus')}${btn('ביטול','dialog-close')}</div></form>`);
}
function saveWishForm(form){
  const f=new FormData(form),name=String(f.get('name')||'').trim(),price=Number(f.get('price')),coolDays=Math.round(Number(f.get('coolDays'))),url=String(f.get('url')||'').trim();
  if(!name)throw Error('יש לכתוב מה רוצים לקנות.');
  if(!(price>0))throw Error('יש להזין מחיר חיובי.');
  if(!(coolDays>=0&&coolDays<=365))throw Error('ימי הצינון צריכים להיות בין 0 ל־365.');
  if(url&&!/^https?:\/\//i.test(url))throw Error('הקישור צריך להתחיל ב־https://');
  mutate(next=>next.wishlist.push({id:uid(),name,price,priority:Number(f.get('priority'))||2,coolDays,url,note:String(f.get('note')||'').trim(),added:today(),status:'waiting'}),`״${name}״ נוסף לרשימה. נדבר בעוד ${coolDays} ימים 🙂`);
  closeDialog();
}

// ---------- Toolkit ----------
const TOOL_TABS=[['salary','שכר נטו','Wallet'],['loan','משכנתא והלוואות','Landmark'],['debt','יציאה מחובות','TrendingDown'],['fees','דמי ניהול','PiggyBank'],['maaser','מעשרות ותרומות','Sparkles']];
const toolNotes={
  salary:`הערכה לשכיר תושב ישראל לפי מדרגות המס, ערך נקודת זיכוי (${IL_TAX_2026.creditPoint} ₪) ושיעורי ביטוח לאומי ומס בריאות לשנת ${IL_TAX_2026.year}. הזיכוי על הפרשת העובד לפנסיה מחושב עד 7% משכר של עד ${IL_TAX_2026.pension.salaryCap.toLocaleString('he-IL')} ₪. לא כולל שווי רכב והטבות, החזרי הוצאות, זיכויים מיוחדים ותיאומי מס.`,
  loan:'שפיצר: תשלום חודשי קבוע (בהלוואה צמודה הוא עולה עם המדד). קרן שווה: החזר קרן קבוע וריבית יורדת. התשלום הנוסף מוריד קרן ומקצר את התקופה. לא כולל עמלות פירעון מוקדם, ביטוחים ושינויי ריבית במסלולים משתנים.',
  debt:'שיטת המפולת (Avalanche) סוגרת קודם את החוב עם הריבית הגבוהה — הכי זול. שיטת כדור השלג (Snowball) סוגרת קודם את החוב הקטן — הכי מעודד. בשתיהן, כשחוב נסגר, התשלום שלו עובר לחוב הבא.',
  fees:'דמי ניהול מצבירה נגבים כל שנה מכל הכסף שנצבר; דמי ניהול מהפקדה — מכל הפקדה. בקרן פנסיה מקיפה התקרה החוקית היא 0.5% מצבירה ו־6% מהפקדה, ולרוב אפשר להשיג הרבה פחות במשא ומתן. התחשיב אינו כולל מס.',
  maaser:'ההכנסות מחושבות מתנועות ההכנסה שנרשמו באופק (בדרך כלל שכר נטו). תרומה למוסד ציבורי מוכר מזכה בזיכוי מס של 35% (סעיף 46), בכפוף לסכום מינימלי שנתי ולתקרה — שמרו את הקבלות.'
};
function toolState(){
  if(!ui.tools){
    let saved={};try{saved=JSON.parse(localStorage.getItem('ofek-tools-v1')||'{}')||{};}catch{}
    const debts=data.accounts.filter(a=>a.kind==='debt'&&a.balance>0).map(a=>({name:a.name,balance:Math.round(a.balance),rate:a.interest,payment:a.payment}));
    const defaults={salary:{gross:15000,points:2.25,pension:6,study:0,net:12000},loan:{principal:900000,rate:4.8,years:25,method:'shpitzer',cpi:false,inflation:2.5,extra:0},debt:{extra:500,rows:debts.length?debts:[{name:'כרטיס אשראי',balance:8000,rate:16,payment:400},{name:'הלוואה אישית',balance:20000,rate:7.5,payment:850}]},fees:{balance:150000,monthly:2500,years:30,ret:5,acc:.5,dep:2,cacc:.15,cdep:1},maaser:{year:today().slice(0,4),rate:10,cats:data.categories.includes('תרומות')?['תרומות']:[]}};
    ui.tools={tab:TOOL_TABS.some(([id])=>id===saved.tab)?saved.tab:'salary'};
    for(const key of Object.keys(defaults))ui.tools[key]={...defaults[key],...(saved[key]&&typeof saved[key]==='object'?saved[key]:{})};
  }
  return ui.tools;
}
function saveToolState(){try{localStorage.setItem('ofek-tools-v1',JSON.stringify(ui.tools));}catch{}}
const toolNumber=(path,label,value,attrs='',hint='')=>field(label,`<input type="number" data-tool="${path}" value="${e(value)}" step="any" ${attrs}>`,hint);
function toolInputs(tab){
  const t=toolState(),v=t[tab];
  if(tab==='salary')return head('הנתונים שלך',`שכיר · תושב ישראל · שנת מס ${IL_TAX_2026.year}`)+`<div class="tool-fields">${toolNumber('salary.gross','שכר ברוטו חודשי (₪)',v.gross,'min="0"')}${toolNumber('salary.points','נקודות זיכוי',v.points,'min="0" max="20" step="0.25"','גבר 2.25 · אישה 2.75 · ילדים, תואר וחיילים משוחררים מוסיפים')}${moduleHook('salaryPoints','')}${toolNumber('salary.pension','הפרשת עובד לפנסיה (%)',v.pension,'min="0" max="20"','ברירת המחדל לפי חוק: 6%')}${toolNumber('salary.study','הפרשת עובד לקרן השתלמות (%)',v.study,'min="0" max="10"','בדרך כלל 2.5% או 0')}${toolNumber('salary.net','נטו רצוי — כמה ברוטו צריך? (₪)',v.net,'min="0"')}</div>`;
  if(tab==='loan')return head('פרטי ההלוואה','משכנתא, הלוואת רכב או הלוואה אישית')+`<div class="tool-fields">${toolNumber('loan.principal','סכום ההלוואה (₪)',v.principal,'min="1"')}${toolNumber('loan.rate','ריבית שנתית (%)',v.rate,'min="0" max="49"')}${toolNumber('loan.years','תקופה (שנים)',v.years,'min="1" max="40"')}${field('שיטת החזר',`<select data-tool="loan.method">${options([['shpitzer','שפיצר — תשלום קבוע'],['equal','קרן שווה']],v.method)}</select>`)}<label class="check-field"><input type="checkbox" data-tool="loan.cpi" ${v.cpi?'checked':''}>צמודה למדד המחירים לצרכן</label>${v.cpi?toolNumber('loan.inflation','אינפלציה שנתית צפויה (%)',v.inflation,'min="-5" max="20"'):''}${toolNumber('loan.extra','תשלום נוסף בכל חודש (₪)',v.extra,'min="0"','מקצר את ההלוואה וחוסך ריבית')}</div>`;
  if(tab==='debt')return head('החובות שלך','',`<div class="actions">${btn('מהחשבונות שלי','tool-debt-load','Landmark')}${btn('חוב','tool-debt-add','Plus')}</div>`)+`<div class="debt-rows">${v.rows.map((r,i)=>`<div class="debt-row"><input type="text" data-tool="debt.rows.${i}.name" value="${e(r.name)}" aria-label="שם החוב"><label><span>יתרה</span><input type="number" data-tool="debt.rows.${i}.balance" value="${e(r.balance)}" min="0" step="any"></label><label><span>ריבית %</span><input type="number" data-tool="debt.rows.${i}.rate" value="${e(r.rate)}" min="0" step="any"></label><label><span>תשלום</span><input type="number" data-tool="debt.rows.${i}.payment" value="${e(r.payment)}" min="0" step="any"></label>${ib('Trash2','הסרת '+r.name,'tool-debt-remove:'+i)}</div>`).join('')}</div>${toolNumber('debt.extra','סכום נוסף לחובות בכל חודש (₪)',v.extra,'min="0"')}`;
  if(tab==='fees')return head('החיסכון שלך','קרן פנסיה, קופת גמל, קרן השתלמות או פוליסת חיסכון')+`<div class="tool-fields">${toolNumber('fees.balance','צבירה נוכחית (₪)',v.balance,'min="0"')}${toolNumber('fees.monthly','הפקדה חודשית (₪)',v.monthly,'min="0"')}${toolNumber('fees.years','שנים עד הפרישה',v.years,'min="1" max="60"')}${toolNumber('fees.ret','תשואה שנתית לפני דמי ניהול (%)',v.ret,'min="-10" max="20"')}<div class="fee-pair"><span>דמי הניהול שלך</span>${toolNumber('fees.acc','מצבירה (%)',v.acc,'min="0" max="10"')}${toolNumber('fees.dep','מהפקדה (%)',v.dep,'min="0" max="10"')}</div><div class="fee-pair"><span>להשוואה — דמי ניהול נמוכים</span>${toolNumber('fees.cacc','מצבירה (%)',v.cacc,'min="0" max="10"')}${toolNumber('fees.cdep','מהפקדה (%)',v.cdep,'min="0" max="10"')}</div></div>`;
  const years=[...new Set([today().slice(0,4),...data.transactions.map(x=>x.date.slice(0,4))])].sort().reverse();
  return head('מעשרות ותרומות','כמה הפרשת, וכמה עוד נשאר')+`<div class="tool-fields">${field('שנה',`<select data-tool="maaser.year">${options(years,v.year)}</select>`)}${field('שיעור',`<select data-tool="maaser.rate" data-numeric>${options([[10,'מעשר — 10%'],[20,'חומש — 20%']],v.rate)}</select>`)}<div class="field"><span>קטגוריות שנחשבות תרומה</span><div class="cat-checks">${data.categories.map(c=>`<label><input type="checkbox" data-tool-cat="${e(c)}" ${v.cats.includes(c)?'checked':''}>${e(c)}</label>`).join('')}</div></div></div>`;
}
function salaryOutput(){
  const v=toolState().salary,opts={creditPoints:+v.points||0,pensionRate:(+v.pension||0)/100,studyFundRate:(+v.study||0)/100};
  if(!(+v.gross>0))return card(empty('הזן שכר ברוטו','נחשב נטו, מס הכנסה, ביטוח לאומי ומס בריאות לפי 2026.'));
  const s=netSalary({...opts,gross:+v.gross}),parts=[['נטו',s.net,tone.positive],['מס הכנסה',s.tax,tone.negative],['ביטוח לאומי',s.ni,palette[1]],['מס בריאות',s.health,palette[3]],['פנסיה (עובד)',s.pension,palette[0]],['קרן השתלמות',s.studyFund,palette[2]]].filter(p=>p[1]>.5);
  const target=+v.net>0?grossForNet(+v.net,opts):null;
  return card(`<span class="eyebrow">${icon('Wallet',15)} נטו לחודש</span><div class="big-number" dir="ltr">${money(s.net)}</div><p class="muted">מתוך ${amt(s.gross)} ברוטו · ${amt(s.hourly)} נטו לשעת עבודה</p><div class="stack-bar" role="img" aria-label="${e(parts.map(([l,x])=>`${l} ${money(x)}`).join(', '))}">${parts.map(([l,x,c])=>`<span style="width:${x/s.gross*100}%;background:${c}" title="${e(l)}: ${money(x)}"></span>`).join('')}</div><div class="breakdown">${parts.map(([l,x,c])=>`<div><span><i style="background:${c}"></i>${l}</span><b dir="ltr">${money(x)}</b><small>${pct(x/s.gross)}</small></div>`).join('')}</div>`,'salary-result')+`<div class="two-columns">${card(head('איך חושב המס')+`<div class="goal-details">${[['מס לפי המדרגות',money(s.taxBeforeCredits)],['נקודות זיכוי',minusMoney(s.credits)],['זיכוי על הפקדה לפנסיה',minusMoney(s.pensionCredit)],['מס הכנסה לתשלום',money(s.tax)],['מדרגת המס השולית',pct(s.marginal)],['ניכויי חובה מהברוטו',pct(s.effectiveRate)]].map(([l,x])=>`<div><span>${l}</span><b dir="ltr">${e(x)}</b></div>`).join('')}</div>`)}${card(head('כמה ברוטו צריך?','לפי הנטו שהזנת ובאותם תנאים')+(target?`<div class="large-number" dir="ltr">${money(target)}</div><p class="muted">ברוטו חודשי כדי לקבל ${amt(+v.net)} נטו. כל ${amt(1000)} ברוטו נוספים יוסיפו לך כ־${amt(netSalary({...opts,gross:+v.gross+1000}).net-s.net)} נטו.</p>`:'<p class="muted">הזן נטו רצוי בטופס.</p>'))}</div>`;
}
function loanOutput(){
  const v=toolState().loan,base={principal:+v.principal,annualRate:+v.rate,years:+v.years,method:v.method,cpiLinked:!!v.cpi,inflation:+v.inflation};
  const a=loanSchedule(base),b=+v.extra>0?loanSchedule({...base,extraMonthly:+v.extra}):null,ya=loanByYear(a.rows),yb=b?loanByYear(b.rows):[];
  const chart=[{label:'היום',date:today(),base:+v.principal,...(b?{extra:+v.principal}:{})},...ya.map((y,i)=>({label:`שנה ${y.year}`,date:today(),base:y.balance,...(b?{extra:yb[i]?.balance??0}:{})}))];
  const checkpoints=[1,5,10,15,20,25,30,35,40].filter(y=>y<=ya.length);
  return `<div class="three-metrics">${metric(v.cpi?'תשלום ראשון (צמוד)':'תשלום חודשי',money(a.firstPayment),v.method==='equal'?`יורד עד ${amt(a.lastPayment)} בסוף`:v.cpi?`עולה עד כ־${amt(a.maxPayment)} עם המדד`:`${a.months} תשלומים`,'CalendarDays')}${metric('סך הריבית',money(a.totalInterest),a.totalIndexation>1?`ועוד ${amt(a.totalIndexation)} הצמדה למדד`:`${pct(a.totalInterest/+v.principal)} מסכום ההלוואה`,'TrendingUp','purple')}${metric('סך הכול תחזיר',money(a.totalPaid),`על הלוואה של ${amt(+v.principal)}`,'Landmark','gold')}</div>
  ${b?card(`<div class="extra-impact"><span class="asset-icon green">${icon('Zap',20)}</span><div><b>${amt(+v.extra)} נוספים בחודש יקצרו את ההלוואה ב־${a.months-b.months} חודשים</b><small>ויחסכו כ־${amt(a.totalInterest+a.totalIndexation-b.totalInterest-b.totalIndexation)} בריבית ובהצמדה · סיום אחרי ${(b.months/12).toLocaleString('he-IL',{maximumFractionDigits:1})} שנים במקום ${(a.months/12).toLocaleString('he-IL',{maximumFractionDigits:1})}</small></div></div>`,'extra-card'):''}
  ${card(head('יתרת ההלוואה לאורך השנים',b?'קו מלא: לפי לוח הסילוקין · קו מקווקו: עם התשלום הנוסף':'')+graph(chart,[{key:'base',name:'יתרה',color:palette[0]},...(b?[{key:'extra',name:'עם תשלום נוסף',color:palette[2]}]:[])],{height:230,area:!b,floor:0}))}
  ${card(head('לוח סילוקין מקוצר')+`<div class="table-wrap"><table><thead><tr><th>שנה</th><th>ריבית בשנה</th><th>קרן בשנה</th>${a.totalIndexation>1?'<th>הצמדה</th>':''}<th>יתרה בסוף השנה</th></tr></thead><tbody>${checkpoints.map(y=>{const r=ya[y-1];return `<tr><td>${y}</td><td dir="ltr">${money(r.interest)}</td><td dir="ltr">${money(r.principal)}</td>${a.totalIndexation>1?`<td dir="ltr">${money(r.indexation)}</td>`:''}<td dir="ltr"><b>${money(r.balance)}</b></td></tr>`;}).join('')}</tbody></table></div>`)}`;
}
function debtOutput(){
  const v=toolState().debt,rows=v.rows.filter(r=>+r.balance>0);
  if(!rows.length)return card(empty('אין חובות לחישוב','הוסף חוב עם יתרה, ריבית ותשלום חודשי — או טען אותם מהחשבונות שלך.'));
  const av=debtPayoff(rows,{extra:+v.extra,strategy:'avalanche'}),sn=debtPayoff(rows,{extra:+v.extra,strategy:'snowball'}),base=debtPayoff(rows,{extra:0});
  if(!av.feasible)return notice('התשלומים החודשיים אינם מכסים את הריבית, ולכן החובות לא ייסגרו. הגדל את התשלום או את הסכום הנוסף.','error');
  const better=av.totalInterest<=sn.totalInterest+.5?'avalanche':'snowball',free=m=>monthLabel(monthOffset(today().slice(0,7),m));
  const plan=(r,title,text,key)=>card(`<div class="row-between"><b>${title}</b>${key===better?badge('הכי משתלם','green'):badge('הכי מעודד','purple')}</div><p class="muted small">${text}</p><div class="plan-number">${r.months} חודשים</div><small class="muted">חופשי מחובות ב${free(r.months)} · ריבית כוללת ${amt(r.totalInterest)}</small><ol class="payoff-order">${r.order.map(o=>`<li><span>${e(o.name)}</span><small>חודש ${o.month}</small></li>`).join('')}</ol>`,'plan-card');
  const step=Math.max(1,Math.ceil(Math.max(av.series.length,sn.series.length)/60)),points=[];
  for(let m=0;m<Math.max(av.series.length,sn.series.length);m+=step)points.push({label:m?`חודש ${m}`:'היום',date:today(),av:av.series[m]?.balance??0,sn:sn.series[m]?.balance??0});
  return `${base.feasible&&+v.extra>0?card(`<div class="extra-impact"><span class="asset-icon green">${icon('Zap',20)}</span><div><b>${amt(+v.extra)} נוספים בחודש: חופשי מחובות ${base.months-av.months} חודשים מוקדם יותר</b><small>וחיסכון של כ־${amt(base.totalInterest-av.totalInterest)} בריבית לעומת תשלומי המינימום בלבד</small></div></div>`,'extra-card'):''}<div class="two-columns">${plan(av,'שיטת המפולת','קודם הריבית הגבוהה','avalanche')}${plan(sn,'שיטת כדור השלג','קודם החוב הקטן','snowball')}</div>${card(head('סך החובות לאורך הזמן',safe(`תקציב חודשי לחובות: ${amt(av.budget)}`))+graph(points,[{key:'av',name:'מפולת',color:palette[0]},{key:'sn',name:'כדור שלג',color:palette[1]}],{height:220,floor:0}))}`;
}
function feesOutput(){
  const v=toolState().fees,f=feeImpact({balance:+v.balance,monthly:+v.monthly,years:+v.years,annualReturn:+v.ret,accumulationFee:+v.acc,depositFee:+v.dep,compareAccumulation:+v.cacc,compareDeposit:+v.cdep});
  const rows=f.yours.points.map((p,i)=>({label:p.year?`שנה ${p.year}`:'היום',date:today(),yours:p.value,better:f.better.points[i].value}));
  return `<div class="three-metrics">${metric('עם דמי הניהול שלך',money(f.yours.final),`בעוד ${v.years} שנים`,'PiggyBank')}${metric('עם דמי ניהול נמוכים',money(f.better.final),`${v.cacc}% מצבירה · ${v.cdep}% מהפקדה`,'TrendingUp','green')}${metric(f.difference>=0?'המחיר של דמי הניהול שלך':'אתה כבר משלם פחות',money(Math.abs(f.difference)),f.difference>=0?`${pct(f.difference/Math.max(1,f.better.final))} מהחיסכון בפרישה`:'דמי הניהול שלך נמוכים מההשוואה','Activity',f.difference>=0?'red':'green')}</div>${card(head('הצבירה לאורך השנים',safe(`דמי ניהול שתשלם לאורך הדרך: כ־${amt(f.yours.fees)} · הפקדת ${amt(f.contributed)}`))+graph(rows,[{key:'better',name:'דמי ניהול נמוכים',color:palette[2]},{key:'yours',name:'דמי הניהול שלך',color:palette[0]}],{height:240,floor:0}))}${f.difference>1000?card(`<div class="extra-impact"><span class="asset-icon gold">${icon('Info',20)}</span><div><b>שיחת טלפון אחת יכולה להיות שווה ${amt(f.difference)}</b><small>בקש מהקרן הצעה משופרת, או השווה מסלולים בכלי ההשוואה הממשלתי. מעבר בין קרנות אינו כרוך בעלות.</small></div></div>`):''}`;
}
function maaserOutput(){
  const v=toolState().maaser,m=maaserSummary(data,{year:v.year,rate:(+v.rate||10)/100,categories:v.cats}),done=m.remaining<=0;
  return `<div class="three-metrics">${metric('הכנסות בשנה',money(m.income),`${m.year} · לפי התנועות שנרשמו`,'ArrowDownLeft','green')}${metric(`${v.rate}% מההכנסות`,money(m.due),'הסכום להפרשה','Sparkles','purple')}${metric('תרמת עד עכשיו',money(m.donated),v.cats.length?v.cats.join(', '):'לא נבחרה קטגוריה','PiggyBank')}</div>${card(`<div class="maaser-status"><div><span class="eyebrow">${done?'הפרשת את כל הסכום':'נשאר להפריש השנה'}</span><div class="big-number" dir="ltr">${money(Math.abs(m.remaining))}</div><p class="muted">${done?`הפרשת ${amt(-m.remaining)} מעבר לנדרש — אפשר לקזז בשנה הבאה.`:`כ־${amt(m.remaining/Math.max(1,12-new Date().getMonth()))} בחודש עד סוף השנה.`}</p></div>${progress(m.progress*100,done?'green':'purple')}<div class="row-between"><span class="muted small">זיכוי מס משוער על התרומות (35%): ${amt(m.taxCredit)}</span>${btn('רישום תרומה','maaser-donate','Plus','primary')}</div></div>`)}`;
}
function toolOutput(tab){
  try{return {salary:salaryOutput,loan:loanOutput,debt:debtOutput,fees:feesOutput,maaser:maaserOutput}[tab]();}
  catch(err){return notice(err.message,'error');}
}
function toolsView(){
  const t=toolState();
  return `<div class="segmented tool-tabs" role="tablist">${TOOL_TABS.map(([id,label,ic])=>`<button type="button" role="tab" aria-selected="${t.tab===id}" class="${t.tab===id?'active':''}" data-action="tool-tab:${id}">${icon(ic,15)}<span>${label}</span></button>`).join('')}</div><div class="tool-layout">${card(toolInputs(t.tab),'tool-inputs')}<div id="tool-output" class="tool-output" aria-live="polite">${toolOutput(t.tab)}</div></div>${notice(toolNotes[t.tab])}`;
}
let toolFrame=0;
function refreshToolOutput(){
  if(toolFrame)cancelAnimationFrame(toolFrame);
  toolFrame=requestAnimationFrame(()=>{toolFrame=0;const el=document.querySelector('#tool-output');if(el)el.innerHTML=toolOutput(toolState().tab);});
}
function setToolValue(path,value){
  const keys=path.split('.');let target=toolState();
  for(const key of keys.slice(0,-1))target=target[key];
  target[keys.at(-1)]=value;saveToolState();
}

// ---------- Dashboard ----------
function safeCard(){
  const s=safeToSpend(data,today());
  return card(`<div class="row-between"><span class="eyebrow">${icon('Wallet',15)} בטוח לבזבז היום</span>${textBtn('תזרים','navigate:bills')}</div><div class="safe-number" dir="ltr">${money(s.perDay)}</div><small class="muted">${safeDetail(s)}</small>`,'safe-card');
}
// "חיובים קרובים" on home; the "כמה בדיוק?" prompts come first in it (§D.4).
function upcomingCard(){
  const now=today(),all=scheduledItems(data,now,shiftDate(now,14),now).filter(x=>!x.paid&&!x.onCard),items=all.slice(0,4),confirms=pendingConfirmations(data);
  const banks=data.accounts.filter(a=>LIQUID_KINDS.includes(a.kind)),after=banks.reduce((s,a)=>s+toILS(a.balance,a.currency,data.fx),0)+all.reduce((s,x)=>s+(x.type==='income'?x.amount:x.type==='transfer'&&x.source==='bill'?x.liquid||0:-x.amount),0);
  const prompts=confirms.length?`<div class="confirm-list">${confirms.slice(0,2).map(confirmItem).join('')}${confirms.length>2?`<div class="confirm-foot">${textBtn(`ועוד ${confirms.length-2}`,'navigate:bills')}</div>`:''}</div>`:'';
  return card(`<div class="row-between"><span class="eyebrow">${icon('CalendarDays',15)} חיובים קרובים</span>${textBtn('ללוח','navigate:bills')}</div>${prompts}${items.length?`<div class="mini-agenda">${items.map(x=>`<div><span class="mini-date">${shortDate(x.date)}</span><span>${e(x.name)}</span><b dir="ltr" class="${itemClass(x)}">${itemSign(x)}${money(x.amount)}</b></div>`).join('')}</div>${banks.length?`<div class="after-charges"><span>יישאר בעו״ש אחרי החיובים</span><b dir="ltr" class="${after<0?'negative':''}">${money(after)}</b></div>`:''}`:`<p class="muted small">אין תשלומים קבועים בשבועיים הקרובים.</p>${moneyItems('bills').length?'':btn('הוספת תשלום קבוע','bill-new','Plus')}`}`,'upcoming-card'+(confirms.length?' has-confirm':''));
}
function splitMiniCard(){
  const t=splitTotals(data),w=wishlistSummary(data);
  return card(`<div class="row-between"><span class="eyebrow">${icon('ArrowLeftRight',15)} חלוקות ומשאלות</span>${textBtn('לקבוצות','navigate:split')}</div><div class="split-mini"><div><span>חייבים לך</span><b class="positive" dir="ltr">${exact(t.owedToMe)}</b></div><div><span>אתה חייב</span><b class="${t.iOwe>0?'negative':''}" dir="ltr">${exact(t.iOwe)}</b></div><div><span>חסכת מוויתורים</span><b dir="ltr">${money(w.skipped)}</b></div></div>${w.ready?`<button type="button" class="ready-chip" data-action="navigate:wishlist">${icon('Target',14)}${w.ready} ${w.ready===1?'פריט סיים':'פריטים סיימו'} את תקופת הצינון</button>`:''}`,'split-mini-card');
}

// ---------- Events ----------
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,a,b]=button.dataset.action.split(':');
  try{
    if(action==='flow-days'){ui.flowDays=+a;ui.flowDay=null;render();}
    else if(action==='flow-day'){ui.flowDay=ui.flowDay===a?null:a;render();}
    else if(action==='flow-months'){ui.flowAllMonths=!ui.flowAllMonths;render();}
    else if(action==='bill-new')openBillForm();
    else if(action==='bill-edit')openBillForm(a);
    else if(action==='bill-pay')openPayDialog(a,b);
    else if(action==='bill-suggest'){const r=(ui.billSuggestions||[])[+a];if(r)openBillForm(null,{name:r.name,amount:Math.round(r.average),category:r.category,day:Number(r.lastDate.slice(8)),autopay:r.automatic});}
    else if(action==='deposit-auto')openRecurringDeposit(a==='goal'?{goalId:b}:{accountId:b});
    else if(action==='bill-kind'){const form=button.closest('#bill-form');if(form&&form.querySelector('[name=kind]').value!==a){redrawBillForm(form,{kind:a});document.querySelector(`#bill-form [data-action="bill-kind:${a}"]`)?.focus();}}
    else if(action==='bill-pause'){const bill=moneyItems('bills').find(x=>x.id===a);if(bill)mutate(next=>{pauseBill(next,a,today());},`״${bill.name}״ הושהה. לא יירשם ולא ייכנס לתחזית עד שתחדש.`,{undo:true});}
    else if(action==='bill-resume'){const bill=moneyItems('bills').find(x=>x.id===a);if(bill)mutate(next=>{resumeBill(next,a,today());},`״${bill.name}״ חודש. ${isDepositBill(bill)?'ההפקדות':'החיובים'} שהיו בהשהיה לא יירשמו.`,{undo:true});}
    else if(action==='auto-confirm'){const t=data.transactions.find(x=>x.id===a);if(t)mutate(next=>{confirmAutoAmount(next,a,t.amount);},'מעולה — נשמר.',{undo:true});}
    else if(action==='auto-hold')holdAuto(a);
    else if(action==='auto-drop')dropAuto(a);
    else if(action==='auto-amount')openAutoAmount(a);
    else if(action==='bill-remove'){const bill=moneyItems('bills').find(x=>x.id===a);if(bill)confirm('למחוק את התשלום הקבוע?',`״${bill.name}״ יוסר מלוח התשלומים. תנועות שכבר נרשמו יישארו.`,()=>mutate(next=>{next.bills=next.bills.filter(x=>x.id!==a);},'התשלום נמחק',{undo:true}),true);}
    else if(action==='group-new')openGroupForm();
    else if(action==='group-open'){ui.splitGroup=a;render();window.scrollTo(0,0);}
    else if(action==='group-close'){ui.splitGroup=null;render();}
    else if(action==='group-edit')openGroupForm(ui.splitGroup);
    else if(action==='group-share'){const g=currentGroup();if(g)openShareDialog(g);}
    else if(action==='share-copy'){const box=document.querySelector('#share-text');const done=()=>toast('הסיכום הועתק — אפשר להדביק בקבוצה');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(box.value).then(done,()=>{box.select();document.execCommand('copy');done();});else{box.select();document.execCommand('copy');done();}}
    else if(action==='group-remove'){const g=currentGroup();if(g)confirm('למחוק את הקבוצה?',`הקבוצה ״${g.name}״ וכל ההוצאות שלה יימחקו. תנועות שנרשמו באופק יישארו.`,()=>{ui.splitGroup=null;mutate(next=>{next.groups=next.groups.filter(x=>x.id!==g.id);},'הקבוצה נמחקה',{undo:true});},true);}
    else if(action==='gx-new')openSplitExpense();
    else if(action==='gx-edit')openSplitExpense(a);
    else if(action==='gx-remove'){const g=currentGroup(),x=g?.expenses.find(v=>v.id===a);if(x)confirm('למחוק את ההוצאה?',`״${x.description}״ (${exact(x.amount)}) תוסר מהקבוצה והמאזן יחושב מחדש.`,()=>mutate(next=>{const group=next.groups.find(v=>v.id===g.id);group.expenses=group.expenses.filter(v=>v.id!==a);},'ההוצאה נמחקה',{undo:true}),true);}
    else if(action==='settle'){const g=currentGroup(),t=g&&groupSummary(g).transfers[+a];if(t)confirm('לסמן את ההעברה כשולמה?',`${memberLabel(g,t.from)} העביר/ה ל${memberLabel(g,t.to)} ${exact(t.amount)}.`,()=>mutate(next=>{const group=next.groups.find(v=>v.id===g.id);group.settlements=[...(group.settlements||[]),{id:uid(),from:t.from,to:t.to,amount:t.amount,date:today()}];},'ההעברה סומנה והמאזן עודכן'));}
    else if(action==='wish-new')openWishForm();
    else if(action==='wish-from-check'){const buy=ui.buy||{};openWishForm({name:buy.name,price:buy.price});}
    else if(action==='wish-skip'){const w=moneyItems('wishlist').find(x=>x.id===a);if(w)mutate(next=>{const item=next.wishlist.find(x=>x.id===a);item.status='skipped';item.decided=today();},`כל הכבוד! ${money(w.price)} נשארו אצלך 💪`);}
    else if(action==='wish-bought'){const w=moneyItems('wishlist').find(x=>x.id===a);if(w){mutate(next=>{const item=next.wishlist.find(x=>x.id===a);item.status='bought';item.decided=today();},'סומן כנקנה. אפשר לרשום את ההוצאה בטופס');openEntity('transaction',null,{type:'expense',amount:w.price,description:w.name,category:data.categories.includes('קניות')?'קניות':data.categories[0]});}}
    else if(action==='wish-goal'){const w=moneyItems('wishlist').find(x=>x.id===a);if(w){const months=6,date=`${monthOffset(today().slice(0,7),months)}-01`;mutate(next=>{next.goals.push({id:uid(),name:w.name,type:'מטרה אישית',target:w.price,saved:0,monthly:Math.ceil(w.price/months),date,accountId:''});},`נוצר יעד חיסכון ל״${w.name}״: ${money(Math.ceil(w.price/months))} בחודש`);}}
    else if(action==='wish-remove'){const w=moneyItems('wishlist').find(x=>x.id===a);if(w)confirm('להסיר מהרשימה?',`״${w.name}״ יוסר מרשימת המשאלות.`,()=>mutate(next=>{next.wishlist=next.wishlist.filter(x=>x.id!==a);},'הפריט הוסר',{undo:true}),true);}
    else if(action==='ai-buy'){const buy=ui.buy||{};sendCopilot(`אני שוקל לקנות ${buy.name||'משהו'} ב־${money(+buy.price)}${+buy.installments>1?` ב־${buy.installments} תשלומים`:''}. תבדוק את זה מול התקציב, כרית הביטחון והיעדים שלי, ותגיד לי בכנות אם כדאי. אם לא — מה החלופה, ואם כדאי לחכות או להוסיף לרשימת המשאלות.`,[]);}
    else if(action==='tool-tab'){toolState().tab=a;saveToolState();render();}
    else if(action==='tool-debt-add'){toolState().debt.rows.push({name:`חוב ${toolState().debt.rows.length+1}`,balance:5000,rate:10,payment:300});saveToolState();render();}
    else if(action==='tool-debt-remove'){toolState().debt.rows.splice(+a,1);saveToolState();render();}
    else if(action==='tool-debt-load'){const rows=data.accounts.filter(x=>x.kind==='debt'&&x.balance>0).map(x=>({name:x.name,balance:Math.round(x.balance),rate:x.interest,payment:x.payment}));if(!rows.length)throw Error('אין חובות במסך החשבונות. אפשר להוסיף אותם כאן ידנית.');toolState().debt.rows=rows;saveToolState();render();}
    else if(action==='maaser-donate'){if(!data.categories.includes('תרומות'))commit({...data,categories:[...data.categories,'תרומות']},'');openEntity('transaction',null,{type:'expense',category:'תרומות',description:'תרומה'});}
  }catch(err){toast(err.message,true);}
});
// The bill form: the kind, the deposit target and the frequency redraw it; the note follows every keystroke.
const refreshBillNote=form=>{const box=form.querySelector('#bill-note');if(box)box.innerHTML=billNote(billFormValues(form));};
document.addEventListener('input',event=>{
  const el=event.target,billForm=el.closest?.('#bill-form');
  if(billForm){refreshBillNote(billForm);return;}
  if(el.dataset.buy!=null){ui.buy ||={};ui.buy[el.dataset.buy]=el.value;const box=document.querySelector('#buy-result');if(box)box.innerHTML=buyResultHTML();}
  else if(el.dataset.tool&&el.type!=='checkbox'&&el.tagName!=='SELECT'){setToolValue(el.dataset.tool,el.type==='number'?(el.value===''?'':Number(el.value)):el.value);refreshToolOutput();}
});
document.addEventListener('change',event=>{
  const el=event.target,billForm=el.closest?.('#bill-form');
  if(billForm){
    if(el.dataset.touch){const box=billForm.querySelector('[name=touched]');box.value=[...new Set([...box.value.split(',').filter(Boolean),el.dataset.touch])].join(',');}
    if(el.dataset.billRedraw!=null){const name=el.name;redrawBillForm(billForm);document.querySelector(`#bill-form [name="${name}"]`)?.focus();}else refreshBillNote(billForm);
    return;
  }
  if(el.dataset.tool&&(el.type==='checkbox'||el.tagName==='SELECT')){setToolValue(el.dataset.tool,el.type==='checkbox'?el.checked:el.dataset.numeric!=null?Number(el.value):el.value);if(el.dataset.tool==='loan.cpi')render();else refreshToolOutput();}
  else if(el.dataset.flow){ui[el.dataset.flow]=el.checked;render();}
  else if(el.dataset.toolCat!=null){const v=toolState().maaser,cat=el.dataset.toolCat;v.cats=el.checked?[...new Set([...v.cats,cat])]:v.cats.filter(c=>c!==cat);saveToolState();refreshToolOutput();}
});
document.addEventListener('submit',event=>{
  const form=event.target,handlers={'bill-form':saveBillForm,'bill-pay-form':savePayForm,'auto-amount-form':saveConfirmForm,'group-form':saveGroupForm,'gx-form':saveSplitExpense,'wish-form':saveWishForm};
  if(form.classList?.contains('confirm-form')&&!handlers[form.id]){event.preventDefault();try{saveConfirmForm(form);}catch(err){showFormError(form,err);}return;}
  if(!handlers[form.id])return;
  event.preventDefault();
  try{handlers[form.id](form);}catch(err){showFormError(form,err);}
});
