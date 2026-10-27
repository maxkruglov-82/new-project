import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedSecondPrice,"P2")\nplot(confirmedThirdPrice,"P3")\nplot(pullbackCloseCount,"Count")';
const start=Date.parse('2026-10-21T14:00:00+07:00');
async function run(seq,mirror=false){const raw=Array.from({length:12},()=>({open:100,close:100,high:101,low:99})).concat(seq.map(([open,close])=>({open,close,high:110,low:90})));const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});const c=await new PineTS(data,'SOLUSDT','5').run(source);return(n,i)=>c.plots[n].data[i].value;}
const seq=[[98.8,98.5],[98.5,98.4],[101.26,101.36],[101.36,101.1],[101.1,100.9],[100.9,101.0],[101.0,100.8],[100.8,101.37],[101.37,101.36],[101.36,101.4]];
for(const mirror of [false,true]){const v=await run(seq,mirror);assert.ok(!Number.isFinite(v('P2',17)),'three closes insufficient');assert.ok(Math.abs(v('P2',18)-(mirror?98.64:101.36))<1e-8);assert.ok(!Number.isFinite(v('P3',19)),'first break candle insufficient');assert.ok(Math.abs(v('P3',20)-(mirror?99.2:100.8))<1e-8);console.log('PASS four closes and ordered two-close break',mirror?'mirror':'long');}
const equal=seq.map(x=>[...x]);equal[5][1]=101.26;const v=await run(equal);assert.ok(!Number.isFinite(v('P2',18)),'equal boundary resets strict four-close count');console.log('PASS equality is not below body boundary');
