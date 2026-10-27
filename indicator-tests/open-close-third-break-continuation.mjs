import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true])for(const tiny of [false,true]){
 const tail=[[99.05,99.2],[99.2,99.1],[99.1,99],[99,98.9],[98.9,98.8],[98.8,99.21],[99.21,99.6],[99.6,99.4],[99.4,99.1],[99.1,98.9],[98.9,tiny?98.795:98.79]];
 if(tiny)tail.push([98.795,98.79]);
 tail.push([98.79,98.7],[98.7,99.2],[99.2,98.69]);
 const {v}=await scenario(mirror,tail),confirm=tiny?29:28,entry=confirm+2;
 for(let i=23;i<confirm;i++){
  assert.equal(v('Разворот закреплён за 0',i),0);
  assert.equal(v('Входов за день',i),0,'breaking 2 under 0 never opens countertrend trade');
  assert.equal(v('BoxCount',i),0,'forbidden countertrend tool hidden');
  assert.equal(v('Действующий цвет тренда',i),mirror?1:-1,'whole countertrend 1–2–3–4 keeps original color before origin break');
 }
 assert.equal(v('Продолжение после пробоя 3',confirm),1,'close exactly 0.01 past 3 starts continuation');
 assert.equal(v('Вход LONG/SHORT',confirm),0,'confirmation itself is not entry');
 assert.equal(v('BoxCount',confirm),2);
 assert.ok(Math.abs(v('Стоп позиции',confirm)-(mirror?100.4:99.6))<1e-8,'stop at high/low 4');
 assert.equal(v('Вход LONG/SHORT',entry),mirror?1:-1,'continuation entry after retest');
 assert.ok(Math.abs(v('Цель позиции',entry)-(mirror?101.3:98.7))<1e-8,'new extreme after broken 3 is target');
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',entry+1),1);
 assert.equal(v('Входов за день',entry+1),1);
 console.log('PASS continuation through 3 after blocked countertrend 4',mirror?'LONG':'SHORT',tiny?'tiny rejected':'valid');
}

for(const mirror of [false,true]){
 const {v}=await scenario(mirror,[[99.05,99.2],[99.2,99.1],[99.1,99],[99,98.9],[98.9,98.8],[98.8,99.21],[99.21,99.6],[99.6,99.4],[99.4,99.1],[99.1,98.9],[98.9,98.79],[98.79,98.7],[98.7,99.2],[99.2,99.7],[99.7,100.5],[100.5,100.81],[100.81,99.7],[99.7,100.9]]);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',31),-1);
 assert.equal(v('Входов за день',32),1,'SL below 0 does not permit opposite entry');
 assert.equal(v('Вход LONG/SHORT',33),0);
 assert.equal(v('Вход LONG/SHORT',34),mirror?-1:1,'opposite retry only after confirmed origin break and retest');
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',35),1);
 assert.equal(v('Входов за день',35),2);
 console.log('PASS continuation-5 SL retry keeps origin filter and daily limit',mirror?'mirror':'original');
}
