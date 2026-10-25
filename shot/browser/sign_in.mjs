process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Google sign-in that doesn't finish: closing the Google window gives a calm (not red) note that
// nothing changed; a blocked window / offline give clear red messages without "Firebase: Error (…)";
// a double tap says nothing; a good sign-in still signs in. Uses the fake-cloud build
// (.harness-work/dist-fake), started signed out, with Firebase-style errors.
const PORT = 4249;
const DIST = workPath('dist-fake'); const OUT = workPath('out_sign_in');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const CORS = { 'access-control-allow-origin': '*' };
const STATE = () => ({ shows: { 'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, watched: { '1x1': { at: '2026-10-01T10:00:00.000Z', min: 50 } }, seasons: [{ n: 1, count: 3 }] } }, movies: [], settings: { tmdbKey: 'TESTKEY' } });

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open(errorCode, { w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  page.on('dialog', (d) => { problems.push('native dialog: ' + d.message()); d.dismiss(); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: '{"results":[]}' });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, code) => {
    window.__fakeSignedOut = true; window.__signInError = code;
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.setItem('watchnext-badges-seen-v1', JSON.stringify({ v: 1, levels: {} })); sessionStorage.setItem('__s', '1'); }
  }, STATE(), errorCode);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(300);
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Settings')).click()); await wait(400);
  return page;
}
const signInBtn = (p) => p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Sign in with Google/.test(x.textContent)); return b ? b.textContent.trim() : null; });
const clickSignIn = async (p) => { await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Sign in with Google/.test(x.textContent)).click()); await wait(500); };
const banner = (p) => p.evaluate(() => { const b = document.querySelector('.sd-banner'); return b ? { text: b.querySelector('.txt').textContent, err: b.classList.contains('err'), role: b.getAttribute('role') } : null; });

console.log('A. CLOSING THE GOOGLE WINDOW');
let p = await open('auth/popup-closed-by-user');
await ok('signed out: Settings offers "Sign in with Google"', async () => { assert.ok(await signInBtn(p)); });
await clickSignIn(p);
await ok('a calm note (not red), in plain words, that nothing changed', async () => {
  const b = await banner(p);
  assert.equal(b.err, false); assert.equal(b.role, 'status');
  assert.match(b.text, /^Sign-in cancelled\. Nothing changed: your library stays on this device\. Tap “Sign in with Google” whenever you’re ready\.$/);
  assert.doesNotMatch(b.text, /Firebase|auth\/|failed/i);
});
await ok('the button is ready to try again, and the library is untouched', async () => {
  assert.ok(await signInBtn(p));
  assert.ok(await p.evaluate(() => !!JSON.parse(localStorage.getItem('watchnext-state-v1')).shows['tmdb:1']));
});
await p.evaluate(() => document.querySelector('.sd-banner').scrollIntoView({ block: 'center' })); await wait(200);
await p.screenshot({ path: path.join(OUT, 'cancelled_phone.png') });
await p.close();

console.log('B. OTHER PROBLEMS');
p = await open('auth/popup-blocked');
await clickSignIn(p);
await ok('blocked window: a red message saying to allow pop-ups', async () => {
  const b = await banner(p); assert.equal(b.err, true); assert.match(b.text, /blocked the Google sign-in window\. Allow pop-ups for this site/);
});
await p.close();
p = await open('auth/network-request-failed');
await clickSignIn(p);
await ok('offline: "you seem to be offline"', async () => { assert.match((await banner(p)).text, /you seem to be offline/); });
await p.close();
p = await open('auth/cancelled-popup-request');
await clickSignIn(p);
await ok('a double tap (window already open): no message at all', async () => { assert.equal(await banner(p), null); });
await p.close();
p = await open('auth/internal-error');
await clickSignIn(p);
await ok('anything else: short, no "Firebase: Error (…)"', async () => {
  const b = await banner(p); assert.equal(b.text, 'Sign-in didn’t work (internal error). Please try again. Nothing changed: your library stays on this device.');
});
await p.close();

console.log('C. A GOOD SIGN-IN');
p = await open('');
await clickSignIn(p);
await ok('no error: you are signed in, no message', async () => {
  assert.equal(await signInBtn(p), null); assert.equal(await banner(p), null);
  assert.match(await p.evaluate(() => document.body.innerText), /asif@example\.com/);
});
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
