import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedZeroTime,"T0")\nplot(firstSwingDisplayLocked?1:0,"Ready")';
for(const mode of ['time','price'])for(const mirror of [false,true]){
 const start=Date.parse('2026-10-21T12:00:00+07:00'),hourStart=Date.parse('2026-10-21T14:00:00+07:00');
 const peak=mode==='time'?8:14;
 const raw=[];
 for(let i=0;i<36;i++){
  let open=100,close=100;
  if(i===peak){open=101.5;close=102;}
  else if(i===peak+1){open=102;close=101;}
  else if(i>peak+1&&i<24){open=101-(i-peak-2)*0.1;close=Math.max(100,open-0.1);open=Math.max(100,open);}
  raw.push({open,close,high:Math.max(mode==='time'?103:101,open,close),low:Math.min(99,open,close)});
 }
 const tail=[[100,98.8],[98.8,98.6],[98.6,98.7],[98.7,99],[99,98.95],[98.95,98.95],[98.95,99],[99,99.05]];
 raw.push(...tail.map(([open,close])=>({open,close,high:Math.max(open,close)+0.01,low:Math.min(open,close)-0.01})));
 const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const ctx=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>ctx.plots[n].data[i].value,i=43;
 assert.equal(v('Ready',i),1);
 const p=v('Цена точки 0',i),t=v('T0',i);
 if(mode==='time'){
  assert.ok(!Number.isFinite(t)||t>=Date.parse('2026-10-21T14:00:00+07:00'),'no origin earlier than 14:00');
 }else{
  assert.ok(!Number.isFinite(p)||(mirror?p>=99:p<=101),'origin must respect H1 price boundary');
 }
 console.log('PASS zero bound',mode,mirror?'low':'high',p);
}
