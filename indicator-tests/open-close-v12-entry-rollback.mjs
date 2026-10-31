import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const baseline=readFileSync(new URL('../reports/backtest-2026-failed-counter-return/baseline/indicator.txt',import.meta.url),'utf8');
function execution(s){
 s=s.slice(s.indexOf('// V1.2: исполнение отдельно'),s.indexOf('// Экспорт состояний'));
 s=s.replace(/        if v12PlanKind == 2 and v12Entries == 0\n            rememberCountedPoint[^\n]*\n            rememberCountedPoint[^\n]*\n/g,'');
 s=s.replace(/^\s*rememberCountedPoint[^\n]*\n/gm,'');
 return s.replace(/v12Side == 1 \? "Третий HH до входа" : "Третий LL до входа"/g,'"третий экстремум отменил вход"').replaceAll('"третий экстремум отменил встречный вход"','"третий экстремум отменил вход"');
}
assert.equal(execution(source),execution(baseline),'entire execution engine restored to920432f except drawing-point recording and caption text');
const norm=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v));
const raw=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-10-09-v1-structure.json',import.meta.url)));
for(const mirror of [false,true]){
 const p=x=>mirror?250-x:x,bars=raw.candles.map(x=>({...x,open:p(x.open),close:p(x.close),high:mirror?p(x.low):x.high,low:mirror?p(x.high):x.low,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const a=await new PineTS(bars,'SOLUSDT','5').run(baseline),b=await new PineTS(bars,'SOLUSDT','5').run(source),compact=await new PineTS(bars,'SOLUSDT','5').run(readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE_SMALL.txt',import.meta.url),'utf8'));
 for(const n of Object.keys(a.plots).filter(n=>!n.startsWith('__')))assert.deepEqual(norm(a.plots[n]),norm(b.plots[n]),'all numerical series match920432f '+n);
 for(const n of Object.keys(b.plots))assert.deepEqual(norm(b.plots[n]),norm(compact.plots[n]),'FULL/SMALL '+n);
 const fills=b.plots['Вход LONG/SHORT'].data.flatMap((x,i)=>x.value?[i]:[]);assert.equal(fills.length,1);
 const i=fills[0];assert.equal(new Date(bars[i].openTime+25200000).toISOString().slice(11,16),'21:20');
 assert.equal(b.plots['Цена входа по close'].data[i].value,mirror?139.985:109.98);
 assert.equal(b.plots['Стоп позиции'].data[i].value,mirror?139.29:110.64);
 console.log('PASS entry rollback Oct9: original RR touch/stop restored, all series unchanged, FULL/SMALL; mirror='+mirror);
}
