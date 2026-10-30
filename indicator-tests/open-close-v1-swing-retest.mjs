import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('rrReactionSwing('),source.indexOf('// Свеча экстремума'));
const retest=source.slice(source.indexOf('            bool reactionRetest ='),source.indexOf('            float currentTarget'));
const logic=source.slice(source.indexOf('                bool closesOnEntrySide ='),source.indexOf('                if dailyPositionEntries < dailyEntryLimit'));
for(const side of [1,-1])for(const kind of ['reaction','shallow','falling','level change']){
 const lows=kind==='falling'?[11,10.5,10,9.5,9,8.5]:kind==='shallow'?[11,10.2,9.8,9.9,10.1,9.9]:[11,10.2,9,9.5,10.1,9.9];
 const closes=kind==='falling'?[11.5,11,10.5,10,9.5,9]:[11.5,10.5,9.5,10.5,10.4,10.2];
 const p=x=>side===1?x:20-x;
 const bars=lows.map((low,i)=>({open:p(closes[i]),close:p(closes[i]),low:side===1?low:p(Math.max(closes[i]+0.1,low+0.3)),high:side===1?Math.max(closes[i]+0.1,low+0.3):p(low),volume:1,openTime:Date.UTC(2026,0,5,0,i*5),closeTime:Date.UTC(2026,0,5,0,i*5)+299999}));
 const strip=(s,n)=>s.split('\n').map(l=>l.startsWith(' '.repeat(n))?l.slice(n):l).join('\n');
 const pine=`//@version=5
indicator("reaction test")
${helper}
var int rrReactionSetup = na
var float rrReactionLevel = na
var float rrReactionPivot = na
var int rrReclaimBar = na
int positionSide = ${side}
float positionThreshold = ${kind==='level change'?`bar_index >= 4 ? ${p(10.2)} : 10`:'10'}
int positionSetupBar = -3
bool touchedRRZone = low <= positionThreshold and high >= positionThreshold
bool originConfirmed = true
bool pendingDirectionAllowed = true
bool notifyZoneTouch = false
float positionStop = ${p(8)}
float positionTarget = ${p(12)}
`+strip(retest,12)+strip(logic,16)+'\nplot(confirmedRREntry ? 1 : 0,"entry")';
 const result=await new PineTS(bars,'TEST','5').run(pine);
 assert.deepEqual(result.plots.entry.data.map(x=>x.value),['reaction','shallow'].includes(kind)?[0,0,0,0,0,1]:[0,0,0,0,0,0],`${side} ${kind}`);
}
console.log('PASS mirrored swing -> closed reclaim -> later retest; no entry on continuous decline or changed RR');
