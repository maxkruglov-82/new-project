import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-05-origin-stop.json',import.meta.url)));
const data=fixture.candles.map(b=>({open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const c=await new PineTS(data,'SOLUSDT','5').run(source+'\nplot(label.get_y(positionStopInfo),"StopLabel")');
const v=(n,i)=>c.plots[n].data[i].value;
const at=t=>data.findIndex(b=>b.openTime===Date.parse('2026-10-05T'+t+':00+07:00'));
assert.equal(v('Стоп позиции',at('16:30')),121.94);
for(let i=at('16:30');i<data.length;i++){
 assert.equal(v('Стоп позиции',i),121.94,'local pullback cannot replace original stop');
 assert.equal(v('Вход LONG/SHORT',i),0,'price never retests original RR1');
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',i),0,'unfilled scenario is not a stopped trade');
}
assert.equal(v('StopLabel',at('20:00')),121.94,'original tool remains visible');
assert.equal(v('Состояние позиции',at('20:00')),1,'still waiting for its own retest');
assert.equal(v('Цель позиции',at('20:00')),120.3);
assert.equal(v('Граница RR 1:1',at('20:00')),121.12);
console.log('PASS MEXC Oct 5: original stop 121.94 retained; RR1 121.12; no entry or stop-loss');
