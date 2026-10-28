import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true]){
 const {v}=await scenario(mirror,[[99.05,99.2],[99.2,99.1],[99.1,98.9],[98.9,98.7],[98.7,98.5],[98.5,98.9],[98.9,100.8],[100.8,99.4],[99.4,100.805],[100.805,100.81],[100.81,99.6],[99.6,101]],{23:{high:99.8}});
 assert.equal(v('Вход LONG/SHORT',23),mirror?1:-1,'first continuation trade');
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',24),-1,'first SL');
 assert.equal(v('Вход LONG/SHORT',24),0,'confirmation creates a plan, not a same-bar entry');
 assert.equal(v('Входов за день',24),1);
 assert.equal(v('BoxCount',24),2,'first close through stop creates no second plan');
 assert.equal(v('BoxCount',25),4,'second close creates visible reversal plan');
 assert.equal(v('Вход LONG/SHORT',25),0,'confirmation candle cannot also enter');
 assert.equal(v('Вход LONG/SHORT',28),mirror?-1:1,'second retest can enter before origin breakout');
 assert.equal(v('Входов за день',28),2);
 for(let i=24;i<=29;i++)assert.equal(v('Разворот закреплён за 0',i),0,'exception must not fake a two-close structural reversal');
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',29),1);
 console.log('PASS second reversal after first stop bypasses origin gate only for retry',mirror?'SHORT after LONG stop':'LONG after SHORT stop');
}
