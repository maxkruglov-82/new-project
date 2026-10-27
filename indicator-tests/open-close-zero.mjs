import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedZeroTime,"ZeroTime")\nplot(firstExtremeTime,"FirstTime")\nplot(structureFirstPrice,"P1")';
const start=Date.parse('2026-10-21T14:00:00+07:00');
async function run(mirror,priorPeak=true,qualifiedBounce=true){
 const raw=Array.from({length:12},()=>({open:100,close:100,high:101,low:99}));
 if(priorPeak){
  raw[1]={open:100,close:101,high:150,low:50};
  if(qualifiedBounce){
   [[101,99.8],[99.8,99.7],[99.7,99.6],[99.6,99.8],[99.8,100],[100,100.5]].forEach(([open,close],i)=>raw[i+2]={open,close,high:150,low:50});
  }
  const seq=[[100.5,100.8],[100.8,100.4],[100.4,100.3],[100.3,100.2]];
  seq.forEach(([open,close],i)=>raw[8+i]={open,close,high:150,low:50});
  // Same range in all tests: hidden wicks are irrelevant to 0, but determine H1.
  raw.forEach(b=>{b.high=Math.max(101,b.open,b.close);b.low=99;});
 }
 if(!priorPeak)raw.forEach((b,i)=>{b.open=100-i*0.02;b.close=100-(i+1)*0.02;});
 const tail=[[priorPeak?100.2:99.76,98.8],[98.8,98.6],[98.6,98.7],[98.7,99],[99,98.95],[98.95,98.95]];
 raw.push(...tail.map(([open,close])=>({open,close,high:150,low:50})));
 const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const ctx=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>ctx.plots[n].data[i].value;
 if(priorPeak){
  assert.ok(!Number.isFinite(v('Цена точки 0',15)),'0 waits for confirmed point 1');
  const expected=qualifiedBounce?(mirror?99.2:100.8):(mirror?99:101);
  assert.equal(v('Цена точки 0',16),expected,'ignore internal peaks unless a full opposite retreat intervenes');
  assert.equal(v('ZeroTime',16),start+(qualifiedBounce?8:1)*300000);
  assert.ok(v('ZeroTime',16)<v('FirstTime',16));
  console.log('PASS whole-leg zero',qualifiedBounce?'new origin after full retreat':'retain higher/lower origin through micro-bounce',mirror?'low':'high');
 } else {
  assert.ok(!Number.isFinite(v('Цена точки 0',16)),'do not fabricate 0 without confirmed earlier pivot');
  console.log('PASS missing earlier pivot leaves zero absent');
 }
}
await run(false);await run(true);await run(false,true,false);await run(true,true,false);await run(false,false);
