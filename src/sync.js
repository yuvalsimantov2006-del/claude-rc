// Encryption, local version history and end-to-end encrypted sync through the user's own GitHub
// account (a secret gist). The passphrase never leaves the device; GitHub only stores ciphertext,
// and the gist's revision history doubles as cloud version history.

let utf8Encoder=null,utf8Decoder2=null;
const encodeUtf8=text=>(utf8Encoder ||=new TextEncoder()).encode(text);
const decodeUtf8Text=bytes=>(utf8Decoder2 ||=new TextDecoder()).decode(bytes);
export function toBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
export function fromBase64(text){const s=atob(text),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
async function pipe(bytes,stream){return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());}

// Short fingerprint of a JSON string, used to tell whether data changed since the last sync.
export function fingerprint(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);}return `${(h>>>0).toString(16)}-${text.length}`;}

export const KDF_ITERATIONS=310000;
export async function deriveKey(passphrase,salt,iterations=KDF_ITERATIONS){
  const base=await crypto.subtle.importKey('raw',encodeUtf8(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},base,{name:'AES-GCM',length:256},true,['encrypt','decrypt']);
}
export const exportKey=key=>crypto.subtle.exportKey('jwk',key);
export const importKey=jwk=>crypto.subtle.importKey('jwk',jwk,{name:'AES-GCM'},true,['encrypt','decrypt']);
export const newSalt=()=>crypto.getRandomValues(new Uint8Array(16));

export async function encryptJSON(value,key,salt,iterations=KDF_ITERATIONS){
  const iv=crypto.getRandomValues(new Uint8Array(12)),plain=await pipe(encodeUtf8(JSON.stringify(value)),new CompressionStream('gzip'));
  const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));
  return {format:'ofek-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations,compression:'gzip',salt:toBase64(salt),iv:toBase64(iv),data:toBase64(data)};
}
export async function decryptJSON(payload,keyOrPassphrase){
  if(payload?.format!=='ofek-encrypted')throw new Error('הקובץ אינו גיבוי מוצפן של אופק.');
  const key=typeof keyOrPassphrase==='string'?await deriveKey(keyOrPassphrase,fromBase64(payload.salt),payload.iterations):keyOrPassphrase;
  let plain;
  try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(payload.iv)},key,fromBase64(payload.data)));}
  catch{throw new Error('הסיסמה שגויה, או שהקובץ פגום.');}
  if(payload.compression==='gzip')plain=await pipe(plain,new DecompressionStream('gzip'));
  return JSON.parse(decodeUtf8Text(plain));
}
export async function encryptWithPassphrase(value,passphrase){const salt=newSalt();return encryptJSON(value,await deriveKey(passphrase,salt),salt);}

// ---------- Local version history (IndexedDB, with a small localStorage fallback) ----------
const VERSION_DB='ofek-versions',VERSION_STORE='versions',FALLBACK_KEY='ofek-versions-fallback',MAX_VERSIONS=40;
function openVersions(){
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB)return reject(new Error('no indexedDB'));
    const request=indexedDB.open(VERSION_DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(VERSION_STORE,{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
const tx=(db,mode,fn)=>new Promise((resolve,reject)=>{const t=db.transaction(VERSION_STORE,mode),store=t.objectStore(VERSION_STORE),result=fn(store);t.oncomplete=()=>resolve(result?.result??result);t.onerror=()=>reject(t.error);});
export function versionSummary(d){return {transactions:d.transactions.length,assets:d.assets.length,goals:d.goals.length,snapshots:d.snapshots.length,accounts:d.accounts.length};}
export async function saveVersion(d,reason,at=new Date().toISOString()){
  const json=JSON.stringify(d),version={id:`${at.replace(/[^0-9]/g,"")}-${Math.random().toString(36).slice(2,7)}`,at,reason,size:json.length,fingerprint:fingerprint(json),summary:versionSummary(d),json};
  try{
    const db=await openVersions();
    const all=await tx(db,'readonly',store=>store.getAll());
    if(all.length&&all.sort((a,b)=>b.at.localeCompare(a.at))[0].fingerprint===version.fingerprint)return null;
    await tx(db,'readwrite',store=>{store.put(version);for(const old of all.slice(MAX_VERSIONS-1))store.delete(old.id);});
  }catch{
    let list=[];try{list=JSON.parse(localStorage.getItem(FALLBACK_KEY)||'[]');}catch{}
    if(list[0]?.fingerprint===version.fingerprint)return null;
    list=[version,...list].slice(0,5);
    for(;list.length;list.pop()){try{localStorage.setItem(FALLBACK_KEY,JSON.stringify(list));break;}catch{}}
  }
  return version;
}
export async function listVersions(){
  try{const db=await openVersions();return (await tx(db,'readonly',store=>store.getAll())).map(({json,...v})=>v).sort((a,b)=>b.at.localeCompare(a.at));}
  catch{try{return JSON.parse(localStorage.getItem(FALLBACK_KEY)||'[]').map(({json,...v})=>v);}catch{return [];}}
}
export async function readVersion(id){
  let version=null;
  try{const db=await openVersions();version=await tx(db,'readonly',store=>store.get(id));}
  catch{try{version=JSON.parse(localStorage.getItem(FALLBACK_KEY)||'[]').find(v=>v.id===id);}catch{}}
  if(!version)throw new Error('הגרסה לא נמצאה.');
  return JSON.parse(version.json);
}

// ---------- GitHub gist storage ----------
export const SYNC_FILE='ofek-sync.json',SYNC_DESCRIPTION='Ofek — encrypted sync (do not edit)';
export class SyncError extends Error{constructor(message,status){super(message);this.status=status;}}
function syncMessage(status,raw){
  if(status===401)return 'הטוקן של GitHub אינו תקין או שפג תוקפו.';
  if(status===403||status===429)return raw&&/rate limit/i.test(raw)?'GitHub הגביל זמנית את מספר הבקשות. נסה שוב בעוד כמה דקות.':'לטוקן אין הרשאת gist. צור טוקן עם הרשאת gist בלבד.';
  if(status===404)return 'קובץ הסנכרון לא נמצא בחשבון GitHub.';
  if(!status)return 'אין חיבור ל־GitHub. הסנכרון ינסה שוב כשתחזור הרשת.';
  return `שגיאה מ־GitHub (${status}).`;
}
export function gistClient(token,fetchImpl=globalThis.fetch){
  const call=async(path,{method='GET',body}={})=>{
    let res;
    try{res=await fetchImpl(`https://api.github.com${path}`,{method,cache:'no-store',headers:{'Accept':'application/vnd.github+json','Authorization':`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
    catch{throw new SyncError(syncMessage(0),0);}
    if(!res.ok){let raw='';try{raw=(await res.json()).message||'';}catch{}throw new SyncError(syncMessage(res.status,raw),res.status);}
    return res.status===204?null:res.json();
  };
  const content=async gist=>{const file=gist.files?.[SYNC_FILE];if(!file)throw new SyncError(syncMessage(404),404);if(file.truncated&&file.raw_url){const res=await fetchImpl(file.raw_url,{cache:'no-store'});return JSON.parse(await res.text());}return JSON.parse(file.content);};
  return {
    user:()=>call('/user'),
    async find(){for(let page=1;page<=5;page++){const list=await call(`/gists?per_page=100&page=${page}`);const hit=list.find(g=>g.files?.[SYNC_FILE]);if(hit)return hit.id;if(list.length<100)break;}return null;},
    async create(payload){return (await call('/gists',{method:'POST',body:{description:SYNC_DESCRIPTION,public:false,files:{[SYNC_FILE]:{content:JSON.stringify(payload)}}}})).id;},
    async read(id){const gist=await call(`/gists/${id}`);return {payload:await content(gist),history:(gist.history||[]).map(h=>({sha:h.version,at:h.committed_at}))};},
    async write(id,payload){await call(`/gists/${id}`,{method:'PATCH',body:{files:{[SYNC_FILE]:{content:JSON.stringify(payload)}}}});},
    async revision(id,sha){return content(await call(`/gists/${id}/${sha}`));}
  };
}

// What to do on sync, given what changed since the last successful sync. Every push carries a
// revision number and a random nonce: a nonce we did not write means another device wrote (even in
// the same revision, when two devices pushed at once), and an older revision is a stale read.
export const newNonce=()=>toBase64(crypto.getRandomValues(new Uint8Array(9)));
export function syncDecision({localFingerprint,lastFingerprint,remote,lastRev=0,lastNonce=null,localChangedAt}){
  if(!remote?.nonce)return 'push';
  const localChanged=localFingerprint!==lastFingerprint,remoteChanged=remote.nonce!==lastNonce&&(remote.rev||0)>=lastRev;
  if(localChanged&&remoteChanged)return (localChangedAt||'')>(remote.updatedAt||'')?'push-conflict':'pull-conflict';
  if(remoteChanged)return 'pull';
  if(localChanged)return 'push';
  return 'none';
}
