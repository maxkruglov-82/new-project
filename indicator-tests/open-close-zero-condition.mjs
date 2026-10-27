import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(array.size(positionBoxes),"BoxCount")\nplot(array.size(positionLabels),"LabelCount")\nfloat tpMark = 0\nfloat slMark = 0\nif array.size(positionLabels) > 0\n    for li = 0 to array.size(positionLabels) - 1\n        string lt = label.get_text(array.get(positionLabels,li))\n        tpMark := str.contains(lt,"Цель +") ? tpMark + 1 : tpMark\n        slMark := str.contains(lt,"Стоп +") ? slMark + 1 : slMark\nplot(tpMark,"TPMarks")\nplot(slMark,"SLMarks")\nplot(firstSwingDisplayLocked?1:0,"Ready1")\nplot(confirmedZeroTime,"T0")\nplot(box.get_left(positionRiskBox),"Left")';
const start=Date.parse('2026-10-21T14:00:00+07:00');
export async function scenario(mirror,tail){
 const hour=Array.from({length:12},()=>({open:100,close:100,high:101,low:99}));
 [[100,100.5],[100.5,100.8],[100.8,100.4],[100.4,100.3],[100.3,100.2]].forEach(([open,close],i)=>hour[7+i]={open,close,high:101,low:99});
 const seq=[[100.2,98.8],[98.8,98.6],[98.6,98.7],[98.7,98.8],[98.8,99],...tail];
 const data=[...hour,...seq.map(([open,close])=>({open,close,high:150,low:50}))].map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 return {c,v,data};
}
if(process.argv[1]===new URL(import.meta.url).pathname)for(const mirror of [false,true]){
 for(const [outcome,tail] of [['tp',[[99,99.8],[99.8,98.5]]],['sl',[[99,99.8],[99.8,100.9]]],['touch',[[99.9,99.5]]]]){
  const {v,data}=await scenario(mirror,tail),side=mirror?1:-1;
  assert.equal(v('Ready1',15),0);assert.equal(v('Ready1',16),1);
  assert.equal(v('Состояние позиции',16),1,'plan immediately after confirmed 1');
  assert.equal(v('Стоп позиции',16),mirror?99.2:100.8,'stop exactly at 0');
  assert.equal(v('Цель позиции',16),mirror?101.4:98.6,'target exactly at 1');
  assert.equal(v('Left',16),v('T0',16)-600000);
  assert.equal(v('Вход LONG/SHORT',17),side,'follow direction of 0–1');
  assert.equal(v('Цена входа по close',17),data[17].close);
  if(outcome==='touch')assert.ok(v('RR входа',17)<1,'touch qualifies even if close RR below 1');
  else {assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',18),outcome==='tp'?1:-1);assert.equal(v(outcome==='tp'?'TPMarks':'SLMarks',18),1,'completed trade keeps result mark');}
  console.log('PASS trend-following zero setup, stop 0, target 1',mirror?'LONG':'SHORT',outcome);
 }
}

if(process.argv[1]===new URL(import.meta.url).pathname)for(const mirror of [false,true]){
 const sl=await scenario(mirror,[[99,99.8],[99.8,100.9],[100.9,99.6],[99.6,101],[101,99.6],[99.6,98.5]]);
 assert.equal(sl.v('Входов за день',17),1);
 assert.equal(sl.v('Вход LONG/SHORT',19),mirror?-1:1);
 assert.equal(sl.v('Входов за день',22),2);
 assert.equal(sl.v('SLMarks',20),1);assert.equal(sl.v('TPMarks',20),1);
 const tp=await scenario(mirror,[[99,99.8],[99.8,98.5],[98.5,101],[101,99.6],[99.6,98.5]]);
 assert.equal(tp.v('Входов за день',21),1,'TP stops trading for day');
 console.log('PASS zero SL-only retry, two-trade cap, retained TP/SL labels',mirror?'mirror':'original');
}
