import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { execute, observe, sha256 } from '../backtest/run.mjs';

const source = readFileSync(new URL('../sol_short_setup.pine', import.meta.url), 'utf8');
const start = Date.parse('2026-10-20T14:00:00+07:00'), step = 300_000;
const c = (i, open, high, low, close) => ({ time: (start + i * step) / 1000, open, high, low, close, vol: 100 });
function entered() {
  return [...Array.from({ length: 12 }, (_, i) => c(i, 104, 106, 101, 103)),
    c(12, 102, 103, 100.5, 101.5), c(13, 101, 102, 100, 101), c(14, 101, 102.5, 100.6, 102),
    c(15, 102, 104, 101, 103), c(16, 103, 103.5, 101.5, 102), c(17, 102, 103, 99, 100),
    c(18, 100, 101.8, 99.4, 101), c(19, 101, 102.2, 100, 102)];
}
function raw(candles) { return { interval: 'Min5', symbol: 'SOL_USDT', candles }; }
const run = bars => execute(source, raw(bars), start, start + bars.length * step);

test('наблюдения не меняют исходный файл и контролируют единственность точек вставки', () => {
  const hash = sha256(source);
  const instrumented = observe(source);
  assert.equal(sha256(readFileSync(new URL('../sol_short_setup.pine', import.meta.url))), hash);
  assert.match(instrumented, /BT Result/);
  assert.throws(() => observe(source.replace('outcomeBar := bar_index', 'outcomeBar := time')), /anchor changed/);
});

test('журнал реального Pine: один SHORT, точные E/S/T, цель и фактический R', async () => {
  const { summary, trades } = await run([...entered(), c(20, 102, 103, 98, 99)]);
  assert.equal(summary.enteredTrades, 1);
  assert.equal(summary.targets, 1);
  assert.equal(summary.totalTrades, 1);
  assert.equal(summary.stops, 0);
  assert.ok(Math.abs(summary.netRKnownBeforeCosts - 2.97/3.03) < 1e-9);
  assert.equal(trades[0].entry, 102);
  assert.equal(trades[0].stop, 105.03);
  assert.equal(trades[0].target, 99.03);
  assert.equal(trades[0].entryBarStart, '2026-10-20T15:35:00.000+07:00');
  assert.equal(trades[0].exitBarStart, '2026-10-20T15:40:00.000+07:00');
});

test('после стопа журнал сохраняет обе сделки и противоположную новую сторону', async () => {
  const { summary, trades } = await run([...entered(),c(20,102,105.2,101.5,104),
    c(21,104,104.2,102,103),c(22,103,103.5,101.4,102),c(23,102,105.3,102,105)]);
  assert.equal(summary.enteredTrades, 2);
  assert.equal(summary.totalTrades, 2);
  assert.equal(summary.targets, 1);
  assert.equal(summary.stops, 1);
  assert.ok(Math.abs(summary.netRKnownBeforeCosts - (3.695/3.755 - 1)) < 1e-9);
  assert.deepEqual(trades.map(t => [t.side, t.status]), [['SHORT', 'stop'], ['LONG', 'target']]);
});

test('неизвестный порядок TP/SL не записывается ни в победы, ни в стопы', async () => {
  const { summary, trades } = await run([...entered(), c(20, 102, 106, 98, 103)]);
  assert.equal(summary.ambiguous, 1);
  assert.equal(summary.totalTrades, 0);
  assert.equal(summary.targets, 0);
  assert.equal(summary.stops, 0);
  assert.equal(summary.winRateKnown, null);
  assert.equal(trades[0].r, null);
});

function throughNextHour() {
  return [...entered(), ...Array.from({ length: 280 }, (_, i) => c(i + 20, 102, 103, 101, 102))];
}
test('смена H1 не превращает незавершённый вход в фиктивное закрытие', async () => {
  const { summary, trades } = await run(throughNextHour());
  assert.equal(summary.referenceDays, 1);
  assert.equal(summary.unresolved, 1);
  assert.equal(summary.totalTrades, 0);
  assert.equal(summary.targets + summary.stops, 0);
  assert.equal(trades[0].status, 'unresolved_at_new_h1');
  assert.equal(trades[0].exitPrice, null);
  assert.equal(trades[0].exitBarEnd, '2026-10-21T15:00:00.000+07:00');
});

test('TP на последнем баре перед новой H1 не теряется при сбросе Outcome', async () => {
  const bars = throughNextHour();
  bars[299] = c(299, 102, 103, 98, 99);
  const { summary, trades } = await run(bars);
  assert.equal(summary.targets, 1);
  assert.equal(summary.unresolved, 0);
  assert.equal(trades[0].exitBarEnd, '2026-10-21T15:00:00.000+07:00');
});

test('пропущенная M5 и недопустимый OHLC останавливают бэктест', async () => {
  const missing = entered(); missing.splice(13, 1);
  await assert.rejects(run(missing), /Gap or duplicate/);
  const wrong = entered(); wrong[13].low = 110;
  await assert.rejects(run(wrong), /Invalid OHLC/);
});

for (const [day, days] of [['суббота', -3], ['воскресенье', -2]]) {
  test(`${day}: журнал исключает выходной из сделок и числа торговых дней`, async () => {
    const delta = days * 86400000;
    const bars = [...entered(), c(20, 102, 103, 98, 99)].map(b => ({ ...b, time: b.time + delta / 1000 }));
    const { summary, days: referenceDays, trades } = await execute(source, raw(bars), start + delta, start + delta + bars.length * step);
    assert.equal(summary.calendarReferenceDays, 1);
    assert.equal(summary.excludedWeekendDays, 1);
    assert.equal(summary.referenceDays, 0);
    assert.equal(summary.enteredTrades, 0);
    assert.equal(summary.winRateKnown, null);
    assert.deepEqual(referenceDays, []);
    assert.deepEqual(trades, []);
  });
}
