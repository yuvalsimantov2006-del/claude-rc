import test from 'node:test';
import assert from 'node:assert/strict';
import {DATA_VERSION,DATA_LISTS,FACT_CATEGORIES,SENTIMENTS,PLACE_KINDS,PLACE_LOVED_BY,DATE_KINDS,GIFT_STATUSES,PLAN_TYPES,LOVE_LANGUAGE_TYPES,
  uid,isIsoDate,localToday,emptyData,validateData,migrate,demoData,counts,isEmptyData,vocabLabel,vocabItem} from './model.js';

const hebrew=/[֐-׿]/;
const rejects=(fn,re)=>assert.throws(fn,err=>{assert.ok(err.noaInvalid,'marked as invalid data');assert.match(err.message,hebrew);if(re)assert.match(err.message,re);return true;});

test('uid: unique strings',()=>{
  const ids=new Set(Array.from({length:2000},uid));
  assert.equal(ids.size,2000);
  for(const id of ids){assert.equal(typeof id,'string');assert.ok(id.length>=10);assert.ok(!id.includes(':'));}
});

test('isIsoDate: real calendar dates only',()=>{
  for(const ok of ['2026-01-31','2024-02-29','2000-02-29','1999-12-01'])assert.ok(isIsoDate(ok),ok);
  for(const bad of ['2026-02-29','2026-13-01','2026-00-10','2026-1-1','26-01-01','2026-04-31','',null,20260101,'2026-01-01T10:00'])assert.ok(!isIsoDate(bad),String(bad));
  assert.match(localToday(new Date(2026,9,18,23,59)),/^2026-10-18$/);
});

test('vocabularies: unique ids, Hebrew labels, an icon each',()=>{
  for(const list of [FACT_CATEGORIES,PLACE_KINDS,PLACE_LOVED_BY,DATE_KINDS,GIFT_STATUSES,PLAN_TYPES,LOVE_LANGUAGE_TYPES]){
    assert.equal(new Set(list.map(x=>x.id)).size,list.length);
    for(const x of list){assert.match(x.label,hebrew);assert.ok(x.icon,`${x.id} has an icon`);}
  }
  assert.equal(FACT_CATEGORIES.length,20);
  assert.deepEqual(SENTIMENTS.map(s=>s.id),['love','like','neutral','dislike','never']);
  assert.deepEqual(LOVE_LANGUAGE_TYPES.map(s=>s.id),['words','time','gifts','service','touch']);
  assert.equal(vocabLabel(PLACE_KINDS,'cafe'),'בית קפה');
  assert.equal(vocabLabel(PLACE_KINDS,'nope','?'),'?');
  assert.equal(vocabItem(FACT_CATEGORIES,'nope').id,'other');
});

test('emptyData validates to itself and is empty',()=>{
  const d=emptyData();
  assert.equal(d.version,DATA_VERSION);
  const v=validateData(d);
  assert.deepEqual(v,d);
  assert.ok(isEmptyData(v));
  for(const {id} of DATA_LISTS)assert.deepEqual(v[id],[]);
  assert.equal(v.profile.her,'נועה');
  assert.equal(v.prefs.setupDone,false);
});

test('validateData: rejects what is not Noa data, with a Hebrew message',()=>{
  rejects(()=>validateData(null));
  rejects(()=>validateData('hello'));
  rejects(()=>validateData([1,2]));
  rejects(()=>validateData({version:1,facts:'nope'}),/עובדות/);
  rejects(()=>validateData({version:1,places:[{name:'x'}]}),/מזהה/);
  rejects(()=>validateData({version:1,places:[{id:'a'},{id:'a'}]}),/פעמיים/);
  rejects(()=>validateData({version:1,places:[42]}),/מקומות/);
  rejects(()=>validateData({version:1,dates:[{id:'a',title:'x',date:'2026-02-30'}]}),/תאריך/);
  rejects(()=>validateData({version:1,dates:[{id:'a',title:'x'}]}),/חסר תאריך/);
  rejects(()=>validateData({version:1,memories:[{id:'a',title:'x',date:'אתמול'}]}),/תאריך/);
  rejects(()=>validateData({version:1,profile:{together:'14/01/2025'}}),/ההיכרות/);
  rejects(()=>validateData({version:1,profile:'נועה'}),/פרופיל/);
  rejects(()=>validateData({version:99}),/גרסה חדשה/);
  rejects(()=>validateData({version:-1}),/גרסת/);
});

test('validateData: normalises and fills defaults without mutating the input',()=>{
  const input={version:1,profile:{her:'  מאיה ',together:'2025-01-14',loveLanguages:['time','bogus','time'],sizes:{shoes:38}},
    facts:[{id:'f1',title:'סושי',category:'nope',sentiment:'weird',tags:['a','a',' ',3]}],
    places:[{id:7,name:'מקום',rating:9,priceLevel:-2,visits:['2026-01-02','2026-01-01','2026-01-02',null],lovedBy:'x'}],
    dates:[{id:'d1',title:'יום',date:'2026-05-01',recurring:'monthly',remindDays:[1,'7',7,-3,900,'x']}],
    gifts:[{id:'g1',title:'שרשרת',price:'380',reaction:'',status:'given',givenOn:'2026-03-01T10:00:00Z'}],
    plans:[{id:'p1',title:'משימה',done:'yes',due:''}],
    memories:[{id:'m1',date:'2026-04-04',photos:['a','a','',5],mood:''}],
    asked:{q1:'2026-01-01',q2:'bad'},gestures:{done:{g:'2026-02-02',h:7}},prefs:{notifyHour:30,holidays:false}};
  const before=JSON.stringify(input);
  const v=validateData(input,'2026-10-18T10:00:00.000Z');
  assert.equal(JSON.stringify(input),before,'input untouched');
  assert.equal(v.profile.her,'מאיה');
  assert.deepEqual(v.profile.loveLanguages,['time']);
  assert.equal(v.profile.sizes.shoes,'38');
  assert.equal(v.profile.herBirthday,null);
  const f=v.facts[0];
  assert.equal(f.category,'other');assert.equal(f.sentiment,'neutral');assert.deepEqual(f.tags,['a','3']);
  assert.equal(f.created,'2026-10-18T10:00:00.000Z');assert.equal(f.updated,f.created);assert.equal(f.starred,false);assert.equal(f.notes,'');
  const p=v.places[0];
  assert.equal(p.id,'7');assert.equal(p.rating,5);assert.equal(p.priceLevel,0);assert.equal(p.lovedBy,'us');assert.equal(p.kind,'other');
  assert.deepEqual(p.visits,['2026-01-01','2026-01-02']);
  assert.equal(v.dates[0].recurring,'none');assert.deepEqual(v.dates[0].remindDays,[7,1]);assert.equal(v.dates[0].kind,'other');
  assert.equal(v.gifts[0].price,380);assert.equal(v.gifts[0].reaction,null);assert.equal(v.gifts[0].givenOn,'2026-03-01');
  assert.equal(v.plans[0].done,false);assert.equal(v.plans[0].due,null);assert.equal(v.plans[0].type,'task');
  assert.deepEqual(v.memories[0].photos,['a']);assert.equal(v.memories[0].mood,null);
  assert.deepEqual(v.asked,{q1:'2026-01-01'});
  assert.deepEqual(v.gestures.done,{g:'2026-02-02'});
  assert.equal(v.prefs.notifyHour,23);assert.equal(v.prefs.holidays,false);assert.deepEqual(v.prefs.homeHidden,[]);
});

test('validateData: unknown fields are preserved at every level',()=>{
  const v=validateData({version:1,future:{x:1},profile:{her:'נועה',mood:'happy'},facts:[{id:'a',title:'x',color:'#fff'}],prefs:{beta:true}});
  assert.deepEqual(v.future,{x:1});
  assert.equal(v.profile.mood,'happy');
  assert.equal(v.facts[0].color,'#fff');
  assert.equal(v.prefs.beta,true);
});

test('validateData is idempotent',()=>{
  const once=validateData(demoData('2026-10-18'));
  assert.deepEqual(validateData(once),once);
});

test('migrate: version 0 moves profile fields and ideas into plans; version 1 unchanged',()=>{
  const old={her:'נועה',together:'2025-01-14',ideas:[{id:'i1',title:'פיקניק'}],facts:[]};
  const m=migrate(old);
  assert.equal(m.version,1);
  assert.equal(m.profile.her,'נועה');assert.equal(m.profile.together,'2025-01-14');
  assert.ok(!('her' in m));assert.ok(!('ideas' in m));
  assert.deepEqual(m.plans,[{type:'task',id:'i1',title:'פיקניק'}]);
  assert.equal(old.her,'נועה','input untouched');
  const v=validateData(old);
  assert.equal(v.plans[0].type,'task');assert.equal(v.profile.together,'2025-01-14');
  const cur={version:1,facts:[]};assert.deepEqual(migrate(cur),cur);
});

test('demoData: valid, rich, marked as demo, relative to today',()=>{
  for(const today of ['2026-10-18','2027-02-28','2028-02-29','2026-12-31']){
    const d=demoData(today);
    const v=validateData(d);
    assert.equal(v.demo,true);
    assert.equal(v.prefs.setupDone,true);
    const c=counts(v);
    assert.ok(c.facts>=30,'facts');assert.ok(c.people>=5);assert.ok(c.places>=10);assert.ok(c.dates>=5);
    assert.ok(c.gifts>=6);assert.ok(c.giftIdeas>=3);assert.ok(c.plans>=8);assert.ok(c.memories>=6);
    // every category of facts the home and her screen show has something, and every sentiment appears
    for(const s of ['love','like','neutral','dislike','never'])assert.ok(v.facts.some(f=>f.sentiment===s),s);
    assert.ok(new Set(v.facts.map(f=>f.category)).size>=18);
    assert.ok(v.facts.some(f=>f.starred));
    // ids unique across the whole data (deep links and search use them)
    const ids=['facts','people','places','dates','gifts','plans','memories'].flatMap(k=>v[k].map(x=>x.id));
    assert.equal(new Set(ids).size,ids.length);
    // references point at real items
    const placeIds=new Set(v.places.map(p=>p.id)),peopleIds=new Set(v.people.map(p=>p.id));
    for(const x of [...v.plans,...v.memories])if(x.placeId)assert.ok(placeIds.has(x.placeId),x.placeId);
    for(const x of v.dates)if(x.personId)assert.ok(peopleIds.has(x.personId),x.personId);
    // the home has something to count down to, an "on this day" memory and a 642-day "together"
    const [y,m,dd]=today.split('-').map(Number);
    const days=iso=>Math.round((Date.UTC(...iso.split('-').map((n,i)=>i===1?n-1:+n))-Date.UTC(y,m-1,dd))/864e5);
    assert.equal(days(v.profile.together),-642);
    assert.ok(v.memories.some(x=>x.date.slice(5)===today.slice(5)||(today.slice(5)==='02-29'&&x.date.slice(5)==='02-28')),'on this day');
    assert.ok(v.plans.some(p=>!p.done&&p.due&&days(p.due)>0&&days(p.due)<10),'a task due soon');
    assert.ok(v.dates.some(x=>days(x.date)>0&&days(x.date)<=30),'an event within a month');
    // Hebrew everywhere it shows
    for(const f of v.facts)assert.match(f.title,hebrew.test(f.title)?hebrew:/./);
    assert.match(v.profile.her,hebrew);
  }
});

test('counts and isEmptyData',()=>{
  const d=emptyData();
  assert.deepEqual(counts(d),{facts:0,people:0,places:0,dates:0,gifts:0,giftIdeas:0,plans:0,openPlans:0,memories:0,photos:0,starred:0});
  d.memories.push({id:'m',date:'2026-01-01',photos:['a','b'],starred:true});
  d.plans.push({id:'p',done:true},{id:'q',done:false});
  const c=counts(d);
  assert.equal(c.photos,2);assert.equal(c.openPlans,1);assert.equal(c.starred,1);
  assert.ok(!isEmptyData(d));
  assert.deepEqual(counts(null).facts,0);
});
