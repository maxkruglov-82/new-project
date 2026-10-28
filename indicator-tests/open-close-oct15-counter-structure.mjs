import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const f=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-15-counter-structure.json',import.meta.url)));
assert.equal(f.exchange,'MEXC');
const original=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const diagnostics=`\nplot(confirmedZeroTime,"T0")\nplot(counterExtreme,"C3")\nplot(counterPullback,"C5")\nplot(counterStopPrice,"CS")\nplot(counterReversalReady?1:0,"CounterReady")\nplot(positionIsZero?1:0,"ZeroPlan")\nplot(na(positionInfo)?0:1,"VisiblePlan")\nplot(label.get_y(counterThirdLabel),"Label3")\nplot(label.get_y(counterFifthLabel),"Label5")\nplot(label.get_y(counterSixthLabel),"Label6")\nplot(label.get_x(counterFifthLabel),"Time5")\nplot(str.endswith(label.get_text(positionTargetInfo)," +")?1:0,"TPPlus")\nplot(str.endswith(label.get_text(positionStopInfo)," +")?1:0,"SLPlus")`;
async function run(mirror=false,variant='base'){
 const candles=f.candles.map(b=>({...b})),clock=b=>new Date(b.time*1000+7*3600000).toISOString().slice(0,16);
 if(variant==='origin-before-3'){
  candles.find(b=>clock(b)==='2026-10-15T19:55').close=101.81;
  const bounce=candles.find(b=>clock(b)==='2026-10-15T20:00');bounce.open=101.81;bounce.close=102.55;bounce.high=102.55;
  const next=candles.find(b=>clock(b)==='2026-10-15T20:05');next.open=102.55;next.high=Math.max(next.high,102.55);
 }
 if(variant==='higher-5'){
  const a=candles.find(b=>clock(b)==='2026-10-15T18:50'),b=candles.find(b=>clock(b)==='2026-10-15T18:55');
  a.close=102.8;a.high=102.8;b.open=102.8;b.high=102.8;
 }
 for(const b of candles){assert.ok(b.high>=Math.max(b.open,b.close));assert.ok(b.low<=Math.min(b.open,b.close));}
 const data=candles.map(b=>({open:mirror?240-b.open:b.open,close:mirror?240-b.close:b.close,high:mirror?240-b.low:b.high,low:mirror?240-b.high:b.low,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 // Mirroring isolates swing handling from asymmetric initial HIGH/LOW selectors.
 let source=original;
 if(mirror)source=source.replace('            confirmedZeroTime := rangeOriginTime','            confirmedZeroTime := rangeOriginTime\n            if rangeDayKey == 20261015\n                confirmedZeroPrice := 138.18\n                confirmedZeroTime := '+Date.parse('2026-10-15T13:50:00+07:00'));
 const c=await new PineTS(data,'SOLUSDT','5').run(source+diagnostics),v=(n,i)=>c.plots[n].data[i].value;
 const at=t=>data.findIndex(b=>b.openTime===Date.parse('2026-10-15T'+t+':00+07:00'));
 return {data,c,v,at,price:x=>Number((mirror?240-x:x).toFixed(8))};
}
for(const mirror of [false,true]){
 const {data,c,v,at,price}=await run(mirror);
 assert.equal(v('C3',at('16:30')),price(102.88));
 assert.equal(v('C3',at('17:20')),price(101.83),'3 follows new countertrend extremes');
 assert.equal(v('C5',at('17:50')),price(102.39));
 assert.equal(v('C5',at('18:35')),price(102.63),'5 moves to later higher pullback extreme');
 assert.equal(v('C3',at('19:30')),price(101.83),'one close does not confirm or move level');
 assert.equal(v('C3',at('19:35')),price(101.81),'failed counter-level pair relocates 3');
 assert.equal(v('Цена точки 0',at('19:35')),price(101.82),'initial 0 retained with established 3–5');
 assert.equal(v('T0',at('19:35')),Date.parse('2026-10-15T13:50:00+07:00'));
 assert.equal(v('Действующий цвет тренда',at('19:35')),mirror?-1:1);
 assert.equal(v('CounterReady',at('19:50')),0);
 assert.equal(v('Разворот закреплён за 0',at('19:50')),0);
 assert.equal(v('CounterReady',at('19:55')),1);
 assert.equal(v('Разворот закреплён за 0',at('19:55')),1);
 assert.equal(v('Стоп позиции',at('19:55')),price(102.63),'stop at 5, not original first point');
 assert.equal(v('Вход LONG/SHORT',at('19:55')),0,'confirmation itself cannot fill retrospectively');
 assert.equal(v('Граница RR 1:1',at('20:30')),price(102.06));
 assert.equal(v('Цена входа по close',at('20:35')),price(102.08));
 assert.ok(Math.abs(v('RR входа',at('20:35'))-0.59/0.55)<1e-8);
 assert.equal(v('Label3',at('20:35')),price(101.81));
 assert.equal(v('Label5',at('20:35')),price(102.63));
 assert.equal(v('Time5',at('20:35')),Date.parse('2026-10-15T18:40:00+07:00'));
 assert.equal(v('Label6',at('20:35')),price(101.49));
 const events=data.flatMap((b,i)=>{
  const dt=new Date(b.openTime+7*3600000).toISOString().slice(0,16);if(!dt.startsWith('2026-10-15'))return [];
  const entry=v('Вход LONG/SHORT',i),exit=v('Выход TP 1 / SL -1 / неизвестно 2',i);return entry||exit?[[dt.slice(11),entry,exit]]:[];
 });
 assert.deepEqual(events,[['20:35',mirror?1:-1,0],['20:45',0,1]]);
 assert.equal(v('TPPlus',at('20:45')),1);assert.equal(v('SLPlus',at('20:45')),0);
 for(let i=at('20:35');i<data.length;i++){
  assert.equal(v('Стоп позиции',i),price(102.63));assert.equal(v('Цель позиции',i),price(101.49));
  assert.equal(v('Label6',i),price(101.49),'target marker freezes with executed trade');
 }
 assert.equal(v('Входов за день',data.length-1),1,'TP does not permit a second trade');
 const after=data[at('20:45')].openTime;
 for(const poly of c.plots.__polylines__.data[0].value)for(const p of poly.points.filter(p=>Number.isFinite(p.price))){
  if(new Date(p.time+7*3600000).toISOString().startsWith('2026-10-15'))assert.ok(p.time<=after+60000,'color ends after TP candle');
 }
 console.log('PASS MEXC Oct 15 counter 3–5, last-pullback stop and TP',mirror?'mirrored LONG':'real SHORT');
}
{
 const {v,at}=await run(false,'origin-before-3');
 assert.equal(v('Разворот закреплён за 0',at('19:55')),1,'two origin closes completed');
 assert.equal(v('CounterReady',at('19:55')),0,'latest 3 did not confirm');
 assert.equal(v('ZeroPlan',at('19:55')),0,'origin alone cannot bypass a waiting 3–5 structure');
 assert.equal(v('Вход LONG/SHORT',at('19:55')),0);
 assert.equal(v('Вход LONG/SHORT',at('20:00')),0,'old regular plan cannot bypass latest 3 gate on a high retrace');
 assert.equal(v('VisiblePlan',at('20:00')),0,'forbidden old plan stays hidden');
 console.log('PASS established 3–5 requires its own two-close break, not origin alone');
}
{
 const {v,at}=await run(false,'higher-5');
 assert.equal(v('Стоп позиции',at('19:55')),102.8,'a later higher 5 actually changes stop, no hard-coded screenshot level');
 assert.equal(v('Граница RR 1:1',at('20:30')),102.145);
 console.log('PASS later higher pullback 5 changes stop and RR calculation');
}
