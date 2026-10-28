import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-16.json',import.meta.url)));
assert.equal(fixture.exchange,'MEXC');
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const data=fixture.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const c=await new PineTS(data,'SOLUSDT','5').run(source+'\nplot(confirmedZeroTime,"T0")\nplot(firstExtremeTime,"T1")');
const at=t=>data.findIndex(b=>b.openTime===Date.parse('2026-10-16T'+t+':00+07:00'));
const v=(n,i)=>c.plots[n].data[i].value;
const expected=Date.parse('2026-10-16T14:35:00+07:00');
assert.equal(v('T0',at('16:05')),expected);
assert.equal(v('Цена точки 0',at('16:05')),106.08);
const start=Date.parse('2026-10-16T13:00:00+07:00'),end=v('T1',at('16:05'));
const bars=data.filter(b=>b.openTime>=start&&b.openTime<end),candidates=new Map();
for(let i=0;i<bars.length;i++){
 const ceiling=Math.max(bars[i].open,bars[i].close);let span=1,low=Infinity,last=null;
 for(let j=i+1;j<bars.length;j++){
  if(Math.max(bars[j].open,bars[j].close)>ceiling)break;
  span++;const candidate=Math.min(bars[j].open,bars[j].close);
  if(candidate<=low){low=candidate;last=bars[j].openTime;}
 }
 if(span>=5&&last!==null){const key=low+':'+last;candidates.set(key,{low,time:last,span:Math.max(span,candidates.get(key)?.span??0)});}
}
assert.deepEqual([...candidates.values()].sort((a,b)=>a.low-b.low).map(x=>[x.low,new Date(x.time+25200000).toISOString().slice(11,16),x.span]),[[105.62,'13:15',6],[106.08,'14:35',15],[106.12,'15:20',5]]);
console.log('PASS MEXC Oct 16: search from 13:00: maximum 15-bar candidate selects LOW 0 106.08 at 14:35');
