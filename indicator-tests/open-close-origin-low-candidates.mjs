import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_OPEN_CLOSE_MASKED.txt',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('findRangeOrigin('),source.indexOf('// Внутренний формат:'));
const start=Date.parse('2026-10-21T13:00:00+07:00');
const cases=[
 {name:'five candles include anchor, breaking candle excluded',p:[110,109,108,107,108,111,112],end:6,expected:3},
 {name:'four candles rejected',p:[110,109,108,109,111,112],end:5,expected:null},
 {name:'low of initial candle excluded',p:[110,109,108,107,108,111,112],opens:{0:90},end:6,expected:3},
 {name:'later higher low cannot replace lower candidate',p:[110,109,108,107,108,111,110,109,108,109,112,113],end:11,expected:3},
 {name:'later lower low replaces earlier candidate',p:[110,109,108,107,108,111,110,109,106,109,112,113],end:11,expected:8},
 {name:'equal minimum uses last occurrence',p:[110,109,108,107,107,111,112],end:6,expected:4},
 {name:'body high update stops even if close stays below anchor',p:[110,109,108,107,108,109],opens:{4:111},end:5,expected:null},
 {name:'never scan point 1 or later future',p:[110,109,108,107,106,105,104],end:4,expected:null},
 {name:'M5 gap stops candidate',p:[110,109,108,107,108,109,111],end:6,gap:3,expected:null},
];
for(const fixture of cases){
 const cs=fixture.p,os=cs.map((x,i)=>fixture.opens?.[i]??x),ts=cs.map((_,i)=>start+(i+(fixture.gap!==undefined&&i>=fixture.gap?1:0))*300000);
 const script='//@version=5\nindicator("low candidates")\n'+fn+`\nvar os=array.from(${os})\nvar cs=array.from(${cs})\nvar ts=array.from(${ts})\n[p,t]=findRangeOrigin(os,cs,ts,-1,${start},${ts[fixture.end]})\nplot(p,"P")\nplot(t,"T")`;
 const data=ts.slice(0,2).map(t=>({open:1,close:1,high:1,low:1,volume:1,openTime:t,closeTime:t+299999}));
 const c=await new PineTS(data,'SOLUSDT','5').run(script),v=n=>c.plots[n].data.at(-1).value;
 if(fixture.expected===null)assert.ok(Number.isNaN(v('T')),fixture.name);else{
  assert.equal(v('T'),ts[fixture.expected],fixture.name);
  assert.equal(v('P'),Math.min(os[fixture.expected],cs[fixture.expected]),fixture.name);
 }
 console.log('PASS LOW origin:',fixture.name);
}
