import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true])for(const result of ['tp','sl','waiting']){
 const tail=[[99.05,100.805],[100.805,100.81],[100.81,101.2]];
 if(result!=='waiting')tail.push([101.2,99.8],[99.8,result==='tp'?101.3:98.6]);
 const {v,data}=await scenario(mirror,tail);
 for(let i=0;i<=20;i++)assert.equal(v('OutcomeMarks',i),0,'no marker on unexecuted plan');
 if(result!=='waiting'){
  assert.equal(v('OutcomeMarks',21),0,'entry itself is not outcome');
  assert.equal(v('OutcomeMarks',22),1,'exactly one result marker');
  assert.equal(v('IsTake',22),result==='tp'?1:-1);
  assert.equal(v('MarkY',22),v(result==='tp'?'Цель позиции':'Стоп позиции',21),'mark on actual target or stop price');
  assert.equal(v('MarkX',22),data[22].openTime+900000,'one M5 to right of tool endpoint');
 }
 console.log('PASS right-side outcome mark',mirror?'SHORT':'LONG',result);
}
