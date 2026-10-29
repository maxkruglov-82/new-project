import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const append=original.slice(original.indexOf('appendColoredCandle('),original.indexOf('// Отдельная ломаная'));
const a=original.indexOf('rebuildColoredDay('),b=original.indexOf('\n    result\n',a)+'\n    result\n'.length;
const fn=original.slice(a,b);
const base=[100,99.6,99.3,99,99.2,99.4,99.6,99.8,100.5,100.3,100.1,99.9,99.8,100,100.2,100.4,100.6,100.8,100.6,100.4,100.2,100.1,100.3,100.5,100.7,100.6,99.7,99.5,99.8,100,100.2,100.4,100.2,100,99.6,99.3,99.4,99.5,99.6,99.7,99.8];
for(const mirror of [false,true])for(const mode of ['full','first-HH-only','third-unconfirmed','one-close','gap','tp-cutoff','early-tp']){
 const start=Date.parse('2026-10-20T14:00:00+07:00'),p=x=>mirror?200-x:x;
 let prices=[...base];
 if(mode==='first-HH-only')prices=prices.slice(0,17);
 if(mode==='third-unconfirmed')prices=prices.slice(0,21);
 if(mode==='one-close'){prices[16]=100.4;prices[18]=100.4;prices=prices.slice(0,22);}
 if(mode==='gap')prices=prices.slice(0,22);
 const data=prices.map((v,i)=>{const time=start+i*300000+(mode==='gap'&&i>=17?300000:0);return {open:p(v),close:p(v),high:p(v)+10,low:p(v)-10,volume:1,openTime:time,closeTime:time+299999};});
 const cutoff=mode==='tp-cutoff'?25:mode==='early-tp'?20:null;
 const source='//@version=5\nindicator("colors")\n'+append+fn+`\nvar array<float> o=array.new_float()\nvar array<float> c=array.new_float()\nvar array<int> t=array.new_int()\nvar array<chart.point> red=array.new<chart.point>()\nvar array<chart.point> green=array.new<chart.point>()\narray.push(o,open)\narray.push(c,close)\narray.push(t,time)\nint trend=rebuildColoredDay(red,green,o,c,t,${start},100,${p(99)},${start+3*300000},0.01,${cutoff===null?'na':start+cutoff*300000})\nplot(trend,"Trend")\nplot(array.size(red)/5,"Red")\nplot(array.size(green)/5,"Green")`;
 const c=await new PineTS(data,'X','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 const initial=mirror?1:-1,flipped=-initial,last=data.length-1;
 if(['first-HH-only','third-unconfirmed','one-close','gap','early-tp'].includes(mode)){
  assert.ok(c.plots.Trend.data.every(x=>x.value===initial),mode+' must not change color without complete confirmed structure');
 }else{
  assert.equal(v('Trend',20),initial,'third swing is not confirmed until its fifth candle');
  assert.equal(v('Trend',21),flipped,'HH-HL-HH / LL-LH-LL and two-close break switch color');
  if(mode==='full'){
   assert.equal(v('Trend',27),flipped,'one new opposite LL/HH is not a full reversal');
   assert.equal(v('Trend',38),flipped);
   assert.equal(v('Trend',39),initial,'complete opposite structure switches back');
  }
 }
 if(cutoff!==null)assert.equal(v('Red',last)+v('Green',last),cutoff+1,'coloring stops at TP');
 if(mode==='full'){
  assert.equal(v(mirror?'Green':'Red',20),21);
  assert.equal(v(mirror?'Red':'Green',21),1);
 }
 console.log('PASS V1 color requires complete confirmed three-point structure:',mirror,mode);
}
