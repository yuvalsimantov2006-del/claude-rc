// נועה — privacy: an optional PIN lock (4–6 digits; only a PBKDF2 hash is kept, never the PIN), biometrics through
// WebAuthn (always in addition to the PIN), auto-lock after N minutes away, and "הסתרת תוכן" — the app blurs itself
// while it is in the background, so the app switcher never shows the surprise gift list. The lock covers the screen;
// it does not encrypt the data (the settings card says so). Device-only record: localStorage 'noa-lock-v1'.
// Pure helpers first (tested in lock.test.js), then the page part. Private helpers are prefixed "lk".
export const LOCK_KEY='noa-lock-v1';
export const LOCK_ITERATIONS=210000;
export const LOCK_MINUTES=[0,1,5,15,30];
const LK_DELAYS=[0,0,0,0,0,30000,60000,300000,900000,900000];
export const lkToB64=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);};
export const lkFromB64=text=>{const s=atob(text),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;};
const lkBytes=text=>{try{return typeof text==='string'&&text?lkFromB64(text):null;}catch{return null;}};
export const lockSupported=()=>!!globalThis.crypto?.subtle;
export const validPin=pin=>typeof pin==='string'&&/^\d{4,6}$/.test(pin);
export function lkRandom(n){const out=new Uint8Array(n);globalThis.crypto.getRandomValues(out);return out;}
async function lkDerive(pin,salt,iterations){
  const key=await globalThis.crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await globalThis.crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
}
// PBKDF2-SHA-256, 16-byte random salt, 32-byte hash, base64. Returns the `pin` part of the lock record.
export async function hashPin(pin,iterations=LOCK_ITERATIONS){
  if(!validPin(pin))throw new Error('הקוד צריך להיות 4 עד 6 ספרות.');
  const salt=lkRandom(16);
  return {salt:lkToB64(salt),iterations,hash:lkToB64(await lkDerive(pin,salt,iterations)),length:pin.length};
}
// Constant-time comparison of the derived hash with the stored one.
export async function verifyPin(pin,rec){
  const p=rec?.pin||rec;if(!validPin(pin)||!p)return false;
  const salt=lkBytes(p.salt),want=lkBytes(p.hash);if(!salt||!want||!(p.iterations>0))return false;
  const got=await lkDerive(pin,salt,p.iterations);
  let diff=got.length^want.length;for(let i=0;i<Math.max(got.length,want.length);i++)diff|=(got[i]??0)^(want[i]??0);
  return diff===0;
}
// The wait after the n-th wrong PIN in a row: five free tries, then 30 s, 1, 5 and 15 minutes (the cap).
export const lockDelay=failures=>LK_DELAYS[Math.min(Math.max(0,Math.floor(Number(failures)||0)),LK_DELAYS.length-1)];
export const lockWait=(rec,nowMs)=>Math.min(LK_DELAYS.at(-1),Math.max(0,(Number(rec?.retryAt)||0)-nowMs));
export function lockFailure(rec,nowMs){const failures=(rec.failures||0)+1;return {...rec,failures,retryAt:nowMs+lockDelay(failures)};}
const lkInt=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
// The device record, read leniently: anything without a usable PIN hash is "no lock" (null) — the lock is a screen
// cover, not encryption, so a damaged record fails open. Damaged optional fields fall back to safe defaults.
export function readLock(raw){
  let v=raw;
  if(typeof v==='string'){try{v=JSON.parse(v);}catch{return null;}}
  if(!v||typeof v!=='object'||Array.isArray(v)||v.v!==1)return null;
  const p=v.pin;
  if(!p||typeof p!=='object'||!lkInt(p.iterations,1000,10000000)||!lkInt(p.length,4,6))return null;
  const salt=lkBytes(p.salt),hash=lkBytes(p.hash);
  if(!salt||salt.length<8||!hash||hash.length!==32)return null;
  const bio=v.bio&&typeof v.bio==='object'&&typeof v.bio.id==='string'&&lkBytes(v.bio.id)?{id:v.bio.id,created:typeof v.bio.created==='string'?v.bio.created:''}:null;
  return {v:1,pin:{salt:p.salt,iterations:p.iterations,hash:p.hash,length:p.length},
    minutes:LOCK_MINUTES.includes(v.minutes)?v.minutes:1,bio,veil:v.veil!==false,
    failures:lkInt(v.failures,0,1e6)?v.failures:0,retryAt:Number.isFinite(v.retryAt)&&v.retryAt>0?v.retryAt:0,
    created:typeof v.created==='string'?v.created:''};
}
// What "שכחתי את הקוד" removes: every localStorage key of this app ('noa-…', never another app's keys on the same
// site) and the photos database. `storage` is a key list or a Storage object.
export function wipePlan(storage){
  let keys=[];
  if(Array.isArray(storage))keys=storage;
  else if(storage&&typeof storage.length==='number'&&typeof storage.key==='function')for(let i=0;i<storage.length;i++)keys.push(storage.key(i));
  return {keys:keys.filter(k=>typeof k==='string'&&k.startsWith('noa-')),databases:['noa-photos']};
}
// The background veil without a PIN: a device preference (default on) kept in 'noa-veil'.
export const VEIL_KEY='noa-veil';

// ---------- In the page ----------
const lkState={locked:false,entry:'',busy:false,view:'pin',hiddenAt:0,idle:null,idleAt:0,tick:null,bio:null,el:null,wiping:false};
const lkHasDom=typeof document!=='undefined'&&!!document.addEventListener;
function lkRead(){try{return readLock(localStorage.getItem(LOCK_KEY));}catch{return null;}}
function lkWrite(rec){try{localStorage.setItem(LOCK_KEY,JSON.stringify(rec));}catch{throw new Error('השמירה נכשלה: האחסון בדפדפן מלא או חסום.');}}
function lkQuiet(rec){try{lkWrite(rec);}catch{}}
function lockEnabled(){return !!lkRead();}
function isLocked(){return lkState.locked||lkState.wiping;}
function veilEnabled(){const rec=lkRead();if(rec)return rec.veil!==false;try{return localStorage.getItem(VEIL_KEY)!=='off';}catch{return true;}}
function lkFine(){try{return matchMedia('(pointer: fine)').matches;}catch{return false;}}

function lockNow(){
  if(lkState.locked||!lkHasDom||!lkRead())return;
  lkState.locked=true;lkState.view='pin';lkState.entry='';clearTimeout(lkState.idle);
  document.documentElement.classList.add('locked');
  document.querySelector('.toast')?.remove();
  const el=document.createElement('dialog');el.className='lock-screen';el.setAttribute('aria-label',`${herName()} נעולה`);
  el.addEventListener('cancel',e=>e.preventDefault());
  document.body.append(el);lkState.el=el;
  try{el.showModal();}catch{el.setAttribute('open','');}
  document.getElementById('root')?.setAttribute('inert','');
  document.documentElement.classList.remove('lock-pending');
  lkPaint();
}
function lkUnlock(){
  lkState.locked=false;lkState.entry='';lkState.busy=false;clearInterval(lkState.tick);lkState.tick=null;
  try{lkState.el?.close();}catch{}lkState.el?.remove();lkState.el=null;
  document.documentElement.classList.remove('locked','lock-pending');
  document.getElementById('root')?.removeAttribute('inert');
  lkIdle();
}
function lkKey(n){return `<button type="button" class="lk-key" data-lk-key="${n}">${n}</button>`;}
function lkPinView(rec){
  const len=rec.pin.length,bio=!!rec.bio&&typeof PublicKeyCredential!=='undefined'&&lkState.bio!==false;
  const keys=[1,2,3,4,5,6,7,8,9].map(lkKey).join('')
    +(bio?`<button type="button" class="lk-key lk-bio" data-lk-bio aria-label="פתיחה עם טביעת אצבע או זיהוי פנים">${icon('Fingerprint',26)}</button>`:'<span class="lk-key-empty" aria-hidden="true"></span>')
    +lkKey(0)+`<button type="button" class="lk-key lk-del" data-lk-del aria-label="מחיקת ספרה">${icon('ArrowRight',24)}</button>`;
  return `<div class="lk-panel"><div class="lk-mark">${brandMark(64)}</div><h1 tabindex="-1">שלום 💛</h1><p class="lk-sub">הקלד את הקוד כדי לפתוח.</p>
    <div class="lk-dots" aria-hidden="true">${Array.from({length:len},()=>'<span></span>').join('')}</div>
    <input class="lk-input" type="password" inputmode="numeric" autocomplete="current-password" aria-label="קוד הנעילה" maxlength="${len}" dir="ltr">
    <p class="lk-msg" role="alert"></p><div class="lk-keypad">${keys}</div>
    <button type="button" class="text-btn lk-forgot" data-lk-forgot>שכחתי את הקוד</button></div>`;
}
function lkForgotView(){
  return `<div class="lk-panel lk-wipe"><span class="icon-tile tone-danger" data-big>${icon('TriangleAlert',24)}</span><h2 tabindex="-1">שכחת את הקוד?</h2>
    <p>אין דרך לשחזר אותו — הוא לא נשמר בשום מקום, רק החותמת שלו במכשיר הזה. כדי להמשיך צריך למחוק מהמכשיר את כל הנתונים של האפליקציה, ואז לשחזר מגיבוי אם יש לך.</p>
    <label class="field full"><span class="field-label">כדי לאשר, הקלד: מחיקה</span><input type="text" name="lkWipeWord" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <div class="lk-actions">${button('מחיקת הכול מהמכשיר','',{variant:'danger-solid',icon:'Trash2',attrs:'data-lk-wipe disabled'})}${button('חזרה לקוד','',{attrs:'data-lk-back'})}</div></div>`;
}
function lkPaint(){
  const el=lkState.el,rec=lkRead();if(!el)return;
  if(!rec&&!lkState.wiping){lkUnlock();return;}
  el.innerHTML=lkState.view==='forgot'?lkForgotView():lkPinView(rec);
  if(lkState.view==='forgot'){el.querySelector('[name=lkWipeWord]')?.focus();return;}
  lkDots();
  if(!lockSupported()){lkMsg('אי אפשר לבדוק את הקוד בכתובת הזו. פתח את האפליקציה מהכתובת הרגילה שלה.');lkDisable(true);}
  else if(lockWait(rec,Date.now())>0)lkWaitTick();
  if(lkFine())el.querySelector('.lk-input')?.focus({preventScroll:true});else el.querySelector('h1')?.focus({preventScroll:true});
}
function lkDots(){const el=lkState.el;if(!el)return;el.querySelectorAll('.lk-dots span').forEach((d,i)=>d.classList.toggle('on',i<lkState.entry.length));const box=el.querySelector('.lk-input');if(box&&box.value!==lkState.entry)box.value=lkState.entry;}
function lkMsg(text){const m=lkState.el?.querySelector('.lk-msg');if(m&&m.textContent!==text)m.textContent=text;}
function lkDisable(on){for(const b of lkState.el?.querySelectorAll('.lk-key:not(.lk-bio), .lk-input')||[])b.disabled=on;lkState.el?.querySelector('.lk-keypad')?.classList.toggle('waiting',on);}
function lkWaitTick(){
  clearInterval(lkState.tick);lkState.tick=null;
  const step=()=>{
    const ms=lockWait(lkRead(),Date.now());
    if(!lkState.locked||ms<=0){clearInterval(lkState.tick);lkState.tick=null;if(lkState.locked){lkDisable(false);lkMsg('');}return false;}
    lkDisable(true);lkMsg(`יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${Math.ceil(ms/1000)} שניות.`);return true;
  };
  if(step())lkState.tick=setInterval(step,500);
}
function lkPress(d){const rec=lkRead();if(!rec||lkState.busy||lkState.tick||lkState.entry.length>=rec.pin.length)return;lkState.entry+=d;lkDots();if(lkState.entry.length===rec.pin.length)lkSubmit();}
function lkBack(){if(lkState.busy)return;lkState.entry=lkState.entry.slice(0,-1);lkDots();}
async function lkSubmit(){
  const rec=lkRead();if(!rec){lkUnlock();return;}
  const pin=lkState.entry;if(lkState.busy||pin.length!==rec.pin.length)return;
  if(lockWait(rec,Date.now())>0){lkState.entry='';lkDots();lkWaitTick();return;}
  lkState.busy=true;lkState.el?.querySelector('.lk-keypad')?.classList.add('checking');
  let ok=false,failed=false;try{ok=await verifyPin(pin,rec);}catch{failed=true;}
  lkState.busy=false;lkState.el?.querySelector('.lk-keypad')?.classList.remove('checking');
  if(!lkState.locked)return;
  const cur=lkRead()||rec;
  if(ok){lkQuiet({...cur,failures:0,retryAt:0});lkUnlock();return;}
  lkState.entry='';lkDots();
  if(failed){lkMsg('אי אפשר לבדוק את הקוד בכתובת הזו.');return;}
  const next=lockFailure(cur,Date.now());lkQuiet(next);
  const dots=lkState.el?.querySelector('.lk-dots');if(dots){dots.classList.remove('wrong');void dots.offsetWidth;dots.classList.add('wrong');}
  if(lockWait(next,Date.now())>0)lkWaitTick();
  else lkMsg(`הקוד שגוי.${next.failures>=2?` נשארו ${5-next.failures} ניסיונות לפני המתנה.`:''}`);
}
// Biometrics: a WebAuthn platform credential, used only as "the person holding the phone is its owner".
async function lkBioCheck(){
  try{lkState.bio=!!(window.PublicKeyCredential&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());}catch{lkState.bio=false;}
}
async function lkBioEnable(){
  const cred=await navigator.credentials.create({publicKey:{challenge:lkRandom(32),rp:{name:herName()},user:{id:lkRandom(16),name:'noa',displayName:herName()},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'discouraged'},timeout:60000}});
  const rec=lkRead();if(!cred?.rawId||!rec)throw new Error('no credential');
  lkWrite({...rec,bio:{id:lkToB64(new Uint8Array(cred.rawId)),created:todayISO()}});
}
async function lkBioUnlock(){
  const rec=lkRead();if(!rec?.bio||lkState.busy)return;
  try{
    const cred=await navigator.credentials.get({publicKey:{challenge:lkRandom(32),allowCredentials:[{type:'public-key',id:lkFromB64(rec.bio.id)}],userVerification:'required',timeout:60000}});
    if(!cred?.rawId||lkToB64(new Uint8Array(cred.rawId))!==rec.bio.id)throw new Error('unknown');
    if(lkState.locked){lkQuiet({...(lkRead()||rec),failures:0,retryAt:0});lkUnlock();}
  }catch{if(lkState.locked)lkMsg('לא הצלחנו לזהות. הקלד את הקוד.');}
}
function lkDropDb(name){return new Promise(resolve=>{try{const r=indexedDB.deleteDatabase(name);r.onsuccess=()=>resolve(true);r.onerror=()=>resolve(false);r.onblocked=()=>resolve(false);setTimeout(()=>resolve(false),1500);}catch{resolve(false);}});}
// Remove every 'noa-' key and the photos (never another app's keys), then start fresh.
async function wipeEverything(){
  lkState.wiping=true;
  let setItem=null;try{setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){};}catch{}
  try{for(const k of wipePlan(localStorage).keys)localStorage.removeItem(k);}catch{}
  try{for(const k of wipePlan(sessionStorage).keys)sessionStorage.removeItem(k);}catch{}
  try{phDbPromise?.then(db=>db.close()).catch(()=>{});}catch{}
  await Promise.all(wipePlan([]).databases.map(lkDropDb));
  if(setItem)try{Storage.prototype.setItem=setItem;}catch{}
  location.replace(location.pathname+location.search);
}
// Auto-lock: after N idle minutes in the foreground, or N minutes away (0 = the moment he leaves the app).
function lkIdle(){
  clearTimeout(lkState.idle);lkState.idle=null;lkState.idleAt=Date.now();
  if(lkState.locked||!lkHasDom||document.visibilityState==='hidden')return;
  const rec=lkRead();if(rec&&rec.minutes>0)lkState.idle=setTimeout(lockNow,rec.minutes*60000);
}
function lkActivity(){if(!lkState.locked&&lkState.idle&&Date.now()-lkState.idleAt>1000)lkIdle();}
function lkVeil(on){document.documentElement.classList.toggle('veiled',on&&veilEnabled());}

// ---------- Settings card and forms ----------
function lockCard(){
  const rec=lkRead(),on=!!rec;
  const veil=veilEnabled();
  let body=`<div class="setting-rows"><label class="switch-row"><span><b>הסתרת תוכן ברקע</b><small>כשעוברים לאפליקציה אחרת, המסך מטושטש — גם בתצוגת האפליקציות האחרונות.</small></span><input type="checkbox" class="switch" data-change="lock-veil" ${veil?'checked':''}></label></div>`;
  if(!on)body+=lockSupported()?`<p class="card-note">קוד של 4–6 ספרות בכל פתיחה. נשמרת רק "חותמת" של הקוד, אף פעם לא הקוד עצמו.</p><div class="card-actions">${button('הגדרת קוד נעילה','lock-setup',{icon:'KeyRound',variant:'primary'})}</div>`:notice('הנעילה זמינה כשהאפליקציה נפתחת בכתובת מאובטחת (https) או מקובץ במכשיר.',{tone:'warning'});
  else{
    body+=`<div class="setting-rows"><label class="select-row"><span><b>נעילה אוטומטית</b><small>אחרי כמה זמן בלי שימוש</small></span><select data-change="lock-minutes" aria-label="נעילה אוטומטית">${[[0,'מיד כשיוצאים'],[1,'אחרי דקה'],[5,'אחרי 5 דקות'],[15,'אחרי 15 דקות'],[30,'אחרי 30 דקות']].map(([v,l])=>`<option value="${v}"${rec.minutes===v?' selected':''}>${l}</option>`).join('')}</select></label>
      <label class="switch-row"><span><b>טביעת אצבע או זיהוי פנים</b><small>${lkState.bio?'בנוסף לקוד. הקוד תמיד עובד.':'לא זמין בדפדפן או במכשיר הזה.'}</small></span><input type="checkbox" class="switch" data-change="lock-bio" ${rec.bio?'checked':''} ${lkState.bio||rec.bio?'':'disabled'}></label></div>
      <div class="card-actions">${button('נעילה עכשיו','lock-now',{icon:'Lock'})}${button('החלפת קוד','lock-change',{icon:'KeyRound'})}${button('כיבוי הנעילה','lock-off',{variant:'danger'})}</div>`;
  }
  body+=`<p class="card-note subtle">${icon('Info',14)} הנעילה מסתירה את המסך ממי שמחזיק את הטלפון. היא לא מצפינה את הנתונים.</p>`;
  return card(body,{title:'פרטיות ונעילה',sub:'כי היא עלולה להרים את הטלפון — ורשימת המתנות היא הפתעה 🤫',icon:'Lock',tone:'3',cls:'lock-card',actions:on?badge('פעילה','positive',{icon:'Check'}):badge('כבויה','neutral')});
}
function lkRefreshCard(){const el=document.querySelector('.lock-card');if(el)el.outerHTML=lockCard();}
const lkPinField=(name,label)=>({name,label,type:'text',inputmode:'numeric',dir:'ltr',required:true,maxLength:6,autocomplete:'off',validate:v=>validPin(v)?null:'4 עד 6 ספרות'});
function lkSetupForm(){
  if(!lockSupported())throw new Error('הנעילה זמינה רק בכתובת מאובטחת (https) או מקובץ במכשיר.');
  openForm({title:'קוד נעילה',intro:'בחר קוד של 4–6 ספרות. אם תשכח אותו, הדרך היחידה להיכנס היא למחוק את הנתונים מהמכשיר ולשחזר מגיבוי.',submitLabel:'הפעלת הנעילה',submitIcon:'Lock',
    fields:[{...lkPinField('pin','קוד חדש'),type:'password'},{...lkPinField('pin2','שוב, לאישור'),type:'password',validate:(v,vals)=>v!==vals.pin?'הקודים לא תואמים':null},{name:'ack',type:'switch',label:'הבנתי שאין שחזור לקוד',required:true,requiredMessage:'צריך לאשר'}],
    onSubmit:async v=>{lkWrite({v:1,pin:await hashPin(v.pin),minutes:1,bio:null,veil:veilEnabled(),failures:0,retryAt:0,created:todayISO()});toast('הנעילה הופעלה. שמור את הקוד בראש 🔒');lkRefreshCard();lkIdle();renderApp();}});
}
async function lkCheckCurrent(pin){
  const rec=lkRead();if(!rec)throw new Error('הנעילה כבר כבויה.');
  const wait=lockWait(rec,Date.now());if(wait>0)throw new Error(`יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${Math.ceil(wait/1000)} שניות.`);
  if(await verifyPin(pin,rec)){if(rec.failures)lkQuiet({...rec,failures:0,retryAt:0});return rec;}
  lkQuiet(lockFailure(rec,Date.now()));throw new Error('הקוד הנוכחי שגוי.');
}
function lkChangeForm(){
  openForm({title:'החלפת קוד',submitLabel:'החלפה',submitIcon:'KeyRound',fields:[{...lkPinField('current','הקוד הנוכחי'),type:'password',full:true},{...lkPinField('pin','קוד חדש'),type:'password'},{...lkPinField('pin2','שוב, לאישור'),type:'password',validate:(v,vals)=>v!==vals.pin?'הקודים לא תואמים':null}],
    onSubmit:async v=>{const rec=await lkCheckCurrent(v.current);lkWrite({...rec,pin:await hashPin(v.pin),failures:0,retryAt:0});toast('הקוד הוחלף');lkRefreshCard();}});
}
function lkOffForm(){
  openForm({title:'כיבוי הנעילה',intro:'כדי לכבות, הקלד את הקוד הנוכחי.',submitLabel:'כיבוי',submitIcon:'LockOpen',fields:[{...lkPinField('current','הקוד הנוכחי'),type:'password',full:true}],
    onSubmit:async v=>{const rec=await lkCheckCurrent(v.current);try{localStorage.removeItem(LOCK_KEY);localStorage.setItem(VEIL_KEY,rec.veil===false?'off':'on');}catch{}toast('הנעילה כובתה');lkRefreshCard();renderApp();}});
}

if(lkHasDom){
  onAction('lock-now',()=>lockNow());
  onAction('lock-setup',()=>lkSetupForm());
  onAction('lock-change',()=>lkChangeForm());
  onAction('lock-off',()=>lkOffForm());
  onChange('lock-minutes',v=>{const rec=lkRead();if(rec){const m=Number(v);lkQuiet({...rec,minutes:LOCK_MINUTES.includes(m)?m:1});lkIdle();toast('נשמר');}});
  onChange('lock-veil',on=>{const rec=lkRead();if(rec)lkQuiet({...rec,veil:!!on});else try{localStorage.setItem(VEIL_KEY,on?'on':'off');}catch{}toast(on?'התוכן יוסתר ברקע':'התוכן לא יוסתר ברקע');});
  onChange('lock-bio',async(on,el)=>{
    const rec=lkRead();if(!rec)return;
    if(!on){lkQuiet({...rec,bio:null});lkRefreshCard();return;}
    el.disabled=true;
    try{await lkBioEnable();toast('פתיחה ביומטרית הופעלה');}catch{toast('לא הצלחנו להפעיל פתיחה ביומטרית. הקוד עדיין עובד.',{error:true});}
    lkRefreshCard();
  });
  // While locked, keys go only to the keypad (no shortcuts behind it).
  window.addEventListener('keydown',event=>{
    if(!lkState.locked)return;
    event.stopPropagation();
    if(event.ctrlKey||event.metaKey||event.altKey||lkState.view!=='pin'||event.target?.classList?.contains('lk-input'))return;
    if(/^\d$/.test(event.key)){event.preventDefault();lkPress(event.key);}
    else if(event.key==='Backspace'){event.preventDefault();lkBack();}
  },true);
  document.addEventListener('click',event=>{
    const screen=event.target.closest?.('.lock-screen');if(!screen)return;
    const k=event.target.closest('[data-lk-key]');if(k){lkPress(k.dataset.lkKey);return;}
    if(event.target.closest('[data-lk-del]')){lkBack();return;}
    if(event.target.closest('[data-lk-bio]')){lkBioUnlock();return;}
    if(event.target.closest('[data-lk-forgot]')){lkState.view='forgot';lkPaint();return;}
    if(event.target.closest('[data-lk-back]')){lkState.view='pin';lkState.entry='';lkPaint();return;}
    if(event.target.closest('[data-lk-wipe]')){const v=screen.querySelector('[name=lkWipeWord]')?.value.trim();if(v==='מחיקה')wipeEverything();}
  });
  document.addEventListener('input',event=>{
    const el=event.target;if(!el.closest?.('.lock-screen'))return;
    if(el.classList.contains('lk-input')){const rec=lkRead();if(!rec)return;if(lkState.busy||lkState.tick){el.value=lkState.entry;return;}lkState.entry=el.value.replace(/\D/g,'').slice(0,rec.pin.length);lkDots();if(lkState.entry.length===rec.pin.length)lkSubmit();}
    else if(el.name==='lkWipeWord'){const b=lkState.el?.querySelector('[data-lk-wipe]');if(b)b.disabled=el.value.trim()!=='מחיקה';}
  });
  document.addEventListener('visibilitychange',()=>{
    const hidden=document.visibilityState==='hidden';
    lkVeil(hidden);
    const rec=lkRead();if(!rec||lkState.locked)return;
    if(hidden){lkState.hiddenAt=Date.now();clearTimeout(lkState.idle);lkState.idle=null;if(rec.minutes===0)lockNow();}
    else{const away=lkState.hiddenAt?Date.now()-lkState.hiddenAt:0;lkState.hiddenAt=0;if(away&&away>=rec.minutes*60000)lockNow();else lkIdle();}
  });
  window.addEventListener('pagehide',()=>lkVeil(true));
  window.addEventListener('pageshow',()=>lkVeil(false));
  window.addEventListener('focus',()=>lkVeil(false));
  for(const type of ['pointerdown','keydown'])document.addEventListener(type,lkActivity,{capture:true,passive:true});
  // Another tab turned the lock off, or wiped everything.
  window.addEventListener('storage',event=>{if(!lkState.locked)return;if(event.key===LOCK_KEY&&!lkRead())lkUnlock();if(event.key===null)location.reload();});
}
// Called once at boot (app.js): lock right away when a PIN is set; clear a damaged record (failing open, with a word).
function lockBoot(){
  let raw=null;try{raw=localStorage.getItem(LOCK_KEY);}catch{}
  if(raw!==null&&!readLock(raw)){try{localStorage.removeItem(LOCK_KEY);}catch{}document.documentElement.classList.remove('lock-pending');toast('הגדרות הנעילה נפגמו ולכן הנעילה כובתה. אפשר להגדיר קוד חדש בהגדרות.',{error:true});}
  else if(raw!==null)lockNow();
  lkBioCheck();lkIdle();
}
