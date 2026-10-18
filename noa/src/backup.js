// נועה — backups: a JSON file he keeps (optionally with the photos inside, as data URLs), a validated import with a
// preview of what is in it, restoring the previous save, a full reset, the "time to back up" reminder (every 30
// days) and the browser's persistent-storage request. Pure helpers first (tested in backup.test.js), then the page
// part (a settings card + dialogs). Private helpers are prefixed "bk".
import {validateData,DATA_LISTS,counts} from './model.js';

export const BACKUP_DAYS=30;
export const BACKUP_KIND='noa-backup';
// The file: {kind:'noa-backup', app:'נועה', format:1, exported, data, photos?:{id:{full,thumb,w,h,created}}}
export function backupPayload(data,{photos=null,now=new Date()}={}){
  const out={kind:BACKUP_KIND,app:'נועה',format:1,exported:now.toISOString(),data};
  if(photos&&Object.keys(photos).length)out.photos=photos;
  return out;
}
export function backupFileName(today,withPhotos=false){return `noa-backup-${today}${withPhotos?'-with-photos':''}.json`;}
// Read a backup file's text. Accepts our backup wrapper, or a bare data object (an older or hand-made export).
// → {data (validated), photos (object, may be empty), exported|null, counts} or throws Error with a Hebrew message.
export function parseBackup(text){
  let raw;
  try{raw=JSON.parse(String(text).replace(/^﻿/,''));}catch{throw new Error('הקובץ הזה לא נפתח: הוא לא קובץ גיבוי (JSON) תקין.');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('הקובץ לא נראה כמו גיבוי של נועה.');
  let body=raw,photos={},exported=null;
  if(raw.kind===BACKUP_KIND||('data' in raw&&raw.app)){
    if(!raw.data||typeof raw.data!=='object')throw new Error('בקובץ הגיבוי אין נתונים.');
    body=raw.data;exported=typeof raw.exported==='string'?raw.exported:null;
    if(raw.photos&&typeof raw.photos==='object'&&!Array.isArray(raw.photos))photos=raw.photos;
  }
  else if(!('version' in raw)&&!DATA_LISTS.some(l=>Array.isArray(raw[l.id]))&&!raw.profile)throw new Error('הקובץ לא נראה כמו גיבוי של נועה.');
  const data=validateData(body);
  return {data,photos,exported,counts:counts(data)};
}
// When the reminder is due: never for the demo or an empty start; with a backup, once it is BACKUP_DAYS old;
// without one, once there is something to lose (10 things) or the data is two weeks old.
export function backupDue(data,today){
  const none={due:false,days:null,reason:null};
  if(!data||data.demo)return none;
  const c=counts(data),total=c.facts+c.places+c.dates+c.gifts+c.plans+c.memories+c.people;
  const last=typeof data.prefs?.lastBackup==='string'?data.prefs.lastBackup.slice(0,10):null;
  const days=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);
  if(last&&!Number.isNaN(Date.parse(last))){const n=Math.max(0,days(last,today));return n>=BACKUP_DAYS?{due:true,days:n,reason:'old'}:{...none,days:n};}
  const firstStamp=[...(data.facts||[]),...(data.places||[]),...(data.memories||[]),...(data.dates||[])].map(x=>String(x.created||'').slice(0,10)).filter(s=>/^\d{4}-\d{2}-\d{2}$/.test(s)).sort()[0];
  if(total>=10||(total>0&&firstStamp&&days(firstStamp,today)>=14))return {due:true,days:null,reason:'never'};
  return none;
}
// The counts line of a backup preview: "39 עובדות · 12 מקומות · 7 זיכרונות…"
export function countsLine(c){
  const parts=[[c.facts,'עובדות'],[c.people,'אנשים'],[c.places,'מקומות'],[c.dates,'תאריכים'],[c.gifts,'מתנות'],[c.plans,'תוכניות'],[c.memories,'זיכרונות'],[c.photos,'תמונות']].filter(([n])=>n>0).map(([n,w])=>`${n} ${w}`);
  return parts.length?parts.join(' · '):'ריק';
}

// ---------- In the page ----------
const bkState={persist:null,usage:null,quota:null,withPhotos:false};
const bkHasDom=typeof document!=='undefined'&&!!document.addEventListener;
async function bkCheckStorage(){
  const st=navigator.storage;
  try{bkState.persist=st?.persisted?(await st.persisted()?'granted':'denied'):'unsupported';}catch{bkState.persist='unsupported';}
  try{const e=await st?.estimate?.();if(e&&e.quota){bkState.usage=e.usage||0;bkState.quota=e.quota;}}catch{}
  bkRefresh();
}
async function requestPersist(){
  try{if(!navigator.storage?.persist)return null;const ok=await navigator.storage.persist();bkState.persist=ok?'granted':'denied';bkRefresh();return ok;}catch{return null;}
}
function bkRefresh(){const el=document.querySelector('.backup-card');if(el)el.outerHTML=backupCard();}
const bkMb=b=>`${(Math.max(0,b)/1048576).toLocaleString('he-IL',{maximumFractionDigits:1,minimumFractionDigits:b>0&&b<1048576?1:0})} MB`;
function backupCard(){
  const d=getData(),due=backupDue(d,todayISO()),last=d.prefs?.lastBackup;
  const lastText=last?`הגיבוי האחרון: ${fmtDate(last.slice(0,10),{year:true})} (${fmtRelative(last.slice(0,10))})`:'עוד לא שמרת גיבוי.';
  const persist=bkState.persist==='granted'?`${icon('ShieldCheck',16)}<span>הדפדפן לא ימחק את הנתונים גם כשחסר מקום.</span>`:bkState.persist==='denied'?`${icon('TriangleAlert',16)}<span>הדפדפן עלול למחוק נתונים כשחסר מקום. גיבוי שומר עליך.</span>${button('בקשת אחסון קבוע','backup-persist',{size:'small',variant:'ghost'})}`:'';
  const prev=store.prev();
  const body=`<div class="backup-status${due.due?' due':''}">${icon(due.due?'TriangleAlert':'CircleCheck',18)}<span>${esc(lastText)}${due.due?' כדאי לגבות עכשיו.':''}</span></div>
    <div class="setting-rows"><label class="switch-row"><span><b>כולל תמונות</b><small>הקובץ יהיה גדול יותר, אבל הזיכרונות יחזרו עם התמונות.</small></span><input type="checkbox" class="switch" data-change="backup-photos" ${bkState.withPhotos?'checked':''}></label></div>
    <div class="card-actions">${button('הורדת גיבוי','backup-export',{icon:'Download',variant:'primary'})}${button('שחזור מקובץ','backup-import',{icon:'Upload'})}</div>
    ${persist?`<p class="card-note persist">${persist}</p>`:''}${bkState.quota?`<p class="card-note subtle">${icon('HardDrive',14)} בשימוש כ־${bkMb(bkState.usage)} מתוך ${bkMb(bkState.quota)}.</p>`:''}
    <div class="setting-rows divided">
      <div class="action-row"><span><b>שחזור השמירה הקודמת</b><small>${prev?`מה שהיה לפני השינוי האחרון: ${esc(countsLine(counts(prev)))}`:'אין עדיין שמירה קודמת.'}</small></span>${button('שחזור','backup-prev',{size:'small',disabled:!prev})}</div>
      <div class="action-row"><span><b>טעינת נתוני דוגמה</b><small>כדי לראות איך הכול נראה. מנקים בלחיצה.</small></span>${button('טעינה','demo-load',{size:'small'})}</div>
      <div class="action-row danger"><span><b>מחיקת כל הנתונים</b><small>הכול נמחק מהמכשיר, כולל התמונות. אין דרך לבטל.</small></span>${button('מחיקה','reset-all',{size:'small',variant:'danger'})}</div>
    </div>`;
  return card(body,{title:'גיבוי ושחזור',sub:'הנתונים נשמרים רק במכשיר הזה. קובץ גיבוי הוא הדרך לשמור עליהם.',icon:'ShieldCheck',tone:'2',cls:'backup-card',id:'backup',actions:due.due?badge('כדאי לגבות','warning'):badge('מוגן','positive',{icon:'Check'})});
}
async function exportBackup(){
  const d=getData();let photos=null;
  if(bkState.withPhotos){toast('אוספים את התמונות…',{icon:'Images'});photos=await exportPhotos([...photoIdsIn(d)]);}
  const payload=backupPayload(d,{photos});
  downloadFile(backupFileName(todayISO(),!!photos),JSON.stringify(payload,null,1));
  if(!d.demo)update(x=>{x.prefs.lastBackup=new Date().toISOString();},{undo:false,silent:true});
  toast(photos?`הגיבוי ירד, כולל ${Object.keys(photos).length} תמונות. שמור אותו במקום בטוח 💛`:'הגיבוי ירד. שמור אותו במקום בטוח 💛',{icon:'Download'});
  requestPersist();
}
function importBackup(){
  const input=document.createElement('input');input.type='file';input.accept='application/json,.json';
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    let parsed;try{parsed=parseBackup(await file.text());}catch(err){toast(err.message,{error:true});return;}
    const nPhotos=Object.keys(parsed.photos).length;
    const ok=await confirmAsk({title:'שחזור מגיבוי',confirm:'שחזור',icon:'Upload',
      bodyHtml:`<p class="dlg-lead">בקובץ: <b>${esc(countsLine(parsed.counts))}</b>${nPhotos?` · ${nPhotos} תמונות שמורות בקובץ`:''}.</p>${parsed.exported?`<p class="dlg-lead subtle">נשמר ב־${esc(fmtDate(parsed.exported.slice(0,10),{year:true}))}.</p>`:''}${notice('הנתונים שבמכשיר עכשיו יוחלפו בנתונים מהקובץ. אפשר לבטל מיד אחרי, או לשחזר את "השמירה הקודמת".',{tone:'warning'})}`});
    if(!ok)return;
    if(nPhotos){try{await importPhotos(parsed.photos);}catch(err){toast('חלק מהתמונות לא נשמרו: '+uiErrText(err),{error:true});}}
    bkReplace(parsed.data,'הגיבוי שוחזר 💛');
  });
  input.click();
}
// Replace all the data (import, previous save, demo) with an undo snapshot — also over unreadable data.
function bkReplace(next,message){
  const forced=!!store.loadError;
  store.commit(next,{undo:forced?null:message,force:forced});
  toast(message,{undo:!forced});
}
async function restorePrevious(){
  const prev=store.prev();if(!prev){toast('אין שמירה קודמת.',{error:true});return;}
  const ok=await confirmAsk({title:'שחזור השמירה הקודמת',text:`הנתונים יחזרו למה שהיה לפני השינוי האחרון: ${countsLine(counts(prev))}.`,confirm:'שחזור',icon:'History'});
  if(ok)bkReplace(prev,'השמירה הקודמת שוחזרה');
}
async function loadDemo(){
  const d=getData();const empty=isEmptyData(d);
  const ok=empty||await confirmAsk({title:'טעינת נתוני דוגמה',text:'נתוני הדוגמה יחליפו את מה שיש עכשיו. אפשר לבטל מיד אחרי, ומומלץ להוריד גיבוי קודם.',confirm:'טעינה',icon:'Sparkles'});
  if(!ok)return;
  bkReplace(demoData(todayISO()),'נתוני הדוגמה נטענו ✨');
  go('home');
}
async function resetAll(){
  const ok=await confirmAsk({title:'מחיקת כל הנתונים',danger:true,confirm:'מחיקה לצמיתות',icon:'Trash2',requireWord:'מחיקה',
    bodyHtml:`<p class="dlg-lead">כל מה ששמרת — עליה, מקומות, תאריכים, מתנות, תוכניות, זיכרונות והתמונות — יימחק מהמכשיר. אין דרך לבטל.</p><p class="dlg-actions">${button('הורדת גיבוי קודם','backup-export',{icon:'Download',size:'small',variant:'soft'})}</p>`});
  if(!ok)return;
  try{for(const k of [DATA_KEY,PREV_KEY,TMP_KEY,BROKEN_KEY])localStorage.removeItem(k);}catch{}
  try{const ids=await allPhotoIds();for(const id of ids)await deletePhoto(id);}catch{}
  store.load();store.clearUndo();
  toast('הכול נמחק. דף חדש 🤍');
  go('home');renderApp();
}
// The home reminder card (registered by home.js through backupReminderCard()).
function backupReminderCard(){
  const due=backupDue(getData(),todayISO());if(!due.due)return '';
  return `<div class="reminder-strip">${iconTile('ShieldCheck','2',18)}<span><b>זמן לגיבוי</b><small>${due.reason==='old'?`הגיבוי האחרון היה לפני ${due.days} ימים.`:'עוד לא שמרת גיבוי. הכול נמצא רק בטלפון הזה.'}</small></span>${button('גיבוי','backup-export',{size:'small',variant:'primary',icon:'Download'})}</div>`;
}
if(bkHasDom){
  onAction('backup-export',()=>exportBackup());
  onAction('backup-import',()=>importBackup());
  onAction('backup-prev',()=>restorePrevious());
  onAction('backup-persist',async()=>{const ok=await requestPersist();toast(ok?'האחסון הקבוע אושר':'הדפדפן לא אישר. אפשר לנסות שוב אחרי התקנה למסך הבית.',{error:!ok});});
  onAction('demo-load',()=>loadDemo());
  onAction('reset-all',()=>resetAll());
  onChange('backup-photos',on=>{bkState.withPhotos=!!on;});
}
