import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';
import { pathToFileURL } from 'node:url';

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
  rw13: { name: '13 Reasons Why', totalEpisodes: 49, seasons: [{ n: 1, count: 13 }, { n: 2, count: 13 }, { n: 3, count: 13 }, { n: 4, count: 10 }], watched: { ...W(1, 1, 13), ...W(2, 0, 13) } },
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
  const page = await browser.newPage();
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
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); }, seed(key, withKey));
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
const shot = async (page, name, full = true) => { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log('shot', name); };
const click = (page, text, sel = 'button, a') => page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (!el) throw new Error('no element with text: ' + t); el.click(); }, text, sel);
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

// 1. 13RW mirror of the design frame + sheets
let p = await open('rw13');
await shot(p, '01_rw13_page');
await click(p, 'Where you watch'); await wait(); await shot(p, '02_rw13_platform_sheet', false);
await click(p, 'Done'); await wait();
await click(p, 'Cast'); await wait(); await shot(p, '03_rw13_cast_sheet', false);
await click(p, 'Dylan Minnette', '.sd-cast-cell'); await wait(700); await shot(p, '04_rw13_person_on_cast', false);
await p.keyboard.press('Escape'); await wait(); await shot(p, '05_after_esc_cast_still_open', false);
await p.keyboard.press('Escape'); await wait();
await click(p, 'Full crew'); await wait(); await shot(p, '06_rw13_crew_sheet', false);
await p.keyboard.press('Escape'); await wait();
await click(p, 'Streaming in Australia'); await wait(); await shot(p, '07_rw13_streaming_sheet', false);
await p.keyboard.press('Escape'); await wait();
await p.click('button[aria-label="More actions"]'); await wait(); await shot(p, '08_rw13_menu_sheet', false);
await click(p, 'Fix TMDB match'); await wait(); await shot(p, '09_rw13_fix_sheet', false);
await p.close();

// 2. Suits: fold + next button + mark flow
p = await open('suits');
await shot(p, '10_suits_page');
const before = await p.evaluate(() => document.body.innerText.match(/(\d+) of 134 watched/)?.[1]);
await click(p, 'Mark S08·E14 watched', 'button'); await wait(500);
const after = await p.evaluate(() => document.body.innerText.match(/(\d+) of 134 watched/)?.[1]);
const nextBtn = await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Mark S\d+·E\d+ watched/.test(b.textContent.trim()))?.textContent.trim());
console.log(`MARK FLOW: ${before} -> ${after}; next button now: ${nextBtn}`);
await shot(p, '11_suits_after_mark');
await click(p, 'Seasons 1–7'); await wait(); await shot(p, '12_suits_unfolded');
await p.close();

// 3. other states

for (const k of ['anime', 'fresh', 'done', 'airing']) { p = await open(k); await shot(p, `20_${k}`); const n = await p.evaluate(() => document.querySelectorAll('.sd-ep').length); const fold = await p.evaluate(() => document.querySelector('.sd-foldrow')?.textContent.trim() || 'none'); console.log(`${k}: rows rendered = ${n}; fold row = ${fold}`); await p.close(); }
// unfollowed toggle
p = await open('fresh'); await click(p, 'Following'); await wait(300); console.log('toggle follow ->', await p.evaluate(() => [...document.querySelectorAll('button.sd-btn')].map((b) => b.textContent.trim()).slice(0, 3).join(' | '))); await p.close();
p = await open('rw13', { withKey: false }); await shot(p, '30_rw13_no_tmdb_key'); await p.close();
p = await open('rw13', { w: 1280, h: 900, scale: 1 }); await shot(p, '31_rw13_desktop'); await p.close();

// 4. design frame itself, for side-by-side
p = await browser.newPage();
await p.setViewport({ width: 390, height: 1500, deviceScaleFactor: 2 });
await p.goto(pathToFileURL(workPath('design', 'summary_rows.html')).href, { waitUntil: 'networkidle0' });
await wait(1500);
await p.screenshot({ path: `${OUT}/00_DESIGN_summary_rows.png` });
await p.close();

await browser.close(); server.close();
console.log('\nPROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
