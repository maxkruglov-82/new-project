import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const diagnostic=source+'\nplot(zoneVisitTarget,"testGoal")\nplot(zoneVisitBar,"testVisit")\n';
let fills=0,missed=0,exits=0;
for(const day of ['09','16'])for(const mirror of [false,true]){
 const f=JSON.parse(readFileSync(new URL(day==='09'?'fixtures/mexc-sol-usdt-m5-2026-10-09-v1-structure.json':'fixtures/mexc-sol-usdt-m5-2026-10-16.json',import.meta.url)));
 const price=x=>mirror?250-x:x;
 const data=f.candles.map(b=>({...b,open:price(b.open),close:price(b.close),high:mirror?price(b.low):b.high,low:mirror?price(b.high):b.low,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 const c=await new PineTS(data,'SOLUSDT','5').run(diagnostic);
 const beforeColorFix=source.replace('if initialZeroBroken and reverseStage == 3','if reverseStage == 3');
 const previous=await new PineTS(data,'SOLUSDT','5').run(beforeColorFix);
 for(const name of Object.keys(previous.plots).filter(n=>!n.startsWith('__')&&n!=='Действующий цвет тренда'))assert.deepEqual(c.plots[name].data,previous.plots[name].data,'color fix must not change trading: '+name);
 const v=(name,i)=>c.plots[name].data[i].value;
 for(let i=0;i<data.length;i++){
  const side=v('Вход LONG/SHORT',i);
  if(side){
   fills++;
   const level=v('Граница RR 1:1',i);
   assert.ok(data[i].low<=level&&data[i].high>=level,'entry candle touches RR');
  }
  if(v('Состояние позиции',i)===7&&v('Состояние позиции',i-1)!==7){
   missed++;assert.equal(side,0);assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',i),0);
   assert.equal(v('Входов за день',i),v('Входов за день',i-1));
   const goal=v('testGoal',i);assert.ok(data[i].high>=goal||data[i].low<=goal);
  }
 }
 const circles=c.plots.__labels__.data.flatMap(x=>x.value).filter(x=>!x._deleted&&x.style==='style_circle');
 const traces=c.plots.__lines__.data.flatMap(x=>x.value).filter(x=>!x._deleted&&x.style==='style_dashed');
 const boxes=c.plots.__boxes__.data.flatMap(x=>x.value).filter(x=>!x._deleted);
 for(let i=0;i<data.length;i++){
  if(v('Вход LONG/SHORT',i))assert.ok(circles.some(x=>x.x===data[i].openTime&&x.y===v('Цена входа по close',i)&&x.tooltip.startsWith('Вход ')&&x.text===String(v('Входов за день',i))&&x.color===(v('Вход LONG/SHORT',i)===1?'#4CAF50':'#F23645')),'numbered side-colored actual entry circle');
  const event=v('Выход TP 1 / SL -1 / неизвестно 2',i);
  if(event===1||event===-1){
   exits++;
   const price=v(event===1?'Цель позиции':'Стоп позиции',i);
   assert.ok(circles.some(x=>x.x===data[i].openTime&&x.y===price&&/^(Стоп|Тейк) /.test(x.tooltip)),'actual exit circle');
   assert.ok(traces.some(x=>x.x2===data[i].openTime&&x.y2===price),'dashed entry-to-exit path');
   assert.ok(boxes.some(x=>x.right===data[i].openTime+300000),'instrument ends one M5 after actual exit');
  }
 }
 console.log('PASS first-touch drawings/no-entry Oct'+day+(mirror?' mirrored':''));
}



console.log({fills,missed,exits});

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
