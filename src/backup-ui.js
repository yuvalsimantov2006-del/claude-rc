// Backup safety 4.1 UI: storage status card, persist request, backup reminder and palette entry (WS-MODULES).
import {onModuleHook} from './hooks.js';
import {today,dateLabel} from './finance.js';
import {PERSIST_KEY,BACKUP_DAYS,backupDue,syncCovers,persistState,storageText} from './backup.js';
// What this device said about persistent storage: 'granted' | 'denied' | 'unsupported' | null (not asked yet).
const bkState={persist:null,usage:null,quota:null,asking:false};
const bkStorage=()=>typeof navigator!=='undefined'?navigator.storage:undefined;
function bkRecord(){try{return persistState(localStorage.getItem(PERSIST_KEY));}catch{return persistState(null);}}
function bkSave(rec){try{localStorage.setItem(PERSIST_KEY,JSON.stringify(rec));}catch{}}
// Any storage promise, bounded: a browser that never answers counts as "no answer" after 5 seconds.
function bkTimed(promise,ms=5000){return Promise.race([Promise.resolve(promise),new Promise(resolve=>setTimeout(()=>resolve(undefined),ms))]);}
async function bkCheck(){
  const st=bkStorage();
  try{
    if(!st?.persist||!st?.persisted)bkState.persist='unsupported';
    else{const v=await bkTimed(st.persisted());bkState.persist=v===true?'granted':v===false?'denied':'unsupported';}
  }catch{bkState.persist='unsupported';}
  try{if(st?.estimate){const est=await bkTimed(st.estimate());if(est&&Number.isFinite(est.usage)&&est.quota>0){bkState.usage=est.usage;bkState.quota=est.quota;}}}catch{}
  bkRefresh();
}
// Ask the browser to keep Ofek's storage. Never throws and never blocks a save.
async function bkRequest(){
  const st=bkStorage();if(!st?.persist){bkState.persist='unsupported';return null;}
  let result=null;
  try{const v=await bkTimed(st.persist());result=typeof v==='boolean'?v:null;}catch{result=null;}
  bkState.persist=result===true?'granted':result===false?'denied':bkState.persist||'unsupported';
  const rec=bkRecord();bkSave({asked:rec.asked||today(),result});
  return result;
}
// Redraw the card in place (a full render would disturb whatever the user is typing in settings).
function bkRefresh(){try{const el=typeof document!=='undefined'&&document.querySelector('.bk-card');if(el)el.outerHTML=bkCard();}catch{}}
const bkSync=()=>{try{return typeof syncState==='function'?syncState():null;}catch{return null;}};
function bkAgo(iso){
  const day=String(iso).slice(0,10),n=Math.max(0,Math.round((Date.parse(today()+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/864e5));
  return `${n===0?'היום':n===1?'אתמול':`לפני ${n} ימים`} · ${dateLabel(day)}`;
}
function bkRow(ic,color,title,text,action=''){return `<div class="bk-row"><span class="asset-icon ${color}">${icon(ic,17)}</span><div><b>${e(title)}</b><small>${e(text)}</small></div>${action}</div>`;}
function bkCard(){
  const now=today(),due=backupDue(data,now),recent=due.days!=null&&due.days<=BACKUP_DAYS,p=bkState.persist;
  const persistRow=p==='granted'?bkRow('ShieldCheck','green','אחסון קבוע בדפדפן','הדפדפן לא ימחק את הנתונים של אופק כשחסר מקום.')
    :p==='unsupported'?bkRow('Database','neutral','אחסון קבוע בדפדפן','הדפדפן הזה לא מאפשר לבקש אחסון קבוע. גיבוי מוצפן הוא ההגנה שלך.')
    :p==='denied'||!p?bkRow('TriangleAlert','gold','אחסון קבוע בדפדפן','הדפדפן עלול למחוק נתונים של אתרים כשחסר מקום במכשיר. גיבוי מוצפן שומר עליך גם אז.',bkState.asking?'':textBtn('בקשת אחסון קבוע','persist-request')):'';
  const backupRow=bkRow('Download',recent?'green':'gold','גיבוי אחרון',data.lastBackup&&!Number.isNaN(Date.parse(data.lastBackup))?bkAgo(data.lastBackup):'עוד לא נשמר גיבוי',btn('גיבוי מוצפן עכשיו','alert-backup','ShieldCheck','primary small'));
  const usageRow=bkState.quota?bkRow('Smartphone','blue','נפח בשימוש',`כ־${storageText(bkState.usage)} מתוך ${storageText(bkState.quota)} שהדפדפן מקצה`):'';
  return card(head('הגיבוי והאחסון שלך','הנתונים שמורים רק במכשיר הזה. ככה הם נשארים בטוחים.',p==='granted'&&recent?badge('מוגן','green'):badge('כדאי לגבות','gold'))+`<div class="bk-list">${persistRow}${backupRow}${usageRow}</div>`,'bk-card');
}
function bkAlerts(now){
  if(typeof data==='undefined'||!data)return [];
  const due=backupDue(data,now);
  if(!due.due||syncCovers(bkSync(),now))return [];
  return [{id:`backup-${now.slice(0,7)}`,type:'reminders',icon:'ShieldCheck',color:'gold',title:'זמן לגיבוי מוצפן',
    body:due.reason==='old'?`הגיבוי האחרון היה לפני ${due.days} ימים. לחיצה אחת, וקובץ מוצפן נשמר אצלך.`:'עוד לא שמרת גיבוי. לחיצה אחת, וקובץ מוצפן נשמר אצלך.',action:'alert-backup'}];
}
onModuleHook('boot',()=>{
  const rec=bkRecord();
  if(rec.result===true)bkState.persist='granted';
  if(typeof setTimeout==='function')bkCheck();
});
// The first real save (not the demo, at least one account) asks once; later only the button asks.
onModuleHook('afterCommit',(previous,next)=>{
  if(!next||next.demo||!next.accounts?.length||bkRecord().asked||!bkStorage()?.persist||typeof setTimeout!=='function')return;
  bkSave({asked:today(),result:null});
  bkRequest().then(bkRefresh,()=>{});
});
onModuleHook('settings',()=>bkCard());
onModuleHook('alerts',now=>bkAlerts(now));
onModuleHook('palette',()=>[{icon:'ShieldCheck',title:'גיבוי מוצפן',sub:'קובץ .ofek שנפתח רק עם הסיסמה שלך',run:()=>{closeDialog();openEncryptedBackup();}}]);
// Loads after mobile-ui.js, whose handler closes the alerts dialog first, so the backup form stays open.
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-action]');if(!button)return;
  const action=button.dataset.action;
  if(action==='alert-backup'){try{openEncryptedBackup();}catch(err){toast(err.message,true);}}
  else if(action==='persist-request'){
    if(bkState.asking)return;bkState.asking=true;bkRefresh();
    bkRequest().then(result=>{
      bkState.asking=false;bkRefresh();
      if(result===true)toast('האחסון הקבוע אושר');
      else toast('הדפדפן לא אישר אחסון קבוע. אפשר לנסות שוב אחרי התקנה למסך הבית.',true);
    });
  }
});
