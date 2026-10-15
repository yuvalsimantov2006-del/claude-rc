import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCK_KEY,LOCK_ITERATIONS,hashPin,verifyPin,validPin,lockDelay,lockWait,lockFailure,readLock,wipePlan,lkFromB64} from './lock.js';

test('lock: hash and verify a PIN (PBKDF2, 310,000 iterations)',async()=>{
  assert.equal(LOCK_KEY,'ofek-lock-v1');assert.equal(LOCK_ITERATIONS,310000);
  const pin=await hashPin('1234');
  assert.equal(pin.iterations,310000);assert.equal(pin.length,4);
  assert.equal(lkFromB64(pin.salt).length,16);assert.equal(lkFromB64(pin.hash).length,32);
  assert.equal(await verifyPin('1234',{pin}),true);
  assert.equal(await verifyPin('1235',{pin}),false);
  assert.equal(await verifyPin('12345',{pin}),false);
  assert.equal(await verifyPin('abcd',{pin}),false);
  assert.ok(!JSON.stringify(pin).includes('1234'),'the PIN itself is never stored');
});
test('lock: two hashes of the same PIN have different salts',async()=>{
  const a=await hashPin('5678',2000),b=await hashPin('5678',2000);
  assert.notEqual(a.salt,b.salt);assert.notEqual(a.hash,b.hash);
  assert.equal(await verifyPin('5678',{pin:b}),true);
});
test('lock: valid PINs are 4 to 8 digits',async()=>{
  assert.equal(validPin('123'),false);assert.equal(validPin('1234'),true);assert.equal(validPin('12345678'),true);
  assert.equal(validPin('123456789'),false);assert.equal(validPin('12a4'),false);assert.equal(validPin(1234),false);assert.equal(validPin(' 1234'),false);
  await assert.rejects(hashPin('12'),/4 עד 8 ספרות/);
});
test('lock: failure delays',()=>{
  assert.deepEqual([0,1,2,3,4,5,6,7,8,9].map(lockDelay),[0,0,0,0,0,30000,60000,300000,900000,900000]);
  assert.equal(lockDelay(40),900000,'capped at 15 minutes');
  let rec={failures:0,retryAt:0};const t=1_000_000;
  for(let i=0;i<5;i++)rec=lockFailure(rec,t);
  assert.equal(rec.failures,5);assert.equal(lockWait(rec,t),30000);assert.equal(lockWait(rec,t+31000),0);
  assert.equal(lockWait({retryAt:t+10*3600e3},t),900000,'a clock that jumped back cannot extend the wait');
  assert.equal(lockWait(null,t),0);
});
test('lock: damaged settings mean no lock',async()=>{
  assert.equal(readLock('{bad'),null);
  assert.equal(readLock('{"v":2}'),null);
  assert.equal(readLock(null),null);
  assert.equal(readLock('null'),null);
  assert.equal(readLock('[]'),null);
  const pin=await hashPin('2468',2000);
  assert.equal(readLock({v:1,pin:{...pin,hash:'%%%'}}),null,'unreadable hash');
  assert.equal(readLock({v:1,pin:{...pin,hash:pin.salt}}),null,'hash of the wrong length');
  assert.equal(readLock({v:1,pin:{...pin,length:3}}),null);
  assert.equal(readLock({v:1}),null);
});
test('lock: settings parsing keeps good fields and repairs the rest',async()=>{
  const pin=await hashPin('2468',2000);
  const ok=readLock(JSON.stringify({v:1,pin,minutes:15,bio:null,failures:3,retryAt:0,created:'2026-10-14'}));
  assert.deepEqual(ok,{v:1,pin,minutes:15,bio:null,failures:3,retryAt:0,created:'2026-10-14'});
  const fixed=readLock({v:1,pin,minutes:7,bio:{id:5},failures:-2,retryAt:'soon'});
  assert.equal(fixed.minutes,1);assert.equal(fixed.bio,null);assert.equal(fixed.failures,0);assert.equal(fixed.retryAt,0);
  assert.deepEqual(readLock({v:1,pin,minutes:0,bio:{id:'AAEC',created:'2026-10-14'}}).bio,{id:'AAEC',created:'2026-10-14'});
  assert.equal(await verifyPin('2468',ok),true);
});
test('lock: the wipe plan',()=>{
  assert.deepEqual(wipePlan(['ofek-finance-v1','ofek-theme','other']),{keys:['ofek-finance-v1','ofek-theme'],databases:['ofek-versions','ofek-notify']});
  const store={items:['qa-seeded','ofek-lock-v1','ofek-finance-v1-recovery'],get length(){return this.items.length;},key(i){return this.items[i];}};
  assert.deepEqual(wipePlan(store).keys,['ofek-lock-v1','ofek-finance-v1-recovery']);
  assert.deepEqual(wipePlan(null).keys,[]);
});
