import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIST = '/home/claude/wl/dist';
const OUT = '/home/claude/shot/out4';
fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync('/home/claude/shot/fonts.css', 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4176, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED_ISO = '2026-09-29T21:30:00.000Z'; // Wed 30 Sep 07:30 Hobart

const W = (s, from, to, at = '2026-08-01T10:00:00.000Z') => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`${s}x${from + i}`, { at, min: 40, n: 1 }]));
const base = { followed: true, poster: null, status: 'Returning Series', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 40, genres: [] };
const up = (l) => l.map(([s, e, name, air]) => ({ s, e, name, air }));
const nx = (s, e, date, name = '') => ({ season: s, episode: e, date, name });
const SHOWS = {
  'tmdb:1': { ...base, name: '13 Reasons Why', tmdbId: 1, status: 'Ended', platform: 'netflix', rating: 3, providersSynced: true, providers: [{ name: 'Netflix', logo: null }], totalEpisodes: 49,
    seasons: [{ n: 1, count: 13 }, { n: 2, count: 13 }, { n: 3, count: 13 }, { n: 4, count: 10 }], watched: { ...W(1, 1, 13, '2026-09-29T10:00:00.000Z'), ...W(2, 1, 13, '2026-09-29T09:00:00.000Z'), '3x1': { at: '2026-09-29T20:00:00.000Z', min: 40, n: 1 } } },
  'tmdb:3': { ...base, name: 'Suits', tmdbId: 3, totalEpisodes: 26, seasons: [{ n: 8, count: 16 }, { n: 9, count: 10 }], watched: W(8, 1, 13, '2026-09-28T08:00:00.000Z') },
  'tmdb:2': { ...base, name: 'Emily in Paris', tmdbId: 2, totalEpisodes: 20, seasons: [{ n: 5, count: 10 }, { n: 6, count: 10 }], watched: W(5, 1, 10, '2026-09-27T10:00:00.000Z') },
  'tmdb:4': { ...base, name: 'Chainsaw Man', tmdbId: 4, runtimeMin: 24, totalEpisodes: 12, seasons: [{ n: 1, count: 12 }], watched: W(1, 1, 2, '2026-09-26T10:00:00.000Z') },
  'tmdb:10': { ...base, name: 'Re: ZERO, Starting Life in Another World', tmdbId: 10, watched: {}, nextAir: nx(1, 85, '2026-09-30', 'Episode 85'), upcoming: up([[1, 85, 'Episode 85', '2026-09-30']]) },
  'tmdb:11': { ...base, name: 'South Park', tmdbId: 11, watched: {}, nextAir: nx(29, 2, '2026-09-30', 'Billionaire Weenietown'), upcoming: up([[29, 2, 'Billionaire Weenietown', '2026-09-30']]) },
  'tmdb:12': { ...base, name: 'JoJo’s Bizarre Adventure', tmdbId: 12, watched: {}, nextAir: nx(6, 3, '2026-10-02', 'Episode 3'), upcoming: up([[6, 3, 'Episode 3', '2026-10-02'], [6, 4, 'Episode 4', '2026-10-09'], [6, 5, 'Episode 5', '2026-10-16']]) },
  'tmdb:13': { ...base, name: 'The Simpsons', tmdbId: 13, watched: {}, nextAir: nx(38, 2, '2026-10-04', 'Diary of a Chimpy Kid'), upcoming: up([[38, 2, 'Diary of a Chimpy Kid', '2026-10-04']]) },
  'tmdb:14': { ...base, name: 'Phineas and Ferb', tmdbId: 14, watched: {}, nextAir: nx(5, 39, '2026-10-06', 'Night of the Living Candace'), upcoming: up([[5, 39, 'Night of the Living Candace', '2026-10-06'], [5, 40, 'Terrors of the AltSpace', '2026-10-06']]) },
  'tmdb:15': { ...base, name: 'The Late Show', tmdbId: 15, watched: {}, nextAir: nx(1, 1, '2026-11-05', 'Pilot'), upcoming: up([[1, 1, 'Pilot', '2026-11-05']]) },
};
const movies = [{ name: 'Some Film', tmdbId: 88, watchedAt: '2020-01-01', runtimeMin: 100 }];
const cast = ['Dylan Minnette', 'Christian Navarro', 'Alisha Boe', 'Brandon Flynn', 'Justin Prentice', 'Miles Heizer', 'Ross Butler', 'Devin Druid'];
const details = { id: 1, created_by: [{ id: 900, name: 'Brian Yorkey' }], aggregate_credits: { cast: cast.map((name, i) => ({ id: 100 + i, name, profile_path: null, roles: [{ character: 'Role ' + i, episode_count: 30 }] })), crew: [{ id: 300, name: 'Tommy Lohmann', profile_path: null, jobs: [{ job: 'Director', episode_count: 3 }] }] } };

const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
const problems = [];
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
async function open(w, h) {
  const page = await browser.newPage();
  await page.emulateTimezone('Australia/Hobart');
  await page.setViewport({ width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1 });
  page.on('pageerror', (e) => problems.push(`[${w}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(`[${w}] console.error: ${m.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:4176')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (u.includes('api.themoviedb.org')) {
      const p = new URL(u).pathname.replace('/3', ''); let m; let body = { episodes: [], results: [] };
      if ((m = p.match(/^\/tv\/(\d+)\/season\/(\d+)$/))) { const sh = SHOWS[`tmdb:${m[1]}`]; const sc = sh && sh.seasons.find((x) => x.n === +m[2]); body = { episodes: Array.from({ length: sc ? sc.count : 0 }, (_, i) => ({ id: +m[2] * 1000 + i, episode_number: i + 1, name: `Episode ${i + 1}`, air_date: '2018-03-01', runtime: 44 })) }; }
      else if (p === '/tv/1') body = details;
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__seeded', '1'); }
    const RD = Date; const start = RD.now(); const b = RD.parse(fixed);
    class FD extends RD { constructor(...a) { if (a.length === 0) super(b + (RD.now() - start)); else super(...a); } static now() { return b + (RD.now() - start); } }
    window.Date = FD;
  }, { shows: SHOWS, movies, settings: { tmdbKey: 'TESTKEY' } }, FIXED_ISO);
  await page.goto('http://localhost:4176/', { waitUntil: 'networkidle0' });
  await wait(600);
  return page;
}
const box = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const css = (p, sel, prop) => p.evaluate((s, pr) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[pr] : null; }, sel, prop);
const shot = async (p, name, full = false) => { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log('  shot', name); };
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const openShow = async (p) => { await p.evaluate(() => { const el = [...document.querySelectorAll('.sd-open')].find((b) => b.innerText.includes('13 Reasons Why')); el.click(); }); await p.waitForSelector('.sd-side'); await wait(900); };
let checks = 0; const ok = (name, fn) => { fn(); checks++; console.log('  PASS', name); };
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

// ============================================================ PHONE: must be unchanged
console.log('1. PHONE 390px — regression: spacing must be exactly as before');
let p = await open(390, 844);
assert.equal(await css(p, '.sd-cols-un', 'display'), 'block'); checks++; console.log('  PASS Up Next container is a plain block (stacked)');
let a = await box(p, '.sd-un-left'), b = await box(p, '.sd-sec--2');
ok('second section sits below the first', () => assert.ok(b.y >= a.b - 1));
assert.equal(await css(p, '.sd-un-left', 'paddingTop'), '18px'); assert.equal(await css(p, '.sd-sec--2', 'paddingTop'), '28px'); checks++; console.log('  PASS section top padding 18px / 28px (as before)');
assert.equal(await css(p, '.sd-un-left', 'position'), 'static'); checks++; console.log('  PASS no sticky column on a phone');
assert.ok(await noOverflow(p)); checks++; console.log('  PASS Up Next: no horizontal overflow');
await shot(p, '01_phone_upnext');
await openShow(p);
let hero = await box(p, '.sd-side > div'), set = await box(p, '.sd-side > section'), sea = await box(p, '.sd-main > section'), cs = await box(p, '.sd-main > section:nth-of-type(2)');
ok('Show page: hero -> settings card gap is 20px (unchanged)', () => assert.ok(near(set.y - hero.b, 20), String(set.y - hero.b)));
ok('Show page: settings -> seasons gap is 16px (unchanged)', () => assert.ok(near(sea.y - set.b, 16), String(sea.y - set.b)));
ok('Show page: seasons -> cast gap is 16px (unchanged)', () => assert.ok(cs && near(cs.y - sea.b, 16), String(cs && cs.y - sea.b)));
const pst = await box(p, '.sd-hero-poster');
ok('hero poster is still 72x108', () => assert.deepEqual([Math.round(pst.w), Math.round(pst.h)], [72, 108]));
assert.equal(await css(p, '.sd-side', 'position'), 'static'); checks++; console.log('  PASS sidebar is not sticky on a phone');
assert.ok(await noOverflow(p)); checks++; console.log('  PASS Show page: no horizontal overflow');
await p.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Where you watch')).click(); }); await wait(400);
const sb = await box(p, '.sd-sheet'); const vh = 844;
ok('phone sheet is still a BOTTOM sheet (touches the bottom edge)', () => assert.ok(near(sb.b, vh, 2), `bottom ${sb.b}`));
assert.notEqual(await css(p, '.sd-handle', 'display'), 'none'); checks++; console.log('  PASS phone keeps the drag handle');
await p.close();

// ============================================================ TABLET
console.log('2. TABLET 820px — still the single phone-style column');
p = await open(820, 1100);
assert.equal(await css(p, '.sd-cols-un', 'display'), 'block'); checks++; console.log('  PASS no two-column grid below 900px');
const pg = await box(p, '.sd-page'); ok('column capped at 560px and centred', () => assert.ok(pg.w <= 561 && pg.x > 100));
await shot(p, '02_tablet_upnext'); await p.close();

// ============================================================ DESKTOP
for (const [w, h] of [[1280, 800], [1440, 900]]) {
  console.log(`3. DESKTOP ${w}x${h}`);
  p = await open(w, h);
  assert.equal(await css(p, '.sd-cols-un', 'display'), 'grid'); checks++; console.log('  PASS Up Next uses the two-column grid');
  const L = await box(p, '.sd-un-left'), R = await box(p, '.sd-sec--2'), page = await box(p, '.sd-page');
  ok(`page is wide (${Math.round(page.w)}px), not the old 560px`, () => assert.ok(page.w >= 1100));
  ok('left column >= 360px; right agenda column is the wider one', () => { assert.ok(L.w >= 360); assert.ok(R.w > L.w + 150); });
  ok('both columns start at the same height', () => assert.ok(near(L.y, R.y)));
  const cardL = await box(p, '.sd-un-left > .sd-card'), cardR = await box(p, '.sd-sec--2 .sd-card');
  ok('the first cards of the two columns start LEVEL (continue card vs first agenda card)', () => assert.ok(near(cardL.y, cardR.y, 1), `${cardL.y} vs ${cardR.y}`));
  const logoLeft = await p.evaluate(() => document.querySelector('.masthead h1').getBoundingClientRect().left);
  const titleLeft = await p.evaluate(() => document.querySelector('.sd-page h1').getBoundingClientRect().left);
  ok('header logo and page title line up on the left edge (the misalignment you saw)', () => assert.ok(near(logoLeft, titleLeft, 1.5), `${logoLeft} vs ${titleLeft}`));
  const searchRight = await p.evaluate(() => document.querySelector('.masthead button').getBoundingClientRect().right);
  ok('header search button lines up with the page right edge', () => assert.ok(near(searchRight, page.r + 6, 8) || near(searchRight, page.r, 12), `${searchRight} vs ${page.r}`));
  assert.ok(await noOverflow(p)); checks++; console.log('  PASS no horizontal overflow');
  await shot(p, `03_desktop_${w}_upnext`);

  // sticky continue column
  const pre = await box(p, '.sd-un-left');
  await p.evaluate(() => window.scrollTo(0, 600)); await wait(200);
  const tall = await p.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 300);
  if (tall) { const post = await box(p, '.sd-un-left'); ok('continue column stays in view while the agenda scrolls (sticky)', () => assert.ok(post.y >= -1 && post.y < 40, `y=${post.y}`)); }
  else console.log('  (skip sticky check: page not tall enough at this size)');
  await p.evaluate(() => window.scrollTo(0, 0));

  // hover: mark button highlights under a mouse
  const hov = await p.evaluate(() => matchMedia('(hover: hover)').matches);
  if (hov) { await p.hover('.sd-markbtn'); await wait(150); const bg = await css(p, '.sd-markbtn', 'backgroundColor'); ok('mark button highlights on mouse hover', () => assert.notEqual(bg, 'rgba(0, 0, 0, 0)')); } else console.log('  (skip hover check: environment reports no hover)');

  // show page
  await openShow(p);
  assert.equal(await css(p, '.sd-cols', 'display'), 'grid'); checks++; console.log('  PASS Show page uses the two-column grid');
  const S = await box(p, '.sd-side'), M = await box(p, '.sd-main'), sp = await box(p, '.sd-page');
  ok('sidebar is 340px and the main column gets the rest', () => { assert.ok(near(S.w, 340, 2)); assert.ok(M.w > 700, String(M.w)); assert.ok(near(M.x - S.r, 24, 2)); });
  ok('sidebar and main column start at the same height', () => assert.ok(near(S.y, M.y)));
  const ps = await box(p, '.sd-hero-poster'); ok('hero poster grows to 96x144', () => assert.deepEqual([Math.round(ps.w), Math.round(ps.h)], [96, 144]));
  const logoL2 = await p.evaluate(() => document.querySelector('.masthead h1').getBoundingClientRect().left);
  ok('show page content lines up with the header logo', () => assert.ok(near(logoL2, sp.x, 1.5), `${logoL2} vs ${sp.x}`));
  const tallShow = await p.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 200);
  assert.ok(tallShow, 'precondition: show page must be scrollable for the sticky test'); checks++;
  await p.evaluate(() => window.scrollTo(0, 400)); await wait(200);
  const S2 = await box(p, '.sd-side');
  ok('SIDEBAR STAYS PUT while the long seasons list scrolls (sticky at ~16px)', () => assert.ok(S2.y >= 0 && S2.y <= 24, `y=${S2.y}`));
  await p.evaluate(() => window.scrollTo(0, 0)); await wait(100);
  await shot(p, `04_desktop_${w}_show`);

  await p.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Where you watch')).click(); }); await wait(400);
  const sh = await box(p, '.sd-sheet');
  ok('sheet is a CENTRED dialog on desktop (not stuck to the bottom edge)', () => { assert.ok(sh.y > 40); assert.ok(sh.b < h - 20); assert.ok(near(sh.x + sh.w / 2, w / 2, 3)); assert.ok(sh.w <= 561); });
  assert.equal(await css(p, '.sd-handle', 'display'), 'none'); checks++; console.log('  PASS drag handle hidden on desktop');
  await shot(p, `05_desktop_${w}_sheet`);
  await p.keyboard.press('Escape'); await wait(200);
  await p.close();
}

// ============================================================ ULTRA-WIDE
console.log('4. ULTRA-WIDE 1920x1080 — content capped, not stretched edge to edge');
p = await open(1920, 1080);
const uw = await box(p, '.sd-page'); ok('page is capped near 1168px and centred', () => { assert.ok(uw.w <= 1169 && uw.w >= 1160); assert.ok(near(uw.x + uw.w / 2, 960, 2)); });
await shot(p, '06_ultrawide_upnext'); await p.close();

// ============================================================ the other, not-yet-redesigned tabs at the new width
console.log('5. other tabs at 1280px (not redesigned yet — checking the wider container did not break them)');
p = await open(1280, 800);
for (const tab of ['Shows', 'Movies', 'Watchlist', 'Stats', 'Settings']) {
  await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), tab); await wait(500);
  assert.ok(await noOverflow(p), tab + ' overflows'); checks++; console.log(`  PASS ${tab}: renders, no horizontal overflow`);
  await shot(p, `07_tab_${tab.toLowerCase()}`);
}
await p.close();

await browser.close(); server.close();
console.log(`\n${checks} checks passed`);
console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
