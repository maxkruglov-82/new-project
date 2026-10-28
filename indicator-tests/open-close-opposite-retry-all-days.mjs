import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
for(const day of ['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'])for(const mirror of [false,true])for(const outcome of ['sl','tp']){
 const start=Date.parse(day+'T14:00:00+07:00'),price=x=>mirror?200-x:x;
 const raw=Array.from({length:27},()=>({open:100,close:100,high:100.2,low:99.8}));
 raw[21]={open:100,close:103.2,high:103.2,low:100};
 raw[22]={open:103.2,close:103.4,high:103.4,low:103.2};
 raw[23]={open:103.4,close:102,high:103.4,low:101.1};
 raw[24]={open:102,close:102,high:102,low:101.1};
 raw[25]={open:102,close:104,high:104,low:102};
 if(outcome==='tp')raw[21]={open:100,close:98.8,high:100,low:98.8};
 const data=raw.map((b,i)=>({...b,...(mirror?{open:price(b.open),close:price(b.close),high:price(b.low),low:price(b.high)}:{}),volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 const side=mirror?1:-1;
 const inject=`if bar_index == 20
    positionState := 2
    positionSide := ${side}
    firstPositionSide := ${side}
    positionStop := ${price(103)}
    firstPositionStop := ${price(103)}
    positionTarget := ${price(99)}
    positionEntry := ${price(101)}
    positionRR := 1
    positionEntryBar := bar_index
    positionPlanDay := rangeDayKey
    positionIsSecond := false
    firstPositionIsZero := true
    firstPositionUsesFifth := false
    firstPositionUsesFourth := false
    zeroReversalStop := ${price(99)}
    firstStopped := false
    dailyPositionEntries := 1
    confirmedZeroPrice := na
    counterModeActive := false
`;
 const c=await new PineTS(data,'SOLUSDT','5').run(original.replace('int positionExitEvent = 0',inject+'\nint positionExitEvent = 0'));
 const v=(n,i)=>c.plots[n].data[i].value;
 if(outcome==='tp'){
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',21),1);
  assert.equal(v('Входов за день',26),1,'TP must not permit second trade');
  for(let i=22;i<data.length;i++)assert.equal(v('Вход LONG/SHORT',i),0);
  console.log('PASS no retry after TP',day,side);
  continue;
 }
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',21),-1);
 if(day==='2026-10-23'){
  assert.equal(v('Входов за день',26),1,'Friday has only one executed trade');
  assert.equal(v('Состояние позиции',22),4,'Friday does not create a retry plan');
  for(let i=22;i<data.length;i++)assert.equal(v('Вход LONG/SHORT',i),0,'Friday retry is forbidden');
  console.log('PASS Friday one trade: no retry after SL',side);
  continue;
 }
 assert.equal(v('Состояние позиции',22),1,'two closes through original stop create opposite retry');
 assert.equal(v('Вход LONG/SHORT',23),0,'first RR touch waits');
 assert.equal(v('Вход LONG/SHORT',24),-side,'retry must oppose stopped side every weekday');
 assert.ok(Math.abs(v('Цена входа по close',24)-price(101.2))<1e-8);
 assert.equal(v('RR входа',24),1);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',25),1);
 assert.equal(v('Входов за день',26),2);
 console.log('PASS opposite retry after SL, two RR touches, TP and max two',day,side);
}
