import assert from 'node:assert/strict';
import {scenario} from './open-close-zero-condition.mjs';
for(const mirror of [false,true]){
 const base=[[99.05,100.805],[100.805,100.81],[100.81,101.2]];
 const first=[101.2,100.2],second=[100.2,100.1];
 const {v}=await scenario(mirror,[...base,first,second,[100.1,101.3]],{21:{low:99.85},22:{low:99.8}});
 assert.equal(v('Вход LONG/SHORT',21),0);
 assert.equal(v('Вход LONG/SHORT',22),mirror?-1:1);
 assert.equal(v('Цена входа по close',22),mirror?100.1:99.9);
 assert.equal(v('RR входа',22),1);
 assert.equal(v('Выход TP 1 / SL -1 / неизвестно 2',23),1);
 const missed=await scenario(mirror,[...base,first,second,[100.1,100.2]],{21:{low:99.85},23:{low:99.8}});
 assert.equal(missed.v('Входов за день',23),0,'nonconsecutive touches cannot fill');
 const stopped=await scenario(mirror,[...base,first,[100.2,98.5]],{21:{low:99.85}});
 assert.equal(stopped.v('Входов за день',22),0,'body through stop cancels before entry');
 const changed=await scenario(mirror,[...base,first,[100.2,101.4]],{21:{low:99.85},22:{low:99.8}});
 assert.equal(changed.v('Входов за день',22),0,'changed target and RR level reset touch pair');
 console.log('PASS two wick touches, exact RR entry, TP, missed bar, changed level and invalid stop',mirror?'SHORT':'LONG');
}
