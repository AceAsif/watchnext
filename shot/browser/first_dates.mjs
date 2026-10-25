process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';
import { AUTO_YES } from './autoYes.js';

// Settings → Backup → "Bring back first watch dates": a backup's earlier first dates replace
// ones the old +1 button overwrote, after a preview; Undo in Your recent changes. TMDB mocked.
const PORT = 4208;
const DIST = APP_DIST; const OUT = workPath('out_firstdates'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z');
const W1 = '2020-05-01T10:00:00.000Z';
const STATE = () => ({ shows: { 'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-10-01T00:00:00Z', runtimeMin: 50, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: { '1x1': { at: '2026-10-11T09:00:00.000Z', min: 50, n: 2 }, '1x2': { at: W1, min: 50 }, '1x3': { at: '2026-10-18T09:00:00.000Z', min: 50, n: 2 } } } }, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const BACKUP = path.join(OUT, 'backup.json');
fs.writeFileSync(BACKUP, JSON.stringify({ shows: { 'tmdb:1': { tmdbId: 1, name: 'Dark', watched: { '1x1': { at: '2020-05-01T10:00:00', n: 1 }, '1x2': { at: W1 }, '1x3': { at: '2020-05-03T10:00:00', n: 1 } } } }, movies: [], goals: {}, hidden: {}, settings: {} }));
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



console.log('A. PREVIEW');
let p = await open();
await tab(p, 'Settings');
const input = await p.$('input[aria-label="Backup file with your first watch dates"]');
await input.uploadFile(BACKUP); await wait(500);
await ok('choosing a backup shows what it would bring back, before anything changes', async () => {
  const t = await p.evaluate(() => document.querySelector('[data-testid=first-dates]').innerText.replace(/\s+/g, ' '));
  assert.match(t, /^Dark S1E1 1 May 2020 now 11 Oct 2026 S1E3 3 May 2020 now 18 Oct 2026$/, t);
  assert.match(await p.evaluate(() => document.body.innerText), /2 episodes in 1 show/);
  assert.equal((await show(p)).watched['1x1'].at, '2026-10-11T09:00:00.000Z');
});
await p.screenshot({ path: path.join(OUT, 'firstdates_sheet.png') });
await p.evaluate(() => [...document.querySelectorAll('.sd-confirm-acts button')].find((b) => /Bring back 2 dates/.test(b.textContent)).click()); await wait(400);
await ok('applying brings the first dates back, keeps the counts, and keeps the October dates as "last"', async () => {
  const w = (await show(p)).watched;
  assert.equal(w['1x1'].at, '2020-05-01T10:00:00'); assert.equal(w['1x1'].n, 2); assert.equal(w['1x1'].last, '2026-10-11T09:00:00.000Z');
  assert.equal(w['1x3'].at, '2020-05-03T10:00:00');
  assert.match(await p.evaluate(() => document.body.innerText), /Brought back 2 first watch dates/);
});
await ok('the show page reads "Watched 1 May 2020 · 2× · last 11 Oct 2026"', async () => {
  await openShow(p);
  await p.evaluate(() => { const h = [...document.querySelectorAll('button.sd-season-head')].find((b) => b.textContent.includes('S01')); if (h && h.getAttribute('aria-expanded') === 'false') h.click(); }); await wait(500);
  await p.evaluate(() => { const f = document.querySelector('.sd-foldrow'); if (f && f.getAttribute('aria-expanded') === 'false') f.click(); }); await wait(300);
  assert.match(await p.evaluate(() => document.body.innerText), /Watched 1 May 2020 · 2× · last 11 Oct 2026/);
});
await tab(p, 'Settings');
await ok('the same backup again finds nothing more to bring back', async () => {
  const inp = await p.$('input[aria-label="Backup file with your first watch dates"]'); await inp.uploadFile(BACKUP); await wait(500);
  assert.match(await p.evaluate(() => document.body.innerText), /Nothing to bring back/);
});
await ok('it can be undone from Your recent changes', async () => {
  await p.evaluate(() => { const li = [...document.querySelectorAll('[data-testid=activity] li')].find((x) => /Brought back 2 first watch dates/.test(x.innerText)); li.querySelector('button').click(); }); await wait(400);
  assert.equal((await show(p)).watched['1x1'].at, '2026-10-11T09:00:00.000Z');
});
await ok('phone: no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
