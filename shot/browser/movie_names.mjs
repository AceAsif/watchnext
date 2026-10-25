process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// The Amazing Spider-Man 2 problem: viewings of one film saved under different names.
// The movie sheet shows the film's current name + poster for every viewing; a viewing saved
// under a really different name gets "Saved as …" with Fix match / Use the new name (undoable);
// Settings → Old movie names updates them all at once. TMDB mocked.
const PORT = 4248;
const DIST = APP_DIST; const OUT = workPath('out_movie_names');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-25T08:00:00.000Z');

const MOVIES = () => [
  { tmdbId: 102382, name: 'Amazing Spiderman 2: Rise of Electro', poster: '/old.jpg', year: '2014', status: 'watched', watchedAt: '2015-03-01T10:00:00.000Z', runtimeMin: 142, rating: 3 },
  { tmdbId: 102382, name: 'The Amazing Spider-Man 2', poster: '/new.jpg', year: '2014', status: 'watched', watchedAt: '2026-10-01T10:00:00.000Z', runtimeMin: 142 },
  { tmdbId: 102382, name: 'the amazing spider man 2', poster: '/new.jpg', year: '2014', status: 'watched', watchedAt: '2020-06-01T10:00:00.000Z', runtimeMin: 142 },
  { tmdbId: 949, name: 'Heat', poster: '/h.jpg', year: '1995', status: 'watched', watchedAt: '2026-09-01T10:00:00.000Z', runtimeMin: 170 },
];
const STATE = () => ({ shows: {}, movies: MOVIES(), settings: { tmdbKey: 'TESTKEY' } });
const DETAILS = {
  102382: { id: 102382, title: 'The Amazing Spider-Man 2', poster_path: '/tmdb-asm2.jpg', release_date: '2014-04-16', runtime: 142, genres: [], credits: { cast: [], crew: [] } },
  949: { id: 949, title: 'Heat', poster_path: '/h.jpg', release_date: '1995-12-15', runtime: 170, genres: [], credits: { cast: [], crew: [] } },
  557: { id: 557, title: 'Spider-Man', poster_path: '/sm.jpg', release_date: '2002-05-01', runtime: 121, genres: [] },
};

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
let offline = false; // TMDB unreachable
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  page.on('dialog', (d) => { problems.push('native dialog: ' + d.message()); d.dismiss(); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (offline && u.includes('api.themoviedb.org')) return r.abort('internetdisconnected');
    const j = (b) => r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(b) });
    const url = new URL(u);
    const m = /^\/3\/movie\/(\d+)$/.exec(url.pathname);
    if (m && DETAILS[m[1]]) return j(DETAILS[m[1]]);
    if (url.pathname === '/3/search/movie') return j({ results: [{ id: 557, title: 'Spider-Man', release_date: '2002-05-01', poster_path: '/sm.jpg' }] });
    if (u.includes('api.themoviedb.org')) return j({ results: [], episodes: [], cast: [], crew: [] });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.setItem('watchnext-badges-seen-v1', JSON.stringify({ v: 1, levels: {} })); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };
const openTile = async (p, re) => { await p.evaluate((r) => [...document.querySelectorAll('.sd-lgrid .sd-ltile')].find((t) => new RegExp(r).test(t.getAttribute('aria-label'))).click(), re); await wait(700); };
const sheet = (p) => p.evaluate(() => { const d = document.querySelector('[role=dialog]'); const img = d && d.querySelector('.sd-mdet-head img'); return d ? { title: d.getAttribute('aria-label'), poster: img ? img.getAttribute('src') : null, savedAs: (d.querySelector('[data-testid=saved-as]') || {}).innerText || null } : null; });
const pickViewing = async (p, re) => { await p.evaluate((r) => [...document.querySelectorAll('.sd-view')].find((b) => new RegExp(r).test(b.textContent)).click(), re); await wait(400); };
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));

console.log('A. ONE NAME AND POSTER FOR EVERY VIEWING');
let p = await open();
await tab(p, 'Movies');
await ok('the grid shows one tile for the film (3 viewings), under its newest name', async () => {
  const labels = await p.evaluate(() => [...document.querySelectorAll('.sd-lgrid .sd-ltile')].map((t) => t.getAttribute('aria-label')));
  assert.equal(labels.filter((l) => /spider/i.test(l)).length, 1);
  assert.ok(labels.some((l) => /The Amazing Spider-Man 2/.test(l)), labels.join(' | '));
});
await openTile(p, 'Amazing Spider-Man 2');
await until(p, () => !!document.querySelector('.sd-view'));
await ok('newest viewing: TMDB\'s current name and poster, no "Saved as"', async () => {
  const s = await sheet(p);
  assert.equal(s.title, 'The Amazing Spider-Man 2'); assert.match(s.poster, /tmdb-asm2\.jpg/); assert.equal(s.savedAs, null);
});
await pickViewing(p, '2015');
await ok('the 2015 viewing (saved as "…Rise of Electro") still shows the SAME name and poster', async () => {
  const s = await sheet(p);
  assert.equal(s.title, 'The Amazing Spider-Man 2'); assert.match(s.poster, /tmdb-asm2\.jpg/);
});
await ok('…with a "Saved as" line and two buttons', async () => {
  const s = await sheet(p);
  assert.match(s.savedAs, /This viewing was saved as “Amazing Spiderman 2: Rise of Electro”\. If it was a different film, use Fix match\./);
  assert.match(s.savedAs, /Fix match/); assert.match(s.savedAs, /Use the new name/);
});
await p.evaluate(() => document.querySelector('[data-testid=saved-as]').scrollIntoView({ block: 'center' })); await wait(300);
await p.screenshot({ path: path.join(OUT, 'saved_as_phone.png') });
await pickViewing(p, '2020');
await ok('a viewing saved with a small spelling difference shows no "Saved as" line', async () => { assert.equal((await sheet(p)).savedAs, null); });
await ok('phone: no sideways scroll in the sheet', async () => { assert.ok(await p.evaluate(() => { const s = document.querySelector('.sd-sheet'); return s.scrollWidth <= s.clientWidth; })); });

console.log('B. FIX MATCH AND USE THE NEW NAME');
await pickViewing(p, '2015');
await p.evaluate(() => [...document.querySelectorAll('[data-testid=saved-as] button')].find((b) => b.textContent === 'Fix match').click()); await wait(600);
await ok('"Fix match" opens the search for that viewing, filled with its saved name', async () => {
  assert.ok(await p.evaluate(() => !!document.querySelector('[data-testid=fix-match]')));
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid=fix-match] input').value), 'Amazing Spiderman 2: Rise of Electro');
});
await p.evaluate(() => [...document.querySelectorAll('.sd-mdet-actions .sd-btn')].find((b) => b.textContent === 'Fix match').click()); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('[data-testid=saved-as] button')].find((b) => b.textContent === 'Use the new name').click()); await wait(500);
await ok('"Use the new name" updates only that viewing (name + poster) and says it can be undone', async () => {
  const m = (await stored(p)).movies;
  assert.equal(m[0].name, 'The Amazing Spider-Man 2'); assert.equal(m[0].poster, '/tmdb-asm2.jpg'); assert.equal(m[0].rating, 3);
  assert.equal(m[2].name, 'the amazing spider man 2'); // the others are untouched
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=notice]').textContent), /now uses “The Amazing Spider-Man 2”.*undo/);
  assert.equal((await sheet(p)).savedAs, null);
});
await p.keyboard.press('Escape'); await wait(300);
await tab(p, 'Settings');
await ok('it is in Your recent changes, and Undo brings the old name back', async () => {
  const t = await p.evaluate(() => document.querySelector('#activity, [aria-label="Your recent changes"]').innerText);
  assert.match(t, /Used the current film name/);
  await p.evaluate(() => [...document.querySelectorAll('[aria-label="Your recent changes"] button')].find((b) => /^Undo/.test(b.textContent.trim())).click()); await wait(500);
  assert.equal((await stored(p)).movies[0].name, 'Amazing Spiderman 2: Rise of Electro');
});

console.log('C. SETTINGS → OLD MOVIE NAMES');
await ok('the card lists the film with its old name (not the small spelling difference)', async () => {
  const t = await p.evaluate(() => document.querySelector('[aria-label="Old movie names"]').innerText.replace(/\s+/g, ' '));
  assert.match(t, /The Amazing Spider-Man 2 \(2014\) Saved as: “Amazing Spiderman 2: Rise of Electro”/);
  assert.doesNotMatch(t, /the amazing spider man 2/); assert.doesNotMatch(t, /Heat/);
  assert.match(t, /Use the newest names \(1\)/);
});
await p.evaluate(() => document.querySelector('[aria-label="Old movie names"]').scrollIntoView({ block: 'center' })); await wait(300);
await p.screenshot({ path: path.join(OUT, 'settings_phone.png') });
await p.evaluate(() => document.querySelector('[data-testid=use-newest-names]').click()); await wait(500);
await ok('"Use the newest names" updates it, the card goes away, the banner says so', async () => {
  assert.equal((await stored(p)).movies[0].name, 'The Amazing Spider-Man 2');
  assert.ok(!(await p.evaluate(() => !!document.querySelector('[aria-label="Old movie names"]'))));
  assert.match(await p.evaluate(() => document.querySelector('.sd-banner .txt').textContent), /Updated 1 viewing to the film's newest name/);
  assert.match(await p.evaluate(() => document.querySelector('[aria-label="Your recent changes"]').innerText), /Used the newest film names \(1\)/);
});
await ok('phone: no sideways scroll', async () => { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); });
await p.close();

console.log('D. OFFLINE');
p = await open({ w: 1280, h: 860 });
await tab(p, 'Movies');
offline = true;
await openTile(p, 'Amazing Spider-Man 2'); await wait(600);
await ok('without TMDB the sheet uses the newest viewing\'s name and poster', async () => {
  const s = await sheet(p); assert.equal(s.title, 'The Amazing Spider-Man 2'); assert.match(s.poster || '', /new\.jpg/);
});
offline = false;
await p.screenshot({ path: path.join(OUT, 'sheet_desktop.png') });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
