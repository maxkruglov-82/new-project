import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const raw=JSON.parse(readFileSync(new URL('../new-project-2/drafts/bag-ab-2026-10-23/candles-six-months.json',import.meta.url))).candles;
const start=Date.parse('2026-10-08T14:00:00+07:00'),end=start+86400000;
const originalData=raw.filter(b=>b.time*1000>=start&&b.time*1000<end).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+299999,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
let source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const names=['firstExtremeOpen','firstRetreatCloses','firstConfirmedBar','activeRangeHigh','activeRangeLow','structureFirstPrice','firstSwingDisplayPrice','middlePrice','candidateOppositeBody','pullbackCloseCount','confirmedSecondPrice','confirmedThirdPrice','thirdOppositeBody','thirdRetreatCloses'];
for(const n of names)source+=`\nplot(${n},"${n}")`;
source+='\nplot(secondPointReady?1:0,"ready")\nplot(structureCompleted?1:0,"done")\nplot(thirdLocked?1:0,"locked")';
source+='\nplot(firstSwingDisplayLocked ? 1 : 0,"FirstReady")';
for(const mirror of [false,true]){
 const data=originalData.map(b=>mirror?{...b,open:230-b.open,close:230-b.close,high:230-b.low,low:230-b.high}:b);
 const ctx=await new PineTS(data,'SOLUSDT','5').run(source);
 const v=(n,i)=>ctx.plots[n].data[i].value;
 const at=h=>data.findIndex(b=>new Date(b.openTime+25200000).toISOString().slice(11,16)===h);
 if(v('FirstReady',at('15:10'))!==0)throw new Error('Three bars cannot confirm 1');
 if(v('FirstReady',at('15:15'))!==1)throw new Error('Fourth bar including extreme must confirm 1');
 const expected=mirror?114.97:115.03;
 if(Math.abs(v('confirmedSecondPrice',at('15:30'))-expected)>1e-8)throw new Error('Early point 2 missing');
 console.log('PASS October 8 inclusive four bars',mirror?'mirrored':'original','P2='+expected);
}
