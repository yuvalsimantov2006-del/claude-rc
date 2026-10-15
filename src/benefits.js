// After discharge 4.1: discharge facts, credit points, grant, deposit and work-grant estimates (pure; WS-MODULES).
// Every number comes from FACTS.md (researched 2026-10-14). Each fact carries its "as of" date, how sure we are
// ('verified' | 'partly' | 'conflicting' | 'unknown') and its sources, so the UI can label it an estimate (§F.9).
import {validDate} from './finance.js';

// The sources behind the numbers (the sources card lists them; bnEstimate links them).
const BN_SOURCES={
  'hachvana-grant':{label:'מענק שחרור — אתר ההכוונה של משרד הביטחון',url:'https://www.hachvana.mod.gov.il/GrantAndDeposit/Pages/Grant.aspx',status:'verified',asOf:'2026-07-01'},
  'hachvana-calc':{label:'מחשבון המענק והפיקדון — משרד הביטחון',url:'https://www.hachvana.mod.gov.il/GrantAndDeposit/DepositUpTo5/Pages/CalculatorOfDeposit.aspx',status:'verified',asOf:'2026-10-14'},
  'moneyplan-grant':{label:'מענק שחרור: תעריף ״אחר״ (מקור משני יחיד)',url:'https://www.moneyplan.co.il/מענק-שחרור/',status:'partly',asOf:'2026-07-01'},
  'protocol-grant':{label:'מתי נכנס מענק השחרור (60 יום)',url:'https://www.protocol.co.il/discharged-soldier-grant/',status:'partly',asOf:'2026-10-14'},
  'hachvana-deposit':{label:'הפיקדון האישי בחמש השנים הראשונות',url:'https://www.hachvana.mod.gov.il/GrantAndDeposit/DepositUpTo5/Pages/default.aspx',status:'verified',asOf:'2026-08-01'},
  'hachvana-after5':{label:'הפיקדון אחרי חמש שנים',url:'https://www.hachvana.mod.gov.il/GrantAndDeposit/DepositAfter5/Pages/default.aspx',status:'verified',asOf:'2026-10-14'},
  'hachvana-home':{label:'האזור האישי לחיילים משוחררים',url:'https://www.hachvana.mod.gov.il/Pages/default.aspx',status:'verified',asOf:'2026-10-14'},
  'hachvana-points':{label:'נקודות זיכוי לחיילים משוחררים — משרד הביטחון',url:'https://www.hachvana.mod.gov.il/Benefits/migufey/Pages/kitsbat.aspx',status:'verified',asOf:'2026-10-14'},
  'kolzchut-soldier':{label:'נקודות זיכוי לחיילים משוחררים — כל זכות',url:'https://www.kolzchut.org.il/he/נקודות_זיכוי_ממס_הכנסה_לחיילים_משוחררים_ומסיימי_שירות_לאומי-אזרחי',status:'partly',asOf:'2026-10-14'},
  'kolzchut-points':{label:'שווי נקודת זיכוי — כל זכות',url:'https://www.kolzchut.org.il/he/נקודת_זיכוי',status:'partly',asOf:'2026-10-14'},
  'bizportal-points':{label:'נקודות זיכוי 2026 — ביזפורטל',url:'https://www.bizportal.co.il/additives/389/tax-credit-points.html',status:'partly',asOf:'2026-10-14'},
  'kolzchut-reserve':{label:'נקודות זיכוי ללוחמי מילואים — כל זכות',url:'https://www.kolzchut.org.il/he/נקודות_זיכוי_ממס_הכנסה_ללוחמי_מילואים',status:'partly',asOf:'2026-10-14'},
  'capitax-reserve':{label:'תיקון 283: נקודות זיכוי למילואים',url:'https://www.capitax.co.il/content/2/3455',status:'partly',asOf:'2026-10-14'},
  'malam-reserve':{label:'סעיף 39ב: כלל אחר לשנים הבאות',url:'https://www.malam-payroll.com',status:'conflicting',asOf:'2026-10-14'},
  'btl-work':{label:'מענק עבודה נדרשת — ביטוח לאומי',url:'https://www.btl.gov.il/benefits/Demobilized_Soldier/Pages/default.aspx',status:'verified',asOf:'2026-01-01'},
  'btl-form':{label:'טופס בל/1521 — בקשה למענק',url:'https://www.btl.gov.il/טפסים%20ואישורים/Documents/t1521.pdf',status:'verified',asOf:'2026-01-01'},
  'kolzchut-work':{label:'מענק עבודה נדרשת — כל זכות',url:'https://www.kolzchut.org.il/he/מענק_עבודה_נדרשת_(עבודה_מועדפת)',status:'partly',asOf:'2026-01-01'},
  'gov-itc135':{label:'בקשה להחזר מס (טופס 135) — רשות המסים',url:'https://www.gov.il/he/service/itc135',status:'verified',asOf:'2026-10-14'}
};
for(const s of Object.values(BN_SOURCES))s.domain=s.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0];

export const DISCHARGE_FACTS={
  asOf:'2026-10-14',
  sources:BN_SOURCES,
  // §1: 242 ₪ a month per point, frozen; base points by gender.
  points:{value:242,yearValue:2904,base:{m:2.25,f:2.75},asOf:'2026-10-14',status:'partly',sources:['kolzchut-points','bizportal-points']},
  // §2: 2 points a year (full service) or 1 (shorter), for the 36 months after the discharge month.
  soldier:{full:2,short:1,minFull:{m:23,f:22},minShort:12,nationalFull:24,months:36,asOf:'2026-10-14',status:'verified',shortStatus:'partly',nationalStatus:'conflicting',sources:['hachvana-points','kolzchut-soldier']},
  // §3: reservist combat points for tax years 2026–2027 (days served in the year before).
  reserve:{years:[2026,2027],min:30,max:4,asOf:'2026-10-14',status:'partly',sources:['kolzchut-reserve','capitax-reserve','malam-reserve']},
  // §4: release grant = months × monthly rate for the track (rates of July 2026).
  grant:{rates:{combat:686.96,support:572.05,other:457.15},status:{combat:'verified',support:'verified',other:'partly'},payDays:60,lateUntilDays:180,asOf:'2026-07-01',sources:['hachvana-grant','moneyplan-grant','protocol-grant']},
  // §5: personal deposit = months × monthly rate (rates of August 2026), from day 14, released after 5 years.
  deposit:{rates:{combat:1000.08,support:833.40,other:666.72},minMonths:12,availableDays:14,releaseYears:5,asOf:'2026-08-01',status:'verified',sources:['hachvana-deposit','hachvana-after5']},
  // §6: required-work grant (2026 amounts).
  work:{full:11461,agriculture:7641,target:6,agricultureTarget:4,windowMonths:24,claimMonths:42,asOf:'2026-01-01',status:'verified',sources:['btl-work','kolzchut-work','btl-form']},
  // §8: tax refund up to 6 years back with Form 135.
  refund:{years:6,asOf:'2026-10-14',status:'verified',sources:['gov-itc135']},
  links:{
    grant:'https://www.hachvana.mod.gov.il/GrantAndDeposit/Pages/Grant.aspx',
    calculator:'https://www.hachvana.mod.gov.il/GrantAndDeposit/DepositUpTo5/Pages/CalculatorOfDeposit.aspx',
    personal:'https://www.hachvana.mod.gov.il/Pages/default.aspx',
    workForm:'https://www.btl.gov.il/טפסים%20ואישורים/Documents/t1521.pdf',
    refund:'https://www.gov.il/he/service/itc135',
    hotline:'*5266'
  }
};
const BN_F=DISCHARGE_FACTS;
export const BN_TRACKS={combat:'לוחם/ת',support:'תומך/ת לחימה',other:'אחר (עורפי)'};
// The weakest status wins when lines are combined.
const BN_RANK={verified:0,partly:1,conflicting:2,unknown:3};
export const bnWeakest=list=>list.reduce((w,s)=>(BN_RANK[s]??3)>(BN_RANK[w]??3)?s:w,'verified');

// ---------- Dates (UTC, 'YYYY-MM-DD') ----------
const bnIsDate=v=>typeof v==='string'&&validDate(v);
const bnIsMonth=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const bnPad=n=>String(n).padStart(2,'0');
const bnUTC=d=>Date.UTC(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8,10));
const bnIso=ms=>new Date(ms).toISOString().slice(0,10);
const bnMonthDays=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();      // m is 1-based
export const bnAddDays=(d,n)=>bnIso(bnUTC(d)+n*864e5);
export const bnDaysBetween=(a,b)=>Math.round((bnUTC(b)-bnUTC(a))/864e5);
// Calendar months later, the day clamped to the month's end (2026-08-31 + 6 months = 2027-02-28).
export function bnAddMonths(d,n){
  const total=+d.slice(0,4)*12+(+d.slice(5,7)-1)+n,y=Math.floor(total/12),m=total-y*12+1;
  return `${y}-${bnPad(m)}-${bnPad(Math.min(+d.slice(8,10),bnMonthDays(y,m)))}`;
}
const bnLastDay=month=>`${month}-${bnPad(bnMonthDays(+month.slice(0,4),+month.slice(5,7)))}`;
const bnMonthIndex=month=>+month.slice(0,4)*12+(+month.slice(5,7)-1);
const bnNum=(v,min,max)=>{const n=typeof v==='string'&&v.trim()!==''?Number(v):v;return typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max?n:null;};

// ---------- Profile ----------
// The §A.6 shape. Lenient: never throws; anything invalid becomes null or the default. Unknown keys are kept
// (a newer version may have added them).
export function normalizeBenefits(raw){
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const w=r.work&&typeof r.work==='object'&&!Array.isArray(r.work)?r.work:{};
  const reserveDays={};
  if(r.reserveDays&&typeof r.reserveDays==='object'&&!Array.isArray(r.reserveDays))
    for(const [y,v] of Object.entries(r.reserveDays)){const n=bnNum(v,0,366);if(/^\d{4}$/.test(y)&&n!=null)reserveDays[y]=Math.round(n);}
  const p=r.points&&typeof r.points==='object'&&!Array.isArray(r.points)&&bnNum(r.points.total,0,50)!=null?
    {total:r.points.total,month:bnIsMonth(r.points.month)?r.points.month:null,at:bnIsDate(r.points.at)?r.points.at:null}:null;
  const months=bnNum(r.monthsServed,0,60);
  return {...r,
    gender:['m','f'].includes(r.gender)?r.gender:null,
    serviceKind:['army','national','none'].includes(r.serviceKind)?r.serviceKind:null,
    track:['combat','support','other'].includes(r.track)?r.track:null,
    dischargeDate:bnIsDate(r.dischargeDate)?r.dischargeDate:null,
    dischargeMonth:bnIsMonth(r.dischargeMonth)?r.dischargeMonth:null,
    monthsServed:months==null?null:Math.round(months),
    reserveDays,
    grantReceived:bnIsDate(r.grantReceived)?r.grantReceived:null,
    grantAmount:bnNum(r.grantAmount,0,1e7),
    work:{months:Math.round(bnNum(w.months,0,6)??0),agriculture:w.agriculture===true,startMonth:bnIsMonth(w.startMonth)?w.startMonth:null,claimed:bnIsDate(w.claimed)?w.claimed:null},
    points:p,
    updated:bnIsDate(r.updated)?r.updated:null
  };
}
const bnServed=b=>b.serviceKind==='army'||b.serviceKind==='national';
// The discharge month: the exact date's month, else the month the wizard was given.
export const dischargeMonthOf=b=>{const n=normalizeBenefits(b);return n.dischargeDate?.slice(0,7)||n.dischargeMonth||null;};
// The discharge day for date math: the exact date, else the LAST day of the month (reminders come late, never early).
export const dischargeDay=b=>{const n=normalizeBenefits(b);return n.dischargeDate||(n.dischargeMonth?bnLastDay(n.dischargeMonth):null);};

// ---------- Credit points (§1–§3) ----------
// Discharged-soldier points for one tax year: perYear × eligible months / 12, over the 36 months after the
// discharge month.
export function soldierPoints(raw,year){
  const b=normalizeBenefits(raw),S=BN_F.soldier,month=dischargeMonthOf(b),m=b.monthsServed;
  const out={points:0,months:0,perYear:0,status:S.status,note:''};
  if(!bnServed(b))return out;
  if(b.serviceKind==='national'){
    out.status=S.nationalStatus;
    out.note='בשירות לאומי־אזרחי לא מצאנו כלל חד־משמעי (ייתכן שנדרשים 24 חודשים). בדוק את הזכאות שלך.';
    out.perYear=m==null?0:m>=S.nationalFull?S.full:m>=S.minShort?S.short:0;
  }else{
    const min=S.minFull[b.gender]??S.minFull.m;
    out.perYear=m==null?0:m>=min?S.full:m>=S.minShort?S.short:0;
    if(m!=null&&m<min){out.status=S.shortStatus;if(m<S.minShort)out.note='שירות של פחות מ־12 חודשים לא מזכה בנקודות לפי המידע שמצאנו.';}
  }
  if(month&&Number.isInteger(+year)){
    const first=bnMonthIndex(month)+1,last=first+S.months-1,from=Math.max(first,+year*12),to=Math.min(last,+year*12+11);
    out.months=Math.max(0,to-from+1);
  }
  out.points=out.perYear*out.months/12;
  return out;
}
// Reservist combat points for a tax year, from the combat days served in the year before (2026–2027 table only).
export function reservePoints(days,taxYear){
  const R=BN_F.reserve,d=Math.max(0,Math.floor(Number(days)||0));
  if(!R.years.includes(+taxYear))return {points:0,days:d,status:'unknown'};
  const points=d<30?0:d<40?.5:d<50?.75:Math.min(R.max,1+.25*Math.floor((d-50)/5));
  return {points,days:d,status:R.status};
}
export const bnFmt=n=>(Math.round(n*100)/100).toLocaleString('he-IL',{maximumFractionDigits:2});
// All points for a tax year: base (by gender) + discharged soldier + reservist combat.
export function creditPoints(raw,year){
  const b=normalizeBenefits(raw),P=BN_F.points,y=+year;
  const base=b.gender==='f'?P.base.f:P.base.m;
  const soldier=soldierPoints(b,y),reserve=reservePoints(b.reserveDays[String(y-1)]||0,y);
  const lines=[{id:'base',label:'תושב/ת ישראל',points:base,status:P.status,note:b.gender?'':'לא בחרת מגדר: חישבנו 2.25 נקודות (לאישה 2.75).'}];
  if(bnServed(b))lines.push({id:'soldier',label:`חייל/ת משוחרר/ת · ${soldier.months} חודשים ב־${y}`,points:soldier.points,status:soldier.status,note:soldier.note});
  if(reserve.days>0||reserve.points>0)lines.push({id:'reserve',label:'לוחם/ת מילואים',points:reserve.points,status:reserve.status==='unknown'?'conflicting':reserve.status,
    note:reserve.status==='unknown'?`לא מצאנו טבלה מאושרת לשנת ${y}. בדוק את הזכאות שלך.`:'לפי הטבלה ל־2026–2027. משנת 2028 הכללים עשויים להשתנות.'});
  const total=base+soldier.points+reserve.points;
  return {base,soldier:soldier.points,reserve:reserve.points,total,monthly:Math.round(total*P.value*100)/100,lines,asOf:P.asOf,status:bnWeakest(lines.map(l=>l.status)),label:bnFmt(total)};
}

// ---------- Release grant (§4) ----------
export function releaseGrantEstimate(raw){
  const b=normalizeBenefits(raw),G=BN_F.grant,day=dischargeDay(b);
  if(b.serviceKind!=='army'||!b.track||b.monthsServed==null)return {eligible:false,amount:null,status:'unknown',asOf:G.asOf,sources:G.sources};
  const rate=G.rates[b.track];
  return {eligible:true,amount:Math.round(b.monthsServed*rate*100)/100,rate,months:b.monthsServed,track:b.track,status:G.status[b.track],asOf:G.asOf,sources:G.sources,
    dueBy:day?bnAddDays(day,G.payDays):null,received:b.grantReceived,receivedAmount:b.grantAmount};
}

// ---------- Personal deposit (§5) ----------
export function depositEstimate(raw){
  const b=normalizeBenefits(raw),D=BN_F.deposit,day=dischargeDay(b);
  const dates={availableFrom:day?bnAddDays(day,D.availableDays):null,releaseDate:day?bnAddMonths(day,D.releaseYears*12):null};
  const base={eligible:false,amount:null,rate:null,months:b.monthsServed,status:D.status,asOf:D.asOf,sources:D.sources,...dates};
  if(b.serviceKind==='national')return {...base,eligible:true,status:'unknown'};   // eligible, but FACTS has no rate for it
  if(b.serviceKind!=='army'||b.monthsServed==null||b.monthsServed<D.minMonths||!b.track)return base;
  const rate=D.rates[b.track];
  return {...base,eligible:true,rate,amount:Math.round(b.monthsServed*rate*100)/100};
}

// ---------- Required-work grant (§6) ----------
export function workGrantStatus(raw,now){
  const b=normalizeBenefits(raw),W=BN_F.work,day=dischargeDay(b),agri=b.work.agriculture;
  const target=agri?W.agricultureTarget:W.target,months=Math.min(b.work.months,W.target);
  const windowEnd=day?bnAddMonths(day,W.windowMonths):null,claimBy=day?bnAddMonths(day,W.claimMonths):null;
  return {eligible:bnServed(b),target,months,done:months>=target,agriculture:agri,amount:agri?W.agriculture:W.full,
    windowEnd,claimBy,claimed:b.work.claimed,startMonth:b.work.startMonth,
    daysToWindowEnd:windowEnd&&bnIsDate(now)?bnDaysBetween(now,windowEnd):null,daysToClaim:claimBy&&bnIsDate(now)?bnDaysBetween(now,claimBy):null,
    status:W.status,asOf:W.asOf,sources:W.sources};
}

// ---------- Tax refund (§8) ----------
// The tax years with discharged-soldier points that can still be claimed (up to 6 years back), oldest first.
export function refundYears(raw,now){
  const b=normalizeBenefits(raw),y=+String(now).slice(0,4),out=[];
  if(!bnServed(b)||!dischargeMonthOf(b))return out;
  for(let year=y-BN_F.refund.years;year<=y-1;year++)if(soldierPoints(b,year).points>0)out.push(year);
  return out;
}

// ---------- Bell reminders (§D.6, §D.7), type 'reminders' ----------
export function benefitAlerts(d,now){
  const out=[];if(!d||!bnIsDate(now))return out;
  const b=normalizeBenefits(d.benefits),Y=+now.slice(0,4),day=dischargeDay(b),month=dischargeMonthOf(b);
  const dl=v=>`${+v.slice(8,10)}.${+v.slice(5,7)}.${v.slice(0,4)}`;
  const push=(id,icon,color,title,body)=>out.push({id,type:'reminders',icon,color,title,body,action:'navigate:benefits'});
  if(bnServed(b)&&day){
    // The release grant has not arrived 60 days after discharge (army only), for up to 180 days.
    if(b.serviceKind==='army'&&!b.grantReceived){const since=bnDaysBetween(day,now);
      if(since>=BN_F.grant.payDays&&since<=BN_F.grant.lateUntilDays)push(`grant-late-${month}`,'Banknote','gold','מענק השחרור עוד לא נכנס?','עברו 60 יום מהשחרור. אם המענק לא נכנס, פנה לשער לעתיד או חייג ‎*5266.');}
    // Required work: the 24-month window is closing, or the claim deadline is near.
    const w=workGrantStatus(b,now);
    if(!w.done&&w.daysToWindowEnd!=null&&w.daysToWindowEnd>=0&&w.daysToWindowEnd<=60)
      push(`work-window-${w.windowEnd}`,'Briefcase','gold',`נשארו ${w.daysToWindowEnd} ימים לצבור עבודה מועדפת`,`כדי לקבל את המענק צריך ${w.target} חודשים מלאים עד ${dl(w.windowEnd)}.`);
    if(w.done&&!w.claimed&&w.daysToClaim!=null&&w.daysToClaim>=0&&w.daysToClaim<=90)
      push(`work-claim-${w.claimBy}`,'ClipboardCheck','blue','להגיש את הבקשה למענק העבודה',`אפשר להגיש עד ${dl(w.claimBy)}. אחר כך הזכות פוקעת.`);
    // Tax refund: discharged in the last 6 years and the refund check is not done this year. Someone whose
    // service gave no points (known, under 12 months) is not told that points are missing.
    const D=+month.slice(0,4),noPoints=b.monthsServed!=null&&soldierPoints(b,D+1).perYear===0;
    const refundDone=String(d.annualChecks?.['tax-refund']?.done||'').startsWith(String(Y));
    if(!noPoints&&D>=Y-6&&D<=Y-1&&!refundDone)
      out.push({id:`tax-refund-${Y}`,type:'reminders',icon:'Banknote',color:'green',title:'ייתכן שמגיע לך החזר מס',body:'חיילים משוחררים שלא קיבלו את נקודות הזיכוי יכולים לבקש החזר עד 6 שנים אחורה. השירות הרשמי חינמי.',action:'navigate:benefits'});
    // The last chance for the year 6 back, when that year had discharged-soldier months.
    if(!noPoints&&now.slice(5)>='11-01'&&soldierPoints(b,Y-6).months>0)
      out.push({id:`tax-deadline-${Y}`,type:'reminders',icon:'CalendarDays',color:'red',title:`עד 31.12.${Y}: אחרון לבקש החזר על ${Y-6}`,body:'אחרי סוף השנה כבר אי אפשר לבקש החזר מס על השנה הזו.',action:'navigate:benefits'});
  }
  // The personal deposit is released within 60 days (a deposit account's date, or the estimate's).
  const releases=new Set((Array.isArray(d.accounts)?d.accounts:[]).filter(a=>a?.kind==='deposit'&&bnIsDate(a.releaseDate)).map(a=>a.releaseDate));
  if(!releases.size&&bnServed(b)){const dep=depositEstimate(b);if(dep.eligible&&dep.releaseDate)releases.add(dep.releaseDate);}
  for(const r of [...releases].sort()){const n=bnDaysBetween(now,r);
    if(n>=0&&n<=60)push(`deposit-release-${r}`,'Lock','purple',`הפיקדון האישי משתחרר ב־${dl(r)}`,'היתרה תעבור לחשבון הבנק תוך כ־60 ימי עסקים. ודא שפרטי הבנק באזור האישי מעודכנים.');}
  return out;
}
