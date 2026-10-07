// Runs every tests/unit/*.test.mjs and prints one line per suite.
//   node tests/run-unit.mjs            all suites
//   node tests/run-unit.mjs goals wipe only suites whose name contains one of these words
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'unit');
const words = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs') && (!words.length || words.some((w) => f.includes(w)))).sort();
let failed = 0, total = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8' });
  const m = /(\d+) (?:[a-z_ ]+ )?tests passed/.exec(r.stdout || '');
  const good = r.status === 0 && m;
  if (good) total += Number(m[1]); else failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${f.replace('.test.mjs', '').padEnd(18)} ${good ? m[1] + ' tests' : ''}`);
  if (!good) console.log(((r.stdout || '') + (r.stderr || '')).split('\n').slice(-15).join('\n'));
}
console.log(`\n${files.length - failed}/${files.length} suites passed, ${total} tests.`);
process.exit(failed ? 1 : 0);
