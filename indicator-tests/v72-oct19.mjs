import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
import {observe} from '../new-project-2/backtest/run.mjs';
const start=Date.parse('2026-10-19T14:00:00+07:00'),end=start+86400000;
const raw=JSON.parse(readFileSync(new URL('../new-project-2/drafts/bag-ab-2026-10-23/candles-six-months.json',import.meta.url))).candles;
const data=raw.filter(b=>b.time*1000>=start&&b.time*1000<end).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+299999,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
assert.equal(data.length,288);
const source=readFileSync(new URL('../KRYTES_v72_REVERSAL_UPDATED.txt',import.meta.url),'utf8');
assert.ok(source.includes('bool retry = stage == 6 and outcome == -1 and dailyEntries == 1'),'second entry only after first stop');
assert.ok(source.includes('bool allowSecondAfterTP = false'),'no second entry after target');
mock.timers.enable({apis:['Date'],now:end+1000});
const last=data.at(-1),guard={...last,openTime:end,closeTime:end+299999};
const ctx=await new PineTS([...data,guard],'SOLUSDT','5').run(observe(source)+'\nplot(point1, "Test P1", display=display.none)\nplot(interruptedShortConfirmed, "Test Interrupted", display=display.none)\n');
const v=(n,i)=>ctx.plots[n].data[i].value;
const entries=[],outcomes=[];
for(let i=0;i<data.length;i++){
 const time=new Date(data[i].openTime+7*3600000).toISOString().slice(0,16);
 if(v('SHORT',i)||v('LONG',i))entries.push({side:v('SHORT',i)?'SHORT':'LONG',time,entry:v(v('SHORT',i)?'SHORT Entry':'LONG Entry',i),stop:v(v('SHORT',i)?'SHORT Stop':'LONG Stop',i),target:v(v('SHORT',i)?'SHORT Target':'LONG Target',i)});
 const result=v('BT Result',i);if(Number.isFinite(result))outcomes.push({time,result});
}
console.log(JSON.stringify({entries,outcomes},null,2));


const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const idx=t=>data.findIndex(b=>new Date(b.openTime+7*3600000).toISOString().slice(11,16)===t);
assert.equal(entries.length,1,'19 October has exactly one actual entry');
assert.equal(entries[0].side,'SHORT','no preceding LONG');
assert.equal(entries[0].time,'2026-10-19T19:10');
near(entries[0].entry,105.135);near(entries[0].stop,105.95);near(entries[0].target,104.32);
near((entries[0].entry-entries[0].target)/(entries[0].stop-entries[0].entry),1);
assert.deepEqual(outcomes,[{time:'2026-10-19T20:50',result:1}]);
near(v('Test P1',idx('17:05')),105.29);
assert.equal(v('Stage',idx('17:15')),3,'one close below the updated low does not confirm');
assert.equal(v('Stage',idx('17:20')),5,'second close confirms updated low with retained 2Sh');
near(v('Setup Break Level',idx('17:20')),105.29);
near(v('Fibo One',idx('17:20')),105.92);
near(data[idx('17:15')].close,105.25);near(data[idx('17:20')].close,105.14);
assert.equal(v('Daily Entries',idx('18:00')),0,'early pullback never reached the entry');
assert.equal(v('Daily Entries',idx('22:00')),1,'no second entry after target');
console.log('PASS October 19: retain 2Sh, confirm latest 1Sh, wait for RR1 retest, exactly one SHORT and target');
