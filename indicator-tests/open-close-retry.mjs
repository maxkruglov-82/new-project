// Isolated regular-position engine with no origin: origin gating is tested separately in zero-condition tests.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8').replace('// Нулевое условие: пробой начала движения 0 отменяет направление 0–1.', 'confirmedZeroPrice := na\n// Нулевое условие: пробой начала движения 0 отменяет направление 0–1.')+'\nplot(confirmedThirdPrice,"P3")\nplot(positionSetupBar,"SetupBar")';
const start=Date.parse('2026-10-21T14:00:00+07:00');
const prefix=[[98.8,98.5],[98.5,98.4],[98.4,98.6],[98.6,98.7],[98.7,98.8],[98.8,98.9],[98.9,98.7],[98.7,98.6],[98.6,98.7],[98.7,98.6],[98.6,98.91],[98.91,98.9],[98.9,99.2],[99.2,98.8]];
async function scenario(tail,mirror){
 const seq=[...prefix,...tail];
 const raw=Array.from({length:12},()=>({open:100,close:100,high:101,low:99})).concat(seq.map(([open,close])=>({open,close,high:110,low:90})));
 const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const ctx=await new PineTS(data,'SOLUSDT','5').run(source+'\nplot(firstStopped?1:0,"Stopped")\nplot(firstStopBar,"StopBar")\nplot(confirmedFourthPrice,"P4")\nplot(positionIsSecond?1:0,"Second")');
 const v=(n,i)=>ctx.plots[n].data[i].value;
 const entries=data.flatMap((b,i)=>v('Вход LONG/SHORT',i)?[{i,side:v('Вход LONG/SHORT',i),entry:v('Цена входа по close',i),stop:v('Стоп позиции',i),target:v('Цель позиции',i)}]:[]);
 for(const e of entries){assert.equal(e.entry,data[e.i].close);assert.ok(e.side*(e.target-e.entry)>=e.side*(e.entry-e.stop)-1e-8);assert.equal(v('Состояние позиции',e.i),2);}
 return {v,entries,data};
}
for(const mirror of [false,true]) {
 const sl=await scenario([[98.8,98.5],[98.5,98.9],[98.9,99.3],[99.3,98.3],[98.3,99],[99,99]],mirror);
 assert.equal(sl.entries.length,2,'one retry after SL, no third entry');
 assert.equal(sl.entries[0].side,mirror?-1:1);
 assert.equal(sl.entries[1].side,-sl.entries[0].side);
 const e=sl.entries[1];assert.equal(sl.v('Stopped',e.i),1);assert.ok(e.i>sl.v('StopBar',e.i));assert.equal(e.stop,sl.v('P4',e.i));
 const tp=await scenario([[98.8,99.25],[99.25,98.4],[98.4,99],[99,98.5],[98.5,98.5]],mirror);
 assert.equal(tp.entries.length,1,'no retry after TP');assert.equal(tp.v('Состояние позиции',26),3);
 console.log('PASS SL-only opposite retry, stop at 4, RR>=1, max two; no retry after TP',mirror?'mirror':'original');
}
