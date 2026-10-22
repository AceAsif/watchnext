process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Watchlist total time: "≈ N days to finish everything" on Watchlist → Queue, the length of
// each title, and "Quickest first" sorting. TMDB mocked.
const PORT = 4206;
const DIST = APP_DIST; const OUT = workPath('out_wltime'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z');
const W1 = '2020-05-01T10:00:00.000Z';
const SEASON_UNUSED = { episodes: [1, 2, 3].map((i) => ({ id: 100 + i, episode_number: i, name: `Ep ${i}`, runtime: 50, air_date: '2017-12-01', overview: '' })) };


// History: 20 episodes of 45 min over the last 40 days (one every 2 days) -> 900 min / 40 days = 22.5 min a day.
const hist = {}; for (let i = 1; i <= 20; i++) hist[`1x${i}`] = { at: new Date(FIXED - i * 2 * 86400000).toISOString(), min: 45 };
const STATE = () => ({ shows: {
  'tmdb:9': { tmdbId: 9, name: 'History', followed: true, runtimeMin: 45, totalEpisodes: 20, seasons: [{ n: 1, count: 20 }], watched: hist },
  'tmdb:1': { tmdbId: 1, name: 'Long Show', watchlist: true, followed: false, runtimeMin: 60, seasons: [{ n: 1, count: 10 }, { n: 2, count: 10 }], watched: {} },
  'tmdb:2': { tmdbId: 2, name: 'Airing Show', watchlist: true, followed: false, runtimeMin: 30, seasons: [{ n: 1, count: 8, air: '2026-10-01' }], nextAir: { date: '2026-10-29', season: 1, episode: 5 }, watched: {} },
}, movies: [
  { name: 'Big Movie', status: 'planned', runtimeMin: 180, tmdbId: 50, year: 2020 },
  { name: 'Unknown Movie', status: 'planned', tmdbId: 51, year: 2024 },
], settings: { tmdbKey: 'TESTKEY' } });

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
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };
const card = (p) => p.evaluate(() => document.querySelector('[data-testid=watchlist-time]').innerText.replace(/\s+/g, ' ').trim());
const names = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-mrow-name')].map((x) => x.textContent));

let p = await open();
await tab(p, 'Watchlist');
// Long Show 20 eps x 60 = 1200; Airing Show 4 out x 30 = 120; Big Movie 180; Unknown Movie 110 (guess) = 1610 min.
// Pace 900 min / 40 days = 22.5 min a day -> ceil(1610 / 22.5) = 72 days.
await ok('the Queue opens with "≈ 72 days to finish everything" and the total viewing time at your pace', async () => {
  const c = await card(p);
  assert.match(c, /^≈ 72 days to finish everything/, c);
  assert.match(c, /1 day 2 hrs of viewing, at your pace of 22 min a day · done around 2 Jan 2027/);
});
await ok('it splits shows and movies, and notes episodes not out yet and guessed runtimes', async () => {
  const c = await card(p);
  assert.match(c, /Shows 22 hrs · 24 episodes Movies 4 hrs 50 min · 2/);
  assert.match(c, /\+4 episodes not out yet · 1 title has no runtime yet/);
});
await ok('each title shows how long it is ("20 eps · 20 hrs", "~1 hr 50 min" for a guess)', async () => {
  const t = await p.evaluate(() => document.body.innerText);
  assert.match(t, /Long Show\n20 eps · 20 hrs/); assert.match(t, /Airing Show\n4 eps · 2 hrs/);
  assert.match(t, /Big Movie\n2020 · 3 hrs/); assert.match(t, /Unknown Movie\n2024 · ~1 hr 50 min/);
});
await ok('A–Z is the default order', async () => { assert.deepEqual(await names(p), ['Airing Show', 'Long Show', 'Big Movie', 'Unknown Movie']); });
await p.evaluate(() => [...document.querySelectorAll('.sd-wlsort')].find((b) => b.textContent === 'Quickest first').click()); await wait(250);
await ok('"Quickest first" puts the shortest titles on top, and is remembered', async () => {
  assert.deepEqual(await names(p), ['Airing Show', 'Long Show', 'Unknown Movie', 'Big Movie']);
  assert.equal(await p.evaluate(() => localStorage.getItem('watchnext-wl-sort')), 'short');
});
await p.evaluate(() => document.querySelector('button[aria-label="Remove Long Show from watchlist"]').click()); await wait(300);
await ok('removing a title updates the total straight away', async () => { assert.match(await card(p), /^≈ 19 days to finish everything/); });
await ok('phone: no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.screenshot({ path: path.join(OUT, 'wltime_phone.png') });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
