import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-21-low-origin.json',import.meta.url)));
const data=fixture.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedZeroTime,"T0")\nplot(firstExtremeTime,"T1")\nplot(structureFirstPrice,"P1")\nplot(structureSide,"Side")';
const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
let checked=0;
for(let i=0;i<data.length;i++){
 const at=v('T0',i);
 if(Number.isFinite(at)&&at>=Date.parse('2026-10-21T13:00:00+07:00')){
  assert.equal(at,Date.parse('2026-10-21T14:00:00+07:00'));
  assert.equal(v('Цена точки 0',i),105.95);
  const local=new Date(data[i].openTime+7*3600000).toISOString().slice(11,16);
  const clock=local<'16:30'?'15:45':local<'19:20'?'16:30':'19:20';
  assert.equal(v('T1',i),Date.parse('2026-10-21T'+clock+':00+07:00'));
  assert.equal(v('P1',i),local<'16:30'?107:local<'19:20'?107.04:107.05);assert.equal(v('Side',i),1,'HIGH 1 selects LOW 0');checked++;
 }
}
assert.ok(checked>0,'origin confirmed and kept immutable');
const local=b=>new Date(b.openTime+7*3600000).toISOString().slice(0,16);
const anchors=[['13:30',105.95,'14:00'],['14:50',106.45,'15:35']];
for(const [clock,price,last] of anchors){
 const i=data.findIndex(b=>local(b)==='2026-10-21T'+clock),ceiling=Math.max(data[i].open,data[i].close);
 let end=i+1;while(end<data.length&&local(data[end])<'2026-10-21T15:45'&&Math.max(data[end].open,data[end].close)<=ceiling)end++;
 assert.equal(end-i,11,'each anchor has eleven candles until its high is exceeded');
 const segment=data.slice(i+1,end),low=Math.min(...segment.map(b=>Math.min(b.open,b.close)));
 assert.equal(low,price);assert.equal(local(segment.findLast(b=>Math.min(b.open,b.close)===low)),'2026-10-21T'+last);
}
console.log('PASS real MEXC Oct 21: LOW 0 14:00 / 105.95; later 106.45 rejected; anchor low 105.85 excluded');
