import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const OUT = '/home/claude/shot/out9';
fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync('/home/claude/shot/fonts.css', 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const DIST = '/home/claude/wl/dist';
const server = http.createServer((req, r) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
await new Promise((r) => server.listen(4192, r));
const BASE = 'http://localhost:4192';
const FIXED_ISO = '2026-10-01T22:00:00.000Z'; // Fri 2 Oct 2026, 09:00 in Hobart
const CMD = 'python tools/convert_tvtime.py gdpr-data.zip -o tvtime_import.json';

const W = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`1x${i + 1}`, { at: '2026-03-01T10:00:00.000Z', min: 40, n: 1 }]));
const mk = (name, extra = {}) => ({ name, tmdbId: null, poster: null, watched: {}, ...extra });
const STATE = () => ({
  shows: {
    'tmdb:1': mk('Suits', { tmdbId: 1, followed: true, totalEpisodes: 10, watched: W(4) }),
    'tmdb:2': mk('Wishlist Show', { tmdbId: 2, watchlist: true }),
    'tmdb:3': mk('Beelzebub', { tmdbId: 3, followed: false, watched: W(60) }),
    'tmdb:4': mk('Black Jack (2004)', { tmdbId: 4, followed: false }),
    'tmdb:5': mk('Baki the Grappler', { tmdbId: 5, followed: false }),
  },
  movies: [{ name: 'Akira', tmdbId: 9, watchedAt: '2026-05-01T10:00:00.000Z', runtimeMin: 124 }],
  settings: { tmdbKey: '' },
});
const SECRET = 'abcDEF1234567890secretkey';

fs.mkdirSync('/home/claude/shot/tmp', { recursive: true });
const wf = (name, obj) => { const p = `/home/claude/shot/tmp/${name}`; fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj)); return p; };
const GOOD = wf('good.json', { source: 'tvtime', shows: [
  { tvdbId: 777001, name: 'Imported One', followed: true, watches: [{ season: 1, episode: 1, watchedAt: '2020-01-01T10:00:00Z', runtimeMin: 40, rewatch: false }, { season: 1, episode: 2, watchedAt: '2020-01-02T10:00:00Z', runtimeMin: 40, rewatch: false }, { season: 1, episode: 3, watchedAt: '2020-01-03T10:00:00Z', runtimeMin: 40, rewatch: false }] },
  { tvdbId: 777002, name: 'Imported Two', followed: true, watches: [{ season: 1, episode: 1, watchedAt: '2021-01-01T10:00:00Z', runtimeMin: 40, rewatch: false }, { season: 1, episode: 2, watchedAt: '2021-01-02T10:00:00Z', runtimeMin: 40, rewatch: false }] },
], movies: [] });
const BADJSON = wf('bad.json', '{ this is not json');
const WRONG = wf('wrong.json', { hello: 'world' });

function tmdb(r) {
  const u = new URL(r.url()); const p = u.pathname.replace('/3', ''); let m;
  const j = (b) => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if ((m = p.match(/^\/tv\/(\d+)\/season\/(\d+)$/))) return j({ episodes: Array.from({ length: 6 }, (_, i) => ({ id: 9000 + i, episode_number: i + 1, name: `Episode ${i + 1}`, air_date: `2020-01-0${i + 1}`, runtime: 40 })) });
  if ((m = p.match(/^\/tv\/(\d+)$/))) return j({ id: +m[1], name: 'Suits', number_of_episodes: 6, seasons: [{ season_number: 1, episode_count: 6 }], genres: [], status: 'Ended', episode_run_time: [40] });
  if ((m = p.match(/^\/movie\/(\d+)$/))) return j({ id: +m[1], title: 'Akira', runtime: 124, overview: 'Overview.', genres: [], release_date: '1988-07-16' });
  return j({ results: [], episodes: [], cast: [], crew: [] });
}
const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
const problems = [];
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
async function open({ w = 390, h = 844, state = STATE(), tab = 'Settings', tombs = null } = {}) {
  const page = await browser.newPage();
  await page.emulateTimezone('Australia/Hobart');
  await page.setViewport({ width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1 });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(`console.error: ${m.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(BASE)) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('api.themoviedb.org')) return tmdb(r);
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed, tombs) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); if (tombs) localStorage.setItem('watchnext-tombstones-v1', JSON.stringify(tombs)); sessionStorage.setItem('__seeded', '1'); }
    const RD = Date; const start = RD.now(); const b = RD.parse(fixed);
    class FD extends RD { constructor(...a) { if (a.length === 0) super(b + (RD.now() - start)); else super(...a); } static now() { return b + (RD.now() - start); } }
    window.Date = FD;
    // capture downloads instead of performing them
    const orig = URL.createObjectURL; URL.createObjectURL = (blob) => { window.__blob = blob; return orig.call(URL, blob); };
    HTMLAnchorElement.prototype.click = function () { window.__download = this.download; };
  }, state, FIXED_ISO, tombs);
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await wait(300);
  await page.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((b) => b.textContent.includes(t)).click(), tab);
  await wait(400);
  return page;
}
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const text = (p) => p.evaluate(() => document.body.innerText);
const shot = async (p, name, full = true) => { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log('  shot', name); };
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const click = (p, sel, label) => p.evaluate((s, l) => { const el = [...document.querySelectorAll(s)].find((e) => !l || e.textContent.trim().includes(l)); if (!el) throw new Error(`no ${s} "${l}"`); el.click(); }, sel, label);
const banner = (p) => p.evaluate(() => { const b = document.querySelector('.sd-banner'); return b ? { text: b.querySelector('.txt').textContent, role: b.getAttribute('role'), err: b.classList.contains('err') } : null; });
let checks = 0; const ok = (name, fn) => { fn(); checks++; console.log('  PASS', name); };



const WK = (k) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`1x${i + 1}`, { at: '2026-03-01T10:00:00.000Z', min: 40, n: 1 }]));
const NSTATE = () => ({
  shows: { 'tmdb:1000': mk('Suits', { tmdbId: 1000, followed: true, totalEpisodes: 6, seasons: [{ n: 1, count: 6 }], watched: WK(3), lastSynced: '2026-09-01T00:00:00.000Z' }) },
  movies: [{ name: 'Akira', tmdbId: 9, watchedAt: '2026-05-01T10:00:00.000Z', runtimeMin: 124, rating: 4 }, { name: 'Perfect Blue', tmdbId: 11, watchedAt: '2026-06-01T10:00:00.000Z', runtimeMin: 81 }],
  settings: { tmdbKey: 'TESTKEY' },
});
const openShow = async (p) => { await p.evaluate(() => [...document.querySelectorAll('.sd-ltile')].find((t) => t.textContent.includes('Suits')).click()); await wait(700); };
const hasUndef = (v) => JSON.stringify(v, (k, x) => (x === undefined ? '__U__' : x)).includes('__U__');
const noEmpty = (o) => !JSON.stringify(o).match(/:""/);
const clickEp = (p, code) => p.evaluate((c) => document.querySelector(`button[aria-label$="note for ${c}"]`).click(), code);
const ep = (p, code) => p.$(`button[aria-label$="note for ${code}"]`);

console.log('1. EPISODE ROWS (phone)');
let p = await open({ state: NSTATE(), tab: 'Shows' });
await openShow(p);
const rows = await p.evaluate(() => ({ btns: [...document.querySelectorAll('button[aria-label*="note for"]')].map((b) => [b.getAttribute('aria-label'), Math.round(b.getBoundingClientRect().height)]), count: document.querySelectorAll('.sd-ep').length }));
ok('the 3 WATCHED episodes have an "Add note" button; the 3 unwatched ones do not (no clutter)', () => assert.deepEqual(rows.btns.map((b) => b[0]), ['Add note for S1E1', 'Add note for S1E2', 'Add note for S1E3']));
ok('each note button is a 44px touch target', () => assert.ok(rows.btns.every((b) => b[1] >= 44), JSON.stringify(rows.btns)));
await shot(p, '01_episode_rows', false);
await clickEp(p, 'S1E2'); await wait(400);
let sh = await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return { label: d.getAttribute('aria-label'), sub: d.textContent.includes('Episode 2'), radios: [...d.querySelectorAll('[role=radio]')].map((r) => [r.textContent.trim(), r.getAttribute('aria-checked')]), group: d.querySelector('[role=radiogroup]').getAttribute('aria-label'), save: d.querySelector('.sd-setbtn.primary').disabled, remove: [...d.querySelectorAll('.sd-setbtn')].some((b) => b.textContent === 'Remove'), max: d.querySelector('textarea').maxLength, count: d.querySelector('.sd-notecount').textContent, sheetBottom: Math.round(d.getBoundingClientRect().bottom), vh: innerHeight, cols: new Set([...d.querySelectorAll('[role=radio]')].map((r) => Math.round(r.getBoundingClientRect().left))).size, h: [...d.querySelectorAll('[role=radio]')].every((r) => r.getBoundingClientRect().height >= 44) }; });
ok('the note sheet opens for S1E2 (episode name as subtitle), as a bottom sheet', () => { assert.equal(sh.label, 'S1E2'); assert.ok(sh.sub); assert.ok(Math.abs(sh.sheetBottom - sh.vh) <= 2); });
ok('six reactions in a radio group, none chosen; Save disabled; no Remove (nothing saved yet); box capped at 280 with a 0/280 counter', () => { assert.deepEqual(sh.radios.map((r) => r[0]), ['😍Loved it', '😂Funny', '😱Shocked', '😢Sad', '😡Angry', '😴Bored']); assert.ok(sh.radios.every((r) => r[1] === 'false')); assert.equal(sh.group, 'Your reaction'); assert.equal(sh.save, true); assert.equal(sh.remove, false); assert.equal(sh.max, 280); assert.equal(sh.count, '0/280'); });
ok('reactions are 3 columns of 44px+ targets', () => { assert.equal(sh.cols, 3); assert.ok(sh.h); });
await shot(p, '02_note_sheet_empty', false);
await p.evaluate(() => [...document.querySelectorAll('[role=radio]')].find((r) => r.textContent.includes('Funny')).click());
const sv = await p.evaluate(() => document.querySelector('.sd-setbtn.primary').disabled);
ok('choosing a reaction alone is enough to enable Save', () => assert.equal(sv, false));
await p.click('textarea'); await p.keyboard.type('Great twist at the end', { delay: 2 }); await wait(100);
const cnt = await p.evaluate(() => document.querySelector('.sd-notecount').textContent);
ok('the counter follows what you type', () => assert.equal(cnt, '22/280'));
await p.evaluate(() => { const t = document.querySelector('textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'x'.repeat(400)); t.dispatchEvent(new Event('input', { bubbles: true })); });
const capped = await p.evaluate(() => ({ len: document.querySelector('textarea').value.length, near: document.querySelector('.sd-notecount').classList.contains('near') }));
ok('even 400 characters arriving by any route are held to exactly 280, the counter reads 280/280 and warns (amber)', () => { assert.equal(capped.len, 280); assert.equal(capped.near, true); });
await p.evaluate(() => { const t = document.querySelector('textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'Great twist at the end'); t.dispatchEvent(new Event('input', { bubbles: true })); });
await click(p, '.sd-setbtn.primary', 'Save note'); await wait(400);
let st = await stored(p); let nt = st.shows['tmdb:1000'].notes;
ok('Save stores {react, text, at} under notes["1x2"] — and nothing else changed', () => { assert.deepEqual(Object.keys(nt), ['1x2']); assert.equal(nt['1x2'].react, 'funny'); assert.equal(nt['1x2'].text, 'Great twist at the end'); assert.match(nt['1x2'].at, /^2026-10-0[12]T/); assert.equal(Object.keys(st.shows['tmdb:1000'].watched).length, 3); });
const after = await p.evaluate(() => ({ sheet: !!document.querySelector('[role=dialog]'), label: [...document.querySelectorAll('button[aria-label*="note for"]')].map((b) => [b.getAttribute('aria-label'), b.textContent.trim()]) }));
assert.equal(after.sheet, false); assert.deepEqual(after.label[1], ['Edit note for S1E2', '😂']); checks++; console.log('  PASS sheet closed, marker shows 😂 on E2 only');
await shot(p, '03_row_with_reaction', false);

console.log('2. EDIT, CANCEL, TOGGLE, KEYBOARD, REMOVE');
await clickEp(p, 'S1E2'); await wait(350);
let re = await p.evaluate(() => ({ checked: [...document.querySelectorAll('[role=radio]')].find((r) => r.getAttribute('aria-checked') === 'true').textContent.trim(), text: document.querySelector('textarea').value, save: document.querySelector('.sd-setbtn.primary').disabled, remove: [...document.querySelectorAll('.sd-setbtn')].some((b) => b.textContent === 'Remove') }));
ok('reopening shows what you saved; Save is disabled until you change something; Remove is offered', () => assert.deepEqual(re, { checked: '😂Funny', text: 'Great twist at the end', save: true, remove: true }));
await p.focus('[role=radio][aria-checked=true]'); await p.keyboard.press('ArrowRight'); await wait(120);
let kb = await p.evaluate(() => ({ on: [...document.querySelectorAll('[role=radio]')].find((r) => r.getAttribute('aria-checked') === 'true').textContent.trim(), focus: document.activeElement.textContent.trim() }));
ok('ArrowRight moves the reaction AND the focus (Funny -> Shocked)', () => assert.deepEqual(kb, { on: '😱Shocked', focus: '😱Shocked' }));
await p.evaluate(() => [...document.querySelectorAll('[role=radio]')].find((r) => r.textContent.includes('Shocked')).click()); await wait(100);
assert.equal(await p.evaluate(() => [...document.querySelectorAll('[role=radio]')].every((r) => r.getAttribute('aria-checked') === 'false')), true); checks++; console.log('  PASS tapping the chosen reaction clears it');
await p.click('button[aria-label="Close without saving"]'); await wait(300);
assert.equal((await stored(p)).shows['tmdb:1000'].notes['1x2'].react, 'funny'); checks++; console.log('  PASS × discards the unsaved change');
await clickEp(p, 'S1E2'); await wait(300); await p.keyboard.press('Escape'); await wait(250);
assert.equal(await p.evaluate(() => !document.querySelector('[role=dialog]')), true); checks++; console.log('  PASS Escape closes the sheet');
// text-only note on E1
await clickEp(p, 'S1E1'); await wait(300); await p.click('textarea'); await p.keyboard.type('Only words', { delay: 2 }); await click(p, '.sd-setbtn.primary', 'Save note'); await wait(300);
st = await stored(p); nt = st.shows['tmdb:1000'].notes;
ok('a text-only note stores no "react" key (no blank values)', () => { assert.equal(nt['1x1'].text, 'Only words'); assert.ok(!('react' in nt['1x1'])); assert.ok(noEmpty(nt)); assert.equal(hasUndef(st), false); });
const e1 = await p.evaluate(() => { const b = document.querySelector('button[aria-label="Edit note for S1E1"]'); return { hasEmoji: /\p{Extended_Pictographic}/u.test(b.textContent), hasSvg: !!b.querySelector('svg') }; });
ok('…and its marker is the amber speech bubble (no emoji)', () => assert.deepEqual(e1, { hasEmoji: false, hasSvg: true }));
// un-marking keeps the note
await p.evaluate(() => document.querySelector('button[aria-label="Mark S1E2 unwatched"]').click()); await wait(300);
st = await stored(p);
ok('UN-MARKING an episode does NOT delete its note (that is why notes live in their own map)', () => { assert.equal(st.shows['tmdb:1000'].watched['1x2'], undefined); assert.equal(st.shows['tmdb:1000'].notes['1x2'].react, 'funny'); });
assert.ok(await ep(p, 'S1E2')); checks++; console.log('  PASS note button still visible on the now-unwatched E2');
await p.evaluate(() => document.querySelector('button[aria-label="Mark S1E2 watched"]').click()); await wait(250);
// reload persists
await p.reload({ waitUntil: 'networkidle0' }); await wait(500);
await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((b) => b.textContent.includes('Shows')).click()); await wait(400); await openShow(p);
assert.ok(await ep(p, 'S1E2')); assert.equal((await stored(p)).shows['tmdb:1000'].notes['1x2'].text, 'Great twist at the end'); checks++; console.log('  PASS notes survive a page reload');
// remove
await clickEp(p, 'S1E2'); await wait(300); await click(p, '.sd-setbtn', 'Remove'); await wait(300);
st = await stored(p);
ok('Remove deletes just that episode\'s note; the other note stays', () => { assert.deepEqual(Object.keys(st.shows['tmdb:1000'].notes), ['1x1']); });
await clickEp(p, 'S1E1'); await wait(300); await click(p, '.sd-setbtn', 'Remove'); await wait(300);
st = await stored(p);
ok('removing the LAST note removes the whole "notes" property (never `notes: {}` or undefined)', () => { assert.ok(!('notes' in st.shows['tmdb:1000'])); assert.equal(hasUndef(st), false); });
assert.equal(await p.evaluate(() => [...document.querySelectorAll('button[aria-label*="note for"]')].every((b) => b.getAttribute('aria-label').startsWith('Add note'))), true); checks++; console.log('  PASS markers cleared');
await p.close();

console.log('3. MOVIES');
p = await open({ state: NSTATE(), tab: 'Movies' });
await p.evaluate(() => [...document.querySelectorAll('.sd-ltile')].find((t) => t.textContent.includes('Akira')).click()); await wait(600);
const lab = await p.evaluate(() => [...document.querySelectorAll('.sd-sheet .sd-lbl')].map((l) => l.textContent));
ok('the movie sheet has a "Your thoughts" section above "Where you watched it"', () => { const a = lab.indexOf('Your thoughts'), b = lab.indexOf('Where you watched it'); assert.ok(a >= 0 && b > a, JSON.stringify(lab)); });
await p.evaluate(() => [...document.querySelectorAll('.sd-sheet [role=radio]')].find((r) => r.textContent.includes('Shocked')).click());
await p.click('.sd-sheet textarea'); await p.keyboard.type('That ending!', { delay: 2 });
await click(p, '.sd-sheet .sd-setbtn.primary', 'Save thoughts'); await wait(350);
st = await stored(p); const ak = st.movies.find((m) => m.name === 'Akira');
ok('Save puts react + note on THAT watch entry and leaves rating/platform alone', () => { assert.equal(ak.react, 'shocked'); assert.equal(ak.note, 'That ending!'); assert.equal(ak.rating, 4); assert.equal(st.movies.find((m) => m.name === 'Perfect Blue').react, undefined); });
const lbl = await p.evaluate(() => document.querySelector('.sd-sheet .sd-noteacts .sd-setbtn.primary').textContent);
ok('the button confirms with "Saved"', () => assert.equal(lbl, 'Saved'));
await shot(p, '04_movie_thoughts', false);
await p.keyboard.press('Escape'); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('.sd-ltile')].find((t) => t.textContent.includes('Akira')).click()); await wait(500);
const back = await p.evaluate(() => ({ on: [...document.querySelectorAll('.sd-sheet [role=radio]')].find((r) => r.getAttribute('aria-checked') === 'true').textContent.trim(), text: document.querySelector('.sd-sheet textarea').value }));
ok('reopening the movie shows its saved reaction and note', () => assert.deepEqual(back, { on: '😱Shocked', text: 'That ending!' }));
await click(p, '.sd-sheet .sd-noteacts .sd-setbtn', 'Remove'); await wait(300);
const rm = await stored(p); const ak2 = rm.movies.find((m) => m.name === 'Akira');
ok('Remove clears the keys completely (no blank strings, no undefined) and the editor empties', () => { assert.ok(!('react' in ak2) && !('note' in ak2)); assert.equal(ak2.rating, 4); assert.equal(hasUndef(rm), false); });
assert.equal(await p.evaluate(() => document.querySelector('.sd-sheet textarea').value), ''); checks++; console.log('  PASS editor emptied after Remove');
await p.keyboard.press('Escape'); await p.close();

console.log('4. BACKUP ROUND TRIP carries notes');
const RT = NSTATE(); RT.shows['tmdb:1000'].notes = { '1x1': { react: 'love', text: 'First', at: '2026-04-01T00:00:00.000Z' }, '1x3': { text: 'Third', at: '2026-04-02T00:00:00.000Z' } }; RT.movies[0].react = 'sad'; RT.movies[0].note = 'Cried';
p = await open({ state: RT });
const orig = await stored(p);
await click(p, '.sd-setbtn', 'Download backup'); await wait(400);
const btxt = await p.evaluate(async () => (window.__blob ? await window.__blob.text() : null)); const bpath = wf('notes-backup.json', btxt);
ok('the backup file contains the episode notes and the movie note', () => { const j = JSON.parse(btxt); assert.equal(Object.keys(j.shows['tmdb:1000'].notes).length, 2); assert.equal(j.movies[0].note, 'Cried'); });
await p.click('.sd-setcard.danger .sd-setbtn'); await wait(300); await click(p, '.sd-confirm-acts button', 'Delete all data'); await wait(400);
const ri = await p.$('input[aria-label="Backup file to restore"]'); await ri.uploadFile(bpath); await wait(700);
st = await stored(p); const bn2 = await banner(p);
ok('after Delete all + Restore, every note is back exactly as it was', () => { assert.deepEqual(st.shows['tmdb:1000'].notes, orig.shows['tmdb:1000'].notes); assert.deepEqual(st.movies, orig.movies); });
ok('the banner counts them: "… 3 notes restored."', () => assert.match(bn2.text, /3 notes restored\./));
await p.close();

console.log('5. DESKTOP + sync-merge wiring');
p = await open({ state: NSTATE(), tab: 'Shows', w: 1280, h: 800 }); await openShow(p);
await clickEp(p, 'S1E1'); await wait(400);
const dk = await p.evaluate(() => { const d = document.querySelector('[role=dialog]').getBoundingClientRect(); return { centred: Math.abs((d.left + d.width / 2) - innerWidth / 2) < 3, floating: d.bottom < innerHeight - 20, w: Math.round(d.width) }; });
ok('desktop: a centred dialog (not a bottom sheet)', () => { assert.ok(dk.centred); assert.ok(dk.floating); });
assert.ok(await noOverflow(p)); checks++; console.log('  PASS no horizontal overflow');
await shot(p, '05_note_dialog_desktop', false); await p.keyboard.press('Escape'); await p.close();
const eng = fs.readFileSync('/home/claude/wl/src/store/cloudEngine.js', 'utf8');
ok('cloud sync merges notes as a union (source check: mergeNotes(local.notes, remote.notes) wired into the pull-merge)', () => { assert.match(eng, /import \{ mergeNotes \} from '\.\/notes\.js'/); assert.match(eng, /mergeNotes\(local\.notes, remote\.notes\)/); assert.match(eng, /else delete merged\.notes/); });

await browser.close(); server.close();
console.log(`\n${checks} checks passed`);
console.log('PROBLEMS:', problems.length ? '\n' + [...new Set(problems)].join('\n') : 'none');
