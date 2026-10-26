process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';
import { computeMetrics, buildBadges } from '../../src/components/achievementsLogic.js';

// "Watch it Hot" (episodes within 24 hours of airing) and "Hot Ticket" (rare: 10 films within a
// week of release), in Hobart time; and the clearer Help page lines. TMDB mocked.
const PORT = 4252;
const DIST = APP_DIST; const OUT = workPath('out_hot_badges');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-26T09:00:00.000Z'); // Mon 26 Oct 2026, 8pm in Hobart
const SEEN = 'watchnext-badges-seen-v1';
const old = (d) => `2025-0${d}-01T10:00:00.000Z`;

// 9 films seen within a week of release; "Opening Night" (no release date saved yet) is the 10th.
const HOT9 = Array.from({ length: 9 }, (_, i) => ({ name: `Hot Film ${i + 1}`, tmdbId: 500 + i, status: 'watched', year: '2025', released: `2025-0${(i % 9) + 1}-10`, watchedAt: `2025-0${(i % 9) + 1}-14T10:00:00.000Z`, runtimeMin: 100 }));
const STATE = () => ({ shows: {
  // TMDB's last aired episode is S1E3, out today: ticking "Mark … E03 watched" makes it hot.
  'tmdb:1': { tmdbId: 1, name: 'Fresh Show', followed: true, runtimeMin: 45, totalEpisodes: 4, status: 'Returning Series', seasons: [{ n: 1, count: 4 }], lastSynced: '2026-10-26T00:00:00Z',
    lastAir: { date: '2026-10-26', season: 1, episode: 3 }, nextAir: { date: '2026-11-02', season: 1, episode: 4 },
    watched: { '1x1': { at: old(1), min: 45 }, '1x2': { at: old(2), min: 45 } } },
  // A whole season dropped yesterday; episode 3 is old.
  'tmdb:2': { tmdbId: 2, name: 'Drop Show', followed: true, runtimeMin: 30, totalEpisodes: 3, status: 'Ended', seasons: [{ n: 1, count: 3 }], lastSynced: '2026-10-26T00:00:00Z', watched: {} },
}, movies: [...HOT9, { name: 'Opening Night', tmdbId: 777, status: 'watched', year: '2026', watchedAt: '2026-10-24T10:00:00.000Z', runtimeMin: 110 }],
settings: { tmdbKey: 'TESTKEY' } });
const SEASON2 = { season_number: 1, episodes: [1, 2, 3].map((e) => ({ id: 2000 + e, episode_number: e, season_number: 1, name: `Drop ${e}`, runtime: 30, air_date: e < 3 ? '2026-10-25' : '2020-01-01' })) };
const SEASON1 = { season_number: 1, episodes: [1, 2, 3, 4].map((e) => ({ id: 1000 + e, episode_number: e, season_number: 1, name: `Fresh ${e}`, runtime: 45, air_date: ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'][e - 1] })) };
const MOVIE = { id: 777, title: 'Opening Night', runtime: 110, genres: [], release_date: '2026-10-22', credits: { cast: [], crew: [] }, 'watch/providers': { results: {} } };

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const p = page;
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
page.on('request', (r) => {
  const u = r.url();
  if (u.startsWith('http://localhost:')) return r.continue();
  if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
  if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
  const j = (b) => r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(b) });
  if (u.includes('api.themoviedb.org')) {
    const path_ = new URL(u).pathname;
    if (path_ === '/3/tv/2/season/1') return j(SEASON2);
    if (path_ === '/3/tv/1/season/1') return j(SEASON1);
    if (path_ === '/3/movie/777') return j(MOVIE);
    return j({ results: [], episodes: [], cast: [], crew: [] });
  }
  return r.abort();
});
const seenLevels = Object.fromEntries(buildBadges(computeMetrics(STATE())).map((b) => [b.id, b.level])); // what the library has already earned
await page.evaluateOnNewDocument((s, fixed, key, lv) => {
  if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.setItem(key, JSON.stringify({ v: 1, levels: lv })); sessionStorage.setItem('__s', '1'); }
  const RealDate = Date; const start = RealDate.now(); const b = fixed;
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
  window.Date = FakeDate;
}, STATE(), FIXED, SEEN, seenLevels);
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(800);

const tab = async (name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };
const note = () => p.evaluate(() => { const n = document.querySelector('[data-testid=badge-note]'); return n ? n.innerText.replace(/\s+/g, ' ').trim() : null; });
const closeNote = () => p.evaluate(() => { const b = document.querySelector('[data-testid=badge-note] .bn-x'); if (b) b.click(); });
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const openShow = async (name) => {
  await tab('Shows');
  await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(200);
  await p.evaluate((n) => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes(n)).click(), name); await wait(700);
};

console.log('A. WATCH IT HOT');
await ok('nothing new at the start: no note', async () => { assert.equal(await note(), null); });
await openShow('Fresh Show');
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Mark.*E0?3.*watched$/i.test(b.textContent.replace(/\s+/g, ' ').trim())).click()); await wait(600);
await ok('ticking today\'s episode (from the "Mark next" button) saves its air date, from TMDB\'s last aired episode', async () => {
  const w = (await stored()).shows['tmdb:1'].watched['1x3'];
  assert.equal(w.air, '2026-10-26');
});
await until(p, () => !!document.querySelector('[data-testid=badge-note]'));
await ok('"New badge!  Watch it Hot · Bronze"', async () => { const t = await note(); assert.match(t, /New badge!/); assert.match(t, /Watch it Hot · Bronze/); assert.match(t, /1 episode/); });
await closeNote(); await wait(300);
await p.evaluate(() => document.querySelector('.sd-back').click()); await wait(300);
await openShow('Drop Show');
await p.evaluate(() => { const h = [...document.querySelectorAll('button.sd-season-head')].find((b) => b.textContent.includes('S01')); if (h && h.getAttribute('aria-expanded') === 'false') h.click(); }); await wait(600);
await until(p, () => !!document.querySelector('button[aria-label="Mark S1E1 watched"]'));
for (const e of [1, 3]) { await p.evaluate((x) => document.querySelector(`button[aria-label="Mark S1E${x} watched"]`).click(), e); await wait(300); }
await ok('season list: an episode out yesterday is hot (air date from the list); a 2020 episode is not, and saves no air date', async () => {
  const w = (await stored()).shows['tmdb:2'].watched;
  assert.equal(w['1x1'].air, '2026-10-25'); assert.ok(!('air' in w['1x3']));
});
await ok('old watches and rewatches never count', async () => { const w = (await stored()).shows['tmdb:1'].watched; assert.ok(!('air' in w['1x1'])); });
await closeNote(); await wait(200);

console.log('B. HOT TICKET (RARE)');
await tab('Movies');
await p.evaluate(() => [...document.querySelectorAll('.sd-lgrid .sd-ltile')].find((t) => /Opening Night/.test(t.getAttribute('aria-label'))).click()); await wait(900);
await ok('opening the film saves its full release date (it was logged before dates were saved)', async () => {
  assert.ok((await stored()).movies.filter((m) => m.tmdbId === 777).every((m) => m.released === '2026-10-22'));
});
await p.keyboard.press('Escape'); await wait(400);
await until(p, () => /Rare badge/.test((document.querySelector('[data-testid=badge-note]') || {}).innerText || ''));
await ok('the 10th film within a week of release: "Rare badge! Hot Ticket · Rare · 10 films"', async () => {
  const t = await note(); assert.match(t, /Rare badge!/); assert.match(t, /Hot Ticket · Rare/); assert.match(t, /10 films/);
});
await ok('the note uses the Legend colour', async () => { assert.ok(await p.evaluate(() => document.querySelector('[data-testid=badge-note]').classList.contains('ach-l6'))); });
await wait(900); await p.screenshot({ path: path.join(OUT, 'rare_note_phone.png') });
await closeNote(); await wait(200);

console.log('C. STATS → BADGES');
await tab('Stats');
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.trim() === 'Badges').click()); await wait(600);
const card = (id) => p.evaluate((i) => { const c = document.querySelector(`[data-badge=${i}]`); return c ? { text: c.innerText.replace(/\s+/g, ' '), cls: c.className, dots: c.querySelectorAll('.ach-dots span').length } : null; }, id);
await ok('Hot Ticket: one dot, "Rare" chip, Legend colour, "Rare badge earned · 10 films"', async () => {
  const c = await card('hotticket');
  assert.equal(c.dots, 1); assert.match(c.cls, /ach-l6/); assert.match(c.cls, /ach-rare/);
  assert.match(c.text, /Hot Ticket/); assert.match(c.text, /Rare/); assert.match(c.text, /Rare badge earned · 10 films/);
});
await ok('Watch it Hot: Bronze, 2 episodes, next Silver at 10', async () => {
  const c = await card('hot');
  assert.equal(c.dots, 6); assert.match(c.cls, /ach-l1/); assert.match(c.text, /Watch it Hot/); assert.match(c.text, /Bronze/); assert.match(c.text, /Next: Silver at 10 episodes · 8 to go/);
});
await ok('the earned rare badge is listed with the top badges (first card)', async () => {
  assert.equal(await p.evaluate(() => document.querySelector('[data-badge]').dataset.badge), 'hotticket');
});
await ok('summary counts 17 badges', async () => { assert.match(await p.evaluate(() => document.querySelector('.ach-sum').innerText), /of 17 badges/); });
await p.evaluate(() => document.querySelector('[data-badge=hotticket]').scrollIntoView({ block: 'start' })); await wait(250);
await p.screenshot({ path: path.join(OUT, 'badges_phone.png') });

console.log('D. HELP PAGE LINES');
await tab('Settings');
await p.evaluate(() => document.querySelector('[data-testid=open-help]').click()); await wait(400);
await p.evaluate(() => [...document.querySelectorAll('.sd-help-q')].find((x) => /set a goal/i.test(x.textContent)).click()); await wait(300);
await ok('lines between questions are clearly visible (brighter than the old #232a35)', async () => {
  const c = await p.evaluate(() => getComputedStyle(document.querySelectorAll('.sd-help-item')[1]).borderTopColor);
  assert.equal(c, 'rgb(54, 64, 81)');
});
await ok('an open question and its answer are one block: lighter background and an amber bar on the left', async () => {
  const r = await p.evaluate(() => { const o = document.querySelector('.sd-help-item.open'); const cs = getComputedStyle(o); return { bg: cs.backgroundColor, sh: cs.boxShadow }; });
  assert.equal(r.bg, 'rgb(26, 32, 41)'); assert.match(r.sh, /inset/); assert.match(r.sh, /3px 0px 0px/);
});
await ok('the badges answer explains the two new badges', async () => {
  await p.evaluate(() => [...document.querySelectorAll('.sd-help-q')].find((x) => /badges work/i.test(x.textContent)).click()); await wait(300);
  const t = await p.evaluate(() => [...document.querySelectorAll('.sd-help-item.open .sd-help-a')].map((a) => a.innerText).join(' '));
  assert.match(t, /Watch it Hot/); assert.match(t, /Hot Ticket/);
});
await p.evaluate(() => document.querySelector('.sd-help-item.open').scrollIntoView({ block: 'center' })); await wait(250);
await p.screenshot({ path: path.join(OUT, 'help_phone.png') });

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
