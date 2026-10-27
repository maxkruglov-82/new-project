import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(structureSide,"Side")\nplot(firstSwingDisplayLocked?1:0,"FirstReady")\nplot(structureFirstPrice,"P1")';
const start=Date.parse('2026-10-08T14:00:00+07:00');
async function run(mirror,mode="valid"){
 const hour=Array.from({length:12},()=>({open:115.2,close:115.1,high:115.78,low:114.88}));
 const seq=[[114.886,mode==="equal"?114.88:mode==="tiny"?114.876:114.87],[114.876,114.95],[114.95,114.9],[114.9,115.03],[115.03,114.93],[114.93,115],[115,115.02]];
 const raw=[...hour,...seq.map(([open,close])=>({open,close,high:Math.max(open,close)+0.02,low:Math.min(open,close)-0.02}))];
 const data=raw.map((b,i)=>{if(mirror)b={open:230-b.open,close:230-b.close,high:230-b.low,low:230-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const ctx=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>ctx.plots[n].data[i].value;
 assert.equal(v('Side',12),mode==='valid'?(mirror?1:-1):0,'initial close requires full 0.01 beyond H1');
 if(mode==='valid'){assert.equal(v('FirstReady',15),0,'four M5 insufficient');assert.equal(v('FirstReady',16),1,'all five closed M5 confirm regardless of candle color');assert.equal(v('FirstReady',18),1,'confirmed first point remains fixed');assert.ok(Math.abs(v('P1',18)-(mirror?115.13:114.87))<1e-8);}
 console.log('PASS initial H1 exit',mirror?'upper':'lower',mode);
}
for(const mode of ["valid","equal","tiny"]){await run(false,mode);await run(true,mode);}
