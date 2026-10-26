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
assert.equal(long.entries.length,1);assert.equal(long.entries[0].side,'LONG');assert.equal(long.entries[0].time,'2026-08-04T19:55');
assert.ok(Math.abs(long.entries[0].setupLevel-73.69)<1e-8,'confirmed break above 2Sh');
assert.ok(Math.abs(long.entries[0].stop-73.48)<1e-8,'stop at higher pullback low minus configured offset');
assert.equal(long.outcomes[0].result,-1,'record actual stop, not an assumed win from a screenshot');
const retry=await run('2026-10-08');
assert.equal(retry.entries.length,2);assert.deepEqual(retry.outcomes.map(o=>o.result),[-1,1]);
console.log(JSON.stringify({aug03:short,aug04:long,oct08:retry},null,2));
console.log('PASS inner SHORT; higher-low LONG without sweeping original 1Sh; second entry only after stop');
