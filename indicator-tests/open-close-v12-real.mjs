import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url);
const full=readFileSync(new URL('KRYTES_V1_2_LONDON_STRUCTURE.txt',root),'utf8');
const small=readFileSync(new URL('KRYTES_V1_2_LONDON_STRUCTURE_SMALL.txt',root),'utf8');
const old=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE.txt',root),'utf8');
const origin=s=>s.slice(s.indexOf('findRangeOrigin('),s.indexOf('// Опора отката допустима'));
assert.equal(origin(full),origin(old),'original point0 finder preserved exactly');
const normalize=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v));
let fillCount=0,exitCount=0;
for(const day of ['09','21','23','16'])for(const mirror of [false,true]){
 const name=day==='09'?'mexc-sol-usdt-m5-2026-10-09-v1-structure.json':day==='21'?'mexc-sol-usdt-m5-2026-10-21-v1-structure.json':day==='23'?'mexc-sol-usdt-m5-2026-10-23-structure-reversal.json':'mexc-sol-usdt-m5-2026-10-16.json';
 const f=JSON.parse(readFileSync(new URL('fixtures/'+name,import.meta.url))),p=x=>mirror?250-x:x;
 const d=f.candles.map(x=>({...x,open:p(x.open),close:p(x.close),high:mirror?p(x.low):x.high,low:mirror?p(x.high):x.low,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));

 const c=await new PineTS(d,'SOLUSDT','5').run(full+'\nplot(v12Zero,"testZero")\nplot(v12One,"testOne")\nplot(v12InitialSide,"testInitial")\nplot(v12FirstTarget,"testFirstGoal")\nplot(v12PlanKind,"testKind")');
 const compact=await new PineTS(d,'SOLUSDT','5').run(small);
 for(const n of Object.keys(compact.plots))assert.deepEqual(normalize(c.plots[n]),normalize(compact.plots[n]),'FULL/SMALL '+day+' '+n);
 const v=(n,i)=>c.plots[n].data[i].value;
 const captured=new Set();
 for(let i=0;i<d.length;i++){
  const dayKey=new Date(d[i].openTime+7*3600000).toISOString().slice(0,10);
  if(Number.isFinite(v('testZero',i))&&!captured.has(dayKey)){
   captured.add(dayKey);
   assert.ok(Number.isFinite(v('testZero',i)),'origin is available when the revised point1 confirms');
  }
 }

 const circles=c.plots.__labels__.data.flatMap(x=>x.value).filter(x=>!x._deleted&&x.style==='style_circle');
 const nested=c.plots.__labels__.data.flatMap(x=>x.value).filter(x=>!x._deleted&&['HL','LH'].includes(x.text));
 assert.equal(nested.length,0,'internal structure labels are hidden');
 const traces=c.plots.__lines__.data.flatMap(x=>x.value).filter(x=>!x._deleted&&x.style==='style_dashed');
 const boxes=c.plots.__boxes__.data.flatMap(x=>x.value).filter(x=>!x._deleted);
 let trade=null;const dayCounts=new Map(),stopped=new Set(),fills=[],exits=[];
 let priorDay='',firstGoal=null;
 for(let i=0;i<d.length;i++){
  const local=new Date(d[i].openTime+7*3600000).toISOString(),key=local.slice(0,10),clock=local.slice(11,16);
  if(key!==priorDay){firstGoal=null;priorDay=key;}
  const goal=v('testFirstGoal',i);
  if(Number.isFinite(goal)){if(firstGoal===null)firstGoal=goal;else assert.equal(goal,firstGoal,'first continuation target remains frozen');}else firstGoal=null;
  const side=v('Вход LONG/SHORT',i),event=v('Выход TP 1 / SL -1 / неизвестно 2',i);
  if(side){
   fillCount++;let count=(dayCounts.get(key)||0)+1;dayCounts.set(key,count);
   assert.ok(count<=2);if(count===2)assert.ok(stopped.has(key),'second entry requires first actual SL');
   const entry=v('Цена входа по close',i),stop=v('Стоп позиции',i),target=v('Цель позиции',i);
   if(v('testKind',i)===1)assert.equal(stop,v('testZero',i),'continuation uses original0, never an internal pivot');
   assert.ok(d[i].low<=entry&&d[i].high>=entry,'exact wick touch at fill');assert.ok(Math.abs(entry-(stop+target)/2)<1e-8);
   assert.ok(circles.some(x=>x.x===d[i].openTime&&x.y===entry&&x.text===String(count)&&x.color===(side===1?'#4CAF50':'#F23645')),'numbered side-colored entry circle');
   trade={side,entry,stop,target,time:d[i].openTime,day:key,count};fills.push([clock,side,entry,stop,target]);
  }
  if(event){
   exitCount++;assert.ok(trade,'exit needs an actual entry');assert.ok(d[i].openTime>trade.time);
   const price=event===-1?trade.stop:trade.target;
   if(event===-1){assert.ok(trade.side===1?Math.min(d[i].open,d[i].close)<=trade.stop:Math.max(d[i].open,d[i].close)>=trade.stop);if(trade.count===1)stopped.add(trade.day);}
   else assert.ok(trade.side===1?d[i].high>=trade.target:d[i].low<=trade.target);
   assert.ok(circles.some(x=>x.x===d[i].openTime&&x.y===price&&/^(Тейк|Стоп) /.test(x.tooltip)),'actual exit circle');
   assert.ok(traces.some(x=>x.x1===trade.time&&x.y1===trade.entry&&x.x2===d[i].openTime&&x.y2===price),'actual entry-to-exit dashed path');
   assert.ok(boxes.some(x=>x.right===d[i].openTime+300000),'closed instrument ends on next M5');
   exits.push([clock,event]);trade=null;
  }
 }
 if(day==='21'&&!mirror){
  assert.deepEqual(fills.map(x=>x.slice(0,2)),[['17:00',1]]);assert.deepEqual(exits,[['18:50',1]]);
  assert.equal(fills[0][3],105.95,'continuation stop stays at original0');
  assert.ok(Math.abs(fills[0][4]-p(107.04))<1e-8,'later107.50 HH cannot move first target');
 }
 if(day==='23'){
  assert.deepEqual(fills.map(x=>x.slice(0,2)),[['18:25',mirror?1:-1],['19:00',mirror?-1:1]]);
  assert.deepEqual(exits,[['18:45',-1],['20:40',1]]);assert.ok(Math.abs(fills[1][4]-p(104.8))<1e-8,'immediate return target is original1');
 }
 if(day==='09'&&!mirror){
  assert.deepEqual(fills.map(x=>x.slice(0,2)),[['21:15',-1]],'no false LONG before failed countertrend resolves');
  assert.deepEqual(exits,[['22:30',1]]);
 }
 if(day==='16'){
  assert.deepEqual(fills.map(x=>x.slice(0,2)),[['18:35',mirror?-1:1],['21:15',mirror?1:-1]]);
  assert.deepEqual(exits,[['19:10',-1],['22:05',1]],'point1 relocation removes the premature continuation entry');
  assert.ok(Math.abs(fills[0][3]-p(106.08))<1e-8);
  const capturedOne=c.plots.testOne.data.find((x,i)=>Number.isFinite(x.value)&&new Date(d[i].openTime+7*3600000).toISOString().startsWith('2026-10-16'));
  assert.ok(Math.abs(capturedOne.value-p(106.84))<1e-8,'106.84 is relocated1, not a new continuation HH');
  assert.ok(Math.abs(fills[1][4]-p(105.16))<1e-8,'countertrend target follows the third extreme before entry');
 }
 console.log('PASS V1.2 MEXC',day,'mirror='+mirror,JSON.stringify({fills,exits}));
}
assert.ok(fillCount>0&&exitCount>0);
console.log({fillCount,exitCount});
