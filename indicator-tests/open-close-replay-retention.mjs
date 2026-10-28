import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
import {scenario} from './open-close-zero-condition.mjs';
const original=readFileSync(process.argv[2]??new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const source=original+'\nplot(confirmedZeroTime,"T0")\nplot(array.size(positionBoxes),"Boxes")\nplot(array.size(positionLabels),"Labels")\nfloat retainedTP = 0\nif array.size(positionLabels) > 0\n    for li = 0 to array.size(positionLabels) - 1\n        retainedTP := ((str.contains(label.get_text(array.get(positionLabels,li)),"Цель:") and str.endswith(label.get_text(array.get(positionLabels,li))," +")) or (str.contains(label.get_text(array.get(positionLabels,li)),"Стоп:") and str.endswith(label.get_text(array.get(positionLabels,li))," +"))) ? retainedTP + 1 : retainedTP\nplot(retainedTP,"RetainedTP")';
for(const mirror of [false,true])for(const outcome of ['tp','sl']){
 const {data:day}=await scenario(mirror,[[99.05,100.805],[100.805,100.81],[100.81,101.2],[101.2,99.8],[99.8,outcome==='tp'?101.3:98.6]]);
 const data=[...day];
 while(data.length<288){const prev=data.at(-1),t=prev.openTime+300000;const local=new Date(t+7*3600000),hour=local.getUTCHours(),minute=local.getUTCMinutes();const open=hour===13?(minute===10?99.9:100):prev.close,close=hour===13?(minute===5?99.9:100):prev.close;data.push({...prev,open,close,high:Math.max(open,close),low:Math.min(open,close),openTime:t,closeTime:t+299999});}
 data.push(...day.map(b=>({...b,openTime:b.openTime+86400000,closeTime:b.closeTime+86400000})));
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',22),outcome==='tp'?1:-1);
 assert.equal(v('RetainedTP',22),1,'completed trade exists during replay');
 assert.equal(v('RetainedTP',288+19),1,'new day setup must not delete prior executed trade');
 assert.equal(v('Boxes',288+20),4,'completed and new pending tools coexist');
 assert.equal(v('Labels',288+20),6,'completed label retained beside new scenario');
 assert.equal(v('RetainedTP',288+22),2,'both days retain completed outcomes');
 const firstOrigin=day.find(b=>b.openTime===v('T0',22));
 assert.ok(c.plots.__polylines__.data[0].value.some(p=>p.line_color===(mirror?'#00E676':'#F23645')&&p.points.some(pt=>pt.time===firstOrigin.openTime&&pt.price===firstOrigin.open)),'earlier 0–1 color survives next day');
 for(const poly of c.plots.__polylines__.data[0].value){
  const days=new Set(poly.points.filter(pt=>Number.isFinite(pt.price)).map(pt=>Math.floor((pt.time+7*3600000)/86400000)));
  assert.ok(days.size<=1,'a colored polyline must never join different local days');
  for(const pt of poly.points.filter(pt=>Number.isFinite(pt.price))){
   const localTime=(pt.time+7*3600000)%86400000;
   assert.ok(localTime<14*3600000+23*300000,'color ends on outcome candle, not subsequent candles');
  }
 }
 console.log('PASS replay outcome survives later day and new setup',mirror?'SHORT':'LONG',outcome);
}
