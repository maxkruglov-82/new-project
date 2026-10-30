import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const condition=source.match(/bool firstScenarioReady = (.+)/)[1];
for(const c of [
 {same:true,extended:false,broken:false,triple:false,expected:0},
 {same:true,extended:true,broken:false,triple:false,expected:1},
 {same:true,extended:true,broken:true,triple:true,expected:0},
 {same:false,extended:false,broken:false,triple:true,expected:0},
 {same:false,extended:false,broken:true,triple:false,expected:0},
 {same:false,extended:false,broken:true,triple:true,expected:1},
]){
 const pine=`//@version=5\nindicator("original gate")\nbool originalAvailable=true\nbool firstOriginalDirection=${c.same}\nbool originalOneBroken=${c.extended}\nbool originalStopViolated=${c.broken}\nint originalZeroBreakTime=${c.broken?'1':'na'}\nbool originalCounterReady=${c.triple}\nplot(${condition} ? 1 : 0,"ready")`;
 const r=await new PineTS([{open:100,close:100,high:101,low:99,volume:1,openTime:Date.UTC(2026,0,1),closeTime:Date.UTC(2026,0,1)+299999}],'TEST','5').run(pine);
 assert.equal(r.plots.ready.data[0].value,c.expected,JSON.stringify(c));
}
console.log('PASS initial-direction continuation needs only new extreme; opposite needs both original0 break and complete triple');
