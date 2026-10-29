import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const read=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8');
const baseline=read('KRYTES_V1_LONDON.txt'),source=read('KRYTES_V1_LONDON_STRUCTURE.txt'),mini=read('KRYTES_V1_LONDON_STRUCTURE_MIN.txt');
assert.equal(createHash('sha256').update(baseline).digest('hex'),'1a5eabf5409cdc446d8220af63e72278de7316e04abb3c33c3cf8055bc36e1ff');
// The newly authorized retry/Friday policy changes trades only after the first SL.
assert.ok(source.includes('int dailyEntryLimit = 2'));
assert.ok(source.includes('bool secondRRTouch = validTouch'));
assert.ok(source.includes('twoM5Break(float level'));
const plotNames=baseline.split('\n').filter(l=>l.startsWith('plot(')&&!l.includes('Действующий цвет тренда')).map(l=>l.match(/"([^"]+)"/)[1]);
for(const name of ['mexc-sol-usdt-m5-2026-10-02-v1-structure.json','mexc-sol-usdt-m5-2026-10-20-structure-reversal.json','mexc-sol-usdt-m5-2026-10-21-v1-structure.json','mexc-sol-usdt-m5-2026-10-23-structure-reversal.json','mexc-sol-usdt-m5-2026-10-29.json']){
 const f=JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url)));
 const data=f.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 const a=await new PineTS(data,'SOLUSDT','5').run(baseline);
 const b=await new PineTS(data,'SOLUSDT','5').run(source+'\nplot(array.size(marketStructureLabels),"VisibleStructureLabels")');
 const c=await new PineTS(data,'SOLUSDT','5').run(mini);
 const firstSL=a.plots['Выход TP 1 / SL -1 / неизвестно 2'].data.findIndex(x=>x.value===-1);
 const prefixEnd=firstSL>=0?firstSL+1:data.length;
 for(const n of plotNames){
  assert.deepEqual(b.plots[n].data.slice(0,prefixEnd).map(x=>x.value),a.plots[n].data.slice(0,prefixEnd).map(x=>x.value),n+' through first SL');
  assert.deepEqual(c.plots[n].data.map(x=>x.value),b.plots[n].data.map(x=>x.value),n+' full/min');
 }
 if(name.includes('10-02')||name.includes('10-21'))assert.ok(b.plots.VisibleStructureLabels.data.at(-1).value>0,'intermediate structure must be rendered on the reported day');
 console.log('PASS V1 first trade unchanged; full/min identical after authorized retry changes:',name);
}
