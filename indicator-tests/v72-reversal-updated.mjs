import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const base=new URL('../',import.meta.url);
const start=Date.parse('2026-10-23T14:00:00+07:00'),step=300000;
mock.timers.enable({apis:['Date'],now:start+86400000});
const c=(i,o,h,l,z)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open:o,high:h,low:l,close:z,volume:100});
const hour=Array.from({length:12},(_,i)=>c(i,105,110,100,105));
const bars=[...hour,c(12,101,102,98,99),c(13,99,101,98.5,99.5),c(14,99.5,102,99,101)];
async function run(version,data){
 const source=readFileSync(new URL('KRYTES_v72_REVERSAL_UPDATED.txt',base),'utf8')+'\nplot(point1,"Test P1",display=display.none)\nplot(point2,"Test P2",display=display.none)\nplot(positionLeft,"Test Left",display=display.none)\nplot(continuationLongFirst,"Test Main 1L",display=display.none)\n';
 const last=data.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};
 mock.timers.setTime(guard.openTime+1000);
 return new PineTS([...data,guard],'SOLUSDT','5').run(source);
}
const at=(ctx,n,i)=>ctx.plots[n].data[i].value;

const data=[...bars.slice(0,14),c(14,99.5,102,99,101),c(15,101,104,100,103),c(16,103,103.5,100.5,102),c(17,102,103.7,101,103),c(18,103,105,101.5,104),c(19,104,104.5,100,102),c(20,102,103,97,98.2),c(21,98.2,102,97.5,101),c(22,101,104,100,103),c(23,103,103,99,101)];

for(const mirrored of [false,true]){
 const transform=xs=>mirrored?xs.map(b=>({...b,open:210-b.open,high:210-b.low,low:210-b.high,close:210-b.close})):xs;
 const fixed=await run(72,transform(data));
 const price=x=>mirrored?210-x:x;
 assert.equal(at(fixed,'Test P2',16),price(104));
 assert.equal(at(fixed,'Test P2',19),price(105),'P2 updates before the new extreme');
 assert.equal(at(fixed,'Stage',21),3,'new P1 waits for another pullback');
 assert.equal(at(fixed,'Test P1',21),price(97),'wick becomes new P1');
 assert.ok(Number.isNaN(at(fixed,'Test P2',21)),'old P2 cleared');
 assert.ok(Number.isNaN(at(fixed,'Test P2',22)),'no premature P2');
 assert.ok(Number.isNaN(at(fixed,'Test P2',23)),'P2 only two bars after P1 is rejected');
 const later=[...data.slice(0,22),c(22,101,103,100,102),c(23,102,104,100.5,103),c(24,103,103.5,101,102)];
 assert.equal(at(await run(72,transform(later)),'Test P2',24),price(104),'third bar after P1 may form P2');
 const twoCloses=[...data.slice(0,20),c(20,99,103,97,97.5),c(21,97.5,102,97.2,97.8)];
 const confirmed=await run(72,transform(twoCloses));
 assert.equal(at(confirmed,'Stage',21),5,'two closes confirm P3 rather than reset P1');
 assert.equal(at(confirmed,'Test P1',21),price(98));
 assert.equal(at(confirmed,'Test P2',21),price(105));
 console.log(`PASS ${mirrored?'LONG':'SHORT'}: update P2, reset after wick, new pullback, confirmed P3`);
}
const longBars=[...data.slice(0,22),c(22,101,106,100,105.5),c(23,105.5,107,101,106),c(24,106,106.5,101.8,103)];
const longCtx=await run(72,longBars);

assert.equal(at(longCtx,'Direction',22),-1,'one close above old P2 insufficient');
assert.equal(at(longCtx,'Direction',23),1,'two closes above old P2 confirm LONG');
assert.equal(at(longCtx,'Stage',23),5);
assert.equal(at(longCtx,'Test P1',23),105,'use saved P2, not fresh pullback');
assert.equal(at(longCtx,'Test P2',23),97,'stop anchor uses swept minimum');
assert.equal(at(longCtx,'LONG',23),0,'no entry on breakout confirmation');
assert.equal(at(longCtx,'LONG',24),1,'entry on later pullback');
const shortBars=[...data.slice(0,22),c(22,98,101,97.1,97.7),c(23,97.7,100,97.2,97.8)];
const shortCtx=await run(72,shortBars);
assert.equal(at(shortCtx,'Stage',23),3,'closes below an obsolete P1 cannot confirm SHORT after a newer low');
assert.equal(at(shortCtx,'Direction',23),-1);
assert.equal(at(shortCtx,'Test P1',23),97,'latest low remains the active structural extreme');
assert.ok(Number.isNaN(at(shortCtx,'Test P2',23)),'obsolete pullback cannot restore a premature SHORT');
const latestShortBars=[...data.slice(0,22),c(22,101,103,96.9,96.99),c(23,96.99,102,96.8,96.98)];
const latestShort=await run(72,latestShortBars);
assert.equal(at(latestShort,'Stage',23),5,'pair below latest swept low confirms SHORT');
assert.equal(at(latestShort,'Test P1',23),97,'confirmation uses latest P1, not obsolete 98');
assert.equal(at(latestShort,'Test P2',23),105,'last structural high survives the low update');
assert.equal(at(latestShort,'SHORT',23),0,'confirmation itself cannot execute a retest');

const noSweep=[...data.slice(0,20),c(20,102,106,99,105.5),c(21,105.5,107,100,106)];
assert.equal(at(await run(72,noSweep),'Direction',21),-1,'no lower P1: no special LONG');
const interrupted=[...data.slice(0,22),c(22,101,106,100,105.5),c(23,105.5,107,101,104.9)];
assert.equal(at(await run(72,interrupted),'Direction',23),-1,'interrupted closes: no LONG');
console.log('PASS saved reversal level, required sweep, delayed SHORT, two closes and later LONG pullback');

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
near(at(longCtx,'LONG Stop',24),96.97);
near(at(longCtx,'LONG Target',24),107);
near(at(longCtx,'LONG Entry',24),(96.97+107)/2);
near((at(longCtx,'LONG Target',24)-at(longCtx,'LONG Entry',24))/(at(longCtx,'LONG Entry',24)-at(longCtx,'LONG Stop',24)),1);
assert.equal(at(longCtx,'Test Left',23),data[20].openTime,'position starts at new P1 wick');
console.log('PASS stop beyond new P1, target P3, exact RR1, position anchored to new P1');
const initialLong=[...data.slice(0,20),c(20,104,106,101,105.5),c(21,105.5,107,102,106)].map(b=>({...b,open:210-b.open,high:210-b.low,low:210-b.high,close:210-b.close}));
const longToShort=await run(72,initialLong);
assert.equal(at(longToShort,'Direction',20),1,'first close below 2L does not reverse');
assert.equal(at(longToShort,'Direction',21),1,'first LONG priority cannot reverse inside H1');
assert.equal(at(longToShort,'Stage',21),4,'continue tracking the LONG pullback');
assert.equal(at(longToShort,'SHORT',21),0,'no immediate SHORT at confirmation');
console.log('PASS initial LONG pullback inside H1 does not create a SHORT');
// Основная 1L сохраняется через неподтверждённый внутренний SHORT.
const continuationBars=[...initialLong,c(22,104,106,102,104),c(23,104,107,103,106),c(24,109,114,108,113),c(25,113,115,109,114),c(26,114,114.5,108,110)];
const continuation=await run(72,continuationBars);
assert.equal(at(continuation,'Direction',24),1,'initial LONG priority is retained');
assert.equal(at(continuation,'LONG',24),0,'one close above initial 1L does not enter');
assert.equal(at(continuation,'Direction',25),1,'two closes above initial 1L confirm continuation');
assert.equal(at(continuation,'Test P1',25),112,'initial 1L is preserved');
assert.equal(at(continuation,'Test P2',25),102,'2L uses entire pullback low, including internal movements');
assert.equal(at(continuation,'LONG',25),0,'no entry at confirmation');
assert.equal(at(continuation,'LONG',26),1,'LONG entry on later retest');
near(at(continuation,'LONG Stop',26),101.97);
near(at(continuation,'LONG Target',26),115);
near(at(continuation,'LONG Entry',26),(101.97+115)/2);
console.log('PASS original 1L, full pullback minimum as 2L, two closes and later LONG RR1 retest');

const cancelledContext=await run(72,[...initialLong,c(22,104,106,99,99.5),c(23,99.5,101,99.2,99.7)]);
assert.ok(Number.isNaN(at(cancelledContext,'Test Main 1L',23)),'two closes below H1 cancel original LONG context');
console.log('PASS confirmed break below H1 cancels the continuation context');
// Ложный выход за 2Sh, повторное обновление 1Sh и настоящий разворот.
const repeatedSweep=[...data.slice(0,22),c(22,101,106,100,105.5),c(23,105.5,105.8,101,104),c(24,104,104.5,96,97.2),c(25,97.2,103,96.5,101),c(26,101,106,100,105.5),c(27,105.5,107,102,106),c(28,106,106.5,101,103)];
const repeated=await run(72,repeatedSweep);
assert.equal(at(repeated,'Direction',23),-1,'false breakout cannot reverse direction');
assert.ok(Number.isNaN(at(repeated,'Test P2',23)),'false breakout high is not a new 2Sh');
assert.equal(at(repeated,'Test P1',25),96,'another wick updates the latest 1Sh');
assert.equal(at(repeated,'Direction',26),-1,'one close after repeated sweep is insufficient');
assert.equal(at(repeated,'Direction',27),1,'two closes above saved 2Sh confirm reversal');
assert.equal(at(repeated,'Test P1',27),105,'original marked 2Sh remains the confirmation level');
assert.equal(at(repeated,'Test P2',27),96,'stop anchor follows the latest swept minimum');
assert.equal(at(repeated,'LONG',27),0,'wait for a retest');
assert.equal(at(repeated,'LONG',28),1,'later retest produces LONG');
near(at(repeated,'LONG Stop',28),95.97);
near(at(repeated,'LONG Target',28),107);
near(at(repeated,'LONG Entry',28),(95.97+107)/2);
console.log('PASS false 2Sh rejected, repeated 1Sh sweep, saved 2Sh breakout, later LONG RR1 retest');
async function entryAtCutoff(hour,minute){
 const atTime=Date.parse(`2026-10-23T${hour}:${minute}:00+07:00`);
 const xs=longBars.slice(0,24);
 for(let i=24;start+i*step<atTime;i++)xs.push(c(i,104,105,103,104));
 xs.push(c((atTime-start)/step,104,106,101.8,103));
 const ctx=await run(72,xs);
 return xs.reduce((n,_,i)=>n+(at(ctx,'LONG',i)?1:0)+(at(ctx,'SHORT',i)?1:0),0);
}
assert.equal(await entryAtCutoff('21','55'),1,'21:55 entry allowed');
assert.equal(await entryAtCutoff('22','00'),0,'22:00 new entries forbidden');
assert.equal(await entryAtCutoff('22','05'),0,'22:05 new entries forbidden');
console.log('PASS entry cutoff: 21:55 allowed, 22:00 and 22:05 forbidden');
const managed=longBars.slice(0,24);
for(let i=24;i<95;i++)managed.push(c(i,104,105,103,104));
managed.push(c(95,104,106,101.8,103),c(96,103,108,102,107.5));
const managedCtx=await run(72,managed);
assert.equal(at(managedCtx,'LONG',95),1);
assert.equal(at(managedCtx,'Outcome',96),1,'existing trade still reaches target after 22:00');
console.log('PASS open position remains managed after the entry cutoff');
