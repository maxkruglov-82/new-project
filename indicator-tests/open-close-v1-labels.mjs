import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const financial=source.slice(source.indexOf('var array<label> firstPointLabels'),source.indexOf('// Окраска истории пересчитывается'));
assert.equal(createHash('sha256').update(financial).digest('hex'),'601ad5d862c714b1c195e89b6a952f713ed4bcd7e853684e8d9b051de857c3fc','financial engine unchanged by visual edits');
const diag=`
int invalidCaption = 0
int zeroCount = 0
int oneCount = 0
int structuralCount = 0
int legacyCount = 0
if barstate.islast
    if array.size(marketStructureLabels) > 0
        for i = 0 to array.size(marketStructureLabels) - 1
            string caption = label.get_text(array.get(marketStructureLabels,i))
            bool anchorCaption = caption == "0 · H" or caption == "0 · L" or caption == "1 · H" or caption == "1 · L"
            bool structureCaption = caption == "HH" or caption == "HL" or caption == "LH" or caption == "LL"
            if not anchorCaption and not structureCaption
                invalidCaption := invalidCaption + 1
            if caption == "0 · H" or caption == "0 · L"
                zeroCount := zeroCount + 1
            if caption == "1 · H" or caption == "1 · L"
                oneCount := oneCount + 1
            if structureCaption
                structuralCount := structuralCount + 1
    if array.size(firstPointLabels) > 0
        for i = 0 to array.size(firstPointLabels) - 1
            if label.get_text(array.get(firstPointLabels,i)) != ""
                legacyCount := legacyCount + 1
plot(invalidCaption,"Invalid")
plot(zeroCount,"Zero")
plot(oneCount,"One")
plot(structuralCount,"Structure")
plot(legacyCount,"Legacy")
`;
for(const name of ['mexc-sol-usdt-m5-2026-10-13.json','mexc-sol-usdt-m5-2026-10-21-v1-structure.json']){
 const f=JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url)));
 const data=f.candles.map(b=>({...b,volume:b.vol,openTime:b.time*1000,closeTime:b.time*1000+299999}));
 const c=await new PineTS(data,'SOLUSDT','5').run(source+diag),last=n=>c.plots[n].data.at(-1).value;
 assert.equal(last('Invalid'),0);
 assert.equal(last('Legacy'),0);
 assert.ok(last('Zero')>=1);assert.ok(last('One')>=1);assert.ok(last('Structure')>=1);
 console.log('PASS V1 labels: only 0/1 H/L and HH/HL/LH/LL; no other numbers or subscripts:',name);
}
