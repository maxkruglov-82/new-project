import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const original=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const prices=[100,102,101,100.5,101,101.5,102.5,104,103,102,102.5,103,104.5,106,105,104,104.5,105,106.5,108,107,106,106.5,107,108.5,110,109,108,108.5,109,110.5,112,111,110,110.5,111,112.5,114,113,112];
for(const mode of ['first-tp','stop-then-second-tp','overnight-tp']){
 const start=Date.parse('2026-10-20T'+(mode==='overnight-tp'?'23:00':'13:00')+':00+07:00');
 const tp=mode==='first-tp'?18:29,sl=mode==='stop-then-second-tp'?17:-1;
 const data=prices.map((p,i)=>({open:p,close:p,high:p+.1,low:p-.1,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1}));
 const inject=`if bar_index >= 8
    firstSwingDisplayLocked := true
    structureDay := 20261020
    confirmedZeroPrice := 100.5
    confirmedZeroTime := ${start+3*300000}
    structureFirstPrice := 104
    firstExtremeTime := ${start+7*300000}
    positionPlanDay := 20261020
    positionState := bar_index < ${tp} ? 2 : 3
    positionExitEvent := bar_index == ${sl} ? -1 : bar_index == ${tp} ? 1 : 0
`;
 const diagnostics=`
int beforeZero = 0
int afterTP = 0
int afterSL = 0
int afterMidnight = 0
int zeroCount = 0
int oneCount = 0
if barstate.islast and array.size(marketStructureLabels) > 0
    for i = 0 to array.size(marketStructureLabels) - 1
        label mark = array.get(marketStructureLabels,i)
        int atTime = label.get_x(mark)
        string caption = label.get_text(mark)
        if atTime < ${start+3*300000}
            beforeZero := beforeZero + 1
        if atTime > ${start+tp*300000}
            afterTP := afterTP + 1
        if atTime > ${start+17*300000} and atTime <= ${start+tp*300000}
            afterSL := afterSL + 1
        if atTime >= ${Date.parse('2026-10-21T00:00:00+07:00')}
            afterMidnight := afterMidnight + 1
        if caption == "0" or str.startswith(caption,"0 · ")
            zeroCount := zeroCount + 1
        if caption == "1" or str.startswith(caption,"1 · ")
            oneCount := oneCount + 1
plot(beforeZero,"Before")
plot(afterTP,"After")
plot(afterSL,"Between")
plot(afterMidnight,"Night")
plot(zeroCount,"Zero")
plot(oneCount,"One")
plot(array.size(anchorTakeProfitTimes)>0?array.get(anchorTakeProfitTimes,0):na,"End")
`;
 const source=original.replace(/^bool firstPointWindow = .*$/m,'bool firstPointWindow = false').replace('// Полная структура: локальная остановка',inject+'\n// Полная структура: локальная остановка')+diagnostics;
 const c=await new PineTS(data,'X','5').run(source),last=n=>c.plots[n].data.at(-1).value;
 assert.equal(last('Before'),0);
 assert.equal(last('After'),0);
 assert.equal(last('Zero'),1);
 assert.equal(last('One'),1);
 assert.equal(last('End'),start+tp*300000);
 if(mode==='stop-then-second-tp'){
  assert.ok(Number.isNaN(c.plots.End.data[sl].value),'SL alone does not terminate structure');
  assert.ok(last('Between')>0,'structure continues after first SL to second TP');
 }
 if(mode==='overnight-tp')assert.ok(last('Night')>0,'carry trade keeps its structure until overnight TP');
 console.log('PASS V1 structure scope 0 -> TP, preserves 0/1:',mode);
}
