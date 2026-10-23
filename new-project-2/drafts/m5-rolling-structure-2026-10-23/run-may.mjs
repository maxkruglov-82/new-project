import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {execute as baseExecute,sha256} from '../../backtest/run_v38_observed.mjs';
import {execute as rollingExecute} from '../../backtest/run_v40_observed.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const write=(name,z)=>writeFileSync(new URL(name,import.meta.url),JSON.stringify(z,null,2)+'\n');
const source=read('./sol_rolling.pine'),base=read('./base-v39.pine'),meta=JSON.parse(read('./change.json'));
assert.equal(source,read('./sol_rolling.txt'));assert.equal(sha256(source),meta.sourceSha256);assert.equal(sha256(base),meta.baseSourceSha256);
const whole=JSON.parse(read('../../reports/mexc-sol-usdt-m5-2026-01-01_2026-10-23.json'));
const start='2026-05-01T14:00:00+07:00',endExclusive='2026-06-01T00:00:00+07:00';
const raw={...whole,start,endExclusive,candles:whole.candles.filter(b=>b.time*1000>=Date.parse(start)&&b.time*1000<Date.parse(endExclusive))};raw.count=raw.candles.length;
assert.equal(raw.count,8760);write('./may-candles.json',raw);
const inputSha256=sha256(read('./may-candles.json'));
mock.timers.enable({apis:['Date'],now:Date.parse(endExclusive)+1000});
console.log('Exact v39 vs v40 Pine on '+raw.count+' continuous MEXC M5 candles,1–31May.');
const before=await baseExecute(base,raw,Date.parse(start),Date.parse(endExclusive));
const cached=JSON.parse(read('../m5-equal-p3-2026-10-23/halfyear-v39.json'));
assert.equal(cached.sourceSha256,sha256(base));
const normalize=rows=>rows.map(({id,...other})=>other);
assert.deepEqual(normalize(before.trades),normalize(cached.trades.filter(t=>t.referenceDate.startsWith('2026-05'))));
console.log('v39 baseline reproduces prior halfyear May ledger exactly.');
const after=await rollingExecute(source,raw,Date.parse(start),Date.parse(endExclusive));
function stats(trades){
 const wins=trades.filter(t=>t.status==='target').length,stops=trades.filter(t=>t.status==='stop').length;
 let equity=0,peak=0,maxDrawdownR=0;for(const t of trades){equity+=t.r??0;peak=Math.max(peak,equity);maxDrawdownR=Math.max(maxDrawdownR,peak-equity);}
 const grossWins=trades.reduce((s,t)=>s+(t.status==='target'?t.r:0),0);
 return{entries:trades.length,closed:wins+stops,wins,stops,winRate:wins+stops?100*wins/(wins+stops):null,netR:equity,maxDrawdownR,profitFactor:stops?grossWins/stops:null,unresolved:trades.filter(t=>t.status.startsWith('unresolved')).length,ambiguous:trades.filter(t=>t.status==='ambiguous').length};
}
const changedDays=before.days.map(d=>d.date).filter(date=>JSON.stringify(normalize(before.trades.filter(t=>t.referenceDate===date)))!==JSON.stringify(normalize(after.trades.filter(t=>t.referenceDate===date)))).map(date=>({date,v39:before.trades.filter(t=>t.referenceDate===date),v40:after.trades.filter(t=>t.referenceDate===date)}));
const result={period:{start,endExclusive,timezone:'Asia/Krasnoyarsk'},inputSha256,baseSourceSha256:sha256(base),sourceSha256:sha256(source),baselineReproduction:'PASS: all May v39 trades equal prior halfyear ledger',method:'Exact Pine; M5 OHLC; no minute overrides; costs excluded',v39:stats(before.trades),v40:stats(after.trades),changedDays,before,after};
write('./may-comparison.json',result);
const csv=rows=>{const keys=Object.keys(rows[0]||{}),escape=x=>x==null?'':/[",\n]/.test(String(x))?'"'+String(x).replaceAll('"','""')+'"':String(x);return '\uFEFF'+[keys.join(','),...rows.map(r=>keys.map(k=>escape(r[k])).join(','))].join('\n')+'\n';};
for(const [name,rows]of [['may-v39-trades',before.trades],['may-v40-trades',after.trades],['may-v40-rolls',after.rollAudit]])writeFileSync(new URL(name+'.csv',import.meta.url),csv(rows));
console.log(JSON.stringify({v39:result.v39,v40:result.v40,changedDays:changedDays.map(d=>d.date),rolls:after.rollAudit},null,2));
