import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('./',import.meta.url),read=n=>readFileSync(new URL(n,root),'utf8');
const norm=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v));
const raw=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-10-12.json',import.meta.url)));
const t=s=>Date.parse('2026-10-12T'+s+':00+07:00');
for(const mirror of [false,true]){
 const p=x=>mirror?250-x:x;
 const bars=raw.candles.map(x=>({...x,open:p(x.open),close:p(x.close),high:mirror?p(x.low):x.high,low:mirror?p(x.high):x.low,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const a=await new PineTS(bars,'SOLUSDT','5').run(readFileSync(new URL('../reports/backtest-2026-failed-counter-return/baseline/indicator.txt',import.meta.url),'utf8'));
 const b=await new PineTS(bars,'SOLUSDT','5').run(readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8'));
 for(const n of Object.keys(a.plots).filter(n=>!n.startsWith('__')))assert.deepEqual(norm(a.plots[n]),norm(b.plots[n]),'numeric series unchanged '+n);
 const labels=b.plots.__labels__.data.flatMap(x=>x.value).filter(x=>!x._deleted),type=mirror?'HH':'LL';
 for(const [time,price,number] of [['15:25',111.77,1],['16:50',111.31,2],['18:45',110.61,3]])assert.ok(labels.some(x=>x.x===t(time)&&Math.abs(x.y-p(price))<1e-8&&x.text.includes(type+number)),type+number+' exact execution anchor '+time);
 assert.ok(!labels.some(x=>/^(HH|HL|LH|LL)$/.test(x.text)),'every structural caption numbered');
 assert.ok(!labels.some(x=>x.x===t('18:50')&&Math.abs(x.y-p(110.61))<1e-8),'equal-extreme visual duplicate removed');
 const compact=await new PineTS(bars,'SOLUSDT','5').run(readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE_SMALL.txt',import.meta.url),'utf8'));
 for(const n of Object.keys(b.plots))assert.deepEqual(norm(b.plots[n]),norm(compact.plots[n]),'FULL/SMALL '+n);
 console.log('PASS Oct12 numbered exact anchors, mirror='+mirror+', all numerical series unchanged, FULL/SMALL identical');
}
