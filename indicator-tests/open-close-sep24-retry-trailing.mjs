import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const f=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-09-24-retry.json',import.meta.url)));
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
{
 const mirror=false;
 const price=x=>mirror?230-x:x;
 const data=f.candles.map(b=>({open:price(b.open),close:price(b.close),high:mirror?price(b.low):b.high,low:mirror?price(b.high):b.low,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 const c=await new PineTS(data,'SOLUSDT','5').run(source+'\nplot(confirmedFifthPrice,"P5")\nplot(fifthLocked?1:0,"Locked5")');
 const v=(n,i)=>c.plots[n].data[i].value,at=t=>data.findIndex(b=>b.openTime===Date.parse('2026-09-24T'+t+':00+07:00'));
 // Native market validates the complete day; the mirrored market isolates retry management
 // from the intentionally different initial HIGH/LOW origin selectors.
 if(!mirror){
  assert.equal(v('Вход LONG/SHORT',at('17:45')),-1);
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',at('20:00')),-1);
  assert.equal(v('Стоп позиции',at('20:05')),112.67);
  assert.equal(v('Цель позиции',at('20:35')),115.2);
  assert.equal(v('Цель позиции',at('21:30')),116.32,'target follows new extreme after five-bar pause');
  assert.equal(v('Вход LONG/SHORT',at('21:50')),0,'first wick touch waits');
  assert.equal(v('Вход LONG/SHORT',at('21:55')),1);
  assert.ok(Math.abs(v('Цена входа по close',at('21:55'))-114.495)<1e-8);
  assert.equal(v('RR входа',at('21:55')),1);
  const events=data.flatMap((b,i)=>{const t=new Date(b.openTime+25200000).toISOString();return t.startsWith('2026-09-24')&&(v('Вход LONG/SHORT',i)||v('Выход TP 1 / SL -1 / неизвестно 2',i))?[[t.slice(11,16),v('Вход LONG/SHORT',i),v('Выход TP 1 / SL -1 / неизвестно 2',i)]]:[];});
  assert.deepEqual(events,[['17:45',-1,0],['20:00',0,-1],['21:55',1,0],['22:35',0,1]]);
  for(let i=at('21:55');i<=at('23:55');i++){
   assert.equal(v('Стоп позиции',i),112.67);assert.equal(v('Цель позиции',i),116.32,'filled target freezes');
  }
  assert.equal(v('Входов за день',at('23:55')),2);
 }
 console.log('PASS real MEXC Sep 24: SHORT SL, trailing retry LONG 21:55 at 114.495, TP 22:35');
}
