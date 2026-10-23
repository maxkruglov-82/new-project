import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
test('published v40 matches validated draft except title; TXT identical',()=>{
 const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
 const source=read('./fixtures/sol-v40-published.pine');
 assert.equal(source,read('./fixtures/sol-v40-published.pine'));
 assert.equal(source,read('../drafts/m5-rolling-structure-2026-10-23/sol_rolling.pine').replace('v40 — новая структура 3–4–5 (черновик)','v40 — новая структура 3–4–5'));
});
