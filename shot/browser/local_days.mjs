process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Stats use YOUR local days (Hobart), not UTC. A 1am watch was being put on the day before:
// 1am on 1 Jan went into last year, and late nights broke streaks. Every card now agrees.
const PORT = 4251;
const DIST = APP_DIST; const OUT = workPath('out_local_days');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };


const FIXED = Date.parse('2026-10-26T09:00:00.000Z'); // Mon 26 Oct 2026, 8pm in Hobart

// Local (Hobart, UTC+11) times -> UTC days in brackets:
//   8pm 31 Dec 2025 (31st), 1am 1 Jan 2026 (31 Dec 2025!), 1am Sat 24 Oct (23rd),
//   9pm Sun 25 Oct (25th), 1am Mon 26 Oct (25th), and a film at 7pm 26 Oct (26th).
const W = { '1x1': '2025-12-31T09:00:00.000Z', '1x2': '2025-12-31T14:00:00.000Z', '1x3': '2026-10-23T14:00:00.000Z', '1x4': '2026-10-25T10:00:00.000Z', '1x5': '2026-10-25T14:00:00.000Z' };
const STATE = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Night Show', followed: true, genres: ['Drama'], totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], lastSynced: '2026-10-21T00:00:00Z',
    watched: Object.fromEntries(Object.entries(W).map(([k, at]) => [k, { at, min: 30 }])) },
}, movies: [{ name: 'Late Film', tmdbId: 9, status: 'watched', watchedAt: '2026-10-26T08:00:00.000Z', runtimeMin: 100, year: '2020' }],
goals: { 2026: { episodes: 100, at: '2026-01-02T00:00:00.000Z' } }, settings: { tmdbKey: 'TESTKEY' } });

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
page.on('request', (r) => {
  const u = r.url();
  if (u.startsWith('http://localhost:')) return r.continue();
  if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
  if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
  if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ results: [], episodes: [], cast: [], crew: [] }) });
  return r.abort();
});
await page.evaluateOnNewDocument((s, fixed) => {
  if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.setItem('watchnext-badges-seen-v1', JSON.stringify({ v: 1, levels: {} })); sessionStorage.setItem('__s', '1'); }
  const RealDate = Date; const start = RealDate.now(); const b = fixed;
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
  window.Date = FakeDate;
}, STATE(), FIXED);
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Stats')).click()); await wait(800);

const cardOf = (id) => page.evaluate((i) => { const s = document.getElementById(i); const sec = s && s.closest('section'); return sec ? sec.innerText.replace(/\s+/g, ' ') : ''; }, id);
const statOf = (id, label) => page.evaluate((i, l) => {
  const sec = document.getElementById(i).closest('section');
  const st = [...sec.querySelectorAll('.sd-yir-stats > *')].find((x) => new RegExp(l, 'i').test(x.innerText));
  return st ? Number(st.querySelector('.sd-yir-v').textContent.replace(/,/g, '')) : null;
}, id, label);

const statTab = async (name) => { await page.evaluate((n) => [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.trim() === n).click(), name); await wait(500); };

console.log('A. OVERVIEW');
await ok('Year in review 2026: 4 episodes (the 1am New Year watch counts in 2026, not 2025)', async () => {
  assert.equal(await statOf('yir-year', 'episodes'), 4);
});
await ok('Goals 2026: 4 / 100 episodes, and a 3-day current streak (Sat, Sun, Mon nights)', async () => {
  assert.match(await page.evaluate(() => document.querySelector('[data-goal=episodes] .sd-goal-num').textContent), /^4 \/ 100/);
  assert.match(await page.evaluate(() => document.querySelector('[data-testid=goal-streak]').textContent), /3/);
});
await ok('Month in review (October) agrees: 3 episodes + 1 film on 3 days', async () => {
  assert.equal(await statOf('mir-month', 'episodes'), 3); assert.equal(await statOf('mir-month', 'days'), 3);
});
await page.evaluate(() => { const s = document.getElementById('yir-year'); s.value = '2025'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(400);
await ok('Year in review 2025: only the 8pm 31 Dec watch', async () => { assert.equal(await statOf('yir-year', 'episodes'), 1); });

console.log('B. HABITS');
await statTab('Habits');
await ok('current streak 3 days; longest 3 days', async () => {
  const v = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-stat^=streak]')].map((t) => [t.dataset.stat, Number(t.querySelector('.sd-tile-v').firstChild.textContent)])));
  assert.deepEqual(v, { 'streak-current': 3, 'streak-longest': 3 });
});
await ok('heatmap: the watches sit on 24, 25 and 26 Oct (26 Oct has the 1am episode and the film)', async () => {
  const t = await page.evaluate(() => [...document.querySelectorAll('[title*=" · "]')].map((c) => c.getAttribute('title')).filter((x) => /Oct/.test(x) && !/^0 /.test(x)));
  assert.equal(t.length, 3, JSON.stringify(t));
  assert.ok(t.some((x) => /^2 watches · .*26 Oct/.test(x)), JSON.stringify(t));
  assert.ok(!t.some((x) => /23 Oct/.test(x)), JSON.stringify(t));
});
await page.screenshot({ path: path.join(OUT, 'habits_phone.png') });

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
