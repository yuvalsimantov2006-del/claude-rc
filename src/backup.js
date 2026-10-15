// Backup safety 4.1: backup reminder rules and the persistent-storage record (pure; WS-MODULES).
export const PERSIST_KEY='ofek-persist-v1';
export const BACKUP_DAYS=30;
const bkDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)&&!Number.isNaN(Date.parse(v.slice(0,10)+'T12:00:00Z'))?v.slice(0,10):null;
// Whole days from date a to date b (both 'YYYY-MM-DD'); negative when a is after b.
const bkDays=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);
// When a backup reminder is due. A demo never is. With a backup: once it is BACKUP_DAYS old. Without one:
// once there is real data to lose (10 transactions) or the data is a week old.
export function backupDue(d,now){
  const none={due:false,days:null,reason:null};
  if(!d||d.demo)return none;
  const last=bkDate(d.lastBackup),today=bkDate(now);if(!today)return none;
  if(last){const days=Math.max(0,bkDays(last,today));return days>=BACKUP_DAYS?{due:true,days,reason:'old'}:{...none,days};}
  const created=bkDate(d.createdAt),count=Array.isArray(d.transactions)?d.transactions.length:0;
  if(count>=10||(created&&bkDays(created,today)>=7))return {due:true,days:null,reason:'never'};
  return none;
}
// Encrypted sync to the user's own GitHub counts as an off-device copy while it is on and has run in the
// last BACKUP_DAYS days; then the bell does not ask for a file as well. `sync` is the ofek-sync-v1 record.
export function syncCovers(sync,now){
  if(!sync||typeof sync!=='object'||!sync.gistId||sync.auto===false||sync.pendingChoice)return false;
  const last=bkDate(sync.lastSyncAt),today=bkDate(now);
  return !!(last&&today&&bkDays(last,today)<BACKUP_DAYS);
}
// The device record {asked:'YYYY-MM-DD'|null, result:true|false|null}; anything unreadable becomes the empty record.
export function persistState(raw){
  let v=raw;if(typeof v==='string'){try{v=JSON.parse(v);}catch{v=null;}}
  if(!v||typeof v!=='object'||Array.isArray(v))return {asked:null,result:null};
  return {asked:bkDate(v.asked),result:typeof v.result==='boolean'?v.result:null};
}
// Bytes → "12.3 MB" (one decimal).
export function storageText(bytes){
  const mb=Math.max(0,Number(bytes)||0)/1048576;
  return `${mb.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})} MB`;
}
