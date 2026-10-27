import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
import {scenario} from './open-close-zero-condition.mjs';
const baseline=process.argv[2]?readFileSync(process.argv[2],'utf8'):null;
function candleColors(ctx,data){
 const colors=new Map(),bars=new Map(data.map(b=>[b.openTime,b]));
 for(const poly of ctx.plots.__polylines__.data[0].value){
  assert.equal(poly.curved,false);assert.equal(poly.closed,false);
  assert.equal(poly.points.length%4,0);
  for(let i=0;i<poly.points.length;i+=4){
   const p=poly.points.slice(i,i+4),bar=bars.get(p[1].time);assert.ok(bar);
   assert.deepEqual(p.slice(0,4).map(x=>x.price),[bar.open,bar.open,bar.close,bar.close],'body and ticks only, no wicks');
   if(i>0)assert.equal(p[1].time-poly.points[i-3].time,300000,'one polyline contains only contiguous candles, never jumps over other colors');
   assert.equal(p[0].time,bar.openTime-60000);assert.equal(p[3].time,bar.openTime+60000);
   assert.ok(!colors.has(bar.openTime),'each candle has one final color');
   colors.set(bar.openTime,poly.line_color);
  }
 }
 return colors;
}
for(const mirror of [false,true])for(const result of ['sl','tp']){
 const start=[[99.05,100.805],[100.805,100.81],[100.81,101.2],[101.2,100.7],[100.7,100.6],[100.6,100.5],[100.5,100.4],[100.4,101.21],[101.21,100.7]];
 const tail=result==='sl'?[[100.7,100.5],[100.5,100.4],[100.4,100.395],[100.395,100.39],[100.39,100.8],[100.8,101.22]]:[[100.7,101.3],[101.3,100.6],[100.6,100.7]];
 const {c,v,data}=await scenario(mirror,[...start,...tail]),colors=candleColors(c,data),up='#00E676',down='#F23645';
 const rising=mirror?down:up,falling=mirror?up:down;
 for(let i=8;i<=13;i++)assert.equal(colors.get(data[i].openTime),falling,'entire 0–1 colored');
 for(let i=14;i<=18;i++)assert.equal(colors.get(data[i].openTime),falling,'countertrend pullback stays initial color before origin confirmation');
 for(let i=19;i<=26;i++)assert.equal(colors.get(data[i].openTime),rising,'origin breakout changes color, then 2–3 and 3–4 retain it');
 if(result==='sl'){
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',28),-1);
  assert.equal(colors.get(data[28].openTime),rising,'stop candle remains colored');
  // A subsequent permitted second entry may resume coloring; the first
  // completed trade must not force rendering indefinitely on its own.
 }else{
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',27),1);
  assert.equal(colors.get(data[27].openTime),rising,'target candle remains colored');
  for(let i=28;i<data.length;i++)assert.equal(colors.has(data[i].openTime),false,'no color after TP');
 }
 if(baseline){
 const prior=await new PineTS(data,'SOLUSDT','5').run(baseline);
 for(const name of ['Вход LONG/SHORT','Выход TP 1 / SL -1 / неизвестно 2','Цена входа по close','Стоп позиции','Цель позиции','Входов за день'])for(let i=0;i<data.length;i++)assert.ok(Object.is(c.plots[name].data[i].value,prior.plots[name].data[i].value),`color-only change changed ${name} at ${i}`);
 }
 console.log('PASS persistent structural colors, complete bodies, TP/SL'+(baseline?' and unchanged trades':'' ),mirror?'SHORT':'LONG',result);
}
