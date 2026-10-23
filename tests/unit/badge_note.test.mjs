import assert from 'node:assert/strict';
import { BADGES, badgeFor } from '../../src/components/achievementsLogic.js';
import { SEEN_KEY, loadSeen, saveSeen, libraryEmpty, checkBadges, mergeUps, noteText } from '../../src/components/badgeNoteLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
// Badges from a few numbers (everything else 0).
const badges = (vals = {}) => BADGES.map((d) => badgeFor(d, vals[d.id] || 0));
const mem = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

t('first time with a library: today\'s levels are saved quietly (no flood of notes)', () => {
  const r = checkBadges(null, badges({ episodes: 1200, movies: 60 }), false);
  assert.deepEqual(r.ups, []);
  assert.equal(r.seen.levels.episodes, 3); assert.equal(r.seen.levels.movies, 2); assert.equal(r.seen.levels.critic, 0);
});
t('first time with an EMPTY library: nothing is saved, so a synced or imported library starts quietly too', () => {
  assert.deepEqual(checkBadges(null, badges(), true), { ups: [], seen: null });
});
t('a new level gives a note and raises the saved level', () => {
  const seen = checkBadges(null, badges({ episodes: 999 }), false).seen;
  const r = checkBadges(seen, badges({ episodes: 1000 }), false);
  assert.deepEqual(r.ups.map((b) => [b.id, b.levelName]), [['episodes', 'Gold']]);
  assert.equal(r.seen.levels.episodes, 3);
});
t('no change: nothing to save, no note', () => {
  const seen = checkBadges(null, badges({ episodes: 999 }), false).seen;
  assert.deepEqual(checkBadges(seen, badges({ episodes: 999 }), false), { ups: [], seen: null });
});
t('levels never go down: losing a level and getting it back gives no second note', () => {
  let seen = checkBadges(null, badges({ critic: 50 }), false).seen;
  let r = checkBadges(seen, badges({ critic: 49 }), false);
  assert.deepEqual(r.ups, []); assert.equal(r.seen, null, 'the saved level stays at Silver');
  r = checkBadges(seen, badges({ critic: 50 }), false);
  assert.deepEqual(r.ups, []);
});
t('a jump of several levels (an import) is one note at the highest level', () => {
  const seen = checkBadges(null, badges({ movies: 5 }), false).seen;
  const r = checkBadges(seen, badges({ movies: 300 }), false);
  assert.equal(r.ups.length, 1); assert.equal(r.ups[0].levelName, 'Platinum');
});
t('several badges at once: highest level first', () => {
  const seen = checkBadges(null, badges({ episodes: 99, critic: 9, notes: 0 }), false).seen;
  const r = checkBadges(seen, badges({ episodes: 600, critic: 10, notes: 12 }), false);
  assert.deepEqual(r.ups.map((b) => b.id), ['episodes', 'notes', 'critic']);
});
t('a badge added in a later version starts quietly', () => {
  const seen = { v: 1, levels: { episodes: 1 } };
  const r = checkBadges(seen, badges({ episodes: 100, movies: 60 }), false);
  assert.deepEqual(r.ups, []); assert.equal(r.seen.levels.movies, 2);
});
t('mergeUps keeps one entry per badge, at its highest level', () => {
  const a = badges({ episodes: 500 }).filter((b) => b.id === 'episodes');
  const b = badges({ episodes: 1000, critic: 10 }).filter((x) => x.id === 'episodes' || x.id === 'critic');
  assert.deepEqual(mergeUps(a, b).map((x) => [x.id, x.level]), [['episodes', 3], ['critic', 1]]);
});
t('note text: one badge, several badges, and Legend', () => {
  const one = checkBadges({ v: 1, levels: Object.fromEntries(BADGES.map((d) => [d.id, 0])) }, badges({ episodes: 1000 }), false).ups;
  assert.deepEqual(noteText(one), { head: 'New badge!', line: 'Episode explorer · Gold', sub: '1,000 episodes' });
  const three = badges({ episodes: 1000, critic: 50, notes: 1 }).filter((b) => b.level);
  const sorted = mergeUps([], three);
  assert.deepEqual(noteText(sorted), { head: '3 new badge levels!', line: 'Episode explorer · Gold, Critic · Silver', sub: '+1 more' });
  assert.equal(noteText(badges({ streak: 100 }).filter((b) => b.level)).head, 'Legend badge!');
  assert.equal(noteText([]), null);
});
t('saved on this device; a broken record counts as none', () => {
  const s = mem();
  saveSeen(s, { v: 1, levels: { episodes: 2 } });
  assert.deepEqual(loadSeen(s), { v: 1, levels: { episodes: 2 } });
  s.setItem(SEEN_KEY, '{oops'); assert.equal(loadSeen(s), null);
  s.setItem(SEEN_KEY, JSON.stringify({ levels: { episodes: -3, __proto__: 1 } })); assert.deepEqual(loadSeen(s), { v: 1, levels: { episodes: 0 } });
});
t('libraryEmpty', () => {
  assert.equal(libraryEmpty({ shows: {}, movies: [] }), true);
  assert.equal(libraryEmpty({ shows: { a: {} }, movies: [] }), false);
  assert.equal(libraryEmpty({ shows: {}, movies: [{}] }), false);
});
console.log(`\n${n} badge note tests passed`);
