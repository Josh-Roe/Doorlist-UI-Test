import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationPreview} from '../notification-feed.js';
test('notification previews use unique actual cached identities and their own photos',()=>{
 const profiles=Array.from({length:20},(_,i)=>({id:`id-${i}`,name:`Cached ${i}`,photo:`https://example.com/${i}.jpg`}));
 const rows=createNotificationPreview({profiles:[...profiles,profiles[0],{id:'bad',name:'No photo'}],selfId:'id-0',events:[{id:'event-a',title:'Plan'}],seed:3});
 assert.equal(rows.length,19);assert.equal(new Set(rows.map(row=>row.person.id)).size,19);
 rows.forEach(row=>{assert.equal(row.preview,true);assert.notEqual(row.person.id,'id-0');assert.equal(row.person.photo,profiles.find(p=>p.id===row.person.id).photo);assert.equal(row.event.id,'event-a');assert.notEqual(row.other.id,row.person.id);assert.notEqual(row.other.id,'id-0');assert.equal(row.other.photo,profiles.find(p=>p.id===row.other.id).photo);});
 assert.deepEqual(rows,createNotificationPreview({profiles,selfId:'id-0',events:[{id:'event-a',title:'Plan'}],seed:3}));
});
test('an empty profile cache creates no invented identities',()=>assert.deepEqual(createNotificationPreview(),[]));
