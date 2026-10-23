process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// "New badge!" note: quiet the first time, a note when a level is reached, "See badges" opens
// Stats → Badges, no second note after Undo + redo, nothing saved for an empty library.
const PORT = 4232;
const DIST = APP_DIST; const OUT = workPath('out_badge_note');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z');
const SEEN = 'watchnext-badges-seen-v1';

// 99 episodes watched of 100: the next one reaches "Episode explorer · Bronze" (100 episodes).
const watched = {}; for (let i = 1; i <= 99; i++) watched[`1x${i}`] = { at: `2024-01-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`, min: 30 };
const FULL = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Long Show', followed: true, runtimeMin: 30, totalEpisodes: 100, seasons: [{ n: 1, count: 100 }], watched, lastSynced: '2026-10-21T00:00:00Z' },
}, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const EMPTY = () => ({ shows: {}, movies: [], settings: { tmdbKey: 'TESTKEY' } });

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
async function open(state, { w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (/\/tv\/1\/season\/1$/.test(new URL(u).pathname)) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ season_number: 1, episodes: Array.from({ length: 100 }, (_, i) => ({ id: 1000 + i, episode_number: i + 1, season_number: 1, name: `Ep ${i + 1}`, air_date: '2020-01-01', runtime: 30, overview: '' })) }) });
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ results: [], episodes: [], cast: [], crew: [] }) });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed, key) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.removeItem(key); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, state, FIXED, SEEN);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };
const note = (p) => p.evaluate(() => { const n = document.querySelector('[data-testid=badge-note]'); return n ? n.innerText.replace(/\s+/g, ' ').trim() : null; });
const seen = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), SEEN);
const markNext = (p) => p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Mark S01.?·.?E100 watched/.test(b.textContent.replace(/\s+/g, ''))  || /MarkS01·E100watched/.test(b.textContent.replace(/\s+/g, ''))).click());

console.log('A. FIRST TIME, THEN A NEW LEVEL');
let p = await open(FULL());
await wait(2000);
await ok('first time: today\'s levels are saved quietly, no note', async () => {
  assert.equal(await note(p), null);
  const s = await seen(p); assert.equal(s.levels.episodes, 0); assert.equal(s.levels.finished, 0);
});
await tab(p, 'Shows');
await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(200);
await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Long Show')).click()); await wait(600);
await markNext(p);
await until(p, () => !!document.querySelector('[data-testid=badge-note]'), null, 5000);
await ok('marking the 100th episode shows the note (several badges at once: highest first)', async () => {
  const t = await note(p);
  assert.match(t, /new badge levels!/, t);
  assert.match(t, /Episode explorer · Bronze/); assert.match(t, /Finisher · Bronze/);
  assert.match(t, /See badges/);
});
await ok('the saved levels went up', async () => { const s = await seen(p); assert.equal(s.levels.episodes, 1); assert.equal(s.levels.finished, 1); });
await wait(500);
await ok('phone: the note fits, no sideways scroll', async () => {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  const r = await p.evaluate(() => { const b = document.querySelector('[data-testid=badge-note]').getBoundingClientRect(); return [b.left, b.right, b.top]; });
  assert.ok(r[0] >= 0 && r[1] <= 390 && r[2] >= 0, String(r));
});
await p.screenshot({ path: path.join(OUT, 'note_phone.png') });
await p.evaluate(() => [...document.querySelectorAll('[data-testid=badge-note] button')].find((b) => b.textContent.startsWith('See badges')).click()); await wait(500);
await ok('"See badges" opens Stats → Badges and closes the note', async () => {
  assert.equal(await note(p), null);
  assert.ok(await p.evaluate(() => !!document.querySelector('[data-testid=badges]')));
  assert.equal(await p.evaluate(() => document.querySelector('[data-badge=episodes]').dataset.level), '1');
});
await tab(p, 'Up Next'); await tab(p, 'Stats');
await ok('opening Stats from the tab bar later starts at Overview again', async () => {
  assert.equal(await p.evaluate(() => !!document.querySelector('[data-testid=badges]')), false);
});
await p.close();

console.log('B. UNDO AND REDO');
p = await open(FULL());
await wait(2000);
await tab(p, 'Shows');
await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(200);
await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Long Show')).click()); await wait(600);
await markNext(p);
await until(p, () => !!document.querySelector('[data-testid=badge-note]'), null, 5000);
await p.evaluate(() => document.querySelector('[data-testid=badge-note] button[aria-label=Close]').click()); await wait(200);
await ok('✕ closes the note', async () => { assert.equal(await note(p), null); });
await p.evaluate(() => { const h = [...document.querySelectorAll('button.sd-season-head')].find((b) => b.textContent.includes('S01')); if (h && h.getAttribute('aria-expanded') === 'false') h.click(); }); await wait(500);
await p.evaluate(() => { const f = document.querySelector('.sd-foldrow'); if (f && f.getAttribute('aria-expanded') === 'false') f.click(); }); await wait(300);
await until(p, () => !!document.querySelector('button[aria-label="Mark S1E100 unwatched"]'));
await p.evaluate(() => document.querySelector('button[aria-label="Mark S1E100 unwatched"]').click());
await wait(2200);
await ok('unmarking drops below the level quietly (the saved level stays)', async () => { assert.equal(await note(p), null); assert.equal((await seen(p)).levels.episodes, 1); });
await p.evaluate(() => document.querySelector('button[aria-label="Mark S1E100 watched"]').click());
await wait(2500);
await ok('marking it again: no second note for the same level', async () => {
  assert.ok(await p.evaluate(() => !!JSON.parse(localStorage.getItem('watchnext-state-v1')).shows['tmdb:1'].watched['1x100']), 'E100 is watched again');
  assert.equal(await note(p), null);
});
await p.close();

console.log('C. EMPTY LIBRARY');
p = await open(EMPTY());
await wait(2200);
await ok('an empty library saves nothing (a synced or imported library will start quietly)', async () => { assert.equal(await seen(p), null); assert.equal(await note(p), null); });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
