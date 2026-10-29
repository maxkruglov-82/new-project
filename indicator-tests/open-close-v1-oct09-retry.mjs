import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const f=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-09-v1-structure.json',import.meta.url)));
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
for(const mirror of [false,true]){
 const price=x=>mirror?250-x:x;
 const data=f.candles.map(b=>({...b,open:price(b.open),close:price(b.close),high:mirror?price(b.low):b.high,low:mirror?price(b.high):b.low,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 const c=await new PineTS(data,'SOLUSDT','5').run(source);
 const v=(n,t)=>c.plots[n].data[data.findIndex(b=>b.openTime===Date.parse('2026-10-09T'+t+':00+07:00'))].value;
 assert.equal(v('Вход LONG/SHORT','19:45'),mirror?-1:1);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2','20:40'),-1);
 assert.equal(v('Вход LONG/SHORT','21:20'),0);
 assert.equal(v('Вход LONG/SHORT','21:25'),mirror?1:-1);
 for(const [n,x] of [['Цена входа по close',110.325],['Стоп позиции',111.33],['Цель позиции',109.32]])assert.ok(Math.abs(v(n,'21:25')-price(x))<1e-8);
 assert.equal(v('Входов за день','21:25'),2);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2','22:30'),1);
 const fills=data.flatMap((b,i)=>c.plots['Вход LONG/SHORT'].data[i].value?[c.plots['Вход LONG/SHORT'].data[i].value]:[]);
 assert.deepEqual(fills,mirror?[-1,1]:[1,-1]);
}
console.log('PASS Oct09 manipulation: LONG SL -> SHORT21:25 TP22:30; mirrored SHORT SL -> LONG');
