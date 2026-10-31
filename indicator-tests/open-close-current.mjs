import {spawnSync} from 'node:child_process';
// Active V1.2; prior V1 checks remain available as their separate scripts.
for(const name of ['open-close-v12-no-entry.mjs','open-close-v12-point-one.mjs','open-close-v12-scenarios.mjs','open-close-v12-london-hour.mjs','open-close-v12-real.mjs']){
 const run=spawnSync(process.execPath,[new URL(name,import.meta.url).pathname],{stdio:'inherit'});
 if(run.status!==0)process.exit(run.status??1);
}
