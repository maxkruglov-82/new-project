import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(structureFirstPrice,"P1")\nplot(confirmedSecondPrice,"P2")\nplot(confirmedThirdPrice,"P3")\nplot(firstSwingDisplayLocked?1:0,"Ready1")\nplot(firstRetreatCloses,"Retreat1")\nplot(array.size(positionBoxes),"Boxes")\nplot(str.endswith(label.get_text(positionTargetInfo)," +")?1:0,"TargetPlus")';
const start=Date.parse('2026-10-13T14:00:00+07:00');
for(const mirror of [false,true]){
 const hour=Array.from({length:12},()=>({open:108.8,close:108.8,high:109.04,low:107.95}));
 [[108.54,108.7],[108.7,108.8],[108.8,108.98],[108.98,108.94]].forEach(([open,close],i)=>hour[i]={open,close,high:109.04,low:107.95});
 const seq=[[108.8,107.6],[107.6,107.25],[107.25,107.45],[107.45,107.5],[107.5,107.55],[107.55,107.65],[107.65,107.55],[107.55,107.45],[107.45,107.3],[107.3,107.15],[107.15,107.06],[107.06,107.2],[107.2,108.1],[108.1,107.06]];
 const data=[...hour,...seq.map(([open,close])=>({open,close,high:Math.max(open,close),low:Math.min(open,close)}))].map((b,i)=>{if(mirror)b={open:224-b.open,close:224-b.close,high:224-b.low,low:224-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value,ref=x=>mirror?224-x:x;
 assert.equal(v('Ready1',16),0,'four eligible candles are insufficient');
 assert.equal(v('Ready1',17),1);assert.equal(v('Retreat1',17),5);assert.equal(v('P1',17),ref(107.25));
 for(let i=17;i<=20;i++){assert.equal(v('Входов за день',i),0);assert.equal(v('Boxes',i),0,'0 and 1 are not entry confirmation');}
 assert.equal(v('P2',21),ref(107.65));assert.equal(v('Состояние позиции',21),1,'break of 1 after five-bar retreat from 2 launches plan');
 assert.equal(v('Вход LONG/SHORT',21),0,'break candle is not retest entry');
 assert.equal(v('P3',22),ref(107.06));assert.equal(v('Вход LONG/SHORT',23),0,'pullback has not reached RR1 yet');
 assert.equal(v('Вход LONG/SHORT',24),mirror?1:-1);
 assert.equal(v('Стоп позиции',24),ref(mirror?108.98:108.8));assert.equal(v('Цель позиции',24),ref(107.06));assert.equal(v('Цена входа по close',24),ref(108.1));
 assert.ok(Math.abs(v('RR входа',24)-1.04/(mirror?0.88:0.70))<1e-8);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',25),1);assert.equal(v('TargetPlus',25),1);
 const originColor=mirror?'#00E676':'#F23645';
 for(const pl of c.plots.__polylines__.data[0].value)assert.equal(pl.line_color,originColor,'no reversal of origin means no color change, including retest');
 console.log('PASS synthetic Oct 13 structure regression 107.65 / 108.1 / 107.06',mirror?'LONG mirror':'SHORT');
}
