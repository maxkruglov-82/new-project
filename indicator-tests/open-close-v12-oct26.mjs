import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const raw=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-10-26-body-confirmation.json',import.meta.url)));
const original=raw.candles.filter(x=>x.time*1000>=Date.parse('2026-10-25T00:00:00+07:00')&&x.time*1000<Date.parse('2026-10-27T12:00:00+07:00')).map(x=>({...x,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
const source=readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8')+'\nplot(v12NewPlan?1:0,"testNewPlan")';
for(const mirror of [false,true]){
 const p=x=>mirror?300-x:x;
 const bars=original.map(x=>({...x,open:p(x.open),close:p(x.close),high:mirror?p(x.low):x.high,low:mirror?p(x.high):x.low}));
 const c=await new PineTS(bars,'TEST','5').run(source),v=(name,i)=>c.plots[name].data[i].value;
 const fills=[],plans=[];
 for(let i=0;i<bars.length;i++){
  const t=new Date(bars[i].openTime+25200000).toISOString();if(!t.startsWith('2026-10-26'))continue;
  if(v('testNewPlan',i))plans.push({target:v('Цель позиции',i),t});
  if(v('Вход LONG/SHORT',i))fills.push({t,side:v('Вход LONG/SHORT',i),entry:v('Цена входа по close',i),stop:v('Стоп позиции',i),target:v('Цель позиции',i)});
 }
 assert.equal(plans.length,1);assert.ok(Math.abs(plans[0].target-p(101.89))<1e-8);
 assert.equal(fills.length,1);assert.equal(fills[0].t.slice(11,16),'20:25');assert.equal(fills[0].side,mirror?-1:1);
 for(const [field,expected] of Object.entries({entry:101.03,stop:100.17,target:101.89}))assert.ok(Math.abs(fills[0][field]-p(expected))<1e-8,field);
 console.log('PASS 26 Oct: unconfirmed intermediate extreme is not a point; mirror='+mirror,JSON.stringify(fills));
}
