// נועה — photos, on this device only: IndexedDB database 'noa-photos', store 'photos', key = photo id.
// Each record: {id, full: Blob (JPEG, longest side ≤ 1600px, ~0.82 quality), thumb: Blob (≤ 400px), w, h, created}.
// The data (localStorage) only holds the ids (memories[].photos, profile.photo). Deleting an item never deletes its
// photos right away (undo must bring them back): gcPhotos() removes photos nothing refers to — not the current data,
// not the previous save — a while after the app starts.
//   putPhoto(file|blob) → Promise<id>      getPhoto(id) / getThumb(id) → Promise<Blob|null>
//   deletePhoto(id)                        photoURL(id,'thumb'|'full') → Promise<objectURL|null> (cached)
//   photoImg(id,{size,alt,cls}) → '<img …>' filled in by hydratePhotos(root) (the shell calls it after each render)
//   exportPhotos(ids) → {id:{full:dataURL, thumb:dataURL, w, h}}   importPhotos(map)   allPhotoIds()
export const PHOTO_DB='noa-photos';
export const PHOTO_STORE='photos';
export const PHOTO_MAX=1600;
export const PHOTO_THUMB=400;
let phDbPromise=null;
const phUrls=new Map();
function photoDb(){
  if(phDbPromise)return phDbPromise;
  phDbPromise=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('הדפדפן הזה לא שומר תמונות.'));return;}
    const req=indexedDB.open(PHOTO_DB,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(PHOTO_STORE))db.createObjectStore(PHOTO_STORE,{keyPath:'id'});};
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();phDbPromise=null;};resolve(db);};
    req.onerror=()=>reject(new Error('אי אפשר לפתוח את אחסון התמונות במכשיר.'));
    req.onblocked=()=>reject(new Error('אחסון התמונות תפוס. סגור לשוניות אחרות של האפליקציה ונסה שוב.'));
  }).catch(err=>{phDbPromise=null;throw err;});
  return phDbPromise;
}
function phTx(mode,fn){
  return photoDb().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(PHOTO_STORE,mode),st=tx.objectStore(PHOTO_STORE);let out;
    const r=fn(st);if(r)r.onsuccess=()=>{out=r.result;};
    tx.oncomplete=()=>resolve(out);
    tx.onerror=()=>reject(tx.error?.name==='QuotaExceededError'?new Error('אין מספיק מקום במכשיר לשמירת התמונה.'):new Error('שמירת התמונה נכשלה.'));
    tx.onabort=tx.onerror;
  }));
}
// Decode (EXIF orientation respected), scale so the longest side ≤ max, encode JPEG.
async function phDecode(blob){
  if(typeof createImageBitmap==='function'){try{return await createImageBitmap(blob,{imageOrientation:'from-image'});}catch{}}
  return await new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('לא הצלחנו לקרוא את התמונה. נסה קובץ JPG או PNG.'));};img.src=url;});
}
function phScale(src,max,quality){
  const w0=src.width||src.naturalWidth,h0=src.height||src.naturalHeight;
  const k=Math.min(1,max/Math.max(w0,h0)),w=Math.max(1,Math.round(w0*k)),h=Math.max(1,Math.round(h0*k));
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);g.imageSmoothingQuality='high';g.drawImage(src,0,0,w,h);
  return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve({blob:b,w,h}):reject(new Error('לא הצלחנו לעבד את התמונה.')),'image/jpeg',quality));
}
export async function putPhoto(file,{max=PHOTO_MAX,thumb=PHOTO_THUMB,quality=.82}={}){
  if(!file||(file.type&&!/^image\//.test(file.type)))throw new Error('אפשר להוסיף רק תמונות.');
  const img=await phDecode(file);
  const full=await phScale(img,max,quality),small=await phScale(img,thumb,.78);
  try{img.close?.();}catch{}
  const id='ph'+uid();
  await phTx('readwrite',st=>st.put({id,full:full.blob,thumb:small.blob,w:full.w,h:full.h,created:new Date().toISOString()}));
  return id;
}
export async function getPhotoRecord(id){if(!id)return null;try{return (await phTx('readonly',st=>st.get(id)))||null;}catch{return null;}}
export async function getPhoto(id){return (await getPhotoRecord(id))?.full||null;}
export async function getThumb(id){const r=await getPhotoRecord(id);return r?.thumb||r?.full||null;}
export async function deletePhoto(id){
  for(const k of ['thumb','full']){const u=phUrls.get(id+':'+k);if(u){URL.revokeObjectURL(u);phUrls.delete(id+':'+k);}}
  await phTx('readwrite',st=>st.delete(id));
}
export async function allPhotoIds(){try{return (await phTx('readonly',st=>st.getAllKeys()))||[];}catch{return [];}}
export async function photoURL(id,size='thumb'){
  const key=id+':'+size;if(phUrls.has(key))return phUrls.get(key);
  const b=size==='full'?await getPhoto(id):await getThumb(id);if(!b)return null;
  const u=URL.createObjectURL(b);phUrls.set(key,u);return u;
}
// An <img> placeholder; hydratePhotos() fills its src. size: 'thumb' (lists, grids) or 'full' (viewer).
export function photoImg(id,{size='thumb',alt='',cls=''}={}){
  return `<img class="photo${cls?' '+cls:''}" data-photo="${esc(id)}" data-size="${size==='full'?'full':'thumb'}" alt="${esc(alt)}" decoding="async">`;
}
export function hydratePhotos(root=document){
  for(const img of root.querySelectorAll?.('img[data-photo]:not([src])')||[]){
    photoURL(img.dataset.photo,img.dataset.size).then(u=>{if(u)img.src=u;else img.classList.add('missing');},()=>img.classList.add('missing'));
  }
}
const phToDataURL=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
async function phFromDataURL(url){const res=await fetch(url);return await res.blob();}
// For backups: the photos the data refers to, as data URLs.
export async function exportPhotos(ids){
  const out={};
  for(const id of new Set(ids)){const r=await getPhotoRecord(id);if(!r)continue;out[id]={full:await phToDataURL(r.full),thumb:r.thumb?await phToDataURL(r.thumb):null,w:r.w,h:r.h,created:r.created};}
  return out;
}
export async function importPhotos(map){
  let n=0;
  for(const [id,p] of Object.entries(map||{})){
    if(!p||typeof p.full!=='string'||!/^data:image\//.test(p.full))continue;
    const full=await phFromDataURL(p.full),thumb=typeof p.thumb==='string'&&/^data:image\//.test(p.thumb)?await phFromDataURL(p.thumb):full;
    await phTx('readwrite',st=>st.put({id,full,thumb,w:p.w||0,h:p.h||0,created:p.created||new Date().toISOString()}));n++;
  }
  return n;
}
// Every photo id a data object refers to (memories, her photo, and any item with a `photos` or `photo` field).
export function photoIdsIn(d){
  const ids=new Set();if(!d)return ids;
  if(d.profile?.photo)ids.add(d.profile.photo);
  for(const k of ['facts','people','places','dates','gifts','plans','memories'])for(const x of d[k]||[]){
    if(typeof x?.photo==='string')ids.add(x.photo);
    if(Array.isArray(x?.photos))for(const p of x.photos)if(typeof p==='string')ids.add(p);
  }
  return ids;
}
// Remove photos nothing refers to. `keep` = ids still in use (current data + previous save + open forms).
// Photos added in the last day are always kept (a form may still be open, or an undo may bring them back): the
// id itself carries its time ('ph' + uid(), and uid() starts with Date.now() in base 36).
export function photoAgeMs(id,now=Date.now()){const t=parseInt(String(id).slice(2,10),36);return Number.isFinite(t)&&t>1.5e12?now-t:Infinity;}
export async function gcPhotos(keep){
  const all=await allPhotoIds();let removed=0;
  for(const id of all)if(!keep.has(id)&&photoAgeMs(id)>864e5){try{await deletePhoto(id);removed++;}catch{}}
  return removed;
}
