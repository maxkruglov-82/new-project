import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
for (const file of ['v72-reversal-updated.mjs', 'v72-oct21.mjs', 'v72-august.mjs', 'v72-confirmation.mjs']) {
  const result = spawnSync(process.execPath, [new URL(file, import.meta.url).pathname], {stdio: 'inherit'});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${file} failed (${result.signal ?? result.status})`);
}
