import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
import {observe} from '../new-project-2/backtest/run.mjs';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('KRYTES_v83_REVERSAL_UPDATED.txt',root),'utf8');
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
   assert.equal(v(`${side} Entry`,i),data[i].close,'fill must equal candle close');
   assert.ok(data[i].openTime+300000<start+10*3600000,'entry closes before midnight');
   entries.push({side,time,entry:v(`${side} Entry`,i),stop:v(`${side} Stop`,i),target:v(`${side} Target`,i),setupLevel:v('Setup Break Level',i)});
  }
  const result=v('BT Result',i);if(Number.isFinite(result))outcomes.push({time,result});
 }
 assert.ok(entries.length<=2);
 if(entries.length===2){assert.equal(outcomes[0].result,-1);assert.ok(outcomes[0].time<entries[1].time);}
 return {entries,outcomes};
}

for(const day of ['2026-10-05','2026-10-16','2026-10-19','2026-10-21'])console.log(JSON.stringify({day,...await run(day)}));
