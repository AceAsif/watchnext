import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIST = '/home/claude/wl/dist';
const OUT = '/home/claude/shot/out2';
fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync('/home/claude/shot/fonts.css', 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4174, r));

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const W = (s, from, to) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`${s}x${from + i}`, { at: '2026-08-01T10:00:00.000Z', min: 24, n: 1 }]));

// ---- AniList mock (controlled per test via MODE)
const NOW_S = Math.floor(Date.now() / 1000);
const media = (o = {}) => ({
  id: 108632, idMal: 31240, siteUrl: 'https://anilist.co/anime/108632',
  title: { romaji: 'Re:Zero kara Hajimeru Isekai Seikatsu', english: 'Re:ZERO -Starting Life in Another World-', native: 'Re:ゼロから始める異世界生活' },
  format: 'TV', status: 'RELEASING', episodes: 25, duration: 25, season: 'SPRING', seasonYear: 2016,
  genres: ['Drama', 'Fantasy', 'Psychological'], averageScore: 84,
  studios: { nodes: [{ name: 'White Fox', isAnimationStudio: true }, { name: 'Kadokawa', isAnimationStudio: false }] },
  nextAiringEpisode: { episode: 26, airingAt: NOW_S + 2 * 86400 + 5400 }, ...o,
});
let MODE = 'ok'; const posts = [];
const anilist = (r) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: cors });
  const body = JSON.parse(r.postData() || '{}'); posts.push(body);
  if (MODE === 'offline') return r.abort('failed');
  if (MODE === '429') return r.respond({ status: 429, headers: { ...cors, 'retry-after': '37' }, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'Too Many Requests.' }] }) });
  if (MODE === '400sort' && /sort: SEARCH_MATCH/.test(body.query)) return r.respond({ status: 400, headers: cors, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'Unknown enum' }] }) });
  const send = (data) => r.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data }) });
  if (/Media\(id/.test(body.query)) return send({ Media: media({ episodes: 26, averageScore: 86 }) }); // refreshed values
  return send({ Page: { media: [
    media({ id: 21355, title: { romaji: 'Re:Zero kara Hajimeru Isekai Seikatsu', english: 'Re:ZERO -Starting Life in Another World-', native: 'Re:ゼロから始める異世界生活' } }),
    media({ id: 108632, title: { romaji: 'Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season', english: 'Re:ZERO -Starting Life in Another World- Season 2', native: null }, seasonYear: 2020, season: 'WINTER', episodes: 25, status: 'FINISHED', nextAiringEpisode: null }),
    media({ id: 99999, title: { romaji: 'Re:Zero: Memory Snow', english: null, native: null }, format: 'MOVIE', episodes: 1, status: 'FINISHED', seasonYear: 2018, nextAiringEpisode: null, studios: { nodes: [] } }),
  ] } });
};

const baseShow = { followed: true, tmdbId: 1, tvdbId: 1, status: 'Returning Series', poster: null, platform: 'crunchyroll', rating: 4, providersSynced: true, providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 25, nextAir: null, genres: ['Animation', 'Drama'] };
const SHOWS = {
  rezero: { ...baseShow, name: 'Re:ZERO -Starting Life in Another World-', totalEpisodes: 24, seasons: [{ n: 1, count: 24 }], watched: W(1, 1, 24) },
  drama: { ...baseShow, name: 'A Plain Drama', genres: ['Drama'], totalEpisodes: 6, seasons: [{ n: 1, count: 6 }], watched: W(1, 1, 2) },
};
const seed = (k) => ({ shows: { 'tmdb:1': SHOWS[k] }, movies: [], settings: { tmdbKey: 'TESTKEY' } });

const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
const problems = [];
async function open(key, scale = 2) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: scale });
  page.on('pageerror', (e) => problems.push(`[${key}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(`[${key}] console.error: ${m.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:4174')) return r.continue();
    if (u.includes('graphql.anilist.co')) return anilist(r);
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ episodes: [], results: [], cast: [] }) });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__seeded', '1'); } }, seed(key));
  await page.goto('http://localhost:4174/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((b) => /Shows/.test(b.textContent)).click());
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate((name) => { const el = [...document.querySelectorAll('*')].reverse().find((e) => e.children.length === 0 && e.textContent.trim() === name); (el.closest('button, a, [role=button]') || el).click(); }, SHOWS[key].name);
  await page.waitForSelector('.sd-page'); await wait(700);
  return page;
}
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const shot = async (p, name, full = false) => { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log('  shot', name); };
const click = (p, text, sel = 'button, a') => p.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (!el) throw new Error('no element: ' + t); el.click(); }, text, sel);
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).shows['tmdb:1']);
const text = (p) => p.evaluate(() => document.body.innerText);
let checks = 0; const ok = (name, fn) => { fn(); checks++; console.log('  PASS', name); };

// ===================================================== 1. link flow on an anime show
console.log('1. unlinked anime show');
let p = await open('rezero');
const before = await stored(p);
assert.match(await text(p), /Anime details[\s\S]*Link to AniList for titles and episode info/); checks++; console.log('  PASS row shows prompt');
await shot(p, '01_page_unlinked');

posts.length = 0; MODE = 'ok';
await click(p, 'Anime details'); await wait(900);
ok('opening an unlinked sheet makes exactly ONE request', () => assert.equal(posts.length, 1));
ok('first request carries the show name as the query', () => assert.equal(posts[0].variables.q, 'Re:ZERO -Starting Life in Another World-'));
await shot(p, '02_search_results');
assert.match(await text(p), /EXACT TITLE MATCH/); checks++; console.log('  PASS exact-title tag shown');

await click(p, 'Use this', 'button'); await wait(500);
const after = await stored(p);
ok('linked: show.anime stored with AniList id', () => assert.equal(after.anime.id, 21355));
ok('DISPLAY-ONLY: watched map identical', () => assert.deepEqual(after.watched, before.watched));
ok('DISPLAY-ONLY: seasons identical', () => assert.deepEqual(after.seasons, before.seasons));
ok('DISPLAY-ONLY: totalEpisodes/rating/platform/followed identical', () => assert.deepEqual([after.totalEpisodes, after.rating, after.platform, after.followed], [before.totalEpisodes, before.rating, before.platform, before.followed]));
ok('only the "anime" key was added to the show record', () => assert.deepEqual(Object.keys(after).filter((k) => !(k in before)), ['anime']));
ok('snapshot has no null-only junk: required fields present', () => assert.ok(after.anime.title.english && after.anime.syncedAt && Array.isArray(after.anime.genres)));
await shot(p, '03_detail_linked');
const vis = await p.evaluate(() => { const r = (t) => { const el = [...document.querySelectorAll('.sd-sheet button, .sd-sheet a')].find((e) => e.textContent.trim().includes(t)); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; }; return { vh: window.innerHeight, refresh: r('Refresh'), change: r('Change match'), open: r('Open on AniList'), unlink: r('Unlink') }; });
console.log('  layout:', JSON.stringify(vis));
ok('ACTIONS ON-SCREEN: Refresh + Change match + Open + Unlink all within the 844px viewport (no scroll needed)', () => { for (const k of ['refresh', 'change', 'open', 'unlink']) { assert.ok(vis[k], k + ' missing'); assert.ok(vis[k].bottom <= vis.vh, `${k} bottom ${vis[k].bottom} > ${vis.vh}`); } });
const t3 = await text(p);
ok('detail shows English/Romaji/Native + studio (animation only) + score', () => { assert.match(t3, /Re:ゼロから始める異世界生活/); assert.match(t3, /White Fox/); assert.doesNotMatch(t3, /Kadokawa/); assert.match(t3, /84%/); });
ok('TMDB-vs-AniList episode mismatch note appears (24 vs 25), not applied', () => assert.match(t3, /TMDB lists 24 episodes; AniList lists 25/));
ok('next-episode countdown shown', () => assert.match(t3, /Episode 26 ·[\s\S]*\(in\s2\sd\)/));

await p.keyboard.press('Escape'); await wait(400);
assert.match(await text(p), /AniList · TV · 25 eps · Airing/); checks++; console.log('  PASS page row summarises link');
assert.match(await text(p), /Re:ゼロから始める異世界生活 · Re:Zero kara Hajimeru Isekai Seikatsu/); checks++; console.log('  PASS hero alt-title line');
await shot(p, '04_page_linked', true);

// refresh = exactly one request, updates snapshot
await click(p, 'Anime details'); await wait(300);
posts.length = 0; await click(p, 'Refresh', 'button'); await wait(700);
ok('Refresh makes exactly ONE request, by id', () => { assert.equal(posts.length, 1); assert.equal(posts[0].variables.id, 21355); });
const refreshed = await stored(p); assert.equal(refreshed.anime.episodes, 26); assert.equal(refreshed.anime.score, 86); checks++; console.log('  PASS refresh updated snapshot');
assert.deepEqual(refreshed.watched, before.watched); checks++; console.log('  PASS watched still untouched after refresh');

// change match
await click(p, 'Change match', 'button'); await wait(300);
await shot(p, '05_change_match');
assert.equal(posts.length, 1); checks++; console.log('  PASS Change match does NOT auto-search (still only the 1 refresh request)');
assert.match(await text(p), /Back to current match/); checks++; console.log('  PASS back-to-current link present');
await click(p, 'Back to current match', 'button'); await wait(300);

// unlink
await click(p, 'Unlink from AniList', 'button'); await wait(500);
const unl = await stored(p);
ok('UNLINK persists an explicit null (not a deleted key)', () => { assert.ok('anime' in unl); assert.equal(unl.anime, null); });
ok('unlink left watch data intact', () => assert.deepEqual(unl.watched, before.watched));
assert.match(await text(p), /Link to AniList for titles and episode info/); checks++; console.log('  PASS row back to prompt');
await p.close();

// ===================================================== 2. failure modes
console.log('2. failure modes');
for (const [mode, expect, shotName] of [['429', /rate-limiting[\s\S]*37s/, '06_err_rate_limited'], ['offline', /Couldn.t reach AniList/, '07_err_offline']]) {
  MODE = mode; p = await open('rezero'); posts.length = 0;
  await click(p, 'Anime details'); await wait(1200);
  assert.match(await text(p), expect); checks++; console.log(`  PASS ${mode}: friendly message`);
  assert.equal(posts.length, 1); checks++; console.log(`  PASS ${mode}: exactly one request (no retry loop)`);
  assert.equal((await stored(p)).anime, undefined); checks++; console.log(`  PASS ${mode}: nothing stored`);
  await shot(p, shotName); await p.close();
}
MODE = '400sort'; p = await open('rezero'); posts.length = 0;
await click(p, 'Anime details'); await wait(1200);
ok('SEARCH_MATCH rejected: exactly 2 requests, second without sort, results still shown', () => { assert.equal(posts.length, 2); assert.doesNotMatch(posts[1].query, /sort:/); });
assert.match(await text(p), /Use this/); checks++; console.log('  PASS results shown after fallback');
await p.close(); MODE = 'ok';

// ===================================================== 3. non-anime show
console.log('3. non-animation show');
p = await open('drama'); posts.length = 0;
assert.doesNotMatch(await text(p), /Anime details\s*\n?\s*Link to AniList/); checks++; console.log('  PASS no anime row on a plain drama');
await p.click('button[aria-label="More actions"]'); await wait(400);
assert.match(await text(p), /Anime details \(AniList\)/); checks++; console.log('  PASS menu offers it instead');
await shot(p, '08_menu_for_non_anime');
ok('no AniList request until the user asks', () => assert.equal(posts.length, 0));
await p.close();

await browser.close(); server.close();
console.log(`\n${checks} checks passed`);
console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
