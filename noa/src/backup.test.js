import test from 'node:test';
import assert from 'node:assert/strict';
import {backupPayload,parseBackup,backupDue,backupFileName,countsLine,BACKUP_KIND,BACKUP_DAYS} from './backup.js';
import {demoData,emptyData} from './model.js';

test('a backup round-trips, photos included',()=>{
  const d=demoData('2026-10-18');
  const payload=backupPayload(d,{photos:{ph1:{full:'data:image/jpeg;base64,AAAA',thumb:null,w:1,h:1}},now:new Date('2026-10-18T10:00:00Z')});
  assert.equal(payload.kind,BACKUP_KIND);assert.equal(payload.exported,'2026-10-18T10:00:00.000Z');
  const back=parseBackup(JSON.stringify(payload));
  assert.deepEqual(back.data.places,d.places);
  assert.deepEqual(Object.keys(back.photos),['ph1']);
  assert.equal(back.counts.places,d.places.length);
  assert.ok(!('photos' in backupPayload(d,{photos:{}})),'no empty photos block');
  assert.equal(backupFileName('2026-10-18'),'noa-backup-2026-10-18.json');
  assert.equal(backupFileName('2026-10-18',true),'noa-backup-2026-10-18-with-photos.json');
});

test('parseBackup accepts a bare data object and a BOM, rejects anything else in Hebrew',()=>{
  const bare=JSON.stringify({version:1,facts:[{id:'a',title:'סושי'}]});
  assert.equal(parseBackup('﻿'+bare).data.facts.length,1);
  for(const bad of ['not json','[]','{"hello":1}','{"kind":"noa-backup","app":"נועה"}',JSON.stringify({kind:BACKUP_KIND,app:'נועה',data:{version:1,places:'x'}})])
    assert.throws(()=>parseBackup(bad),err=>/[֐-׿]/.test(err.message));
  assert.throws(()=>parseBackup(JSON.stringify({version:9,facts:[]})),/גרסה חדשה/);
});

test('backupDue: never for the demo or an empty start; after 30 days; or once there is something to lose',()=>{
  assert.equal(backupDue(demoData('2026-10-18'),'2026-10-18').due,false);
  assert.equal(backupDue(emptyData(),'2026-10-18').due,false);
  const d=emptyData();
  d.facts=Array.from({length:10},(_,i)=>({id:'f'+i,title:'x',created:'2026-10-17T10:00:00Z'}));
  assert.deepEqual(backupDue(d,'2026-10-18'),{due:true,days:null,reason:'never'});
  d.facts=d.facts.slice(0,2);assert.equal(backupDue(d,'2026-10-18').due,false);
  d.facts[0].created='2026-10-01T10:00:00Z';assert.equal(backupDue(d,'2026-10-18').reason,'never','two weeks old');
  d.prefs.lastBackup='2026-10-01T09:00:00Z';
  assert.deepEqual(backupDue(d,'2026-10-18'),{due:false,days:17,reason:null});
  assert.deepEqual(backupDue(d,'2026-10-31'),{due:true,days:BACKUP_DAYS,reason:'old'});
});

test('countsLine',()=>{
  assert.equal(countsLine({facts:3,people:0,places:2,dates:0,gifts:0,plans:0,memories:1,photos:4}),'3 עובדות · 2 מקומות · 1 זיכרונות · 4 תמונות');
  assert.equal(countsLine({}),'ריק');
});
