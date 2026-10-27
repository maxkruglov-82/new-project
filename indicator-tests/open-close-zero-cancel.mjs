import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true]){
 const {v}=await scenario(mirror,[[99.05,100.805],[100.805,100.81],[100.81,101.2],[101.2,100.7],[100.7,100.6],[100.6,100.5],[100.5,100.4],[100.4,101.21],[101.21,100.7],[100.7,101.3]]);
 assert.equal(v('Входов за день',24),0,'no RR touch before new structure');
 assert.equal(v('Нулевой сценарий отменён',25),1,'renewed 2 after five-bar retreat replaces unfilled reversal');
 assert.equal(v('Входов за день',25),0,'cancellation is not trade');
 assert.equal(v('BoxCount',25),2,'only replacement plan rectangles');
 assert.equal(v('LabelCount',25),1,'cancelled plan label removed');
 assert.equal(v('Первая позиция по нулевому условию',25),0,'next regular plan available');
 assert.equal(v('Вход LONG/SHORT',26),mirror?-1:1,'new structure permits first actual trade');
 assert.equal(v('Входов за день',26),1);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',27),1);
 console.log('PASS unfilled origin-breakout cancellation and regular replacement',mirror?'SHORT':'LONG');
}
