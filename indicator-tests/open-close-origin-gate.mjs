import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true]){
 const {v}=await scenario(mirror,[[99,99.2],[99.2,99.1]]);
 assert.equal(v('Первая позиция по нулевому условию',16),1);
 assert.equal(v('Стоп позиции',16),v('Цена точки 0',16));
 assert.equal(v('Входов за день',18),0,'plan is not an executed entry');
 assert.equal(v('Состояние позиции',18),1,'no RR1 touch means keep waiting');
 console.log('PASS origin defines stop and initial trade direction',mirror?'LONG':'SHORT');
}
