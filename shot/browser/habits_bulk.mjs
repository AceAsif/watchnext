process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Habits with a bulk import: a day that only holds an import (20 ticks in one minute) is not a
// streak day, not "Most in a day", not a "Day with a watch". Hobart time.
const PORT = 4257;
const DIST = APP_DIST; const OUT = workPath('out_habits_bulk');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };


const FIXED = Date.parse('2026-10-26T09:00:00.000Z'); // Mon 26 Oct 2026, 8pm in Hobart

// k episodes an hour apart from a UTC start (each its own minute)
const run = (season, from, k, startIso, min = 40) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`${season}x${from + i}`, { at: new Date(Date.parse(startIso) + i * 3600000).toISOString(), min }]));
const IMPORT_AT = '2024-02-02T09:00:00.000Z'; // Fri 2 Feb 2024, 8pm Hobart
const STATE = () => ({ shows: {
  // real watches on 1 Feb and 3 Feb 2024 (Hobart noon): only the import day sits between them
  'tmdb:1': { tmdbId: 1, name: 'Suits', followed: true, genres: ['Drama'], totalEpisodes: 30, seasons: [{ n: 1, count: 30 }], lastSynced: '2026-10-21T00:00:00Z',
    watched: { '1x1': { at: '2024-02-01T01:00:00.000Z', min: 44 }, '1x2': { at: '2024-02-03T01:00:00.000Z', min: 44 }, '1x3': { at: '2024-02-03T03:00:00.000Z', min: 44 } } },
  'tmdb:3': { tmdbId: 3, name: 'Imported Show', followed: true, genres: ['Crime'], totalEpisodes: 20, seasons: [{ n: 1, count: 20 }], lastSynced: '2026-10-21T00:00:00Z',
    watched: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`1x${i + 1}`, { at: IMPORT_AT, min: 45 }])) },
}, movies: [], settings: { tmdbKey: 'TESTKEY' } });

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

const stat = (key) => page.evaluate((k) => { const t = document.querySelector(`[data-stat="${k}"]`); return t ? t.innerText.replace(/\s+/g, ' ').trim() : null; }, key);

console.log('HABITS WITH AN IMPORT DAY');
await statTab('Habits');
await ok('Days with a watch = 2 (1 Feb and 3 Feb); the import day is not counted', async () => { assert.match(await stat('active-days'), /^2 /); });
await ok('Most in a day = 2 on 3 Feb 2024 (the import day does not win)', async () => { const t = await stat('busiest'); assert.match(t, /^2 /); assert.match(t, /3 FEB 2024/i); });
await ok('Longest streak is 1 day: the import day does not join 1 Feb and 3 Feb', async () => { assert.match(await stat('streak-longest'), /^1 day/); });
await ok('the note says one bulk-only day was left out', async () => {
  const t = await page.evaluate(() => document.querySelector('.a-tiles').innerText.replace(/\s+/g, ' '));
  assert.match(t, /1 day with only bulk-marked watches is not counted/);
});
await ok('phone: no sideways scroll', async () => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); });
await page.evaluate(() => document.querySelector('.a-tiles').scrollIntoView({ block: 'center' })); await wait(250);
await page.screenshot({ path: path.join(OUT, 'habits_phone.png') });

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
