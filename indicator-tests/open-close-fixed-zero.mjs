import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const raw=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const start=Date.parse('2026-10-08T14:00:00+07:00');
for(const mirror of [false,true]){
 const price=x=>mirror?200-x:x;
 const seq=[...Array(12).fill(99),99,101,99,101,102];
 const data=seq.map((close,i)=>({open:price(i?seq[i-1]:99),close:price(close),high:110,low:90,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}));
 const inject=`if bar_index >= 12\n    firstPointWindow := true\n    firstSwingDisplayLocked := true\n    structureDay := rangeDayKey\n    structureSide := ${mirror?1:-1}\n    structureFirstPrice := ${price(95)}\n    if bar_index == 12\n        confirmedZeroPrice := 100\n        confirmedZeroTime := ${start}\n        zeroLabel := newSwingLabel(confirmedZeroTime, confirmedZeroPrice, "0", ${mirror?'label.style_label_up':'label.style_label_down'})\n        array.push(firstPointLabels, zeroLabel)\n`;
 const anchor='// Перенос неподтверждённой точки 1 до первого входа; первоначальная 0 неподвижна.';
 assert.ok(raw.includes(anchor));
 const source=raw.replace(anchor,inject+'\n'+anchor)+'\nplot(confirmedZeroTime,"T0")\nplot(label.get_y(zeroLabel),"Label0Price")\nplot(label.get_x(zeroLabel),"Label0Time")';
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 for(let i=12;i<data.length;i++){
  assert.equal(v('Цена точки 0',i),100);assert.equal(v('T0',i),start);
  assert.equal(v('Label0Price',i),100);assert.equal(v('Label0Time',i),start);
 }
 assert.equal(v('Разворот закреплён за 0',14),0,'one failed close is not a reversal');
 assert.equal(v('Разворот закреплён за 0',16),1,'two closes still confirm reversal at original 0');
 console.log('PASS immutable 0:',mirror?'LOW':'HIGH','failed break and confirmed break keep price/time/label; two-close reversal preserved');
}
