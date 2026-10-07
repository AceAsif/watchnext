process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

const DIST = APP_DIST; const OUT = workPath('out_wd'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4184, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const SEASON = { episodes: Array.from({ length: 10 }, (_, i) => ({ episode_number: i + 1, name: 'Ep ' + (i + 1), runtime: 45, air_date: '2020-01-0' + ((i % 9) + 1) })) };

const ep = (at, n = 1) => ({ at, min: 45, n });
const mk = (id, name, o = {}) => ({ followed: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 45, genres: ['Drama'], name, tmdbId: id, totalEpisodes: 50, seasons: [{ n: 1, count: 10 }], watched: {}, ...o });
const BULK7 = '2026-07-07T03:00:00.000Z'; // 13:00 on Tue 7 Jul in Hobart
// Suits: 51 episodes spread over July days (never on the 7th); Dahmer S1 + Jake all stamped on 7 Jul, as in the screenshot
const suits = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`1x${i + 1}`, ep(`2026-07-${String(1 + ((i % 12) + (i % 12 >= 6 ? 1 : 0))).padStart(2, '0')}T0${i % 8}:10:00.000Z`)]));
const dahmer = { ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`1x${i + 1}`, ep(BULK7)])), ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`2x${i + 1}`, ep(`2026-09-1${i}T03:00:00.000Z`)])) };
const jake = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`1x${i + 1}`, ep(BULK7)]));
const STATE = { shows: {
  'tmdb:1': mk(1, 'Suits', { totalEpisodes: 100, seasons: [{ n: 1, count: 100 }], watched: suits }),
  'tmdb:2': mk(2, 'DAHMER', { totalEpisodes: 16, seasons: [{ n: 1, count: 10 }, { n: 2, count: 6 }], watched: dahmer }),
  'tmdb:3': mk(3, 'The Mind of Jake Paul', { totalEpisodes: 8, seasons: [{ n: 1, count: 8 }], watched: jake }),
  'tmdb:4': mk(4, 'Backfill Me', { totalEpisodes: 10, seasons: [{ n: 1, count: 10 }] }),
  'tmdb:5': mk(5, 'Fresh Show', { totalEpisodes: 10, seasons: [{ n: 1, count: 10 }] }),
  'tmdb:6': mk(6, 'Finale', { totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`1x${i + 1}`, ep('2026-09-20T10:00:00.000Z')])) }),
}, movies: [], settings: { tmdbKey: 'TESTKEY' } };
const FIXED_ISO = '2026-10-01T22:00:00.000Z'; // 08:00 on Fri 2 Oct 2026 in Hobart

const pad = (n) => String(n).padStart(2, '0');
const lym = (s) => { const d = new Date(s); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const lday = (s) => { const d = new Date(s); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function monthOf(state, ym) { // independent expectation
  let eps = 0; const per = {}; const days = {};
  for (const s of Object.values(state.shows)) for (const w of Object.values(s.watched || {})) if (lym(w.at) === ym) { eps += w.n; per[s.name] = (per[s.name] || 0) + w.n; days[lday(w.at)] = (days[lday(w.at)] || 0) + w.n; }
  return { eps, per, busiest: Math.max(0, ...Object.values(days)) };
}

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (u.startsWith('http://localhost:')) return r.continue(); if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss }); if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG }); if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(u.includes('/season/') ? SEASON : { episodes: [], results: [] }) }); return r.abort(); });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = RealDate.parse(fixed);
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE, FIXED_ISO);
  await page.goto('http://localhost:4184/', { waitUntil: 'networkidle0' }); await wait(500);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(450); };
const text = (p) => p.evaluate(() => document.body.innerText);
const stored = async (p) => (await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1'))));
const clickText = (p, label, sel = 'button') => p.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => (e.getAttribute('aria-label') || e.textContent).trim().includes(t)); if (!el) throw new Error('no element: ' + t); el.click(); }, label, sel);
const has = (p, sel) => p.evaluate((s) => !!document.querySelector(s), sel);
const openShow = async (p, name) => { await tab(p, 'Shows'); await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(250); await clickText(p, name, 'button.sd-ltile'); await wait(800); };
const back = async (p) => { await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || x.textContent)).click()); await wait(400); };
const toast = (p) => p.evaluate(() => { const t = document.querySelector('.sd-toast'); return t ? t.innerText.replace(/\s+/g, ' ').trim() : null; });
const setInput = (p, sel, v) => p.$eval(sel, (el, val) => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, v);
const dlg = (p) => p.evaluate(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; const btns = [...d.querySelectorAll('button')].map((b) => [b.textContent.trim(), b.disabled]); return { title: d.getAttribute('aria-label'), btns, text: d.innerText.replace(/\s+/g, ' '), hint: (d.querySelector('.sd-when-hint[role=status]') || {}).textContent || '' }; });
const btn = (d, label) => d.btns.find((b) => b[0] === label);
const monthCard = async (p, ym) => { await tab(p, 'Stats'); await setInput(p, '#mir-month', ym); await wait(350); return p.evaluate(() => { const c = document.querySelector('.a-mir .sd-yir'); return { text: c.innerText.replace(/\s+/g, ' '), eps: +c.querySelector('[data-stat=yir-episodes] .sd-yir-v').textContent.replace(/,/g, ''), tops: [...c.querySelectorAll('.sd-yir-show')].map((s) => [s.querySelector('.sd-yir-name').textContent, s.querySelector('.sd-yir-eps').textContent]) }; }); };

// ============================================================ 1. the bug, as in the screenshot
console.log('1. reproduce: logged-in-July shows dominate the July card');
let p = await open();
const E0 = monthOf(STATE, '2026-07');
let july = await monthCard(p, '2026-07');
await ok('July shows Suits 51, Dahmer 10, Mind of Jake Paul 8, busiest day 18 eps (matches your screenshot)', async () => {
  assert.deepEqual(july.tops, [['Suits', '51 eps'], ['DAHMER', '10 eps'], ['The Mind of Jake Paul', '8 eps']]); assert.equal(july.eps, E0.eps); assert.equal(E0.busiest, 18); assert.match(july.text, /Tue 7 Jul · 18 eps/);
});

// ============================================================ 2. Fix watch dates
console.log('2. Fix watch dates');
await openShow(p, 'DAHMER');
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'More actions').click()); await wait(350);
await ok('the show menu offers "Fix watch dates…" (only shows with watched episodes get it)', async () => assert.equal(await has(p, '[data-testid=fix-dates-row]'), true));
await p.evaluate(() => document.querySelector('[data-testid=fix-dates-row]').click()); await wait(400);
await ok('the sheet explains, lists the scopes (All / each season / the day they were marked together) and starts with Apply DISABLED', async () => {
  const d = await dlg(p); assert.equal(d.title, 'Fix watch dates'); assert.match(d.text, /Marking an episode stamps today’s date/); assert.match(d.text, /Currently dated between 7 Jul 2026 and 15 Sep 2026/);
  const opts = await p.evaluate(() => [...document.querySelectorAll('#fix-scope option')].map((o) => o.textContent)); assert.deepEqual(opts, ['All watched episodes (16)', 'Season 1 (10)', 'Season 2 (6)', 'Marked on 7 Jul 2026 (10)']);
  assert.equal(btn(d, 'Apply')[1], true);
});
await p.screenshot({ path: `${OUT}/fix_sheet_phone.png` });
await setInput(p, '#fix-scope', 's1');
await ok('a FUTURE date and a nonsense date are refused (message shown, Apply stays disabled); the date box stops at today', async () => {
  await setInput(p, '#fix-date', '2026-10-03'); let d = await dlg(p); assert.equal(btn(d, 'Apply')[1], true); assert.match(d.hint, /real date that is not in the future/);
  await setInput(p, '#fix-date', '1970-01-01'); d = await dlg(p); assert.equal(btn(d, 'Apply')[1], true);
  assert.equal(await p.$eval('#fix-date', (e) => e.max), '2026-10-02'); assert.equal(await p.$eval('#fix-date', (e) => e.min), '1980-01-01');
});
await setInput(p, '#fix-date', '2022-11-21');
await ok('a real past date enables Apply and previews exactly what will change', async () => { const d = await dlg(p); assert.equal(btn(d, 'Apply')[1], false); assert.match(d.hint, /^10 episodes will be dated 21 Nov 2022\.$/); });
await clickText(p, 'Cancel', '[role=dialog] button'); await wait(300);
await ok('Cancel changes nothing', async () => { const s = await stored(p); assert.equal(s.shows['tmdb:2'].watched['1x1'].at, BULK7); assert.ok(!('fixedAt' in s.shows['tmdb:2'].watched['1x1'])); });
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'More actions').click()); await wait(300);
await p.evaluate(() => document.querySelector('[data-testid=fix-dates-row]').click()); await wait(350);
await setInput(p, '#fix-scope', 's1'); await setInput(p, '#fix-date', '2022-11-21'); await clickText(p, 'Apply', '[role=dialog] button'); await wait(500);
await ok('Apply: ONLY season 1 is re-dated (noon local on that day), season 2 and everything else is untouched, n/minutes kept, toast with Undo', async () => {
  const s = (await stored(p)).shows['tmdb:2']; const want = new Date(2022, 10, 21, 12).toISOString();
  for (let i = 1; i <= 10; i++) { const w = s.watched[`1x${i}`]; assert.equal(w.at, want); assert.equal(w.n, 1); assert.equal(w.min, 45); assert.ok(w.fixedAt); }
  for (let i = 1; i <= 6; i++) assert.equal(s.watched[`2x${i}`].at, dahmer[`2x${i}`].at);
  assert.match(await toast(p), /^Updated 10 episodes to 21 Nov 2022\s*Undo$/); assert.equal(await has(p, '[role=dialog]'), false);
});
await p.screenshot({ path: `${OUT}/fix_toast_phone.png` });
await back(p);
await openShow(p, 'The Mind of Jake Paul');
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'More actions').click()); await wait(300);
await p.evaluate(() => document.querySelector('[data-testid=fix-dates-row]').click()); await wait(350);
await ok('a single-season, single-day show offers just "All watched episodes (8)" (no pointless duplicates)', async () => { const opts = await p.evaluate(() => [...document.querySelectorAll('#fix-scope option')].map((o) => o.textContent)); assert.deepEqual(opts, ['All watched episodes (8)']); });
await setInput(p, '#fix-date', '2018-03-02'); await clickText(p, 'Apply', '[role=dialog] button'); await wait(500);
await ok('Jake Paul re-dated to 2 Mar 2018', async () => { const s = (await stored(p)).shows['tmdb:3']; assert.ok(Object.values(s.watched).every((w) => w.at === new Date(2018, 2, 2, 12).toISOString())); assert.match(await toast(p), /Updated 8 episodes to 2 Mar 2018/); });
await back(p);
july = await monthCard(p, '2026-07'); const E1 = { suits: monthOf({ shows: { s: STATE.shows['tmdb:1'] } }, '2026-07') };
await ok('July is now CORRECT: only Suits (51 eps); the 18-episode "busiest day" is gone; the card total dropped by exactly 18', async () => {
  assert.deepEqual(july.tops, [['Suits', '51 eps']]); assert.equal(july.eps, E0.eps - 18); assert.equal(july.eps, E1.suits.eps); assert.doesNotMatch(july.text, /· 18 eps/);
});
await ok('the fixed shows now appear in the right periods: 2022 and 2018 exist in the Year picker, and November 2022 is a month', async () => {
  const years = await p.evaluate(() => [...document.querySelectorAll('#yir-year option')].map((o) => o.value)); assert.ok(years.includes('2022') && years.includes('2018'), years.join(','));
  const months = await p.evaluate(() => [...document.querySelectorAll('#mir-month option')].map((o) => o.value)); assert.ok(months.includes('2022-11') && months.includes('2018-03'));
  const nov = await monthCard(p, '2022-11'); assert.deepEqual(nov.tops, [['DAHMER', '10 eps']]); assert.equal(nov.eps, 10);
});
await p.screenshot({ path: `${OUT}/month_fixed_phone.png`, fullPage: false });

// ---- Undo (within the toast window)
await openShow(p, 'DAHMER');
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'More actions').click()); await wait(300);
await p.evaluate(() => document.querySelector('[data-testid=fix-dates-row]').click()); await wait(350);
await setInput(p, '#fix-scope', 's2'); await setInput(p, '#fix-date', '2024-01-05'); await clickText(p, 'Apply', '[role=dialog] button'); await wait(400);
await clickText(p, 'Undo', '.sd-toast button'); await wait(400);
await ok('Undo puts season 2 back exactly as it was and removes the toast', async () => {
  const s = (await stored(p)).shows['tmdb:2']; for (let i = 1; i <= 6; i++) assert.equal(s.watched[`2x${i}`].at, dahmer[`2x${i}`].at); assert.equal(await toast(p), null);
  assert.equal(s.watched['1x1'].at, new Date(2022, 10, 21, 12).toISOString(), 'the earlier fix of season 1 is still in place');
});
await back(p); await p.close();

// ============================================================ 3. "When did you watch this season?"
console.log('3. asking "when?" when marking a season');
p = await open();
await openShow(p, 'Backfill Me'); await wait(400);
await clickText(p, 'Mark season watched');
await wait(400);
await ok('tapping "Mark season watched" asks first; nothing is marked yet; "Just now" is the primary, focused choice', async () => {
  const d = await dlg(p); assert.equal(d.title, 'When did you watch it?'); assert.match(d.text, /Backfill Me · Season 1/); assert.deepEqual(d.btns.map((x) => x[0]).filter((x) => ['Just now', 'Use this date', 'Cancel'].includes(x)), ['Just now', 'Use this date', 'Cancel']);
  assert.ok(d.btns.some((b) => b[0] === 'Just now')); assert.equal(btn(d, 'Use this date')[1], true, 'disabled while the date is still today');
  assert.equal(Object.keys((await stored(p)).shows['tmdb:4'].watched).length, 0); assert.equal(await p.evaluate(() => document.activeElement.textContent.trim()), 'Just now');
});
await p.screenshot({ path: `${OUT}/when_sheet_phone.png` });
await ok('a future date is refused; the date box stops at today', async () => { await setInput(p, '#when-date', '2026-10-09'); const d = await dlg(p); assert.equal(btn(d, 'Use this date')[1], true); assert.match(d.hint, /real date/); assert.equal(await p.$eval('#when-date', (e) => e.max), '2026-10-02'); });
await clickText(p, 'Cancel', '[role=dialog] button'); await wait(300);
await ok('Cancel marks nothing', async () => { assert.equal(Object.keys((await stored(p)).shows['tmdb:4'].watched).length, 0); assert.equal(await has(p, '[role=dialog]'), false); });
await clickText(p, 'Mark season watched'); await wait(350); await setInput(p, '#when-date', '2022-03-03');
await ok('a past date enables "Use this date" and says what will happen', async () => { const d = await dlg(p); assert.equal(btn(d, 'Use this date')[1], false); assert.match(d.hint, /dated that day/); });
await clickText(p, 'Use this date', '[role=dialog] button'); await wait(500);
await ok('"Use this date": all 10 episodes are stamped noon on 3 Mar 2022 and flagged as hand-set; they are NOT counted in recent months', async () => {
  const s = (await stored(p)).shows['tmdb:4']; assert.equal(Object.keys(s.watched).length, 10); const want = new Date(2022, 2, 3, 12).toISOString();
  assert.ok(Object.values(s.watched).every((w) => w.at === want && w.fixedAt && w.n === 1 && w.min === 45)); assert.equal(await has(p, '[role=dialog]'), false);
});
await back(p);
await openShow(p, 'Fresh Show'); await wait(400); await clickText(p, 'Mark season watched'); await wait(350); await clickText(p, 'Just now', '[role=dialog] button'); await wait(500);
await ok('"Just now" behaves exactly as before: stamped now (2 Oct 2026), no hand-set flag', async () => {
  const s = (await stored(p)).shows['tmdb:5']; assert.equal(Object.keys(s.watched).length, 10); assert.ok(Object.values(s.watched).every((w) => lday(w.at) === '2026-10-02' && !('fixedAt' in w)));
});
await ok('"Unmark season" is immediate (no question)', async () => { await clickText(p, 'Unmark season'); await wait(400); assert.equal(await has(p, '[role=dialog]'), false); assert.equal(Object.keys((await stored(p)).shows['tmdb:5'].watched).length, 0); });
await back(p);
await openShow(p, 'Finale'); await wait(400); await clickText(p, 'Mark season watched'); await wait(350); await setInput(p, '#when-date', '2021-06-01'); await clickText(p, 'Use this date', '[role=dialog] button'); await wait(500);
await ok('completing an ended show through the dated question still offers the "You finished" prompt, and the show has the 2021 dates', async () => {
  assert.match(await toast(p), /You finished Finale!/); const s = (await stored(p)).shows['tmdb:6'];
  assert.equal(s.watched['1x1'].at, '2026-09-20T10:00:00.000Z', 'already-watched episodes keep their date'); assert.equal(s.watched['1x10'].at, new Date(2021, 5, 1, 12).toISOString());
});
await back(p); await tab(p, 'Stats');
await ok('Stats: the re-dated season shows up under 2022 (Year picker), not under 2026', async () => {
  const years = await p.evaluate(() => [...document.querySelectorAll('#yir-year option')].map((o) => o.value)); assert.ok(years.includes('2022') && years.includes('2021'), years.join(','));
});
await p.close();

// ============================================================ 4. desktop look
p = await open({ w: 1280, h: 900 });
await openShow(p, 'DAHMER');
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'More actions').click()); await wait(300);
await p.evaluate(() => document.querySelector('[data-testid=fix-dates-row]').click()); await wait(350);
await setInput(p, '#fix-date', '2023-06-14');
await p.screenshot({ path: `${OUT}/fix_sheet_desktop.png` });
await p.close();
console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
