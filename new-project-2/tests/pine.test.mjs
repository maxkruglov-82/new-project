import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import {execute,sha256} from '../backtest/run.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const source=read('../sol_short_setup.pine'),base=read('./fixtures/sol-v35.pine');
const {PineTS}=await import(process.env.PINETS_MODULE||'pinets');
const start=Date.parse('2026-09-15T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start});
const c=(i,open,high,low,close)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open,high,low,close,volume:100});
const hour=()=>Array.from({length:12},(_,i)=>c(i,104,106,101,103));
const mirror=data=>data.map(b=>({...b,open:207-b.open,high:207-b.low,low:207-b.high,close:207-b.close}));
const seq=(closing=100.4)=>[...hour(),c(12,103,105,102,103),c(13,103,105,102,103),c(14,103,103.5,100,closing),c(15,102,104,100.6,103),c(16,103,104,101,102),c(17,102,103,99,100.5),c(18,100.5,101,99.4,100.8)];
async function run(data,script=source){const last=data.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};mock.timers.setTime(guard.openTime+1000);return new PineTS([...data,guard],'SOLUSDT','5').run(script+'\nplot(point1,"P1",display=display.none)\nplot(point3,"P3",display=display.none)');}
const val=(ctx,k,i)=>ctx.plots[k].data[i].value;
test('v36: only P1 close predicate differs from exact v35; TXT and tested draft equivalence',()=>{
 const old='bool firstPivot = direction == -1 ? lowerPivot and belowH1(low[1], h1Low) : upperPivot and aboveH1(high[1], h1High)';
 const replacement='bool firstPivot = direction == -1 ? lowerPivot and belowH1(low[1], h1Low) and close[1] < h1Low : upperPivot and aboveH1(high[1], h1High) and close[1] > h1High';
 assert.equal(source,base.replace(old,replacement).replace('1:1 v35"','1:1 v36"'));assert.equal(source,read('../sol_short_setup.txt'));
});
for(const side of ['SHORT','LONG']){
 const f=side==='SHORT'?x=>x:mirror;
 for(const closing of [101.1,101])test(`${side}: wick outside or close on H1 boundary is not P1`,async()=>{
  const ctx=await run(f(seq(closing))),control=await run(f(seq(closing)),base);
  assert.equal(val(ctx,'Stage',15),2);assert.ok(!Number.isFinite(val(ctx,'P1',15)));assert.equal(val(control,'Stage',15),3);
 });
 test(`${side}: confirmed close outside H1 gives P1; P3 wick still valid`,async()=>{
  const ctx=await run(f(seq()));assert.equal(val(ctx,'Stage',14),2);assert.equal(val(ctx,'Stage',15),3);assert.equal(val(ctx,'Stage',17),5);
  assert.ok(Math.abs(val(ctx,'P1',15)-(side==='SHORT'?100:107))<1e-8);assert.ok(Math.abs(val(ctx,'P3',17)-(side==='SHORT'?99:108))<1e-8);
 });
 test(`${side}: new deeper confirmed pivot with close inside cannot replace valid P1`,async()=>{
  const d=seq().slice(0,16);d[15]=c(15,102,103,100.6,102);d.push(c(16,102,103,99.8,101.1),c(17,101.1,102,100.3,101.8));
  const ctx=await run(f(d));assert.ok(Math.abs(val(ctx,'P1',17)-(side==='SHORT'?100:107))<1e-8);
 });
}

for(const side of ['SHORT','LONG'])test(`${side}: P1 waits for the right confirming M5 to close`,async()=>{
 const data=(side==='SHORT'?x=>x:mirror)(seq().slice(0,16));let tail={...data.at(-1)};mock.timers.setTime(tail.openTime+1000);
 const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.map(b=>({...b})),getSymbolInfo:async()=>null};
 const engine=new PineTS(provider,'SOLUSDT','5'),ctx=await engine.run(source);
 assert.equal(ctx.plots.Stage.data.at(-1).value,2);mock.timers.setTime(tail.closeTime+1);await engine.updateTail(ctx);assert.equal(ctx.plots.Stage.data.at(-1).value,3);assert.equal(ctx.alerts.length,0);
});
test('published v36 is precisely the half-year tested executable and preserves recorded ledger totals',()=>{
 const dir='../reports/v36-p1-close-2026-10-23/',change=JSON.parse(read(dir+'change.json')),report=JSON.parse(read(dir+'halfyear-p1_close.json'));
 assert.equal(sha256(source),change.sourceSha256);assert.equal(sha256(base),change.baseSha256);assert.equal(report.calculationSourceSha256,change.calculatedDraftSha256);
 assert.equal(sha256(source.replace('1:1 v36"','1:1 v35 — P1 close (черновик)"')),change.calculatedDraftSha256);
 assert.deepEqual([report.summary.enteredTrades,report.summary.totalTrades,report.summary.targets,report.summary.stops,report.summary.unresolved],[104,101,67,34,3]);
 const monthly=report.monthly;assert.equal(monthly.reduce((s,m)=>s+m.closed,0),101);assert.equal(monthly.reduce((s,m)=>s+m.wins,0),67);assert.equal(monthly.reduce((s,m)=>s+m.losses,0),34);
});
test('19 October: current v36 executes the published MEXC control ledger',async()=>{
 const raw=JSON.parse(read('../reports/v35-early-close-2026-10-23/mexc-oct19.json'));mock.timers.setTime(Date.parse(raw.endExclusive)+1000);
 const actual=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));const expected=JSON.parse(read('../reports/v36-p1-close-2026-10-23/halfyear-p1_close.json')).trades.filter(t=>t.referenceDate==='2026-10-19');
 const normalize=ts=>ts.map(({id,...t})=>t);assert.deepEqual(normalize(actual.trades),normalize(expected));
});
