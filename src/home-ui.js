import {money,pct,monthLabel,today,balances,monthlySummary,categorySpend,dietz,rangeStart,portfolioValue} from './finance.js';
import {palette,tone,graph,donut} from './charts.js';
import {freeMoney} from './savings.js';
import {riskProfile} from './invest.js';
import {cashflowForecast} from './money.js';

// Customizable home page. The dashboard is a list of cards ("widgets"); the user picks which ones
// to show and in what order. The layout is saved in data.prefs.home, so it follows them between
// devices. Rows are packed from the widgets' relative widths (out of 12), so any order fills cleanly.

const HOME_WIDGETS=[
  {id:'hero',label:'היתרה בעו״ש',icon:'Wallet',hint:'כמה יש עכשיו, כמה בטוח לבזבז היום והשווי הנקי',w:12},
  {id:'networth',label:'השווי הנקי',icon:'Wallet',hint:'נכסים פחות התחייבויות',w:4.4},
  {id:'month',label:'סיכום החודש',icon:'ArrowDownLeft',hint:'הכנסות, הוצאות וחיסכון',w:7.6,stack:true},
  {id:'assets',label:'פס הנכסים',icon:'Landmark',hint:'מזומן, חסכונות, השקעות וחובות',w:12},
  {id:'worth',label:'הכסף לאורך זמן',icon:'ChartNoAxesCombined',hint:'גרף השווי הנקי',w:7.8},
  {id:'spending',label:'לאן הכסף הולך',icon:'ShoppingBag',hint:'התפלגות ההוצאות החודש',w:4.2},
  {id:'insight',label:'התובנה החודשית',icon:'Sparkles',hint:'משפט אחד על החודש ועל התיק',w:12},
  {id:'health',label:'הציון הפיננסי',icon:'HeartPulse',hint:'המצב הפיננסי במספר אחד',w:3.7},
  {id:'pace',label:'קצב ההוצאות',icon:'Gauge',hint:'צפי לסוף החודש',w:3.7},
  {id:'ask',label:'שאל את Claude',icon:'Bot',hint:'שאלה מהירה על הכסף שלך',w:4.6},
  {id:'safe',label:'בטוח לבזבז היום',icon:'Wallet',hint:'כמה אפשר להוציא היום',w:3.81},
  {id:'upcoming',label:'חיובים קרובים',icon:'CalendarDays',hint:'תשלומים בשבועיים הקרובים',w:4.38},
  {id:'split',label:'חלוקות ומשאלות',icon:'ArrowLeftRight',hint:'מי חייב למי, ומה מחכה ברשימה',w:3.81},
  {id:'investments',label:'השקעות',icon:'TrendingUp',hint:'שווי התיק, תשואה והנכסים הגדולים',w:4,fresh:true},
  {id:'free',label:'כסף פנוי',icon:'PiggyBank',hint:'מה שלא מוקצה לאף יעד',w:4,fresh:true},
  {id:'budgets',label:'תקציבים',icon:'SlidersHorizontal',hint:'התקציבים הקרובים ביותר לגבול',w:4,fresh:true},
  {id:'cashflow',label:'תחזית תזרים',icon:'Activity',hint:'היתרה הצפויה בעו״ש ב־45 הימים הקרובים',w:6,fresh:true},
  {id:'recent',label:'התנועות האחרונות',icon:'Receipt',hint:'התנועות האחרונות החודש',w:7.8},
  {id:'goals',label:'היעדים שלך',icon:'Target',hint:'ההתקדמות ביעדי החיסכון',w:4.2}
];
// A calm default: the balance hero, this month, what's coming, then the rest.
const HOME_DEFAULT=['hero','month','upcoming','recent','goals','investments','spending','budgets'];
const HOME_PRESETS=[
  ['calm','רגוע',HOME_DEFAULT],
  ['full','מלא',['hero','month','upcoming','assets','worth','spending','insight','health','pace','ask','split','investments','free','budgets','recent','goals']],
  ['investor','משקיע',['hero','investments','free','worth','goals','assets']],
  ['budget','תקציב חודשי',['hero','month','pace','budgets','upcoming','recent','spending','cashflow']]
];
const homeWidget=id=>HOME_WIDGETS.find(w=>w.id===id);

// The saved layout, completed with widgets it does not know (added in a later version → hidden).
function homeLayout(){
  const saved=data.prefs?.home,known=new Set(HOME_WIDGETS.map(w=>w.id));
  if(!saved){const rest=HOME_WIDGETS.map(w=>w.id).filter(id=>!HOME_DEFAULT.includes(id));return {order:[...HOME_DEFAULT,...rest],hidden:rest,custom:false};}
  const order=saved.order.filter(id=>known.has(id)),missing=HOME_WIDGETS.map(w=>w.id).filter(id=>!order.includes(id));
  // Layouts saved before 4.0 do not know the balance hero; it always comes first for them.
  const hero=missing.includes('hero')?['hero']:[],rest=missing.filter(id=>id!=='hero');
  return {order:[...hero,...order,...rest],hidden:[...saved.hidden.filter(id=>known.has(id)),...rest],custom:true};
}
const visibleWidgets=layout=>layout.order.filter(id=>!layout.hidden.includes(id));
function saveHomeLayout(visible,message=''){
  const all=HOME_WIDGETS.map(w=>w.id),hidden=all.filter(id=>!visible.includes(id));
  mutate(next=>{next.prefs={...(next.prefs||{}),home:{order:[...visible,...hidden],hidden}};},message);
}
function homeRows(ids){
  const rows=[];let row=[],sum=0;
  for(const id of ids){const w=homeWidget(id).w;if(row.length&&sum+w>12.45){rows.push(row);row=[];sum=0;}row.push(id);sum+=w;}
  if(row.length)rows.push(row);
  return rows;
}

// ---------- Widgets ----------
function homeContext(){
  const d=data,b=balances(d),s=monthlySummary(d,ui.month),snaps=sortedSnapshots(),last=snaps.at(-1),prev=snaps.at(-2),p=dietz(prev,last,d.activities);
  return {d,b,s,snaps,last,p,nw:prev&&last?(last.netWorth-prev.netWorth)/Math.abs(prev.netWorth||1):null};
}
const widgetHead=(ic,label,action,link)=>`<div class="row-between"><span class="eyebrow">${icon(ic,15)} ${e(label)}</span>${action?textBtn(link,action):''}</div>`;
const HOME_RENDER={
  hero:({d,b})=>heroCard(d,b),
  networth:({b,nw})=>card(`<div class="net-heading"><span>השווי הנקי שלך</span><span class="net-mark">${icon('Wallet',19)}</span></div><div class="net-value" dir="ltr">${money(b.net)}</div><div class="net-change">${nw==null?'<span class="muted">נכסים פחות התחייבויות</span>':change(nw,'לעומת העדכון הקודם')}</div><div class="net-bottom"><div><span>סך הנכסים</span><b dir="ltr">${money(b.total)}</b></div><div><span>התחייבויות</span><b dir="ltr">${money(b.debt)}</b></div><span class="net-decoration">${icon('BarChart3',68)}</span></div>`,'net-card'),
  month:({d,s})=>`<div class="summary-grid"><div class="summary-head"><span class="eyebrow">${icon('CalendarDays',15)}החודש · ${e(monthLabel(ui.month))}</span>${s.income>0?badge(`${s.saved>=0?'חסכת':'חריגה של'} ${pct(Math.abs(s.rate))}`,s.saved>=0?'green':'red'):''}</div>${metric('הכנסות החודש',money(s.income),'הכנסה שנרשמה ב'+monthLabel(ui.month).split(' ')[0],'ArrowDownLeft','green')}${metric('הוצאות החודש',money(s.expenses),s.expenses<=d.overallBudget?'בתוך יעד ההוצאות החודשי':'מעל יעד ההוצאות החודשי','ArrowUpLeft','purple')}${metric('חיסכון החודש',money(s.saved),`<span class="${s.saved>=0?'positive':'negative'}">${pct(s.rate)} מההכנסה שלך</span>`,'PiggyBank')}</div>`,
  assets:({b})=>`<div class="asset-strip">${[['מזומן וחשבונות',b.cash,'Wallet','blue','accounts'],['חסכונות',b.savings,'PiggyBank','purple','goals'],['השקעות',b.investments,'TrendingUp','gold','investments'],['חובות והלוואות',b.debt,'Landmark','red','accounts']].map(([name,value,ic,color,route])=>`<button class="asset-strip-item" data-action="navigate:${route}"><span class="asset-icon ${color}">${icon(ic,19)}</span><div><span>${name}</span><b dir="ltr">${money(value)}</b></div>${icon('ChevronLeft',15)}</button>`).join('')}</div>`,
  worth:({b,snaps,last,nw})=>{
    const hist=snaps.filter(s=>s.date>=rangeStart(last?.date||today(),ui.dashboardPeriod)).map(s=>({...s,net:s.netWorth,label:new Date(s.date+'T12:00:00').toLocaleDateString('he-IL',{month:'short'})}));
    return card(head('הכסף שלך, לאורך זמן','התפתחות השווי הנקי',`<div class="segmented mini">${[['3','3 ח׳'],['6','6 ח׳'],['12','שנה'],['all','הכול']].map(([v,l])=>`<button class="${ui.dashboardPeriod===v?'active':''}" data-action="dash-period:${v}">${l}</button>`).join('')}</div>`)+`<div class="chart-stat"><b dir="ltr">${money(last?.netWorth||b.net)}</b>${change(nw)}</div>`+graph(hist,undefined,{area:true,height:222})+`<div class="chart-footer"><span><i class="gold-dot"></i>שווי נקי</span><span>לפי תמונות מצב חודשיות</span></div>`,'worth-chart');
  },
  spending:({d,s})=>{
    const breakdown=d.categories.map((name,i)=>({name,value:categorySpend(d,name,ui.month),color:palette[i%palette.length]})).filter(a=>a.value>0).sort((a,b)=>b.value-a.value),top=breakdown.slice(0,4);
    if(breakdown.length>4)top.push({name:'אחר',value:breakdown.slice(4).reduce((s,v)=>s+v.value,0),color:tone.muted});
    return card(head('לאן הכסף הולך?','התפלגות ההוצאות החודשית',textBtn('לתנועות','navigate:transactions'))+(top.length?donut(top,s.expenses,'הוצאות החודש',155):empty('חודש חדש, התחלה חדשה','ההוצאות שתוסיף יופיעו כאן.')),'expenses-chart');
  },
  insight:({s,p})=>`<div class="insight-banner"><span class="insight-icon">${icon('Sparkles',22)}</span><div><b>${s.rate>0?`יפה, חסכת ${pct(s.rate)} מההכנסה החודש!`:'צעד קטן היום, יותר חופש מחר.'}</b><span>${p.return==null?'עדכון חודשי יעזור לך לראות את ההתקדמות.':`תיק ההשקעות שלך ${p.return>=0?'עלה':'ירד'} ב־${pct(Math.abs(p.return))} בעדכון האחרון, אחרי נטרול תזרימים.`}</span></div><button data-action="navigate:insights">לתובנות שלך${icon('ChevronLeft',16)}</button></div>`,
  health:()=>healthMiniCard(),
  pace:()=>paceCard(true),
  ask:()=>askClaudeCard(),
  safe:()=>safeCard(),
  upcoming:()=>upcomingCard(),
  split:()=>splitMiniCard(),
  investments:({d,p})=>{
    if(!d.assets.length)return card(widgetHead('TrendingUp','השקעות','navigate:investments','לתיק')+`<p class="muted small">עוד אין השקעות במעקב. אחרי שתוסיף נכס, תראה כאן את השווי, התשואה והפיזור.</p>${btn('הוספת השקעה','open:asset','Plus')}`,'home-widget invest-widget');
    const r=riskProfile(d),top=r.holdings.slice(0,3);
    return card(widgetHead('TrendingUp','השקעות','navigate:investments','לתיק')+`<div class="widget-number" dir="ltr">${money(portfolioValue(d))}</div><div class="widget-sub">${p.return==null?'<span class="muted">כולל מזומן בתיק</span>':change(p.return,'בעדכון האחרון')}</div><div class="widget-alloc" aria-hidden="true">${r.holdings.slice(0,6).map((h,i)=>`<span style="width:${(h.share*100).toFixed(2)}%;background:${palette[i%palette.length]}"></span>`).join('')}</div><div class="widget-list">${top.map((h,i)=>`<div><i style="background:${palette[i%palette.length]}"></i><span>${e(h.name)}</span><b dir="ltr">${pct(h.share)}</b></div>`).join('')}</div><small class="muted">${pct(r.usdShare)} בדולר${r.concentration==='high'?' · ריכוז גבוה בנכס אחד':''}</small>`,'home-widget invest-widget');
  },
  free:()=>{
    const f=freeMoney(data),total=f.total+f.allocated;
    return card(widgetHead('PiggyBank','כסף פנוי','navigate:goals','ליעדים')+`<div class="widget-number" dir="ltr">${money(f.total)}</div><small class="muted">לא מוקצה לאף יעד · מתוך ${money(total)} בעו״ש, במזומן ובחיסכון</small>${total>0?`<div class="free-bar" role="img" aria-label="${e(`${money(f.allocated)} מוקצים ליעדים, ${money(f.total)} פנויים`)}"><span style="width:${Math.min(100,f.allocated/total*100).toFixed(2)}%"></span></div><div class="free-legend"><span><i class="k-goal"></i>ליעדים ${money(f.allocated)}</span><span><i class="k-free"></i>פנוי ${money(f.total)}</span></div>`:''}${f.accounts.filter(x=>x.balance>0).length?`<div class="widget-list free-accounts">${f.accounts.filter(x=>x.balance>0).sort((a,b)=>b.balance-a.balance).slice(0,3).map(x=>`<div><span>${e(x.account.name)}</span><small class="muted">${x.allocated?`${money(x.allocated)} ליעדים · `:''}</small><b dir="ltr">${money(x.free)}</b></div>`).join('')}</div>`:''}`,'home-widget free-widget');
  },
  budgets:({d})=>{
    const list=d.budgets.map(b=>{const spent=categorySpend(d,b.category,ui.month);return {...b,spent,ratio:b.limit?spent/b.limit:0};}).sort((a,b)=>b.ratio-a.ratio),over=list.filter(b=>b.ratio>1).length;
    if(!list.length)return card(widgetHead('SlidersHorizontal','תקציבים','navigate:budgets','לתקציבים')+`<p class="muted small">עוד לא הוגדרו תקציבים לקטגוריות.</p>${btn('תקציב חדש','open:budget','Plus')}`,'home-widget budgets-widget');
    return card(widgetHead('SlidersHorizontal','תקציבים','navigate:budgets','לכל התקציבים')+`<div class="widget-budgets">${list.slice(0,4).map(b=>`<div><div class="row-between"><span>${e(b.category)}</span><small class="${b.ratio>1?'negative':'muted'}">${money(b.spent)} מתוך ${money(b.limit)}</small></div>${progress(b.ratio*100,b.ratio>1?'red':b.ratio>.85?'purple':'')}</div>`).join('')}</div><small class="${over?'negative':'muted'}">${over?`${over===1?'תקציב אחד חרג':`${over} תקציבים חרגו`} ב${monthLabel(ui.month).split(' ')[0]}`:`כל התקציבים בשליטה ב${monthLabel(ui.month).split(' ')[0]}`}</small>`,'home-widget budgets-widget');
  },
  cashflow:()=>{
    const f=cashflowForecast(data,{days:45}),step=Math.max(1,Math.ceil(f.points.length/46)),chart=f.points.filter((p,i)=>i%step===0||i===f.points.length-1||p.date===f.lowest.date);
    const shortDay=d=>new Date(d+'T12:00:00').toLocaleDateString('he-IL',{day:'numeric',month:'short'});
    return card(widgetHead('Activity','תחזית תזרים','navigate:bills','לתחזית המלאה')+`<div class="row-between cashflow-numbers"><div><span>היום</span><b dir="ltr">${money(f.start)}</b></div><div><span>בעוד 45 יום</span><b dir="ltr">${money(f.end)}</b></div><div><span>הנקודה הנמוכה</span><b dir="ltr" class="${f.lowest.balance<0?'negative':''}">${money(f.lowest.balance)}</b><small>${shortDay(f.lowest.date)}</small></div></div>`+graph(chart.map(p=>({date:p.date,label:shortDay(p.date),balance:p.balance})),[{key:'balance',name:'יתרה צפויה',color:f.overdraft?tone.negative:palette[0]}],{height:150,area:true}),'home-widget cashflow-widget');
  },
  recent:({d})=>card(head('התנועות האחרונות','',textBtn('לכל התנועות','navigate:transactions'))+transactionsTable(d.transactions.filter(t=>t.date.startsWith(ui.month)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4),true),'recent-card'),
  goals:({d})=>card(head('היעדים שלך','',ib('Plus','הוספת יעד','open:goal'))+d.goals.slice(0,3).map((g,i)=>{const v=goalDetails(g);return `<button class="goal-preview" data-action="navigate:goals"><span class="asset-icon ${i%2?'purple':'gold'}">${icon(g.type==='קרן חירום'?'ShieldCheck':'Target')}</span><div><div class="row-between"><b>${e(g.name)}</b><span class="muted">${v.hasTarget?Math.round(v.progress)+'%':'תחזית'}</span></div>${progress(v.progress,i%2?'purple':'')}<small>${v.hasTarget?money(v.saved)+' מתוך '+money(g.target):money(v.saved)+' היום · '+money(v.projected)+' צפויים'}</small></div></button>`;}).join('')+(!d.goals.length?empty('מה היעד הבא שלך?','',btn('יצירת יעד','open:goal')):'')+`<div class="goal-more">${textBtn('לכל היעדים','navigate:goals')}</div>`,'goals-preview')
};

// In the hero the shekel sign is drawn smaller than the digits (styled by .hero-cur).
const heroAmount=text=>e(text).replace('₪','<span class="hero-cur">₪</span>');
function heroCard(d,b){
  const banks=checkingAccounts(d);
  if(!banks.length)return card(`<div class="hero-empty"><span class="hero-label">${icon('Wallet',18)}בעו״ש עכשיו</span><h2>עוד לא הגדרת חשבון עו״ש</h2><p>הקלד כמה יש לך בחשבון, ואופק תחשב ממנו כמה בטוח לבזבז כל יום.</p>${btn('הגדרת היתרה בעו״ש','setup-start','Pencil','primary')}</div>`,'hero-card');
  const total=checkingTotal(d),updated=banks.map(a=>a.balanceUpdated).filter(Boolean).sort().at(-1),safe=safeToSpend(d,today());
  return card(`<div class="hero-top"><span class="hero-label">${icon('Wallet',18)}בעו״ש עכשיו${banks.length>1?` · ${banks.length} חשבונות`:''}</span><button type="button" class="hero-edit" data-action="balance-edit">${icon('Pencil',15)}<span>עדכון יתרה</span></button></div><div class="hero-balance${total<0?' negative':''}" dir="ltr">${heroAmount(money(total,'ILS',Number.isInteger(Math.round(total*100)/100)?0:2))}</div><div class="hero-updated ${balanceFreshness(updated)}">${e(updatedLabel(updated))}</div><div class="hero-stats"><button type="button" class="hero-stat" data-action="navigate:bills"><span>בטוח לבזבז היום</span><b dir="ltr">${heroAmount(money(Math.max(0,safe.perDay)))}</b><small>${safe.daysLeft} ימים לסוף החודש</small></button><button type="button" class="hero-stat" data-action="navigate:accounts"><span>השווי הנקי</span><b dir="ltr">${heroAmount(money(b.net))}</b><small>נכסים פחות התחייבויות</small></button></div><div class="hero-foot">${fxChip()}</div>`,'hero-card');
}
function homeView(){
  const layout=homeLayout(),visible=visibleWidgets(layout),ctx=homeContext();let n=0;
  const rows=homeRows(visible).map(row=>`<div class="home-row${row.some(id=>homeWidget(id).stack)?' stack-md':''}" data-count="${row.length}" style="grid-template-columns:${row.map(id=>`minmax(0,${homeWidget(id).w}fr)`).join(' ')}">${row.map(id=>{let html;try{html=HOME_RENDER[id](ctx);}catch(err){html=card(`<p class="muted small">${e(homeWidget(id).label)}: לא הצלחנו להציג את הכרטיס.</p>`);}return `<div class="home-cell" data-widget="${id}" style="--i:${n++}">${html}</div>`;}).join('')}</div>`).join('');
  return (ui.homeEdit?homeEditor(layout):'')+(visible.length?`<div class="home-board${ui.homeEdit?' editing':''}">${rows}</div>`:card(empty('דף הבית ריק','בחר כרטיסים להצגה, או חזור לפריסה המלאה.',btn('פריסה מלאה','home-preset:full','LayoutGrid','primary'))));
}

// ---------- Editor ----------
function presetMatches(visible,ids){return visible.join()===ids.join();}
function homeEditor(layout){
  const visible=visibleWidgets(layout),hidden=HOME_WIDGETS.map(w=>w.id).filter(id=>!visible.includes(id));
  const row=(id,i)=>{const w=homeWidget(id),l=e(w.label);return `<li class="home-editor-row" draggable="true" data-home-id="${id}"><span class="grip" title="גרירה לשינוי הסדר">${icon('GripVertical',16)}</span><span class="home-editor-index">${i+1}</span><span class="asset-icon">${icon(w.icon,16)}</span><div><b>${l}${w.fresh?'<span class="nav-new">חדש</span>':''}</b><small>${e(w.hint)}</small></div><div class="home-editor-actions"><button type="button" class="icon-button" aria-label="הזזה למעלה: ${l}" title="למעלה" data-action="home-move:${id}:-1" ${i===0?'disabled':''}>${icon('ArrowUp',16)}</button><button type="button" class="icon-button" aria-label="הזזה למטה: ${l}" title="למטה" data-action="home-move:${id}:1" ${i===visible.length-1?'disabled':''}>${icon('ArrowDown',16)}</button><button type="button" class="icon-button" aria-label="הסתרה: ${l}" title="הסתרה" data-action="home-toggle:${id}">${icon('EyeOff',16)}</button></div></li>`;};
  return card(head('התאמת דף הבית','גרור כרטיס או השתמש בחצים כדי לשנות את הסדר. השינויים נשמרים מיד — וגם במכשירים המסונכרנים.',`<div class="actions">${btn('סיום','home-done','Check','primary')}</div>`)+`<div class="home-presets" role="group" aria-label="פריסות מוכנות"><span>פריסה מוכנה:</span>${HOME_PRESETS.map(([id,label,ids])=>`<button type="button" class="home-preset ${presetMatches(visible,ids)?'active':''}" data-action="home-preset:${id}">${label}</button>`).join('')}</div><div class="home-editor-cols"><div><h3>מוצגים בדף הבית <span class="muted">(${visible.length})</span></h3>${visible.length?`<ol class="home-editor">${visible.map(row).join('')}</ol>`:'<p class="muted small">אין כרטיסים מוצגים.</p>'}</div><div><h3>אפשר להוסיף</h3>${hidden.length?`<div class="home-hidden">${hidden.map(id=>{const w=homeWidget(id);return `<button type="button" class="home-add" data-action="home-toggle:${id}"><span class="asset-icon">${icon(w.icon,16)}</span><span><b>${e(w.label)}${w.fresh?'<span class="nav-new">חדש</span>':''}</b><small>${e(w.hint)}</small></span>${icon('Plus',16)}</button>`;}).join('')}</div>`:'<p class="muted small">כל הכרטיסים כבר מוצגים.</p>'}</div></div>`,'home-editor-card');
}
function moveWidget(id,target,after){
  const visible=visibleWidgets(homeLayout()).filter(x=>x!==id);
  let at=visible.indexOf(target);if(at<0)return;if(after)at++;
  visible.splice(at,0,id);saveHomeLayout(visible);
}

let homeDrag=null;
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,a,b]=button.dataset.action.split(':');
  try{
    if(action==='home-edit'){ui.homeEdit=true;navigate('dashboard');}
    else if(action==='home-done'){ui.homeEdit=false;render();}
    else if(action==='home-toggle'&&homeWidget(a)){
      const visible=visibleWidgets(homeLayout()),on=visible.includes(a);
      saveHomeLayout(on?visible.filter(x=>x!==a):[...visible,a],on?'':`״${homeWidget(a).label}״ נוסף לסוף דף הבית`);
    }
    else if(action==='home-move'&&homeWidget(a)){
      const visible=visibleWidgets(homeLayout()),i=visible.indexOf(a),j=i+Number(b);
      if(i<0||j<0||j>=visible.length)return;
      [visible[i],visible[j]]=[visible[j],visible[i]];saveHomeLayout(visible);
      requestAnimationFrame(()=>document.querySelector(`.home-editor-row[data-home-id="${a}"] [data-action="home-move:${a}:${b}"]`)?.focus());
    }
    else if(action==='home-preset'){
      const preset=HOME_PRESETS.find(p=>p[0]===a);if(!preset)return;
      saveHomeLayout(preset[2],`נבחרה הפריסה ״${preset[1]}״`);
    }
  }catch(err){toast(err.message,true);}
});
document.addEventListener('dragstart',event=>{
  const row=event.target.closest?.('.home-editor-row');if(!row)return;
  homeDrag=row.dataset.homeId;row.classList.add('dragging');
  event.dataTransfer.effectAllowed='move';try{event.dataTransfer.setData('text/plain',homeDrag);}catch{}
});
document.addEventListener('dragover',event=>{
  const row=event.target.closest?.('.home-editor-row');if(!homeDrag||!row)return;
  event.preventDefault();
  const after=event.clientY>row.getBoundingClientRect().top+row.offsetHeight/2;
  document.querySelectorAll('.home-editor-row.drop-before,.home-editor-row.drop-after').forEach(x=>x.classList.remove('drop-before','drop-after'));
  if(row.dataset.homeId!==homeDrag)row.classList.add(after?'drop-after':'drop-before');
});
document.addEventListener('drop',event=>{
  const row=event.target.closest?.('.home-editor-row');if(!homeDrag||!row)return;
  event.preventDefault();
  const id=homeDrag,after=row.classList.contains('drop-after');homeDrag=null;
  if(row.dataset.homeId!==id)moveWidget(id,row.dataset.homeId,after);
});
document.addEventListener('dragend',()=>{homeDrag=null;document.querySelectorAll('.home-editor-row.dragging,.drop-before,.drop-after').forEach(x=>x.classList.remove('dragging','drop-before','drop-after'));});
