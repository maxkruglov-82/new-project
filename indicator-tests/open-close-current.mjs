import {spawnSync} from 'node:child_process';
// Current one-close/inclusive-four rules on synthetic OHLC. Working exchange: BingX. Older open-close tests retain the
// superseded two-close/four-consecutive-close snapshots and former local-origin rules are not this suite.
for(const name of ['open-close-hour-exit.mjs','open-close-zero-bounds.mjs','open-close-zero-range.mjs','open-close-positions.mjs','open-close-retry.mjs','open-close-deadline.mjs','open-close-trend-colors.mjs','open-close-zero-condition.mjs','open-close-zero-cancel.mjs','open-close-origin-gate.mjs','open-close-origin-reversal.mjs']){
 const run=spawnSync(process.execPath,[new URL(name,import.meta.url).pathname],{stdio:'inherit'});
 if(run.status!==0)process.exit(run.status??1);
}
