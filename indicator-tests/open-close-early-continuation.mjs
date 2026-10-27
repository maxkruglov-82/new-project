import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(structureFirstPrice,"P1")\nplot(confirmedSecondPrice,"P2")\nplot(confirmedThirdPrice,"P3")\nplot(firstSwingDisplayLocked?1:0,"Ready1")\nplot(firstRetreatCloses,"Retreat1")\nplot(array.size(positionBoxes),"Boxes")\nplot(str.endswith(label.get_text(positionTargetInfo)," +")?1:0,"TargetPlus")';
const start=Date.parse('2026-10-12T14:00:00+07:00');
for(const mirror of [false,true]){
 const hour=Array.from({length:12},()=>({open:112.8,close:112.8,high:113.04,low:112.52}));
 [[112.54,112.7],[112.7,112.8],[112.8,112.98],[112.98,112.94]].forEach(([open,close],i)=>hour[i]={open,close,high:113.04,low:112.52});
 const seq=[[112.8,112.2],[112.2,111.72],[111.72,111.9],[111.9,112.05],[112.05,112.15],[112.15,112.24],[112.24,111.6],[111.6,111.31],[111.31,111.78],[111.78,111.31]];
 const data=[...hour,...seq.map(([open,close])=>({open,close,high:150,low:50}))].map((b,i)=>{if(mirror)b={open:224-b.open,close:224-b.close,high:224-b.low,low:224-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value,ref=x=>mirror?224-x:x;
 assert.equal(v('Ready1',16),0);
 assert.equal(v('Ready1',17),1);
 assert.equal(v('Retreat1',17),5);
 assert.equal(v('P1',18),ref(111.72),'retain early first extreme');
 assert.equal(v('P2',18),ref(112.24),'break confirms pullback extremum without another five bars');
 assert.equal(v('Состояние позиции',18),1);
 assert.equal(v('Вход LONG/SHORT',18),0,'break is not entry');
 assert.equal(v('P3',19),ref(111.31));
 assert.equal(v('Вход LONG/SHORT',20),mirror?1:-1);
 assert.equal(v('Стоп позиции',20),ref(112.24));
 assert.equal(v('Цель позиции',20),ref(111.31));
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',21),1);
 console.log('PASS five-bar pullback then immediate continuation break and retest',mirror?'LONG':'SHORT');
}
