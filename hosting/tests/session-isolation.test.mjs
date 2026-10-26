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
  const runtime={...env,DB:{prepare(){return{bind(requestedId){return{first:async()=>requestedId===id?{ciphertext,expires_at:Date.now()+60000}:null};}};}}};
  const response=await handleDoorlist(new Request('https://test.example/api/session?account=account-b',{headers:{Cookie:`doorlist_session=${raw}`}}),runtime);
  const data=await response.json();
  assert.equal(data.profile.id,'account-a');
});

test('the saved profile dataset is encrypted and scoped to the signed-in account',async()=>{
 const raw=crypto.randomUUID();
 const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
 const ciphertext=await encryptSession({provider:{profile:{id:'account-a'},allowedEvents:[],profilePool:[['person-a',{id:'person-a',name:'Account A cached person',photo:'https://images.example/a.jpg'}]]}},env,id);
 assert.ok(!ciphertext.includes('Account A cached person'));
 const runtime={...env,DB:{prepare(){return{bind(requestedId){return{first:async()=>requestedId===id?{ciphertext,expires_at:Date.now()+60000}:null};}};}}};
 const response=await handleDoorlist(new Request('https://test.example/api/profiles?account=account-b',{headers:{Cookie:`doorlist_session=${raw}`}}),runtime);
 assert.deepEqual((await response.json()).profiles,[{id:'person-a',name:'Account A cached person',photo:'https://images.example/a.jpg'}]);
 const anonymous=await handleDoorlist(new Request('https://test.example/api/profiles'),runtime);
 assert.equal(anonymous.status,401);
});
