import '../reports/v38-h1-priority-2026-10-23/check.test.mjs';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {sha256} from '../backtest/run_v37_observed.mjs';
test('published v38 is byte-equivalent to validated candidate except title; TXT matches',()=>{
 const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
 const source=read('./fixtures/sol-v38-published.pine'),candidate=read('../reports/v38-h1-priority-2026-10-23/sol_h1_priority.pine'),change=JSON.parse(read('../reports/v38-h1-priority-2026-10-23/change.json'));
 assert.equal(source,read('./fixtures/sol-v38-published.pine'));
 assert.equal(source,candidate.replace('1:1 v39 (черновик)','1:1 v38'));
 assert.equal(sha256(source),change.sourceSha256);assert.equal(sha256(candidate),change.calculatedCandidateSha256);
});
