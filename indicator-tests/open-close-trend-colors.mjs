import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
let source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8').replace('bool originConfirmed = not againstInitialTrend or zeroTrendReversed','bool originConfirmed = true').replace('if zeroInitialUp or zeroInitialDown','if false'); // Isolate drawing regression from origin-entry gate, covered separately.
for(const segment of ['01','12','23','34','45'])source+=`\nplot(trend${segment}Direction,"Direction${segment}")\nplot(array.size(trend${segment}Lines),"Lines${segment}")`;
source+='\nplot(array.size(trendHistoryLines),"AllLines")\nfloat firstStrokeLow = na\nfloat firstStrokeHigh = na\nif array.size(trend01Lines) > 0\n    firstStrokeLow := line.get_y1(array.get(trend01Lines,0))\n    firstStrokeHigh := line.get_y2(array.get(trend01Lines,0))\nplot(firstStrokeLow,"StrokeLow")\nplot(firstStrokeHigh,"StrokeHigh")';
const start=Date.parse('2026-10-21T13:00:00+07:00');
for(const mirror of [false,true]){
 const raw=Array.from({length:24},(_,i)=>({open:100,close:100,high:i<12?103:101,low:99}));
 [[101,101.2],[101.2,101.5],[101.5,102],[101.999,100]].forEach(([open,close],i)=>raw[i]={open,close,high:103,low:99});
 [[100,100.5],[100.5,100.8],[100.8,100.4],[100.4,100.3],[100.3,100.2]].forEach(([open,close],i)=>raw[19+i]={open,close,high:101,low:99});
 const tail=[[100.2,98.8],[98.8,98.6],[98.6,98.7],[98.7,99],[99,98.95],[98.95,98.8],[98.8,98.65],[98.65,98.66],[98.66,99.01],[99.01,99.2],[99.2,98.8],[98.8,98.5],[98.5,98.95],[98.95,98.8],[98.8,98.8]];
 raw.push(...tail.map(([open,close])=>({open,close,high:150,low:50})));
 const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const ctx=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>ctx.plots[n].data[i].value;
 const last=data.length-2;
 for(const [index,seg] of ['01','12','23','34','45'].entries()){
  assert.equal(v('Direction'+seg,last),(index%2===0?-1:1)*(mirror?-1:1),'trend '+seg);
  assert.ok(v('Lines'+seg,last)>0,'painted '+seg);
  assert.equal(v('Lines'+seg,last)%3,0,'complete OHLC body-only bar strokes');
 }
 assert.ok(Math.abs(v('StrokeLow',last)-(mirror?99.2:100.5))<1e-8,'paint uses body low, not hidden wick');
 assert.ok(Math.abs(v('StrokeHigh',last)-(mirror?99.5:100.8))<1e-8,'paint uses body high, not hidden wick');
 for(let i=0;i<data.length;i++)assert.ok(v('AllLines',i)<=450,'bounded drawing history');
 assert.ok(v('Lines34',33)>v('Lines34',32),'moving 4 extends colored segment');
 console.log('PASS alternating segment colors 0–1 through 4–5 and moving endpoint',mirror?'mirror':'original');
}
