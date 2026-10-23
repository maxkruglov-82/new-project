import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
const source=readFileSync(new URL('../sol_h4_m15_rr2.pine',import.meta.url),'utf8');
const module=await import(process.env.PINETS_MODULE||'pinets');
const PineTS=module.PineTS||module.default;
const start=Date.parse('2026-10-20T11:00:00+07:00'),step=900000;
mock.timers.enable({apis:['Date'],now:start});
const c=(i,open,high,low,close,day=0)=>({openTime:start+day*86400000+i*step,closeTime:start+day*86400000+(i+1)*step,open,high,low,close,volume:100});
const h4=(high=110,low=100,day=0)=>Array.from({length:16},(_,i)=>c(i,105,high,low,106,day));
// P1=114 on17, confirmed18; P2=105 on20, confirmed21; P3=115 on22.
const pattern=()=>[...h4(),c(16,109,112,106,111),c(17,111,114,108,113),c(18,113,113,109,110),c(19,110,111,107,108),c(20,108,110,105,106),c(21,106,112,106,111),c(22,111,115,109,114),c(23,114,114,107,108),c(24,108,116,107,115)];
const mirror=data=>data.map(b=>({...b,open:210-b.open,high:210-b.low,low:210-b.high,close:210-b.close}));
const values=(ctx,k)=>ctx.plots[k].data.slice(0,-1).map(x=>x.value);
const v=(ctx,k,i)=>values(ctx,k)[i];
const count=(ctx,k)=>values(ctx,k).filter(Boolean).length;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
async function run(data,tf='15',tick=.01) {
 const last=data.at(-1),guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};
 mock.timers.setTime(guard.openTime+1000);
 const provider={getMarketData:async()=>[...data,guard],getSymbolInfo:async()=>({mintick:tick,timezone:'Etc/UTC',ticker:'SOLUSDT',tickerid:'BINANCE:SOLUSDT',type:'futures'})};
 return new PineTS(provider,'SOLUSDT',tf).run(source);
}
test('v1: PINЕ и TXT совпадают',()=>assert.equal(source,readFileSync(new URL('../sol_h4_m15_rr2.txt',import.meta.url),'utf8')));
test('16 закрытых M15 собирают H4; первая свеча15:00 задаёт приоритет',async()=>{
 const ctx=await run(pattern());
 assert.ok(values(ctx,'H4 High').slice(0,15).every(Number.isNaN));
 assert.equal(v(ctx,'H4 High',15),110);assert.equal(v(ctx,'H4 Low',15),100);
 assert.equal(v(ctx,'Stage',15),1);assert.equal(v(ctx,'Direction',16),1);assert.equal(v(ctx,'Stage',16),2);
});
for(const side of ['LONG','SHORT'])for(const tick of [.01,.001])test(`${side}: структура1–2–3, стоп за P2 на тик ${tick}, RR2, ретест и тейк`,async()=>{
 const ctx=await run(side==='LONG'?pattern():mirror(pattern()),'15',tick),price=x=>side==='LONG'?x:210-x;
 assert.equal(v(ctx,'Stage',17),2);assert.equal(v(ctx,'Stage',18),7);
 assert.equal(v(ctx,'Stage',20),7);assert.equal(v(ctx,'Stage',21),8);assert.equal(v(ctx,'Stage',22),3);
 near(v(ctx,'Point 1',22),price(114));near(v(ctx,'Point 2',22),price(105));near(v(ctx,'Point 3',22),price(115));
 assert.equal(v(ctx,side,22),0);assert.equal(v(ctx,side,23),1);assert.equal(count(ctx,side),1);
 const s=price(105-tick),t=price(115),e=(2*s+t)/3;
 for(const [field,x] of [['Entry',e],['Stop',s],['Target',t]])near(v(ctx,`${side} ${field}`,23),x);
 near(Math.abs(t-e)/Math.abs(e-s),2);assert.equal(v(ctx,'One Tick',23),tick);
 assert.equal(v(ctx,'Outcome',24),1);assert.ok(ctx.plots.__boxes__.data[0].value.some(b=>b.text==='RR 1:2'));
});
test('соседние свечи P1/P2 пропускаются',async()=>{
 const data=[...h4(),c(16,109,114,108,113),c(17,113,113,105,106),c(18,106,112,106,111),c(19,111,115,107,114)];
 const ctx=await run(data);assert.equal(v(ctx,'Stage',17),7);assert.equal(v(ctx,'Stage',18),7);assert.ok(Number.isNaN(v(ctx,'Point 2',18)));assert.equal(count(ctx,'LONG'),0);
});
test('равенство P1 не является пробоем P3',async()=>{
 const data=pattern().slice(0,22);data.push(c(22,111,114,109,113));const ctx=await run(data);
 assert.equal(v(ctx,'Stage',22),8);assert.ok(Number.isNaN(v(ctx,'Point 3',22)));
});
test('подтверждение P2 одновременно с пробоем P1 создаёт план без входа задним числом',async()=>{
 const data=pattern().slice(0,21);data.push(c(21,106,115,106,114),c(22,114,114,107,108));const ctx=await run(data);
 assert.equal(v(ctx,'Stage',21),3);assert.equal(v(ctx,'LONG',21),0);assert.equal(v(ctx,'LONG',22),1);
});
for(const side of ['LONG','SHORT'])test(`${side}: противоположная граница H4 меняет приоритет до входа, касание сохраняет`,async()=>{
 const data=pattern().slice(0,22);data.push(c(22,111,113,100,105),c(23,105,108,99,101));
 const ctx=await run(side==='LONG'?data:mirror(data));const dir=side==='LONG'?1:-1;
 assert.equal(v(ctx,'Direction',22),dir);assert.equal(v(ctx,'Direction',23),-dir);assert.equal(v(ctx,'Stage',23),2);
 assert.ok(Number.isNaN(v(ctx,'Point 1',23)));assert.equal(count(ctx,'LONG')+count(ctx,'SHORT'),0);
});
for(const side of ['LONG','SHORT'])test(`${side}: после стопа меняется приоритет, новая зеркальная структура и отдельный ретест`,async()=>{
 const data=pattern().slice(0,24);data.push(c(24,108,109,104,105),c(25,105,106,103,104),c(26,104,107,104,106),c(27,106,108,104.5,107),c(28,107,107.5,104.7,106),c(29,106,107,102,103),c(30,103,107,102.5,106),c(31,106,107,101,102));
 const ctx=await run(side==='LONG'?data:mirror(data));const other=side==='LONG'?'SHORT':'LONG',dir=side==='LONG'?1:-1;
 assert.equal(v(ctx,'Outcome',24),-1);assert.equal(v(ctx,'Direction',24),dir);assert.equal(v(ctx,other,24),0);
 assert.equal(v(ctx,'Direction',25),-dir);assert.equal(v(ctx,'Stage',25),2);assert.ok(Number.isNaN(v(ctx,'Point 1',25)));
 assert.equal(v(ctx,other,29),0);assert.equal(v(ctx,other,30),1);assert.equal(v(ctx,'Outcome',31),1);
 assert.equal(count(ctx,side),1);assert.equal(count(ctx,other),1);
});
test('открытая позиция не переворачивается при изменении цены до её стопа',async()=>{
 const data=pattern().slice(0,24);data.push(c(24,108,113,106,112),c(25,112,113,105,106));const ctx=await run(data);
 for(const i of [24,25]){assert.equal(v(ctx,'Stage',i),4);assert.equal(v(ctx,'Direction',i),1);near(v(ctx,'LONG Stop',i),104.99);assert.equal(v(ctx,'Outcome',i),0);}
});
test('неполная H4 с пропуском M15 не публикуется',async()=>{
 const data=pattern();data.splice(7,1);const ctx=await run(data);assert.ok(values(ctx,'H4 High').every(Number.isNaN));assert.equal(count(ctx,'LONG')+count(ctx,'SHORT'),0);
});
test('TP и SL на одной последующей M15: неопределённый исход, без автоматического разворота',async()=>{
 const data=pattern().slice(0,24);data.push(c(24,108,116,99,110),c(25,110,113,105,111));const ctx=await run(data);
 assert.equal(v(ctx,'Outcome',24),2);assert.equal(v(ctx,'Stage',25),6);assert.equal(count(ctx,'SHORT'),0);
});
test('после тейка повторный поиск не добавляется',async()=>{
 const ctx=await run([...pattern(),c(25,110,130,80,100),c(26,100,135,90,120)]);assert.equal(count(ctx,'LONG'),1);assert.equal(count(ctx,'SHORT'),0);assert.equal(v(ctx,'Outcome',26),1);
});
test('план не отменяется в полночь; новый экстремум до входа пока не переносит Фибо',async()=>{
 const ctx=await run([...pattern().slice(0,23),c(52,112,117,110,115)]);
 assert.equal(v(ctx,'Stage',23),3);near(v(ctx,'LONG Target',23),115);assert.equal(count(ctx,'LONG'),0);
});
test('новая H4 заменяет ожидающую структуру, но сохраняет открытую позицию',async()=>{
 for(const entered of [false,true]){
 const data=pattern().slice(0,entered?24:23);data.push(...h4(113,109,1));const ctx=await run(data),last=data.length-1;
 assert.equal(v(ctx,'H4 High',last),113);assert.equal(v(ctx,'H4 Low',last),109);
 assert.equal(v(ctx,'Stage',last),entered?4:1);if(entered)near(v(ctx,'LONG Stop',last),104.99);
 }
});
test('пробой меньше0.02 учитывается',async()=>{
 const ctx=await run([...h4(),c(16,109,110.001,106,110)]);assert.equal(v(ctx,'Direction',16),1);
});
test('график M5/H4 отклоняется; отсутствие минимального тика диагностируется',async()=>{
 for(const tf of ['5','240'])await assert.rejects(run(pattern(),tf),/15 минут/);
 await assert.rejects(run(pattern(),'15',0),/минимальный тик/);
});
