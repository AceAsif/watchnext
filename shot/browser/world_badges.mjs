process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Stats → Badges (achievements) and Stats → World (countries + languages map). TMDB is mocked.
const PORT = 4198;
const DIST = APP_DIST; const OUT = workPath('out_world'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED = Date.parse('2026-10-21T08:00:00.000Z');
const ORIGINS_KEY = 'watchnext-origins-v1';
const CORS = { 'access-control-allow-origin': '*' };

// ---- the fake TMDB world
const MOVIE = {
  10: { id: 10, title: 'RRR', origin_country: ['IN'], original_language: 'te' },
  11: { id: 11, title: 'Heat', origin_country: ['US'], original_language: 'en' },
  12: { id: 12, title: 'Spirited Away', origin_country: ['JP'], original_language: 'ja' },
  13: { id: 13, title: 'Old co-production', origin_country: [], production_countries: [{ iso_3166_1: 'GB' }, { iso_3166_1: 'FR' }], original_language: 'fr' },
};
const TV = {
  1: { id: 1, name: 'Squid Game', origin_country: ['KR'], original_language: 'ko' },
  2: { id: 2, name: 'Frieren', origin_country: ['JP'], original_language: 'ja' },
  3: { id: 3, name: 'Sacred Games', origin_country: ['IN'], original_language: 'hi' },
};
const eps = (n, day) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`1x${i + 1}`, { at: `${day}T1${i % 10}:00:00.000Z`, min: 30 }]));
const mv = (name, id, d, o = {}) => ({ name, ...(id != null ? { tmdbId: id } : null), status: 'watched', watchedAt: `${d}T10:00:00.000Z`, runtimeMin: 120, poster: null, year: '2001', genres: ['Drama'], ...o });
const STATE = () => ({
  shows: {
    'tmdb:1': { tmdbId: 1, name: 'Squid Game', followed: true, totalEpisodes: 9, genres: ['Drama'], watched: eps(9, '2026-10-01') },
    'tmdb:2': { tmdbId: 2, name: 'Frieren', followed: true, totalEpisodes: 28, genres: ['Animation'], watched: eps(100, '2026-10-02') },
    'tmdb:3': { tmdbId: 3, name: 'Sacred Games', followed: true, totalEpisodes: 16, genres: ['Crime'], watched: eps(2, '2026-10-03') },
    'tvdb:9': { name: 'Unlinked Show', followed: true, watched: eps(1, '2020-01-01') },
  },
  movies: [
    mv('RRR', 10, '2026-10-04', { platform: 'cinema', rating: 4.5 }), mv('RRR', 10, '2026-10-05'),
    mv('Heat', 11, '2026-09-01', { year: '1995' }), mv('Spirited Away', 12, '2026-09-02', { genres: ['Animation'] }),
    mv('Old co-production', 13, '2026-09-03', { year: '1960' }), mv('Unlinked film', null, '2019-01-01'),
    { name: 'Planned', tmdbId: 14, status: 'planned' },
  ],
  settings: { tmdbKey: 'TESTKEY' },
});

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 80)); };

async function open(state, { w = 390, h = 844, origins = null, keep = false, failIds = [] } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  const log = []; const fail = new Set(failIds);
  page.on('request', async (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    let m = /api\.themoviedb\.org\/3\/movie\/(\d+)\?/.exec(u);
    if (m) { log.push('m' + m[1]); await wait(20); if (fail.has('m' + m[1])) return r.respond({ status: 500, headers: CORS, contentType: 'application/json', body: '{}' }); return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ belongs_to_collection: null, ...(MOVIE[m[1]] || { id: +m[1] }) }) }); }
    m = /api\.themoviedb\.org\/3\/tv\/(\d+)\?/.exec(u);
    if (m) { log.push('t' + m[1]); await wait(20); if (fail.has('t' + m[1])) return r.respond({ status: 500, headers: CORS, contentType: 'application/json', body: '{}' }); return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(TV[m[1]] || { id: +m[1] }) }); }
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: '{"episodes":[],"results":[]}' });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, origins, key, fixed, keep) => {
    if (!keep && !sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); if (origins) localStorage.setItem(key, origins); else localStorage.removeItem(key); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, state, origins, ORIGINS_KEY, FIXED, keep);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Stats')).click()); await wait(500);
  return { page, log };
}
const toTab = (p, name) => p.evaluate((n) => document.getElementById(`stats-tab-${n}`).click(), name);
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const lookups = (log) => log.filter((x) => /^[mt]\d+$/.test(x)).sort();
const doneLooking = (p) => until(p, () => !document.querySelector('.wm-status'));

console.log('A. TABS');
let { page: p, log } = await open(STATE());
await ok('Stats has six tabs, ending with Badges and World', async () => {
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.sd-tabs [role=tab]')].map((b) => b.textContent)), ['Overview', 'Habits', 'Rankings', 'Breakdown', 'Badges', 'World']);
});
await ok('phone: the tab bar fits or scrolls inside itself; the page never scrolls sideways', async () => { assert.equal(await noSideways(p), false); });
await ok('nothing is looked up on TMDB until Badges or World is opened', async () => { assert.deepEqual(lookups(log), []); });

console.log('B. WORLD — FIRST VISIT');
await toTab(p, 'World');
await until(p, () => !!document.querySelector('[data-testid=world]'));
await doneLooking(p);
await until(p, () => document.querySelectorAll('[data-testid=world-map] path').length > 100);
await ok('every linked watched title is looked up once (films once each, planned + unlinked skipped)', async () => {
  assert.deepEqual(lookups(log), ['m10', 'm11', 'm12', 'm13', 't1', 't2', 't3']);
});
const tiles = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid=world] [data-stat]')].map((t) => [t.dataset.stat, t.querySelector('.sd-tile-v').textContent])));
await ok('tiles: 6 countries (IN KR JP US GB FR), 6 languages', async () => {
  assert.deepEqual(await tiles(), { countries: '6', languages: '6' });
});
await ok('country list: most titles first, India and Japan have 2 each', async () => {
  const rows = await p.evaluate(() => [...document.querySelectorAll('.wm-row')].map((r) => `${r.querySelector('.wm-name').textContent}:${r.querySelector('.wm-count').textContent}`));
  assert.deepEqual(rows.slice(0, 2).sort(), ['India:2', 'Japan:2']);
  assert.equal(rows.length, 6);
  assert.ok(rows.includes('South Korea:1') && rows.includes('United Kingdom:1') && rows.includes('France:1'));
});
await ok('the map shades countries you watched from, and leaves the rest plain', async () => {
  const r = await p.evaluate(() => ({ IN: document.querySelector('[data-code=IN]').getAttribute('class'), BR: document.querySelector('[data-code=BR]').getAttribute('class'), lit: document.querySelectorAll('.wm-c:not(.wm-l0)').length }));
  assert.match(r.IN, /wm-l2/); assert.match(r.BR, /wm-l0/); assert.equal(r.lit, 6);
});
await ok('languages: Japanese first, every language named in English', async () => {
  const langs = await p.evaluate(() => [...document.querySelectorAll('[data-bar]')].map((b) => b.dataset.bar));
  assert.equal(langs[0], 'Japanese');
  assert.deepEqual(langs.slice().sort(), ['English', 'French', 'Hindi', 'Japanese', 'Korean', 'Telugu']);
});
await ok('the note says how many titles are not linked to TMDB', async () => { assert.match(await p.evaluate(() => document.querySelector('[data-testid=world]').innerText), /2 titles aren’t linked to TMDB/); });
await p.evaluate(() => document.querySelector('.wm-row[data-country=IN]').click()); await wait(200);
await ok('tapping a country in the list shows what you watched from there', async () => {
  const t = await p.evaluate(() => document.querySelector('[data-testid=world-country]').innerText);
  assert.match(t, /India/); assert.match(t, /1 show · 1 film/); assert.match(t, /RRR/); assert.match(t, /Sacred Games/);
  assert.match(await p.evaluate(() => document.querySelector('[data-code=IN]').getAttribute('class')), /wm-sel/);
});
await p.evaluate(() => document.querySelector('[data-code=KR]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await wait(200);
await ok('tapping a country on the map works too', async () => { assert.match(await p.evaluate(() => document.querySelector('[data-testid=world-country]').innerText), /South Korea[\s\S]*Squid Game/); });
await p.evaluate(() => document.querySelector('[data-code=BR]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await wait(150);
await ok('tapping a country with nothing watched does nothing', async () => { assert.match(await p.evaluate(() => document.querySelector('[data-testid=world-country]').innerText), /South Korea/); });
await p.evaluate(() => [...document.querySelectorAll('.wm-filter button')].find((b) => b.textContent === 'Movies').click()); await wait(250);
await ok('Movies filter: only films count (IN US JP GB FR), the selection is cleared', async () => {
  assert.deepEqual(await tiles(), { countries: '5', languages: '4' });
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid=world-country]')), null);
});
await p.evaluate(() => [...document.querySelectorAll('.wm-filter button')].find((b) => b.textContent === 'Shows').click()); await wait(250);
await ok('Shows filter: KR JP IN, 3 languages', async () => { assert.deepEqual(await tiles(), { countries: '3', languages: '3' }); });
await ok('phone: no sideways scroll on World', async () => { assert.equal(await noSideways(p), false); });
await p.evaluate(() => [...document.querySelectorAll('.wm-filter button')].find((b) => b.textContent === 'All').click()); await wait(200);
await p.screenshot({ path: `${OUT}/world_phone.png`, fullPage: true });

console.log('C. BADGES');
await toTab(p, 'Badges');
await until(p, () => !!document.querySelector('[data-testid=badges] [data-badge]'));
const lv = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-badge]')].map((b) => [b.dataset.badge, +b.dataset.level])));
await ok('17 badges; levels follow the library', async () => {
  const l = await lv();
  assert.equal(Object.keys(l).length, 17);
  assert.equal(l.episodes, 1); // 112 episodes -> Bronze
  assert.equal(l.finished, 1); // Squid Game watched to the end
  assert.equal(l.cinema, 1); assert.equal(l.rewatch, 1); assert.equal(l.anime, 1); // Frieren + Spirited Away = 2 -> Bronze
  assert.equal(l.languages, 1); // films in te, en, ja, fr = 4 -> Bronze (3)
  assert.equal(l.countries, 1); // 6 countries -> Bronze (5)
  assert.equal(l.movies, 0); // 5 films, first level is 10
});
await ok('no extra TMDB lookups: Badges reuses what World already found', async () => { assert.equal(log.filter((x) => /^[mt]\d+$/.test(x)).length, 7); });
await ok('earned badges come first, highest level first; every line names the NEXT level and how many to go', async () => {
  const r = await p.evaluate(() => [...document.querySelectorAll('[data-badge]')].map((b) => ({ id: b.dataset.badge, lvl: +b.dataset.level, chip: (b.querySelector('.ach-chip') || {}).textContent || '', next: b.querySelector('.ach-next').textContent })));
  const firstLocked = r.findIndex((x) => x.lvl === 0);
  assert.ok(firstLocked > 0 && r.slice(firstLocked).every((x) => x.lvl === 0));
  const earned = r.slice(0, firstLocked).map((x) => x.lvl);
  assert.deepEqual(earned, earned.slice().sort((x, y) => y - x));
  assert.equal(r.find((x) => x.id === 'episodes').chip, 'Bronze');
  assert.equal(r.find((x) => x.id === 'movies').next, 'Next: Bronze at 10 films · 5 to go');
  assert.equal(r.find((x) => x.id === 'episodes').next, 'Next: Silver at 500 episodes · 388 to go');
});
await ok('every badge is drawn as a Gem hex: earned ones solid in the level colour, locked ones grey and dashed', async () => {
  const r = await p.evaluate(() => [...document.querySelectorAll('[data-badge]')].map((b) => ({ lvl: +b.dataset.level, svg: !!b.querySelector('svg.ach-gem'), facets: b.querySelectorAll('svg.ach-gem path[d^="M42 46"]').length, dashed: !!b.querySelector('svg.ach-gem polygon[stroke-dasharray]'), emoji: /\p{Extended_Pictographic}/u.test(b.querySelector('.ach-top').textContent) })));
  assert.ok(r.every((x) => x.svg && x.facets === 6 && !x.emoji));
  assert.ok(r.filter((x) => x.lvl === 0).every((x) => x.dashed));
  assert.ok(r.filter((x) => x.lvl > 0).every((x) => !x.dashed));
  const gold = await p.evaluate(() => document.querySelector('[data-badge=episodes] svg.ach-gem path').getAttribute('fill'));
  assert.equal(gold, 'rgb(205,127,50)'); // Bronze top facet
});
await ok('summary: badges earned and levels', async () => { assert.match(await p.evaluate(() => document.querySelector('.ach-sum').innerText), /\d+ of 17 badges[\s\S]*\d+ of \d+ levels/); });
await ok('phone: no sideways scroll on Badges', async () => { assert.equal(await noSideways(p), false); });
await p.screenshot({ path: `${OUT}/badges_phone.png`, fullPage: true });
await p.close();

console.log('D. SECOND VISIT USES THE CACHE');
const saved = await (async () => { const r = await open(STATE()); await toTab(r.page, 'World'); await doneLooking(r.page); await wait(300); const c = await r.page.evaluate((k) => localStorage.getItem(k), ORIGINS_KEY); await r.page.close(); return c; })();
({ page: p, log } = await open(STATE(), { origins: saved }));
await toTab(p, 'World'); await wait(800);
await ok('nothing is looked up again; the counts are there straight away', async () => { assert.deepEqual(lookups(log), []); assert.deepEqual(await tiles(), { countries: '6', languages: '6' }); });
await ok('the cache is device-only: it is not in the library (so never synced or backed up)', async () => {
  assert.equal(await p.evaluate(() => /origin_country|watchnext-origins/.test(localStorage.getItem('watchnext-state-v1'))), false);
});
await p.close();

console.log('E. A LOOKUP FAILS');
({ page: p, log } = await open(STATE(), { failIds: ['t3'] }));
await toTab(p, 'World');
await until(p, () => /couldn’t be looked up/.test(document.querySelector('[data-testid=world]').innerText));
await ok('a failed title is reported with Try again; the rest is shown', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=world]').innerText), /1 title couldn’t be looked up/);
  assert.deepEqual(await tiles(), { countries: '6', languages: '5' }); // India still there via RRR; Hindi missing
});
const before = log.length;
await p.evaluate(() => [...document.querySelectorAll('.wm-status button')].find((b) => b.textContent === 'Try again').click());
await until(p, () => document.querySelector('[data-testid=world] .wm-status') && /couldn’t/.test(document.querySelector('[data-testid=world] .wm-status').innerText), null, 4000).catch(() => {});
await wait(500);
await ok('Try again asks only for the failed title', async () => { assert.deepEqual(log.slice(before), ['t3']); });
await p.close();

console.log('F. EMPTY LIBRARY AND DESKTOP');
({ page: p, log } = await open({ shows: { 'tmdb:1': { tmdbId: 1, name: 'Squid Game', watched: eps(1, '2026-10-01') } }, movies: [], settings: { tmdbKey: 'TESTKEY' } }));
await toTab(p, 'Badges'); await until(p, () => !!document.querySelector('[data-badge]')); await wait(400);
await ok('a tiny library: every badge shows, most not earned yet, no errors', async () => { const l = await lv(); assert.equal(Object.keys(l).length, 17); assert.equal(l.episodes, 0); });
await p.close();
({ page: p } = await open(STATE(), { w: 1280, h: 900 }));
await toTab(p, 'World'); await doneLooking(p); await until(p, () => document.querySelectorAll('[data-testid=world-map] path').length > 100);
await ok('desktop: no sideways scroll; the map is wide', async () => {
  assert.equal(await noSideways(p), false);
  assert.ok(await p.evaluate(() => document.querySelector('[data-testid=world-map]').getBoundingClientRect().width > 500));
});
await p.screenshot({ path: `${OUT}/world_desktop.png`, fullPage: true });
await toTab(p, 'Badges'); await wait(500);
await p.screenshot({ path: `${OUT}/badges_desktop.png`, fullPage: true });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
