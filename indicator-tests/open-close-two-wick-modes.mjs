import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
for(const mode of ['regular','zero','fourth','fifth','second','friday-second'])for(const side of [-1,1]){
 const start=Date.parse('2026-10-23T14:00:00+07:00');
 const data=Array.from({length:25},(_,i)=>({open:100,close:100,high:i===21||i===22?101.2:100.2,low:i===21||i===22?98.8:99.8,volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 const stop=side===-1?103:97,target=side===-1?99:101,level=side===-1?101:99;
 const second=mode.includes('second');
 const inject=`if bar_index == 20
    positionState := 1
    positionSide := ${side}
    positionStop := ${stop}
    positionTarget := ${target}
    positionThreshold := ${level}
    confirmedThirdPrice := ${target}
    confirmedFourthPrice := ${target}
    confirmedFifthPrice := ${target}
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
 const c=await new PineTS(data,'SOLUSDT','5').run(original.replace('int positionExitEvent = 0',inject+'\nint positionExitEvent = 0'));
 const v=(n,i)=>c.plots[n].data[i].value;
 assert.equal(v('Вход LONG/SHORT',21),0,mode+' first touch');
 assert.equal(v('Вход LONG/SHORT',22),side,mode+' second touch');
 assert.equal(v('Цена входа по close',22),level,mode+' fills level, not close');
 assert.equal(v('RR входа',22),1);
 console.log('PASS shared entry engine',mode,side);
}
