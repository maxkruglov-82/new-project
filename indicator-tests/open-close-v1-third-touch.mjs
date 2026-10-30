import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const diagnostic=source+'\nplot(rrTouchCount,"testCount")\nplot(zoneVisitTarget,"testGoal")\nplot(zoneVisitBar,"testVisit")\n';
let fills=0,missed=0;
for(const day of ['09','16'])for(const mirror of [false,true]){
 const f=JSON.parse(readFileSync(new URL(day==='09'?'fixtures/mexc-sol-usdt-m5-2026-10-09-v1-structure.json':'fixtures/mexc-sol-usdt-m5-2026-10-16.json',import.meta.url)));
 const price=x=>mirror?250-x:x;
 const data=f.candles.map(b=>({...b,open:price(b.open),close:price(b.close),high:mirror?price(b.low):b.high,low:mirror?price(b.high):b.low,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 const c=await new PineTS(data,'SOLUSDT','5').run(diagnostic);
 const v=(name,i)=>c.plots[name].data[i].value;
 for(let i=0;i<data.length;i++){
  const side=v('Вход LONG/SHORT',i);
  if(side){
   fills++; assert.equal(v('testCount',i),3);
   const level=v('Граница RR 1:1',i);
   for(let j=i-2;j<=i;j++){
    assert.ok(data[j].low<=level&&data[j].high>=level);
    assert.ok(side===1?data[j].close>level:data[j].close<level);
    if(j<i)assert.equal(v('Вход LONG/SHORT',j),0);
   }
  }
  if(v('Состояние позиции',i)===7&&v('Состояние позиции',i-1)!==7){
   missed++;assert.equal(side,0);assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',i),0);
   assert.equal(v('Входов за день',i),v('Входов за день',i-1));
   const goal=v('testGoal',i);assert.ok(data[i].high>=goal||data[i].low<=goal);
  }
 }
 console.log('PASS third-touch/no-entry Oct'+day+(mirror?' mirrored':''));
}


console.log({fills,missed});

const entryLogic=source.slice(source.indexOf('                bool closesOnEntrySide ='),source.indexOf('                bool eligibleAlertTouch ='));
for(const side of [-1,1]){
 const bodies=[9,9,9,10,9,9,9];
 const bars=bodies.map((close,i)=>({open:10,high:11,low:8,close:side===-1?close:20-close,volume:1,openTime:Date.UTC(2026,0,5,0,i*5),closeTime:Date.UTC(2026,0,5,0,i*5)+299999}));
 const pine=`//@version=5
indicator("third touch test")
var int rrTouchCount = 0
var int rrTouchBar = na
var int rrTouchTime = na
var int rrTouchSetupBar = na
var float rrTouchLevel = na
int positionSide = ${side}
float positionThreshold = 10
int positionSetupBar = 0
bool touchedRRZone = low <= positionThreshold and high >= positionThreshold
bool originConfirmed = true
bool pendingDirectionAllowed = true
`+entryLogic.split('\n').map(l=>l.startsWith('                ')?l.slice(16):l).join('\n')+'\nplot(thirdRRTouch ? 1 : 0,"fill")';
 const result=await new PineTS(bars,'TEST','5').run(pine);
 assert.deepEqual(result.plots.fill.data.map(x=>x.value),[0,0,1,0,0,0,1]);
}
console.log('PASS synthetic LONG/SHORT: third touch, equality rejection and sequence reset');

const noEntryLogic=source.slice(source.indexOf('            if positionState == 1 and workedWithoutEntry'),source.indexOf('    // На свече подтверждения касания'));
for(const initial of [1,2]){
 const pine=`//@version=5
indicator("no entry test")
int positionState = ${initial}
bool workedWithoutEntry = true
bool stopBeforeEntry = false
float positionTarget = 12
float positionThreshold = 10
float zoneVisitTarget = 11
float zoneVisitLevel = 9
`+noEntryLogic.split('\n').map(l=>l.startsWith('            ')?l.slice(12):l).join('\n')+'\nplot(positionState,"state")';
 const result=await new PineTS([{open:10,high:12,low:9,close:11,volume:1,openTime:Date.UTC(2026,0,5),closeTime:Date.UTC(2026,0,5)+299999}],'TEST','5').run(pine);
 assert.equal(result.plots.state.data[0].value,initial===1?7:2);
}
console.log('PASS missed scenario retained; actual entry has priority');
