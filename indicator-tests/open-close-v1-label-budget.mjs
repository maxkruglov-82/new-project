import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url),current=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE.txt',root),'utf8');
const old=readFileSync(new URL('reports/backtest-2026-v1-hour-15-16/baseline-indicator.txt',root),'utf8');
const f=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-10-20-structure-reversal.json',import.meta.url)));
const d=f.candles.map(x=>({...x,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
const start=Date.parse('2026-10-01T00:00:00+07:00'),end=Date.parse('2026-10-11T00:00:00+07:00');
let inject='if barstate.islast\n';
for(const n of ['anchorHistoryDays','anchorZeroTimes','anchorZeroPrices','anchorOneTimes','anchorOnePrices','anchorZeroHighs','anchorTakeProfitTimes','structureHistoryTimes','structureHistoryPrices','structureHistoryHighs','structureHistoryDays'])inject+='    array.clear('+n+')\n';
for(let day=1;day<=10;day++){
 const t=Date.parse('2026-10-'+String(day).padStart(2,'0')+'T13:00:00+07:00'),key=20261000+day;
 for(const [n,v] of [['anchorHistoryDays',key],['anchorZeroTimes',t],['anchorZeroPrices',110],['anchorOneTimes',t+300000],['anchorOnePrices',100.01],['anchorZeroHighs','true'],['anchorTakeProfitTimes',t+19*300000]])inject+=`    array.push(${n},${v})\n`;
 for(let i=0;i<20;i++)for(const [n,v] of [['structureHistoryTimes',t+i*300000],['structureHistoryPrices',i%2===0?110+i*.01:100+i*.01],['structureHistoryHighs',i%2===0?'true':'false'],['structureHistoryDays',key]])inject+=`    array.push(${n},${v})\n`;
}
const run=async source=>{const engine=new PineTS(d,'SOLUSDT','5');engine.setVisibleRange(start,end-1);const c=await engine.run(source.replace('// На графике только 0/1',inject+'\n// На графике только 0/1'));return c.plots.__labels__.data.flatMap(x=>x.value).filter(x=>!x._deleted&&x.x>=start&&x.x<end);};
const before=await run(old),after=await run(current);
assert.ok(after.length<=120);
for(let day=1;day<=10;day++){
 const key='2026-10-'+String(day).padStart(2,'0');const marks=after.filter(x=>new Date(x.x+25200000).toISOString().startsWith(key));
 assert.equal(marks.filter(x=>x.text==='0 · H').length,1,'zero reserved '+key);
 assert.equal(marks.filter(x=>x.text==='1 · L').length,1,'one reserved '+key);
 assert.ok(marks.some(x=>x.text==='HH'),'earlier visible day retains highs '+key);
 assert.ok(marks.some(x=>x.text==='HL'),'earlier visible day retains lows '+key);
}
const beforeDays=new Set(before.filter(x=>/^(HH|HL|LH|LL)$/.test(x.text)).map(x=>new Date(x.x+25200000).toISOString().slice(0,10)));
assert.ok(beforeDays.size<10,'test reproduces older days losing structure under old allocation');
console.log('PASS120-label budget: ten visible days retain all20 anchors plus both HH/HL; old structure days='+beforeDays.size+', new=10; total='+after.length);
