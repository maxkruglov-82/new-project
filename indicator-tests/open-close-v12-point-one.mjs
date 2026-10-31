import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from '../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const source=readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8');
for(const mirror of [false,true]){
 const p=x=>mirror?200-x:x,start=Date.UTC(2026,9,20,8);
 const pairs=[[101,105],[105,104],[104,103],[103,102],[102,101],[101,101],[104,106],[106,105],[105,104],[104,103],[103,104]];
 const bars=pairs.map(([o,c],i)=>({open:p(o),close:p(c),high:Math.max(p(o),p(c))+.2,low:Math.min(p(o),p(c))-.2,volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 // A wick beyond the original body's edge cannot confirm a body close.
 if(mirror)bars[3].high=100;else bars[3].low=100;
 const marker='if barstate.isconfirmed and firstPointWindow and m5Chart\n    bool contiguousPair';
 const setup=`m5Chart := true\nfirstPointWindow := true\nactiveRangeHigh := ${mirror?110:100}\nactiveRangeLow := ${mirror?100:90}\n`;
 const c=await new PineTS(bars,'TEST','5').run(source.replace(marker,setup+'\n'+marker)+'\nplot(structureFirstPrice,"one")\nplot(firstSwingDisplayLocked?1:0,"locked")\nplot(firstRetreatBodyConfirmed?1:0,"retreated")');
 const v=(n,i)=>c.plots[n].data[i].value;
 for(let i=0;i<6;i++){assert.equal(v('one',i),p(105));assert.equal(v('locked',i),0);assert.equal(v('retreated',i),0,'wick/equality is insufficient');}
 for(let i=6;i<11;i++)assert.equal(v('one',i),p(106),'unconfirmed new extreme relocates1');
 assert.equal(v('retreated',6),0,'relocation resets body condition');
 assert.equal(v('retreated',9),1);assert.equal(v('locked',9),0);assert.equal(v('locked',10),1,'five M5 plus body retreat confirm1');
 console.log('PASS point1 body retreat, relocation and strict equality; mirror='+mirror);
}

for(const mirror of [false,true]){
 const p=x=>mirror?200-x:x,start=Date.UTC(2026,9,20,8);
 const pairs=[[104,105],[105,102],[102,103],[103,104],[104,103],[103,104],[104,106],[106,105],[105,104],[104,103],[103,104]];
 const bars=pairs.map(([o,c],i)=>({open:p(o),close:p(c),high:Math.max(p(o),p(c))+.2,low:Math.min(p(o),p(c))-.2,volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 const marker='if barstate.isconfirmed and firstPointWindow and m5Chart\n    bool contiguousPair';
 const setup=`m5Chart := true\nfirstPointWindow := true\nactiveRangeHigh := ${mirror?110:100}\nactiveRangeLow := ${mirror?100:90}\n`;
 const c=await new PineTS(bars,'TEST','5').run(source.replace(marker,setup+'\n'+marker)+'\nplot(structureFirstPrice,"one")\nplot(firstExtremeTime,"anchorTime")\nplot(firstExtremeOpen,"bodyEdge")\nplot(firstSwingDisplayLocked?1:0,"locked")\nplot(firstRetreatBodyConfirmed?1:0,"retreated")');
 const v=(n,i)=>c.plots[n].data[i].value;
 assert.equal(v('bodyEdge',0),p(104));
 assert.equal(v('anchorTime',1),start+300000,'wider adjacent candle becomes point1 candle');
 assert.equal(v('bodyEdge',1),p(102),'opposite body edge belongs to wider candle');
 for(let i=1;i<=5;i++){assert.equal(v('one',i),p(105));assert.equal(v('retreated',i),0);assert.equal(v('locked',i),0,'replacement candle cannot confirm its own retreat');}
 assert.equal(v('one',6),p(106),'new extreme relocates1, not a continuation signal');
 assert.equal(v('anchorTime',7),start+6*300000,'smaller following body cannot replace1');
 assert.equal(v('locked',10),1);
 console.log('PASS wider equal-extreme candle replaces1, smaller body does not; mirror='+mirror);
}
