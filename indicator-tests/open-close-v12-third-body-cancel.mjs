import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const sources={baseline:readFileSync(new URL('../reports/backtest-2026-body-confirmed-extremes/draft/indicator.txt',import.meta.url),'utf8'),draft:readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8')};
for(const mirror of [false,true])for(const mode of ['cancel','samebar-touch','filled','wick-only']){
 const p=x=>mirror?200-x:x,start=Date.UTC(2026,9,20,5);
 const values=[100,99,101,102,104,105,104,103.5,104,104.5,110,mode==='wick-only'?110:109,108,107,106,102,103,104,105];
 const bars=values.map((x,i)=>({open:p(x),close:p(x),high:p(x)+.1,low:p(x)-.1,volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 const touch=mode==='samebar-touch'?11:mode==='filled'?10:15;
 if(mirror)bars[touch].high=102.6;else bars[touch].low=97.4;
 if(mode==='wick-only'){if(mirror)bars[11].high=91;else bars[11].low=109;}
 const injection=`\nfirstPointWindow := true\npointPairM5 := true\nfirstSwingDisplayLocked := true\nstructureDay := rangeDayKey\nconfirmedZeroPrice := ${p(90)}\nconfirmedZeroTime := ${start-600000}\nstructureFirstPrice := 100\nfirstExtremeTime := ${start-300000}\n`;
 const c=await new PineTS(bars,'TEST','5').run(sources.draft.replace('// V1.2: исполнение отдельно',injection+'\n// V1.2: исполнение отдельно')+'\nplot(thirdCancelEvent?1:0,"testCancel")\nplot(v12NewPlan?1:0,"testPlan")');
 const indices=n=>bars.flatMap((x,i)=>c.plots[n].data[i].value?[i]:[]);
 assert.equal(indices('testPlan')[0],9,'second extreme still needs four closed right candles');
 if(['cancel','wick-only'].includes(mode)){
  assert.deepEqual(indices('testCancel'),[mode==='cancel'?11:12]);
  assert.deepEqual(indices('Вход LONG/SHORT'),[]);
 }else{
  assert.deepEqual(indices('testCancel'),[],'prior fill or same-bar old RR touch has priority');
  assert.deepEqual(indices('Вход LONG/SHORT'),[touch]);
 }
 console.log('PASS',mode,'mirror='+mirror);
}
const raw=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-10-02-body-cancel.json',import.meta.url)));
const data=raw.candles.filter(x=>x.time*1000>=Date.parse('2026-10-01T00:00:00+07:00')&&x.time*1000<Date.parse('2026-10-03T12:00:00+07:00')).map(x=>({...x,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
const results={};
for(const variant of ['baseline','draft']){
 const c=await new PineTS(data,'SOLUSDT','5').run(sources[variant]+'\nplot(thirdCancelEvent?1:0,"testCancel")');
 const rows=[];
 for(let i=0;i<data.length;i++){
  const t=new Date(data[i].openTime+25200000).toISOString();if(!t.startsWith('2026-10-02'))continue;
  const v=n=>c.plots[n].data[i].value;
  if(v('testCancel')||v('Вход LONG/SHORT')||v('Выход TP 1 / SL -1 / неизвестно 2'))rows.push({time:t,cancel:v('testCancel'),entry:v('Вход LONG/SHORT'),exit:v('Выход TP 1 / SL -1 / неизвестно 2'),price:v('Цена входа по close')});
 }
 results[variant]=rows;
}
assert.ok(results.baseline.some(x=>x.time.slice(11,16)==='20:55'&&x.entry===1));
assert.ok(results.draft.some(x=>x.time.slice(11,16)==='20:45'&&x.cancel===1));
assert.ok(!results.draft.some(x=>x.entry===1));
console.log('PASS real 2 Oct',JSON.stringify(results));
