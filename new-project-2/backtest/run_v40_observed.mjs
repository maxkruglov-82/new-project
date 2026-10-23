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
  insert('float eventSwingTarget = na', '\nint auditPivotBar = na\nint auditPriorCloseBar = na\nint auditPivotSide = na');
  source = source.replace(/(^[ \t]*)point1 := direction == -1 \? low\[1\] : high\[1\]/gm, (match, indent) => match + '\n' + indent + 'auditPivotBar := firstPivotBar' + '\n' + indent + 'auditPriorCloseBar := direction == -1 ? h1BelowCloseBar : h1AboveCloseBar' + '\n' + indent + 'auditPivotSide := direction');
  source += '\nplot(auditPivotBar,"Audit Pivot Bar",display=display.none)\nplot(auditPriorCloseBar,"Audit Prior Close Bar",display=display.none)\nplot(auditPivotSide,"Audit Pivot Side",display=display.none)';
  insert('bool shadowReversalNow = false', '\nfloat auditEntryBeforeRoll = entry\nint auditDirectionBefore = direction\nint auditStageBefore = stage\nfloat auditRejectedHighBefore = h1RejectedHigh\nfloat auditRejectedLowBefore = h1RejectedLow');
  source += '\nplot(auditDirectionBefore,"Audit Direction Before",display=display.none)\nplot(auditStageBefore,"Audit Stage Before",display=display.none)\nplot(auditRejectedHighBefore,"Audit Rejected High Before",display=display.none)\nplot(auditRejectedLowBefore,"Audit Rejected Low Before",display=display.none)';
  source += '\nplot(structureRollBar,"Audit Roll Bar",display=display.none)\nplot(point1Time,"Audit Roll First Time",display=display.none)\nplot(point2Time,"Audit Roll Second Time",display=display.none)\nplot(point1,"Audit Roll First",display=display.none)\nplot(point2,"Audit Roll Second",display=display.none)\nplot(auditEntryBeforeRoll,"Audit Old Entry",display=display.none)';
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
  const earlyCloseException = source.includes('bool earlyInitial = stage == 1 and (earlyShort or earlyLong)');
  const entryStart = earlyCloseException ? '15:00' : source.includes('if stage == 1 and time >= validUntil - 86400000 + 600000') ? '15:10' : '15:05';
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
  const p1Audit = [];
  for (let i=0;i<candles.length;i++) {
    const j=value('Audit Pivot Bar',i), k=value('Audit Prior Close Bar',i), side=value('Audit Pivot Side',i);
    if (!Number.isFinite(j)) continue;
    if (!(Number.isInteger(j)&&Number.isInteger(k)&&k<=j&&j<i)) throw new Error('Future close or unconfirmed P1');
    const high=value('H1 High',i),low=value('H1 Low',i), reference=referenceDate(candles[j].openTime);
    if (!(side===-1 ? candles[k].close<low : candles[k].close>high)) throw new Error('P1 close outside H1 missing');
    if (!(referenceDate(candles[k].openTime)===reference && iso(candles[k].openTime).slice(11,16)>='15:00')) throw new Error('Prior close from old H1');
    p1Audit.push({confirmedAt:iso(candles[i].openTime),pivotAt:iso(candles[j].openTime),priorCloseAt:iso(candles[k].openTime),side,pivotClose:candles[j].close,priorClose:candles[k].close,h1High:high,h1Low:low});
  }
  const priorityAudit = [];
  for (let i=0;i<candles.length;i++) {
    const from=value('Audit Direction Before',i),to=value('Direction',i),stageBefore=value('Audit Stage Before',i);
    if ((from===1||from===-1) && to===-from && stageBefore>=2 && stageBefore<=5) {
      const upper=value('H1 High',i),lower=value('H1 Low',i);
      const rejectedHigh=value('Audit Rejected High Before',i),rejectedLow=value('Audit Rejected Low Before',i);
      const barrier=from===-1?Math.max(upper,Number.isFinite(rejectedHigh)?rejectedHigh:upper):Math.min(lower,Number.isFinite(rejectedLow)?rejectedLow:lower);
      const extreme=from===-1?candles[i].high:candles[i].low;
      if (!(from===-1?extreme>barrier&&extreme-upper+1e-9>=0.02:extreme<barrier&&lower-extreme+1e-9>=0.02)) throw Error('Pending priority flipped without opposite working H1 break at '+iso(candles[i].openTime));
      priorityAudit.push({at:iso(candles[i].openTime),from,to,stageBefore,h1High:upper,h1Low:lower,rejectedHigh:Number.isFinite(rejectedHigh)?rejectedHigh:null,rejectedLow:Number.isFinite(rejectedLow)?rejectedLow:null,workingBoundary:barrier,extreme});
    }
  }
  const rollAudit=[];
  for(let i=0;i<candles.length;i++) if(value('Audit Roll Bar',i)===i) {
    rollAudit.push({at:iso(candles[i].openTime),side:value('Direction',i),firstAt:iso(value('Audit Roll First Time',i)),secondAt:iso(value('Audit Roll Second Time',i)),first:value('Audit Roll First',i),second:value('Audit Roll Second',i),oldEntry:value('Audit Old Entry',i),stageAfter:value('Stage',i)});
  }
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
      if (referenceDate(bar.openTime) !== currentDay.date || iso(bar.openTime).slice(11,16) < entryStart) throw new Error(`Entry outside current reference day ${entryStart}–24:00`);
      if (active) throw new Error('Parallel entries are not permitted');
      const side = signal === -1 ? 'SHORT' : 'LONG';
      active = { id: trades.length + 1, referenceDate: currentDay.date, side, tightReversal: value('Tight Reversal', i) === 1,
        entryBarStart: iso(bar.openTime), entryBarEnd: iso(bar.closeTime + 1),
        fiboStop: value('BT Fibo Stop', i), swingTarget: value('Swing Target', i), entry: value(`${side} Entry`, i), stop: value(`${side} Stop`, i), target: value(`${side} Target`, i),
        status: 'open', exitBarStart: null, exitBarEnd: null, exitPrice: null, r: null };
      if (![active.entry, active.stop, active.target].every(Number.isFinite)) throw new Error('Missing signal prices');
      const expectedEntry = (active.fiboStop + active.swingTarget) / 2;
      if (!Number.isFinite(active.fiboStop) || Math.abs(expectedEntry - active.entry) > 1e-8) throw new Error('Entry RR formula mismatch');
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
    netRKnownBeforeCosts: trades.reduce((sum, t) => sum + (t.r ?? 0), 0) }, days, trades, p1Audit, priorityAudit, rollAudit };
}

const escapeCsv = v => v === null || v === undefined ? '' : /[,"\n]/.test(String(v)) ? '"' + String(v).replaceAll('"', '""') + '"' : String(v);
function csv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  return '\uFEFF' + [keys.join(','), ...rows.map(row => keys.map(k => escapeCsv(row[k])).join(','))].join('\n') + '\n';
}
