// Runs the browser suites that can run on their own (see tests/README_HARNESS.md).
//   node shot/run-browser.mjs            all runnable suites
//   node shot/run-browser.mjs goals tonight
// Needs: `npm install` inside shot/, and `node shot/build-test-dists.mjs` first.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APP_DIST, workPath } from '../tests/paths.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'browser');
const CANNOT_RUN = ['library.mjs', 'upnext.mjs', 'showpage.mjs', 'launch.mjs']; // need old baselines / design mock-ups
if (!fs.existsSync(path.join(APP_DIST, 'index.html'))) { console.error('No test build yet. Run: node shot/build-test-dists.mjs'); process.exit(2); }
workPath('tmp');
const words = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && !CANNOT_RUN.includes(f) && (!words.length || words.some((w) => f.includes(w)))).sort();
let failed = 0, total = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', timeout: 5 * 60 * 1000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = /(\d+) checks passed/.exec(out);
  const clean = /PROBLEMS: none/.test(out);
  const good = r.status === 0 && m && clean;
  if (good) total += Number(m[1]); else failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${f.replace('.mjs', '').padEnd(14)} ${m ? m[1] + ' checks' : ''}`);
  if (!good) console.log(out.split('\n').slice(-20).join('\n'));
}
console.log(`\n${files.length - failed}/${files.length} suites passed, ${total} checks.`);
process.exit(failed ? 1 : 0);
