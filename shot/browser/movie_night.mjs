process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

const DIST = APP_DIST; const OUT = workPath('out_mn'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4188, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED = Date.parse('2026-10-01T22:00:00.000Z'); const DAY = 86400000;

// ---------------- the (mock) TMDB world. runtime/genre ids as TMDB would hold them.
const G = { Comedy: 35, Animation: 16, Family: 10751, Drama: 18, SciFi: 878, Crime: 80, Thriller: 53, Action: 28, Adventure: 12 };
const NAME = { 35: 'Comedy', 16: 'Animation', 10751: 'Family', 18: 'Drama', 878: 'Science Fiction', 80: 'Crime', 53: 'Thriller', 28: 'Action', 12: 'Adventure' };
const MOVIE = (id, title, runtime, genreIds, vote = 7.1, extra = {}) => ({ id, title, runtime, genre_ids: genreIds, genres: genreIds.map((g) => ({ id: g, name: NAME[g] })), vote_average: vote, release_date: '2021-06-01', poster_path: '/p' + id + '.jpg', ...extra });
const WORLD = {
  601: MOVIE(601, 'Arrival Like', 116, [G.SciFi, G.Drama], 7.9), 602: MOVIE(602, 'Funny Rec', 95, [G.Comedy], 7.4), 603: MOVIE(603, 'Crime Rec', 108, [G.Crime, G.Thriller], 7.0), 604: MOVIE(604, 'Long Rec', 170, [G.Drama], 8.1),
  605: MOVIE(605, 'No Poster Rec', 100, [G.Drama], 7.0, { poster_path: null }), 700: MOVIE(700, 'Owned Already', 100, [G.Drama]),
  801: MOVIE(801, 'Popular Netflix', 118, [G.Action, G.Adventure], 7.7), 802: MOVIE(802, 'Popular Funny', 99, [G.Comedy], 7.0), 803: MOVIE(803, 'Popular Long', 150, [G.Drama], 7.5),
  811: MOVIE(811, 'Free Gem', 105, [G.Drama], 7.3), 812: MOVIE(812, 'Free Funny', 88, [G.Comedy, G.Animation], 6.8),
};
// synopses for every mock movie (except one, to test the "no description" line), a tagline for one, and trailers for one
for (const w of Object.values(WORLD)) w.overview = `Synopsis of ${w.title}.`;
delete WORLD[812].overview; WORLD[602].tagline = 'Laugh now.';
const VIDEOS = { 602: [ // the real trailer is LAST so the test proves the "official YouTube Trailer" rule is used
  { site: 'YouTube', type: 'Teaser', official: true, key: 'TeaserKey01' }, { site: 'Vimeo', type: 'Trailer', official: true, key: 'VimeoKey001' },
  { site: 'YouTube', type: 'Trailer', official: false, key: 'FanTrailr01' }, { site: 'YouTube', type: 'Trailer', official: true, key: 'Xk3pQ9aLm2Z' }] };
const RECS = { 500: [601, 602, 604, 605, 700], 501: [602, 603] };
const POP_SUBS = [801, 802, 803]; const POP_FREE = [811, 812];
const AU = { 601: { flatrate: [{ provider_name: 'Netflix' }] }, 602: { flatrate: [{ provider_name: 'Binge' }] }, 603: null, 604: { flatrate: [{ provider_name: 'Stan' }] } };
const PROVIDERS = [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 21, provider_name: 'Stan' }, { provider_id: 385, provider_name: 'Binge' }, { provider_id: 283, provider_name: 'Crunchyroll' }];

const ago = (d) => new Date(FIXED - d * DAY).toISOString();
const mv = (id, name, o = {}) => ({ tmdbId: id, name, status: 'watched', watchedAt: ago(30), runtimeMin: 120, poster: null, year: 2019, genres: ['Drama'], ...o });
const STATE = (o = {}) => ({ shows: {}, movies: [mv(500, 'Dune', { rating: 5, ratedAt: ago(5) }), mv(501, 'Heat', { rating: 4, ratedAt: ago(9) }), mv(700, 'Owned Already', { status: 'planned', watchedAt: undefined })], settings: { tmdbKey: o.key === undefined ? 'TESTKEY' : o.key } });
const NORATINGS = () => ({ shows: {}, movies: [mv(700, 'Owned Already', { status: 'planned', watchedAt: undefined })], settings: { tmdbKey: 'TESTKEY' } });

// independent expectation: what fits and what is on which side
const fitting = (minutes, { mine = true, free = true, recs = true } = {}) => {
  const ids = new Set();
  if (recs) for (const l of Object.values(RECS)) for (const id of l) if (WORLD[id].poster_path && id !== 700) ids.add(id);
  if (mine) POP_SUBS.forEach((id) => ids.add(id)); if (free) POP_FREE.forEach((id) => ids.add(id));
  return [...ids].filter((id) => WORLD[id].runtime <= minutes && WORLD[id].runtime >= 60).map((id) => WORLD[id].title).sort();
};

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(150); } return false; };
async function open(state, { services = ['netflix'], night = null, w = 390, h = 844, fail = {} } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  const log = []; let active = 0; const st = { max: 0, d: 0, dmax: 0 };
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|status of 500/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', async (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (!u.includes('api.themoviedb.org')) return r.abort();
    const url = new URL(u); const p = url.pathname.replace('/3', ''); const q = Object.fromEntries(url.searchParams); delete q.api_key;
    const isDetails = /^\/movie\/\d+$/.test(p); if (isDetails) { st.d++; st.dmax = Math.max(st.dmax, st.d); }
    active++; st.max = Math.max(st.max, active); await wait(120); active--; if (isDetails) st.d--;
    const json = (b, status = 200) => r.respond({ status, contentType: 'application/json', body: JSON.stringify(b) });
    let m;
    if ((m = /^\/movie\/(\d+)\/recommendations$/.exec(p))) { log.push({ p: 'rec', id: +m[1] }); return json({ results: (RECS[m[1]] || []).map((id) => WORLD[id]) }); }
    if ((m = /^\/movie\/(\d+)\/similar$/.exec(p))) { log.push({ p: 'similar', id: +m[1] }); return json({ results: [] }); }
    if (p === '/watch/providers/movie') { log.push({ p: 'providers' }); return json({ results: PROVIDERS }); }
    if (p === '/discover/movie') {
      log.push({ p: 'discover', q }); if (fail.discover) return json({ status_message: 'boom' }, 500);
      const ids = q.with_watch_monetization_types === 'flatrate' ? (String(q.with_watch_providers || '').split('|').includes('8') ? POP_SUBS : []) : POP_FREE;
      const genres = q.with_genres ? q.with_genres.split('|').map(Number) : null;
      return json({ results: ids.map((id) => WORLD[id]).filter((x) => x.runtime <= +q['with_runtime.lte'] && x.runtime >= +q['with_runtime.gte'] && (!genres || x.genre_ids.some((g) => genres.includes(g)))) });
    }
    if ((m = /^\/movie\/(\d+)\/watch\/providers$/.exec(p))) { log.push({ p: 'avail', id: +m[1] }); const b = AU[m[1]]; return json({ id: +m[1], results: b ? { AU: b } : {} }); }
    if ((m = /^\/movie\/(\d+)\/videos$/.exec(p))) { log.push({ p: 'videos', id: +m[1] }); if (fail.videos) return json({ status_message: 'boom' }, 500); return json({ id: +m[1], results: VIDEOS[m[1]] || [] }); }
    if ((m = /^\/movie\/(\d+)$/.exec(p))) { log.push({ p: 'details', id: +m[1] }); const x = WORLD[m[1]]; return x ? json(x) : json({}, 404); }
    return json({ results: [], episodes: [] });
  });
  await page.evaluateOnNewDocument((s, svc, nt, fixed) => {
    if (!sessionStorage.getItem('__s')) {
      localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.setItem('watchnext-services-v1', JSON.stringify({ mine: svc, showsOnly: false, watchlistOnly: false }));
      if (nt === null) localStorage.removeItem('watchnext-movienight-v1'); else localStorage.setItem('watchnext-movienight-v1', JSON.stringify(nt)); sessionStorage.setItem('__s', '1');
    }
    window.__opened = []; // stand-in for window.open: records the tabs the app opens (and lets a test pretend pop-ups are blocked)
    window.open = (u, t) => { if (window.__blockOpen) return null; const w = { url: u, target: t, location: '', closed: false, opener: {}, close() { this.closed = true; } }; window.__opened.push(w); return w; };
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, state, services, night, FIXED);
  await page.goto('http://localhost:4188/', { waitUntil: 'networkidle0' }); await wait(500);
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Watchlist')).click()); await wait(450);
  await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.startsWith('Discover')).click()); await wait(450);
  return { page, log, st };
}
const openSheet = async (p) => { await p.evaluate(() => [...document.querySelectorAll('button.sd-tonight')].find((b) => /Movie night/.test(b.textContent)).click()); await wait(400); };
const picks = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid=movie-pick]')].map((c) => ({ name: c.querySelector('.name').textContent, kind: c.querySelector('.sd-tn-kind').textContent, lines: [...c.querySelectorAll('.meta')].map((m) => m.textContent), mood: (c.querySelector('.sd-tn-mood') || {}).textContent || '', where: (c.querySelector('.sd-svc-meta') || {}).textContent || '', btns: [...c.querySelectorAll('.sd-tn-acts button')].map((b) => [b.textContent.trim(), b.disabled]) })));
const count = (p) => p.evaluate(() => (document.querySelector('[data-testid=movie-count]') || {}).textContent || '');
const settled = (p) => waitFor(async () => { const c = await count(p); return c && !/Looking|still looking/.test(c); });
const chip = (p, group, label) => p.evaluate((g, l) => { const c = [...document.querySelectorAll(`[role=dialog] [aria-label="${g}"] .sd-nchip`)].find((x) => x.textContent.trim() === l); if (!c) throw new Error('no chip ' + l); c.click(); }, group, label);
const chipOn = (p, g) => p.evaluate((group) => { const c = document.querySelector(`[role=dialog] [aria-label="${group}"] .sd-nchip[aria-pressed=true]`); return c ? c.textContent.trim() : null; }, g);
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const names = (pk) => pk.map((x) => x.name.replace(/ \(\d{4}\)$/, ''));
const discoverQs = (log) => log.filter((l) => l.p === 'discover').map((l) => l.q);

// ============================================================ 1. the button
console.log('1. the button on Discover');
let { page: p, log, st } = await open(STATE());
await ok('Discover has a "Movie night" button above the picks', async () => assert.match(await p.evaluate(() => [...document.querySelectorAll('button.sd-tonight')].map((b) => b.innerText).join('|')), /Movie night\s*Find a new movie for tonight/));
await p.screenshot({ path: `${OUT}/discover_button_phone.png` });
await p.close();
({ page: p, log } = await open(NORATINGS()));
await ok('with NOTHING rated the button is still there (above the "rate a few" message), so it works for people who have rated few', async () => {
  const t = await p.evaluate(() => document.body.innerText); assert.match(t, /Movie night/); assert.match(t, /Rate a few shows or movies you enjoyed/);
});
await p.close();

// ============================================================ 2. defaults + what it asks TMDB
console.log('2. defaults and the questions it asks TMDB');
({ page: p, log, st } = await open(STATE())); await openSheet(p); await settled(p); await wait(600);
await ok('opens on 2 hours / Surprise me, and says what the picks are built from', async () => {
  assert.equal(await chipOn(p, 'Time you have'), '2 hr'); assert.equal(await chipOn(p, 'Mood'), 'Surprise me');
  assert.match(await p.evaluate(() => document.querySelector('[role=dialog]').innerText), /Picks come from 2 movies you rated, popular movies on your services and popular free-to-watch movies\./);
});
await ok('recommendations were requested for the 2 movies you rated (best-rated first); owned/posterless results are dropped; provider list fetched ONCE', async () => {
  assert.deepEqual(log.filter((l) => l.p === 'rec').map((l) => l.id).sort(), [500, 501]); assert.equal(log.filter((l) => l.p === 'providers').length, 1);
  const all = (await picks(p)).map((x) => x.name).join('|'); assert.ok(!/Owned Already|No Poster Rec/.test(all));
});
await ok('"popular on my services": ONE query for your ticked service (Netflix = TMDB provider 8, not Stan/Binge), AU, subscription only, 60-120 min; and ONE free/ad-supported query with no provider filter', async () => {
  const qs = discoverQs(log); assert.equal(qs.length, 2); const subs = qs.find((q) => q.with_watch_monetization_types === 'flatrate'), free = qs.find((q) => q.with_watch_monetization_types === 'free|ads');
  assert.deepEqual([subs.watch_region, subs.with_watch_providers, subs['with_runtime.gte'], subs['with_runtime.lte'], subs.sort_by], ['AU', '8', '60', '120', 'popularity.desc']); assert.ok(!('with_genres' in subs)); assert.ok(!('with_watch_providers' in free)); assert.equal(free['with_runtime.lte'], '120');
});
await ok('count line = what fits 2 hours, derived from the mock TMDB data; 3 picks, every one really under 2 hours', async () => {
  const want = fitting(120); assert.equal(await count(p), `${want.length} movies fit`); const pk = await picks(p); assert.equal(pk.length, 3); for (const x of pk) assert.ok(want.includes(names([x])[0]), x.name + ' does not fit');
  assert.ok(!(await picks(p)).some((x) => /Long Rec|Popular Long/.test(x.name)));
});
await ok('the movie recommended by BOTH of your rated movies comes first and says so; each pick shows runtime, spare time and the TMDB rating', async () => {
  const pk = await picks(p); assert.equal(names(pk)[0], 'Funny Rec'); assert.deepEqual(pk[0].lines.slice(0, 3), ['Because you liked Dune and Heat', '95 min · 25 min to spare', '★ 7.4 on TMDB']); assert.equal(pk[0].kind, 'Recommended');
});
await ok('details were looked up only for what could be ranked (not for the movies you already own), and never more than 3 requests at once', async () => { const d = log.filter((l) => l.p === 'details').map((l) => l.id); assert.ok(!d.includes(700)); assert.ok(d.length <= 12, String(d.length)); assert.equal(new Set(d).size, d.length, 'no movie looked up twice'); assert.ok(st.dmax >= 2 && st.dmax <= 3, 'detail lookups in flight at once: ' + st.dmax); });
await p.screenshot({ path: `${OUT}/sheet_phone.png` });

// ============================================================ 3. time + mood
console.log('3. time and mood');
await chip(p, 'Time you have', '1 hr 30 min'); await settled(p); await wait(600);
await ok('1 hr 30 min: only movies under 90 minutes; TMDB is asked again with the new runtime limit', async () => {
  const want = fitting(90); assert.equal(await count(p), `${want.length} ${want.length === 1 ? 'movie fits' : 'movies fit'}`); assert.ok(discoverQs(log).some((q) => q['with_runtime.lte'] === '90')); assert.deepEqual((await picks(p)).map((x) => names([x])[0]).sort(), want.slice(0, 3));
});
await chip(p, 'Time you have', '2 hr'); await chip(p, 'Mood', 'Make me laugh'); await settled(p); await wait(600);
await ok('"Make me laugh": TMDB is asked for comedy/animation/family only (genre ids joined with |); picks are the comedies and say they match', async () => {
  const q = discoverQs(log).filter((x) => x.with_genres); assert.ok(q.length >= 2); assert.deepEqual(q[q.length - 1].with_genres.split('|').map(Number).sort((a, b) => a - b), [16, 35, 10751]);
  const pk = await picks(p); assert.ok(pk.every((x) => x.mood === 'Matches “Make me laugh”'), JSON.stringify(pk.map((x) => [x.name, x.mood]))); assert.deepEqual(names(pk).sort(), ['Free Funny', 'Funny Rec', 'Popular Funny']);
  assert.equal(await count(p), '5 movies fit · 3 match your mood'); /* 3 recommendations that fit (601, 602, 603) + 2 popular comedies (802, 812); 3 are comedies */
});
await ok('your choices are remembered on this device (own key) and survive a reload', async () => { assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-movienight-v1'))), { minutes: 120, mood: 'funny', onlyMine: false }); });
await chip(p, 'Mood', 'Edge of my seat'); await settled(p); await wait(500);
await ok('"Edge of my seat": the crime thriller is the match; nothing else matches, so the others are labelled "Closest fit"', async () => {
  const pk = await picks(p); assert.equal(pk[0].name.replace(/ \(\d{4}\)$/, ''), 'Crime Rec'); assert.equal(pk[0].mood, 'Matches “Edge of my seat”'); assert.ok(pk.slice(1).every((x) => x.mood === 'Closest fit, not a mood match'));
});
await p.close();

// ============================================================ 4. only on my services
console.log('4. only on my services');
({ page: p, log } = await open(STATE(), { night: { minutes: 120, mood: 'any', onlyMine: false } })); await openSheet(p); await settled(p); await wait(500);
await ok('off by default: no per-movie availability lookups', async () => assert.equal(log.filter((l) => l.p === 'avail').length, 0));
await p.evaluate(() => document.querySelector('[role=dialog] button.sd-svctoggle').click()); await wait(500); await settled(p); await wait(1500);
await ok('switching it on looks up where the RECOMMENDED movies that fit stream (not the popular ones: they are on your services by definition; not ones too long)', async () => {
  const a = log.filter((l) => l.p === 'avail').map((l) => l.id).sort(); assert.deepEqual(a, [601, 602, 603]); assert.ok(!a.includes(604) && !a.includes(801));
});
await ok('only movies confirmed on Netflix (or free) remain: Arrival Like (Netflix) + the popular/free ones; the Binge-only and no-streaming recommendations are gone', async () => {
  const want = ['Arrival Like', 'Popular Netflix', 'Popular Funny', 'Free Gem', 'Free Funny'].sort(); assert.equal(await count(p), `${want.length} movies fit`);
  const seen = new Set(); let guard = 0; while (guard++ < 4) { (await picks(p)).forEach((x) => seen.add(names([x])[0])); await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Show me different ones').click()); await wait(300); }
  assert.deepEqual([...seen].sort(), want);
});
await ok('picks say where: Netflix for the looked-up recommendation, "On your services" / "Free to watch" for popular ones', async () => {
  await p.reload({ waitUntil: 'networkidle0' }); await wait(500);
  await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Watchlist')).click()); await wait(400); await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.startsWith('Discover')).click()); await wait(400);
  await openSheet(p); await settled(p); await wait(2500);
  const all = new Map(); for (let i = 0; i < 4; i++) { (await picks(p)).forEach((x) => all.set(names([x])[0], x.where)); await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Show me different ones').click()); await wait(250); }
  assert.equal(all.get('Arrival Like'), 'Netflix'); assert.equal(all.get('Popular Netflix'), 'On your services'); assert.equal(all.get('Free Gem'), 'Free to watch'); assert.equal(all.get('Free Funny'), 'Free to watch');
});
await p.screenshot({ path: `${OUT}/sheet_services_phone.png` });
await p.close();

// ============================================================ 5. actions
console.log('5. actions');
({ page: p, log } = await open(STATE(), { night: { minutes: 120, mood: 'any', onlyMine: false } })); await openSheet(p); await settled(p); await wait(500);
const first = names(await picks(p));
await p.evaluate(() => { const c = document.querySelector('[data-testid=movie-pick]'); [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === '+ Watchlist').click(); }); await wait(500);
await ok('"+ Watchlist" queues that movie (with its runtime, year and genres from TMDB) and the card stays, marked "On your Watchlist ✓"', async () => {
  const st2 = await stored(p); const m = st2.movies.find((x) => x.name === first[0]); assert.ok(m, 'added'); assert.equal(m.status, 'planned'); assert.equal(m.runtimeMin, 95); assert.equal(m.year, '2021'); assert.deepEqual(m.genres, ['Comedy']);
  const pk = await picks(p); assert.equal(names(pk)[0], first[0]); assert.deepEqual(pk[0].btns[0], ['On your Watchlist ✓', true]);
});
await p.evaluate(() => { const c = document.querySelectorAll('[data-testid=movie-pick]')[1]; [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Not for me').click(); }); await wait(350);
await ok('"Not for me" removes that movie from the suggestions for this sitting and a different one takes its place', async () => { const now = names(await picks(p)); assert.ok(!now.includes(first[1])); assert.equal(now.length, 3); });
const beforeAnother = names(await picks(p));
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Show me different ones').click()); await wait(400);
await ok('"Show me different ones": none of the movies that were just showing come back', async () => { const second = names(await picks(p)); assert.ok(second.length > 0); assert.ok(second.every((n) => !beforeAnother.includes(n)), `${beforeAnother} -> ${second}`); });
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Done').click()); await wait(400);
await openSheet(p); await settled(p); await wait(600);
await ok('next sitting (closed and reopened): the movie you added is now in your library, so it is NOT suggested again — nor are the others you already own', async () => {
  const seen = new Set(); for (let i = 0; i < 4; i++) { (await picks(p)).forEach((x) => seen.add(names([x])[0])); await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Show me different ones').click()); await wait(250); }
  assert.ok(!seen.has(first[0]), first[0] + ' was added and must not be suggested again'); assert.ok(!seen.has('Owned Already')); assert.ok(seen.size >= 3);
});
await p.close();

// ============================================================ 6. edge cases
console.log('6. edge cases');
({ page: p, log } = await open(NORATINGS(), { services: [] })); await openSheet(p); await settled(p); await wait(500);
await ok('nothing rated and no services ticked: it still works from free-to-watch movies only (no subscription query, no recommendation lookups), and tells you how to get better picks', async () => {
  assert.equal(discoverQs(log).length, 1); assert.equal(discoverQs(log)[0].with_watch_monetization_types, 'free|ads'); assert.equal(log.filter((l) => l.p === 'rec').length, 0);
  assert.deepEqual((await picks(p)).map((x) => names([x])[0]).sort(), ['Free Funny', 'Free Gem']); assert.match(await p.evaluate(() => document.querySelector('[role=dialog]').innerText), /Rate a few movies and tick your services in Settings for better picks\./);
});
await p.close();
({ page: p } = await open(STATE({ key: '' }))); 
await ok('without a TMDB key the whole Discover tab asks for one (no Movie night button to dead-end in)', async () => assert.match(await p.evaluate(() => document.body.innerText), /Add a TMDB API key in Settings to get recommendations/)); await p.close();
({ page: p, log } = await open(STATE(), { fail: { discover: true } })); await openSheet(p); await settled(p); await wait(700);
await ok('if the popular-movies lookup fails, you are told, and your "because you liked" picks still work', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[role=dialog]').innerText), /Could not reach TMDB for popular movies/); const pk = await picks(p); assert.ok(pk.length > 0); assert.ok(pk.every((x) => x.kind === 'Recommended'));
});
await p.close();
({ page: p } = await open(STATE(), { night: { minutes: 90, mood: 'thoughtful', onlyMine: false } })); await openSheet(p); await settled(p); await wait(600);
await ok('when nothing fits you get an explanation instead of a blank sheet (90 min, "Something thoughtful": nothing that short is a drama)', async () => {
  assert.equal((await picks(p)).length, 0); assert.equal(await count(p), 'Nothing fits yet');
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid=movie-empty]').textContent), 'No new movie found that fits 1 hr 30 min for “Something thoughtful”. Try more time or a different mood.');
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Show me different ones').disabled), true);
}); await p.close();

// ============================================================ 6b. details and trailer
console.log('6b. tap a pick for its synopsis and trailer');
const card = (p, i = 0) => p.evaluate((i) => { const c = document.querySelectorAll('[data-testid=movie-pick]')[i]; const d = c.querySelector('[data-testid=movie-details]'); const m = c.querySelector('[data-testid=movie-more]'); return { name: c.querySelector('.name').textContent, open: !!d, text: d ? d.innerText : '', label: m.textContent.trim(), expanded: m.getAttribute('aria-expanded'), controls: m.getAttribute('aria-controls'), detId: d ? d.id : null, h: c.getBoundingClientRect().height }; }, i);
const tap = (p, i, sel) => p.evaluate((i, sel) => document.querySelectorAll('[data-testid=movie-pick]')[i].querySelector(sel).click(), i, sel);
const opened = (p) => p.evaluate(() => window.__opened.map((w) => ({ location: w.location, closed: w.closed, opener: w.opener, target: w.target })));
const trailerNote = (p, i = 0) => p.evaluate((i) => { const n = document.querySelectorAll('[data-testid=movie-pick]')[i].querySelector('.sd-tn-note'); return n ? n.textContent : null; }, i);
({ page: p, log } = await open(STATE(), { night: { minutes: 120, mood: 'any', onlyMine: false } })); await openSheet(p); await settled(p); await wait(500);
await ok('every pick starts closed with a "Details & trailer" button (aria-expanded false); nothing about trailers has been requested yet', async () => {
  const n = (await picks(p)).length; assert.equal(n, 3);
  for (let i = 0; i < n; i++) { const c = await card(p, i); assert.deepEqual([c.open, c.label, c.expanded], [false, 'Details & trailer▾', 'false']); }
  assert.equal(log.filter((l) => l.p === 'videos').length, 0);
});
const detailsBefore = log.filter((l) => l.p === 'details').length;
const f = (await card(p, 0)).name.replace(/ \(\d{4}\)$/, ''); assert.equal(f, 'Funny Rec');
await tap(p, 0, '[data-testid=movie-more]'); await wait(250);
await ok('tapping "Details & trailer" opens that pick only: tagline + synopsis from TMDB, a trailer button, aria-expanded true and aria-controls pointing at the panel', async () => {
  const c0 = await card(p, 0); assert.equal(c0.open, true); assert.equal(c0.expanded, 'true'); assert.equal(c0.label, 'Hide details▴'); assert.equal(c0.controls, c0.detId);
  assert.match(c0.text, /Laugh now\./); assert.match(c0.text, /Synopsis of Funny Rec\./); assert.match(c0.text, /▶ Watch trailer/);
  for (const i of [1, 2]) assert.equal((await card(p, i)).open, false);
});
await ok('showing the synopsis costs no extra TMDB request (it came with the runtime lookup)', async () => assert.equal(log.filter((l) => l.p === 'details').length, detailsBefore));
await tap(p, 0, '[data-testid=movie-more]'); await wait(200);
await ok('"Hide details" closes it again', async () => { const c0 = await card(p, 0); assert.deepEqual([c0.open, c0.label], [false, 'Details & trailer▾']); });
await tap(p, 1, '.name'); await wait(200);
await ok('tapping the movie title opens it too (you can just tap the movie), and tapping the poster closes it', async () => {
  assert.equal((await card(p, 1)).open, true); await tap(p, 1, '.art'); await wait(200); assert.equal((await card(p, 1)).open, false);
});
await tap(p, 0, '[data-testid=movie-more]'); await wait(200);
await p.screenshot({ path: `${OUT}/details_open_phone.png` });
await tap(p, 0, '[data-testid=movie-trailer]'); await wait(700);
await ok('"Watch trailer" opens ONE new tab on the OFFICIAL YouTube trailer (not the teaser, the Vimeo or the fan upload), with no link back to WatchNext', async () => {
  const o = await opened(p); assert.equal(o.length, 1); assert.deepEqual([o[0].target, o[0].location, o[0].opener, o[0].closed], ['_blank', 'https://www.youtube.com/watch?v=Xk3pQ9aLm2Z', null, false]);
  assert.deepEqual(log.filter((l) => l.p === 'videos').map((l) => l.id), [602]); assert.equal(await trailerNote(p, 0), null);
});
await tap(p, 0, '[data-testid=movie-trailer]'); await wait(500);
await ok('a second tap reuses the trailer it already found (no second lookup) and opens it again', async () => {
  const o = await opened(p); assert.equal(o.length, 2); assert.equal(o[1].location, 'https://www.youtube.com/watch?v=Xk3pQ9aLm2Z'); assert.equal(log.filter((l) => l.p === 'videos').length, 1);
});
await p.evaluate(() => { window.__blockOpen = true; }); const vBefore = log.filter((l) => l.p === 'videos').length;
await tap(p, 0, '[data-testid=movie-trailer]'); await wait(400);
await ok('if the browser blocks the new tab you are told how to fix it, and nothing is looked up', async () => {
  assert.match(await trailerNote(p, 0), /^Your browser blocked the new tab\. Allow pop-ups for this site and try again\.$/); assert.equal(log.filter((l) => l.p === 'videos').length, vBefore); assert.equal((await opened(p)).length, 2);
});
await p.evaluate(() => { window.__blockOpen = false; });
await p.evaluate(() => { const c = document.querySelectorAll('[data-testid=movie-pick]')[0]; [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === '+ Watchlist').click(); }); await wait(500);
await ok('"+ Watchlist" still works with the details open, and the panel stays open', async () => {
  const c0 = await card(p, 0); assert.equal(c0.open, true); assert.deepEqual((await picks(p))[0].btns[0], ['On your Watchlist ✓', true]); assert.equal((await stored(p)).movies.some((m) => m.name === 'Funny Rec' && m.status === 'planned'), true);
});
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Show me different ones').click()); await wait(500);
await ok('"Show me different ones" brings a fresh set, all closed', async () => { const n = (await picks(p)).length; assert.ok(n > 0); for (let i = 0; i < n; i++) assert.equal((await card(p, i)).open, false); });
await p.close();

({ page: p, log } = await open(STATE(), { night: { minutes: 90, mood: 'any', onlyMine: false } })); await openSheet(p); await settled(p); await wait(500);
await tap(p, 0, '[data-testid=movie-more]'); await wait(250);
await ok('a movie TMDB has no description for says so (instead of an empty box)', async () => { const c0 = await card(p, 0); assert.equal(c0.name.replace(/ \(\d{4}\)$/, ''), 'Free Funny'); assert.match(c0.text, /No description available on TMDB\./); assert.ok(!/Laugh now/.test(c0.text)); });
await tap(p, 0, '[data-testid=movie-trailer]'); await wait(700);
await ok('a movie with no trailer: the spare tab is closed again and you are told so on the card', async () => {
  const o = await opened(p); assert.equal(o.length, 1); assert.deepEqual([o[0].closed, o[0].location], [true, '']); assert.equal(await trailerNote(p, 0), 'No trailer found on TMDB for this movie.');
}); await p.close();

({ page: p, log } = await open(STATE(), { night: { minutes: 120, mood: 'any', onlyMine: false }, fail: { videos: true } })); await openSheet(p); await settled(p); await wait(500);
await tap(p, 0, '[data-testid=movie-more]'); await wait(250); await tap(p, 0, '[data-testid=movie-trailer]'); await wait(800);
await ok('if the trailer lookup fails you get a clear message, the spare tab is closed, and you can try again (the failure is not remembered)', async () => {
  assert.equal(await trailerNote(p, 0), 'Could not load the trailer. Check your connection and try again.'); const o = await opened(p); assert.equal(o.length, 1); assert.equal(o[0].closed, true);
  const btn = await p.evaluate(() => { const b = document.querySelector('[data-testid=movie-trailer]'); return [b.textContent, b.disabled]; }); assert.deepEqual(btn, ['▶ Watch trailer', false]);
}); await p.close();

({ page: p } = await open(STATE(), { w: 320, h: 700, night: { minutes: 120, mood: 'any', onlyMine: false } })); await openSheet(p); await settled(p);
await tap(p, 0, '[data-testid=movie-more]'); await wait(300);
await ok('320px wide with details open: no sideways scroll, and the panel and its trailer button fit inside the card', async () => {
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.equal(await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); const c = document.querySelector('[data-testid=movie-pick]'); const t = c.querySelector('[data-testid=movie-trailer]').getBoundingClientRect(); const cr = c.getBoundingClientRect(); return d.scrollWidth <= d.clientWidth + 1 && t.right <= cr.right && t.left >= cr.left; }), true);
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid=movie-more]').getBoundingClientRect().height >= 44), true, 'touch target is at least 44px tall');
}); await p.close();

({ page: p } = await open(STATE(), { w: 1280, h: 900, night: { minutes: 120, mood: 'any', onlyMine: false } })); await openSheet(p); await settled(p); await wait(400);
const before1 = (await card(p, 1)).h; await tap(p, 0, '[data-testid=movie-more]'); await wait(300); await p.screenshot({ path: `${OUT}/details_open_desktop.png` });
await ok('desktop (two columns): opening one pick does not stretch its neighbour, and nothing overflows', async () => {
  assert.equal(Math.round((await card(p, 1)).h), Math.round(before1)); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
}); await p.close();

// ============================================================ 7. layout
console.log('7. layout');
({ page: p } = await open(STATE(), { w: 320, h: 700 })); await openSheet(p); await settled(p);
await ok('320px wide: no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); assert.equal(await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d.scrollWidth <= d.clientWidth + 1; }), true); }); await p.close();
({ page: p } = await open(STATE(), { w: 1280, h: 900 })); await openSheet(p); await settled(p); await wait(500); await p.screenshot({ path: `${OUT}/sheet_desktop.png` });
await ok('desktop: renders without overflow', async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false)); await p.close();
console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
