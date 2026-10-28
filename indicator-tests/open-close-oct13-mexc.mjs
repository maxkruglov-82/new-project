import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-13.json',import.meta.url)));
assert.equal(fixture.exchange,'MEXC'); // Screenshot uses MEXC, not BingX.
const data=fixture.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedZeroTime,"T0")';
const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
const events=[];
for(let i=0;i<data.length;i++){
 const t=new Date(data[i].openTime+7*3600000).toISOString().slice(0,16);
 if(!t.startsWith('2026-10-13'))continue;
 if(Number.isFinite(v('T0',i)) && v('T0',i)>=Date.parse('2026-10-13T13:00:00+07:00')){
  assert.equal(v('T0',i),Date.parse('2026-10-13T14:40:00+07:00'));
  assert.equal(v('Цена точки 0',i),108.87);
 }
 const side=v('Вход LONG/SHORT',i),exit=v('Выход TP 1 / SL -1 / неизвестно 2',i);
 if(side){
  assert.equal(v('Цена входа по close',i),107.42);
  assert.equal(v('Стоп позиции',i),107.62);
  assert.equal(v('Цель позиции',i),107.09);
 }
 if(side||exit)events.push([t.slice(11),side,exit]);
}
assert.deepEqual(events,[['16:35',-1,0],['16:45',0,1]]);
console.log('PASS real MEXC Oct 13: pullback stop: SHORT 16:35, TP 16:45');
