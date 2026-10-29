import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const s=readFileSync(new URL('../KRYTES_V1_1_LONDON.txt',import.meta.url),'utf8');
const f=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-26.json',import.meta.url)));
const d=f.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const diag='\nplot(longBackToMain?1:0,"Back")\nplot(retestBars,"Count")';
const c=await new PineTS(d,'SOLUSDT','5').run(s+diag),v=(n,i)=>c.plots[n].data[i].value;
const at=clock=>d.findIndex(b=>b.openTime===Date.parse('2026-10-26T'+clock+':00+07:00'));
assert.equal(v('Back',at('18:45')),0);assert.equal(v('Стоп позиции',at('18:45')),100.91);
const reset=at('18:50');assert.equal(v('Back',reset),1);assert.equal(v('Стоп позиции',reset),100.17);assert.equal(v('Цель позиции',reset),101.71);assert.equal(v('Count',reset),0);assert.equal(v('Вход LONG/SHORT',reset),0);assert.equal(v('Входов за день',reset),0);assert.ok(Math.abs(v('Граница RR 1:1',reset)-100.94)<1e-8);
assert.equal(v('Вход LONG/SHORT',at('20:05')),0,'old local entry must not execute after fallback');
for(let i=reset;i<d.length;i++)assert.equal(v('Стоп позиции',i),100.17,'main stop stays at 1 after fallback');
console.log('PASS MEXC Oct26: failed local retest + HH at 18:50 restores main stop 100.17, RR1 100.94, no immediate or old local entry');
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
