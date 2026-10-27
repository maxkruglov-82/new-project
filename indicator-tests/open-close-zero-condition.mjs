import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+`
plot(array.size(positionBoxes),"BoxCount")
plot(array.size(positionLabels),"LabelCount")
float tpMark = 0
float slMark = 0
float markY = na
float markX = na
float isTake = 0
if array.size(positionLabels) > 0
    for li = 0 to array.size(positionLabels) - 1
        label item = array.get(positionLabels,li)
        string lt = label.get_text(item)
        bool isResult = str.endswith(lt," +")
        bool tp = isResult and str.contains(lt,"Цель:")
        bool sl = isResult and str.contains(lt,"Стоп:")
        tpMark := tp ? tpMark + 1 : tpMark
        slMark := sl ? slMark + 1 : slMark
        if tp or sl
            markY := label.get_y(item)
            markX := label.get_x(item)
            isTake := tp ? 1 : -1
plot(tpMark + slMark,"OutcomeMarks")
plot(markY,"MarkY")
plot(markX,"MarkX")
plot(isTake,"IsTake")
plot(tpMark,"TPMarks")
plot(slMark,"SLMarks")
plot(firstSwingDisplayLocked?1:0,"Ready1")
plot(confirmedZeroTime,"T0")
plot(box.get_left(positionRiskBox),"Left")
plot(label.get_y(positionStopInfo),"StopLabelY")
plot(label.get_y(positionTargetInfo),"TargetLabelY")
plot(label.get_y(positionInfo),"EntryLabelY")
float entryHasRR = 0
if not na(positionInfo)
    entryHasRR := str.contains(label.get_text(positionInfo),"RR 1:") ? 1 : 0
plot(entryHasRR,"EntryHasRR")
`;
const start=Date.parse('2026-10-21T14:00:00+07:00');
export async function scenario(mirror,tail){
 const hour=Array.from({length:12},()=>({open:100,close:100,high:101,low:99}));
 [[100,100.5],[100.5,100.8],[100.8,100.4],[100.4,100.3],[100.3,100.2]].forEach(([open,close],i)=>hour[7+i]={open,close,high:101,low:99});
 const seq=[[100.2,98.8],[98.8,98.6],[98.6,98.7],[98.7,98.8],[98.8,99],[99,99.05],...tail];
 const data=[...hour,...seq.map(([open,close])=>({open,close,high:150,low:50}))].map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 return {c,v,data};
}
if(process.argv[1]===new URL(import.meta.url).pathname)for(const mirror of [false,true]){
 const base=[[99.05,100.805],[100.805,100.81],[100.81,101.2]];
 for(const [outcome,tail] of [['tp',[[101.2,99.8],[99.8,101.3]]],['sl',[[101.2,99.8],[99.8,98.5]]],['touch',[[99.7,100.1]]]]){
  const {v,data}=await scenario(mirror,[...base,...tail]),side=mirror?-1:1;
  assert.equal(v('Ready1',16),0,'four bars do not confirm');assert.equal(v('Ready1',17),1);
  assert.equal(v('BoxCount',17),0,'0 and 1 alone never create an entry tool');
  assert.equal(v('Входов за день',18),0,'0.005 past origin insufficient');
  assert.equal(v('Состояние позиции',19),1,'one close 0.01 past origin creates reversal plan');
  assert.equal(v('Стоп позиции',19),mirror?101.4:98.6,'stop exactly at 1');
  assert.equal(v('Цель позиции',20),mirror?98.8:101.2,'third extreme follows price beyond origin');
  assert.equal(v('Вход LONG/SHORT',21),side,'entry only on subsequent retest');
  assert.equal(v('Цена входа по close',21),data[21].close);
  if(outcome==='touch')assert.ok(v('RR входа',21)<1,'touch qualifies even if close RR below 1');
  else {assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',22),outcome==='tp'?1:-1);assert.equal(v(outcome==='tp'?'TPMarks':'SLMarks',22),1);}
  console.log('PASS origin breakout, third extreme and retest entry',mirror?'SHORT':'LONG',outcome);
 }
 const sl=await scenario(mirror,[...base,[101.2,99.8],[99.8,98.5],[98.5,100],[100,98.4],[98.4,100]]);
 assert.equal(sl.v('Вход LONG/SHORT',23),mirror?1:-1);
 assert.equal(sl.v('Входов за день',25),2);
 assert.equal(sl.v('SLMarks',24),1);assert.equal(sl.v('TPMarks',24),1);
 console.log('PASS SL-only retry and retained outcomes',mirror?'mirror':'original');
}
