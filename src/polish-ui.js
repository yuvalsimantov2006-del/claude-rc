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
    const key=`${ui.page}:${el.closest('[data-widget]')?.dataset.widget||i}:${el.className}`,previous=shownNumbers.get(key);
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

// ---------- What's new in 3.0 ----------
const WHATS_NEW_KEY='ofek-seen-version',WHATS_NEW_VERSION='3.0';
// Read before app.js loads (and saves) the data: a first visit gets a welcome, a returning user "what's new".
const firstVisit=(()=>{try{return typeof localStorage!=='undefined'&&!localStorage.getItem(STORAGE_KEY);}catch{return false;}})();
const WHATS_NEW=[
  ['LayoutGrid','דף בית מותאם אישית','בוחרים אילו כרטיסים יופיעו ובאיזה סדר — כולל השקעות, כסף פנוי, תקציבים ותחזית תזרים.','home'],
  ['Target','הקצאת כסף ליעדים','מחלקים יתרה של חשבון אחד בין כמה יעדים, בלי לספור את אותו שקל פעמיים.','goals'],
  ['CalendarDays','תחזית תזרים יומית','כמה כסף צפוי להישאר בכל יום בחודשים הקרובים, אחרי משכורת, חיובים והפקדות.','bills'],
  ['Upload','עדכון השקעות מהדבקה','מדביקים טבלה או מעלים דוח מבית ההשקעות, בודקים את השינויים ושומרים.','holdings'],
  ['ShieldCheck','סיכון ופיזור','ריכוז בנכסים, חשיפה לדולר, פיזור בין תחומים ומה יקרה בירידה בשוק.','risk'],
  ['FlaskConical','סימולטור ״מה יקרה אם״','רכב, מענק שחרור או שינוי בהפקדה — ומה זה עושה ליתרה ולמועד היעדים.','whatif'],
  ['ScanLine','קליטת הוצאות חכמה','פירוט אשראי, דף בנק או צילום קבלה — עם קטגוריות מוצעות וזיהוי כפילויות.','capture'],
  ['Smartphone','אפליקציה בטלפון','התקנה למסך הבית, ניווט ביד אחת, הוספה מהירה והתראות לבחירתך.','app'],
  ['Repeat','סנכרון וגיבוי','סנכרון מוצפן בין הטלפון למחשב, היסטוריית גרסאות וגיבוי מוצפן.','sync'],
  ['Sparkles','עיצוב מלוטש','כרטיסי זכוכית, מספרים בולטים ואנימציות קצרות — פחות עומס, יותר בהירות.','']
];
function openWhatsNew(){
  try{localStorage.setItem(WHATS_NEW_KEY,WHATS_NEW_VERSION);}catch{}
  showDialog(firstVisit?'ברוך הבא לאופק':'מה חדש באופק 3.0',`<p class="confirm-text">${firstVisit?'הכסף שלך במקום אחד — והנה כמה דברים שכדאי להכיר. הנתונים כאן הם הדגמה, ואפשר להסיר אותם בכל רגע.':'עשרה שדרוגים, והכפתורים נשארו בדיוק איפה שהיו.'}</p><div class="whats-new">${WHATS_NEW.filter(item=>!firstVisit||item[3]).map(([ic,title,text,go],i)=>`<${go?`button type="button" data-action="whats-new:${go}"`:'div'} class="whats-new-item" style="--i:${i}"><span class="asset-icon ${['gold','purple','green'][i%3]}">${icon(ic,18)}</span><span><b>${e(title)}</b><small>${e(text)}</small></span>${go?icon('ChevronLeft',15):''}</${go?'button':'div'}>`).join('')}</div><div class="form-actions">${btn('יאללה, מתחילים','dialog-close','Check','primary')}</div>`,true);
  // Focus the dialog itself (not the close button), so it opens at the top without a focus ring.
  const dialog=document.querySelector('dialog');if(dialog){dialog.tabIndex=-1;dialog.focus();}
}
function goToFeature(target){
  closeDialog();
  const scrollTo=selector=>setTimeout(()=>document.querySelector(selector)?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  if(target==='home'){ui.homeEdit=true;navigate('dashboard');}
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
if(typeof setTimeout==='function'&&typeof document!=='undefined'&&document.head){
  setTimeout(()=>{
    let seen=null;try{seen=localStorage.getItem(WHATS_NEW_KEY);}catch{}
    if(seen!==WHATS_NEW_VERSION&&!document.querySelector('dialog'))openWhatsNew();
  },900);
}
