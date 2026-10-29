import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE.txt',root),'utf8');
const old=process.argv[2]?readFileSync(process.argv[2],'utf8'):execFileSync('git',['show','cb3fd6d:KRYTES_V1_LONDON_STRUCTURE.txt'],{cwd:root,encoding:'utf8'});
for(const [day,name,ends] of [['09','mexc-sol-usdt-m5-2026-10-09-v1-structure.json',['20:45','22:35']],['16','mexc-sol-usdt-m5-2026-10-16.json',['18:15','22:10']]]){
 const f=JSON.parse(readFileSync(new URL('fixtures/'+name,import.meta.url)));
 const data=f.candles.map(x=>({...x,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const a=await new PineTS(data,'SOLUSDT','5').run(old),b=await new PineTS(data,'SOLUSDT','5').run(source);
 for(const n of Object.keys(a.plots).filter(n=>!n.startsWith('__')))assert.deepEqual(b.plots[n].data,a.plots[n].data,'financial values unchanged '+n);
 const boxes=c=>c.plots.__boxes__.data.flatMap(x=>x.value).filter(x=>!x._deleted&&x.border_color.endsWith('00'));
 const before=boxes(a),after=boxes(b);
 assert.equal(after.length,4);assert.equal(before.length,4);
 for(let i=0;i<4;i++){
  assert.equal(after[i].left,before[i].left+600000,'start exactly at anchor');
  assert.equal(after[i].right,Date.parse('2026-10-'+day+'T'+ends[Math.floor(i/2)]+':00+07:00'),'frozen on M5 following exit');
 }
 console.log('PASS Oct'+day+': anchor left; SL/TP + one M5 right; later setup cannot move closed boxes; financial values unchanged');
}
