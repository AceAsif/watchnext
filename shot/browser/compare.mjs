process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Compare with a friend: Stats → Friends opens the page; "Share mine" saves a small file
// (titles, ratings, ♥, finished only); "Open a friend's file" reads one, kept on this device;
// taste match, They loved / Both watched / You loved, ＋ Watchlist, open a show, replace by name,
// two-tap remove, bad files, Back/Esc, phone + desktop. TMDB mocked.
const PORT = 4244;
const DIST = APP_DIST; const OUT = workPath('out_compare'); const DL = workPath('out_compare/dl');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-24T09:00:00.000Z');
const W = (k) => Object.fromEntries(k.map((x) => [x, { at: '2026-01-01T00:00:00Z' }]));

const STATE = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, watched: W(['1x1', '1x2']), totalEpisodes: 2, status: 'Ended', rating: 5, seasons: [{ n: 1, count: 2 }], lastSynced: '2026-10-21T00:00:00Z', notes: { '1x1': { text: 'my secret note' } } },
  'tmdb:2': { tmdbId: 2, name: 'Andor', followed: true, watched: W(['1x1']), rating: 3, favourite: true, seasons: [{ n: 1, count: 12 }], lastSynced: '2026-10-21T00:00:00Z' },
  'tmdb:5': { tmdbId: 5, name: 'Slow Horses', followed: true, watched: W(['1x1']), rating: 4.5, seasons: [{ n: 1, count: 6 }], lastSynced: '2026-10-21T00:00:00Z' },
  'tmdb:3': { tmdbId: 3, name: 'Bluey', watchlist: true, followed: false, watched: {}, seasons: [{ n: 1, count: 50 }] },
}, movies: [
  { tmdbId: 10, name: 'Heat', status: 'watched', rating: 4, year: '1995', watchedAt: '2026-01-01T00:00:00Z' },
  { tmdbId: 12, name: 'Dune', status: 'watched', rating: 3, year: '2021', watchedAt: '2026-02-01T00:00:00Z' },
], settings: { tmdbKey: 'TESTKEY' } });

const ROB = (extra = []) => ({ kind: 'watchnext-compare', v: 1, name: 'Rob', at: '2026-10-20T08:00:00.000Z', shows: [
  { id: 1, n: 'Dark', w: 26, r: 4.5, done: 1 },
  { id: 2, n: 'Andor', w: 12, r: 2 },
  { id: 3, n: 'Bluey', w: 50, r: 5 },
  { id: 20, n: 'The Bear', w: 20, r: 4, p: '/bear.jpg' },
  { id: 21, n: 'Meh Show', w: 3, r: 3 },
  ...extra,
], movies: [
  { id: 10, n: 'Heat', y: '1995', r: 5 },
  { id: 12, n: 'Dune', y: '2021', r: 2 },
  { id: 30, n: 'Arrival', y: '2016', r: 4.5 },
] });
const writeJson = (name, obj) => { const f = path.join(OUT, name); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };

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
    const url = new URL(u);
    if (url.pathname === '/3/tv/20') return j({ id: 20, name: 'The Bear', poster_path: '/bear.jpg', number_of_episodes: 28, seasons: [{ season_number: 1, episode_count: 8 }], genres: [] });
    if (url.pathname === '/3/movie/30') return j({ id: 30, title: 'Arrival', release_date: '2016-11-10', runtime: 116, poster_path: '/arr.jpg', genres: [] });
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
const onCompare = (p) => p.evaluate(() => !!document.querySelector('.sd-cmppage'));
const msg = (p) => p.evaluate(() => { const m = document.querySelector('[data-testid=cmp-msg]'); return m ? m.textContent : ''; });
const rowNames = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid=cmp-list] .name')].map((x) => x.textContent));
const tabs = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-cmp-tabs [role=tab]')].map((b) => b.textContent));
const pickTab = async (p, label) => { await p.evaluate((l) => [...document.querySelectorAll('.sd-cmp-tabs [role=tab]')].find((b) => b.textContent.startsWith(l)).click(), label); await wait(250); };
const upload = async (p, file) => { const h = await p.$('input[type=file][aria-label="Friend\'s compare file"]'); await h.uploadFile(file); await wait(500); };
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });

console.log('A. OPEN FROM STATS, EMPTY');
let p = await open();
await tab(p, 'Stats');
await ok('Stats has a "Friends" button next to Notes', async () => {
  assert.match(await p.evaluate(() => document.querySelector('.sd-stats-btns').innerText.replace(/\s+/g, ' ')), /Friends.*Notes/);
});
await p.evaluate(() => document.querySelector('[data-testid=open-compare]').click()); await wait(400);
await ok('it opens Compare with a friend: share and open steps, no friends yet', async () => {
  assert.ok(await onCompare(p)); assert.equal(await p.evaluate(() => document.querySelector('nav.tabbar button.active').textContent.trim()), 'Stats');
  const t = await p.evaluate(() => document.querySelector('.sd-cmppage').innerText);
  assert.match(t, /Share yours/i); assert.match(t, /3 shows · 2 movies/); assert.match(t, /Open a friend's file/i);
  assert.ok(!(await p.evaluate(() => !!document.querySelector('.sd-cmp-friends'))));
});

console.log('B. SHARE MINE');
const cdp = await p.target().createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await p.evaluate(() => { const i = document.querySelector('input[aria-label="Your name"]'); i.focus(); i.select(); });
await p.keyboard.type('Asif 1/2');
await p.evaluate(() => document.querySelector('[data-testid=share-mine]').click());
await until(p, () => /Saved watchnext-compare/.test((document.querySelector('[data-testid=cmp-msg]') || {}).textContent || ''));
await wait(800);
await ok('typing a name with numbers and "/" does not trigger keyboard shortcuts', async () => { assert.ok(await onCompare(p)); });
await ok('"Share mine" saves a dated file with only titles, ratings, ♥ and finished', async () => {
  const files = fs.readdirSync(DL).filter((f) => f.endsWith('.json'));
  assert.deepEqual(files, ['watchnext-compare-asif-1-2-2026-10-24.json']);
  const j = JSON.parse(fs.readFileSync(path.join(DL, files[0]), 'utf8'));
  assert.equal(j.kind, 'watchnext-compare'); assert.equal(j.name, 'Asif 1/2');
  assert.deepEqual(j.shows.map((s) => s.n).sort(), ['Andor', 'Dark', 'Slow Horses']);
  const txt = JSON.stringify(j);
  for (const bad of ['secret', 'watchedAt', 'Bluey', 'TESTKEY', '2026-01-01']) assert.ok(!txt.includes(bad), bad);
});
await ok('your name is remembered on this device', async () => {
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-friends-v1')).me), 'Asif 1/2');
});

console.log('C. OPEN A FRIEND\'S FILE');
await upload(p, writeJson('not-compare.json', { app: 'WatchNext', shows: {} }));
await ok('a backup file is refused with a clear message', async () => { assert.match(await msg(p), /looks like a backup/); });
await upload(p, writeJson('junk.json', 'hello'));
await ok('a random file is refused', async () => { assert.match(await msg(p), /isn’t a WatchNext compare file/); });
await upload(p, writeJson('rob.json', ROB()));
await ok('Rob\'s file is added and chosen', async () => {
  assert.match(await msg(p), /Added Rob’s file \(5 shows · 3 movies\)/);
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.sd-cmp-friends button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])), [['Rob', 'true']]);
});
await ok('taste match from titles you both rated (Dark, Andor, Heat, Dune)', async () => {
  // diffs .5, 1, 1, 1 → 3.5/4 = .875 → 100*(1-.875/4.5) = 81
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid=match]').textContent), '81%');
  assert.match(await p.evaluate(() => document.querySelector('.sd-cmp-head').innerText), /From 4 titles you've both rated/);
  assert.match(await p.evaluate(() => document.querySelector('.sd-cmp-head').innerText), /file from 20 Oct/);
});
await ok('tabs: Rob loved · Both watched · You loved, with counts', async () => {
  assert.deepEqual(await tabs(p), ['Rob loved3', 'Both watched4', 'You loved1']);
});
await ok('Rob loved: highest rated first (Arrival 4½, The Bear 4); Bluey (on your watchlist) last; not Meh Show', async () => {
  assert.deepEqual(await rowNames(p), ['Arrival', 'The Bear', 'Bluey']);
  const acts = await p.evaluate(() => [...document.querySelectorAll('.sd-cmp-row')].map((r) => (r.querySelector('button.sd-btn, .sd-cmp-tag') || {}).textContent));
  assert.deepEqual(acts, ['＋ Watchlist', '＋ Watchlist', 'On your watchlist']);
});
await wait(300);
await p.screenshot({ path: path.join(OUT, 'compare_phone.png'), fullPage: true });
await ok('phone: no sideways scroll', async () => { assert.ok(await noScroll(p)); });
await p.evaluate(() => [...document.querySelectorAll('.sd-cmp-row')].find((r) => r.textContent.includes('The Bear')).querySelector('button.sd-btn').click());
await until(p, () => /Added “The Bear”/.test((document.querySelector('[data-testid=cmp-msg]') || {}).textContent || ''));
await p.evaluate(() => [...document.querySelectorAll('.sd-cmp-row')].find((r) => r.textContent.includes('Arrival')).querySelector('button.sd-btn').click());
await until(p, () => /Added “Arrival”/.test((document.querySelector('[data-testid=cmp-msg]') || {}).textContent || ''));
await ok('＋ Watchlist adds the show and the film to your watchlist, and the row says so', async () => {
  const s = await stored(p);
  assert.equal(s.shows['tmdb:20'].watchlist, true);
  assert.ok(s.movies.some((m) => m.tmdbId === 30 && m.status === 'planned'));
  const tags = await p.evaluate(() => [...document.querySelectorAll('.sd-cmp-tag')].map((x) => x.textContent));
  assert.equal(tags.length, 3);
});
await pickTab(p, 'Both watched');
await ok('Both watched: what you both loved first, with both ratings', async () => {
  assert.deepEqual(await rowNames(p), ['Dark', 'Heat', 'Andor', 'Dune']);
  assert.match(await p.evaluate(() => document.querySelector('.sd-cmp-row').innerText.replace(/\s+/g, ' ')), /Rob ★ 4½ You ★ 5/);
});
await pickTab(p, 'You loved');
await ok('You loved: Slow Horses (Rob has not seen it)', async () => { assert.deepEqual(await rowNames(p), ['Slow Horses']); });
await p.evaluate(() => document.querySelector('.sd-cmp-row .sd-cmp-main').click()); await wait(600);
await ok('tapping a show of yours opens its page; Back returns to Compare', async () => {
  assert.ok(await p.evaluate(() => /Slow Horses/.test(document.body.innerText) && !!document.querySelector('.sd-back') && !document.querySelector('.sd-cmppage')));
  await p.evaluate(() => document.querySelector('.sd-back').click()); await wait(400);
  assert.ok(await onCompare(p));
});

console.log('D. UPDATE, SECOND FRIEND, REMOVE, REMEMBERED');
await upload(p, writeJson('rob2.json', ROB([{ id: 5, n: 'Slow Horses', w: 6, r: 5 }])));
await ok('a new file from Rob replaces the old one (no second Rob)', async () => {
  assert.match(await msg(p), /Updated Rob’s file/);
  assert.equal(await p.evaluate(() => document.querySelectorAll('.sd-cmp-friends button').length), 1);
  assert.deepEqual(await tabs(p), ['Rob loved3', 'Both watched5', 'You loved0']); // the 3 are now all on your watchlist
});
await upload(p, writeJson('sam.json', { kind: 'watchnext-compare', v: 1, name: 'Sam', shows: [{ id: 1, n: 'Dark', w: 1, r: 1 }], movies: [] }));
await ok('with a friend added, the share card is compact (two buttons and "Shares as …")', async () => {
  assert.ok(await p.evaluate(() => !!document.querySelector('.sd-cmp-share.compact')));
  assert.match(await p.evaluate(() => document.querySelector('.sd-cmp-share').innerText), /Shares as Asif 1\/2/);
  await p.evaluate(() => document.querySelector('.sd-cmp-change').click()); await wait(200);
  assert.ok(await p.evaluate(() => !document.querySelector('.sd-cmp-share.compact') && !!document.querySelector('input[aria-label="Your name"]')));
});
await ok('a second friend; few shared ratings shows a hint instead of a %', async () => {
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.sd-cmp-friends button')].map((b) => b.textContent)), ['Sam', 'Rob']);
  assert.ok(!(await p.evaluate(() => !!document.querySelector('[data-testid=match]'))));
  assert.match(await p.evaluate(() => document.querySelector('.sd-cmp-match').innerText), /2 more of the same titles/);
});
await p.reload({ waitUntil: 'networkidle0' }); await wait(400);
await tab(p, 'Stats'); await p.evaluate(() => document.querySelector('[data-testid=open-compare]').click()); await wait(400);
await ok('after a reload both friends are still there (kept on this device)', async () => {
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.sd-cmp-friends button')].map((b) => b.textContent)), ['Sam', 'Rob']);
});
await p.evaluate(() => document.querySelector('.sd-cmp-remove').click()); await wait(200);
await ok('Remove asks for a second tap first', async () => {
  assert.match(await p.evaluate(() => document.querySelector('.sd-cmp-remove').textContent), /Tap again to remove Sam/);
  assert.equal(await p.evaluate(() => document.querySelectorAll('.sd-cmp-friends button').length), 2);
});
await p.evaluate(() => document.querySelector('.sd-cmp-remove').click()); await wait(300);
await ok('the second tap removes Sam and shows Rob', async () => {
  assert.match(await msg(p), /Removed Sam’s file/);
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.sd-cmp-friends button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])), [['Rob', 'true']]);
});
await ok('friends are not put into your synced library', async () => {
  const s = JSON.stringify(await stored(p)); assert.ok(!s.includes('"Sam"') && !s.includes('watchnext-compare'));
});
await p.evaluate(() => document.activeElement && document.activeElement.blur());
await p.keyboard.press('Escape'); await wait(300);
await ok('Esc goes back to Stats', async () => { assert.ok(!(await onCompare(p))); assert.ok(await p.evaluate(() => !!document.querySelector('[data-testid=open-compare]'))); });
await p.close();

console.log('E. DESKTOP');
p = await open({ w: 1280, h: 900 });
await p.evaluate((d) => localStorage.setItem('watchnext-friends-v1', JSON.stringify(d)), { me: 'Asif', friends: [{ id: 'f1', name: 'Rob', at: '2026-10-20T08:00:00.000Z', added: '2026-10-24T08:00:00.000Z', shows: ROB().shows, movies: ROB().movies }] });
await tab(p, 'Stats'); await p.evaluate(() => document.querySelector('[data-testid=open-compare]').click()); await wait(500);
await ok('desktop: one readable column, no sideways scroll', async () => {
  const w = await p.evaluate(() => document.querySelector('.sd-cmppage').getBoundingClientRect().width);
  assert.ok(w <= 820, String(w)); assert.ok(await noScroll(p));
});
await p.screenshot({ path: path.join(OUT, 'compare_desktop.png') });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
