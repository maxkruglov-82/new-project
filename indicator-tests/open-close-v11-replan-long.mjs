import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_V1_1_LONDON.txt',import.meta.url),'utf8');
const start=Date.parse('2026-10-22T14:00:00+07:00');
for(const mode of ['replace','one-close','unqualified','entered']){
 const seq=[100.3,100.4,mode==='one-close'?100.3:100.45,101.13,100.5,100.4,100.45,100.5,101.13];
 const data=Array.from({length:29},(_,i)=>{const close=i>=20?seq[i-20]:100.2,open=i>20?seq[i-21]:100.2;return {open,close,high:Math.max(open,close)+.01,low:Math.min(open,close)-.01,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1};});
 const inject=`if bar_index == 20
    positionState := ${mode==='entered'?2:1}
    positionSide := 1
    positionStop := 99.13
    positionTarget := 100.36
    positionThreshold := (99.13 + 100.36) / 2
    positionSetupBar := 20
    positionEntryBar := 20
    positionPlanDay := rangeDayKey
    positionIsZero := true
    firstPositionIsZero := true
    positionIsSecond := false
    dailyPositionEntries := ${mode==='entered'?1:0}
    firstPositionSide := 1
    firstPositionStop := 99.13
    structureSide := -1
    structureDay := rangeDayKey
    structureFirstPrice := 99.13
    confirmedZeroPrice := 100.2
    zeroTrendReversed := true
    zeroConditionUsed := true
    counterModeActive := false
    counterReversalReady := true
    structureCompleted := true
    confirmedSecondPrice := 100.36
    confirmedThirdPrice := 99.97
    confirmedFourthPrice := 100.45
    thirdColorTime := time - 900000
    thirdExtremeBar := 17
    thirdStopQualified := ${mode!=='unqualified'}
    zeroReversalStop := 100.36
`;
 const anchor='// Неисполненный LONG: два close за прежним HH заменяют план на HL -> новый HH.';
 const c=await new PineTS(data,'SOLUSDT','5').run(original.replace(anchor,inject+'\n'+anchor)+'\nplot(longPlanReplaced?1:0,"Replaced")\nplot(positionSetupBar,"Setup")');
 const v=(n,i)=>c.plots[n].data[i].value;
 assert.equal(v('Replaced',21),0,'one close cannot replace a plan');
 if(mode==='replace'){
  assert.equal(v('Replaced',22),1);assert.equal(v('Стоп позиции',22),99.97);assert.equal(v('Входов за день',22),0);assert.equal(v('Setup',22),22);
  assert.equal(v('Цель позиции',23),101.13);assert.ok(Math.abs(v('Граница RR 1:1',23)-100.55)<1e-8);
  assert.equal(v('Вход LONG/SHORT',27),1);assert.equal(v('Цена входа по close',27),100.5);assert.equal(v('Стоп позиции',27),99.97);
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',28),1);
 } else if(mode==='one-close')assert.equal(v('Replaced',22),0);
 else {assert.equal(v('Replaced',22),0);assert.equal(v('Стоп позиции',22),99.13);}
 console.log('PASS V1.1 pending LONG replanning',mode);
}
