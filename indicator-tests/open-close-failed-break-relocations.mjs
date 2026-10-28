import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const source=original+`\nplot(confirmedZeroTime,"T0")\nplot(firstExtremeTime,"T1")\nplot(structureFirstPrice,"P1")\nplot(firstLevelConfirmed?1:0,"FirstConfirmed")\nplot(originRelocated?1:0,"Rolled0")\nplot(firstRollAwaitingRetreat?1:0,"Wait5")\nplot(na(secondPointLabel)?0:1,"HasLabel2")\nplot(not na(movingThirdLabel) and label.get_text(movingThirdLabel)=="2"?1:0,"ThirdRenamed2")`;
for(const [day,file] of [['01','mexc-sol-usdt-m5-2026-10-01-relocation.json'],['21','mexc-sol-usdt-m5-2026-10-21-low-origin.json']])for(const mirror of [false,true]){
 const f=JSON.parse(readFileSync(new URL('./fixtures/'+file,import.meta.url)));
 const data=f.candles.map(b=>({open:mirror?240-b.open:b.open,close:mirror?240-b.close:b.close,high:mirror?240-b.low:b.high,low:mirror?240-b.high:b.low,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 let testedSource=source;
 if(mirror){
  const zero=day==='01'?118.02:105.95,clock=day==='01'?'16:35':'14:00';
  testedSource=source.replace('            confirmedZeroTime := rangeOriginTime',`            confirmedZeroTime := rangeOriginTime\n            if rangeDayKey == 202610${day}\n                confirmedZeroPrice := ${240-zero}\n                confirmedZeroTime := ${Date.parse('2026-10-'+day+'T'+clock+':00+07:00')}`);
 }
 const c=await new PineTS(data,'SOLUSDT','5').run(testedSource),v=(n,i)=>c.plots[n].data[i].value;
 const price=x=>Number((mirror?240-x:x).toFixed(8));
 const index=clock=>data.findIndex(b=>b.openTime===Date.parse('2026-10-'+day+'T'+clock+':00+07:00'));
 const events=[];
 for(let i=0;i<data.length;i++){
  const dt=new Date(data[i].openTime+7*3600000).toISOString().slice(0,16);
  if(!dt.startsWith('2026-10-'+day))continue;
  const entry=v('Вход LONG/SHORT',i),exit=v('Выход TP 1 / SL -1 / неизвестно 2',i);
  if(entry||exit)events.push([dt.slice(11),entry,exit]);
 }
 if(day==='01'){
  assert.equal(v('Цена точки 0',index('17:50')),price(118.02),'first close must not move 0');
  assert.equal(v('Rolled0',index('17:50')),0);
  assert.equal(v('Цена точки 0',index('17:55')),price(118.15));
  assert.equal(v('T0',index('17:55')),data[index('17:55')].openTime);
  assert.equal(v('Разворот закреплён за 0',index('17:55')),0,'failed pair keeps original trend');
  assert.equal(v('HasLabel2',index('18:30')),0,'failed high becomes 0, not a separate 2');
  assert.equal(v('ThirdRenamed2',index('20:30')),1,'new lower low is labelled 2');
  assert.equal(v('P1',index('20:30')),price(117.01),'valid two-close break cannot relocate 1 later');
  assert.equal(v('FirstConfirmed',index('20:30')),1);
  assert.equal(v('Стоп позиции',index('20:30')),price(118.15));
  assert.equal(v('Цель позиции',index('20:30')),price(116.84));
  assert.deepEqual(events,[['20:30',mirror?1:-1,0],['22:05',0,1]]);
 }else{
  assert.equal(v('P1',index('16:25')),price(107),'first close must not move 1');
  assert.equal(v('P1',index('16:30')),price(107.04));
  assert.equal(v('T1',index('16:30')),data[index('16:30')].openTime);
  assert.equal(v('Wait5',index('16:30')),1,'new first point waits for a five-candle retreat');
  assert.equal(v('P1',index('19:20')),price(107.05),'second failed one-tick attempt also relocates 1');
  assert.equal(v('P1',index('20:00')),price(107.05));
  assert.equal(v('P1',index('20:05')),price(107.05),'two closes confirm, never relocate to 107.50');
  assert.equal(v('FirstConfirmed',index('20:05')),1);
  assert.equal(v('Цена точки 0',index('20:30')),price(105.95),'origin search result is retained');
  assert.equal(v('Стоп позиции',index('20:30')),price(106.01),'deepest retreat stays support despite later failed high');
  assert.equal(v('Цель позиции',index('20:30')),price(107.5));
  assert.equal(v('Разворот закреплён за 0',index('20:30')),0,'no countertrend SHORT before origin break');
  assert.deepEqual(events,[['20:30',mirror?-1:1,0],['21:45',0,1]]);
 }
 // Executed prices and levels remain unchanged through the rest of the local day.
 const entryIndex=index('20:30'),stop=v('Стоп позиции',entryIndex),target=v('Цель позиции',entryIndex),p0=v('Цена точки 0',entryIndex),p1=v('P1',entryIndex);
 for(let i=entryIndex;i<data.length;i++){
  assert.equal(v('Стоп позиции',i),stop);assert.equal(v('Цель позиции',i),target);
  assert.equal(v('Цена точки 0',i),p0);assert.equal(v('P1',i),p1);
 }
 console.log('PASS failed-break relocation MEXC Oct',day,mirror?'mirrored':'original');
}
// A genuine two-close origin break must keep the old origin and authorize reversal.
const {scenario}=await import('./open-close-zero-condition.mjs');
for(const mirror of [false,true]){
 const {v}=await scenario(mirror,[[99.05,100.81],[100.81,101.2],[101.2,99.8],[99.8,101.3]]);
 const p=mirror?99.2:100.8,at=v('T0',17);
 assert.equal(v('Цена точки 0',18),p);assert.equal(v('T0',18),at);
 assert.equal(v('Разворот закреплён за 0',18),0);
 assert.equal(v('Цена точки 0',19),p);assert.equal(v('T0',19),at);
 assert.equal(v('Разворот закреплён за 0',19),1);
 assert.equal(v('Вход LONG/SHORT',20),mirror?-1:1);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',21),1);
 console.log('PASS genuine two-close origin break preserves 0',mirror?'mirrored':'original');
}
