import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url),full=readFileSync(new URL('KRYTES_V1_2_LONDON_STRUCTURE.txt',root),'utf8'),small=readFileSync(new URL('KRYTES_V1_2_LONDON_STRUCTURE_SMALL.txt',root),'utf8');
const baseline=JSON.parse(readFileSync(new URL('fixtures/v12-no-entry-baseline-3cf7a1e.json',import.meta.url)));
const hash=x=>createHash('sha256').update(x).digest('hex');
assert.equal(baseline.sourceCommit,'3cf7a1e');
assert.equal(hash(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-10-30.json',import.meta.url))),baseline.inputSha256);
const f=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-10-30.json',import.meta.url)));
const norm=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v));
for(const mirror of [false,true]){
 const p=x=>mirror?200-x:x;
 const d=f.candles.map(x=>({...x,open:p(x.open),close:p(x.close),high:mirror?p(x.low):x.high,low:mirror?p(x.high):x.low,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const c=await new PineTS(d,'SOLUSDT','5').run(full),compact=await new PineTS(d,'SOLUSDT','5').run(small);
 for(const n of Object.keys(compact.plots)){
  assert.deepEqual(norm(c.plots[n]),norm(compact.plots[n]),'FULL/SMALL '+n);
  // Prepared plans may confirm later under the body-retreat rule. Preserve actual entry/exit events on this fixture.
  if(['Вход LONG/SHORT','Выход TP 1 / SL -1 / неизвестно 2'].includes(n))assert.equal(hash(JSON.stringify(c.plots[n])),baseline.cases[String(mirror)][n],'archive cannot change trading outputs '+n);
 }
 const labels=c.plots.__labels__.data.flatMap(x=>x.value).filter(x=>!x._deleted);
 const level=p(95.85),end=Date.parse('2026-10-31T00:00:00+07:00');
 assert.ok(labels.some(x=>x.y===level&&x.x===end&&x.text.startsWith('Без входа '+(mirror?'LONG':'SHORT'))&&x.text.includes('касания RR не было')),'missed setup and reason remain after day rollover');
 const boxes=c.plots.__boxes__.data.flatMap(x=>x.value).filter(x=>!x._deleted);
 assert.ok(boxes.some(x=>x.right===end&&Math.abs((x.top+x.bottom)/2-(p(97.54)+level)/2)<1e-8),'unfilled risk tool is preserved and frozen');
 for(let i=0;i<d.length;i++)if(new Date(d[i].openTime+7*3600000).toISOString().startsWith('2026-10-30')){
  assert.equal(c.plots['Вход LONG/SHORT'].data[i].value,0);assert.equal(c.plots['Выход TP 1 / SL -1 / неизвестно 2'].data[i].value,0);
 }
 console.log('PASS archived no-entry setup, reason, next day, unchanged fills and compact parity; mirror='+mirror);
}
