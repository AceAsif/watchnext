import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const DIST = '/home/claude/wl/dist'; const OUT = '/home/claude/shot/out_ns'; fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync('/home/claude/shot/fonts.css', 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4182, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const W = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`1x${i + 1}`, { at: '2026-09-01T10:00:00.000Z', min: 40, n: 1 }]));
const nt = (react, text, at) => ({ ...(react ? { react } : {}), ...(text ? { text } : {}), ...(at ? { at } : {}) });
const mkShow = (id, name, notes, poster = null) => ({ followed: true, poster, status: 'Ended', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 40, genres: ['Drama'], name, tmdbId: id, totalEpisodes: 100, seasons: [{ n: 1, count: 100 }], watched: W(Math.max(3, Object.keys(notes).length)), notes });
// 70 notes on one show so the list needs "Show more" and a long scroll
const bigNotes = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`1x${i + 1}`, nt(i % 2 ? 'sad' : 'bored', `Binge note number ${i + 1}`, `2026-08-${String(1 + (i % 28)).padStart(2, '0')}T0${i % 9}:00:00.000Z`)]));
const MAIN = { shows: {
  'tmdb:1': mkShow(1, 'Suits', { '1x5': nt('love', 'Harvey’s best speech', '2026-09-03T10:00:00.000Z'), '2x10': nt('', 'Mike sold out?!', '2026-09-05T10:00:00.000Z'), '1x1': nt('funny', '', '2026-09-01T10:00:00.000Z') }, '/s.jpg'),
  'tmdb:2': mkShow(2, 'The Office', { '3x4': nt('funny', 'Dwight and the fire drill', '2026-09-02T10:00:00.000Z'), '1x2': nt('love', '', '2026-09-02T12:00:00.000Z'), '4x4': nt('bored', 'slow one', '') }),
  'tmdb:3': mkShow(3, 'Always Sunny', { '1x1': nt('love', '', '2026-07-01T10:00:00.000Z'), '1x2': nt('love', '', '2026-07-02T10:00:00.000Z'), '1x3': nt('funny', '', '2026-07-03T10:00:00.000Z') }),
  'tmdb:4': mkShow(4, 'Binge Show', bigNotes),
  'tmdb:5': mkShow(5, 'No Notes Here', {}),
}, movies: [
  { tmdbId: 9, name: 'Dune', status: 'watched', watchedAt: '2026-09-10T10:00:00.000Z', year: 2021, runtimeMin: 150, poster: null, react: 'love', note: 'That ending' },
  { tmdbId: 10, name: 'Planned', status: 'planned', react: 'love', note: 'not watched' },
], settings: { tmdbKey: 'TESTKEY' } };
delete MAIN.shows['tmdb:5'].notes;
const EMPTY = { shows: { 'tmdb:5': mkShow(5, 'No Notes Here', {}) }, movies: [], settings: { tmdbKey: 'TESTKEY' } }; delete EMPTY.shows['tmdb:5'].notes;

const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open(state, w = 390, h = 844) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (u.startsWith('http://localhost:')) return r.continue(); if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss }); if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG }); if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: '{"episodes":[],"results":[]}' }); return r.abort(); });
  await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); } }, state);
  await page.goto('http://localhost:4182/', { waitUntil: 'networkidle0' }); await wait(500);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(450); };
const text = (p) => p.evaluate(() => document.body.innerText);
const items = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-nitem')].map((i) => ({ name: i.querySelector('.name').textContent, meta: i.querySelector('.meta').textContent, txt: (i.querySelector('.txt') || {}).textContent || '', emo: (i.querySelector('.emo') || {}).textContent || '', isButton: i.tagName === 'BUTTON' })));
const typeQ = async (p, v) => { await p.evaluate(() => { const i = document.querySelector('input[aria-label="Search your notes"]'); i.focus(); }); await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control'); await p.keyboard.press('Backspace'); if (v) await p.keyboard.type(v); await wait(250); };
const chip = (p, label) => p.evaluate((l) => { const c = [...document.querySelectorAll('.sd-nchip')].find((x) => x.getAttribute('aria-label').startsWith(l)); if (!c) throw new Error('no chip ' + l); c.click(); }, label);
const chipInfo = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.sd-nchip')].map((c) => [c.getAttribute('aria-label').split(',')[0], { n: +c.querySelector('.n').textContent, on: c.getAttribute('aria-pressed') === 'true' }])));
const tabInfo = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.sd-lstatus [role=tab]')].map((t) => [t.firstChild.textContent.trim(), { n: +t.querySelector('.n').textContent, sel: t.getAttribute('aria-selected') === 'true' }])));
const count = (p) => p.evaluate(() => document.querySelector('.sd-ncount .sd-mono').textContent);

// ============================================================ phone
let p = await open(MAIN);
await tab(p, 'Stats');
await ok('Stats shows a "Notes" button with the number of entries (derived from the data)', async () => {
  const total = Object.values(MAIN.shows).reduce((a, s) => a + Object.keys(s.notes || {}).length, 0) + 1; // + Dune (the planned film doesn't count)
  const b = await p.evaluate(() => { const x = document.querySelector('.sd-notesbtn'); return x ? x.innerText.replace(/\s+/g, ' ').trim() : null; });
  assert.equal(b, `Notes ${total.toLocaleString()}`); assert.equal(total, 3 + 3 + 3 + 70 + 1);
});
await p.screenshot({ path: `${OUT}/stats_button_phone.png` });
await p.evaluate(() => document.querySelector('.sd-notesbtn').click()); await wait(500);
await ok('Notes page opens: title, summary line, search box, tabs, six reaction chips + Words only, newest first', async () => {
  const t = await text(p); assert.match(t, /Your notes/); assert.match(t, /80 entries · \d+ with a written note/);
  assert.equal((await p.evaluate(() => document.querySelectorAll('.sd-nchip').length)), 7);
  const first = (await items(p))[0]; assert.equal(first.name, 'Dune'); // 10 Sep is the newest dated entry
  assert.equal(await count(p), '80 of 80'); assert.equal((await items(p)).length, 50, 'first page = 50 rows');
});
await ok('movie rows are plain (not buttons); episode rows are buttons; planned film absent', async () => {
  const all = await items(p); assert.equal(all.find((i) => i.name === 'Dune').isButton, false); assert.ok(all.filter((i) => i.name !== 'Dune').every((i) => i.isButton)); assert.ok(!all.some((i) => i.name === 'Planned'));
  assert.deepEqual(all.find((i) => i.name === 'Dune').meta.split(' · ').slice(0, 2), ['Movie', '2021']); assert.equal(all.find((i) => i.name === 'Dune').emo, '😍'); assert.equal(all.find((i) => i.name === 'Dune').txt, 'That ending');
});
await ok('"Show more" adds the rest of the list', async () => {
  assert.match(await text(p), /Show 30 more/); await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Show 30 more/.test(b.textContent)).click()); await wait(300);
  assert.equal((await items(p)).length, 80); assert.doesNotMatch(await text(p), /Show \d+ more/);
});
await p.screenshot({ path: `${OUT}/notes_phone.png` });
await typeQ(p, 'fire drill');
await ok('search by note text finds the one episode, with its code, date and reaction', async () => {
  const r = await items(p); assert.equal(r.length, 1); assert.equal(r[0].name, 'The Office'); assert.match(r[0].meta, /^S3E4 · 2 Sep 2026$/); assert.equal(r[0].emo, '😂'); assert.equal(await count(p), '1 of 80');
  assert.match(await text(p), /Clear filters/i);
});
await typeQ(p, 's1e5'); await ok('search by episode code is exact: both S1E5 notes, and none of S1E50-S1E59', async () => { const r = await items(p); assert.deepEqual(r.map((i) => i.name), ['Suits', 'Binge Show']); assert.ok(r.every((i) => /^S1E5 ·/.test(i.meta))); });
await typeQ(p, 'suits'); await ok('search by show name; Words-only chip count reflects the query', async () => { assert.equal((await items(p)).length, 3); assert.equal((await chipInfo(p))['Words only'].n, 1); });
await typeQ(p, 'zzzz nothing'); await ok('no match: friendly message and Clear filters', async () => { assert.match(await text(p), /No notes match/); assert.equal((await items(p)).length, 0); });
await p.evaluate(() => [...document.querySelectorAll('.sd-ncount button')].find((b) => /Clear filters/i.test(b.textContent)).click()); await wait(300);
await ok('Clear filters resets search, chips and tab', async () => { assert.equal(await count(p), '80 of 80'); assert.equal(await p.evaluate(() => document.querySelector('input[aria-label="Search your notes"]').value), ''); });
await chip(p, 'Loved it'); await wait(250);
await ok('😍 chip: pressed, shows only 😍 entries, other chips keep sensible counts', async () => {
  const r = await items(p); assert.equal(r.length, 5); assert.ok(r.every((i) => i.emo === '😍')); const c = await chipInfo(p); assert.equal(c['Loved it'].on, true); assert.equal(c['Loved it'].n, 5);
  const exp = Object.values(MAIN.shows).flatMap((s) => Object.values(s.notes || {})).filter((n) => n.react === 'love').length + 1; assert.equal(r.length, exp);
});
await chip(p, 'Funny'); await wait(250);
await ok('two chips = OR (😍 or 😂)', async () => { const r = await items(p); assert.equal(r.length, 5 + 3); assert.ok(r.every((i) => ['😍', '😂'].includes(i.emo))); });
await chip(p, 'Loved it'); await chip(p, 'Funny'); await chip(p, 'Words only'); await wait(250);
await ok('"Words only" = a written note with no emoji', async () => { const r = await items(p); assert.ok(r.length > 0 && r.every((i) => i.emo === '' && i.txt)); assert.ok(r.some((i) => i.txt === 'Mike sold out?!')); });
await chip(p, 'Words only'); await wait(200);
await p.evaluate(() => [...document.querySelectorAll('.sd-lstatus [role=tab]')].find((t) => t.textContent.startsWith('Movies')).click()); await wait(250);
await ok('Movies tab: only the film; tab counts add up (All = Episodes + Movies)', async () => { const r = await items(p); assert.deepEqual(r.map((i) => i.name), ['Dune']); const t = await tabInfo(p); assert.equal(t.All.n, t.Episodes.n + t.Movies.n); assert.equal(t.Movies.sel, true); });
await p.evaluate(() => [...document.querySelectorAll('.sd-lstatus [role=tab]')].find((t) => t.textContent.startsWith('All')).click()); await wait(250);

// ---- open a show and come back: search, chips and scroll are remembered
await typeQ(p, 'binge note'); await chip(p, 'Sad'); await wait(300);
await p.evaluate(() => window.scrollTo(0, 1500)); await wait(250);
const y0 = await p.evaluate(() => window.scrollY);
await p.evaluate(() => document.querySelectorAll('button.sd-nitem')[12].click()); await wait(700);
await ok('tapping an episode opens that show', async () => { assert.match(await text(p), /Binge Show/); assert.equal(await p.evaluate(() => !!document.querySelector('.sd-nitem')), false); });
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || x.textContent)).click()); await wait(600);
await ok('Back returns to Notes with the SAME search, chip, list and scroll position', async () => {
  assert.equal(await p.evaluate(() => document.querySelector('input[aria-label="Search your notes"]').value), 'binge note');
  const c = await chipInfo(p); assert.equal(c['Sad'].on, true); assert.equal(c['Bored'].on, false);
  assert.ok((await items(p)).length > 12); const y1 = await p.evaluate(() => window.scrollY); assert.ok(Math.abs(y1 - y0) < 4, `scroll ${y0} -> ${y1}`);
});
await p.evaluate(() => [...document.querySelectorAll('.sd-back')][0].click()); await wait(450);
await ok('Back button on Notes returns to Stats', async () => { assert.ok(await p.evaluate(() => !!document.querySelector('.sd-notesbtn'))); assert.equal(await p.evaluate(() => !!document.querySelector('.sd-nitem')), false); });
await p.evaluate(() => document.querySelector('.sd-notesbtn').click()); await wait(400);
await ok('opening Notes again from Stats starts fresh (no old search)', async () => { assert.equal(await p.evaluate(() => document.querySelector('input[aria-label="Search your notes"]').value), ''); assert.equal(await count(p), '80 of 80'); });
await tab(p, 'Shows'); await tab(p, 'Stats');
await ok('bottom tabs leave Notes; coming back to Stats shows Stats, not Notes', async () => assert.equal(await p.evaluate(() => !!document.querySelector('.sd-nitem')), false));
await p.close();

// ============================================================ Most loved shows (Rankings)
p = await open(MAIN); await tab(p, 'Stats');
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.trim() === 'Rankings').click()); await wait(450);
await ok('Most loved shows: ranked by 😍×2 + 😂×1, with the counts shown', async () => {
  const rows = await p.evaluate(() => [...document.querySelectorAll('[aria-label="Most loved shows"] .sd-rated')].map((r) => [r.querySelector('.sd-rated-name').textContent, r.querySelector('.sd-loved').getAttribute('aria-label'), r.querySelector('.sd-loved').textContent]));
  const score = (n) => Object.values(n).reduce((a, x) => a + (x.react === 'love' ? 2 : x.react === 'funny' ? 1 : 0), 0);
  const exp = Object.values(MAIN.shows).map((s) => [s.name, score(s.notes || {}), Object.values(s.notes || {})]).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  assert.deepEqual(rows.map((r) => r[0]), exp.map((r) => r[0]));
  const as = rows.find((r) => r[0] === 'Always Sunny'); assert.equal(as[1], '2 loved it, 1 funny'); assert.equal(as[2], '😍 2😂 1'); assert.ok(!rows.some((r) => r[0] === 'Binge Show' || r[0] === 'No Notes Here'), 'sad/bored never count');
  assert.match(await text(p), /each 😍 counts 2, each 😂 counts 1/);
});
await p.evaluate(() => document.querySelector('[aria-label="Most loved shows"]').scrollIntoView({ block: 'center' })); await wait(250);
await p.screenshot({ path: `${OUT}/loved_phone.png` });
await p.close();

// ============================================================ empty + layouts
p = await open(EMPTY); await tab(p, 'Stats');
await ok('no notes at all: the Stats button has no number, and the page explains how to add some', async () => {
  assert.equal(await p.evaluate(() => document.querySelector('.sd-notesbtn').innerText.replace(/\s+/g, ' ').trim()), 'Notes');
  await p.evaluate(() => document.querySelector('.sd-notesbtn').click()); await wait(400); const t = await text(p); assert.match(t, /Nothing here yet/); assert.match(t, /0 entries/); assert.equal(await p.evaluate(() => !!document.querySelector('input[aria-label="Search your notes"]')), false);
});
await p.close();
p = await open(MAIN, 320, 700); await tab(p, 'Stats'); await p.evaluate(() => document.querySelector('.sd-notesbtn').click()); await wait(400);
await ok('320px wide: no sideways scroll on Notes or on the chip row', async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false));
await p.close();
p = await open(MAIN, 1280, 900); await tab(p, 'Stats');
await p.screenshot({ path: `${OUT}/stats_button_desktop.png` });
await p.evaluate(() => document.querySelector('.sd-notesbtn').click()); await wait(500);
await ok('desktop: two-column list, no sideways scroll', async () => {
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  const cols = await p.evaluate(() => new Set([...document.querySelectorAll('.sd-nlist > li')].slice(0, 6).map((l) => Math.round(l.getBoundingClientRect().left))).size); assert.equal(cols, 2);
});
await p.screenshot({ path: `${OUT}/notes_desktop.png` });
await p.close();
console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
