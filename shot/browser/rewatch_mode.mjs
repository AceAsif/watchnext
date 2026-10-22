process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Rewatch mode: start from the show page's ⋯ menu, tick episodes (first dates kept), Up Next
// offers the next one, Undo, auto-finish, and the "Rewatched 1×" line. TMDB mocked.
const PORT = 4204;
const DIST = APP_DIST; const OUT = workPath('out_rwm'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z');
const W1 = '2020-05-01T10:00:00.000Z';
const STATE = () => ({ shows: { 'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-10-01T00:00:00Z', runtimeMin: 50, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: { '1x1': { at: W1, min: 50 }, '1x2': { at: W1, min: 50 }, '1x3': { at: W1, min: 50 } } } }, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const SEASON = { episodes: [1, 2, 3].map((i) => ({ id: 100 + i, episode_number: i, name: `Ep ${i}`, runtime: 50, air_date: '2017-12-01', overview: '' })) };

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
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
const show = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).shows['tmdb:1']);
const openShow = async (p) => {
  await tab(p, 'Shows');
  await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Dark')).click()); await wait(600);
};
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-ep')].filter((r) => /^E\d/.test(r.textContent.trim())).map((r) => r.innerText.replace(/\s+/g, ' ').trim()));

console.log('A. START');
let p = await open();
await tab(p, 'Up Next');
await ok('a finished show is not in Up Next before a rewatch', async () => { assert.doesNotMatch(await p.evaluate(() => document.body.innerText), /Mark Dark/); });
await openShow(p);
await p.evaluate(() => document.querySelector('button[aria-label="More actions"]').click()); await wait(250);
await ok('the ⋯ menu offers "Start a rewatch (keeps your first watch dates)"', async () => { assert.match(await p.evaluate(() => document.querySelector('[data-testid=rewatch-row]').textContent), /Start a rewatch/); });
await p.evaluate(() => document.querySelector('[data-testid=rewatch-row]').click()); await wait(300);
await until(p, () => !!document.querySelector('[data-testid=rewatch-bar]'));
await ok('the show page shows "↻ Rewatch #1 · 0 of 3" and a Mark S01·E01 rewatched button', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=rewatch-bar]').innerText), /Rewatch #1 · 0 of 3[\s\S]*first watch dates are kept/);
  assert.match(await p.evaluate(() => document.body.innerText), /Mark S01·E01 rewatched/);
});
await p.evaluate(() => { const h = [...document.querySelectorAll('button.sd-season-head')].find((b) => b.textContent.includes('S01')); if (h && h.getAttribute('aria-expanded') === 'false') h.click(); }); await wait(500);
await p.evaluate(() => { const f = document.querySelector('.sd-foldrow'); if (f && f.getAttribute('aria-expanded') === 'false') f.click(); }); await wait(200);
await until(p, () => [...document.querySelectorAll('.sd-ep')].filter((r) => /^E\d/.test(r.textContent.trim())).length === 3);
await ok('episode ticks show this round (all empty), with no +1 buttons; first dates still shown', async () => {
  const r = await rows(p);
  assert.ok(r.every((x) => /Watched 1 May 2020/.test(x)), JSON.stringify(r));
  assert.equal(await p.evaluate(() => document.querySelectorAll('.sd-check[aria-pressed=true]').length), 0);
  assert.equal(await p.evaluate(() => document.querySelectorAll('.sd-rewatch').length), 0);
});
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Mark S01·E01 rewatched/.test(b.textContent)).click()); await wait(300);
await ok('ticking E01: "Watched 1 May 2020 · 2× · rewatched 22 Oct 2026" — the first date is kept', async () => {
  assert.match((await rows(p))[0], /Watched 1 May 2020 · 2× · rewatched 22 Oct 2026/);
  const s = await show(p); assert.equal(s.watched['1x1'].at, W1); assert.equal(s.watched['1x1'].n, 2);
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=rewatch-bar]').innerText), /1 of 3/);
});
await p.screenshot({ path: `${OUT}/show_phone.png` });

console.log('B. UP NEXT');
await tab(p, 'Up Next');
await ok('Up Next offers the next episode of the rewatch', async () => {
  const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  assert.match(t, /Dark S01·E02 · rewatching ↻ Rewatch #1 · 1 of 3/);
});
await p.evaluate(() => document.querySelector('button[aria-label^="Mark Dark S01"]').click()); await wait(250);
await ok('marking from Up Next says "rewatched" and Undo puts it back exactly', async () => {
  assert.match(await p.evaluate(() => document.querySelector('.sd-toast').innerText), /rewatched · Dark/);
  await p.evaluate(() => [...document.querySelectorAll('.sd-toast button')].find((b) => b.textContent.trim() === 'Undo').click()); await wait(250);
  const s = await show(p); assert.equal(s.watched['1x2'].n || 1, 1); assert.equal(s.rewatch.done['1x2'], undefined);
});
await p.evaluate(() => document.querySelector('button[aria-label^="Mark Dark S01"]').click()); await wait(1300);
await p.evaluate(() => document.querySelector('button[aria-label^="Mark Dark S01"]').click()); await wait(300);
await ok('the last episode finishes the rewatch ("rewatch finished 🎉") and the show leaves Up Next', async () => {
  assert.match(await p.evaluate(() => document.querySelector('.sd-toast').innerText), /rewatch finished/);
  const s = await show(p); assert.equal(s.rewatch, undefined); assert.equal(s.rewatchLog.length, 1); assert.equal(s.rewatchLog[0].eps, 3);
  assert.deepEqual(Object.values(s.watched).map((w) => w.at), [W1, W1, W1]);
});
await openShow(p);
await ok('the show page now says "↻ Rewatched 1× · last 3 episodes, finished 22 Oct 2026"', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=rewatch-past]').textContent), /Rewatched 1× · last 3 episodes, finished 22 Oct 2026/);
});
await ok('phone: no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
