import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set('watchnext-state-v1', JSON.stringify({ shows: { 'tmdb:1': { tmdbId: 1, name: 'American Gods', watched: { '1x1': { at: '2018-05-19T10:00:00Z', min: 55 } } } }, movies: [], settings: {} }));
const D = await import('../../src/store/db.js');
const F = await import('../../src/components/finishCardLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const show = () => D.getState().shows['tmdb:1'];

t('setShowRating keeps half stars and stamps ratedAt', () => {
  D.takeDirty(); D.setShowRating('tmdb:1', 4.5);
  assert.equal(show().rating, 4.5); assert.ok(show().ratedAt); assert.ok(D.takeDirty().showIds.has('tmdb:1'));
});
t('setShowRating cleans odd values: 3.3 -> 3.5, 0.2 -> 0.5, 9 -> 5, junk -> cleared', () => {
  D.setShowRating('tmdb:1', 3.3); assert.equal(show().rating, 3.5);
  D.setShowRating('tmdb:1', 0.2); assert.equal(show().rating, 0.5);
  D.setShowRating('tmdb:1', 9); assert.equal(show().rating, 5);
  D.setShowRating('tmdb:1', 'abc'); assert.equal(show().rating, 0);
});
t('0 clears the rating; whole stars still work as before', () => {
  D.setShowRating('tmdb:1', 4); assert.equal(show().rating, 4);
  D.setShowRating('tmdb:1', 0); assert.equal(show().rating, 0);
});
t('"You finished" card keeps the half star (it used to round 4.5 up to 5)', () => {
  assert.equal(F.finishFacts({ name: 'X', watched: { '1x1': { min: 40 } }, rating: 4.5 }, new Set()).rating, 4.5);
  assert.equal(F.finishFacts({ name: 'X', watched: {}, rating: 4 }, new Set()).rating, 4);
});
t('share text shows half stars: 4.5 -> ★★★★½, 3 -> ★★★☆☆, 0.5 -> ½☆☆☆☆', () => {
  assert.equal(F.starText(4.5), '★★★★½'); assert.equal(F.starText(3), '★★★☆☆'); assert.equal(F.starText(0.5), '½☆☆☆☆'); assert.equal(F.starText(5), '★★★★★');
  const line = F.finishShareLine({ name: 'American Gods', episodes: 26, hours: 24, days: null, rating: 3.5 });
  assert.match(line, /★★★½☆$/);
});
console.log(`\n${n} show half star tests passed`);
