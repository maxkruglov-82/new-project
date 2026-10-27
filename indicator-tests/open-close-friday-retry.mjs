import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(fridayRetreatCount,"FridayCount")\nplot(fridayFirstReady?1:0,"FridayReady")';
for(const mirror of [false,true])for(const take of [false,true]){
 const start=Date.parse('2026-10-23T14:00:00+07:00');
 const hour=Array.from({length:12},()=>({open:100,close:100,high:101,low:99}));
 [[100,100.5],[100.5,100.8],[100.8,100.4],[100.4,100.3],[100.3,100.2]].forEach(([open,close],i)=>hour[7+i]={open,close,high:101,low:99});
 const seq=[[100.2,98.8],[98.8,98.6],[98.6,98.7],[98.7,98.8],[98.8,99],[99,99.05],[99.05,99.2],[99.2,99.1],[99.1,98.9],[98.9,98.7],[98.7,98.5],[98.5,98.9],[98.9,take?98.4:99.3],
 [take?98.4:99.3,98.7],[98.7,98.9],[98.9,99.1],[99.1,99],[99,99.05],[99.05,98.6],[98.6,98.4],[98.4,98.8],[98.8,98.4],[98.4,99.2],[99.2,98],[98,99.4]];
 const data=[...hour,...seq.map(([open,close])=>({open,close,high:150,low:50}))].map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 const entries=data.flatMap((_,i)=>v('Вход LONG/SHORT',i)?[{i,side:v('Вход LONG/SHORT',i)}]:[]);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',24),take?1:-1);
 assert.equal(entries[0].side,mirror?1:-1);
 if(take)assert.equal(entries.length,1,'Friday TP ends trading');
 else{
  assert.equal(v('FridayReady',28),0,'four new-structure candles insufficient');
  assert.equal(v('FridayReady',29),1);
  assert.equal(v('Входов за день',30),1,'new breakout is not retest entry');
  assert.deepEqual(entries,[{i:23,side:mirror?1:-1},{i:32,side:mirror?1:-1}]);
  assert.ok(Math.abs(v('Стоп позиции',32)-(mirror?100.9:99.1))<1e-8,'new pullback stop');
  assert.ok(Math.abs(v('Цель позиции',32)-(mirror?101.6:98.4))<1e-8);
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',33),1);
  assert.equal(v('Входов за день',data.length-1),2,'no third trade');
 }
 console.log('PASS Friday same-direction new structure and retest',mirror?'LONG':'SHORT',take?'no retry after TP':'SL then same-side TP');
}
