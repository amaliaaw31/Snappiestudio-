import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { verifyBackup } from './backup-verifier.js';

let state = 'UNKNOWN';
try {
  const directory = process.argv[2];
  if (!directory || !lstatSync(directory).isDirectory()) throw new Error('Invalid snapshot');
  let bytes = 0;
  for (const name of readdirSync(directory)) {
    const entry = lstatSync(join(directory, name));
    if (!entry.isFile()) throw new Error('Invalid snapshot file');
    bytes += entry.size;
  }
  if (bytes <= 256 * 1024 * 1024) {
    try { verifyBackup(directory); state = 'UP'; }
    catch (error) { state = ['EACCES', 'EPERM', 'EBUSY'].includes(error.code) ? 'UNKNOWN' : 'DEGRADED'; }
  }
} catch {}
console.log(JSON.stringify({ state }));
