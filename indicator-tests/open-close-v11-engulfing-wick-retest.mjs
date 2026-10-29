import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_V1_1_LONDON.txt',import.meta.url),'utf8');
for(const side of [1,-1])for(const mode of ['wick','no-signal','same-bar','new-plan','gap','goal-on-signal','stop','signal-outside-zone']){
 const price=x=>side===1?x:200-x,start=Date.parse('2026-10-22T14:00:00+07:00');
 const data=Array.from({length:mode==='same-bar'?23:24},(_,i)=>{
  let open=100.2,close=100.2,wickLow;
  if(i===21){open=99.9;close=99.4;}
  if(i===22){open=99.35;close=mode==='no-signal'?99.8:100.1;}
  if(mode==='signal-outside-zone'){
   if(i===21){open=100.3;close=100.1;}
   if(i===22){open=100.1;close=100.4;wickLow=99.9;}
  }
  if(i===23){open=100.1;close=mode==='stop'?96.9:100.2;wickLow=99.95;}
  const lo=Math.min(open,close,wickLow??Infinity)-.001;
  const hi=mode==='goal-on-signal'&&i===22?103.1:Math.max(open,close)+.001;
  const time=start+i*300000+(mode==='gap'&&i===23?300000:0);
  return {open:price(open),close:price(close),high:side===1?hi:price(lo),low:side===1?lo:price(hi),volume:1,openTime:time,closeTime:time+299999};
 });
 let inject=`if bar_index >= 20
    confirmedZeroPrice := na
    counterModeActive := false
if bar_index == 20
    positionState := 1
    positionSide := ${side}
    positionStop := ${price(97)}
    positionTarget := ${price(103)}
    positionThreshold := 100
    confirmedThirdPrice := ${price(103)}
    positionSetupBar := bar_index
    positionPlanDay := rangeDayKey
    zeroTrendReversed := true
    positionIsZero := false
    positionUsesFourth := false
    positionUsesFifth := false
    positionIsSecond := false
    dailyPositionEntries := 0
`;
 if(mode==='new-plan')inject+='if bar_index == 23\n    positionSetupBar := bar_index\n';
 const source=original.replace('int positionExitEvent = 0',inject+'\nint positionExitEvent = 0');
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 const fills=data.flatMap((_,i)=>v('Вход LONG/SHORT',i)?[i]:[]);
 const expected=['wick','goal-on-signal'].includes(mode)?[23]:[];
 assert.deepEqual(fills,expected,`${side} ${mode}`);
 if(expected.length){
  assert.equal(v('Цена входа по close',23),100,'fills RR boundary, not out-of-zone close');
  assert.equal(v('RR входа',23),1);
  assert.equal(v('Входов за день',23),1);
  assert.notEqual(data[23].close,100);
 }
 console.log('PASS post-engulfing wick-only retest',side,mode);
}
