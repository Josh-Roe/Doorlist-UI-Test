import test from 'node:test';
import assert from 'node:assert/strict';
import { eventStore } from '../event-store.js';

test('unavailable lists use actual cached profile suggestions; real lists stay real and expired sessions require login', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let responseType = 'denied';
  globalThis.fetch = async path => {
    if (path === '/api/session') return Response.json({ authenticated:true, profile:{id:'test-user',name:'Test User'} });
    if (path === '/api/events') return Response.json({ events:[{id:'event-123',guests:[]}],profile:{id:'test-user',name:'Test User'},coverage:{} });
    if (responseType === 'expired') return Response.json({error:'Session expired'},{status:401});
    if (responseType === 'network') throw new Error('Offline');
    if (responseType === 'real') return Response.json({guests:[{id:'real-guest',name:'Real Fixture Guest',status:'going'}],restricted:false,partial:false});
    return Response.json({guests:[{id:'cached-person',name:'Actual Profile Fixture',photo:'https://images.example/profile.jpg',status:'unconfirmed'}],restricted:true,partial:false,source:'profile-cache'});
  };
  await eventStore.initialize();
  const fallback = await eventStore.loadGuests('event-123');
  assert.equal(fallback.generated,true);
  assert.equal(fallback.source,'profile-cache');
  assert.equal(fallback.guests[0].id,'cached-person');
  assert.ok(fallback.guests.length > 0);
  assert.equal(eventStore.getEvent('event-123').guestListSource,'profile-cache');
  responseType = 'network';
  assert.equal((await eventStore.loadGuests('event-123')).guests.length,1);
  responseType = 'real';
  const real = await eventStore.loadGuests('event-123');
  assert.equal(real.generated,false);
  assert.equal(real.guests.length,1);
  assert.equal(eventStore.getEvent('event-123').guestListGenerated,false);
  responseType = 'expired';
  await assert.rejects(eventStore.loadGuests('event-123'), /Session expired/);
  assert.equal(eventStore.authenticated,false);
  assert.equal(eventStore.listEvents().length,0);
});
test('guest pages append without duplicates and pagination failures preserve the loaded list',async t=>{
 const originalFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=originalFetch;});let fail=false;
 globalThis.fetch=async path=>{
  if(path==='/api/session')return Response.json({authenticated:true,profile:{id:'self',name:'Self'}});
  if(path==='/api/events')return Response.json({events:[{id:'paged-event',guests:[]}],profile:{id:'self',name:'Self'}});
  if(path.includes('cursor=')){
   if(fail)return Response.json({error:'Try again'},{status:502});
   return Response.json({guests:[{id:'one',name:'One',status:'going'},{id:'two',name:'Two',status:'invited'}],restricted:false,nextPageToken:'third'});
  }
  return Response.json({guests:[{id:'one',name:'One',status:'going'}],restricted:false,nextPageToken:'second'});
 };
 await eventStore.initialize();await eventStore.loadGuests('paged-event');
 await eventStore.loadGuests('paged-event',{append:true});
 assert.equal(eventStore.getGuests('paged-event').length,2);
 assert.equal(eventStore.getEvent('paged-event').guestListNextCursor,'third');
 fail=true;await assert.rejects(eventStore.loadGuests('paged-event',{append:true}),/Try again/);
 assert.equal(eventStore.getGuests('paged-event').length,2);
 assert.equal(eventStore.getEvent('paged-event').guestListGenerated,false);
});
