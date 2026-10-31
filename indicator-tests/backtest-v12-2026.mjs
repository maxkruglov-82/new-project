import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const out=new URL('../reports/backtest-2026-v12-e7f6d3f/',import.meta.url);
const provenance=JSON.parse(readFileSync(new URL('provenance.json',out))),bytes=readFileSync(provenance.inputPath),raw=JSON.parse(bytes),source=readFileSync(new URL('indicator.txt',out),'utf8');
const hash=x=>createHash('sha256').update(x).digest('hex'),step=300000,day=86400000,local=t=>new Date(t+25200000).toISOString().replace('Z','+07:00');
assert.equal(hash(source),provenance.sourceSha256);assert.equal(hash(bytes),provenance.inputSha256);
const month=Number(process.argv[2]);assert.ok(month>=1&&month<=10);
const key=`2026-${String(month).padStart(2,'0')}`,begin=Date.parse(key+'-01T00:00:00+07:00'),next=Date.parse(`2026-${String(month+1).padStart(2,'0')}-01T00:00:00+07:00`),cutoff=Date.parse(provenance.cutoff),end=Math.min(next,cutoff);
const ahead=Number(process.argv[3]||7),sampleEnd=Math.min(end+ahead*day,cutoff);
const data=raw.candles.filter(b=>b.time*1000>=begin-7*day&&b.time*1000<sampleEnd).map(b=>({open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+step-1}));
for(let i=1;i<data.length;i++)assert.equal(data[i].openTime-data[i-1].openTime,step);
console.log('START',key,'bars',data.length,'sampleEnd',local(sampleEnd));
const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
const ledger=[];let active=null;
for(let i=0;i<data.length;i++){
 const b=data[i],entry=v('Вход LONG/SHORT',i),exit=v('Выход TP 1 / SL -1 / неизвестно 2',i),state=v('Состояние позиции',i);
 assert.ok([0,1,-1].includes(exit));assert.ok([0,1,-1].includes(entry));
 if(active&&state!==2&&!exit)assert.fail('active trade disappeared '+local(b.openTime));
 if(active&&i>active.index){
  const sl=active.side===1?Math.min(b.open,b.close)<=active.stop:Math.max(b.open,b.close)>=active.stop;
  const tp=active.side===1?b.high>=active.target:b.low<=active.target;
  assert.equal(exit,sl?-1:tp?1:0,'independent OHLC outcome '+local(b.openTime));
 }
 if(exit){assert.ok(active,'exit without fill '+local(b.openTime));assert.ok(i>active.index);active.status=exit===1?'TP':'SL';active.exitAt=local(b.openTime);active.exitPrice=exit===1?active.target:active.stop;active=null;}
 if(entry){
  assert.ok(!active,'overlapping positions');const price=v('Цена входа по close',i),stop=v('Стоп позиции',i),target=v('Цель позиции',i);
  assert.ok(b.low<=price+1e-8&&b.high>=price-1e-8,'exact wick touch '+local(b.openTime));assert.ok(Math.abs(price-(stop+target)/2)<1e-8,'RR midpoint');
  assert.ok(entry===1?Math.min(b.open,b.close)>stop:Math.max(b.open,b.close)<stop,'body stop invalidates entry');
  active={day:local(b.openTime).slice(0,10),side:entry,entryAt:local(b.openTime),entry:price,stop,target,rr:1,status:'OPEN',exitAt:null,exitPrice:null,index:i};ledger.push(active);
 }
}
const clean=t=>{const {index,...r}=t;return r;},trades=ledger.filter(t=>Date.parse(t.entryAt)>=begin&&Date.parse(t.entryAt)<end).map(clean);
const groups=new Map();for(const t of ledger){if(!groups.has(t.day))groups.set(t.day,[]);groups.get(t.day).push(t);}for(const ts of groups.values()){assert.ok(ts.length<=2);if(ts.length===2)assert.equal(ts[0].status,'SL','second trade only after first SL');}
const tp=trades.filter(t=>t.status==='TP').length,sl=trades.filter(t=>t.status==='SL').length,open=trades.filter(t=>t.status==='OPEN').length;
const result={month:key,start:local(begin),endExclusive:local(end),sampleEnd:local(sampleEnd),checkedBars:data.length,sourceCommit:provenance.sourceCommit,sourceSha256:hash(source),inputSha256:hash(bytes),executed:trades.length,tp,sl,open,winRate:tp+sl?100*tp/(tp+sl):null,netR:tp-sl,trades,auditTrades:ledger.map(clean)};
writeFileSync(new URL(key+'.json',out),JSON.stringify(result,null,2)+'\n');console.log('DONE',key,JSON.stringify({executed:trades.length,tp,sl,open,winRate:result.winRate}));
