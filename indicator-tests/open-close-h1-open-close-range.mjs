import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(activeRangeHigh,"RangeTop")\nplot(activeRangeLow,"RangeBottom")\nplot(activeRangeDay,"RangeDay")\nplot(structureSide,"Side")';
assert.equal(readFileSync(new URL('../KRYTES_OPEN_CLOSE_H1_BODY_RANGE.txt',import.meta.url),'utf8'),source.split('\nplot(activeRangeHigh')[0]);
const start=Date.parse('2026-10-08T14:00:00+07:00');
for(const [name,first,last,expectedTop,expectedBottom,exit] of [['bull',100,102,102,100,102.02],['bear',102,100,102,100,99.98],['doji',100,100,100,100,100.02]]){
 const bars=Array.from({length:12},(_,i)=>({open:i===0?first:101,close:i===11?last:i===4?110:i===5?90:101,high:120,low:80,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}));
 bars.push({open:last,close:exit,high:120,low:80,volume:1,openTime:start+12*300000,closeTime:start+13*300000-1});
 const c=await new PineTS(bars,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 assert.ok(Number.isNaN(v('RangeTop',10))||v('RangeTop',10)==null,'no range before hour completes');
 assert.equal(v('RangeTop',11),expectedTop);assert.equal(v('RangeBottom',11),expectedBottom);
 assert.equal(v('RangeTop',12),expectedTop);assert.equal(v('RangeBottom',12),expectedBottom);
 assert.equal(v('Side',12),exit>expectedTop?1:-1,'first exit uses H1 body, not wick or interior bodies');
 const gap=bars.filter((_,i)=>i!==5),g=await new PineTS(gap,'SOLUSDT','5').run(source);
 assert.ok(Number.isNaN(g.plots.RangeDay.data.at(-1).value)||g.plots.RangeDay.data.at(-1).value==null,'missing M5 cannot create complete H1');
 console.log('PASS H1 open/close:',name,'ignores wicks and intermediate bodies; fixed after hour; gap rejected');
}
