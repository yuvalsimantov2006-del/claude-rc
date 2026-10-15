// App lock 4.1 UI: lock screen, PIN and biometrics setup, auto-lock and the honest wipe (WS-MODULES).
// The lock covers the screen; it does not encrypt the data (the settings card and the setup say so).
import {onModuleHook} from './hooks.js';
import {today} from './finance.js';
import {LOCK_KEY,lockSupported,validPin,hashPin,verifyPin,lockWait,lockFailure,readLock,wipePlan,randomBytes,lkToB64,lkFromB64} from './lock.js';
// Set by the wipe and cleared on a later start once both databases are really gone (an open connection,
// e.g. the service worker's, can block the delete until it closes).
const LOCK_WIPE_KEY='ofek-wipe-pending';
const LOCK_WIPE_WORD='מחיקה';
const lkState={locked:false,view:'pin',entry:'',busy:false,hiddenAt:0,idle:null,idleAt:0,tick:null,bio:null,dialogs:[],wiping:false};
const lkHasDoc=typeof document!=='undefined'&&!!document.addEventListener;
function lkRead(){try{return readLock(localStorage.getItem(LOCK_KEY));}catch{return null;}}
function lkWrite(rec){try{localStorage.setItem(LOCK_KEY,JSON.stringify(rec));}catch{throw Error('השמירה נכשלה. האחסון בדפדפן עשוי להיות מלא או חסום.');}}
function lkWriteQuiet(rec){try{lkWrite(rec);}catch{}}
const lkBioReady=()=>lkState.bio===true;
const lkFinePointer=()=>{try{return matchMedia('(pointer: fine)').matches;}catch{return false;}};

// ---------- Lock and unlock ----------
function lkLock(){
  if(lkState.locked||lkState.wiping||!lkHasDoc||!lkRead())return;
  lkState.locked=true;lkState.view='pin';lkState.entry='';clearTimeout(lkState.idle);
  document.documentElement.classList.add('locked');
  document.querySelector('#root')?.setAttribute('inert','');
  // Open dialogs are closed but kept, so unlocking brings back what was being typed.
  lkState.dialogs=[...document.querySelectorAll('dialog[open]')];
  for(const d of lkState.dialogs)try{d.close();}catch{}
  document.querySelector('.toast')?.remove();
  let el=document.querySelector('#lock-screen');
  if(!el){el=document.createElement('div');el.id='lock-screen';el.className='lk-screen';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','אופק נעולה');document.body.append(el);}
  lkPaint();
}
function lkUnlock(){
  lkState.locked=false;lkState.entry='';lkState.busy=false;clearInterval(lkState.tick);lkState.tick=null;
  document.querySelector('#lock-screen')?.remove();
  document.documentElement.classList.remove('locked');
  document.querySelector('#root')?.removeAttribute('inert');
  for(const d of lkState.dialogs)if(d.isConnected&&!d.open)try{d.showModal();}catch{}
  lkState.dialogs=[];
  lkIdle();
}

// ---------- The lock screen ----------
function lkKey(n){return `<button type="button" class="lk-key" data-lk-key="${n}">${n}</button>`;}
function lkPinView(rec){
  const len=rec.pin.length,bio=!!rec.bio&&typeof PublicKeyCredential!=='undefined'&&lkState.bio!==false;
  const keys=[1,2,3,4,5,6,7,8,9].map(lkKey).join('')
    +(bio?`<button type="button" class="lk-key lk-bio" data-lk-bio aria-label="פתיחה עם טביעת אצבע או זיהוי פנים">${icon('Fingerprint',26)}</button>`:'<span class="lk-key-empty" aria-hidden="true"></span>')
    +lkKey(0)+`<button type="button" class="lk-key lk-del" data-lk-del aria-label="מחיקת ספרה">${icon('ArrowRight',24)}</button>`;
  return `<div class="lk-panel"><div class="lk-brand">${brandMark(56)}</div><h1 tabindex="-1">אופק נעולה</h1><p class="lk-sub">הקלד את הקוד כדי להמשיך.</p>
    <div class="lk-dots" aria-hidden="true">${Array.from({length:len},()=>'<span></span>').join('')}</div>
    <input class="lk-input" type="password" inputmode="numeric" autocomplete="current-password" aria-label="קוד הנעילה" maxlength="${len}" dir="ltr">
    <p class="lk-msg" role="alert"></p><div class="lk-keypad">${keys}</div>
    <button type="button" class="text-button lk-forgot" data-action="lock-forgot">שכחתי את הקוד</button></div>`;
}
function lkForgotView(){
  return `<div class="lk-panel lk-wipe"><span class="asset-icon red lk-wipe-icon">${icon('TriangleAlert',22)}</span><h2 tabindex="-1">שכחת את הקוד?</h2>
    <p>אין דרך לשחזר את הקוד. הוא לא נשמר בשום מקום מלבד המכשיר הזה — גם לא אצלנו. כדי להמשיך צריך למחוק את כל הנתונים של אופק מהמכשיר הזה.</p>
    <ul class="lk-list"><li>הפעלת סנכרון? אחרי המחיקה חבר שוב את אותו טוקן GitHub ואותה סיסמת סנכרון, והנתונים יחזרו מהענן.</li><li>יש לך קובץ גיבוי (.json או .ofek)? אחרי המחיקה ייבא אותו בהגדרות.</li><li>בלי סנכרון ובלי גיבוי — הנתונים יימחקו לצמיתות.</li></ul>
    ${field(`כדי לאשר, הקלד: ${LOCK_WIPE_WORD}`,input('confirmWipe','','text','autocomplete="off" autocapitalize="off" spellcheck="false"'))}
    <div class="lk-actions">${btn('מחיקת כל הנתונים מהמכשיר','lock-wipe','Trash2','danger')}${btn('חזרה לקוד','lock-back')}</div></div>`;
}
function lkPaint(){
  const el=document.querySelector('#lock-screen'),rec=lkRead();if(!el)return;
  if(!rec&&!lkState.wiping){lkUnlock();return;}
  el.innerHTML=lkState.view==='forgot'?lkForgotView():lkPinView(rec);
  if(lkState.view==='forgot'){el.querySelector('[data-action="lock-wipe"]').disabled=true;el.querySelector('[name=confirmWipe]')?.focus();return;}
  lkDots();
  if(!lockSupported()){lkMsg('אי אפשר לבדוק את הקוד בכתובת הזו. פתח את אופק מהכתובת הרגילה שלה.');lkDisable(true);}
  else if(lockWait(rec,Date.now())>0)lkWaitTick();
  // A hardware keyboard types into the hidden field; on touch screens the keypad is used (no system keyboard).
  if(lkFinePointer())el.querySelector('.lk-input')?.focus({preventScroll:true});else el.querySelector('h1')?.focus({preventScroll:true});
}
function lkDots(){const dots=document.querySelectorAll('#lock-screen .lk-dots span');dots.forEach((d,i)=>d.classList.toggle('on',i<lkState.entry.length));const box=document.querySelector('#lock-screen .lk-input');if(box&&box.value!==lkState.entry)box.value=lkState.entry;}
function lkMsg(text){const m=document.querySelector('#lock-screen .lk-msg');if(m&&m.textContent!==text)m.textContent=text;}
function lkDisable(on){for(const b of document.querySelectorAll('#lock-screen .lk-key:not(.lk-bio), #lock-screen .lk-input'))b.disabled=on;document.querySelector('#lock-screen .lk-keypad')?.classList.toggle('waiting',on);}
function lkWaitTick(){
  clearInterval(lkState.tick);lkState.tick=null;
  const step=()=>{
    const ms=lockWait(lkRead(),Date.now());
    if(!lkState.locked||ms<=0){clearInterval(lkState.tick);lkState.tick=null;if(lkState.locked){lkDisable(false);lkMsg('');if(lkFinePointer())document.querySelector('#lock-screen .lk-input')?.focus({preventScroll:true});}return false;}
    lkDisable(true);lkMsg(`יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${Math.ceil(ms/1000)} שניות.`);return true;
  };
  if(step()&&typeof setInterval==='function')lkState.tick=setInterval(step,500);
}
function lkPress(digit){
  const rec=lkRead();if(!rec||lkState.busy||lkState.tick)return;
  if(lkState.entry.length>=rec.pin.length)return;
  lkState.entry+=digit;lkDots();
  if(lkState.entry.length===rec.pin.length)lkSubmit();
}
function lkBack(){if(lkState.busy)return;lkState.entry=lkState.entry.slice(0,-1);lkDots();}
async function lkSubmit(){
  const rec=lkRead();if(!rec){lkUnlock();return;}
  const pin=lkState.entry;if(lkState.busy||pin.length!==rec.pin.length)return;
  if(lockWait(rec,Date.now())>0){lkState.entry='';lkDots();lkWaitTick();return;}
  if(!lockSupported()){lkState.entry='';lkDots();lkMsg('אי אפשר לבדוק את הקוד בכתובת הזו. פתח את אופק מהכתובת הרגילה שלה.');return;}
  lkState.busy=true;document.querySelector('#lock-screen .lk-keypad')?.classList.add('checking');
  let ok=false,failed=false;try{ok=await verifyPin(pin,rec);}catch{failed=true;}
  lkState.busy=false;document.querySelector('#lock-screen .lk-keypad')?.classList.remove('checking');
  if(!lkState.locked)return;
  const cur=lkRead()||rec;
  if(ok){lkWriteQuiet({...cur,failures:0,retryAt:0});lkUnlock();return;}
  lkState.entry='';lkDots();
  if(failed){lkMsg('אי אפשר לבדוק את הקוד בכתובת הזו. פתח את אופק מהכתובת הרגילה שלה.');return;}
  const next=lockFailure(cur,Date.now());lkWriteQuiet(next);
  const dots=document.querySelector('#lock-screen .lk-dots');if(dots){dots.classList.remove('wrong');void dots.offsetWidth;dots.classList.add('wrong');}
  if(lockWait(next,Date.now())>0)lkWaitTick();
  else lkMsg(`הקוד שגוי.${next.failures>=2?` נשארו ${5-next.failures} ניסיונות לפני המתנה.`:''}`);
}

// ---------- Biometrics (WebAuthn platform authenticator; always in addition to the PIN) ----------
async function lkBioCheck(){
  try{lkState.bio=!!(typeof window!=='undefined'&&window.PublicKeyCredential&&await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());}catch{lkState.bio=false;}
  lkRefreshCard();
}
async function lkBioEnable(){
  const cred=await navigator.credentials.create({publicKey:{challenge:randomBytes(32),rp:{name:'אופק'},user:{id:randomBytes(16),name:'ofek',displayName:'אופק'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'discouraged'},timeout:60000}});
  const rec=lkRead();if(!cred?.rawId||!rec)throw Error('no credential');
  lkWrite({...rec,bio:{id:lkToB64(new Uint8Array(cred.rawId)),created:today()}});
}
async function lkBioUnlock(){
  const rec=lkRead();if(!rec?.bio||lkState.busy)return;
  try{
    const cred=await navigator.credentials.get({publicKey:{challenge:randomBytes(32),allowCredentials:[{type:'public-key',id:lkFromB64(rec.bio.id)}],userVerification:'required',timeout:60000}});
    if(!cred?.rawId||lkToB64(new Uint8Array(cred.rawId))!==rec.bio.id)throw Error('unknown credential');
    if(!lkState.locked)return;
    lkWriteQuiet({...(lkRead()||rec),failures:0,retryAt:0});lkUnlock();
  }catch{if(lkState.locked)lkMsg('לא הצלחנו לזהות. הקלד את הקוד.');}
}

// ---------- The honest wipe ----------
function lkDropDb(name){
  return new Promise(resolve=>{
    try{
      if(typeof indexedDB==='undefined')return resolve(true);
      const r=indexedDB.deleteDatabase(name);
      r.onsuccess=()=>resolve(true);r.onerror=()=>resolve(false);r.onblocked=()=>resolve(false);
      setTimeout(()=>resolve(false),1500);
    }catch{resolve(false);}
  });
}
async function lkWipe(){
  if(lkState.wiping)return;lkState.wiping=true;
  for(const b of document.querySelectorAll('#lock-screen button, #lock-screen input'))b.disabled=true;
  let setItem=null;
  try{
    setItem=Storage.prototype.setItem;
    // From here on nothing in this page may write Ofek data back before the reload (a late save, a sync pull).
    Storage.prototype.setItem=function(){};
  }catch{}
  try{for(const k of wipePlan(localStorage).keys)localStorage.removeItem(k);}catch{}
  try{for(const k of wipePlan(sessionStorage).keys)sessionStorage.removeItem(k);}catch{}
  try{setItem?.call(localStorage,LOCK_WIPE_KEY,'1');}catch{}
  const done=await Promise.all(wipePlan([]).databases.map(lkDropDb));
  if(done.every(Boolean))try{localStorage.removeItem(LOCK_WIPE_KEY);}catch{}
  location.reload();
}
// A wipe whose database delete was blocked finishes on the next start.
function lkFinishWipe(){
  let pending=false;try{pending=!!localStorage.getItem(LOCK_WIPE_KEY);}catch{}
  if(!pending)return;
  Promise.all(wipePlan([]).databases.map(lkDropDb)).then(done=>{if(done.every(Boolean))try{localStorage.removeItem(LOCK_WIPE_KEY);}catch{}});
}

// ---------- Auto-lock ----------
function lkIdle(){
  clearTimeout(lkState.idle);lkState.idle=null;lkState.idleAt=Date.now();
  if(lkState.locked||typeof setTimeout!=='function'||!lkHasDoc||document.visibilityState==='hidden')return;
  const rec=lkRead();if(rec&&rec.minutes>0)lkState.idle=setTimeout(lkLock,rec.minutes*60000);
}
function lkActivity(){if(!lkState.locked&&lkState.idle&&Date.now()-lkState.idleAt>1000)lkIdle();}

// ---------- Settings ----------
function lkCard(){
  const rec=lkRead(),on=!!rec;
  let body=notice('הנעילה מסתירה את המסך ממי שמחזיק את המכשיר. היא לא מצפינה את הנתונים: מי שיש לו גישה לקבצי הדפדפן יכול לקרוא אותם. כדי לשמור עליהם — גיבוי מוצפן.');
  if(!on)body+=lockSupported()?`<div class="actions">${btn('הגדרת קוד','lock-setup','KeyRound','primary')}</div>`:notice('הנעילה זמינה רק כשאופק נפתחת בכתובת מאובטחת (https) או מקובץ במכשיר.','warning');
  else{
    const supported=lkBioReady();
    body+=`<div class="lk-minutes">${field('נעילה אוטומטית',select('lockMinutes',[[0,'מיד כשיוצאים מהאפליקציה'],[1,'אחרי דקה'],[5,'אחרי 5 דקות'],[15,'אחרי 15 דקות'],[30,'אחרי 30 דקות']],rec.minutes,'data-lock-minutes'))}</div>`
      +`<div class="notify-list"><label class="notify-row"><span><b>פתיחה עם טביעת אצבע או זיהוי פנים</b><small>${supported?'בנוסף לקוד. הקוד תמיד עובד.':'לא זמין בדפדפן או במכשיר הזה.'}</small></span><input type="checkbox" class="switch" data-lock-bio ${rec.bio?'checked':''} ${supported||rec.bio?'':'disabled'}></label></div>`
      +`<div class="actions">${btn('נעילה עכשיו','lock-now','Lock')}${btn('החלפת קוד','lock-change','KeyRound')}${btn('כיבוי הנעילה','lock-off','','danger')}</div>`;
  }
  return card(head('נעילת האפליקציה','קוד או טביעת אצבע בכל פתיחה של אופק.',on?badge('פעילה','green'):badge('כבויה','neutral'))+body,'lk-card');
}
function lkRefreshCard(){try{const el=lkHasDoc&&document.querySelector('.lk-card');if(el)el.outerHTML=lkCard();}catch{}}
const lkPinField=(name,label,auto)=>field(label,input(name,'','password',`inputmode="numeric" autocomplete="${auto}" pattern="\\d{4,8}" maxlength="8" required dir="ltr"`));
function lkSetupDialog(){
  if(!lockSupported())throw Error('הנעילה זמינה רק כשאופק נפתחת בכתובת מאובטחת (https) או מקובץ במכשיר.');
  showDialog('קוד נעילה',`<form id="lock-form" novalidate><div class="form-error"></div><div class="form-grid">${lkPinField('pin','קוד חדש (4–8 ספרות)','new-password')}${lkPinField('pin2','הקלד שוב','new-password')}</div><label class="check-field lk-ack"><input type="checkbox" name="ack" required>הבנתי: אם אשכח את הקוד, הדרך היחידה להיכנס היא למחוק את הנתונים מהמכשיר ולשחזר מגיבוי או מהסנכרון.</label><div class="form-actions">${submit('הפעלת הנעילה','Lock')}${btn('ביטול','dialog-close')}</div></form>`);
}
function lkChangeDialog(){showDialog('החלפת קוד',`<form id="lock-change-form" novalidate><div class="form-error"></div><div class="form-grid">${lkPinField('current','הקוד הנוכחי','current-password').replace('<label class="field ','<label class="field full ')}${lkPinField('pin','קוד חדש (4–8 ספרות)','new-password')}${lkPinField('pin2','הקלד שוב','new-password')}</div><div class="form-actions">${submit('החלפת הקוד','KeyRound')}${btn('ביטול','dialog-close')}</div></form>`);}
function lkOffDialog(){showDialog('כיבוי הנעילה',`<form id="lock-off-form" novalidate><div class="form-error"></div><p class="confirm-text">כדי לכבות את הנעילה, הקלד את הקוד הנוכחי.</p><div class="form-grid">${lkPinField('current','הקוד הנוכחי','current-password').replace('<label class="field ','<label class="field full ')}</div><div class="form-actions">${submit('כיבוי הנעילה','Lock')}${btn('ביטול','dialog-close')}</div></form>`);}
// The current PIN in the change and turn-off forms counts toward the same back-off as the lock screen.
async function lkCheckCurrent(pin){
  const rec=lkRead();if(!rec)throw Error('הנעילה כבר כבויה.');
  const wait=lockWait(rec,Date.now());
  if(wait>0)throw Error(`יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${Math.ceil(wait/1000)} שניות.`);
  if(await verifyPin(pin,rec)){if(rec.failures)lkWriteQuiet({...rec,failures:0,retryAt:0});return rec;}
  lkWriteQuiet(lockFailure(rec,Date.now()));
  throw Error('הקוד שגוי.');
}
function lkNewPin(f){
  const pin=String(f.get('pin')||''),pin2=String(f.get('pin2')||'');
  if(!validPin(pin))throw Error('הקוד צריך להיות 4 עד 8 ספרות.');
  if(pin!==pin2)throw Error('הקודים אינם תואמים.');
  return pin;
}
async function lkSubmitForm(form){
  const f=new FormData(form),button=form.querySelector('[type=submit]');
  const fail=err=>{const box=form.querySelector('.form-error');if(box)box.innerHTML=notice(err.message,'error');else toast(err.message,true);};
  try{
    if(button)button.disabled=true;
    if(form.id==='lock-form'){
      const pin=lkNewPin(f);
      if(!f.get('ack'))throw Error('צריך לאשר שהבנת שאין שחזור לקוד.');
      lkWrite({v:1,pin:await hashPin(pin),minutes:1,bio:null,failures:0,retryAt:0,created:today()});
      closeDialog();toast('הנעילה הופעלה. אל תשכח את הקוד — אין דרך לשחזר אותו.');
    }else if(form.id==='lock-change-form'){
      const pin=lkNewPin(f),rec=await lkCheckCurrent(String(f.get('current')||''));
      lkWrite({...rec,pin:await hashPin(pin),failures:0,retryAt:0});
      closeDialog();toast('הקוד הוחלף');
    }else if(form.id==='lock-off-form'){
      await lkCheckCurrent(String(f.get('current')||''));
      try{localStorage.removeItem(LOCK_KEY);}catch{}
      closeDialog();toast('הנעילה כובתה');
    }
    lkRefreshCard();lkIdle();
  }catch(err){fail(err);}
  finally{if(button&&button.isConnected)button.disabled=false;}
}

// ---------- Hooks ----------
onModuleHook('boot',()=>{
  lkFinishWipe();
  let raw=null;try{raw=localStorage.getItem(LOCK_KEY);}catch{}
  if(raw!==null&&!readLock(raw)){
    try{localStorage.removeItem(LOCK_KEY);}catch{}
    toast('הגדרות הנעילה נפגמו ולכן הנעילה כובתה. אפשר להגדיר קוד חדש בהגדרות.',true);
  }else if(raw!==null)lkLock();
  lkBioCheck();lkIdle();
});
onModuleHook('locked',()=>lkState.locked||lkState.wiping);
onModuleHook('privateNotifications',()=>!!lkRead());
onModuleHook('settings',()=>lkCard());
onModuleHook('palette',()=>lkRead()
  ?[{icon:'Lock',title:'נעילה עכשיו',sub:'אופק תינעל עד שתקליד את הקוד',run:()=>{closeDialog();lkLock();}}]
  :[{icon:'Lock',title:'נעילת האפליקציה',sub:'קוד או טביעת אצבע בכל פתיחה',run:()=>{closeDialog();navigate('settings');setTimeout(()=>document.querySelector('.lk-card')?.scrollIntoView({block:'start'}),60);}}]);

// ---------- Listeners (guarded: the runtime QA vm has no document) ----------
if(lkHasDoc){
  // While locked no app shortcut runs (Ctrl+K, quick add…): stop every key at the window, then handle the PIN here.
  window.addEventListener('keydown',event=>{
    if(!lkState.locked&&!lkState.wiping)return;
    event.stopPropagation();
    if(event.ctrlKey||event.metaKey||event.altKey||lkState.view!=='pin')return;
    if(event.target?.classList?.contains('lk-input'))return;
    if(/^\d$/.test(event.key)){event.preventDefault();lkPress(event.key);}
    else if(event.key==='Backspace'){event.preventDefault();lkBack();}
  },true);
  document.addEventListener('click',event=>{
    const screen=event.target.closest?.('#lock-screen');
    if(screen){
      const key=event.target.closest('[data-lk-key]');
      if(key){lkPress(key.dataset.lkKey);return;}
      if(event.target.closest('[data-lk-del]')){lkBack();return;}
      if(event.target.closest('[data-lk-bio]')){lkBioUnlock();return;}
    }
    const button=event.target.closest?.('[data-action]');if(!button)return;
    const action=button.dataset.action;
    try{
      if(action==='lock-forgot'){lkState.view='forgot';lkPaint();}
      else if(action==='lock-back'){lkState.view='pin';lkState.entry='';lkPaint();}
      else if(action==='lock-wipe'){const v=document.querySelector('#lock-screen [name=confirmWipe]')?.value.trim();if(v===LOCK_WIPE_WORD)lkWipe();}
      else if(action==='lock-setup')lkSetupDialog();
      else if(action==='lock-change')lkChangeDialog();
      else if(action==='lock-off')lkOffDialog();
      else if(action==='lock-now')lkLock();
    }catch(err){toast(err.message,true);}
  });
  document.addEventListener('input',event=>{
    const el=event.target;
    if(el.classList?.contains('lk-input')&&lkState.locked){
      const rec=lkRead();if(!rec)return;
      if(lkState.busy||lkState.tick){el.value=lkState.entry;return;}
      lkState.entry=el.value.replace(/\D/g,'').slice(0,rec.pin.length);lkDots();
      if(lkState.entry.length===rec.pin.length)lkSubmit();
    }else if(el.name==='confirmWipe'&&el.closest('#lock-screen')){
      const go=document.querySelector('#lock-screen [data-action="lock-wipe"]');if(go)go.disabled=el.value.trim()!==LOCK_WIPE_WORD||lkState.wiping;
    }
  });
  document.addEventListener('change',async event=>{
    const el=event.target;
    if(el.dataset?.lockMinutes!==undefined){const rec=lkRead();if(rec){const minutes=Number(el.value);lkWriteQuiet({...rec,minutes:[0,1,5,15,30].includes(minutes)?minutes:1});lkIdle();}}
    else if(el.dataset?.lockBio!==undefined){
      const rec=lkRead();if(!rec)return;
      if(!el.checked){lkWriteQuiet({...rec,bio:null});lkRefreshCard();return;}
      el.disabled=true;
      try{await lkBioEnable();toast('פתיחה ביומטרית הופעלה');}
      catch{toast('לא הצלחנו להפעיל פתיחה ביומטרית. הקוד עדיין עובד.',true);}
      lkRefreshCard();
    }
  });
  document.addEventListener('submit',event=>{
    const form=event.target;if(!['lock-form','lock-change-form','lock-off-form'].includes(form.id))return;
    event.preventDefault();lkSubmitForm(form);
  });
  document.addEventListener('visibilitychange',()=>{
    const rec=lkRead();if(!rec||lkState.locked)return;
    if(document.visibilityState==='hidden'){lkState.hiddenAt=Date.now();clearTimeout(lkState.idle);lkState.idle=null;if(rec.minutes===0)lkLock();}
    else{const away=lkState.hiddenAt?Date.now()-lkState.hiddenAt:0;lkState.hiddenAt=0;if(away&&away>=rec.minutes*60000)lkLock();else lkIdle();}
  });
  for(const type of ['pointerdown','keydown'])document.addEventListener(type,lkActivity,{capture:true,passive:true});
  // Another tab turned the lock off (it knew the code) or wiped the data.
  window.addEventListener('storage',event=>{
    if(!lkState.locked||(event.key!==LOCK_KEY&&event.key!=='ofek-finance-v1'&&event.key!==null))return;
    let hasData=true;try{hasData=localStorage.getItem('ofek-finance-v1')!==null;}catch{}
    if(!hasData)location.reload();else if(!lkRead())lkUnlock();
  });
}
