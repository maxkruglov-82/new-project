import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('twoM5Break('),source.indexOf('// Точка 0 —'));
const start=Date.parse('2026-10-21T15:00:00+07:00');
const cases=[
 {name:'one close rejected, second confirms',cs:[99,100.02,100.03],expected:[false,false,true]},
 {name:'return to level resets pair',cs:[100.02,100,100.02,100.03],expected:[false,false,false,true]},
 {name:'both closes need offset',cs:[100.005,100.02,100.03],expected:[false,false,true]},
 {name:'exact offset accepted',cs:[100.01,100.01],expected:[false,true]},
 {name:'gap cannot bridge two candles',cs:[100.02,100.03,100.04],gap:1,expected:[false,false,true]},
 {name:'day change cannot bridge two candles',cs:[100.02,100.03,100.04],dayChange:1,expected:[false,false,true]},
 {name:'both closes compared to same current level',cs:[100.02,100.12,100.13],levels:[100,100.1,100.1],expected:[false,false,true]},
];
for(const f of cases)for(const upward of [true,false]){
 const levels=(f.levels??f.cs.map(()=>100)).map(x=>upward?x:200-x);
 const keys=f.cs.map((_,i)=>f.dayChange!==undefined&&i>=f.dayChange?20261022:20261021);
 const script='//@version=5\nindicator("pair")\n'+fn+`\nvar ls=array.from(${levels})\nvar ks=array.from(${keys})\nkey=array.get(ks,bar_index)\npair=time-time[1]==300000 and key==key[1]\nplot(twoM5Break(array.get(ls,bar_index),${upward},0.01,pair)?1:0,"Confirmed")`;
 const data=f.cs.map((x,i)=>{const close=upward?x:200-x,t=start+(i+(f.gap!==undefined&&i>=f.gap?1:0))*300000;return {open:close,close,high:200,low:1,volume:1,openTime:t,closeTime:t+299999};});
 const c=await new PineTS(data,'SOLUSDT','5').run(script);
 assert.deepEqual(c.plots.Confirmed.data.map(x=>x.value===1),f.expected,f.name);
 console.log('PASS two-close confirmation:',f.name,upward?'UP':'DOWN');
}
// The level-1 and hourly exceptions must remain in the actual strategy paths.
assert.match(source,/bool crossedFirst = structureSide == -1 \? structureFirstPrice - close/);
assert.match(source,/bool continuationConfirmsSecond = structureSide == -1 \? structureFirstPrice - close/);
assert.match(source,/bool confirmedAbove = close - activeRangeHigh/);
assert.match(source,/bool reverseBreak = firstPositionIsZero \? reverseBreakSingle : twoM5Break/);
console.log('PASS point 1 remains a one-close exception, including retry through stop at 1');
