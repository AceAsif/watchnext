process.env.TZ = 'Australia/Hobart';
// The Library (Shows and Movies tabs): filters, sorts and status tabs give the order worked out
// from the seeded data; then phone layout, tiles, Tools, the Add dialog, empty states, Movies and
// desktop. (It used to compare against an old build of the app, which no longer exists.)
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

const OUT = workPath('out6');
fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const serve = (dir, port) => new Promise((res) => {
  const s = http.createServer((req, r) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  }); s.listen(port, () => res(s));
});
const NEW = 'http://localhost:4181';
const servers = [await serve(APP_DIST, 4181)];
const FIXED_ISO = '2026-10-01T22:00:00.000Z'; // Fri 2 Oct 2026, 09:00 in Hobart

// ------------------------------------------------------------------ seed
let rs = 777; const rnd = () => (rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const W = (n, base = '2026-03-01') => Object.fromEntries(Array.from({ length: n }, (_, i) => [`1x${i + 1}`, { at: `${base.slice(0, 8)}${String(1 + ((i * 3) % 27)).padStart(2, '0')}T20:00:00.000Z`, min: 40, n: 1 }]));
const NAMES = ['Suits', 'The Good Doctor', 'Emily in Paris', 'Chainsaw Man', 'Only Murders in the Building', 'Severance', 'The Bear', 'Arcane', 'Archer', 'Arrow', 'South Park', 'The Simpsons', 'Bleach', 'JoJo’s Bizarre Adventure', 'Alice in Borderland', 'American Gods', 'Agatha All Along', 'Air Gear', 'Adolescence', 'Batman: Caped Crusader', 'Phineas and Ferb', 'Re: ZERO', 'Succession', 'Fargo', 'Ted Lasso', 'Dark', 'Mindhunter', 'Ozark', 'Barry', 'Atlanta', 'Naruto', 'One Piece', 'Fairy Tail', 'Black Jack', 'Baki', 'Andor', 'The Last of Us', 'Slow Horses', 'Shōgun', 'Reacher', 'Frieren', 'Dandadan', 'Monster', 'Pluto', 'Vinland Saga', 'Hunter x Hunter', 'Mob Psycho 100', 'Cowboy Bebop', 'Steins;Gate', 'Death Note', 'Fullmetal Alchemist', 'Haikyu!!', 'Kaiji', 'Great Teacher Onizuka', 'The Boys', 'Invincible', 'House of the Dragon', 'The Expanse', 'Foundation', 'Silo', 'Fallout', 'Paradise', 'Task', 'Dope Thief', 'Mythic Quest', 'Pluribus', 'Alien: Earth', 'Wednesday', 'Squid Game', 'Bridgerton', 'Ginny & Georgia', 'Outer Banks', 'Beef', 'The Diplomat', 'Black Mirror', 'Love Death & Robots', 'Arcane League', 'Cyberpunk Edgerunners', 'Blue Eye Samurai', 'Scavengers Reign', 'Pantheon', 'Devs', 'Westworld', 'Lost', 'Heroes', 'Prison Break', 'Breaking Bad', 'Better Call Saul', 'The Wire', 'The Sopranos', 'Mad Men', 'Justified', 'Sherlock', 'Luther', 'Peaky Blinders', 'Line of Duty', 'Broadchurch', 'Happy Valley'];
const PLATS = ['netflix', 'prime', 'disney', 'max', 'stan', 'crunchyroll', undefined];
const shows = {};
NAMES.forEach((name, i) => {
  const k = i % 6; const total = k === 4 || k === 5 ? undefined : (k === 3 ? 24 : 12);
  const seen = k === 0 ? 12 : k === 1 ? 5 : k === 2 ? 0 : k === 3 ? 24 : k === 4 ? 3 : 0;
  shows[`tmdb:${1000 + i}`] = {
    name, tmdbId: 1000 + i, followed: i % 17 !== 16, watchlist: i % 17 === 16, poster: null, totalEpisodes: total, watched: W(seen),
    platform: PLATS[i % 7], rating: [0, 1, 2, 3, 4, 5, undefined][i % 7], addedAt: i % 3 === 0 ? `2026-0${1 + (i % 9)}-1${i % 9}T10:00:00.000Z` : undefined,
    lastSynced: i % 4 === 0 ? undefined : '2026-09-01T00:00:00.000Z', runtimeMin: 40, genres: ['Drama'],
  };
});
// a tracked show that the add-dialog search will return as "In library"
shows['tmdb:1004'].name = 'Bleach: Thousand-Year Blood War'; shows['tmdb:1004'].tmdbId = 1004;
const FOLLOWED = Object.values(shows).filter((s) => s.followed).length;
const movies = [];
for (let i = 0; i < 30; i++) movies.push({ name: `${['Spirited Away', 'Your Name.', 'Parasite', 'Dune: Part Two', 'Perfect Blue', 'Princess Mononoke', 'Oppenheimer', 'Akira', 'Interstellar', 'Howl’s Moving Castle'][i % 10]}${i >= 10 ? ' ' + (i / 10 + 1 | 0) : ''}`, tmdbId: i === 0 ? 5001 : 5100 + i, watchedAt: `2026-0${1 + (i % 9)}-${String(1 + (i * 2) % 27).padStart(2, '0')}T20:00:00.000Z`, runtimeMin: 100, rating: [5, 4, 4, 3, 5, 0, 2, 4, 1, 3][i % 10], poster: null, platform: i % 3 ? 'netflix' : undefined, year: '2019' });
for (let i = 0; i < 3; i++) movies.push({ name: `Planned ${i + 1}`, tmdbId: 6000 + i, status: 'planned', runtimeMin: 100 });
movies[0].name = 'Howl’s Moving Castle'; movies[0].tmdbId = 5001;
const MAIN = { shows, movies, settings: { tmdbKey: 'TESTKEY' } };
const EMPTY = { shows: {}, movies: [], settings: { tmdbKey: 'TESTKEY' } };
const NOKEY = { shows, movies, settings: { tmdbKey: '' } };
const WATCHED_MOVIES = movies.filter((m) => !m.status).length;
console.log(`seeded ${Object.keys(shows).length} shows (${FOLLOWED} followed), ${WATCHED_MOVIES} watched movies`);

// ------------------------------------------------------------------ TMDB mock
let net = [];
const json = (r, body, status = 200, delay = 60) => setTimeout(() => r.respond({ status, contentType: 'application/json', body: JSON.stringify(body) }), delay);
const tvRes = (id, name, year, over = 'A show.') => ({ id, name, first_air_date: `${year}-04-01`, poster_path: null, overview: over });
const mvRes = (id, title, year, over = 'A movie.') => ({ id, title, release_date: `${year}-04-01`, poster_path: null, overview: over });
function tmdb(r) {
  const u = new URL(r.url()); const p = u.pathname.replace('/3', ''); const q = (u.searchParams.get('query') || '').toLowerCase();
  let m;
  if (p === '/search/tv') {
    net.push({ kind: 'search', q });
    if (q === 'error500') return json(r, { status_message: 'Invalid API key' }, 500);
    if (q === 'ab') return json(r, { results: [tvRes(70001, 'AB Stale Result', 2001)] }, 200, 700);   // slow, stale
    if (q.startsWith('bleach')) return json(r, { results: [tvRes(1004, 'Bleach: Thousand-Year Blood War', 2022, 'The Soul Reapers face a new war.'), tvRes(90001, 'Bleach', 2004, 'A teenager inherits the powers of a Soul Reaper.'), tvRes(90002, 'Bleach: Burn the Witch', 2020, 'A short spin-off.')] });
    if (q === 'zzzz') return json(r, { results: [] });
    return json(r, { results: [tvRes(80000 + q.length, `Result for ${q}`, 2010), tvRes(80100 + q.length, `Another ${q}`, 2012)] });
  }
  if (p === '/search/movie') {
    net.push({ kind: 'search-movie', q });
    if (q.startsWith('howl')) return json(r, { results: [mvRes(5001, 'Howl’s Moving Castle', 2004, 'A young hatter is cursed.'), mvRes(9001, 'Howl', 2015, 'A late-night train.'), mvRes(9002, 'The Howling', 1981, 'A TV reporter retreats.')] });
    if (q.startsWith('planned')) return json(r, { results: [mvRes(6000, 'Planned 1', 2020)] });
    return json(r, { results: [mvRes(9100 + q.length, `Film ${q}`, 2011)] });
  }
  if ((m = p.match(/^\/tv\/(\d+)$/))) { net.push({ kind: 'tv', id: +m[1] }); const id = +m[1]; const nm = id === 90001 ? 'Bleach' : id === 90002 ? 'Bleach: Burn the Witch' : `Show ${id}`; return json(r, { id, name: nm, poster_path: null, number_of_episodes: 24, status: 'Ended', genres: [{ name: 'Drama' }], seasons: [{ season_number: 1, episode_count: 24 }], episode_run_time: [40] }, 200, 80); }
  if ((m = p.match(/^\/movie\/(\d+)$/))) { const id = +m[1]; return json(r, { id, title: id === 5001 ? 'Howl’s Moving Castle' : id === 9001 ? 'Howl' : id === 9002 ? 'The Howling' : `Film ${id}`, poster_path: null, release_date: '2015-04-01', runtime: 99, overview: 'Overview.', genres: [] }, 200, 60); }
  if ((m = p.match(/^\/tv\/(\d+)\/watch\/providers$/))) { net.push({ kind: 'providers', id: +m[1] }); return json(r, { results: { AU: { flatrate: +m[1] % 2 === 0 ? [{ provider_name: 'Netflix', logo_path: null }] : [], link: 'https://example.com' } } }, 200, 120); }
  return json(r, { results: [], episodes: [] });
}

const browser = await launchBrowser(puppeteer);
const problems = [];
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
async function open(base, { w = 390, h = 844, state = MAIN, tab = 'Shows' } = {}) {
  const page = await browser.newPage();
  await page.emulateTimezone('Australia/Hobart');
  await page.setViewport({ width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1 });
  page.on('pageerror', (e) => problems.push(`[${base.slice(-4)}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|status of 500/.test(m.text())) problems.push(`[${base.slice(-4)}] console.error: ${m.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:418')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('api.themoviedb.org')) return tmdb(r);
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__seeded', '1'); }
    const RD = Date; const start = RD.now(); const b = RD.parse(fixed);
    class FD extends RD { constructor(...a) { if (a.length === 0) super(b + (RD.now() - start)); else super(...a); } static now() { return b + (RD.now() - start); } }
    window.Date = FD;
  }, state, FIXED_ISO);
  await page.goto(base + '/', { waitUntil: 'networkidle0' });
  await wait(400);
  await page.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((b) => b.textContent.includes(t)).click(), tab);
  await wait(500);
  return page;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const shot = async (p, name, full = false) => { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log('  shot', name); };
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const box = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const clickText = (p, sel, label, { exact = false } = {}) => p.evaluate((s, l, ex) => { const el = [...document.querySelectorAll(s)].find((e) => { const t = e.textContent.trim(); return ex ? t === l : t.startsWith(l) || t.includes(l); }); if (!el) throw new Error(`no ${s} with text "${l}"`); el.click(); }, sel, label, exact);
const setNative = (p, sel, v) => p.evaluate((s, val) => { const el = document.querySelector(s); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);
let checks = 0; const ok = (name, fn) => { fn(); checks++; console.log('  PASS', name); };
const newNames = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-ltile-name')].map((e) => e.textContent));
// Status is a button (the first toolbar button) that opens a sheet (phone) or a list (desktop) of options with counts.
const STATUS_OPTS = '.sd-sheet .sd-sheetopt, .sd-sheet .sd-sheetrow, .sd-popopt';
const statusCounts = async (p) => { await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[0].click()); await wait(300); const c = await p.evaluate((sel) => Object.fromEntries([...document.querySelectorAll(sel)].map((x) => { const t = x.textContent.trim(); return [t.replace(/\d+$/, ''), Number((t.match(/(\d+)$/) || [0, 0])[1])]; })), STATUS_OPTS); await p.keyboard.press('Escape'); await wait(250); return c; };
const pickStatus = async (p, label) => { await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[0].click()); await wait(300); await clickText(p, STATUS_OPTS, label); await wait(200); if (await p.evaluate(() => !!document.querySelector('.sd-sheet'))) { await clickText(p, '.sd-sheet button', 'Done'); await wait(250); } };

// ============================================================ 1. ORDER: filters and sorts give the expected titles
const DRV = {
  names: newNames,
  // Desktop toolbar, in order: Status · Platform · Sort · On my services. A button shows the
  // current choice ("Watching", "Netflix"), so they are found by position.
  async chip(p, name) { const i = { Status: 0, Platform: 1, Sort: 2 }[name]; await p.evaluate((x) => document.querySelectorAll('.sd-lbar .sd-chipbtn, .sd-chipbtn')[x].click(), i); await wait(200); },
  async status(p, s) { if (await p.evaluate(() => !!document.querySelector('.sd-lstatus [role=tab]'))) { await clickText(p, '.sd-lstatus [role=tab]', s); } else { await DRV.chip(p, 'Status'); await clickText(p, '.sd-popopt', s); } await wait(150); },
  async platform(p, label) { await DRV.chip(p, 'Platform'); await clickText(p, '.sd-popopt', label); await wait(150); },
  async sort(p, label) { await DRV.chip(p, 'Sort'); await clickText(p, '.sd-popopt', label); await wait(150); },
  async dir(p) { await p.evaluate(() => document.querySelector('button[aria-label$="tap to reverse"]').click()); await wait(150); },
  async query(p, q) { await setNative(p, '.sd-lfilter input', q); await wait(150); },
};
console.log('1. SHOWS ORDER (desktop) — worked out from the seeded data');
const lib = Object.values(shows).filter((s) => s.followed);
const az = (list) => list.map((s) => s.name).sort((a, b) => a.localeCompare(b));
const PLAT_LABEL = { netflix: 'Netflix', stan: 'Stan', disney: 'Disney+', max: 'Max' };
const CASES = [
  { name: 'default: A–Z', want: az(lib) },
  { name: 'A–Z reversed (Z→A)', dir: true, want: az(lib).reverse() },
  { name: 'platform Netflix', platform: 'Netflix', want: az(lib.filter((s) => s.platform === 'netflix')) },
  { name: 'platform Stan', platform: 'Stan', want: az(lib.filter((s) => s.platform === 'stan')) },
  { name: 'name "a"', query: 'a', want: az(lib.filter((s) => /a/i.test(s.name))) },
  { name: 'name "the" + platform Disney+', query: 'the', platform: 'Disney+', want: az(lib.filter((s) => /the/i.test(s.name) && s.platform === 'disney')) },
  { name: 'name matching nothing', query: 'zzzz', want: [] },
];
for (const c of CASES) {
  const n = await open(NEW, { w: 1280, h: 800 });
  if (c.platform) await DRV.platform(n, c.platform);
  if (c.query != null) await DRV.query(n, c.query);
  if (c.dir) await DRV.dir(n);
  const b = await DRV.names(n);
  ok(`${c.name}: ${b.length} shows in the expected order`, () => assert.deepEqual(b, c.want));
  await n.close();
}
{
  const n = await open(NEW, { w: 1280, h: 800 });
  await DRV.sort(n, 'Rating');
  const b = await DRV.names(n);
  const rating = (name) => Number(lib.find((s) => s.name === name).rating) || 0;
  ok('sort Rating: every show, highest rated first', () => { assert.equal(b.length, lib.length); assert.ok(b.every((x, i) => i === 0 || rating(b[i - 1]) >= rating(x)), b.map((x) => rating(x)).join(',')); });
  await DRV.dir(n);
  const r = await DRV.names(n);
  ok('Rating reversed: lowest first', () => assert.ok(r.every((x, i) => i === 0 || rating(r[i - 1]) <= rating(x))));
  await n.close();
}
// the status counts on the tabs equal what each tab actually shows
{
  const n = await open(NEW, { w: 1280, h: 800 });
  // Desktop: Status is a dropdown; each option shows its count.
  await DRV.chip(n, 'Status');
  const tabs = await n.evaluate(() => [...document.querySelectorAll('.sd-popopt')].map((t) => [t.textContent.trim().replace(/\d+$/, ''), Number(t.textContent.trim().match(/(\d+)$/)[1])]));
  await n.keyboard.press('Escape'); await wait(200);
  ok('Status offers All, Watching, Finished and Not started', () => assert.deepEqual(tabs.map((t) => t[0]).filter((x) => ['All', 'Watching', 'Finished', 'Not started'].includes(x)), ['All', 'Watching', 'Finished', 'Not started']));
  for (const [label, count] of tabs) { await DRV.status(n, label); const got = (await newNames(n)).length; ok(`status "${label}" says ${count} and shows ${got}`, () => assert.equal(got, count)); }
  ok(`All = ${FOLLOWED} followed shows (unfollowed and watchlist-only are not in the library)`, () => assert.equal(tabs.find((t) => t[0] === 'All')[1], FOLLOWED));
  ok('Not started = followed shows with nothing watched', () => assert.equal(tabs.find((t) => /Not started/.test(t[0]))[1], lib.filter((s) => !Object.keys(s.watched).length).length));
  await n.close();
}

console.log('1b. MOVIES ORDER');
const watchedMovies = movies.filter((m) => !m.status);
const MCASES = [
  { n: 'sort A–Z (one tile per film: two different films can share a name)', sort: 'A–Z', want: [...new Map(watchedMovies.map((m) => [m.tmdbId, m.name])).values()].sort((a, b) => a.localeCompare(b)) },
  { n: 'filter "castle"', sort: 'A–Z', query: 'castle', want: watchedMovies.filter((m) => /castle/i.test(m.name)).map((m) => m.name).sort((a, b) => a.localeCompare(b)) },
  { n: 'filter "zzz" finds nothing', query: 'qqq', want: [] },
];
for (const c of MCASES) {
  const n = await open(NEW, { w: 1280, h: 800, tab: 'Movies' });
  if (c.sort) { await clickText(n, '[role=radio]', c.sort, { exact: true }); await wait(150); }
  if (c.query) { await setNative(n, '.sd-lfilter input', c.query); await wait(150); }
  const b = await newNames(n);
  ok(`movies ${c.n}: ${b.length} in the expected order`, () => assert.deepEqual(b, c.want));
  await n.close();
}

// ============================================================ 2. SHOWS on a phone
console.log('2. SHOWS — phone (390px)');
let p = await open(NEW);
const inputs = await p.evaluate(() => [...document.querySelectorAll('input')].filter((i) => i.offsetParent !== null).map((i) => [i.type, i.placeholder]));
ok('THE FIX: the page has exactly ONE text box and it is the filter (no second search box)', () => { assert.equal(inputs.length, 1); assert.match(inputs[0][1], /^Filter \d+ shows$/); });
let t = await text(p);
ok('no "Search TMDB…" box and no "personal tracker" tagline any more', () => { assert.doesNotMatch(t, /Search TMDB for a show to add/i); assert.doesNotMatch(t, /personal tracker/i); });
ok(`title shows the library count (${FOLLOWED}) and the header has an amber "Add" and a "Tools" button`, async () => {});
const head = await p.evaluate(() => ({ count: document.querySelector('.sd-libhead h1 .n').textContent, add: !!document.querySelector('.sd-addbtn'), tools: !!document.querySelector('.sd-toolsbtn') }));
assert.deepEqual(head, { count: String(FOLLOWED), add: true, tools: true }); checks++; console.log('  PASS title count, Add and Tools present');
const ibSize = await p.evaluate(() => { const b = document.querySelector('.masthead-search').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; });
ok('header search button is a 44x44 touch target', () => assert.deepEqual(ibSize, [44, 44]));
const rows = await p.evaluate(() => { const c = document.querySelectorAll('.sd-chipbtn'); const top = (e) => Math.round(e.getBoundingClientRect().top); return { filter: top(document.querySelector('.sd-lfilter')), status: top(c[0]), platform: top(c[1]), sort: top(c[2]), firstTile: top(document.querySelector('.sd-ltile')) }; });
ok(`phone: Filter + Status on the first row, Platform + Sort on the next, posters start at y=${rows.firstTile}`, () => { assert.equal(rows.filter, rows.status); assert.equal(rows.platform, rows.sort); assert.ok(rows.platform > rows.filter); assert.ok(rows.firstTile < 400, String(rows.firstTile)); });
const chipNames = await p.evaluate(() => [...document.querySelectorAll('.sd-chipbtn')].map((c) => c.textContent.trim()));
ok('toolbar buttons: Status, Platform, Sort, On my services', () => { assert.equal(chipNames[0], 'Status'); assert.equal(chipNames[1], 'Platform'); assert.match(chipNames[2], /^Sort/); assert.match(chipNames[3], /On my services/); });
const flat = await p.evaluate(() => { const i = document.querySelector('.sd-lfilter input'); const c = getComputedStyle(i); return [c.borderTopWidth, c.paddingLeft, c.backgroundColor]; });
ok('the filter field is ONE box: its inner <input> has no border, no padding and no background of its own (no double border)', () => assert.deepEqual(flat, ['0px', '0px', 'rgba(0, 0, 0, 0)']));
let nn;
const cols = await p.evaluate(() => new Set([...document.querySelectorAll('.sd-ltile')].map((e) => Math.round(e.getBoundingClientRect().left))).size);
ok('poster grid is 3 columns', () => assert.equal(cols, 3));
assert.ok(await noOverflow(p)); checks++; console.log('  PASS no horizontal overflow');
await shot(p, '01_shows_phone');

// status: a bottom sheet of options with counts
await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[0].click()); await wait(300);
const stOpts = await p.evaluate(() => [...document.querySelectorAll('.sd-sheet .sd-sheetopt, .sd-sheet .sd-sheetrow')].map((o) => o.textContent.trim()));
ok('Status opens a sheet: All, Watching, Finished, Not started (with counts)', () => { assert.deepEqual(stOpts.map((x) => x.replace(/\d+$/, '')), ['All', 'Watching', 'Finished', 'Not started']); assert.equal(Number(stOpts[0].match(/\d+$/)[0]), FOLLOWED); });
await clickText(p, '.sd-sheet .sd-sheetopt, .sd-sheet .sd-sheetrow', 'Watching'); await wait(200);
if (await p.evaluate(() => !!document.querySelector('.sd-sheet'))) { await clickText(p, '.sd-sheet button', 'Done'); await wait(250); }
nn = await newNames(p);
const stChip = await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[0].textContent.replace(/\s+/g, ' ').trim());
const nWatching = Number(stOpts[1].match(/\d+$/)[0]);
ok(`choosing Watching shows ${nWatching} shows and the button says "Watching ${nWatching}"`, () => { assert.equal(nn.length, nWatching); assert.equal(stChip, `Watching ${nWatching}`); });
await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[0].click()); await wait(300);
await clickText(p, '.sd-sheet .sd-sheetopt, .sd-sheet .sd-sheetrow', 'All'); await wait(200);
if (await p.evaluate(() => !!document.querySelector('.sd-sheet'))) { await clickText(p, '.sd-sheet button', 'Done'); await wait(250); }

// typing in the filter
await p.click('.sd-lfilter input'); await p.keyboard.type('the', { delay: 10 }); await wait(250);
nn = await newNames(p);
ok(`typing "the" narrows the grid live (${nn.length} shows, all contain "the")`, () => { assert.ok(nn.length > 0 && nn.length < FOLLOWED); assert.ok(nn.every((x) => /the/i.test(x))); });
t = await text(p);
ok('phone shows the "N of M shows · Clear" line while filtering', () => assert.match(t, new RegExp(`${nn.length} of ${FOLLOWED} shows`, 'i')));
await p.click('.sd-lfilter-x'); await wait(200);
nn = await newNames(p); assert.equal(nn.length, FOLLOWED); checks++; console.log('  PASS × restores all shows');
assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.sd-lcount')).display), 'none'); checks++; console.log('  PASS count line hidden when not filtering (phone)');

// platform sheet
await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[1].focus()); await p.keyboard.press('Enter'); await wait(300);
const sheet = await p.evaluate(() => ({ dialog: document.querySelector('.sd-sheet').getAttribute('role'), title: document.querySelector('.sd-sheet').getAttribute('aria-label'), expanded: document.querySelectorAll('.sd-chipbtn')[1].getAttribute('aria-expanded'), opts: [...document.querySelectorAll('.sd-sheetopt')].map((o) => [o.querySelector('.ell').textContent, Number(o.querySelector('.n').textContent)]), bottom: Math.round(document.querySelector('.sd-sheet').getBoundingClientRect().bottom), vh: innerHeight }));
ok('phone Platform picker is a bottom sheet (dialog, touches the bottom edge, chip aria-expanded)', () => { assert.equal(sheet.dialog, 'dialog'); assert.equal(sheet.title, 'Platform'); assert.equal(sheet.expanded, 'true'); assert.ok(Math.abs(sheet.bottom - sheet.vh) <= 2); });
ok('"Any platform" first with the library total; platform counts are per-platform and sum to the total (every show here has one or none)', () => { assert.equal(sheet.opts[0][0], 'Any platform'); assert.equal(sheet.opts[0][1], FOLLOWED); const sum = sheet.opts.slice(1).reduce((s, o) => s + o[1], 0); assert.ok(sum <= FOLLOWED && sum > 0); });
await shot(p, '02_platform_sheet', false);
await clickText(p, '.sd-sheetopt', 'Netflix'); await wait(250);
const afterPick = await p.evaluate(() => ({ chip: document.querySelectorAll('.sd-chipbtn')[1].textContent, active: document.querySelectorAll('.sd-chipbtn')[1].classList.contains('active'), sheetStillOpen: !!document.querySelector('.sd-sheet') }));
ok('choosing Netflix applies it, turns the chip amber with its name, and the sheet stays open until Done (as designed)', () => assert.deepEqual(afterPick, { chip: 'Netflix', active: true, sheetStillOpen: true }));
await clickText(p, '.sd-sheet button', 'Done'); await wait(250);
const backFocus = await p.evaluate(() => document.activeElement.className);
ok('closing a toggled sheet (Platform) returns focus to its chip — keyboard users are not dropped at the top of the page', () => assert.match(backFocus, /sd-chipbtn/));
nn = await newNames(p); const nflx = Object.values(shows).filter((s) => s.followed && s.platform === 'netflix').length;
ok(`only the ${nflx} Netflix shows remain`, () => assert.equal(nn.length, nflx));
t = await text(p); ok('"N of M shows · Clear" reflects the platform filter', () => assert.match(t, new RegExp(`${nflx} of ${FOLLOWED} shows`, 'i')));
await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[0].click()); await wait(300);
const tabCounts = await p.evaluate(() => [...document.querySelectorAll('.sd-sheet .sd-sheetopt, .sd-sheet .sd-sheetrow')].map((x) => Number(x.textContent.trim().match(/(\d+)$/)[1])));
await p.keyboard.press('Escape'); await wait(250);
ok('Status counts now describe Netflix shows only and still add up (All = Watching + Finished + Not started)', () => { assert.equal(tabCounts[0], nflx); assert.equal(tabCounts[1] + tabCounts[2] + tabCounts[3], tabCounts[0]); });
await clickText(p, '.sd-lclear.phone', 'Clear'); await wait(250);
nn = await newNames(p); ok('Clear resets every filter', () => assert.equal(nn.length, FOLLOWED));

// sort sheet + direction
await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[2].click()); await wait(300);
const sortOpts = await p.evaluate(() => [...document.querySelectorAll('.sd-sheetrow')].map((x) => x.textContent));
ok('Sort sheet lists the five real sort orders', () => assert.deepEqual(sortOpts, ['Title', 'Recently watched', 'Recently added', 'Progress', 'Rating']));
await clickText(p, '.sd-sheetrow', 'Rating'); await wait(200); await clickText(p, '.sd-sheet button', 'Done'); await wait(250);
const byRating = await newNames(p); const topRated = Object.values(shows).filter((s) => s.followed).sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name))[0].name;
ok(`sorting by Rating puts "${topRated}" first`, () => assert.equal(byRating[0], topRated));
await p.evaluate(() => document.querySelector('button[aria-label$="tap to reverse"]').click()); await wait(200);
const reversed = await newNames(p);
ok('the arrow button reverses the order exactly', () => assert.deepEqual(reversed, byRating.slice().reverse()));
const chipTxt = await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[2].textContent);
ok('Sort chip reads "Sort Rating"', () => assert.match(chipTxt, /Sort\s*Rating/));
await p.close();

// ============================================================ 3. tiles
console.log('3. SHOW TILES');
p = await open(NEW);
const tile = await p.evaluate(() => {
  const by = (nm) => [...document.querySelectorAll('.sd-ltile')].find((t) => t.querySelector('.sd-ltile-name').textContent === nm);
  const read = (t) => t && ({ aria: t.getAttribute('aria-label'), meta: t.querySelector('.meta').textContent, rate: (t.querySelector('.rate') || {}).textContent || null, prog: t.querySelector('.sd-ltile-prog i') ? t.querySelector('.sd-ltile-prog i').style.width : null, done: !!t.querySelector('.sd-ltile-done') });
  return { finished: read(by('Suits')), watching: read(by('The Good Doctor')), notstarted: read(by('Emily in Paris')) };
});
ok('FINISHED show: teal tick, no progress bar, "12 / 12 eps"', () => { assert.equal(tile.finished.done, true); assert.equal(tile.finished.prog, null); assert.equal(tile.finished.meta, '12 / 12 eps'); assert.match(tile.finished.aria, /Suits, 12 of 12 episodes/); });
ok('WATCHING show: amber progress bar at 42% (5/12), no tick', () => { assert.equal(tile.watching.done, false); assert.equal(tile.watching.prog, '42%'); assert.equal(tile.watching.meta, '5 / 12 eps'); });
ok('NOT STARTED show: no bar, no tick', () => { assert.equal(tile.notstarted.prog, null); assert.equal(tile.notstarted.done, false); assert.equal(tile.notstarted.meta, '0 / 12 eps'); });
const ratingShown = await p.evaluate(() => [...document.querySelectorAll('.sd-ltile .rate')].every((e) => /^[1-5]$/.test(e.textContent)));
ok('ratings render as a star plus a 1–5 number', () => assert.ok(ratingShown));
const ph = await p.evaluate(() => { const a = document.querySelector('.sd-ltile-art'); return { bg: getComputedStyle(a).backgroundImage.includes('linear-gradient'), initial: a.querySelector('.sd-ltile-initial').textContent }; });
ok('a show without a poster gets a gradient tile with its initial', () => assert.ok(ph.bg && /^[A-Z0-9]$/.test(ph.initial)));
await clickText(p, '.sd-ltile', 'Suits'); await wait(600);
assert.match(await p.evaluate(() => document.querySelector('.sd-page h1') ? document.querySelector('.sd-page h1').textContent : ''), /Suits/); checks++; console.log('  PASS tile opens Suits');
await p.close();

// ============================================================ 4. TOOLS
console.log('4. TOOLS menu and progress');
p = await open(NEW);
const unsynced = Object.values(shows).filter((s) => s.followed && !s.lastSynced).length;
const needPlat = Object.values(shows).filter((s) => s.followed && s.tmdbId && !s.platform).length;
await p.click('.sd-toolsbtn'); await wait(300);
const menu = await p.evaluate(() => ({ title: document.querySelector('.sd-sheet').getAttribute('aria-label'), items: [...document.querySelectorAll('.sd-toolitem')].map((i) => [i.querySelector('.t').textContent, i.querySelector('.d').textContent, i.disabled]) }));
ok(`Tools sheet: first item says "Sync ${unsynced} new with TMDB" (the real behaviour when some shows were never synced)`, () => { assert.equal(menu.title, 'Library tools'); assert.equal(menu.items[0][0], `Sync ${unsynced} new with TMDB`); });
ok(`Detect platforms offers to fill ${needPlat} shows and says it never overrides your picks`, () => { assert.equal(menu.items[1][0], 'Detect platforms'); assert.match(menu.items[1][1], new RegExp(`${needPlat} show`)); assert.match(menu.items[1][1], /Never overrides your picks/); });
await shot(p, '03_tools_sheet', false);
net = [];
await clickText(p, '.sd-toolitem', 'Detect platforms'); await wait(450);
const mid = await p.evaluate(() => ({ card: document.querySelector('.sd-lprog') ? document.querySelector('.sd-lprog').textContent : null, running: document.querySelector('.sd-toolsbtn').classList.contains('running'), role: document.querySelector('.sd-lprog') && document.querySelector('.sd-lprog').getAttribute('role') }));
ok('while detecting: a progress card "Detecting n/total · PLATFORMS" is shown (role=status) and the Tools button turns teal', () => { assert.match(mid.card, new RegExp(`Detecting \\d+/${needPlat}`)); assert.match(mid.card, /PLATFORMS/); assert.equal(mid.role, 'status'); assert.equal(mid.running, true); });
await shot(p, '04_tool_running', false);
await p.click('.sd-toolsbtn'); await wait(300);
const dis = await p.evaluate(() => [...document.querySelectorAll('.sd-toolitem')].map((i) => i.disabled));
ok('while one tool runs BOTH menu items are disabled (no double runs)', () => assert.deepEqual(dis, [true, true]));
await p.keyboard.press('Escape'); await wait(200);
await p.waitForFunction(() => !document.querySelector('.sd-lprog'), { timeout: 20000 });
const st = await stored(p);
const filled = Object.values(st.shows).filter((s) => s.followed && s.tmdbId && s.platform && !shows[`tmdb:${s.tmdbId}`].platform).length;
ok(`finished: card gone, ${net.filter((x) => x.kind === 'providers').length} provider lookups, ${filled} platforms filled in`, () => { assert.equal(net.filter((x) => x.kind === 'providers').length, needPlat); assert.ok(filled > 0); });
ok('Detect NEVER overrides a platform you already chose', () => { for (const [id, s] of Object.entries(shows)) if (s.followed && s.platform) assert.equal(st.shows[id].platform, s.platform, id); });
await p.click('.sd-toolsbtn'); await wait(300);
const after = await p.evaluate(() => [...document.querySelectorAll('.sd-toolitem')].map((i) => [i.querySelector('.t').textContent, i.disabled]));
ok('after it finishes the menu is usable again', () => assert.equal(after[0][1], false));
await p.keyboard.press('Escape'); await p.close();

// ============================================================ 5. ADD DIALOG
console.log('5. ADD DIALOG (Shows)');
p = await open(NEW);
net = [];
await p.click('.sd-addbtn'); await wait(500);
const dlg = await p.evaluate(() => ({ role: document.querySelector('.sd-sheet').getAttribute('role'), label: document.querySelector('.sd-sheet').getAttribute('aria-label'), focus: document.activeElement.getAttribute('aria-label'), top: Math.round(document.querySelector('.sd-sheet').getBoundingClientRect().top), vh: innerHeight }));
ok('dialog opens (role=dialog "Add a show"), the search box is FOCUSED, and it is a tall sheet', () => { assert.equal(dlg.role, 'dialog'); assert.equal(dlg.label, 'Add a show'); assert.equal(dlg.focus, 'Search TMDB for a show'); assert.ok(dlg.top <= 60, 'top ' + dlg.top); });
await p.keyboard.type('Bleach', { delay: 25 }); await wait(900);
const searches = net.filter((x) => x.kind === 'search');
ok(`typing "Bleach" quickly makes exactly ONE search request (debounced), not one per keystroke (${searches.length})`, () => { assert.equal(searches.length, 1); assert.equal(searches[0].q, 'bleach'); });
let res = await p.evaluate(() => ({ status: document.querySelector('.sd-addstatus').textContent, rows: [...document.querySelectorAll('.sd-res')].map((r) => ({ title: r.querySelector('.sd-res-title').textContent, badge: (r.querySelector('.sd-badge') || {}).textContent || null, btns: [...r.querySelectorAll('.sd-rbtn')].map((b) => b.textContent.trim()) })) }));
ok('"3 results from TMDB"', () => assert.equal(res.status, '3 results from TMDB'));
ok('a show already in your library: "In library" badge and ONLY an "Open" button', () => { assert.equal(res.rows[0].badge, 'In library'); assert.deepEqual(res.rows[0].btns, ['Open']); });
ok('a new show: "Add" and "Add to watchlist" (no "Open", so you never add something by accident)', () => { assert.equal(res.rows[1].badge, null); assert.deepEqual(res.rows[1].btns, ['Add', 'Add to watchlist']); });
const flat2 = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.sd-addfield input')); return [c.borderTopWidth, c.paddingLeft, c.backgroundColor]; });
ok('same for the Add dialog search box (single box, no double border)', () => assert.deepEqual(flat2, ['0px', '0px', 'rgba(0, 0, 0, 0)']));
await shot(p, '05_add_dialog_phone', false);
await p.evaluate(() => [...document.querySelectorAll('.sd-res')][1].querySelector('.sd-rbtn.primary').click()); await wait(700);
let st2 = await stored(p);
ok('"Add" follows the show (tmdb:90001) and adds nothing else', () => { assert.equal(st2.shows['tmdb:90001'].followed, true); assert.equal(st2.shows['tmdb:90001'].name, 'Bleach'); });
res = await p.evaluate(() => ({ notice: document.querySelector('.sd-addstatus').textContent, row: (() => { const r = [...document.querySelectorAll('.sd-res')][1]; return { badge: (r.querySelector('.sd-badge') || {}).textContent || null, btns: [...r.querySelectorAll('.sd-rbtn')].map((b) => b.textContent.trim()) }; })(), open: !!document.querySelector('.sd-sheet') }));
ok('the dialog STAYS open, confirms "Added “Bleach” to your library", and that row flips to "In library" + "Open"', () => { assert.match(res.notice, /Added “Bleach” to your library/); assert.equal(res.row.badge, 'In library'); assert.deepEqual(res.row.btns, ['Open']); assert.equal(res.open, true); });
await p.evaluate(() => [...document.querySelectorAll('.sd-res')][2].querySelectorAll('.sd-rbtn')[1].click()); await wait(700);
st2 = await stored(p);
ok('"Add to watchlist" flags it as watchlist-only (not followed)', () => { assert.equal(st2.shows['tmdb:90002'].watchlist, true); assert.equal(st2.shows['tmdb:90002'].followed, false); });
res = await p.evaluate(() => { const r = [...document.querySelectorAll('.sd-res')][2]; return { badge: r.querySelector('.sd-badge').textContent, btns: [...r.querySelectorAll('.sd-rbtn')].map((b) => b.textContent.trim()) }; });
ok('that row now reads "On watchlist" with "Add" + "Open"', () => { assert.equal(res.badge, 'On watchlist'); assert.deepEqual(res.btns, ['Add', 'Open']); });
await clickText(p, '.sd-res:first-child .sd-rbtn', 'Open'); await wait(600);
const opened = await p.evaluate(() => ({ dialog: !!document.querySelector('.sd-sheet'), h1: document.querySelector('.sd-page h1') ? document.querySelector('.sd-page h1').textContent : '' }));
ok('"Open" closes the dialog and opens that show', () => { assert.equal(opened.dialog, false); assert.match(opened.h1, /Bleach/); });
await p.close();

// stale-response guard, errors, no key, Escape/focus
p = await open(NEW);
await p.click('.sd-addbtn'); await wait(300);
net = [];
await p.keyboard.type('ab', { delay: 20 }); await wait(420);                 // 'ab' fires after the debounce, answers in 700ms
await p.keyboard.type('c', { delay: 20 }); await wait(1300);                 // 'abc' fires and answers fast; stale 'ab' arrives later
const stale = await p.evaluate(() => [...document.querySelectorAll('.sd-res-title')].map((e) => e.textContent));
ok('STALE RESPONSE IGNORED: slow results for "ab" never overwrite the newer results for "abc"', () => { assert.ok(stale.length > 0); assert.ok(stale.every((x) => /abc/.test(x)), JSON.stringify(stale)); });
await p.evaluate(() => document.querySelector('.sd-addfield input').select()); await p.keyboard.type('x', { delay: 10 }); await wait(500);
ok('a single character shows "Keep typing…" and sends NO request', () => { assert.equal(net.filter((x) => x.q === 'x').length, 0); });
assert.match(await p.evaluate(() => document.querySelector('.sd-addstatus').textContent), /Keep typing/); checks++;
await p.evaluate(() => document.querySelector('.sd-addfield input').select()); await p.keyboard.type('error500', { delay: 5 }); await p.keyboard.press('Enter'); await wait(500);
const err = await p.evaluate(() => ({ msg: document.querySelector('.sd-addstatus .err') ? document.querySelector('.sd-addstatus .err').textContent : null, rows: document.querySelectorAll('.sd-res').length }));
ok('a TMDB error is shown inline in red (no alert popup), with no stale results', () => { assert.ok(err.msg && err.msg.length > 3); assert.equal(err.rows, 0); });
await p.click('.sd-addfield .sd-lfilter-x'); await wait(200);
assert.equal(await p.evaluate(() => document.querySelector('.sd-addfield input').value), ''); checks++; console.log('  PASS × clears the search');
await p.keyboard.press('Escape'); await wait(300);
const esc = await p.evaluate(() => ({ closed: !document.querySelector('.sd-sheet'), focus: document.activeElement.className }));
ok('Escape closes the dialog and focus returns to the Add button', () => { assert.equal(esc.closed, true); assert.match(esc.focus, /sd-addbtn/); });
await p.close();
p = await open(NEW, { state: NOKEY }); await p.click('.sd-addbtn'); await wait(400);
const nk = await p.evaluate(() => ({ msg: document.querySelector('.sd-addstatus').textContent, disabled: document.querySelector('.sd-addfield input').disabled }));
ok('without a TMDB key the dialog explains it and disables the box (no failing searches)', () => { assert.match(nk.msg, /TMDB API key/); assert.equal(nk.disabled, true); });
await p.close();

// ============================================================ 6. EMPTY STATES
console.log('6. EMPTY STATES');
p = await open(NEW);
await p.click('.sd-lfilter input'); await p.keyboard.type('zzzz', { delay: 10 }); await wait(300);
let e = await p.evaluate(() => ({ h2: document.querySelector('.sd-lempty h2').textContent, p: document.querySelector('.sd-lempty p').textContent, btns: [...document.querySelectorAll('.sd-lempty button')].map((b) => b.textContent.trim()), tabs: [...document.querySelectorAll('[role=tab] .n')].map((n) => n.textContent) }));
ok('name not found: "Nothing called “zzzz” in your library", spelling hint, and a "Search TMDB for “zzzz”" shortcut', () => { assert.equal(e.h2, 'Nothing called “zzzz” in your library'); assert.match(e.p, /Check the spelling/); assert.deepEqual(e.btns, ['Search TMDB for “zzzz”', 'Clear filter']); });
const zc = await statusCounts(p);
ok('status counts all drop to 0', () => assert.deepEqual(Object.values(zc), [0, 0, 0, 0]));
await shot(p, '06_name_not_found', false);
net = [];
await clickText(p, '.sd-lempty button', 'Search TMDB'); await wait(900);
const pre = await p.evaluate(() => ({ dialog: !!document.querySelector('.sd-sheet--add'), value: document.querySelector('.sd-addfield input').value }));
ok('the shortcut opens the Add dialog with “zzzz” pre-filled and searches immediately (1 request)', () => { assert.equal(pre.dialog, true); assert.equal(pre.value, 'zzzz'); assert.equal(net.filter((x) => x.kind === 'search').length, 1); });
await p.keyboard.press('Escape'); await wait(250);
await clickText(p, '.sd-lempty .sd-lclear', 'Clear filter'); await wait(250);
assert.equal((await newNames(p)).length, FOLLOWED); checks++; console.log('  PASS "Clear filter" restores the library');
// a combination that is certainly empty: the name "Suits" (a Finished show) with the Not started tab
await p.click('.sd-lfilter input'); await p.keyboard.type('Suits', { delay: 10 }); await wait(250);
await pickStatus(p, 'Not started');
e = await p.evaluate(() => ({ h2: document.querySelector('.sd-lempty h2').textContent, chips: [...document.querySelectorAll('.sd-lempty .chips span')].map((x) => x.textContent), btns: [...document.querySelectorAll('.sd-lempty button')].map((b) => b.textContent.trim()) }));
ok('filters match nothing: "No shows match these filters" with one chip per active filter and "Clear filters"', () => { assert.equal(e.h2, 'No shows match these filters'); assert.deepEqual(e.chips, ['Status: Not started', 'Name: “Suits”']); assert.deepEqual(e.btns, ['Clear filters']); });
await shot(p, '06b_filters_match_nothing', false);
await clickText(p, '.sd-lempty button', 'Clear filters'); await wait(300);
const reset = await p.evaluate(() => ({ q: document.querySelector('.sd-lfilter input').value, tab: document.querySelectorAll('.sd-chipbtn')[0].textContent.trim(), n: document.querySelectorAll('.sd-ltile').length }));
ok('"Clear filters" resets the name AND the status', () => assert.deepEqual(reset, { q: '', tab: 'Status', n: FOLLOWED }));
await p.close();
p = await open(NEW, { state: EMPTY });
e = await p.evaluate(() => ({ h2: document.querySelector('.sd-lempty h2').textContent, text: document.querySelector('.sd-lempty p').textContent, hasBar: !!document.querySelector('.sd-lbar'), hasTools: !!document.querySelector('.sd-toolsbtn'), btns: [...document.querySelectorAll('.sd-lempty button')].map((b) => b.textContent.trim()) }));
ok('brand-new library: "Your library is empty", an "Add a show" button, no filter bar and no Tools', () => { assert.equal(e.h2, 'Your library is empty'); assert.deepEqual(e.btns, ['Add a show']); assert.equal(e.hasBar, false); assert.equal(e.hasTools, false); });
ok('the empty-library copy is truthful (stored in your browser; syncs if you sign in) — no "your own server" claim', () => { assert.match(e.text, /stored in this browser/); assert.doesNotMatch(e.text, /own server/i); });
await shot(p, '07_empty_library', false);
await p.click('.sd-lempty .sd-rbtn'); await wait(400);
assert.ok(await p.evaluate(() => !!document.querySelector('.sd-sheet--add'))); checks++; console.log('  PASS the empty-state button opens the Add dialog');
await p.close();

// ============================================================ 7. MOVIES (phone)
console.log('7. MOVIES — phone');
p = await open(NEW, { tab: 'Movies' });
const mi = await p.evaluate(() => [...document.querySelectorAll('input')].filter((i) => i.offsetParent !== null).map((i) => i.placeholder));
ok('THE FIX on Movies too: one text box, "Filter 30 movies" (the "Search TMDB to log a movie" box is gone)', () => { assert.deepEqual(mi, [`Filter ${WATCHED_MOVIES} movies`]); });
const mh = await p.evaluate(() => ({ count: document.querySelector('.sd-libhead h1 .n').textContent, add: document.querySelector('.sd-addbtn').getAttribute('aria-label'), radios: [...document.querySelectorAll('[role=radio]')].filter((r) => ['Recent', 'A–Z', 'Rating'].includes(r.textContent)).map((r) => [r.textContent, r.getAttribute('aria-checked')]), group: [...document.querySelectorAll('[role=radiogroup]')].find((g) => /Recent/.test(g.textContent)).getAttribute('aria-label') }));
ok('title count, "Add a movie from TMDB" button, and a radio group Recent / A–Z / Rating', () => { assert.equal(mh.count, String(WATCHED_MOVIES)); assert.match(mh.add, /Add a movie/); assert.deepEqual(mh.radios, [['Recent', 'true'], ['A–Z', 'false'], ['Rating', 'false']]); assert.equal(mh.group, 'Sort movies'); });
await p.evaluate(() => [...document.querySelectorAll('[role=radio]')].find((r) => r.textContent === 'Recent').focus()); await p.keyboard.press('ArrowRight'); await wait(200);
assert.equal(await p.evaluate(() => [...document.querySelectorAll('[role=radio][aria-checked=true]')].map((r) => r.textContent).find((x) => ['Recent', 'A–Z', 'Rating'].includes(x)) + '|' + document.activeElement.textContent), 'A–Z|A–Z'); checks++; console.log('  PASS arrow-key navigation on the sort switch');
const badge = await p.evaluate(() => { const t = [...document.querySelectorAll('.sd-ltile')].find((x) => x.querySelector('.sd-ltile-badge')); const b = t.querySelector('.sd-ltile-badge').getBoundingClientRect(), a = t.querySelector('.sd-ltile-art').getBoundingClientRect(); return { topLeft: b.top - a.top < 12 && b.left - a.left < 12, date: !!t.querySelector('.sd-ltile-date') }; });
ok('rating badge sits TOP-LEFT of the poster (as designed) and each tile shows its watch date', () => { assert.ok(badge.topLeft); assert.ok(badge.date); });
await shot(p, '08_movies_phone', false);
// add dialog
net = [];
await p.click('.sd-addbtn'); await wait(400); await p.keyboard.type('Howl', { delay: 25 }); await wait(900);
res = await p.evaluate(() => ({ title: document.querySelector('.sd-sheet').getAttribute('aria-label'), rows: [...document.querySelectorAll('.sd-res')].map((r) => ({ title: r.querySelector('.sd-res-title').textContent, badge: (r.querySelector('.sd-badge') || {}).textContent || null, btns: [...r.querySelectorAll('.sd-rbtn')].map((b) => b.textContent.trim()) })) }));
ok('movie dialog is titled "Add a movie"; a watched film shows "In library" with Open + Log again', () => { assert.equal(res.title, 'Add a movie'); assert.equal(res.rows[0].badge, 'In library'); assert.deepEqual(res.rows[0].btns, ['Open', 'Log again']); });
ok('a new film offers "Watched it" (clear about what it logs) and "Add to watchlist"', () => assert.deepEqual(res.rows[1].btns, ['Watched it', 'Add to watchlist']));
const before = (await stored(p)).movies.length;
await p.evaluate(() => [...document.querySelectorAll('.sd-res')][1].querySelector('.sd-rbtn.primary').click()); await wait(700);
let ms = (await stored(p)).movies;
ok('"Watched it" logs the film as watched TODAY (local date) — exactly one new entry', () => { assert.equal(ms.length, before + 1); const m = ms.find((x) => x.tmdbId === 9001); assert.ok(m.status === undefined || m.status === 'watched'); assert.match(m.watchedAt, /^2026-10-0[12]/); });
await p.evaluate(() => [...document.querySelectorAll('.sd-res')][0].querySelectorAll('.sd-rbtn')[1].click()); await wait(700);
ms = (await stored(p)).movies;
ok('"Log again" adds a second dated watch of the same film (a rewatch), not a duplicate record', () => assert.equal(ms.filter((m) => m.tmdbId === 5001).length, 2));
res = await p.evaluate(() => [...document.querySelectorAll('.sd-res')][0].querySelector('.sd-badge').textContent);
ok('and the badge updates to "Logged 2×"', () => assert.equal(res, 'Logged 2×'));
await clickText(p, '.sd-res:first-child .sd-rbtn', 'Open'); await wait(700);
const det = await p.evaluate(() => ({ dialog: document.querySelector('.sd-sheet') ? document.querySelector('.sd-sheet').getAttribute('aria-label') : null }));
ok('"Open" jumps to that film\'s detail sheet (your existing rating / platform / trailer / fix match / remove sheet)', () => assert.match(det.dialog, /Howl/));
await p.keyboard.press('Escape'); await wait(300);
// name-not-found on movies
await p.click('.sd-lfilter input'); await p.keyboard.type('qqqq', { delay: 10 }); await wait(250);
const me = await p.evaluate(() => ({ h2: document.querySelector('.sd-lempty h2').textContent, btns: [...document.querySelectorAll('.sd-lempty button')].map((b) => b.textContent.trim()) }));
ok('movies: name-not-found with the same "Search TMDB for “qqqq”" shortcut', () => { assert.equal(me.h2, 'Nothing called “qqqq” in your library'); assert.deepEqual(me.btns, ['Search TMDB for “qqqq”', 'Clear filter']); });
await p.close();
p = await open(NEW, { tab: 'Movies', state: EMPTY });
assert.equal(await p.evaluate(() => document.querySelector('.sd-lempty h2').textContent), 'No movies yet'); checks++; console.log('  PASS empty movie library');
await p.close();

// ============================================================ 8. DESKTOP
console.log('8. DESKTOP (1280px)');
p = await open(NEW, { w: 1280, h: 800 });
const bar = await p.evaluate(() => { const r = (s) => { const e = document.querySelector(s).getBoundingClientRect(); return { y: e.y, cy: e.y + e.height / 2, w: e.width, x: e.x, h: e.height }; }; return { filter: r('.sd-lfilter'), status: r('.sd-chipbtn'), chip1: r('.sd-lbar-chips .sd-pop-wrap'), dir: r('.sd-lbar-chips .sd-ib') }; });
ok('ONE toolbar row: filter, status, Platform, Sort and direction share a vertical centre', () => { const cs = [bar.filter.cy, bar.status.cy, bar.chip1.cy, bar.dir.cy]; assert.ok(Math.max(...cs) - Math.min(...cs) < 3, JSON.stringify(cs)); });
ok('toolbar widths: filter 260, Status 170, Platform 150', () => { assert.ok(Math.abs(bar.filter.w - 260) < 2, String(bar.filter.w)); assert.ok(Math.abs(bar.status.w - 170) < 2, String(bar.status.w)); assert.ok(Math.abs(bar.chip1.w - 150) < 2, String(bar.chip1.w)); });
const hdr = await p.evaluate(() => ({ tagline: document.body.innerText.toLowerCase().includes('personal tracker'), logoLeft: Math.round(document.querySelector('.masthead h1').getBoundingClientRect().left), pageLeft: Math.round(document.querySelector('.sd-page').getBoundingClientRect().left) }));
ok('header: no tagline, and the logo lines up with the page content', () => { assert.equal(hdr.tagline, false); assert.equal(hdr.logoLeft, hdr.pageLeft); });
const dcols = await p.evaluate(() => new Set([...document.querySelectorAll('.sd-ltile')].map((e) => Math.round(e.getBoundingClientRect().left))).size);
ok(`poster grid fills the width: ${dcols} columns (design: 7)`, () => assert.equal(dcols, 7));
const cap = await p.evaluate(() => document.querySelector('.sd-lcount .sd-lbl').textContent);
ok('caption under the toolbar: "N shows · sorted by title, A→Z"', () => assert.equal(cap, `${FOLLOWED} shows · sorted by title, A→Z`));
assert.ok(await noOverflow(p)); checks++; console.log('  PASS no horizontal overflow');
await shot(p, '09_shows_desktop', false);
// platform popover
await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[1].click()); await wait(250);
const pop = await p.evaluate(() => { const c = document.querySelector('.sd-lbar-chips .sd-chipbtn').getBoundingClientRect(), g = document.querySelector('.sd-pop').getBoundingClientRect(); return { sheet: !!document.querySelector('.sd-sheet'), role: document.querySelector('.sd-pop').getAttribute('role'), below: Math.round(g.top - c.bottom), left: Math.abs(g.left - c.left) < 2, w: Math.round(g.width), focus: document.activeElement.className, first: document.querySelector('.sd-popopt').textContent }; });
ok('desktop Platform picker is a POPOVER under the chip (not a sheet), 260px wide, focus moved inside', () => { assert.equal(pop.sheet, false); assert.equal(pop.role, 'listbox'); assert.ok(pop.below >= 4 && pop.below <= 8, String(pop.below)); assert.ok(pop.left); assert.equal(pop.w, 260); assert.match(pop.focus, /sd-popopt/); });
await shot(p, '10_platform_popover', false);
await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await wait(300);
const kbp = await p.evaluate(() => ({ closed: !document.querySelector('.sd-pop'), chip: document.querySelector('.sd-lbar-chips .sd-chipbtn').textContent, active: document.querySelector('.sd-lbar-chips .sd-chipbtn').classList.contains('active') }));
ok('keyboard: ArrowDown + Enter picks a platform, the popover closes, the chip turns amber', () => { assert.equal(kbp.closed, true); assert.equal(kbp.active, true); assert.notEqual(kbp.chip, 'Platform'); });
const clr = await p.evaluate(() => ({ bar: getComputedStyle(document.querySelector('.sd-lclear.bar')).display, phone: document.querySelector('.sd-lclear.phone') ? getComputedStyle(document.querySelector('.sd-lclear.phone')).display : 'none', cap: document.querySelector('.sd-lcount .sd-lbl').textContent }));
ok('desktop: "Clear" sits on the toolbar (the phone Clear is hidden) and the caption says "N of M shows · sorted…"', () => { assert.notEqual(clr.bar, 'none'); assert.equal(clr.phone, 'none'); assert.match(clr.cap, /^\d+ of \d+ shows · sorted by title, A→Z$/); });
await p.click('.sd-lclear.bar'); await wait(250);
await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[1].click()); await wait(200);
await p.click('.sd-libhead h1'); await wait(200); // an inert spot (the page title), not a poster tile
assert.equal(await p.evaluate(() => !document.querySelector('.sd-pop')), true); checks++; console.log('  PASS outside click closes the popover');
await p.evaluate(() => document.querySelectorAll('.sd-chipbtn')[2].click()); await wait(200); await p.keyboard.press('Escape'); await wait(200);
const escd = await p.evaluate(() => ({ closed: !document.querySelector('.sd-pop'), focus: document.activeElement.className }));
ok('Escape closes the Sort popover and returns focus to its chip', () => { assert.equal(escd.closed, true); assert.match(escd.focus, /sd-chipbtn/); });
// tools popover
await p.click('.sd-toolsbtn'); await wait(250);
const tp = await p.evaluate(() => { const b = document.querySelector('.sd-toolsbtn').getBoundingClientRect(), g = document.querySelector('.sd-pop').getBoundingClientRect(); return { role: document.querySelector('.sd-pop').getAttribute('role'), alignedRight: Math.abs(g.right - b.right) < 2, items: document.querySelectorAll('.sd-pop .sd-toolitem').length }; });
ok('Tools opens a right-aligned menu popover with both tools', () => { assert.equal(tp.role, 'menu'); assert.ok(tp.alignedRight); assert.equal(tp.items, 2); });
await p.keyboard.press('Escape'); await wait(150);
// add dialog desktop
net = [];
await p.click('.sd-addbtn'); await wait(300); await p.keyboard.type('Bleach', { delay: 20 }); await wait(900);
const ad = await p.evaluate(() => { const s = document.querySelector('.sd-sheet').getBoundingClientRect(); const r = [...document.querySelectorAll('.sd-res')][1]; const t = r.querySelector('.sd-res-title').getBoundingClientRect(), b = r.querySelector('.sd-rbtn').getBoundingClientRect(); return { w: Math.round(s.width), centred: Math.abs((s.left + s.width / 2) - innerWidth / 2) < 3, topGap: Math.round(s.top), tag: getComputedStyle(document.querySelector('.sd-addfield .tag')).display, inRow: b.top < t.bottom + 40 && b.left > t.left + 150 }; });
ok('desktop Add dialog: centred 660px dialog, a "TMDB" tag in the box, and the buttons sit BESIDE each result (not stacked below)', () => { assert.equal(ad.w, 660); assert.ok(ad.centred); assert.notEqual(ad.tag, 'none'); assert.ok(ad.inRow); });
await shot(p, '11_add_dialog_desktop', false);
await p.keyboard.press('Escape'); await p.close();

// desktop movies + tablet + filtered
p = await open(NEW, { w: 1280, h: 800, tab: 'Movies' });
const mb = await p.evaluate(() => { const r = (s) => { const e = document.querySelector(s).getBoundingClientRect(); return { cy: e.y + e.height / 2, w: e.width }; }; return { f: r('.sd-lfilter'), s: r('.sd-lbar-sort .sd-lstatus'), lab: r('.sd-lbar-sort .sd-lbl'), cap: document.querySelector('.sd-lcount .sd-lbl').textContent }; });
ok('desktop Movies: filter + "SORT" label + 300px switch on one row; caption "N movies · most recently watched first"', () => { assert.ok(Math.abs(mb.f.cy - mb.s.cy) < 3); assert.ok(Math.abs(mb.s.w - 300) < 2); assert.equal(mb.cap, `${WATCHED_MOVIES} movies · most recently watched first`); });
await shot(p, '12_movies_desktop', false); await p.close();
p = await open(NEW, { w: 820, h: 1100 });
const tb = await p.evaluate(() => ({ bar: getComputedStyle(document.querySelector('.sd-lbar')).flexDirection, cols: new Set([...document.querySelectorAll('.sd-ltile')].map((e) => Math.round(e.getBoundingClientRect().left))).size, sheet: (() => { document.querySelectorAll('.sd-chipbtn')[0].click(); return null; })() }));
await wait(300);
const tsheet = await p.evaluate(() => ({ sheet: !!document.querySelector('.sd-sheet'), pop: !!document.querySelector('.sd-pop') }));
ok('tablet (820px): stacked 3-row bar like a phone, a 3+ column grid inside the 560px page, and sheets (not popovers)', () => { assert.equal(tb.bar, 'column'); assert.ok(tb.cols >= 3); assert.equal(tsheet.sheet, true); assert.equal(tsheet.pop, false); });
await p.close();

await browser.close(); servers.forEach((s) => s.close());
console.log(`\n${checks} checks passed`);
console.log('PROBLEMS:', problems.length ? '\n' + [...new Set(problems)].join('\n') : 'none');
if (problems.length) process.exit(1);
