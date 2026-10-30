import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url),source=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE.txt',root),'utf8');
const baseline=readFileSync(new URL('reports/backtest-2026-b2375d6/indicator.txt',root),'utf8');
for(const [day,name,mirror] of [['09','mexc-sol-usdt-m5-2026-10-09-v1-structure.json',false],['09','mexc-sol-usdt-m5-2026-10-09-v1-structure.json',true],['16','mexc-sol-usdt-m5-2026-10-16.json',false]]){
 const f=JSON.parse(readFileSync(new URL('fixtures/'+name,import.meta.url))),p=x=>mirror?250-x:x;
 const d=f.candles.map(x=>({...x,open:p(x.open),close:p(x.close),high:mirror?p(x.low):x.high,low:mirror?p(x.high):x.low,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const a=await new PineTS(d,'SOLUSDT','5').run(baseline),b=await new PineTS(d,'SOLUSDT','5').run(source);
 for(const n of Object.keys(a.plots).filter(n=>!n.startsWith('__')&&n!=='Действующий цвет тренда'))assert.deepEqual(b.plots[n].data,a.plots[n].data,'financial series unchanged '+n);
 const circles=b.plots.__labels__.data.flatMap(x=>x.value).filter(x=>!x._deleted&&x.style==='style_circle');
 const entries=circles.filter(x=>x.tooltip.startsWith('Вход ')),exits=circles.filter(x=>/^(Стоп|Тейк) /.test(x.tooltip));
 const fills=d.flatMap((x,i)=>b.plots['Вход LONG/SHORT'].data[i].value?[{i,side:b.plots['Вход LONG/SHORT'].data[i].value}]:[]);
 assert.equal(entries.length,2);assert.equal(exits.length,2);
 for(let i=0;i<2;i++){
  assert.equal(entries[i].text,String(i+1));assert.equal(entries[i].x,d[fills[i].i].openTime);assert.equal(entries[i].y,b.plots['Цена входа по close'].data[fills[i].i].value);
  assert.equal(entries[i].color,fills[i].side===1?'#4CAF50':'#F23645');assert.equal(entries[i].size,'tiny');
  assert.equal(exits[i].color,i===0?'#F23645':entries[i].color);assert.equal(exits[i].size,'tiny');
 }
 const traces=b.plots.__lines__.data.flatMap(x=>x.value).filter(x=>!x._deleted&&x.style==='style_dashed'&&entries.some(e=>e.x===x.x1&&e.y===x.y1));
 assert.equal(traces.length,2,'one actual path per completed trade');
 for(let i=0;i<2;i++){
  assert.equal(traces[i].x1,entries[i].x);assert.equal(traces[i].y1,entries[i].y);
  assert.equal(traces[i].x2,exits[i].x);assert.equal(traces[i].y2,exits[i].y);assert.equal(traces[i].color,exits[i].color);
 }
 console.log('PASS numbered entry circles and side-colored TP; unchanged financial values:',day,mirror);
}
