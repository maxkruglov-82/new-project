import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const s=readFileSync(new URL('../KRYTES_V1_1_LONDON.txt',import.meta.url),'utf8');
const f=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-26.json',import.meta.url)));
const d=f.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const diag='\nplot(longBackToMain?1:0,"Back")\nplot(retestBars,"Count")';
const c=await new PineTS(d,'SOLUSDT','5').run(s+diag),v=(n,i)=>c.plots[n].data[i].value;
const at=clock=>d.findIndex(b=>b.openTime===Date.parse('2026-10-26T'+clock+':00+07:00'));
// The new post-engulfing wick rule now fills the local plan before the old fallback.
const entry=at('18:20'),exit=at('18:50');
assert.equal(v('Вход LONG/SHORT',entry),1);
assert.equal(v('Цена фактического входа',entry),101.275);
assert.equal(v('Стоп позиции',entry),100.91);
assert.equal(v('Цель позиции',entry),101.64);
assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',exit),1);
assert.equal(v('Back',exit),0,'an already entered local plan cannot be replaced by the pending-only fallback');
assert.equal(v('Вход LONG/SHORT',at('20:05')),0);
console.log('PASS MEXC Oct26: post-engulfing local fill 18:20, TP 18:50; actual trade never falls back');
for(const mode of ['zone','no-zone','wick','entered']){
 const start=Date.parse('2026-10-22T14:00:00+07:00');
 const seq=mode==='no-zone'?[103.1,103.2,104.5,104.6]:[101.9,102.1,mode==='wick'?103.5:104.5,103.6];
 const data=Array.from({length:25},(_,i)=>{const close=i>20?seq[i-21]:103,open=i>21?seq[i-22]:103;return {open,close,high:mode==='wick'&&i===23?104.8:Math.max(open,close)+.01,low:Math.min(open,close)-.01,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1};});
 const inject=`if bar_index >= 20
    confirmedZeroPrice := na
    counterModeActive := false
    structureFirstPrice := 99
    firstSwingDisplayLocked := true
if bar_index == 20
    positionState := ${mode==='entered'?2:1}
    positionSide := 1
    positionStop := 100
    positionTarget := 104
    positionThreshold := 102
    positionSetupBar := 20
    positionEntryBar := 20
    positionEntry := ${mode==='entered'?'101.9':'na'}
    positionPlanDay := rangeDayKey
    positionIsZero := true
    firstPositionIsZero := true
    positionIsSecond := false
    firstPositionSide := 1
    structureFirstPrice := 99
    dailyPositionEntries := ${mode==='entered'?1:0}
    longPlanReplaced := true
    longBackToMain := false
    localLongRetestHigh := na
`;
 const ctx=await new PineTS(data,'SOLUSDT','5').run(s.replace('int positionExitEvent = 0',inject+'\nint positionExitEvent = 0')+diag);
 const last=n=>ctx.plots[n].data.at(-1).value;
 assert.equal(last('Back'),mode==='zone'?1:0,mode);
 assert.equal(last('Стоп позиции'),mode==='zone'?99:100,mode);
 if(mode==='zone'){assert.equal(ctx.plots['Вход LONG/SHORT'].data[23].value,0);assert.equal(ctx.plots['Входов за день'].data[23].value,0);}
 console.log('PASS pending local fallback guard',mode);
}
