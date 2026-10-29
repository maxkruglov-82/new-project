import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const f=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-16.json',import.meta.url)));
const data=f.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const diag=`
plot(array.size(v1ExitMarks),"ExitDots")
plot(array.size(v1ExitMarks)>0?label.get_x(array.get(v1ExitMarks,0)):na,"SLTime")
plot(array.size(v1ExitMarks)>0?label.get_y(array.get(v1ExitMarks,0)):na,"SLPrice")
plot(array.size(v1ExitMarks)>1?label.get_x(array.get(v1ExitMarks,1)):na,"TPTime")
plot(array.size(v1ExitMarks)>1?label.get_y(array.get(v1ExitMarks,1)):na,"TPPrice")
plot(str.contains(label.get_text(positionStopInfo),"-0.97%")?1:0,"StopPct")
plot(str.contains(label.get_text(positionTargetInfo),"+0.97%")?1:0,"TargetPct")
plot(retryContinuationBreakTime,"RetryBreak")
`;
const c=await new PineTS(data,'SOLUSDT','5').run(source+diag);
const at=t=>data.findIndex(b=>b.openTime===Date.parse('2026-10-16T'+t+':00+07:00'));
const v=(n,t)=>c.plots[n].data[at(t)].value;
assert.equal(v('Вход LONG/SHORT','17:35'),-1);
assert.equal(v('Цена входа по close','17:35'),106.31);
assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2','18:10'),-1);
assert.equal(v('RetryBreak','19:50'),Date.parse('2026-10-16T19:50:00+07:00'));
assert.equal(v('Состояние позиции','20:55'),1);
assert.equal(v('Вход LONG/SHORT','21:15'),0);
assert.equal(v('Вход LONG/SHORT','21:20'),-1);
assert.equal(v('Цена входа по close','21:20'),106.185);
assert.equal(v('Стоп позиции','21:20'),107.21);
assert.equal(v('Цель позиции','21:20'),105.16);
assert.equal(v('Входов за день','21:20'),2);
assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2','22:05'),1);
assert.equal(v('ExitDots','22:05'),2);
assert.equal(v('SLTime','22:05'),Date.parse('2026-10-16T18:10:00+07:00'));
assert.equal(v('SLPrice','22:05'),106.84);
assert.equal(v('TPTime','22:05'),Date.parse('2026-10-16T22:05:00+07:00'));
assert.equal(v('TPPrice','22:05'),105.16);
assert.equal(v('StopPct','22:05'),1);
assert.equal(v('TargetPct','22:05'),1);
const dayFills=data.flatMap((b,i)=>b.openTime>=Date.parse('2026-10-16T00:00:00+07:00')&&b.openTime<Date.parse('2026-10-17T00:00:00+07:00')&&c.plots['Вход LONG/SHORT'].data[i].value?[c.plots['Вход LONG/SHORT'].data[i].value]:[]);
assert.deepEqual(dayFills,[-1,-1],'no automatic LONG; exactly two SHORT fills on Friday');
assert.ok(source.includes('color=stopped ? color.red : color.green'));
console.log('PASS MEXC Friday Oct16: first SHORT SL; new 1-2-3 confirms SHORT retry 106.185, TP 105.16; exit dots and percentages');
