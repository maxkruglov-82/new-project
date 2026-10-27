import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true]){
 const {v}=await scenario(mirror,[[99,99.2],[99.2,99.1],[99.1,98.9],[98.9,98.7],[98.7,98.8],[98.8,99.21],[99.21,99],[99,99.4],[99.4,100.805],[100.805,100.81],[100.81,99.7]]);
 assert.equal(v('Входов за день',23),0,'break of 2 below origin does not permit reversal');
 for(let i=23;i<=26;i++){
  assert.equal(v('Разворот закреплён за 0',i),0,'break of 2 or 0.005 past 0 does not reverse trend');
  assert.equal(v('Вход LONG/SHORT',i),0,'no countertrend fill before origin confirmation');
  assert.equal(v('BoxCount',i),0,'no visible countertrend tool before origin confirmation');
 }
 assert.equal(v('Разворот закреплён за 0',27),1,'one close exactly 0.01 past 0 permits reversal');
 assert.equal(v('BoxCount',27),2,'tool appears only after origin confirmation');
 assert.equal(v('Вход LONG/SHORT',27),0,'confirmation candle does not fill retrospectively');
 assert.equal(v('Вход LONG/SHORT',28),mirror?-1:1,'pullback after origin breakout permits reversal entry');
 assert.equal(v('Входов за день',28),1,'cancelled pending zero does not consume a trade');
 console.log('PASS countertrend entry and drawing require confirmed breakout of 0',mirror?'SHORT':'LONG');
}
