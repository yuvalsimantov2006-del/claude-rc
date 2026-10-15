// App lock 4.1: PIN hashing, failure delays, the device-only lock record and the wipe plan (pure; WS-MODULES).
// The lock covers the screen; it does not encrypt anything. No network calls here.
export const LOCK_KEY='ofek-lock-v1';
export const LOCK_ITERATIONS=310000;
export const LOCK_MINUTES=[0,1,5,15,30];
export const LOCK_DBS=['ofek-versions','ofek-notify'];
const LOCK_DELAYS=[0,0,0,0,0,30000,60000,300000,900000,900000];
export const lkToB64=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);};
export const lkFromB64=text=>{const s=atob(text),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;};
const lkBytes=text=>{try{return typeof text==='string'&&text?lkFromB64(text):null;}catch{return null;}};
export const lockSupported=()=>!!globalThis.crypto?.subtle;
export const validPin=pin=>typeof pin==='string'&&/^\d{4,8}$/.test(pin);
export function randomBytes(n){const out=new Uint8Array(n);globalThis.crypto.getRandomValues(out);return out;}
async function lkDerive(pin,salt,iterations){
  const key=await globalThis.crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await globalThis.crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
}
// PBKDF2-SHA-256, 16-byte random salt, 32-byte hash, all base64. Returns the `pin` part of the lock record.
export async function hashPin(pin,iterations=LOCK_ITERATIONS){
  if(!validPin(pin))throw Error('הקוד צריך להיות 4 עד 8 ספרות.');
  const salt=randomBytes(16);
  return {salt:lkToB64(salt),iterations,hash:lkToB64(await lkDerive(pin,salt,iterations)),length:pin.length};
}
// Constant-time compare of the derived hash with the stored one.
export async function verifyPin(pin,rec){
  const p=rec?.pin||rec;if(!validPin(pin)||!p)return false;
  const salt=lkBytes(p.salt),want=lkBytes(p.hash);if(!salt||!want||!(p.iterations>0))return false;
  const got=await lkDerive(pin,salt,p.iterations);
  let diff=got.length^want.length;for(let i=0;i<Math.max(got.length,want.length);i++)diff|=(got[i]??0)^(want[i]??0);
  return diff===0;
}
// Wait (ms) after the `failures`-th wrong PIN in a row: free tries, then 30 s, 1, 5 and 15 minutes (the cap).
export const lockDelay=failures=>LOCK_DELAYS[Math.min(Math.max(0,Math.floor(Number(failures)||0)),LOCK_DELAYS.length-1)];
// Milliseconds left before the next try. Capped at the longest delay, so a clock that jumped back cannot extend it.
export const lockWait=(rec,nowMs)=>Math.min(LOCK_DELAYS.at(-1),Math.max(0,(Number(rec?.retryAt)||0)-nowMs));
// The record after one more wrong PIN.
export function lockFailure(rec,nowMs){const failures=(rec.failures||0)+1;return {...rec,failures,retryAt:nowMs+lockDelay(failures)};}
const lkInt=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
// The device-only record. Lenient: anything without a usable PIN hash is no lock (null), so a damaged record
// fails open (the lock is a screen cover, not encryption). Other damaged fields fall back to safe defaults.
export function readLock(raw){
  let v=raw;
  if(typeof v==='string'){try{v=JSON.parse(v);}catch{return null;}}
  if(!v||typeof v!=='object'||Array.isArray(v)||v.v!==1)return null;
  const p=v.pin;
  if(!p||typeof p!=='object'||!lkInt(p.iterations,1000,10000000)||!lkInt(p.length,4,8))return null;
  const salt=lkBytes(p.salt),hash=lkBytes(p.hash);
  if(!salt||salt.length<8||!hash||hash.length!==32)return null;
  const bio=v.bio&&typeof v.bio==='object'&&typeof v.bio.id==='string'&&lkBytes(v.bio.id)?{id:v.bio.id,created:typeof v.bio.created==='string'?v.bio.created:''}:null;
  return {v:1,pin:{salt:p.salt,iterations:p.iterations,hash:p.hash,length:p.length},
    minutes:LOCK_MINUTES.includes(v.minutes)?v.minutes:1,bio,
    failures:lkInt(v.failures,0,1e6)?v.failures:0,retryAt:Number.isFinite(v.retryAt)&&v.retryAt>0?v.retryAt:0,
    created:typeof v.created==='string'?v.created:''};
}
// What "שכחתי את הקוד" removes: every localStorage key that starts with ofek- (today's keys and any added later),
// plus both IndexedDB databases. `storage` is a key list or a Storage object.
export function wipePlan(storage){
  let keys=[];
  if(Array.isArray(storage))keys=storage;
  else if(storage&&typeof storage.length==='number'&&typeof storage.key==='function')for(let i=0;i<storage.length;i++)keys.push(storage.key(i));
  return {keys:keys.filter(k=>typeof k==='string'&&k.startsWith('ofek-')),databases:[...LOCK_DBS]};
}
