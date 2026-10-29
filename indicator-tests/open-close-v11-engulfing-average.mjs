import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_V1_1_LONDON.txt',import.meta.url),'utf8');
for(const side of [1,-1])for(const mode of ['below-average','above-average']){
 const price=x=>side===1?x:200-x,start=Date.parse('2026-10-22T14:00:00+07:00');
 const data=Array.from({length:24},(_,i)=>{
  let open=100.2,close=100.2;
  if(i===18){open=102;close=103;}
  if(i===19){open=103;close=99.9;}
  if(i===20){open=99.9;close=99.9;}
  if(i===21){open=99.9;close=99.8;}
  if(i===22){open=99.79;close=mode==='below-average'?99.91:100.99;}
  if(i===23){open=mode==='below-average'?99.91:100.99;close=100.9;}
  const lo=i===23?Math.min(open,close,99.95):Math.min(open,close);
  const hi=Math.max(open,close)+.001;
  return {open:price(open),close:price(close),high:side===1?hi:price(lo),low:side===1?lo:price(hi),volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1};
 });
 const inject=`if bar_index >= 20
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
    positionAnchorTime := ${start+18*300000}
    zeroTrendReversed := true
    positionIsZero := false
    positionUsesFourth := false
    positionUsesFifth := false
    positionIsSecond := false
    dailyPositionEntries := 0
`;
 const source=original.replace('int positionExitEvent = 0',inject+'\nint positionExitEvent = 0')+'\nplot(engulfingRetestArmed?1:0,"Armed")\nplot(engulfingSignalAverage,"MeanAtSignal")';
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 const fills=data.flatMap((_,i)=>v('Вход LONG/SHORT',i)?[i]:[]);
 assert.deepEqual(fills,mode==='above-average'?[23]:[],`${side} ${mode}`);
 assert.equal(v('Armed',22),mode==='above-average'?1:0);
 if(mode==='above-average')assert.ok(Math.abs(v('MeanAtSignal',22)-3.2/3)<1e-9,'average excludes peak and signal; includes doji');
 console.log('PASS engulfing retest mean-body filter',side,mode);
}
// Direct calculation verifies current signal and peak bodies do not enter the average.
const fn=original.slice(original.indexOf('retestBodyAverage('),original.indexOf('// Точка 0'));
const start=Date.parse('2026-10-22T13:00:00+07:00');
const data=[[102,103],[103,102],[102,101.8],[101.8,102.05]].map(([open,close],i)=>({open,close,high:1000,low:0,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}));
const source='//@version=5\nindicator("mean")\n'+fn+`\nvar array<float> o=array.new_float()\nvar array<float> c=array.new_float()\nvar array<int> t=array.new_int()\narray.push(o,open)\narray.push(c,close)\narray.push(t,time)\nplot(retestBodyAverage(o,c,t,1,${start},time),"Mean")`;
const c=await new PineTS(data,'X','5').run(source);
assert.ok(Math.abs(c.plots.Mean.data[3].value-.6)<1e-9);
console.log('PASS exact retest body average: excludes anchor/signal, ignores wick length');
