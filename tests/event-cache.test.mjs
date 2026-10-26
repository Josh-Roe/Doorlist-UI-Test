import test from 'node:test';
import assert from 'node:assert/strict';
import {createEventStore} from '../event-store.js';
const memory=()=>{const values=new Map();return{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const profile={id:'account-a',name:'Account A'};
const saved={profile,events:[{id:'saved-event',title:'Saved plan',guests:[]}],profiles:[{id:'real-person',name:'Actual profile',photo:'https://images.example/person.jpg'}],suggestedFriends:[],syncedAt:'2026-10-26T19:00:00Z'};
async function prime(storage){const store=createEventStore({storage,fetchImpl:async path=>Response.json(path==='/api/session'?{authenticated:true,profile}:saved)});await store.initialize();return store;}
test('reopening displays saved data synchronously and replaces it only after background refresh completes',async()=>{
 const storage=memory();await prime(storage);let finish;
 const store=createEventStore({storage,fetchImpl:async path=>path==='/api/session'?Response.json({authenticated:true,profile}):new Promise(resolve=>{finish=()=>resolve(Response.json({...saved,events:[{id:'new-event',title:'New plan',guests:[]}]}));})});
 assert.equal(store.mode,'cached');assert.equal(store.getEvent('saved-event').title,'Saved plan');
 const updating=store.initialize();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(store.status,'ready');assert.equal(store.listEvents().length,1);
 assert.equal(store.previewPeople(store.getEvent('saved-event'))[0].id,'real-person');
 finish();await updating;assert.equal(store.listEvents()[0].id,'new-event');
});
test('a failed refresh preserves the saved screen; an expired session clears the cache',async()=>{
 const storage=memory();await prime(storage);
 const offline=createEventStore({storage,fetchImpl:async()=>{throw Error('Offline');}});await offline.initialize();
 assert.equal(offline.getEvent('saved-event').title,'Saved plan');
 const expired=createEventStore({storage,fetchImpl:async()=>Response.json({authenticated:false,profile:null})});await expired.initialize();
 assert.equal(expired.listEvents().length,0);assert.equal(storage.getItem('doorlist-account-view-v1'),null);
});
test('account switching clears earlier guests and rejects late refresh responses',async()=>{
 const storage=memory();await prime(storage);let resolveOld;
 const store=createEventStore({storage,fetchImpl:async path=>{
  if(path==='/api/session')return Response.json({authenticated:true,profile});
  if(path==='/api/auth/disconnect')return Response.json({disconnected:true});
  return new Promise(resolve=>{resolveOld=()=>resolve(Response.json(saved));});
 }});
 const loading=store.initialize();await new Promise(resolve=>setImmediate(resolve));await store.disconnect();resolveOld();await loading;
 assert.equal(store.listEvents().length,0);assert.equal(store.getProfiles().length,0);assert.equal(store.authenticated,false);
 const other=createEventStore({storage,fetchImpl:async path=>Response.json(path==='/api/session'?{authenticated:true,profile:{id:'account-b',name:'B'}}:{profile:{id:'account-b',name:'B'},events:[]})});
 await other.initialize();assert.deepEqual(other.getProfiles(),[]);
});
test('cache storage failures do not prevent login or event loading',async()=>{
 const store=await prime({getItem(){throw Error('Unavailable');},setItem(){throw Error('Full');},removeItem(){}});
 assert.equal(store.getEvent('saved-event').title,'Saved plan');
});
