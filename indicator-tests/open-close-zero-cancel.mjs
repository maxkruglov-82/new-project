import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true]){
 const {v}=await scenario(mirror,[[99.05,100.805],[100.805,100.81],[100.81,101.2],[101.2,100.7],[100.7,100.6],[100.6,100.5],[100.5,100.4],[100.4,101.21],[101.21,101.22],[101.22,100.7],[100.7,101.3]]);
 assert.equal(v('Входов за день',24),0,'no RR touch before new structure');
 assert.equal(v('Нулевой сценарий отменён',25),0,'first close through 2 does not replace scenario');
 assert.equal(v('Нулевой сценарий отменён',26),0,'local structure cannot cancel original reversal');
 assert.equal(v('Стоп позиции',26),mirror?101.4:98.6,'original stop remains');
 assert.equal(v('Входов за день',26),0,'cancellation is not trade');
 assert.equal(v('BoxCount',26),2,'original plan rectangles remain');
 assert.equal(v('LabelCount',26),3,'original plan labels remain');
 assert.equal(v('Первая позиция по нулевому условию',26),1,'original plan remains active');
 assert.equal(v('Вход LONG/SHORT',27),0,'local RR touch is not an original RR touch');
 assert.equal(v('Входов за день',27),0);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',28),0);
 console.log('PASS original origin-breakout scenario survives local replacement',mirror?'SHORT':'LONG');
}
