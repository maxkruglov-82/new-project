import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(confirmedZeroTime,"T0")';
const start=Date.parse('2026-10-21T14:00:00+07:00');
const seq=[[100,100],[100,101],[101,99.9],[99.9,100],[100,100.2],[100.2,100.3],[100.3,100.5],[100.5,100.4],[100.4,100.3],[100.3,100.2],[100.2,100.1],[100.1,100],[100,98.8],[98.8,98.6],[98.6,98.7],[98.7,98.8],[98.8,98.9]];
for(const mirror of [false,true]){
 const data=seq.map(([open,close],i)=>{let high=i<12?102:150,low=i<12?99:50;if(mirror){open=200-open;close=200-close;[high,low]=[200-low,200-high];}return {open,close,high,low,volume:1,openTime:start+i*300000,closeTime:start+(i+1)*300000-1};});
 const c=await new PineTS(data,'SOLUSDT','5').run(source),v=n=>c.plots[n].data.at(-1).value;
 assert.equal(v('Цена точки 0'),mirror?99.5:100.5,'four-bar retreat inside large candle must permit later origin');
 assert.equal(v('T0'),start+6*300000);
 console.log('PASS four-bar retreat inside extreme candle body updates origin',mirror?'low':'high');
}
