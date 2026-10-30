import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE.txt',root),'utf8');
const baseline=readFileSync(new URL('reports/backtest-2026-b2375d6/indicator.txt',root),'utf8');
for(const name of ['mexc-sol-usdt-m5-2026-04-08-v1-anchors.json','mexc-sol-usdt-m5-2026-10-09-v1-structure.json','mexc-sol-usdt-m5-2026-10-16.json']){
 const f=JSON.parse(readFileSync(new URL('fixtures/'+name,import.meta.url)));
 const d=f.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 const a=await new PineTS(d,'SOLUSDT','5').run(baseline),b=await new PineTS(d,'SOLUSDT','5').run(source);
 for(const n of Object.keys(a.plots).filter(n=>!n.startsWith('__')&&n!=='Действующий цвет тренда'))assert.deepEqual(b.plots[n].data,a.plots[n].data,'financial values unchanged '+n);
 if(name.includes('04-08'))for(const [t,want] of [['18:35',1],['18:40',1],['20:35',1],['20:40',-1]]){
  const i=d.findIndex(x=>new Date(x.openTime+25200000).toISOString().slice(11,16)===t);
  assert.equal(b.plots['Действующий цвет тренда'].data[i].value,want,t+' uses original visible0 and second close');
 }
 console.log('PASS zero-break color, unchanged financial series:',name);
}
