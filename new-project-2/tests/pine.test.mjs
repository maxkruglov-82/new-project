import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

// Часы живых фикстур фиксированы; исторические массивы согласуют часы с хвостом.
mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-20T12:00:00Z') });

// Исполняется сам .pine, а не отдельная копия формул/алгоритма.
const module = await import(process.env.PINETS_MODULE || 'pinets');
const PineTS = module.PineTS || module.default;
const Indicator = module.Indicator || (await import(new URL('./Indicator/Indicator.class.ts', process.env.PINETS_MODULE))).Indicator;
const source = readFileSync(new URL('../sol_short_setup.pine', import.meta.url), 'utf8');

test('файл для загрузки совпадает с исполняемым исходником', () => {
  assert.equal(readFileSync(new URL('../sol_short_setup.txt', import.meta.url), 'utf8'), source);
});
// Прежние сценарии проверяются при нулевом отступе, чтобы отличать
// изменение буфера от регрессии структуры. Новые тесты ниже используют
// настоящий default 0.03 и отдельно проверяют прежние входы и новые исходы.
const zeroOffset = () => new Indicator(source, { 'Отступ стопа за Фибо (USDT)': 0, 'Отступ тейка перед целью (USDT)': 0, 'Не торговать в субботу и воскресенье': false });
const start = Date.parse('2026-10-20T14:00:00+07:00');
const step = 300_000;

function candle(index, open, high, low, close, day = 0) {
  return { openTime: start + day * 86_400_000 + index * step,
    closeTime: start + day * 86_400_000 + (index + 1) * step - 1,
    open, high, low, close, volume: 100 };
}
function hour(high = 106, low = 101) {
  return Array.from({ length: 12 }, (_, i) => candle(i, 104, high, low, 103));
}
function structure() {
  return [
    candle(12, 102, 103, 100.5, 101.5),
    candle(13, 101, 102, 100, 101),
    candle(14, 101, 102.5, 100.6, 102),
    candle(15, 102, 104, 101, 103),
    candle(16, 103, 103.5, 101.5, 102),
  ];
}
function complete() {
  return [...hour(), ...structure(),
    candle(17, 102, 103, 99, 100),
    candle(18, 100, 101.8, 99.4, 101),
    candle(19, 101, 102.2, 100, 102),
    candle(20, 102, 102.3, 98, 99),
    candle(21, 101, 103, 98, 102)];
}
// Отражаем настоящие OHLC вокруг 103.5: high и low меняются местами.
// Тестируется тот же .pine, без отдельного алгоритма расчёта LONG.
function mirror(data) {
  return data.map(b => ({ ...b, open: 207 - b.open, high: 207 - b.low,
    low: 207 - b.high, close: 207 - b.close }));
}
function historyData(days) {
  return Array.from({ length: days }, (_, i) => {
    const data = i % 2 ? mirror(complete()) : complete();
    const delta = (i - days + 1) * 86_400_000;
    return data.map(b => ({ ...b, openTime: b.openTime + delta, closeTime: b.closeTime + delta }));
  }).flat();
}
// Для исторических массивов часы согласованы с отдельным хвостом.
// Живые тесты ниже управляют часами независимо, включая переход в00:00.
async function historicalClock(data, callback) {
  const restore=Date.now();mock.timers.setTime(data.at(-1).openTime+1000);
  try{return await callback();}finally{mock.timers.setTime(restore);}
}
async function run(data, timeframe = '5', inputs = {}) {
  // PineTS помечает последний бар isrealtime даже в завершённом массиве.
  // Отдельный хвост оставляет все проверяемые свечи историческими.
  const last = data.at(-1);
  const guard = { ...last, openTime: last.openTime + step, closeTime: last.closeTime + step };
  const script = new Indicator(source, { 'Отступ стопа за Фибо (USDT)': 0, 'Отступ тейка перед целью (USDT)': 0, 'Не торговать в субботу и воскресенье': false, ...inputs });
  return historicalClock([...data,guard],()=>new PineTS([...data, guard], 'SOLUSDT', timeframe).run(script));
}
function values(ctx, name) { return ctx.plots[name].data.slice(0, -1).map(p => p.value); }
function signalCount(ctx, side = 'SHORT') { return values(ctx, side).filter(Boolean).length; }
function lines(ctx) { return ctx.plots.__lines__?.data[0]?.value || []; }
function positionZones(ctx) {
  return (ctx.plots.__boxes__?.data[0]?.value || []).filter(b =>
    typeof b.bgcolor === 'string' && /^#[0-9a-f]{8}$/i.test(b.bgcolor));
}
function labels(ctx) { return ctx.plots.__labels__?.data[0]?.value || []; }
function priceLabels(ctx) { return labels(ctx).filter(l => !['SHORT', 'LONG'].includes(l.text)); }

test('уровни — восемь горизонтальных отрезков, после сигнала правый край не движется', async () => {
  const ctx = await run(complete());
  const segments = lines(ctx);
  assert.equal(segments.length, 8);
  for (const line of segments) {
    assert.equal(line.y1, line.y2);
    assert.equal(line.x1, start + 13 * step);
    assert.equal(line.x2, line.width === 2 ? start + (17 + 24) * step : complete()[19].closeTime);
  }
  assert.deepEqual(segments.filter(l => l.width === 2).map(l => l.y1), [102, 105, 99]);
});

test('новый минимум переносит весь отрезок цели и входа без наклонного следа', async () => {
  const data = complete().slice(0, 19);
  data[18] = candle(18, 100, 102, 98.5, 101);
  const ctx = await run(data);
  const plan = lines(ctx).filter(l => l.width === 2);
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map(l => [l.y1, l.y2]), [[101.75, 101.75], [105, 105], [98.5, 98.5]]);
});

test('смена опорного часа сохраняет прежние отрезки и создаёт отдельные для нового дня', async () => {
  const next = complete().map(b => ({ ...b, openTime: b.openTime + 86_400_000, closeTime: b.closeTime + 86_400_000 }));
  const reset = await run([...complete(), ...next.slice(0, 12)]);
  const original = await run(complete());
  const geometry = ctx => lines(ctx).map(l => [l.x1, l.y1, l.x2, l.y2]);
  assert.deepEqual(geometry(reset), geometry(original));
  const ctx = await run([...complete(), ...next]);
  assert.equal(lines(ctx).length, 16);
  assert.deepEqual(geometry(ctx).slice(0, 8), geometry(original));
  for (const line of lines(ctx).slice(8)) {
    assert.equal(line.x1, start + 86_400_000 + 13 * step);
    assert.equal(line.y1, line.y2);
  }
});

test('числовые серии для уведомления полностью прозрачны и скрыты', async () => {
  const ctx = await run(complete());
  for (const name of ['SHORT Entry', 'SHORT Stop', 'SHORT Target']) {
    assert.match(ctx.plots[name].options.color, /00$/i);
    assert.equal(ctx.plots[name].options.display, 'none');
  }
});

test('законченный H1 появляется только после 12 закрытых M5', async () => {
  const ctx = await run(hour());
  assert.deepEqual(values(ctx, 'Stage'), [...Array(11).fill(0), 1]);
  assert.ok(values(ctx, 'H1 High').slice(0, 11).every(Number.isNaN));
  assert.equal(values(ctx, 'H1 High').at(-1), 106);
  assert.equal(values(ctx, 'H1 Low').at(-1), 101);
});

for (const [label, close, color] of [['красный', 103, '#F23645'], ['зелёный', 105, '#4CAF50'], ['доджи', 104, '#787B86']]) {
  test(`контур H1 ${label}, с тенями, от 13:00 до 22:00 Красноярска`, async () => {
    const data = hour();
    data[11] = { ...data[11], close };
    const ctx = await run(data);
    const box = ctx.plots.__boxes__.data[0].value[0];
    assert.equal(box.left, Date.parse('2026-10-20T13:00:00+07:00'));
    assert.equal(box.right, Date.parse('2026-10-20T22:00:00+07:00'));
    assert.equal(box.top, 106);
    assert.equal(box.bottom, 101);
    assert.equal(box.border_color, color);
  });
}

test('переходы 1–2–3, стоп 105, цель 99, вход 102, один сигнал', async () => {
  const ctx = await run(complete());
  assert.deepEqual(values(ctx, 'Stage').slice(12), [1, 2, 3, 3, 4, 5, 5, 6, 6, 6]);
  assert.equal(values(ctx, 'SHORT Entry')[19], 102);
  assert.equal(values(ctx, 'SHORT Stop')[19], 105);
  assert.equal(values(ctx, 'SHORT Target')[19], 99);
  assert.equal(signalCount(ctx), 1);
});

test('до сигнала новый минимум обновляет цель и вход, после — уровни заморожены', async () => {
  const data = complete();
  data[18] = candle(18, 100, 102, 98.5, 101);
  data[19] = candle(19, 101, 102, 99, 101.8);
  const ctx = await run(data);
  assert.equal(values(ctx, 'SHORT Target')[18], 98.5);
  assert.equal(values(ctx, 'SHORT Entry')[18], 101.75);
  assert.equal(values(ctx, 'Stage')[18], 5);
  assert.equal(values(ctx, 'Stage')[19], 6);
  assert.equal(values(ctx, 'SHORT Target').at(-1), 98.5);
  assert.equal(values(ctx, 'SHORT Entry').at(-1), 101.75);
});

test('касание без закрытия выше входа даёт сигнал', async () => {
  const data = complete().slice(0, 20);
  data[19] = candle(19, 101, 102, 100, 101.2);
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage')[19], 6);
});

test('третий фрактал не обязателен: равный следующий low не подтверждает pivot, но вход разрешён', async () => {
  const data = [...hour(), ...structure(), candle(17, 102, 103, 99, 100),
    candle(18, 100, 102.1, 99, 101)];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage').at(-1), 6);
  assert.equal(signalCount(ctx), 1);
});

test('новый верхний фрактал до пробоя повышает H2 и стоп', async () => {
  const data = [...hour(), ...structure(),
    candle(17, 102, 104.5, 101.4, 103),
    candle(18, 103, 103.8, 101.5, 102),
    candle(19, 102, 103, 99, 100),
    candle(20, 100, 101, 99.1, 100.5)];
  const ctx = await run(data);
  assert.equal(values(ctx, 'SHORT Stop')[19], 105.625);
  assert.equal(values(ctx, 'SHORT Entry')[19], 102.3125);
});

test('после пробоя верхняя точка и стоп больше не повышаются', async () => {
  const data = [...hour(), ...structure(),
    candle(17, 102, 103, 99, 100),
    candle(18, 103, 103.8, 98, 102),
    candle(19, 103, 104, 97, 102)];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage').at(-1), 5);
  assert.equal(values(ctx, 'SHORT Stop').at(-1), 105);
});

test('новый P3 и пробой P2 на одной M5 отменяют неоднозначный сценарий', async () => {
  const data = complete();
  data[18] = candle(18, 100, 106.1, 98.5, 101);
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage')[18], 7);
  assert.equal(signalCount(ctx), 0);
});

test('стоп вне часового максимума отбраковывает сетап', async () => {
  const ctx = await run([...hour(104.5), ...complete().slice(12)]);
  assert.equal(values(ctx, 'Stage')[17], 7);
  assert.equal(signalCount(ctx), 0);
});

test('касание low H1 без обновления не является первым выходом', async () => {
  const ctx = await run([...hour(), candle(12, 102, 103, 101, 102)]);
  assert.equal(values(ctx, 'Stage').at(-1), 1);
});

test('касание первого лоя без обновления не является точкой 3', async () => {
  const ctx = await run([...hour(), ...structure(), candle(17, 102, 103, 100, 101)]);
  assert.equal(values(ctx, 'Stage').at(-1), 4);
  assert.ok(Number.isNaN(values(ctx, 'SHORT Entry').at(-1)));
});

test('свеча с третьим low и high выше входа не даёт вымышленный исторический ретест', async () => {
  const ctx = await run([...hour(), ...structure(), candle(17, 102, 103, 99, 100)]);
  assert.equal(values(ctx, 'Stage').at(-1), 5);
  assert.equal(signalCount(ctx), 0);
});

test('неполный час не создаёт частичный диапазон', async () => {
  const data = hour();
  data.splice(4, 1);
  const ctx = await run(data);
  assert.ok(values(ctx, 'Stage').every(x => x === 0));
});

test('после 22:00 сетап жив, в 15:00 следующего дня заменяется', async () => {
  const data = [...complete().slice(0, 18), candle(96, 100, 101.5, 99.1, 100.5),
    ...Array.from({ length: 12 }, (_, i) => candle(i, 100.5, 101.5, 100, 101, 1))];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage')[18], 5);
  assert.equal(values(ctx, 'Stage').at(-1), 1);
  assert.equal(values(ctx, 'H1 High').at(-1), 101.5);
});

test('без данных новой H1 старый план истекает на первой свече после следующего 15:00', async () => {
  const data = [...complete().slice(0, 18), candle(12, 100, 101.5, 99.1, 100.5, 1)];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage').at(-1), 0);
});

test('утренний ретест старого плана запрещён, новый H1 публикуется', async () => {
  const data = [...complete().slice(0, 18),
    ...Array.from({ length: 12 }, (_, i) => candle(i, 100.5, i === 11 ? 102.1 : 101.5, 100, 101, 1))];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage').at(-1), 1);
  assert.equal(values(ctx, 'H1 High').at(-1), 102.1);
  assert.ok(Number.isNaN(values(ctx, 'SHORT Entry').at(-1)));
  assert.ok(Number.isNaN(values(ctx, 'SHORT Stop').at(-1)));
  assert.ok(Number.isNaN(values(ctx, 'SHORT Target').at(-1)));
  assert.equal(signalCount(ctx), 0);
});

test('неправильный таймфрейм вызывает понятную ошибку', async () => {
  await assert.rejects(run(hour(), '60'), /5 минут/);
});

test('LONG: верхний свинг 107, нижний 103, цель 108, стоп 102 и вход 105', async () => {
  const ctx = await run(mirror(complete()));
  assert.deepEqual(values(ctx, 'Stage').slice(12), [1, 2, 3, 3, 4, 5, 5, 6, 6, 6]);
  assert.equal(values(ctx, 'Direction')[12], 0);
  assert.equal(values(ctx, 'LONG Entry')[19], 105);
  assert.equal(values(ctx, 'LONG Stop')[19], 102);
  assert.equal(values(ctx, 'LONG Target')[19], 108);
  assert.equal(signalCount(ctx, 'LONG'), 1);
  assert.equal(signalCount(ctx), 0);
  assert.ok(values(ctx, 'SHORT Entry').every(Number.isNaN));
  assert.deepEqual(lines(ctx).filter(l => l.width === 2).map(l => [l.y1, l.y2]),
    [[105, 105], [102, 102], [108, 108]]);
  const m5 = ctx.plots.__boxes__.data[0].value.find(b => b.border_style === 'style_dotted');
  assert.equal(m5.top, 107);
  assert.equal(m5.bottom, 103);
});

const longCases = [
  ['цель и вход растут до ретеста, затем фиксируются', () => {
    const data = complete();
    data[18] = candle(18, 100, 102, 98.5, 101);
    data[19] = candle(19, 101, 102, 99, 101.8);
    return data;
  }, 6],
  ['касание без закрытия ниже входа', () => {
    const data = complete().slice(0, 20);
    data[19] = candle(19, 101, 102, 100, 101.2);
    return data;
  }, 6],
  ['новый верхний фрактал в точке 3 не обязателен', () =>
    [...hour(), ...structure(), candle(17, 102, 103, 99, 100), candle(18, 100, 102.1, 99, 101)], 6],
  ['нижний свинг можно понижать до пробоя точки 1', () =>
    [...hour(), ...structure(), candle(17, 102, 104.5, 101.4, 103),
      candle(18, 103, 103.8, 101.5, 102), candle(19, 102, 103, 99, 100),
      candle(20, 100, 101, 99.1, 100.5)], 5],
  ['второй свинг заморожен после пробоя', () =>
    [...hour(), ...structure(), candle(17, 102, 103, 99, 100),
      candle(18, 103, 103.8, 98, 102), candle(19, 103, 104, 97, 102)], 5],
  ['свеча с обоими пробоями H1 не позволяет угадать новую сторону', () => {
    const data = complete();
    data[18] = candle(18, 100, 106.1, 98.5, 101);
    return data;
  }, 7],
  ['равенство high H1 не является первым выходом', () =>
    [...hour(), candle(12, 102, 103, 101, 102)], 1],
  ['равенство первому high не является точкой 3', () =>
    [...hour(), ...structure(), candle(17, 102, 103, 100, 101)], 4],
  ['новый high и касание на одной исторической свече не создают ложный ретест', () =>
    [...hour(), ...structure(), candle(17, 102, 103, 99, 100)], 5],
  ['после 22:00 план жив, новая H1 заменяет его и сбрасывает направление', () =>
    [...complete().slice(0, 18), candle(96, 100, 101.5, 99.1, 100.5),
      ...Array.from({ length: 12 }, (_, i) => candle(i, 100.5, 101.5, 100, 101, 1))], 1],
];
for (const [name, makeData, expectedStage] of longCases) {
  test(`LONG зеркален SHORT: ${name}`, async () => {
    const data = makeData();
    const short = await run(data);
    const long = await run(mirror(data));
    assert.equal(values(long, 'Stage').at(-1), expectedStage);
    assert.deepEqual(values(long, 'Stage'), values(short, 'Stage'));
    assert.deepEqual(values(long, 'Direction'), values(short, 'Direction').map(d => d === 0 ? 0 : -d));
    for (const field of ['Entry', 'Stop', 'Target']) {
      const shorts = values(short, `SHORT ${field}`);
      const longs = values(long, `LONG ${field}`);
      for (let i = 0; i < shorts.length; i++) {
        if (Number.isNaN(shorts[i])) assert.ok(Number.isNaN(longs[i]));
        else assert.ok(Math.abs(longs[i] - (207 - shorts[i])) < 1e-9, `${field}, bar ${i}`);
      }
    }
    assert.equal(signalCount(long, 'LONG'), signalCount(short));
    assert.equal(signalCount(long), 0);
    for (const line of lines(long)) assert.equal(line.y1, line.y2);
  });
}

test('выход вверх и вниз на первой учитываемой M5 не позволяет угадать приоритет', async () => {
  const ctx=await run([...hour(),candle(12,103,105,102,103),candle(13,103,107,100,104),...complete().slice(14)]);
  assert.equal(values(ctx,'Stage')[13],7);
  assert.equal(values(ctx,'Direction')[13],0);
  assert.equal(signalCount(ctx),0);
  assert.equal(signalCount(ctx,'LONG'),0);
});

test('LONG разрешён со стопом ниже low H1, пока сама цена не пробила low H1', async () => {
  const ctx = await run(mirror([...hour(104.5), ...complete().slice(12)]));
  assert.equal(values(ctx, 'H1 Low')[19], 102.5);
  assert.equal(values(ctx, 'LONG Stop')[19], 102);
  assert.equal(values(ctx, 'LONG Entry')[19], 105);
  assert.equal(values(ctx, 'Stage')[19], 6);
  assert.equal(signalCount(ctx, 'LONG'), 1);
});

function annotatedLongExample() {
  return [
    ...Array.from({ length: 12 }, (_, i) => candle(i, 106, 106.95, 105.9, 106.8)),
    candle(12, 106.8, 107.1, 106.6, 107),
    candle(13, 107, 107.25, 106.5, 107.1),
    candle(14, 107.1, 107.1, 106.55, 106.8),
    candle(15, 106.8, 106.95, 106.45, 106.6),
    candle(16, 106.6, 106.85, 106.55, 106.7),
    candle(17, 106.7, 106.9, 105.95, 106.3),
    candle(18, 106.3, 107, 106.1, 106.7),
    candle(19, 106.7, 107.71, 106.6, 107.4),
    candle(20, 107.4, 107.6, 106.9, 107.1),
    candle(21, 107.1, 107.5, 106.65, 106.9),
  ];
}

test('пример пользователя: две точки 2, Фибо после точки 3, вход около 106.67', async () => {
  // Это синтетические OHLC с приближенными уровнями скриншота, не история биржи.
  const ctx = await run(annotatedLongExample());
  assert.equal(values(ctx, 'Stage')[16], 4);
  assert.equal(values(ctx, 'Stage')[18], 4);
  assert.equal(values(ctx, 'Stage')[19], 5);
  assert.equal(values(ctx, 'Stage')[21], 6);
  assert.equal(values(ctx, 'H1 Low')[21], 105.9);
  assert.ok(Math.abs(values(ctx, 'LONG Stop')[21] - 105.625) < 1e-9);
  assert.ok(Math.abs(values(ctx, 'LONG Entry')[21] - 106.6675) < 1e-9);
  assert.equal(values(ctx, 'LONG Target')[21], 107.71);
  assert.equal(signalCount(ctx, 'LONG'), 1);
  const box = ctx.plots.__boxes__.data[0].value.find(b => b.border_style === 'style_dotted');
  assert.equal(box.top, 107.25);
  assert.equal(box.bottom, 105.95);
  // При нашей ориентации нижняя красная линия — 1.25, не верхнее −0.25.
  const redFibo = lines(ctx).filter(l => l.width === 1 && l.color === '#F23645').map(l => l.y1);
  assert.ok(redFibo.some(y => Math.abs(y - 105.625) < 1e-9));
  assert.ok(redFibo.some(y => Math.abs(y - 107.575) < 1e-9));
});

test('обновление точки 2 отменяет LONG при выходе на 0.02 за нижнюю H1', async () => {
  const data = annotatedLongExample();
  data[17] = { ...data[17], low: 105.88 };
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage')[17], 2);
  assert.equal(values(ctx, 'Direction')[17], -1);
  assert.equal(signalCount(ctx, 'LONG'), 0);
  assert.equal(signalCount(ctx), 0);
});

test('равенство второй точки low H1 не является его обновлением, стоп может лежать ниже', async () => {
  const data = annotatedLongExample();
  data[17] = { ...data[17], low: 105.9 };
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage').at(-1), 5);
  assert.ok(values(ctx, 'LONG Stop').at(-1) < 105.9);
  assert.equal(signalCount(ctx, 'LONG'), 0);
});

test('после первых двух точек виден только диапазон M5; Фибо и план ждут точки 3', async () => {
  for (const data of [complete().slice(0, 17), mirror(complete().slice(0, 17))]) {
    const ctx = await run(data);
    assert.equal(values(ctx, 'Stage')[16], 4);
    assert.equal(lines(ctx).length, 0);
    assert.equal(ctx.plots.__boxes__.data[0].value.length, 2);
  }
});

test('направление выхода не зависит от цвета опорной H1', async () => {
  const data = mirror(complete());
  data[0] = { ...data[0], open: 105 };
  const ctx = await run(data);
  assert.equal(values(ctx, 'Direction')[12], 0);
  assert.equal(signalCount(ctx, 'LONG'), 1);
});

for (const side of ['SHORT', 'LONG']) {
  const transform = data => side === 'SHORT' ? data : mirror(data);
  const reflect = price => side === 'SHORT' ? price : 207 - price;
  test(`${side}: зоны риска и прибыли имеют общую границу входа и равную высоту`, async () => {
    const ctx = await run(transform(complete()));
    const zones = positionZones(ctx);
    assert.equal(zones.length, 2);
    const reward = zones.find(z => z.text === 'R:R 1:1');
    const risk = zones.find(z => z !== reward);
    const entry = reflect(102), stop = reflect(105), target = reflect(99);
    assert.equal(reward.top, Math.max(entry, target));
    assert.equal(reward.bottom, Math.min(entry, target));
    assert.equal(risk.top, Math.max(entry, stop));
    assert.equal(risk.bottom, Math.min(entry, stop));
    assert.equal(reward.top - reward.bottom, risk.top - risk.bottom);
    assert.equal(reward.left, start + 17 * step);
    assert.equal(reward.right, start + 41 * step);
    assert.equal(risk.left, reward.left);
    assert.equal(risk.right, reward.right);
    assert.deepEqual(priceLabels(ctx).map(l => [l.text, l.y]),
      [[`Вход: ${entry}`, entry], [`Стоп: ${stop}`, stop], [`Цель: ${target} +`, target]]);
    assert.ok(priceLabels(ctx).every(l => l.x === reward.right));
  });

  test(`${side}: зоны и цены замораживаются, достигнутая цель получает плюс`, async () => {
    const data = complete();
    data[18] = candle(18, 100, 102, 98.5, 101);
    data[19] = candle(19, 101, 102, 99, 101.8);
    const waiting = await run(transform(data.slice(0, 19)));
    const after = await run(transform([...data, candle(60, 100, 104, 95, 97)]));
    const entry = reflect(101.75), target = reflect(98.5);
    const reward = positionZones(after).find(z => z.text === 'R:R 1:1');
    assert.equal(reward.top, Math.max(entry, target));
    assert.equal(reward.bottom, Math.min(entry, target));
    assert.deepEqual(positionZones(after).map(z => [z.left, z.top, z.right, z.bottom]),
      positionZones(waiting).map(z => [z.left, z.top, z.right, z.bottom]));
    assert.deepEqual(priceLabels(after).map(l => [l.y, l.text.replace(/ \+$/, '')]), priceLabels(waiting).map(l => [l.y, l.text]));
    assert.equal(priceLabels(waiting).filter(l => l.text.endsWith(' +')).length, 0);
    assert.ok(priceLabels(after).some(l => l.text.startsWith('Цель:') && l.text.endsWith(' +')));
    assert.ok(priceLabels(after).filter(l => l.text.startsWith('Стоп:')).every(l => !l.text.endsWith(' +')));
  });

  test(`${side}: отмена сохраняет разметку с пометкой Без входа, сигнала нет`, async () => {
    const data = complete();
    data[18] = candle(18, 100, 106.1, 98.5, 101);
    const ctx = await run(transform(data));
    assert.equal(values(ctx, 'Stage')[18], 7);
    assert.equal(positionZones(ctx).length, 2);
    assert.equal(priceLabels(ctx).length, 3);
    assert.ok(priceLabels(ctx).some(l => l.text.includes('Без входа')));
    assert.equal(signalCount(ctx, side), 0);
  });
}

test('скрытие зон позиции не меняет расчёт, сигнал и обычные линии', async () => {
  const ctx = await run(complete(), '5', { 'Показывать зоны позиции': false });
  assert.equal(positionZones(ctx).length, 0);
  assert.equal(priceLabels(ctx).length, 0);
  assert.equal(lines(ctx).length, 8);
  assert.equal(signalCount(ctx), 1);
  assert.equal(values(ctx, 'SHORT Entry')[19], 102);
});

test('настройка ширины меняет только рисунок, а не цены и момент сигнала', async () => {
  const ctx = await run(mirror(complete()), '5', { 'Ширина позиции (свечей M5)': 36 });
  assert.equal(positionZones(ctx)[0].right, start + (17 + 36) * step);
  assert.equal(values(ctx, 'LONG Entry')[19], 105);
  assert.equal(values(ctx, 'LONG Target')[19], 108);
  assert.equal(values(ctx, 'Stage')[19], 6);
  assert.equal(signalCount(ctx, 'LONG'), 1);
});

test('ожидание дольше ширины рисунка продлевает зоны, не отменяя план после 22:00', async () => {
  const late = candle(96, 100, 101.5, 99.1, 100.5);
  const ctx = await run([...complete().slice(0, 18), late]);
  assert.equal(values(ctx, 'Stage').at(-1), 5);
  assert.equal(positionZones(ctx).length, 2);
  // Геометрия включает ещё и дополнительный текущий бар тестового провайдера.
  assert.ok(positionZones(ctx).every(z => z.right === late.closeTime + step));
  assert.equal(signalCount(ctx), 0);
});

test('новая H1 сохраняет старые зоны и подписи, следующий план получает собственные', async () => {
  const next = complete().map(b => ({ ...b, openTime: b.openTime + 86_400_000, closeTime: b.closeTime + 86_400_000 }));
  const reset = await run([...complete(), ...next.slice(0, 12)]);
  assert.equal(positionZones(reset).length, 2);
  assert.equal(priceLabels(reset).length, 3);
  assert.equal(priceLabels(reset).filter(l => l.text.startsWith('Цель:') && l.text.endsWith(' +')).length, 1);
  const ctx = await run([...complete(), ...mirror(next)]);
  assert.equal(positionZones(ctx).length, 4);
  assert.equal(priceLabels(ctx).length, 6);
  assert.equal(positionZones(ctx).filter(z => z.left < start + 86_400_000).length, 2);
  assert.equal(positionZones(ctx).filter(z => z.left >= start + 86_400_000).length, 2);
});

test('после конца дня план без входа удаляется с графика', async () => {
  const ctx = await run([...complete().slice(0, 18), candle(12, 100, 101.5, 99.1, 100.5, 1)]);
  assert.equal(values(ctx, 'Stage').at(-1), 0);
  assert.equal(positionZones(ctx).length, 0);
  assert.equal(priceLabels(ctx).length, 0);
  assert.equal(lines(ctx).length, 0);
  assert.equal(signalCount(ctx), 0);
});

test('разметка LONG по примеру пользователя делит зону на равные риск и прибыль', async () => {
  const ctx = await run(annotatedLongExample());
  const reward = positionZones(ctx).find(z => z.text === 'R:R 1:1');
  const risk = positionZones(ctx).find(z => z !== reward);
  assert.ok(Math.abs(reward.bottom - 106.6675) < 1e-9);
  assert.ok(Math.abs(risk.bottom - 105.625) < 1e-9);
  assert.equal(reward.top, 107.71);
  assert.ok(Math.abs(reward.top - reward.bottom - (risk.top - risk.bottom)) < 1e-9);
  assert.ok(priceLabels(ctx).some(l => l.text === 'Вход: 106.67'));
});

test('новый день может сменить LONG на SHORT, прежние уровни не смешиваются', async () => {
  const next = complete().map(b => ({ ...b, openTime: b.openTime + 86_400_000, closeTime: b.closeTime + 86_400_000 }));
  const ctx = await run([...mirror(complete()), ...next]);
  assert.equal(signalCount(ctx, 'LONG'), 1);
  assert.equal(signalCount(ctx), 1);
  assert.equal(values(ctx, 'Direction').at(-1), -1);
  assert.equal(values(ctx, 'SHORT Entry').at(-1), 102);
  assert.ok(Number.isNaN(values(ctx, 'LONG Entry').at(-1)));
  assert.equal(lines(ctx).length, 16);
  assert.deepEqual(lines(ctx).filter(l => l.width === 2 && l.x1 >= start + 86_400_000).map(l => l.y1), [102, 105, 99]);
});

test('LONG старого дня не входит утром перед новым H1', async () => {
  const data = [...complete().slice(0, 18),
    ...Array.from({ length: 12 }, (_, i) => candle(i, 100.5, i === 11 ? 102.1 : 101.5, 100, 101, 1))];
  const ctx = await run(mirror(data));
  assert.equal(values(ctx, 'Stage').at(-1), 1);
  assert.equal(values(ctx, 'Direction').at(-1), 0);
  assert.ok(Number.isNaN(values(ctx, 'LONG Entry').at(-1)));
  assert.ok(Number.isNaN(values(ctx, 'LONG Stop').at(-1)));
  assert.ok(Number.isNaN(values(ctx, 'LONG Target').at(-1)));
  assert.equal(signalCount(ctx, 'LONG'), 0);
  assert.equal(signalCount(ctx), 0);
});

test('65 дней данных: 60 полных дней разметки без обрезания Фибо лимитом объектов', async () => {
  const ctx = await run(historyData(65));
  assert.equal(lines(ctx).length, 480);
  assert.equal(new Set(lines(ctx).map(l => l.x1)).size, 60);
  assert.equal(ctx.plots.__boxes__.data[0].value.length, 240);
  assert.equal(positionZones(ctx).length, 120);
  assert.equal(priceLabels(ctx).length, 180);
  assert.equal(signalCount(ctx), 30);
  assert.equal(signalCount(ctx, 'LONG'), 30);
  assert.ok(lines(ctx).every(l => l.y1 === l.y2 && l.x2 - l.x1 < 86_400_000));
});

test('конечная дата позволяет восстановить старое окно, не меняя расчёт текущего дня', async () => {
  const end = start - 40 * 86_400_000 + 9 * 3_600_000;
  const ctx = await run(historyData(65), '5', {
    'История: опорных дней': 3,
    'История до (0 — правый край экрана)': end,
  });
  assert.equal(lines(ctx).length, 24);
  const dates = [...new Set(lines(ctx).map(l => l.x1))].sort((a, b) => a - b);
  assert.deepEqual(dates, [-42, -41, -40].map(day => start + day * 86_400_000 + 13 * step));
  assert.equal(signalCount(ctx) + signalCount(ctx, 'LONG'), 3);
  assert.equal(values(ctx, 'Stage').at(-1), 6);
  assert.equal(values(ctx, 'SHORT Entry').at(-1), 102);
});

test('прокрутка окна перерисовывает старые дни без повторных оповещений', async () => {
  const data = historyData(20);
  const last = data.at(-1);
  const guard = { ...last, openTime: last.openTime + step, closeTime: last.closeTime + step };
  const engine = new PineTS([...data, guard], 'SOLUSDT', '5');
  const script = new Indicator(source, { 'История: опорных дней': 2, 'Не торговать в субботу и воскресенье': false });
  const recent = await engine.update(script);
  engine.setVisibleRange(start - 11 * 86_400_000, start - 10 * 86_400_000 + 9 * 3_600_000);
  const old = await engine.update();
  assert.equal(lines(old).length, 16);
  assert.deepEqual([...new Set(lines(old).map(l => l.x1))].sort((a, b) => a - b),
    [-11, -10].map(day => start + day * 86_400_000 + 13 * step));
  assert.notDeepEqual(lines(recent).map(l => l.x1), lines(old).map(l => l.x1));
  assert.deepEqual(values(old, 'Stage'), values(recent, 'Stage'));
  assert.equal(old.alerts.length, 0);
  assert.equal(recent.alerts.length, 0);
});

test('старый план без входа удаляется к новой H1 и не получает метку сделки', async () => {
  const data = [...complete().slice(0, 18),
    ...Array.from({ length: 12 }, (_, i) => candle(i, 100.5, 101.5, 100, 101, 1))];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage').at(-1), 1);
  assert.equal(positionZones(ctx).length, 0);
  assert.equal(lines(ctx).length, 0);
  assert.equal(priceLabels(ctx).length, 0);
  assert.equal(signalCount(ctx), 0);
  assert.equal(signalCount(ctx, 'LONG'), 0);
});

test('каждый полный час без сетапа оставляет H1 диапазон, без вымышленных Фибо и позиций', async () => {
  const data = Array.from({ length: 3 }, (_, day) => [...hour(), candle(12, 103, 105, 102, 104)]
    .map(b => ({ ...b, openTime: b.openTime + (day - 2) * 86_400_000, closeTime: b.closeTime + (day - 2) * 86_400_000 }))).flat();
  const ctx = await run(data);
  assert.equal(ctx.plots.__boxes__.data[0].value.length, 3);
  assert.equal(lines(ctx).length, 0);
  assert.equal(positionZones(ctx).length, 0);
  assert.equal(signalCount(ctx) + signalCount(ctx, 'LONG'), 0);
});

test('публикация H1 на последней закрытой 14:55 свече включается в окно истории', async () => {
  const ctx = await new PineTS(hour(), 'SOLUSDT', '5').run(new Indicator(source, { 'История: опорных дней': 1 }));
  assert.equal(ctx.plots.__boxes__.data[0].value.length, 1);
});

for (const side of ['SHORT', 'LONG']) {
test(`${side}: обновления открытой M5, новый экстремум и ретест без закрытия, один сигнал`, async () => {
  const reflect = price => side === 'SHORT' ? price : 207 - price;
  const raw = [...hour(), ...structure(), candle(17, 102, 103, 99, 100)];
  const data = side === 'SHORT' ? raw : mirror(raw);
  let tail = { ...data.at(-1) };
  const provider = {
    getMarketData: async (_ticker, _tf, _limit, since) =>
      since !== undefined && since >= tail.openTime ? [{ ...tail }] : data.map(b => ({ ...b })),
    getSymbolInfo: async () => null,
  };
  const engine = new PineTS(provider, 'SOLUSDT', '5');
  const ctx = await engine.run(zeroOffset());
  const last = name => ctx.plots[name].data.at(-1).value;
  assert.equal(last('Stage'), 5);
  for (const [rawQuote, expectedStage] of [[98, 5], [100, 5], [101.5, 6], [97, 6], [103, 6]]) {
    const quote = reflect(rawQuote);
    tail = { ...tail, close: quote, high: Math.max(tail.high, quote), low: Math.min(tail.low, quote),
      // В течение теста свеча открыта, даже если остальные данные исторические.
      closeTime: Date.now() + step };
    assert.equal(await engine.updateTail(ctx), true);
    assert.equal(last('Stage'), expectedStage);
    assert.equal(last(`${side} Entry`), reflect(101.5));
    assert.equal(last(`${side} Stop`), reflect(105));
    assert.equal(last(`${side} Target`), reflect(98));
    const reward = positionZones(ctx).find(z => z.text === 'R:R 1:1');
    assert.equal(positionZones(ctx).length, 2);
    assert.equal(priceLabels(ctx).length, 3);
    assert.equal(reward.top, Math.max(reflect(101.5), reflect(98)));
    assert.equal(reward.bottom, Math.min(reflect(101.5), reflect(98)));
  }
  assert.equal(ctx.alerts.length, 1);
  assert.equal(ctx.alerts[0].title, side);
});
}

function reversalToShort() {
  return [...hour(),
    candle(12, 105, 107, 104.8, 106.5),
    candle(13, 106.5, 108, 105, 107),
    candle(14, 107, 107.5, 104, 105),
    // Отменяющая LONG нога сразу становится ногой нового SHORT P1.
    ...complete().slice(12).map((b, i) => ({ ...b,
      openTime: start + (15 + i) * step, closeTime: start + (16 + i) * step - 1 }))];
}
function stoppedThenRetry() {
  return [...complete().slice(0, 20), candle(20, 102, 105.2, 101.5, 104),
    candle(21,104,104.2,102,103), candle(22,103,103.5,101.4,102),
    candle(23,102,105.3,102,105)];
}
for (const side of ['SHORT', 'LONG']) {
  const transform = data => side === 'SHORT' ? data : mirror(data);
  const opposite = side === 'SHORT' ? 'LONG' : 'SHORT';

  test(`${side}: противоположный пробой до входа запускает новый P1 под той же H1`, async () => {
    const data = transform(reversalToShort());
    if (side === 'LONG') data.push(candle(25, 105, 106, 103, 103));
    const ctx = await run(data);
    assert.equal(values(ctx, 'Stage')[15], 2);
    assert.equal(values(ctx, 'Direction')[15], side === 'SHORT' ? -1 : 1);
    assert.equal(values(ctx, 'Stage')[17], 3);
    assert.equal(values(ctx, 'Stage')[19], 4);
    assert.equal(values(ctx, 'Stage')[20], 5);
    const entryIndex = side === 'SHORT' ? 22 : 25;
    assert.equal(values(ctx, 'Stage')[entryIndex], 6);
    assert.equal(signalCount(ctx, side), 1);
    assert.equal(signalCount(ctx, opposite), 0);
    assert.equal(values(ctx, `${side} Entry`)[entryIndex], side === 'SHORT' ? 102 : 105);
    assert.equal(ctx.plots.__boxes__.data[0].value.filter(b => b.left === Date.parse('2026-10-20T13:00:00+07:00')).length, 1);
  });

  test(`${side}: после TP противоположный выход не создаёт второй рисунок или сигнал`, async () => {
    const additional = mirror(complete().slice(12)).map((b, i) => ({ ...b,
      openTime: start + (22 + i) * step, closeTime: start + (23 + i) * step - 1 }));
    const first = complete().slice(0, 21); // TP=99 достигнут на баре 20.
    const ctx = await run(transform([...first, ...additional]));
    assert.equal(values(ctx, 'Outcome')[20], 1);
    assert.equal(values(ctx, 'Outcome').at(-1), 1);
    assert.equal(signalCount(ctx, side), 1);
    assert.equal(signalCount(ctx, opposite), 0);
    assert.equal(lines(ctx).length, 8);
    assert.equal(positionZones(ctx).length, 2);
    assert.equal(labels(ctx).filter(l => ['SHORT', 'LONG'].includes(l.text)).length, 1);
  });

  test(`${side}: после обычного стопа обратный сетап использует прежнюю структуру`, async () => {
    const ctx = await run(transform(stoppedThenRetry()));
    assert.equal(values(ctx, 'Outcome')[20], -1);
    assert.equal(values(ctx, 'Stage')[21], 5);
    assert.equal(values(ctx, 'Outcome')[21], 0);
    assert.equal(signalCount(ctx, side), 1);
    assert.equal(signalCount(ctx, opposite), 1);
    assert.equal(lines(ctx).length, 16);
    assert.equal(positionZones(ctx).length, 4);
    assert.equal(priceLabels(ctx).length, 6);
    assert.deepEqual(lines(ctx).filter(l => l.width === 2).map(l => l.y1),
      side === 'SHORT' ? [102, 105, 99, 101.475, 97.75, 105.2] : [105, 102, 108, 105.525, 109.25, 101.8]);
    assert.equal(values(ctx, 'Outcome').at(-1), 1);
    // Плюс у прежнего стопа переживает сброс состояния и новую попытку.
    assert.equal(priceLabels(ctx).filter(l => l.text.startsWith('Стоп:') && l.text.endsWith(' +')).length, 1);
    assert.equal(priceLabels(ctx).filter(l => l.text.startsWith('Цель:') && l.text.endsWith(' +')).length, 1);
  });

  test(`${side}: активный вход ждёт своего TP/SL, пробой H1 не создаёт параллельный вход`, async () => {
    // Для SHORT стоп 105 ниже high H1=106, поэтому проверяем противоположный
    // выход вверх только через зеркальный LONG со стопом ниже low H1.
    const raw = [...mirror(complete().slice(0, 20)), candle(20, 105, 105.5, 102.4, 103)];
    raw.splice(0, 12, ...mirror(hour(104.5)));
    const ctx = await run(side === 'LONG' ? raw : mirror(raw));
    if (side === 'LONG') {
      assert.equal(values(ctx, 'H1 Low')[20], 102.5);
      assert.equal(values(ctx, 'Outcome')[20], 0);
      assert.equal(values(ctx, 'Stage')[20], 6);
      assert.equal(signalCount(ctx, 'LONG'), 1);
      assert.equal(signalCount(ctx), 0);
    } else {
      // Ранее согласованный фильтр SHORT исключает стоп выше high H1.
      assert.equal(signalCount(ctx), 0);
    }
  });

  test(`${side}: пробой P2 на предполагаемом баре входа не приписывает прежний вход`, async () => {
    const data = complete().slice(0, 20);
    data[19] = candle(19, 101, 105.5, 99.1, 102);
    const ctx = await run(transform(data));
    assert.equal(signalCount(ctx, side), 0);
    assert.equal(values(ctx, 'Outcome')[19], 0);
    assert.equal(values(ctx, 'Direction')[19], side === 'SHORT' ? 1 : -1);
    assert.equal(values(ctx, 'Stage')[19], 5);
  });

  test(`${side}: TP и SL на одной последующей M5 — неизвестный исход без выдуманной победы`, async () => {
    const data = [...complete().slice(0, 20), candle(20, 102, 106, 98, 103),
      ...stoppedThenRetry().slice(21)];
    const ctx = await run(transform(data));
    assert.equal(values(ctx, 'Outcome')[20], 2);
    assert.equal(values(ctx, 'Outcome').at(-1), 2);
    assert.ok(priceLabels(ctx).every(l => !l.text.endsWith(' +')));
    assert.equal(signalCount(ctx, side), 1);
    assert.equal(signalCount(ctx, opposite), 0);
    assert.equal(lines(ctx).length, 8);
  });
}

test('SHORT → LONG: третье переключение не меняет второй приоритет', async () => {
  const data = [...hour(), ...structure(),
    candle(17, 103, 107, 102, 106.5), candle(18, 106.5, 108, 104, 107),
    candle(19, 107, 107.5, 103, 104), candle(20, 104, 104.5, 100, 101),
    candle(21, 101, 102, 99, 100), candle(22, 100, 103, 100, 102),
    candle(23, 102, 104, 100.5, 103), candle(24, 103, 103.5, 101, 102),
    candle(25, 102, 103, 98, 99), candle(26, 99, 101, 98.5, 100),
    candle(27, 100, 102, 99, 101.8)];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Direction')[17], 1);
  assert.equal(values(ctx, 'Direction')[20], 1); // Low=100 равен «0»: LONG ещё допустим.
  assert.equal(values(ctx, 'Direction')[21], 1); // Пробой «0» сбрасывает структуру, сохраняя второй LONG.
  assert.equal(values(ctx, 'Stage')[21], 2);
  assert.equal(signalCount(ctx), 0);
  assert.equal(signalCount(ctx, 'LONG'), 0);
  assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0')[21]));
});

test('разворот по P2 архивирует старый ожидающий план целиком, не подменяя его цены', async () => {
  const data = [...complete().slice(0, 18), candle(18, 102, 106.5, 101.5, 106.2),
    ...mirror(complete().slice(13)).map((b, i) => ({ ...b,
      openTime: start + (19 + i) * step, closeTime: start + (20 + i) * step - 1 }))];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Direction')[18], 1);
  assert.equal(values(ctx, 'Stage')[18], 5);
  assert.equal(signalCount(ctx), 0);
  assert.equal(signalCount(ctx, 'LONG'), 0);
  assert.equal(lines(ctx).length, 16);
  assert.deepEqual(lines(ctx).slice(0, 8).filter(l => l.width === 2).map(l => l.y1), [102, 105, 99]);
  assert.ok(priceLabels(ctx).some(l => l.text.startsWith('Разворот по P2 · Без входа')));
});

test('успех предыдущей H1 не блокирует новый опорный час', async () => {
  const next = mirror(complete()).map(b => ({ ...b,
    openTime: b.openTime + 86_400_000, closeTime: b.closeTime + 86_400_000 }));
  const ctx = await run([...complete(), ...next]);
  assert.equal(signalCount(ctx), 1);
  assert.equal(signalCount(ctx, 'LONG'), 1);
  assert.equal(values(ctx, 'Outcome')[33], 0); // Новая H1 опубликована.
});

test('повторы после стопов не разрывают полные группы истории при лимите 500 объектов', async () => {
  const data = Array.from({ length: 40 }, (_, i) => {
    const raw = i % 2 ? mirror(stoppedThenRetry()) : stoppedThenRetry();
    return raw.map(b => ({ ...b, openTime: b.openTime + (i - 39) * 86_400_000,
      closeTime: b.closeTime + (i - 39) * 86_400_000 }));
  }).flat();
  const ctx = await run(data);
  const segments = lines(ctx);
  assert.equal(segments.length, 480);
  const groups = Map.groupBy(segments, l => l.x1);
  assert.equal(groups.size, 60);
  assert.ok([...groups.values()].every(g => g.length === 8 && g.filter(l => l.width === 2).length === 3));
  assert.equal(positionZones(ctx).length, 120);
  assert.equal(priceLabels(ctx).length, 180);
  assert.equal(labels(ctx).filter(l => ['SHORT', 'LONG'].includes(l.text)).length, 60);
  assert.ok(ctx.plots.__boxes__.data[0].value.length <= 240);
});

for (const side of ['SHORT', 'LONG']) {
  test(`${side}: переключение в открытой M5 не повторяется из-за старых теней`, async () => {
    const raw = [...hour(), ...structure(), candle(17, 102, 103, 99, 100), candle(18, 100, 101.8, 99.4, 101)];
    const data = side === 'SHORT' ? raw : mirror(raw);
    const reflect = p => side === 'SHORT' ? p : 207 - p;
    let tail = { ...data.at(-1) };
    const provider = {
      getMarketData: async (_ticker, _tf, _limit, since) =>
        since !== undefined && since >= tail.openTime ? [{ ...tail }] : data.map(b => ({ ...b })),
      getSymbolInfo: async () => null,
    };
    const engine = new PineTS(provider, 'SOLUSDT', '5');
    const ctx = await engine.run(zeroOffset());
    const last = name => ctx.plots[name].data.at(-1).value;
    for (const [quote, direction] of [[107, 1], [106.5, 1], [106, 1], [105.5, 1]]) {
      const p = reflect(quote);
      tail = { ...tail, close: p, high: Math.max(tail.high, p), low: Math.min(tail.low, p), closeTime: Date.now() + step };
      await engine.updateTail(ctx);
      assert.equal(last('Direction'), side === 'SHORT' ? direction : -direction);
      assert.equal(last('Stage'), 5);
      assert.equal(ctx.alerts.length, 0);
      assert.equal(lines(ctx).length, 16);
      assert.equal(positionZones(ctx).length, 4);
      assert.ok(priceLabels(ctx).some(l => l.text.startsWith('Разворот по P2 · Без входа')));
    }
  });

  test(`${side}: живой TP фиксируется раньше более позднего SL той же открытой M5`, async () => {
    const raw = [...hour(), ...structure(), candle(17, 102, 103, 99, 100)];
    const data = side === 'SHORT' ? raw : mirror(raw);
    const reflect = p => side === 'SHORT' ? p : 207 - p;
    let tail = { ...data.at(-1) };
    const provider = {
      getMarketData: async (_ticker, _tf, _limit, since) =>
        since !== undefined && since >= tail.openTime ? [{ ...tail }] : data.map(b => ({ ...b })),
      getSymbolInfo: async () => null,
    };
    const engine = new PineTS(provider, 'SOLUSDT', '5');
    const ctx = await engine.run(zeroOffset());
    for (const [quote, outcome] of [[98, 0], [101.5, 0], [97, 1], [107, 1], [100, 1]]) {
      const p = reflect(quote);
      tail = { ...tail, close: p, high: Math.max(tail.high, p), low: Math.min(tail.low, p), closeTime: Date.now() + step };
      await engine.updateTail(ctx);
      assert.equal(ctx.plots.Outcome.data.at(-1).value, outcome);
      assert.equal(priceLabels(ctx).filter(l => l.text.startsWith('Цель:') && l.text.endsWith(' +')).length, outcome === 1 ? 1 : 0);
      assert.ok(priceLabels(ctx).filter(l => l.text.startsWith('Стоп:')).every(l => !l.text.endsWith(' +')));
      assert.equal(lines(ctx).length, 8);
      assert.equal(positionZones(ctx).length, 2);
    }
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0].title, side);
    assert.equal(labels(ctx).filter(l => ['SHORT', 'LONG'].includes(l.text)).length, 1);
  });
}

for (const firstSide of ['SHORT', 'LONG']) {
  test(`${firstSide}: после стопа следующий сигнал может быть противоположным под той же H1`, async () => {
    const raw = stoppedThenRetry();
    const ctx = await run(firstSide === 'SHORT' ? raw : mirror(raw));
    const secondSide = firstSide === 'SHORT' ? 'LONG' : 'SHORT';
    assert.equal(values(ctx, 'Outcome')[20], -1);
    assert.equal(values(ctx, 'Direction')[21], firstSide === 'SHORT' ? 1 : -1);
    assert.equal(signalCount(ctx, firstSide), 1);
    assert.equal(signalCount(ctx, secondSide), 1);
    assert.equal(values(ctx, 'Outcome').at(-1), 1);
    assert.equal(lines(ctx).length, 16);
    assert.equal(positionZones(ctx).length, 4);
    assert.equal(labels(ctx).filter(l => ['SHORT', 'LONG'].includes(l.text)).length, 2);
  });
}


test('полное окно из 60 старых дней сохраняется после перехода расчёта за его конец', async () => {
  const ctx = await run(historyData(65), '5', {
    'История до (0 — правый край экрана)': start - 2 * 86_400_000 + 9 * 3_600_000,
  });
  assert.equal(lines(ctx).length, 480);
  assert.equal(priceLabels(ctx).length, 180);
  assert.equal(positionZones(ctx).length, 120);
  assert.equal(labels(ctx).filter(l => ['SHORT', 'LONG'].includes(l.text)).length, 60);
});

function adjacentPairPrefix() {
  return [...hour(), candle(12, 102, 103, 100.5, 101.5),
    candle(13, 101, 102, 100, 101), // Кандидат P1.
    candle(14, 101, 104, 100.6, 103), // Соседняя центральная свеча P2.
    candle(15, 103, 103, 100.8, 102)]; // P2 подтвердился: соседнюю P2 пропускаем, P1 сохраняем.
}
for (const side of ['SHORT', 'LONG']) {
  const transform = data => side === 'SHORT' ? data : mirror(data);
  const reflect = price => side === 'SHORT' ? price : 207 - price;
  test(`${side}: соседнюю P2 пропускаем, P1 сохраняем и переносим на следующий более глубокий свинг`, async () => {
    const prefix = await run(transform(adjacentPairPrefix()));
    assert.equal(values(prefix, 'Stage')[15], 3);
    assert.equal(lines(prefix).length, 0);
    assert.equal(prefix.plots.__boxes__.data[0].value.filter(b => b.border_style === 'style_dotted').length, 0);
    const data = [...adjacentPairPrefix(),
      candle(16, 101, 102, 99, 100), candle(17, 100, 102.5, 99.5, 102),
      candle(18, 102, 104, 100, 103), candle(19, 103, 103.5, 100.5, 102),
      candle(20, 102, 103, 98, 99), candle(21, 99, 101.5, 98.5, 100),
      candle(22, 100, 101.8, 99, 101.7)];
    const ctx = await run(transform(data));
    assert.equal(values(ctx, 'Stage')[17], 3);
    assert.equal(values(ctx, 'Stage')[19], 4); // Между P1 и P2 ровно одна свеча — допустимо.
    assert.equal(values(ctx, side).slice(0, 22).filter(Boolean).length, 0);
    assert.equal(values(ctx, side)[22], 1);
    assert.equal(signalCount(ctx, side), 1);
    assert.equal(values(ctx, `${side} Entry`)[22], reflect(101.625));
    assert.equal(lines(ctx).length, 8);
    const m5 = ctx.plots.__boxes__.data[0].value.filter(b => b.border_style === 'style_dotted');
    assert.equal(m5.length, 1);
    assert.equal(m5[0].left, start + 16 * step);
  });

  test(`${side}: до подходящей P2 первая точка переносится на более глубокий подтверждённый свинг`, async () => {
    const data = [...adjacentPairPrefix(),
      candle(16, 101, 102, 99, 100), candle(17, 100, 102.5, 99.5, 102),
      candle(18, 102, 103, 98.5, 99), candle(19, 99, 103.5, 99, 103),
      candle(20, 103, 104, 99.5, 103), candle(21, 103, 103.5, 100, 102),
      candle(22, 102, 103, 98, 99), candle(23, 99, 100.5, 98.1, 100),
      candle(24, 100, 101.75, 98.2, 101.5)];
    const ctx = await run(transform(data));
    assert.equal(values(ctx, 'Stage')[19], 3);
    assert.equal(values(ctx, 'Stage')[21], 4);
    assert.equal(signalCount(ctx, side), 1);
    assert.equal(values(ctx, `${side} Entry`)[24], reflect(101.6875));
    const m5 = ctx.plots.__boxes__.data[0].value.find(b => b.border_style === 'style_dotted');
    assert.equal(m5.left, start + 18 * step);
    assert.equal(m5.top, Math.max(reflect(98.5), reflect(104)));
    assert.equal(m5.bottom, Math.min(reflect(98.5), reflect(104)));
  });
}

test('MEXC 24 августа: пара 15:00/15:05 исключена, новая P1 в 15:25, прежнего входа 15:35 нет', async () => {
  // Реальные сохранённые MEXC свечи. Скриншот пользователя с Binance:
  // сопоставляется структура, небольшие различия биржевых цен ожидаемы.
  const raw = JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json', import.meta.url)));
  const from = Date.parse('2026-08-24T14:00:00+07:00');
  const until = Date.parse('2026-08-24T16:00:00+07:00');
  const data = raw.candles.filter(b => b.time * 1000 >= from && b.time * 1000 < until)
    .map(b => ({ openTime: b.time * 1000, closeTime: b.time * 1000 + step - 1,
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.vol }));
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage')[14], 1); // 15:00 пропущена; следующего достаточного пробоя ещё нет.
  assert.equal(values(ctx,'Stage')[16],3);
  assert.equal(signalCount(ctx), 0);
  assert.equal(signalCount(ctx, 'LONG'), 0);
  const m5 = ctx.plots.__boxes__.data[0].value.filter(b => b.border_style === 'style_dotted');
  assert.equal(m5.length, 1);
  assert.equal(m5[0].left, Date.parse('2026-08-24T15:25:00+07:00'));
  assert.equal(m5[0].bottom, 93.21);
  assert.equal(m5[0].top, 94.08);
});

for (const side of ['SHORT', 'LONG']) {
  const reflect = p => side === 'SHORT' ? p : 207 - p;
  for (const [name, rawHigh, rawLow, expectedOutcome] of [
    ['цель в тени после входа, текущая цена уже отскочила', 103, 98.8, 1],
    ['стоп в тени после входа, текущая цена уже вернулась', 105.2, 100, -1],
    ['обе границы в пропущенных обновлениях дают неизвестный порядок', 105.2, 98.8, 2],
  ]) {
    test(`${side}: ${name} на следующей открытой M5`, async () => {
      const raw = [...complete().slice(0, 20), candle(20, 102, 103, 100, 102)];
      const data = side === 'SHORT' ? raw : mirror(raw);
      let tail = { ...data.at(-1) };
      const provider = {
        getMarketData: async (_ticker, _tf, _limit, since) =>
          since !== undefined && since >= tail.openTime ? [{ ...tail }] : data.map(b => ({ ...b })),
        getSymbolInfo: async () => null,
      };
      const engine = new PineTS(provider, 'SOLUSDT', '5');
      const ctx = await engine.run(zeroOffset());
      assert.equal(ctx.plots.Stage.data.at(-1).value, 6);
      assert.equal(ctx.plots.Outcome.data.at(-1).value, 0);
      // Цена касания не была передана отдельным обновлением: известны
      // итоговые high/low и цена после возврата, строго после бара входа.
      tail = { ...tail, high: side === 'SHORT' ? rawHigh : reflect(rawLow),
        low: side === 'SHORT' ? rawLow : reflect(rawHigh), close: reflect(102), closeTime: Date.now() + step };
      await engine.updateTail(ctx);
      assert.equal(ctx.plots.Outcome.data.at(-1).value, expectedOutcome);
      assert.equal(priceLabels(ctx).filter(l => l.text.startsWith('Цель:') && l.text.endsWith(' +')).length, expectedOutcome === 1 ? 1 : 0);
      assert.equal(priceLabels(ctx).filter(l => l.text.startsWith('Стоп:') && l.text.endsWith(' +')).length, expectedOutcome === -1 ? 1 : 0);
      assert.equal(ctx.alerts.length, 0); // Уже выданный исторический вход не дублируется.
      // Более поздние котировки не меняют первый определённый исход.
      tail = { ...tail, high: Math.max(tail.high, reflect(106)), low: Math.min(tail.low, reflect(98)) };
      await engine.updateTail(ctx);
      assert.equal(ctx.plots.Outcome.data.at(-1).value, expectedOutcome);
    });
  }

  test(`${side}: тень до входа на той же M5 не становится ложным тейком после входа`, async () => {
    const raw = [...hour(), ...structure(), candle(17, 102, 103, 99, 100)];
    const data = side === 'SHORT' ? raw : mirror(raw);
    let tail = { ...data.at(-1) };
    const provider = {
      getMarketData: async (_ticker, _tf, _limit, since) =>
        since !== undefined && since >= tail.openTime ? [{ ...tail }] : data.map(b => ({ ...b })),
      getSymbolInfo: async () => null,
    };
    const engine = new PineTS(provider, 'SOLUSDT', '5');
    const ctx = await engine.run(zeroOffset());
    for (const quote of [102, 101.5, 102.5]) {
      const p = reflect(quote);
      tail = { ...tail, high: Math.max(tail.high, p), low: Math.min(tail.low, p), close: p, closeTime: Date.now() + step };
      await engine.updateTail(ctx);
      assert.equal(ctx.plots.Stage.data.at(-1).value, 6);
      assert.equal(ctx.plots.Outcome.data.at(-1).value, 0);
      assert.equal(priceLabels(ctx).filter(l => l.text.endsWith(' +')).length, 0);
    }
    assert.equal(ctx.alerts.length, 1);
  });
}

function unbrokenShortToLong() {
  return [...hour(), ...structure(),
    candle(17, 103, 107, 102, 106.5), // Выход через high H1, SHORT P1=100 не обновлён.
    candle(18, 106.5, 108, 104, 107),
    candle(19, 107, 107.5, 103, 104), // LONG P1=108 подтверждён.
    candle(20, 104, 105, 100.5, 102), // Ниже low H1=101, но выше «0»=100.
    candle(21, 102, 105.5, 101.2, 104), // LONG P2 подтверждён.
    candle(22, 104, 109, 103, 108), // Новая третья точка.
    candle(23, 108, 108.5, 104.2, 105),
    candle(24, 105, 107, 103.5, 104), // Ретест к 103.5 по Фибо «0–1».
    candle(25, 104, 110, 104, 109)];
}

test('v32: новая LONG P2 выше прежнего SHORT минимума использует Фибо1–2', async () => {
  const ctx = await run(unbrokenShortToLong());
  assert.equal(values(ctx, 'LONG Floor 0')[17], 100);
  assert.equal(values(ctx, 'Direction')[20], 1);
  assert.equal(values(ctx, 'Stage')[21], 4);
  assert.equal(values(ctx, 'H1 Low')[20], 101);
  assert.equal(values(ctx, 'LONG Stop')[22], 98.625); // Стоп может лежать ниже самого «0».
  assert.equal(values(ctx, 'LONG Target')[22], 109);
  assert.equal(values(ctx, 'LONG Entry')[24], 103.8125);
  assert.equal(signalCount(ctx, 'LONG'), 1);
  assert.equal(signalCount(ctx), 0);
  assert.equal(values(ctx, 'Outcome').at(-1), 1);
  assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0').at(-1)));
  assert.equal(values(ctx,'LONG Origin Guard')[21],100);
  assert.ok(priceLabels(ctx).some(l => l.text.startsWith('Цель:') && l.text.endsWith(' +')));
});

test('LONG: равенство P2 шортовому «0» допустимо, строгое обновление сбрасывает структуру без третьего приоритета', async () => {
  for (const low of [100, 99.9]) {
    const data = unbrokenShortToLong().slice(0, 22);
    data[20] = candle(20, 104, 105, low, 102);
    const ctx = await run(data);
    if (low === 100) {
      assert.equal(values(ctx, 'Direction')[20], 1);
      assert.equal(values(ctx, 'Stage')[21], 4);
      assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0')[21]));
      assert.equal(values(ctx,'LONG Origin Guard')[21],100);
    } else {
      assert.equal(values(ctx, 'Direction')[20], 1);
      assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0')[20]));
      assert.equal(signalCount(ctx, 'LONG'), 0);
    }
  }
});

test('LONG: новая P2 может понижаться до прежнего SHORT минимума, Фибо следует новой1–2', async () => {
  const data = [...unbrokenShortToLong().slice(0, 22),
    candle(22, 104, 105.5, 100.2, 102), candle(23, 102, 106, 100.8, 104),
    candle(24, 104, 109, 103, 108), candle(25, 108, 108.5, 104.2, 105),
    candle(26, 105, 107, 103.5, 104)];
  const ctx = await run(data);
  assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0')[23]));
  assert.equal(values(ctx,'LONG Origin Guard')[23],100);
  assert.equal(values(ctx, 'LONG Stop')[24], 98.25);
  assert.equal(values(ctx, 'LONG Entry')[26], 103.625);
  assert.equal(signalCount(ctx, 'LONG'), 1);
});

test('LONG: пробой «0» на ретесте пересекает P2 и запускает SHORT без старого входа', async () => {
  const data = unbrokenShortToLong().slice(0, 24);
  data[23] = candle(23, 105, 105.5, 99.9, 100.5);
  const ctx = await run(data);
  assert.equal(values(ctx, 'Direction')[23], -1);
  assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0')[23]));
  assert.equal(signalCount(ctx, 'LONG'), 0);
});

test('LONG: после входа живёт до TP/SL, после стопа следующий поиск не наследует «0»', async () => {
  const data = [...unbrokenShortToLong().slice(0, 25),
    candle(25, 104, 107, 99.5, 100), // Ниже «0», но SL=98 пока не достигнут.
    candle(26, 100, 104, 98, 99), // Стоп.
    candle(27, 102, 104, 102, 103)];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage')[25], 6);
  assert.equal(values(ctx, 'Outcome')[25], 0);
  assert.equal(values(ctx, 'Outcome')[26], -1);
  assert.equal(values(ctx, 'Stage')[27], 5);
  assert.equal(values(ctx, 'Direction')[27], -1);
  assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0')[27]));
});

test('новая H1 сбрасывает сохранённый шортовый «0» ожидающего LONG', async () => {
  const next = Array.from({ length: 12 }, (_, i) => candle(i, 105, 106, 104, 105, 1));
  const ctx = await run([...unbrokenShortToLong().slice(0, 24), ...next]);
  assert.equal(values(ctx, 'Stage').at(-1), 1);
  assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0').at(-1)));
});

test('после SHORT P3 разворот по P2 создаёт LONG без исключения по «0»', async () => {
  const data = [...complete().slice(0, 18), candle(18, 103, 107, 102, 106.5),
    candle(19, 106.5, 108, 104, 107), candle(20, 107, 107.5, 103, 104),
    candle(21, 104, 105, 100.5, 102)];
  const ctx = await run(data);
  assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0')[18]));
  assert.equal(values(ctx, 'Direction')[21], 1);
  assert.equal(signalCount(ctx, 'LONG'), 1);
  assert.equal(values(ctx, 'LONG')[21], 1);
  assert.equal(values(ctx, 'LONG Entry')[21], 102.875);
});

test('живой LONG: возврат под H1 пробой «0» сбрасывает структуру, но сохраняет второй приоритет', async () => {
  const data = [...unbrokenShortToLong().slice(0, 20), candle(20, 104, 105, 102, 103)];
  let tail = { ...data.at(-1) };
  const provider = {
    getMarketData: async (_ticker, _tf, _limit, since) =>
      since !== undefined && since >= tail.openTime ? [{ ...tail }] : data.map(b => ({ ...b })),
    getSymbolInfo: async () => null,
  };
  const engine = new PineTS(provider, 'SOLUSDT', '5');
  const ctx = await engine.run(zeroOffset());
  for (const quote of [100.5, 100, 102]) {
    tail = { ...tail, close: quote, low: Math.min(tail.low, quote), closeTime: Date.now() + step };
    await engine.updateTail(ctx);
    assert.equal(ctx.plots.Direction.data.at(-1).value, quote >= 100 ? 1 : -1);
    if (quote >= 100) assert.equal(ctx.plots['LONG Floor 0'].data.at(-1).value, 100);
    else assert.ok(Number.isNaN(ctx.plots['LONG Floor 0'].data.at(-1).value));
    assert.equal(ctx.alerts.length, 0);
  }
  // Отдельная котировка пробоя не пришла, но новая тень уже нарушила «0».
  tail = { ...tail, close: 102, low: 99.9, closeTime: Date.now() + step };
  await engine.updateTail(ctx);
  assert.equal(ctx.plots.Direction.data.at(-1).value, 1);
  assert.ok(Number.isNaN(ctx.plots['LONG Floor 0'].data.at(-1).value));
  assert.equal(ctx.alerts.length, 0);
});

test('MEXC24 августа: новаяФибо1–2 без старого0 даёт LONG20:40', async () => {
  const raw = JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json', import.meta.url)));
  const from = Date.parse('2026-08-24T14:00:00+07:00');
  const until = Date.parse('2026-08-25T06:00:00+07:00');
  const data = raw.candles.filter(b => b.time * 1000 >= from && b.time * 1000 < until)
    .map(b => ({ openTime: b.time * 1000, closeTime: b.time * 1000 + step - 1,
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.vol }));
  const ctx = await run(data);
  const index = time => (Date.parse(`2026-08-24T${time}:00+07:00`) - from) / step;
  assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0')[index('19:20')]));
  assert.equal(values(ctx,'LONG Origin Guard')[index('19:20')],93.21);
  assert.equal(values(ctx, 'Direction')[index('19:15')], 1);
  assert.equal(values(ctx, 'Stage')[index('19:20')], 4);
  const entryBar = index('20:40');
  assert.equal(values(ctx, 'LONG')[entryBar], 1);
  assert.equal(signalCount(ctx, 'LONG'), 1);
  assert.equal(signalCount(ctx), 0);
  assert.ok(Math.abs(values(ctx, 'LONG Stop')[entryBar] - 93.1175) < 1e-9);
  assert.ok(Math.abs(values(ctx, 'LONG Entry')[entryBar] - 94.87875) < 1e-9);
  assert.equal(values(ctx, 'LONG Target')[entryBar], 96.64);
  assert.equal(values(ctx, 'Outcome').at(-1), 1);
});

test('разворотный LONG сохраняет P1 после соседнего low и ждёт более низкую не соседнюю P2', async () => {
  const data = [...unbrokenShortToLong().slice(0, 20),
    candle(20, 104, 106, 103.5, 105), // Подтверждён соседний low 19-й свечи = 103.
    candle(21, 105, 106.5, 103.2, 104),
    candle(22, 104, 106, 103.6, 105), // Новый low=103.2 выше пропущенного 103: ещё не P2.
    candle(23, 105, 106.5, 100.5, 102),
    candle(24, 102, 107, 101.2, 106), // Подходящий низ=100.5 подтверждён, «0»=100 цел.
    candle(25, 106, 109, 103, 108), candle(26, 108, 108.5, 104.2, 105),
    candle(27, 105, 107, 103.5, 104)];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage')[20], 3);
  assert.equal(values(ctx, 'Stage')[22], 3);
  assert.equal(values(ctx, 'Stage')[24], 4);
  assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0')[24]));
  assert.equal(values(ctx,'LONG Origin Guard')[24],100);
  assert.equal(values(ctx, 'LONG Stop')[27], 98.625);
  assert.equal(values(ctx, 'LONG Entry')[27], 103.8125);
  assert.equal(signalCount(ctx, 'LONG'), 1);
  const m5 = ctx.plots.__boxes__.data[0].value.filter(b => b.border_style === 'style_dotted');
  const longRange = m5.find(b => b.left === start + 18 * step);
  assert.ok(longRange);
  assert.equal(longRange.top, 108);
  assert.equal(longRange.bottom, 100.5);
});

test('при смене SHORT на LONG подтверждённый минимум «0» сохраняется до подтверждения верхнего P2', async () => {
  const data = [...hour(), ...structure().slice(0, 3), candle(15, 103, 107, 102, 106.5)];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage')[14], 3);
  assert.equal(values(ctx, 'Direction')[15], 1);
  assert.equal(values(ctx, 'LONG Floor 0')[15], 100);
});

for (const side of ['LONG', 'SHORT']) {
  test(`${side}: пробой P1 на свече подтверждения P2 не теряется (MEXC 27 августа)`, async () => {
    const raw = JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json', import.meta.url)));
    const from = Date.parse('2026-08-27T14:00:00+07:00');
    const until = Date.parse('2026-08-27T17:00:00+07:00');
    let data = raw.candles.filter(b => b.time * 1000 >= from && b.time * 1000 < until)
      .map(b => ({ openTime: b.time * 1000, closeTime: b.time * 1000 + step - 1,
        open: b.open, high: b.high, low: b.low, close: b.close, volume: b.vol }));
    if (side === 'SHORT') data = mirror(data);
    const ctx = await run(data);
    const at = time => (Date.parse(`2026-08-27T${time}:00+07:00`) - from) / step;
    const price = n => side === 'LONG' ? n : 207 - n;
    assert.equal(values(ctx, 'Stage')[at('15:45')], 5);
    assert.equal(values(ctx, side)[at('15:45')], 0); // Не приписываем ретест задним числом.
    assert.equal(values(ctx, side)[at('16:00')], 1);
    assert.equal(signalCount(ctx, side), 1);
    assert.ok(Math.abs(values(ctx, `${side} Entry`)[at('16:00')] - price(104.2875)) < 1e-9);
    assert.ok(Math.abs(values(ctx, `${side} Stop`)[at('16:00')] - price(103.485)) < 1e-9);
    assert.ok(Math.abs(values(ctx, `${side} Target`)[at('16:00')] - price(105.09)) < 1e-9);
    assert.equal(values(ctx, 'Outcome')[at('16:20')], 1);
    assert.ok(priceLabels(ctx).some(l => l.text.startsWith('Цель:') && l.text.endsWith(' +')));
  });
}

for (const side of ['SHORT', 'LONG']) {
  const transform = data => side === 'SHORT' ? data : mirror(data);
  const price = n => side === 'SHORT' ? n : 207 - n;
  test(`${side}: после ретеста без входа новый экстремум перестраивает Фибо с 1–2 на 2–3`, async () => {
    const data = transform([...hour(108), ...structure(),
      candle(17, 101, 101.5, 99, 100),
      candle(18, 100, 101.5, 99.5, 101), // Не дошли до исходного входа 102.
      candle(19, 101, 101.2, 98, 99), // Новый минимум: стоп 105.5, вход 101.75.
      candle(20, 99, 101.8, 98.5, 101.5),
      candle(21, 101.5, 102, 97, 98)]);
    const ctx = await run(data);
    assert.equal(signalCount(ctx, side), 1);
    assert.equal(values(ctx, side)[20], 1);
    assert.ok(Math.abs(values(ctx, `${side} Stop`)[20] - price(105.5)) < 1e-9);
    assert.ok(Math.abs(values(ctx, `${side} Entry`)[20] - price(101.75)) < 1e-9);
    assert.equal(values(ctx, `${side} Target`)[20], price(98));
    assert.equal(values(ctx, 'Outcome')[21], 1);
    const fibs = lines(ctx).filter(l => l.width === 1).map(l => l.y1);
    for (const n of [105.5, 104, 101, 98, 96.5]) assert.ok(fibs.some(v => Math.abs(v-price(n))<1e-9));
  });
  test(`${side}: непрерывное обновление P3 без отдельного ретеста сохраняет Фибо 1–2`, async () => {
    const ctx = await run(transform([...hour(108), ...structure(),
      candle(17, 101, 101.5, 99, 100), candle(18, 100, 101, 98, 99),
      candle(19, 99, 100.5, 97, 98)]));
    assert.equal(signalCount(ctx, side), 0);
    assert.equal(values(ctx, `${side} Stop`).at(-1), price(105));
    assert.equal(values(ctx, `${side} Target`).at(-1), price(97));
  });
}

test('BAG2 MEXC28 августа: свинг без входа и новый P3 отменяют SHORT', async () => {
  const raw = JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json', import.meta.url)));
  const from = Date.parse('2026-08-28T14:00:00+07:00');
  const until = Date.parse('2026-08-28T20:30:00+07:00');
  const data = raw.candles.filter(b => b.time * 1000 >= from && b.time * 1000 < until)
    .map(b => ({ openTime: b.time * 1000, closeTime: b.time * 1000 + step - 1,
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.vol }));
  const ctx = await run(data);
  const at = time => (Date.parse(`2026-08-28T${time}:00+07:00`) - from) / step;
  assert.equal(signalCount(ctx,'SHORT')+signalCount(ctx,'LONG'),0);
  assert.ok(values(ctx,'Stage').includes(7));
  assert.ok(Number.isNaN(values(ctx,'SHORT Entry').at(-1)));
});

for (const side of ['SHORT', 'LONG']) {
  const reflect = p => side === 'SHORT' ? p : 207 - p;
  test(`${side}: неполный ретест и новый экстремум внутри открытой M5, перенос и один сигнал`, async () => {
    const raw = [...hour(108), ...structure(), candle(17, 101, 101.5, 99, 100)];
    const data = side === 'SHORT' ? raw : mirror(raw);
    let tail = { ...data.at(-1) };
    const provider = {
      getMarketData: async (_ticker, _tf, _limit, since) =>
        since !== undefined && since >= tail.openTime ? [{ ...tail }] : data.map(b => ({ ...b })),
      getSymbolInfo: async () => null,
    };
    const engine = new PineTS(provider, 'SOLUSDT', '5');
    const ctx = await engine.run(zeroOffset());
    const last = name => ctx.plots[name].data.at(-1).value;
    for (const quote of [98, 100]) {
      const p = reflect(quote);
      tail = { ...tail, close: p, high: Math.max(tail.high, p), low: Math.min(tail.low, p), closeTime: Date.now() + step };
      await engine.updateTail(ctx);
      assert.equal(last('Stage'), 5);
      assert.equal(last('Fibo Reanchored'), 0);
    }
    for (const [quote, stage] of [[97, 5], [101.375, 6], [96, 6]]) {
      const p = reflect(quote);
      tail = { ...tail, close: p, high: Math.max(tail.high, p), low: Math.min(tail.low, p) };
      await engine.updateTail(ctx);
      assert.equal(last('Stage'), stage);
      assert.equal(last('Fibo Reanchored'), 1);
      assert.equal(last(`${side} Entry`), reflect(101.375));
      assert.equal(last(`${side} Stop`), reflect(105.75));
      assert.equal(last(`${side} Target`), reflect(97));
      assert.equal(positionZones(ctx).length, 2);
    }
    assert.equal(ctx.alerts.length, 1);
  });
  test(`${side}: новая H1 сбрасывает перенос Фибо 2–3`, async () => {
    let data = [...hour(108), ...structure(), candle(17, 101, 101.5, 99, 100),
      candle(18, 100, 101.5, 99.5, 101), candle(19, 101, 101.2, 98, 99),
      ...hour(108).map(b => ({ ...b, openTime: b.openTime + 86400000, closeTime: b.closeTime + 86400000 }))];
    if (side === 'LONG') data = mirror(data);
    const ctx = await run(data);
    assert.equal(values(ctx, 'Fibo Reanchored')[19], 1);
    assert.equal(values(ctx, 'Fibo Reanchored').at(-1), 0);
    assert.equal(values(ctx, 'Stage').at(-1), 1);
  });
}

test('перенос 2–3 сохраняет фильтр SHORT: стоп выше H1 не создаёт сигнал', async () => {
  const ctx = await run([...hour(105.25), ...structure(), candle(17, 101, 101.5, 99, 100),
    candle(18, 100, 101.5, 99.5, 101), candle(19, 101, 101.2, 98, 99),
    candle(20, 99, 104, 98.5, 103)]);
  assert.equal(values(ctx, 'Stage')[19], 7);
  assert.equal(signalCount(ctx), 0);
});

// Эти проверки запускают источник с настоящими настройками по умолчанию.
async function runDefault(data) {
  const last = data.at(-1);
  const guard = { ...last, openTime: last.openTime + step, closeTime: last.closeTime + step };
  return historicalClock([...data,guard],()=>new PineTS([...data, guard], 'SOLUSDT', '5').run(source));
}
for (const side of ['SHORT', 'LONG']) {
  const transform = data => side === 'SHORT' ? data : mirror(data);
  const price = p => side === 'SHORT' ? p : 207 - p;
  test(`${side}: default 0.03 USDT за Фибо, прежний вход; касание самой линии не стоп`, async () => {
    const data = transform([...complete().slice(0, 20), candle(20, 102, 105, 100, 104),
      candle(21, 104, 105.03, 103, 104.5)]);
    const ctx = await runDefault(data);
    assert.ok(Math.abs(values(ctx, `${side} Stop`)[19] - price(105.03)) < 1e-9);
    assert.ok(Math.abs(values(ctx, `${side} Entry`)[19] - price(102)) < 1e-9);
    assert.equal(values(ctx, `${side} Target`)[19], price(99.03));
    assert.equal(values(ctx, 'Outcome')[20], 0);
    assert.equal(values(ctx, 'Outcome')[21], -1);
    const redLines = lines(ctx).filter(l => l.width === 1 && l.color === '#F23645');
    assert.ok(redLines.some(l => Math.abs(l.y1-price(105))<1e-9)); // Фибо не сдвинута.
    assert.ok(priceLabels(ctx).some(l => l.text.startsWith('Стоп:') && l.text.endsWith(' +')));
  });
  test(`${side}: буфер стопа не переносит прежнюю середину входа`, async () => {
    const ctx = await runDefault(transform([...complete().slice(0, 19),
      candle(19, 101, 102, 100, 101.8), candle(20, 101.8, 102.02, 100.5, 102)]));
    assert.equal(values(ctx, side)[19], 1);
    assert.equal(values(ctx, side)[20], 0);
    assert.equal(values(ctx, `${side} Entry`)[19], price(102));
    assert.equal(signalCount(ctx, side), 1);
  });
  test(`${side}: перенос Фибо 2–3 сохраняет ровно 0.03 за новой красной линией`, async () => {
    const ctx = await runDefault(transform([...hour(108), ...structure(),
      candle(17, 101, 101.5, 99, 100), candle(18, 100, 101.5, 99.5, 101),
      candle(19, 101, 101.2, 98, 99), candle(20, 99, 101.8, 98.5, 101.5),
      candle(21, 101.5, 105.5, 100, 104), candle(22, 104, 105.53, 103, 104.5)]));
    assert.equal(values(ctx, 'Fibo Reanchored')[20], 1);
    assert.ok(Math.abs(values(ctx, `${side} Stop`)[20] - price(105.53)) < 1e-9);
    assert.ok(Math.abs(values(ctx, `${side} Entry`)[20] - price(101.75)) < 1e-9);
    assert.equal(values(ctx, `${side} Target`)[20], price(98.03));
    assert.equal(values(ctx, 'Outcome')[21], 0);
    assert.equal(values(ctx, 'Outcome')[22], -1);
  });
}

for (const side of ['SHORT', 'LONG']) {
  const transform = data => side === 'SHORT' ? data : mirror(data);
  const shift = (data, days) => data.map(b => ({ ...b, openTime: b.openTime + days * 86400000, closeTime: b.closeTime + days * 86400000 }));
  for (const [name, days] of [['суббота', -3], ['воскресенье', -2]]) {
    test(`${side}: ${name} по Красноярску — нет поиска, сигналов и нового часового прямоугольника`, async () => {
      const ctx = await runDefault(transform(shift(complete(), days)));
      assert.ok(values(ctx, 'Stage').every(s => s === 0));
      assert.equal(signalCount(ctx, side), 0);
      assert.equal(lines(ctx).length, 0);
      assert.equal(positionZones(ctx).length, 0);
    });
  }
  test(`${side}: ограничение 20:30 отменено — вход в будний день в 22:35 разрешён`, async () => {
    const late = complete().slice(12).map(b => ({ ...b, openTime: b.openTime + 7 * 3600000, closeTime: b.closeTime + 7 * 3600000 }));
    const ctx = await runDefault(transform([...hour(), ...late]));
    assert.equal(values(ctx, side)[19], 1);
    assert.equal(signalCount(ctx, side), 1);
  });
  test(`${side}: пятничный ожидающий план отменяется в субботу 00:00, а не в 20:30`, async () => {
    const data = [...complete().slice(0, 18), candle(119, 100, 101.5, 99.1, 100.5),
      candle(120, 100.5, 102.2, 100, 102)];
    const ctx = await runDefault(transform(shift(data, -4)));
    assert.equal(values(ctx, 'Stage')[18], 5);
    assert.equal(values(ctx, 'Stage')[19], 0);
    assert.equal(signalCount(ctx, side), 0);
    assert.equal(priceLabels(ctx).length, 0);
    assert.equal(positionZones(ctx).length, 0);
  });
  test(`${side}: пятничный вход продолжает ждать исход в субботу`, async () => {
    const ctx = await runDefault(transform(shift([...complete().slice(0, 20), candle(120, 102, 103, 98, 99)], -4)));
    assert.equal(values(ctx, side)[19], 1);
    assert.equal(values(ctx, 'Outcome')[20], 1);
    assert.equal(signalCount(ctx, side), 1);
  });
  test(`${side}: после субботы и воскресенья новая понедельничная H1 снова разрешает вход`, async () => {
    const ctx = await runDefault(transform([...shift(complete(), -3), ...shift(complete(), -2), ...shift(complete(), -1)]));
    assert.equal(signalCount(ctx, side), 1);
    assert.equal(values(ctx, side)[complete().length * 2 + 19], 1);
  });
}

for (const side of ['SHORT', 'LONG']) {
  test(`${side}: живой переход в субботу запрещает вход внутри пятничной свечи 23:55`, async () => {
    const raw = [...complete().slice(0, 18), candle(119, 100, 101.5, 99.1, 100.5)]
      .map(b => ({ ...b, openTime: b.openTime - 4 * 86400000, closeTime: b.closeTime - 4 * 86400000 }));
    const data = side === 'SHORT' ? raw : mirror(raw);
    let tail = { ...data.at(-1) };
    const provider = {
      getMarketData: async (_ticker, _tf, _limit, since) =>
        since !== undefined && since >= tail.openTime ? [{ ...tail }] : data.map(b => ({ ...b })),
      getSymbolInfo: async () => null,
    };
    try {
      mock.timers.setTime(tail.openTime + 60_000); // Пятница 23:56 UTC+7.
      const engine = new PineTS(provider, 'SOLUSDT', '5');
      const ctx = await engine.run(source);
      assert.equal(ctx.plots.Stage.data.at(-1).value, 5);
      mock.timers.setTime(tail.openTime + step); // Уже суббота 00:00.
      const quote = side === 'SHORT' ? 102.2 : 104.8;
      tail = { ...tail, high: Math.max(tail.high, quote), low: Math.min(tail.low, quote), close: quote, closeTime: Date.now() + step };
      await engine.updateTail(ctx);
      assert.equal(ctx.plots.Stage.data.at(-1).value, 0);
      assert.equal(ctx.alerts.length, 0);
    } finally {
      mock.timers.setTime(Date.parse('2026-10-20T12:00:00Z'));
    }
  });
}

test('BAG2 MEXC31 августа: отмена LONG18:15 без позднего входа', async () => {
  const raw = JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json', import.meta.url)));
  const from = Date.parse('2026-08-31T14:00:00+07:00');
  const until = Date.parse('2026-08-31T20:00:00+07:00');
  const data = raw.candles.filter(b => b.time * 1000 >= from && b.time * 1000 < until)
    .map(b => ({ openTime: b.time * 1000, closeTime: b.time * 1000 + step - 1,
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.vol }));
  const ctx = await runDefault(data);
  const at = time => (Date.parse(`2026-08-31T${time}:00+07:00`) - from) / step;
  assert.equal(values(ctx,'Stage')[at('18:10')],5);
  assert.equal(values(ctx,'Stage')[at('18:15')],7);
  assert.equal(signalCount(ctx,'LONG')+signalCount(ctx,'SHORT'),0);
});

test('разворот до подтверждения первого нижнего свинга не создаёт вымышленный минимум «0»', async () => {
  const ctx=await run([...hour(),candle(12,103,105,102,103),candle(13,102,103,100.5,101.5),candle(14,103,107,101.2,106.5)]);
  assert.equal(values(ctx,'Direction')[14],1);
  assert.ok(Number.isNaN(values(ctx,'LONG Floor 0')[14]));
});

for (const side of ['SHORT', 'LONG']) {
  const transform = data => side === 'SHORT' ? data : mirror(data);
  const reflect = p => side === 'SHORT' ? p : 207-p;
  test(`${side}: равные соседние экстремумы подтверждают одну P2 только после выхода из плато`, async () => {
    const prefix = [...hour(108), ...structure(), candle(17, 103, 104.5, 101.4, 104),
      candle(18, 104, 104.5, 101.5, 104)];
    const before = await run(transform(prefix));
    const box0 = before.plots.__boxes__.data[0].value.find(b => b.border_style === 'style_dotted');
    assert.equal(side === 'SHORT' ? box0.top : box0.bottom, reflect(104));
    const ctx = await run(transform([...prefix, candle(19, 104, 104, 101.6, 103),
      candle(20, 103, 103.5, 99, 100)]));
    assert.equal(values(ctx, 'Stage')[19], 4);
    assert.ok(Math.abs(values(ctx, `${side} Stop`)[20]-reflect(105.625))<1e-9);
    assert.ok(Math.abs(values(ctx, `${side} Entry`)[20]-reflect(102.3125))<1e-9);
  });
  test(`${side}: общая вершина плато относится к последней свече, а не к первой`, async () => {
    const prefix = [...adjacentPairPrefix().slice(0, 15), candle(15, 103, 104, 100.8, 103),
      candle(16, 103, 103, 101, 102)];
    const before = await run(transform(prefix));
    assert.equal(values(before, 'Stage')[16], 4);
    assert.equal(before.plots.__boxes__.data[0].value.filter(b => b.border_style === 'style_dotted').length, 1);
    const ctx = await run(transform([...prefix, candle(17, 102, 104.5, 101.5, 104),
      candle(18, 104, 104, 101.6, 103), candle(19, 103, 103.5, 99, 100)]));
    const range = ctx.plots.__boxes__.data[0].value.find(b => b.border_style === 'style_dotted');
    assert.equal(range.left, start+13*step);
    assert.ok(Math.abs(values(ctx, `${side} Stop`)[19]-reflect(105.625))<1e-9);
  });
}

test('MEXC 1 сентября: сохраняем самый нижний P1 101.74 и общую вершину P2 102.68', async () => {
  const raw = JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json', import.meta.url)));
  const from = Date.parse('2026-09-01T14:00:00+07:00'), until = Date.parse('2026-09-01T20:00:00+07:00');
  const data = raw.candles.filter(b => b.time*1000>=from && b.time*1000<until)
    .map(b => ({ openTime:b.time*1000, closeTime:b.time*1000+step-1,
      open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol }));
  const ctx = await runDefault(data);
  const at=t=>(Date.parse(`2026-09-01T${t}:00+07:00`)-from)/step;
  assert.equal(values(ctx, 'Stage')[at('15:40')], 3);
  assert.equal(values(ctx, 'Stage')[at('15:50')], 3);
  assert.equal(values(ctx, 'SHORT')[at('19:45')], 1);
  assert.equal(signalCount(ctx),1);
  const range=ctx.plots.__boxes__.data[0].value.find(b=>b.border_style==='style_dotted');
  assert.equal(range.left,Date.parse('2026-09-01T15:40:00+07:00'));
  assert.equal(range.bottom,101.74);
  assert.equal(range.top,102.68);
  assert.ok(Math.abs(values(ctx,'SHORT Entry')[at('19:45')]-102.1525)<1e-9);
  assert.ok(Math.abs(values(ctx,'SHORT Stop')[at('19:45')]-102.945)<1e-9);
  assert.equal(values(ctx,'SHORT Target')[at('19:45')],101.42);
});

test('MEXC 22 октября: после пропущенного high более низкий откат не превращает новый P1 в P3', async () => {
  const raw=JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-10-22-case.json',import.meta.url)));
  const data=raw.candles.map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,
    open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
  const ctx=await runDefault(data);
  assert.equal(signalCount(ctx),0);
  assert.ok(!labels(ctx).some(l=>l.text==='SHORT'));
  assert.equal(values(ctx,'Outcome').filter(v=>v===-1).length,0);
});

for(const side of ['SHORT','LONG']){
  const transform=d=>side==='SHORT'?d:mirror(d);
  const price=p=>side==='SHORT'?p:207-p;
  test(`${side}: после соседнего противоположного свинга более слабая вершина не подтверждает P2`,async()=>{
    const prefix=[...adjacentPairPrefix(), candle(16,102,102.5,101,102.3),
      candle(17,102.3,103.5,101.1,103), candle(18,103,103,101.2,102),
      candle(19,102,102.5,99,100), candle(20,100,103,99.5,102)];
    const before=await run(transform(prefix));
    assert.equal(values(before,'Stage')[18],3);
    assert.equal(values(before,'Stage')[20],3);
    assert.equal(signalCount(before,side),0);
    const ctx=await run(transform([...prefix,candle(21,102,104,100,103),
      candle(22,103,103.5,100.5,102),candle(23,102,103,98,99),candle(24,99,101.8,98.5,101.7)]));
    assert.equal(values(ctx,'Stage')[22],4);
    const range=ctx.plots.__boxes__.data[0].value.find(b=>b.border_style==='style_dotted');
    assert.equal(range.left,start+19*step);
    assert.equal(side==='SHORT'?range.bottom:range.top,price(99));
  });
}

for (const side of ['LONG','SHORT']) {
 test(`${side}: MEXC22 октября — исключённая соседняя пара даёт разворот, вход16:25 и тейк16:45`,async()=>{
  const raw=JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-10-22-case.json',import.meta.url)));
  const until=Date.parse('2026-10-22T17:00:00+07:00');
  const original=raw.candles.filter(b=>b.time*1000<until).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
  const data=side==='LONG'?original:mirror(original);
  const ctx=await runDefault(data);
  const at=t=>(Date.parse(`2026-10-22T${t}:00+07:00`)-data[0].openTime)/step;
  const price=p=>side==='LONG'?p:207-p;
  assert.equal(values(ctx,'Stage')[at('15:55')],3);
  assert.equal(values(ctx,'Stage')[at('16:10')],3);
  assert.equal(values(ctx,'Stage')[at('16:15')],5);
  assert.equal(values(ctx,side)[at('16:15')],0);
  assert.equal(values(ctx,side)[at('16:25')],1);
  assert.equal(signalCount(ctx,side==='LONG'?'SHORT':'LONG'),0);
  for (const [label,expected] of [['Entry',103.735],['Stop',103.45],['Target',103.96]])
   assert.ok(Math.abs(values(ctx,`${side} ${label}`)[at('16:25')]-price(expected))<1e-9);
  assert.equal(values(ctx,'Outcome')[at('16:45')],1);
 });
}

for (const side of ['SHORT']) {
  test(`${side}: BAG2 MEXC16 октября отменяет недошедший SHORT`, async () => {
    const raw=JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json',import.meta.url)));
    const from=Date.parse('2026-10-16T14:00:00+07:00');
    const until=Date.parse('2026-10-16T23:00:00+07:00');
    let data=raw.candles.filter(b=>b.time*1000>=from&&b.time*1000<until).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,
      open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
    if(side==='LONG') data=mirror(data);
    const ctx=await runDefault(data);
    const at=t=>(Date.parse(`2026-10-16T${t}:00+07:00`)-from)/step;
    assert.equal(signalCount(ctx,'LONG')+signalCount(ctx,'SHORT'),0);
    assert.ok(values(ctx,'Stage').includes(7));
    assert.ok(Number.isNaN(values(ctx,'SHORT Entry').at(-1)));
  });
}

for(const side of ['SHORT','LONG']) {
  test(`${side}: вторая сторона сохраняется после повторных пробоев H1 и сбрасывается новой H1`,async()=>{
    const data=[...hour(),...structure(),candle(17,103,107,102,106.5),
      candle(18,106.5,108,104,107),candle(19,107,107.5,103,104),
      candle(20,104,104.5,100,101),candle(21,101,102,99,100),
      candle(22,100,109,99.5,108),candle(23,108,108.5,98,100)];
    const next=complete().map(b=>({...b,openTime:b.openTime+86400000,closeTime:b.closeTime+86400000}));
    const transform=d=>side==='LONG'?d:mirror(d);
    const ctx=await run(transform([...data,...next]));
    const dir=side==='LONG'?1:-1;
    assert.equal(values(ctx,'Direction')[12],0);
    assert.equal(values(ctx,'Direction')[13],-dir);
    for(const i of [17,18,20,21,22]) assert.equal(values(ctx,'Direction')[i],dir);
    assert.equal(values(ctx,'Direction')[23],side==='SHORT'?-dir:dir,'P2-разворот — исключение из блокировки H1');
    assert.equal(values(ctx,'Stage')[data.length+11],1);
    assert.equal(values(ctx,'Direction')[data.length+11],0);
    assert.equal(values(ctx,'Direction')[data.length+12],0);
    assert.equal(values(ctx,'Direction')[data.length+13],-dir);
    assert.equal(signalCount(ctx,side==='LONG'?'SHORT':'LONG'),1);
  });
}

for(const side of ['SHORT','LONG']) {
  test(`${side}: тейк на 0.03 перед свингом, прежний вход, плюс до касания исходной цели`,async()=>{
    const transform=d=>side==='SHORT'?d:mirror(d);
    const price=p=>side==='SHORT'?p:207-p;
    const data=transform([...complete().slice(0,20),candle(20,102,103,99.02,100)]);
    const ctx=await runDefault(data);
    assert.equal(values(ctx,`${side} Entry`)[19],price(102));
    assert.equal(values(ctx,'Swing Target')[19],price(99));
    assert.ok(Math.abs(values(ctx,`${side} Target`)[19]-price(99.03))<1e-9);
    assert.equal(values(ctx,'Outcome')[20],1);
    assert.equal(signalCount(ctx,side),1);
    assert.ok(priceLabels(ctx).some(l=>l.text.startsWith('Цель:')&&l.text.endsWith(' +')&&Math.abs(l.y-price(99.03))<1e-9));
    assert.ok(lines(ctx).some(l=>l.width===2&&Math.abs(l.y1-price(99.03))<1e-9));
  });
}

for(const side of ['SHORT','LONG']) {
  const transform=d=>side==='SHORT'?d:mirror(d);
  const direction=side==='SHORT'?-1:1;
  test(`${side}: H1 меньше 0.02 не пробит; ровно 0.02 пробит`,async()=>{
    const data=transform([...hour(),candle(12,102,103,100.99,101.3),
      candle(13,101.3,103,100.98,101.2),candle(14,101.2,103,101.1,102)]);
    const ctx=await runDefault(data);
    assert.equal(values(ctx,'Stage')[12],1);
    assert.equal(values(ctx,'Direction')[12],0);
    assert.equal(values(ctx,'Stage')[13],2);
    assert.equal(values(ctx,'Direction')[13],direction);
    assert.equal(values(ctx,'Stage')[14],3);
    assert.equal(signalCount(ctx,side),0);
  });
  test(`${side}: H1 больше 0.02 пробит; касание границы не пробой`,async()=>{
    const ctx=await runDefault(transform([...hour(),candle(12,102,103,101,102),candle(13,102,103,100.97,101.1)]));
    assert.equal(values(ctx,'Stage')[12],1);
    assert.equal(values(ctx,'Stage')[13],2);
    assert.equal(values(ctx,'Direction')[13],direction);
  });
  test(`${side}: смена приоритета требует 0.02 за противоположной H1`,async()=>{
    const ctx=await runDefault(transform([...hour(),...structure(),candle(17,103,106.01,102,105.9),
      candle(18,105.9,106.02,104,106)]));
    assert.equal(values(ctx,'Direction')[17],direction);
    assert.equal(values(ctx,'Direction')[18],-direction);
    assert.equal(signalCount(ctx,side),0);
  });
}

for(const side of ['SHORT','LONG']) {
  test(`${side}: открытая M5 учитывает ровно 0.02, малый прокол не задаёт приоритет`,async()=>{
    const raw=[...hour(),candle(12,103,107,100,103),candle(13,102,103,100.99,101.3)];
    const data=side==='SHORT'?raw:mirror(raw);
    let tail={...data.at(-1)};
    const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.map(b=>({...b})),getSymbolInfo:async()=>null};
    const engine=new PineTS(provider,'SOLUSDT','5');
    const ctx=await engine.run(new Indicator(source));
    for(const [rawQuote,expectedDirection] of [[100.99,0],[100.98,side==='SHORT'?-1:1],[101.3,side==='SHORT'?-1:1]]){
      const quote=side==='SHORT'?rawQuote:207-rawQuote;
      tail={...tail,close:quote,low:Math.min(tail.low,quote),high:Math.max(tail.high,quote),closeTime:Date.now()+step};
      await engine.updateTail(ctx);
      assert.equal(ctx.plots.Direction.data.at(-1).value,expectedDirection);
      assert.equal(ctx.alerts.length,0);
    }
  });
}

for(const side of ['SHORT','LONG']) {
  test(`${side}: первая M5 с обоими пробоями игнорируется; выбор с15:05 без старой P1`,async()=>{
    const raw=[...hour(),candle(12,103,107,100,103),candle(13,102,104,100.5,101),candle(14,103,107,102,106)];
    const ctx=await runDefault(side==='SHORT'?raw:mirror(raw));
    const dir=side==='SHORT'?-1:1;
    assert.equal(values(ctx,'Stage')[12],1);
    assert.equal(values(ctx,'Direction')[12],0);
    assert.equal(values(ctx,'Stage')[13],2);
    assert.equal(values(ctx,'Direction')[13],dir);
    assert.equal(values(ctx,'Direction')[14],-dir);
    assert.equal(signalCount(ctx,side),0);
    assert.equal(signalCount(ctx,side==='SHORT'?'LONG':'SHORT'),0);
  });
  test(`${side}: все котировки первой M5 игнорируются, включая выход за обе H1`,async()=>{
    const raw=[...hour(),candle(12,102,103,100.5,100.8)];
    const data=side==='SHORT'?raw:mirror(raw);
    let tail={...data.at(-1)};
    const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.map(b=>({...b})),getSymbolInfo:async()=>null};
    const engine=new PineTS(provider,'SOLUSDT','5');
    const ctx=await engine.run(new Indicator(source));
    for(const p of [100,107,100.2]){
      const q=side==='SHORT'?p:207-p;
      tail={...tail,close:q,low:Math.min(tail.low,q),high:Math.max(tail.high,q),closeTime:Date.now()+step};
      await engine.updateTail(ctx);
      assert.equal(ctx.plots.Stage.data.at(-1).value,1);
      assert.equal(ctx.plots.Direction.data.at(-1).value,0);
      assert.equal(ctx.alerts.length,0);
    }
  });
}

test('MEXC15 октября: high первой M5 не задаёт LONG; одинаковые последующие high не образуют P3',async()=>{
  const raw=JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json',import.meta.url)));
  const from=Date.parse('2026-10-15T14:00:00+07:00'),until=Date.parse('2026-10-15T19:00:00+07:00');
  const data=raw.candles.filter(b=>b.time*1000>=from&&b.time*1000<until).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
  const ctx=await runDefault(data);
  const at=t=>(Date.parse(`2026-10-15T${t}:00+07:00`)-from)/step;
  assert.equal(values(ctx,'Stage')[at('15:00')],1);
  assert.equal(values(ctx,'Direction')[at('15:00')],0);
  assert.equal(values(ctx,'Direction')[at('15:30')],1);
  assert.equal(values(ctx,'Stage')[at('16:15')],4);
  assert.equal(signalCount(ctx,'LONG'),0);
});

for (const side of ['SHORT', 'LONG']) {
  test(`${side}: полночь отменяет план без входа до следующей H1`, async () => {
    const data = [...complete().slice(0, 18), candle(120, 100, 101.5, 99.1, 100.5)];
    const ctx = await run(side === 'SHORT' ? data : mirror(data));
    assert.equal(values(ctx, 'Stage').at(-1), 0);
    assert.equal(signalCount(ctx, side), 0);
    assert.equal(positionZones(ctx).length, 0);
    assert.equal(priceLabels(ctx).length, 0);
    assert.equal(lines(ctx).length, 0);
  });
}

for (const side of ['LONG','SHORT']) {
 test(`${side}: BAG2 MEXC14 октября отменяет недошедший сценарий`,async()=>{
  const raw=JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json',import.meta.url)));
  const from=Date.parse('2026-10-14T14:00:00+07:00'),until=Date.parse('2026-10-15T01:00:00+07:00');
  let data=raw.candles.filter(b=>b.time*1000>=from&&b.time*1000<until).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
  if(side==='SHORT')data=mirror(data);
  const ctx=await runDefault(data),at=t=>(Date.parse(`2026-10-14T${t}:00+07:00`)-from)/step;
  assert.equal(signalCount(ctx,'LONG')+signalCount(ctx,'SHORT'),0);
  assert.ok(values(ctx,'Stage').includes(7));
  assert.equal(positionZones(ctx).length,0);
  assert.equal(ctx.plots.__boxes__.data[0].value.filter(b=>b.text==='входа не было').length,1);
 });
}

test('день со состоявшимся входом не получает подпись без входов', async () => {
  const ctx = await run([...complete(), candle(120, 100, 101, 99, 100)]);
  assert.equal(signalCount(ctx), 1);
  assert.equal(ctx.plots.__boxes__.data[0].value.filter(b => b.text === 'входа не было').length, 0);
});

test('MEXC9 октября: без входа, после полуночи нет разметки сетапа', async () => {
  const raw = JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json', import.meta.url)));
  const from = Date.parse('2026-10-09T14:00:00+07:00');
  const until = Date.parse('2026-10-10T01:00:00+07:00');
  const data = raw.candles.filter(b => b.time * 1000 >= from && b.time * 1000 < until)
    .map(b => ({ openTime: b.time * 1000, closeTime: b.time * 1000 + step - 1,
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.vol }));
  const before = await runDefault(data.filter(b => b.openTime < Date.parse('2026-10-10T00:00:00+07:00') - step));
  assert.equal(signalCount(before, 'LONG') + signalCount(before, 'SHORT'), 0);
  const ctx = await runDefault(data);
  assert.equal(signalCount(ctx, 'LONG') + signalCount(ctx, 'SHORT'), 0);
  assert.equal(positionZones(ctx).length, 0);
  assert.equal(lines(ctx).length, 0);
  assert.equal(priceLabels(ctx).length, 0);
  assert.equal(ctx.plots.__boxes__.data[0].value.filter(b => b.border_style === 'style_dotted').length, 0);
  assert.equal(ctx.plots.__boxes__.data[0].value.filter(b => b.text === 'входа не было').length, 1);
});

test('MEXC5 октября: равные минимумы сбрасывают структуру; новая P1 17:10 и тейк', async () => {
  const raw = JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json', import.meta.url)));
  const from = Date.parse('2026-10-05T14:00:00+07:00');
  const until = Date.parse('2026-10-05T19:00:00+07:00');
  const data = raw.candles.filter(b => b.time * 1000 >= from && b.time * 1000 < until)
    .map(b => ({ openTime: b.time * 1000, closeTime: b.time * 1000 + step - 1,
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.vol }));
  const ctx = await runDefault(data);
  const at = t => (Date.parse(`2026-10-05T${t}:00+07:00`) - from) / step;
  assert.equal(values(ctx, 'Stage')[at('17:10')], 2);
  assert.equal(values(ctx, 'Stage')[at('17:15')], 3);
  const range = ctx.plots.__boxes__.data[0].value.find(b => b.border_style === 'style_dotted' && b.left === Date.parse('2026-10-05T17:10:00+07:00'));
  assert.ok(range);
  assert.equal(range.bottom, 120.46);
  assert.equal(range.top, 120.88);
  assert.equal(signalCount(ctx, 'SHORT'), 1);
  assert.equal(values(ctx, 'SHORT')[at('17:50')], 1);
  assert.ok(Math.abs(values(ctx, 'SHORT Entry')[at('17:50')] - 120.6975) < 1e-9);
  assert.ok(Math.abs(values(ctx, 'SHORT Stop')[at('17:50')] - 121.015) < 1e-9);
  assert.ok(Math.abs(values(ctx, 'SHORT Target')[at('17:50')] - 120.44) < 1e-9);
  assert.equal(values(ctx, 'Outcome')[at('18:00')], 1);
});

for (const initial of ['SHORT', 'LONG']) {
  test(`${initial}: пробой P2 после P3 разворачивает ожидающий план; вход на отдельном ретесте`, async () => {
    let data = [...complete().slice(0, 18), candle(18, 100, 104.5, 99.4, 104),
      candle(19, 103, 104, 101, 102), candle(20, 102, 105, 101, 104)];
    if (initial === 'LONG') data = mirror(data);
    const ctx = await runDefault(data);
    const side = initial === 'SHORT' ? 'LONG' : 'SHORT';
    const reflect = p => initial === 'SHORT' ? p : 207 - p;
    assert.equal(values(ctx, 'Stage')[18], 5);
    assert.equal(values(ctx, 'Direction')[18], initial === 'SHORT' ? 1 : -1);
    assert.equal(values(ctx, side)[18], 0, 'Нет входа на самой свече пробоя');
    assert.equal(values(ctx, side)[19], 1);
    assert.ok(Math.abs(values(ctx, `${side} Entry`)[19] - reflect(101.125)) < 1e-9);
    assert.ok(Math.abs(values(ctx, `${side} Stop`)[19] - reflect(97.72)) < 1e-9);
    assert.ok(Math.abs(values(ctx, `${side} Target`)[19] - reflect(104.47)) < 1e-9);
    assert.equal(values(ctx, 'Outcome')[20], 1);
  });
  test(`${initial}: одновременное продолжение P3 и пробой P2 на истории не выдумывает порядок`, async () => {
    let data = [...complete().slice(0, 18), candle(18, 100, 104.5, 98.5, 104)];
    if (initial === 'LONG') data = mirror(data);
    const ctx = await runDefault(data);
    assert.equal(values(ctx, 'Stage')[18], 7);
    assert.equal(signalCount(ctx, 'SHORT') + signalCount(ctx, 'LONG'), 0);
  });
}

test('MEXC4 сентября: пробой P2 отменяет ожидающий LONG, SHORT на ретесте и тейк', async () => {
  const raw = JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-04-01_2026-10-22.json', import.meta.url)));
  const from = Date.parse('2026-09-04T14:00:00+07:00');
  const until = Date.parse('2026-09-04T19:00:00+07:00');
  const data = raw.candles.filter(b => b.time * 1000 >= from && b.time * 1000 < until)
    .map(b => ({ openTime: b.time * 1000, closeTime: b.time * 1000 + step - 1,
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.vol }));
  const ctx = await runDefault(data);
  const at = t => (Date.parse(`2026-09-04T${t}:00+07:00`) - from) / step;
  assert.equal(signalCount(ctx, 'LONG'), 0);
  assert.equal(signalCount(ctx, 'SHORT'), 1);
  assert.equal(values(ctx, 'SHORT')[at('16:35')], 1);
  assert.ok(Math.abs(values(ctx, 'SHORT Entry')[at('16:35')] - 104.38625) < 1e-9);
  assert.ok(Math.abs(values(ctx, 'SHORT Stop')[at('16:35')] - 104.9025) < 1e-9);
  assert.ok(Math.abs(values(ctx, 'SHORT Target')[at('16:35')] - 103.93) < 1e-9);
  assert.equal(values(ctx, 'Outcome').at(-1), 1);
});

for (const side of ['SHORT', 'LONG']) {
  test(`${side}: v26 сохраняет v25 — свеча с обоими свингами может стать P1`, async () => {
    let data = complete().map((b, i) => i === 13 ? { ...b, high: 104 } : b);
    if (side === 'LONG') data = mirror(data);
    const ctx = await run(data);
    assert.equal(values(ctx, 'Stage')[14], 3);
  });
}

test('MEXC8 сентября: перенос P1 убирает старую Фибо0–1; LONG на раннем ретесте, затем стоп', async () => {
  const raw = JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-04-01_2026-10-22.json', import.meta.url)));
  const from = Date.parse('2026-09-08T14:00:00+07:00');
  const until = Date.parse('2026-09-08T18:30:00+07:00');
  const data = raw.candles.filter(b => b.time * 1000 >= from && b.time * 1000 < until)
    .map(b => ({ openTime: b.time * 1000, closeTime: b.time * 1000 + step - 1,
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.vol }));
  const ctx = await runDefault(data);
  const at = t => (Date.parse(`2026-09-08T${t}:00+07:00`) - from) / step;
  assert.equal(values(ctx, 'LONG Floor 0')[at('15:50')],102.44);
  assert.equal(values(ctx,'LONG Origin Guard')[at('15:50')],102.44);
  assert.ok(Number.isNaN(values(ctx, 'LONG Floor 0')[at('16:50')]));
  assert.equal(signalCount(ctx, 'LONG'), 1);
  assert.equal(signalCount(ctx, 'SHORT'), 0);
  assert.equal(values(ctx, 'LONG')[at('17:25')], 1);
  assert.ok(Math.abs(values(ctx, 'LONG Entry')[at('17:25')] - 103.73125) < 1e-9);
  assert.ok(Math.abs(values(ctx, 'LONG Stop')[at('17:25')] - 103.3825) < 1e-9);
  assert.ok(Math.abs(values(ctx, 'LONG Target')[at('17:25')] - 104.02) < 1e-9);
  assert.equal(values(ctx, 'Outcome')[at('17:40')], -1);
});

// v28: запрещённая соседняя пара — только источник разворота.
function adjacentReversalPattern() {
  return [...hour(),candle(12,102,103,100.5,101.5),
    candle(13,101,102,100,101),candle(14,101,104,100.6,103),
    candle(15,103,103.5,101.5,102),candle(16,102,103,99,100),
    candle(17,100,104.5,99.5,104),candle(18,104,104.2,101,102),
    candle(19,102,104.5,101.5,104)];
}
for (const initial of ['SHORT','LONG']) {
 const transform=d=>initial==='SHORT'?d:mirror(d);
 const opposite=initial==='SHORT'?'LONG':'SHORT';
 const reflect=p=>initial==='SHORT'?p:207-p;
 test(`${initial}: v30 соседняя пара даёт разворот со стопом за P3 и входом до отступов`,async()=>{
  const ctx=await runDefault(transform(adjacentReversalPattern()));
  assert.equal(values(ctx,'Stage')[15],3);
  assert.equal(values(ctx,initial)[16],0);
  assert.equal(values(ctx,'Direction')[17],initial==='SHORT'?1:-1);
  assert.equal(values(ctx,opposite)[17],0,'на свече разворота нет ретеста задним числом');
  assert.equal(values(ctx,opposite)[18],1);
  assert.equal(signalCount(ctx,initial),0);
  assert.ok(Math.abs(values(ctx,`${opposite} Entry`)[18]-reflect(101.75))<1e-9);
  assert.ok(Math.abs(values(ctx,`${opposite} Stop`)[18]-reflect(98.97))<1e-9);
  assert.ok(Math.abs(values(ctx,`${opposite} Target`)[18]-reflect(104.47))<1e-9);
  assert.equal(values(ctx,'Outcome')[19],1);
 });
 test(`${initial}: v28 без обновления первого экстремума соседняя пара не разворачивает`,async()=>{
  const d=adjacentReversalPattern().slice(0,18);d[16]=candle(16,102,103,100.2,102);d[17]=candle(17,102,104.5,100.5,104);
  const ctx=await runDefault(transform(d));
  assert.equal(signalCount(ctx,opposite),0);
  assert.equal(values(ctx,'Direction')[17],initial==='SHORT'?-1:1);
 });
 test(`${initial}: v28 одновременные новый P3 и пробой P2 не выдумывают порядок`,async()=>{
  const d=adjacentReversalPattern().slice(0,16);d.push(candle(16,102,104.5,99,103));
  const ctx=await runDefault(transform(d));assert.equal(values(ctx,'Stage')[16],3);assert.equal(signalCount(ctx),0);
 });
}

for(const initial of ['SHORT','LONG']) {
 const tr=d=>initial==='SHORT'?d:mirror(d);
 const side=initial==='SHORT'?'LONG':'SHORT';
 const price=p=>initial==='SHORT'?p:207-p;
 test(`${side}: v29 частичный ретест и продление цели сохраняют стоп за прежним P3`,async()=>{
  const d=[...adjacentReversalPattern().slice(0,18),candle(18,104,104.2,102,103),candle(19,103,106,102.5,105),candle(20,105,105.5,102.4,103),candle(21,103,106,102.8,105.99)];
  const ctx=await runDefault(tr(d));
  assert.equal(values(ctx,side)[18],0);
  assert.equal(values(ctx,side)[19],0);
  assert.equal(values(ctx,side)[20],1);
  assert.equal(values(ctx,'Fibo Reanchored')[20],0);
  assert.ok(Math.abs(values(ctx,`${side} Stop`)[20]-price(98.97))<1e-9);
  assert.ok(Math.abs(values(ctx,`${side} Entry`)[20]-price(102.5))<1e-9);
  assert.ok(Math.abs(values(ctx,`${side} Target`)[20]-price(105.97))<1e-9);
  assert.equal(values(ctx,'Outcome')[21],1);
 });
 test(`${side}: v30 разные отступы SL/TP не сдвигают вход`,async()=>{
  const d=tr(adjacentReversalPattern());const last=d.at(-1);const guard={...last,openTime:last.openTime+step,closeTime:last.closeTime+step};
  const ctx=await new PineTS([...d,guard],'SOLUSDT','5').run(new Indicator(source,{'Отступ стопа за Фибо (USDT)':0.02,'Отступ тейка перед целью (USDT)':0.07}));
  const e=values(ctx,`${side} Entry`)[18],sl=values(ctx,`${side} Stop`)[18],tp=values(ctx,`${side} Target`)[18];
  assert.ok(Math.abs(e-price(101.75))<1e-9);
  assert.ok(Math.abs((Math.abs(tp-e)/Math.abs(sl-e))-(2.68/2.77))<1e-9);
 });
}

for(const side of ['SHORT','LONG']) {
 const tr=d=>side==='SHORT'?d:mirror(d);
 test(`${side}: v31 ожидающий план отменён в00:00; утром нет входа; после новой15:00 поиск возобновлён`,async()=>{
  const next=complete().map(b=>({...b,openTime:b.openTime+86400000,closeTime:b.closeTime+86400000}));
  const prefix=[...complete().slice(0,18),candle(120,100,103,99.5,102),candle(275,102,103,100,102)];
  const ctx=await runDefault(tr([...prefix,...next]));
  assert.equal(values(ctx,'Stage')[18],0);
  assert.equal(values(ctx,'Stage')[19],0);
  assert.equal(values(ctx,side).slice(0,prefix.length+12).filter(Boolean).length,0);
  assert.equal(values(ctx,side)[prefix.length+19],1);
 });
 test(`${side}: v31 открытый вход ведётся через полночь; ночной стоп не даёт повторной попытки`,async()=>{
  const d=[...complete().slice(0,20),candle(120,102,103,100,102),candle(121,102,106,101,105),candle(122,105,106,100,101),candle(275,101,103,100,102)];
  const ctx=await runDefault(tr(d));
  assert.equal(values(ctx,side)[19],1);
  assert.equal(values(ctx,'Stage')[20],6);
  assert.equal(values(ctx,'Outcome')[20],0);
  assert.equal(values(ctx,'Outcome')[21],-1);
  assert.equal(signalCount(ctx,side),1);
  assert.equal(values(ctx,'Stage')[22],6);
 });
 test(`${side}: v31 открытый вход получает тейк после полуночи`,async()=>{
  const d=[...complete().slice(0,20),candle(120,102,103,98,99)];
  const ctx=await runDefault(tr(d));assert.equal(values(ctx,side)[19],1);assert.equal(values(ctx,'Outcome')[20],1);
 });
 test(`${side}: v31 живой переход буднего дня в00:00 запрещает ретест на старой23:55`,async()=>{
  const data=tr([...complete().slice(0,18),candle(119,100,101.5,99.1,100.5)]);let tail={...data.at(-1)};
  const provider={getMarketData:async(_t,_tf,_l,since)=>since!==undefined&&since>=tail.openTime?[{...tail}]:data.map(b=>({...b})),getSymbolInfo:async()=>null};
  try{
   mock.timers.setTime(tail.openTime+60000);const engine=new PineTS(provider,'SOLUSDT','5');const ctx=await engine.run(source);assert.equal(ctx.plots.Stage.data.at(-1).value,5);
   mock.timers.setTime(tail.openTime+step);const quote=side==='SHORT'?102.2:104.8;tail={...tail,high:Math.max(tail.high,quote),low:Math.min(tail.low,quote),close:quote,closeTime:Date.now()+step};await engine.updateTail(ctx);
   assert.equal(ctx.plots.Stage.data.at(-1).value,0);assert.equal(ctx.alerts.length,0);
  }finally{mock.timers.setTime(Date.parse('2026-10-20T12:00:00Z'));}
 });
}

test('MEXC1 октября: утреннийLONG12:55 по диапазону30 сентября запрещён',async()=>{
 const raw=JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-04-01_2026-10-22.json',import.meta.url)));
 const from=Date.parse('2026-09-30T14:00:00+07:00'),until=Date.parse('2026-10-01T13:20:00+07:00');
 const d=raw.candles.filter(b=>b.time*1000>=from&&b.time*1000<until).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
 const ctx=await runDefault(d);const at=(Date.parse('2026-10-01T12:55:00+07:00')-from)/step;
 assert.equal(values(ctx,'LONG')[at],0);
 assert.ok([0,6].includes(values(ctx,'Stage')[at]),'утром нет ожидающего сетапа; история либо открытая позиция допустимы');
 for(let i=0;i<d.length;i++)if(d[i].openTime>=Date.parse('2026-10-01T00:00:00+07:00')){assert.equal(values(ctx,'LONG')[i],0);assert.equal(values(ctx,'SHORT')[i],0);}
});

test('v32: LONG после SHORT освобождает Фибо от0 только при допустимой подтверждённой P2',async()=>{
 for(const low of [100.5,100,99.9]){
  const d=unbrokenShortToLong().slice(0,22);d[20]=candle(20,104,105,low,102);const ctx=await run(d);
  assert.equal(values(ctx,'LONG Floor 0')[19],100);
  assert.equal(values(ctx,'Direction')[21],1);
  if(low>=100){assert.equal(values(ctx,'Stage')[21],4);assert.ok(Number.isNaN(values(ctx,'LONG Floor 0')[21]));assert.equal(values(ctx,'LONG Origin Guard')[21],100);}
  else {assert.equal(values(ctx,'Stage')[21],2);assert.ok(Number.isNaN(values(ctx,'LONG Origin Guard')[21]));}
  assert.equal(signalCount(ctx,'LONG'),0);
 }
});
test('v32: замена LONG P1 не снимает проверку будущей P2 по прежнему SHORT минимуму',async()=>{
 const d=[...unbrokenShortToLong().slice(0,20),candle(20,104,110,102,109),candle(21,109,109,103,106),candle(22,105,105.5,99.9,100)];const ctx=await run(d);
 assert.equal(values(ctx,'LONG Origin Guard')[21],100);
 assert.ok(Number.isNaN(values(ctx,'LONG Floor 0')[21]));
 assert.equal(values(ctx,'Stage')[22],2);assert.equal(signalCount(ctx,'LONG'),0);
});
for(const side of ['LONG','SHORT']){
 test(`${side}: MEXC30 сентября новая структура1–2 после сменыH1, вход18:00, тейк19:25`,async()=>{
  const raw=JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-04-01_2026-10-22.json',import.meta.url)));const from=Date.parse('2026-09-30T14:00:00+07:00'),until=Date.parse('2026-09-30T19:40:00+07:00');
  let d=raw.candles.filter(b=>b.time*1000>=from&&b.time*1000<until).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
  if(side==='SHORT')d=mirror(d);const ctx=await runDefault(d);const at=t=>(Date.parse(`2026-09-30T${t}:00+07:00`)-from)/step;const price=p=>side==='LONG'?p:207-p;
  assert.equal(values(ctx,'Direction')[at('16:25')],side==='LONG'?1:-1);
  assert.equal(values(ctx,'Stage')[at('16:50')],4);
  assert.ok(Number.isNaN(values(ctx,'LONG Floor 0')[at('16:50')]));
  if(side==='LONG')assert.equal(values(ctx,'LONG Origin Guard')[at('16:50')],117.77);
  assert.equal(values(ctx,side)[at('17:30')],0);assert.equal(values(ctx,side)[at('18:00')],1);
  for(const [label,expected]of[['Entry',119.39],['Stop',118.88],['Target',119.84]])assert.ok(Math.abs(values(ctx,`${side} ${label}`)[at('18:00')]-price(expected))<1e-9);
  assert.equal(values(ctx,'Outcome')[at('19:25')],1);assert.equal(signalCount(ctx,side),1);
 });
}

for (const initial of ['LONG', 'SHORT']) {
 test(`${initial}: MEXC2 сентября стоп исключения даёт обратный вход на следующем ретесте`, async () => {
  const raw=JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json',import.meta.url)));
  const from=Date.parse('2026-09-02T14:00:00+07:00'),until=Date.parse('2026-09-02T17:00:00+07:00');
  const data=raw.candles.filter(b=>b.time*1000>=from&&b.time*1000<until).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
  const ctx=await runDefault(initial==='LONG'?data:mirror(data));
  const at=t=>data.findIndex(b=>b.openTime===Date.parse(`2026-09-02T${t}:00+07:00`));
  const opposite=initial==='LONG'?'SHORT':'LONG';
  assert.equal(values(ctx,initial)[at('16:15')],1);
  assert.equal(values(ctx,'Outcome')[at('16:20')],-1);
  assert.equal(values(ctx,opposite)[at('16:20')],0);
  assert.equal(values(ctx,opposite)[at('16:25')],1);
  assert.equal(values(ctx,'Tight Reversal')[at('16:25')],0);
  assert.equal(values(ctx,'Outcome')[at('16:35')],1);
  assert.equal(signalCount(ctx,initial)+signalCount(ctx,opposite),2);
 });
}

for (const side of ['LONG','SHORT']) {
 test(`${side}: BAG2 31 августа отменяет план18:15 после подтверждённого свинга`, async()=>{
  const raw=JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-08-23_2026-10-22.json',import.meta.url)));
  const from=Date.parse('2026-08-31T14:00:00+07:00'),until=Date.parse('2026-08-31T20:00:00+07:00');
  const data=raw.candles.filter(b=>b.time*1000>=from&&b.time*1000<until).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
  const ctx=await runDefault(side==='LONG'?data:mirror(data));
  const at=t=>data.findIndex(b=>b.openTime===Date.parse(`2026-08-31T${t}:00+07:00`));
  assert.equal(values(ctx,'Stage')[at('18:10')],5);
  assert.equal(values(ctx,'Stage')[at('18:15')],7);
  assert.equal(signalCount(ctx,'LONG')+signalCount(ctx,'SHORT'),0);
 });
 test(`${side}: BAG3 полноценная новая1–2 отменяет старую соседнюю пару20 августа`, async()=>{
  const raw=JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-01-01_2026-10-23.json',import.meta.url)));
  const from=Date.parse('2026-08-20T14:00:00+07:00'),until=Date.parse('2026-08-20T19:10:00+07:00');
  const data=raw.candles.filter(b=>b.time*1000>=from&&b.time*1000<until).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
  const ctx=await runDefault(side==='LONG'?data:mirror(data));
  const at=t=>data.findIndex(b=>b.openTime===Date.parse(`2026-08-20T${t}:00+07:00`));
  assert.equal(signalCount(ctx,side==='LONG'?'SHORT':'LONG'),0);
  assert.equal(values(ctx,side)[at('18:55')],1);
  assert.equal(values(ctx,'Outcome')[at('19:05')],-1);
 });
}

for (const side of ['LONG','SHORT']) {
 test(`${side}: BAG3 20 августа обычный стоп даёт обратный ретест, защищённый от BAG2`, async()=>{
  const raw=JSON.parse(readFileSync(new URL('../reports/mexc-sol-usdt-m5-2026-01-01_2026-10-23.json',import.meta.url)));
  const from=Date.parse('2026-08-20T14:00:00+07:00'),until=Date.parse('2026-08-20T23:55:00+07:00');
  const data=raw.candles.filter(b=>b.time*1000>=from&&b.time*1000<until).map(b=>({openTime:b.time*1000,closeTime:b.time*1000+step-1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.vol}));
  const ctx=await runDefault(side==='LONG'?data:mirror(data));
  const at=t=>data.findIndex(b=>b.openTime===Date.parse(`2026-08-20T${t}:00+07:00`));
  const opposite=side==='LONG'?'SHORT':'LONG',price=p=>side==='LONG'?p:207-p;
  assert.equal(values(ctx,opposite)[at('17:55')],0);
  assert.equal(values(ctx,side)[at('18:55')],1);
  assert.equal(values(ctx,'Outcome')[at('19:05')],-1);
  assert.equal(values(ctx,opposite)[at('19:05')],0);
  assert.equal(values(ctx,'After Stop Plan')[at('19:10')],1);
  assert.equal(values(ctx,'Stage')[at('19:45')],5);
  assert.equal(values(ctx,'Fibo Reanchored')[at('19:45')],0);
  assert.equal(values(ctx,opposite)[at('20:20')],1);
  for(const [field,expected] of [['Entry',87.45875],['Stop',88.4375],['Target',86.54]])
   assert.ok(Math.abs(values(ctx,`${opposite} ${field}`)[at('20:20')]-price(expected))<1e-9);
  assert.equal(values(ctx,'Outcome')[at('20:30')],1);
  assert.equal(signalCount(ctx,side),1);
  assert.equal(signalCount(ctx,opposite),1);
 });
}
