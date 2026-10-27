import test from 'node:test';
import assert from 'node:assert/strict';
import {DoorlistProvider} from '../doorlist-provider.mjs';
const fail=(status,data)=>new DoorlistProvider({fetchImpl:async()=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})});
test('an account rejection when sending SMS explains which phone number to use',async()=>{
 await assert.rejects(fail(422,{error_code:'signup_disabled'}).sendCode('+15555550123'),e=>e.status===422&&e.code==='signup_disabled'&&/existing Doorlist account/.test(e.message));
});
test('invalid or expired OTPs are described as code errors',async()=>{
 await assert.rejects(fail(403,{code:'otp_expired'}).verifyCode('+15555550123','123456'),e=>e.code==='otp_expired'&&/latest SMS code/.test(e.message)&&!/phone number/.test(e.message));
});
test('delivery failures and upstream rate limits keep their own explanations',async()=>{
 await assert.rejects(fail(500,{code:'sms_send_failed'}).sendCode('+15555550123'),e=>/could not deliver the SMS/.test(e.message));
 await assert.rejects(fail(429,{code:'over_sms_send_rate_limit'}).sendCode('+15555550123'),e=>/Doorlist is limiting SMS requests/.test(e.message));
});
test('unrecognized upstream details are not exposed as messages or diagnostic identifiers',async()=>{
 for(const data of [{code:'secret-account-name',msg:'private phone +15555550123 code 123456'},null])await assert.rejects(fail(422,data).sendCode('+15555550123'),e=>e.code==='upstream_auth_error'&&/could not send a code/.test(e.message)&&!/private|123456|secret-account/.test(e.message));
});

test('first-time web sign-in matches Doorlist’s own OTP request',async()=>{
 let body;
 const provider=new DoorlistProvider({fetchImpl:async (_url,options)=>{body=JSON.parse(options.body);return Response.json({});}});
 await provider.sendCode('+15555550123');
 assert.deepEqual(body,{phone:'+15555550123',create_user:true,channel:'sms'});
});
test('SMS verification alone cannot authenticate a missing Doorlist profile',async()=>{
 for(const missing of ['empty','not-found']){
  const provider=new DoorlistProvider();
  provider.request=async()=>({access_token:'test-only',refresh_token:'test-only',expires_in:3600});
  provider.api=async()=>{if(missing==='not-found'){const e=new Error('Not found');e.status=404;throw e;}return {};};
  await assert.rejects(provider.verifyCode('+15555550123','123456'),e=>e.status===404&&e.code==='doorlist_account_required');
  assert.equal(provider.profile,null);assert.equal(provider.accessToken,null);assert.equal(provider.allowedEvents.size,0);
 }
});
