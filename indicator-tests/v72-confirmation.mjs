import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const src=readFileSync(new URL('../KRYTES_v72_REVERSAL_UPDATED.txt',import.meta.url),'utf8');
assert.ok(!src.includes('cancelExtendedScenarios'),'rejected distance filter stays absent');
const source=src+'\nplot(structureAbove(close,close[1],h1High)?1:0,"Test Up",display=display.none)\nplot(structureBelow(close,close[1],h1Low)?1:0,"Test Down",display=display.none)\nplot(h1PairAbove?1:0,"Test H1 Up",display=display.none)\nplot(h1PairBelow?1:0,"Test H1 Down",display=display.none)\nplot(structureAbove(close[1],close[2],h1High,1)?1:0,"Test Prior Up",display=display.none)\nplot(structureBelow(close[1],close[2],h1Low,1)?1:0,"Test Prior Down",display=display.none)\n';
const start=Date.parse('2026-10-23T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start+86400000});
const c=(i,close)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open:close,high:close+.02,low:close-.02,close,volume:100});
const hour=Array.from({length:12},(_,i)=>({...c(i,95),high:100,low:90}));
const cases=[['offset then equality',100.01,100,1],['equality then offset',100,100.01,0],['less than one cent',100.005,100,0],['second returns inside',100.01,99.99,0],['second above by subcent',100.01,100.005,1],['both one cent',100.01,100.01,1]];
for(const down of [false,true])for(const [name,first,second,expected] of cases){
 const convert=b=>down?{...b,open:190-b.open,high:190-b.low,low:190-b.high,close:190-b.close}:b;
 const data=[...hour,c(12,first),c(13,second)].map(convert);
 const last=data.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};
 mock.timers.setTime(guard.openTime+1000);
 const ctx=await new PineTS([...data,guard],'SOLUSDT','5').run(source);
 const suffix=down?'Down':'Up';
 assert.equal(ctx.plots['Test '+suffix].data[13].value,expected,name);
 assert.equal(ctx.plots['Test H1 '+suffix].data[13].value,expected,'H1: '+name);
 assert.equal(ctx.plots['Test '+suffix].data[14].value,0,'open second candle cannot confirm');
 assert.equal(ctx.plots['Test Prior '+suffix].data[14].value,expected,'shifted closed pair preserves chronological order even during an open bar');
 if(expected)assert.equal(ctx.plots.Direction.data[13].value,down?-1:1,'initial H1 priority must accept equal second close');
 console.log(`PASS ${down?'SHORT':'LONG'}: ${name}`);
}
for(const down of [false,true]){
 const convert=b=>down?{...b,open:190-b.open,high:190-b.low,low:190-b.high,close:190-b.close}:b;
 const data=[...hour,c(12,100.01),c(14,100)].map(convert);
 const last=data.at(-1);mock.timers.setTime(last.openTime+step+1000);
 const ctx=await new PineTS([...data,{...last,openTime:last.openTime+step,closeTime:last.closeTime+step}],'SOLUSDT','5').run(source);
 assert.equal(ctx.plots['Test H1 '+(down?'Down':'Up')].data[13].value,0,'missing M5 invalidates pair');
}
console.log('PASS missing M5 does not confirm');
