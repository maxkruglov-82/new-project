import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import {execute,sha256} from '../../backtest/run_v37_observed.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const source=read('./sol_equal_p1.pine'),base=read('./base-v37.pine');
const {PineTS}=await import(process.env.PINETS_MODULE||'pinets');
const start=Date.parse('2026-09-15T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start});
const c=(i,open,high,low,close)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open,high,low,close,volume:100});
const sequence=()=>[
 ...Array.from({length:12},(_,i)=>c(i,104,106,101,103)),
 c(12,103,105,102,103),c(13,103,105,102,103),
 c(14,103,103.5,100,100.4),c(15,102,103,100.6,102),
 c(16,102,104,101,103),c(17,103,103.5,100.6,102),
 c(18,102,103,100,100.8),c(19,101,103,100.5,102),
 c(20,102,102,99,100.5),c(21,100.5,102.1,99.5,102),
 c(22,102,103,99.1,99.5)
];
const mirror=data=>data.map(b=>({...b,open:207-b.open,high:207-b.low,low:207-b.high,close:207-b.close}));
const diagnostics='\nplot(point1,"P1",display=display.none)\nplot(point2,"P2",display=display.none)';
const v=(ctx,key,i)=>ctx.plots[key].data[i].value;
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
async function run(data){const last=data.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};mock.timers.setTime(guard.openTime+1000);return new PineTS([...data,guard],'SOLUSDT','5').run(source+diagnostics);}
test('draft only, matching TXT, unchanged published v37 and strict P3 condition',()=>{
 assert.equal(source,read('./sol_equal_p1.txt'));
 assert.equal(base,read('../../tests/fixtures/sol-v37-published.pine'));
 assert.equal(sha256(base),'3d8dfb6dd1490026458430db6a9a8eee805bac5e7b651a770a93792260925f69');
 assert.ok(!source.includes('equalFirstLow'));
 assert.ok(source.includes('if stage == 4 and ((direction == -1 and low < point1) or (direction == 1 and high > point1))'));
});
for(const side of ['SHORT','LONG']){
 const f=side==='SHORT'?x=>x:mirror;
 test(`${side}: equal P1 preserves structure; strict break creates P3 then later retest`,async()=>{
  const ctx=await run(f(sequence()));
  assert.equal(v(ctx,'Stage',19),4);near(v(ctx,'P1',19),side==='SHORT'?100:107);near(v(ctx,'P2',19),side==='SHORT'?104:103);
  assert.equal(v(ctx,'Stage',20),5);assert.equal(v(ctx,side,20),0);
  assert.equal(v(ctx,side,21),1);near(v(ctx,`${side} Entry`,21),side==='SHORT'?102:105);
  near(v(ctx,`${side} Stop`,21),side==='SHORT'?105.03:101.97);
  near(v(ctx,`${side} Target`,21),side==='SHORT'?99.1:107.9);
  assert.equal(v(ctx,'Outcome',22),1);
 });
 test(`${side}: multiple equal P1 touches do not create P3 or reset`,async()=>{
  const data=sequence().slice(0,20);data.push(c(20,102,103,100,100.8),c(21,101,103,100.5,102),c(22,102,103,100,100.8),c(23,101,103,100.5,102));
  const ctx=await run(f(data));for(const i of [19,20,21,22,23]){assert.equal(v(ctx,'Stage',i),4);near(v(ctx,'P1',i),side==='SHORT'?100:107);assert.equal(v(ctx,side,i),0);}
 });
 test(`${side}: P2 can still improve after equality and before strict break`,async()=>{
  const data=sequence().slice(0,20);data.push(c(20,102,104.5,100.5,103),c(21,103,104,100.6,102));
  const ctx=await run(f(data));assert.equal(v(ctx,'Stage',21),4);near(v(ctx,'P1',21),side==='SHORT'?100:107);near(v(ctx,'P2',21),side==='SHORT'?104.5:102.5);
 });
 test(`${side}: live retest after strict break produces one entry`,async()=>{
  const data=f(sequence().slice(0,22));let tail={...data.at(-1)};
  tail.close=side==='SHORT'?101:106;tail.high=side==='SHORT'?101.8:tail.high;tail.low=side==='LONG'?105.2:tail.low;
  mock.timers.setTime(tail.openTime+1000);
  const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.slice(0,-1).concat({...tail}),getSymbolInfo:async()=>null};
  const engine=new PineTS(provider,'SOLUSDT','5'),ctx=await engine.run(source+diagnostics);assert.equal(ctx.plots[side].data.at(-1).value,0);
  tail.close=side==='SHORT'?102.1:104.9;tail.high=Math.max(tail.high,tail.close);tail.low=Math.min(tail.low,tail.close);
  await engine.updateTail(ctx);assert.equal(ctx.plots[side].data.at(-1).value,1);
  const alerts=ctx.alerts.length;await engine.updateTail(ctx);assert.equal(ctx.plots[side].data.at(-1).value,1);assert.equal(ctx.alerts.length,alerts);
 });
}
test('14 August actual MEXC: entry moves from20:40 to18:00 and TP at18:05',async()=>{
 const raw=JSON.parse(read('./mexc-aug14.json'));mock.timers.setTime(Date.parse(raw.endExclusive)+1000);
 const before=await execute(base,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
 const after=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
 assert.equal(before.trades.length,1);assert.equal(after.trades.length,1);
 assert.equal(before.trades[0].entryBarStart,'2026-08-14T20:40:00.000+07:00');
 const t=after.trades[0];assert.equal(t.side,'SHORT');assert.equal(t.entryBarStart,'2026-08-14T18:00:00.000+07:00');assert.equal(t.exitBarStart,'2026-08-14T18:05:00.000+07:00');assert.equal(t.status,'target');
 near(t.entry,75.48);near(t.stop,75.70);near(t.target,75.39);near(t.rewardRisk,0.40909090909);
 writeFileSync(new URL('./aug14-comparison.json',import.meta.url),JSON.stringify({baseSourceSha256:sha256(base),sourceSha256:sha256(source),before,after},null,2)+'\n');
});
