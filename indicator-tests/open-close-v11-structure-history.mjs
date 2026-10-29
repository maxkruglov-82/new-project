import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const f=JSON.parse(readFileSync(new URL('./fixtures/mexc-sol-usdt-m5-2026-10-20-structure-reversal.json',import.meta.url)));
const data=f.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
const original=readFileSync(new URL('../KRYTES_V1_1_LONDON.txt',import.meta.url),'utf8');
const start=Date.parse('2026-10-20T12:00:00+07:00'),end=Date.parse('2026-10-21T00:00:00+07:00');
const inject=`if barstate.islast
    for i = 0 to 179
        int futureTime = ${end} + i * 300000
        bool highPoint = i % 2 == 0
        recordMarketSwing(marketSwingTimes, marketSwingPrices, marketSwingHighs, marketSwingDays, futureTime, highPoint ? 110 : 109, highPoint, 20261021)
        recordMarketSwing(structureHistoryTimes, structureHistoryPrices, structureHistoryHighs, structureHistoryDays, futureTime, highPoint ? 110 : 109, highPoint, 20261021, 10000)
    while array.size(firstPointLabels) > 0
        label.delete(array.pop(firstPointLabels))
    array.clear(classifiedSwingIds)
    array.clear(classifiedSwingHighs)
`;
const diagnostics=`
int checkZero = 0
int checkOne = 0
int checkHH = 0
int checkFuture = 0
if barstate.islast and array.size(marketStructureLabels) > 0
    for i = 0 to array.size(marketStructureLabels) - 1
        label mark = array.get(marketStructureLabels, i)
        string markText = label.get_text(mark)
        if markText == "0" or str.startswith(markText, "0 · ")
            checkZero := checkZero + 1
        if markText == "1" or str.startswith(markText, "1 · ")
            checkOne := checkOne + 1
        if str.contains(markText, "HH")
            checkHH := checkHH + 1
        if label.get_x(mark) >= ${end}
            checkFuture := checkFuture + 1
plot(checkZero,"Zero")
plot(checkOne,"One")
plot(checkHH,"HH")
plot(checkFuture,"Future")
plot(array.size(marketSwingTimes),"EngineSize")
plot(array.size(structureHistoryTimes),"ArchiveSize")
plot(array.size(marketStructureLabels),"Rendered")
`;
const engine=new PineTS(data,'SOLUSDT','5');engine.setVisibleRange(start,end-1);
const c=await engine.run(original.replace('// Обычные номера системы сохраняются.',inject+'\n// Обычные номера системы сохраняются.')+diagnostics);
const last=n=>c.plots[n].data.at(-1).value;
assert.equal(last('EngineSize'),120);
assert.ok(last('ArchiveSize')>180);
assert.equal(last('Zero'),1,'0 survives removal of all transient number labels');
assert.equal(last('One'),1,'1 survives removal of all transient number labels');
assert.ok(last('HH')>0,'older visible structure survives 180 later pivots');
assert.equal(last('Future'),0,'later pivots do not consume labels in the historical viewport');
assert.ok(last('Rendered')<=120);
assert.equal(c.plots['Вход LONG/SHORT'].data.find((b,i)=>data[i].openTime===Date.parse('2026-10-20T20:40:00+07:00')).value,1);
console.log('PASS historical viewport: HH/HL restored beyond 120 later pivots; 0/1 retained, no future labels, financial signals unchanged');
