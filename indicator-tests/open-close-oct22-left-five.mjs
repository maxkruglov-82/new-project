import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-22-left5.json',import.meta.url)));
const data=fixture.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedZeroTime,"T0")';
const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
const events=[];
for(let i=0;i<data.length;i++){
 if(Number.isFinite(v('T0',i))){assert.equal(v('T0',i),Date.parse('2026-10-22T14:00:00+07:00'));assert.equal(v('Цена точки 0',i),104.57);}
 const side=v('Вход LONG/SHORT',i),exit=v('Выход TP 1 / SL -1 / неизвестно 2',i);
 if(side||exit)events.push([new Date(data[i].openTime+7*3600000).toISOString().slice(11,16),side,exit]);
}
assert.deepEqual(events,[['16:05',-1,0],['16:10',0,2]]);
const originIndex=data.findIndex(b=>b.openTime===Date.parse('2026-10-22T14:00:00+07:00'));
for(let k=1;k<=5;k++)assert.ok(Math.max(data[originIndex-k].open,data[originIndex-k].close)<=104.57);
console.log('PASS MEXC Oct 22: five-left origin 14:00 / 104.57, SHORT then ambiguous dual-level candle; no forced outcome');
