import {displayEventTitle} from '../event-typography.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DoorlistProvider,normalizeEvent,normalizeEventFont} from '../doorlist-provider.mjs';
const now=Date.parse('2026-10-26T12:00:00Z');
const raw=extra=>({eventId:'font-event',name:'MONSTER MOSH',time:now+3600000,endTime:now+7200000,...extra});
function provider(){const p=new DoorlistProvider({clock:()=>now});p.profile={id:'fixture',school:'NONE'};p.accessToken='fixture-only';p.expiresAt=now+3600000;p.enrichEventPhotos=async()=>{};p.groupEvents=p.campusEvents=async()=>({events:[]});return p;}
test('event typography follows each supported Doorlist font, including Glitch and Serif',()=>{
 for(const fontFamily of ['Glitch','BricolageGrotesque','Bartle','Graffiti','Pixelify','Varela','Serif','Schoolbell','Limelight','Norican'])assert.equal(normalizeEvent(raw({fontFamily})).fontFamily,fontFamily);
 for(const font of [null,undefined,'','unknown','Glitch; color:red','https://example.com/font.ttf'])assert.equal(normalizeEventFont(font),null);
});
test('sparse account feeds and refreshes preserve the event font from a richer source',async()=>{
 const p=provider();let rich=true;
 p.api=async path=>path.includes('forUser')?{events:[raw()]}:path.includes('home-feed')?{lightEvents:rich?[raw({fontFamily:'Glitch'})]:[]}:{events:[]};
 assert.equal((await p.syncEvents()).events[0].fontFamily,'Glitch');rich=false;
 assert.equal((await p.syncEvents()).events[0].fontFamily,'Glitch');
});
test('detail refresh retains a missing font and applies a changed font',async()=>{
 const p=provider();p.allowedEvents.set('font-event',normalizeEvent(raw({fontFamily:'Glitch'}),'invited'));p.api=async()=>({});
 let fontFamily;
 p.firestore=async path=>{if(path.includes('/guests/'))throw new Error('No guest document');return {fields:{name:{stringValue:'MONSTER MOSH'},...(fontFamily?{fontFamily:{stringValue:fontFamily}}:{})}};};
 assert.equal((await p.loadEvent('font-event')).fontFamily,'Glitch');fontFamily='Serif';
 assert.equal((await p.loadEvent('font-event')).fontFamily,'Serif');
});
test('home enrichment loads a font even if the address, count and background are already cached',async()=>{
 const p=new DoorlistProvider({clock:()=>now});p.api=async()=>({guests:[]});let count=0;
 p.firestore=async()=>{count++;return {fields:{fontFamily:{stringValue:'Glitch'}}};};
 const event={...normalizeEvent(raw({location:'123 College Ave',goingCount:12})),background:{url:'https://example.com/theme.jpg',kind:'image'}};
 await p.enrichEventPhotos([event]);assert.equal(count,1);assert.equal(event.fontFamily,'Glitch');assert.equal(event.locationAddress,'123 College Ave');
});

test('canonical event spelling is preserved instead of copying feed capitalization',async()=>{
 const p=new DoorlistProvider({clock:()=>now});p.api=async()=>({guests:[]});p.firestore=async()=>({fields:{name:{stringValue:'Source mixed CASE'},fontFamily:{stringValue:'Schoolbell'}}});
 const event=normalizeEvent(raw());await p.enrichEventPhotos([event]);assert.equal(event.title,'Source mixed CASE');assert.equal(event.fontFamily,'Schoolbell');
});

test('native display capitalization follows the font style without changing source names',()=>{
 for(const fontFamily of ['Serif','Bartle']){const event={title:'A mixed Case Event',fontFamily};assert.equal(displayEventTitle(event),'A MIXED CASE EVENT');assert.equal(event.title,'A mixed Case Event');}
 for(const fontFamily of ['BricolageGrotesque','Glitch','Schoolbell','Limelight','Norican',null])assert.equal(displayEventTitle({title:'Original mixed Case',fontFamily}),'Original mixed Case');
});
