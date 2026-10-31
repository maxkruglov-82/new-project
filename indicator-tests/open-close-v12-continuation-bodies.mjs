import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';
import{PineTS}from'../new-project-2/node_modules/pinets/dist/pinets.min.es.js';
const sources={draft:readFileSync(new URL('../KRYTES_V1_2_LONDON_STRUCTURE.txt',import.meta.url),'utf8')};
for(const mirror of[false,true])for(const mode of['roll','filled','samebar']){
 const p=x=>mirror?200-x:x,start=Date.UTC(2026,9,20,5),values=[100,99,101,102,104,105,104,103.5,104,104.5,110,109,108,107,106,102,103,104,105];
 const bars=values.map((x,i)=>({open:p(x),close:p(x),high:p(x)+.1,low:p(x)-.1,volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 const touch=mode==='roll'?15:mode==='filled'?10:14;if(mirror){bars[touch].low=200-values[touch]-.1;bars[touch].high=102.6;}else{bars[touch].low=97.4;bars[touch].high=values[touch]+.1;}
 const injection=`\nfirstPointWindow := true\npointPairM5 := true\nfirstSwingDisplayLocked := true\nstructureDay := rangeDayKey\nconfirmedZeroPrice := ${p(90)}\nconfirmedZeroTime := ${start-600000}\nstructureFirstPrice := 100\nfirstExtremeTime := ${start-300000}\n`;
 for(const variant of['draft']){
  const c=await new PineTS(bars,'TEST','5').run(sources[variant].replace('// V1.2: исполнение отдельно',injection+'\n// V1.2: исполнение отдельно'));
  const fills=bars.flatMap((b,i)=>c.plots['Вход LONG/SHORT'].data[i].value?[{i,entry:c.plots['Цена входа по close'].data[i].value,target:c.plots['Цель позиции'].data[i].value}]:[]);
  if(variant==='draft'&&mode==='roll'){assert.equal(fills.length,0);continue;}
  assert.equal(fills.length,1);assert.equal(fills[0].i,touch);
  const roll=variant==='draft'&&mode==='roll';assert.equal(fills[0].target,p(roll?110:105));assert.equal(fills[0].entry,p(roll?100:97.5));
 }
 console.log('PASS',mode,'mirror='+mirror);
}

for(const mirror of [false,true]){
 const p=x=>mirror?200-x:x,start=Date.UTC(2026,9,20,5);
 const values=[100,99,101,102,104,105,104,103.5,104,104.5,110,109,108,107,106,103,102,100,101,102,103,104,103,102,101,100,98,99,100,101,102,104,99,98];
 const bars=values.map((x,i)=>({open:p(x),close:p(x),high:p(x)+.1,low:p(x)-.1,volume:1,openTime:start+i*300000,closeTime:start+i*300000+299999}));
 const injection=`\nfirstPointWindow := true\npointPairM5 := true\nfirstSwingDisplayLocked := true\nstructureDay := rangeDayKey\nconfirmedZeroPrice := ${p(90)}\nconfirmedZeroTime := ${start-600000}\nstructureFirstPrice := 100\nfirstExtremeTime := ${start-300000}\n`;
 const c=await new PineTS(bars,'TEST','5').run(sources.draft.replace('// V1.2: исполнение отдельно',injection+'\n// V1.2: исполнение отдельно')+'\nplot(thirdBreakTime,"testBreakTime")');
 const fills=bars.flatMap((b,i)=>c.plots['Вход LONG/SHORT'].data[i].value?[{i,side:c.plots['Вход LONG/SHORT'].data[i].value,stop:c.plots['Стоп позиции'].data[i].value,target:c.plots['Цель позиции'].data[i].value}]:[]);
 assert.equal(c.plots.testBreakTime.data[14].value,NaN);
 assert.equal(c.plots.testBreakTime.data[15].value,start+15*300000);
 assert.deepEqual(fills,[{i:31,side:mirror?1:-1,stop:p(110),target:p(98)}]);
 console.log('PASS opposite triple above original zero, stop third extreme, mirror='+mirror);
}
