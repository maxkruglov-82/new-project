import {spawnSync} from 'node:child_process';
// V1.1 replaces the old two-wick entries. Those entry fixtures remain historical.
// Five-bar pivots retained; all breaks now need one close.
for(const name of ['open-close-v11-engulfing-average.mjs','open-close-v11-structure-history.mjs','open-close-v11-engulfing-wick-retest.mjs','open-close-v11-oct20-reversal.mjs','open-close-v11-oct23-reversal.mjs','open-close-v11-single-break.mjs','open-close-v11-unfilled-reversal.mjs','open-close-v11-unfilled-short.mjs','open-close-v11-engulfing.mjs','open-close-v11-main-fallback.mjs','open-close-v11-market-structure.mjs','open-close-v11-oct29-events.mjs','open-close-v11-three-bar-retest.mjs','open-close-v11-replan-long.mjs','open-close-fixed-zero.mjs','open-close-stop-retreat-minimum.mjs','open-close-hour-exit.mjs','open-close-origin-own-retreat.mjs','open-close-origin-low-candidates.mjs']){
 const run=spawnSync(process.execPath,[new URL(name,import.meta.url).pathname],{stdio:'inherit'});
 if(run.status!==0)process.exit(run.status??1);
}
