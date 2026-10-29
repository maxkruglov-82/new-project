import {spawnSync} from 'node:child_process';
// Active V1: only visual structure changed; V1.1 tests are archived separately.
for(const name of ['open-close-v1-labels.mjs','open-close-v1-structure-colors.mjs','open-close-v1-post-stop-structure.mjs','open-close-v1-oct09-retry.mjs','open-close-v1-oct16-retry.mjs','open-close-v1-structure.mjs','open-close-v1-structure-scope.mjs']){
 const run=spawnSync(process.execPath,[new URL(name,import.meta.url).pathname],{stdio:'inherit'});
 if(run.status!==0)process.exit(run.status??1);
}
