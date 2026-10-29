import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_V1_1_LONDON.txt',import.meta.url),'utf8');
const start=Date.parse('2026-10-22T13:00:00+07:00');
const prices=[100,102,101,100.5,101,101.5,102.5,104,103,102,102.5,103,104.5,106,105,104,104.5,105,106.5,108,107,106,106.5,107,107.5];
for(const mirror of [false,true]){
 const p=x=>mirror?220-x:x;
 const data=prices.map((v,i)=>({open:p(v),close:p(v),high:p(v)+9,low:p(v)-9,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}));
 let diagnostics='\nplot(array.size(marketSwingTimes),"Count")\nplot(array.size(marketStructureLabels),"Labels")';
 for(let i=0;i<7;i++){
  diagnostics+=`\nplot(array.size(marketSwingTimes)>${i}?array.get(marketSwingTimes,${i}):na,"T${i}")`;
  diagnostics+=`\nplot(array.size(marketSwingPrices)>${i}?array.get(marketSwingPrices,${i}):na,"P${i}")`;
 }
 const expected=mirror?['L₁','H₂','LL₃','LH₄','LL₅','LH₆','LL₇']:['H₁','L₂','HH₃','HL₄','HH₅','HL₆','HH₇'];
 for(let i=0;i<7;i++)diagnostics+=`\nplot(array.size(marketStructureLabels)>${i} and label.get_text(array.size(marketStructureLabels)>${i}?array.get(marketStructureLabels,${i}):na)=="${expected[i]}"?1:0,"Text${i}")`;
 const c=await new PineTS(data,'SOLUSDT','5').run(original+diagnostics),v=(n,i)=>c.plots[n].data[i].value;
 assert.equal(v('Count',4),0,'no first pivot before four closed M5 to its right');assert.equal(v('Count',5),1);assert.equal(v('Count',6),1);assert.equal(v('Count',7),2);
 assert.equal(v('Count',24),7);assert.equal(v('Labels',24),7);
 for(const [i,index] of [1,3,7,9,13,15,19].entries()){
  assert.equal(v('T'+i,24),data[index].openTime);assert.equal(v('P'+i,24),p(prices[index]));assert.equal(v('Text'+i,24),1,'correct sequential same-type classification');
 }
 console.log('PASS full market structure',mirror?'LL/LH':'HH/HL','alternates, confirms five bars, ignores wicks, chronological numbers, mandatory structure');
}
// Same-side pivots update the extreme rather than create High -> High labels.
const fn=original.slice(original.indexOf('recordMarketSwing('),original.indexOf('swingClass('));
const tiny='//@version=5\nindicator("test")\n'+fn+`\nvar array<int> t=array.new_int()\nvar array<float> p=array.new_float()\nvar array<bool> h=array.new_bool()\nvar array<int> d=array.new_int()\nif barstate.isfirst\n    recordMarketSwing(t,p,h,d,1,100,true,1)\n    recordMarketSwing(t,p,h,d,2,99,true,1)\n    recordMarketSwing(t,p,h,d,3,102,true,1)\n    recordMarketSwing(t,p,h,d,4,98,false,1)\n    recordMarketSwing(t,p,h,d,5,97,false,1)\nplot(array.size(t),"Count")\nplot(array.get(p,0),"High")\nplot(array.get(p,1),"Low")`;
const data=[{open:100,high:101,low:99,close:100,volume:1,openTime:start,closeTime:start+299999}];
const c=await new PineTS(data,'X','5').run(tiny);assert.equal(c.plots.Count.data[0].value,2);assert.equal(c.plots.High.data[0].value,102);assert.equal(c.plots.Low.data[0].value,97);
console.log('PASS same-type pivot collapse preserves alternating high/low skeleton');
