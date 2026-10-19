process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Movies grid: ONE tile per film (rewatches grouped, "4×"), the movie sheet's Viewings list,
// and half-star movie ratings (tap the left half of a star). TMDB is mocked.
const PORT = 4197;
const DIST = APP_DIST; const OUT = workPath('out_mg'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };

const mv = (name, id, d, o = {}) => ({ name, tmdbId: id, status: 'watched', watchedAt: `${d}T02:00:00.000Z`, runtimeMin: 90, poster: null, year: 2007, ...o });
const MOVIES = [
  mv('Alvin and the Chipmunks', 6477, '2020-01-01', { rating: 3 }),
  mv('Alvin and the Chipmunks', 6477, '2026-09-19'),
  mv('Alvin and the Chipmunks', 6477, '2023-05-05', { rating: 4 }),
  mv('Alvin and the Chipmunks', 6477, '2024-01-01'),
  mv('Shaun of the Dead', 747, '2026-09-10', { rating: 4, year: 2004 }),
  mv('The Dog Stars', 9001, '2026-09-01', { year: 2026 }),
  { name: 'Planned Film', tmdbId: 5, status: 'planned' },
];
const STATE = { shows: {}, movies: MOVIES, settings: { tmdbKey: 'TESTKEY' } };

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  page.on('dialog', (d) => { page.__lastDialog = d.message(); d.accept(); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (u.startsWith('http://localhost:')) return r.continue(); if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss }); if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    const m = /api\.themoviedb\.org\/3\/movie\/(\d+)\?/.exec(u); if (m) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ id: +m[1], title: 'X', runtime: 90, genres: [], overview: 'A film.', belongs_to_collection: null }) });
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: '{"results":[]}' }); return r.abort(); });
  await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); } }, STATE);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Movies')).click()); await wait(500);
  return page;
}
const tiles = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-lgrid .sd-ltile')].map((t) => ({ name: t.querySelector('.sd-ltile-name').textContent, date: (t.querySelector('.sd-ltile-date') || {}).textContent || '', chip: (t.querySelector('[data-testid=times-chip]') || {}).textContent || '', badge: (t.querySelector('.sd-ltile-badge') || {}).textContent || '' })));
const openTile = (p, re) => p.evaluate((re) => [...document.querySelectorAll('.sd-lgrid .sd-ltile')].find((t) => new RegExp(re).test(t.getAttribute('aria-label'))).click(), re);
const lib = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).movies);
const sheetStars = (p) => p.evaluate(() => { const g = document.querySelector('.sd-mdet-head .stars'); return [...g.querySelectorAll('button')].map((b) => (b.querySelector('clipPath') ? 'half' : b.classList.contains('on') ? 'full' : 'empty')); });
// click star n (1-5) of the open sheet at the left ('L') or right ('R') side
async function tapStar(p, n, side) {
  const box = await p.evaluate((n) => { const r = document.querySelectorAll('.sd-mdet-head .stars button')[n - 1].getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, n);
  await p.mouse.click(box.x + (side === 'L' ? box.w * 0.2 : box.w * 0.8), box.y + box.h / 2); await wait(250);
}
const viewings = (p) => p.evaluate(() => { const s = document.querySelector('[data-testid=viewings]'); if (!s) return null; return { label: s.querySelector('.sd-lbl').textContent, chips: [...s.querySelectorAll('.sd-view')].map((b) => `${b.textContent.replace(/\s+/g, ' ').trim()}${b.getAttribute('aria-pressed') === 'true' ? ' *' : ''}`) }; });
const subtitle = (p) => p.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d ? d.innerText.split('\n').slice(0, 3).join(' | ') : ''; });

console.log('A. ONE TILE PER FILM');
let p = await open();
await ok('Alvin (4 viewings) is ONE tile with 4×, dated by its newest viewing, rated by its newest rating (4)', async () => {
  const t = await tiles(p); const alvin = t.filter((x) => /Alvin/.test(x.name));
  assert.equal(alvin.length, 1); assert.equal(alvin[0].chip, '4×'); assert.equal(alvin[0].date, '2026-09-19'); assert.equal(alvin[0].badge, '4');
});
await ok('the header and filter count FILMS (3), not viewings (6); the watchlist film is not in the grid', async () => {
  assert.equal(await p.evaluate(() => document.querySelector('.sd-libhead h1 .n').textContent), '3');
  assert.match(await p.evaluate(() => document.querySelector('.sd-lbar input').getAttribute('placeholder')), /^Filter 3 movies$/);
  assert.deepEqual((await tiles(p)).map((x) => x.name), ['Alvin and the Chipmunks', 'Shaun of the Dead', 'The Dog Stars']);
});
await ok('Rating sort and the filter still work on films', async () => {
  await p.evaluate(() => [...document.querySelectorAll('[aria-label="Sort movies"] button')].find((b) => b.textContent === 'Rating').click()); await wait(250);
  assert.deepEqual((await tiles(p)).map((x) => x.name), ['Alvin and the Chipmunks', 'Shaun of the Dead', 'The Dog Stars']);
  await p.evaluate(() => [...document.querySelectorAll('[aria-label="Sort movies"] button')].find((b) => b.textContent === 'Recent').click()); await wait(250);
});

console.log('B. VIEWINGS IN THE SHEET');
await openTile(p, '^Alvin'); await wait(500);
await ok('the sheet lists "Watched 4 times" with every date, newest first, the newest one selected', async () => {
  const v = await viewings(p); assert.equal(v.label, 'Watched 4 times');
  assert.deepEqual(v.chips, ['19 Sep 2026 *', '1 Jan 2024', '5 May 2023★ 4', '1 Jan 2020★ 3']);
});
await ok('tapping a date switches the sheet to that viewing (its date and its own rating)', async () => {
  await p.evaluate(() => [...document.querySelectorAll('.sd-view')].find((b) => /2020/.test(b.textContent)).click()); await wait(300);
  assert.match(await subtitle(p), /watched 2020-01-01/); assert.deepEqual(await sheetStars(p), ['full', 'full', 'full', 'empty', 'empty']);
  assert.ok((await viewings(p)).chips[3].endsWith('*'));
});
await p.screenshot({ path: `${OUT}/viewings_phone.png` });
await ok('"Remove this one" removes only that viewing; the tile then shows 3×', async () => {
  const label = await p.evaluate(() => [...document.querySelectorAll('.sd-mdet-actions button')].map((b) => b.textContent).join('|')); assert.match(label, /Remove this one/);
  await p.evaluate(() => [...document.querySelectorAll('.sd-mdet-actions button')].find((b) => b.textContent === 'Remove this one').click()); await wait(400);
  assert.match(p.__lastDialog, /^Remove the 1 Jan 2020 viewing of "Alvin and the Chipmunks"\? Your other 3 viewings stay\.$/);
  const m = await lib(p); assert.equal(m.filter((x) => x.tmdbId === 6477).length, 3); assert.ok(!m.some((x) => (x.watchedAt || '').startsWith('2020-01-01')));
  assert.equal((await tiles(p)).find((x) => /Alvin/.test(x.name)).chip, '3×');
});
await ok('a film watched once has no Viewings list and a plain "Remove"', async () => {
  await openTile(p, '^Shaun'); await wait(400);
  assert.equal(await viewings(p), null); assert.ok(await p.evaluate(() => [...document.querySelectorAll('.sd-mdet-actions button')].some((b) => b.textContent === 'Remove')));
});

console.log('C. HALF STARS');
await ok('tapping the LEFT half of star 1 gives 0.5 (saved, shown as a half star, tile badge 0.5)', async () => {
  await tapStar(p, 1, 'L');
  assert.equal((await lib(p)).find((x) => x.tmdbId === 747).rating, 0.5);
  assert.deepEqual(await sheetStars(p), ['half', 'empty', 'empty', 'empty', 'empty']);
});
await ok('right half of star 4 gives 4; left half of star 4 gives 3.5; tapping 3.5 again clears it', async () => {
  await tapStar(p, 4, 'R'); assert.equal((await lib(p)).find((x) => x.tmdbId === 747).rating, 4);
  await tapStar(p, 4, 'L'); assert.equal((await lib(p)).find((x) => x.tmdbId === 747).rating, 3.5); assert.deepEqual(await sheetStars(p), ['full', 'full', 'full', 'half', 'empty']);
  await tapStar(p, 4, 'L'); assert.equal((await lib(p)).find((x) => x.tmdbId === 747).rating, 0);
});
await ok('keyboard: Enter on star 2 gives a whole 2 (no half from the keyboard)', async () => {
  await p.evaluate(() => document.querySelectorAll('.sd-mdet-head .stars button')[1].focus()); await p.keyboard.press('Enter'); await wait(250);
  assert.equal((await lib(p)).find((x) => x.tmdbId === 747).rating, 2);
  await tapStar(p, 1, 'L');
});
await p.screenshot({ path: `${OUT}/half_star_phone.png` });
await ok('tile badge reads 0.5, and Stats shows the rating as half a star', async () => {
  await p.keyboard.press('Escape'); await wait(300);
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /close/i.test(x.getAttribute('aria-label') || '')); if (b) b.click(); }); await wait(300);
  assert.equal((await tiles(p)).find((x) => /Shaun/.test(x.name)).badge, '0.5');
  await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Stats')).click()); await wait(700);
  await p.evaluate(() => [...document.querySelectorAll('[role=tab], button')].find((x) => x.textContent.trim() === 'Rankings').click()); await wait(500);
  const ro = await p.evaluate(() => [...document.querySelectorAll('.stars.ro')].map((s) => s.getAttribute('aria-label')));
  assert.ok(ro.includes('0.5 out of 5 stars'), ro.join(','));
});
await ok('phone: no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
