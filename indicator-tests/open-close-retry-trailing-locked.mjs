import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
for(const mirror of [false,true]){
 const side=mirror?1:-1,price=x=>mirror?200-x:x,start=Date.parse('2026-10-23T14:00:00+07:00');
 const raw=Array.from({length:27},()=>({open:100,close:100,high:100.1,low:99.9}));
 raw[21]={open:100,close:98,high:100,low:97.8};
 raw[22]={open:98,close:99,high:99.1,low:97.9};
 raw[23]={open:99,close:97,high:99,low:96.9};
 raw[24]={open:99,close:99,high:100.1,low:98.9};
 raw[25]={open:99,close:99,high:100.1,low:98.9};
 raw[26]={open:99,close:96,high:99,low:95.9};
 const data=raw.map((b,i)=>({...b,...(mirror?{open:price(b.open),close:price(b.close),high:price(b.low),low:price(b.high)}:{}),volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 const inject=`if bar_index == 20
    positionState := 1
    positionSide := ${side}
    firstPositionSide := ${-side}
    positionStop := ${price(103)}
    positionTarget := ${price(99)}
    positionThreshold := ${price(101)}
    confirmedFifthPrice := ${price(99)}
    fifthLocked := true
    fifthLabel := label.new(bar_index,${price(99)},"5")
    fifthExtremeBar := bar_index - 5
    positionSetupBar := bar_index
    positionPlanDay := rangeDayKey
    positionIsSecond := true
    positionUsesFifth := false
    firstPositionIsZero := false
    firstPositionUsesFifth := false
    firstStopped := true
    dailyPositionEntries := 1
    confirmedZeroPrice := na
    counterModeActive := false
`;
 const marker='// Следующий экстремум 5 после противоположного пробоя за стопом первой позиции.';
 const c=await new PineTS(data,'SOLUSDT','5').run(original.replace(marker,inject+'\n'+marker)),v=(n,i)=>c.plots[n].data[i].value;
 assert.equal(v('Цель позиции',21),price(98),'target resumes after locked five-bar retreat');
 assert.equal(v('Цель позиции',23),price(97),'later extreme also updates target');
 assert.equal(v('Стоп позиции',23),price(103),'stop remains unchanged');
 assert.equal(v('Вход LONG/SHORT',24),0);
 assert.equal(v('Вход LONG/SHORT',25),side);
 assert.equal(v('Цена входа по close',25),price(100));
 assert.equal(v('Цель позиции',26),price(97),'target freezes after fill');
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',26),1);
 console.log('PASS locked retry target resumes, trails until entry, freezes after fill',mirror?'LONG':'SHORT');
}
