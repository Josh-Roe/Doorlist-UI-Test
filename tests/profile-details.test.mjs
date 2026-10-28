import test from 'node:test';
import assert from 'node:assert/strict';
import {DoorlistProvider,normalizeRsvpAppearance,profileShareUrl} from '../doorlist-provider.mjs';
test('profile details fetch only the authenticated account and cache its friends own photos',async()=>{
 const p=new DoorlistProvider();p.profile={id:'self',name:'Old'};const paths=[];
 p.api=async(path,options)=>{paths.push(path);
  if(path==='/api/users/uuid/self')return {uuid:'self',name:'Actual Name',school:'BERK',friends:['a','b','a'],profilePicture:'https://photos.example/self.jpg'};
  if(path==='/api/users/light_details'){assert.deepEqual(JSON.parse(options.body).uuids,['a','b']);return {a:{name:'Actual A',profilePictureUrl:'https://photos.example/a.jpg'},b:{name:'Actual B',profilePictureUrl:'https://photos.example/b.jpg'}};}
  if(path==='/api/users/groups/self')return {groups:[{id:'my-group',name:'My group'}]};throw Error('Unexpected path');
 };
 const result=await p.loadProfile();assert.equal(result.profile.name,'Actual Name');assert.equal(result.profile.friendCount,2);assert.equal(result.profile.groupCount,1);assert.equal(result.profile.school,'BERK');assert.equal(result.profile.friends[0].photo,'https://photos.example/a.jpg');assert.ok(result.profiles.find(person=>person.id==='a'));assert.ok(!paths.some(path=>path.includes('other-account')));
});
test('profile sharing follows the official public profile URL format',()=>{
 const url=profileShareUrl('12345678-abcd-1234-abcd-123456789abc','nativeShort');assert.match(url,/^https:\/\/doorlist.app\/p\/[a-zA-Z0-9]{54}\?s=nativeShort$/);assert.equal(profileShareUrl('bad-id'), '');
});
test('RSVP appearance uses each event theme and strips invalid CSS values',()=>{
 const result=normalizeRsvpAppearance({themeURL:'https://media.example/theme.mp4',rsvpLottieStyle:'Monkeys',isEventChatAllowed:false,photoColorPalette:{bgColor:'#222222'}},{colorPalette:{bgColor:'#884422',accentColor:'url(evil)'},gradientColors:['#f24a21','#8b2233','url(evil)']});
 assert.equal(result.background,'#884422');assert.equal(result.accent,null);assert.deepEqual(result.gradientColors,['#f24a21','#8b2233']);assert.equal(result.style,'Monkeys');assert.equal(result.commentsEnabled,false);
});
test('the profile retains Doorlist total event count separately from its upcoming preview',async()=>{
 const p=new DoorlistProvider();p.profile={id:'self'};p.token=async()=>'test-token';p.loadOwnPastEvents=async events=>events;
 p.api=async path=>path.startsWith('/api/users/uuid/')?{uuid:'self',name:'Self',friends:[]}:path.startsWith('/api/users/groups/')?{groups:[]}:path.startsWith('/api/events/profile/')?{eventCount:7,lightEvents:[{eventId:'upcoming-1',name:'Upcoming',time:Date.now()+3600000}]}:{};
 const result=await p.loadProfile();assert.equal(result.profile.eventCount,7);assert.equal(result.profile.eventCountComplete,true);assert.equal(result.profile.events.length,1);assert.equal(result.profile.detailsVersion,10);
});
test('past event discovery is constrained to the authenticated user guest records',async()=>{
 const p=new DoorlistProvider();p.profile={id:'self'};p.firebase=async()=>'test-token';let read=[];
 p.request=async(_url,options)=>{const query=JSON.parse(options.body).structuredQuery;assert.equal(query.where.fieldFilter.value.stringValue,'self');return [{document:{fields:{uuid:{stringValue:'self'},eventID:{stringValue:'past-own'},ticketCount:{integerValue:'1'}}}},{document:{fields:{uuid:{stringValue:'other-user'},eventID:{stringValue:'past-other'}}}}];};
 p.firestore=async path=>{read.push(path);return {fields:{name:{stringValue:'Actual past event'},time:{timestampValue:'2020-01-01T00:00:00Z'},endTime:{timestampValue:'2020-01-02T00:00:00Z'}}};};
 const events=await p.loadOwnPastEvents([]);assert.deepEqual(read,['eventObjects/past-own']);assert.equal(events[0].id,'past-own');
});
test('the account feed preserves past events and counts actual going RSVPs',async()=>{
 const p=new DoorlistProvider();p.profile={id:'self'};p.token=async()=>'web-token';p.firebase=async()=>'native-token';
 const rows=[{id:'past-going',name:'Actual past event',time:'2020-01-01T00:00:00Z',endTime:'2020-01-02T00:00:00Z'},{id:'future-going',name:'Upcoming',time:'2030-01-01T00:00:00Z'},{id:'invited-only',name:'Invitation only',time:'2020-01-01T00:00:00Z'}];
 p.api=async()=>({events:rows});p.request=async()=>({events:rows});p.campusEvents=async()=>({events:[]});
 p.firestore=async path=>({fields:{uuid:{stringValue:'self'},rsvpStatus:{stringValue:path.includes('invited-only')?'invited':'going'}}});
 const events=await p.loadOwnPastEvents([]);assert.deepEqual(events.map(event=>event.id).sort(),['future-going','past-going']);assert.equal(p.profileEventLookupStatus,200);assert.equal(p.profileRecordCoverage.statuses.invited,1);
});
test('public campus history only contributes events with this account’s own going record',async()=>{
 const p=new DoorlistProvider();p.profile={id:'self'};p.token=async()=>'web';p.firebase=async()=>'native';
 p.api=async()=>({events:[{id:'upcoming',name:'Upcoming'}]});p.request=async()=>{throw Object.assign(Error('Denied'),{status:401});};
 p.campusEvents=async()=>({events:[{id:'past-own',name:'Past own',time:'2020-01-01T00:00:00Z'},{id:'past-not-mine',name:'Not mine',time:'2020-01-01T00:00:00Z'}]});
 p.firestore=async path=>{assert.ok(path.endsWith('/guests/self'));if(path.includes('past-not-mine'))throw Object.assign(Error('No record'),{status:404});return {fields:{uuid:{stringValue:'self'},rsvpStatus:{stringValue:'going'}}};};
 const events=await p.loadOwnPastEvents([]);assert.deepEqual(events.map(e=>e.id).sort(),['past-own','upcoming']);assert.equal(p.profileEventLookupStatus,200);
});

test('an admitted past guest remains in history before answering RSVP',async()=>{
 const p=new DoorlistProvider();p.profile={id:'self'};p.token=async()=>'web';p.firebase=async()=>'native';p.api=async()=>({events:[{id:'past-admitted',name:'Admitted past event'}]});p.request=async()=>({events:[]});p.campusEvents=async()=>({events:[]});
 p.firestore=async()=>({fields:{uuid:{stringValue:'self'},ticketCount:{integerValue:'1'}}});const events=await p.loadOwnPastEvents([]);assert.equal(events.length,1);assert.equal(events[0].rsvp,'invited');assert.equal(events[0].hasAdmission,true);
});
test('a partial account feed does not claim its known events are the full native total',async()=>{
 const p=new DoorlistProvider();p.profile={id:'self'};p.token=async()=>'web';p.firebase=async()=>'native';p.loadOwnPastEvents=async()=>[{id:'past-known',title:'Known past'}];
 p.api=async path=>path.startsWith('/api/users/uuid/')?{uuid:'self',name:'Self',friends:[]}:path.startsWith('/api/events/profile/')?{eventCount:0,lightEvents:[]}:{};p.request=async()=>({eventCount:35,lightEvents:[]});
 const {profile}=await p.loadProfile();assert.equal(profile.eventCount,1);assert.equal(profile.eventCountComplete,false);
});
