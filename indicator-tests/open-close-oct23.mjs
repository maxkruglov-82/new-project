import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const raw=JSON.parse(readFileSync(new URL('../indicator-tests/fixtures/mexc-sol-usdt-m5-2026-10-23.json',import.meta.url))).candles;
const start=Date.parse('2026-10-23T14:00:00+07:00'),end=start+86400000;
const data=raw.filter(b=>b.time*1000>=start&&b.time*1000<end).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+299999,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8')+'\nplot(structureFirstPrice,"P1")\nplot(confirmedSecondPrice,"P2")\nplot(confirmedThirdPrice,"P3")';
const ctx=await new PineTS(data,'SOLUSDT','5').run(source);
const value=(n,i)=>ctx.plots[n].data[i].value;
const at=data.findIndex(b=>new Date(b.openTime+25200000).toISOString().slice(11,16)==='18:05');
for(const [key,expected] of Object.entries({P1:103.94,P2:104.43,P3:103.88})) {
 if(Math.abs(value(key,at)-expected)>1e-8 || !Number.isFinite(value(key,at))) throw new Error(key+' mismatch: '+value(key,at));
}
if(Number.isFinite(value('P3',at-1))) throw new Error('Point 3 appeared before second close');
console.log('PASS October 23: P1=103.94, P2=104.43, P3=103.88; confirmed at 18:05 bar');
