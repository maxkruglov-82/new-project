import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const full=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const fn=full.slice(full.indexOf('findRangeOrigin('),full.indexOf('// Внутренний формат:'));
const start=Date.parse('2026-10-22T12:30:00+07:00');
const cases=[
 {name:'five left qualify; sixth higher ignored',prices:[106,104,104,104,104,104,105,107],from:6,before:7,index:6},
 {name:'equal left highs allowed',prices:[104,105,104,104,104,104,105],from:6,before:7,index:6},
 {name:'one higher left candle rejects',prices:[104,104,104,106,104,104,105],from:6,before:7,index:null},
 {name:'only four left candles insufficient',prices:[104,104,104,104,105],from:4,before:5,index:null},
 {name:'right candles do not gate origin',prices:[104,104,104,104,104,104,105,106,107,108,109,110],from:6,before:7,index:6},
 {name:'candidate before 13 excluded',prices:[104,104,104,104,104,106,105],from:6,before:7,index:null},
 {name:'first point itself excluded',prices:[104,104,104,104,104,104,105,107],from:6,before:7,index:6},
 {name:'missing left M5 rejects',prices:[104,104,104,104,104,104,105],from:6,before:7,index:null,gap:true},
];
for(const mirror of [false,true])for(const item of cases){
 const prices=item.prices.map(x=>mirror?210-x:x),times=prices.map((_,i)=>start+i*300000);
 if(item.gap)times[3]-=1;
 const source='//@version=5\nindicator("origin test")\n'+fn+`\nvar os=array.from(${prices.join(',')})\nvar cs=array.from(${prices.join(',')})\nvar ts=array.from(${times.join(',')})\n[p,t]=findRangeOrigin(os,cs,ts,${mirror?-1:1},${start+item.from*300000},${start+item.before*300000})\nplot(p,"P")\nplot(t,"T")`;
 const data=Array.from({length:2},(_,i)=>({open:100,close:100,high:100,low:100,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}));
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=n=>c.plots[n].data.at(-1).value;
 if(mirror){
  const eligible=prices.map((p,i)=>({p,i})).filter(x=>times[x.i]>=start+item.from*300000&&times[x.i]<start+item.before*300000);
  const chosen=eligible.reduce((best,x)=>!best||x.p<best.p?x:best,null);
  assert.equal(v('P'),chosen.p,'low origin uses right count without left-five filter');
 }else if(item.index===null)assert.ok(!Number.isFinite(v('P')));
 else{assert.equal(v('P'),prices[item.index]);assert.equal(v('T'),times[item.index]);}
 console.log('PASS origin-only five-left filter',mirror?'LOW':'HIGH',item.name);
}
