import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const sources={baseline:readFileSync(new URL('../reports/backtest-2026-counter-third-cancel/finance-before-labels.pine',import.meta.url),'utf8'),draft:readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8')};
const raw=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-09-29-counter.json',import.meta.url)));
const norm=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v));
const t=s=>Date.parse('2026-09-30T'+s+':00+07:00');
for(const mirror of [false,true]){
 const p=x=>mirror?300-x:x;
 const bars=raw.candles.filter(x=>x.time*1000>=Date.parse('2026-09-29T00:00:00+07:00')&&x.time*1000<Date.parse('2026-10-02T00:00:00+07:00')).map(x=>({...x,open:p(x.open),close:p(x.close),high:mirror?p(x.low):x.high,low:mirror?p(x.high):x.low,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const a=await new PineTS(bars,'SOLUSDT','5').run(sources.baseline),b=await new PineTS(bars,'SOLUSDT','5').run(sources.draft);
 for(const n of Object.keys(a.plots).filter(n=>!n.startsWith('__')))assert.deepEqual(norm(a.plots[n]),norm(b.plots[n]),'every numeric/output series unchanged '+n);
 // Internal structure and overnight captions intentionally change; numerical trading outputs above must remain identical.
 const labels=c=>c.plots.__labels__.data.flatMap(x=>x.value).filter(x=>!x._deleted);
 const old=labels(a),fresh=labels(b);
 assert.ok(fresh.some(x=>/^(HL|LH)\d+$/.test(x.text)),"confirmed internal swings are shown");
 assert.ok(!fresh.some(x=>/№0/.test(x.text)),"overnight trade keeps its original number");
 assert.ok(old.some(x=>x.x>=t('16:30')&&x.x<=t('16:35')&&Math.abs(x.y-p(119.52))<1e-8&&x.text===(mirror?'LL':'HH')),'fixture previously showed the unconfirmed early extreme');
 assert.ok(!fresh.some(x=>x.x>=t('16:30')&&x.x<=t('16:35')&&Math.abs(x.y-p(119.52))<1e-8&&/^(HH|LL)\d+$/.test(x.text)),'early candidate swallowed by original1 is removed');
 assert.ok(!fresh.some(x=>x.x===t('17:35')&&/^(HH|LL)\d+$/.test(x.text)),'equal repeat must not duplicate original1');
 assert.ok(fresh.some(x=>x.x===t('17:30')&&x.text.startsWith('1')),'confirmed original1 preserved');
 assert.ok(fresh.some(x=>x.x>=t('20:05')&&x.x<=t('20:10')&&Math.abs(x.y-p(122.62))<1e-8&&new RegExp('^'+(mirror?'LL':'HH')+'\\d+$').test(x.text)),'next confirmed external extreme preserved');
 const marks=ls=>ls.filter(x=>x.style==='style_circle');assert.deepEqual(norm(marks(old)),norm(marks(fresh)),'actual trade markers unchanged');
 if(!mirror){
  const compact=await new PineTS(bars,'SOLUSDT','5').run(readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE_SMALL.txt',import.meta.url),'utf8'));
  for(const n of Object.keys(compact.plots))assert.deepEqual(norm(b.plots[n]),norm(compact.plots[n]),'FULL/SMALL '+n);

 }
 console.log('PASS Sep30: remove16:30; keep17:30 original1 and20:05; all calculation series, trades and drawings unchanged; mirror='+mirror);
}
