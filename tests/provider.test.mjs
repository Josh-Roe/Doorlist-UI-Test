import test from 'node:test';
import assert from 'node:assert/strict';
import { DoorlistProvider, ProviderError, decodeFields, normalizeEvent, normalizeStatus } from '../doorlist-provider.mjs';
const now = Date.parse('2026-10-25T12:00:00Z');
const raw = (id, extra = {}) => ({ eventId: id, name: id, time: now + 3600000, endTime: now + 7200000, ...extra });
function provider() {
  const result = new DoorlistProvider({ clock: () => now });
  result.profile = { id: 'my-user', name: 'Test User' };
  result.accessToken = 'test-session-only'; result.expiresAt = now + 3600000;
  return result;
}
test('Firestore fields decode recursively without exposing unknown values', () => {
  assert.deepEqual(decodeFields({
    nested: { mapValue: { fields: { count: { integerValue: '3' }, yes: { booleanValue: true } } } },
    values: { arrayValue: { values: [{ stringValue: 'ok' }, { nullValue: null }] } },
  }), { nested: { count: 3, yes: true }, values: ['ok', null] });
});
test('event normalization preserves access distinction and rejects unsafe images', () => {
  assert.equal(normalizeEvent(raw('event-123'), 'discover').canRsvp, false);
  assert.equal(normalizeEvent(raw('event-123'), 'invited').canRsvp, true);
  assert.equal(normalizeEvent(raw('event-123', { eventCoverURL: 'javascript:bad()' })).image, '');
  assert.equal(normalizeEvent(raw('../bad')), null);
  assert.equal(normalizeEvent(raw('event-123', { time: null, endTime: null })).startsAt, null);
  assert.equal(normalizeStatus('Not Going'), 'not-going');
});
test('all event sources merge, deduplicate, sort, exclude ended events and retain invited status', async () => {
  const p = provider();
  p.api = async path => path.includes('forUser') ? { events: [raw('own-event')], eligibleEventCount: 1 }
    : path.includes('friendsOf') ? { events: [raw('friend-event'), raw('own-event'), raw('past-event', { endTime: now - 1 })] }
    : path.includes('home-feed') ? { lightEvents: [raw('recent-event')] }
    : { events: [raw('trend-event'), raw('friend-event')] };
  const result = await p.syncEvents();
  assert.equal(result.events.length, 4);
  assert.equal(result.events.find(e => e.id === 'own-event').access, 'invited');
  assert.equal(result.events.find(e => e.id === 'own-event').canRsvp, true);
  assert.equal(result.coverage.invited, 1);
  assert.equal(result.coverage.discoverable, 3);
  assert.equal(result.coverage.partial, false);
  assert.ok(!JSON.stringify(result).includes('test-session-only'));
});
test('account-feed failures surface; optional-feed failures mark partial coverage', async () => {
  const p = provider();
  p.api = async path => { if (path.includes('forUser')) return { events: [raw('own-event')], eligibleEventCount: 2 }; throw new ProviderError('Feed unavailable'); };
  const result = await p.syncEvents();
  assert.equal(result.coverage.partial, true);
  assert.equal(result.coverage.limited, true);
  p.api = async () => { throw new ProviderError('Expired', 401); };
  await assert.rejects(p.syncEvents(), error => error.status === 401);
});
test('events not returned to this user cannot be requested by ID', async () => {
  const p = provider();
  await assert.rejects(p.loadEvent('someone-elses-event'), error => error.status === 404);
  await assert.rejects(p.loadInvite('someone-elses-event'), error => error.status === 404);
});
test('guest lists follow pagination and keep authorization restrictions explicit', async () => {
  const p = provider(); p.allowedEvents.set('event-123', {});
  let pages = 0;
  p.firestore = async (_path, query) => {
    pages++;
    return { documents: [{ name: `guests/${pages}`, fields: { name: { stringValue: `Guest ${pages}` }, rsvpStatus: { stringValue: 'Going' } } }], ...(pages === 1 ? { nextPageToken: 'next-page' } : {}) };
  };
  const result = await p.loadGuests('event-123');
  assert.equal(pages, 2); assert.equal(result.guests.length, 2); assert.equal(result.partial, false);
  p.firestore = async () => { throw new ProviderError('Denied', 403); };
  assert.deepEqual(await p.loadGuests('event-123'), { guests: [], restricted: true, partial: false });
});
test('missing or inaccessible admission tickets use a labeled generated fallback', async () => {
  const p = provider(); p.allowedEvents.set('event-123', {});
  p.firestore = async () => ({ documents: [] });
  assert.equal((await p.loadInvite('event-123')).kind, 'generated');
  p.firestore = async () => { throw new ProviderError('Denied', 403); };
  assert.equal((await p.loadInvite('event-123')).kind, 'generated');
  p.firestore = async () => { throw new ProviderError('Network problem', 502); };
  await assert.rejects(p.loadInvite('event-123'), error => error.status === 502);
});
test('official QR codes encode only the service payload and have a finite expiry', async () => {
  const p = provider(); p.allowedEvents.set('event-123', {});
  p.firestore = async () => ({ documents: [{ name: 'tickets/ticket-one', fields: { uuid: { stringValue: 'my-user' }, tierID: { stringValue: 'FREE' } } }] });
  p.api = async () => ({ qrCodes: ['official-test-payload'], responseTime: now, intervalLength: 30000 });
  const result = await p.loadInvite('event-123');
  assert.equal(result.kind, 'official'); assert.match(result.svg, /^<svg/);
  assert.equal(result.expiresAt, now + 30000); assert.equal(result.validForMs, 30000);
  p.api = async () => ({ qrCodes: ['expired'], responseTime: now - 60000, intervalLength: 30000 });
  await assert.rejects(p.loadInvite('event-123'), /expired/);
});
test('used or transferred tickets are not presented as active admission codes', async () => {
  const p = provider(); p.allowedEvents.set('event-123', {});
  p.firestore = async () => ({ documents: [
    { name: 'tickets/scanned', fields: { scanTime: { timestampValue: '2026-10-25T11:00:00Z' } } },
    { name: 'tickets/transferred', fields: { uuid: { stringValue: 'other-user' } } },
  ] });
  assert.equal((await p.loadInvite('event-123')).kind, 'generated');
});

test('upstream fetch uses Worker-compatible manual redirects without forwarding credentials', async () => {
  let redirectMode;
  const p = new DoorlistProvider({fetchImpl: async (_url, options) => { redirectMode=options.redirect; return new Response('',{status:302,headers:{Location:'https://other.example'}}); }});
  await assert.rejects(p.request('https://doorlist.app/api/test'), /unexpected redirect/);
  assert.equal(redirectMode,'manual');
});

// A strict native-style function reproduces Workers' receiver requirement in Node.
test('network function retains its global receiver and health checks never send SMS', async () => {
  let calls=0;
  const p=new DoorlistProvider({fetchImpl:async function(url,options) {
    assert.equal(this,undefined);
    assert.ok(url.endsWith('/auth/v1/health'));
    assert.ok(!options.method || options.method==='GET');
    assert.equal(options.body,undefined);
    calls++;
    return Response.json({version:'test'});
  }});
  assert.equal(await p.checkConnection(),true);
  assert.equal(calls,1);
});

test('event hosts and guest previews retain accessible photos without granting event access', async () => {
  const p=provider();
  const event=normalizeEvent(raw('event-photos',{orgFBid:'host-group',orgName:'Test host'}));
  p.api=async path=>path.startsWith('/api/group/')?{orgCoverPhoto:'https://images.example/host.jpg'}:{guests:[{uuid:'guest-one',name:'Guest One',profilePhotoUrl:'https://images.example/guest.jpg'}]};
  await p.enrichEventPhotos([event]);
  assert.equal(event.hostPhoto,'https://images.example/host.jpg');
  assert.equal(event.guestPreview[0].photo,'https://images.example/guest.jpg');
  assert.equal(event.access,'discover');
  p.api=async()=>{throw new ProviderError('Unavailable',403);};
  await p.enrichEventPhotos([event]);
  assert.equal(event.hostPhoto,'https://images.example/host.jpg');
});
test('guest photo aliases are normalized and unsafe photo URLs are rejected', async () => {
  const p=provider();p.allowedEvents.set('event-photos',{});
  p.firestore=async()=>({documents:[{name:'guests/one',fields:{name:{stringValue:'Guest One'},profilePicture:{stringValue:'https://images.example/photo.jpg'}}},{name:'guests/two',fields:{name:{stringValue:'Guest Two'},profilePhotoUrl:{stringValue:'javascript:bad()'}}}]});
  const result=await p.loadGuests('event-photos');
  assert.equal(result.guests[0].photo,'https://images.example/photo.jpg');
  assert.equal(result.guests[1].photo,'');
});
