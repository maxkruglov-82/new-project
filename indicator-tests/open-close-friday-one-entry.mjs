import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const f=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-16.json',import.meta.url)));
const data=f.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const c=await new PineTS(data,'SOLUSDT','5').run(source+'\nplot(positionIsSecond?1:0,"Second")\nplot(dailyEntryLimit,"Limit")');
const v=(n,i)=>c.plots[n].data[i].value,events=[];
for(let i=0;i<data.length;i++){
 const t=new Date(data[i].openTime+25200000).toISOString();if(!t.startsWith('2026-10-16'))continue;
 assert.equal(v('Limit',i),1);assert.ok(v('Входов за день',i)<=1);
 const entry=v('Вход LONG/SHORT',i),exit=v('Выход TP 1 / SL -1 / неизвестно 2',i);
 if(entry||exit)events.push([t.slice(11,16),entry,exit]);
 if(t.slice(11,16)>='18:10'){assert.equal(v('Second',i),0);assert.equal(v('Входов за день',i),1);}
}
assert.deepEqual(events,[['17:35',-1,0],['18:10',0,-1]]);
console.log('PASS real MEXC Friday Oct 16: first SHORT 17:35, SL 18:10; second LONG 19:30 forbidden');
