import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('KRYTES_OPEN_CLOSE_MASKED.txt',root),'utf8');
assert.equal(source,readFileSync(new URL('KRYTES_OPEN_CLOSE_H1_BODY_RANGE.txt',root),'utf8'));
const cache=JSON.parse(readFileSync(new URL('new-project-2/drafts/bag-ab-2026-10-23/candles-six-months.json',root))).candles;
const oct22=JSON.parse(readFileSync(new URL('indicator-tests/fixtures/mexc-sol-usdt-m5-2026-10-22.json',root))).candles;
const oct23=JSON.parse(readFileSync(new URL('indicator-tests/fixtures/mexc-sol-usdt-m5-2026-10-23.json',root))).candles;
for(const day of ['2026-10-08','2026-10-19','2026-10-20','2026-10-22','2026-10-23']){
 const start=Date.parse(day+'T14:00:00+07:00'),end=start+86400000;
 const data=(day.endsWith('-23')?oct23:day.endsWith('-22')?oct22:cache).filter(b=>b.time*1000>=start&&b.time*1000<end).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+299999,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
 assert.equal(data.length,288);
 const tail={...data.at(-1),openTime:end,closeTime:end+299999};
 const ctx=await new PineTS([...data,tail],'SOLUSDT','5').run(source);
 const v=(n,i)=>ctx.plots[n].data[i].value;
 const entries=[];
 let firstResolved=null;
 for(let i=0;i<data.length;i++){
  if(v('Вход LONG/SHORT',i)){
   const side=v('Вход LONG/SHORT',i),entry=v('Цена входа по close',i),stop=v('Стоп позиции',i),target=v('Цель позиции',i);
   assert.equal(entry,data[i].close);
   assert.ok(side*(entry-stop)>0);
   assert.ok(side*(target-entry)>=side*(entry-stop)-1e-8,'RR >= 1');
   assert.ok(data[i].openTime>=start+3600000 && data[i].openTime+300000<start+36000000,'entry closes before midnight');
   if(entries.length)assert.equal(firstResolved,-1,'retry requires first SL');
   entries.push({side,entry,stop,target});
  }
  if(entries.length===1&&v('Выход TP 1 / SL -1 / неизвестно 2',i)) firstResolved=v('Выход TP 1 / SL -1 / неизвестно 2',i);
 }
 assert.ok(entries.length<=2);
 console.log('PASS historical body-only positions',day,JSON.stringify(entries));
}
