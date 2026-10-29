import {spawnSync} from 'node:child_process';
// Active V1: only visual structure changed; V1.1 tests are archived separately.
for(const name of ['open-close-v1-structure.mjs','open-close-v1-structure-scope.mjs']){
 const run=spawnSync(process.execPath,[new URL(name,import.meta.url).pathname],{stdio:'inherit'});
 if(run.status!==0)process.exit(run.status??1);
}
