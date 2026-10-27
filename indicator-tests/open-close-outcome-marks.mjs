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
  assert.equal(v('StopLabelY',21),v('Стоп позиции',21),'red stop caption on stop level');
  assert.equal(v('TargetLabelY',21),v('Цель позиции',21),'green target caption on target level');
  assert.equal(v('EntryLabelY',21),v('Цена входа по close',21),'blue entry caption on entry level');
  assert.equal(v('MarkY',22),v(result==='tp'?'Цель позиции':'Стоп позиции',21),'mark on actual target or stop price');
  assert.equal(v('MarkX',22),data[22].openTime+600000,'aligned with tool right endpoint, as v72');
 }
 console.log('PASS right-side outcome mark',mirror?'SHORT':'LONG',result);
}
