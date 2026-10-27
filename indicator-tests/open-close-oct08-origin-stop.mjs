import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-08.json',import.meta.url)));
const original=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
for(const mirror of [false,true])for(const mode of ["normal","entryWick","nextWick","bodyControl"]){
 const bodyOnly=mode==="bodyControl";
 const data=fixture.candles.map(b=>({open:mirror?230-b.open:b.open,close:mirror?230-b.close:b.close,high:mirror?230-b.low:b.high,low:mirror?230-b.high:b.low,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 if(mode==='entryWick'||mode==='nextWick'){
  const at=Date.parse('2026-10-08T'+(mode==='entryWick'?'16:30':'16:35')+':00+07:00');
  const b=data.find(b=>b.openTime===at);
  if(mirror)b.high=230-114.83;else b.low=114.83;
 }
 const source=bodyOnly?original.replace('(originContinuation ? low : bodyLow)','bodyLow').replace('(originContinuation ? high : bodyHigh)','bodyHigh'):original;
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 const events=[];
 for(let i=0;i<data.length;i++){
  const t=new Date(data[i].openTime+7*3600000).toISOString().slice(0,16);
  if(!t.startsWith('2026-10-08'))continue;
  const side=v('Вход LONG/SHORT',i),exit=v('Выход TP 1 / SL -1 / неизвестно 2',i);
  if(side){
   const ref=x=>mirror?230-x:x;
   assert.equal(v('Цена входа по close',i),ref(115.19));
   assert.equal(v('Стоп позиции',i),ref(115.65));
   assert.equal(v('Цель позиции',i),ref(114.83));
   const threshold=(ref(115.65)+ref(114.83))/2;
   assert.ok(mirror?Math.min(data[i].open,data[i].close)>threshold:Math.max(data[i].open,data[i].close)<threshold,'body misses RR1');
   assert.ok(mirror?data[i].low<=threshold:data[i].high>=threshold,'wick touches RR1');
  }
  if(side||exit)events.push([t.slice(11),side,exit]);
 }
 assert.deepEqual(events,bodyOnly?[]:[['16:30',mirror?1:-1,0],[mode==='nextWick'?'16:35':'17:25',0,1]]);
 console.log('PASS MEXC Oct 8 continuation origin stop',mirror?'LONG mirror':'SHORT',mode);
}
