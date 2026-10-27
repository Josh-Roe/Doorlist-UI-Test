import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleViewport} from '../page-navigation.js';
const phone=(extra={})=>({innerWidth:393,innerHeight:793,visualViewport:{height:793,offsetTop:0,scale:1},screen:{width:393,height:852},navigator:{userAgent:'iPhone',standalone:true},...extra});
test('installed iPhone app fills the screen when WebKit reports a status-bar shortfall',()=>{
 assert.deepEqual(visibleViewport(phone()),{top:0,height:852});
});
test('Safari uses the visible viewport above its browser controls',()=>{
 assert.deepEqual(visibleViewport(phone({navigator:{userAgent:'iPhone',standalone:false},visualViewport:{height:700,offsetTop:12,scale:1}})),{top:12,height:700});
});
test('an open keyboard is respected in the installed app',()=>{
 assert.deepEqual(visibleViewport(phone({document:{activeElement:{matches:()=>true}},visualViewport:{height:440,offsetTop:18,scale:1}})),{top:18,height:440});
});
test('landscape standalone geometry follows the screen orientation',()=>{
 assert.deepEqual(visibleViewport(phone({innerWidth:852,innerHeight:393,visualViewport:{height:372,scale:1}})),{top:0,height:393});
});
test('split or resized windows do not assume full-screen physical bounds',()=>{
 assert.deepEqual(visibleViewport(phone({innerWidth:320,visualViewport:{height:650,scale:1}})),{top:0,height:650});
});
test('pinch zoom does not resize navigation chrome',()=>{
 assert.equal(visibleViewport(phone({visualViewport:{height:400,scale:2}})),null);
});
