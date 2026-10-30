import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url);
const original=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE.txt',root),'utf8');
const experiment=readFileSync(new URL('reports/backtest-2026-v1-one-close/indicator.txt',root),'utf8');
for(const mirror of [false,true])for(const one of [false,true]){
 const s=one?experiment:original;
 const helpers=s.slice(s.indexOf('twoM5Break('),s.indexOf('v1LevelCaption('));
 const source='//@version=5\nindicator("confirmation test")\n'+helpers+`\nvar array<float> cs = array.new_float()\nvar array<int> ts = array.new_int()\narray.push(cs,close)\narray.push(ts,time)\nplot(twoM5Break(100,${!mirror},0.01,true)?1:0,"Current")\nplot(retryBreakAfter(cs,ts,100,${!mirror},0.01,0)?1:0,"History")`;
 const price=x=>mirror?200-x:x;
 const data=[99,100.02,99,100.03].map((x,i)=>({open:price(x),close:price(x),high:price(x)+.01,low:price(x)-.01,volume:1,openTime:1791500400000+i*300000,closeTime:1791500699999+i*300000}));
 const c=await new PineTS(data,'SOLUSDT','5').run(source);
 assert.deepEqual(c.plots.Current.data.map(x=>x.value),one?[0,1,0,1]:[0,0,0,0]);
 assert.deepEqual(c.plots.History.data.map(x=>x.value),one?[0,1,1,1]:[0,0,0,0]);
}
console.log('PASS current and historical single-close confirmations, both directions; baseline still requires two');
