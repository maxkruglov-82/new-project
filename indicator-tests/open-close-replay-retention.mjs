import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
import {scenario} from './open-close-zero-condition.mjs';
const original=readFileSync(process.argv[2]??new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const source=original+'\nplot(array.size(positionBoxes),"Boxes")\nplot(array.size(positionLabels),"Labels")\nfloat retainedTP = 0\nif array.size(positionLabels) > 0\n    for li = 0 to array.size(positionLabels) - 1\n        retainedTP := (str.contains(label.get_text(array.get(positionLabels,li)),"Цель +") or str.contains(label.get_text(array.get(positionLabels,li)),"Стоп +")) ? retainedTP + 1 : retainedTP\nplot(retainedTP,"RetainedTP")';
for(const mirror of [false,true])for(const outcome of ['tp','sl']){
 const {data:day}=await scenario(mirror,[[99.05,100.805],[100.805,100.81],[100.81,101.2],[101.2,99.8],[99.8,outcome==='tp'?101.3:98.6]]);
 const data=[...day];
 while(data.length<288){const prev=data.at(-1),t=prev.openTime+300000;data.push({...prev,open:prev.close,high:prev.close,low:prev.close,openTime:t,closeTime:t+299999});}
 data.push(...day.map(b=>({...b,openTime:b.openTime+86400000,closeTime:b.closeTime+86400000})));
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',22),outcome==='tp'?1:-1);
 assert.equal(v('RetainedTP',22),1,'completed trade exists during replay');
 assert.equal(v('RetainedTP',288+19),1,'new day setup must not delete prior executed trade');
 assert.equal(v('Boxes',288+19),4,'completed and new pending tools coexist');
 assert.equal(v('Labels',288+19),2,'completed label retained beside new scenario');
 assert.equal(v('RetainedTP',288+22),2,'both days retain completed outcomes');
 console.log('PASS replay outcome survives later day and new setup',mirror?'SHORT':'LONG',outcome);
}
