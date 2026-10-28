import test from 'node:test';
import assert from 'node:assert/strict';
import {DoorlistProvider,normalizeEvent} from '../doorlist-provider.mjs';
test('RSVP totals come from source counts rather than generated display badges',()=>{
 const event=normalizeEvent({id:'event-123',name:'Event',goingCount:528,maybeCount:16});assert.equal(event.goingCount,528);assert.equal(event.maybeCount,16);
 assert.equal(normalizeEvent({id:'event-123',name:'Event'}).maybeCount,null);
});
test('Invited by uses the actual guest record and never substitutes a host member',async()=>{
 const p=new DoorlistProvider();p.profile={id:'signed-in-user'};let reads=0;
 p.api=async(path,options)=>{reads++;assert.equal(path,'/api/users/light_details');assert.deepEqual(JSON.parse(options.body).uuids,['actual-inviter']);return {'actual-inviter':{name:'Actual Inviter',profilePictureUrl:'https://photos.example/actual.jpg'}};};
 assert.equal(await p.resolveInviter({}),null);assert.equal(reads,0);
 const person=await p.resolveInviter({addedBy:'actual-inviter'});assert.equal(person.name,'Actual Inviter');assert.equal(person.source,'doorlist-guest-record');assert.equal(p.listProfiles()[0].photo,'https://photos.example/actual.jpg');
});
test('host member lookup is read-only and caches only the returned members own photos',async()=>{
 const p=new DoorlistProvider();p.profile={id:'self'};p.allowedEvents.set('event-123',{id:'event-123',hostId:'real-group',host:'Actual group'});
 const calls=[];p.api=async(path,options)=>{calls.push(path);if(path==='/api/group/real-group')return {name:'Actual group',members:['actual-member']};assert.deepEqual(JSON.parse(options.body).uuids,['actual-member']);return {'actual-member':{name:'Actual member',profilePictureUrl:'https://photos.example/member.jpg'}};};
 const result=await p.loadHostMembers('event-123');assert.equal(result.group.members[0].id,'actual-member');assert.equal(result.profiles[0].photo,'https://photos.example/member.jpg');assert.ok(!calls.some(path=>/invite|request/.test(path)));
});

test('host member reads honor the authorized organization document when the public summary omits members',async()=>{
 const p=new DoorlistProvider();p.profile={id:'self'};p.allowedEvents.set('event-123',{id:'event-123',hostId:'host-group',host:'Host'});
 p.api=async path=>path.startsWith('/api/group/')?{name:'Host',members:[]}:{'member-one':{name:'Member One',profilePicture:'https://photos.example/one.jpg'}};
 p.firestore=async path=>{assert.equal(path,'organizations/host-group');return {fields:{members:{arrayValue:{values:[{stringValue:'member-one'}]}}}};};
 const {group}=await p.loadHostMembers('event-123');assert.equal(group.members[0].name,'Member One');
});
