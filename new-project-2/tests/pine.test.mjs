import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import {execute,sha256} from '../backtest/run.mjs';
const dir=new URL('../reports/v35-early-close-2026-10-23/',import.meta.url),read=n=>readFileSync(new URL(n,dir),'utf8');
const source=readFileSync(new URL('../sol_short_setup.pine',import.meta.url),'utf8'),change=JSON.parse(read('change.json'));
const module=await import(process.env.PINETS_MODULE||'pinets'),PineTS=module.PineTS||module.default;
const start=Date.parse('2026-10-19T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start});
const c=(i,open,high,low,close)=>({openTime:start+i*step,closeTime:start+(i+1)*step,open,high,low,close,volume:100});
const hour=()=>Array.from({length:12},(_,i)=>c(i,104,106,101,103));
const mirror=data=>data.map(b=>({...b,open:207-b.open,high:207-b.low,low:207-b.high,close:207-b.close}));
const bars=(i,high,low,close)=>[...hour(),...(i===13?[c(12,103,105,102,103)]:[]),c(i,103,high,low,close),c(i+1,103,105,102,103)];
const values=(ctx,k)=>ctx.plots[k].data.slice(0,-1).map(x=>x.value);
async function run(data){const last=data.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};mock.timers.setTime(guard.openTime+1000);return new PineTS([...data,guard],'SOLUSDT','5').run(source);}
test('v35 и TXT идентичны; изменение относительно точной v34 — только блок раннего закрытия',()=>{
 const base=readFileSync(new URL('./fixtures/sol-v34.pine',import.meta.url),'utf8');
 assert.equal(sha256(base),change.baseSha256);assert.equal(sha256(source),change.sourceSha256);assert.equal(source,readFileSync(new URL('../sol_short_setup.txt',import.meta.url),'utf8'));
 assert.equal(source,base.replace(change.oldBlock,change.newBlock).replace('1:1 v34','1:1 v35'));
});
for(const side of ['SHORT','LONG'])for(const i of [12,13]){
 const transform=side==='SHORT'?x=>x:mirror,expected=side==='SHORT'?-1:1;
 test(`${side},${i===12?'15:00':'15:05'}: закрытие за границей учитывает свечу и подтверждает P1 только справа`,async()=>{
  const ctx=await run(transform(bars(i,105,100.98,100.99)));assert.equal(values(ctx,'Direction')[i],expected);assert.equal(values(ctx,'Stage')[i],2);assert.equal(values(ctx,'Stage')[i+1],3);
  assert.equal(values(ctx,'SHORT').filter(Boolean).length+values(ctx,'LONG').filter(Boolean).length,0);
 });
 for(const [label,low,close]of [['тень с закрытием внутри',100.9,102],['закрытие ровно на границе',100.9,101],['прокол меньше0.02',100.99,100.995]])test(`${side},${i===12?'15:00':'15:05'}: ${label} не задаёт приоритет`,async()=>{
  const ctx=await run(transform(bars(i,105,low,close)));assert.equal(values(ctx,'Direction')[i],0);assert.equal(values(ctx,'Stage')[i],1);
 });
 test(`${side},${i===12?'15:00':'15:05'}: на живой M5 ждём фактического закрытия`,async()=>{
  const raw=bars(i,105,100.98,100.99).slice(0,-1),data=transform(raw);let tail={...data.at(-1)};
  mock.timers.setTime(tail.openTime+1000);
  const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.map(b=>({...b})),getSymbolInfo:async()=>null};
  const engine=new PineTS(provider,'SOLUSDT','5'),ctx=await engine.run(source);
  assert.equal(ctx.plots.Direction.data.at(-1).value,0);assert.equal(ctx.plots.Stage.data.at(-1).value,1);
  await engine.updateTail(ctx);assert.equal(ctx.plots.Direction.data.at(-1).value,0);
  mock.timers.setTime(tail.closeTime+1);await engine.updateTail(ctx);
  assert.equal(ctx.plots.Direction.data.at(-1).value,expected);assert.equal(ctx.plots.Stage.data.at(-1).value,2);assert.equal(ctx.alerts.length,0);
 });
 test(`${side},${i===12?'15:00':'15:05'}: ранняя M5 с обеими тенями использует сторону закрытия`,async()=>{
  const ctx=await run(transform(bars(i,107,100.98,100.99)));assert.equal(values(ctx,'Direction')[i],expected);assert.equal(values(ctx,'Stage')[i],2);
 });
}
test('после15:10 обычный пробой тенью работает без требования закрытия снаружи',async()=>{
 const ctx=await run([...hour(),c(12,103,105,102,103),c(13,103,105,102,103),c(14,103,105,100.98,103)]);
 assert.equal(values(ctx,'Direction')[14],-1);assert.equal(values(ctx,'Stage')[14],2);
});
test('19 октября: исключение по15:05 возвращает SHORT, вход16:15, тейк17:00',async()=>{
 const raw=JSON.parse(read('mexc-oct19.json'));mock.timers.setTime(Date.parse(raw.endExclusive)+1000);
 const result=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
 const expected=JSON.parse(read('oct19-result.json'));assert.equal(expected.sourceSha256,sha256(source));assert.deepEqual(result.summary,expected.summary);assert.deepEqual(result.trades,expected.trades);assert.deepEqual(result.days,expected.days);
 assert.equal(result.trades.length,1);const t=result.trades[0];assert.equal(t.side,'SHORT');assert.equal(t.status,'target');assert.equal(t.entryBarStart,'2026-10-19T16:15:00.000+07:00');assert.equal(t.exitBarStart,'2026-10-19T17:00:00.000+07:00');
 assert.ok(Math.abs(t.entry-105.73625)<1e-9);assert.ok(Math.abs(t.stop-106.1025)<1e-9);assert.ok(Math.abs(t.target-105.43)<1e-9);
});
