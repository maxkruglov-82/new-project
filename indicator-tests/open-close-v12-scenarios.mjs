import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const start=Date.UTC(2026,9,20,5);
for(const mirror of [false,true])for(const mode of ['freeze','same-stop','return','resume','failed-resume']){
 const p=x=>mirror?200-x:x;
 const values=mode==='failed-resume'?[99,95,89,88,85,86,87,88,89,105,104,103,102,101,96,97,94,84,83,94,90,83]:mode==='resume'?[105,109,111,112,115,114,113,112,111,105,106,108,109,110,112,110,105,99,101,102,103,104,106,102,99]:mode==='return'?[105,109,111,112,115,114,113,112,111,108,109,110,111,112,116,115,114,113,112,112,107,109,105,99.9]:[100,99,101,102,104,105,104,103.5,104,104.5,110,109,108,107,106,102,mode==='same-stop'?98:103,104,105];
 const bars=values.map((x,i)=>({open:p(x),close:p(x),high:p(x)+.1,low:p(x)-.1,volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 if(mode==='return'){
  bars[21].low=mirror?90.9:108;
  bars[21].high=mirror?92:109.1;
 }
 if(mode==='resume'){bars[22].low=mirror?95.5:104.4;bars[22].high=mirror?95.6:104.5;}
 if(mode==='freeze'||mode==='same-stop'){bars[15].low=mirror?97.9:97.4;bars[15].high=mirror?102.6:102.1;if(mode==='same-stop'){bars[16].open=p(89);bars[16].close=p(89);bars[16].high=p(89)+.1;bars[16].low=p(89)-.1;}}
 if(mode==='same-stop'){if(mirror)bars[14].high=102.6;else bars[14].low=97.4;}
 const zero=p(['return','resume'].includes(mode)?110:90),one=100;
 const injection=`\nfirstPointWindow := true\npointPairM5 := true\nfirstSwingDisplayLocked := true\nstructureDay := rangeDayKey\nconfirmedZeroPrice := ${zero}\nconfirmedZeroTime := ${start-600000}\nstructureFirstPrice := ${one}\nfirstExtremeTime := ${start-300000}\n`;
 const code=source.replace('// V1.2: исполнение отдельно',injection+'\n// V1.2: исполнение отдельно');
 const c=await new PineTS(bars,'TEST','5').run(code+'\nplot(v12FirstTarget,"firstGoal")\nplot(v12InitialSide,"initialSide")\n');
 const v=(n,i)=>c.plots[n].data[i].value;
 const entries=bars.flatMap((x,i)=>v('Вход LONG/SHORT',i)?[{i,side:v('Вход LONG/SHORT',i),entry:v('Цена входа по close',i),stop:v('Стоп позиции',i),target:v('Цель позиции',i)}]:[]);
 if(mode==='freeze'){
  assert.equal(entries.length,0,'third confirmed extreme cancels the unfilled first continuation');
  assert.equal(v('firstGoal',14),p(105),'cancellation does not roll the old target');
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',18),0,'an unfilled plan cannot produce TP');
 }else if(mode==='same-stop'){
  assert.equal(entries.length,1,'same-direction stop does not activate immediate reversal');
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',16),-1);
 }else if(mode==='failed-resume'){
  assert.equal(entries.length,1,'failed recovery without actual entry must not count a fictitious LONG');
  assert.equal(entries[0].i,19);assert.equal(entries[0].side,mirror?1:-1);
  assert.equal(entries[0].entry,p(94));assert.equal(entries[0].stop,p(105));assert.equal(entries[0].target,p(83));
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',21),1);
 }else if(mode==='resume'){
  assert.equal(entries.length,1,'incomplete countertrend must not create an actual trade');
  assert.equal(entries[0].i,22);assert.equal(entries[0].side,mirror?1:-1);
  assert.equal(entries[0].entry,p(104.5));assert.equal(entries[0].stop,p(110));assert.equal(entries[0].target,p(99));
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',24),1);
 }else{
  assert.equal(entries.length,2);
  assert.deepEqual(entries.map(e=>e.i),[19,21]);
  assert.deepEqual(entries.map(e=>e.side),mirror?[-1,1]:[1,-1]);
  assert.equal(entries[1].side,v('initialSide',21));assert.equal(entries[1].target,100);
  assert.equal(entries[1].stop,p(116));assert.equal(entries[1].entry,p(108));
  assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',20),-1);assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',23),1);
 }
 console.log('PASS V1.2',mode,'mirror='+mirror);
}
