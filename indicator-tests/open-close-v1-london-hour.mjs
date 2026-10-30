import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url),source=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE.txt',root),'utf8');
const mini=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE_SMALL.txt',root),'utf8');
const diagnostic='\nplot(bodyHourStart,"LondonStart")\nplot(bodyHourEnd,"LondonEnd")\nplot(zeroSearchStart,"ZeroStart")\nplot(activeRangeHigh,"RangeHigh")\nplot(activeRangeLow,"RangeLow")';
for(const [day,h] of [['2026-01-15',15],['2026-03-27',15],['2026-03-30',14],['2026-07-15',14],['2026-10-23',14],['2026-10-26',15],['2025-12-15',15]]){
 const start=Date.parse(day+'T12:00:00+07:00');
 const d=Array.from({length:84},(_,i)=>{const t=start+i*300000;let o=100,c=100,hi=101,lo=99;
 if(t===Date.parse(day+'T'+h+':15:00+07:00')){hi=106;lo=96;}
 if(t===Date.parse(day+'T'+h+':50:00+07:00')){hi=104;lo=94;}
 return {open:o,close:c,high:hi,low:lo,volume:1,openTime:t,closeTime:t+299999};});
 const end=Date.parse(day+'T'+(h+1)+':00:00+07:00'),i=d.findIndex(x=>x.openTime===end-300000);
 {
  const c=await new PineTS(d,'SOLUSDT','5').run(source+diagnostic),v=(n,j=i)=>c.plots[n].data[j].value;
  assert.equal(v('LondonStart'),end-3600000);assert.equal(v('LondonEnd'),end);assert.equal(v('ZeroStart'),Date.parse(day+'T13:00:00+07:00'));
  assert.ok(Number.isNaN(v('RangeHigh',i-1)),'range is not published before hour closes');
  assert.equal(v('RangeHigh'),106);assert.equal(v('RangeLow'),94,'use wick extremes, not bodies');
  const boxes=c.plots.__boxes__.data.flatMap(x=>x.value).filter(x=>!x._deleted&&x.top===106&&x.bottom===94);
  assert.equal(boxes.length,1);assert.equal(boxes[0].left,end-3600000);
 }
 const a=await new PineTS(d,'SOLUSDT','5').run(source),b=await new PineTS(d,'SOLUSDT','5').run(mini);
 const normalized=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v));
 for(const n of Object.keys(a.plots))assert.deepEqual(normalized(b.plots[n]),normalized(a.plots[n]),'full/small '+day+' '+n);
 console.log('PASS London08-09 -> Krasnoyarsk'+h+'-'+(h+1)+': '+day+'; closed H1, wick extremes, DST and compact parity');
}
