process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';
import { AUTO_YES } from './autoYes.js';

// Ticking an episode follows the show: a watchlist-only show you tick becomes a followed show
// (Shows + Up Next), and a show ticked before this rule existed is followed once at start. TMDB mocked.
const PORT = 4258;
const DIST = APP_DIST; const OUT = workPath('out_autofollow'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z');
const W1 = '2020-05-01T10:00:00.000Z';
const STATE = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Inside Job', followed: false, watchlist: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-10-01T00:00:00Z', runtimeMin: 25, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: {} },
  'tmdb:2': { tmdbId: 2, name: 'Stuck Show', followed: false, watchlist: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-10-01T00:00:00Z', runtimeMin: 25, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: { '1x1': { at: '2026-10-10T10:00:00.000Z', min: 25, n: 1 } } },
}, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const SEASON = { episodes: [1, 2, 3].map((i) => ({ id: 100 + i, episode_number: i, name: `Ep ${i}`, runtime: 50, air_date: '2017-12-01', overview: '' })) };

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.evaluateOnNewDocument(AUTO_YES); // answer the app's own questions with yes
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    const j = (b) => r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(b) });
    if (/\/tv\/1\/season\/1\?/.test(u)) return j(SEASON);
    if (u.includes('api.themoviedb.org')) return j({ episodes: [], results: [], cast: [], crew: [] });
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
const show = (p, id = 'tmdb:1') => p.evaluate((i) => JSON.parse(localStorage.getItem('watchnext-state-v1')).shows[i], id);

const body = (p) => p.evaluate(() => document.body.innerText);

console.log('A. a show you only put on the watchlist');
let p = await open();
await ok('at start: the show ticked before this rule existed is followed (Stuck Show), the untouched one is not', async () => {
  const s = await show(p, 'tmdb:2'); assert.equal(s.followed, true); assert.equal(s.watchlist, false);
  const w = await show(p); assert.equal(w.followed, false); assert.equal(w.watchlist, true);
});
await tab(p, 'Watchlist');
await ok('Watchlist lists Inside Job but no longer lists Stuck Show', async () => { const t = await body(p); assert.match(t, /Inside Job/); assert.doesNotMatch(t, /Stuck Show/); });
await tab(p, 'Up Next');
await ok('Up Next already offers Stuck Show', async () => assert.match(await body(p), /Stuck Show/));

console.log('B. tick an episode on Inside Job');
await tab(p, 'Watchlist');
await p.evaluate(() => { const el = [...document.querySelectorAll('.sd-card *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Inside Job'); el.click(); }); await wait(700);
await until(p, () => [...document.querySelectorAll('button[aria-label]')].some((b) => /^Mark .* watched$/.test(b.getAttribute('aria-label'))));
await ok('the show page says Follow (not followed yet) before the tick', async () => assert.match(await p.evaluate(() => document.querySelector('.sd-page').innerText), /\bFollow\b(?!ing)/));
await p.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((b) => /^Mark .* watched$/.test(b.getAttribute('aria-label'))).click()); await wait(500);
await ok('after one tick the show is followed and off the watchlist', async () => { const s = await show(p); assert.equal(s.followed, true); assert.equal(s.watchlist, false); assert.ok(s.watched['1x1']); });
await ok('the show page now says Following', async () => assert.match(await p.evaluate(() => document.querySelector('.sd-page').innerText), /Following/));
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Back/.test(b.textContent)).click()); await wait(400);
await tab(p, 'Shows');
await ok('Shows now lists Inside Job', async () => assert.match(await body(p), /Inside Job/));
await tab(p, 'Up Next');
await ok('Up Next now offers Inside Job (next episode 2)', async () => { const t = await body(p); assert.match(t, /Inside Job/); assert.match(t, /S01\s*·\s*E02/); });
await tab(p, 'Watchlist');
await ok('Watchlist no longer lists Inside Job', async () => assert.doesNotMatch(await body(p), /Inside Job/));

await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
