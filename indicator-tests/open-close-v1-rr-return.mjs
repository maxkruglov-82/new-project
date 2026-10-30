import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('rrReturnBreak('),source.indexOf('entryAlertText('));
for(const side of [1,-1])for(const c of [
 {name:'return',prev:9,level:10,same:true,adj:true,lo:9,hi:11,yes:true},
 {name:'wrong side',prev:11,level:10,same:true,adj:true,lo:9,hi:11,yes:false},
 {name:'equal close',prev:10,level:10,same:true,adj:true,lo:9,hi:11,yes:false},
 {name:'moved RR',prev:9,level:10.1,same:true,adj:true,lo:9,hi:11,yes:false},
 {name:'new plan',prev:9,level:10,same:false,adj:true,lo:9,hi:11,yes:false},
 {name:'gap in data',prev:9,level:10,same:true,adj:false,lo:9,hi:11,yes:false},
 {name:'no touch',prev:9,level:10,same:true,adj:true,lo:10.1,hi:11,yes:false},
]){
 const p=x=>side===1?x:20-x;
 const lo=side===1?c.lo:p(c.hi),hi=side===1?c.hi:p(c.lo);
 const pine='//@version=5\nindicator("RR return")\n'+helper+`\nplot(rrReturnBreak(${side},10,${p(c.level)},${p(c.prev)},${c.same},${c.adj},${lo},${hi}) ? 1 : 0,"result")`;
 const bar={open:10,high:11,low:9,close:10,volume:1,openTime:Date.UTC(2026,0,1),closeTime:Date.UTC(2026,0,1)+299999};
 const result=await new PineTS([bar],'TEST','5').run(pine);
 assert.equal(result.plots.result.data[0].value,Number(c.yes),`${side} ${c.name}`);
}
console.log('PASS mirrored RR return: direction, unchanged level/plan, adjacency and exact touch');
