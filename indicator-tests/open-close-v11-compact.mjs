import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
// PineTS object IDs are process-global; compare drawing content, not allocation IDs.
function normalize(x){
 if(Array.isArray(x))return x.map(normalize);
 if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).filter(([k])=>k!=='id').map(([k,v])=>[k,normalize(v)]));
 return x;
}
for(const name of ['mexc-sol-usdt-m5-2026-10-26.json','mexc-sol-usdt-m5-2026-10-29.json']){
 const f=JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url)));
 const d=f.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 const a=await new PineTS(d,'SOLUSDT','5').run(readFileSync(new URL('../KRYTES_V1_1_LONDON.txt',import.meta.url),'utf8'));
 const b=await new PineTS(d,'SOLUSDT','5').run(readFileSync(new URL('../KRYTES_V1_1_LONDON_COMPACT.txt',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(a.plots),Object.keys(b.plots));
 for(const key of Object.keys(a.plots))assert.deepEqual(normalize(a.plots[key].data.map(x=>x.value)),normalize(b.plots[key].data.map(x=>x.value)),key);
 console.log('PASS compact/full: identical signals, values and drawing contents',name);
}
