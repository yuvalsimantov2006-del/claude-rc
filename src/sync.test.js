import test from 'node:test';
import assert from 'node:assert/strict';
import {demoData} from './data.js';
import {encryptWithPassphrase,decryptJSON,deriveKey,encryptJSON,exportKey,importKey,newSalt,fingerprint,gistClient,syncDecision,toBase64,fromBase64,SYNC_FILE} from './sync.js';

test('encrypted backups round-trip and reject a wrong passphrase',async()=>{
  const d=demoData(),payload=await encryptWithPassphrase(d,'סיסמה ארוכה וחזקה');
  assert.equal(payload.format,'ofek-encrypted');
  assert.ok(!JSON.stringify(payload).includes('דניאל'),'nothing readable leaks');
  assert.ok(payload.data.length<JSON.stringify(d).length,'compressed before encryption');
  assert.deepEqual(await decryptJSON(payload,'סיסמה ארוכה וחזקה'),d);
  await assert.rejects(decryptJSON(payload,'סיסמה אחרת'),/הסיסמה שגויה/);
});

test('a stored key decrypts without the passphrase',async()=>{
  const salt=newSalt(),key=await deriveKey('pass-1234',salt,1000),jwk=await exportKey(key);
  const payload=await encryptJSON({a:1},key,salt,1000);
  assert.deepEqual(await decryptJSON(payload,await importKey(jwk)),{a:1});
  assert.deepEqual(await decryptJSON(payload,'pass-1234'),{a:1},'other devices derive the same key from the salt');
});

test('base64 and fingerprints',()=>{
  const bytes=new Uint8Array(100000).map((_,i)=>i%251);
  assert.deepEqual(fromBase64(toBase64(bytes)),bytes);
  assert.equal(fingerprint('abc'),fingerprint('abc'));
  assert.notEqual(fingerprint('abc'),fingerprint('abd'));
});

test('sync decisions',()=>{
  const remote={rev:3,nonce:'n3',updatedAt:'2026-10-11T10:00:00Z'};
  const base={localFingerprint:'a',lastFingerprint:'a',remote,lastRev:3,lastNonce:'n3'};
  assert.equal(syncDecision(base),'none');
  assert.equal(syncDecision({...base,localFingerprint:'b'}),'push');
  assert.equal(syncDecision({...base,remote:{rev:4,nonce:'n4',updatedAt:'2026-10-11T11:00:00Z'}}),'pull');
  assert.equal(syncDecision({...base,localFingerprint:'b',remote:{rev:4,nonce:'n4',updatedAt:'2026-10-11T11:00:00Z'},localChangedAt:'2026-10-11T12:00:00Z'}),'push-conflict');
  assert.equal(syncDecision({...base,localFingerprint:'b',remote:{rev:4,nonce:'n4',updatedAt:'2026-10-11T11:00:00Z'},localChangedAt:'2026-10-11T10:30:00Z'}),'pull-conflict');
  assert.equal(syncDecision({...base,remote:null}),'push');
  assert.equal(syncDecision({...base,remote:{rev:2,nonce:'n2',updatedAt:'2026-10-11T09:00:00Z'}}),'none','a stale (cached) read of an older revision is ignored');
  assert.equal(syncDecision({...base,remote:{rev:3,nonce:'other',updatedAt:'2026-10-11T10:00:01Z'}}),'pull','another device wrote the same revision at the same time');
});

test('gist client creates, finds, writes, reads revisions and maps errors',async()=>{
  const gists=new Map();let n=0;
  const fetchImpl=async(url,init={})=>{
    const path=url.replace('https://api.github.com',''),method=init.method||'GET';
    assert.equal(init.headers.Authorization,'Bearer t0k');
    const json=(status,body)=>({ok:status<300,status,json:async()=>body,text:async()=>JSON.stringify(body)});
    if(path==='/user')return json(200,{login:'yuval'});
    if(path.startsWith('/gists?'))return json(200,[...gists.values()].map(g=>({id:g.id,files:{[SYNC_FILE]:{}}})));
    if(path==='/gists'&&method==='POST'){const id='g'+(++n),body=JSON.parse(init.body);assert.equal(body.public,false);gists.set(id,{id,versions:[body.files[SYNC_FILE].content]});return json(201,{id});}
    const m=path.match(/^\/gists\/(\w+)(?:\/(\w+))?$/),g=gists.get(m?.[1]);
    if(!g)return json(404,{message:'Not Found'});
    if(method==='PATCH'){g.versions.push(JSON.parse(init.body).files[SYNC_FILE].content);return json(200,{});}
    const content=m[2]?g.versions[Number(m[2].slice(1))]:g.versions.at(-1);
    return json(200,{id:g.id,files:{[SYNC_FILE]:{content}},history:g.versions.map((_,i)=>({version:'v'+i,committed_at:`2026-10-11T0${i}:00:00Z`})).reverse()});
  };
  const client=gistClient('t0k',fetchImpl);
  assert.equal((await client.user()).login,'yuval');
  assert.equal(await client.find(),null);
  const id=await client.create({updatedAt:'1',n:1});
  assert.equal(await client.find(),id);
  await client.write(id,{updatedAt:'2',n:2});
  const read=await client.read(id);
  assert.equal(read.payload.n,2);
  assert.deepEqual(read.history.map(h=>h.sha),['v1','v0']);
  assert.equal((await client.revision(id,'v0')).n,1);
  await assert.rejects(gistClient('t0k',async()=>({ok:false,status:401,json:async()=>({})})).user(),err=>err.status===401&&/טוקן/.test(err.message));
  await assert.rejects(gistClient('t0k',async()=>{throw new Error('offline');}).user(),err=>err.status===0);
});
