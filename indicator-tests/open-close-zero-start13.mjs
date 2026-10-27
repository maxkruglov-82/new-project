import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedZeroTime,"T0")\nplot(firstSwingDisplayLocked?1:0,"Ready1")';
const start=Date.parse('2026-10-27T12:45:00+07:00');
for(const mirror of [false,true])for(const outside of [false,true]){
 const raw=Array.from({length:27},(_,i)=>({open:100,close:100,high:i<15?104:101,low:99}));
 raw[2]={open:100.98,close:100.99,high:104,low:99}; // 12:55: higher but too early.
 raw[3]={open:100,close:outside?102:100.95,high:104,low:99}; // 13:00 included, H1 cap still applies.
 raw[4]={open:outside?102:100.95,close:100.4,high:104,low:99};
 raw[14]={open:100.4,close:102,high:104,low:99}; // 13:55 outside H1 price bound.
 raw[25]={open:100.6,close:100.8,high:101,low:99};
 raw[26]={open:100.8,close:100.4,high:101,low:99};
 raw.push(...[[100.4,98.8],[98.8,98.6],[98.6,98.7],[98.7,99],[99,99.1],[99.1,99.2],[99.2,99.2]].map(([open,close])=>({open,close,high:150,low:50})));
 const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=n=>c.plots[n].data[32].value;
 assert.equal(v('Ready1'),1);
 const expected=outside?100.8:100.95;
 assert.ok(Math.abs(v('Цена точки 0')-(mirror?200-expected:expected))<1e-8);
 assert.equal(v('T0'),start+(outside?25:3)*300000);
 console.log('PASS zero search from 13:00, prior bars excluded and H1 retained',mirror?'low':'high',outside?'price cap':'13:00 boundary');
}
