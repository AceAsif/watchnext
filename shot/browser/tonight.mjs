process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

const DIST = APP_DIST; const OUT = workPath('out_tn'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4187, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED = Date.parse('2026-10-01T22:00:00.000Z'); const DAY = 86400000; const ago = (d) => new Date(FIXED - d * DAY).toISOString();
const P = (name) => ({ provider_name: name, logo_path: '/x.png' });
const AU = { 'tv/11': { flatrate: [P('Netflix')] }, 'tv/12': { flatrate: [P('Binge')] }, 'tv/21': { free: [P('ABC iview')] }, 'tv/23': { flatrate: [P('Netflix')] }, 'tv/24': null };
const MOVIE_DETAILS = { 33: { id: 33, title: 'Hidden Comedy', runtime: 95, genres: [{ id: 35, name: 'Comedy' }] } };

const W = (n, daysAgo, min = 30) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`1x${i + 1}`, { at: ago(daysAgo), min, n: 1 }]));
const mk = (id, name, o = {}) => ({ followed: true, watchlist: false, poster: null, status: 'Returning Series', providers: [], lastSynced: '2026-09-01T00:00:00Z', genres: ['Drama'], name, tmdbId: id, totalEpisodes: 20, seasons: [{ n: 1, count: 20 }], watched: {}, ...o });
const wl = (id, name, o = {}) => mk(id, name, { followed: false, watchlist: true, ...o });
const SHOWS = {
  'tmdb:11': mk(11, 'Quick Sitcom', { genres: ['Comedy'], runtimeMin: 22, watched: W(5, 2) }),
  'tmdb:12': mk(12, 'Crime Hour', { genres: ['Crime', 'Drama'], runtimeMin: 45, totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: W(2, 10) }),
  'tmdb:13': mk(13, 'Big Epic', { genres: ['Sci-Fi & Fantasy'], runtimeMin: 62, totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: W(1, 20) }),
  'tmdb:14': mk(14, 'Slow Doc', { genres: ['Documentary'], runtimeMin: 50, totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: W(1, 30) }),
  'tmdb:15': mk(15, 'Dropped Show', { dropped: true, runtimeMin: 20, watched: W(2, 3) }),
  'tmdb:16': mk(16, 'Finished Show', { runtimeMin: 20, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: W(3, 3), status: 'Ended' }),
  'tmdb:21': wl(21, 'New Comedy', { genres: ['Comedy', 'Animation'], runtimeMin: 25 }),
  'tmdb:22': wl(22, 'New Thriller', { genres: ['Thriller'], runtimeMin: 50 }),
  'tmdb:23': wl(23, 'New Sitcom Two', { genres: ['Comedy'], runtimeMin: 20 }),
  'tmdb:24': wl(24, 'New Gentle', { genres: ['Family', 'Comedy'], runtimeMin: 24 }),
};
const MOVIES = [
  { tmdbId: 31, name: 'Funny Film', status: 'planned', runtimeMin: 88, genres: ['Comedy'], year: 2020, poster: null },
  { tmdbId: 32, name: 'Long Drama', status: 'planned', runtimeMin: 150, genres: ['Drama'], year: 2019, poster: null },
  { tmdbId: 33, name: 'Hidden Comedy', status: 'planned', runtimeMin: 95, year: 2021, poster: null }, // genres never fetched
  { tmdbId: 34, name: 'Scary Film', status: 'planned', runtimeMin: 92, genres: ['Horror'], year: 2018, poster: null },
  { tmdbId: 35, name: 'Seen Already', status: 'watched', watchedAt: ago(40), runtimeMin: 90, genres: ['Comedy'] },
];
const STATE = (key = 'TESTKEY') => ({ shows: JSON.parse(JSON.stringify(SHOWS)), movies: JSON.parse(JSON.stringify(MOVIES)), settings: { tmdbKey: key } });

// ---- independent expectations (the test's own arithmetic, not the app's)
const MOOD = { funny: ['Comedy', 'Animation', 'Family'], gripping: ['Crime', 'Mystery', 'Thriller', 'Horror'], thoughtful: ['Drama', 'Documentary', 'History', 'War', 'War & Politics'] };
const items = () => [
  ...Object.values(SHOWS).filter((s) => s.followed && !s.dropped && Object.keys(s.watched).length > 0 && Object.keys(s.watched).length < s.totalEpisodes).map((s) => ({ name: s.name, r: s.runtimeMin, genres: s.genres, kind: 'continue' })),
  ...Object.values(SHOWS).filter((s) => !s.followed && s.watchlist).map((s) => ({ name: s.name, r: s.runtimeMin, genres: s.genres, kind: 'start' })),
  ...MOVIES.filter((m) => m.status === 'planned').map((m) => ({ name: m.name, r: m.runtimeMin, genres: m.genres || null, kind: 'movie' })),
];
const fitsAt = (it, minutes) => it.r <= minutes;          // an episode (or the whole film) must fit
const fittingNames = (minutes) => items().filter((it) => fitsAt(it, minutes)).map((it) => it.name).sort();

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(150); } return false; };
async function open(state, { prefs = null, tonightPrefs = null, w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  const log = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', async (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    let m = /api\.themoviedb\.org\/3\/(tv|movie)\/(\d+)\/watch\/providers/.exec(u);
    if (m) { const key = `${m[1]}/${m[2]}`; log.push('prov:' + key); await wait(150); const b = AU[key]; return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: +m[2], results: b ? { AU: b } : {} }) }); }
    m = /api\.themoviedb\.org\/3\/movie\/(\d+)(?:\?|$)/.exec(u);
    if (m) { log.push('movie:' + m[1]); await wait(150); const d = MOVIE_DETAILS[m[1]]; return r.respond({ status: d ? 200 : 404, contentType: 'application/json', body: JSON.stringify(d || { status_message: 'nope' }) }); }
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ episodes: [], results: [] }) });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, pr, tp, fixed) => {
    if (!sessionStorage.getItem('__s')) {
      localStorage.setItem('watchnext-state-v1', JSON.stringify(s));
      if (pr === null) localStorage.removeItem('watchnext-services-v1'); else localStorage.setItem('watchnext-services-v1', JSON.stringify(pr));
      if (tp === null) localStorage.removeItem('watchnext-tonight-v1'); else localStorage.setItem('watchnext-tonight-v1', JSON.stringify(tp));
      sessionStorage.setItem('__s', '1');
    }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, state, prefs, tonightPrefs, FIXED);
  await page.goto('http://localhost:4187/', { waitUntil: 'networkidle0' }); await wait(500);
  return { page, log };
}
const clickText = (p, label, scope = 'body', sel = 'button') => p.evaluate((t, sc, s) => { const el = [...document.querySelector(sc).querySelectorAll(s)].find((e) => (e.getAttribute('aria-label') || e.textContent).trim() === t); if (!el) throw new Error('no element: ' + t); el.click(); }, label, scope, sel);
const openSheet = async (p) => { await p.evaluate(() => document.querySelector('button.sd-tonight').click()); await wait(500); };
const picks = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid=tonight-pick]')].map((c) => ({ name: c.querySelector('.name').textContent, kind: c.querySelector('.sd-tn-kind').textContent, lines: [...c.querySelectorAll('.meta')].map((m) => m.textContent), mood: (c.querySelector('.sd-tn-mood') || {}).textContent || '', actions: [...c.querySelectorAll('.sd-tn-acts button')].map((b) => b.textContent.trim()) })));
const countLine = (p) => p.evaluate(() => (document.querySelector('[data-testid=tonight-count]') || {}).textContent || '');
const chipOn = (p, group) => p.evaluate((g) => { const c = document.querySelector(`[role=dialog] [aria-label="${g}"] .sd-nchip[aria-pressed=true]`); return c ? c.textContent.trim() : null; }, group);
const chip = (p, group, label) => p.evaluate((g, l) => { const c = [...document.querySelectorAll(`[role=dialog] [aria-label="${g}"] .sd-nchip`)].find((x) => x.textContent.trim() === l); if (!c) throw new Error('no chip ' + l); c.click(); }, group, label);
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const tn = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-tonight-v1') || 'null'));

// ============================================================ 1. entry point + defaults
console.log('1. entry point and defaults');
let { page: p, log } = await open(STATE());
await ok('Up Next offers "What should I watch tonight?"', async () => assert.match(await p.evaluate(() => document.querySelector('button.sd-tonight').innerText), /What should I watch tonight\?\s*Pick your time and mood/));
await p.screenshot({ path: `${OUT}/upnext_button_phone.png` });
await openSheet(p);
await ok('the sheet opens with 45 minutes and "Surprise me" selected, and a count line', async () => {
  assert.equal(await chipOn(p, 'Time you have'), '45 min'); assert.equal(await chipOn(p, 'Mood'), 'Surprise me');
  const want = fittingNames(45); assert.equal(await countLine(p), `${want.length} things fit`); assert.equal(want.length, 5);
});
await ok('3 suggestions, all of which really fit 45 minutes; never the dropped or finished show, a watched movie, a too-long episode or a film', async () => {
  const pk = await picks(p); assert.equal(pk.length, 3); const fit = new Set(fittingNames(45)); for (const x of pk) assert.ok(fit.has(x.name), x.name + ' does not fit');
  const all = pk.map((x) => x.name); for (const bad of ['Dropped Show', 'Finished Show', 'Seen Already', 'Big Epic', 'Slow Doc', 'New Thriller', 'Funny Film']) assert.ok(!all.includes(bad), bad);
});
await ok('something you are mid-way through comes first, and says what is next and how many episodes fit', async () => {
  const pk = await picks(p); assert.equal(pk[0].kind, 'Continue watching'); assert.equal(pk[0].name, 'Quick Sitcom'); assert.deepEqual(pk[0].lines.slice(0, 3), ['Next up: S01·E06', '15 episodes waiting', 'Fits 2 episodes · 44 min']); assert.deepEqual(pk[0].actions, ['Open show']);
});
await p.screenshot({ path: `${OUT}/sheet_phone.png` });

// ============================================================ 2. time
console.log('2. time');
await chip(p, 'Time you have', '20 min'); await wait(300);
await ok('20 minutes: only what fits — the 20-minute sitcom', async () => { const want = fittingNames(20); assert.deepEqual(want, ['New Sitcom Two']); assert.equal(await countLine(p), '1 thing fits'); assert.deepEqual((await picks(p)).map((x) => x.name), want); });
await chip(p, 'Time you have', '3 hr'); await wait(300);
await ok('3 hours: films fit too (and everything else), still just 3 shown, count says how many fit', async () => { const want = fittingNames(180); assert.equal(await countLine(p), `${want.length} things fit`); assert.equal((await picks(p)).length, 3); assert.ok(want.includes('Long Drama') && want.includes('Funny Film')); });
await chip(p, 'Time you have', '1 hr'); await wait(300);
await ok('your choice is remembered on this device (own storage key) and survives a reload', async () => { assert.deepEqual(await tn(p), { minutes: 60, mood: 'any', onlyMine: false }); });
await p.reload({ waitUntil: 'networkidle0' }); await wait(500); await openSheet(p);
await ok('after the reload the sheet reopens on 60 minutes', async () => assert.equal(await chipOn(p, 'Time you have'), '1 hr'));
await chip(p, 'Time you have', '20 min'); await chip(p, 'Mood', 'Edge of my seat'); await wait(400);
await ok('something fits 20 minutes but nothing matches that mood: it is still shown, honestly labelled "Closest fit, not a mood match", and the count says 0 match', async () => {
  const pk = await picks(p); assert.deepEqual(pk.map((x) => [x.name, x.mood]), [['New Sitcom Two', 'Closest fit, not a mood match']]); assert.equal(await countLine(p), '1 thing fits · 0 match your mood');
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Show me different ones').disabled), true);
});
await p.close();

// ============================================================ 3. mood
console.log('3. mood');
({ page: p, log } = await open(STATE(), { tonightPrefs: { minutes: 120, mood: 'any', onlyMine: false } })); await openSheet(p);
await chip(p, 'Mood', 'Make me laugh'); await wait(500);
await ok('"Make me laugh": the first suggestions are comedies, each says it matches, the count says how many match', async () => {
  const pk = await picks(p); const items0 = items(); const matches = items0.filter((it) => fitsAt(it, 120) && it.genres && it.genres.some((g) => MOOD.funny.includes(g)));
  assert.ok(pk.slice(0, 3).every((x) => x.mood === 'Matches “Make me laugh”'), JSON.stringify(pk.map((x) => [x.name, x.mood]))); assert.ok(pk.every((x) => matches.some((m) => m.name === x.name)));
  assert.match(await countLine(p), /· \d+ match your mood$/); assert.equal(+((await countLine(p)).match(/· (\d+) match/)[1]), matches.length + 1, 'includes Hidden Comedy once its genres have been looked up');
});
await ok('the movie queued before genres were stored was looked up ONCE and now counts as a comedy (genres saved on the movie)', async () => {
  await waitFor(async () => log.includes('movie:33')); await wait(500); assert.equal(log.filter((l) => l === 'movie:33').length, 1); assert.deepEqual((await stored(p)).movies.find((m) => m.tmdbId === 33).genres, ['Comedy']);
  assert.equal(log.filter((l) => /^movie:/.test(l)).length, 1, 'only the movie that lacked genres was fetched');
});
await chip(p, 'Mood', 'Edge of my seat'); await wait(400);
await ok('"Edge of my seat": the crime drama, the thriller, the horror film — and not the comedies', async () => { const names = (await picks(p)).map((x) => x.name).sort(); assert.deepEqual(names, ['Crime Hour', 'New Thriller', 'Scary Film']); });
await chip(p, 'Mood', 'Surprise me'); await wait(300);
await ok('"Surprise me" shows no mood labels at all', async () => assert.ok((await picks(p)).every((x) => x.mood === '')));
await p.close();
const NOKEY = { shows: {}, movies: [{ tmdbId: 33, name: 'Hidden Comedy', status: 'planned', runtimeMin: 95, year: 2021, poster: null }, { tmdbId: 34, name: 'Scary Film', status: 'planned', runtimeMin: 92, genres: ['Horror'], year: 2018, poster: null }, { tmdbId: 31, name: 'Funny Film', status: 'planned', runtimeMin: 88, genres: ['Comedy'], year: 2020, poster: null }], settings: { tmdbKey: '' } };
({ page: p, log } = await open({ ...NOKEY, shows: { 'tmdb:11': SHOWS['tmdb:11'] } }, { tonightPrefs: { minutes: 120, mood: 'funny', onlyMine: false } })); await openSheet(p); await wait(700);
await ok('without a TMDB key nothing is fetched, and a film whose genres are unknown is ranked after the real matches and labelled honestly', async () => {
  assert.equal(log.length, 0); const pk = await picks(p); const by = Object.fromEntries(pk.map((x) => [x.name, x.mood]));
  assert.equal(pk.length, 3); assert.deepEqual(pk.map((x) => x.name).sort(), ['Funny Film', 'Hidden Comedy', 'Quick Sitcom']);
  assert.equal(by['Quick Sitcom'], 'Matches “Make me laugh”'); assert.equal(by['Funny Film'], 'Matches “Make me laugh”'); assert.equal(by['Hidden Comedy'], 'Genres not known yet');
  const order = pk.map((x) => x.mood); assert.deepEqual(order, [...order].sort((a, b) => (a.startsWith('Matches') ? 0 : a === 'Genres not known yet' ? 1 : 2) - (b.startsWith('Matches') ? 0 : b === 'Genres not known yet' ? 1 : 2)));
});
await p.close();

// ============================================================ 4. another / actions
console.log('4. "Show me different ones" and the buttons');
({ page: p } = await open(STATE(), { tonightPrefs: { minutes: 45, mood: 'any', onlyMine: false } })); await openSheet(p);
const first = (await picks(p)).map((x) => x.name);
await clickText(p, 'Show me different ones', '[role=dialog]'); await wait(350);
const second = (await picks(p)).map((x) => x.name);
await ok('"Show me different ones" gives NEW suggestions (none repeated) until everything has been shown', async () => { assert.equal(second.length, 2); assert.ok(second.every((n) => !first.includes(n))); assert.deepEqual([...first, ...second].sort(), fittingNames(45)); });
await clickText(p, 'Show me different ones', '[role=dialog]'); await wait(350);
await ok('after everything has been shown, asking again starts over (with a note) instead of leaving you with nothing', async () => {
  const pk = await picks(p); assert.equal(pk.length, 3); assert.match(await p.evaluate(() => document.querySelector('[role=dialog]').innerText), /That’s everything that fits: starting over\./);
});
await chip(p, 'Time you have', '1 hr'); await wait(300);
await ok('changing the question starts the suggestions afresh', async () => assert.equal((await picks(p)).length, 3));
await p.close();

({ page: p } = await open(STATE(), { tonightPrefs: { minutes: 120, mood: 'gripping', onlyMine: false } })); await openSheet(p); await wait(700);
const funnyFilm = (await picks(p)).find((x) => x.kind === 'Movie');
await ok('a film suggestion shows its runtime, how much time is spare, and "Mark watched" (no "Open show")', async () => {
  assert.ok(funnyFilm, 'the horror film is among the top picks for "Edge of my seat" at 2 hours'); assert.equal(funnyFilm.name, 'Scary Film'); assert.deepEqual(funnyFilm.actions, ['Mark watched']); assert.match(funnyFilm.lines[0], /^\d+ min$/); assert.match(funnyFilm.lines[1], /to spare$/);
});
await p.evaluate(() => { const c = [...document.querySelectorAll('[data-testid=tonight-pick]')].find((x) => x.querySelector('.name').textContent === 'Scary Film'); [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Mark watched').click(); }); await wait(450);
await ok('"Mark watched" marks that planned film as watched (today) and it leaves the suggestions', async () => {
  const st = await stored(p); const done = st.movies.filter((m) => m.status === 'watched' && m.name !== 'Seen Already'); assert.equal(done.length, 1); assert.equal(done[0].name, 'Scary Film'); assert.ok(Math.abs(Date.parse(done[0].watchedAt) - FIXED) < 20000, 'stamped with the current time');
  assert.ok(!(await picks(p)).some((x) => x.name === done[0].name));
});
await p.close();
({ page: p } = await open(STATE(), { tonightPrefs: { minutes: 45, mood: 'any', onlyMine: false } })); await openSheet(p);
await clickText(p, 'Open show', '[data-testid=tonight-pick]'); await wait(700);
await ok('"Open show" closes the sheet and opens that show', async () => { assert.equal(await p.evaluate(() => !!document.querySelector('[role=dialog]')), false); assert.match(await p.evaluate(() => document.body.innerText), /Quick Sitcom/); assert.ok(await p.evaluate(() => /watched/.test(document.body.innerText))); });
await p.close();

// ============================================================ 5. only on my services
console.log('5. only on my services');
({ page: p, log } = await open(STATE(), { prefs: { mine: ['netflix'], showsOnly: false, watchlistOnly: false }, tonightPrefs: { minutes: 45, mood: 'any', onlyMine: false } })); await openSheet(p);
await ok('off by default: no availability lookups at all', async () => { await wait(800); assert.equal(log.filter((l) => l.startsWith('prov:')).length, 0); });
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button.sd-svctoggle')][0].click()); await wait(400);
await waitFor(async () => !/Checking/.test(await p.evaluate(() => (document.querySelector('[data-testid=services-status]') || { innerText: '' }).innerText))); await wait(500);
await ok('switching it on checks ONLY the titles that fit 45 minutes (5 shows) — not the long ones, not the films — and then lists only what is on Netflix or free', async () => {
  assert.deepEqual(log.filter((l) => l.startsWith('prov:')).sort(), ['prov:tv/11', 'prov:tv/12', 'prov:tv/21', 'prov:tv/23', 'prov:tv/24']);
  const pk = await picks(p); assert.deepEqual(pk.map((x) => x.name).sort(), ['New Comedy', 'New Sitcom Two', 'Quick Sitcom']); assert.equal(await countLine(p), '3 things fit');
  assert.deepEqual((await tn(p)).onlyMine, true);
});
await ok('each suggestion says where it is: Netflix / Free: ABC iview', async () => { const w = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid=tonight-pick]')].map((c) => [c.querySelector('.name').textContent, (c.querySelector('.sd-svc-meta') || {}).textContent || '']))); assert.deepEqual(w, { 'Quick Sitcom': 'Netflix', 'New Comedy': 'Free: ABC iview', 'New Sitcom Two': 'Netflix' }); });
await p.screenshot({ path: `${OUT}/sheet_services_phone.png` });
await p.close();

// ============================================================ 6. empty library / layout
console.log('6. edge cases and layout');
({ page: p } = await open({ shows: {}, movies: [], settings: { tmdbKey: 'TESTKEY' } }));
await ok('with an empty library the button is not offered (the welcome message is)', async () => assert.equal(await p.evaluate(() => !!document.querySelector('button.sd-tonight')), false)); await p.close();
const none = { shows: { 'tmdb:99': mk(99, 'Only Long', { runtimeMin: 90, watched: W(2, 2) }) }, movies: [], settings: { tmdbKey: 'TESTKEY' } };
({ page: p } = await open(none)); await openSheet(p);
await ok('when nothing fits 45 minutes the count says so and the explanation appears', async () => { assert.equal(await countLine(p), 'Nothing fits yet'); assert.match(await p.evaluate(() => document.querySelector('[data-testid=tonight-empty]').textContent), /fits 45 min/); }); await p.close();
({ page: p } = await open(STATE(), { w: 320, h: 700 })); await openSheet(p);
await ok('320px wide: no sideways scroll, the chips wrap, the buttons are reachable', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); assert.equal(await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d.scrollWidth <= d.clientWidth + 1; }), true); }); await p.close();
({ page: p } = await open(STATE(), { w: 1280, h: 900 })); await openSheet(p); await p.screenshot({ path: `${OUT}/sheet_desktop.png` });
await ok('desktop: the sheet renders without overflow', async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false)); await p.close();
console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
