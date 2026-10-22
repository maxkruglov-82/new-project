import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

// Фиксированное время после всех исторических свечей: тесты независимы от часов машины.
mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-23T00:00:00Z') });

// Исполняется сам .pine, а не отдельная копия формул/алгоритма.
const module = await import(process.env.PINETS_MODULE || 'pinets');
const PineTS = module.PineTS || module.default;
const Indicator = module.Indicator || (await import(new URL('./Indicator/Indicator.class.ts', process.env.PINETS_MODULE))).Indicator;
const source = readFileSync(new URL('../sol_short_setup.pine', import.meta.url), 'utf8');

test('файл для загрузки совпадает с исполняемым исходником', () => {
  assert.equal(readFileSync(new URL('../sol_short_setup.txt', import.meta.url), 'utf8'), source);
});
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
async function run(data, timeframe = '5', inputs = {}) {
  // PineTS помечает последний бар isrealtime даже в завершённом массиве.
  // Отдельный хвост оставляет все проверяемые свечи историческими.
  const last = data.at(-1);
  const guard = { ...last, openTime: last.openTime + step, closeTime: last.closeTime + step };
  const script = Object.keys(inputs).length ? new Indicator(source, inputs) : source;
  return new PineTS([...data, guard], 'SOLUSDT', timeframe).run(script);
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
  assert.deepEqual(values(ctx, 'Stage').slice(12), [2, 2, 3, 3, 4, 5, 5, 6, 6, 6]);
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
    candle(18, 103, 104.5, 98, 102),
    candle(19, 103, 104, 97, 102)];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage').at(-1), 5);
  assert.equal(values(ctx, 'SHORT Stop').at(-1), 105);
});

test('обновление максимума H1 отменяет сценарий до входа', async () => {
  const data = complete();
  data[18] = candle(18, 100, 106.1, 99.4, 101);
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

test('ретест на последней свече перед новой H1 сохраняет цены старого сигнала', async () => {
  const data = [...complete().slice(0, 18),
    ...Array.from({ length: 12 }, (_, i) => candle(i, 100.5, i === 11 ? 102.1 : 101.5, 100, 101, 1))];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage').at(-1), 1);
  assert.equal(values(ctx, 'H1 High').at(-1), 102.1);
  assert.equal(values(ctx, 'SHORT Entry').at(-1), 102);
  assert.equal(values(ctx, 'SHORT Stop').at(-1), 105);
  assert.equal(values(ctx, 'SHORT Target').at(-1), 99);
  assert.equal(signalCount(ctx), 1);
});

test('неправильный таймфрейм вызывает понятную ошибку', async () => {
  await assert.rejects(run(hour(), '60'), /5 минут/);
});

test('LONG: верхний свинг 107, нижний 103, цель 108, стоп 102 и вход 105', async () => {
  const ctx = await run(mirror(complete()));
  assert.deepEqual(values(ctx, 'Stage').slice(12), [2, 2, 3, 3, 4, 5, 5, 6, 6, 6]);
  assert.equal(values(ctx, 'Direction')[12], 1);
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
      candle(18, 103, 104.5, 98, 102), candle(19, 103, 104, 97, 102)], 5],
  ['свеча с обоими пробоями H1 не позволяет угадать новую сторону', () => {
    const data = complete();
    data[18] = candle(18, 100, 106.1, 99.4, 101);
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

test('выход вверх и вниз на первой исторической M5 не позволяет угадать приоритет', async () => {
  const ctx = await run([...hour(), candle(12, 103, 107, 100, 104), ...complete().slice(13)]);
  assert.equal(values(ctx, 'Stage')[12], 7);
  assert.equal(values(ctx, 'Direction')[12], 0);
  assert.equal(signalCount(ctx), 0);
  assert.equal(signalCount(ctx, 'LONG'), 0);
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

test('обновление точки 2 отменяет LONG только при фактическом пробое нижней H1', async () => {
  const data = annotatedLongExample();
  data[17] = { ...data[17], low: 105.89 };
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
  assert.equal(values(ctx, 'Direction')[12], 1);
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
    data[18] = candle(18, 100, 106.1, 99.4, 101);
    const ctx = await run(transform(data));
    assert.equal(values(ctx, 'Stage')[18], 7);
    assert.equal(positionZones(ctx).length, 2);
    assert.equal(priceLabels(ctx).length, 3);
    assert.ok(priceLabels(ctx).some(l => l.text.includes('Отмена · Без входа')));
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

test('истечение ожидающего плана сохраняет историю с пометкой Без входа', async () => {
  const ctx = await run([...complete().slice(0, 18), candle(12, 100, 101.5, 99.1, 100.5, 1)]);
  assert.equal(values(ctx, 'Stage').at(-1), 0);
  assert.equal(positionZones(ctx).length, 2);
  assert.equal(priceLabels(ctx).length, 3);
  assert.ok(priceLabels(ctx).some(l => l.text.includes('Истёк · Без входа')));
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

test('LONG на границе новой H1 сохраняет цены и метку после сброса направления', async () => {
  const data = [...complete().slice(0, 18),
    ...Array.from({ length: 12 }, (_, i) => candle(i, 100.5, i === 11 ? 102.1 : 101.5, 100, 101, 1))];
  const ctx = await run(mirror(data));
  assert.equal(values(ctx, 'Stage').at(-1), 1);
  assert.equal(values(ctx, 'Direction').at(-1), 0);
  assert.equal(values(ctx, 'LONG Entry').at(-1), 105);
  assert.equal(values(ctx, 'LONG Stop').at(-1), 102);
  assert.equal(values(ctx, 'LONG Target').at(-1), 108);
  assert.equal(signalCount(ctx, 'LONG'), 1);
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
  const script = new Indicator(source, { 'История: опорных дней': 2 });
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

test('заменённый без входа план остаётся для разбора и не получает метку сделки', async () => {
  const data = [...complete().slice(0, 18),
    ...Array.from({ length: 12 }, (_, i) => candle(i, 100.5, 101.5, 100, 101, 1))];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Stage').at(-1), 1);
  assert.equal(positionZones(ctx).length, 2);
  assert.equal(lines(ctx).length, 8);
  assert.ok(priceLabels(ctx).some(l => l.text.startsWith('Без входа')));
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
  const ctx = await engine.run(source);
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
    ...complete().slice(12).map((b, i) => ({ ...b,
      openTime: start + (21 + i) * step, closeTime: start + (22 + i) * step - 1 }))];
}
for (const side of ['SHORT', 'LONG']) {
  const transform = data => side === 'SHORT' ? data : mirror(data);
  const opposite = side === 'SHORT' ? 'LONG' : 'SHORT';

  test(`${side}: противоположный пробой до входа запускает новый P1 под той же H1`, async () => {
    const ctx = await run(transform(reversalToShort()));
    assert.equal(values(ctx, 'Stage')[15], 2);
    assert.equal(values(ctx, 'Direction')[15], side === 'SHORT' ? -1 : 1);
    assert.equal(values(ctx, 'Stage')[17], 3);
    assert.equal(values(ctx, 'Stage')[19], 4);
    assert.equal(values(ctx, 'Stage')[20], 5);
    assert.equal(values(ctx, 'Stage')[22], 6);
    assert.equal(signalCount(ctx, side), 1);
    assert.equal(signalCount(ctx, opposite), 0);
    assert.equal(values(ctx, `${side} Entry`)[22], side === 'SHORT' ? 102 : 105);
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

  test(`${side}: после стопа разрешён новый полноценный сетап в том же диапазоне`, async () => {
    const ctx = await run(transform(stoppedThenRetry()));
    assert.equal(values(ctx, 'Outcome')[20], -1);
    assert.equal(values(ctx, 'Stage')[21], 2);
    assert.equal(values(ctx, 'Outcome')[21], 0);
    assert.equal(signalCount(ctx, side), 2);
    assert.equal(signalCount(ctx, opposite), 0);
    assert.equal(lines(ctx).length, 16);
    assert.equal(positionZones(ctx).length, 4);
    assert.equal(priceLabels(ctx).length, 6);
    assert.deepEqual(lines(ctx).filter(l => l.width === 2).map(l => l.y1),
      side === 'SHORT' ? [102, 105, 99, 102, 105, 99] : [105, 102, 108, 105, 102, 108]);
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

  test(`${side}: TP/SL на историческом баре входа не приписывается движению после входа`, async () => {
    const data = complete().slice(0, 20);
    data[19] = candle(19, 101, 105.5, 99.1, 102);
    const ctx = await run(transform(data));
    assert.equal(signalCount(ctx, side), 1);
    assert.equal(values(ctx, 'Outcome')[19], 0);
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

test('двойная смена приоритета SHORT → LONG → SHORT до входа', async () => {
  const data = [...hour(), ...structure(),
    candle(17, 103, 107, 102, 106.5), candle(18, 106.5, 108, 104, 107),
    candle(19, 107, 107.5, 103, 104), candle(20, 104, 104.5, 100, 101),
    candle(21, 101, 102, 99, 100), candle(22, 100, 103, 100, 102),
    candle(23, 102, 104, 100.5, 103), candle(24, 103, 103.5, 101, 102),
    candle(25, 102, 103, 98, 99), candle(26, 99, 101, 98.5, 100),
    candle(27, 100, 102, 99, 101.8)];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Direction')[17], 1);
  assert.equal(values(ctx, 'Direction')[20], -1);
  assert.equal(values(ctx, 'Stage')[20], 2);
  assert.equal(signalCount(ctx), 1);
  assert.equal(signalCount(ctx, 'LONG'), 0);
  assert.equal(values(ctx, 'SHORT Entry')[27], 101.625);
});

test('смена стороны архивирует старый ожидающий план целиком, не подменяя его цены', async () => {
  const data = [...complete().slice(0, 18), candle(18, 102, 106.5, 101.5, 106.2),
    ...mirror(complete().slice(13)).map((b, i) => ({ ...b,
      openTime: start + (19 + i) * step, closeTime: start + (20 + i) * step - 1 }))];
  const ctx = await run(data);
  assert.equal(values(ctx, 'Direction')[18], 1);
  assert.equal(values(ctx, 'Stage')[18], 2);
  assert.equal(signalCount(ctx), 0);
  assert.equal(signalCount(ctx, 'LONG'), 1);
  assert.equal(lines(ctx).length, 16);
  assert.deepEqual(lines(ctx).slice(0, 8).filter(l => l.width === 2).map(l => l.y1), [102, 105, 99]);
  assert.ok(priceLabels(ctx).some(l => l.text.startsWith('Отмена · Без входа')));
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
    const ctx = await engine.run(source);
    const last = name => ctx.plots[name].data.at(-1).value;
    for (const [quote, direction] of [[107, 1], [105, 1], [100, -1], [102, -1]]) {
      const p = reflect(quote);
      tail = { ...tail, close: p, high: Math.max(tail.high, p), low: Math.min(tail.low, p), closeTime: Date.now() + step };
      await engine.updateTail(ctx);
      assert.equal(last('Direction'), side === 'SHORT' ? direction : -direction);
      assert.equal(last('Stage'), 2);
      assert.equal(ctx.alerts.length, 0);
      assert.equal(lines(ctx).length, 8);
      assert.equal(positionZones(ctx).length, 2);
      assert.ok(priceLabels(ctx).some(l => l.text.startsWith('Отмена · Без входа')));
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
    const ctx = await engine.run(source);
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
    const next = mirror(complete().slice(12)).map((b, i) => ({ ...b,
      openTime: start + (21 + i) * step, closeTime: start + (22 + i) * step - 1 }));
    const raw = [...complete().slice(0, 20), candle(20, 102, 105.2, 101.5, 104), ...next];
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
    candle(15, 103, 103, 100.8, 102)]; // P2 подтвердился: пару отбрасываем.
}
for (const side of ['SHORT', 'LONG']) {
  const transform = data => side === 'SHORT' ? data : mirror(data);
  const reflect = price => side === 'SHORT' ? price : 207 - price;
  test(`${side}: соседние P1/P2 отбрасываются целиком, новый первый свинг создаёт новый диапазон`, async () => {
    const prefix = await run(transform(adjacentPairPrefix()));
    assert.equal(values(prefix, 'Stage')[15], 2);
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
  assert.equal(values(ctx, 'Stage')[14], 2); // 15:10 — подтверждение соседней P2 и отказ.
  assert.equal(signalCount(ctx), 0);
  assert.equal(signalCount(ctx, 'LONG'), 0);
  const m5 = ctx.plots.__boxes__.data[0].value.filter(b => b.border_style === 'style_dotted');
  assert.equal(m5.length, 1);
  assert.equal(m5[0].left, Date.parse('2026-08-24T15:25:00+07:00'));
  assert.equal(m5[0].bottom, 93.21);
  assert.equal(m5[0].top, 94.08);
});
