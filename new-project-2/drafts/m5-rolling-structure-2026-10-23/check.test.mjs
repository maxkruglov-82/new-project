import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import {execute,sha256} from '../../backtest/run_v38_observed.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const source=read('./sol_rolling.pine'),base=read('./base-v39.pine');
const {PineTS}=await import(process.env.PINETS_MODULE||'pinets');
const start=Date.parse('2026-09-15T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start});
const c=(i,open,high,low,close)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open,high,low,close,volume:100});
const sequence=()=>[...Array.from({length:12},(_,i)=>c(i,104,106,101,103)),c(12,103,105,102,103),c(13,103,105,102,103),c(14,103,103.5,100,100.4),c(15,102,103,100.6,102),c(16,102,104,101,103),c(17,103,103.5,100.6,102),c(18,102,102,99,100),c(19,100,100.4,99.5,100.2),c(20,100.2,101,100,100.8),c(21,100.8,100.8,99.6,100),c(22,100,100.3,98.5,99),c(23,99,100.1,98.8,100),c(24,100,100.5,98.6,99)];
const mirror=data=>data.map(b=>({...b,open:207-b.open,high:207-b.low,low:207-b.high,close:207-b.close}));
const extra='\nplot(point1,"P1",display=display.none)\nplot(point2,"P2",display=display.none)\nplot(point3,"P3",display=display.none)\nplot(structureRollBar,"Roll Bar",display=display.none)';
const v=(ctx,key,i)=>ctx.plots[key].data[i].value;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function run(data){const last=data.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};mock.timers.setTime(guard.openTime+1000);return new PineTS([...data,guard],'SOLUSDT','5').run(source+extra);}
test('isolated draft, matching TXT and baseline hashes; pinned published v38 preserved',()=>{
 const change=JSON.parse(read('./change.json'));assert.equal(sha256(source),change.sourceSha256);assert.equal(sha256(base),change.baseSourceSha256);assert.equal(base,read('../m5-equal-p3-2026-10-23/sol_equal_p3.pine'));assert.equal(source,read('./sol_rolling.txt'));assert.equal(sha256(read('../../tests/fixtures/sol-v38-published.pine')),'ebc53245d09fbf4dc2c7d7795261d900e23e820525413d7fdcb2e469584c20f7');
});
for(const side of ['SHORT','LONG']){
 const f=side==='SHORT'?x=>x:mirror;
 test(`${side}: confirmed4 cancels old entry; new3-4 waits for5 and retest6`,async()=>{
  const ctx=await run(f(sequence()));assert.equal(v(ctx,'Stage',21),4);near(v(ctx,'P1',21),side==='SHORT'?99:108);near(v(ctx,'P2',21),side==='SHORT'?101:106);assert.ok(!Number.isFinite(v(ctx,`${side} Entry`,21)));assert.equal(v(ctx,side,21),0);
  near(v(ctx,'P1',22),side==='SHORT'?99:108);near(v(ctx,'P2',22),side==='SHORT'?101:106);near(v(ctx,'P3',22),side==='SHORT'?98.5:108.5);assert.equal(v(ctx,side,22),0);assert.equal(v(ctx,side,23),1);
  near(v(ctx,`${side} Entry`,23),side==='SHORT'?100:107);near(v(ctx,`${side} Stop`,23),side==='SHORT'?101.53:105.47);near(v(ctx,`${side} Target`,23),side==='SHORT'?98.6:108.4);assert.equal(v(ctx,'Outcome',24),1);
 });
 test(`${side}: unconfirmed4 cannot create rolling setup`,async()=>{
  const data=sequence().slice(0,22);data[21]=c(21,100.8,101.5,98.5,100);const ctx=await run(f(data));near(v(ctx,'P1',21),side==='SHORT'?100:107);near(v(ctx,'P2',21),side==='SHORT'?104:103);assert.equal(v(ctx,side,21),0);
 });
 test(`${side}: adjacent4 still excluded`,async()=>{
  const data=sequence().slice(0,23);data[19]=c(19,100,101,99.5,100.5);data[20]=c(20,100.5,100.8,99.6,100);data[21]=c(21,100,100.7,99.5,100);const ctx=await run(f(data));near(v(ctx,'P1',22),side==='SHORT'?100:107);near(v(ctx,'P2',22),side==='SHORT'?104:103);
 });
 test(`${side}: return to canceled old entry before5 never opens old trade`,async()=>{
  const data=sequence().slice(0,23);data[22]=c(22,100,102.1,99.5,102);const ctx=await run(f(data));assert.equal(v(ctx,side,22),0);assert.equal(v(ctx,'Stage',22),4);near(v(ctx,'P1',22),side==='SHORT'?99:108);assert.ok(!Number.isFinite(v(ctx,`${side} Entry`,22)));
 });
 test(`${side}:5 candle may cross canceled old entry without resurrecting old trade`,async()=>{
  const data=sequence().slice(0,23);data[22]=c(22,100,102.1,98.5,100);const ctx=await run(f(data));near(v(ctx,'P1',22),side==='SHORT'?99:108);near(v(ctx,'P2',22),side==='SHORT'?101:106);assert.equal(v(ctx,side,22),0);assert.equal(v(ctx,'Stage',22),5);
 });
 test(`${side}: old entry touched before4 confirmation takes original trade`,async()=>{
  const data=sequence().slice(0,23);data[21]=c(21,100.8,102.1,99.6,102);const ctx=await run(f(data));assert.equal(v(ctx,side,21),1);near(v(ctx,'P1',22),side==='SHORT'?100:107);near(v(ctx,`${side} Entry`,21),side==='SHORT'?102:105);
 });
 test(`${side}: equal5 accepted consistently with v39 equality rule`,async()=>{
  const data=sequence().slice(0,23);data[22]=c(22,100,100.3,99,99.5);const ctx=await run(f(data));near(v(ctx,'P1',22),side==='SHORT'?99:108);near(v(ctx,'P2',22),side==='SHORT'?101:106);near(v(ctx,'P3',22),side==='SHORT'?99:108);assert.equal(v(ctx,side,22),0);
 });
 test(`${side}: live5 then later same-bar quote proves retest without duplicate entry`,async()=>{
  const raw=sequence().slice(0,23);raw[22]=c(22,100,100.3,99.5,99.5);const data=f(raw);let tail={...data.at(-1)};mock.timers.setTime(tail.openTime+1000);
  const provider={getMarketData:async(_t,_tf,_l,since)=>data.filter(b=>since===undefined||b.openTime>=since).map((b,i,a)=>i===a.length-1?{...tail}:{...b}),getSymbolInfo:async()=>null};
  const engine=new PineTS(provider,'SOLUSDT','5'),ctx=await engine.run(source+extra);
  tail.close=side==='SHORT'?98.5:108.5;tail.low=Math.min(tail.low,tail.close);tail.high=Math.max(tail.high,tail.close);await engine.updateTail(ctx);near(ctx.plots.P1.data.at(-1).value,side==='SHORT'?99:108);assert.equal(ctx.plots[side].data.at(-1).value,0);
  tail.close=side==='SHORT'?100.05:106.95;tail.low=Math.min(tail.low,tail.close);tail.high=Math.max(tail.high,tail.close);await engine.updateTail(ctx);assert.equal(ctx.plots[side].data.at(-1).value,1);
  const alerts=ctx.alerts.length;await engine.updateTail(ctx);assert.equal(ctx.alerts.length,alerts);
  tail.close=side==='SHORT'?98.55:108.45;tail.low=Math.min(tail.low,tail.close);tail.high=Math.max(tail.high,tail.close);await engine.updateTail(ctx);assert.equal(ctx.plots.Outcome.data.at(-1).value,1);
 });
}
test('1 May actual MEXC: rolling structure produces LONG20:25 and target20:30',async()=>{
 const raw=JSON.parse(read('./mexc-may01.json'));mock.timers.setTime(Date.parse(raw.endExclusive)+1000);const after=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));const before=await execute(base,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
 assert.equal(after.trades.length,1);const t=after.trades[0];assert.equal(t.side,'LONG');assert.equal(t.entryBarStart,'2026-05-01T20:25:00.000+07:00');assert.equal(t.exitBarStart,'2026-05-01T20:30:00.000+07:00');assert.equal(t.status,'target');near(t.fiboStop,84.1325);near(t.entry,84.37625);near(t.stop,84.1025);near(t.target,84.52);assert.equal(before.trades[0].entryBarStart,'2026-05-01T21:25:00.000+07:00');
 writeFileSync(new URL('./may01-comparison.json',import.meta.url),JSON.stringify({status:'Confirmed rules: standalone confirmed4 cancels old entry immediately; then await5 and retest6',baseSourceSha256:sha256(base),sourceSha256:sha256(source),before,after},null,2)+'\n');
});
