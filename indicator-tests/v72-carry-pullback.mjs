import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const start=Date.parse('2026-10-26T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start+86400000});
const c=(i,o,h,l,z)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open:o,high:h,low:l,close:z,volume:100});
const hour=Array.from({length:12},(_,i)=>c(i,105,110,100,105));
const data=[...hour,c(12,101,102,98,99),c(13,99,101,98.5,99.5),c(14,99.5,102,99,101),c(15,101,104,100,103),c(16,103,103.5,100.5,102),c(17,102,103,100.3,101),c(18,101,102,100,101),c(19,101,103,100.4,102),c(20,102,104.02,101,103.9),c(21,103.9,103.95,101.2,103.7),c(22,103.7,104.1,102,104.03),c(23,104.03,104.2,102.2,104.04),c(24,104.04,104.1,101.9,102),c(25,102,105,102,104.8)];
const source=readFileSync(new URL('../KRYTES_v72_REVERSAL_UPDATED.txt',import.meta.url),'utf8')+'\nplot(point1,"D P1",display=display.none)\nplot(point2,"D P2",display=display.none)\nplot(internalShortLow,"D Low",display=display.none)\nplot(rawUpperPivot?1:0,"D Raw High",display=display.none)\nplot(rawLowerPivot?1:0,"D Raw Low",display=display.none)\n';

async function run(bars){
 const last=bars.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};
 const ctx=await new PineTS([...bars,guard],'SOLUSDT','5').run(source);
 return (name,index)=>ctx.plots[name].data[index].value;
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const v=await run(data);
near(v('D P2',21),104.02);near(v('D Low',21),100);
assert.equal(v('Stage',23),5,'two closes above updated high confirm LONG with carried pullback');
near(v('D P1',23),104.02);near(v('D P2',23),100);
assert.equal(v('LONG',23),0,'confirmation is not entry');assert.equal(v('LONG',24),1,'entry only at later retest');
near(v('LONG Stop',24),99.97);near(v('LONG Entry',24),102.10);near(v('LONG Target',24),104.23);
const belowUpdated=data.map(b=>({...b}));belowUpdated[22].close=104.01;belowUpdated[23].close=104.02;
const n=await run(belowUpdated);
assert.equal(n('Stage',23),4,'closes beyond old high but not updated high cannot confirm');
assert.equal(n('LONG',24),0);
const equality=data.map(b=>({...b}));equality[23].close=104.02;
assert.equal((await run(equality))('Stage',23),5,'second close may equal updated high');
const incomplete=data.map(b=>({...b}));incomplete[17].low=99.9;
const k=await run(incomplete);
assert.equal(k('Stage',23),4,'a two-candle old pullback cannot be carried as a completed three-candle one');
assert.equal(k('LONG',24),0);
console.log('PASS carried pullback: new 2Sh replaces breakout high, completed low retained, new-high confirmation and later RR1 entry required');
console.log('PASS invalid old-high closes and incomplete old pullbacks rejected; second close equality allowed');
