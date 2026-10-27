import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldCompleteSwipe} from '../page-navigation.js';
test('a deliberate long pull completes while a short slow pull cancels',()=>{
 assert.equal(shouldCompleteSwipe(180,390,0),true);
 assert.equal(shouldCompleteSwipe(65,390,.1),false);
});
test('a short rightward flick completes; releasing after reversing left cancels',()=>{
 assert.equal(shouldCompleteSwipe(70,390,.8),true);
 assert.equal(shouldCompleteSwipe(200,390,-.6),false);
 assert.equal(shouldCompleteSwipe(10,390,1.2),false);
});
test('invalid geometry and leftward motion cannot navigate back',()=>{
 assert.equal(shouldCompleteSwipe(100,0,1),false);
 assert.equal(shouldCompleteSwipe(-150,390,-1),false);
});
