import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptSession, decryptSession, handleDoorlist } from '../lib/doorlist-api.ts';
const env={SESSION_ENCRYPTION_KEY:'test-only-key-not-used-in-production-0123456789'};
test('encrypted sessions are bound to one opaque session identity',async()=>{
  const ciphertext=await encryptSession({provider:{accessToken:'private-token-a',profile:{id:'account-a'}}},env,'session-a');
  assert.ok(!ciphertext.includes('private-token-a'));
  assert.equal((await decryptSession(ciphertext,env,'session-a')).provider.profile.id,'account-a');
  await assert.rejects(decryptSession(ciphertext,env,'session-b'));
  await assert.rejects(decryptSession(ciphertext,{SESSION_ENCRYPTION_KEY:'different-test-only-key-0123456789'},'session-a'));
});
test('anonymous visitors receive no account data',async()=>{
  const runtime={...env,DB:{prepare(){throw Error('Anonymous session must not query private rows');}}};
  const response=await handleDoorlist(new Request('https://test.example/api/session'),runtime);
  assert.deepEqual(await response.json(),{authenticated:false,profile:null});
});
test('public write routes enforce same-origin and client headers',async()=>{
  const runtime={...env,DB:{}};
  const response=await handleDoorlist(new Request('https://test.example/api/auth/code',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json','X-Doorlist-Client':'mobile-ui'},body:'{}'}),runtime);
  assert.equal(response.status,403);
});
test('one account cannot read another account using an account ID query parameter',async()=>{
  const raw=crypto.randomUUID();
  const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
  const ciphertext=await encryptSession({provider:{profile:{id:'account-a',name:'Account A'},allowedEvents:[]}},env,id);
  const runtime={...env,DB:{prepare(){return{bind(requestedId){return{run:async()=>({success:true}),first:async()=>requestedId===id?{ciphertext,expires_at:Date.now()+60000}:null};}};}}};
  const response=await handleDoorlist(new Request('https://test.example/api/session?account=account-b',{headers:{Cookie:`doorlist_session=${raw}`}}),runtime);
  const data=await response.json();
  assert.equal(data.profile.id,'account-a');
  assert.equal(data.snapshot.profile.id,'account-a');
  assert.ok(!('accessToken' in data.snapshot));
});

test('the saved profile dataset is encrypted and scoped to the signed-in account',async()=>{
 const raw=crypto.randomUUID();
 const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
 const ciphertext=await encryptSession({provider:{profile:{id:'account-a'},allowedEvents:[],profilePool:[['person-a',{id:'person-a',name:'Account A cached person',photo:'https://images.example/a.jpg'}]]}},env,id);
 assert.ok(!ciphertext.includes('Account A cached person'));
 const runtime={...env,DB:{prepare(){return{bind(requestedId){return{run:async()=>({success:true}),first:async()=>requestedId===id?{ciphertext,expires_at:Date.now()+60000}:null};}};}}};
 const response=await handleDoorlist(new Request('https://test.example/api/profiles?account=account-b',{headers:{Cookie:`doorlist_session=${raw}`}}),runtime);
 assert.deepEqual((await response.json()).profiles,[{id:'person-a',name:'Account A cached person',photo:'https://images.example/a.jpg'}]);
 const anonymous=await handleDoorlist(new Request('https://test.example/api/profiles'),runtime);
 assert.equal(anonymous.status,401);
});

test('persistent authenticated sessions renew after reopening days later and logout revokes storage',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const raw=crypto.randomUUID(),id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
 let row={ciphertext:await encryptSession({provider:{profile:{id:'returning-user',name:'Returning user'},allowedEvents:[],profilePool:[],refreshToken:'test-private-refresh'}},env,id),expires_at:now+30*86400000};
 const runtime={...env,DB:{prepare(sql){return{bind(...args){return{
  first:async()=>args[0]===id?row:null,
  run:async()=>{if(sql.startsWith('INSERT INTO doorlist_sessions'))row={ciphertext:args[1],expires_at:args[2]};else if(sql.startsWith('DELETE'))row=null;return{success:true};},
 };}};}}};
 now+=7*86400000;
 const reopened=await handleDoorlist(new Request('https://test.example/api/session',{headers:{Cookie:`doorlist_session=${raw}`}}),runtime);
 assert.equal((await reopened.json()).profile.id,'returning-user');assert.match(reopened.headers.get('set-cookie'),/Max-Age=2592000/);assert.match(reopened.headers.get('set-cookie'),/HttpOnly/);assert.match(reopened.headers.get('set-cookie'),/Secure/);assert.equal(row.expires_at,now+30*86400000);
 const saved=await decryptSession(row.ciphertext,env,id);assert.equal(saved.provider.refreshToken,'test-private-refresh');
 const signout=await handleDoorlist(new Request('https://test.example/api/auth/disconnect',{method:'POST',headers:{Origin:'https://test.example','X-Doorlist-Client':'mobile-ui','Content-Type':'application/json',Cookie:`doorlist_session=${raw}`},body:'{}'}),runtime);
 assert.equal(signout.status,200);assert.match(signout.headers.get('set-cookie'),/Max-Age=0/);assert.equal(row,null);
 assert.equal((await (await handleDoorlist(new Request('https://test.example/api/session',{headers:{Cookie:`doorlist_session=${raw}`}}),runtime)).json()).authenticated,false);
});

test('an event request cannot roll back profile details saved by a concurrent import',async t=>{
 const {DoorlistProvider}=await import('../lib/doorlist-provider.mjs');
 const raw=crypto.randomUUID(),id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
 const provider=profile=>({profile,allowedEvents:[],profilePool:[]});
 const stale=await encryptSession({provider:provider({id:'self',name:'Self',eventCount:0,detailsUpdatedAt:100})},env,id);
 const latest=await encryptSession({provider:provider({id:'self',name:'Self',eventCount:7,detailsUpdatedAt:200})},env,id);
 let reads=0,saved;
 const runtime={...env,DB:{prepare(sql){return{bind(...args){return{first:async()=>({ciphertext:++reads===1?stale:latest,expires_at:Date.now()+60000}),run:async()=>{if(sql.startsWith('INSERT INTO doorlist_sessions'))saved=args[1];return {success:true};}};}};}}};
 t.mock.method(DoorlistProvider.prototype,'syncEvents',async function(){return {events:[],profile:this.profile};});
 const response=await handleDoorlist(new Request('https://test.example/api/events',{headers:{Cookie:`doorlist_session=${raw}`}}),runtime);
 assert.equal(response.status,200);assert.equal((await decryptSession(saved,env,id)).provider.profile.eventCount,7);
});
