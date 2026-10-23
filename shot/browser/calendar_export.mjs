process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Calendar export: Up Next → On the way → calendar button → sheet → a valid .ics download with
// one all-day event per upcoming episode; the next export offers only new episodes; Spoiler
// shield leaves titles out. TMDB mocked.
const PORT = 4234;
const DIST = APP_DIST; const OUT = workPath('out_calx');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z'); // 22 Oct 2026, 09:00 in Hobart

const STATE = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, runtimeMin: 50, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], lastSynced: '2026-10-21T00:00:00Z', watched: { '1x1': { at: '2026-10-01T10:00:00.000Z', min: 50 } } },
  'tmdb:2': { tmdbId: 2, name: 'South Park', followed: true, runtimeMin: 22, totalEpisodes: 10, seasons: [{ n: 29, count: 10 }], lastSynced: '2026-10-21T00:00:00Z', watched: {},
    nextAir: { season: 29, episode: 4, date: '2026-10-29', name: 'Turd Burglars' }, upcoming: [{ s: 29, e: 4, name: 'Turd Burglars', air: '2026-10-29' }, { s: 29, e: 5, name: 'Episode 5', air: '2026-11-05' }] },
}, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const EPS = [
  { id: 101, episode_number: 1, season_number: 1, name: 'Secrets', overview: 'A boy goes missing.', air_date: '2017-12-01', runtime: 50 },
  { id: 102, episode_number: 2, season_number: 1, name: 'Lies', overview: 'BIG SPOILER: the cave is a time machine.', air_date: '2017-12-01', runtime: 50 },
  { id: 103, episode_number: 3, season_number: 1, name: 'Past and Present', overview: 'More secrets.', air_date: '2017-12-01', runtime: 50 },
];

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    const j = (b) => r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(b) });
    const p = new URL(u).pathname;
    if (/\/tv\/1\/season\/1$/.test(p)) return j({ season_number: 1, episodes: EPS });
    if (/\/tv\/2\/season\/29$/.test(p)) return j({ season_number: 29, episodes: [{ id: 2904, episode_number: 4, season_number: 29, name: 'Turd Burglars', air_date: '2026-10-29', overview: '' }] });
    if (u.includes('api.themoviedb.org')) return j({ results: [], episodes: [], cast: [], crew: [] });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.removeItem('watchnext-spoilers-v1'); localStorage.removeItem('watchnext-cal-exported-v1'); localStorage.setItem('watchnext-badges-seen-v1', JSON.stringify({ v: 1, levels: {} })); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };

const DL = workPath('calx_downloads'); fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
const ics = async () => { for (let i = 0; i < 40; i++) { const f = fs.readdirSync(DL).filter((x) => x.endsWith('.ics')); if (f.length) { await wait(200); const txt = fs.readFileSync(path.join(DL, f[0]), 'utf8'); fs.rmSync(path.join(DL, f[0])); return { name: f[0], txt }; } await wait(150); } throw new Error('no download'); };
const sheet = (p) => p.evaluate(() => { const d = document.querySelector('[data-testid=cal-export]'); return d ? d.closest('[role=dialog]').innerText.replace(/\s+/g, ' ').trim() : null; });
const openSheet = async (p) => { await p.evaluate(() => document.querySelector('[data-testid=cal-export-open]').click()); await until(p, () => !!document.querySelector('[data-testid=cal-export]')); };

console.log('A. FIRST EXPORT');
let p = await open();
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await ok('On the way has an "Add to your calendar" button', async () => { assert.ok(await p.evaluate(() => !!document.querySelector('[data-testid=cal-export-open]'))); });
await openSheet(p);
await ok('the sheet says how many episodes and when, and explains all-day events', async () => {
  const t = await sheet(p);
  assert.match(t, /Add to your calendar/); assert.match(t, /2 episodes on the way · 29 Oct – 5 Nov/); assert.match(t, /all-day event/);
  assert.match(t, /Download 2 episodes \(\.ics\)/); assert.doesNotMatch(t, /not added before/, 'no choice on the first export');
});
await ok('phone: no sideways scroll', async () => { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); });
await p.screenshot({ path: path.join(OUT, 'sheet_phone.png') });
await p.evaluate(() => document.querySelector('[data-testid=cal-download]').click());
const f1 = await ics();
await ok('downloads watchnext-episodes-<today>.ics with one all-day event per episode', async () => {
  assert.equal(f1.name, 'watchnext-episodes-2026-10-22.ics');
  const u = f1.txt.replace(/\r\n /g, '');
  assert.equal((u.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(u, /SUMMARY:South Park · S29E04 · Turd Burglars\r\n/); assert.match(u, /SUMMARY:South Park · S29E05\r\n/);
  assert.match(u, /DTSTART;VALUE=DATE:20261029/); assert.match(u, /Mark it watched in WatchNext: http:\/\/localhost:4234\//);
});
await ok('then it says how to add the file on iPhone, Google and Outlook', async () => {
  const t = await sheet(p);
  assert.match(t, /Downloaded 2 episodes/); assert.match(t, /Add All/); assert.match(t, /Import & export/); assert.match(t, /nothing is added twice/);
});
await p.screenshot({ path: path.join(OUT, 'done_phone.png') });
await p.evaluate(() => [...document.querySelectorAll('[data-testid=cal-export] button')].find((b) => b.textContent === 'Done').click()); await wait(300);

console.log('B. NEXT EXPORT');
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('watchnext-state-v1')); s.shows['tmdb:2'].upcoming.push({ s: 29, e: 6, name: 'Six', air: '2026-11-12' }); localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); });
await p.reload({ waitUntil: 'networkidle0' }); await wait(400);
await cdp.detach(); const cdp2 = await p.createCDPSession(); await cdp2.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await openSheet(p);
await ok('a new episode: the sheet offers "only the 1 not added before" (picked) or all 3', async () => {
  const t = await sheet(p);
  assert.match(t, /Only the 1 episode not added before/); assert.match(t, /All 3 episodes/); assert.match(t, /Download 1 episode \(\.ics\)/);
});
await p.evaluate(() => document.querySelector('[data-testid=cal-download]').click());
const f2 = await ics();
await ok('the file has only the new episode', async () => {
  const u = f2.txt.replace(/\r\n /g, '');
  assert.equal((u.match(/BEGIN:VEVENT/g) || []).length, 1); assert.match(u, /S29E06 · Six/);
});
await p.evaluate(() => [...document.querySelectorAll('[data-testid=cal-export] button')].find((b) => b.textContent === 'Done').click()); await wait(300);
await openSheet(p);
await ok('nothing new: it says so, and still lets you download all again', async () => {
  const t = await sheet(p); assert.match(t, /already exported all of these/); assert.match(t, /Download 3 episodes/);
});
await p.close();

console.log('C. SPOILER SHIELD');
p = await open();
await p.evaluate(() => localStorage.setItem('watchnext-spoilers-v1', 'on')); await p.reload({ waitUntil: 'networkidle0' }); await wait(400);
const cdp3 = await p.createCDPSession(); await cdp3.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await openSheet(p);
await ok('the sheet says titles are left out', async () => { assert.match(await sheet(p), /Spoiler shield is on, so episode titles are left out/); });
await p.evaluate(() => document.querySelector('[data-testid=cal-download]').click());
const f3 = await ics();
await ok('the file has no episode titles', async () => { assert.doesNotMatch(f3.txt, /Turd Burglars/); assert.match(f3.txt.replace(/\r\n /g, ''), /SUMMARY:South Park · S29E04\r\n/); });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
