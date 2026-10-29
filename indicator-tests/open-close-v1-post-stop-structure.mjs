import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
for(const mirror of [false,true])for(const mode of ['reversal','continuation','missing-middle','missing-new-extreme','broken-middle','one-close','no-base-break','first-tp','daily-limit']){
 const price=x=>mirror?200-x:x,firstSide=mirror?1:-1;
 const continuation=mode==='continuation'||mode==='no-base-break';
 const start=Date.parse('2026-10-16T14:00:00+07:00');
 const data=Array.from({length:26},(_,i)=>{
  let open=107,close=107,lo,hi;
  if(mode==='one-close'&&i>=14&&i<20)open=close=105.9;
  if(continuation&&i===19)open=close=mode==='no-base-break'?101:99;
  if(continuation&&i===20)open=close=mode==='no-base-break'?101:98.9;
  if(i===21){open=continuation?98.9:107;close=continuation?101.6:105.6;lo=continuation?98.8:105.45;}
  if(i===22){open=continuation?101.6:105.6;close=continuation?101.7:105.7;lo=continuation?101.4:105.4;}
  if(i>=23){open=continuation?101.7:105.7;close=continuation?100.8:106;lo=continuation?96.9:105.7;hi=continuation?101.8:108.1;}
  lo=lo??Math.min(open,close)-.01;hi=hi??Math.max(open,close)+.01;
  return {open:price(open),close:price(close),high:mirror?price(lo):hi,low:mirror?price(hi):lo,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1};
 });
 const pivots=continuation?[[12,106,true],[18,97,false]]:mode==='broken-middle'?[[12,106,true],[14,103,false],[15,105.8,true],[16,99,false],[18,108,true]]:mode==='missing-middle'?[[12,106,true],[18,108,true]]:[[12,106,true],[14,103,false],[18,mode==='missing-new-extreme'?105.5:108,true]];
 let inject=`if bar_index >= 20
    confirmedZeroPrice := na
    counterModeActive := false
if bar_index == 20
    positionState := ${mode==='first-tp'?3:4}
    positionSide := ${firstSide}
    positionIsSecond := false
    positionPlanDay := rangeDayKey
    positionAnchorTime := ${start}
    firstStopped := ${mode!=='first-tp'}
    firstStopBar := 10
    firstPositionSide := ${firstSide}
    firstPositionStop := ${price(105)}
    firstPositionIsZero := false
    firstPositionUsesFourth := false
    firstPositionUsesFifth := false
    dailyPositionEntries := ${mode==='daily-limit'?2:1}
    retryBasePrice := 100
    retryBaseTime := ${start+8*300000}
    retryContinuationBreakTime := na
    retryUsedSide := 0
    retryUsedGoalTime := na
    array.clear(retrySwingTimes)
    array.clear(retrySwingPrices)
    array.clear(retrySwingHighs)
    array.clear(retrySwingDays)
`;
 inject+=pivots.map(([i,p,h])=>`    array.push(retrySwingTimes,${start+i*300000})\n    array.push(retrySwingPrices,${price(p)})\n    array.push(retrySwingHighs,${mirror?!h:h})\n    array.push(retrySwingDays,rangeDayKey)\n`).join('');
 const source=original.replace('    // Вторая сделка: новая тройка,',inject.split('\n').map(line=>line?'    '+line:line).join('\n')+'\n    // Вторая сделка: новая тройка,');
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 const fills=data.flatMap((_,i)=>v('Вход LONG/SHORT',i)?[i]:[]);
 const valid=mode==='reversal'||mode==='continuation';
 assert.deepEqual(fills,valid?[22]:[],`${mirror} ${mode}`);
 if(valid){
  assert.equal(v('Вход LONG/SHORT',22),mode==='continuation'?firstSide:-firstSide);
  assert.equal(v('Входов за день',22),2,'Friday permits a second fill after SL');
  assert.equal(v('Стоп позиции',22),price(mode==='continuation'?106:103));
  assert.equal(v('Цель позиции',22),price(mode==='continuation'?97:108));
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',23),1);
  assert.equal(v('Входов за день',25),2,'no third entry');
 }
 console.log('PASS V1 post-stop 1-2-3 Friday',mirror?'mirror LONG-first':'SHORT-first',mode);
}
