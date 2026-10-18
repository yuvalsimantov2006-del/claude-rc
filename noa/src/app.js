// נועה — boot: the lock first (before anything shows), then the first render, the service worker (offline + the
// installed app), today's notifications, and a quiet clean-up of photos nothing refers to any more.

function appBoot(){
  try{if(history.state?.noaDlg)history.replaceState(null,'');}catch{}
  lockBoot();
  shState.route=parseRoute();
  shRouteChanged(true);
  document.documentElement.classList.add('booted');
  // Manifest shortcut: ./?quick=1 opens quick add (and ?add=<id> a specific one).
  const params=new URLSearchParams(location.search);
  if(params.get('quick')){setTimeout(()=>{const id=params.get('add');const q=id&&quickAdds().find(x=>x.id===id);if(q)runAction(q.run);else openQuickAdd();},250);}
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
    navigator.serviceWorker.register('sw.js',{scope:'./'}).catch(()=>{});
  }
  setTimeout(()=>{try{notifyDue();}catch{}},1500);
  // Photos referred to by nothing (not the data, not the previous save, not an open form) go after a while.
  setTimeout(()=>{
    if(store.loadError)return;
    const keep=photoIdsIn(getData());for(const id of photoIdsIn(store.prev()))keep.add(id);
    for(const el of document.querySelectorAll('[data-photo-id]'))keep.add(el.dataset.photoId);
    gcPhotos(keep).catch(()=>{});
  },20000);
  // The persistent-storage request, once there is something of his to keep.
  if(!getData().demo&&!isEmptyData(getData()))setTimeout(()=>{try{navigator.storage?.persisted?.().then(p=>{if(!p)navigator.storage.persist?.();});}catch{}},4000);
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',appBoot);else appBoot();
}
