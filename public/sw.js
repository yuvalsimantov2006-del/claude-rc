// Ofek service worker: keeps the app working offline and shows the reminders the user chose.
// Only same-origin GET requests are handled; calls to Claude or GitHub are never cached.
const CACHE='ofek-3.0.0';
const SHELL=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/badge-96.png'];

self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ofek-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    // Network first so updates arrive right away; the cached copy when offline or slow.
    event.respondWith((async()=>{
      try{
        const response=await Promise.race([fetch(request),new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),4000))]);
        if(response.ok)(await caches.open(CACHE)).put('index.html',response.clone());
        return response;
      }catch{
        return (await caches.match('index.html'))||(await caches.match('./'))||Response.error();
      }
    })());
    return;
  }
  event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
});

// ---------- Reminders ----------
// The app hands over upcoming reminders (bills, monthly update); installed apps in Chromium browsers
// wake this worker periodically to show the ones that are due.
const openDB=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('ofek-notify',1);request.onupgradeneeded=()=>request.result.createObjectStore('kv');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function getValue(key){const db=await openDB();return new Promise(resolve=>{const request=db.transaction('kv').objectStore('kv').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(undefined);});}
async function setValue(key,value){const db=await openDB();return new Promise(resolve=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();});}
self.addEventListener('message',event=>{if(event.data?.type==='ofek-digest'&&Array.isArray(event.data.items))event.waitUntil(setValue('digest',event.data.items));});
async function showDue(){
  const items=(await getValue('digest'))||[],shown=(await getValue('shown'))||{},now=Date.now();
  for(const item of items){
    const at=new Date(item.at).getTime();
    if(shown[item.id]||at>now||now-at>36*3600e3)continue;
    await self.registration.showNotification(item.title,{body:item.body,tag:item.id,dir:'rtl',lang:'he',icon:'icons/icon-192.png',badge:'icons/badge-96.png',data:{url:item.url}});
    shown[item.id]=now;
  }
  for(const [id,at] of Object.entries(shown))if(now-at>90*864e5)delete shown[id];
  await setValue('shown',shown);
}
self.addEventListener('periodicsync',event=>{if(event.tag==='ofek-reminders')event.waitUntil(showDue());});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||'./',self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const client=list.find(c=>c.url.startsWith(self.registration.scope));
    if(client)return client.focus().then(c=>c.navigate?c.navigate(url):c);
    return self.clients.openWindow(url);
  }));
});
