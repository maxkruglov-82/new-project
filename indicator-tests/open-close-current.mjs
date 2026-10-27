import {spawnSync} from 'node:child_process';
// Current one-close/inclusive-five rules on synthetic OHLC. Working exchange: BingX. Older open-close tests retain the
// superseded two-close snapshots and former local-origin rules are not this suite.
// Position/drawing unit fixtures isolate their engines at four bars; zero/structure integration uses default five.
for(const name of ['open-close-retry-origin-filter.mjs','open-close-directional-retreat.mjs','open-close-hour-exit.mjs','open-close-zero-bounds.mjs','open-close-zero-range.mjs','open-close-zero-start13.mjs','open-close-oct16-origin.mjs','open-close-oct13-mexc.mjs','open-close-oct12-trailing.mjs','open-close-pending-third-trailing.mjs','open-close-positions.mjs','open-close-retry.mjs','open-close-friday-retry.mjs','open-close-deadline.mjs','open-close-trend-colors.mjs','open-close-zero-condition.mjs','open-close-zero-cancel.mjs','open-close-origin-gate.mjs','open-close-origin-reversal.mjs','open-close-continuation-retest.mjs','open-close-early-continuation.mjs','open-close-third-break-continuation.mjs','open-close-short-112-retest.mjs','open-close-oct13-retest.mjs','open-close-replay-retention.mjs','open-close-outcome-marks.mjs']){
 const run=spawnSync(process.execPath,[new URL(name,import.meta.url).pathname],{stdio:'inherit'});
 if(run.status!==0)process.exit(run.status??1);
}
