import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true])for(const secondStop of [false,true]){
 const tail=[[99.05,99.2],[99.2,99.1],[99.1,98.9],[98.9,98.7],[98.7,98.5],[98.5,98.9],[98.9,100.8],[100.8,100.9],[100.9,99.4],[99.4,secondStop?98.4:100.91],[secondStop?98.4:100.91,100.81],[100.81,101]];
 const {v}=await scenario(mirror,tail,{23:{high:99.8},24:{low:98.4},...(secondStop?{27:{high:101}}:{})});
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',24),-1,'body SL wins over wick TP on same bar');
 assert.equal(v('SLMarks',24),1,'first SL plus is retained');
 assert.equal(v('TPMarks',24),0,'no TP plus for the ambiguous candle');
 assert.equal(v('Вход LONG/SHORT',26),mirror?-1:1,'second trade allowed on later retest');
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',27),secondStop?-1:1,'same priority also applies to second trade');
 assert.equal(v('SLMarks',27),secondStop?2:1);
 assert.equal(v('TPMarks',27),secondStop?0:1);
 assert.equal(v('Входов за день',29),2,'no third trade after second SL or TP');
 console.log('PASS SL priority over wick TP',mirror?'LONG then SHORT':'SHORT then LONG',secondStop?'both stops':'SL then TP');
}
