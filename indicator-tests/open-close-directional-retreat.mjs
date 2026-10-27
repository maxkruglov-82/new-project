import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(firstRetreatCloses,"Count")\nplot(firstSwingDisplayLocked?1:0,"Ready")';
const start=Date.parse('2026-10-21T14:00:00+07:00');
for(const mirror of [false,true])for(const extend of [false,true]){
 const hour=Array.from({length:12},()=>({open:100.4,close:100.4,high:101,low:99}));
 const tail=[[100.4,101.2],[101.2,101.4],[101.4,101.3],[101.3,101.35],[101.35,101.2],[101.2,101.2],[101.2,101.1],[101.1,extend?101.5:101.15],[extend?101.5:101.15,101]];
 const data=[...hour,...tail.map(([open,close])=>({open,close,high:150,low:50}))].map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 for(const [i,count] of [[13,1],[14,2],[15,2],[16,3],[17,3],[18,4]]){assert.equal(v('Count',i),count);assert.equal(v('Ready',i),0);}
 assert.equal(v('Count',19),extend?1:4,'new extreme resets; opposite candle otherwise skipped');
 assert.equal(v('Count',20),extend?2:5);
 assert.equal(v('Ready',20),extend?0:1,'five eligible candles confirm, elapsed candles alone do not');
 console.log('PASS directional retreat with skipped opposite/doji and reset',mirror?'low':'high',extend?'new extreme':'five eligible');
}
