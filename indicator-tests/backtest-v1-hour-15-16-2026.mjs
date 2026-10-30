import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url),out=new URL('reports/backtest-2026-v1-hour-15-16/',root);
const input='/workspace/backtests/v72-2026-current/mexc-sol-usdt-m5-2026-ytd.json';
const local=t=>new Date(t+25200000).toISOString().replace('Z','+07:00'),STEP=300000,DAY=86400000;
const hash=s=>createHash('sha256').update(s).digest('hex');
function stats(trades){
 const tp=trades.filter(t=>t.status==='TP').length,sl=trades.filter(t=>t.status==='SL').length,unresolved=trades.length-tp-sl;
 const byDay=new Map();for(const t of trades){if(!byDay.has(t.day))byDay.set(t.day,[]);byDay.get(t.day).push(t);}
 let recoveries=0;for(const ts of byDay.values()){assert.ok(ts.length<=2);if(ts.length===2){assert.equal(ts[0].status,'SL');if(ts[1].status==='TP')recoveries++;}}
 return {executed:trades.length,tp,sl,unresolved,recoveredDays:recoveries,winRate:tp+sl?100*tp/(tp+sl):null,netR:tp-sl};
}
assert.deepEqual(stats([{day:'a',side:1,status:'SL'},{day:'a',side:-1,status:'TP'}]),{executed:2,tp:1,sl:1,unresolved:0,recoveredDays:1,winRate:50,netR:0});
mkdirSync(out,{recursive:true});
if(!process.argv.includes('--month')){
 for(let m=1;m<=10;m++){const r=spawnSync(process.execPath,[new URL(import.meta.url).pathname,'--month',String(m)],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
 const months=Array.from({length:10},(_,i)=>JSON.parse(readFileSync(new URL(`2026-${String(i+1).padStart(2,'0')}.json`,out))));
 assert.equal(new Set(months.map(m=>m.sourceSha256)).size,1);
 assert.equal(new Set(months.map(m=>m.inputSha256)).size,1);
 const trades=months.flatMap(m=>m.trades),summary=stats(trades);
 for(const k of ['executed','tp','sl','unresolved'])assert.equal(months.reduce((n,m)=>n+m[k],0),summary[k]);
 const result={sourceCommit:'experiment based on e14ff8e; hour15-16, two-close confirmations',exchange:'MEXC',symbol:'SOL_USDT perpetual',timeframe:'M5',timezone:'UTC+7',coverage:'2026-01-02 through 2026-10-25 inclusive',excluded:'Jan 1 lacks complete origin-search data; saved dataset ends Oct 25; Nov-Dec future',sourceSha256:months[0].sourceSha256,inputSha256:months[0].inputSha256,...summary,months:months.map(({trades,...m})=>m)};
 writeFileSync(new URL('summary.json',out),JSON.stringify(result,null,2)+'\n');
 const fields=['day','side','entryAt','entry','stop','target','rr','status','exitAt'];
 writeFileSync(new URL('trades.csv',out),[fields.join(','),...trades.map(t=>fields.map(k=>k==='side'?(t.side===1?'LONG':'SHORT'):(t[k]??'')).join(','))].join('\n')+'\n');
 writeFileSync(new URL('trades.json',out),JSON.stringify(trades,null,2)+'\n');
 const rows=months.map(m=>`|${m.month}|${m.executed}|${m.tp}|${m.sl}|${m.unresolved}|${m.winRate?.toFixed(2)}%|`).join('\n');
 writeFileSync(new URL('monthly.csv',out),['month,trades,tp,sl,unresolved,winRate',...months.map(m=>[m.month,m.executed,m.tp,m.sl,m.unresolved,m.winRate].join(','))].join('\n')+'\n');
 writeFileSync(new URL('report.md',out),`# Бэктест V1: эксперимент с диапазоном15:00–16:00: MEXC SOL_USDT, 2026\n\nM5, UTC+7. Доступные данные: 02.01–25.10.2026 включительно. 1 января исключено из-за неполной истории поиска точки 0; после 25 октября в использованном файле данных нет. Полный 2026 год ещё не завершён.\n\n**Каждый вход считается отдельной сделкой. SL и следующий TP в один день не объединяются.**\n\n|Месяц|Сделок|Тейков|Стопов|Незавершённых|Доля TP|\n|---|---:|---:|---:|---:|---:|\n${rows}\n|Итого|${summary.executed}|${summary.tp}|${summary.sl}|${summary.unresolved}|${summary.winRate?.toFixed(2)}%|\n\nДней SL→TP: ${summary.recoveredDays}; оба входа учтены раздельно. При одинаковом риске результат ${summary.netR}R до комиссий и проскальзывания. Ожидания без входа не считаются сделками. Незавершённые входы не включены в долю TP.\n\nМодель: два последовательных касания одного RR1; стоп по телу M5, тейк по тени; при обоих событиях на одной свече приоритет SL. Выходы проверяются со следующей свечи после входа. Каждое исполнение независимо проверено по OHLC. Месячные прогоны имеют два дня разогрева и следующий день для проверки выходов. Результат относится к модели индикатора, без порядка тиков внутри M5.\n\nИсходник: indicator.txt; его SHA256 и SHA256 данных указаны в summary.json. Все входы: trades.csv / trades.json.\n`);
 console.log('TOTAL',JSON.stringify(summary));process.exit(0);
}
const m=Number(process.argv[process.argv.indexOf('--month')+1]),key=`2026-${String(m).padStart(2,'0')}`;
const bytes=readFileSync(input),raw=JSON.parse(bytes),source=readFileSync(new URL('indicator.txt',out),'utf8');
assert.equal(raw.exchange,'MEXC');
const bars=raw.candles.map(b=>({open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+STEP-1}));
for(let i=0;i<bars.length;i++){const b=bars[i];assert.ok(b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close));if(i)assert.equal(b.openTime-bars[i-1].openTime,STEP);}
const begin=Math.max(Date.parse(key+'-01T00:00:00+07:00'),Date.parse('2026-01-02T00:00:00+07:00'));
const next=m===12?'2027-01':`2026-${String(m+1).padStart(2,'0')}`,end=Math.min(Date.parse(next+'-01T00:00:00+07:00'),bars.at(-1).openTime+STEP);
const data=bars.filter(b=>b.openTime>=begin-2*DAY&&b.openTime<end+DAY);
const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
const ledger=[];let active=null;
for(let i=0;i<data.length;i++){
 const b=data[i],entry=v('Вход LONG/SHORT',i),exit=v('Выход TP 1 / SL -1 / неизвестно 2',i),state=v('Состояние позиции',i);
 if(active&&state!==2&&!exit){active.status='unresolved_at_reset';active=null;}
 if(active&&i>active.index){
  const sl=active.side===1?Math.min(b.open,b.close)<=active.stop:Math.max(b.open,b.close)>=active.stop;
  const tp=active.side===1?b.high>=active.target:b.low<=active.target;
  assert.equal(exit,sl?-1:tp?1:0,`outcome mismatch ${local(b.openTime)}`);
  assert.equal(v('Стоп позиции',i),active.stop);assert.equal(v('Цель позиции',i),active.target);
 }
 if(exit){assert.ok(active,'exit without active fill');active.status=exit===1?'TP':'SL';active.exitAt=local(b.openTime);active=null;}
 if(entry){
  assert.ok(!active);const price=v('Цена входа по close',i),stop=v('Стоп позиции',i),target=v('Цель позиции',i);
  assert.ok(i>0&&b.openTime-data[i-1].openTime===STEP);
  for(const bar of [data[i-1],b])assert.ok(bar.low<=price+1e-8&&bar.high>=price-1e-8,'two touches required');
  assert.ok(Math.abs(price-(stop+target)/2)<1e-8);assert.ok(Math.abs(v('RR входа',i)-1)<1e-8);
  assert.ok(entry===1?Math.min(b.open,b.close)>stop:Math.max(b.open,b.close)<stop,'entry invalidated by body stop');
  active={day:local(b.openTime).slice(0,10),side:entry,entryAt:local(b.openTime),entry:price,stop,target,rr:v('RR входа',i),status:'open',index:i};ledger.push(active);
 }
}
const trades=ledger.filter(t=>t.entryAt>=local(begin)&&t.entryAt<local(end)).map(({index,...t})=>t);
const result={month:key,start:local(begin),endExclusive:local(end),checkedBars:data.length,sourceSha256:hash(source),inputSha256:hash(bytes),...stats(trades),trades};
writeFileSync(new URL(key+'.json',out),JSON.stringify(result,null,2)+'\n');console.log(key,JSON.stringify(stats(trades)));
