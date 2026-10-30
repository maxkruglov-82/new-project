import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('KRYTES_V1_LONDON_STRUCTURE.txt',root),'utf8');
const old=process.argv[2]?readFileSync(process.argv[2],'utf8'):execFileSync('git',['show','b2375d6:KRYTES_V1_LONDON_STRUCTURE.txt'],{cwd:root,encoding:'utf8'});
const f=JSON.parse(readFileSync(new URL('fixtures/mexc-sol-usdt-m5-2026-04-08-v1-anchors.json',import.meta.url)));
for(const mirror of [false,true]){
 const price=x=>mirror?200-x:x;
 const d=f.candles.map(x=>({...x,open:price(x.open),close:price(x.close),high:mirror?price(x.low):x.high,low:mirror?price(x.high):x.low,volume:x.vol,openTime:x.time*1000,closeTime:x.time*1000+299999}));
 const a=await new PineTS(d,'SOLUSDT','5').run(old),b=await new PineTS(d,'SOLUSDT','5').run(source);
 for(const n of Object.keys(a.plots).filter(n=>!n.startsWith('__')&&n!=='Действующий цвет тренда'))assert.deepEqual(b.plots[n].data,a.plots[n].data,'financial series unchanged: '+n);
 const anchors=c=>c.plots.__labels__.data.flatMap(x=>x.value).filter(x=>!x._deleted&&/^[01] ·/.test(x.text));
 const before=anchors(a),after=anchors(b);
 assert.equal(after.length,2);
 const z=after.find(x=>x.text.startsWith('0')),o=after.find(x=>x.text.startsWith('1'));
 assert.ok(before.find(x=>x.text.startsWith('0')).x>before.find(x=>x.text.startsWith('1')).x,'fixture reproduces invalid old order');
 assert.ok(z.x<o.x,'0 strictly precedes 1');
 assert.equal(z.text,mirror?'0 · H':'0 · L');assert.equal(o.text,mirror?'1 · L':'1 · H');
 assert.ok(mirror?z.y>o.y:z.y<o.y);
 console.log('PASS April08'+(mirror?' mirrored':'')+': 0 before1, opposite H/L, financial values unchanged; '+JSON.stringify([z.x,z.y,o.x,o.y]));
}
