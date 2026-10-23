import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=readFileSync(new URL('../near-binance/near_setup.pine',import.meta.url),'utf8');
const module=await import(process.env.PINETS_MODULE||'pinets');
const PineTS=module.PineTS||module.default;
const start=Date.parse('2026-10-20T14:00:00+07:00'),step=300000;
const candle=(i,o,h,l,c)=>({openTime:start+i*step,closeTime:start+(i+1)*step-1,open:o*0.03,high:h*0.03,low:l*0.03,close:c*0.03,volume:100});
const bars=()=>[...Array.from({length:12},(_,i)=>candle(i,104,106,101,103)),
 candle(12,102,103,100.5,101.5),candle(13,101,102,100,101),
 candle(14,101,102.5,100.6,102),candle(15,102,104,101,103),
 candle(16,103,103.5,101.5,102),candle(17,102,103,99,100),
 candle(18,100,101.8,99.4,101),candle(19,101,102.2,100,102),
 candle(20,102,102.3,98,99)];
const value=(ctx,k,i)=>ctx.plots[k].data[i].value;
test('NEAR .txt совпадает с .pine; вычисления точно соответствуют исходной Solana v32',()=>{
 assert.equal(source,readFileSync(new URL('../near-binance/near_setup.txt',import.meta.url),'utf8'));
 const normalized=source.replace('NEAR/USDT Binance — часовой диапазон, SHORT и LONG 1:1 v32','SOL — часовой диапазон, SHORT и LONG 1:1 v32').replace('// График: NEAR/USDT, Binance USDT Perpetual Futures, 5 минут.','// График: SOL/USDT, MEXC Futures, 5 минут.');
 assert.equal(createHash('sha256').update(normalized).digest('hex'),'d2e5c19f3a1ed72ae611eadd056268facf89c716485c12b4d4f4a9028c47f00b');
});
for(const side of ['SHORT','LONG'])test(`NEAR ${side}: исходник исполняется с абсолютными отступами 0.03 и завершает сделку`,async()=>{
 const raw=bars();const data=side==='SHORT'?raw:raw.map(b=>({...b,open:6.21-b.open,high:6.21-b.low,low:6.21-b.high,close:6.21-b.close}));
 const last=data.at(-1);const ctx=await new PineTS([...data,{...last,openTime:last.openTime+step,closeTime:last.closeTime+step}],'NEARUSDT','5').run(source);
 const price=p=>side==='SHORT'?p:6.21-p;
 assert.equal(value(ctx,side,19),1);
 for(const [field,p] of [['Entry',3.06],['Stop',3.18],['Target',3]])assert.ok(Math.abs(value(ctx,`${side} ${field}`,19)-price(p))<1e-9);
 assert.equal(value(ctx,'Outcome',20),1);
});
test('NEAR: часовой график сообщает о необходимости M5',async()=>{
 const data=bars();await assert.rejects(new PineTS(data,'NEARUSDT','60').run(source),/5 минут/);
});
