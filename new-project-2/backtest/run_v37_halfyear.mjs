// Reproduce actual published v37 without overwriting the original candidate ledger.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {execute,sha256} from './run_v37_observed.mjs';
const root=new URL('../',import.meta.url),folder=new URL('reports/v37-prior-close-2026-10-23/',root);
const read=(name,dir=folder)=>readFileSync(new URL(name,dir),'utf8');
const source=read('tests/fixtures/sol-v37-published.pine',root),change=JSON.parse(read('change.json'));assert.equal(sha256(source),change.sourceSha256);
const input=read('../v36-p1-close-2026-10-23/halfyear-candles.json'),raw=JSON.parse(input),expected=JSON.parse(read('halfyear-v37.json'));assert.equal(sha256(input),expected.inputSha256);
mock.timers.enable({apis:['Date'],now:Date.parse(raw.endExclusive)+1000});
const report=await execute(source,raw,Date.parse(raw.start),Date.parse(raw.endExclusive));
for(const key of ['summary','trades','days','p1Audit'])assert.deepEqual(report[key],expected[key]);
writeFileSync(new URL('reproduced-v37.json',folder),JSON.stringify({sourceSha256:sha256(source),inputSha256:sha256(input),...report},null,2)+'\n');console.log(JSON.stringify({status:'PASS',...report.summary},null,2));
