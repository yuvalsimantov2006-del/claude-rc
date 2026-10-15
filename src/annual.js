// Annual check 4.1: the yearly checklist items and when each is due (pure; WS-MODULES).
// Official links come only from FACTS §7. cadence 'year' = once per calendar year (the free credit report, the
// tax-refund year); '12m' = 12 months after the last check.
export const ANNUAL_CHECKS=[
  {id:'credit-report',icon:'FileJson',title:'דוח נתוני האשראי שלך',why:'דוח אחד בחינם בכל שנה קלנדרית מבנק ישראל: אילו הלוואות וחובות רשומים על שמך. טעות בדוח יכולה לייקר לך הלוואה.',cost:'חינם פעם בשנה',url:'https://www.creditdata.org.il/publications/report/',cadence:'year'},
  {id:'insurance',icon:'ShieldCheck',title:'הר הביטוח',why:'כל הביטוחים שלך במקום אחד — כדי לגלות ביטוח כפול שמשלמים עליו פעמיים. יש אתרים מתחזים: ודא שהכתובת היא harb.cma.gov.il.',cost:'חינם',url:'https://harb.cma.gov.il',cadence:'12m'},
  {id:'lost-money',icon:'Search',title:'הר הכסף',why:'כסף ששכחת בקופות גמל, בפנסיה ובביטוחי חיים. כניסה עם הזדהות ממשלתית.',cost:'חינם',url:'https://itur.mof.gov.il',cadence:'12m'},
  {id:'pension',icon:'PiggyBank',title:'המסלקה הפנסיונית',why:'כל החיסכון הפנסיוני שלך ודמי הניהול שאתה משלם. השימוש הישיר בתשלום, וחלק מהבנקים מממנים אותו.',cost:'בתשלום — המחיר המעודכן לא אומת',url:'https://www.swiftness.co.il',cadence:'12m'},
  {id:'tax-refund',icon:'Banknote',title:'החזר מס',why:'עבדת רק חלק מהשנה, החלפת עבודה או לא קיבלת נקודות זיכוי? אפשר לבקש החזר עד 6 שנים אחורה.',cost:'חינם',url:'https://www.gov.il/he/service/itc135',cadence:'year'},
  {id:'child-savings',icon:'Gift',title:'חיסכון לכל ילד',why:'נולדת לפני 2017? מגיע לך מענק של 582 ₪ בגיל 18, ועוד 582 ₪ אם לא משכת עד גיל 21. כל משיכה מוקדמת מבטלת את התוספת.',cost:'חינם',url:'https://www.btl.gov.il/benefits/children/HisahoLayeled/Pages/default.aspx',cadence:'12m'}
];
for(const c of ANNUAL_CHECKS)c.domain=c.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0];
const anIsDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'));
const anPad=n=>String(n).padStart(2,'0');
// The same day a year later; 29 February becomes 28 February.
function anNextYear(d){const y=+d.slice(0,4)+1,m=+d.slice(5,7),last=new Date(Date.UTC(y,m,0)).getUTCDate();return `${y}-${anPad(m)}-${anPad(Math.min(+d.slice(8,10),last))}`;}
// When a check done on `done` is due again.
export function annualDueOn(check,done){
  if(!anIsDate(done))return null;
  return check.cadence==='year'?`${+done.slice(0,4)+1}-01-01`:anNextYear(done);
}
// Each check with its state on `now`: 'done' (checked recently enough), 'due' or 'skip' (not relevant to me).
export function annualStatus(d,now){
  const saved=d?.annualChecks&&typeof d.annualChecks==='object'&&!Array.isArray(d.annualChecks)?d.annualChecks:{};
  const items=ANNUAL_CHECKS.map(c=>{
    const rec=saved[c.id]&&typeof saved[c.id]==='object'?saved[c.id]:{},done=anIsDate(rec.done)?rec.done:null,skip=rec.skip===true;
    const dueOn=annualDueOn(c,done),state=skip?'skip':done&&dueOn>now?'done':'due';
    return {...c,done,skip,dueOn,state};
  });
  return {items,due:items.filter(i=>i.state==='due').length};
}
// The yearly bell reminder: when at least one check is due, and not in the first 30 days after the data was created.
export function annualAlert(d,now){
  if(!d||!anIsDate(now))return null;
  if(anIsDate(d.createdAt)&&(Date.parse(now+'T12:00:00Z')-Date.parse(d.createdAt+'T12:00:00Z'))/864e5<30)return null;
  const n=annualStatus(d,now).due;if(!n)return null;
  return {id:`annual-${now.slice(0,4)}`,type:'reminders',icon:'ClipboardCheck',color:'blue',title:'הבדיקה השנתית מחכה לך',
    body:`${n} בדיקות קצרות שעוד לא עשית השנה — דוח אשראי, הר הביטוח ועוד.`,action:'navigate:insights'};
}
