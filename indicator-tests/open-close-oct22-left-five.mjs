import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-22-left5.json',import.meta.url)));
const data=fixture.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedZeroTime,"T0")\nplot(array.size(positionBoxes),"Boxes")';
const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
const events=[];
for(let i=0;i<data.length;i++){
 if(Number.isFinite(v('T0',i))){assert.equal(v('T0',i),Date.parse('2026-10-22T14:00:00+07:00'));assert.equal(v('Цена точки 0',i),104.57);}
 const side=v('Вход LONG/SHORT',i),exit=v('Выход TP 1 / SL -1 / неизвестно 2',i);
 if(side||exit)events.push([new Date(data[i].openTime+7*3600000).toISOString().slice(11,16),side,exit]);
}
assert.deepEqual(events,[['16:05',-1,0],['16:10',0,-1],['16:20',1,0],['16:45',0,1]]);
const firstBreak=data.findIndex(b=>b.openTime===Date.parse('2026-10-22T16:10:00+07:00'));
const secondBreak=firstBreak+1;
assert.equal(v('Состояние позиции',firstBreak),4,'first close through 2 only resolves first stop');
assert.equal(v('Boxes',firstBreak),2,'no second plan after one close through 2');
assert.equal(v('Состояние позиции',secondBreak),1,'second close through 2 creates second plan');
assert.equal(v('Boxes',secondBreak),4);
assert.equal(v('Вход LONG/SHORT',secondBreak),0,'confirmation itself is not a retest entry');
const retry=data.findIndex(b=>b.openTime===Date.parse('2026-10-22T16:20:00+07:00'));
assert.equal(v('Цена входа по close',retry),103.77);
assert.equal(v('Стоп позиции',retry),103.64);
assert.equal(v('Цель позиции',retry),103.99);
assert.ok(Math.abs(v('RR входа',retry)-1.6923076923)<1e-8);
assert.equal(v('Разворот закреплён за 0',retry),0,'retry exception must not require or invent origin breakout');
assert.equal(v('Входов за день',data.length-1),2);
const bodyLow=b=>Math.min(b.open,b.close),bodyHigh=b=>Math.max(b.open,b.close);
const clock=b=>new Date(b.openTime+7*3600000).toISOString().slice(11,16);
const day=data.filter(b=>new Date(b.openTime+7*3600000).toISOString().startsWith('2026-10-22'));
const measured=[];
for(const at of ['13:30','14:05','14:45']){
 const i=day.findIndex(b=>clock(b)===at),anchor=bodyLow(day[i]);
 const end=day.findIndex((b,j)=>j>i&&b.close<anchor);
 const peak=Math.max(...day.slice(i+1,end+1).map(bodyHigh));
 const last=day.findLastIndex((b,j)=>j>i&&j<=end&&bodyHigh(b)===peak);
 measured.push([at,clock(day[last]),peak,last-i+1]);
}
assert.deepEqual(measured,[['13:30','14:00',104.57,7],['14:05','14:20',104.46,4],['14:45','15:00',104.38,4]]);
console.log('PASS MEXC Oct 22: own-retreat HIGH origin 14:00 / 104.57, SHORT SL 16:10, second LONG 16:20, TP 16:45');
