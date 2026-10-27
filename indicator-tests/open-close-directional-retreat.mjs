import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(firstRetreatCloses,"Count")\nplot(firstSwingDisplayLocked?1:0,"Ready")';
const start=Date.parse('2026-10-13T14:00:00+07:00');
for(const mirror of [false,true])for(const extend of [false,true]){
 const hour=Array.from({length:12},()=>({open:108.5,close:108.5,high:109,low:107.95}));
 // User's five marked bars: extreme, rebound, then three falling candles
 // whose closes remain above the initial 107.265 low.
 const tail=[[108.5,107.618],[107.618,107.265],[107.265,107.654],[107.654,107.44],[107.44,extend?107.25:107.41],[extend?107.25:107.41,107.38],[107.38,107.2],[107.2,107.06],[107.06,108.1],[108.1,107.06]];
 const data=[...hour,...tail.map(([open,close])=>({open,close,high:Math.max(open,close),low:Math.min(open,close)}))].map((b,i)=>{if(mirror)b={open:216-b.open,close:216-b.close,high:216-b.low,low:216-b.high};return {...b,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}});
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=(n,i)=>c.plots[n].data[i].value;
 for(const [i,count] of [[13,1],[14,2],[15,3]]){assert.equal(v('Count',i),count);assert.equal(v('Ready',i),0);}
 assert.equal(v('Count',16),extend?1:4,'new close beyond extreme resets; candle color does not');
 assert.equal(v('Count',17),extend?2:5);
 assert.equal(v('Ready',17),extend?0:1);
 if(!extend){
  assert.equal(v('Состояние позиции',18),1,'new close below confirmed first launches continuation plan');
  assert.equal(v('Вход LONG/SHORT',18),0,'break candle cannot retrospectively enter');
  assert.equal(v('Вход LONG/SHORT',20),mirror?1:-1,'subsequent RR retest fills after mixed-color five-bar confirmation');
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',21),1);
 }
 console.log('PASS all five closed retreat candles including opposite colors',mirror?'HIGH mirror':'LOW',extend?'new close resets':'early first confirmed');
}
