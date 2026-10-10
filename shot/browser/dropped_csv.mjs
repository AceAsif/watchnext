import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

const DIST = APP_DIST;
const OUT = workPath('out_dc');
fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4178, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED_ISO = '2026-10-01T22:00:00.000Z'; // Hobart: Fri 2 Oct, 08:00

const W = (s, from, to, at) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`${s}x${from + i}`, { at, min: 40, n: 1 }]));
const base = { followed: true, poster: null, status: 'Returning Series', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 40, genres: ['Drama'] };
const STATE = {
  shows: {
    'tmdb:1': { ...base, name: 'Alpha Airing', tmdbId: 1, totalEpisodes: 8, seasons: [{ n: 1, count: 8 }], watched: W(1, 1, 4, '2026-09-20T10:00:00.000Z'), nextAir: { season: 1, episode: 5, date: '2026-10-07', name: 'Five' }, upcoming: [{ s: 1, e: 5, name: 'Five', air: '2026-10-07' }] },
    'tmdb:2': { ...base, name: 'Bravo Binge', tmdbId: 2, totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: W(1, 1, 3, '2026-09-25T10:00:00.000Z'), notes: { '1x1': { react: 'love', text: 'Great, "wow"\nsecond line', at: '2026-09-25T10:00:00.000Z' } } },
    'tmdb:3': { ...base, name: 'Charlie Done', tmdbId: 3, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: W(1, 1, 3, '2026-09-10T10:00:00.000Z') },
    'tmdb:4': { ...base, name: '鋼の錬金術師, Part 1', tmdbId: 4, totalEpisodes: 12, seasons: [{ n: 1, count: 12 }], watched: W(1, 1, 2, '2026-09-30T20:30:00.000Z') },
    'tmdb:5': { ...base, name: '=Sneaky', tmdbId: 5, totalEpisodes: 5, seasons: [{ n: 1, count: 5 }], watched: {} },
  },
  movies: [{ tmdbId: 90, name: 'Film, With Comma', status: 'watched', watchedAt: '2026-05-06T10:00:00.000Z', rating: 5, runtimeMin: 100, poster: null, year: 2026, react: 'funny', note: 'lol' }],
  settings: { tmdbKey: 'SECRET-KEY-123' },
};

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0;
const ok = (name, fn) => Promise.resolve(fn()).then(() => { checks++; console.log('  PASS', name); });
const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage();
  await page.emulateTimezone('Australia/Hobart');
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(`console.error: ${m.text()}`); });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:4178')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ episodes: [], results: [] }) });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__seeded', '1'); }
    const RealDate = Date; const start = RealDate.now(); const base = RealDate.parse(fixed);
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(base + (RealDate.now() - start)); else super(...a); } static now() { return base + (RealDate.now() - start); } }
    window.Date = FakeDate;
    // capture downloads (bytes + file name) instead of saving them
    window.__dl = [];
    URL.revokeObjectURL = () => {};
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        const name = this.download;
        fetch(this.href).then((r) => r.arrayBuffer()).then((b) => window.__dl.push({ name, bytes: Array.from(new Uint8Array(b)) }));
        return;
      }
      return realClick.call(this);
    };
  }, STATE, FIXED_ISO);
  await page.goto('http://localhost:4178/', { waitUntil: 'networkidle0' });
  await wait(500);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(450); };
const text = (p) => p.evaluate(() => document.body.innerText);
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const clickText = (p, label, sel = 'button') => p.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => (e.getAttribute('aria-label') || e.textContent).trim().includes(t)); if (!el) throw new Error('no element: ' + t); el.click(); }, label, sel);
const openShow = async (p, name) => { await tab(p, 'Shows'); await clickText(p, name, 'button.sd-ltile'); await wait(500); };
const menuAction = async (p, label) => { await clickText(p, 'More actions'); await wait(300); await clickText(p, label); await wait(400); };
const back = async (p) => { await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || x.textContent)); if (b) b.click(); }); await wait(400); };
// The Shows "Status" menu (a chip next to the filter box: a sheet on a phone, a popover on desktop).
const openStatus = async (p) => { await p.evaluate(() => document.querySelector('.sd-lbar-top .sd-chipbtn').click()); await wait(300); };
const closeMenu = async (p) => { if (await p.evaluate(() => !!document.querySelector('[role=listbox][aria-label=Status]'))) { await p.keyboard.press('Escape'); await wait(300); } };
// ["All 5", "Watching 2", …] as listed in the menu
const tabsText = async (p) => {
  await openStatus(p);
  const list = await p.evaluate(() => [...document.querySelectorAll('[role=listbox][aria-label=Status] [role=option]')].map((o) => `${(o.querySelector('.lab') || o.firstElementChild).textContent.trim()} ${o.querySelector('.n').textContent.trim()}`));
  await closeMenu(p); return list;
};
const pickStatus = async (p, label) => {
  await openStatus(p);
  await p.evaluate((l) => { const o = [...document.querySelectorAll('[role=listbox][aria-label=Status] [role=option]')].find((x) => (x.querySelector('.lab') || x.firstElementChild).textContent.trim() === l); if (!o) throw new Error('no status ' + l); o.click(); }, label);
  await wait(250); await closeMenu(p);
};
const statusChip = (p) => p.evaluate(() => document.querySelector('.sd-lbar-top .sd-chipbtn').textContent.replace(/\s+/g, ' ').trim());

// RFC 4180 reader for the exported files
function parseCsv(buf) {
  assert.deepEqual([...buf.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM');
  const s = Buffer.from(buf.slice(3)).toString('utf8');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && s[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  assert.equal(cell + row.length, '0', 'file ends with a line break');
  return rows;
}

// ===================================================== 1. before dropping
console.log('1. starting point (Fri 2 Oct, 08:00 Hobart)');
let p = await open();
let t = await text(p);
await ok('Up Next lists Bravo (continue) and Alpha is on the way', () => { assert.match(t, /Bravo Binge/); assert.match(t, /Alpha Airing/); });
await tab(p, 'Shows');
await ok('no Dropped choice while nothing is dropped; counts add up', async () => {
  const tabs = await tabsText(p); assert.equal(tabs.some((x) => x.startsWith('Dropped')), false, tabs.join('|'));
  const n = (l) => +tabs.find((x) => x.startsWith(l)).match(/(\d+)$/)[1];
  assert.equal(n('All'), n('Watching') + n('Finished') + n('Not started'));
});
await tab(p, 'Stats');
const epsBefore = await p.evaluate(() => (document.body.innerText.match(/([\d,]+)\s*\n\s*(?:total\s*)?episodes/i) || [])[1] || '');

// ===================================================== 2. drop Bravo from the show page
console.log('2. drop a show');
await openShow(p, 'Bravo Binge');
await menuAction(p, 'Drop this show');
await ok('show page shows the Dropped pill; store has dropped:true + a date, history untouched', async () => {
  assert.equal(await p.evaluate(() => !!document.querySelector('[data-testid=dropped-pill]')), true);
  const s = (await stored(p)).shows['tmdb:2'];
  assert.equal(s.dropped, true); assert.match(s.droppedAt, /^\d{4}-\d\d-\d\dT/); assert.equal(Object.keys(s.watched).length, 3); assert.ok(s.notes['1x1']);
  assert.equal(s.followed, true, 'still in the library');
});
await p.screenshot({ path: `${OUT}/showpage_dropped.png` });
await back(p);
await tab(p, 'Up Next');
await ok('Bravo has left Up Next; Alpha is still there', async () => { t = await text(p); assert.doesNotMatch(t, /Bravo Binge/); assert.match(t, /Alpha Airing/); });
await tab(p, 'Shows');
await ok('Dropped appears in the Status menu with 1; Watching/Finished/Not started shrink so all still add up', async () => {
  const tabs = await tabsText(p); assert.ok(tabs.some((x) => /^Dropped\s*1$/.test(x)), tabs.join('|'));
  const n = (l) => +tabs.find((x) => x.startsWith(l)).match(/(\d+)$/)[1];
  assert.equal(n('All'), n('Watching') + n('Finished') + n('Not started') + n('Dropped'));
});
// The old row of five status tabs ran out of room once Dropped appeared and hid "All". The Status
// menu must fit at any phone width, and from Dropped you can always get back to All.
const barFits = (pg) => pg.evaluate(() => {
  const chips = [...document.querySelectorAll('.sd-lbar .sd-chipbtn')];
  const clipped = chips.filter((c) => { const e = c.querySelector('.ell'); return e && e.scrollWidth > e.clientWidth + 1; }).map((c) => c.textContent);
  const out = chips.filter((c) => c.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).map((c) => c.textContent);
  return { clipped, out, pageScrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth };
});
await pickStatus(p, 'Dropped');
for (const w of [390, 360, 320]) {
  await p.setViewport({ width: w, height: 844, deviceScaleFactor: 2 }); await wait(300);
  const f = await barFits(p);
  await ok(`${w}px with Dropped chosen: the toolbar fits (no clipped chip labels, nothing off-screen) and the menu still offers All`, async () => {
    assert.deepEqual(f.clipped, []); assert.deepEqual(f.out, []); assert.equal(f.pageScrolls, false);
    assert.equal(await statusChip(p), 'Dropped 1');
    assert.deepEqual((await tabsText(p)).map((x) => x.split(' ')[0]), ['All', 'Watching', 'Finished', 'Not', 'Dropped']);
  });
  if (w === 320) await p.screenshot({ path: `${OUT}/status_320.png` });
}
await pickStatus(p, 'All');
await ok('choosing All again from the menu shows everything and the chip goes back to "Status"', async () => {
  assert.equal(await statusChip(p), 'Status'); assert.ok((await p.evaluate(() => document.querySelectorAll('button.sd-ltile').length)) > 1);
});
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await wait(300);
await pickStatus(p, 'Dropped');
await ok('Dropped lists only Bravo, tile says "Dropped · 3 eps"', async () => {
  const tiles = await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].map((b) => b.innerText.replace(/\s+/g, ' ')));
  assert.equal(tiles.length, 1); assert.match(tiles[0], /Bravo Binge/); assert.match(tiles[0], /Dropped · 3 eps/);
});
await p.screenshot({ path: `${OUT}/shows_dropped_tab_phone.png` });

// ===================================================== 3. stats
console.log('3. stats');
await tab(p, 'Stats');
await ok('episode total unchanged (dropped episodes still count)', async () => {
  const after = await p.evaluate(() => (document.body.innerText.match(/([\d,]+)\s*\n\s*(?:total\s*)?episodes/i) || [])[1] || '');
  assert.match(epsBefore, /^\d[\d,]*$/, 'could not read the episode total: ' + JSON.stringify(epsBefore));
  assert.equal(after, epsBefore, `${epsBefore} -> ${after}`);
});
await clickText(p, 'Breakdown', '[role=tab]'); await wait(500);
await ok('Library completion has a Dropped row (1) and Bravo is not in Watching', async () => {
  const tx = await p.evaluate(() => { const s = [...document.querySelectorAll('section')].find((x) => /Library completion/i.test(x.innerText)); return s ? s.innerText : ''; });
  assert.match(tx, /Dropped\s*\n?\s*1\b/); assert.match(tx, /Watching\s*\n?\s*2\b/); // Alpha + the Japanese show; Bravo moved out
});
await p.screenshot({ path: `${OUT}/stats_breakdown.png`, fullPage: true });

// ===================================================== 4. resume
console.log('4. resume');
await openShow(p, 'Bravo Binge');
await menuAction(p, 'Resume watching');
await ok('pill gone; store has dropped:false and droppedAt:null (explicit, so sync can carry it)', async () => {
  assert.equal(await p.evaluate(() => !!document.querySelector('[data-testid=dropped-pill]')), false);
  const s = (await stored(p)).shows['tmdb:2']; assert.strictEqual(s.dropped, false); assert.strictEqual(s.droppedAt, null);
});
await back(p); await tab(p, 'Up Next');
await ok('Bravo is back in Up Next', async () => assert.match(await text(p), /Bravo Binge/));
await tab(p, 'Shows');
await ok('Dropped leaves the Status menu again (count 0)', async () => assert.equal((await tabsText(p)).some((x) => x.startsWith('Dropped')), false));

// ===================================================== 5. survives a reload; deleting the only dropped show while on that tab
console.log('5. persistence');
await openShow(p, 'Bravo Binge'); await menuAction(p, 'Drop this show'); await back(p);
await p.reload({ waitUntil: 'networkidle0' }); await wait(500);
await tab(p, 'Shows');
await ok('still dropped after a reload', async () => assert.ok((await tabsText(p)).some((x) => /^Dropped\s*1$/.test(x))));
await pickStatus(p, 'Dropped');
await clickText(p, 'Bravo Binge', 'button.sd-ltile'); await wait(500);
await p.evaluate(() => { if (!document.querySelector('[data-testid=dropped-pill]')) throw new Error('not on the show page'); });
await menuAction(p, 'Resume watching'); await back(p);
await ok('resuming the last dropped show from Dropped lands on All, with no empty Dropped choice left', async () => {
  const tx = await text(p); assert.doesNotMatch(tx, /Application error|Something went wrong/i);
  const tabs = await tabsText(p); assert.ok(tabs.length >= 4, tabs.join('|'));
  // leaving the show page resets the list to All, so there is no empty Dropped view to be stranded on
  assert.equal(await statusChip(p), 'Status'); assert.equal(tabs.some((x) => x.startsWith('Dropped')), false);
});
// leave Bravo dropped for the export check
await openShow(p, 'Bravo Binge'); await menuAction(p, 'Drop this show'); await back(p);

// ===================================================== 6. CSV
console.log('6. CSV export');
await tab(p, 'Settings');
await ok('Export for Power BI card exists with three buttons', async () => { const tx = await text(p); assert.match(tx, /Export for Power BI/i); for (const b of ['Episodes', 'Shows', 'Movies']) assert.ok(await p.evaluate((l) => [...document.querySelectorAll('button.sd-setbtn')].some((x) => x.textContent.trim() === l), b), b); });
await p.screenshot({ path: `${OUT}/settings_csv_card.png`, fullPage: true });
for (const k of ['Episodes', 'Shows', 'Movies']) { await p.evaluate((l) => [...document.querySelectorAll('button.sd-setbtn')].find((x) => x.textContent.trim() === l).click(), k); await wait(500); }
const dls = await p.evaluate(() => window.__dl);
const files = Object.fromEntries(dls.map((d) => [d.name.split('-')[1], { name: d.name, rows: parseCsv(Buffer.from(d.bytes)) }]));
await ok('three files with the expected names (dated 2026-10-02, the LOCAL date)', () => {
  assert.deepEqual(Object.keys(files).sort(), ['episodes', 'movies', 'shows']);
  for (const f of Object.values(files)) assert.match(f.name, /^watchnext-(episodes|shows|movies)-2026-10-02\.csv$/);
});
await ok('every row has as many cells as the header (quotes/newlines/commas survive a real parse)', () => { for (const f of Object.values(files)) for (const r of f.rows) assert.equal(r.length, f.rows[0].length); });
const E = files.episodes.rows, hdr = E[0], col = (r, h) => r[hdr.indexOf(h)];
await ok('episodes: 4+3+3+2 = 12 rows; the Japanese title with a comma and the newline note come back exactly', () => {
  assert.equal(E.length - 1, 12);
  assert.ok(E.slice(1).some((r) => col(r, 'show_name') === '鋼の錬金術師, Part 1'));
  const noted = E.slice(1).find((r) => col(r, 'note'));
  assert.equal(col(noted, 'note'), 'Great, "wow"\nsecond line'); assert.equal(col(noted, 'reaction'), 'Loved it'); assert.equal(col(noted, 'show_name'), 'Bravo Binge');
});
await ok('episodes: Bravo rows are flagged dropped; local date is Hobart (06:30 on 1 Oct, not 30 Sep)', () => {
  const bravo = E.slice(1).filter((r) => col(r, 'show_name') === 'Bravo Binge');
  assert.ok(bravo.length === 3 && bravo.every((r) => col(r, 'dropped') === 'true' && col(r, 'show_status') === 'Dropped'));
  const jp = E.slice(1).find((r) => col(r, 'show_name').startsWith('鋼'));
  assert.equal(col(jp, 'watched_at_utc'), '2026-09-30T20:30:00.000Z'); assert.equal(col(jp, 'watched_date_local'), '2026-10-01'); assert.equal(col(jp, 'watched_time_local'), '06:30');
});
const S = files.shows.rows, sh = S[0], scol = (r, h) => r[sh.indexOf(h)];
await ok('shows: 5 rows; formula-looking name is neutralised; Bravo Dropped with a date; progress %', () => {
  assert.equal(S.length - 1, 5);
  assert.ok(S.slice(1).some((r) => scol(r, 'name') === "'=Sneaky"));
  const b = S.slice(1).find((r) => scol(r, 'name') === 'Bravo Binge'); assert.equal(scol(b, 'status'), 'Dropped'); assert.match(scol(b, 'dropped_at_utc'), /^2026-/); assert.equal(scol(b, 'progress_pct'), '30');
  const c = S.slice(1).find((r) => scol(r, 'name') === 'Charlie Done'); assert.equal(scol(c, 'status'), 'Finished'); assert.equal(scol(c, 'progress_pct'), '100');
});
const M = files.movies.rows, mh = M[0], mcol = (r, h) => r[mh.indexOf(h)];
await ok('movies: the comma title, rating, local date and reaction', () => { assert.equal(M.length - 1, 1); assert.equal(mcol(M[1], 'name'), 'Film, With Comma'); assert.equal(mcol(M[1], 'rating'), '5'); assert.equal(mcol(M[1], 'watched_date_local'), '2026-05-06'); assert.equal(mcol(M[1], 'reaction'), 'Funny'); });
await ok('the TMDB key is in none of the files; banner reports the last export', async () => {
  for (const d of dls) assert.ok(!Buffer.from(d.bytes).toString('utf8').includes('SECRET-KEY-123'));
  assert.match(await text(p), /Saved 1 movie as a CSV file/);
});
// the JSON backup carries the flag
await p.evaluate(() => [...document.querySelectorAll('button.sd-setbtn')].find((x) => /Download backup/.test(x.textContent)).click()); await wait(500);
await ok('the JSON backup carries dropped:true for Bravo', async () => {
  const d = (await p.evaluate(() => window.__dl)).find((x) => x.name.endsWith('.json'));
  const j = JSON.parse(Buffer.from(d.bytes).toString('utf8')); assert.equal(j.shows['tmdb:2'].dropped, true); assert.equal(j.settings.tmdbKey, undefined);
});
await p.close();

// ===================================================== 7. desktop
console.log('7. desktop look');
p = await open({ w: 1280, h: 900 });
await openShow(p, 'Alpha Airing'); await menuAction(p, 'Drop this show'); await back(p);
await tab(p, 'Shows'); await pickStatus(p, 'Dropped'); await wait(200);
await ok('desktop: Status sits next to the filter box and the toolbar is one row', async () => {
  const r = await p.evaluate(() => ['.sd-lbar-top .sd-lfilter', '.sd-lbar-top .sd-chipbtn', '.sd-lbar-chips .sd-chipbtn'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top)));
  assert.equal(new Set(r).size, 1, JSON.stringify(r)); assert.equal(await statusChip(p), 'Dropped 1');
});
await p.screenshot({ path: `${OUT}/shows_dropped_desktop.png` });
await p.close();

console.log(`\n${checks} checks passed`);
console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
await browser.close(); server.close();
