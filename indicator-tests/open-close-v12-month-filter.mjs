import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const raw=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-09-29-counter.json',import.meta.url)));
const bars=raw.candles.map(x=>({...x,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
const norm=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v));
const run=m=>new PineTS(bars,'SOLUSDT','5').run(source.replace('input.string("Все месяцы", "Месяц разметки"','input.string("'+m+'", "Месяц разметки"'));
const all=await run('Все месяцы');
for(const month of ['Июль','Сентябрь']){
 const selected=await run(month);
 for(const n of Object.keys(all.plots).filter(n=>!n.startsWith('__')))assert.deepEqual(norm(all.plots[n]),norm(selected.plots[n]),'display filter preserves every numerical series: '+n);
 const alive=n=>(selected.plots[n]?.data||[]).flatMap(x=>Array.isArray(x.value)?x.value:[x.value]).filter(x=>x&&!x._deleted);
 if(month==='Июль')for(const n of ['__boxes__','__labels__','__lines__','__polylines__'])assert.equal(alive(n).length,0,'no September/October overlay consumes July drawing budget: '+n);
 else assert.ok(alive('__boxes__').length>0,'selected September draws trade/range tools');
 console.log('PASS month '+month+': numerical results unchanged; selected overlays only');
}
