import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
assert.ok(original.includes('max_bars_back=600'),'explicit history buffer for dynamic offsets');
assert.ok(!original.includes('scanIndex > 0 and scanTime - array.get'),'no eager negative-index expression');
const source=original+'\nplot(array.size(firstPointLabels),"LabelsCount")\nplot(array.size(positionLabels),"PositionLabelsCount")\nplot(array.size(bodyRanges),"RangesCount")\nplot(array.size(positionBoxes),"PositionBoxesCount")\nplot(array.size(colorSealedHistory),"SealedColorChunks")\nplot(array.size(colorArchiveRedPoints),"RedArchivePoints")\nplot(array.size(colorArchiveGreenPoints),"GreenArchivePoints")';
const start=Date.parse('2026-06-01T13:00:00+07:00'),days=120,data=[];
for(let day=0;day<days;day++){
 const raw=Array.from({length:288},(_,i)=>({open:100,close:100,high:i<12?103:101,low:99}));
 [[101,101.2],[101.2,101.5],[101.5,102],[101.999,100]].forEach(([open,close],i)=>raw[i]={open,close,high:103,low:99});
 [[100,100.5],[100.5,100.8],[100.8,100.4],[100.4,100.3],[100.3,100.2]].forEach(([open,close],i)=>raw[19+i]={open,close,high:101,low:99});
 [[100.2,98.8],[98.8,98.6],[98.6,98.7],[98.7,99],[99,99.05],[99.05,99.1]].forEach(([open,close],i)=>raw[24+i]={open,close,high:Math.max(open,close)+0.01,low:Math.min(open,close)-0.01});
 for(let i=0;i<288;i++)data.push({...raw[i],volume:1,openTime:start+(day*288+i)*300000,closeTime:start+(day*288+i+1)*300000-1});
}
const full=await new PineTS(data,'SOLUSDT','5').run(source);
const cut=90*288,shorter=await new PineTS(data.slice(cut),'SOLUSDT','5').run(source);
const value=(ctx,n,i)=>ctx.plots[n].data[i].value;
for(let i=0;i<data.length;i++){
 assert.ok(value(full,'SealedColorChunks',i)<=90);
 assert.ok(value(full,'RedArchivePoints',i)<=9000);
 assert.ok(value(full,'GreenArchivePoints',i)<=9000);
 assert.ok(value(full,'LabelsCount',i)<=360);
 assert.ok(value(full,'PositionLabelsCount',i)<=120);
 assert.ok(value(full,'LabelsCount',i)+value(full,'PositionLabelsCount',i)<=480);
 assert.ok(value(full,'RangesCount',i)<=350);
 assert.ok(value(full,'PositionBoxesCount',i)<=80);
}
// A slice beginning on a weekend needs a complete weekday H1 before stale
// prior-session plots can be compared. Allow one full calendar week of warmup.
for(let i=cut+7*288;i<data.length;i++)for(const n of ['Цена точки 0','Вход LONG/SHORT','Цена входа по close']){
 const a=value(full,n,i),b=value(shorter,n,i-cut);
 assert.ok((!Number.isFinite(a)&&!Number.isFinite(b))||Object.is(a,b),`older history changed ${n} at ${i}`);
}
console.log('PASS history reload',data.length,'M5 bars, 120 days; bounded drawings; stable output after older bars are added');

const polylines=full.plots.__polylines__.data[0].value;
assert.ok(polylines.length<=94,'bounded archive plus active-day polylines');
assert.ok(polylines.some(p=>p.points.some(pt=>pt.time===start+20*300000&&pt.price===100.5)),'oldest day color retained beyond former 150-candle cap');
console.log('PASS full historical color archive including oldest day');
