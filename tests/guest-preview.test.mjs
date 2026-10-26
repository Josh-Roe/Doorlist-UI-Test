import test from 'node:test';
import assert from 'node:assert/strict';
import { eventStore, generateGuestPreview } from '../event-store.js';

test('generated guests are stable, explicitly fictional, and use unique IDs', () => {
  const guests = generateGuestPreview('event-123');
  assert.deepEqual(guests, generateGuestPreview('event-123'));
  assert.notDeepEqual(guests, generateGuestPreview('event-456'));
  assert.ok(guests.length >= 18 && guests.length <= 24);
  assert.equal(new Set(guests.map(guest => guest.id)).size, guests.length);
  assert.ok(guests.every(guest => guest.generated && ['going','maybe'].includes(guest.status)));
});
test('unavailable lists generate previews; real lists stay real and expired sessions require login', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let responseType = 'denied';
  globalThis.fetch = async path => {
    if (path === '/api/session') return Response.json({ authenticated:true, profile:{id:'test-user',name:'Test User'} });
    if (path === '/api/events') return Response.json({ events:[{id:'event-123',guests:[]}],profile:{id:'test-user',name:'Test User'},coverage:{} });
    if (responseType === 'expired') return Response.json({error:'Session expired'},{status:401});
    if (responseType === 'network') throw new Error('Offline');
    if (responseType === 'real') return Response.json({guests:[{id:'real-guest',name:'Real Fixture Guest',status:'going'}],restricted:false,partial:false});
    return Response.json({guests:[],restricted:true,partial:false});
  };
  await eventStore.initialize();
  const fallback = await eventStore.loadGuests('event-123');
  assert.equal(fallback.generated,true);
  assert.ok(fallback.guests.length > 0);
  assert.equal(eventStore.getEvent('event-123').guestListGenerated,true);
  responseType = 'network';
  assert.equal((await eventStore.loadGuests('event-123')).generated,true);
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
