import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
import {observe} from '../new-project-2/backtest/run.mjs';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('KRYTES_v72_REVERSAL_UPDATED.txt',root),'utf8');
const raw=JSON.parse(readFileSync(new URL('new-project-2/drafts/bag-ab-2026-10-23/candles-six-months.json',root))).candles;
mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-24T00:00:00+07:00')});
async function run(date){
 const start=Date.parse(`${date}T14:00:00+07:00`),end=start+86400000;
 const data=raw.filter(b=>b.time*1000>=start&&b.time*1000<end).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+299999,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
 assert.equal(data.length,288,'complete reference session');
 const last=data.at(-1),guard={...last,openTime:end,closeTime:end+299999};
 mock.timers.setTime(end+1000);
 const ctx=await new PineTS([...data,guard],'SOLUSDT','5').run(observe(source));
 const v=(n,i)=>ctx.plots[n].data[i].value;
 const entries=[],outcomes=[];
 for(let i=0;i<data.length;i++){
  const time=new Date(data[i].openTime+7*3600000).toISOString().slice(0,16);
  if(v('SHORT',i)||v('LONG',i)){
   const side=v('SHORT',i)?'SHORT':'LONG';
   entries.push({side,time,entry:v(`${side} Entry`,i),stop:v(`${side} Stop`,i),target:v(`${side} Target`,i),setupLevel:v('Setup Break Level',i)});
  }
  const result=v('BT Result',i);if(Number.isFinite(result))outcomes.push({time,result});
 }
 assert.ok(entries.length<=2);
 if(entries.length===2){assert.equal(outcomes[0].result,-1);assert.ok(outcomes[0].time<entries[1].time);}
 return {entries,outcomes};
}
const short=await run('2026-08-03');
assert.equal(short.entries.length,1);assert.equal(short.entries[0].side,'SHORT');assert.equal(short.entries[0].time,'2026-08-03T18:20');
assert.ok(Math.abs(short.entries[0].entry-72.57)<1e-8);
assert.equal(short.outcomes.length,1);assert.equal(short.outcomes[0].result,1);assert.equal(short.outcomes[0].time,'2026-08-03T19:05');
const long=await run('2026-08-04');
assert.equal(long.entries.length,1);assert.equal(long.entries[0].side,'LONG');assert.equal(long.entries[0].time,'2026-08-04T19:15');
assert.ok(Math.abs(long.entries[0].setupLevel-73.72)<1e-8,'confirmed break above the updated 2Sh while retaining the completed pullback');
assert.ok(Math.abs(long.entries[0].stop-73.48)<1e-8,'stop at higher pullback low minus configured offset');
assert.ok(Math.abs(long.entries[0].entry-73.73)<1e-8,'entry uses the midpoint before offsets');
assert.ok(Math.abs(long.entries[0].target-73.98)<1e-8,'target extends 0.03 above the original high');
assert.ok(Math.abs((long.entries[0].target-long.entries[0].entry)/(long.entries[0].entry-long.entries[0].stop)-1)<1e-8,'actual RR remains 1:1');
assert.equal(long.outcomes[0].result,1);
assert.equal(long.outcomes[0].time,'2026-08-04T19:35');
const retry=await run('2026-10-08');
assert.equal(retry.entries.length,2);assert.deepEqual(retry.outcomes.map(o=>o.result),[-1,1]);
console.log(JSON.stringify({aug03:short,aug04:long,oct08:retry},null,2));
console.log('PASS inner SHORT; higher-low LONG without sweeping original 1Sh; second entry only after stop');

const aug10=await run('2026-08-10');
assert.equal(aug10.entries.length,2,'10 August must have exactly two actual entries');
assert.deepEqual(aug10.entries.map(t=>t.side),['LONG','SHORT']);
assert.deepEqual(aug10.outcomes.map(t=>t.result),[-1,1]);
assert.equal(aug10.entries[0].time,'2026-08-10T19:25');
assert.equal(aug10.outcomes[0].time,'2026-08-10T19:55');
assert.equal(aug10.entries[1].time,'2026-08-10T21:10');
assert.ok(Math.abs(aug10.entries[1].setupLevel-76.50)<1e-8,'use the original 1Sh, not the higher LONG pullback low');
assert.ok(Math.abs(aug10.entries[1].entry-76.61)<1e-8);
assert.ok(Math.abs(aug10.entries[1].stop-77.12)<1e-8);
assert.ok(Math.abs(aug10.entries[1].target-76.10)<1e-8);
assert.equal(aug10.outcomes[1].time,'2026-08-10T22:10','existing trade can reach target after entry cutoff');
assert.ok(aug10.outcomes[0].time<aug10.entries[1].time);
console.log(JSON.stringify({aug10},null,2));
console.log('PASS 10 August: LONG stopped, original 1Sh restored, second SHORT retest before 22:00, target after 22:00');

const aug05=await run('2026-08-05');
assert.equal(aug05.entries.length,1,'5 August: false LONG must not consume the first entry');
assert.equal(aug05.entries[0].side,'SHORT');
assert.equal(aug05.entries[0].time,'2026-08-05T18:05');
assert.ok(Math.abs(aug05.entries[0].entry-73.965)<1e-8,'base midpoint is reached on the first valid retest');
assert.ok(Math.abs(aug05.entries[0].stop-74.20)<1e-8);
assert.ok(Math.abs(aug05.entries[0].target-73.73)<1e-8);
assert.ok(Math.abs((aug05.entries[0].entry-aug05.entries[0].target)/(aug05.entries[0].stop-aug05.entries[0].entry)-1)<1e-8);
assert.deepEqual(aug05.outcomes,[{time:'2026-08-05T18:30',result:1}]);
console.log(JSON.stringify({aug05},null,2));
console.log('PASS 5 August: no stale-1L LONG, SHORT retest 18:05, symmetric offsets, target 18:30');
