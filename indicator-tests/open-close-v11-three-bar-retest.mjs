import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_V1_1_LONDON.txt',import.meta.url),'utf8');
assert.equal(original,readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8'));
for(const side of [1,-1])for(const mode of ['regular','zero','fourth','fifth','second','decline','outside','wick','stop','gap','friday-second','new-plan','takeprofit','stop-exit']){
 const day=mode==='friday-second'?'2026-10-23':'2026-10-22',start=Date.parse(day+'T14:00:00+07:00');
 const sequence=mode==='takeprofit'?[99.5,99.7,99.8,103.1,103.2]:mode==='stop-exit'?[99.5,99.7,99.8,96.9,96.8]:mode==='decline'?[99.7,99.5,99.3,99.4,99.5]:mode==='outside'?[99.5,99.8,100.1,99.9,99.95]:mode==='stop'?[97,97.5,98,98.1,98.2]:mode==='wick'?[100.2,100.3,100.4,100.5,100.6]:[99.5,99.7,99.8,99.9,99.95];
 const price=x=>side===1?x:200-x;
 let data=Array.from({length:26},(_,i)=>{const close=i>20?sequence[i-21]:100.2,open=i>21?sequence[i-22]:100.2;return {open:price(open),close:price(close),high:Math.max(price(open),price(close))+.1,low:Math.min(price(open),price(close))-.1,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1};});
 if(mode==='wick')for(let i=21;i<data.length;i++) {if(side===1)data[i].low=99;else data[i].high=101;}
 if(mode==='gap')data=data.filter((_,i)=>i!==22);
 const second=mode==='second'||mode==='friday-second';
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
    confirmedFourthPrice := ${price(103)}
    confirmedFifthPrice := ${price(103)}
    positionSetupBar := bar_index
    positionPlanDay := rangeDayKey
    confirmedZeroPrice := na
    counterModeActive := false
    zeroTrendReversed := true
    positionIsZero := ${mode==='zero'}
    positionUsesFourth := ${mode==='fourth'}
    positionUsesFifth := ${mode==='fifth'}
    positionIsSecond := ${second}
    firstStopped := ${second}
    dailyPositionEntries := ${second?1:0}
`;
 if(mode==='new-plan')inject+='if bar_index == 23\n    positionSetupBar := bar_index\n';
 const source=original.replace('int positionExitEvent = 0',inject+'\nint positionExitEvent = 0')+'\nplot(retestBars,"RetestCount")\nplot(array.size(tradeEventMarks),"EventMarks")';
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 const fills=data.flatMap((_,i)=>v('Вход LONG/SHORT',i)?[i]:[]);
 if(['wick','stop','gap','friday-second','new-plan'].includes(mode))assert.deepEqual(fills,[],mode);
 else {
  const expected=mode==='gap'?24:mode==='decline'||mode==='outside'?25:23;
  assert.deepEqual(fills,[expected],mode);
  assert.equal(v('Цена входа по close',expected),data[expected].close);
  assert.ok(v('RR входа',expected)>=1);
  assert.equal(v('Входов за день',expected),second?2:1);
 }
 if(mode==='takeprofit'||mode==='stop-exit'){
  assert.equal(v('EventMarks',23),1);
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',24),mode==='takeprofit'?1:-1);
  assert.equal(v('EventMarks',24),mode==='takeprofit'?3:2);
 }
 if(mode==='stop')assert.equal(v('Состояние позиции',21),5);
 console.log('PASS V1.1 three-bar retest',side,mode);
}
