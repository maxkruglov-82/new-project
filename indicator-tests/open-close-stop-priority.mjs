import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true])for(const secondStop of [false,true]){
 const tail=[[99.05,99.2],[99.2,99.1],[99.1,98.9],[98.9,98.7],[98.7,98.5],[98.5,98.4],[98.4,98.9],[98.9,100.8],[100.8,100.9],[100.9,99.4],[99.4,secondStop?98.3:100.91],[secondStop?98.3:100.91,101]];
 const {v}=await scenario(mirror,tail,{24:{high:99.8},25:{low:98.3},...(secondStop?{28:{high:101}}:{})});
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',25),-1,'body SL wins over wick TP on same bar');
 assert.equal(v('SLMarks',25),1,'first SL plus is retained');
 assert.equal(v('TPMarks',25),0,'no TP plus for the ambiguous candle');
 assert.equal(v('Вход LONG/SHORT',27),mirror?-1:1,'second trade allowed on later retest');
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',28),secondStop?-1:1,'same priority also applies to second trade');
 assert.equal(v('SLMarks',28),secondStop?2:1);
 assert.equal(v('TPMarks',28),secondStop?0:1);
 assert.equal(v('Входов за день',29),2,'no third trade after second SL or TP');
 console.log('PASS SL priority over wick TP',mirror?'LONG then SHORT':'SHORT then LONG',secondStop?'both stops':'SL then TP');
}
