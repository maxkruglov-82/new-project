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
for(let day=1;day<=27;day++){
 const d=`2026-10-${String(day).padStart(2,'0')}`,midnight=Date.parse(d+'T00:00:00+07:00'),weekday=new Date(midnight+7*3600000).getUTCDay();
 const complete=Array.from({length:288},(_,k)=>byTime.has(midnight+k*300000)).every(Boolean);
 const row={date:d,weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][weekday],completeData:complete,status:'',kind:null,originTime:null,originPrice:null,firstTime:null,firstPrice:null,previousTime:null,previousPrice:null,changed:false,checks:[]};
 if(weekday===0||weekday===6){row.status='weekend';rows.push(row);continue;}
 if(!complete){row.status='missing_data';rows.push(row);continue;}
 const actual=observations.current[d],old=observations.before[d];
 if(!actual){row.status='no_confirmed_first';rows.push(row);continue;}
 row.kind=actual.side===-1?'HIGH':'LOW';row.firstTime=time(actual.firstAt);row.firstPrice=actual.firstPrice;
 const candidates=[];
 const firstIndex=byTime.get(actual.firstAt);
 assert.ok(Number.isInteger(firstIndex));
 for(let i=0;i<data.length;i++){
  const b=data[i];if(b.openTime<midnight+13*3600000||b.openTime>=actual.firstAt)continue;
  const price=row.kind==='HIGH'?Math.max(b.open,b.close):Math.min(b.open,b.close);
  const sideBars=row.kind==='HIGH'?data.slice(byTime.get(midnight),i).reverse():data.slice(i+1,firstIndex+1);
  let score=0;
  for(const other of sideBars){
   if(Math.abs(other.openTime-b.openTime)!==(score+1)*300000)break;
   if(row.kind==='HIGH'?other.close>price:other.close<price)break;
   score++;
  }
  if(row.kind==='HIGH'&&score<5)continue;
  candidates.push({at:b.openTime,price,score});
 }
 const expected=candidates.reduce((best,x)=>!best||x.score>best.score||(x.score===best.score&&(row.kind==='HIGH'?x.price>best.price:x.price<best.price))?x:best,null);
 if(!expected){assert.ok(!Number.isFinite(actual.price));row.status='no_eligible_origin';rows.push(row);continue;}
 assert.ok(Math.abs(actual.price-expected.price)<1e-9,`${d} price mismatch`);assert.equal(actual.at,expected.at,`${d} time mismatch`);
 assert.ok(actual.at>=midnight+13*3600000&&actual.at<actual.firstAt);
 row.score=expected.score;row.status='verified';row.originTime=time(actual.at);row.originPrice=actual.price;
 row.previousTime=time(old?.at);row.previousPrice=Number.isFinite(old?.price)?old.price:null;
 row.changed=!old||actual.at!==old.at||actual.price!==old.price;
 row.checks=['body price','13:00 <= 0 < 1','independent full candidate enumeration','same-day immutability',row.kind==='HIGH'?'maximum left close-bounded span, at least 5 M5':'maximum right close-bounded span, lower LOW wins ties'];
 row.candidates=candidates.length;
 rows.push(row);
}
const result={exchange:'MEXC',symbol:'SOL_USDT',interval:'M5',timezone:'Asia/Krasnoyarsk',requestedPeriod:['2026-10-01','2026-10-27'],completeSourceEnd:date(data.at(-1).openTime)+' '+time(data.at(-1).openTime),sourcePath,sourceSha256:createHash('sha256').update(raw).digest('hex'),indicatorCommit:process.argv[2]??'working-span',indicatorSha256:createHash('sha256').update(readFileSync(dir+'indicator.txt')).digest('hex'),baselineCommit:'0b0f7c3',rows};
result.summary={};for(const status of ['verified','weekend','missing_data','no_confirmed_first','no_eligible_origin'])result.summary[status]=rows.filter(r=>r.status===status).length;
result.summary.changed=rows.filter(r=>r.status==='verified'&&r.changed).length;result.summary.high=rows.filter(r=>r.status==='verified'&&r.kind==='HIGH').length;result.summary.low=rows.filter(r=>r.status==='verified'&&r.kind==='LOW').length;
writeFileSync(dir+'origins.json',JSON.stringify(result,null,2)+'\n');
const fields=['date','weekday','status','kind','originTime','originPrice','firstTime','firstPrice','score','previousTime','previousPrice','changed'];
writeFileSync(dir+'origins.csv',fields.join(',')+'\n'+rows.map(r=>fields.map(k=>r[k]??'').join(',')).join('\n')+'\n');
let report='# Проверка точек 0 за октябрь 2026\n\nБиржа **MEXC**, SOL_USDT perpetual, M5. Часовой пояс **Красноярск, UTC+7**. Котировок BingX в этом прогоне нет.\n\nВерсия: `'+result.indicatorCommit+'`. Сравнение с опубликованной `0b0f7c3`. Новый выбор по максимальной длине участка до перекрытия close. Это сравнение точек 0, не результатов сделок и не визуальное подтверждение терминала BingX.\n\nПериод запроса: 1–27 октября (завершённые дни на момент запуска). Сохранённые реальные котировки покрывают дни по 25 октября полностью. API недоступен через сетевой прокси, HTTP 403; 26–27 октября не проверены. 28–31 октября в этот прогон не включены.\n\nПроверено: **'+result.summary.verified+' точек 0**, HIGH '+result.summary.high+', LOW '+result.summary.low+'. Изменилось относительно прежнего выбора: **'+result.summary.changed+'**. Выходных: '+result.summary.weekend+'. Дней без подтверждённой 1: '+result.summary.no_confirmed_first+'. Дней без допустимой 0: '+result.summary.no_eligible_origin+'. Недостающих дней: '+result.summary.missing_data+'.\n\n| Дата | Тип 0 | Время 0 | Цена 0 | Время 1 | Цена 1 | Прежняя 0 | Изменена | Свечей |\n|---|---|---|---:|---|---:|---|---|---:|\n';
for(const r of rows.filter(r=>r.status==='verified'))report+=`| ${r.date} | ${r.kind} | ${r.originTime} | ${r.originPrice} | ${r.firstTime} | ${r.firstPrice} | ${r.previousTime} / ${r.previousPrice} | ${r.changed?'да':'нет'} | ${r.score} |\n`;
report+='\nВсе проверенные 0 совпали с независимым перебором. Для HIGH считаются свечи слева до первого close выше выбранного high; минимум пять. Левый отсчёт использует историю текущего календарного дня, доступную до кандидата (включая время до 13:00). Для LOW считаются свечи справа до первого close ниже выбранного low, не позже свечи 1. Тени и равенство не прерывают счёт. Выбирается наибольшее число свечей; при равенстве HIGH выше, LOW ниже, затем самое раннее время. Кандидат 0 — от 13:00 включительно строго до 1. Цена — край тела. Фракталы не используются.\n\nНеизменность 0 после подтверждения 1 проверена на всех оставшихся свечах каждого дня. Входные OHLC проверены на корректность и непрерывность, пропуски не заполнены синтетическими свечами.\n\nИсточник: `'+sourcePath+'`.\n\nSHA-256 источника: `'+result.sourceSha256+'`.\n\nSHA-256 индикатора: `'+result.indicatorSha256+'`.\n\nВоспроизведение: `node /workspace/backtests/open-close-october-origin-span-2026-10-28/run.mjs`.\n';
writeFileSync(dir+'report.md',report);console.log(JSON.stringify(result.summary));console.log(rows.filter(r=>r.status==='verified').map(r=>[r.date,r.kind,r.originTime,r.originPrice,r.changed]));
