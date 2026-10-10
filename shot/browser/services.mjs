process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

const DIST = APP_DIST; const OUT = workPath('out_sv'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4186, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED = Date.parse('2026-10-01T22:00:00.000Z'); const DAY = 86400000; const ago = (d, from = FIXED) => new Date(from - d * DAY).toISOString();
const P = (name) => ({ provider_name: name, logo_path: '/' + name.replace(/\W/g, '') + '.png' });

// ---- what the (mock) TMDB says about Australia
const AU = {
  'tv/101': { flatrate: [P('Netflix')], link: 'https://j/101' }, 'tv/102': { flatrate: [P('Stan')] }, 'tv/103': { flatrate: [P('Binge')] },
  'tv/104': { free: [P('ABC iview')] }, 'tv/105': null, 'tv/106': { rent: [P('Apple TV')], buy: [P('Google Play')] },
  'tv/107': { flatrate: [P('Netflix')], ads: [P('Tubi')] }, 'tv/108': 'FAIL',
  'movie/201': { flatrate: [P('Netflix')] }, 'movie/202': { flatrate: [P('Binge')] }, 'movie/203': { free: [P('SBS On Demand')] },
  'tv/302': { flatrate: [P('Stan')] }, 'tv/303': { flatrate: [P('Stan')] }, 'tv/304': { flatrate: [P('Binge')] },
};
// independent classification (test's own code, not the app's)
const FREE_RE = /iview|sbs/i;
const onMine = (b, names) => !!b && b !== 'FAIL' && ([...(b.free || []), ...(b.ads || [])].length > 0 || (b.flatrate || []).some((p) => FREE_RE.test(p.provider_name) || names.has(p.provider_name)));

const mkShow = (id, name, o = {}) => ({ followed: false, watchlist: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 40, genres: ['Drama'], name, tmdbId: id, totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: {}, ...o });
const W = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`1x${i + 1}`, { at: '2026-09-01T10:00:00.000Z', min: 40, n: 1 }]));
const cache = (subs, free, daysAgo = 1) => ({ providers: subs.map((n) => ({ name: n, logo: null })), providersFree: free.map((n) => ({ name: n, logo: null })), providersSynced: ago(daysAgo) });
const WL = [[101, 'Netflix Show'], [102, 'Stan Show'], [103, 'Binge Only'], [104, 'Iview Free'], [105, 'Nowhere Show'], [106, 'Rent Only'], [107, 'Netflix And Tubi'], [108, 'Always Fails']];
const MOVIES = (cached) => [
  { tmdbId: 201, name: 'Movie On Netflix', status: 'planned', year: 2020, poster: null, ...(cached ? cache(['Netflix'], []) : {}) },
  { tmdbId: 202, name: 'Movie On Binge', status: 'planned', year: 2021, poster: null, ...(cached ? cache(['Binge'], []) : {}) },
  { tmdbId: 203, name: 'Movie On SBS', status: 'planned', year: 2019, poster: null, ...(cached ? cache([], ['SBS On Demand']) : {}) },
  { name: 'Movie No Id', status: 'planned', year: 2018, poster: null },
];
const stateFresh = (key = 'TESTKEY') => ({ shows: Object.fromEntries(WL.map(([id, n]) => [`tmdb:${id}`, mkShow(id, n)])), movies: MOVIES(false), settings: { tmdbKey: key } });
const CACHED_OK = { 101: [['Netflix'], []], 102: [['Stan'], []], 103: [['Binge'], []], 104: [[], ['ABC iview']], 105: [[], []], 106: [[], []], 107: [['Netflix'], ['Tubi']] };
const stateCached = (daysAgo = 1, key = 'TESTKEY') => ({ shows: Object.fromEntries(WL.map(([id, n]) => [`tmdb:${id}`, mkShow(id, n, CACHED_OK[id] ? cache(CACHED_OK[id][0], CACHED_OK[id][1], daysAgo) : {})])), movies: MOVIES(true).map((m) => (m.providersSynced ? { ...m, providersSynced: ago(daysAgo) } : m)), settings: { tmdbKey: key } });
const LIB = () => ({ shows: {
  'tmdb:301': mkShow(301, 'Lib Netflix', { followed: true, watchlist: false, watched: W(2), ...cache(['Netflix'], [], 1) }),
  'tmdb:302': mkShow(302, 'Lib Stan Finished', { followed: true, watchlist: false, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: W(3), ...cache(['Stan'], [], 20) }),
  'tmdb:303': mkShow(303, 'Lib Uncached', { followed: true, watchlist: false, watched: {} }),
  'tmdb:304': mkShow(304, 'Lib Binge', { followed: true, watchlist: false, watched: {} }),
  'tmdb:305': mkShow(305, 'Lib Dropped', { followed: true, watchlist: false, dropped: true, watched: W(1), ...cache(['Netflix'], [], 1) }),
}, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const LIBCACHED = () => { const s = LIB(); s.shows['tmdb:302'] = { ...s.shows['tmdb:302'], ...cache(['Stan'], [], 1) }; s.shows['tmdb:303'] = { ...s.shows['tmdb:303'], ...cache(['Stan'], [], 1) }; s.shows['tmdb:304'] = { ...s.shows['tmdb:304'], ...cache(['Binge'], [], 1) }; return s; };

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(150); } return false; };
async function open(state, prefs, { w = 390, h = 844, now = FIXED, tab = null } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  const log = []; let active = 0; const stats = { max: 0 };
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|status of 500/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', async (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    const m = /api\.themoviedb\.org\/3\/(tv|movie)\/(\d+)\/watch\/providers/.exec(u);
    if (m) {
      const key = `${m[1]}/${m[2]}`; log.push(key); active++; stats.max = Math.max(stats.max, active);
      await wait(250); active--;
      const b = AU[key];
      if (b === 'FAIL') return r.respond({ status: 500, contentType: 'application/json', body: '{"status_message":"boom"}' });
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: +m[2], results: b ? { AU: b } : {} }) });
    }
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ episodes: [], results: [] }) });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, pr, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); if (pr === null) localStorage.removeItem('watchnext-services-v1'); else localStorage.setItem('watchnext-services-v1', JSON.stringify(pr)); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, state, prefs, now);
  await page.goto('http://localhost:4186/', { waitUntil: 'networkidle0' }); await wait(400);
  if (tab) { await page.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), tab); await wait(450); }
  return { page, log, stats };
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(450); };
const prefsOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-services-v1') || 'null'));
const status = (p) => p.evaluate(() => { const s = document.querySelector('[data-testid=services-status]'); return s ? s.innerText.replace(/\s+/g, ' ').trim() : null; });
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-mrow')].map((r) => [(r.querySelector('.sd-mrow-name') || {}).textContent, (r.querySelector('.sd-svc-meta') || {}).textContent || '']));
const rowNames = async (p) => (await rows(p)).map((r) => r[0]).sort();
const headers = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-sec2-head .sd-lbl')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
const toggle = (p) => p.evaluate(() => document.querySelector('button.sd-svctoggle').click());
const toggleOn = (p) => p.evaluate(() => document.querySelector('button.sd-svctoggle').getAttribute('aria-pressed') === 'true');
const clickText = (p, label, sel = 'button') => p.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => (e.getAttribute('aria-label') || e.textContent).trim().includes(t)); if (!el) throw new Error('no element: ' + t); el.click(); }, label, sel);
const dlg = (p) => p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d ? { title: d.getAttribute('aria-label'), text: d.innerText.replace(/\s+/g, ' '), chips: [...d.querySelectorAll('.chip')].map((c) => [c.textContent.trim(), c.getAttribute('aria-pressed') === 'true']) } : null; });
const count = (log, key) => log.filter((k) => k === key).length;
const settled = (p) => waitFor(async () => { const s = await status(p); return !s || !/Checking/.test(s); });

// ============================================================ A. Settings: My services
console.log('A. Settings → My services');
let { page: p, log } = await open(stateFresh(), null, { tab: 'Settings' });
await ok('a "My services" card lists the subscription services you can tick (no cinema / other / YouTube / iview), and says free ones always count', async () => {
  const card = await p.evaluate(() => { const c = [...document.querySelectorAll('section')].find((s) => /My services/.test(s.innerText)); return c ? { text: c.innerText.replace(/\s+/g, ' '), chips: [...c.querySelectorAll('.chip')].map((x) => x.textContent.trim()) } : null; });
  assert.ok(card); assert.deepEqual(card.chips.sort(), ['Apple TV+', 'Binge', 'Crunchyroll', 'Disney+', 'Hulu', 'Max', 'Paramount+', 'Prime Video', 'Stan', 'Netflix'].sort());
  assert.match(card.text, /Free-to-watch services \(ABC iview, SBS On Demand, 7plus and similar\) always count/); assert.match(card.text, /Kept on this device only/);
});
await p.evaluate(() => { const c = [...document.querySelectorAll('section')].find((s) => /My services/.test(s.innerText)); for (const name of ['Netflix', 'Stan']) [...c.querySelectorAll('.chip')].find((x) => x.textContent.trim() === name).click(); }); await wait(300);
await ok('ticking Netflix and Stan is remembered on this device (own storage key, not in the library)', async () => {
  assert.deepEqual((await prefsOf(p)).mine.sort(), ['netflix', 'stan']); const st = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1'))); assert.ok(!JSON.stringify(st).includes('"mine"'));
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.chip.on')].map((c) => c.textContent.trim()).sort()), ['Netflix', 'Stan']);
});
await p.evaluate(() => [...document.querySelectorAll('section')].find((x) => /My services/.test(x.innerText)).scrollIntoView({ block: 'start' })); await wait(250);
await p.screenshot({ path: `${OUT}/settings_card_phone.png`, fullPage: false });
await p.reload({ waitUntil: 'networkidle0' }); await wait(400); await tab(p, 'Settings');
await ok('after a reload the ticks are still there', async () => assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.chip.on')].map((c) => c.textContent.trim()).sort()), ['Netflix', 'Stan']));
await p.close();

// ============================================================ B. filter OFF = no lookups at all
console.log('B. filter off');
({ page: p, log } = await open(stateFresh(), null, { tab: 'Watchlist' }));
await wait(1500);
await ok('with the filter off nothing changes: every title is listed and TMDB is never asked about availability', async () => {
  assert.equal((await rows(p)).length, 8 + 4); assert.equal(log.length, 0); assert.equal(await status(p), null); assert.equal(await toggleOn(p), false);
});
await p.close();

// ============================================================ C. Watchlist, first use
console.log('C. Watchlist: first use (no services chosen yet)');
({ page: p, log } = await open(stateFresh(), null, { tab: 'Watchlist' }));
await toggle(p); await wait(500);
await ok('switching it on with no services chosen opens the picker straight away', async () => { const d = await dlg(p); assert.equal(d.title, 'My services'); assert.equal(d.chips.length, 10); assert.ok(d.chips.every((c) => !c[1])); assert.match(d.text, /always count/); });
await clickText(p, 'Done', '[role=dialog] button'); await wait(300);
await ok('checking runs in the background: "Checking availability… N left" is shown while it works', async () => { await wait(300); const s = await status(p); assert.match(s, /Checking availability… \d+ left|couldn’t be checked/); });
const done = await settled(p); await wait(500);
await ok('lookups finished', async () => assert.ok(done));
await ok('each title was looked up exactly ONCE (shows 101-108, movies 201-203); the movie with no TMDB id was never asked about', async () => {
  for (const k of ['tv/101', 'tv/102', 'tv/103', 'tv/104', 'tv/105', 'tv/106', 'tv/107', 'tv/108', 'movie/201', 'movie/202', 'movie/203']) assert.equal(count(log, k), 1, k);
  assert.equal(log.length, 11);
});
await ok('with NO services ticked, only FREE-to-watch titles show (free always counts): Iview Free, Netflix And Tubi (ad-supported Tubi), Movie On SBS', async () => {
  assert.deepEqual(await rowNames(p), ['Iview Free', 'Movie On SBS', 'Netflix And Tubi']); assert.deepEqual(await headers(p), ['Shows to watch · 2 of 8', 'Movies to watch · 1 of 4']);
});
await ok('the title that failed is reported (not silently dropped) with a Retry; the movie without a TMDB id is not mentioned as failed', async () => { assert.equal(await status(p), '1 title couldn’t be checked. Retry'); });
await clickText(p, 'Choose my services'); await wait(400);
await clickText(p, 'Netflix', '[role=dialog] .chip'); await clickText(p, 'Stan', '[role=dialog] .chip'); await wait(300);
await clickText(p, 'Done', '[role=dialog] button'); await wait(400);
const MINE = new Set(['Netflix', 'Stan']);
await ok('after ticking Netflix + Stan the list is exactly the titles confirmed on those (or free): derived independently from the mock TMDB data', async () => {
  const wantShows = WL.filter(([id]) => onMine(AU[`tv/${id}`], MINE)).map(([, n]) => n); const wantMovies = [[201, 'Movie On Netflix'], [202, 'Movie On Binge'], [203, 'Movie On SBS']].filter(([id]) => onMine(AU[`movie/${id}`], MINE)).map(([, n]) => n);
  assert.deepEqual(await rowNames(p), [...wantShows, ...wantMovies].sort()); assert.equal(wantShows.length, 4); assert.equal(wantMovies.length, 2);
  assert.deepEqual(await headers(p), ['Shows to watch · 4 of 8', 'Movies to watch · 2 of 4']);
});
await ok('every row says WHERE it is: Netflix / Stan / Free: ABC iview / Netflix · Free: Tubi', async () => {
  const m = Object.fromEntries(await rows(p)); assert.equal(m['Netflix Show'], 'Netflix'); assert.equal(m['Stan Show'], 'Stan'); assert.equal(m['Iview Free'], 'Free: ABC iview'); assert.equal(m['Netflix And Tubi'], 'Netflix · Free: Tubi'); assert.equal(m['Movie On Netflix'], 'Netflix'); assert.equal(m['Movie On SBS'], 'Free: SBS On Demand');
  assert.ok(!('Binge Only' in m) && !('Rent Only' in m) && !('Nowhere Show' in m) && !('Always Fails' in m));
});
await ok('the toggle shows "My services (2)" and the setting is remembered', async () => { assert.match(await p.evaluate(() => document.querySelector('.sd-svcbar').innerText), /My services \(2\)/); const pr = await prefsOf(p); assert.equal(pr.watchlistOnly, true); assert.deepEqual(pr.mine.sort(), ['netflix', 'stan']); });
await p.screenshot({ path: `${OUT}/watchlist_on_phone.png` });
await clickText(p, 'Retry');
await ok('Retry asks again about the failed title only', async () => { await settled(p); await wait(500); assert.equal(count(log, 'tv/108'), 2); assert.equal(count(log, 'tv/101'), 1); assert.equal(await status(p), '1 title couldn’t be checked. Retry'); });
await toggle(p); await wait(400);
await ok('switching it off shows everything again, and the cached answers stay saved on the titles', async () => {
  assert.equal((await rows(p)).length, 12); assert.equal(await toggleOn(p), false); const st = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
  assert.deepEqual(st.shows['tmdb:101'].providers.map((x) => x.name), ['Netflix']); assert.ok(st.shows['tmdb:101'].providersSynced); assert.deepEqual(st.shows['tmdb:104'].providersFree.map((x) => x.name), ['ABC iview']);
  assert.deepEqual(st.shows['tmdb:105'].providers, []); assert.ok(st.shows['tmdb:105'].providersSynced, '"streams nowhere" is a real answer and is remembered'); assert.equal(st.shows['tmdb:108'].providersSynced, undefined, 'the failed one stays unchecked');
  const mv = st.movies.find((m) => m.tmdbId === 201); assert.deepEqual(mv.providers.map((x) => x.name), ['Netflix']); assert.ok(mv.providersSynced); assert.equal(st.movies.find((m) => !m.tmdbId).providersSynced, undefined);
});
await p.close();

// concurrency measured in its own run (the stats object lives on the page object that made the requests)
({ page: p, log, stats: globalThis.__s } = await open(stateFresh(), { mine: ['netflix', 'stan'], showsOnly: false, watchlistOnly: true }, { tab: 'Watchlist' }));
await settled(p); await wait(400);
await ok('the background checks never run more than 3 lookups at once (and do finish all 11)', async () => { assert.ok(globalThis.__s.max <= 3 && globalThis.__s.max >= 2, 'max concurrent: ' + globalThis.__s.max); assert.equal(log.length, 11); });
await p.close();

// ============================================================ D. remembered for two weeks
console.log('D. cached for two weeks');
({ page: p, log } = await open(stateCached(1), { mine: ['netflix', 'stan'], showsOnly: false, watchlistOnly: true }, { tab: 'Watchlist' }));
await settled(p); await wait(600);
await ok('answers younger than 14 days are reused: the same list appears with NO new lookups except the one that never succeeded', async () => {
  const want = WL.filter(([id]) => onMine(AU[`tv/${id}`], MINE)).length + 2; assert.equal((await rows(p)).length, want); assert.deepEqual(log, ['tv/108']);
});
await p.close();
({ page: p, log } = await open(stateCached(1), { mine: ['netflix', 'stan'], showsOnly: false, watchlistOnly: true }, { tab: 'Watchlist', now: FIXED + 14 * DAY }));
await settled(p); await wait(600);
await ok('answers 15 days old are refreshed: every title is looked up again, and the list is still right afterwards', async () => {
  assert.equal(log.filter((k) => k !== 'tv/108').length, 10, log.join(',')); assert.equal((await rows(p)).length, 6);
});
await p.close();
({ page: p, log } = await open(stateCached(13), { mine: ['netflix', 'stan'], showsOnly: false, watchlistOnly: true }, { tab: 'Watchlist' }));
await settled(p); await wait(500);
await ok('13-day-old answers are still fresh (no refresh)', async () => assert.deepEqual(log, ['tv/108'])); await p.close();
const oldFormat = stateCached(1); for (const s of Object.values(oldFormat.shows)) delete s.providersFree; for (const m of oldFormat.movies) delete m.providersFree;
({ page: p, log } = await open(oldFormat, { mine: ['netflix', 'stan'], showsOnly: false, watchlistOnly: true }, { tab: 'Watchlist' }));
await settled(p); await wait(600);
await ok('titles cached BEFORE free lists existed are re-checked once (so free services can be recognised)', async () => assert.ok(log.length >= 10, String(log.length))); await p.close();

// ============================================================ E. no TMDB key
console.log('E. no TMDB key');
const noKey = stateCached(1, ''); noKey.shows['tmdb:102'] = mkShow(102, 'Stan Show');
({ page: p, log } = await open(noKey, { mine: ['netflix', 'stan'], showsOnly: false, watchlistOnly: true }, { tab: 'Watchlist' }));
await wait(900);
await ok('without a key nothing is looked up, the cached titles still filter, and the status explains what to do', async () => {
  assert.equal(log.length, 0); assert.match(await status(p), /Add your TMDB key in Settings so availability can be checked\./); assert.ok((await rowNames(p)).includes('Netflix Show')); assert.ok(!(await rowNames(p)).includes('Stan Show'), 'unchecked titles are not shown');
});
await p.close();

// ============================================================ F. Shows tab
console.log('F. Shows tab');
({ page: p, log } = await open(LIB(), { mine: ['netflix', 'stan'], showsOnly: false, watchlistOnly: false }, { tab: 'Shows' }));
const tiles = (pg) => pg.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].map((t) => [t.querySelector('.sd-ltile-name').textContent, (t.querySelector('.sd-ltile-sub') || {}).textContent || '']));
// the Shows "Status" menu: open it, read { label: count }, close it
const menuOpen = (pg) => pg.evaluate(() => !!document.querySelector('[role=listbox][aria-label=Status]'));
const openStatus = async (pg) => { await pg.evaluate(() => document.querySelector('.sd-lbar-top .sd-chipbtn').click()); await wait(300); };
const closeStatus = async (pg) => { if (await menuOpen(pg)) { await pg.keyboard.press('Escape'); await wait(300); } };
const tabsOf = async (pg) => { await openStatus(pg); const r = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('[role=listbox][aria-label=Status] [role=option]')].map((o) => [(o.querySelector('.lab') || o.firstElementChild).textContent.trim(), +o.querySelector('.n').textContent]))); await closeStatus(pg); return r; };
const pickStatus = async (pg, label) => { await openStatus(pg); await pg.evaluate((l) => [...document.querySelectorAll('[role=listbox][aria-label=Status] [role=option]')].find((o) => (o.querySelector('.lab') || o.firstElementChild).textContent.trim() === l).click(), label); await wait(300); await closeStatus(pg); };
await ok('off by default: all 5 library shows, no lookups', async () => { assert.equal((await tiles(p)).length, 5); assert.equal(log.length, 0); assert.deepEqual(Object.keys(await tabsOf(p)).sort(), ['All', 'Dropped', 'Finished', 'Not started', 'Watching']); });
await p.evaluate(() => document.querySelector('.sd-svcbar button.sd-svctoggle').click()); await settled(p); await wait(600);
await ok('"On my services" switch in the filter bar: only the shows confirmed on Netflix/Stan (or free) remain, each tile says where', async () => {
  const t = Object.fromEntries(await tiles(p)); assert.deepEqual(Object.keys(t).sort(), ['Lib Dropped', 'Lib Netflix', 'Lib Stan Finished', 'Lib Uncached']); assert.equal(t['Lib Netflix'], 'Netflix'); assert.equal(t['Lib Stan Finished'], 'Stan'); assert.equal(t['Lib Uncached'], 'Stan'); assert.equal(t['Lib Dropped'], 'Netflix');
});
await ok('the Status menu and its counts follow the filter and still add up (All = Watching + Finished + Not started + Dropped)', async () => { const c = await tabsOf(p); assert.deepEqual(c, { All: 4, Watching: 1, Finished: 1, 'Not started': 1, Dropped: 1 }); assert.equal(c.All, c.Watching + c.Finished + c['Not started'] + c.Dropped); });
await ok('only what was needed was looked up: the stale one (20 days) and the two never-checked; the fresh ones were not', async () => assert.deepEqual([...log].sort(), ['tv/302', 'tv/303', 'tv/304']));
await p.screenshot({ path: `${OUT}/shows_on_phone.png` });
await pickStatus(p, 'Not started');
await ok('combines with Status: Not started + on my services = just the uncached-then-checked Stan show', async () => assert.deepEqual((await tiles(p)).map((x) => x[0]), ['Lib Uncached']));
await pickStatus(p, 'All');
await p.reload({ waitUntil: 'networkidle0' }); await wait(400); await tab(p, 'Shows');
await ok('the switch is remembered across a reload (and cached answers are reused: no lookups)', async () => { assert.equal(await toggleOn(p), true); assert.equal((await tiles(p)).length, 4); });
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Clear/.test(b.textContent) && b.closest('.sd-lbar')).click()); await wait(350);
await ok('"Clear" in the toolbar turns the filter off too, and everything is back', async () => { assert.equal(await toggleOn(p), false); assert.equal((await tiles(p)).length, 5); assert.equal((await prefsOf(p)).showsOnly, false); });
await p.close();
const noMatch = LIBCACHED(); for (const s of Object.values(noMatch.shows)) { s.providers = [{ name: 'Binge', logo: null }]; s.providersFree = []; s.providersSynced = ago(1); }
({ page: p, log } = await open(noMatch, { mine: ['netflix'], showsOnly: true, watchlistOnly: false }, { tab: 'Shows' }));
await ok('nothing matches: a clear message, an explanation, and a way back ("Show everything")', async () => {
  const t = await p.evaluate(() => document.body.innerText); assert.match(t, /Nothing here is on your services/); assert.match(t, /Free-to-watch services count too/); assert.equal((await tiles(p)).length, 0);
  await clickText(p, 'Show everything'); await wait(350); assert.equal((await tiles(p)).length, 5); assert.equal(await toggleOn(p), false);
});
await p.evaluate(() => document.querySelector('.sd-svcbar button.sd-svctoggle').click()); await wait(500);
await p.close();
({ page: p, log } = await open(LIBCACHED(), { mine: [], showsOnly: false, watchlistOnly: false }, { tab: 'Shows' }));
await p.evaluate(() => document.querySelector('.sd-svcbar button.sd-svctoggle').click()); await wait(500);
await ok('on the Shows tab too, switching on with no services chosen opens the picker', async () => assert.equal((await dlg(p)).title, 'My services'));
await p.close();

// ============================================================ G. show page
console.log('G. show page');
({ page: p } = await open(stateCached(1), { mine: ['netflix'], showsOnly: false, watchlistOnly: false }, { tab: 'Watchlist' }));
await clickText(p, 'Iview Free', 'button.sd-open'); await wait(800);
await ok('a free-only title no longer says "Not streaming in Australia": the streaming row says Free: ABC iview', async () => { const t = await p.evaluate(() => document.body.innerText); assert.match(t, /Free: ABC iview/); assert.doesNotMatch(t, /Not streaming in Australia/); });
await clickText(p, 'Streaming in Australia'); await wait(500);
await ok('the streaming sheet lists the free service with a FREE tag', async () => { const d = await dlg(p); assert.match(d.text, /ABC iview/); assert.match(d.text, /FREE/); assert.match(d.text, /No subscription service has it right now\./); });
await p.close();

// ============================================================ H. layout
console.log('H. layout');
({ page: p } = await open(stateCached(1), { mine: ['netflix', 'stan'], showsOnly: false, watchlistOnly: true }, { w: 320, h: 700, tab: 'Watchlist' }));
await settled(p);
await ok('320px wide: no sideways scroll with the filter on', async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false)); await p.close();
({ page: p } = await open(LIBCACHED(), { mine: ['netflix', 'stan'], showsOnly: true, watchlistOnly: false }, { w: 1280, h: 900, tab: 'Shows' }));
await settled(p); await p.screenshot({ path: `${OUT}/shows_on_desktop.png` });
await ok('desktop: the switch sits in the filter bar, no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); assert.equal(await p.evaluate(() => !!document.querySelector('.sd-svcbar .sd-svctoggle')), true); }); await p.close();
console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
