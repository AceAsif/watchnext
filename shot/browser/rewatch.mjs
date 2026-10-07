import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';
const DIST = APP_DIST; const OUT = workPath('out_rw'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4181, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const ep = (n) => ({ at: '2026-09-01T10:00:00.000Z', min: 40, n });
const mkShow = (id, name, ns) => ({ followed: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 40, genres: ['Drama'], name, tmdbId: id, totalEpisodes: 20, seasons: [{ n: 1, count: 20 }], watched: Object.fromEntries(ns.map((v, i) => [`1x${i + 1}`, ep(v)])) });
const mv = (name, id, d) => ({ tmdbId: id, name, status: 'watched', watchedAt: `2026-0${d}-05T10:00:00.000Z`, runtimeMin: 100, poster: null, year: 2026 });
const WITH = { shows: {
  'tmdb:1': mkShow(1, 'Suits', [3, 2, 1, 1]), 'tmdb:2': mkShow(2, 'The Office (US)', [6, 5, 4, 1]), 'tmdb:3': mkShow(3, 'Never Rewatched', [1, 1, 1]),
  'tmdb:4': mkShow(4, 'Brooklyn Nine-Nine', [2]), 'tmdb:5': mkShow(5, '鋼の錬金術師 FULLMETAL ALCHEMIST: BROTHERHOOD — The Complete Extended Edition', [3, 3]),
}, movies: [mv('Dune', 10, 1), mv('Dune', 10, 2), mv('Dune', 10, 3), mv('Up', 11, 4), mv('Up', 11, 5), mv('Heat', 12, 6), { tmdbId: 13, name: 'Planned Only', status: 'planned' }], settings: { tmdbKey: 'TESTKEY' } };
const NONE = { shows: { 'tmdb:1': mkShow(1, 'Suits', [1, 1]) }, movies: [mv('Dune', 10, 1)], settings: { tmdbKey: 'TESTKEY' } };
const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
async function open(state, w = 390) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: 900, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (u.startsWith('http://localhost:')) return r.continue(); if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss }); if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG }); if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: '{"episodes":[],"results":[]}' }); return r.abort(); });
  await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); } }, state);
  await page.goto('http://localhost:4181/', { waitUntil: 'networkidle0' }); await wait(500);
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Stats')).click()); await wait(450);
  await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.trim() === 'Rankings').click()); await wait(450);
  return page;
}
const group = (p, label) => p.evaluate((l) => { const g = document.querySelector(`[aria-label="${l}"]`); return g ? [...g.querySelectorAll('.sd-bar-row')].map((r) => [r.querySelector('.sd-bar-label').textContent, r.querySelector('.sd-bar-val').textContent.trim()]) : null; }, label);
let p = await open(WITH);
await ok('Most rewatched shows: names, values and order match an independent count of the seeded data', async () => {
  const exp = Object.values(WITH.shows).map((s) => [s.name, Object.values(s.watched).reduce((a, w) => a + (w.n - 1), 0)]).filter((r) => r[1] > 0).sort((x, y) => y[1] - x[1]);
  const rows = await group(p, 'Most rewatched shows');
  assert.deepEqual(rows, exp.map(([n, v]) => [n, v + '×']));
  assert.equal(rows.length, 4);
});
await ok('spot checks: Office, Suits, Brooklyn; the never-rewatched show is absent; bars sorted high to low', async () => {
  const rows = await group(p, 'Most rewatched shows'); const expect = { 'The Office (US)': (6 - 1) + (5 - 1) + (4 - 1), 'Suits': (3 - 1) + (2 - 1), 'Brooklyn Nine-Nine': 1 };
  for (const [name, v] of Object.entries(expect)) assert.equal(rows.find((r) => r[0] === name)[1], v + '×', name);
  assert.ok(!rows.some((r) => r[0] === 'Never Rewatched'));
  const vals = rows.map((r) => parseInt(r[1])); assert.deepEqual(vals, [...vals].sort((a, b) => b - a), 'sorted high to low');
});
await ok('Most rewatched movies: Dune 2×, Up 1×; Heat (once) and the planned film are left out', async () => {
  const rows = await group(p, 'Most rewatched movies'); assert.deepEqual(rows, [['Dune', '2×'], ['Up', '1×']]);
});
await ok('captions: totals and "all time", singular/plural right', async () => {
  const t = await p.evaluate(() => document.body.innerText);
  assert.match(t, /\d+ rewatches across 4 shows, all time\./); assert.match(t, /3 rewatches across 2 movies, all time\./); assert.match(t, /Each × is a viewing after the first/);
});
await ok('"Most watched shows" is still there and unchanged (counts every viewing)', async () => {
  const rows = await group(p, 'Most watched shows'); assert.ok(rows && rows.length >= 4);
  const office = rows.find((r) => r[0] === 'The Office (US)'); assert.equal(office[1], (6 + 5 + 4 + 1) + ' eps');
});
await ok('long Japanese title stays inside its row (no sideways scroll)', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.evaluate(() => document.querySelector('[aria-label="Most rewatched shows"]').scrollIntoView({ block: 'start' })); await wait(300);
await p.screenshot({ path: `${OUT}/rankings_phone.png` });
await p.close();
p = await open(WITH, 1280);
await ok('desktop: no sideways scroll; both rewatched sections present', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); assert.ok(await group(p, 'Most rewatched movies')); });
await p.screenshot({ path: `${OUT}/rankings_desktop.png`, fullPage: true });
await p.close();
p = await open(NONE);
await ok('nothing rewatched: the sections are simply absent (no empty cards, no zero rows)', async () => {
  assert.equal(await group(p, 'Most rewatched shows'), null); assert.equal(await group(p, 'Most rewatched movies'), null);
  const t = await p.evaluate(() => document.body.innerText); assert.doesNotMatch(t, /most rewatched/i); assert.match(t, /most watched shows/i);
});
await p.close();
console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
