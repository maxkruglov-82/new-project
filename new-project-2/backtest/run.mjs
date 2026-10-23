import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STEP = 300_000;
const DAY = 86_400_000;
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const iso = ms => new Date(ms + 7 * 3_600_000).toISOString().replace('Z', '+07:00');
const referenceDate = ms => iso(ms).slice(0, 10);
const isWeekend = ms => [0, 6].includes(new Date(ms + 7 * 3_600_000).getUTCDay());

// Only observation is inserted. No strategy decision, price, or state assignment
// is changed; the exact original file and SHA-256 are recorded in the report.
export function observe(source) {
  function insert(needle, extra) {
    if (source.split(needle).length !== 2) throw new Error(`Observation anchor changed: ${needle}`);
    source = source.replace(needle, needle + extra);
  }
  insert('float eventTarget = na', '\nbool btResolved = false\nfloat btResult = na\nint btReference = na\nint btEndingStage = na');
  insert('        outcomeBar := bar_index', '\n        btResolved := true\n        btResult := outcome');
  insert('        publishedDay := dayKey', '\n        btReference := timestamp(tz, yy, mm, dd, 15, 0)\n        btEndingStage := stage');
  source += `\n// Backtest observation only.\nplot(shortEvent ? -1 : longEvent ? 1 : 0, "BT Signal", display=display.none)\nplot(btResolved ? btResult : na, "BT Result", display=display.none)\nplot(btReference, "BT Reference", display=display.none)\nplot(btEndingStage, "BT Ending Stage", display=display.none)\nplot(stopFibo, "BT Fibo Stop", display=display.none)\n`;
  return source;
}

export async function execute(source, raw, start, end) {
  const module = await import(process.env.PINETS_MODULE || 'pinets');
  const PineTS = module.PineTS || module.default;
  const Indicator = module.Indicator || (await import(new URL('./Indicator/Indicator.class.ts', process.env.PINETS_MODULE))).Indicator;
  if (raw.interval !== 'Min5' || raw.symbol !== 'SOL_USDT') throw new Error('Expected SOL_USDT Min5 futures data');
  const candles = raw.candles.map(b => ({ openTime: b.time * 1000, closeTime: b.time * 1000 + STEP - 1,
    open: b.open, high: b.high, low: b.low, close: b.close, volume: b.vol }));
  const expected = (end - start) / STEP;
  if (candles.length !== expected) throw new Error('Incomplete input length');
  candles.forEach((b, i) => {
    if (b.openTime !== start + i * STEP) throw new Error(`Gap or duplicate at ${i}`);
    if (!(0 < b.low && b.low <= Math.min(b.open, b.close) && b.high >= Math.max(b.open, b.close))) throw new Error('Invalid OHLC');
  });
  const last = candles.at(-1);
  // PineTS treats its tail as realtime. A separate, excluded tail leaves the
  // entire observed period historical; no fabricated candle enters the ledger.
  const guard = { ...last, openTime: end, closeTime: end + STEP - 1 };
  const script = new Indicator(observe(source), {
    'Показывать Фибоначчи': false, 'Показывать линии входа, стопа и цели': false,
    'Показывать зоны позиции': false, 'Показывать SHORT и LONG': false,
    'История: опорных дней': 1, 'История до (0 — правый край экрана)': end - 1,
  });
  const ctx = await new PineTS([...candles, guard], 'SOLUSDT', '5').run(script);
  const value = (name, i) => ctx.plots[name].data[i].value;
  const trades = [], days = [];
  let active = null, currentDay = null, calendarReferenceDays = 0;
  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];
    const result = value('BT Result', i);
    if (Number.isFinite(result)) {
      if (!active) throw new Error(`Outcome without a trade: ${iso(bar.openTime)}`);
      active.status = result === 1 ? 'target' : result === -1 ? 'stop' : 'ambiguous';
      active.exitBarStart = iso(bar.openTime);
      active.exitBarEnd = iso(bar.closeTime + 1);
      active.exitPrice = result === 1 ? active.target : result === -1 ? active.stop : null;
      active.r = result === 1 ? active.rewardRisk : result === -1 ? -1 : null;
      active = null;
    }
    const signal = value('BT Signal', i);
    if (signal !== 0) {
      if (isWeekend(bar.openTime)) throw new Error('Weekend entry is forbidden');
      if (!currentDay) throw new Error('Entry without a reference H1');
      if (active) throw new Error('Parallel entries are not permitted');
      const side = signal === -1 ? 'SHORT' : 'LONG';
      active = { id: trades.length + 1, referenceDate: currentDay.date, side,
        entryBarStart: iso(bar.openTime), entryBarEnd: iso(bar.closeTime + 1),
        fiboStop: value('BT Fibo Stop', i), swingTarget: value('Swing Target', i), entry: value(`${side} Entry`, i), stop: value(`${side} Stop`, i), target: value(`${side} Target`, i),
        status: 'open', exitBarStart: null, exitBarEnd: null, exitPrice: null, r: null };
      if (![active.entry, active.stop, active.target].every(Number.isFinite)) throw new Error('Missing signal prices');
      if (!Number.isFinite(active.fiboStop) || Math.abs((active.fiboStop + active.swingTarget) / 2 - active.entry) > 1e-8) throw new Error('Base Fibo RR is not 1:1');
      active.rewardRisk = Math.abs(active.target - active.entry) / Math.abs(active.stop - active.entry);
      if (currentDay.won) throw new Error('New entry after successful target under the same H1');
      trades.push(active);
    }
    if (result === 1 && currentDay) currentDay.won = true;
    const nextReference = value('BT Reference', i);
    if (Number.isFinite(nextReference)) {
      // Reference publication cancels the old state in the indicator. Do not manufacture
      // a market close, profit, or loss for an unresolved trade at that boundary.
      if (active) {
        active.status = 'unresolved_at_new_h1';
        active.exitBarEnd = iso(nextReference);
        active = null;
      }
      if (currentDay) currentDay.endingStage = value('BT Ending Stage', i);
      currentDay = null;
      if (nextReference < end) calendarReferenceDays++;
      if (nextReference < end && !isWeekend(nextReference)) {
        currentDay = { date: referenceDate(nextReference), referenceClose: iso(nextReference),
          high: value('H1 High', i), low: value('H1 Low', i), won: false, endingStage: null };
        days.push(currentDay);
      }
    }
  }
  if (active) active.status = 'unresolved_at_end';
  for (const day of days) {
    const own = trades.filter(t => t.referenceDate === day.date);
    Object.assign(day, { trades: own.length, targets: own.filter(t => t.status === 'target').length,
      stops: own.filter(t => t.status === 'stop').length, ambiguous: own.filter(t => t.status === 'ambiguous').length,
      unresolved: own.filter(t => t.status.startsWith('unresolved')).length });
    if (day.targets > 1) throw new Error('More than one target per reference H1');
    delete day.won;
  }
  const targets = trades.filter(t => t.status === 'target').length;
  const stops = trades.filter(t => t.status === 'stop').length;
  const ambiguous = trades.filter(t => t.status === 'ambiguous').length;
  const unresolved = trades.filter(t => t.status.startsWith('unresolved')).length;
  if (targets + stops + ambiguous + unresolved !== trades.length) throw new Error('Ledger does not reconcile');
  return { summary: { calendarReferenceDays, excludedWeekendDays: calendarReferenceDays - days.length, referenceDays: days.length, enteredTrades: trades.length, targets, stops, ambiguous, unresolved,
    totalTrades: targets + stops, knownOutcomes: targets + stops, winRateKnown: targets + stops ? targets / (targets + stops) : null,
    daysWithEntry: days.filter(d => d.trades > 0).length, daysWithoutEntry: days.filter(d => d.trades === 0).length,
    daysWithTarget: days.filter(d => d.targets > 0).length,
    daysWithStopsAndNoTarget: days.filter(d => d.stops > 0 && d.targets === 0).length,
    netRKnownBeforeCosts: trades.reduce((sum, t) => sum + (t.r ?? 0), 0) }, days, trades };
}

const escapeCsv = v => v === null || v === undefined ? '' : /[,"\n]/.test(String(v)) ? '"' + String(v).replaceAll('"', '""') + '"' : String(v);
function csv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  return '\uFEFF' + [keys.join(','), ...rows.map(row => keys.map(k => escapeCsv(row[k])).join(','))].join('\n') + '\n';
}

async function main() {
  const [input, prefix] = process.argv.slice(2);
  if (!input || !prefix) throw new Error('Usage: node backtest/run.mjs candles.json output-prefix');
  const bytes = readFileSync(input), raw = JSON.parse(bytes);
  const source = readFileSync(new URL('../sol_short_setup.pine', import.meta.url), 'utf8');
  const start = Date.parse(raw.start), end = Date.parse(raw.endExclusive);
  const report = await execute(source, raw, start, end);
  if (report.summary.calendarReferenceDays !== Math.round((end - start - 3_600_000) / DAY)) throw new Error('Missing reference H1 periods');
  const version = source.match(/indicator\("([^"]+)"/)?.[1];
  const scriptVersion = version?.includes('черновик') ? version : version?.match(/v\d+$/)?.[0] || 'current';
  const result = { strategy: version, sourceSha256: sha256(source), inputSha256: sha256(bytes),
    generatedAt: new Date().toISOString(), market: 'MEXC SOL_USDT USDT perpetual futures',
    period: { candlesStart: raw.start, endExclusive: raw.endExclusive, timezone: 'Asia/Krasnoyarsk',
      windowFirstReference: referenceDate(start), windowLastReference: referenceDate(end - DAY),
      firstReference: report.days[0]?.date ?? null, lastReference: report.days.at(-1)?.date ?? null },
    dataQuality: { candles: raw.count, missing: 0, incompleteReferenceHours: 0 },
    method: { execution: `Actual ${scriptVersion} Pine source in PineTS 0.12.0, observation plots only`,
      renewedLongP1: 'If LONG P1 is replaced by a higher confirmed swing while waiting for valid P2, clear saved floor 0 and use the new 1–2 structure; ordinary 2–3 reanchoring is then allowed. Entry and SL/TP offsets remain unchanged.',
      p2Reversal: 'Before entry, a P2 break after P3 reverses the pending setup using former P2/P3 Fibo anchors; wait for a separate retest. It overrides the H1 priority lock. Existing positions are unchanged. Simultaneous new P3 and P2 break on historical M5 cancels the setup because order is unknown. The dual-pivot exclusion is not enabled.',
      equalShortLows: 'After a distinct confirmed return to P1 at the same low, its next strict break resets the SHORT structure. Wait for a new confirmed lower P1 and a new P2; do not seed P3 from the old pair.',
      firstM5: 'Ignore the 15:00–15:05 bar entirely for H1 priority selection (including large or dual-edge exits); choose priority from 15:05 onward. It cannot seed P1 retroactively. The inclusive 0.02 H1 threshold is unchanged.',
      h1BreakThreshold: 'Price must exceed the H1 edge by at least 0.02 USDT (inclusive); applies to initial priority, first H1 reversal and P1 qualification. P3/M5 breaks and saved LONG origin retain strict prior rules.',
      takeBuffer: 'Take profit is 0.03 USDT before raw swing P3 (SHORT above, LONG below); entry stays the midpoint of base Fibo stop and raw swing target. Only profitable take levels permit entry.',
      priorityLock: 'Record initial direction for the H1; first opposite priority locks until new H1, including retries after stops; ignore later H1 edge breaks, except pending structural P2 reversal. A broken saved LONG origin cancels its candidate but preserves locked LONG.',
      calendar: 'No Saturday/Sunday references or entries in Asia/Krasnoyarsk; weekday entries have no 20:30 cutoff; existing trades retain their exit tracking',
      resolution: '5 minute OHLC; intrabar order unknown', entry: `${scriptVersion} retest touch; skip new-extreme historical bar`,
      swingPair: 'Keep P1 while skipping adjacent opposite pivot; trail P1 deeper until a separate P2; plateau pivots use their last equal-extreme bar for adjacency',
      longReversal: 'After a confirmed SHORT lower swing without a P1 break, retain its low as floor 0 for LONG even before its upper P2 confirms; preserve upper P1, skip adjacent low, wait for deeper P2',
      confirmingBarBreakout: 'Retain P3 extreme on the bar confirming P2; no retroactive entry on that bar',
      fiboReanchor: 'After a separate partial retest without entry and a new P3 extreme, use Fibo P2 to P3: S=P2-0.25*(P3-P2); retain initial anchors without partial retest; freeze on entry',
      adjacentReversal: 'Rejected adjacent P1/P2 may seed a reversal-only shadow pattern: break original P1, then cross excluded P2 before entry; Fibo uses original P2/P3; same-bar first P3 requires a later bar to cross P2; ordinary entries remain forbidden',
      rejectedRetest: 'After an adjacent rejected opposite pivot, require a stronger opposite extreme before P2; otherwise keep trailing P1 and clear the threshold when P1 deepens',
      pivotOrdering: 'The prospective P2 plateau must not already cross P1 before confirmation; otherwise trail a new P1 instead of confirming a stale P2',
      pivotPlateau: 'Equal adjacent highs/lows are one pivot; confirm only on reversal after the plateau with an opposite-side boundary on its left; use plateau last equal-extreme bar/time',
      originFibo: 'Reversal LONG with floor 0 anchors Fibo from floor 0 to selected P1, fixed as target P3 trails; B=floor0-0.25*(P1-floor0), stop=B-0.03, entry=(B+P3)/2; no ordinary P2-P3 reanchor in this case',
      exits: 'Check from the next M5 after entry; simultaneous TP/SL is ambiguous',
      referenceRollover: 'Unresolved trade is recorded separately, without a fabricated exit',
      stopOffset: 'Default 0.03 USDT beyond the Fibo line; entry remains the unbuffered Fibo midpoint',
      costs: 'Not included', rUnits: '1R is actual buffered stop risk; target R is actual reward/risk, not fixed +1; no compounding' }, ...report };
  mkdirSync(resolve(prefix, '..'), { recursive: true });
  writeFileSync(prefix + '.json', JSON.stringify(result, null, 2) + '\n');
  const statusRu = { target: 'Цель', stop: 'Стоп', ambiguous: 'Неизвестный порядок TP/SL',
    unresolved_at_new_h1: 'Не завершена к новой H1', unresolved_at_end: 'Не завершена к концу данных' };
  writeFileSync(prefix + '-trades.csv', csv(result.trades.map(t => ({
    'Номер': t.id, 'Дата опорного H1': t.referenceDate, 'Направление': t.side,
    'Свеча входа с (UTC+7)': t.entryBarStart, 'Свеча входа до (UTC+7)': t.entryBarEnd,
    'Вход USDT': t.entry, 'Стоп USDT': t.stop, 'Цель USDT': t.target,
    'Базовая линия стопа Фибо': t.fiboStop, 'Цель свинга до отступа': t.swingTarget, 'Фактический RR': t.rewardRisk,
    'Исход': statusRu[t.status], 'Свеча исхода с (UTC+7)': t.exitBarStart,
    'Свеча исхода до (UTC+7)': t.exitBarEnd, 'Цена исхода USDT': t.exitPrice, 'Результат R': t.r,
  }))));
  writeFileSync(prefix + '-days.csv', csv(result.days.map(d => ({
    'Дата опорного H1': d.date, 'H1 закрыт (UTC+7)': d.referenceClose,
    'Максимум H1': d.high, 'Минимум H1': d.low, 'Входов': d.trades,
    'Целей': d.targets, 'Стопов': d.stops, 'Неоднозначных': d.ambiguous,
    'Незавершённых': d.unresolved,
  }))));
  const n = result.summary;
  const body = `# Бэктест SOL/USDT MEXC — ${scriptVersion}\n\nКалендарное окно: **${result.period.windowFirstReference} — ${result.period.windowLastReference}**.\nТорговые опорные дни: **${result.period.firstReference} — ${result.period.lastReference}** (${n.referenceDays} будних дней).\nКалендарных опорных дней в исходном окне: **${n.calendarReferenceDays}**, исключено выходных: **${n.excludedWeekendDays}**.\nНаблюдение до **${raw.endExclusive}**, время Красноярска.\n\n| Показатель | Результат |\n|---|---:|\n| Всего сделок (тейки + стопы) | ${n.totalTrades} |\n| Достигнута цель | ${n.targets} |\n| Стоп | ${n.stops} |\n| Успешных среди определённых исходов | ${n.winRateKnown === null ? '—' : (n.winRateKnown * 100).toFixed(2) + '%'} |\n| Дней с входом | ${n.daysWithEntry} |\n| Дней без входа | ${n.daysWithoutEntry} |\n| Дней, когда достигнута цель | ${n.daysWithTarget} |\n| Дней со стопами и без цели | ${n.daysWithStopsAndNoTarget} |\n| Сумма известных исходов до расходов, R | ${n.netRKnownBeforeCosts.toFixed(2)} |\n\nВсего сделок = тейки + стопы. Незавершённые и неоднозначные исходы\nне входят ни в это количество, ни в win rate. Полный служебный журнал\nсодержит ${n.enteredTrades} входов, из них незавершённых ${n.unresolved},\nнеоднозначных ${n.ambiguous}.\n\nСуббота и воскресенье по Красноярску исключены из поиска и новых входов.\nОграничения 20:30 нет: в будни вход разрешён до обычной смены H1.\nУже открытый в будни вход продолжает отслеживаться в выходные.\n\nИсполнялся сам исходник ${version} в PineTS 0.12.0. Сигнал — касание входа\nпо правилам ${scriptVersion}; стоп на 0.03 USDT за красной линией Фибо.\nФактический тейк на 0.03 USDT перед целью свинга: выше в SHORT, ниже в LONG.\nВход сохранён как середина между базовой линией Фибо и исходной целью свинга, без сдвига\nиз-за отступа стопа. Фактический reward/risk немного меньше 1:1.\nПервую M5 после опорного часа (15:00–15:05) не используем для пробоя H1.\nНаправление определяется с15:05, даже если первая M5 вышла далеко или за обе границы.\nПробой H1 учитывается от0.02 USDT включительно; меньший выход игнорируется.\nЭто относится к первому выбору, смене приоритета и первому свингу за H1.\nВторой приоритет фиксируется до нового опорного H1, в том числе после стопа.\nПоследующие выходы за границы H1 не переключают его повторно.\nПробой сохранённого «0» отменяет структуру LONG, но сохраняет второй LONG.\nСоседний противоположный свинг пропускаем, сохраняя P1.\nПоследующие более слабые вершины не становятся P2: в SHORT нужен high\nвыше пропущенного, в LONG low ниже пропущенного. Новая более глубокая P1\nсбрасывает это ограничение и начинает отдельный поиск отката. До подходящей\nотдельной P2 первая точка сопровождает новые подтверждённые экстремумы.\nРавные соседние high/low считаются одной вершиной/впадиной, подтверждённой\nпосле обратного движения; соседство проверяется по последнему бару плато.\nСвечи самого плато P2 не должны уже пробивать P1: иначе ищется новая P1.\nРазворотный LONG после подтверждённого нижнего свинга SHORT без обновления\nего low сохраняет этот low как «0», даже до подтверждения верхнего P2. Откат P2 ниже H1 допустим выше «0»; верхняя P1 сохраняется,\nсоседний нижний свинг пропускается, нужна следующая более низкая P2.\nВ этом LONG Фибо строится от «0» до выбранной вершины «1», а не между 1–2.\nНижняя красная линия B=0−0.25×(P1−0), SL=B−0.03, E=(B+P3)/2.\nСетка сохраняется при обновлении цели; обычный перенос 2–3 здесь не включается.\nЕсли до подходящей P2 вершина LONG P1 заменена более высоким подтверждённым свингом,\nснимаем привязку к старому минимуму0 и строим Фибо по новой структуре1–2.\nПосле этого обычный перенос2–3 после неполного ретеста снова разрешён.\nПробой P1 на свече подтверждения P2 сохраняется как P3, без входа задним числом на ней.\nВ остальных сценариях после ретеста, не достигшего входа, следующий экстремум P3\nпереносит Фибо с 1–2 на 2–3. Базовая линия=P2−0.25×(P3−P2), исходная цель=P3,\nвход=(базовая линия+цель)/2; фактический стоп вынесен за линию на 0.03 USDT. Без такого ретеста первоначальная сетка сохраняется.\nВ режиме 2–3 до входа сопровождаются все три цены; после входа они заморожены.\nДо входа пробой P2 после сформированной P3 разворачивает ожидающий план зеркально.\nФибо обратного плана строится по прежним P2/P3, вход только на последующем отдельном ретесте1:1.\nВ v28 исключённая соседняя пара также отслеживается только для разворота после обновления P1 и последующего пробоя P2. Исходный вход по ней запрещён. Первый P3 и пробой P2 на одной M5 требуют повторного пробоя P2 на более позднем баре.\nЭто исключение из блокировки второго приоритета H1. Уже открытые сделки не разворачиваются.\nОдновременное продолжение P3 и пробой P2 на одной исторической M5 отменяет сценарий: порядок неизвестен.\nФильтр свечи с одновременным верхним и нижним свингом НЕ включён; здесь сохранено поведение v25.\nПосле стопа со следующей M5 разрешён новый поиск. После цели новых входов\nпод этой H1 нет. Поэтому 60 дней не обязательно равны 60 сделкам.\n\nЭто **консервативный бэктест по M5 OHLC**, без тиков. Бар с новым экстремумом\nне используется как доказательство последующего ретеста. На самой свече\nвхода исход TP/SL не приписывается движению после входа. Если следующая\nсвеча содержит оба уровня, исход неизвестен и ${scriptVersion} блокирует новые входы\nпод этой H1. Такие сделки не включены в долю успешных определённых исходов.\nКомиссии, проскальзывание, финансирование и реальные исполнения не учтены.\nСумма R включает только известные TP/SL, не является итогом всего портфеля.\nНа стопе −1R, на цели — отношение расстояния до цели к расстоянию\nдо фактического стопа с отступом. Комиссии в R не включены.\n\nИсточник — [публичный API фьючерсов MEXC](${BASE_URL_PLACEHOLDER}).\nПолучено ${raw.count} непрерывных M5 свечей, пропусков и неполных опорных часов нет.\nДень в отчёте — дата опорного H1; вход может произойти после полуночи.\nИсходные данные и полный журнал приложены рядом. Время входа и выхода\nв CSV задано интервалом M5: точный момент внутри свечи неизвестен.\n\nSHA-256 исходника: \`${result.sourceSha256}\`.\nSHA-256 файла свечей: \`${result.inputSha256}\`.\n`;
  writeFileSync(prefix + '.md', body);
  process.stdout.write(JSON.stringify(result.summary, null, 2) + '\n');
}
const BASE_URL_PLACEHOLDER = 'https://api.mexc.com/api/v1/contract/kline/SOL_USDT';
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
