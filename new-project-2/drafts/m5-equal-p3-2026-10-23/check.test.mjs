import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import {execute,sha256} from '../../backtest/run_v37_observed.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const source=read('./sol_equal_p3.pine'),base=read('./base-v38.pine');
const {PineTS}=await import(process.env.PINETS_MODULE||'pinets');
const start=Date.parse('2026-09-15T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start});
const c=(i,open,high,low,close)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open,high,low,close,volume:100});
const sequence=()=>[...Array.from({length:12},(_,i)=>c(i,104,106,101,103)),c(12,103,105,102,103),c(13,103,105,102,103),c(14,103,103.5,100,100.4),c(15,102,103,100.6,102),c(16,102,104,101,103),c(17,103,103.5,100.6,102),c(18,102,103,100,100.8),c(19,100.8,102.6,100.5,102.5),c(20,102.5,103,100.1,100.5)];
const mirror=data=>data.map(b=>({...b,open:207-b.open,high:207-b.low,low:207-b.high,close:207-b.close}));
const v=(ctx,key,i)=>ctx.plots[key].data[i].value;
async function run(data,script=source){const last=data.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};mock.timers.setTime(guard.openTime+1000);return new PineTS([...data,guard],'SOLUSDT','5').run(script+'\nplot(point1,"P1",display=display.none)\nplot(point2,"P2",display=display.none)');}
test('isolated equality proposal; published v38 unchanged; two P3 seed sites changed',()=>{
 const change=JSON.parse(read('./change.json'));assert.equal(sha256(source),change.sourceSha256);assert.equal(sha256(base),change.baseSourceSha256);assert.equal(base,read('../../tests/fixtures/sol-v38-published.pine'));assert.equal(source,read('./sol_equal_p3.txt'));
 assert.equal((source.match(/low <= point1/g)||[]).length,2);assert.equal((source.match(/high >= point1/g)||[]).length,2);
});
for(const side of ['SHORT','LONG']){
 const f=side==='SHORT'?x=>x:mirror;
 test(`${side}: equal P1 after valid P2 seeds P3; retest on later bar and target`,async()=>{
  const ctx=await run(f(sequence()));assert.equal(v(ctx,'Stage',17),4);assert.equal(v(ctx,'Stage',18),5);assert.equal(v(ctx,side,18),0);assert.equal(v(ctx,side,19),1);assert.equal(v(ctx,'Outcome',20),1);
  const old=await run(f(sequence()),base);assert.equal(v(old,'Stage',18),4);assert.equal(v(old,side,19),0);
 });
 test(`${side}: price short of P1 does not seed P3`,async()=>{
  const data=sequence().slice(0,19);data[18]=c(18,102,103,100.01,100.8);const ctx=await run(f(data));assert.equal(v(ctx,'Stage',18),4);assert.equal(v(ctx,side,18),0);
 });
 test(`${side}: adjacent P2 remains rejected; next weaker standalone pivot is accepted`,async()=>{
  const data=sequence().slice(0,15);data.push(c(15,102,104,100.6,103),c(16,103,103.5,101,102),c(17,102,103.8,101,103),c(18,103,103,100.5,102));
  const ctx=await run(f(data));assert.equal(v(ctx,'Stage',16),3);assert.ok(!Number.isFinite(v(ctx,'P2',16)));assert.equal(v(ctx,'Stage',18),4);
  assert.ok(Math.abs(v(ctx,'P2',18)-(side==='SHORT'?103.8:103.2))<1e-8);
  const old=await run(f(data),base);assert.equal(v(old,'Stage',18),3);
 });
}
test('22 October M5-only: correct P1/P2/equal P3; unknown intrabar retest is not backfilled',async()=>{
 const raw=JSON.parse(read('./mexc-oct22-m5.json'));mock.timers.setTime(Date.parse(raw.endExclusive)+1000);const result=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
 const t=result.trades.find(t=>t.side==='SHORT');assert.ok(t);assert.equal(t.entryBarStart,'2026-10-22T16:30:00.000+07:00');assert.equal(t.status,'stop');assert.equal(t.exitBarStart,'2026-10-22T16:45:00.000+07:00');
 writeFileSync(new URL('./m5-only-result.json',import.meta.url),JSON.stringify({sourceSha256:sha256(source),method:'Exact Pine on closed M5; intrabar retest not inferred',...result},null,2)+'\n');
 const data=raw.candles.map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));const ctx=await run(data);const at=s=>data.findIndex(b=>new Date(b.openTime+25200000).toISOString().slice(11,16)===s);
 assert.equal(v(ctx,'Stage',at('15:55')),4);assert.equal(v(ctx,'P1',at('15:55')),103.56);assert.equal(v(ctx,'P2',at('15:55')),103.87);assert.equal(v(ctx,'Stage',at('16:05')),5);assert.equal(v(ctx,'SHORT',at('16:05')),0);
});
test('manual fixed levels: minute data confirm entry16:10 before TP16:12, M1 matches M5',()=>{
 const m1=JSON.parse(read('./mexc-oct22-min1.json')),m5=JSON.parse(read('./mexc-oct22-m5.json')),index=new Map(m5.candles.map(b=>[b.time,b]));
 for(let i=0;i<m1.candles.length;i+=5){const bs=m1.candles.slice(i,i+5),old=index.get(bs[0].time);assert.deepEqual([bs[0].open,Math.max(...bs.map(b=>b.high)),Math.min(...bs.map(b=>b.low)),bs.at(-1).close],[old.open,old.high,old.low,old.close]);}
 const replay=JSON.parse(read('./manual-replay.json'));assert.equal(replay.outcome,'target');assert.equal(replay.entryMinute,'2026-10-22T16:10:00+07:00');assert.equal(replay.exitMinute,'2026-10-22T16:12:00+07:00');
});
test('22 October: actual candidate on chronological M1 close updates enters after equal P3 and takes profit',async()=>{
 const raw=JSON.parse(read('./mexc-oct22-m5.json')),minutes=JSON.parse(read('./mexc-oct22-min1.json')),cut=Date.parse('2026-10-22T16:05:00+07:00');
 const data=raw.candles.filter(b=>b.time*1000<cut).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
 const provider={getMarketData:async(_t,_tf,_l,since)=>data.filter(b=>since===undefined||b.openTime>=since).map(b=>({...b})),getSymbolInfo:async()=>null};
 let engine,ctx,tail;const trace=[];
 for(const b of minutes.candles.filter(b=>b.time*1000>=cut)){
  const time=Math.floor(b.time/300)*step;
  if(!tail||tail.openTime!==time){tail={openTime:time,closeTime:time+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol};data.push(tail);}else{tail.high=Math.max(tail.high,b.high);tail.low=Math.min(tail.low,b.low);tail.close=b.close;tail.volume+=b.vol;}
  mock.timers.setTime(b.time*1000+59999);
  if(!engine){engine=new PineTS(provider,'SOLUSDT','5');ctx=await engine.run(source);}else await engine.updateTail(ctx);
  const row={minute:new Date(b.time*1000+25200000).toISOString().slice(11,16),quote:b.close};for(const k of ['Stage','Direction','SHORT','SHORT Entry','SHORT Stop','SHORT Target','Outcome'])row[k]=ctx.plots[k].data.at(-1).value;trace.push(row);
 }
 assert.equal(trace.find(t=>t.SHORT===1).minute,'16:08');assert.equal(trace.find(t=>t.Outcome===1).minute,'16:12');assert.ok(!trace.some(t=>t.Outcome===-1));
 const entry=trace.find(t=>t.SHORT===1);assert.ok(Math.abs(entry['SHORT Entry']-103.75375)<1e-8);assert.ok(Math.abs(entry['SHORT Stop']-103.9775)<1e-8);assert.ok(Math.abs(entry['SHORT Target']-103.66)<1e-8);
 writeFileSync(new URL('./minute-replay.json',import.meta.url),JSON.stringify({sourceSha256:sha256(source),method:'Actual Pine; chronological M1 close quotes with accumulated M5 OHLC. Not tick-complete. Distinct from closed-M5 backtest.',trace},null,2)+'\n');
});
