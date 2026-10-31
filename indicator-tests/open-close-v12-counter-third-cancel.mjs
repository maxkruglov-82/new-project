import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
for(const mirror of [false,true])for(const mode of ['cancel','samebar','filled']){
 const p=x=>mirror?200-x:x,side=mirror?-1:1,start=Date.UTC(2026,9,20,12);
 const pairs=[[106,110],[110,108],[108,107],[107,105.5],[105.5,106]];
 const bars=pairs.map(([o,c],i)=>({open:p(o),close:p(c),high:Math.max(p(o),p(c))+.1,low:Math.min(p(o),p(c))-.1,volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 if(mode!=='cancel'){const i=mode==='samebar'?3:2;if(mirror)bars[i].high=100;else bars[i].low=100;}
 const seed=`    firstPointWindow := true
    if bar_index == 0
        v12Zero := ${p(115)}
        v12One := 100
        v12InitialSide := ${-side}
        v12ZeroBreakTime := ${start-600000}
        v12State := 1
        v12Side := ${side}
        v12PlanKind := 2
        v12PlanDay := rangeDayKey
        v12Setup := -1
        v12Stop := ${p(90)}
        v12Target := ${p(105)}
        v12Level := ${p(97.5)}
        v12SequenceSide := ${side}
        v12Stage := 3
        counterCountActive := true
        counterThirdCandidate := false
        counterCountPeak := ${p(105)}
        counterCountBaseTime := ${start-300000}
        counterCountTime := ${start-300000}
        counterCountBar := -1
`;
 const c=await new PineTS(bars,'TEST','5').run(source.replace('// V1.2: исполнение отдельно','m5Chart := true\n// V1.2: исполнение отдельно').replace('    bool v12CanFirst =',seed+'    bool v12CanFirst =')+'\nplot(thirdCancelEvent?1:0,"testCancel")\nplot(thirdCanceledSide,"testCanceledSide")\nplot(counterCountPeak,"debugPeak")\nplot(counterCountEdge,"debugEdge")\nplot(counterCountActive?1:0,"debugActive")\nplot(v12State,"debugState")\nplot(v12Level,"debugLevel")');
 const indices=n=>bars.flatMap((x,i)=>c.plots[n].data[i].value?[i]:[]);

 if(mode==='cancel'){
  assert.deepEqual(indices('testCancel'),[3]);assert.deepEqual(indices('Вход LONG/SHORT'),[]);
  assert.equal(c.plots.testCanceledSide.data[3].value,side,'cancellation follows counter plan side, not original trend');
 }else{
  assert.deepEqual(indices('testCancel'),[]);assert.deepEqual(indices('Вход LONG/SHORT'),[mode==='samebar'?3:2]);
 }
 console.log('PASS countertrend',mode,'mirror='+mirror);
}
const raw=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-09-29-counter.json',import.meta.url)));
const bars=raw.candles.filter(x=>x.time*1000>=Date.parse('2026-09-28T00:00:00+07:00')&&x.time*1000<Date.parse('2026-09-30T12:00:00+07:00')).map(x=>({...x,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
const c=await new PineTS(bars,'SOLUSDT','5').run(source+'\nplot(thirdCancelEvent?1:0,"testCancel")\nplot(thirdPullback,"testHL")');
const rows=[];
for(let i=0;i<bars.length;i++){
 const t=new Date(bars[i].openTime+25200000).toISOString();if(!t.startsWith('2026-09-29'))continue;
 const v=n=>c.plots[n].data[i].value;
 if(v('testCancel')||v('Вход LONG/SHORT'))rows.push({time:t,cancel:v('testCancel'),entry:v('Вход LONG/SHORT'),stop:v('Стоп позиции'),hl:v('testHL')});
}
assert.ok(rows.some(x=>x.time.slice(11,16)==='20:30'&&x.cancel===1&&Math.abs(x.stop-119.2)<1e-8));
assert.ok(!rows.some(x=>x.entry===1));
const small=await new PineTS(bars,'SOLUSDT','5').run(readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE_SMALL.txt',import.meta.url),'utf8'));
const norm=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v));
for(const n of Object.keys(small.plots))assert.deepEqual(norm(c.plots[n]),norm(small.plots[n]),'FULL/SMALL '+n);
console.log('PASS29Sep counter LONG canceled with unchanged119.20 stop',JSON.stringify(rows));
