// Isolated regular-position engine with no origin: origin gating is tested separately in zero-condition tests.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8').replace('// Нулевая сделка следует движению 0–1 после подтверждения 1.', 'confirmedZeroPrice := na\n// Нулевая сделка следует движению 0–1 после подтверждения 1.')+'\nplot(confirmedThirdPrice,"P3")\nplot(positionSetupBar,"SetupBar")';
const start=Date.parse('2026-10-21T14:00:00+07:00');
const prefix=[[98.8,98.5],[98.5,98.4],[98.4,98.6],[98.6,98.7],[98.7,98.8],[98.8,98.9],[98.9,98.7],[98.7,98.6],[98.6,98.7],[98.7,98.6],[98.6,98.91],[98.91,98.9],[98.9,99.2]];
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
for(const [when,expected] of [['23:50',1],['23:55',0]]) {
 const at=Date.parse('2026-10-21T'+when+':00+07:00'),tail=[];
 while(start+(12+prefix.length+tail.length)*300000<at)tail.push([99.1,99.1]);
 tail.push([99.1,98.8],[98.8,98.8]);
 const result=await scenario(tail,false);
 assert.equal(result.entries.length,expected,when+' entry by candle closing time');
 console.log('PASS entry deadline',when,expected);
}
