import {readFileSync,writeFileSync} from 'node:fs';
import {mock} from 'node:test';
import assert from 'node:assert/strict';
import {execute,sha256} from './observed.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const whole=JSON.parse(read('../../reports/v36-p1-close-2026-10-23/halfyear-candles.json')),source=read('./sol_close_entry.pine');
mock.timers.enable({apis:['Date'],now:Date.parse(whole.endExclusive)+1000});
for(const day of ['2026-10-16','2026-10-19','2026-10-20','2026-10-22']){
 const start=day+'T14:00:00+07:00',endExclusive=new Date(Date.parse(day+'T00:00:00+07:00')+86400000).toISOString();
 const raw={...whole,start,endExclusive,candles:whole.candles.filter(c=>c.time*1000>=Date.parse(start)&&c.time*1000<Date.parse(endExclusive))};raw.count=raw.candles.length;
 const result=await execute(source,raw,Date.parse(start),Date.parse(endExclusive));
 for(const t of result.trades){assert.ok(Math.abs(t.stop-(t.fiboOne+.25*(t.fiboOne-t.swingTarget)+(t.side==='SHORT'?.10:-.10)))<1e-8);assert.ok(t.rewardRisk>=1-1e-8);}
 writeFileSync(new URL('./'+day+'-control.json',import.meta.url),JSON.stringify({sourceSha256:sha256(source),...result},null,2)+'\n');
 console.log(day,JSON.stringify({trades:result.trades,exceptions:result.failedReversalAudit}));
}
