import test from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { createDoorlistServer } from '../server.mjs';
import { ProviderError } from '../doorlist-provider.mjs';
function fixture() {
  return {
    profile: null, clear() { this.profile = null; },
    async sendCode() {},
    async verifyCode(_phone, code) { if (code !== '123456') throw new ProviderError('Invalid code', 400); this.profile = { id: 'fixture-user', name: 'Fixture User' }; return this.profile; },
    async syncEvents() { return { events: [{ id: 'event-123', title: 'Fixture Event' }], profile: this.profile }; },
    async loadEvent(id) { return { id }; },
    async loadGuests() { return { guests: [] }; },
    async loadInvite(id) { return { eventId: id, kind: 'generated' }; },
  };
}
test('server protects sessions, credentials, origin boundaries and private source files', async t => {
  const server = createDoorlistServer({ providerFactory: fixture, port: 0 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Origin: base, 'Content-Type': 'application/json', 'X-Doorlist-Client': 'mobile-ui' };
  const send = (path, options = {}) => fetch(base + path, { ...options, headers: { ...headers, ...options.headers } });
  assert.equal((await send('/api/events')).status, 401);
  const wrongHost = await new Promise(resolve => { const req = httpRequest(base + '/api/session', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }); req.end(); });
  assert.equal(wrongHost, 403);
  assert.equal((await send('/api/session', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await send('/api/auth/code', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: JSON.stringify({ phone: '+15555550123' }) })).status, 403);
  assert.equal((await send('/doorlist-provider-config.json')).status, 404);
  assert.equal((await send('/server.mjs')).status, 404);
  const sent = await send('/api/auth/code', { method: 'POST', body: JSON.stringify({ phone: '+15555550123' }) });
  assert.equal(sent.status, 200);
  const cookie = sent.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const sessionHeaders = { Cookie: cookie.split(';')[0] };
  assert.equal((await send('/api/auth/verify', { method: 'POST', headers: sessionHeaders, body: JSON.stringify({ code: '999999' }) })).status, 400);
  const verified = await send('/api/auth/verify', { method: 'POST', headers: sessionHeaders, body: JSON.stringify({ code: '123456' }) });
  assert.equal(verified.status, 200);
  assert.deepEqual(Object.keys(await verified.json()).sort(), ['authenticated', 'profile']);
  const events = await send('/api/events', { headers: sessionHeaders });
  assert.equal(events.status, 200); assert.equal(events.headers.get('cache-control'), 'no-store');
  assert.equal((await events.json()).events.length, 1);
  const disconnected = await send('/api/auth/disconnect', { method: 'POST', headers: sessionHeaders, body: '{}' });
  assert.equal(disconnected.status, 200);
  assert.equal((await send('/api/events', { headers: sessionHeaders })).status, 401);
});

test('sign-in codes can be resent after ten seconds while the five-code cap remains', async t => {
  let now=Date.parse('2026-10-26T12:00:00Z'),sent=0;
  const server=createDoorlistServer({port:0,clock:()=>now,providerFactory:()=>({...fixture(),async sendCode(){sent++;}})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const send=()=>fetch(base+'/api/auth/code',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Doorlist-Client':'mobile-ui'},body:JSON.stringify({phone:'+15555550123'})});
  const status=async()=>{const response=await send();await response.json();return response.status;};
  assert.equal(await status(),200);
  now+=9999;assert.equal(await status(),429);assert.equal(sent,1);
  now++;assert.equal(await status(),200);assert.equal(sent,2);
  for(let i=0;i<3;i++){now+=10000;assert.equal(await status(),200);}
  now+=10000;assert.equal(await status(),429);assert.equal(sent,5);
});
