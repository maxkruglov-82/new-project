import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const append=source.slice(source.indexOf('appendColoredCandle('),source.indexOf('// Отдельная ломаная'));
const startFn=source.indexOf('rebuildColoredDay(');
const helper=source.slice(startFn,source.indexOf('\n    result\n',startFn)+'\n    result\n'.length);
const values=[100,101,102,103,104,105,104,103,102,101,102,103,104,103,102,101,100.8,100.5,100.8,101,102,103,103.5,103,102,101,100.8,100.4,100.3,100.4,100.5,100.6,100.7,100.8,100.9];
const start=Date.UTC(2026,0,5);
for(const mirror of [false,true]){
 const p=x=>mirror?200-x:x;
 const bars=values.map((x,i)=>({open:p(x),close:p(x),high:p(x)+.1,low:p(x)-.1,volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 const pine='//@version=5\nindicator("original zero")\n'+append+helper+`\nvar array<float> o=array.new_float()\nvar array<float> c=array.new_float()\nvar array<int> t=array.new_int()\nvar array<chart.point> red=array.new<chart.point>()\nvar array<chart.point> green=array.new<chart.point>()\narray.push(o,open)\narray.push(c,close)\narray.push(t,time)\nplot(rebuildColoredDay(red,green,o,c,t,${start},100,${p(105)},${start+5*300000},0.01,na),"trend")`;
 const result=await new PineTS(bars,'TEST','5').run(pine);
 assert.ok(result.plots.trend.data.every(x=>x.value===(mirror?-1:1)),'color remains initial while original zero is intact');
}
console.log('PASS original0 intact: local countertrend triple does not recolor initial movement; mirrored');
