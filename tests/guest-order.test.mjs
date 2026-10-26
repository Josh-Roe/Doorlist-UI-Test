import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedGuests} from '../guest-list.js';
test('self is pinned once, unanswered guests follow responses, and input RSVPs stay unchanged',()=>{
 const people=[{id:'pending',name:'Pending',status:'invited'},{id:'me',name:'Me',status:'maybe'},{id:'maybe',name:'Maybe',status:'maybe'},{id:'going',name:'Going',status:'going'},{id:'unknown',name:'Unknown'}];
 const original=structuredClone(people);
 const result=orderedGuests(people,{id:'ME',name:'My account',photo:'https://images.example/me.jpg'});
 assert.deepEqual(result.map(p=>p.id),['ME','maybe','going','pending','unknown']);
 assert.equal(result[0].isSelf,true);assert.equal(result[0].status,'going');assert.equal(result[0].photo,'https://images.example/me.jpg');
 assert.deepEqual(people,original);
});
