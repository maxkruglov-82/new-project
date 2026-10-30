import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const append=original.slice(original.indexOf('appendColoredCandle('),original.indexOf('// Отдельная ломаная'));
const a=original.indexOf('rebuildColoredDay('),b=original.indexOf('\n    result\n',a)+'\n    result\n'.length;
const fn=original.slice(a,b);
const base=[100,99.6,99.3,99,99.2,99.4,99.6,99.8,100.5,100.3,100.1,99.9,99.8,100,100.2,100.4,100.6,100.8,100.6,100.4,100.2,100.1,100.3,100.5,100.7,100.6,99.7,99.5,99.8,100,100.2,100.4,100.2,100,99.6,99.3,99.4,99.5,99.6,99.7,99.8];
for(const mirror of [false,true])for(const mode of ['full','immediate','one-close','wick-only','gap','offset','tp-before','tp-on-break','before-first','local-without-zero']){
 const start=Date.parse('2026-10-20T14:00:00+07:00'),p=x=>mirror?200-x:x;
 let prices=[...base];
 if(!['full','local-without-zero'].includes(mode))prices=prices.slice(0,10);
 if(mode==='one-close')prices[9]=99.9;
 if(mode==='wick-only'){prices[8]=99.8;prices[9]=99.9;}
 if(mode==='offset')prices[9]=100.005;
 const data=prices.map((v,i)=>{const time=start+i*300000+(mode==='gap'&&i>=9?300000:0);return {open:p(v),close:p(v),high:p(v)+10,low:p(v)-10,volume:1,openTime:time,closeTime:time+299999};});
 const cutoff=mode==='tp-before'?8:mode==='tp-on-break'?9:null;
 const firstIndex=mode==='before-first'?9:3;
 const source='//@version=5\nindicator("colors")\n'+append+fn+`\nvar array<float> o=array.new_float()\nvar array<float> c=array.new_float()\nvar array<int> t=array.new_int()\nvar array<chart.point> red=array.new<chart.point>()\nvar array<chart.point> green=array.new<chart.point>()\narray.push(o,open)\narray.push(c,close)\narray.push(t,time)\nint trend=rebuildColoredDay(red,green,o,c,t,${start},${p(mode==='local-without-zero'?102:100)},${p(99)},${start+firstIndex*300000},0.01,${cutoff===null?'na':start+cutoff*300000})\nplot(trend,"Trend")\nplot(array.size(red)/5,"Red")\nplot(array.size(green)/5,"Green")`;
 const c=await new PineTS(data,'X','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 const initial=mirror?1:-1,flipped=-initial,last=data.length-1;
 assert.equal(v('Trend',8),initial,'one close never changes color');
 const switches=['full','immediate','tp-on-break'].includes(mode);
 assert.equal(v('Trend',9),switches?flipped:initial,mode);
 if(switches){assert.equal(v(mirror?'Red':'Green',9),6,'confirmed new leg is colored from1');assert.equal(v(mirror?'Green':'Red',9),4,'0-to-1 retains original color');}
 if(mode==='full'){assert.equal(v('Trend',11),flipped,'return across0 alone does not flip back');assert.equal(v('Trend',39),initial,'later complete reversal remains supported');}
 if(mode==='local-without-zero')for(let i=0;i<data.length;i++)assert.equal(v('Trend',i),initial,'local swings cannot reverse color before original0 breaks');
 if(cutoff!==null)assert.equal(v('Red',last)+v('Green',last),cutoff+1,'coloring stops at TP');
 console.log('PASS V1 colors: two-close break of original0 switches immediately; mirror='+mirror+' mode='+mode);
}
