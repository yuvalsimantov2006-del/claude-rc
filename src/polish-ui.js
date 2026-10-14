// Short, purposeful motion and the "what's new" tour.
// Key numbers count to their value when a page opens, or from the old value when it changes
// (add an expense and the net worth visibly moves). Entrance animations run only on navigation,
// never on re-renders caused by clicks or typing.

const NUMBER_SELECTOR='.net-value, .metric-value, .widget-number, .safe-number, .chart-stat > b, .budget-big > b';
const shownNumbers=new Map();
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function animateNumbers(entering){
  if(typeof document.querySelectorAll!=='function'||typeof requestAnimationFrame!=='function')return;
  const seen=new Set();
  document.querySelectorAll(NUMBER_SELECTOR).forEach((el,i)=>{
    if(el.closest('dialog'))return;
    const text=el.textContent,m=text.match(/\d[\d,]*(?:\.\d+)?/);if(!m)return;
    const target=Number(m[0].replace(/,/g,''));if(!Number.isFinite(target))return;
    // Unique per element: several numbers in one widget (the month card's three metrics) must not share a key,
    // or each would start from its neighbour's value.
    const scope=el.closest('[data-widget]'),idx=scope?[...scope.querySelectorAll(NUMBER_SELECTOR)].indexOf(el):i;
    // The label and the number's shape (%, שנים, ₪) are part of the key too, so a different metric shown in the
    // same place after a tab switch never counts up from an unrelated value.
    const label=el.closest('.metric')?.querySelector('.metric-top span')?.textContent||'',shape=text.replace(/\d[\d,]*(?:\.\d+)?/,'#');
    const key=`${ui.page}:${scope?.dataset.widget||'page'}:${idx}:${el.className}:${label}:${shape}`,previous=shownNumbers.get(key);
    seen.add(key);shownNumbers.set(key,target);
    if(reducedMotion()||previous===target||(previous==null&&!entering)||target===0)return;
    const from=previous??target*.82,decimals=m[0].includes('.')?m[0].split('.')[1].length:0;
    const format=new Intl.NumberFormat('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
    const before=text.slice(0,m.index),after=text.slice(m.index+m[0].length),duration=previous==null?720:520;let start=null;
    // The frame timestamp is used for timing (the app has its own `performance` function in scope).
    const step=now=>{
      if(!el.isConnected)return;
      if(start==null)start=now;
      const p=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-p,3);
      el.textContent=before+format.format(from+(target-from)*eased)+after;
      if(p<1)requestAnimationFrame(step);else el.textContent=text;
    };
    el.textContent=before+format.format(from)+after;
    requestAnimationFrame(step);
  });
  for(const key of [...shownNumbers.keys()])if(key.startsWith(ui.page+':')&&!seen.has(key))shownNumbers.delete(key);
}
function motionAfterRender(){animateNumbers(ui.entering);}

// ---------- What's new in 4.0 ----------
const WHATS_NEW_KEY='ofek-seen-version',WHATS_NEW_VERSION='4.0';
// Read before app.js loads (and saves) the data: a first visit gets the setup, a returning user "what's new".
const firstVisit=(()=>{try{return typeof localStorage!=='undefined'&&!localStorage.getItem(STORAGE_KEY);}catch{return false;}})();
const WHATS_NEW=[
  ['Sparkles','עיצוב חדש לגמרי','מראה בהיר ונקי, עם מצב כהה בלחיצה (השמש/הירח למעלה).',''],
  ['House','חמישה אזורים במקום תפריט ארוך','בית · הכסף שלי · חיסכון והשקעות · תכנון וכלים · Claude. בתוך כל אזור — לשוניות פשוטות.','tour-hubs'],
  ['Wallet','היתרה בעו״ש — בראש המסך','רואים כמה יש עכשיו, ומעדכנים בלחיצה לפי מה שהבנק מראה.','balance'],
  ['CircleDollarSign','שער הדולר מתעדכן לבד','אופק מביאה את השער כל יום, וגם לפי תאריך בתנועות ובעדכון החודשי.','fx'],
  ['Plus','הוספה מהירה מכל מקום','הכפתור במרכז הסרגל התחתון, או ״הוספת תנועה״ למעלה.','quick'],
  ['LayoutGrid','דף בית רגוע יותר','פחות כרטיסים כברירת מחדל — ואפשר להוסיף או להסיר ב״התאמה אישית״.','home']
];
function openWhatsNew(){
  try{localStorage.setItem(WHATS_NEW_KEY,WHATS_NEW_VERSION);}catch{}
  showDialog('מה חדש באופק 4.0',`<p class="confirm-text">שינוי גדול: עיצוב חדש, ניווט פשוט יותר, והכסף שבעו״ש תמיד מול העיניים.</p><div class="whats-new">${WHATS_NEW.map(([ic,title,text,go],i)=>`<${go?`button type="button" data-action="whats-new:${go}"`:'div'} class="whats-new-item" style="--i:${i}"><span class="whats-new-icon">${icon(ic,20)}</span><span><b>${e(title)}</b><small>${e(text)}</small></span>${go?icon('ChevronLeft',15):''}</${go?'button':'div'}>`).join('')}</div><div class="form-actions">${btn('יאללה, מתחילים','dialog-close','Check','primary')}</div>`,true);
  // Focus the dialog itself (not the close button), so it opens at the top without a focus ring.
  const dialog=document.querySelector('dialog');if(dialog){dialog.tabIndex=-1;dialog.focus();}
}
function goToFeature(target){
  closeDialog();
  const scrollTo=selector=>setTimeout(()=>document.querySelector(selector)?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  if(target==='home'){ui.homeEdit=true;navigate('dashboard');}
  else if(target==='tour-hubs'){if(window.innerWidth<=760)openMoreSheet();else navigate('dashboard');}
  else if(target==='balance'){navigate('dashboard');setTimeout(()=>openBalanceEditor(),60);}
  else if(target==='fx'){navigate('settings');scrollTo('#fx-card');}
  else if(target==='quick')openQuickAdd();
  else if(target==='goals'){navigate('goals');scrollTo('.alloc-card');}
  else if(target==='bills')navigate('bills');
  else if(target==='holdings'){navigate('investments');setTimeout(()=>openHoldingsImport(),60);}
  else if(target==='risk'){navigate('investments');scrollTo('.risk-card');}
  else if(target==='whatif'){ui.labTab='whatif';navigate('lab');}
  else if(target==='capture')navigate('capture');
  else if(target==='app'){navigate('settings');scrollTo('#app-card');}
  else if(target==='sync'){navigate('settings');scrollTo('#sync-card');}
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,target]=button.dataset.action.split(':');
  try{
    if(action==='whats-new')target?goToFeature(target):openWhatsNew();
  }catch(err){toast(err.message,true);}
});
// Keep chart text and dots undistorted at every card width (fitChart in charts.js), including charts
// added outside render() (lab results, calculators, chat) and after resizes.
if(typeof ResizeObserver==='function'&&typeof MutationObserver==='function'&&typeof document!=='undefined'&&document.body){
  const chartSizes=new ResizeObserver(entries=>entries.forEach(({target})=>target.isConnected?fitChart(target):chartSizes.unobserve(target)));
  const watchCharts=()=>document.querySelectorAll('.native-chart svg:not([data-watched])').forEach(svg=>{svg.setAttribute('data-watched','');chartSizes.observe(svg);});
  new MutationObserver(watchCharts).observe(document.body,{childList:true,subtree:true});
  watchCharts();
}
if(typeof setTimeout==='function'&&typeof document!=='undefined'&&document.head){
  setTimeout(()=>{
    let seen=null;try{seen=localStorage.getItem(WHATS_NEW_KEY);}catch{}
    if(seen===WHATS_NEW_VERSION||document.querySelector('dialog'))return;
    if(firstVisit)openSetup(0);else openWhatsNew();
  },900);
}
