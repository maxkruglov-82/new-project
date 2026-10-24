import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {sha256} from '../backtest/run_v40_observed.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
test('published v41 matches full-year validated draft except title; TXT identical',()=>{
 const source=read('./fixtures/sol-v41-published.pine'),draft=read('../drafts/m5-one-trade-v41-2026-10-24/sol_one_trade.pine');
 const meta=JSON.parse(read('../publication-v41.json')),z=JSON.parse(read('../drafts/m5-one-trade-v41-2026-10-24/result.json'));
 assert.equal(source,read('./fixtures/sol-v41-published.pine'));assert.equal(source,draft.replace('v41 — одна сделка в день (черновик)','v41 — одна сделка в день'));
 assert.equal(sha256(source),meta.sourceSha256);assert.equal(sha256(draft),z.sourceSha256);
});
test('v41 complete year has one entry per weekday; matches every first v40 trade; size follows actual outcomes',()=>{
 const z=JSON.parse(read('../drafts/m5-one-trade-v41-2026-10-24/result.json'));
 const baseline=JSON.parse(read('../reports/v40-ytd-2026-10-24/result.json'));
 const first=new Map();for(const t of baseline.trades)if(!first.has(t.referenceDate))first.set(t.referenceDate,t);
 const normal=ts=>ts.map(({id,volumeMultiplier,...t})=>t);
 assert.deepEqual(normal(z.trades),normal([...first.values()]));
 assert.equal(new Set(z.trades.map(t=>t.referenceDate)).size,z.trades.length);
 let size=1;for(const t of z.trades){assert.equal(t.volumeMultiplier,size);assert.ok(![0,6].includes(new Date(t.referenceDate+'T12:00:00Z').getUTCDay()));if(t.status==='stop')size*=2;else if(t.status==='target')size=1;}
 for(const m of z.monthly)assert.ok(m.entries<=m.weekdays);
 assert.equal(z.performance.wins,107);assert.equal(z.performance.losses,57);assert.equal(z.performance.unresolved,2);
});
