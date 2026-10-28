import test from 'node:test';
import assert from 'node:assert/strict';
import {DoorlistProvider,ProviderError} from '../doorlist-provider.mjs';
const doc=(path,fields)=>({name:`projects/test/databases/(default)/documents/${path}`,updateTime:'2026-10-27T00:00:00Z',fields:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:{integerValue:String(v)}]))});
function fixture({admitted=true,approval=false,visibility='EventVisibility.PUBLIC',writeFailure=false}={}) {
 const p=new DoorlistProvider();p.profile={id:'me',name:'Me'};p.allowedEvents.set('event-123',{id:'event-123',sourceUrl:'https://doorlist.app/e/event12',rsvp:'invited',goingCount:10,guests:[]});
 p.firestore=async path=>path.endsWith('/me')?doc(path,{ticketCount:admitted?1:0}):doc(path,{joinByLinkRequiresApproval:approval,visibility});
 p.firebase=async()=>'test-token';p.writes=[];
 p.request=async(url,options)=>{p.writes.push({url,body:JSON.parse(options.body)});if(writeFailure)throw new ProviderError('Denied',403);return {};};return p;
}
test('admitted users update only their own RSVP with document preconditions',async()=>{
 const p=fixture();const result=await p.setRsvp('event-123','going');
 assert.equal(result.event.rsvp,'going');assert.equal(result.event.goingCount,11);
 const writes=p.writes[0].body.writes;assert.ok(writes[0].verify.endsWith('/eventObjects/event-123'));assert.ok(writes[1].update.name.endsWith('/guests/me'));
 assert.equal(writes[1].update.fields.rsvpStatus.stringValue,'going');assert.equal(writes[1].currentDocument.updateTime,'2026-10-27T00:00:00Z');
 assert.deepEqual(writes[1].updateMask.fieldPaths,['rsvpStatus','uuid','eventID']);assert.ok(!('ticketCount' in writes[1].update.fields));
});
test('invalid statuses and unknown events cannot write',async()=>{
 const p=fixture();await assert.rejects(p.setRsvp('event-123','admin'),e=>e.status===400);await assert.rejects(p.setRsvp('not-allowed','going'),e=>e.status===404);assert.equal(p.writes.length,0);
});
test('restricted and private events without admission require the official access flow',async()=>{
 for(const options of [{admitted:false,approval:true},{admitted:false,visibility:'EventVisibility.PRIVATE'}]){
  const p=fixture(options);await assert.rejects(p.setRsvp('event-123','going'),e=>e.status===403);assert.equal(p.writes.length,0);assert.equal(p.requireEvent('event-123').rsvp,'invited');
 }
});
test('upstream failure never reports or caches a successful RSVP',async()=>{
 const p=fixture({writeFailure:true});await assert.rejects(p.setRsvp('event-123','maybe'),/Denied/);assert.equal(p.requireEvent('event-123').rsvp,'invited');
});
test('free open events use Doorlist server approval before changing RSVP',async()=>{
 const p=fixture({admitted:false});let called;
 p.rsvpOpenEvent=async(event,status)=>{called={id:event.id,status};};
 await p.setRsvp('event-123','not-going');assert.deepEqual(called,{id:'event-123',status:'notGoing'});assert.equal(p.writes.length,0);
});
test('the official web action must return a successful result before an open RSVP is saved',async()=>{
 for(const success of [true,false]){
  const p=fixture({admitted:false});p.token=async()=>'test-supabase';let body;
  p.fetch=async(url,options)=>url.includes('/_next/')?new Response(`createServerReference)("${'a'.repeat(40)}",a.callServer,void 0,a.findSourceMapURL,"rsvpForOpenFreeEvent")`):(body=JSON.parse(options.body),new Response(`0:{"a":"$@1"}\n1:{"status":${success?200:403}}\n`));
  if(success){await p.setRsvp('event-123','maybe');assert.deepEqual(body,['test-supabase','event-123','maybe']);assert.equal(p.requireEvent('event-123').rsvp,'maybe');}
  else {await assert.rejects(p.setRsvp('event-123','maybe'),e=>e.status===409);assert.equal(p.requireEvent('event-123').rsvp,'invited');}
 }
});

function commentFixture({admitted=true,allowed=true,commentsEnabled=true,failWrite=false}={}) {
 const p=fixture({admitted}),messages=new Map();let guestStatus='invited';p.moderations=0;
 p.firestore=async path=>{
  if(path.includes('/messages/')){const value=messages.get(path.split('/').at(-1));if(!value)throw new ProviderError('Not found',404);return value;}
  return path.endsWith('/me')?doc(path,{ticketCount:admitted?1:0,rsvpStatus:guestStatus}):doc(path,{joinByLinkRequiresApproval:false,visibility:'EventVisibility.PUBLIC',isEventChatAllowed:commentsEnabled});
 };
 p.api=async(path,options)=>{assert.equal(path,'/api/vtb');p.moderations++;assert.equal(JSON.parse(options.body).message,'See you there');return {allowed};};
 p.request=async(url,options)=>{if(failWrite)throw new ProviderError('Temporary failure',502);const body=JSON.parse(options.body);p.writes.push({url,body});for(const write of body.writes){if(write.update?.name.includes('/messages/'))messages.set(write.update.name.split('/').at(-1),write.update);if(write.update?.fields.rsvpStatus&&write.update.name.endsWith('/guests/me'))guestStatus=write.update.fields.rsvpStatus.stringValue;}return {};};
 p.rsvpOpenEvent=async()=>{guestStatus='going';};return p;
}
test('RSVP comments are moderated and committed with the same authenticated RSVP',async()=>{
 const p=commentFixture(),submissionId=crypto.randomUUID();
 const result=await p.setRsvp('event-123','going',{comment:'See you there',submissionId});
 assert.equal(result.commentSent,true);assert.equal(p.moderations,1);assert.equal(p.writes.length,1);
 const writes=p.writes[0].body.writes;assert.equal(writes.length,3);
 const message=writes[2];assert.equal(message.update.fields.sender.stringValue,'me');assert.equal(message.update.fields.eventId.stringValue,'event-123');assert.equal(message.update.fields.message.stringValue,'See you there');assert.equal(message.currentDocument.exists,false);assert.ok(message.update.name.endsWith('/messages/'+submissionId));
 assert.deepEqual(message.updateTransforms,[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]);
 await p.setRsvp('event-123','going',{comment:'See you there',submissionId});assert.equal(p.writes.length,1);assert.equal(p.moderations,1);
});
test('blocked comments do not change an RSVP or write a message',async()=>{
 for(const options of [{allowed:false},{commentsEnabled:false}]){const p=commentFixture(options);await assert.rejects(p.setRsvp('event-123','going',{comment:'See you there',submissionId:crypto.randomUUID()}));assert.equal(p.writes.length,0);assert.equal(p.requireEvent('event-123').rsvp,'invited');}
});
test('comments validate length and retry identifiers before any write',async()=>{
 const p=commentFixture();await assert.rejects(p.setRsvp('event-123','going',{comment:'x'.repeat(1001),submissionId:crypto.randomUUID()}),e=>e.status===400);await assert.rejects(p.setRsvp('event-123','going',{comment:'See you there',submissionId:'../../other'}),e=>e.status===400);assert.equal(p.writes.length,0);
});
test('an open-event RSVP can succeed while a comment failure is reported separately',async()=>{
 const p=commentFixture({admitted:false,failWrite:true});const result=await p.setRsvp('event-123','going',{comment:'See you there',submissionId:crypto.randomUUID()});assert.equal(result.event.rsvp,'going');assert.equal(result.commentSent,false);assert.match(result.commentError,/RSVP is saved/);
});
test('an open-event guest can join before message-read permission becomes available',async()=>{
 const p=commentFixture({admitted:false}),read=p.firestore;let joined=false;
 p.firestore=async path=>{if(path.includes('/messages/')&&!joined)throw new ProviderError('Read denied before joining',403);return read(path);};
 p.rsvpOpenEvent=async()=>{joined=true;};
 const result=await p.setRsvp('event-123','going',{comment:'See you there',submissionId:crypto.randomUUID()});assert.equal(joined,true);assert.equal(result.commentSent,true);assert.equal(p.writes.length,1);assert.ok(p.writes[0].body.writes[0].update.name.includes('/messages/'));
});
