import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PineTS} from '/workspace/new-project/new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const dir=new URL('./',import.meta.url).pathname;
const sourcePath='/workspace/backtests/v72-2026-current/mexc-sol-usdt-m5-2026-ytd.json';
const raw=readFileSync(sourcePath),dataset=JSON.parse(raw);
assert.equal(dataset.exchange,'MEXC');assert.equal(dataset.symbol,'SOL_USDT');assert.equal(dataset.interval,'Min5');
const lower=Date.parse('2026-09-28T00:00:00+07:00'),upper=Date.parse('2026-10-28T00:00:00+07:00');
const data=dataset.candles.filter(b=>b.time*1000>=lower&&b.time*1000<upper).map(b=>({open:b.open,close:b.close,high:b.high,low:b.low,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
for(let i=0;i<data.length;i++){
 const b=data[i];for(const x of [b.open,b.close,b.high,b.low])assert.ok(Number.isFinite(x)&&x>0);
 assert.ok(b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close));
 if(i)assert.equal(b.openTime-data[i-1].openTime,300000,'continuous actual M5, no synthetic padding');
}
const byTime=new Map(data.map((b,i)=>[b.openTime,i]));
const date=t=>new Date(t+7*3600000).toISOString().slice(0,10);
const time=t=>Number.isFinite(t)?new Date(t+7*3600000).toISOString().slice(11,16):null;
const instrument='\nplot(confirmedZeroTime,"AUDIT T0")\nplot(firstExtremeTime,"AUDIT T1")\nplot(structureFirstPrice,"AUDIT P1")\nplot(structureSide,"AUDIT SIDE")\nplot(firstSwingDisplayLocked?1:0,"AUDIT READY")\nplot(structureDay,"AUDIT DAY")';
const observations={};
for(const [name,file] of [['current','indicator.txt'],['before','baseline.txt']]){
 const source=readFileSync(dir+file,'utf8');
 const c=await new PineTS(data,'SOLUSDT','5').run(source+instrument),v=(n,i)=>c.plots[n].data[i].value;
 const days={};
 for(let i=0;i<data.length;i++){
  const d=date(data[i].openTime),dayKey=Number(d.replaceAll('-',''));
  if(!d.startsWith('2026-10')||v('AUDIT READY',i)!==1||v('AUDIT DAY',i)!==dayKey)continue;
  const entry={price:v('Цена точки 0',i),at:v('AUDIT T0',i),firstPrice:v('AUDIT P1',i),firstAt:v('AUDIT T1',i),side:v('AUDIT SIDE',i)};
  if(!days[d])days[d]={...entry,confirmedAt:data[i].openTime};
  else for(const key of ['price','at'])assert.ok(Object.is(days[d][key],entry[key]),'origin cannot be rewritten later in same day');
 }
 observations[name]=days;
 console.log('completed',name,'actual M5',data.length,'October days with confirmed 1',Object.keys(days).length);
}
const rows=[];
const bodyLow=b=>Math.min(b.open,b.close),bodyHigh=b=>Math.max(b.open,b.close);
for(let day=1;day<=27;day++){
 const d=`2026-10-${String(day).padStart(2,'0')}`,midnight=Date.parse(d+'T00:00:00+07:00');
 const weekend=[0,6].includes(new Date(midnight+7*3600000).getUTCDay());
 const complete=Array.from({length:288},(_,k)=>byTime.has(midnight+k*300000)).every(Boolean);
 const row={date:d,status:weekend?'weekend':!complete?'missing_data':'pending'};
 if(weekend||!complete){rows.push(row);continue;}
 const actual=observations.current[d],old=observations.before[d];
 if(!actual){row.status='no_confirmed_first';rows.push(row);continue;}
 row.kind=actual.side===1?'LOW':'HIGH';row.firstTime=time(actual.firstAt);row.firstPrice=actual.firstPrice;
 const candidates=[];
 if(row.kind==='LOW'){
  const firstIndex=byTime.get(actual.firstAt);
  for(let i=byTime.get(midnight+13*3600000);i<firstIndex;i++){
   const ceiling=bodyHigh(data[i]);let end=i+1;
   while(end<firstIndex&&data[end].openTime-data[i].openTime===(end-i)*300000&&bodyHigh(data[end])<=ceiling)end++;
   if(end-i<5)continue;
   const segment=data.slice(i+1,end),price=Math.min(...segment.map(bodyLow));
   const at=segment.findLast(b=>bodyLow(b)===price).openTime;
   candidates.push({anchorTime:time(data[i].openTime),anchorPrice:ceiling,span:end-i,price,at,originTime:time(at),endTime:time(data[end].openTime)});
  }
  // All candidates are enumerated independently. A later higher low cannot replace
  // an earlier lower one; equal minima use their last occurrence.
  const expected=candidates.reduce((best,x)=>!best||x.price<best.price||(x.price===best.price&&x.at>best.at)?x:best,null);
  if(!expected){assert.ok(!Number.isFinite(actual.price));row.status='no_eligible_origin';rows.push(row);continue;}
  assert.equal(actual.price,expected.price,d+' LOW price');assert.equal(actual.at,expected.at,d+' LOW time');
  row.candidates=candidates;row.distinctCandidates=[...new Map(candidates.map(x=>[x.price+':'+x.at,{time:x.originTime,price:x.price}])).values()];
 }else{
  assert.ok(Object.is(actual.price,old.price)&&Object.is(actual.at,old.at),d+' HIGH must stay unchanged');
 }
 row.status='verified';row.originTime=time(actual.at);row.originPrice=actual.price;
 row.previousTime=time(old.at);row.previousPrice=old.price;row.changed=actual.at!==old.at||actual.price!==old.price;
 rows.push(row);
}
const summary={};for(const key of ['verified','weekend','missing_data','no_confirmed_first','no_eligible_origin'])summary[key]=rows.filter(r=>r.status===key).length;
summary.low=rows.filter(r=>r.status==='verified'&&r.kind==='LOW').length;summary.high=rows.filter(r=>r.status==='verified'&&r.kind==='HIGH').length;summary.changedLow=rows.filter(r=>r.kind==='LOW'&&r.changed).length;
const result={exchange:'MEXC',symbol:'SOL_USDT',interval:'M5',timezone:'Asia/Krasnoyarsk',indicatorCommit:process.argv[2]??'working-low',baselineCommit:'09180e2',sourcePath,sourceSha256:createHash('sha256').update(raw).digest('hex'),indicatorSha256:createHash('sha256').update(readFileSync(dir+'indicator.txt')).digest('hex'),summary,rows};
writeFileSync(dir+'origins.json',JSON.stringify(result,null,2)+'\n');
const fields=['date','status','kind','firstTime','firstPrice','originTime','originPrice','previousTime','previousPrice','changed'];
writeFileSync(dir+'origins.csv',fields.join(',')+'\n'+rows.map(r=>fields.map(k=>r[k]??'').join(',')).join('\n')+'\n');
let report='# Пересчёт LOW точки 0 за октябрь 2026\n\nMEXC SOL_USDT perpetual, M5, Красноярск UTC+7. BingX не проверен. Реальные данные доступны по 25 октября включительно; 26–27 октября отсутствуют, API недоступен (HTTP 403). Выходные пропущены по действующим правилам индикатора.\n\nВерсия: `'+result.indicatorCommit+'`. Сравнение с `09180e2`.\n\nПроверено '+summary.low+' LOW независимым перебором кандидатов; '+summary.high+' HIGH совпали с прежней версией. Изменилось LOW: '+summary.changedLow+'.\n\n| Дата | Тип | 1: время / цена | 0: время / цена | Прежняя 0 | Изменена |\n|---|---|---|---|---|---|\n';
for(const r of rows.filter(r=>r.status==='verified'))report+=`| ${r.date} | ${r.kind} | ${r.firstTime} / ${r.firstPrice} | ${r.originTime} / ${r.originPrice} | ${r.previousTime} / ${r.previousPrice} | ${r.changed?'да':'нет'} |\n`;
report+='\nLOW: каждая исходная свеча от 13:00 строго до 1; считаем участок до первой свечи с более высоким максимумом тела, исключая обновившую свечу и свечу 1. Минимум 5 вместе с исходной. Минимум отката берём только после исходной свечи. Выбираем более низкого кандидата; более поздний, но более высокий не заменяет его. Равный low отмечаем последним временем. Тени исключены. Разрывы останавливают отсчёт. 0 не меняется после подтверждения 1. HIGH не менялся. Это пересчёт точек 0, а не полный отчёт доходности сделок.\n\nSHA-256 котировок: `'+result.sourceSha256+'`.\nSHA-256 индикатора: `'+result.indicatorSha256+'`.\n';
writeFileSync(dir+'report.md',report);console.log(JSON.stringify(summary));
for(const r of rows.filter(r=>r.kind==='LOW'))console.log(r.date,r.originTime,r.originPrice,r.changed?'changed':'same');
