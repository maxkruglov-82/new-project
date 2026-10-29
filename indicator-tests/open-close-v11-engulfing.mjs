import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync('KRYTES_V1_1_LONDON.txt','utf8');
for(const side of [1,-1])for(const mode of ['valid','small','outside','same-color','doji']){
 const price=x=>side===1?x:200-x,start=Date.parse('2026-10-22T14:00:00+07:00');
 const data=Array.from({length:23},(_,i)=>{
 let open=100.2,close=100.2;
 if(i===21){open=99.9;close=99.4;if(mode==='same-color')[open,close]=[close,open];if(mode==='doji')open=close;}
 if(i===22){open=mode==='small'?99.39:99.35;close=mode==='small'?99.9:mode==='outside'?100.1:99.95;}
 return {open:price(open),close:price(close),high:Math.max(price(open),price(close))+.01,low:Math.min(price(open),price(close))-.01,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1};
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
    zeroTrendReversed := true
    positionIsZero := false
    positionUsesFourth := false
    positionUsesFifth := false
    positionIsSecond := false
    dailyPositionEntries := 0
`;
 const source=original.replace('int positionExitEvent = 0',inject+'\nint positionExitEvent = 0');
 const c=await new PineTS(data,'SOLUSDT','5').run(source);
 const fills=c.plots['Вход LONG/SHORT'].data.flatMap((v,i)=>v.value?[i]:[]);
 assert.deepEqual(fills,mode==='valid'?[22]:[],`${side} ${mode}`);
 console.log('PASS engulfing',side,mode);
}
