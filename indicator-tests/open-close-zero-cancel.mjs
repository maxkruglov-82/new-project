import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(positionIsZero?1:0,"IsZero")\nplot(secondPointReady?1:0,"Ready2")\nplot(array.size(positionBoxes),"PlanBoxes")\nplot(array.size(positionLabels),"PlanLabels")\nplot(firstExtremeTime,"FirstTime")\nplot(box.get_left(positionRiskBox),"PlanLeft")';
const start=Date.parse('2026-10-21T13:00:00+07:00');
async function run(mirror,mode){
 const raw=Array.from({length:24},(_,i)=>({open:100,close:100,high:i<12?103:101,low:99}));
 [[101,101.2],[101.2,101.5],[101.5,102],[101.999,100]].forEach(([open,close],i)=>raw[i]={open,close,high:103,low:99});
 [[100,100.5],[100.5,100.8],[100.8,100.4],[100.4,100.3],[100.3,100.2]].forEach(([open,close],i)=>raw[19+i]={open,close,high:101,low:99});
 const tail=[[100.2,98.8],[98.8,98.6],[98.6,98.7],[98.7,99],[99,99.1],[99.1,100.81],[100.81,101.2],[101.2,100.7]];
 if(mode==='early')tail.push([100.7,101.21],[101.21,101.3]);
 else tail.push([100.7,100.6],[100.6,100.5],[100.5,mode==='tiny'?101.205:101.21],[101.21,100.8],[100.8,100.8]);
 raw.push(...tail.map(([open,close])=>({open,close,high:150,low:50})));
 const data=raw.map((b,i)=>{if(mirror)b={open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const ctx=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>ctx.plots[n].data[i].value;
 assert.equal(v('IsZero',30),1,'initial zero scenario');
 assert.equal(v('PlanLeft',30),v('FirstTime',30)-600000,'instrument starts two M5 before stop point 1');
 if(mode==='cancel'){
  assert.equal(v('Нулевой сценарий отменён',33),0);
  assert.equal(v('Нулевой сценарий отменён',34),1,'cancel after full retreat and one close 0.01 beyond 2');
  assert.equal(v('Входов за день',34),0,'cancelled pending plan is not a trade');
  assert.equal(v('IsZero',34),0,'new 2–3–4 plan replaces cancelled zero plan');
  assert.equal(v('PlanBoxes',34),2,'only new plan rectangles remain');
  assert.equal(v('PlanLabels',34),1,'cancelled plan label removed');
  assert.equal(v('Вход LONG/SHORT',35),mirror?-1:1);
  assert.equal(v('Входов за день',35),1,'new scenario is first trade, not second');
 }else assert.equal(v('Нулевой сценарий отменён',mode==='early'?32:34),0,'no premature cancellation');
 console.log('PASS zero cancellation',mode,mirror?'SHORT':'LONG');
}
for(const mode of ['cancel','early','tiny'])for(const mirror of [false,true])await run(mirror,mode);
