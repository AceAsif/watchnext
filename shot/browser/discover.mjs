// Discover rows (taste engine) in a real browser against a mock TMDB: the one-time "Learning your
// taste" step, the rows and why-lines, the device cache, Not interested (+ Undo, + Settings list),
// the details sheet with trailer, + Watchlist, and layout on phone and desktop.
//   node shot/browser/discover.mjs
process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

const DIST = APP_DIST; const OUT = workPath('out_discover'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4191, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED = Date.parse('2026-10-01T22:00:00.000Z'); const DAY = 86400000;
const ago = (d) => new Date(FIXED - d * DAY).toISOString();
const eps = (count, at) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`1x${i + 1}`, { at, min: 50 }]));

// ---------------- the mock TMDB world
const TV = (id, name, o = {}) => ({ id, name, poster_path: `/t${id}.jpg`, first_air_date: '2022-03-01', vote_average: 7.6, vote_count: 1500, genre_ids: [9648], original_language: 'en', overview: `About ${name}.`, ...o });
const MV = (id, title, o = {}) => ({ id, title, poster_path: `/m${id}.jpg`, release_date: '2020-05-01', vote_average: 7.3, vote_count: 2500, genre_ids: [878], original_language: 'en', overview: `About ${title}.`, ...o });
const DET = {
  'tv/100': { genres: [{ id: 9648 }, { id: 18 }], original_language: 'de', first_air_date: '2017-12-01', keywords: { results: [{ id: 7, name: 'time travel' }] }, created_by: [{ id: 900, name: 'Baran bo Odar' }], credits: { cast: [{ id: 901, name: 'Louis Hofmann' }] } },
  'tv/101': { genres: [{ id: 9648 }, { id: 10765 }], original_language: 'en', first_air_date: '2016-12-16', keywords: { results: [{ id: 7, name: 'time travel' }] }, created_by: [{ id: 900, name: 'Baran bo Odar' }], credits: { cast: [] } },
  'tv/102': { genres: [{ id: 10764 }], original_language: 'en', first_air_date: '2015-01-01', keywords: { results: [] }, credits: { cast: [] } },
  'tv/103': { genres: [{ id: 18 }, { id: 9648 }], original_language: 'en', first_air_date: '2017-03-31', keywords: { results: [{ id: 8, name: 'high school' }] }, credits: { cast: [{ id: 950, name: 'Katherine Langford' }] } },
  'movie/200': { genres: [{ id: 878 }, { id: 18 }], original_language: 'en', release_date: '2016-11-10', keywords: { keywords: [{ id: 7, name: 'time travel' }] }, credits: { crew: [{ id: 960, name: 'Denis Villeneuve', job: 'Director' }], cast: [] } },
};
const RECS = {
  'tv/100': [TV(1001, '1899', { original_language: 'de' }), TV(1002, 'Severance', { genre_ids: [9648, 18] }), TV(1003, 'Russian Doll'), TV(1004, 'Devs', { genre_ids: [10765] }), TV(1005, 'Archive 81'), TV(1006, 'Counterpart', { genre_ids: [10765] }), TV(103, '13 Reasons Why'), TV(1007, 'No Poster', { poster_path: null })],
  'tv/101': [TV(1101, 'Sense8', { genre_ids: [10765, 18] }), TV(1002, 'Severance', { genre_ids: [9648, 18] }), TV(1102, 'Stranger Things', { genre_ids: [10765, 9648] }), TV(1103, 'Maniac', { genre_ids: [18] }), TV(1104, 'The Leftovers', { genre_ids: [18, 9648] }), TV(1105, 'Lost', { genre_ids: [10759, 9648] })],
  'tv/103': [TV(1301, 'Euphoria', { genre_ids: [18] }), TV(1302, 'Elite', { genre_ids: [18, 80], original_language: 'es' }), TV(1303, 'Sex Education', { genre_ids: [35, 18] }), TV(1304, 'Never Have I Ever', { genre_ids: [35] }), TV(1305, 'Outer Banks', { genre_ids: [10759, 18] }), TV(1306, 'Yellowjackets', { genre_ids: [18, 9648] })],
  'movie/200': [MV(2001, 'Interstellar'), MV(2002, 'Contact'), MV(2003, 'Annihilation'), MV(2004, 'Ex Machina'), MV(2005, 'Tenet'), MV(2006, 'Coherence', { vote_count: 400 })],
};
const PERSON = { 900: { cast: [], crew: [TV(9001, 'Paradise', { job: 'Creator', media_type: 'tv' }), MV(9002, 'Who Am I', { job: 'Director', media_type: 'movie', genre_ids: [53] }), TV(9003, 'Odar Show A', { media_type: 'tv', job: 'Creator' }), TV(9004, 'Odar Show B', { media_type: 'tv', job: 'Creator' }), TV(9005, 'Odar Show C', { media_type: 'tv', job: 'Writer' })] } };
const KW = { tv: [TV(7001, 'Outlander', { genre_ids: [18, 10765] }), TV(7002, 'Travelers', { genre_ids: [10765] }), TV(7003, 'Dark Matter', { genre_ids: [10765] }), TV(7004, '11.22.63', { genre_ids: [9648] })], movie: [MV(7101, 'Looper'), MV(7102, 'Primer'), MV(7103, 'About Time', { genre_ids: [10749, 18] })] };
const SVC = { tv: [TV(8001, 'Netflix Mystery 1'), TV(8002, 'Netflix Mystery 2'), TV(8003, 'Netflix Mystery 3')], movie: [MV(8101, 'Netflix Film 1'), MV(8102, 'Netflix Film 2')] };
const TREND = [TV(6001, 'Big Comedy', { genre_ids: [35], vote_average: 8.4, vote_count: 9000, media_type: 'tv' }), MV(6002, 'Cooking Doc', { genre_ids: [99], vote_average: 8.1, vote_count: 5000, media_type: 'movie' }), TV(6003, 'Western Hit', { genre_ids: [37], vote_average: 8.0, vote_count: 3000, media_type: 'tv' }), MV(6004, 'Family Film', { genre_ids: [10751], vote_average: 7.9, vote_count: 6000, media_type: 'movie' }), TV(6005, 'Reality Trash', { genre_ids: [10764], vote_average: 7.9, vote_count: 6000, media_type: 'tv' })];
// every show has an official trailer (YouTube key 'T' + 10-digit id); movies have none
const trailerKey = (id) => 'T' + String(id).padStart(10, '0');
const ALL = {}; for (const x of [...Object.values(RECS).flat(), ...PERSON[900].crew, ...KW.tv, ...KW.movie, ...SVC.tv, ...SVC.movie, ...TREND]) ALL[(x.title ? 'movie/' : 'tv/') + x.id] = x;

const LIB = () => ({
  shows: {
    'tmdb:100': { tmdbId: 100, name: 'Dark', rating: 5, ratedAt: ago(20), status: 'Ended', totalEpisodes: 26, genres: ['Mystery', 'Drama'], watched: eps(26, ago(20)), followed: true },
    'tmdb:101': { tmdbId: 101, name: 'The OA', status: 'Canceled', totalEpisodes: 16, genres: ['Mystery'], watched: eps(16, ago(100)), followed: true },
    'tmdb:102': { tmdbId: 102, name: 'Reality Show', dropped: true, droppedAt: ago(50), totalEpisodes: 30, genres: ['Reality'], watched: eps(1, ago(50)), followed: true },
    'tmdb:103': { tmdbId: 103, name: '13 Reasons Why', dropped: true, droppedAt: ago(300), totalEpisodes: 49, genres: ['Drama', 'Mystery'], watched: eps(26, ago(300)), followed: true },
  },
  movies: [{ tmdbId: 200, name: 'Arrival', status: 'watched', watchedAt: ago(60), rating: 4, ratedAt: ago(60), runtimeMin: 116 }],
  goals: {}, hidden: {}, settings: { tmdbKey: 'TESTKEY' },
});

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(120); } return false; };

// seed: true = a fresh start (this state, no saved taste); false = the app opening again with what
// the previous page left in localStorage.
async function open(state, { services = ['netflix'], w = 390, h = 844, seed = true, slow = 60, at = FIXED, anilist = null } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  const log = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|status of 500/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', async (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (u.startsWith('https://graphql.anilist.co')) { // the anime row: AniList recommendations
      const body = JSON.parse(r.postData() || '{}'); log.push({ p: 'anilist', id: body.variables && body.variables.id });
      if (!anilist) return r.respond({ status: 500, contentType: 'application/json', body: '{}' });
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: { Media: { recommendations: { nodes: anilist.map((m) => ({ rating: 50, mediaRecommendation: m })) } } } }) });
    }
    if (!u.includes('api.themoviedb.org')) return r.abort();
    const url = new URL(u); const p = url.pathname.replace('/3/', ''); const q = Object.fromEntries(url.searchParams); delete q.api_key;
    await wait(slow);
    const json = (b, status = 200) => r.respond({ status, contentType: 'application/json', body: JSON.stringify(b) });
    let m;
    if ((m = /^(tv|movie)\/(\d+)$/.exec(p))) {
      const k = `${m[1]}/${m[2]}`;
      if (q.append_to_response === 'keywords,credits') { log.push({ p: 'taste', k }); return json(DET[k] || {}); }
      log.push({ p: 'details', k }); const x = ALL[k] || { name: 'Show ' + m[2] }; return json({ id: +m[2], ...x, genres: (x.genre_ids || []).map((id) => ({ id, name: 'G' })), seasons: [], number_of_episodes: 8, status: 'Returning Series' });
    }
    if ((m = /^(tv|movie)\/(\d+)\/recommendations$/.exec(p))) { log.push({ p: 'rec', k: `${m[1]}/${m[2]}` }); return json({ results: RECS[`${m[1]}/${m[2]}`] || [] }); }
    if ((m = /^(tv|movie)\/(\d+)\/similar$/.exec(p))) { log.push({ p: 'similar', k: `${m[1]}/${m[2]}` }); return json({ results: [] }); }
    if ((m = /^(tv|movie)\/(\d+)\/videos$/.exec(p))) { log.push({ p: 'videos', k: `${m[1]}/${m[2]}` }); return json({ results: m[1] === 'tv' ? [{ site: 'YouTube', type: 'Teaser', official: true, key: 'Teaser00001' }, { site: 'YouTube', type: 'Trailer', official: true, key: trailerKey(+m[2]) }] : [] }); }
    if ((m = /^person\/(\d+)\/combined_credits$/.exec(p))) { log.push({ p: 'person', id: +m[1] }); return json(PERSON[m[1]] || { cast: [], crew: [] }); }
    if ((m = /^discover\/(tv|movie)$/.exec(p))) { log.push({ p: 'discover', kind: m[1], q }); return json({ results: q.with_keywords ? KW[m[1]] : q.with_watch_providers ? SVC[m[1]] : [] }); }
    if (p === 'watch/providers/movie') { log.push({ p: 'providers' }); return json({ results: [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 21, provider_name: 'Stan' }] }); }
    if (p === 'trending/all/week') { log.push({ p: 'trending' }); return json({ results: TREND }); }
    if (p === 'search/tv') { log.push({ p: 'search', q: q.query }); return json({ results: [{ id: 5100, name: q.query, original_language: 'ja', poster_path: '/a.jpg' }, { id: 5101, name: q.query + ' (US remake)', original_language: 'en' }] }); }
    return json({ results: [] });
  });
  await page.evaluateOnNewDocument((s, svc, fixed, doSeed) => {
    if (doSeed && !sessionStorage.getItem('__s')) {
      localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.setItem('watchnext-services-v1', JSON.stringify({ mine: svc, showsOnly: false, watchlistOnly: false })); sessionStorage.setItem('__s', '1');
      localStorage.removeItem('watchnext-taste-v1');
    }
    window.__opened = [];
    window.open = (u, t) => { const w = { url: u, target: t, location: '', closed: false, opener: {}, close() { this.closed = true; } }; window.__opened.push(w); return w; };
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, state, services, at, seed);
  await page.goto('http://localhost:4191/', { waitUntil: 'networkidle0' }); await wait(300);
  return { page, log };
}
const toDiscover = async (p) => {
  await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Watchlist')).click()); await wait(300);
  await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.startsWith('Discover')).click()); await wait(150);
};
const done = (p) => waitFor(() => p.evaluate(() => !document.querySelector('[data-testid=disc-progress]') && document.querySelectorAll('.sd-disc-row').length > 0));
const rowsOf = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-disc-row')].map((r) => ({ type: r.dataset.row, title: r.querySelector('h3').textContent, items: [...r.querySelectorAll('.sd-disc-card')].map((c) => ({ key: c.dataset.key, name: c.querySelector('.sd-tilebtn-name').textContent, why: c.querySelector('.sd-pick-why').textContent, match: c.querySelector('.sd-disc-match').textContent })) })));
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const clickCardBtn = (p, key, sel) => p.evaluate((k, s) => document.querySelector(`.sd-disc-card[data-key="${k}"] ${s}`).click(), key, sel);

// ============================================================ 1. first visit
console.log('1. first visit: learning your taste, then rows');
let { page: p, log } = await open(LIB(), { slow: 140 });
await toDiscover(p);
const seenProgress = [];
await waitFor(async () => { const t = await p.evaluate(() => (document.querySelector('[data-testid=disc-progress] strong') || {}).textContent || ''); if (t) seenProgress.push(t); return /of 5/.test(t) && !/^Learning your taste… 0 of/.test(t); }, 8000);
await p.screenshot({ path: `${OUT}/learning_phone.png` });
await ok('the first visit shows "Learning your taste… N of 5" with a progress bar, then builds rows by itself (no button to press)', async () => {
  assert.ok(seenProgress.some((t) => /^Learning your taste… \d of 5$/.test(t)), seenProgress.join(' | '));
  assert.ok(await done(p), 'rows appeared');
});
await p.screenshot({ path: `${OUT}/rows_phone.png`, fullPage: true });
const rows1 = await rowsOf(p);
await ok('rows: Top picks, then "Because you…" rows for your 3 strongest titles, More from a creator, a keyword row, On your services, Something different', async () => {
  assert.deepEqual(rows1.map((r) => r.type), ['top', 'seed', 'seed', 'seed', 'person', 'keyword', 'services', 'different']);
  assert.deepEqual(rows1.slice(0, 4).map((r) => r.title), ['Top picks for you', 'Because you rated Dark 5★', 'Because you watched The OA', 'Because you rated Arrival 4★']);
  const teen = new Set(RECS['tv/103'].map((x) => 'tv:' + x.id));
  assert.ok(rows1.flatMap((r) => r.items).some((c) => teen.has(c.key)), '13 Reasons Why (dropped after 2 seasons) still counts as liked, so its suggestions are in the mix');
  assert.equal(rows1.find((r) => r.type === 'person').title, 'More from Baran bo Odar');
  assert.equal(rows1.find((r) => r.type === 'keyword').title, 'Your kind of story: time travel');
});
await ok('every card has a poster, a match % and a why-line; top picks say which title they come from', async () => {
  for (const r of rows1) for (const c of r.items) { assert.match(c.match, /^\d{1,2}% match$/); assert.ok(c.why.length > 0, c.name); }
  assert.ok(rows1[0].items.every((c) => /^Because you liked |^You watch a lot of /.test(c.why)), rows1[0].items.map((c) => c.why).join(' | '));
});
await ok('never suggested: titles you have (13 Reasons Why), posterless ones, a genre you dropped after 1 episode (Reality Trash); the themed rows never repeat a title', async () => {
  const all = rows1.flatMap((r) => r.items); const names = all.map((c) => c.name);
  assert.ok(!names.includes('13 Reasons Why') && !names.includes('No Poster') && !names.includes('Reality Trash'), names.join(', '));
  const themed = rows1.slice(1).flatMap((r) => r.items); assert.equal(new Set(themed.map((c) => c.key)).size, themed.length);
});
await ok('TMDB was asked once per library title for keywords+people (5), and for recommendations of the liked ones only', async () => {
  assert.deepEqual(log.filter((l) => l.p === 'taste').map((l) => l.k).sort(), ['movie/200', 'tv/100', 'tv/101', 'tv/102', 'tv/103']);
  const recs = log.filter((l) => l.p === 'rec').map((l) => l.k).sort(); assert.ok(!recs.includes('tv/102'), 'not for the show dropped after 1 episode'); assert.ok(recs.includes('tv/103'));
  const svc = log.filter((l) => l.p === 'discover' && l.q.with_watch_providers); assert.equal(svc.length, 2); assert.ok(svc.every((l) => l.q.with_watch_providers === '8' && l.q.watch_region === 'AU'));
});
await ok('the rows scroll sideways on a phone, but the page itself never does', async () => {
  assert.equal(await p.evaluate(() => { const s = document.querySelector('.sd-disc-strip'); return s.scrollWidth > s.clientWidth; }), true);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
});
await ok('the learned taste is saved on this device', async () => {
  const c = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-taste-v1'))); assert.deepEqual(Object.keys(c.items).sort(), ['movie:200', 'tv:100', 'tv:101', 'tv:102', 'tv:103']);
});
// switching tabs and back keeps the rows (no rebuild)
log.length = 0;
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.startsWith('Queue')).click()); await wait(200); await toDiscover(p); await wait(300);
await ok('leaving the tab and coming back shows the same rows instantly, with no new TMDB calls', async () => { assert.deepEqual((await rowsOf(p)).map((r) => r.title), rows1.map((r) => r.title)); assert.equal(log.length, 0); });
await p.close();

// ============================================================ 2. second visit uses the cache
console.log('2. the next time the app opens');
({ page: p, log } = await open(LIB(), { seed: false }));
await toDiscover(p);
const seen2 = []; await waitFor(async () => { const t = await p.evaluate(() => (document.querySelector('[data-testid=disc-progress] strong') || {}).textContent || ''); if (t) seen2.push(t); return !t && (await p.evaluate(() => document.querySelectorAll('.sd-disc-row').length)) > 0; });
await ok('no "learning" this time: nothing is looked up again, the rows come straight from the cache + fresh suggestions', async () => {
  assert.equal(log.filter((l) => l.p === 'taste').length, 0); assert.ok(!seen2.some((t) => /Learning your taste… \d+ of [1-9]/.test(t)), seen2.join('|'));
  assert.deepEqual((await rowsOf(p)).map((r) => r.type), rows1.map((r) => r.type));
});

// ============================================================ 3. not interested
console.log('3. Not interested');
const victim = (await rowsOf(p))[0].items[0];
await clickCardBtn(p, victim.key, '.sd-pick-x'); await wait(250);
await p.screenshot({ path: `${OUT}/hidden_undo_phone.png` });
await ok('× on a card hides it at once, says so with an Undo, and saves it (with a time stamp) for syncing', async () => {
  assert.ok(!(await rowsOf(p)).flatMap((r) => r.items).some((c) => c.key === victim.key));
  assert.match(await p.evaluate(() => document.querySelector('.sd-disc-undo').innerText), new RegExp(`Hidden “${victim.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}”`));
  const h = (await stored(p)).hidden[victim.key]; assert.equal(h.on, true); assert.equal(h.name, victim.name); assert.ok(Date.parse(h.at) > 0);
});
await p.evaluate(() => [...document.querySelectorAll('.sd-disc-undo button')].find((b) => b.textContent === 'Undo').click()); await wait(250);
await ok('Undo brings it straight back and records the undo (on:false) so other devices get it too', async () => {
  assert.ok((await rowsOf(p)).flatMap((r) => r.items).some((c) => c.key === victim.key)); assert.equal((await stored(p)).hidden[victim.key].on, false);
  assert.equal(await p.evaluate(() => !!document.querySelector('.sd-disc-undo')), false);
});
await clickCardBtn(p, victim.key, '.sd-pick-x'); await wait(200);
const victim2 = (await rowsOf(p)).find((r) => r.type === 'seed').items[0];
await clickCardBtn(p, victim2.key, '.sd-pick-x'); await wait(200);
await ok('the footer counts hidden titles and points to Settings', async () => assert.match(await p.evaluate(() => document.querySelector('[data-testid=disc-hidden]').textContent), /^2 titles hidden with “Not interested”\. You can bring them back in Settings\.$/));

// ============================================================ 4. details sheet, trailer, + Watchlist
console.log('4. details, trailer, + Watchlist');
const sev = (await rowsOf(p)).find((r) => r.type === 'seed').items.find((c) => c.key.startsWith('tv:'));
const SEV = ALL['tv/' + sev.key.slice(3)];
await clickCardBtn(p, sev.key, '.sd-disc-open'); await wait(300);
await p.screenshot({ path: `${OUT}/details_phone.png` });
await ok('tapping a poster opens its details: name, year, match, TMDB rating, genres, why and the description', async () => {
  const t = await p.evaluate(() => document.querySelector('[role=dialog]').innerText);
  assert.ok(t.includes(SEV.name)); assert.match(t, /2022 · Show/); assert.match(t, /\d+% match/); assert.match(t, /TMDB 7\.6/); assert.ok(t.includes(`About ${SEV.name}.`));
  assert.ok(t.includes(sev.why), 'the same why-line as the card');
});
await p.evaluate(() => document.querySelector('[data-testid=disc-trailer]').click()); await wait(400);
await ok('▶ Trailer opens the official YouTube trailer in a new tab', async () => {
  const o = await p.evaluate(() => window.__opened.map((w) => ({ location: w.location, closed: w.closed })));
  assert.deepEqual(o, [{ location: `https://www.youtube.com/watch?v=${trailerKey(SEV.id)}`, closed: false }]);
});
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === '+ Watchlist').click());
await waitFor(() => p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].some((b) => b.textContent === 'Added ✓')));
await ok('+ Watchlist in the sheet adds the show to your watchlist (and the card says Added ✓)', async () => {
  const s = await stored(p); const show = Object.values(s.shows).find((x) => x.tmdbId === SEV.id); assert.ok(show && show.watchlist, 'on the watchlist');
  await p.keyboard.press('Escape'); await wait(200);
  assert.equal(await p.evaluate((k) => document.querySelector(`.sd-disc-card[data-key="${k}"] .sd-btn`).textContent, sev.key), 'Added ✓');
});
const film = (await rowsOf(p)).flatMap((r) => r.items).find((c) => c.key.startsWith('movie:') && !c.name.startsWith('Netflix'));
await clickCardBtn(p, film.key, '.sd-disc-open'); await wait(250);
await p.evaluate(() => document.querySelector('[data-testid=disc-trailer]').click()); await wait(400);
await ok('no trailer on TMDB: the empty tab is closed and it says so', async () => {
  assert.equal(await p.evaluate(() => window.__opened[1].closed), true); assert.match(await p.evaluate(() => document.querySelector('[role=dialog]').innerText), /No trailer found on TMDB for this title\./);
});
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Not interested').click()); await wait(250);
await ok('"Not interested" in the sheet closes it and hides the title', async () => {
  assert.equal(await p.evaluate(() => !!document.querySelector('[role=dialog]')), false); assert.ok(!(await rowsOf(p)).flatMap((r) => r.items).some((c) => c.key === film.key)); assert.equal((await stored(p)).hidden[film.key].on, true);
});
await p.close();

// ============================================================ 5. Settings list + next build
console.log('5. Hidden from Discover in Settings');
({ page: p, log } = await open(LIB(), { seed: false }));
await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Settings')).click()); await wait(400);
await p.screenshot({ path: `${OUT}/settings_hidden_phone.png`, fullPage: true });
await ok('Settings lists the 3 hidden titles, newest first', async () => {
  const names = await p.evaluate(() => [...document.querySelectorAll('#hidden .nm')].map((x) => x.textContent));
  assert.deepEqual(names, [film.name, victim2.name, victim.name]);
});
await p.evaluate((n) => document.querySelector(`#hidden button[aria-label="Show ${n} again"]`).click(), victim.name); await wait(250);
await ok('"Show again" takes it off the list (kept as on:false so the change syncs)', async () => {
  assert.equal(await p.evaluate(() => document.querySelectorAll('#hidden li').length), 2); assert.equal((await stored(p)).hidden[victim.key].on, false);
});
await toDiscover(p); await done(p);
await ok('Discover respects the list on a fresh build: hidden titles stay out, the one shown again can come back', async () => {
  const all = (await rowsOf(p)).flatMap((r) => r.items.map((c) => c.key)); assert.ok(!all.includes(victim2.key) && !all.includes(film.key)); assert.ok(all.includes(victim.key));
  assert.ok(!all.includes(sev.key), 'the show you added is on your watchlist now, so it is not suggested');
});
await ok('hit rate: the footer counts what Discover has suggested and that you added one of them', async () => {
  const t = await p.evaluate(() => document.querySelector('[data-testid=disc-hits]').textContent);
  const shown = Object.keys(await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-discover-log-v1')))).length;
  assert.ok(shown > 30, String(shown)); assert.equal(t, `Discover has suggested ${shown} titles: you added 1 (${Math.round(100 / shown) < 1 ? '<1' : Math.round(100 / shown)}%) and watched 0.`);
});
await p.close();

// ============================================================ 6. edge cases
console.log('6. edge cases');
({ page: p } = await open({ ...LIB(), settings: { tmdbKey: '' } })); await toDiscover(p); await wait(300);
await ok('no TMDB key: asks for one, makes no calls', async () => assert.match(await p.evaluate(() => document.body.innerText), /Add a TMDB API key in Settings to get recommendations/)); await p.close();
({ page: p, log } = await open({ shows: {}, movies: [], settings: { tmdbKey: 'TESTKEY' } })); await toDiscover(p); await wait(500);
await ok('empty library: Movie night is still there, plus a hint, and nothing is fetched', async () => {
  const t = await p.evaluate(() => document.body.innerText); assert.match(t, /Movie night/); assert.match(t, /Discover will learn your taste/); assert.equal(log.length, 0);
}); await p.close();
({ page: p, log } = await open(LIB(), { services: [] })); await toDiscover(p); await done(p);
await ok('no services ticked: no "On your services" row and no provider lookups', async () => {
  assert.ok(!(await rowsOf(p)).some((r) => r.type === 'services')); assert.equal(log.filter((l) => l.p === 'providers').length, 0);
}); await p.close();

// ============================================================ 6b. Phase 2: anime row, time of day, Stats card
console.log('6b. anime row (AniList), time of day, Your taste');
const AOT_RECS = [
  { id: 101922, isAdult: false, title: { english: 'Demon Slayer', romaji: 'Kimetsu no Yaiba' }, seasonYear: 2019, genres: ['Action', 'Drama', 'Fantasy'], averageScore: 84, popularity: 700000, description: 'A boy <i>fights</i> demons.', coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922.jpg' }, trailer: { id: 'VQGCKyvzIM4', site: 'youtube' } },
  { id: 113415, isAdult: false, title: { english: 'Jujutsu Kaisen', romaji: 'Jujutsu Kaisen' }, seasonYear: 2020, genres: ['Action', 'Drama', 'Supernatural'], averageScore: 85, popularity: 650000, description: 'Curses.', coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415.jpg' }, trailer: null },
  { id: 101348, isAdult: false, title: { english: 'Vinland Saga', romaji: 'Vinland Saga' }, seasonYear: 2019, genres: ['Action', 'Adventure', 'Drama'], averageScore: 87, popularity: 400000, description: 'Vikings.', coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101348.jpg' }, trailer: null },
  { id: 21507, isAdult: false, title: { english: 'Mob Psycho 100', romaji: 'Mob Psycho 100' }, seasonYear: 2016, genres: ['Action', 'Comedy'], averageScore: 85, popularity: 380000, description: 'Psychic.', coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21507.jpg' }, trailer: null },
  { id: 16498, isAdult: false, title: { english: 'Attack on Titan', romaji: 'Shingeki no Kyojin' }, seasonYear: 2013, genres: ['Action'], averageScore: 85, popularity: 900000, description: 'Owned.', coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498.jpg' }, trailer: null },
];
const ANIME_LIB = () => { const s = LIB(); s.shows['tmdb:104'] = { tmdbId: 104, name: 'Attack on Titan', rating: 5, ratedAt: ago(5), status: 'Ended', totalEpisodes: 87, genres: ['Animation', 'Action & Adventure'], watched: eps(87, ago(5)), followed: true, anime: { id: 16498 } }; return s; };
// Sat 3 Oct, 20:00 in Hobart: the weekend
({ page: p, log } = await open(ANIME_LIB(), { anilist: AOT_RECS, at: Date.parse('2026-10-03T10:00:00.000Z') })); await toDiscover(p); await done(p);
const animeRow = (await rowsOf(p)).find((r) => r.type === 'anime');
await p.screenshot({ path: `${OUT}/anime_row_phone.png`, fullPage: true });
await ok('an "Anime like Attack on Titan" row from AniList (one request, for your liked anime), with AniList covers, never the anime you have', async () => {
  assert.ok(animeRow, (await rowsOf(p)).map((r) => r.title).join(' | ')); assert.equal(animeRow.title, 'Anime like Attack on Titan');
  assert.deepEqual(animeRow.items.map((c) => c.name).sort(), ['Demon Slayer', 'Jujutsu Kaisen', 'Mob Psycho 100', 'Vinland Saga']);
  assert.deepEqual(log.filter((l) => l.p === 'anilist').map((l) => l.id), [16498]);
  const srcs = await p.evaluate(() => [...document.querySelectorAll('.sd-disc-row[data-row=anime] img')].map((i) => i.getAttribute('src')));
  assert.ok(srcs.every((u) => u.startsWith('https://s4.anilist.co/')), srcs.join(','));
});
await ok('weekend evening: Top picks says it leans to films', async () => {
  assert.equal(await p.evaluate(() => document.querySelector('.sd-disc-row[data-row=top] .sd-sub').textContent), 'Ranked on everything you watch · leaning to films for the weekend');
});
await clickCardBtn(p, 'anime:101922', '.sd-disc-open'); await wait(300);
await ok('an anime card opens with "Anime · from AniList", its AniList score and description (no HTML), and ▶ Trailer goes to its YouTube trailer', async () => {
  const t = await p.evaluate(() => document.querySelector('[role=dialog]').innerText);
  assert.match(t, /2019 · Anime · from AniList/); assert.match(t, /AniList 8\.4/); assert.match(t, /A boy fights demons\./);
  await p.evaluate(() => document.querySelector('[data-testid=disc-trailer]').click()); await wait(300);
  assert.equal(await p.evaluate(() => window.__opened[0].location), 'https://www.youtube.com/watch?v=VQGCKyvzIM4');
});
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === '+ Watchlist').click());
await waitFor(() => p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].some((b) => b.textContent === 'Added ✓')));
await ok('+ Watchlist on an anime finds it on TMDB by title (the Japanese match, not the remake) and adds that show', async () => {
  assert.deepEqual(log.filter((l) => l.p === 'search').map((l) => l.q), ['Demon Slayer']);
  const show = Object.values((await stored(p)).shows).find((x) => x.tmdbId === 5100); assert.ok(show && show.watchlist);
});
await p.keyboard.press('Escape'); await wait(200);
await clickCardBtn(p, 'anime:113415', '.sd-pick-x'); await wait(200);
await ok('"Not interested" works on anime too (saved with its AniList cover)', async () => {
  const h = (await stored(p)).hidden['anime:113415']; assert.equal(h.on, true); assert.equal(h.image, 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415.jpg');
});
// Stats → Breakdown → Your taste
await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Stats')).click()); await wait(400);
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent === 'Breakdown').click()); await wait(400);
await p.evaluate(() => document.querySelector('[data-testid=your-taste]').scrollIntoView()); await wait(200);
await p.screenshot({ path: `${OUT}/your_taste_phone.png` });
await ok('Stats → Breakdown → Your taste: top genres as shares, the shared theme, the creator, what you steer away from, and the hit rate', async () => {
  const t = await p.evaluate(() => document.querySelector('[data-testid=your-taste]').innerText.replace(/\s+/g, ' '));
  const bars = await p.evaluate(() => [...document.querySelectorAll('[data-testid=your-taste] [data-bar]')].map((b) => [b.dataset.bar, +b.querySelector('.sd-bar-val').textContent.replace('%', '')]));
  assert.equal(bars[0][0], 'Mystery', JSON.stringify(bars)); assert.ok(bars.reduce((n, b) => n + b[1], 0) <= 101);
  // (labels are upper-cased on screen, so the label part is matched case-insensitively)
  assert.match(t, /Themes time travel/i); assert.match(t, /People Baran bo Odar \(creator\/director\)/i); assert.match(t, /Steering away from Reality/i);
  assert.match(t, /Languages German \d+% · English \d+%/i, 'Dark (German, 5★, recent) leads');
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=taste-hits]').textContent), /you added 1 \(/);
  assert.match(t, /Discover, Tonight and Movie night all use it\./);
});
await p.close();
// a library with nothing to learn from yet: one imported show, no genres, no rating
({ page: p } = await open({ shows: { 'tvdb:1': { name: 'Imported', followed: true, totalEpisodes: 10, watched: eps(2, ago(400)) } }, movies: [], settings: { tmdbKey: 'TESTKEY' } }));
await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Stats')).click()); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent === 'Breakdown').click()); await wait(300);
await ok('Your taste with nothing to learn from yet: a friendly hint, no errors', async () => assert.match(await p.evaluate(() => document.body.innerText), /what WatchNext learns about your taste will show here/));
await p.close();
({ page: p, log } = await open(ANIME_LIB(), { anilist: null })); await toDiscover(p); await done(p);
await ok('AniList down: no anime row, the rest of Discover is unaffected', async () => {
  assert.equal(log.filter((l) => l.p === 'anilist').length, 1); const types = (await rowsOf(p)).map((r) => r.type); assert.ok(!types.includes('anime')); assert.ok(types.includes('seed') && types.includes('top'));
}); await p.close();

// ============================================================ 7. desktop
console.log('7. desktop');
({ page: p } = await open(LIB(), { w: 1280, h: 900 })); await toDiscover(p); await done(p); await wait(300);
await p.screenshot({ path: `${OUT}/rows_desktop.png` });
await ok('desktop: bigger cards, no page overflow', async () => {
  assert.equal(await p.evaluate(() => Math.round(document.querySelector('.sd-disc-card').getBoundingClientRect().width)), 150);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
}); await p.close();
({ page: p } = await open(LIB(), { w: 320, h: 700 })); await toDiscover(p); await done(p);
await ok('320px wide: no sideways page scroll', async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false)); await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
