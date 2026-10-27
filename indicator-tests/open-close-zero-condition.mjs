import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(structureFirstPrice,"P1")\nplot(secondPointReady?1:0,"SecondReady")\nplot(positionSetupBar,"SetupBar")\nplot(firstStopBar,"FirstStopBar")\nplot(zeroConditionUsed?1:0,"ZeroUsed")';
const start=Date.parse('2026-10-21T14:00:00+07:00');
const prefix=[[100.4,101.2],[101.2,101.4],[101.4,101.3],[101.3,101.1],[101.1,100.9],[100.9,100.3],[100.3,99.995],[99.995,99.98],[99.98,99.5],[99.5,100.5]];
async function run(mirror,tail,touchOnly=false){
 const hour=Array.from({length:12},()=>({open:100.4,close:100.4,high:101,low:99}));
 [[100.5,100],[100,100.2],[100.2,100.3],[100.3,100.4]].forEach(([open,close],i)=>hour[8+i]={open,close,high:101,low:99});
 const raw=[...hour,...(touchOnly ? [...prefix.slice(0,-1),[100.6,100]] : prefix).map(([open,close])=>({open,close,high:150,low:50})),...tail.map(([open,close])=>({open,close,high:150,low:50}))];
 const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const ctx=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>ctx.plots[n].data[i].value;
 const entries=[];
 for(let i=0;i<data.length;i++)if(v('Вход LONG/SHORT',i))entries.push({i,side:v('Вход LONG/SHORT',i),entry:v('Цена входа по close',i),stop:v('Стоп позиции',i),target:v('Цель позиции',i),rr:v('RR входа',i)});
 assert.equal(v('ZeroUsed',18),0,'0.005 beyond zero is insufficient');
 assert.equal(v('ZeroUsed',19),1,'one closed M5 0.02 beyond zero launches plan');
 assert.equal(v('Состояние позиции',20),1,'new target extreme is not entry');
 assert.equal(entries[0].i,21,'wait for close in RR zone');
 assert.equal(entries[0].side,mirror?1:-1);
 assert.equal(entries[0].stop,v('P1',21),'stop exactly at point 1');
 assert.equal(v('SecondReady',21),0,'no need to wait for point 2');
 assert.ok(Math.abs(entries[0].target-(mirror?100.5:99.5))<1e-8,'target follows next closed body extreme');
 for(const e of entries){assert.equal(e.entry,data[e.i].close);assert.ok(touchOnly ? e.rr<1 : e.rr>=1);assert.equal(v('Состояние позиции',e.i),2);}
 return {v,entries};
}
for(const mirror of [false,true]){
 const tp=await run(mirror,[[100.5,99.4],[99.4,101.6],[101.6,100.4],[100.4,100.4]]);
 assert.equal(tp.entries.length,1,'no retry after zero-condition TP');assert.equal(tp.v('Состояние позиции',22),3);
 const sl=await run(mirror,[[100.5,101.5],[101.5,100.4],[100.4,99.4],[99.4,101.7],[101.7,100.4],[100.4,100.4]]);
 assert.equal(sl.entries.length,2,'retry after first SL, no third entry');
 assert.equal(sl.entries[1].side,-sl.entries[0].side);
 assert.ok(sl.entries[1].i>sl.v('FirstStopBar',sl.entries[1].i),'no simultaneous positions');
 console.log('PASS zero-condition reversal, stop at 1, moving target, RR>=1, SL-only retry',mirror?'LONG':'SHORT');
}

for(const mirror of [false,true]){const r=await run(mirror,[],true);assert.equal(r.entries.length,1);console.log("PASS RR touch qualifies close fill below RR1",mirror?"LONG":"SHORT");}
