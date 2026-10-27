process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// More stats: "Biggest binges" (Habits, follows the year picker; local days; bulk imports left
// out) and "Genres over time" (Breakdown: share of each year, rising / falling). Hobart time.
const PORT = 4253;
const DIST = APP_DIST; const OUT = workPath('out_more_stats');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };


const FIXED = Date.parse('2026-10-26T09:00:00.000Z'); // Mon 26 Oct 2026, 8pm in Hobart

// k episodes an hour apart from a UTC start (each its own minute)
const run = (season, from, k, startIso, min = 40) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`${season}x${from + i}`, { at: new Date(Date.parse(startIso) + i * 3600000).toISOString(), min }]));
const IMPORT_AT = '2024-02-02T09:00:00.000Z';
const STATE = () => ({ shows: {
  // 2025: a 3-episode evening; 2026: a 6-episode evening (5pm–10pm on 12 Mar, Hobart)
  'tmdb:1': { tmdbId: 1, name: 'Suits', followed: true, genres: ['Drama'], totalEpisodes: 30, seasons: [{ n: 1, count: 10 }, { n: 2, count: 10 }], lastSynced: '2026-10-21T00:00:00Z',
    watched: { ...run(1, 1, 3, '2025-05-10T07:00:00.000Z', 44), ...run(2, 1, 6, '2026-03-12T06:00:00.000Z', 44) } },
  // 2026: 4 short episodes from 11pm on 1 Apr: two on the 1st, two after midnight on the 2nd
  'tmdb:2': { tmdbId: 2, name: 'Bluey', followed: true, genres: ['Animation', 'Comedy'], totalEpisodes: 20, seasons: [{ n: 1, count: 20 }], lastSynced: '2026-10-21T00:00:00Z',
    watched: { ...run(1, 1, 4, '2026-04-01T11:00:00.000Z', 8), ...run(1, 5, 2, '2025-08-01T08:00:00.000Z', 8) } },
  // 2024: 20 episodes ticked in the same minute (an import) — not a binge
  'tmdb:3': { tmdbId: 3, name: 'Imported Show', followed: true, genres: ['Crime'], totalEpisodes: 20, seasons: [{ n: 1, count: 20 }], lastSynced: '2026-10-21T00:00:00Z',
    watched: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`1x${i + 1}`, { at: IMPORT_AT, min: 45 }])) },
}, movies: [
  { name: 'Funny Film', tmdbId: 9, status: 'watched', watchedAt: '2026-08-01T08:00:00.000Z', genres: ['Comedy'], runtimeMin: 100, year: '2020' },
], settings: { tmdbKey: 'TESTKEY' } });

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

const binges = () => page.evaluate(() => [...document.querySelectorAll('[data-testid=binges] li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()));
const setYear = async (y) => { await page.evaluate((v) => { const s = document.getElementById('habit-year'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, y); await wait(400); };

console.log('A. BIGGEST BINGES (Habits)');
await statTab('Habits');
await ok('all years: Suits 6 eps on 12 Mar 2026 (4 hrs 24 min) first, then Suits 3 (2025), then Bluey 2 + 2 split at midnight', async () => {
  const b = await binges();
  assert.equal(b.length, 5, JSON.stringify(b));
  assert.match(b[0], /^1 Suits 12 Mar 2026 · 4 hrs 24 min 6 eps$/);
  assert.match(b[1], /^2 Suits 10 May 2025 · 2 hrs 12 min 3 eps$/);
  assert.equal(b.filter((x) => /Bluey .* 2 eps$/.test(x)).length, 3, 'Bluey: 1 Apr, 2 Apr (after midnight), and 1 Aug 2025');
  assert.ok(b.some((x) => /Bluey 1 Apr 2026/.test(x)) && b.some((x) => /Bluey 2 Apr 2026/.test(x)));
});
await ok('the 20-episode import is not a binge', async () => { assert.ok(!(await binges()).some((x) => /Imported/.test(x))); });
await setYear('2025');
await ok('year 2025: only that year\'s binges', async () => { const b = await binges(); assert.deepEqual(b.map((x) => x.replace(/^\d /, '').split(' ')[0]), ['Suits', 'Bluey']); });
await setYear('2024');
await ok('a year with only the import: a friendly "No binges yet" message', async () => {
  assert.equal((await binges()).length, 0);
  assert.match(await page.evaluate(() => document.querySelector('.a-binge').innerText), /No binges yet \(2024\)/);
});
await setYear('all');
await ok('phone: no sideways scroll on Habits', async () => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); });
await page.evaluate(() => document.querySelector('.a-binge').scrollIntoView({ block: 'start' })); await wait(250);
await page.screenshot({ path: path.join(OUT, 'binges_phone.png') });

console.log('B. GENRES OVER TIME (Breakdown)');
await statTab('Breakdown');
const table = () => page.evaluate(() => { const t = document.querySelector('[data-testid=genre-trends]'); return t ? { years: [...t.querySelectorAll('thead th')].slice(1).map((x) => x.textContent), rows: [...t.querySelectorAll('tbody tr')].map((r) => [r.querySelector('th').textContent, ...[...r.querySelectorAll('td')].map((c) => c.textContent)]) } : null; });
// Viewings per local year: 2024: 20 Crime; 2025: 3 Drama + 2 Animation/Comedy = 5;
// 2026: 6 Drama + 4 Animation/Comedy + 1 Comedy film = 11.
await ok('years 2024–2026, top genres by total, shares of each year', async () => {
  const t = await table();
  assert.deepEqual(t.years, ['2024', '2025', '2026']);
  assert.deepEqual(t.rows, [
    ['Crime', '100%', '0%', '0%'],
    ['Drama', '0%', '60%', '55%'],
    ['Comedy', '0%', '40%', '45%'],
    ['Animation', '0%', '40%', '36%'],
  ]);
});
await ok('rising / falling between the last two years (5 points or more): Comedy up 40% → 45%, Drama down 60% → 55%', async () => {
  const t = await page.evaluate(() => document.querySelector('[data-testid=genre-moves]').innerText.replace(/\s+/g, ' '));
  assert.match(t, /▲ Comedy up from 40% to 45% \(2025 → 2026\)/); assert.match(t, /▼ Drama down from 60% to 55%/);
});
await ok('phone: the table fits (no sideways scroll)', async () => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); });
await page.evaluate(() => document.querySelector('.a-gtrend').scrollIntoView({ block: 'start' })); await wait(250);
await page.screenshot({ path: path.join(OUT, 'genre_trends_phone.png') });

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
