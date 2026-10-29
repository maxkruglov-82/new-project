import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const append=original.slice(original.indexOf('appendColoredCandle('),original.indexOf('// Отдельная ломаная'));
const a=original.indexOf('rebuildColoredDay('),b=original.indexOf('\n    result\n',a)+'\n    result\n'.length;
const fn=original.slice(a,b);
const prices=[100,99.8,100.02,99.9,100.02,100.03,100.5,100.3,100.4,100.6,100.5,100.4,99.7,99.6];
for(const mirror of [false,true])for(const mode of ['full','gap','tp-cutoff']){
 const start=Date.parse('2026-10-20T14:00:00+07:00'),p=x=>mirror?200-x:x;
 const data=prices.map((v,i)=>{const time=start+i*300000+(mode==='gap'&&i>=5?300000:0);return {open:p(v),close:p(v),high:p(v)+10,low:p(v)-10,volume:1,openTime:time,closeTime:time+299999};});
 const source='//@version=5\nindicator("colors")\n'+append+fn+`\nvar array<float> o=array.new_float()\nvar array<float> c=array.new_float()\nvar array<int> t=array.new_int()\nvar array<chart.point> red=array.new<chart.point>()\nvar array<chart.point> green=array.new<chart.point>()\narray.push(o,open)\narray.push(c,close)\narray.push(t,time)\nint trend=rebuildColoredDay(red,green,o,c,t,${start},100,${p(99)},na,na,na,na,false,na,na,0,0.01,${mode==='tp-cutoff'?start+8*300000:'na'})\nplot(trend,"Trend")\nplot(array.size(red)/5,"Red")\nplot(array.size(green)/5,"Green")`;
 const c=await new PineTS(data,'X','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 const initial=mirror?1:-1,flipped=-initial;
 assert.equal(v('Trend',2),initial,'one close cannot change structural color');
 assert.equal(v('Trend',3),initial,'failed single break remains original color');
 assert.equal(v('Trend',4),initial);
 assert.equal(v('Trend',mode==='gap'?6:5),flipped,'two adjacent closes flip structure color');
 if(mode==='gap')assert.equal(v('Trend',5),initial,'gap breaks the pair');
 if(mode!=='tp-cutoff')assert.equal(v('Trend',13),initial,'opposite two-close break returns original structural direction');
 else assert.equal(v('Red',13)+v('Green',13),9,'coloring stops at TP candle');
 if(mode==='full'){
  assert.equal(v(mirror?'Green':'Red',4),5);
  assert.equal(v(mirror?'Red':'Green',5),1);
 }
 console.log('PASS V1 structure color: down red, up green, confirmed breaks, no lookahead:',mirror,mode);
}
