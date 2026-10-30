import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url),s=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE.txt',root),'utf8');
const baseline=readFileSync(new URL('reports/backtest-2026-v1-hour-15-16/baseline-indicator.txt',root),'utf8');
// October21 is summer London; baseline and current use the same14-15 hour.
const f=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-10-21-v1-structure.json',import.meta.url)));
for(const mirror of [false,true]){
 const p=x=>mirror?220-x:x,d=f.candles.map(x=>({...x,open:p(x.open),close:p(x.close),high:mirror?p(x.low):x.high,low:mirror?p(x.high):x.low,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const a=await new PineTS(d,'SOLUSDT','5').run(baseline),b=await new PineTS(d,'SOLUSDT','5').run(s);
 for(const n of Object.keys(a.plots).filter(n=>!n.startsWith('__')&&n!=='Действующий цвет тренда'))assert.deepEqual(b.plots[n].data,a.plots[n].data,'financial values unchanged '+n);
 const marks=b.plots.__labels__.data.flatMap(x=>x.value).filter(x=>!x._deleted);
 const one=marks.find(x=>x.text===(mirror?'1 · L':'1 · H')),zero=marks.find(x=>x.text===(mirror?'0 · H':'0 · L'));
 assert.ok(one&&zero);assert.equal(one.x,Date.parse('2026-10-21T15:45:00+07:00'));assert.equal(one.y,p(107));assert.ok(zero.x<one.x);
 const later=marks.filter(x=>x.x>one.x&&/^(HH|HL|LH|LL)$/.test(x.text));assert.ok(later.length>0);
 console.log('PASS Oct21 fixed initial1 at15:45/107, later extremes use structure labels; financial series unchanged; mirror='+mirror);
}
