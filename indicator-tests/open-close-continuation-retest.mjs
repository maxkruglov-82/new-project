import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true])for(const tiny of [false,true]){
 const tail=[[99.05,99.2],[99.2,99.1],[99.1,98.9],[98.9,98.7],[98.7,tiny?98.595:98.5]];
 if(tiny)tail.push([98.595,98.59]);
 tail.push([tiny?98.59:98.5,98.4],[98.4,98.9],[98.9,98.3]);
 const {v}=await scenario(mirror,tail),signal=tiny?24:23,entry=signal+1;
 for(let i=17;i<signal;i++){assert.equal(v('Входов за день',i),0);assert.equal(v('BoxCount',i),0,'no tool before confirmed continuation break');}
 assert.equal(v('Состояние позиции',signal),1,'confirmed break of 1 creates plan');
 assert.equal(v('Вход LONG/SHORT',signal),0,'breakout is not entry');
 assert.ok(Math.abs(v('Стоп позиции',signal)-(mirror?100.8:99.2))<1e-8,'stop at pullback point 2');
 assert.ok(Math.abs(v('Цель позиции',signal)-(mirror?200-98.4:98.4))<1e-8,'target at new point 3');
 assert.equal(v('Вход LONG/SHORT',entry),mirror?1:-1,'fourth stage retests RR zone');
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',entry+1),1);
 console.log('PASS five-bar continuation, break of 1, retest entry',mirror?'LONG':'SHORT',tiny?'tiny break rejected':'valid');
}
