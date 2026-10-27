import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true]){
 const {v}=await scenario(mirror,[[99.05,99.2],[99.2,99.1],[99.1,98.9],[98.9,98.7],[98.7,98.5],[98.5,98.9],[98.9,99.3],[99.3,99.4],[99.4,100.805],[100.805,100.81],[100.81,99.6],[99.6,101]]);
 assert.equal(v('Вход LONG/SHORT',23),mirror?1:-1,'first continuation trade');
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',24),-1,'first SL');
 for(let i=24;i<=26;i++){
  assert.equal(v('Входов за день',i),1,'SL does not authorize countertrend entry before origin break');
  assert.equal(v('Разворот закреплён за 0',i),0);
  assert.equal(v('BoxCount',i),2,'only completed first trade remains visible');
 }
 assert.equal(v('Разворот закреплён за 0',27),1);
 assert.equal(v('Вход LONG/SHORT',27),0,'no entry on origin confirmation itself');
 assert.equal(v('Вход LONG/SHORT',28),mirror?-1:1);
 assert.equal(v('Входов за день',28),2);
 console.log('PASS first stop does not bypass origin trend filter',mirror?'SHORT after LONG stop':'LONG after SHORT stop');
}
