import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const s=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8'),fn=s.slice(s.indexOf('findRangeOrigin('),s.indexOf('// Внутренний формат:'));
const start=Date.parse('2026-10-22T12:30:00+07:00');
const cases=[
 {name:'HIGH larger left span wins over higher price',side:1,prices:[106,104,104,104,104,104,105,104.9,104.8,104.7,104.6,104.5,104.8,104.95,103],end:14,expected:13},
 {name:'HIGH prior open above does not break unless close above',side:1,prices:[104,104,104,104,104,104,105,103],opens:{3:106},end:7,expected:6},
 {name:'LOW larger right span wins over lower price',side:-1,prices:[101,101,101,101,101,101,100,101,100.9,100.8,100.7,100.6,100.5,100.4,99.9,100.5,101],end:16,expected:6},
 {name:'LOW equal right span picks lower price',side:-1,prices:[101,101,101,101,101,101,100,101,101,99,100,101],end:11,expected:9},
 {name:'LOW equality does not break; first point caps right scan',side:-1,prices:[101,101,101,101,101,101,100,100,100,101,90,90],end:9,expected:6},
];
for(const t of cases){
 const opens=t.prices.map((x,i)=>t.opens?.[i]??x),times=t.prices.map((_,i)=>start+i*300000);
 const src='//@version=5\nindicator("span")\n'+fn+`\nvar os=array.from(${opens.join(',')})\nvar cs=array.from(${t.prices.join(',')})\nvar ts=array.from(${times.join(',')})\n[p,at]=findRangeOrigin(os,cs,ts,${t.side},${start+6*300000},${start+t.end*300000})\nplot(p,"P")\nplot(at,"T")`;
 const data=Array.from({length:2},(_,i)=>({open:1,close:1,high:1,low:1,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}));
 const c=await new PineTS(data,'SOLUSDT','5').run(src),v=n=>c.plots[n].data.at(-1).value;
 assert.equal(v('T'),times[t.expected],t.name);
 assert.equal(v('P'),t.side===1?Math.max(opens[t.expected],t.prices[t.expected]):Math.min(opens[t.expected],t.prices[t.expected]));
 console.log('PASS',t.name);
}
