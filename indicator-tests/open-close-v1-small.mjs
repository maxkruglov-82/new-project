import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url);
const a=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE_MIN.txt',root),'utf8'),b=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE_SMALL.txt',root),'utf8');
// Drawing IDs are process-global counters, not chart content.
const normalized=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v));
for(const day of ['09','16']){
 const f=JSON.parse(readFileSync(new URL(day==='09'?'fixtures/mexc-sol-usdt-m5-2026-10-09-v1-structure.json':'fixtures/mexc-sol-usdt-m5-2026-10-16.json',import.meta.url)));
 const data=f.candles.map(x=>({...x,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const x=await new PineTS(data,'SOLUSDT','5').run(a),y=await new PineTS(data,'SOLUSDT','5').run(b);
 for(const n of Object.keys(x.plots))assert.deepEqual(normalized(y.plots[n]),normalized(x.plots[n]),n);
 console.log('PASS small/min all plots and drawings Oct'+day);
}
