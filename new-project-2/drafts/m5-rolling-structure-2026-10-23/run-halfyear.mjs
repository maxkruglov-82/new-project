import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {execute,sha256} from '../../backtest/run_v40_observed.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const write=(n,z)=>writeFileSync(new URL(n,import.meta.url),JSON.stringify(z,null,2)+'\n');
const source=read('./sol_rolling.pine'),base=read('./base-v39.pine'),change=JSON.parse(read('./change.json'));
assert.equal(source,read('./sol_rolling.txt'));assert.equal(base,read('../m5-equal-p3-2026-10-23/sol_equal_p3.pine'));
assert.equal(sha256(source),change.sourceSha256);assert.equal(sha256(base),change.baseSourceSha256);
const before=JSON.parse(read('../m5-equal-p3-2026-10-23/halfyear-v39.json'));
assert.equal(before.sourceSha256,sha256(base));
assert.equal(JSON.parse(read('../m5-equal-p3-2026-10-23/halfyear-audit.json')).status,'PASS');
const input=read('../../reports/v36-p1-close-2026-10-23/halfyear-candles.json'),raw=JSON.parse(input);
assert.equal(sha256(input),'d577f10284f1aa9e64cbe97111b98948fe10990757a789657bddae5c39111681');
const whole=JSON.parse(read('../../reports/mexc-sol-usdt-m5-2026-01-01_2026-10-23.json'));
assert.deepEqual(raw.candles,whole.candles.filter(b=>b.time*1000>=Date.parse(raw.start)&&b.time*1000<Date.parse(raw.endExclusive)));
assert.equal(raw.start,'2026-04-23T14:00:00+07:00');assert.equal(raw.endExclusive,'2026-10-23T00:00:00+07:00');
mock.timers.enable({apis:['Date'],now:Date.parse(raw.endExclusive)+1000});
console.log('Running exact draft v40 Pine source on '+raw.count+' continuous MEXC M5 candles.');
const after=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
function stats(trades){
 const closed=trades.filter(t=>t.status==='target'||t.status==='stop');
 let equity=0,peak=0,maxDrawdownR=0;for(const t of closed){equity+=t.r;peak=Math.max(peak,equity);maxDrawdownR=Math.max(maxDrawdownR,peak-equity);}
 const wins=closed.filter(t=>t.status==='target').length,losses=closed.length-wins;
 const positive=closed.filter(t=>t.r>0).reduce((s,t)=>s+t.r,0),negative=closed.filter(t=>t.r<0).reduce((s,t)=>s-t.r,0);
 return {entered:trades.length,closed:closed.length,wins,losses,unresolved:trades.filter(t=>t.status.startsWith('unresolved')).length,ambiguous:trades.filter(t=>t.status==='ambiguous').length,winRate:closed.length?wins/closed.length:null,netR:equity,maxDrawdownR,profitFactor:negative?positive/negative:null};
}
const months=[...new Set(before.days.map(d=>d.date.slice(0,7)))];
const monthly=months.map(month=>({month,v39:stats(before.trades.filter(t=>t.referenceDate.startsWith(month))),v40:stats(after.trades.filter(t=>t.referenceDate.startsWith(month)))}));
const canonical=t=>{const {id,...other}=t;return other;};
const changedDays=before.days.map(d=>d.date).filter(date=>JSON.stringify(before.trades.filter(t=>t.referenceDate===date).map(canonical))!==JSON.stringify(after.trades.filter(t=>t.referenceDate===date).map(canonical))).map(date=>({date,before:before.trades.filter(t=>t.referenceDate===date),after:after.trades.filter(t=>t.referenceDate===date)}));
assert.equal(after.summary.referenceDays,before.days.length);

assert.equal(monthly.reduce((s,m)=>s+m.v40.entered,0),after.summary.enteredTrades);
assert.equal(monthly.reduce((s,m)=>s+m.v40.closed,0),after.summary.totalTrades);
const comparison={excludingMay:{v39:stats(before.trades.filter(t=>!t.referenceDate.startsWith('2026-05'))),v40:stats(after.trades.filter(t=>!t.referenceDate.startsWith('2026-05')))},period:{start:raw.start,endExclusive:raw.endExclusive,candles:raw.count,timezone:'UTC+7'},inputSha256:sha256(input),baseSourceSha256:sha256(base),sourceSha256:sha256(source),baseline:'Audited v39 halfyear ledger; exact same M5 candles and source SHA validated.',v39:stats(before.trades),v40:stats(after.trades),monthly,changedDays};
const may=JSON.parse(read('./may-comparison.json'));
assert.equal(may.sourceSha256,sha256(source));
assert.deepEqual(after.trades.filter(t=>t.referenceDate.startsWith('2026-05')).map(canonical),may.after.trades.map(canonical));
write('./halfyear-v40.json',{variant:'v40_confirmed4_cancels_old_entry_then5_retest6',sourceSha256:sha256(source),inputSha256:sha256(input),start:raw.start,endExclusive:raw.endExclusive,...after,monthly:monthly.map(m=>({month:m.month,...m.v40}))});
write('./halfyear-comparison.json',comparison);
const csv=rows=>{const keys=Object.keys(rows[0]);return '\uFEFF'+[keys.join(','),...rows.map(row=>keys.map(k=>JSON.stringify(row[k]??'')).join(','))].join('\n')+'\n';};
writeFileSync(new URL('./halfyear-monthly.csv',import.meta.url),csv(monthly.map(m=>({month:m.month,...m.v40,v39Closed:m.v39.closed,v39Wins:m.v39.wins,v39Losses:m.v39.losses,v39WinRate:m.v39.winRate,v39NetR:m.v39.netR}))));
writeFileSync(new URL('./halfyear-trades.csv',import.meta.url),csv(after.trades));
console.log(JSON.stringify({v39:comparison.v39,v40:comparison.v40,monthly,changedDates:changedDays.map(d=>d.date)},null,2));
