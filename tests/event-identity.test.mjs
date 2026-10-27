import test from 'node:test';
import assert from 'node:assert/strict';
import {deduplicateEvents} from '../event-identity.js';
const first={id:'aepi',title:'Monster Mash Band Night',startsAt:'2026-10-30T03:00:00.000Z',locationAddress:'2430 Piedmont Avenue, Berkeley, CA',access:'discover',goingCount:3};
test('matching cross-posts collapse across host names and street abbreviations without adding RSVP counts',()=>{
 const result=deduplicateEvents([first,{...first,id:'arts',host:'Arts 4 Change',locationAddress:'2430 Piedmont Ave, Berkeley, CA',goingCount:4}]);
 assert.equal(result.length,1);assert.equal(result[0].id,'arts');assert.equal(result[0].goingCount,4);assert.deepEqual(result[0].duplicateEventIds,['aepi']);
});
test('separate dates, venues and MONSTER MOSH remain separate events',()=>{
 assert.equal(deduplicateEvents([first,{...first,id:'next-week',startsAt:'2026-11-06T03:00:00.000Z'},{...first,id:'another-venue',locationAddress:'100 College Ave, Berkeley, CA'},{...first,id:'mosh',title:'MONSTER MOSH'}]).length,4);
});
test('an invited event wins over a public cross-post without borrowing its count',()=>{
 const result=deduplicateEvents([first,{...first,id:'mine',access:'invited',goingCount:2},{...first,id:'public',goingCount:40}]);
 assert.equal(result[0].id,'mine');assert.equal(result[0].goingCount,2);
});
test('missing addresses require matching artwork instead of title alone',()=>{
 const noAddress={...first,locationAddress:'',location:'Location not shared'};
 assert.equal(deduplicateEvents([noAddress,{...noAddress,id:'different'}]).length,2);
 const image='https://images.example/poster.jpg?width=800';
 assert.equal(deduplicateEvents([{...noAddress,image},{...noAddress,id:'copy',image:'https://images.example/poster.jpg?width=400'}]).length,1);
});
test('an address-less cross-post never bridges two known different venues',()=>{
 const image='https://images.example/shared.jpg';
 assert.equal(deduplicateEvents([{...first,image},{...first,id:'unknown',locationAddress:'',location:'',image},{...first,id:'other',locationAddress:'999 College Ave',image}]).length,2);
});
