process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Stats → "This month vs last year": this month so far against the same days a year ago, the
// whole of last year's month, and picking an earlier month. TMDB mocked.
const PORT = 4207;
const DIST = APP_DIST; const OUT = workPath('out_mvl'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z');
const W1 = '2020-05-01T10:00:00.000Z';
const SEASON_UNUSED = { episodes: [1, 2, 3].map((i) => ({ id: 100 + i, episode_number: i, name: `Ep ${i}`, runtime: 50, air_date: '2017-12-01', overview: '' })) };



const L = (d, h = 20) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00+11:00`).toISOString();
const w = {};
['2025-10-03', '2025-10-04', '2025-10-12', '2025-10-25', '2025-10-26'].forEach((d, i) => { w[`1x${i + 1}`] = { at: L(d), min: 60 }; });
['2026-10-02', '2026-10-02', '2026-10-09', '2026-10-15', '2026-10-21', '2026-10-21'].forEach((d, i) => { w[`2x${i + 1}`] = { at: L(d), min: 60 }; });
['2024-10-05', '2025-09-10', '2026-09-12'].forEach((d, i) => { w[`3x${i + 1}`] = { at: L(d), min: 60 }; });
const STATE = () => ({ shows: { 'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, runtimeMin: 60, totalEpisodes: 30, seasons: [{ n: 1, count: 10 }, { n: 2, count: 10 }, { n: 3, count: 10 }], watched: w } },
  movies: [{ name: 'Heat', watchedAt: L('2025-10-08'), runtimeMin: 170, tmdbId: 949 }], settings: { tmdbKey: 'TESTKEY' } });
const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
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
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return page;
}
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out'); };
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };


const card = (p) => p.evaluate(() => document.querySelector('[data-testid=month-vs-year]').innerText.replace(/\s+/g, ' ').trim());
let p = await open();
await tab(p, 'Stats');
await until(p, () => !!document.querySelector('[data-testid=month-vs-year]'));
// Oct 1–22, 2026: 6 eps (6 hrs), 4 days.  Oct 1–22, 2025: 3 eps + Heat (3 hrs + 170 min = 350 min ≈ 6 hrs), 4 days.
await ok('"This month vs last year" sits under Month in review', async () => {
  const order = await p.evaluate(() => [...document.querySelectorAll('.sd-sec2')].map((s) => s.querySelector('.sd-lbl').textContent.trim().toLowerCase()));
  const i = order.indexOf('month in review'); assert.ok(i >= 0 && order[i + 1] === 'this month vs last year', order.join(' | '));
});
await ok('this month so far is compared with the same days last year', async () => {
  const c = await card(p);
  assert.match(c, /^About the same as October 2025 at this point/, c);
  assert.match(c, /Oct 1–22 in both years What 2026 2025 Change/i);
  assert.match(c, /Hours 6 6 same/); assert.match(c, /Episodes 6 3 \+3 ↑100%/); assert.match(c, /Movies 0 1 −1 ↓100%/); assert.match(c, /Days you watched 4 4 same/);
});
await ok('it names the top show both times and the whole of last October', async () => {
  const c = await card(p);
  assert.match(c, /Top show Dark · 6 eps A year ago Dark · 3 eps/i);
  assert.match(c, /All of October 2025: 8 hrs · 5 episodes · 1 movie/);
});
await ok('the month picker lists this month first, then months with a year of history', async () => {
  const o = await p.evaluate(() => [...document.querySelectorAll('#mvl-month option')].map((x) => x.textContent));
  assert.deepEqual(o, ['October 2026 (this month)', 'September 2026', 'October 2025']);
});
await p.select('#mvl-month', '2025-10'); await wait(300);
await ok('an earlier month is compared in full with the year before', async () => {
  const c = await card(p);
  assert.match(c, /^(\d+% more than|[\d.]+× as much as) October 2024/, c); assert.match(c, /October in both years What 2025 2024/i);
  assert.doesNotMatch(c, /All of/);
});
await ok('phone: no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.select('#mvl-month', '2026-10'); await wait(300);
await p.evaluate(() => document.querySelector('[data-testid=month-vs-year]').scrollIntoView({ block: 'center' })); await wait(200);
await p.screenshot({ path: path.join(OUT, 'mvl_phone.png') });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
