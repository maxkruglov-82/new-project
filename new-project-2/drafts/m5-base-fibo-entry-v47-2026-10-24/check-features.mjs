import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';import {mock} from 'node:test';
import {sha256} from './observed.mjs';
const {PineTS}=await import(process.env.PINETS_MODULE);
const source=readFileSync(new URL('./sol_base_fibo.pine',import.meta.url),'utf8');
const start=Date.parse('2026-10-19T14:00:00+07:00'),step=300000;
const c=(i,open,high,low,close)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open,high,low,close,volume:100});
const initial=[...Array.from({length:12},(_,i)=>c(i,104,106,101,103)),c(12,103,105,102,103),c(13,103,105,102,103),c(14,103,103.5,100,100.4),c(15,102,103,100.6,102),c(16,102,104,101,103),c(17,103,103.5,100.6,102),c(18,102,102,99,99.5),c(19,100,102.125,99.5,102.125)];
mock.timers.enable({apis:['Date'],now:start+86400000});
async function run(data,mirror=false){mock.timers.setTime(data.at(-1).closeTime+1000);data=data.map(b=>mirror?{...b,open:220-b.open,high:220-b.low,low:220-b.high,close:220-b.close}:b);const last=data.at(-1);const ctx=await new PineTS([...data,{...last,openTime:last.openTime+step,closeTime:last.closeTime+step}],'SOLUSDT','5').run(source);return {v:(n,i)=>ctx.plots[n].data[i].value,ctx};}
const controls=[];
for(const mirror of [false,true])for(const opposite of [false,true]){
 const data=[...initial,c(20,102,102.2,98.8,99),c(21,99.5,101,99.2,100),c(22,100,103,100,102),c(23,102,102.5,100,101),...(opposite?[c(24,102,105,101,104),c(25,104,104.5,100.8,101.125),c(26,101,106,101,105.5)]:[c(24,101,101,98,98.5),c(25,99,101.125,98.5,101.125),c(26,101,101.2,97.8,98)]),c(27,101,103,98,101)];
 const {v}=await run(data,mirror),first=mirror?'LONG':'SHORT',second=opposite?(mirror?'SHORT':'LONG'):first;
 assert.equal(v(first,19),1);assert.equal(v('Outcome',20),1);assert.equal(v(second,25),1);assert.equal(v('Daily Entries',25),2);assert.equal(v('Position Multiplier',25),1);
 for(let i=26;i<data.length;i++){assert.equal(v('SHORT',i),0);assert.equal(v('LONG',i),0);}
 controls.push({kind:'second-after-TP',mirror,opposite,first,second,entry:v(second+' Entry',25)});
}
// Opposite structure may form while first position is still open.
const held=[...initial,c(20,102,103,99.5,102),c(21,102,102.5,99.6,101),c(22,102,104.5,100,104),c(23,104,104,100,102),c(24,102,103,98.9,101),c(25,101,102,100,101)];
for(const mirror of [false,true]){const {v}=await run(held,mirror),first=mirror?'LONG':'SHORT',second=mirror?'SHORT':'LONG';assert.equal(v('Outcome',24),1);for(let i=20;i<24;i++){assert.equal(v('Stage',i),6);assert.equal(v(first+' Stop',i),v(first+' Stop',19));assert.equal(v(first+' Target',i),v(first+' Target',19));assert.equal(v(second,i),0);}assert.equal(v(second,24),0);assert.equal(v(second,25),1);controls.push({kind:'pre-existing-points-after-TP',mirror});}
// First adjacent low/high pair is neutral, can enable only opposite setup.
const adjacent=[...initial.slice(0,14),c(14,102,103,100,100.4),c(15,101,104,100.5,103),c(16,103,103.5,99,99.5),c(17,100,105,99.5,104.5),c(18,103,104.5,100,101),c(19,101,106,100.5,105)];
for(const mirror of [false,true]){const {v}=await run(adjacent,mirror),blocked=mirror?'LONG':'SHORT',allowed=mirror?'SHORT':'LONG',flag=mirror?'Initial Long Pair Used':'Initial Short Pair Used';assert.equal(v(flag,16),1);assert.equal(v(blocked,16),0);assert.equal(v(allowed,17),0);assert.equal(v(allowed,18),1);for(let i=16;i<adjacent.length;i++)assert.equal(v(flag,i),1);controls.push({kind:'first-adjacent-pair-reversal',mirror});}
// Consumed first-pair flags stay set through rebreaks and reset only at next daily H1.
const twoDays=[...adjacent,...Array.from({length:288-adjacent.length},(_,j)=>c(j+adjacent.length,103,105,102,103)),...adjacent.map(b=>({...b,openTime:b.openTime+86400000,closeTime:b.closeTime+86400000}))];
for(const mirror of [false,true]){const {v}=await run(twoDays,mirror),flag=mirror?'Initial Long Pair Used':'Initial Short Pair Used';for(let i=16;i<288;i++)assert.equal(v(flag,i),1);assert.equal(v(flag,288+13),0);assert.equal(v(flag,288+16),1);controls.push({kind:'once-per-side-reset-only-at-next-H1',mirror});}
// After TP, a wick sweep moves P1; a close beyond only the old level cannot seed P3.
const swept=[...initial,c(20,102,102.2,98.8,99),c(21,99.5,101,99.2,100),c(22,100,103,100,102),c(23,102,102.5,100,101),c(24,101,101,98,99),c(25,99,101,98.2,98.5),c(26,99,100,97.5,97.8)];
for(const mirror of [false,true]){const {v}=await run(swept,mirror);assert.equal(v('TP Shadow Stage',25),4);assert.equal(v('TP Shadow Stage',26),5);controls.push({kind:'after-TP-sweep-needs-close-beyond-fresh-extreme',mirror});}
// A separate P2 replaces a rejected adjacent pair; its neutral level must not linger.
const separate=[...adjacent.slice(0,17),c(17,100,103,99.5,101),c(18,101,104.8,100,103),c(19,103,104,100.2,103.5),c(20,103.5,104.4,101,104.2)];
for(const mirror of [false,true]){const {v}=await run(separate,mirror);assert.equal(v('Direction',20),mirror?1:-1);assert.equal(v('Stage',20),4);assert.ok(Math.abs(v('Fibo One',20)-(mirror?115.2:104.8))<1e-8);controls.push({kind:'standalone-P2-retires-old-neutral-level',mirror});}
writeFileSync(new URL('./features.json',import.meta.url),JSON.stringify({status:'PASS',sourceSha256:sha256(source),controls},null,2)+'\n');console.log(JSON.stringify({status:'PASS',controls},null,2));
