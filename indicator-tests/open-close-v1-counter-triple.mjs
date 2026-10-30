import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('originalCounterTriple('),source.indexOf('entryAlertText('));
for(const side of [1,-1])for(const mode of ['valid','third fails','middle fails','before break','wrong day']){
 const p=x=>side===1?x:200-x;
 let prices=[90,95,92,97];
 if(mode==='third fails')prices[3]=94;
 if(mode==='middle fails')prices[2]=89;
 const from=mode==='before break'?2500:1500;
 const days=[1,1,1,mode==='wrong day'?2:1];
 const highs=[false,true,false,true].map(x=>side===1?x:!x);
 const pine='//@version=5\nindicator("counter triple")\n'+helper+`\nvar array<int> t=array.new_int()\narray.push(t,1000)\narray.push(t,2000)\narray.push(t,3000)\narray.push(t,4000)\nvar array<float> p=array.from(${prices.map(x=>p(x)+'.0').join(',')})\nvar array<bool> h=array.new_bool()\n${highs.map(x=>'array.push(h,'+x+')').join('\n')}\nvar array<int> d=array.from(${days.join(',')})\n[ready,sl,tp,st]=originalCounterTriple(t,p,h,d,1,${from},${side},${p(90)})\nplot(ready ? 1 : 0,"ready")\nplot(sl,"stop")\nplot(tp,"target")`;
 const result=await new PineTS([{open:100,close:100,high:101,low:99,volume:1,openTime:Date.UTC(2026,0,1),closeTime:Date.UTC(2026,0,1)+299999}],'TEST','5').run(pine);
 assert.equal(result.plots.ready.data[0].value,Number(mode==='valid'),`${side} ${mode}`);
 if(mode==='valid'){assert.equal(result.plots.stop.data[0].value,p(92));assert.equal(result.plots.target.data[0].value,p(97));}
}
console.log('PASS HH-HL-HH / LL-LH-LL: three anchors, progression, timing after break, same day');
