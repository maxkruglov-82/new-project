import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const diagnostic=source+'\nplot(originalZero,"testZero")\nplot(originalOne,"testOne")\nplot(originalSide,"testSide")\nplot(originalCounterReady ? 1 : 0,"testCounter")\nplot(originalZeroBreakTime,"testBreak")\n';
let firstFills=0;
for(const day of ['09','16','26'])for(const mirror of [false,true]){
 const path=day==='09'?'fixtures/mexc-sol-usdt-m5-2026-10-09-v1-structure.json':`fixtures/mexc-sol-usdt-m5-2026-10-${day}.json`;
 const f=JSON.parse(readFileSync(new URL(path,import.meta.url))),p=x=>mirror?250-x:x;
 const d=f.candles.map(x=>({...x,open:p(x.open),close:p(x.close),high:mirror?p(x.low):x.high,low:mirror?p(x.high):x.low,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const c=await new PineTS(d,'SOLUSDT','5').run(diagnostic),v=(n,i)=>c.plots[n].data[i].value;
 for(let i=0;i<d.length;i++)if(v('Вход LONG/SHORT',i)&&v('Входов за день',i)===1){
  firstFills++;
  const side=v('Вход LONG/SHORT',i),same=side===v('testSide',i),stop=v('Стоп позиции',i),target=v('Цель позиции',i),entry=v('Цена входа по close',i);
  if(same){assert.equal(stop,v('testZero',i));assert.equal(target,v('testOne',i));}
  else{assert.equal(v('testCounter',i),1);assert.ok(Number.isFinite(v('testBreak',i)));}
  assert.ok(Math.abs(entry-(stop+target)/2)<1e-8);
  console.log('FILL',day,mirror,new Date(d[i].openTime+7*3600000).toISOString().slice(11,16),{same,side,entry,stop,target});
 }
 for(let i=0;i<d.length;i++)if(v('Выход TP 1 / SL -1 / неизвестно 2',i))console.log('EXIT',day,mirror,new Date(d[i].openTime+7*3600000).toISOString().slice(11,16),v('Выход TP 1 / SL -1 / неизвестно 2',i));
 console.log('PASS original-range policy',day,mirror);
}
assert.ok(firstFills>0,'fixtures must exercise first entries');
