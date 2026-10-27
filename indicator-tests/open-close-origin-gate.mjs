import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true]){
 const {v}=await scenario(mirror,[[99.05,99.9],[99.9,100],[100,99.7]]);
 assert.equal(v('Ready1',17),1);
 for(let i=17;i<=20;i++){
  assert.equal(v('Входов за день',i),0,'0–1 and initial bounce never trigger a trade');
  assert.equal(v('BoxCount',i),0,'no two-point entry instrument');
  assert.equal(v('Разворот закреплён за 0',i),0);
 }
 console.log('PASS no entry with only 0–1, no reversal without origin breakout',mirror?'mirror':'original');
}
