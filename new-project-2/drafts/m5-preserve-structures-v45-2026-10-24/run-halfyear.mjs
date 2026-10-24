import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {execute,sha256} from './observed.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const source=read('./sol_preserve.pine'),input=read('../../reports/v36-p1-close-2026-10-23/halfyear-candles.json'),raw=JSON.parse(input);
assert.equal(source,read('./sol_preserve.txt'));assert.equal(sha256(input),'d577f10284f1aa9e64cbe97111b98948fe10990757a789657bddae5c39111681');
mock.timers.enable({apis:['Date'],now:Date.parse(raw.endExclusive)+1000});
console.log('Executing v45 exact Pine on 52536 M5; Apr23-Oct22 UTC+7');
const report=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
for(const day of report.days){const ts=report.trades.filter(t=>t.referenceDate===day.date);assert.ok(ts.length<=2);for(const t of ts)assert.ok(t.entryBarStart.slice(11,16)<'24:00');if(ts.length===2){assert.equal(ts[0].status,'stop');assert.notEqual(ts[0].side,ts[1].side);assert.ok(ts[1].entryBarStart>=ts[0].exitBarEnd);}}
const stats=ts=>{const wins=ts.filter(t=>t.status==='target').length,stops=ts.filter(t=>t.status==='stop').length;return {entries:ts.length,wins,stops,closed:wins+stops,winRate:wins+stops?100*wins/(wins+stops):null,unresolved:ts.filter(t=>t.status.startsWith('unresolved')).length,ambiguous:ts.filter(t=>t.status==='ambiguous').length,netR:ts.reduce((s,t)=>s+(t.r??0),0)};};
const months=[...new Set(report.days.map(d=>d.date.slice(0,7)))];const monthly=months.map(month=>({month,...stats(report.trades.filter(t=>t.referenceDate.startsWith(month)))}));
const result={version:'v45 draft',sourceSha256:sha256(source),inputSha256:sha256(input),period:{start:raw.start,endExclusive:raw.endExclusive,timezone:'Asia/Krasnoyarsk'},method:'Exact Pine, M5 OHLC, no same-entry-bar exits, ambiguous/unresolved excluded, costs excluded, no later entries than23:59',performance:stats(report.trades),monthly,...report};
writeFileSync(new URL('./result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({performance:result.performance,monthly},null,2));
