import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedSecondPrice,"P2")\nplot(confirmedThirdPrice,"P3")\nplot(pullbackCloseCount,"Count")\nplot(thirdLocked ? 1 : 0,"Locked")';
const start=Date.parse('2026-10-21T14:00:00+07:00');
async function run(seq,mirror=false){const raw=Array.from({length:12},()=>({open:100,close:100,high:101,low:99})).concat(seq.map(([open,close])=>({open,close,high:110,low:90})));const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});const c=await new PineTS(data,'SOLUSDT','5').run(source);return(n,i)=>c.plots[n].data[i].value;}
const seq=[[98.8,98.5],[98.5,98.4],[101.26,101.36],[101.36,101.1],[101.1,100.9],[100.9,101],[101,100.8],[100.8,98.3],[98.3,98.2],[98.2,98.1],[98.1,98.3],[98.3,98.4],[98.4,98.5],[98.5,98.6],[98.6,97],[97,97]];
for(const mirror of [false,true]) {
 const v=await run(seq,mirror),expected=x=>mirror?200-x:x;
 assert.ok(Math.abs(v('P3',20)-expected(98.2))<1e-8,'initial point 3 after two closes');
 assert.ok(Math.abs(v('P3',21)-expected(98.1))<1e-8,'move to next closed body extreme');
 assert.equal(v('Locked',24),0,'three retreat candles insufficient');
 assert.equal(v('Locked',25),1,'four retreat candles lock point 3');
 assert.ok(Math.abs(v('P3',26)-expected(98.1))<1e-8,'do not move completed point after lock');
 console.log('PASS moving third and four-close lock',mirror?'upper':'lower');
}
