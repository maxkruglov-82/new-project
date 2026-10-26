import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(process.argv[2]??new URL('../KRYTES_v83_REVERSAL_UPDATED.txt',import.meta.url),'utf8');
assert.ok(source.includes('bool allowSecondAfterTP = false'));
assert.ok(source.includes('bool retry = stage == 6 and outcome == -1 and dailyEntries == 1'));
const start=Date.parse('2026-10-21T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start+86400000});
const c=(i,o,h,l,z)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open:o,high:h,low:l,close:z,volume:100});
const hour=Array.from({length:12},(_,i)=>c(i,105,110,100,105));
const setup=[...hour,c(12,101,102,98,99),c(13,99,101,98.5,99.5),c(14,99.5,102,99,101),c(15,101,104,100,103),c(16,103,103.5,100.5,102),c(17,102,103.7,101,103),c(18,103,105,101.5,104),c(19,104,104.5,100,102),c(20,102,103,97,98.2),c(21,98.2,102,97.5,101),c(22,101,106,100,105.5),c(23,105.5,107,101,106)];
async function run(xs,clock=null,guard=true){
 const last=xs.at(-1),tail={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};
 mock.timers.setTime(clock??tail.openTime+1000);
 const ctx=await new PineTS(guard?[...xs,tail]:xs,'SOLUSDT','5').run(source);
 return (n,i)=>ctx.plots[n].data[i].value;
}
function entryAt(when){
 const at=Date.parse(when),xs=setup.map(b=>({...b}));
 for(let i=24;start+i*step<at;i++)xs.push(c(i,104,105,103,104));
 xs.push(c((at-start)/step,104,106,101.8,103));return xs;
}

for(const [when,expected] of [['2026-10-21T21:55:00+07:00',1],['2026-10-21T22:00:00+07:00',1],['2026-10-21T23:50:00+07:00',1],['2026-10-21T23:55:00+07:00',0],['2026-10-22T00:00:00+07:00',0]]){
 const xs=entryAt(when),v=await run(xs),i=xs.length-1;
 assert.equal(v('LONG',i),expected,when);
 if(expected){assert.equal(v('LONG Entry',i),xs[i].close,'execution at close after bounce');assert.notEqual(v('LONG Entry',i),v('RR1 Threshold',i),'threshold is not fill price');assert.equal(v('Outcome',i),0,'no retrospective result on signal candle');}
 console.log('PASS close entry window',when,expected);
}
const live=entryAt('2026-10-21T22:00:00+07:00');
assert.equal((await run(live,live.at(-1).openTime+60000,false))('LONG',live.length-1),0,'no intrabar fill after touch');
const miss=entryAt('2026-10-21T22:00:00+07:00');miss[miss.length-1]={...miss.at(-1),open:104,high:105,low:103,close:104};
assert.equal((await run(miss))('LONG',miss.length-1),0,'no touch means no entry');
const managed=entryAt('2026-10-21T23:50:00+07:00');managed.push(c(119,103,105,102,104),c(120,104,108,102,107.5));
const m=await run(managed);assert.equal(m('LONG',managed.length-3),1);assert.equal(m('Outcome',managed.length-1),1,'position managed after midnight');
assert.equal(readFileSync(new URL('../KRYTES_v83_TWO_M5_CLOSES.txt',import.meta.url),'utf8'),source,'published copies match');
console.log('PASS unclosed candle, missed touch, midnight management, identical files');
