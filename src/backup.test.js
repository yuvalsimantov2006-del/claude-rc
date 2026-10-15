import test from 'node:test';
import assert from 'node:assert/strict';
import {backupDue,syncCovers,persistState,storageText,PERSIST_KEY} from './backup.js';

const now='2026-10-14';
const back=days=>new Date(Date.parse(now+'T12:00:00Z')-days*864e5).toISOString();
const tx=n=>Array.from({length:n},(_,i)=>({id:'t'+i}));

test('backup: a demo is never due',()=>{
  assert.equal(backupDue({demo:true,lastBackup:null,transactions:tx(50),createdAt:'2020-01-01'},now).due,false);
  assert.equal(backupDue({demo:true,lastBackup:back(400),transactions:[]},now).due,false);
});
test('backup: an old backup is due after 30 days',()=>{
  assert.deepEqual(backupDue({lastBackup:back(31),transactions:[]},now),{due:true,days:31,reason:'old'});
  assert.deepEqual(backupDue({lastBackup:back(30),transactions:[]},now),{due:true,days:30,reason:'old'});
  const fresh=backupDue({lastBackup:back(29),transactions:tx(40)},now);
  assert.equal(fresh.due,false);assert.equal(fresh.reason,null);assert.equal(fresh.days,29);
});
test('backup: never backed up',()=>{
  assert.deepEqual(backupDue({lastBackup:null,transactions:tx(10)},now),{due:true,days:null,reason:'never'});
  assert.equal(backupDue({lastBackup:null,transactions:tx(9)},now).due,false,'4.0 data without createdAt and few rows');
  assert.equal(backupDue({lastBackup:null,transactions:tx(3),createdAt:'2026-10-06'},now).due,true,'8 days old');
  assert.equal(backupDue({lastBackup:null,transactions:tx(3),createdAt:'2026-10-11'},now).due,false,'3 days old');
  assert.equal(backupDue({lastBackup:null,transactions:tx(3),createdAt:'2026-10-07'},now).reason,'never','7 days old');
});
test('backup: unreadable values never throw',()=>{
  assert.equal(backupDue(null,now).due,false);
  assert.equal(backupDue({lastBackup:'x',transactions:'x'},now).due,false);
  assert.equal(backupDue({lastBackup:'garbage',transactions:tx(12)},now).reason,'never','a bad date counts as no backup');
});
test('backup: sync covers the reminder only while it is on and recent',()=>{
  assert.equal(syncCovers(null,now),false);
  assert.equal(syncCovers({gistId:'g',lastSyncAt:back(2)},now),true);
  assert.equal(syncCovers({gistId:'g',lastSyncAt:back(31)},now),false);
  assert.equal(syncCovers({gistId:'g',auto:false,lastSyncAt:back(1)},now),false,'paused');
  assert.equal(syncCovers({gistId:'g',pendingChoice:{},lastSyncAt:back(1)},now),false,'waiting for a choice');
  assert.equal(syncCovers({lastSyncAt:back(1)},now),false,'not connected');
});
test('backup: the persist record is normalised',()=>{
  assert.equal(PERSIST_KEY,'ofek-persist-v1');
  assert.deepEqual(persistState(null),{asked:null,result:null});
  assert.deepEqual(persistState('{bad'),{asked:null,result:null});
  assert.deepEqual(persistState('[]'),{asked:null,result:null});
  assert.deepEqual(persistState('{"asked":"2026-10-01","result":true}'),{asked:'2026-10-01',result:true});
  assert.deepEqual(persistState({asked:5,result:'yes'}),{asked:null,result:null});
});
test('backup: storage sizes in MB with one decimal',()=>{
  assert.equal(storageText(0),'0.0 MB');
  assert.equal(storageText(1572864),'1.5 MB');
  assert.equal(storageText(2147483648),'2,048.0 MB');
  assert.equal(storageText('x'),'0.0 MB');
});
