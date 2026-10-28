import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const s=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const fn=s.slice(s.indexOf('retreatStopHasMinimum('),s.indexOf('// Внутренний формат:'));
const base=Date.parse('2026-09-28T18:35:00+07:00');
for(const mirror of [false,true])for(const f of [
 {name:'four candles rejected despite fifth equal low/high',p:[110,109,108,107,107,109],ok:false},
 {name:'five candles qualify',p:[110,109,108,108,107,109],ok:true},
 {name:'six candles qualify',p:[110,109,108,108,108,107],ok:true},
 {name:'M5 gap invalidates count',p:[110,109,108,108,107,109],gap:2,ok:false},
]){
 const prices=f.p.map(x=>mirror?220-x:x),times=prices.map((_,i)=>base+(i+(f.gap!==undefined&&i>=f.gap?1:0))*300000),level=mirror?113:107;
 const script='//@version=5\nindicator("stop qualification")\n'+fn+`\nvar os=array.from(${prices})\nvar cs=array.from(${prices})\nvar ts=array.from(${times})\nplot(retreatStopHasMinimum(os,cs,ts,${base},${level},${!mirror},5)?1:0,"Valid")`;
 const data=times.slice(0,2).map(t=>({open:1,close:1,high:1,low:1,volume:1,openTime:t,closeTime:t+299999}));
 const c=await new PineTS(data,'SOLUSDT','5').run(script);
 assert.equal(c.plots.Valid.data.at(-1).value,f.ok?1:0,f.name);
 console.log('PASS retreat stop qualification',mirror?'HIGH':'LOW',f.name);
}
