import {money,minusMoney,pct,monthLabel,today,dateLabel,balances,monthlySummary,categorySpend,dietz,rangeStart,portfolioValue,homeSummary,homeLayoutOf,homePrefsWith,migrateHomePrefs,HOME_DEFAULT_IDS} from './finance.js';
import {palette,tone,graph,donut} from './charts.js';
import {freeMoney,accountAllocations} from './savings.js';
import {riskProfile,portfolioGlance} from './invest.js';
import {cashflowForecast} from './money.js';
import {onModuleHook} from './hooks.js';

// Customizable home page. The dashboard is a list of cards ("widgets"); the user picks which ones
// to show and in what order. The layout is saved in data.prefs.home, so it follows them between
// devices. Rows are packed from the widgets' relative widths (out of 12), so any order fills cleanly.
// 4.2: the default home is only what matters, each amount in its own place and counted once:
// checking ("בעו״ש עכשיו"), savings and investments side by side, "השווי שלי" (their sum, minus debts) and
// this month. Everything else waits in "התאמה אישית". Ids never change, so saved layouts keep working.

const HOME_WIDGETS=[
  {id:'hero',label:'בעו״ש',icon:'Wallet',hint:'כמה יש בחשבון העו״ש, וכמה בטוח לבזבז היום',w:6},
  {id:'savings',label:'חסכונות',icon:'PiggyBank',hint:'חשבונות חיסכון ופיקדונות — בנפרד מהעו״ש',w:3,tile:true,fresh:true},
  {id:'portfolio',label:'השקעות',icon:'TrendingUp',hint:'שווי התיק, הרווח והעדכון היומי',w:3,tile:true,fresh:true},
  {id:'networth',label:'השווי שלי',icon:'Landmark',hint:'כל החלקים יחד: עו״ש, חסכונות והשקעות, פחות חובות',w:7.4},
  {id:'month',label:'החודש',icon:'CalendarDays',hint:'כמה נכנס, כמה יצא ומה נשאר',w:4.6},
  {id:'upcoming',label:'חיובים קרובים',icon:'CalendarDays',hint:'תשלומים בשבועיים הקרובים',w:4.38},
  {id:'recent',label:'התנועות האחרונות',icon:'ArrowLeftRight',hint:'התנועות האחרונות החודש',w:7.8},
  {id:'goals',label:'היעדים שלך',icon:'Target',hint:'ההתקדמות ביעדי החיסכון',w:4.2},
  {id:'investments',label:'פירוט ההשקעות',icon:'ChartPie',hint:'הנכסים הגדולים בתיק והפיזור',w:4},
  {id:'spending',label:'לאן הכסף הולך',icon:'ChartPie',hint:'התפלגות ההוצאות החודש',w:4.2},
  {id:'budgets',label:'תקציבים',icon:'SlidersHorizontal',hint:'התקציבים הקרובים ביותר לגבול',w:4},
  {id:'safe',label:'בטוח לבזבז היום',icon:'Wallet',hint:'כמה אפשר להוציא היום, עם הפירוט',w:3.81},
  {id:'worth',label:'הכסף לאורך זמן',icon:'ChartNoAxesCombined',hint:'גרף השווי הנקי',w:7.8},
  {id:'assets',label:'פס הנכסים',icon:'Landmark',hint:'מזומן, חסכונות, השקעות וחובות בשורה אחת',w:12},
  {id:'insight',label:'התובנה החודשית',icon:'Sparkles',hint:'משפט אחד על החודש ועל התיק',w:12},
  {id:'health',label:'הציון הפיננסי',icon:'HeartPulse',hint:'המצב הפיננסי במספר אחד',w:3.7},
  {id:'pace',label:'קצב ההוצאות',icon:'Gauge',hint:'צפי לסוף החודש',w:3.7},
  {id:'ask',label:'שאל את Claude',icon:'Sparkles',hint:'שאלה מהירה על הכסף שלך',w:4.6},
  {id:'split',label:'חלוקות ומשאלות',icon:'ArrowLeftRight',hint:'מי חייב למי, ומה מחכה ברשימה',w:3.81},
  {id:'free',label:'כסף פנוי',icon:'PiggyBank',hint:'מה שלא מוקצה לאף יעד',w:4},
  {id:'cashflow',label:'תחזית תזרים',icon:'Activity',hint:'היתרה הצפויה בעו״ש ב־45 הימים הקרובים',w:6}
];
const HOME_IDS=HOME_WIDGETS.map(w=>w.id);
// The clear 4.2 home (finance.js keeps it beside the layout rules, for the tests).
const HOME_DEFAULT=HOME_DEFAULT_IDS;
const HOME_PRESETS=[
  ['calm','פשוט',HOME_DEFAULT],
  ['full','מלא',['hero','savings','portfolio','networth','month','upcoming','recent','goals','investments','spending','budgets','safe','worth','insight','health','pace','ask','split','free','cashflow']],
  ['investor','משקיע',['hero','savings','portfolio','networth','investments','worth','goals','free']],
  ['budget','תקציב חודשי',['hero','month','pace','budgets','upcoming','recent','spending','cashflow']]
];
const homeWidget=id=>HOME_WIDGETS.find(w=>w.id===id);

// The saved layout, completed with widgets it does not know (added in a later version → hidden). A layout
// saved before 4.2 shows the new default (and is replaced by it on load, once: see the boot hook below).
function homeLayout(){return homeLayoutOf(data.prefs,HOME_IDS,HOME_DEFAULT);}
const visibleWidgets=layout=>layout.order.filter(id=>!layout.hidden.includes(id));
function saveHomeLayout(visible,message=''){
  mutate(next=>{next.prefs=homePrefsWith(next.prefs,visible,HOME_IDS);},message);
}
// The one-time move to the 4.2 home, right after the data loads. It is saved like an automatic change (no toast,
// no undo); the mark it leaves (prefs.homeVersion) means every later layout is kept as the user sets it.
onModuleHook('boot',()=>{
  if(loadError)return;
  const prefs=migrateHomePrefs(data.prefs,HOME_IDS,HOME_DEFAULT);
  if(!prefs)return;
  try{commit({...data,prefs},'',false,{auto:true});}catch(err){try{console.error(err);}catch{}}
});
function homeRows(ids){
  const rows=[];let row=[],sum=0;
  for(const id of ids){const w=homeWidget(id).w;if(row.length&&sum+w>12.45){rows.push(row);row=[];sum=0;}row.push(id);sum+=w;}
  if(row.length)rows.push(row);
  return rows;
}

// ---------- Widgets ----------
function homeContext(){
  const d=data,b=balances(d),h=homeSummary(d),s=monthlySummary(d,ui.month),snaps=sortedSnapshots(),last=snaps.at(-1),prev=snaps.at(-2),p=dietz(prev,last,d.activities);
  return {d,b,h,s,snaps,last,p,nw:prev&&last?(last.netWorth-prev.netWorth)/Math.abs(prev.netWorth||1):null};
}
// signedMoney: invest-ui.js ("+1,200 ₪", "−80 ₪", "0 ₪").
const widgetHead=(ic,label,action,link)=>`<div class="row-between"><span class="eyebrow">${icon(ic,15)} ${e(label)}</span>${action?textBtn(link,action):''}</div>`;

// A home tile (savings, investments): the whole tile opens its page through one stretched link; a button inside
// it (the daily update) sits above that link. tone-N picks the palette colour of the icon tile.
function homeTile({id,label,ic,tone:t,route,value,lines='',action='',empty:emptyLine=null}){
  const go=`<button type="button" class="home-tile-link" data-action="navigate:${route}"><span class="home-tile-icon tone-${t}">${icon(ic,18)}</span><span class="home-tile-label">${e(label)}</span>${icon('ChevronLeft',16)}</button>`;
  if(emptyLine)return card(`${go}<p class="home-tile-empty">${e(emptyLine[0])}</p>${emptyLine[1]}`,`home-tile ${id}-tile is-empty`);
  return card(`${go}<b class="home-tile-value widget-number" dir="ltr">${e(value)}</b>${lines}${action}`,`home-tile ${id}-tile`);
}
function savingsTile(d,h){
  const accounts=d.accounts.filter(a=>a.kind==='savings'||a.kind==='deposit');
  if(!accounts.length)return homeTile({id:'savings',label:'חסכונות',ic:'PiggyBank',tone:2,route:'goals',empty:['עוד אין חשבון חיסכון. כסף בצד נספר כאן — לא בעו״ש.',`<button type="button" class="home-tile-cta" data-action="home-new-account:savings">${icon('Plus',15)}<span>חשבון חיסכון</span></button>`]});
  const goals=accounts.reduce((s,a)=>s+(accountAllocations(d,a.id)?.allocated||0),0);
  const release=accounts.filter(a=>a.kind==='deposit'&&a.releaseDate&&a.releaseDate>today()).map(a=>a.releaseDate).sort()[0];
  const sub=goals>=.5?safe(`מתוכם ${amt(Math.min(goals,h.saved))} ליעדים`):release?`פיקדון עד ${dateLabel(release)}`:accounts.length>1?`${accounts.length} חשבונות`:accounts[0].name;
  // What is set aside for goals, and what is left free: a thin bar at the tile's foot (level with the button
  // in the investments tile beside it).
  const share=h.saved>0?Math.min(1,Math.max(0,goals/h.saved)):0,free=Math.max(0,h.saved-goals);
  const foot=goals>=.5&&h.saved>0?`<div class="home-tile-foot"><div class="home-tile-bar" role="img" aria-label="${e(`${money(Math.min(goals,h.saved))} ליעדים, ${money(free)} פנויים`)}"><span style="width:${(share*100).toFixed(2)}%"></span></div><small>${free>=.5?safe(`${amt(free)} פנויים`):'הכול מוקצה ליעדים'}</small></div>`:'';
  return homeTile({id:'savings',label:'חסכונות',ic:'PiggyBank',tone:2,route:'goals',value:money(h.saved),lines:`<small class="home-tile-sub">${e(sub)}</small>${release&&goals>=.5?`<small class="home-tile-sub">פיקדון עד ${e(dateLabel(release))}</small>`:''}`,action:foot});
}
function freshnessLine(g){
  const days=g.days,text=days==null?'המחירים עוד לא עודכנו':days<=0?'המחירים עודכנו היום':days===1?'המחירים עודכנו אתמול':days<31?`המחירים מלפני ${days} ימים`:`המחירים מ־${dateLabel(g.latest)}`;
  return `<small class="home-tile-fresh ${days!=null&&days<=1&&!g.stale?'fresh':days!=null&&days<=1?'':'stale'}">${e(text)}</small>`;
}
function portfolioTile(d){
  const g=portfolioGlance(d,today());
  if(!g.count&&!(Math.abs(g.value)>=.5))return homeTile({id:'portfolio',label:'השקעות',ic:'TrendingUp',tone:3,route:'investments',empty:['עוד אין השקעות במעקב. מניות, קרנות וקופות נספרות כאן.',`<button type="button" class="home-tile-cta" data-action="open:asset">${icon('Plus',15)}<span>הוספת השקעה</span></button>`]});
  const gain=g.invested>0?`<small class="home-tile-gain ${Math.abs(g.profit)<.5?'':g.profit>0?'positive':'negative'}"><bdi dir="ltr">${e(signedMoney(g.profit))}</bdi> · <bdi dir="ltr">${e(pct(g.return))}</bdi></small>`:'';
  const update=g.count?`<button type="button" class="home-tile-action" data-action="daily-update">${icon('RefreshCw',15)}<span>עדכון יומי</span></button>`:'';
  return homeTile({id:'portfolio',label:'השקעות',ic:'TrendingUp',tone:3,route:'investments',value:money(g.value),lines:gain+(g.count?freshnessLine(g):''),action:update});
}
// "השווי שלי": the parts above, each counted once, and their sum. Cash, a deposit and debts show only when present.
const WORTH_PARTS={checking:'עו״ש',cash:'מזומן',savings:'חסכונות',deposits:'פיקדון',investments:'השקעות',loans:'הלוואות',cards:'כרטיסי אשראי'};
function worthCard(h){
  const shown=h.parts.filter(p=>['checking','savings','investments'].includes(p.id)||Math.abs(p.value)>=.5);
  const plus=shown.filter(p=>p.value>0),barTotal=plus.reduce((s,p)=>s+p.value,0),debts=shown.filter(p=>p.id==='loans'||p.id==='cards');
  const bar=barTotal>0?`<div class="worth-bar" role="img" aria-label="${e(plus.map(p=>`${WORTH_PARTS[p.id]} ${money(p.value)}`).join(', '))}">${plus.map(p=>`<span class="k-${p.id}" style="width:${(p.value/barTotal*100).toFixed(2)}%"></span>`).join('')}</div>`:'';
  const row=p=>`<li class="${p.value<0?'minus':''}"><i class="k-${p.id}"></i><span>${e(WORTH_PARTS[p.id])}</span><b dir="ltr">${e(p.value<0?minusMoney(p.value):money(p.value))}</b></li>`;
  return card(`<div class="row-between"><span class="eyebrow">${icon('Landmark',15)} השווי שלי</span>${textBtn('לחשבונות','navigate:accounts')}</div><b class="worth-total net-value${h.net<0?' negative':''}" dir="ltr">${e(money(h.net))}</b>${bar}<ul class="worth-legend">${shown.filter(p=>!debts.includes(p)).map(row).join('')}${debts.map(row).join('')}</ul><p class="worth-note">כל חלק נספר בנפרד, פעם אחת${debts.length?' — השווי הוא הסכום שלהם, פחות החובות':' — השווי הוא הסכום שלהם'}. החסכונות וההשקעות לא נכללים בעו״ש.</p>`,'worth-card');
}
function monthCard(d,s){
  const left=s.income-s.expenses,spentShare=s.income>0?Math.min(1,Math.max(0,s.expenses/s.income)):null;
  return card(`<div class="row-between"><span class="eyebrow">${icon('CalendarDays',15)} החודש · ${e(monthLabel(ui.month))}</span>${textBtn('לתנועות','navigate:transactions')}</div><div class="month-figures"><div><span>${icon('ArrowDownLeft',14)}נכנס</span><b class="widget-number" dir="ltr">${e(money(s.income))}</b></div><div><span>${icon('ArrowUpLeft',14)}יצא</span><b class="widget-number" dir="ltr">${e(money(s.expenses))}</b></div><div class="month-left${left<0?' negative':''}"><span>${left<0?'חסר':'נשאר'}</span><b class="widget-number" dir="ltr">${e(left<0?minusMoney(left):money(left))}</b></div></div>${spentShare!=null?`<div class="month-bar${left<0?' over':''}" role="img" aria-label="${e(`יצאו ${pct(s.expenses/s.income)} מההכנסות`)}"><span style="width:${(spentShare*100).toFixed(2)}%"></span></div>`:''}`,'month-card');
}
const HOME_RENDER={
  hero:({d})=>heroCard(d),
  savings:({d,h})=>savingsTile(d,h),
  portfolio:({d})=>portfolioTile(d),
  networth:({h})=>worthCard(h),
  month:({d,s})=>monthCard(d,s),
  assets:({b})=>`<div class="asset-strip">${[['מזומן וחשבונות',b.cash,'Wallet','blue','accounts'],['חסכונות',b.savings,'PiggyBank','purple','goals'],['השקעות',b.investments,'TrendingUp','gold','investments'],...(b.restricted>0?[['פיקדון מוגבל',b.restricted,'Lock','purple','accounts']]:[]),['התחייבויות',b.liabilities,'Landmark','red','accounts']].map(([name,value,ic,color,route])=>`<button class="asset-strip-item" data-action="navigate:${route}"><span class="asset-icon ${color}">${icon(ic,19)}</span><div><span>${name}</span><b dir="ltr">${money(value)}</b></div>${icon('ChevronLeft',15)}</button>`).join('')}</div>`,
  worth:({b,snaps,last,nw})=>{
    const hist=snaps.filter(s=>s.date>=rangeStart(last?.date||today(),ui.dashboardPeriod)).map(s=>({...s,net:s.netWorth,label:new Date(s.date+'T12:00:00').toLocaleDateString('he-IL',{month:'short'})}));
    return card(head('הכסף שלך, לאורך זמן','התפתחות השווי הנקי',`<div class="segmented mini">${[['3','3 ח׳'],['6','6 ח׳'],['12','שנה'],['all','הכול']].map(([v,l])=>`<button class="${ui.dashboardPeriod===v?'active':''}" data-action="dash-period:${v}">${l}</button>`).join('')}</div>`)+`<div class="chart-stat"><b dir="ltr">${money(last?.netWorth||b.net)}</b>${change(nw)}</div>`+graph(hist,undefined,{area:true,height:222})+`<div class="chart-footer"><span><i class="gold-dot"></i>שווי נקי</span><span>לפי תמונות מצב חודשיות</span></div>`,'worth-chart');
  },
  spending:({d,s})=>{
    const breakdown=d.categories.map((name,i)=>({name,value:Math.max(0,categorySpend(d,name,ui.month)),color:palette[i%palette.length]})).filter(a=>a.value>0).sort((a,b)=>b.value-a.value),top=breakdown.slice(0,4);
    if(breakdown.length>4)top.push({name:'אחר',value:breakdown.slice(4).reduce((s,v)=>s+v.value,0),color:tone.muted});
    return card(widgetHead('ChartPie','לאן הכסף הולך?','navigate:transactions','לתנועות')+(top.length?donut(top,s.expenses,'הוצאות החודש',155):empty('חודש חדש, התחלה חדשה','ההוצאות שתוסיף יופיעו כאן.')),'expenses-chart');
  },
  insight:({s,p})=>`<div class="insight-banner"><span class="insight-icon">${icon('Sparkles',22)}</span><div><b>${s.rate>0?`יפה, חסכת ${pct(s.rate)} מההכנסה החודש!`:'צעד קטן היום, יותר חופש מחר.'}</b><span>${p.return==null?'עדכון חודשי יעזור לך לראות את ההתקדמות.':`תיק ההשקעות שלך ${p.return>=0?'עלה':'ירד'} ב־${pct(Math.abs(p.return))} בעדכון האחרון, אחרי נטרול תזרימים.`}</span></div><button data-action="navigate:insights">לתובנות שלך${icon('ChevronLeft',16)}</button></div>`,
  health:()=>healthMiniCard(),
  pace:()=>paceCard(true),
  ask:()=>askClaudeCard(),
  safe:()=>safeCard(),
  upcoming:()=>upcomingCard(),
  split:()=>splitMiniCard(),
  investments:({d,p})=>{
    if(!d.assets.length)return card(widgetHead('ChartPie','פירוט ההשקעות','navigate:investments','לתיק')+`<p class="muted small">עוד אין השקעות במעקב. אחרי שתוסיף נכס, תראה כאן את השווי, התשואה והפיזור.</p>${btn('הוספת השקעה','open:asset','Plus')}`,'home-widget invest-widget');
    const r=riskProfile(d),top=r.holdings.slice(0,5);
    return card(widgetHead('ChartPie','פירוט ההשקעות','navigate:investments','לתיק')+`<div class="widget-number" dir="ltr">${money(portfolioValue(d))}</div><div class="widget-sub">${p.return==null?'<span class="muted">כולל מזומן בתיק</span>':change(p.return,'בעדכון האחרון')}</div><div class="widget-alloc" aria-hidden="true">${r.holdings.slice(0,6).map((h,i)=>`<span style="width:${(h.share*100).toFixed(2)}%;background:${palette[i%palette.length]}"></span>`).join('')}</div><div class="widget-list">${top.map((h,i)=>`<div><i style="background:${palette[i%palette.length]}"></i><span>${e(h.name)}</span><b dir="ltr">${pct(h.share)}</b></div>`).join('')}</div><small class="muted">${pct(r.usdShare)} בדולר${r.concentration==='high'?' · ריכוז גבוה בנכס אחד':''}</small>`,'home-widget invest-widget');
  },
  free:()=>{
    const f=freeMoney(data),total=f.free+f.allocated;
    return card(widgetHead('PiggyBank','כסף פנוי','navigate:goals','ליעדים')+`<div class="widget-number${f.total<0?' negative':''}" dir="ltr">${money(f.total)}</div><small class="muted">לא מוקצה לאף יעד · מתוך ${amt(total)} בעו״ש, במזומן ובחיסכון${f.committed>0?` · ${amt(f.committed)} חוב בכרטיסים`:''}</small>${total>0?`<div class="free-bar" role="img" aria-label="${e(`${money(f.allocated)} מוקצים ליעדים, ${money(f.total)} פנויים`)}"><span style="width:${Math.min(100,f.allocated/total*100).toFixed(2)}%"></span></div><div class="free-legend"><span><i class="k-goal"></i>ליעדים ${amt(f.allocated)}</span><span><i class="k-free"></i>פנוי ${amt(f.free)}</span></div>`:''}${f.accounts.filter(x=>x.balance>0).length?`<div class="widget-list free-accounts">${f.accounts.filter(x=>x.balance>0).sort((a,b)=>b.balance-a.balance).slice(0,3).map(x=>`<div><span>${e(x.account.name)}</span><small class="muted">${x.allocated?`${amt(x.allocated)} ליעדים · `:''}</small><b dir="ltr">${money(x.free)}</b></div>`).join('')}</div>`:''}`,'home-widget free-widget');
  },
  budgets:({d})=>{
    const list=d.budgets.map(b=>{const spent=Math.max(0,categorySpend(d,b.category,ui.month));return {...b,spent,ratio:b.limit?spent/b.limit:0};}).sort((a,b)=>b.ratio-a.ratio),over=list.filter(b=>b.ratio>1).length;
    if(!list.length)return card(widgetHead('SlidersHorizontal','תקציבים','navigate:budgets','לתקציבים')+`<p class="muted small">עוד לא הוגדרו תקציבים לקטגוריות.</p>${btn('תקציב חדש','open:budget','Plus')}`,'home-widget budgets-widget');
    return card(widgetHead('SlidersHorizontal','תקציבים','navigate:budgets','לכל התקציבים')+`<div class="widget-budgets">${list.slice(0,6).map(b=>`<div><div class="row-between"><span class="cat-label">${categoryBadge(b.category,14,'mini')}${e(b.category)}</span><small class="${b.ratio>1?'negative':b.ratio>=.8?'warning':'muted'}">${amt(b.spent)} מתוך ${amt(b.limit)}</small></div>${progress(b.ratio*100,b.ratio>1?'red':b.ratio>=.8?'gold':'')}</div>`).join('')}</div><small class="${over?'negative':'muted'}">${over?`${over===1?'תקציב אחד חרג':`${over} תקציבים חרגו`} ב${monthLabel(ui.month).split(' ')[0]}`:`כל התקציבים בשליטה ב${monthLabel(ui.month).split(' ')[0]}`}</small>`,'home-widget budgets-widget');
  },
  cashflow:()=>{
    const f=cashflowForecast(data,{days:45}),step=Math.max(1,Math.ceil(f.points.length/46)),chart=f.points.filter((p,i)=>i%step===0||i===f.points.length-1||p.date===f.lowest.date);
    const shortDay=d=>new Date(d+'T12:00:00').toLocaleDateString('he-IL',{day:'numeric',month:'short'});
    return card(widgetHead('Activity','תחזית תזרים','navigate:bills','לתחזית המלאה')+`<div class="row-between cashflow-numbers"><div><span>היום</span><b dir="ltr">${money(f.start)}</b></div><div><span>בעוד 45 יום</span><b dir="ltr">${money(f.end)}</b></div><div><span>הנקודה הנמוכה</span><b dir="ltr" class="${f.lowest.balance<0?'negative':''}">${money(f.lowest.balance)}</b><small>${shortDay(f.lowest.date)}</small></div></div>`+graph(chart.map(p=>({date:p.date,label:shortDay(p.date),balance:p.balance})),[{key:'balance',name:'יתרה צפויה',color:f.overdraft?tone.negative:palette[0]}],{height:150,area:true}),'home-widget cashflow-widget');
  },
  recent:({d})=>card(widgetHead('ArrowLeftRight','התנועות האחרונות','navigate:transactions','לכל התנועות')+transactionsTable(d.transactions.filter(t=>t.date.startsWith(ui.month)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4),true),'recent-card'),
  goals:({d})=>card(widgetHead('Target','היעדים שלך','navigate:goals','לכל היעדים')+d.goals.slice(0,3).map((g,i)=>{const v=goalDetails(g);return `<button class="goal-preview" data-action="navigate:goals"><span class="asset-icon ${i%2?'purple':'gold'}">${icon(g.type==='קרן חירום'?'ShieldCheck':'Target')}</span><div><div class="row-between"><b>${e(g.name)}</b><span class="muted">${v.hasTarget?Math.round(v.progress)+'%':'תחזית'}</span></div>${progress(v.progress,i%2?'purple':'')}<small>${v.hasTarget?amt(v.saved)+' מתוך '+amt(g.target):amt(v.saved)+' היום · '+amt(v.projected)+' צפויים'}</small></div></button>`;}).join('')+(!d.goals.length?empty('מה היעד הבא שלך?','',btn('יצירת יעד','open:goal','Plus')):'')+(d.goals.length&&d.goals.length<3?`<div class="goal-more">${textBtn('יעד חדש','open:goal')}</div>`:''),'goals-preview')
};

// "בעו״ש עכשיו": checking only (bank accounts), the balance big, when it was last typed in, and one line of
// "safe to spend today". Savings and investments have their own tiles; their sum is "השווי שלי".
// In the hero the shekel sign is drawn smaller than the digits (styled by .hero-cur).
const heroAmount=text=>e(text).replace(/[\s  ]*₪/,'<span class="hero-cur">₪</span>');
function heroCard(d){
  const banks=checkingAccounts(d);
  if(!banks.length){
    const first=d.demo||!d.accounts.length;
    return card(`<div class="hero-empty"><span class="hero-label">${icon('Wallet',18)}בעו״ש עכשיו</span><h2>עוד לא הגדרת חשבון עו״ש</h2><p>הקלד כמה יש לך בעו״ש — וזה יהיה המספר הגדול כאן. חיסכון והשקעות נספרים בנפרד.</p><button type="button" class="hero-edit hero-cta" data-action="${first?'setup-start':'home-new-account:bank'}">${icon('Plus',16)}<span>הגדרת חשבון העו״ש</span></button></div>`,'hero-card is-empty');
  }
  const total=checkingTotal(d),updated=banks.map(a=>a.balanceUpdated).filter(Boolean).sort().at(-1),safeDay=safeToSpend(d,today());
  return card(`<div class="hero-top"><span class="hero-label">${icon('Wallet',18)}בעו״ש עכשיו${banks.length>1?` · ${banks.length} חשבונות`:''}</span><button type="button" class="hero-edit" data-action="balance-edit">${icon('Pencil',15)}<span>עדכון יתרה</span></button></div><div class="hero-balance${total<0?' negative':''}" dir="ltr">${heroAmount(money(total,'ILS',Number.isInteger(Math.round(total*100)/100)?0:2))}</div><div class="hero-updated ${balanceFreshness(updated)}">${e(updatedLabel(updated))}</div><button type="button" class="hero-safe" data-action="navigate:bills"><span>בטוח לבזבז היום</span><b dir="ltr">${e(money(Math.max(0,safeDay.perDay)))}</b>${icon('ChevronLeft',14)}</button>`,'hero-card');
}
// "המשכורת נכנסה? כמה בדיוק?" changes the checking balance, so its prompts stay on home even when the
// "חיובים קרובים" card (where they usually sit) is hidden: a slim card right under the checking card.
function homePrompts(visible){
  if(visible.includes('upcoming')||typeof confirmPromptsCard!=='function')return '';
  const html=confirmPromptsCard(2);
  return html?`<div class="home-row home-prompts" data-count="1">${html}</div>`:'';
}
function homeView(){
  const layout=homeLayout(),visible=visibleWidgets(layout),ctx=homeContext();let n=0;
  const rows=homeRows(visible),prompts=homePrompts(visible),at=Math.max(0,rows.findIndex(r=>r.includes('hero'))+1);
  // Tiles (savings, investments) pair up side by side on narrow screens; a tile without a neighbour spans the row.
  const solos=row=>{const solo=new Set();let run=[];for(const id of [...row,null]){if(id&&homeWidget(id).tile){run.push(id);continue;}if(run.length%2)solo.add(run.at(-1));run=[];}return solo;};
  const html=rows.map((row,i)=>{const solo=solos(row);return `${i===at&&prompts?prompts:''}<div class="home-row${row.some(id=>homeWidget(id).stack)?' stack-md':''}${row.some(id=>homeWidget(id).tile)?' has-tiles':''}" data-count="${row.length}" style="grid-template-columns:${row.map(id=>`minmax(0,${homeWidget(id).w}fr)`).join(' ')}">${row.map(id=>{let cell;try{cell=HOME_RENDER[id](ctx);}catch(err){cell=card(`<p class="muted small">${e(homeWidget(id).label)}: לא הצלחנו להציג את הכרטיס.</p>`);}return `<div class="home-cell${homeWidget(id).tile?' is-tile':''}${solo.has(id)?' solo':''}" data-widget="${id}" style="--i:${n++}">${cell}</div>`;}).join('')}</div>`;}).join('')+(at>=rows.length&&prompts?prompts:'');
  return (ui.homeEdit?homeEditor(layout):'')+(visible.length?`<div class="home-board${ui.homeEdit?' editing':''}">${html}</div>`:card(empty('דף הבית ריק','בחר כרטיסים להצגה, או חזור לפריסה הפשוטה.',btn('פריסה פשוטה','home-preset:calm','LayoutGrid','primary'))));
}

// ---------- Editor ----------
function presetMatches(visible,ids){return visible.join()===ids.join();}
function homeEditor(layout){
  const visible=visibleWidgets(layout),hidden=HOME_IDS.filter(id=>!visible.includes(id));
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
    // The empty tiles' calls to action: a new checking or savings account, the kind already chosen.
    else if(action==='home-new-account'&&['bank','savings'].includes(a))openEntity('account',null,{kind:a,currency:'ILS',name:a==='bank'?'חשבון עו״ש':'',institution:''});
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
