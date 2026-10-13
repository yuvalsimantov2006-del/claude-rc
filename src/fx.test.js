import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchUsdIls,plausibleRate,rememberRate,cachedRate,FX_SOURCES} from './fx.js';

const respond=(status,body)=>({ok:status<300,status,json:async()=>body});

test('latest rate from the first source that answers sensibly',async()=>{
  const calls=[];
  const fetchImpl=async url=>{calls.push(url);if(url.includes('/v2/'))return respond(500,{});if(url.includes('/v1/latest'))return respond(200,{amount:1,base:'USD',date:'2026-10-12',rates:{ILS:3.61237}});return respond(200,{});};
  const r=await fetchUsdIls({fetchImpl});
  assert.deepEqual(r,{rate:3.6124,date:'2026-10-12',source:'Frankfurter (ECB)'});
  assert.equal(calls.length,2,'stops at the first good answer');
});

test('implausible values and broken sources fall through to the next one',async()=>{
  const fetchImpl=async url=>{
    if(url.includes('/v2/'))return respond(200,{date:'2026-10-12',base:'USD',quote:'ILS',rate:0.27});
    if(url.includes('frankfurter.dev/v1/'))throw new TypeError('Failed to fetch');
    if(url.includes('jsdelivr'))return respond(200,{date:'2026-10-12',usd:{ils:3.6}});
    return respond(500,{});
  };
  const r=await fetchUsdIls({fetchImpl});
  assert.equal(r.rate,3.6);assert.equal(r.source,'Currency API');
});

test('historical rates ask each source for the date and reject later dates',async()=>{
  const urls=[];
  const fetchImpl=async url=>{urls.push(url);if(url.includes('/v2/'))return respond(200,{date:'2026-10-12',rate:3.6});if(url.includes('/v1/2026-09-30'))return respond(200,{date:'2026-09-30',rates:{ILS:3.7}});return respond(404,{});};
  const r=await fetchUsdIls({date:'2026-09-30',fetchImpl});
  assert.deepEqual(r,{rate:3.7,date:'2026-09-30',source:'Frankfurter (ECB)'});
  assert.ok(urls[0].includes('date=2026-09-30'));
  assert.ok(!urls.some(u=>u.includes('open.er-api')),'sources without history are skipped for dates');
});

test('all sources failing gives a clear Hebrew error with details',async()=>{
  await assert.rejects(fetchUsdIls({fetchImpl:async()=>respond(503,{})}),err=>/שער הדולר/.test(err.message)&&err.errors.length===FX_SOURCES.length);
});

test('plausibility and cache',()=>{
  assert.ok(plausibleRate(3.62));assert.ok(!plausibleRate(0.27));assert.ok(!plausibleRate(NaN));assert.ok(!plausibleRate(36.2));
  let cache=rememberRate(null,null,{rate:3.6,date:'2026-10-12',source:'X'});
  cache=rememberRate(cache,'2026-09-30',{rate:3.7,date:'2026-09-30',source:'Y'});
  assert.equal(cache.latest.rate,3.6);assert.equal(cachedRate(cache,'2026-09-30').rate,3.7);assert.equal(cachedRate(cache,'2026-09-29'),null);
  for(let i=1;i<=5;i++)cache=rememberRate(cache,`2026-01-0${i}`,{rate:3,source:'Z'},3);
  assert.equal(Object.keys(cache.days).length,3,'old days are pruned');
});
