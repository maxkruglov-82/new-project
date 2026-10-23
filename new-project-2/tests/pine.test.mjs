import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import {execute,sha256} from '../backtest/run_v37_observed.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const source=read('../sol_short_setup.pine'),base=read('./fixtures/sol-prior-close-before-tp.pine');
const {PineTS}=await import(process.env.PINETS_MODULE||'pinets');
const start=Date.parse('2026-09-15T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start});
const c=(i,open,high,low,close)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open,high,low,close,volume:100});
const hour=()=>Array.from({length:12},(_,i)=>c(i,104,106,101,103));
const prefix=()=>[...hour(),c(12,103,105,102,103),c(13,103,105,102,103)];
const mirror=data=>data.map(b=>({...b,open:207-b.open,high:207-b.low,low:207-b.high,close:207-b.close}));
const prior=(close=100.7)=>[...prefix(),c(14,103,103,100.5,close),c(15,101,103,100,101.2),c(16,102,103,100.6,102)];
async function run(data,script=source){const last=data.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};mock.timers.setTime(guard.openTime+1000);return new PineTS([...data,guard],'SOLUSDT','5').run(script+'\nplot(point1,"P1",display=display.none)\nplot(h1BelowCloseBar,"Prior Below",display=display.none)\nplot(h1AboveCloseBar,"Prior Above",display=display.none)');}
const v=(ctx,name,i)=>ctx.plots[name].data[i].value;
test('draft and TXT match, exact source hashes, no new P3 close filter',()=>{
 const change=JSON.parse(read('../reports/v37-prior-close-2026-10-23/change.json'));assert.equal(sha256(source),change.sourceSha256);assert.equal(sha256(base),change.baseSourceSha256);assert.equal(source,read('../sol_short_setup.txt'));assert.ok(!source.includes('closedPastFirst'));
 const p3='if stage == 4 and ((direction == -1 and low < point1) or (direction == 1 and high > point1))';assert.equal(source.includes(p3),base.includes(p3));
});
for(const side of ['SHORT','LONG']){
 const f=side==='SHORT'?x=>x:mirror;
 test(`${side}: prior close permits P1 whose own candle closes inside`,async()=>{
  const ctx=await run(f(prior()));assert.equal(v(ctx,'Stage',15),2);assert.equal(v(ctx,'Stage',16),3);assert.ok(Math.abs(v(ctx,'P1',16)-(side==='SHORT'?100:107))<1e-8);
 });
 for(const close of [101.2,101])test(`${side}: no prior outside close (${close}) means no P1`,async()=>{
  const ctx=await run(f(prior(close)));assert.equal(v(ctx,'Stage',16),2);assert.ok(!Number.isFinite(v(ctx,'P1',16)));
 });
 test(`${side}: prior close need not immediately precede later P1 replacement`,async()=>{
  const data=[...prefix(),c(14,103,103,100.5,100.7),c(15,101,103,100.6,102),c(16,102,103,100,101.1),c(17,102,103,100.5,102)];
  const ctx=await run(f(data));assert.equal(v(ctx,'Stage',15),3);assert.ok(Math.abs(v(ctx,'P1',17)-(side==='SHORT'?100:107))<1e-8);
 });
 test(`${side}: closing of right confirming bar cannot validate P1 retroactively`,async()=>{
  const data=prior(101.2);data[16]=c(16,101.2,103,100.6,100.8);const ctx=await run(f(data));assert.equal(v(ctx,'Stage',16),2);assert.ok(!Number.isFinite(v(ctx,'P1',16)));assert.equal(v(ctx,side==='SHORT'?'Prior Below':'Prior Above',16),16);
 });
 test(`${side}: P1 candle itself may provide the first outside close; P3 still accepts a wick`,async()=>{
  const data=[...prefix(),c(14,103,103.5,100,100.4),c(15,102,104,100.6,103),c(16,103,104,101,102),c(17,102,103,99,100.5)];
  const ctx=await run(f(data));assert.equal(v(ctx,'Stage',15),3);assert.equal(v(ctx,'Stage',17),5);
 });
 test(`${side}: next H1 clears remembered close`,async()=>{
  const tomorrow=prior(101.2).map(b=>({...b,openTime:b.openTime+86400000,closeTime:b.closeTime+86400000}));const ctx=await run(f([...prior(),...tomorrow]));const last=prior().length+16;
  assert.equal(v(ctx,'Stage',last),2);assert.ok(!Number.isFinite(v(ctx,'P1',last)));assert.ok(!Number.isFinite(v(ctx,side==='SHORT'?'Prior Below':'Prior Above',last)));
 });
 test(`${side}: live quote outside is not remembered before actual M5 close`,async()=>{
  const data=f(prior().slice(0,15));let tail={...data.at(-1)};mock.timers.setTime(tail.openTime+1000);
  const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.map(b=>({...b})),getSymbolInfo:async()=>null};
  const engine=new PineTS(provider,'SOLUSDT','5'),ctx=await engine.run(source+'\nplot(h1BelowCloseBar,"Prior Below",display=display.none)\nplot(h1AboveCloseBar,"Prior Above",display=display.none)');const key=side==='SHORT'?'Prior Below':'Prior Above';
  assert.ok(!Number.isFinite(ctx.plots[key].data.at(-1).value));await engine.updateTail(ctx);assert.ok(!Number.isFinite(ctx.plots[key].data.at(-1).value));
  mock.timers.setTime(tail.closeTime+1);await engine.updateTail(ctx);assert.equal(ctx.plots[key].data.at(-1).value,14);assert.equal(ctx.alerts.length,0);
 });
}
test('21 October MEXC: 15:45 close validates P1 15:50 and returns LONG retest and target',async()=>{
 const raw=JSON.parse(read('../reports/v37-prior-close-2026-10-23/mexc-oct21.json'));mock.timers.setTime(Date.parse(raw.endExclusive)+1000);
 const report=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
 const p=report.p1Audit.find(p=>p.pivotAt==='2026-10-21T15:50:00.000+07:00');assert.ok(p);assert.equal(p.side,1);assert.equal(p.priorCloseAt,'2026-10-21T15:45:00.000+07:00');assert.equal(p.priorClose,107);assert.equal(p.pivotClose,106.64);
 assert.equal(report.trades.length,1);assert.equal(report.trades[0].side,'LONG');assert.equal(report.trades[0].status,'target');assert.equal(report.trades[0].entryBarStart,'2026-10-21T20:30:00.000+07:00');
});

const takeSequence=()=>[...prefix(),c(14,103,103.5,100,100.4),c(15,102,104,100.6,103),c(16,103,104,101,102),c(17,102,103,99,100.5),c(18,100,102.5,99.5,102),c(19,102,103,99.05,100),c(20,100,103,98.9,99)];
const takeTransform=(data,side)=>side==='SHORT'?data.map(b=>({...b,open:b.open+8.4,high:b.high+8.4,low:b.low+8.4,close:b.close+8.4})):data.map(b=>({...b,open:206.4-b.open,high:206.4-b.low,low:206.4-b.high,close:206.4-b.close}));
for(const side of ['SHORT','LONG']){
 test(`${side}: target107.40 has take107.${side==='SHORT'?'50':'30'} with unchanged entry/SL`,async()=>{
  const ctx=await run(takeTransform(takeSequence(),side));assert.equal(v(ctx,side,18),1);assert.ok(Math.abs(v(ctx,'Swing Target',18)-107.4)<1e-9);assert.ok(Math.abs(v(ctx,`${side} Target`,18)-(side==='SHORT'?107.5:107.3))<1e-9);
  assert.ok(Math.abs(v(ctx,`${side} Entry`,18)-(side==='SHORT'?110.4:104.4))<1e-9);assert.ok(Math.abs(v(ctx,`${side} Stop`,18)-(side==='SHORT'?113.43:101.37))<1e-9);
 });
 test(`${side}: new take is reached before old0.03-buffer target`,async()=>{
  const ctx=await run(takeTransform(takeSequence(),side));assert.equal(v(ctx,'Outcome',19),1);assert.ok(Math.abs(v(ctx,`${side} Target`,19)-v(ctx,`${side} Target`,18))<1e-9);
 });
 test(`${side}: exact0.10-buffer take touch closes; stop stays0.03`,async()=>{
  const data=takeSequence();data[19]=c(19,102,103,99.1,100);let ctx=await run(takeTransform(data,side));assert.equal(v(ctx,'Outcome',19),1);
  data[19]=c(19,102,105.03,99.2,102);ctx=await run(takeTransform(data,side));assert.equal(v(ctx,'Outcome',19),-1);
 });
 test(`${side}: live take uses final direction; later stop does not overwrite first TP`,async()=>{
  const raw=takeSequence().slice(0,20);raw[19]=c(19,102,103,99.2,100);const data=takeTransform(raw,side);let tail={...data.at(-1)};tail.close=side==='SHORT'?107.55:107.25;tail.low=Math.min(tail.low,tail.close);tail.high=Math.max(tail.high,tail.close);mock.timers.setTime(tail.openTime+1000);
  const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.slice(0,-1).concat({...tail}),getSymbolInfo:async()=>null};const engine=new PineTS(provider,'SOLUSDT','5'),ctx=await engine.run(source);assert.equal(ctx.plots.Outcome.data.at(-1).value,0);
  tail.close=side==='SHORT'?107.49:107.31;tail.low=Math.min(tail.low,tail.close);tail.high=Math.max(tail.high,tail.close);await engine.updateTail(ctx);assert.equal(ctx.plots.Outcome.data.at(-1).value,1);
  tail.close=side==='SHORT'?114:101;tail.low=Math.min(tail.low,tail.close);tail.high=Math.max(tail.high,tail.close);await engine.updateTail(ctx);assert.equal(ctx.plots.Outcome.data.at(-1).value,1);
 });
}
test('only TP default0.03→0.10 and draft title change on top of selected prior-close source',()=>{
 const expected=base.replace('предыдущее закрепление P1 (черновик)','предыдущее закрепление P1, TP перед целью0.10 (черновик)').replace('input.float(0.03, "Отступ тейка перед целью (USDT)"','input.float(0.10, "Отступ тейка перед целью (USDT)"');assert.equal(source,expected.replace('1:1 v36 — предыдущее закрепление P1, TP перед целью0.10 (черновик)','1:1 v37'));
});

test('v37 is title-only equivalent to the actual half-year candidate with final take signs',()=>{
 const dir='../reports/v37-prior-close-2026-10-23/',c=JSON.parse(read(dir+'change.json')),z=JSON.parse(read(dir+'halfyear-v37.json'));
 assert.equal(sha256(source),c.sourceSha256);assert.equal(sha256(source.replace(c.publishedTitle+'"',c.calculatedTitle+'"')),c.calculatedCandidateSha256);assert.equal(z.calculationSourceSha256,c.calculatedCandidateSha256);
 assert.deepEqual([z.summary.enteredTrades,z.summary.totalTrades,z.summary.targets,z.summary.stops,z.summary.unresolved],[106,103,73,30,3]);assert.equal(z.monthly.reduce((n,m)=>n+m.closed,0),103);assert.equal(z.monthly.reduce((n,m)=>n+m.wins,0),73);
});

test('29 September: lower unqualified lows do not block later higher P1 after prior close',async()=>{
 const raw=JSON.parse(read('../reports/v37-prior-close-2026-10-23/mexc-sep29.json'));mock.timers.setTime(Date.parse(raw.endExclusive)+1000);
 const report=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));const short=report.p1Audit.filter(e=>e.side===-1);
 assert.equal(short.length,1);assert.equal(short[0].pivotAt,'2026-09-29T16:15:00.000+07:00');assert.equal(short[0].confirmedAt,'2026-09-29T16:20:00.000+07:00');assert.equal(short[0].priorCloseAt,'2026-09-29T16:05:00.000+07:00');assert.equal(short[0].priorClose,118.91);assert.equal(short[0].h1Low,118.95);assert.equal(short[0].pivotClose,119.05);
 const expected=JSON.parse(read('../reports/v37-prior-close-2026-10-23/halfyear-v37.json'));assert.deepEqual(report.trades,expected.trades.filter(t=>t.referenceDate==='2026-09-29'));
});
