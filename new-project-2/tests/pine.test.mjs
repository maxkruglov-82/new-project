import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import {execute,sha256} from '../backtest/run.mjs';
const source=readFileSync(new URL('../sol_short_setup.pine',import.meta.url),'utf8');
const baseline=readFileSync(new URL('./fixtures/sol-v32.pine',import.meta.url),'utf8');
const module=await import(process.env.PINETS_MODULE||'pinets');
const PineTS=module.PineTS||module.default;
const start=Date.parse('2026-10-01T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start});
const c=(i,open,high,low,close)=>({openTime:start+i*step,closeTime:start+(i+1)*step,open,high,low,close,volume:100});
const hour=()=>Array.from({length:12},(_,i)=>c(i,104,106,101,103));
const mirror=data=>data.map(b=>({...b,open:207-b.open,high:207-b.low,low:207-b.high,close:207-b.close}));
const values=(ctx,k)=>ctx.plots[k].data.slice(0,-1).map(x=>x.value);
async function run(data){const last=data.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};mock.timers.setTime(guard.openTime+1000);return new PineTS([...data,guard],'SOLUSDT','5').run(source);}
test('v34 .pine и .txt совпадают; единственное торговое изменение относительно точной v32 — gate15:10',()=>{
 assert.equal(source,readFileSync(new URL('../sol_short_setup.txt',import.meta.url),'utf8'));
 assert.equal(sha256(baseline),'d2e5c19f3a1ed72ae611eadd056268facf89c716485c12b4d4f4a9028c47f00b');
 const executable=s=>s.split('\n').filter(l=>!l.trim().startsWith('//')&&!l.startsWith('indicator(')).join('\n');
 assert.equal(executable(source),executable(baseline).replace('if stage == 1 and time >= validUntil - 86400000 + 300000','if stage == 1 and time >= validUntil - 86400000 + 600000'));
 assert.match(source,/1:1 v34/);
});
for(const side of ['SHORT','LONG'])for(const earlyDual of [false,true])test(`${side}: обе первые M5 исключены (dual=${earlyDual}); ровно0.02 с15:10 принимается`,async()=>{
 const raw=[...hour(),c(12,103,earlyDual?107:105,100.99,103),c(13,103,earlyDual?107:105,100.99,103),c(14,103,105,100.98,102),c(15,102,105,101.5,103)];
 const ctx=await run(side==='SHORT'?raw:mirror(raw));
 for(const i of [12,13]){assert.equal(values(ctx,'Stage')[i],1);assert.equal(values(ctx,'Direction')[i],0);}
 assert.equal(values(ctx,'Direction')[14],side==='SHORT'?-1:1);assert.equal(values(ctx,'Stage')[14],2);assert.equal(values(ctx,'Stage')[15],3);
 assert.equal(values(ctx,'SHORT').filter(Boolean).length+values(ctx,'LONG').filter(Boolean).length,0);
});
test('первый подходящий пробой в15:15 учитывается сразу: счётчик пропуска первого пробоя не добавлен',async()=>{
 const ctx=await run([...hour(),c(12,104,105,102,103),c(13,103,105,102,103),c(14,103,105,102,103),c(15,103,105,100.9,102)]);
 assert.equal(values(ctx,'Stage')[14],1);assert.equal(values(ctx,'Stage')[15],2);assert.equal(values(ctx,'Direction')[15],-1);
});
for(const side of ['SHORT','LONG'])for(const firstIndex of [12,13])test(`${side}: живые котировки M5 ${firstIndex===12?'15:00':'15:05'} не выбирают приоритет`,async()=>{
 const raw=[...hour(),c(12,103,105,102,103),...(firstIndex===13?[c(13,103,105,102,103)]:[])],data=side==='SHORT'?raw:mirror(raw);
 let tail={...data.at(-1)};mock.timers.setTime(tail.openTime+1000);
 const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.map(b=>({...b})),getSymbolInfo:async()=>null};
 const engine=new PineTS(provider,'SOLUSDT','5'),ctx=await engine.run(source);
 for(const p of [100,107,100.2]){const quote=side==='SHORT'?p:207-p;tail={...tail,close:quote,low:Math.min(tail.low,quote),high:Math.max(tail.high,quote)};await engine.updateTail(ctx);assert.equal(ctx.plots.Stage.data.at(-1).value,1);assert.equal(ctx.plots.Direction.data.at(-1).value,0);assert.equal(ctx.alerts.length,0);}
});
for(const side of ['SHORT','LONG'])test(`${side}: живая15:10 принимает0.02, малый прокол не выбирает приоритет`,async()=>{
 const raw=[...hour(),c(12,103,105,102,103),c(13,103,105,102,103),c(14,103,105,100.99,103)],data=side==='SHORT'?raw:mirror(raw);
 let tail={...data.at(-1)};mock.timers.setTime(tail.openTime+1000);
 const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.map(b=>({...b})),getSymbolInfo:async()=>null};
 const engine=new PineTS(provider,'SOLUSDT','5'),ctx=await engine.run(source);
 for(const [p,d]of [[100.99,0],[100.98,side==='SHORT'?-1:1]]){const quote=side==='SHORT'?p:207-p;tail={...tail,close:quote,low:Math.min(tail.low,quote),high:Math.max(tail.high,quote)};await engine.updateTail(ctx);assert.equal(ctx.plots.Direction.data.at(-1).value,d);}
});
test('текущий опубликованный Pine v34 воспроизводит весь журнал август–22 октября:49/33/16 и SHORT1 октября',async()=>{
 const dir=new URL('../reports/v34-start-1510-2026-10-23/',import.meta.url),raw=JSON.parse(readFileSync(new URL('candles.json',dir))),expected=JSON.parse(readFileSync(new URL('result.json',dir)));
 mock.timers.setTime(Date.parse(raw.endExclusive)+1000);
 const actual=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
 assert.equal(expected.sourceSha256,sha256(source));assert.equal(expected.inputSha256,sha256(readFileSync(new URL('candles.json',dir))));
 assert.deepEqual(actual.summary,expected.summary);assert.deepEqual(actual.trades,expected.trades);assert.deepEqual(actual.days,expected.days);
 assert.equal(actual.summary.enteredTrades,49);assert.equal(actual.summary.targets,33);assert.equal(actual.summary.stops,16);
 assert.ok(actual.trades.every(t=>t.entryBarStart.slice(11,16)>='15:10'));
 const oct1=actual.trades.filter(t=>t.referenceDate==='2026-10-01');assert.equal(oct1.length,1);assert.equal(oct1[0].side,'SHORT');assert.equal(oct1[0].entryBarStart,'2026-10-01T17:30:00.000+07:00');assert.equal(oct1[0].status,'target');
});
