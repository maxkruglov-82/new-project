import {spawnSync} from 'node:child_process';
// Current one-close/inclusive-four rules. Older open-close tests retain the
// superseded two-close/four-consecutive-close snapshots and are not this suite.
for(const name of ['open-close-inclusive-four.mjs','open-close-positions.mjs','open-close-retry.mjs','open-close-history.mjs','open-close-deadline.mjs']){
 const run=spawnSync(process.execPath,[new URL(name,import.meta.url).pathname],{stdio:'inherit'});
 if(run.status!==0)process.exit(run.status??1);
}
