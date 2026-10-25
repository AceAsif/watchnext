process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Rewatches in Stats: an old show (first watched in 2022, dates brought back from a backup)
// rewatched this month with "+1" and with Rewatch mode must count THIS month in Month in review,
// in 2026 on the Year card and in Goals, and agree with "This month vs last year".
const PORT = 4245;
const DIST = APP_DIST; const OUT = workPath('out_rewatch_stats');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-25T08:00:00.000Z'); // 25 Oct 2026, 19:00 in Hobart

const ST = {};
for (let e = 1; e <= 9; e++) ST[`4x${e}`] = { at: `2022-07-0${e}T10:00:00.000Z`, n: 2, min: 70, ...(e <= 4 ? { last: `2026-10-0${e + 1}T09:00:00.000Z` } : {}) };
const DONE = {}; for (let e = 5; e <= 9; e++) DONE[`4x${e}`] = `2026-10-${10 + e}T09:00:00.000Z`;
const STATE = () => ({ shows: {
  'tmdb:66732': { tmdbId: 66732, name: 'Stranger Things', followed: true, genres: ['Drama'], totalEpisodes: 9, status: 'Ended', seasons: [{ n: 4, count: 9 }], lastSynced: '2026-10-21T00:00:00Z', watched: ST, rewatch: { round: 2, started: '2026-10-05T00:00:00.000Z', done: DONE } },
  'tmdb:1': { tmdbId: 1, name: 'Suits', followed: true, genres: ['Drama'], seasons: [{ n: 9, count: 10 }], lastSynced: '2026-10-21T00:00:00Z',
    watched: { '9x1': { at: '2026-10-01T09:00:00.000Z', min: 40 }, '9x2': { at: '2026-10-01T10:00:00.000Z', min: 40 }, '9x3': { at: '2026-10-02T10:00:00.000Z', min: 40 } } },
}, movies: [], goals: { 2026: { episodes: 100, at: '2026-01-02T00:00:00.000Z' } }, settings: { tmdbKey: 'TESTKEY' } });

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

console.log('A. MONTH IN REVIEW (October 2026)');
await ok('Stranger Things is the top show of October, with its 9 rewatched episodes', async () => {
  const t = await cardOf('mir-month');
  assert.match(t, /October/); assert.match(t, /Stranger Things 9 eps/); assert.match(t, /Suits 3 eps/);
  assert.ok(t.indexOf('Stranger Things') < t.indexOf('Suits'), 'Stranger Things first');
});
await ok('October counts 12 episodes on 10 days (rewatch days included)', async () => {
  assert.equal(await statOf('mir-month', 'episodes'), 12);
  assert.equal(await statOf('mir-month', 'days'), 10); // Oct 1–5 and 15–19
});
await page.evaluate(() => document.getElementById('mir-month').scrollIntoView({ block: 'start' })); await wait(300);
await page.screenshot({ path: path.join(OUT, 'month_phone.png') });

console.log('B. THE CARDS AGREE');
await ok('"This month vs last year" counts the same 12 episodes this month', async () => {
  const t = await page.evaluate(() => document.querySelector('[data-testid=month-vs-year]').innerText.replace(/\s+/g, ' '));
  assert.match(t, /Episodes 12\b/); assert.match(t, /Stranger Things · 9 eps/);
});
await ok('Year in review 2026 includes the rewatch (12 episodes, Stranger Things first)', async () => {
  assert.equal(await statOf('yir-year', 'episodes'), 12);
  const t = await cardOf('yir-year'); assert.ok(t.indexOf('Stranger Things') >= 0 && t.indexOf('Stranger Things') < t.indexOf('Suits'));
});
await ok('Goals 2026: 12 of 100 episodes', async () => {
  assert.match(await page.evaluate(() => document.querySelector('[data-goal=episodes] .sd-goal-num').textContent), /^12 \/ 100/);
});
await page.evaluate(() => { const s = document.getElementById('yir-year'); s.value = '2022'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(400);
await ok('the first watches still count once each in 2022', async () => {
  assert.equal(await statOf('yir-year', 'episodes'), 9);
});
await ok('phone: no sideways scroll', async () => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); });

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
