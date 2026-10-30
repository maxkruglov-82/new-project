import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../reports/backtest-2026-v1-hour-15-16/',import.meta.url);
const baseline=readFileSync(new URL('baseline-indicator.txt',root),'utf8'),shifted=readFileSync(new URL('indicator.txt',root),'utf8');
const a='int bodyHourStart = timestamp(rangeTimezone, rangeYear, rangeMonth, rangeDay, 14, 0)',b='int bodyHourEnd = timestamp(rangeTimezone, rangeYear, rangeMonth, rangeDay, 15, 0)';
assert.equal(shifted.replace(a.replace('14, 0','15, 0'),a).replace(b.replace('15, 0','16, 0'),b),baseline,'only H1 start/end may change');
assert.ok(shifted.includes('int zeroSearchStart = timestamp(rangeTimezone, rangeYear, rangeMonth, rangeDay, 13, 0)'));
const f=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-10-29.json',import.meta.url)));
const data=f.candles.map(x=>({...x,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
for(const [source,h] of [[baseline,14],[shifted,15]]){
 const c=await new PineTS(data,'SOLUSDT','5').run(source+'\nplot(activeRangeHigh,"H")\nplot(activeRangeLow,"L")\nplot(firstPointWindow?1:0,"Window")\nplot(zeroSearchStart,"ZeroStart")');
 const start=Date.parse('2026-10-29T'+h+':00:00+07:00'),end=start+3600000;
 const bars=data.filter(x=>x.openTime>=start&&x.openTime<end);assert.equal(bars.length,12);
 const i=data.findIndex(x=>x.openTime===end-300000);
 assert.equal(c.plots.H.data[i].value,Math.max(...bars.map(x=>x.high)));
 assert.equal(c.plots.L.data[i].value,Math.min(...bars.map(x=>x.low)));
 assert.equal(c.plots.Window.data[i].value,0);assert.equal(c.plots.Window.data[i+1].value,1);
 assert.equal(c.plots.ZeroStart.data[i].value,Date.parse('2026-10-29T13:00:00+07:00'));
 console.log('PASS H1 '+h+'-'+(h+1)+': exact12 wick bars, search starts at hour end, zero search13:00');
}
