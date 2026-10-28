import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-12.json',import.meta.url)));
assert.equal(fixture.exchange,'MEXC'); // Screenshot uses MEXC, not BingX.
const data=fixture.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedZeroTime,"T0")\nplot(label.get_y(movingThirdLabel),"Marker3")';
const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
const events=[];
for(let i=0;i<data.length;i++){
 const t=new Date(data[i].openTime+7*3600000).toISOString().slice(0,16);
 if(!t.startsWith('2026-10-12'))continue;
 if(Number.isFinite(v('T0',i)) && v('T0',i)>=Date.parse('2026-10-12T13:00:00+07:00')){
  assert.equal(v('T0',i),Date.parse('2026-10-12T14:15:00+07:00'));
  assert.equal(v('Цена точки 0',i),112.97);
 }
 const expectedTarget={'16:25':111.55,'16:30':111.49,'16:45':111.31,'17:40':111.31}[t.slice(11)];
 if(expectedTarget!==undefined){
  assert.equal(v('Цель позиции',i),expectedTarget,'pending target follows new low even after five-bar pause');
  assert.equal(v('Стоп позиции',i),112.25,'stop remains on point 2');
 }
 if(t.slice(11)>='18:00')assert.equal(v('Marker3',i),111.31,'point 3 remains at executed trade target');
 const side=v('Вход LONG/SHORT',i),exit=v('Выход TP 1 / SL -1 / неизвестно 2',i);
 if(side||exit)events.push([t.slice(11),side,exit]);
}
assert.deepEqual(events,[['17:45',-1,0],['18:00',0,1]]);
console.log('PASS real MEXC Oct 12: trailing 3, pullback stop enables SHORT 17:45, TP 18:00');
