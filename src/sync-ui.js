import {today,validateData} from './finance.js';
import {hasV41Content} from './ledger.js';
import {fingerprint,deriveKey,exportKey,importKey,newSalt,encryptJSON,decryptJSON,encryptWithPassphrase,fromBase64,toBase64,saveVersion,listVersions,readVersion,gistClient,syncDecision,newNonce,KDF_ITERATIONS} from './sync.js';

// Settings: device sync (end-to-end encrypted, via the user's GitHub), version history and
// encrypted backup files. Built on the UI helpers and state from app.js.

const SYNC_KEY='ofek-sync-v1';
const syncRuntime={busy:false,error:null,timer:null,lastVersionAt:null,versions:null,applying:false,again:false};
function syncState(){try{return JSON.parse(localStorage.getItem(SYNC_KEY)||'null');}catch{return null;}}
function saveSyncState(patch){const next={...(syncState()||{}),...patch};try{localStorage.setItem(SYNC_KEY,JSON.stringify(next));}catch{}return next;}
const deviceLabel=()=>/iPhone|iPad|Android|Mobile/i.test(navigator.userAgent||'')?'טלפון':'מחשב';
const timeLabel=iso=>iso?new Date(iso).toLocaleString('he-IL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—';

// Saves a version and refreshes the list if it is on screen.
async function rememberVersion(d,reason){
  const version=await saveVersion(d,reason).catch(()=>null);
  if(version)syncRuntime.lastVersionAt=Date.now();
  syncRuntime.versions=null;
  if(document.querySelector('#versions-list'))loadVersions();
  return version;
}
// Called by commit() after every successful save.
// opts.auto: rows the app recorded by itself (§B.7). They are pushed, but they are not a local edit, so the cloud
// wins a conflict and deterministic ids recreate the same rows afterwards.
function afterCommit(previous,next,replacement,opts={}){
  const now=Date.now();
  if(previous&&(replacement||!syncRuntime.lastVersionAt||now-syncRuntime.lastVersionAt>6*3600e3)){
    syncRuntime.lastVersionAt=now;
    rememberVersion(previous,replacement?'לפני החלפת הנתונים':'שמירה אוטומטית');
  }
  if(syncRuntime.applying)return;
  const st=syncState();
  if(st?.gistId&&st.auto!==false){if(!opts?.auto)saveSyncState({localChangedAt:new Date().toISOString()});schedulePush();}
}
function schedulePush(delay=2500){clearTimeout(syncRuntime.timer);syncRuntime.timer=setTimeout(()=>syncNow('auto'),delay);}
function syncBadge(){
  const st=syncState();
  if(!st?.gistId)return `${icon('ShieldCheck',15)}<span>הנתונים נשמרים במכשיר שלך</span>`;
  const text=st.pendingChoice?'הסנכרון ממתין לבחירה':syncRuntime.error?'הסנכרון ממתין':syncRuntime.busy?'מסנכרן…':st.auto===false?'הסנכרון מושהה':`מסונכרן ומוצפן · ${timeLabel(st.lastSyncAt)}`;
  return `${icon(syncRuntime.error||st.pendingChoice?'TriangleAlert':'ShieldCheck',15)}<span>${text}</span>`;
}
function refreshSyncUI(){
  const badge=document.querySelector('.local-status');if(badge)badge.innerHTML=syncBadge();
  const box=document.querySelector('#sync-card');if(box)box.outerHTML=syncCard();
}

async function syncNow(mode='manual',force=null){
  const st=syncState();if(!st?.gistId||!st.keyJwk||(st.pendingChoice&&!force))return;
  if(syncRuntime.busy){syncRuntime.again=true;return;}
  syncRuntime.busy=true;syncRuntime.error=null;refreshSyncUI();
  try{
    const client=gistClient(st.token),key=await importKey(st.keyJwk),{payload}=await client.read(st.gistId),json=JSON.stringify(data);
    const decision=force||syncDecision({localFingerprint:fingerprint(json),lastFingerprint:st.lastFingerprint,remote:payload,lastRev:st.lastRev||0,lastNonce:st.lastNonce||null,localChangedAt:st.localChangedAt});
    // A conflict only matters when someone edited here; changes the app made by itself (recurring entries) just follow the cloud.
    const conflict=decision==='pull-conflict'&&!!st.localChangedAt;
    if(decision.startsWith('push')&&loadError)throw Error('הנתונים במכשיר הזה לא נקראו, ולכן לא הועלו לענן. אפשר לטעון את הגרסה מהענן או לשחזר גיבוי.');
    if(decision.startsWith('pull')){
      const remote=await decryptJSON(payload.encrypted,key);validateData(remote);
      // §F.8: a payload without `app` comes from a 4.0 device. If it would drop this device's cards, transfers or
      // plans, nothing is applied: the user chooses, after updating the other device.
      if(!force&&!payload.app&&hasV41Content(data)&&!hasV41Content(remote)){
        await rememberVersion(data,'לפני בחירה מול מכשיר עם גרסה ישנה');
        saveSyncState({pendingChoice:{from:payload.deviceName||'',updatedAt:payload.updatedAt,transactions:remote.transactions.length,goals:remote.goals.length,assets:remote.assets.length,legacy:true}});
        if(typeof document!=='undefined'&&!document.querySelector('dialog'))openSyncChoice();
        return;
      }
      await rememberVersion(data,conflict?'הגרסה המקומית לפני מיזוג':'לפני עדכון ממכשיר אחר');
      syncRuntime.applying=true;
      try{commit(remote,conflict?'היו שינויים בשני מכשירים: נטענה הגרסה החדשה יותר, והמקומית נשמרה בהיסטוריית הגרסאות':`הנתונים עודכנו ממכשיר אחר${payload.deviceName?` (${payload.deviceName})`:''}`,true);}
      finally{syncRuntime.applying=false;}
      saveSyncState({lastFingerprint:fingerprint(JSON.stringify(data)),lastRev:payload.rev||0,lastNonce:payload.nonce||null,remoteUpdatedAt:payload.updatedAt,lastSyncAt:new Date().toISOString(),localChangedAt:null,pendingChoice:null});
    }else if(decision.startsWith('push')){
      const updatedAt=new Date().toISOString(),rev=Math.max(st.lastRev||0,payload?.rev||0)+1,nonce=newNonce(),encrypted=await encryptJSON(data,key,fromBase64(st.salt),st.iterations);
      await client.write(st.gistId,{format:'ofek-sync',version:1,app:'4.1.0',updatedAt,rev,nonce,device:st.device,deviceName:st.deviceName,encrypted});
      saveSyncState({lastFingerprint:fingerprint(json),lastRev:rev,lastNonce:nonce,remoteUpdatedAt:updatedAt,lastSyncAt:updatedAt,localChangedAt:null,pendingChoice:null});
      if(mode==='manual')toast(decision==='push-conflict'?'הגרסה במכשיר הזה חדשה יותר והועלתה. הגרסה הקודמת נשמרה בהיסטוריה בענן.':'הנתונים הועלו לענן, מוצפנים');
    }else{saveSyncState({lastSyncAt:new Date().toISOString()});if(mode==='manual')toast('הכול מסונכרן');}
  }catch(err){
    syncRuntime.error=err.message;
    if(err.status===401)saveSyncState({auto:false});
    if(mode==='manual')toast(err.message,true);
  }finally{
    syncRuntime.busy=false;refreshSyncUI();
    if(syncRuntime.again){syncRuntime.again=false;schedulePush(500);}
  }
}

async function connectSync(form){
  const f=new FormData(form),token=String(f.get('token')||'').trim(),pass=String(f.get('passphrase')||''),confirmPass=String(f.get('confirm')||''),deviceName=String(f.get('device')||'').trim()||deviceLabel();
  if(!/^(ghp_|github_pat_|gho_)/.test(token))throw Error('הטוקן צריך להתחיל ב־ghp_ או github_pat_.');
  if(pass.length<8)throw Error('סיסמת הסנכרון צריכה להיות באורך 8 תווים לפחות.');
  const button=form.querySelector('[type=submit]');if(button){button.disabled=true;button.querySelector('span').textContent='מתחבר…';}
  try{
    const client=gistClient(token),user=await client.user(),existing=await client.find(),device=Math.random().toString(36).slice(2,10);
    if(existing){
      const {payload}=await client.read(existing),salt=fromBase64(payload.encrypted.salt),key=await deriveKey(pass,salt,payload.encrypted.iterations);
      const remote=await decryptJSON(payload.encrypted,key);validateData(remote);
      const pendingChoice={from:payload.deviceName||'',updatedAt:payload.updatedAt,transactions:remote.transactions.length,goals:remote.goals.length,assets:remote.assets.length};
      saveSyncState({token,gistId:existing,salt:payload.encrypted.salt,iterations:payload.encrypted.iterations,keyJwk:await exportKey(key),login:user.login,device,deviceName,auto:true,lastFingerprint:null,lastRev:0,lastNonce:null,remoteUpdatedAt:null,lastSyncAt:null,localChangedAt:null,pendingChoice});
      closeDialog();render();openSyncChoice();
      return;
    }else{
      if(loadError)throw Error('הנתונים במכשיר הזה לא נקראו. שחזר אותם קודם, ואז הפעל סנכרון.');
      const salt=newSalt(),key=await deriveKey(pass,salt),json=JSON.stringify(data),encrypted=await encryptJSON(data,key,salt),updatedAt=new Date().toISOString(),nonce=newNonce();
      const id=await client.create({format:'ofek-sync',version:1,app:'4.1.0',updatedAt,rev:1,nonce,device,deviceName,encrypted});
      saveSyncState({token,gistId:id,salt:toBase64(salt),iterations:KDF_ITERATIONS,keyJwk:await exportKey(key),login:user.login,device,deviceName,auto:true,lastFingerprint:fingerprint(json),lastRev:1,lastNonce:nonce,remoteUpdatedAt:updatedAt,lastSyncAt:updatedAt,localChangedAt:null,pendingChoice:null});
      closeDialog();toast('הסנכרון הופעל. במכשיר השני חבר את אותו חשבון GitHub עם אותה סיסמה.');
    }
    render();
  }finally{if(button){button.disabled=false;button.querySelector('span').textContent='חיבור והפעלת סנכרון';}}
}
function choiceText(c){return `בענן כבר יש נתונים ממכשיר אחר${c.from?` (${e(c.from)})`:''}: ${c.transactions} תנועות, ${c.goals} יעדים ו־${c.assets} נכסים, מעודכנים ל־${timeLabel(c.updatedAt)}. במכשיר הזה: ${data.transactions.length} תנועות, ${data.goals.length} יעדים ו־${data.assets.length} נכסים.`;}
// The legacy notice (§D.2) comes first when the cloud copy was saved by a 4.0 device.
const LEGACY_SYNC_NOTICE='מכשיר אחר עם גרסה ישנה של אופק (4.0) שמר נתונים בענן. אם נטען אותם, יימחקו מהמכשיר הזה כרטיסי אשראי, העברות ועסקאות בתשלומים. כדאי לעדכן קודם את המכשיר השני (פשוט לפתוח בו את אופק כשיש אינטרנט), ואז לבחור.';
function choiceHTML(c){return `${c.legacy?notice(LEGACY_SYNC_NOTICE,'warning'):''}<p class="confirm-text">${choiceText(c)}</p>`;}
function choiceButtons(){return `${btn('טעינת הנתונים מהענן','sync-choose:pull','Download','primary')}${btn('העלאת הנתונים מהמכשיר הזה','sync-choose:push','Upload')}`;}
function openSyncChoice(){
  const c=syncState()?.pendingChoice;if(!c)return;
  showDialog('איזה נתונים לשמור?',`${choiceHTML(c)}<p class="muted small">הגרסה שלא תיבחר לא נמחקת: המקומית נשמרת בהיסטוריית הגרסאות במכשיר, וזו שבענן נשארת בהיסטוריה בענן.</p><div class="form-actions">${choiceButtons()}</div>`);
}
function openSyncSetup(){
  showDialog('סנכרון בין מכשירים',`<form id="sync-form"><div class="form-error"></div><ol class="sync-steps"><li>היכנס ל־GitHub וצור <a href="https://github.com/settings/tokens/new?scopes=gist&description=Ofek%20sync" target="_blank" rel="noopener noreferrer">טוקן עם הרשאת gist בלבד</a> (חשבון חינמי מספיק).</li><li>הדבק אותו כאן ובחר סיסמת סנכרון. הסיסמה מצפינה את הנתונים במכשיר — GitHub רואה רק מידע מוצפן.</li><li>במכשיר השני: אותו טוקן ואותה סיסמה.</li></ol><div class="form-grid">${field('טוקן GitHub',input('token','','password','required autocomplete="off" dir="ltr" spellcheck="false" placeholder="ghp_…"'),'','full')}${field('סיסמת סנכרון',input('passphrase','','password','required minlength="8" autocomplete="new-password"'),'אין שחזור לסיסמה הזו — שמור אותה במקום בטוח.')}${field('אימות הסיסמה',input('confirm','','password','autocomplete="new-password"'),'נדרש רק בהפעלה הראשונה')}${field('שם המכשיר',input('device',deviceLabel(),'text'),'','full')}</div><div class="form-actions">${submit('חיבור והפעלת סנכרון','ShieldCheck')}${btn('ביטול','dialog-close')}</div></form>`,true);
}
function syncCard(){
  const st=syncState(),connected=!!st?.gistId;
  if(!connected)return card(head('סנכרון בין מכשירים','הטלפון והמחשב עם אותם נתונים — מוצפנים מקצה לקצה.',badge('כבוי','neutral'))+`<div class="sync-pitch"><div><span class="asset-icon purple">${icon('ShieldCheck',19)}</span><p><b>מוצפן במכשיר.</b> הנתונים מוצפנים ב־AES-256 בסיסמה שרק אתה יודע, לפני שהם יוצאים מהמכשיר.</p></div><div><span class="asset-icon gold">${icon('Repeat',19)}</span><p><b>אוטומטי.</b> כל שינוי נשמר ומסתנכרן תוך שניות, וכשהאפליקציה נפתחת במכשיר אחר.</p></div><div><span class="asset-icon green">${icon('RotateCcw',19)}</span><p><b>היסטוריה בענן.</b> כל גרסה נשמרת, ואפשר לחזור לכל אחת מכל מכשיר.</p></div></div>${btn('הפעלת סנכרון','sync-setup','ShieldCheck','primary')}<p class="muted small">הסנכרון משתמש בחשבון GitHub האישי שלך כאחסון מאובטח (gist פרטי). אין שרת של אופק בדרך.</p>`,'sync-card" id="sync-card');
  if(st.pendingChoice)return card(head('סנכרון בין מכשירים',`${st.deviceName||'המכשיר הזה'} · חשבון GitHub: ${st.login||'—'}`,badge('ממתין לבחירה','gold'))+`${choiceHTML(st.pendingChoice)}<div class="actions">${choiceButtons()}${btn('ניתוק המכשיר','sync-disconnect','','danger')}</div>`,'sync-card" id="sync-card');
  return card(head('סנכרון בין מכשירים',`${st.deviceName||'המכשיר הזה'} · חשבון GitHub: ${st.login||'—'}`,syncRuntime.error?badge('ממתין','gold'):badge(st.auto===false?'מושהה':'פעיל','green'))+`<div class="sync-status"><div><span>סנכרון אחרון</span><b>${syncRuntime.busy?'מסנכרן…':timeLabel(st.lastSyncAt)}</b></div><div><span>הצפנה</span><b>AES-256-GCM · במכשיר</b></div><div><span>סנכרון אוטומטי</span><b>${st.auto===false?'כבוי':'פועל'}</b></div></div>${syncRuntime.error?notice(syncRuntime.error,'error'):''}<div class="actions">${btn('סנכרון עכשיו','sync-now','Repeat','primary')}${btn('גרסאות בענן','sync-history','RotateCcw')}${btn(st.auto===false?'הפעלת סנכרון אוטומטי':'השהיית סנכרון אוטומטי','sync-auto','')}${btn('ניתוק המכשיר','sync-disconnect','','danger')}</div>`,'sync-card" id="sync-card');
}
function versionsCard(){
  return card(head('היסטוריית גרסאות',`עד 40 הגרסאות האחרונות נשמרות במכשיר: שמירה אוטומטית כל כמה שעות, ולפני כל שחזור, ייבוא או עדכון מהענן.`,btn('שמירת גרסה עכשיו','version-now','Save'))+`<div id="versions-list" class="versions-list">${versionsHTML()}</div><div class="actions versions-actions">${btn('הורדת גיבוי מוצפן','backup-encrypted','ShieldCheck')}<span class="muted small">גיבוי מוצפן (.ofek) נפתח רק עם הסיסמה שלך — אפשר לשמור אותו בבטחה בכל ענן. השחזור דרך ״ייבוא / שחזור״.</span></div>`,'versions-card');
}
function versionsHTML(){
  if(!syncRuntime.versions){loadVersions();return '<p class="muted small">טוען גרסאות…</p>';}
  if(!syncRuntime.versions.length)return '<p class="muted small">עוד אין גרסאות שמורות. הגרסה הראשונה תישמר עם השינוי הבא.</p>';
  return syncRuntime.versions.slice(0,12).map(v=>`<div class="version-row"><span class="asset-icon purple">${icon('RotateCcw',16)}</span><div><b>${timeLabel(v.at)}</b><small>${e(v.reason)} · ${v.summary.transactions} תנועות · ${v.summary.goals} יעדים · ${v.summary.assets} נכסים</small></div>${btn('שחזור','version-restore:'+v.id)}</div>`).join('')+(syncRuntime.versions.length>12?`<p class="muted small">ועוד ${syncRuntime.versions.length-12} גרסאות ישנות יותר.</p>`:'');
}
async function loadVersions(){
  syncRuntime.versions=await listVersions();
  if(syncRuntime.versions[0])syncRuntime.lastVersionAt=Math.max(syncRuntime.lastVersionAt||0,new Date(syncRuntime.versions[0].at).getTime());
  const box=document.querySelector('#versions-list');if(box)box.innerHTML=versionsHTML();
}
function syncCards(){return syncCard()+versionsCard();}

function restoreData(value,label){
  validateData(value);
  confirm('לשחזר את הגרסה?',`${label}: ${value.transactions.length} תנועות, ${value.assets.length} נכסים, ${value.goals.length} יעדים. הנתונים הנוכחיים יוחלפו — ונשמרים קודם בהיסטוריית הגרסאות.`,()=>{commit(value,'הגרסה שוחזרה',true);ui.monthly=null;ui.monthlyDone=null;},true);
}
async function openCloudHistory(){
  const st=syncState();if(!st?.gistId)return;
  showDialog('גרסאות בענן','<p class="muted">טוען את היסטוריית הגרסאות מ־GitHub…</p>');
  try{
    const {history}=await gistClient(st.token).read(st.gistId);
    showDialog('גרסאות בענן',`<p class="confirm-text">כל סנכרון שומר גרסה. בחר גרסה כדי לשחזר אותה — היא תהפוך לגרסה הנוכחית בכל המכשירים.</p><div class="versions-list">${history.slice(0,30).map((h,i)=>`<div class="version-row"><span class="asset-icon gold">${icon('Repeat',16)}</span><div><b>${timeLabel(h.at)}</b><small>${i===0?'הגרסה הנוכחית בענן':`גרסה ${history.length-i}`}</small></div>${i===0?'':btn('שחזור','cloud-restore:'+h.sha)}</div>`).join('')}</div><div class="form-actions">${btn('סגירה','dialog-close')}</div>`,true);
  }catch(err){closeDialog();toast(err.message,true);}
}
function openEncryptedBackup(){
  showDialog('גיבוי מוצפן',`<form id="backup-form"><div class="form-error"></div><p class="confirm-text">הקובץ יוצפן בסיסמה שתבחר. בלי הסיסמה אי אפשר לפתוח אותו — גם לא אנחנו.</p><div class="form-grid">${field('סיסמה',input('passphrase','','password','required minlength="8" autocomplete="new-password"'))}${field('אימות הסיסמה',input('confirm','','password','required autocomplete="new-password"'))}</div><div class="form-actions">${submit('הורדת גיבוי מוצפן','Download')}${btn('ביטול','dialog-close')}</div></form>`);
}
function openDecryptImport(payload){
  showDialog('פתיחת גיבוי מוצפן',`<form id="decrypt-form"><div class="form-error"></div><p class="confirm-text">הקובץ מוצפן. הזן את הסיסמה שבחרת כשיצרת אותו.</p>${field('סיסמה',input('passphrase','','password','required autocomplete="current-password"'))}<div class="form-actions">${submit('פתיחה','ShieldCheck')}${btn('ביטול','dialog-close')}</div></form>`);
  syncRuntime.pendingImport=payload;
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const [action,...rest]=button.dataset.action.split(':'),a=rest.join(':');
  try{
    if(action==='sync-setup')openSyncSetup();
    else if(action==='sync-now')syncNow('manual');
    else if(action==='sync-choose'&&['pull','push'].includes(a)){closeDialog();syncNow('manual',a);}
    else if(action==='sync-history')openCloudHistory();
    else if(action==='sync-auto'){const st=syncState();saveSyncState({auto:st?.auto===false});syncRuntime.error=null;render();if(st?.auto===false)syncNow('manual');}
    else if(action==='sync-disconnect')confirm('לנתק את המכשיר מהסנכרון?','הטוקן ומפתח ההצפנה יימחקו מהמכשיר הזה. הנתונים במכשיר ובענן נשארים כמו שהם.',()=>{localStorage.removeItem(SYNC_KEY);syncRuntime.error=null;toast('המכשיר נותק מהסנכרון');render();},true);
    else if(action==='version-now'){rememberVersion(data,'שמירה ידנית').then(v=>toast(v?'הגרסה נשמרה':'אין שינויים מאז הגרסה האחרונה'));}
    else if(action==='version-restore'){readVersion(a).then(value=>restoreData(value,`גרסה מ־${timeLabel(syncRuntime.versions?.find(v=>v.id===a)?.at)}`)).catch(err=>toast(err.message,true));}
    else if(action==='cloud-restore'){const st=syncState();gistClient(st.token).revision(st.gistId,a).then(async payload=>restoreData(await decryptJSON(payload.encrypted,await importKey(st.keyJwk)),`גרסה מהענן מ־${timeLabel(payload.updatedAt)}`)).catch(err=>toast(err.message,true));}
    else if(action==='backup-encrypted')openEncryptedBackup();
  }catch(err){toast(err.message,true);}
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!['sync-form','backup-form','decrypt-form'].includes(form.id))return;
  event.preventDefault();
  const fail=err=>{const box=form.querySelector('.form-error');if(box)box.innerHTML=notice(err.message,'error');else toast(err.message,true);};
  try{
    if(form.id==='sync-form'){const pass=new FormData(form).get('passphrase'),c=new FormData(form).get('confirm');if(c&&c!==pass)throw Error('הסיסמאות אינן תואמות.');await connectSync(form);}
    if(form.id==='backup-form'){
      const f=new FormData(form),pass=String(f.get('passphrase')||'');
      if(pass.length<8)throw Error('הסיסמה צריכה להיות באורך 8 תווים לפחות.');
      if(pass!==f.get('confirm'))throw Error('הסיסמאות אינן תואמות.');
      const payload=await encryptWithPassphrase(data,pass);
      download(`ofek-backup-${today()}.ofek`,JSON.stringify(payload));
      closeDialog();commit({...data,lastBackup:new Date().toISOString()},'הגיבוי המוצפן הורד');
    }
    if(form.id==='decrypt-form'){
      const value=await decryptJSON(syncRuntime.pendingImport,String(new FormData(form).get('passphrase')||''));
      syncRuntime.pendingImport=null;closeDialog();
      if(value?.format==='ofek-transactions')throw Error('קובץ תנועות מוצפן אינו נתמך. השתמש בגיבוי מלא.');
      restoreData(value,'הגיבוי המוצפן');
    }
  }catch(err){fail(err);}
});

// Start: a daily safety version, then keep devices in sync while the app is open.
if(typeof setTimeout==='function'&&typeof setInterval==='function'&&typeof document!=='undefined'&&document.addEventListener){
  setTimeout(()=>{
    listVersions().then(list=>{
      syncRuntime.versions=list;
      const last=list[0]?new Date(list[0].at).getTime():0;
      syncRuntime.lastVersionAt=last||null;
      if(Date.now()-last>24*3600e3)rememberVersion(data,'גיבוי יומי אוטומטי');
    }).catch(()=>{});
    if(syncState()?.gistId&&syncState().auto!==false)syncNow('auto');
  },1200);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&syncState()?.gistId&&syncState().auto!==false)syncNow('auto');});
  setInterval(()=>{if(document.visibilityState==='visible'&&syncState()?.gistId&&syncState().auto!==false&&!syncRuntime.busy)syncNow('auto');},90000);
}
