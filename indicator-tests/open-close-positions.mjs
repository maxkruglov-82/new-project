// Isolated regular-position engine with no origin: origin gating is tested separately in zero-condition tests.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8').replace('// Нулевое условие: пробой начала движения 0 отменяет направление 0–1.', 'confirmedZeroPrice := na\n// Нулевое условие: пробой начала движения 0 отменяет направление 0–1.')+'\nplot(confirmedThirdPrice,"P3")\nplot(positionSetupBar,"SetupBar")';
const start=Date.parse('2026-10-21T14:00:00+07:00');
const seq=[[98.8,98.5],[98.5,98.4],[98.4,98.6],[98.6,98.7],[98.7,98.8],[98.8,98.9],[98.9,98.7],[98.7,98.6],[98.6,98.7],[98.7,98.6],[98.6,98.91],[98.91,98.9],[98.9,99.2],[99.2,98.8],[98.8,98.7],[98.7,98.6],[98.6,98.5],[98.5,100],[100,100]];
for(const mirror of [false,true]){
 const raw=Array.from({length:12},()=>({open:100,close:100,high:101,low:99})).concat(seq.map(([open,close])=>({open,close,high:110,low:90})));
 const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const ctx=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>ctx.plots[n].data[i].value;
 const entries=[];
 for(let i=0;i<data.length;i++)if(v('Вход LONG/SHORT',i)){
  const side=v('Вход LONG/SHORT',i),entry=v('Цена входа по close',i),stop=v('Стоп позиции',i),target=v('Цель позиции',i);
  assert.equal(side,mirror?-1:1);
  assert.equal(entry,data[i].close);
  assert.equal(stop,v('P3',i),'stop exactly at point 3 without offset');
  assert.ok(i>v('SetupBar',i),'no retrospective fill on breakout candle');
  const risk=side*(entry-stop),reward=side*(target-entry);
  assert.ok(risk>0&&reward>=risk-1e-8);
  assert.ok(Math.abs(v('RR входа',i)-reward/risk)<1e-8);
  assert.equal(v('Состояние позиции',i),2,'entry candle cannot resolve itself');
  for(let j=i+1;j<data.length&&v('Состояние позиции',j)===2;j++){assert.equal(v('Цель позиции',j),target,'target frozen after entry');assert.equal(v('Стоп позиции',j),stop);}
  entries.push({i,side,entry,stop,target,rr:reward/risk});
 }
 assert.equal(entries.length,1);
 console.log('PASS body-only position',JSON.stringify(entries[0]));
}
