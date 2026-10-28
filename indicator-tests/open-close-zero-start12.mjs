import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedZeroTime,"T0")\nplot(firstSwingDisplayLocked?1:0,"Ready1")';
const start=Date.parse('2026-10-27T11:45:00+07:00');
for(const mirror of [false,true]){
 const raw=Array.from({length:39},()=>({open:101,close:101,high:103,low:99}));
 raw[2]={open:103,close:103,high:103,low:99}; // 11:55 excluded.
 [[100,100],[100,102],[102,101.8],[101.8,101.5],[101.5,102],[102,101.4],[101.4,101]].forEach(([open,close],i)=>raw[i+3]={open,close,high:103,low:99});
 raw.push(...[[101,98.8],[98.8,98.6],[98.6,98.7],[98.7,99],[99,99.1],[99.1,99.2],[99.2,99.2]].map(([open,close])=>({open,close,high:Math.max(open,close),low:Math.min(open,close)})));
 const data=raw.map((b,i)=>({...b,...(mirror?{open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high}:{}),volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}));
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=n=>c.plots[n].data[44].value;
 assert.equal(v('Ready1'),1);
 assert.equal(v('Цена точки 0'),mirror?98:102);
 assert.equal(v('T0'),Date.parse('2026-10-27T12:25:00+07:00'),'candidate before 13:00 is allowed; before 12:00 excluded');
 console.log('PASS origin search begins at 12:00, 12:25 candidate accepted, 11:55 excluded',mirror?'LOW':'HIGH');
}
