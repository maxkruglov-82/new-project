import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const before=readFileSync(new URL('../reports/backtest-2026-body-confirmed-extremes/draft/indicator.txt',import.meta.url),'utf8').replace('if bodyGoalRetreated and bar_index-bodyGoalBar >= 4','if bodyGoalRetreated and (bar_index-bodyGoalBar >= 4 or (not na(v12FirstTarget) and bodyGoalTime > thirdSecondTime))');
const after=readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const norm=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v));
for(const day of ['22','23'])for(const mirror of [false,true]){
 const name=day==='22'?'mexc-sol-usdt-m5-2026-10-22-full.json':'mexc-sol-usdt-m5-2026-10-23-structure-reversal.json';
 const f=JSON.parse(readFileSync(new URL('fixtures/'+name,import.meta.url))),p=x=>mirror?250-x:x;
 const bars=f.candles.map(x=>({...x,open:p(x.open),close:p(x.close),high:mirror?p(x.low):x.high,low:mirror?p(x.high):x.low,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const a=await new PineTS(bars,'SOLUSDT','5').run(before),b=await new PineTS(bars,'SOLUSDT','5').run(after);
 for(const name of Object.keys(a.plots).filter(n=>!n.startsWith('__')))assert.deepEqual(norm(a.plots[name]),norm(b.plots[name]),'unchanged output '+name);
 const boxes=b.plots.__boxes__.data.flatMap(x=>x.value).filter(x=>!x._deleted);
 const first=boxes.find(x=>x.text?.startsWith('Сделка №1'));
 const second=boxes.find(x=>x.text?.startsWith('Сделка №2'));
 assert.ok(first&&second,'both actual trades have numbered tools');
 assert.ok(second.left>=first.right,'second tool cannot overlap first in time');
 assert.equal(first.border_style,'style_solid');assert.equal(second.border_style,'style_dashed');
 assert.notEqual(first.border_color,second.border_color);
 if(day==='22'&&!mirror){
  const small=await new PineTS(bars,'SOLUSDT','5').run(readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE_SMALL.txt',import.meta.url),'utf8'));
  for(const name of Object.keys(small.plots))assert.deepEqual(norm(b.plots[name]),norm(small.plots[name]),'FULL/SMALL '+name);

 }
 console.log('PASS separated numbered tools; every non-drawing plot identical; '+day+' mirror='+mirror,JSON.stringify({first:[first.left,first.right],second:[second.left,second.right]}));
}
