import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import {execute,sha256} from '../drafts/m5-preserve-structures-v45-2026-10-24/observed.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const dir='../drafts/m5-preserve-structures-v45-2026-10-24/';
const draft=read(dir+'sol_preserve.pine');
const result=JSON.parse(read(dir+'result.json'));
test('published graph-review v45 matches audited executed source; TXT identical; v41 pinned for rollback',()=>{
 const source=read('./fixtures/sol-v45-published.pine'),meta=JSON.parse(read('../publication-v45.json'));
 assert.equal(source,read('./fixtures/sol-v45-published.pine'));assert.equal(source,draft.replace('(черновик)','(проверка)'));
 assert.equal(sha256(source),meta.sourceSha256);assert.equal(sha256(draft),result.sourceSha256);
 assert.equal(JSON.parse(read(dir+'audit.json')).status,'PASS');
 assert.equal(sha256(read('./fixtures/sol-v41-published.pine')),JSON.parse(read('../publication-v41.json')).sourceSha256);
});
test('all halfyear entries respect max2/day; second only opposite after actual SL; exact Fibo2/3 and RR1:1',()=>{
 for(const day of result.days){const ts=result.trades.filter(t=>t.referenceDate===day.date);assert.ok(ts.length<=2);if(ts.length===2){assert.equal(ts[0].status,'stop');assert.notEqual(ts[0].side,ts[1].side);assert.ok(ts[1].entryBarStart>=ts[0].exitBarEnd);}}
 for(const t of result.trades){assert.equal(t.entryBarStart.slice(0,10),t.referenceDate);assert.ok(t.entryBarStart.slice(11,16)<'24:00');assert.ok(Math.abs(t.stop-(t.fiboOne+.25*(t.fiboOne-t.swingTarget)))<1e-8);assert.ok(Math.abs(t.entry-(t.stop+t.target)/2)<1e-8);assert.ok(Math.abs(t.rewardRisk-1)<1e-8);}
});
mock.timers.enable({apis:['Date'],now:Date.parse(result.period.endExclusive)+1000});
for(const day of ['2026-10-16','2026-10-19','2026-10-20','2026-10-22'])test('actual Pine reproduces audited control '+day,async()=>{
 const whole=JSON.parse(read('../reports/v36-p1-close-2026-10-23/halfyear-candles.json'));
 const start=day+'T14:00:00+07:00',endExclusive=new Date(Date.parse(day+'T00:00:00+07:00')+86400000).toISOString();
 const raw={...whole,start,endExclusive,candles:whole.candles.filter(c=>c.time*1000>=Date.parse(start)&&c.time*1000<Date.parse(endExclusive))};raw.count=raw.candles.length;
 const actual=await execute(draft,raw,Date.parse(start),Date.parse(endExclusive));
 const keys=['side','entryBarStart','entry','stop','target','status','exitBarStart'];const canon=ts=>ts.map(t=>Object.fromEntries(keys.map(k=>[k,t[k]])));
 assert.deepEqual(canon(actual.trades),canon(result.trades.filter(t=>t.referenceDate===day)));
 if(day==='2026-10-16'){assert.deepEqual(actual.trades.map(t=>[t.side,t.status]),[['LONG','stop'],['SHORT','target']]);assert.equal(actual.trades[0].fiboOne,105.71);assert.equal(actual.trades[0].setupBreakLevel,106.95);}
});
