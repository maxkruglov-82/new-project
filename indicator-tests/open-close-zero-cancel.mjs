import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true]){
 const {c,v}=await scenario(mirror,[[99,99.2],[99.2,99.1],[99.1,98.9],[98.9,98.7],[98.7,98.5],[98.5,98.9],[98.9,98.4]]);
 assert.equal(v('Входов за день',21),0,'no RR touch before new structure');
 assert.equal(v('Нулевой сценарий отменён',22),1,'new confirmed structure cancels unfilled zero plan');
 assert.equal(v('Входов за день',22),0,'cancellation is not trade');
 assert.equal(v('BoxCount',22),2,'only replacement plan rectangles');
 assert.equal(v('LabelCount',22),1,'cancelled plan label removed');
 assert.equal(v('Первая позиция по нулевому условию',22),0,'next regular plan available');
 assert.equal(v('Вход LONG/SHORT',23),mirror?1:-1,'next structure permits first actual trade');
 assert.equal(v('Входов за день',23),1);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',24),1);
 // Completed position retains a result label, cancelled zero does not.
 console.log('PASS unfilled zero cancellation and first regular trade',mirror?'LONG':'SHORT');
}
