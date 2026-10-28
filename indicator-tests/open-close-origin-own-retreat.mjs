import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('findRangeOrigin('),source.indexOf('// Внутренний формат:'));
const cases=[
 {name:'flat candles are not a retreat',p:[104,104,104,104,104,104,104,104],end:7,at:null},
 {name:'five includes anchor; final plateau on breaking open',p:[105,104,104.1,104.2,104.3,104.4,103.9,103],end:7,at:6,price:104.4},
 {name:'four candles to peak rejected',p:[105,104,104.1,104.2,104.3,103.9,103],end:6,at:null},
 {name:'long tail after early peak does not qualify',p:[105,104,104.5,104.4,104.3,104.2,104.1,103.9,103],end:8,at:null},
 {name:'longer later retreat wins',p:[105,104,104.1,104.2,104.3,104.4,103,103.1,103.2,103.3,103.4,103.5,102],end:12,at:11,price:103.5},
 {name:'no scan beyond first',p:[105,104,104.1,104.2,104.3,104.4,104.5],end:4,at:null},
];
for(const fixture of cases)for(const side of [1]){
 const start=Date.parse('2026-10-22T13:00:00+07:00');
 const cs=fixture.p.map(x=>side===1?x:210-x),os=cs.map((x,i)=>i?cs[i-1]:x),ts=cs.map((_,i)=>start+i*300000);
 // Independent bodies, except final breaking candle deliberately shares preceding open.
 for(let i=0;i<cs.length;i++)os[i]=cs[i];
 if(fixture.at===6)os[6]=cs[5];
 const script='//@version=5\nindicator("own retreat")\n'+fn+`\nvar os=array.from(${os})\nvar cs=array.from(${cs})\nvar ts=array.from(${ts})\n[p,t]=findRangeOrigin(os,cs,ts,${side},${start},${ts[fixture.end]})\nplot(p,"P")\nplot(t,"T")`;
 const data=ts.slice(0,2).map(t=>({open:1,close:1,high:1,low:1,volume:1,openTime:t,closeTime:t+299999}));
 const c=await new PineTS(data,'SOLUSDT','5').run(script);const v=n=>c.plots[n].data.at(-1).value;
 if(fixture.at===null)assert.ok(Number.isNaN(v('T')),fixture.name);else {assert.equal(v('T'),ts[fixture.at],fixture.name);assert.equal(v('P'),side===1?fixture.price:210-fixture.price);}
 console.log('PASS',fixture.name,side===1?'HIGH':'LOW');
}
