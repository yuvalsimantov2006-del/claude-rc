import test from 'node:test';
import assert from 'node:assert/strict';
import {validPin,hashPin,verifyPin,lockDelay,lockWait,lockFailure,readLock,wipePlan,LOCK_KEY} from './lock.js';

test('PIN: 4–6 digits only',()=>{
  for(const ok of ['1234','12345','123456'])assert.ok(validPin(ok),ok);
  for(const bad of ['123','1234567','12a4','',null,1234,' 1234'])assert.ok(!validPin(bad),String(bad));
});

test('hashPin keeps no PIN, verifyPin accepts only the right one',async()=>{
  const rec=await hashPin('2468',2000);
  assert.ok(!JSON.stringify(rec).includes('2468'));
  assert.equal(rec.length,4);assert.equal(rec.iterations,2000);
  assert.ok(await verifyPin('2468',rec));
  assert.ok(await verifyPin('2468',{pin:rec}));
  assert.ok(!(await verifyPin('2469',rec)));
  assert.ok(!(await verifyPin('24680',rec)));
  assert.ok(!(await verifyPin('2468',null)));
  const again=await hashPin('2468',2000);assert.notEqual(again.salt,rec.salt,'a fresh salt each time');
  await assert.rejects(hashPin('12'),/4 עד 6/);
});

test('back-off: five free tries, then growing waits, capped',()=>{
  assert.deepEqual([0,1,2,3,4,5,6,7,8,9,50].map(lockDelay),[0,0,0,0,0,30000,60000,300000,900000,900000,900000]);
  let rec={failures:0};const now=1e12;
  for(let i=0;i<5;i++)rec=lockFailure(rec,now);
  assert.equal(rec.failures,5);assert.equal(lockWait(rec,now),30000);
  assert.equal(lockWait(rec,now+30000),0);
  assert.equal(lockWait({retryAt:now+1e9},now),900000,'a clock that jumped back cannot extend the wait');
});

test('readLock is lenient: damaged records mean "no lock", optional fields fall back',async()=>{
  const pin=await hashPin('1357',2000);
  const good={v:1,pin,minutes:5,bio:null,failures:0,retryAt:0,created:'2026-10-18'};
  const r=readLock(JSON.stringify(good));
  assert.equal(r.minutes,5);assert.equal(r.veil,true);assert.equal(r.bio,null);
  assert.equal(readLock({...good,minutes:7}).minutes,1);
  assert.equal(readLock({...good,veil:false}).veil,false);
  for(const bad of ['nope','{}',JSON.stringify({...good,v:2}),JSON.stringify({...good,pin:{...pin,hash:'abc'}}),JSON.stringify({...good,pin:{...pin,length:8}}),null])assert.equal(readLock(bad),null);
});

test('wipePlan removes only this app\'s keys and its photos',()=>{
  const plan=wipePlan(['noa-data-v1','noa-data-v1-prev',LOCK_KEY,'noa-theme','ofek-finance-v1','ofek-theme','other']);
  assert.deepEqual(plan.keys,['noa-data-v1','noa-data-v1-prev','noa-lock-v1','noa-theme']);
  assert.deepEqual(plan.databases,['noa-photos']);
  const storage={length:2,key:i=>['noa-x','ofek-y'][i]};
  assert.deepEqual(wipePlan(storage).keys,['noa-x']);
});
