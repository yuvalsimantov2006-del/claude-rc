// After discharge 4.1 UI: the benefits page, profile, points wizard and their hooks (WS-MODULES).
// Every number on these screens comes from DISCHARGE_FACTS and is shown through bnEstimate: the הערכה badge,
// the "נכון ל־" date, how sure we are and the sources (§D.0, §F.9).
import {onModuleHook} from './hooks.js';
import {today,dateLabel,monthLabel,uid,applyTransaction,TX_KINDS} from './finance.js';
import {DISCHARGE_FACTS,BN_TRACKS,normalizeBenefits,dischargeMonthOf,creditPoints,releaseGrantEstimate,depositEstimate,workGrantStatus,refundYears,benefitAlerts,bnFmt} from './benefits.js';
const BN_STATUS_TEXT={verified:'אומת באתר רשמי',partly:'ממקורות משניים — לא ראינו את הנוסח הרשמי',conflicting:'המקורות סותרים — כדאי לבדוק',unknown:'המקורות סותרים — כדאי לבדוק'};
const BN_STATUS_BADGE={verified:['אומת','green'],partly:['משני','gold'],conflicting:['סותר','red']};
const BN_PAGE_NOTICE='כל הסכומים בעמוד הזה הם הערכה לפי מידע ציבורי, נכון ל־14.10.2026. הסכום הקובע הוא מה שמופיע באזור האישי באתרים הרשמיים.';
const bnProfile=()=>normalizeBenefits(typeof data!=='undefined'?data?.benefits:null);
const bnYear=()=>+today().slice(0,4);
const bnServedKind=k=>k==='army'||k==='national';
// An official link: the label, then the domain as its own left-to-right run.
function bnLink(label,url){
  const domain=String(url).replace(/^https?:\/\/(www\.)?/,'').split('/')[0];
  return `<a class="text-button bn-link" href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)}<bdi dir="ltr" class="bn-domain">${e(domain)}</bdi></a>`;
}
const bnTel=()=>`<a class="text-button bn-link" href="tel:*5266"><bdi dir="ltr">*5266</bdi></a>`;
const bnMoney=(n,d=0)=>`<b dir="ltr" class="bn-amount">${e(money(n,'ILS',d))}</b>`;
// The one renderer for every FACTS-derived number: badge, value, date, status text and the sources.
function bnEstimate(value,{asOf,status='partly',sources=[],unit=''}={}){
  const list=[...new Set(sources)].map(id=>DISCHARGE_FACTS.sources[id]).filter(Boolean);
  return `<div class="bn-estimate"><div class="bn-est-top">${badge('הערכה','gold')}<span class="bn-est-value">${value}${unit?` <span class="bn-unit">${e(unit)}</span>`:''}</span></div>`
    +`<small class="bn-est-meta">נכון ל־${dateLabel(asOf)} · ${e(BN_STATUS_TEXT[status]||BN_STATUS_TEXT.conflicting)}</small>`
    +(list.length?`<details class="bn-est-src"><summary>מקורות</summary><ul>${list.map(s=>`<li>${bnLink(s.label,s.url)}</li>`).join('')}</ul></details>`:'')+`</div>`;
}
// A segmented choice inside a form: the buttons set a hidden input (no re-render, so typed values stay).
function bnSeg(name,list,value,label){
  return `<div class="segmented full bn-seg" role="group" aria-label="${e(label)}">${list.map(([v,l])=>`<button type="button" class="${value===v?'active':''}" data-bn-seg="${e(name)}" data-value="${e(v)}" aria-pressed="${value===v}">${e(l)}</button>`).join('')}<input type="hidden" name="${e(name)}" value="${e(value||'')}"></div>`;
}
const bnDetails=rows=>`<div class="goal-details bn-dates">${rows.map(([l,v])=>`<div><span>${e(l)}</span><b dir="auto">${e(v)}</b></div>`).join('')}</div>`;

// ---------- The page ----------
function bnView(){
  const b=bnProfile(),now=today();
  const top=notice(BN_PAGE_NOTICE,'info');
  if(!b.serviceKind)return top+card(empty('מה מגיע לך אחרי השחרור?','כמה פרטים על השירות, ואופק תחשב הערכה של המענק, הפיקדון, נקודות הזיכוי והמענק לעבודה מועדפת — עם תאריכים ותזכורות.',btn('מילוי הפרטים','bn-profile','Pencil','primary')),'bn-start')
    +card(head('לא שירתת?','נקודות זיכוי ובדיקה שנתית רלוונטיות לכולם.')+`<div class="actions">${textBtn('אשף נקודות הזיכוי','points-wizard')}</div>`,'bn-nonserved')+bnSourcesCard();
  if(b.serviceKind==='none')return top+bnProfileCard(b)+card(head('מענק, פיקדון ועבודה מועדפת')+`<p class="muted bn-text">לפי הפרטים, לא שירתת שירות סדיר או לאומי, ולכן מענק השחרור, הפיקדון האישי והמענק לעבודה מועדפת לא חלים עליך. נקודות הזיכוי והבדיקה השנתית רלוונטיות לכולם.</p>`,'bn-none')
    +bnPointsCard(b,now)+bnSourcesCard();
  return top+bnProfileCard(b)+bnSummary(b,now)+`<div class="two-columns bn-columns">${bnGrantCard(b,now)}${bnDepositCard(b,now)}</div><div class="two-columns bn-columns">${bnWorkCard(b,now)}${bnPointsCard(b,now)}</div>`+bnSourcesCard();
}
function bnProfileCard(b){
  const kind={army:'שירות צבאי',national:'שירות לאומי־אזרחי',none:'לא שירתתי'}[b.serviceKind];
  const day=b.dischargeDate?dateLabel(b.dischargeDate):b.dischargeMonth?monthLabel(b.dischargeMonth):'';
  const parts=[kind,b.serviceKind==='army'&&b.track?BN_TRACKS[b.track]:'',b.monthsServed!=null&&bnServedKind(b.serviceKind)?`${b.monthsServed} חודשי שירות`:'',day&&bnServedKind(b.serviceKind)?`שחרור: ${day}`:''].filter(Boolean);
  return `<div class="bn-profile"><span class="asset-icon blue">${icon('Award',17)}</span><div><b>הפרטים שלך</b><small>${e(parts.join(' · '))}</small></div>${textBtn('עריכת הפרטים','bn-profile')}</div>`;
}
function bnSummary(b,now){
  const g=releaseGrantEstimate(b),dep=depositEstimate(b),Y=bnYear(),c=creditPoints(b,Y);
  const grant=g.eligible?metric('מענק שחרור',money(g.amount),'הערכה · תעריף מיולי 2026','Banknote','green')
    :metric('מענק שחרור','—',b.serviceKind==='national'?'לא מצאנו תעריף לשירות לאומי־אזרחי':'חסרים פרטים לחישוב','Banknote','green');
  const deposit=dep.eligible&&dep.amount!=null?metric('פיקדון אישי',money(dep.amount),'הערכה · תעריף מאוגוסט 2026','Lock','purple')
    :metric('פיקדון אישי','—',dep.eligible?'מגיע לך, אבל לא מצאנו תעריף לשירות לאומי־אזרחי':'לא מגיע לפי המידע שמצאנו','Lock','purple');
  return `<div class="three-metrics bn-summary">${grant}${deposit}${metric(`נקודות זיכוי ב־${Y}`,bnFmt(c.total),`כ־${amt(c.monthly)} בחודש · הערכה`,'Award')}</div>`;
}
function bnGrantCard(b,now){
  const g=releaseGrantEstimate(b),F=DISCHARGE_FACTS;
  if(b.serviceKind!=='army')return card(head('מענק השחרור')+`<p class="muted bn-text">לא מצאנו מידע ציבורי על מענק שחרור לשירות לאומי־אזרחי. את הזכאות והסכום אפשר לבדוק באזור האישי.</p><div class="bn-links">${bnLink('האזור האישי',F.links.personal)}${bnTel()}</div>`,'bn-grant');
  if(!g.eligible)return card(head('מענק השחרור')+`<p class="muted bn-text">כדי לחשב את המענק צריך את המסלול ואת מספר חודשי השירות.</p><div class="actions">${btn('השלמת הפרטים','bn-profile','Pencil','primary')}</div>`,'bn-grant');
  const received=b.grantReceived,late=!received&&g.dueBy&&now>=g.dueBy;
  return card(head('מענק השחרור',safe(`${g.months} חודשים × ${amt(g.rate,'ILS',2)} (${e(BN_TRACKS[g.track])})`),received?badge('התקבל','green'):'')
    +bnEstimate(bnMoney(g.amount),{asOf:g.asOf,status:g.status,sources:g.sources})
    +(g.track==='other'?`<small class="bn-note">התעריף למסלול ״אחר״ נמצא רק במקור משני אחד.</small>`:'')
    +`<p class="bn-text">החישוב: חודשי שירות × תעריף חודשי למסלול. חודשי הכשרה של לוחמים נספרים לפעמים בתעריף אחר, ולכן הסכום בפועל יכול להיות נמוך יותר.</p>`
    +(received?`<p class="bn-text bn-received">${icon('Check',16)}<span>נכנסו ${b.grantAmount!=null?amt(b.grantAmount,'ILS',b.grantAmount%1?2:0):'—'} ב־${dateLabel(received)}</span></p>`
      :g.dueBy?`<p class="bn-text">המענק אמור להיכנס לחשבון הבנק עד ${dateLabel(g.dueBy)} (עד 60 יום מהשחרור, בלי בקשה).</p>`:'')
    +(late?notice('עברו 60 יום והמענק לא נכנס? פנה לשער לעתיד באזור האישי או חייג ‎*5266.','warning'):'')
    +`<div class="actions bn-actions">${received?'':btn('המענק נכנס','bn-grant','Check','primary')}${btn('מה לעשות עם המענק?','navigate:lab','FlaskConical')}</div><div class="bn-links">${bnLink('מחשבון רשמי',F.links.calculator)}</div>`,'bn-grant');
}
function bnDepositCard(b,now){
  const dep=depositEstimate(b),F=DISCHARGE_FACTS;
  const hasAccount=(data.accounts||[]).some(a=>a.kind==='deposit');
  const canAdd=typeof accountKinds!=='undefined'&&!!accountKinds.deposit;
  const action=hasAccount?textBtn('לחשבון הפיקדון','navigate:accounts'):!dep.eligible?'':canAdd?btn('הוספה כחשבון מוגבל','bn-deposit-account','Plus','primary'):textBtn('לחשבונות','navigate:accounts');
  let body;
  if(!dep.eligible)body=notice('לפי המידע שמצאנו, פיקדון אישי מגיע אחרי 12 חודשי שירות לפחות (או פחות, בשחרור מסיבה רפואית).');
  else body=(dep.amount!=null?bnEstimate(bnMoney(dep.amount),{asOf:dep.asOf,status:dep.status,sources:dep.sources})
      :`<p class="muted bn-text">הפיקדון מגיע גם למסיימי שירות לאומי־אזרחי, אבל לא מצאנו את התעריף החודשי. את הסכום המדויק תמצא באזור האישי.</p>`)
    +(dep.availableFrom?`<p class="bn-text">זמין מ־${dateLabel(dep.availableFrom)} ל־6 מטרות: לימודים, הכשרה מקצועית, פתיחת עסק, לימודי נהיגה, חתונה ודירה.</p>`:'')
    +(dep.releaseDate?`<p class="bn-text">אחרי 5 שנים (${dateLabel(dep.releaseDate)}) מה שנשאר עובר אוטומטית לחשבון הבנק שלך, תוך כ־60 ימי עסקים. ודא שפרטי הבנק באזור האישי מעודכנים.</p>`:'')
    +`<details class="bn-older"><summary>ראית ברשת ״אחרי 7 שנים הכסף חוזר למדינה״?</summary><p>זה מידע ישן. מאז התיקון בינואר 2019 הכלל הוא העברה אוטומטית לבנק אחרי 5 שנים.</p></details>`;
  const sub=dep.eligible&&dep.amount!=null?safe(`${dep.months} חודשים × ${amt(dep.rate,'ILS',2)} (${e(BN_TRACKS[b.track])})`):'';
  return card(head('הפיקדון האישי',sub)+body+(action?`<div class="actions bn-actions">${action}</div>`:'')
    +`<div class="bn-links">${bnLink('יתרה ומשיכה באזור האישי',F.links.personal)}${bnTel()}</div>`,'bn-deposit');
}
function bnWorkCard(b,now){
  const w=workGrantStatus(b,now),F=DISCHARGE_FACTS;
  const pct=Math.min(100,w.months/w.target*100);
  const claimed=w.claimed;
  const stepper=`<div class="bn-work-controls"><div class="bn-stepper" role="group" aria-label="חודשי עבודה מועדפת">`
    +`<button type="button" class="icon-button" data-action="bn-work:-1" aria-label="חודש אחד פחות" ${w.months<=0?'disabled':''}>−</button>`
    +`<output class="bn-stepper-value" aria-live="polite">${w.months}</output>`
    +`<button type="button" class="icon-button" data-action="bn-work:1" aria-label="עוד חודש" ${w.months>=6?'disabled':''}>+</button></div>`
    +`<label class="check-field"><input type="checkbox" data-bn-agri ${w.agriculture?'checked':''}>בחקלאות</label>`
    +field('חודש התחלה',`<input type="month" data-bn-start value="${e(w.startMonth||'')}" aria-label="חודש התחלה">`,'','bn-start-field')+`</div>`;
  const windowOver=!w.done&&w.windowEnd&&now>w.windowEnd,claimOver=w.done&&!claimed&&w.claimBy&&now>w.claimBy;
  return card(head('מענק עבודה מועדפת',w.agriculture?'4 חודשים בחקלאות':'6 חודשים בעבודה מועדפת',claimed?badge('הוגש','green'):w.done?badge('הושלם','green'):'')
    +(b.serviceKind==='national'&&b.monthsServed!=null&&b.monthsServed<24?notice('לפי ביטוח לאומי, המענק מגיע למסיימי 24 חודשי שירות לאומי־אזרחי. בדוק את הזכאות שלך.','warning'):'')
    +`<div class="bn-progress">${progress(pct,'green')}<span><b>${w.months}</b> מתוך ${w.target} חודשים</span></div>`+stepper
    +(w.windowEnd?bnDetails([['לצבור את החודשים עד',dateLabel(w.windowEnd)],['להגיש בקשה עד',dateLabel(w.claimBy)]]):'')
    +(windowOver?notice('לפי החישוב, חלון 24 החודשים מהשחרור הסתיים. ימי מילואים בתקופה הזו מאריכים אותו — כדאי לבדוק בביטוח לאומי.','warning'):'')
    +(claimOver?notice('לפי החישוב, המועד להגשת הבקשה עבר. כדאי לבדוק בביטוח לאומי.','warning'):'')
    +bnEstimate(bnMoney(w.amount),{asOf:w.asOf,status:w.status,sources:w.sources})
    +notice('המענק חייב במס, אבל לא מנכים ממנו מס בתשלום. הוא קטן אם קיבלת דמי אבטלה ב־11 החודשים שלפני תחילת העבודה.')
    +(w.done&&!claimed?`<div class="actions bn-actions">${btn('הגשתי את הבקשה','bn-claimed','Check','primary')}</div><div class="bn-links">${bnLink('טופס בל/1521',F.links.workForm)}</div>`
      :claimed?`<p class="bn-text bn-received">${icon('Check',16)}<span>הבקשה הוגשה ב־${dateLabel(claimed)}</span>${textBtn('ביטול הסימון','bn-unclaim')}</p>`:''),'bn-work');
}
function bnPointsCard(b,now){
  const Y=+now.slice(0,4),c=creditPoints(b,Y),years=refundYears(b,now),F=DISCHARGE_FACTS;
  const saved=b.points?`<small class="bn-note">לפי האשף: ${bnFmt(b.points.total)} נקודות${b.points.at?` · נכון ל־${dateLabel(b.points.at)}`:''}</small>`:'';
  const refund=years.length?`<p class="bn-text">ייתכן שמגיע לך החזר מס על ${years.join(', ')}, אם הנקודות לא נוצלו במשכורת.${years.includes(Y-6)?` את הבקשה על ${Y-6} אפשר להגיש רק עד 31.12.${Y}.`:''}</p>`:'';
  return card(head('נקודות זיכוי',`שנת המס ${Y}`)
    +bnEstimate(`${bnFmt(c.total)} נקודות · כ־${amt(c.monthly)} בחודש`,{asOf:c.asOf,status:c.status,sources:bnPointSources(c)})+saved
    +`<p class="bn-text">החיסכון בפועל הוא עד גובה המס שאתה משלם. כדי לקבל את הנקודות ממלאים טופס 101 אצל המעסיק ומצרפים תעודת שחרור.</p>`+refund
    +`<div class="actions bn-actions">${btn('אשף נקודות הזיכוי','points-wizard','Award')}</div><div class="bn-links">${bnLink('החזר מס — טופס 135',F.links.refund)}</div>`,'bn-points');
}
const bnPointSources=c=>[...DISCHARGE_FACTS.points.sources,...(c.lines.some(l=>l.id==='soldier')?DISCHARGE_FACTS.soldier.sources:[]),...(c.lines.some(l=>l.id==='reserve')?DISCHARGE_FACTS.reserve.sources:[])];
function bnSourcesCard(){
  const list=Object.values(DISCHARGE_FACTS.sources);
  return card(head('מקורות','מאיפה המספרים בעמוד הזה, ועד כמה בדקנו אותם.')+`<ul class="bn-sources">${list.map(s=>{const [label,color]=BN_STATUS_BADGE[s.status]||BN_STATUS_BADGE.conflicting;
    return `<li><div>${bnLink(s.label,s.url)}<small>נכון ל־${dateLabel(s.asOf)}</small></div>${badge(label,color)}</li>`;}).join('')}</ul>`,'bn-sources-card');
}

// ---------- Profile dialog ----------
function openBenefitsProfile(){
  const b=bnProfile(),Y=bnYear(),kind=b.serviceKind||'army',monthOnly=!b.dischargeDate&&!!b.dischargeMonth;
  showDialog('הפרטים מהשירות',`<form id="benefits-form" class="bn-form" data-kind="${e(kind)}" ${monthOnly?'data-month-only':''} novalidate><div class="form-error"></div><div class="form-grid">`
    +bnSeg('gender',[['m','גבר'],['f','אישה']],b.gender,'מגדר')
    +field('סוג השירות',select('serviceKind',[['army','שירות צבאי'],['national','שירות לאומי־אזרחי'],['none','לא שירתתי']],kind,'data-bn-kind'))
    +field('המסלול',select('track',[['combat','לוחם/ת'],['support','תומך/ת לחימה'],['other','אחר (עורפי)']],b.track||'combat'),'','bn-for-army')
    +field('תאריך השחרור',input('dischargeDate',b.dischargeDate||'','date'),'','bn-for-served bn-date-exact')
    +field('חודש השחרור',input('dischargeMonth',dischargeMonthOf(b)||'','month'),'','bn-for-served bn-date-month')
    +`<label class="check-field bn-for-served bn-month-only"><input type="checkbox" name="monthOnly" ${monthOnly?'checked':''}>אני יודע רק את החודש</label>`
    +field('חודשי שירות בפועל',input('monthsServed',b.monthsServed??'','number','min="1" max="60" step="1" inputmode="numeric"'),'','bn-for-served')
    +field(`ימי מילואים כלוחם/ת ב־${Y-1}`,input('reservePrev',b.reserveDays[Y-1]??'','number','min="0" max="366" step="1" inputmode="numeric"'),`מזכים בנקודות ב־${Y}`)
    +field(`ב־${Y}`,input('reserveCur',b.reserveDays[Y]??'','number','min="0" max="366" step="1" inputmode="numeric"'),`מזכים בנקודות ב־${Y+1}`)
    +notice('הפרטים נשמרים רק במכשיר שלך ומשמשים רק לחישובים בעמוד הזה.')
    +`</div><div class="form-actions">${submit('שמירה')}${btn('ביטול','dialog-close')}</div></form>`,true);
}
function bnReadDays(f,name){
  const raw=String(f.get(name)??'').trim();if(raw==='')return null;
  const n=Number(raw);if(!Number.isInteger(n)||n<0||n>366)throw Error('ימי המילואים צריכים להיות מספר שלם בין 0 ל־366.');
  return n;
}
function bnReadService(f,kind,monthOnly){
  const Y=bnYear();let dischargeDate=null,dischargeMonth=null;
  if(monthOnly){dischargeMonth=String(f.get('dischargeMonth')||'');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(dischargeMonth))throw Error('יש לבחור את חודש השחרור.');}
  else{dischargeDate=String(f.get('dischargeDate')||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(dischargeDate)||Number.isNaN(Date.parse(dischargeDate)))throw Error('יש לבחור את תאריך השחרור.');}
  const year=+(dischargeDate||dischargeMonth).slice(0,4);
  if(year<1980||year>Y+3)throw Error('תאריך השחרור לא נראה תקין.');
  const months=Number(String(f.get('monthsServed')??'').trim()||NaN);
  if(!Number.isInteger(months)||months<1||months>60)throw Error('חודשי השירות צריכים להיות מספר שלם בין 1 ל־60.');
  return {dischargeDate,dischargeMonth:dischargeMonth||dischargeDate.slice(0,7),monthsServed:months};
}
function bnSaveProfile(form){
  const f=new FormData(form),kind=String(f.get('serviceKind')||''),Y=bnYear();
  if(!['army','national','none'].includes(kind))throw Error('יש לבחור את סוג השירות.');
  const gender=['m','f'].includes(f.get('gender'))?f.get('gender'):null;
  const service=bnServedKind(kind)?bnReadService(f,kind,!!f.get('monthOnly')):{};
  const prevDays=bnReadDays(f,'reservePrev'),curDays=bnReadDays(f,'reserveCur');
  mutate(next=>{
    const prev=normalizeBenefits(next.benefits),reserveDays={...prev.reserveDays};
    for(const [y,v] of [[Y-1,prevDays],[Y,curDays]]){if(v==null||v===0)delete reserveDays[y];else reserveDays[y]=v;}
    next.benefits={...prev,gender,serviceKind:kind,track:kind==='army'?(BN_TRACKS[f.get('track')]?String(f.get('track')):'combat'):null,
      ...(bnServedKind(kind)?service:{}),reserveDays,updated:today()};
  },'הפרטים נשמרו');
  closeDialog();
}

// ---------- "המענק נכנס" ----------
function openGrantForm(){
  const b=bnProfile(),g=releaseGrantEstimate(b);
  const accounts=(data.accounts||[]).filter(a=>TX_KINDS.includes(a.kind)&&(a.currency||'ILS')==='ILS');
  const def=accounts.find(a=>a.kind==='bank')||accounts[0];
  showDialog('המענק נכנס',`<form id="grant-form" novalidate><div class="form-error"></div><div class="form-grid">`
    +field('כמה נכנס?',`<div class="currency-input">${input('amount',g.amount!=null?Math.round(g.amount*100)/100:'','number','min="0.01" step="0.01" inputmode="decimal"')}<span>₪</span></div>`,'הסכום מוצע לפי ההערכה. כדאי לתקן לסכום המדויק מהבנק.')
    +field('מתי?',input('date',today(),'date',`max="${today()}"`))
    +(accounts.length?field('לאיזה חשבון?',select('accountId',accounts.map(a=>[a.id,a.name]),def?.id||''),'','full')
      :notice('אין חשבון בשקלים לרישום ההכנסה. נשמור רק שהמענק התקבל.'))
    +`</div><div class="form-actions">${submit('שמירה','Check')}${btn('ביטול','dialog-close')}</div></form>`);
}
function bnSaveGrant(form){
  const f=new FormData(form),amount=Math.round(Number(f.get('amount'))*100)/100,date=String(f.get('date')||''),accountId=String(f.get('accountId')||'');
  if(!(amount>0))throw Error('יש להזין סכום חיובי.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||date>today())throw Error('יש לבחור תאריך שכבר עבר.');
  const account=data.accounts.find(a=>a.id===accountId);
  if(accountId&&!account)throw Error('החשבון שנבחר לא נמצא.');
  mutate(next=>{
    if(account){
      const t={id:uid(),type:'income',amount,currency:'ILS',date,category:'מענקים',subcategory:'',accountId:account.id,description:'מענק שחרור',tags:['שחרור'],recurring:false,fx:next.fx};
      if(!next.categories.includes('מענקים'))next.categories.push('מענקים');
      applyTransaction(next,t);next.transactions.push(t);
    }
    next.benefits={...normalizeBenefits(next.benefits),grantReceived:date,grantAmount:amount,updated:today()};
  },'המענק נרשם. מה עושים איתו? אפשר לבדוק במעבדת העתיד.',{undo:true});
  closeDialog();
}

// ---------- Credit-points wizard ----------
function openPointsWizard(prefill={}){
  const b={...bnProfile(),...prefill},Y=bnYear(),kind=b.serviceKind||'';
  showDialog('נקודות הזיכוי שלך',`<form id="points-form" class="bn-form bn-wizard" data-kind="${e(kind)}" novalidate><div class="form-error"></div><div class="form-grid">`
    +bnSeg('gender',[['m','גבר'],['f','אישה']],b.gender,'מגדר')
    +bnSeg('serviceKind',[['army','שירות צבאי'],['national','שירות לאומי־אזרחי'],['none','לא שירתתי']],kind,'סוג השירות')
    +field('חודש השחרור',input('dischargeMonth',dischargeMonthOf(b)||'','month'),'','bn-for-served')
    +field('כמה חודשים שירתת בפועל?',input('monthsServed',b.monthsServed??'','number','min="0" max="60" step="1" inputmode="numeric"'),'','bn-for-served')
    +field(`ימי מילואים כלוחם/ת ב־${Y-1}`,input('reserveDays',normalizeBenefits(b).reserveDays[Y-1]??'','number','min="0" max="366" step="1" inputmode="numeric"'),`ימי מילואים ב־${Y-1} מזכים בנקודות ב־${Y}`,'full')
    +`</div><div class="bn-result" aria-live="polite">${bnResult(bnWizardProfile(null,b))}</div>`
    +`<div class="bn-howto">${notice('כדי לקבל את הנקודות: ממלאים טופס 101 אצל המעסיק ומצרפים תעודת שחרור (ואישור מילואים). פספסת? אפשר לבקש החזר מס עד 6 שנים אחורה, בחינם.','info')}${bnLink('בקשה להחזר מס (טופס 135)',DISCHARGE_FACTS.links.refund)}</div>`
    +`<div class="form-actions">${submit('שימוש במחשבון השכר','Calculator')}${btn('שמירה בלבד','points-save')}${btn('ביטול','dialog-close')}</div></form>`,true);
}
// The wizard's answers as a profile (month only). From the form, or from a profile when the form is not open yet.
function bnWizardProfile(form,b){
  const Y=bnYear();
  if(!form){const n=normalizeBenefits(b);return {gender:n.gender,serviceKind:n.serviceKind,dischargeMonth:dischargeMonthOf(n),monthsServed:n.monthsServed,reserveDays:n.reserveDays[Y-1]?{[Y-1]:n.reserveDays[Y-1]}:{}};}
  const f=new FormData(form),days=Number(f.get('reserveDays'));
  return {gender:f.get('gender')||null,serviceKind:f.get('serviceKind')||null,dischargeMonth:f.get('dischargeMonth')||null,
    monthsServed:String(f.get('monthsServed')??'').trim()===''?null:Number(f.get('monthsServed')),reserveDays:days>0?{[Y-1]:days}:{}};
}
function bnResult(p){
  const Y=bnYear(),c=creditPoints(p,Y);
  return `<div class="bn-lines">${c.lines.map(l=>`<div class="bn-line"><div><span>${e(l.label)}</span>${l.note?`<small>${e(l.note)}</small>`:''}</div><b dir="ltr">${bnFmt(l.points)}</b></div>`).join('')}</div>`
    +bnEstimate(`סך הכול ${bnFmt(c.total)} נקודות · כ־${amt(c.total*DISCHARGE_FACTS.points.value)} בחודש`,{asOf:'2026-10-14',status:c.status,sources:bnPointSources(c)});
}
function bnRefreshWizard(form){
  form.dataset.kind=new FormData(form).get('serviceKind')||'';
  const box=form.querySelector('.bn-result');if(box)box.innerHTML=bnResult(bnWizardProfile(form));
}
function bnSavePoints(form,apply){
  const f=new FormData(form),Y=bnYear(),p=bnWizardProfile(form);
  if(bnServedKind(p.serviceKind)){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.dischargeMonth||''))throw Error('יש לבחור את חודש השחרור.');
    if(!Number.isInteger(p.monthsServed)||p.monthsServed<0||p.monthsServed>60)throw Error('חודשי השירות צריכים להיות מספר שלם בין 0 ל־60.');
  }
  const days=bnReadDays(f,'reserveDays');
  const total=creditPoints(p,Y).total,rounded=Math.round(total*100)/100;
  mutate(next=>{
    const prev=normalizeBenefits(next.benefits),reserveDays={...prev.reserveDays};
    if(days==null||days===0)delete reserveDays[Y-1];else reserveDays[Y-1]=days;
    const service=bnServedKind(p.serviceKind)?{dischargeMonth:p.dischargeMonth,dischargeDate:prev.dischargeDate?.slice(0,7)===p.dischargeMonth?prev.dischargeDate:null,monthsServed:p.monthsServed}:{};
    next.benefits={...prev,gender:p.gender||prev.gender,serviceKind:p.serviceKind||prev.serviceKind,...service,reserveDays,points:{total,month:today().slice(0,7),at:today()},updated:today()};
  },`נקודות הזיכוי עודכנו: ${bnFmt(total)} (הערכה)`);
  closeDialog();
  if(apply){const st=toolState();st.salary.points=rounded;st.tab='salary';saveToolState();navigate('tools');}
}

// ---------- Hooks ----------
onModuleHook('view:benefits',bnView);
onModuleHook('salaryPoints',()=>{
  const p=bnProfile().points;
  return `<div class="bn-points-hint">${textBtn('חישוב הנקודות שלי','points-wizard')}${p?`<small>לפי האשף: ${bnFmt(p.total)} נקודות · הערכה, נכון ל־${dateLabel(p.at||today())}</small>`:''}</div>`;
});
onModuleHook('alerts',now=>typeof data!=='undefined'&&data?benefitAlerts(data,now):[]);
onModuleHook('palette',()=>[
  {icon:'Award',title:'אחרי השחרור — מה מגיע לך',sub:'מענק, פיקדון, נקודות זיכוי ועבודה מועדפת',run:()=>{closeDialog();navigate('benefits');}},
  {icon:'Award',title:'אשף נקודות הזיכוי',sub:'כמה נקודות מגיעות לך השנה, למחשבון השכר',run:()=>{closeDialog();openPointsWizard();}}
]);
// A new deposit account takes the profile's estimate (§D.7); nothing when the profile gives no deposit.
function bnDepositDefaults(){
  const dep=depositEstimate(bnProfile());
  if(!dep.eligible||!dep.releaseDate)return {};
  return {name:'פיקדון אישי',institution:'משרד הביטחון',...(dep.amount!=null?{balance:Math.round(dep.amount)}:{}),releaseDate:dep.releaseDate};
}
onModuleHook('depositDefaults',()=>bnDepositDefaults());
onModuleHook('accountCard',a=>a?.kind==='deposit'?`<div class="bn-account-link">${textBtn('מה מותר לעשות בפיקדון?','navigate:benefits')}</div>`:'');

// ---------- Events (this file loads after mobile-ui.js, so bell actions land here after the bell closes) ----------
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('click',event=>{
    const seg=event.target.closest?.('[data-bn-seg]');
    if(seg){const group=seg.parentElement,hidden=group.querySelector('input[type=hidden]');
      for(const b of group.querySelectorAll('[data-bn-seg]')){const on=b===seg;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}
      if(hidden)hidden.value=seg.dataset.value;
      const form=seg.closest('form');if(form?.id==='points-form')bnRefreshWizard(form);
      return;}
    const button=event.target.closest?.('[data-action]');if(!button)return;
    const [action,arg]=button.dataset.action.split(':');
    try{
      if(action==='points-wizard')openPointsWizard();
      else if(action==='points-save'){const form=button.closest('form');try{bnSavePoints(form,false);}catch(err){showFormError(form,err);}}
      else if(action==='bn-profile')openBenefitsProfile();
      else if(action==='bn-grant')openGrantForm();
      else if(action==='bn-deposit-account'){if(typeof accountKinds!=='undefined'&&accountKinds.deposit)openEntity('account',null,{kind:'deposit',...bnDepositDefaults()});else navigate('accounts');}
      else if(action==='bn-work'){const delta=Number(arg)||0;
        mutate(next=>{const b=normalizeBenefits(next.benefits);next.benefits={...b,work:{...b.work,months:Math.max(0,Math.min(6,b.work.months+delta))},updated:today()};},'');
        document.querySelector(`[data-action="bn-work:${arg}"]:not(:disabled)`)?.focus();}
      else if(action==='bn-claimed'||action==='bn-unclaim'){
        mutate(next=>{const b=normalizeBenefits(next.benefits);next.benefits={...b,work:{...b.work,claimed:action==='bn-claimed'?today():null},updated:today()};},action==='bn-claimed'?'סימנו שהבקשה הוגשה':'הסימון בוטל');}
    }catch(err){toast(err.message,true);}
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    try{
      if(el.matches?.('[data-bn-kind]')){const form=el.closest('form');if(form)form.dataset.kind=el.value;}
      else if(el.name==='monthOnly'&&el.closest('#benefits-form')){const form=el.closest('form');form.toggleAttribute('data-month-only',el.checked);
        const exact=form.querySelector('[name=dischargeDate]'),month=form.querySelector('[name=dischargeMonth]');if(el.checked&&exact.value&&!month.value)month.value=exact.value.slice(0,7);}
      else if(el.matches?.('[data-bn-agri]'))mutate(next=>{const b=normalizeBenefits(next.benefits);next.benefits={...b,work:{...b.work,agriculture:el.checked},updated:today()};},'');
      else if(el.matches?.('[data-bn-start]')){const v=el.value;if(v&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))throw Error('יש לבחור חודש תקין.');
        mutate(next=>{const b=normalizeBenefits(next.benefits);next.benefits={...b,work:{...b.work,startMonth:v||null},updated:today()};},'');}
    }catch(err){toast(err.message,true);}
  });
  document.addEventListener('input',event=>{const form=event.target.closest?.('#points-form');if(form)bnRefreshWizard(form);});
  document.addEventListener('submit',event=>{
    const form=event.target;if(!['benefits-form','grant-form','points-form'].includes(form.id))return;
    event.preventDefault();
    try{if(form.id==='benefits-form')bnSaveProfile(form);else if(form.id==='grant-form')bnSaveGrant(form);else bnSavePoints(form,true);}
    catch(err){showFormError(form,err);}
  });
}
