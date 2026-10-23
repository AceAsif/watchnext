process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Spoiler shield: off by default; when on, unwatched episode titles show as "Episode N" on the
// show page and in Up Next → On the way, their summary is hidden until "Show anyway", and
// watched episodes stay as they are. TMDB mocked.
const PORT = 4233;
const DIST = APP_DIST; const OUT = workPath('out_spoilers');
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
    nextAir: { season: 29, episode: 4, date: '2026-10-29', name: 'Turd Burglars' }, upcoming: [{ s: 29, e: 4, name: 'Turd Burglars', air: '2026-10-29' }] },
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
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.removeItem('watchnext-spoilers-v1'); localStorage.setItem('watchnext-badges-seen-v1', JSON.stringify({ v: 1, levels: {} })); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };
const openDark = async (p) => {
  await tab(p, 'Shows');
  await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Dark')).click()); await wait(600);
  await p.evaluate(() => { const h = [...document.querySelectorAll('button.sd-season-head')].find((b) => b.textContent.includes('S01')); if (h && h.getAttribute('aria-expanded') === 'false') h.click(); }); await wait(500);
  await p.evaluate(() => { const f = document.querySelector('.sd-foldrow'); if (f && f.getAttribute('aria-expanded') === 'false') f.click(); }); await wait(300);
  await until(p, () => document.querySelectorAll('.sd-ep-title').length === 3);
};
const titles = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-ep-title')].map((b) => b.textContent));
const agenda = (p) => p.evaluate(() => document.body.innerText.match(/South Park\n[^\n]*/g) || []);
const tapEp = (p, i) => p.evaluate((i) => document.querySelectorAll('.sd-ep-title')[i].click(), i);

console.log('A. OFF (DEFAULT)');
let p = await open();
await ok('Up Next → On the way shows the episode title', async () => { assert.ok((await agenda(p)).some((l) => /S29·E04 Turd Burglars/.test(l)), JSON.stringify(await agenda(p))); });
await openDark(p);
await ok('show page: every title is shown', async () => { assert.deepEqual(await titles(p), ['Secrets', 'Lies', 'Past and Present']); });
await tab(p, 'Settings');
await ok('Settings has a Spoiler shield card, off', async () => {
  const t = await p.evaluate(() => document.querySelector('#spoilers').innerText);
  assert.match(t, /Spoiler shield/); assert.match(t, /Kept on this device only/);
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid=spoiler-toggle]').checked), false);
});
await p.evaluate(() => document.querySelector('[data-testid=spoiler-toggle]').click()); await wait(200);
await ok('turning it on is saved on this device and the card says On', async () => {
  assert.equal(await p.evaluate(() => localStorage.getItem('watchnext-spoilers-v1')), 'on');
  assert.match(await p.evaluate(() => document.querySelector('#spoilers').innerText), /On/);
});
await p.evaluate(() => document.querySelector('#spoilers').scrollIntoView({ block: 'center' })); await wait(200);
await p.screenshot({ path: path.join(OUT, 'settings_phone.png') });

console.log('B. ON');
await tab(p, 'Up Next');
await ok('On the way: the unwatched episode keeps its code but loses its title', async () => {
  const a = await agenda(p);
  assert.ok(a.some((l) => /S29·E04$/.test(l.trim())), JSON.stringify(a)); assert.ok(!a.some((l) => /Turd Burglars/.test(l)));
});
await openDark(p);
await ok('show page: the watched episode keeps its title; unwatched ones show "Episode N · hidden"', async () => {
  assert.deepEqual(await titles(p), ['Secrets', 'Episode 2', 'Episode 3']);
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('[data-testid=shielded-title]'), '::after').content), '" · hidden"');
});
await tapEp(p, 1); await wait(200);
await ok('tapping a hidden episode does not show its summary, only "Show anyway"', async () => {
  const t = await p.evaluate(() => document.querySelector('[data-testid=episode-summary]').innerText);
  assert.match(t, /hidden by Spoiler shield/); assert.doesNotMatch(t, /time machine/);
});
await ok('phone: no sideways scroll', async () => { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); });
await p.evaluate(() => document.querySelector('[data-testid=episode-summary]').scrollIntoView({ block: 'center' })); await wait(200);
await p.screenshot({ path: path.join(OUT, 'show_phone.png') });
await p.evaluate(() => [...document.querySelectorAll('.sd-ep-reveal')][0].click()); await wait(200);
await ok('"Show anyway" reveals that one episode (title and summary) and no other', async () => {
  assert.deepEqual(await titles(p), ['Secrets', 'Lies', 'Episode 3']);
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=episode-summary]').innerText), /time machine/);
});
await tapEp(p, 0); await wait(200);
await ok('a watched episode\'s summary shows as normal', async () => { assert.match(await p.evaluate(() => document.querySelector('[data-testid=episode-summary]').innerText), /A boy goes missing/); });
await p.evaluate(() => document.querySelector('button[aria-label="Mark S1E3 watched"]').click()); await wait(300);
await ok('once you watch an episode its title comes back', async () => { assert.equal((await titles(p))[2], 'Past and Present'); });
await p.close();

console.log('C. REMEMBERED');
p = await open();
await p.evaluate(() => { localStorage.setItem('watchnext-spoilers-v1', 'on'); }); await p.reload({ waitUntil: 'networkidle0' }); await wait(400);
await openDark(p);
await ok('after a reload the shield is still on (and "Show anyway" is forgotten)', async () => { assert.deepEqual(await titles(p), ['Secrets', 'Episode 2', 'Episode 3']); });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
