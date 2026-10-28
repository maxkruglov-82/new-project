import {spawnSync} from 'node:child_process';
// Universal two-wick RR entries supersede the former single-touch/close-entry fixtures.
// Older position fixtures remain historical; the active entry contracts are tested below.
for(const name of ['open-close-retry-trailing-locked.mjs','open-close-sep24-retry-trailing.mjs','open-close-oct16-low-origin.mjs','open-close-oct08-two-wicks.mjs','open-close-opposite-retry-all-days.mjs','open-close-two-wick-entries.mjs','open-close-two-wick-modes.mjs','open-close-oct05-origin-stop.mjs','open-close-directional-retreat.mjs','open-close-hour-exit.mjs','open-close-zero-bounds.mjs','open-close-origin-own-retreat.mjs','open-close-origin-low-candidates.mjs','open-close-oct21-low-origin.mjs','open-close-oct22-left-five.mjs','open-close-zero-start13.mjs','open-close-history-loading.mjs']){
 const run=spawnSync(process.execPath,[new URL(name,import.meta.url).pathname],{stdio:'inherit'});
 if(run.status!==0)process.exit(run.status??1);
}
