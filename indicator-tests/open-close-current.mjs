import {spawnSync} from 'node:child_process';
// Active V1.2; prior V1 checks remain available as their separate scripts.
for(const name of ['open-close-v12-failed-counter-return.mjs','open-close-v12-numbered-structure.mjs','open-close-v12-cancellation-captions.mjs','open-close-v12-month-filter.mjs','open-close-v12-counter-third-cancel.mjs','open-close-v12-confirmed-labels.mjs','open-close-v12-third-body-cancel.mjs','open-close-v12-separated-tools.mjs','open-close-v12-continuation-bodies.mjs','open-close-v12-oct26.mjs','open-close-v12-rejected-sequence.mjs','open-close-v12-no-entry.mjs','open-close-v12-point-one.mjs','open-close-v12-scenarios.mjs','open-close-v12-london-hour.mjs','open-close-v12-real.mjs']){
 const run=spawnSync(process.execPath,[new URL(name,import.meta.url).pathname],{stdio:'inherit'});
 if(run.status!==0)process.exit(run.status??1);
}
