import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const oldSource=process.argv[2]?readFileSync(process.argv[2],'utf8'):null;
const newSource=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const start=Date.parse('2026-10-21T13:00:00+07:00');
for(const mirror of [false,true]){
 const raw=Array.from({length:24},(_,i)=>({open:100,close:100,high:i<12?103:101,low:99}));
 [[101,101.2],[101.2,101.5],[101.5,102],[101.999,100]].forEach(([open,close],i)=>raw[i]={open,close,high:103,low:99});
 [[100,100.5],[100.5,100.8],[100.8,100.4],[100.4,100.3],[100.3,100.2]].forEach(([open,close],i)=>raw[19+i]={open,close,high:101,low:99});
 raw.push(...[[100.2,98.8],[98.8,98.6],[98.6,98.7],[98.7,99],[99,98.95],[98.95,98.95]].map(([open,close])=>({open,close,high:Math.max(open,close)+0.02,low:Math.min(open,close)-0.02})));
 const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const old=oldSource?await new PineTS(data,'SOLUSDT','5').run(oldSource):null;
 const current=await new PineTS(data,'SOLUSDT','5').run(newSource+'\nplot(confirmedZeroTime,"T0")\nplot(structureFirstPrice,"P1")');
 if(old)assert.ok(!Number.isFinite(old.plots['Цена точки 0'].data[28].value),'published version reproduces missing 0');
 assert.ok(Math.abs(current.plots['Цена точки 0'].data[28].value-(mirror?99.2:100.8))<1e-8,'bounded replay recovers eligible origin');
 assert.equal(current.plots.T0.data[28].value,start+20*300000,'time is at the in-range peak plateau');
 assert.ok(Math.abs(current.plots.P1.data[28].value-(mirror?101.4:98.6))<1e-8);
 console.log('PASS reproduced missing zero fixed without changing point 1',mirror?'low':'high');
}
