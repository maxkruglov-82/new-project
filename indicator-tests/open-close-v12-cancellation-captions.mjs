import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('./',import.meta.url),read=n=>readFileSync(new URL(n,root),'utf8');
const f=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-09-29-counter.json',import.meta.url)));
const norm=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v));
for(const mirror of [false,true]){
 const p=x=>mirror?300-x:x;
 const bars=f.candles.filter(x=>x.time*1000>=Date.parse('2026-09-28T00:00:00+07:00')&&x.time*1000<Date.parse('2026-09-30T00:00:00+07:00')).map(x=>({...x,open:p(x.open),close:p(x.close),high:mirror?p(x.low):x.high,low:mirror?p(x.high):x.low,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const a=await new PineTS(bars,'SOLUSDT','5').run(readFileSync(new URL('../reports/backtest-2026-failed-counter-return/baseline/indicator.txt',import.meta.url),'utf8'));
 const b=await new PineTS(bars,'SOLUSDT','5').run(readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8'));
 for(const n of Object.keys(a.plots).filter(n=>!n.startsWith('__')))assert.deepEqual(norm(a.plots[n]),norm(b.plots[n]),'unchanged calculation '+n);
 const boxes=b.plots.__boxes__.data.flatMap(x=>x.value).filter(x=>!x._deleted);
 const expected='ОТМЕНА '+(mirror?'SHORT':'LONG')+'\nТретий '+(mirror?'LL':'HH')+' до входа';
 assert.ok(boxes.some(x=>x.text===expected&&x.text_size==='large'),'large centered third-extreme cancellation remains on chart');
 const compact=await new PineTS(bars,'SOLUSDT','5').run(readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE_SMALL.txt',import.meta.url),'utf8'));
 for(const n of Object.keys(b.plots))assert.deepEqual(norm(b.plots[n]),norm(compact.plots[n]),'FULL/SMALL '+n);
 console.log('PASS Sep29 retained canceled tool, large explicit reason, unchanged signals, FULL/SMALL; mirror='+mirror);
}
