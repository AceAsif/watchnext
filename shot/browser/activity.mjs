process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';
import { AUTO_YES } from './autoYes.js';

// Activity log with Undo: changes made on the show page appear in Settings → Activity, each
// with its own Undo that puts the exact old values back. TMDB mocked.
const PORT = 4205;
const DIST = APP_DIST; const OUT = workPath('out_activity'); fs.mkdirSync(OUT, { recursive: true });
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
const show = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).shows['tmdb:1']);
const openShow = async (p) => {
  await tab(p, 'Shows');
  await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Dark')).click()); await wait(600);
};
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-ep')].filter((r) => /^E\d/.test(r.textContent.trim())).map((r) => r.innerText.replace(/\s+/g, ' ').trim()));


const card = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid=activity] li')].map((li) => ({ st: li.dataset.status, t: li.innerText.replace(/\s+/g, ' ').trim() })));
const undoRow = (p, re) => p.evaluate((src) => { const li = [...document.querySelectorAll('[data-testid=activity] li')].find((x) => new RegExp(src).test(x.innerText)); li.querySelector('button').click(); }, re);

console.log('A. EMPTY');
let p = await open();
await tab(p, 'Settings');
await ok('Settings shows an Activity card, empty at first', async () => {
  assert.match(await p.evaluate(() => document.querySelector('#activity').innerText), /Your recent changes[\s\S]*Nothing yet/);
});

console.log('B. CHANGES ARE LOGGED');
await openShow(p);
await p.evaluate(() => { const h = [...document.querySelectorAll('button.sd-season-head')].find((b) => b.textContent.includes('S01')); if (h && h.getAttribute('aria-expanded') === 'false') h.click(); }); await wait(500);
await p.evaluate(() => { const f = document.querySelector('.sd-foldrow'); if (f && f.getAttribute('aria-expanded') === 'false') f.click(); }); await wait(200);
await until(p, () => !!document.querySelector('button[aria-label="Log another watch of S1E1"]'));
await p.evaluate(() => document.querySelector('button[aria-label="Log another watch of S1E1"]').click()); await wait(250);
await p.evaluate(() => document.querySelector('button[aria-label="Mark S1E2 unwatched"]').click()); await wait(250);
await tab(p, 'Settings');
await ok('both changes are listed, newest first, with the show, what happened and the time', async () => {
  const c = await card(p);
  assert.match(c[0].t, /^Dark Unwatched S1E2 22 Oct, 9:00 am · Show Undo$/, JSON.stringify(c));
  assert.match(c[1].t, /^Dark \+1 watch of S1E1 22 Oct, 9:00 am · Show Undo$/);
});

console.log('C. UNDO');
await undoRow(p, 'Unwatched S1E2'); await wait(300);
await ok('Undo brings S1E2 back with its ORIGINAL date, and says so', async () => {
  const s = await show(p); assert.deepEqual(s.watched['1x2'], { at: W1, min: 50 });
  assert.match(await p.evaluate(() => document.body.innerText), /Undone: Unwatched S1E2 — Dark/);
});
await ok('the undo is logged too, and the undone row shows "Undone" instead of a button', async () => {
  const c = await card(p);
  assert.match(c[0].t, /Undid “Unwatched S1E2”/);
  const r = c.find((x) => /Unwatched S1E2 22/.test(x.t)); assert.equal(r.st, 'undone'); assert.match(r.t, /Undone$/);
});
await undoRow(p, '\\+1 watch of S1E1'); await wait(300);
await ok('undoing the +1 puts the count back to one watch (first date untouched)', async () => {
  const s = await show(p); assert.deepEqual(s.watched['1x1'], { at: W1, min: 50 });
});
console.log('D. CHANGED AGAIN LATER');
await openShow(p);
await p.evaluate(() => { const h = [...document.querySelectorAll('button.sd-season-head')].find((b) => b.textContent.includes('S01')); if (h && h.getAttribute('aria-expanded') === 'false') h.click(); }); await wait(500);
await p.evaluate(() => { const f = document.querySelector('.sd-foldrow'); if (f && f.getAttribute('aria-expanded') === 'false') f.click(); }); await wait(200);
await until(p, () => !!document.querySelector('button[aria-label="Mark S1E3 unwatched"]'));
await p.evaluate(() => document.querySelector('button[aria-label="Mark S1E3 unwatched"]').click()); await wait(250);
await p.evaluate(() => document.querySelector('button[aria-label="Mark S1E3 watched"]').click()); await wait(250);
await tab(p, 'Settings');
await undoRow(p, 'Unwatched S1E3'); await wait(300);
await ok('undoing something you changed again later asks first (in the app, not a browser popup); Cancel changes nothing', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=undo-anyway]').innerText), /You changed Dark again after “Unwatched S1E3”/);
  await p.evaluate(() => [...document.querySelectorAll('.sd-confirm-acts button')].find((b) => b.textContent === 'Cancel').click()); await wait(300);
  const s = await show(p); assert.ok(s.watched['1x3']); assert.notEqual(s.watched['1x3'].at, W1);
});
await undoRow(p, 'Unwatched S1E3'); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('.sd-confirm-acts button')].find((b) => b.textContent === 'Undo anyway').click()); await wait(300);
await ok('"Undo anyway" puts back the original S1E3 with its first date', async () => {
  const s = await show(p); assert.deepEqual(s.watched['1x3'], { at: W1, min: 50 });
});
await ok('the log is saved on this device and survives a reload', async () => {
  await p.reload({ waitUntil: 'networkidle0' }); await wait(400); await tab(p, 'Settings');
  assert.equal((await card(p)).length, 7);
});
await ok('phone: no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.evaluate(() => document.querySelector('#activity').scrollIntoView()); await wait(200);
await p.screenshot({ path: path.join(OUT, 'activity_phone.png') });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
