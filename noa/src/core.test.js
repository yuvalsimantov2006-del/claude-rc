import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore,mergeItem,PREV_KEY,TMP_KEY,BROKEN_KEY,UNDO_LIMIT,esc,escLines,safeUrl,fmtDate,fmtMonth,fmtRelative,spanWords,daysUntil,addDaysISO,splitAction} from './core.js';
import {DATA_KEY,emptyData,demoData} from './model.js';

// A localStorage stand-in; `quota` makes setItem throw once the total size would pass it.
function fakeStorage(init={},quota=Infinity){
  const m=new Map(Object.entries(init));
  return {m,getItem:k=>m.has(k)?m.get(k):null,setItem(k,v){const size=[...m].reduce((s,[kk,vv])=>s+(kk===k?0:vv.length),0)+String(v).length;if(size>quota){const e=new Error('QuotaExceededError');e.name='QuotaExceededError';throw e;}m.set(k,String(v));},removeItem:k=>m.delete(k),key:i=>[...m.keys()][i]??null,get length(){return m.size;}};
}
const fixedNow=()=>new Date('2026-10-18T10:00:00.000Z');
const withFact=(d,title)=>({...d,facts:[...d.facts,{id:'f-'+title,title,category:'food',sentiment:'love'}]});

test('a fresh store starts empty and saves through the temp key, keeping the previous save',()=>{
  const s=fakeStorage(),st=createStore(s,{now:fixedNow}).load();
  assert.equal(st.from,'empty');assert.equal(st.loadError,null);
  assert.deepEqual(st.get().facts,[]);
  const a=st.commit(withFact(st.get(),'a'));
  assert.equal(JSON.parse(s.getItem(DATA_KEY)).facts.length,1);
  assert.equal(s.getItem(TMP_KEY),null,'temp key removed after the swap');
  assert.equal(s.getItem(PREV_KEY),null,'nothing to keep the first time');
  st.commit(withFact(a,'b'));
  assert.equal(JSON.parse(s.getItem(DATA_KEY)).facts.length,2);
  assert.equal(JSON.parse(s.getItem(PREV_KEY)).facts.length,1,'the previous save is kept');
  assert.equal(st.prev().facts.length,1);
  // a second store over the same storage reads the same data back
  const again=createStore(s,{now:fixedNow}).load();
  assert.equal(again.from,'main');assert.deepEqual(again.get(),st.get());
});

test('an interrupted save (temp key left behind) is recovered on load',()=>{
  const old=JSON.stringify(withFact(emptyData(),'old')),newer=JSON.stringify(withFact(withFact(emptyData(),'old'),'new'));
  const s=fakeStorage({[DATA_KEY]:old,[TMP_KEY]:newer});
  const st=createStore(s,{now:fixedNow}).load();
  assert.equal(st.from,'tmp');
  assert.equal(st.get().facts.length,2);
  assert.equal(s.getItem(TMP_KEY),null,'the swap is finished');
  assert.equal(JSON.parse(s.getItem(DATA_KEY)).facts.length,2);
  assert.equal(JSON.parse(s.getItem(PREV_KEY)).facts.length,1);
  // a broken temp key is dropped and the main save is used
  const s2=fakeStorage({[DATA_KEY]:old,[TMP_KEY]:'{"broken'});
  const st2=createStore(s2,{now:fixedNow}).load();
  assert.equal(st2.from,'main');assert.equal(st2.get().facts.length,1);assert.equal(s2.getItem(TMP_KEY),null);
});

test('unreadable data is kept aside, never overwritten, and commits are refused until a forced restore',()=>{
  const s=fakeStorage({[DATA_KEY]:'{"version":1,"facts":"nope"}'});
  const st=createStore(s,{now:fixedNow}).load();
  assert.equal(st.from,'broken');
  assert.match(st.loadError,/לא הצלחנו לקרוא/);
  assert.equal(s.getItem(BROKEN_KEY),'{"version":1,"facts":"nope"}');
  assert.throws(()=>st.commit(withFact(st.get(),'x')),/אי אפשר לשמור/);
  assert.equal(s.getItem(DATA_KEY),'{"version":1,"facts":"nope"}','untouched');
  st.commit(withFact(emptyData(),'fresh'),{force:true});
  assert.equal(st.loadError,null);
  assert.equal(JSON.parse(s.getItem(DATA_KEY)).facts[0].title,'fresh');
  assert.equal(s.getItem(BROKEN_KEY),'{"version":1,"facts":"nope"}','the unreadable copy stays for rescue');
  assert.equal(s.getItem(PREV_KEY),null,'garbage never becomes the previous save');
});

test('invalid next data is rejected before anything is written',()=>{
  const s=fakeStorage(),st=createStore(s,{now:fixedNow}).load();
  st.commit(withFact(st.get(),'a'));
  const before=s.getItem(DATA_KEY);
  assert.throws(()=>st.commit({...st.get(),places:'x'}),/מקומות/);
  assert.equal(s.getItem(DATA_KEY),before);
  assert.equal(st.get().facts.length,1);
});

test('a full storage fails with a Hebrew message and leaves the saved data as it was',()=>{
  const s=fakeStorage({},4000),st=createStore(s,{now:fixedNow}).load();
  st.commit(withFact(st.get(),'a'));
  const before=s.getItem(DATA_KEY);
  const big=withFact(st.get(),'x'.repeat(3000));
  assert.throws(()=>st.commit(big),err=>err.noaStorage&&/האחסון/.test(err.message));
  assert.equal(s.getItem(DATA_KEY),before);
  assert.equal(s.getItem(TMP_KEY),null);
  assert.equal(st.get().facts.length,1,'in-memory data unchanged');
});

test('undo restores the exact snapshot, step by step, and refuses after an outside change',()=>{
  const s=fakeStorage(),st=createStore(s,{now:fixedNow}).load();
  const a=st.commit(withFact(st.get(),'a'),{undo:'הוספה'});
  const aJson=s.getItem(DATA_KEY);
  st.commit(withFact(a,'b'),{undo:'עוד הוספה'});
  assert.ok(st.canUndo());assert.equal(st.undoLabel(),'עוד הוספה');
  let r=st.undo();assert.ok(r.ok);
  assert.equal(st.get(),a,'the very same object comes back');
  assert.equal(s.getItem(DATA_KEY),aJson,'byte-identical storage');
  r=st.undo();assert.ok(r.ok);assert.equal(st.get().facts.length,0);
  assert.deepEqual(st.undo(),{ok:false,reason:'none'});
  // a change made elsewhere (another tab) makes the snapshot stale
  st.commit(withFact(st.get(),'c'),{undo:'x'});
  s.setItem(DATA_KEY,JSON.stringify(withFact(emptyData(),'other-tab')));
  assert.deepEqual(st.undo(),{ok:false,reason:'changed'});
  assert.ok(!st.canUndo());
  // commits without an undo label leave nothing to undo
  const st2=createStore(fakeStorage(),{now:fixedNow}).load();st2.commit(withFact(st2.get(),'q'));assert.ok(!st2.canUndo());
  // the stack is bounded
  const st3=createStore(fakeStorage(),{now:fixedNow}).load();
  for(let i=0;i<UNDO_LIMIT+5;i++)st3.commit(withFact(st3.get(),'n'+i),{undo:'n'+i});
  let n=0;while(st3.undo().ok)n++;assert.equal(n,UNDO_LIMIT);
});

test('subscribers hear commits, undos and reloads',()=>{
  const s=fakeStorage(),st=createStore(s,{now:fixedNow}).load();const heard=[];
  const off=st.subscribe((next,prev)=>heard.push([next.facts.length,prev.facts.length]));
  st.commit(withFact(st.get(),'a'),{undo:'u'});st.undo();
  s.setItem(DATA_KEY,JSON.stringify(withFact(withFact(emptyData(),'x'),'y')));st.reloadFromStorage();
  assert.deepEqual(heard,[[1,0],[0,1],[2,0]]);
  off();st.commit(withFact(st.get(),'z'));assert.equal(heard.length,3);
});

test('the demo data round-trips through the store',()=>{
  const s=fakeStorage(),st=createStore(s,{now:fixedNow}).load();
  st.commit(demoData('2026-10-18'));
  const again=createStore(s,{now:fixedNow}).load();
  assert.equal(again.get().demo,true);assert.equal(again.get().places.length,st.get().places.length);
});

test('mergeItem keeps fields another screen added and stamps the edit',()=>{
  const created=mergeItem(null,{title:'סושי'},'2026-01-01T00:00:00.000Z');
  assert.ok(created.id);assert.equal(created.created,'2026-01-01T00:00:00.000Z');assert.equal(created.starred,false);assert.deepEqual(created.tags,[]);
  const edited=mergeItem({...created,extra:42},{title:'סושי טרי',id:'ignored'},'2026-02-02T00:00:00.000Z');
  assert.equal(edited.id,created.id);assert.equal(edited.extra,42);assert.equal(edited.title,'סושי טרי');
  assert.equal(edited.created,'2026-01-01T00:00:00.000Z');assert.equal(edited.updated,'2026-02-02T00:00:00.000Z');
});

test('esc, escLines, safeUrl, splitAction',()=>{
  assert.equal(esc(`<img src=x onerror="a('b')">&\``),'&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;&#96;');
  assert.equal(esc(null),'');assert.equal(esc(0),'0');
  assert.equal(escLines('א\n<b>'),'א<br>&lt;b&gt;');
  assert.equal(safeUrl('javascript:alert(1)'),'');assert.equal(safeUrl(' https://maps.google.com/?q=x '),'https://maps.google.com/?q=x');
  assert.equal(safeUrl('www.example.com'),'https://www.example.com');assert.equal(safeUrl('tel:0501234567'),'tel:0501234567');
  assert.deepEqual(splitAction('open:a:b'),['open','a:b']);assert.deepEqual(splitAction('undo'),['undo','']);
});

test('Hebrew dates: fmtDate, fmtMonth, fmtRelative, spanWords, daysUntil',()=>{
  const y=new Date().getFullYear();
  assert.equal(fmtDate(`${y}-06-02`),'2 ביוני');
  assert.equal(fmtDate('2020-06-02'),'2 ביוני 2020');
  assert.equal(fmtDate('2026-06-02',{weekday:true}),'יום ג׳, 2 ביוני 2026');
  assert.equal(fmtDate('2026-10-17',{weekday:true}),'שבת, 17 באוקטובר 2026');
  assert.equal(fmtDate(`${y}-01-15`,{year:true}),`15 בינואר ${y}`);
  assert.equal(fmtDate('nope'),'');
  assert.equal(fmtMonth('2026-03'),'מרץ 2026');
  const f='2026-10-18';
  const cases=[[0,'היום'],[1,'מחר'],[2,'מחרתיים'],[-1,'אתמול'],[-2,'שלשום'],[3,'בעוד 3 ימים'],[7,'בעוד שבוע'],[12,'בעוד 12 ימים'],[14,'בעוד שבועיים'],[-7,'לפני שבוע'],[-14,'לפני שבועיים'],[30,'בעוד חודש'],[60,'בעוד חודשיים'],[120,'בעוד 4 חודשים'],[365,'בעוד שנה'],[-730,'לפני שנתיים'],[1461,'בעוד 4 שנים']];
  for(const [n,want] of cases){assert.equal(fmtRelative(n),want,String(n));assert.equal(fmtRelative(addDaysISO(f,n),f),want,'iso '+n);}
  assert.equal(spanWords(5),'5 ימים');
  assert.equal(daysUntil('2026-10-30','2026-10-18'),12);
  assert.equal(daysUntil('2027-03-28','2026-10-18'),161,'across the DST change');
  assert.ok(Number.isNaN(daysUntil('bad','2026-10-18')));
  assert.equal(addDaysISO('2028-02-28',1),'2028-02-29');
});
