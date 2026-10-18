process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Movies → Collections: film series with "3 of 8 watched", the next film in release order,
// "Add next to watchlist", and a Collection section in the movie sheet. TMDB is mocked.
const PORT = 4196;
const DIST = APP_DIST; const OUT = workPath('out_coll'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED = Date.parse('2026-10-01T22:00:00.000Z');
const CACHE_KEY = 'watchnext-collections-v1';
const CORS = { 'access-control-allow-origin': '*' };

// ---- the fake TMDB world
const COLLS = {
  1241: { name: 'Harry Potter Collection', films: [[674, 'Harry Potter and the Goblet of Fire', '2005-11-16'], [671, "Harry Potter and the Philosopher's Stone", '2001-11-16'], [672, 'Harry Potter and the Chamber of Secrets', '2002-11-13'], [673, 'Harry Potter and the Prisoner of Azkaban', '2004-05-31'], [675, 'Harry Potter and the Order of the Phoenix', '2007-06-28'], [767, 'Harry Potter and the Half-Blood Prince', '2009-07-07'], [12444, 'Harry Potter and the Deathly Hallows: Part 1', '2010-10-17'], [12445, 'Harry Potter and the Deathly Hallows: Part 2', '2011-07-07']] },
  404609: { name: 'John Wick Collection', films: [[245891, 'John Wick', '2014-10-22'], [324552, 'John Wick: Chapter 2', '2017-02-08'], [458156, 'John Wick: Chapter 3 - Parabellum', '2019-05-15'], [603692, 'John Wick: Chapter 4', '2023-03-22']] },
  10194: { name: 'Toy Story Collection', films: [[862, 'Toy Story', '1995-10-30'], [863, 'Toy Story 2', '1999-10-30'], [10193, 'Toy Story 3', '2010-06-16'], [301528, 'Toy Story 4', '2019-06-19'], [1084244, 'Toy Story 5', '2027-06-18']] },
  777: { name: 'Lonely Collection', films: [[500, 'Lonely', '2020-01-01'], [501, 'Lonely 2', '2030-01-01']] },
};
const FILM = {}; for (const [cid, c] of Object.entries(COLLS)) for (const [id, title, date] of c.films) FILM[id] = { id, title, release_date: date, runtime: 120, poster_path: null, genres: [], belongs_to_collection: { id: +cid, name: c.name, poster_path: null } };
FILM[949] = { id: 949, title: 'Heat', release_date: '1995-12-15', runtime: 170, poster_path: null, genres: [], belongs_to_collection: null };

const mv = (name, id, d, o = {}) => ({ name, ...(id != null ? { tmdbId: id } : null), status: 'watched', watchedAt: `${d}T10:00:00.000Z`, runtimeMin: 120, poster: null, year: 2001, ...o });
const MOVIES = [
  mv("Harry Potter and the Philosopher's Stone", 671, '2026-03-01'), mv('Harry Potter and the Chamber of Secrets', 672, '2026-03-05'), mv('Harry Potter and the Goblet of Fire', 674, '2026-09-20'),
  mv('John Wick', 245891, '2025-01-01'), mv('John Wick: Chapter 2', 324552, '2025-01-02'), mv('John Wick: Chapter 3 - Parabellum', 458156, '2025-01-03'), mv('John Wick: Chapter 4', 603692, '2025-01-04'),
  mv('Toy Story', 862, '2026-08-01'), { name: 'Toy Story 2', tmdbId: 863, status: 'planned', addedAt: '2026-08-02T00:00:00.000Z' },
  mv('Heat', 949, '2026-02-02'), mv('Lonely', 500, '2026-02-03'), mv('Ready', null, '2018-04-21'), mv('Toy Story', 862, '2020-01-01'),
];
const STATE = (movies = MOVIES) => ({ shows: {}, movies, settings: { tmdbKey: 'TESTKEY' } });

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 80)); };

async function open(state, { w = 390, h = 844, cache = null, failIds = [] } = {}) {
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
    if (m) { log.push('m' + m[1]); await wait(30); if (fail.has(+m[1])) return r.respond({ status: 500, headers: CORS, contentType: 'application/json', body: '{}' }); const f = FILM[m[1]] || { id: +m[1], title: 'X', belongs_to_collection: null }; return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(f) }); }
    m = /api\.themoviedb\.org\/3\/collection\/(\d+)\?/.exec(u);
    if (m) { log.push('c' + m[1]); await wait(30); const c = COLLS[m[1]]; return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ id: +m[1], name: c.name, poster_path: null, parts: c.films.map(([id, title, d]) => ({ id, title, release_date: d, poster_path: null })) }) }); }
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: '{"episodes":[],"results":[]}' });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, cache, key, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); if (cache) localStorage.setItem(key, cache); else localStorage.removeItem(key); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, state, cache, CACHE_KEY, FIXED);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Movies')).click()); await wait(500);
  return { page, log };
}
const toView = (p, label) => p.evaluate((l) => [...document.querySelectorAll('[role=radiogroup][aria-label="Movies view"] button')].find((b) => b.textContent.trim() === l).click(), label);
const cards = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid=coll-card]')].map((c) => ({
  id: +c.dataset.id, name: c.querySelector('.sd-coll-name').textContent, prog: c.querySelector('.sd-coll-prog').textContent.replace(/\s+/g, ' ').trim(), next: c.querySelector('[data-testid=coll-next]').textContent,
  buttons: [...c.querySelectorAll('button')].map((b) => b.textContent.trim()), parts: [...c.querySelectorAll('[data-testid=coll-part]')].map((li) => `${li.dataset.state}|${li.innerText.replace(/\s+/g, ' ').trim()}`),
})));
const clickIn = (p, id, text) => p.evaluate((id, text) => [...document.querySelector(`[data-testid=coll-card][data-id="${id}"]`).querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text)).click(), id, text);
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

console.log('A. FIRST VISIT: FINDING COLLECTIONS');
let { page: p, log } = await open(STATE());
await ok('the Movies page has a "Movies / Collections" switch; Movies (the grid) is the default and asks TMDB nothing about collections', async () => {
  const labels = await p.evaluate(() => [...document.querySelectorAll('[role=radiogroup][aria-label="Movies view"] button')].map((b) => `${b.textContent}:${b.getAttribute('aria-checked')}`));
  assert.deepEqual(labels, ['Movies:true', 'Collections:false']);
  assert.ok(await p.evaluate(() => document.querySelectorAll('.sd-lgrid .sd-ltile').length > 0));
  assert.equal(log.filter((x) => x.startsWith('c')).length, 0); assert.equal(log.filter((x) => x.startsWith('m')).length, 0);
});
await toView(p, 'Collections');
await until(p, () => document.querySelectorAll('[data-testid=coll-card]').length === 3 && !document.querySelector('.sd-lprog'));
await ok('each watched film is looked up once (rewatches and unlinked films are not), then each collection once', async () => {
  const movieCalls = log.filter((x) => x.startsWith('m')).sort(); const collCalls = log.filter((x) => x.startsWith('c')).sort();
  assert.deepEqual(movieCalls, ['m245891', 'm324552', 'm458156', 'm500', 'm603692', 'm671', 'm672', 'm674', 'm862', 'm949'].sort());
  assert.deepEqual(collCalls, ['c10194', 'c1241', 'c404609', 'c777'].sort());
  assert.equal(await p.evaluate(() => document.querySelector('.sd-lgrid')), null); // the grid is hidden in this view
});
await ok('Harry Potter: "3 of 8 watched", next = Prisoner of Azkaban (release order, not TMDB order), with "Add next to watchlist"', async () => {
  const hp = (await cards(p)).find((c) => c.id === 1241);
  assert.equal(hp.prog, '3 of 8 watched'); assert.equal(hp.next, 'Next: Harry Potter and the Prisoner of Azkaban (2004)');
  assert.ok(hp.buttons.includes('Add next to watchlist')); assert.ok(hp.buttons.includes('Show 8 films'));
});
await ok('order: unfinished first, most recently watched on top (Harry Potter, Toy Story), then the finished John Wick', async () => {
  assert.deepEqual((await cards(p)).map((c) => c.name), ['Harry Potter Collection', 'Toy Story Collection', 'John Wick Collection']);
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid=coll-summary]').textContent), '3 collections · 1 finished');
});
await ok('Toy Story: Toy Story 5 (out 2027) is not counted; next (Toy Story 2) is already on the watchlist', async () => {
  const ts = (await cards(p)).find((c) => c.id === 10194);
  assert.equal(ts.prog, '1 of 4 watched'); assert.equal(ts.next, 'Next: Toy Story 2 (1999)'); assert.ok(ts.buttons.includes('Next is on your watchlist')); assert.ok(!ts.buttons.includes('Add next to watchlist'));
});
await ok('John Wick: finished, says "All watched", no add button', async () => {
  const jw = (await cards(p)).find((c) => c.id === 404609);
  assert.equal(jw.prog, '4 of 4 watched Finished'); assert.equal(jw.next, 'All watched'); assert.ok(!jw.buttons.some((b) => /Add next|watchlist/.test(b)));
});
await ok('Heat (no collection) and Lonely (only one film out) are not listed; the unlinked "Ready" is explained', async () => {
  const names = (await cards(p)).map((c) => c.name).join(' '); assert.doesNotMatch(names, /Heat|Lonely/);
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=coll-unlinked]').textContent), /^1 watched movie isn't linked to TMDB.*Fix match/);
});
await ok('the cache is saved on this device under watchnext-collections-v1, and the library itself is untouched', async () => {
  const c = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), CACHE_KEY);
  assert.equal(c.byMovie[671].c, 1241); assert.equal(c.byMovie[949].c, 0); assert.equal(c.colls[1241].parts.length, 8);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
  assert.equal(JSON.stringify(st.movies), JSON.stringify(MOVIES));
});
await ok('phone: no sideways scroll', async () => { assert.equal(await noSideways(p), false); });
await p.screenshot({ path: `${OUT}/collections_phone.png` });

console.log('B. OPENING A COLLECTION');
await clickIn(p, 1241, 'Show 8 films'); await wait(250);
await ok('"Show 8 films" lists every film in release order with ticks for watched ones', async () => {
  const hp = (await cards(p)).find((c) => c.id === 1241);
  assert.deepEqual(hp.parts.map((x) => x.split('|')[0]), ['watched', 'watched', 'todo', 'watched', 'todo', 'todo', 'todo', 'todo']);
  assert.match(hp.parts[0], /Philosopher's Stone 2001 Watched$/); assert.match(hp.parts[2], /^todo\|3 Harry Potter and the Prisoner of Azkaban 2004$/);
  assert.ok(hp.buttons.includes('Hide films'));
});
await clickIn(p, 10194, 'Show 5 films'); await wait(250);
await ok('Toy Story list: "On watchlist" for Toy Story 2 and "Out 18 Jun 2027" for Toy Story 5', async () => {
  const ts = (await cards(p)).find((c) => c.id === 10194);
  assert.match(ts.parts[1], /^planned\|.*Toy Story 2 1999 On watchlist$/); assert.match(ts.parts[4], /^upcoming\|.*Toy Story 5 2027 Out 18 Jun 2027$/);
});
await p.screenshot({ path: `${OUT}/collections_open_phone.png`, fullPage: true });
await ok('tapping a watched film opens its movie sheet, which has a Collection section', async () => {
  await p.evaluate(() => document.querySelector('[data-testid=coll-card][data-id="1241"] [data-testid=coll-part][data-state=watched] button').click());
  await until(p, () => !!document.querySelector('[data-testid=sheet-coll] .sd-coll-mini'));
  const t = await p.evaluate(() => document.querySelector('[data-testid=sheet-coll]').innerText.replace(/\s+/g, ' '));
  assert.match(t, /Harry Potter Collection 3 of 8 watched · Next: Harry Potter and the Prisoner of Azkaban \(2004\) See all films/);
});
await p.evaluate(() => [...document.querySelectorAll('[data-testid=sheet-coll] button')].find((b) => b.textContent === 'See all films').click()); await wait(400);

console.log('C. ADD NEXT TO WATCHLIST');
await clickIn(p, 1241, 'Add next to watchlist');
await until(p, () => /Added/.test(document.querySelector('.sd-colls').innerText));
await ok('"Add next to watchlist" adds Prisoner of Azkaban as a planned movie and the card updates', async () => {
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
  const added = st.movies.filter((m) => m.tmdbId === 673); assert.equal(added.length, 1); assert.equal(added[0].status, 'planned'); assert.equal(added[0].name, 'Harry Potter and the Prisoner of Azkaban');
  const hp = (await cards(p)).find((c) => c.id === 1241); assert.ok(hp.buttons.includes('Next is on your watchlist')); assert.equal(hp.prog, '3 of 8 watched');
  assert.match(await p.evaluate(() => document.querySelector('.sd-colls').innerText), /Added “Harry Potter and the Prisoner of Azkaban” to your watchlist/);
});
await p.close();

console.log('D. SECOND VISIT USES THE CACHE');
const saved = await (async () => { const o = await open(STATE()); await toView(o.page, 'Collections'); await until(o.page, () => document.querySelectorAll('[data-testid=coll-card]').length === 3 && !document.querySelector('.sd-lprog')); const c = await o.page.evaluate((k) => localStorage.getItem(k), CACHE_KEY); await o.page.close(); return c; })();
({ page: p, log } = await open(STATE([...MOVIES, mv('Harry Potter and the Prisoner of Azkaban', 673, '2026-09-30')]), { cache: saved }));
await toView(p, 'Collections');
await until(p, () => document.querySelectorAll('[data-testid=coll-card]').length === 3 && !document.querySelector('.sd-lprog'));
await ok('only the newly watched film is looked up; nothing else is asked again', async () => { assert.deepEqual(log, ['m673']); });
await ok('and Harry Potter now reads 4 of 8, next = Order of the Phoenix', async () => {
  const hp = (await cards(p)).find((c) => c.id === 1241); assert.equal(hp.prog, '4 of 8 watched'); assert.equal(hp.next, 'Next: Harry Potter and the Order of the Phoenix (2007)');
});
await p.close();

console.log('E. MOVIE SHEET FROM THE GRID (no scan needed)');
({ page: p, log } = await open(STATE()));
await ok('opening a Harry Potter film in the grid shows its Collection (one details + one collection call)', async () => {
  await p.evaluate(() => [...document.querySelectorAll('.sd-lgrid .sd-ltile')].find((b) => /Goblet/.test(b.getAttribute('aria-label'))).click());
  await until(p, () => !!document.querySelector('[data-testid=sheet-coll] .sd-coll-mini'));
  assert.deepEqual(log, ['m674', 'c1241']);
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=sheet-coll]').innerText), /3 of 8 watched/);
});
await ok('"See all films" switches to Collections with Harry Potter opened', async () => {
  await p.evaluate(() => [...document.querySelectorAll('[data-testid=sheet-coll] button')].find((b) => b.textContent === 'See all films').click());
  await until(p, () => !!document.querySelector('[data-testid=coll-card][data-id="1241"] [data-testid=coll-part]'));
  assert.equal(await p.evaluate(() => document.querySelector('[role=radiogroup][aria-label="Movies view"] [aria-checked=true]').textContent), 'Collections');
});
await ok('a film with no collection (Heat) shows no Collection section', async () => {
  await toView(p, 'Movies'); await wait(300);
  await p.evaluate(() => [...document.querySelectorAll('.sd-lgrid .sd-ltile')].find((b) => /^Heat/.test(b.getAttribute('aria-label'))).click());
  await until(p, () => /min/.test((document.querySelector('.sd-mdet-facts') || {}).textContent || ''));
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid=sheet-coll]')), null);
});
await p.close();

console.log('F. TMDB FAILS FOR ONE FILM');
({ page: p, log } = await open(STATE(), { failIds: [674] }));
await toView(p, 'Collections');
await until(p, () => !document.querySelector('.sd-lprog') && /failed/.test(document.querySelector('.sd-colls').innerText));
await ok('the rest still work, and a "1 lookup failed … Retry" note appears', async () => {
  assert.match(await p.evaluate(() => document.querySelector('.sd-colls').innerText), /1 lookup failed \(offline or TMDB busy\)\. Retry/);
  assert.equal((await cards(p)).length, 3); // Harry Potter is still found through the other two films
});
await ok('Retry asks TMDB again for just the failed film', async () => {
  const before = log.length;
  await p.evaluate(() => [...document.querySelectorAll('.sd-colls button')].find((b) => b.textContent === 'Retry').click());
  await until(p, () => !document.querySelector('.sd-lprog')); await wait(300);
  assert.deepEqual(log.slice(before), ['m674']);
});
await p.close();

console.log('G. EMPTY AND DESKTOP');
({ page: p } = await open(STATE([mv('Heat', 949, '2026-02-02')])));
await toView(p, 'Collections');
await until(p, () => /No collections yet/.test(document.body.innerText));
await ok('no series watched: a friendly "No collections yet" message', async () => { assert.match(await p.evaluate(() => document.body.innerText), /When you watch a film from a series/); });
await p.close();
({ page: p } = await open(STATE([]), {}));
await ok('empty library: no switch at all, no errors', async () => { assert.equal(await p.evaluate(() => document.querySelector('[aria-label="Movies view"]')), null); });
await p.close();
({ page: p } = await open(STATE(), { w: 1280, h: 900 }));
await toView(p, 'Collections');
await until(p, () => document.querySelectorAll('[data-testid=coll-card]').length === 3 && !document.querySelector('.sd-lprog'));
await clickIn(p, 1241, 'Show 8 films'); await wait(250);
await ok('desktop: no sideways scroll', async () => { assert.equal(await noSideways(p), false); });
await p.screenshot({ path: `${OUT}/collections_desktop.png` });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
