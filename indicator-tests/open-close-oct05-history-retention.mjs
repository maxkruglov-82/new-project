import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const long=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-01-06.json',import.meta.url))).candles;
const short=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-05-origin-stop.json',import.meta.url))).candles;
const source=readFileSync(process.argv[2]??new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const diagnostic=`\nplot(zeroScenarioCancelled?1:0,"Cancelled")\nplot(na(positionInfo)?0:1,"Visible")\nfloat retainedEntry=0\nfloat retainedGoal=0\nif array.size(positionLabels)>0\n    for li=0 to array.size(positionLabels)-1\n        string caption=label.get_text(array.get(positionLabels,li))\n        retainedEntry := str.contains(caption,"Вход: 121.12")?retainedEntry+1:retainedEntry\n        retainedGoal := (str.contains(caption,"Цель: 120.3") and str.endswith(caption," +"))?retainedGoal+1:retainedGoal\nplot(retainedEntry,"RetainedEntry")\nplot(retainedGoal,"RetainedGoal")`;
const sequences=[];
for(const [kind,bars] of [['short',short],['with previous trading days',long]]){
 const data=bars.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 const c=await new PineTS(data,'SOLUSDT','5').run(source+diagnostic),v=(n,i)=>c.plots[n].data[i].value;
 const at=t=>data.findIndex(b=>b.openTime===Date.parse('2026-10-05T'+t+':00+07:00'));
 for(let i=at('16:30');i<=at('21:25');i++){
  assert.equal(v('Стоп позиции',i),121.94,kind+': original stop cannot be replaced by local 120.78');
  assert.equal(v('Visible',i),1,kind+': original tool never disappears');
  assert.equal(v('Cancelled',i),0,kind+': old cancellation cannot leak into fresh plan');
 }
 const events=data.flatMap((b,i)=>{const t=new Date(b.openTime+25200000).toISOString();return t.startsWith('2026-10-05')&&(v('Вход LONG/SHORT',i)||v('Выход TP 1 / SL -1 / неизвестно 2',i))?[[t.slice(11,16),v('Вход LONG/SHORT',i),v('Выход TP 1 / SL -1 / неизвестно 2',i)]]:[];});
 assert.deepEqual(events,[['21:10',-1,0],['21:25',0,1]]);
 sequences.push(events);
 assert.equal(v('Цена входа по close',at('21:10')),121.12);
 assert.ok(v('RetainedEntry',data.length-1)>=1,kind+': executed entry retained at replay end');
 assert.ok(v('RetainedGoal',data.length-1)>=1,kind+': executed TP retained at replay end');
 const boxes=c.plots.__boxes__.data[0].value;
 assert.ok(boxes.some(b=>!b._deleted&&b.top===121.94&&b.bottom===121.12),'risk rectangle survives');
 assert.ok(boxes.some(b=>!b._deleted&&b.top===121.12&&b.bottom===120.3),'reward rectangle survives');
 console.log('PASS Oct 5 main SHORT never replaced; entry and TP drawings retained',kind);
}
assert.deepEqual(sequences[0],sequences[1],'adding older trading days cannot change Oct 5 execution');
