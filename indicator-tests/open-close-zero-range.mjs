import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedZeroTime,"T0")\nplot(firstExtremeTime,"T1")';
const start=Date.parse('2026-10-27T13:00:00+07:00');
for(const mirror of [false,true])for(const mode of ['late','first','boundary','outside']){
 const raw=Array.from({length:24},(_,i)=>({open:100,close:100,high:i<12?105:101,low:99}));
 // Pre-14 maximum is excluded. Tiny later pivots must not replace the highest origin.
 raw[2]={open:103,close:104,high:105,low:99};
 [[100,100.4],[100.4,100.2]].forEach(([open,close],i)=>raw[12+i]={open,close,high:101,low:99});
 [[100.2,100.6],[100.6,100.8],[100.8,100.4]].forEach(([open,close],i)=>raw[21+i]={open,close,high:101,low:99});
 if(mode==='first')raw[12]={open:100,close:100.9,high:101,low:99};
 if(mode==='boundary')raw[22]={open:100.6,close:101,high:101,low:99};
 const firstOpen=mode==='outside'?102:100.4;
 raw.push(...[[firstOpen,98.8],[98.8,98.6],[98.6,98.7],[98.7,99],[99,99.1],[99.1,102]].map(([open,close])=>({open,close,high:150,low:50})));
 const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i=28)=>c.plots[n].data[i].value;
 const price=mode==='first'?100.9:mode==='boundary'?101:100.8;
 assert.ok(Math.abs(v('Цена точки 0')-(mirror?200-price:price))<1e-8);
 assert.equal(v('T0'),start+(mode==='first'?12:22)*300000,'maximum/minimum inside H1 between 14 and 1');
 assert.ok(v('T0')<v('T1'));
 assert.equal(v('Цена точки 0',29),v('Цена точки 0'),'later movement after 1 cannot rewrite origin');
 console.log('PASS range origin',mode,mirror?'low':'high');
}
