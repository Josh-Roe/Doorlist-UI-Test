import test from 'node:test';
import assert from 'node:assert/strict';
import {handleDoorlist} from '../lib/doorlist-api.ts';
import {DoorlistProvider} from '../lib/doorlist-provider.mjs';

test('hosted SMS resend opens at ten seconds and retains the five-code cap',async t=>{
  let now=Date.parse('2026-10-26T12:00:00Z'),sent=0;
  t.mock.method(Date,'now',()=>now);
  t.mock.method(DoorlistProvider.prototype,'sendCode',async function(){sent++;});
  const rows=new Map();
  const DB={prepare(sql){return {bind(...args){return {
    async first(){
      if(sql.startsWith('SELECT started_at'))return rows.get(args[0])||null;
      assert.ok(sql.startsWith('INSERT INTO doorlist_auth_limits'));
      const [id,start,last,windowStart,newStart,,newLast,cooldownCutoff,restartCutoff,max]=args;
      const old=rows.get(id);
      if(old&&(old.last_at>cooldownCutoff||!(old.started_at<restartCutoff||old.attempts<max)))return null;
      const row=old?{started_at:old.started_at<windowStart?newStart:old.started_at,last_at:newLast,attempts:old.started_at<windowStart?1:old.attempts+1}:{started_at:start,last_at:last,attempts:1};
      rows.set(id,row);return {attempts:row.attempts};
    },
    async run(){return {success:true};},
  };}};}};
  const env={DB,SESSION_ENCRYPTION_KEY:'test-only-cooldown-key-not-used-in-production-0123456789'};
  const send=()=>handleDoorlist(new Request('https://test.example/api/auth/code',{method:'POST',headers:{Origin:'https://test.example','Content-Type':'application/json','X-Doorlist-Client':'mobile-ui','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({phone:'+15555550123'})}),env);
  let response=await send();assert.equal(response.status,200);
  now+=9999;response=await send();assert.equal(response.status,429);assert.match((await response.json()).error,/Wait 1 seconds/);assert.equal(sent,1);
  now++;response=await send();assert.equal(response.status,200);assert.equal(sent,2);
  for(let i=0;i<3;i++){now+=10000;assert.equal((await send()).status,200);}
  now+=10000;response=await send();assert.equal(response.status,429);assert.equal(sent,5);
});

test('hosted auth accepts a US country code without plus and keeps diagnostics free of private details',async t=>{
 const DB={prepare(){return {bind(){return {first:async()=>({attempts:1}),run:async()=>({success:true})};}};}};
 const env={DB,SESSION_ENCRYPTION_KEY:'test-only-auth-error-key-not-used-in-production-0123456789'};
 let normalized;
 t.mock.method(globalThis,'fetch',async (_url,options)=>{normalized=JSON.parse(options.body).phone;return Response.json({code:'signup_disabled',msg:'private phone +14155550123 code 123456'},{status:422});});
 const logs=[];t.mock.method(console,'warn',(...args)=>logs.push(args));
 const response=await handleDoorlist(new Request('https://test.example/api/auth/code',{method:'POST',headers:{Origin:'https://test.example','Content-Type':'application/json','X-Doorlist-Client':'mobile-ui'},body:JSON.stringify({phone:'1 (415) 555-0123'})}),env);
 assert.equal(normalized,'+14155550123');assert.equal(response.status,422);
 const data=await response.json();assert.match(data.error,/existing Doorlist account/);assert.ok(!JSON.stringify(data).includes('123456'));
 assert.deepEqual(logs,[['doorlist_auth_failure',{stage:'send_code',status:422,reason:'signup_disabled'}]]);
});
