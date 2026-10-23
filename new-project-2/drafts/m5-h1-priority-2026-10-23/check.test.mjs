import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import {execute,sha256} from '../../backtest/run_v37_observed.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const source=read('./sol_h1_priority.pine'),base=read('./base-v38.pine');
const {PineTS}=await import(process.env.PINETS_MODULE||'pinets');
const start=Date.parse('2026-09-15T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start});
const c=(i,open,high,low,close)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open,high,low,close,volume:100});
const prefix=()=>[...Array.from({length:12},(_,i)=>c(i,104,106,101,103)),c(12,103,105,102,103),c(13,103,105,102,103)];
const mirror=data=>data.map(b=>({...b,open:207-b.open,high:207-b.low,low:207-b.high,close:207-b.close}));
const v=(ctx,key,i)=>ctx.plots[key].data[i].value;
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const extra='\nplot(point1,"P1",display=display.none)\nplot(point2,"P2",display=display.none)\nplot(h1RejectedHigh,"Rejected High",display=display.none)\nplot(h1RejectedLow,"Rejected Low",display=display.none)';
async function run(data,script=source){const last=data.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};mock.timers.setTime(guard.openTime+1000);return new PineTS([...data,guard],'SOLUSDT','5').run(script+(script.includes('varip float h1RejectedHigh')?extra:extra.split('\n').filter(line=>!line.includes('h1Rejected')).join('\n')));}
const regular=()=>[...prefix(),c(14,103,103.5,100,100.4),c(15,102,104,100.6,103),c(16,103,104,101,102),c(17,102,103,99,100.5),c(18,104.5,104.7,103.8,104.2)];
test('isolated draft, matching TXT, base and published code unchanged',()=>{
 const change=JSON.parse(read('./change.json'));assert.equal(sha256(source),change.sourceSha256);assert.equal(sha256(base),change.baseSourceSha256);
 assert.equal(source,read('./sol_h1_priority.txt'));assert.equal(base,read('../m5-equal-p1-2026-10-23/sol_equal_p1.pine'));
 assert.equal(sha256(read('../../tests/fixtures/sol-v37-published.pine')),'3d8dfb6dd1490026458430db6a9a8eee805bac5e7b651a770a93792260925f69');
 assert.ok(source.includes('bool oppositeH1Break = direction == -1 ? priorityAbove : priorityBelow'));
 assert.ok(source.includes('if shadowCross and not na(reversalThird) and oppositeH1Break'));
 assert.ok(source.includes('bool crossedSecond = stage == 5 and oppositeH1Break'));
 assert.ok(!source.includes('equalFirstLow'));

});
for(const side of ['SHORT','LONG']){
 const f=side==='SHORT'?x=>x:mirror,d=side==='SHORT'?-1:1;
 test(`${side}: local P2 break inside H1 preserves direction; old version flips`,async()=>{
  const ctx=await run(f(regular()));assert.equal(v(ctx,'Direction',18),d);assert.equal(v(ctx,'Stage',18),5);assert.equal(v(ctx,side,18),0);
  const old=await run(f(regular()),base);assert.equal(v(old,'Direction',18),-d);
 });
 for(const high of [106,106.01])test(`${side}: opposite H1 touch/subthreshold break does not flip (${high})`,async()=>{
  const data=regular();data[18]=c(18,104.5,high,103.8,104.2);const ctx=await run(f(data));assert.equal(v(ctx,'Direction',18),d);assert.equal(v(ctx,'Stage',18),5);
 });
 test(`${side}: opposite H1 threshold break permits reversal`,async()=>{
  const data=regular();data.push(c(19,104.2,106.02,103.9,105.5));const ctx=await run(f(data));assert.equal(v(ctx,'Direction',19),-d);assert.equal(v(ctx,'Stage',19),5);assert.equal(v(ctx,side==='SHORT'?'LONG':'SHORT',19),0);
 });
 test(`${side}: earlier rejected wick must be strictly broken; H1 alone is insufficient`,async()=>{
  for(const high of [106.02,106.05,106.06]){
   const data=regular();data[12]=c(12,103,106.05,102,103);data[18]=c(18,104.5,high,103.8,104.2);
   const ctx=await run(f(data));assert.equal(v(ctx,'Direction',18),high>106.05?-d:d);
  }
 });
 test(`${side}: new rejected wick is compared to prior barrier, not itself`,async()=>{
  const data=regular();data[12]=c(12,103,106.05,102,103);data[18]=c(18,104.5,106.06,103.8,104.2);
  const ctx=await run(f(data));assert.equal(v(ctx,'Direction',18),-d);
 });
 test(`${side}: shifted boundary is cleared by next reference H1`,async()=>{
  const first=regular();first[12]=c(12,103,106.05,102,103);
  const next=regular();next[18]=c(18,104.5,106.02,103.8,104.2);
  const data=[...first,...next.map(b=>({...b,openTime:b.openTime+86400000,closeTime:b.closeTime+86400000}))];
  const ctx=await run(f(data));assert.equal(v(ctx,'Direction',first.length+18),-d);
 });
 test(`${side}: opposite working boundary can switch a second priority again`,async()=>{
  const data=regular().slice(0,17);data.push(c(17,103,106.02,102,106.02),c(18,106.02,105.8,104,105),c(19,105,105.5,100.98,100.98));
  // Correct the open of the confirmation candle to remain inside its OHLC.
  data[18]=c(18,105.5,105.8,104,105);
  const ctx=await run(f(data));assert.equal(v(ctx,'Direction',17),-d);assert.equal(v(ctx,'Direction',18),-d);assert.equal(v(ctx,'Direction',19),d);assert.equal(v(ctx,'Stage',19),2);
 });
 test(`${side}: live quote must pass prior rejected wick, not merely H1`,async()=>{
  const raw=[...regular(),c(19,104.2,104.6,104,104.4)];raw[12]=c(12,103,106.05,102,103);const data=f(raw);let tail={...data.at(-1)};
  mock.timers.setTime(tail.openTime+1000);const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.slice(0,-1).concat({...tail}),getSymbolInfo:async()=>null};
  const engine=new PineTS(provider,'SOLUSDT','5'),ctx=await engine.run(source);
  for(const quote of [106.02,106.05,106.06]){tail.close=side==='SHORT'?quote:207-quote;tail.high=Math.max(tail.high,tail.close);tail.low=Math.min(tail.low,tail.close);await engine.updateTail(ctx);assert.equal(ctx.plots.Direction.data.at(-1).value,quote>106.05?-d:d);}
 });
 test(`${side}: equal P1 preservation and normal subsequent retest remain active`,async()=>{
  const data=[...prefix(),c(14,103,103.5,100,100.4),c(15,102,103,100.6,102),c(16,102,104,101,103),c(17,103,103.5,100.6,102),c(18,102,103,100,100.8),c(19,101,103,100.5,102),c(20,102,102,99,100.5),c(21,100.5,102.1,99.5,102),c(22,102,103,99.1,99.5)];
  const ctx=await run(f(data));assert.equal(v(ctx,'Stage',19),4);near(v(ctx,'P1',19),side==='SHORT'?100:107);assert.equal(v(ctx,'Stage',20),5);assert.equal(v(ctx,side,20),0);assert.equal(v(ctx,side,21),1);assert.equal(v(ctx,'Outcome',22),1);
 });
 test(`${side}: open trade cannot reverse on opposite H1 break`,async()=>{
  const data=regular().slice(0,18);data.push(c(18,100,102.5,99.5,102),c(19,102,106.02,100,105.5));
  const ctx=await run(f(data));assert.equal(v(ctx,side,18),1);assert.equal(v(ctx,'Direction',19),d);assert.equal(v(ctx,'Outcome',19),-1);assert.equal(v(ctx,side==='SHORT'?'LONG':'SHORT',19),0);
 });
 test(`${side}: live P2 crossing inside H1 keeps pending direction; H1 crossing then permits`,async()=>{
  const data=f([...regular(),c(19,104.2,104.6,104,104.4)]);let tail={...data.at(-1)};mock.timers.setTime(tail.openTime+1000);
  const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.slice(0,-1).concat({...tail}),getSymbolInfo:async()=>null};
  const engine=new PineTS(provider,'SOLUSDT','5'),ctx=await engine.run(source);assert.equal(ctx.plots.Direction.data.at(-1).value,d);
  tail.close=side==='SHORT'?106.02:100.98;tail.high=Math.max(tail.high,tail.close);tail.low=Math.min(tail.low,tail.close);await engine.updateTail(ctx);assert.equal(ctx.plots.Direction.data.at(-1).value,-d);
  await engine.updateTail(ctx);assert.equal(ctx.plots.Direction.data.at(-1).value,-d);
 });
}
test('10 August MEXC: shadow exception inside H1 suppressed; requested SHORT at21:10',async()=>{
 const raw=JSON.parse(read('./mexc-aug10.json'));mock.timers.setTime(Date.parse(raw.endExclusive)+1000);
 const before=await execute(base,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));const after=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
 assert.equal(before.trades.length,1);assert.equal(before.trades[0].side,'LONG');assert.equal(before.trades[0].entryBarStart,'2026-08-10T18:00:00.000+07:00');
 assert.equal(after.trades.length,1);const t=after.trades[0];assert.equal(t.side,'SHORT');assert.equal(t.entryBarStart,'2026-08-10T21:10:00.000+07:00');assert.equal(t.exitBarStart,'2026-08-10T22:00:00.000+07:00');assert.equal(t.status,'target');near(t.entry,76.66875);near(t.stop,77.2675);near(t.target,76.2);
 writeFileSync(new URL('./aug10-comparison.json',import.meta.url),JSON.stringify({baseSourceSha256:sha256(base),sourceSha256:sha256(source),before,after},null,2)+'\n');
});
test('10 August actual candles:15:25 moves upper reversal boundary to77.12; no early LONG',async()=>{
 const raw=JSON.parse(read('./mexc-aug10.json'));
 const data=raw.candles.map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
 const ctx=await run(data),at=time=>data.findIndex(b=>new Date(b.openTime+25200000).toISOString().slice(11,16)===time);
 near(v(ctx,'Rejected High',at('15:25')),77.12);near(v(ctx,'Rejected High',at('19:00')),77.12);
 assert.equal(v(ctx,'Direction',at('17:35')),-1);assert.equal(v(ctx,'Direction',at('19:00')),-1);
});
test('14 August MEXC: earlier equal-P1 fix still gives SHORT18:00 and TP18:05',async()=>{
 const raw=JSON.parse(read('../m5-equal-p1-2026-10-23/mexc-aug14.json'));mock.timers.setTime(Date.parse(raw.endExclusive)+1000);const after=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
 assert.equal(after.trades.length,1);const t=after.trades[0];assert.equal(t.side,'SHORT');assert.equal(t.entryBarStart,'2026-08-14T18:00:00.000+07:00');assert.equal(t.exitBarStart,'2026-08-14T18:05:00.000+07:00');assert.equal(t.status,'target');
});
