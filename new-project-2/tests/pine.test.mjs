import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

// Фиксированное время после всех исторических свечей: тесты независимы от часов машины.
mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-23T00:00:00Z') });

// Исполняется сам .pine, а не отдельная копия формул/алгоритма.
const module = await import(process.env.PINETS_MODULE || 'pinets');
const PineTS = module.PineTS || module.default;
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
async function run(data, timeframe = '5') {
  // PineTS помечает последний бар isrealtime даже в завершённом массиве.
  // Отдельный хвост оставляет все проверяемые свечи историческими.
  const last = data.at(-1);
  const guard = { ...last, openTime: last.openTime + step, closeTime: last.closeTime + step };
  return new PineTS([...data, guard], 'SOLUSDT', timeframe).run(source);
}
function values(ctx, name) { return ctx.plots[name].data.slice(0, -1).map(p => p.value); }
function signalCount(ctx) { return values(ctx, 'SHORT').filter(Boolean).length; }

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

test('обновления открытой M5: новый low, ретест вверх без закрытия, фиксация без повторов', async () => {
  const data = [...hour(), ...structure(), candle(17, 102, 103, 99, 100)];
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
  for (const [quote, expectedStage] of [[98, 5], [100, 5], [101.5, 6], [97, 6], [103, 6]]) {
    tail = { ...tail, close: quote, high: Math.max(tail.high, quote), low: Math.min(tail.low, quote),
      // В течение теста свеча открыта, даже если остальные данные исторические.
      closeTime: Date.now() + step };
    assert.equal(await engine.updateTail(ctx), true);
    assert.equal(last('Stage'), expectedStage);
    assert.equal(last('SHORT Entry'), 101.5);
    assert.equal(last('SHORT Stop'), 105);
    assert.equal(last('SHORT Target'), 98);
  }
  assert.equal(ctx.alerts.length, 1);
  assert.equal(ctx.alerts[0].title, 'SHORT');
});
