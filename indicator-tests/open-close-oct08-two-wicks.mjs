import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const f=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-08.json',import.meta.url)));
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
for(const mirror of [false,true]){
 const price=x=>mirror?230-x:x;
 const data=f.candles.map(b=>({open:price(b.open),close:price(b.close),high:mirror?price(b.low):b.high,low:mirror?price(b.high):b.low,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 const at=t=>data.findIndex(b=>b.openTime===Date.parse('2026-10-08T'+t+':00+07:00'));
 assert.equal(v('Вход LONG/SHORT',at('15:45')),0);
 assert.equal(v('Вход LONG/SHORT',at('15:50')),mirror?1:-1);
 assert.ok(Math.abs(v('Цена входа по close',at('15:50'))-price(114.935))<1e-8);
 assert.equal(v('Цель позиции',at('15:50')),price(114.84),'new body extreme cannot rewrite filled RR target');
 assert.equal(v('Стоп позиции',at('15:50')),price(115.03));
 assert.equal(v('RR входа',at('15:50')),1);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',at('15:50')),0,'no invented order inside entry candle');
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',at('15:55')),1);
 assert.equal(v('Входов за день',at('16:00')),1);
 console.log('PASS MEXC Oct 8: two touches fill original RR 114.935 at 15:50; target 114.84 TP 15:55',mirror?'LONG mirror':'SHORT');
}
