// נועה service worker: keeps the app working offline (and installable). Only same-origin GET requests under this
// app's own scope are handled, network first for the page so updates arrive at once. Its caches are named
// 'noa-<version>' (the build writes the version); it never touches another app's caches on the same site.
const CACHE='noa-dev';
const SHELL=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/badge-96.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('noa-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await Promise.race([fetch(request),new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),4000))]);
        if(response.ok)(await caches.open(CACHE)).put('index.html',response.clone());
        return response;
      }catch{return (await caches.match('index.html'))||(await caches.match('./'))||Response.error();}
    })());
    return;
  }
  event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||'./',self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const client=list.find(c=>c.url.startsWith(self.registration.scope));
    if(client)return client.focus().then(c=>c&&c.navigate?c.navigate(url):c);
    return self.clients.openWindow(url);
  }));
});
