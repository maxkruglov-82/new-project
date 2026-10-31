import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8'),start=Date.UTC(2026,9,14,12);
for(const mirror of [false,true]){
 const p=x=>mirror?250-x:x;
 const bar={open:p(116),close:p(117),high:Math.max(p(116),p(117))+.1,low:Math.min(p(116),p(117))-.1,volume:1,openTime:start,closeTime:start+299999};
 const setup=`m5Chart := true\nfirstPointWindow := true\nv12Day := rangeDayKey\nv12PlanDay := rangeDayKey\nv12Zero := ${p(110)}\nv12One := ${p(130)}\nv12OneTime := ${start-3600000}\nv12InitialSide := ${mirror?-1:1}\nv12Side := ${mirror?1:-1}\nv12SequenceSide := ${mirror?1:-1}\nv12Stop := ${p(115)}\nv12Target := ${p(95)}\nv12Level := ${p(105)}\nv12Stage := 3\nv12A := ${p(100)}\nv12ATime := ${start-1800000}\nv12B := ${p(115)}\nv12BTime := ${start-1200000}\nv12C := ${p(95)}\nv12CTime := ${start-600000}\nv12Setup := -1\nv12State := 1\nv12PlanKind := 2\nv12ZeroBreakTime := ${start-3600000}\n`;
 const marker='if barstate.isconfirmed and m5Chart\n    if na(v12Day)';
 assert.ok(source.includes(marker));
 const c=await new PineTS([bar],'TEST','5').run(source.replace(marker,setup+'\n'+marker)+'\nplot(v12Stage,"stage")\nplot(v12A,"anchor")');
 const v=n=>c.plots[n].data[0].value;
 assert.equal(v('stage'),1,'stop invalidation before fill must release completed triple');
 assert.equal(v('anchor'),p(95),'keep last confirmed extreme as new first anchor');
 assert.equal(v('Вход LONG/SHORT'),0);assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2'),0);assert.equal(v('Входов за день'),0,'rejection is not an actual stop/trade');
 console.log('PASS invalidated pending countertrend resumes structure without fictitious fill/SL; mirror='+mirror);
}
