process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// The show page: progress line, "Mark next" button, season list with a fold for long runs of
// watched episodes, sheets (where you watch, cast → person, crew, streaming, ⋯ menu, Fix match),
// follow toggle, no-key and desktop states. Date fixed at 22 Oct 2026 (Hobart). TMDB mocked.
const DIST = APP_DIST;
const OUT = workPath('out');
fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');

// ---------- tiny static server for dist/
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4173, r));

// ---------- mock data
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const W = (s, from, to, at = '2026-08-01T10:00:00.000Z') => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`${s}x${from + i}`, { at, min: 44, n: 1 }]));
const eps = (s, n, opts = {}) => Array.from({ length: n }, (_, i) => ({ id: s * 10000 + i + 1, episode_number: i + 1, name: opts.names ? opts.names(i + 1) : `Episode ${i + 1}`, air_date: opts.air ? opts.air(i + 1) : '2018-03-01', runtime: 44 }));
const cast = ['Dylan Minnette', 'Christian Navarro', 'Alisha Boe', 'Brandon Flynn', 'Justin Prentice', 'Miles Heizer', 'Ross Butler', 'Devin Druid', 'Amy Hargreaves', 'Timothy Granderos', 'Josh Hamilton', 'Derek Luke'];
const chars = ['Clay Jensen', 'Tony Padilla', 'Jessica Davis', 'Justin Foley', 'Bryce Walker', 'Alex Standall', 'Zach Dempsey', 'Tyler Down', 'Lainie Jensen', 'Montgomery de la Cruz', 'Matt Jensen', 'Kevin Porter'];
const details = {
  id: 1, created_by: [{ id: 900, name: 'Brian Yorkey' }],
  aggregate_credits: {
    cast: cast.map((name, i) => ({ id: 100 + i, name, profile_path: null, roles: [{ character: chars[i], episode_count: 40 - i }] })),
    crew: ['Tommy Lohmann', 'Jessica Yu', 'Kevin Dowling', 'Gregg Araki', 'Michael Morris', 'Kyle Patrick Alvarez', 'Carl Franklin', 'Bronwen Hughes', 'Tom McCarthy', 'Helen Shaver', 'Kat Candler', 'Aurora Guerrero'].map((name, i) => ({ id: 300 + i, name, profile_path: null, department: 'Directing', jobs: [{ job: 'Director', episode_count: 1 + (i % 4) }] })),
  },
};
const personCredits = { cast: [
  { id: 77, media_type: 'tv', name: 'Tracked Show', first_air_date: '2016-01-01', vote_count: 900, character: 'Lead' },
  { id: 88, media_type: 'movie', title: 'Some Film', release_date: '2019-05-01', vote_count: 500, character: 'Hero' },
  { id: 1, media_type: 'tv', name: 'THIS SHOW (should be excluded)', vote_count: 10 },
], crew: [] };

// scenario library: each returns a localStorage state object
const base = { followed: true, tmdbId: 1, tvdbId: 1, status: 'Ended', poster: null, platform: 'netflix', rating: 3, providersSynced: true, providers: [{ name: 'Netflix', logo: null }, { name: 'Netflix Standard with Ads', logo: null }], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 44, nextAir: null };
const SC = {
  rw13: { name: '13 Reasons Why', totalEpisodes: 49, seasons: [{ n: 1, count: 13 }, { n: 2, count: 13 }, { n: 3, count: 13 }, { n: 4, count: 10 }], watched: { ...W(1, 1, 13), ...W(2, 1, 13) } },
  suits: { name: 'Suits', totalEpisodes: 134, seasons: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ n, count: n === 1 ? 12 : 16 })).concat([{ n: 8, count: 16 }, { n: 9, count: 10 }]), watched: Object.assign({}, ...[1, 2, 3, 4, 5, 6, 7].map((n) => W(n, 1, n === 1 ? 12 : 16)), W(8, 1, 13)) },
  anime: { name: 'Re:ZERO -Starting Life in Another World-', totalEpisodes: 140, seasons: [{ n: 1, count: 140 }], watched: W(1, 1, 120) },
  fresh: { name: 'A Brand New Show', totalEpisodes: 8, platform: '', rating: 0, providers: [], providersSynced: false, seasons: [{ n: 1, count: 8, air: '2026-11-01' }, { n: 2, count: 0 }], watched: {} },
  done: { name: 'Fully Watched', totalEpisodes: 6, seasons: [{ n: 1, count: 3 }, { n: 2, count: 3 }], watched: { ...W(1, 1, 3), ...W(2, 1, 3) } },
  airing: { name: 'Currently Airing', status: 'Returning Series', totalEpisodes: 8, nextAir: { season: 1, episode: 5, date: '2026-10-20', name: 'Ep5' }, seasons: [{ n: 1, count: 8 }], watched: W(1, 1, 3) },
};
const seed = (key, withKey = true) => ({ shows: { 'tmdb:1': { ...base, ...SC[key] }, 'tmdb:77': { ...base, tmdbId: 77, name: 'Tracked Show', seasons: [], watched: {} } }, movies: [{ name: 'Some Film', tmdbId: 88, watchedAt: '2020-01-01', runtimeMin: 100 }], settings: { tmdbKey: withKey ? 'TESTKEY' : '' } });

const browser = await launchBrowser(puppeteer);
const problems = [];

async function open(key, { w = 390, h = 844, withKey = true, scale = 2 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart');
  await page.setViewport({ width: w, height: h, deviceScaleFactor: scale });
  page.on('pageerror', (e) => problems.push(`[${key}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (['error'].includes(m.type()) && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(`[${key}] console.error: ${m.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:4173')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('fonts.gstatic.com')) return r.abort();
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (u.includes('api.themoviedb.org')) {
      const p = new URL(u).pathname.replace('/3', '');
      let body = {};
      let m;
      if ((m = p.match(/^\/tv\/1\/season\/(\d+)$/))) {
        const n = +m[1]; const sc = SC[key].seasons.find((s) => s.n === n);
        const air = key === 'airing' ? (e) => (e <= 4 ? '2026-09-01' : '2026-10-20') : undefined;
        body = { episodes: eps(n, sc ? sc.count : 0, { air, names: key === 'anime' ? (e) => `Episode ${e}` : undefined }) };
      } else if (p === '/tv/1') body = details;
      else if (/^\/person\/\d+\/combined_credits$/.test(p)) body = personCredits;
      else if (/watch\/providers/.test(p)) body = { results: { AU: { flatrate: [{ provider_name: 'Netflix', logo_path: null }], link: 'https://example.com' } } };
      else if (/videos/.test(p)) body = { results: [{ site: 'YouTube', type: 'Trailer', official: true, key: 'abc' }] };
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, seed(key, withKey), Date.parse('2026-10-21T22:00:00.000Z')); // Thu 22 Oct 2026, 9am in Hobart
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });
  // Shows tab -> open the show
  await page.evaluate(() => { [...document.querySelectorAll('nav.tabbar button, nav.tabbar a')].find((b) => /Shows/.test(b.textContent)).click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate((name) => {
    const el = [...document.querySelectorAll('*')].reverse().find((e) => e.children.length === 0 && e.textContent.trim() === name);
    (el.closest('button, a, [role=button], .poster-card, .card') || el).click();
  }, SC[key].name);
  await page.waitForSelector('.sd-page', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 900));
  return page;
}

const shot = async (page, name, full = true) => { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const click = (page, text, sel = 'button, a') => page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (!el) throw new Error('no element with text: ' + t); el.click(); }, text, sel);
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); };
const pageText = (p) => p.evaluate(() => document.querySelector('.sd-page').innerText.replace(/\s+/g, ' '));
const sheetText = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-sheet')].map((s) => s.innerText.replace(/\s+/g, ' ')).join(' ¦ '));
const sheets = (p) => p.evaluate(() => document.querySelectorAll('.sd-sheet').length);
const epRows = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-ep')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const watchedOf = (k) => Object.keys(SC[k].watched).length;

console.log('1. 13 REASONS WHY: PAGE AND SHEETS');
let p = await open('rw13');
await ok('progress line: watched of total, and what is left', async () => {
  const t = await pageText(p);
  assert.match(t, new RegExp(`${watchedOf('rw13')} of 49 watched`)); assert.match(t, new RegExp(`${49 - watchedOf('rw13')} left`));
});
await ok('the next button offers S03·E01 (seasons 1–2 done)', async () => { assert.match(await pageText(p), /Mark S03·E01 watched/); });
await ok('season heads show watched/total; the first unfinished season is open', async () => {
  const heads = await p.evaluate(() => [...document.querySelectorAll('.sd-season-head')].map((h) => h.innerText.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(heads, ['S01 13/13', 'S02 13/13', 'S03 0/13', 'S04 0/10']);
  assert.equal((await epRows(p)).filter((e) => /^E\d+/.test(e)).length, 13);
});
await ok('phone: no sideways scroll', async () => { assert.ok(await noScroll(p)); });
await shot(p, '01_rw13_page');
await click(p, 'Where you watch'); await wait();
await ok('"Where you watch" opens the platform sheet with Netflix chosen', async () => { assert.equal(await sheets(p), 1); assert.match(await sheetText(p), /Netflix/); });
await shot(p, '02_rw13_platform_sheet', false);
await click(p, 'Done'); await wait();
await ok('Done closes it', async () => { assert.equal(await sheets(p), 0); });
await click(p, 'Cast'); await wait();
await ok('Cast sheet lists all 12 actors with their characters', async () => {
  const t = await sheetText(p);
  for (const n of cast) assert.match(t, new RegExp(n));
  assert.match(t, /Clay Jensen/);
});
await shot(p, '03_rw13_cast_sheet', false);
await click(p, 'Dylan Minnette', '.sd-cast-cell'); await wait(700);
await ok('tapping an actor opens their page on top: their other titles, not this show', async () => {
  assert.equal(await sheets(p), 2);
  const t = await sheetText(p); assert.match(t, /Tracked Show/); assert.match(t, /Some Film/); assert.doesNotMatch(t, /THIS SHOW/);
});
await shot(p, '04_rw13_person_on_cast', false);
await p.keyboard.press('Escape'); await wait();
await ok('Esc closes only the actor page; the cast sheet stays open', async () => { assert.equal(await sheets(p), 1); assert.match(await sheetText(p), /Christian Navarro/); });
await p.keyboard.press('Escape'); await wait();
await ok('Esc again closes the cast sheet and stays on the show page', async () => { assert.equal(await sheets(p), 0); assert.match(await pageText(p), /13 Reasons Why/); });
await click(p, 'Full crew'); await wait();
await ok('"Full crew" lists the creator and the 12 directors', async () => {
  const t = await sheetText(p); assert.match(t, /Brian Yorkey/); for (const n of ['Tommy Lohmann', 'Jessica Yu', 'Aurora Guerrero']) assert.match(t, new RegExp(n));
});
await shot(p, '06_rw13_crew_sheet', false);
await p.keyboard.press('Escape'); await wait();
await click(p, 'Streaming in Australia'); await wait();
await ok('"Streaming in Australia" sheet shows Netflix', async () => { assert.equal(await sheets(p), 1); assert.match(await sheetText(p), /Netflix/); });
await p.keyboard.press('Escape'); await wait();
await p.click('button[aria-label="More actions"]'); await wait();
await ok('the ⋯ menu offers Fix TMDB match', async () => { assert.match(await sheetText(p), /Fix TMDB match/); });
await click(p, 'Fix TMDB match'); await wait();
await ok('Fix TMDB match opens a search box filled with the show name', async () => {
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('.sd-sheet input')].some((i) => /13 Reasons Why/.test(i.value))), true);
});
await shot(p, '09_rw13_fix_sheet', false);
await p.close();

console.log('2. SUITS: MARK NEXT AND THE FOLD');
p = await open('suits');
const watchedSuits = watchedOf('suits'); // seasons 1–7 and S8 E1–13
await ok(`progress ${watchedSuits} of 134; next is S08·E14`, async () => { const t = await pageText(p); assert.match(t, new RegExp(`${watchedSuits} of 134 watched`)); assert.match(t, /Mark S08·E14 watched/); });
await ok('finished seasons 1–7 are folded into one row', async () => { assert.match(await pageText(p), /Seasons 1–7/); });
await click(p, 'Mark S08·E14 watched', 'button'); await wait(500);
await ok('marking it adds one and moves the button to S08·E15', async () => {
  const t = await pageText(p); assert.match(t, new RegExp(`${watchedSuits + 1} of 134 watched`)); assert.match(t, /Mark S08·E15 watched/);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).shows['tmdb:1'].watched['8x14']); assert.ok(st && st.at);
});
await shot(p, '11_suits_after_mark');
await click(p, 'Seasons 1–7'); await wait();
await ok('unfolding shows all nine season heads', async () => {
  const heads = await p.evaluate(() => [...document.querySelectorAll('.sd-season-head')].map((h) => h.innerText.trim().slice(0, 3)));
  assert.deepEqual(heads, ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09']);
});
await p.close();

console.log('3. OTHER STATES');
p = await open('anime');
await ok('long anime season: E01–E119 folded as "all watched", then the last watched (E120) and the 20 still to watch', async () => {
  const e = await epRows(p);
  assert.ok(e.some((x) => /^E01–E119 · all watched/.test(x)));
  const rows = e.filter((x) => /^E\d+ /.test(x)); assert.equal(rows.length, 21); assert.match(rows[0], /^E120 .*Watched/); assert.match(rows[20], /^E140 /);
  assert.match(await pageText(p), /120 of 140 watched/);
});
await p.close();
p = await open('fresh');
await ok('a new show: season 1 "Premieres 1 Nov 2026", season 2 not released, no next button', async () => {
  const t = await pageText(p);
  assert.match(t, /S01 Premieres 1 Nov 2026/); assert.match(t, /S02 Not released yet/); assert.doesNotMatch(t, /Mark S\d+·E\d+ watched/);
});
await click(p, 'Following'); await wait(300);
await ok('tapping Following unfollows: the button becomes "+ Follow"', async () => {
  assert.match(await p.evaluate(() => [...document.querySelectorAll('button.sd-btn')].map((b) => b.textContent.trim()).join(' | ')), /\+\s*Follow/);
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).shows['tmdb:1'].followed), false);
});
await p.close();
p = await open('done');
await ok('fully watched: 6 of 6, the "You finished" card, no next button', async () => {
  const t = await pageText(p); assert.match(t, /6 of 6 watched/); assert.match(t, /You finished/); assert.doesNotMatch(t, /Mark S\d+·E\d+ watched/);
});
await p.close();
p = await open('airing');
await ok('airing show: next is E04 (aired), episodes listed to E08, 3 watched', async () => {
  const t = await pageText(p); assert.match(t, /RETURNING SERIES/i); assert.match(t, /3 of 8 watched/); assert.match(t, /Mark S01·E04 watched/);
  assert.equal((await epRows(p)).filter((x) => /^E\d+ /.test(x)).length, 8);
});
await p.close();
p = await open('rw13', { withKey: false });
await ok('no TMDB key: the page still works and says to add a key (no trailer, no episode list)', async () => {
  const t = await pageText(p); assert.match(t, new RegExp(`${watchedOf('rw13')} of 49 watched`)); assert.match(t, /No TMDB API key set/); assert.doesNotMatch(t, /Trailer/);
});
await shot(p, '30_rw13_no_tmdb_key'); await p.close();
p = await open('rw13', { w: 1280, h: 900, scale: 1 });
await ok('desktop: no sideways scroll', async () => { assert.ok(await noScroll(p)); });
await shot(p, '31_rw13_desktop'); await p.close();

await browser.close(); server.close();
console.log(`\n${checks} checks passed`);
console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
if (problems.length) process.exit(1);
