import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const condition=source.match(/bool confirmedRREntry = (.+)/)[1];
for(const close of [9.5,10,10.5])for(const allowed of [true,false]){
 const pine=`//@version=5\nindicator("first touch")\nbool touchedRRZone = low <= 10 and high >= 10\nbool originConfirmed = ${allowed}\nbool pendingDirectionAllowed = ${allowed}\nbool confirmedRREntry = ${condition}\nplot(confirmedRREntry ? 1 : 0,"entry")`;
 const bars=[{low:11,high:12,close:11.5},{low:9,high:11,close}].map((x,i)=>({...x,open:x.close,volume:1,openTime:Date.UTC(2026,0,5,0,i*5),closeTime:Date.UTC(2026,0,5,0,i*5)+299999}));
 const result=await new PineTS(bars,'TEST','5').run(pine);
 assert.deepEqual(result.plots.entry.data.map(x=>x.value),[0,Number(allowed)]);
}
console.log('PASS first exact RR touch; all closing sides accepted; structural permission still required');
