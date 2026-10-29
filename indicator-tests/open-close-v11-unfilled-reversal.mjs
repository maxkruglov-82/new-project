import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync('KRYTES_V1_1_LONDON.txt','utf8');
for(const side of [1,-1])for(const mode of ['valid','wrong-structure']){
 const price=x=>side===1?x:200-x,start=Date.parse('2026-10-22T14:00:00+07:00');
 const data=Array.from({length:26},(_,i)=>{
 let open=100.2,close=100.2;
 if(i>=23){open=i===23?100.2:99.1+(i-24)*.1;close=99.1+(i-23)*.1;}
 return {open:price(open),close:price(close),high:Math.max(price(open),price(close))+.01,low:Math.min(price(open),price(close))-.01,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1};
 });
 const prices=[98,97,99,mode==='valid'?98:96,101];
 const inject=`if bar_index == 20
    positionState := 7
    unfilledReverseDay := rangeDayKey
    unfilledReverseSide := ${side}
    unfilledCompletedTime := time - 3000000
    confirmedZeroPrice := ${side===1?110:90}
    structureFirstPrice := 100
    dailyPositionEntries := 0
    array.clear(marketSwingTimes)
    array.clear(marketSwingPrices)
    array.clear(marketSwingHighs)
    array.clear(marketSwingDays)
`+prices.map((p,i)=>`    array.push(marketSwingTimes, time - ${(5-i)*300000})
    array.push(marketSwingPrices, ${price(p)})
    array.push(marketSwingHighs, ${side===1?i%2===0:i%2!==0})
    array.push(marketSwingDays, rangeDayKey)
`).join('');
 const source=original.replace('int positionExitEvent = 0',inject+'\nint positionExitEvent = 0');
 const c=await new PineTS(data,'SOLUSDT','5').run(source);
 const fills=c.plots['Вход LONG/SHORT'].data.flatMap((v,i)=>v.value?[i]:[]);
 assert.deepEqual(fills,mode==='valid'?[25]:[],`${side} ${mode}`);
 console.log('PASS engulfing',side,mode);
}
