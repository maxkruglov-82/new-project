// Reproduce the selected v36 ledger, leaving the recorded experiment intact.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {execute,sha256} from './run.mjs';
const root=new URL('../',import.meta.url),folder=new URL('reports/v36-p1-close-2026-10-23/',root);
const read=(name,dir=folder)=>readFileSync(new URL(name,dir),'utf8');
const source=read('sol_short_setup.pine',root),change=JSON.parse(read('change.json'));
assert.equal(sha256(source),change.sourceSha256,'Use the exact published v36 source');
const input=read('halfyear-candles.json'),raw=JSON.parse(input),expected=JSON.parse(read('halfyear-p1_close.json'));
assert.equal(sha256(input),expected.inputSha256);
mock.timers.enable({apis:['Date'],now:Date.parse(raw.endExclusive)+1000});
const report=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
assert.deepEqual(report.summary,expected.summary);assert.deepEqual(report.trades,expected.trades);assert.deepEqual(report.days,expected.days);
writeFileSync(new URL('reproduced-v36.json',folder),JSON.stringify({sourceSha256:sha256(source),inputSha256:sha256(input),...report},null,2)+'\n');
console.log(JSON.stringify({status:'PASS',...report.summary},null,2));
