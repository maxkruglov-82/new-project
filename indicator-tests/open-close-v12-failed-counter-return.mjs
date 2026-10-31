import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
for(const mirror of [false,true])for(const mode of ['failed','touch-by-wick','wick-only','confirmed-counter']){
 const p=x=>mirror?250-x:x,initial=mirror?1:-1,start=Date.UTC(2026,9,20,12);
 const pairs=mode==='wick-only'?[[112,111],[111,110.5],[110.5,111],[111,111]]:[[112,111],[111,109],[109,108],[108,115],[115,107]];
 if(mode==='touch-by-wick')pairs[3]=[108,113];
 const bars=pairs.map(([o,c],i)=>({open:p(o),close:p(c),high:Math.max(p(o),p(c))+.1,low:Math.min(p(o),p(c))-.1,volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 if(mode==='touch-by-wick'){if(mirror)bars[3].low=p(114.1);else bars[3].high=114.1;}
 if(mode==='wick-only'){if(mirror)bars[1].high=p(109);else bars[1].low=109;}
 const seed=`    firstPointWindow := true
    if bar_index == 0
        v12Zero := ${p(115)}
        v12One := ${p(110)}
        v12InitialSide := ${initial}
        v12ZeroBreakTime := ${start-600000}
        v12State := ${mode==='confirmed-counter'?1:0}
        v12Side := ${-initial}
        v12PlanKind := ${mode==='confirmed-counter'?2:0}
        v12PlanDay := rangeDayKey
        v12Setup := -1
        v12Stop := ${p(90)}
        v12Target := ${p(130)}
        v12Level := ${p(110)}
        v12SequenceSide := ${-initial}
        v12Stage := ${mode==='confirmed-counter'?3:2}
        v12A := ${p(120)}
        v12ATime := ${start-1200000}
        v12B := ${p(115)}
        v12BTime := ${start-900000}
`;
 const c=await new PineTS(bars,'TEST','5').run(source.replace('// V1.2: исполнение отдельно','m5Chart := true\n// V1.2: исполнение отдельно').replace('    bool v12CanFirst =',seed+'    bool v12CanFirst =')+'\nplot(v12PlanKind,"testKind")');
 const val=(n,i)=>c.plots[n].data[i].value;
 if(mode==='failed'||mode==='touch-by-wick'){
  assert.equal(val('testKind',1),5,'original1 break prepares original direction immediately');
  assert.equal(val('Стоп позиции',1),p(120),'stop uses counter A');
  assert.equal(val('Вход LONG/SHORT',1),0,'no fill on creation candle');
  if(mode==='touch-by-wick')assert.ok(mirror?bars[3].close>p(114):bars[3].close<114,'wick touch fills without close crossing RR');
  assert.equal(val('Вход LONG/SHORT',3),initial,'first subsequent RR touch fills original side');
  assert.equal(val('Граница RR 1:1',3),p(114),'target trails to actual body extreme until touch');
  assert.equal(val('Выход TP 1 / SL -1 / неизвестно 2',4),1,'independent later TP');
 }else assert.ok(c.plots.testKind.data.every(x=>x.value!==5),'do not steal wick-only original1 break or confirmed-counter scenario');
 console.log('PASS failed-counter return',mode,'mirror='+mirror);
}
