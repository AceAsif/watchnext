import assert from 'node:assert/strict';
import * as G from '../../src/components/badgeArt.js';
import { BADGES } from '../../src/components/achievementsLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('shade: scales each channel, clamps, survives junk', () => {
  assert.equal(G.shade('#cd7f32', 1), 'rgb(205,127,50)');
  assert.equal(G.shade('#cd7f32', 0.5), 'rgb(103,64,25)');
  assert.equal(G.shade('#ffffff', 2), 'rgb(255,255,255)');
  assert.equal(G.shade('nope', 1), 'rgb(0,0,0)');
});
t('gemArt: six facets in the level colour, lit from the top left (top facet brightest)', () => {
  const a = G.gemArt('episodes', 3); // Gold
  assert.equal(a.facets.length, 6);
  assert.equal(a.facets[0].fill, 'rgb(245,197,24)');
  const lum = (rgb) => rgb.match(/\d+/g).map(Number).reduce((x, y) => x + y, 0);
  assert.ok(lum(a.facets[0].fill) > lum(a.facets[3].fill));
  assert.equal(a.ink, '#f5c518'); assert.equal(a.dashed, false);
  assert.deepEqual(a.icon, G.BADGE_ICONS.episodes);
});
t('gemArt: locked is a grey crest with a dashed edge and a grey icon', () => {
  const a = G.gemArt('movies', 0);
  assert.equal(a.dashed, true); assert.equal(a.ink, '#8b95a5');
  assert.deepEqual(a.facets.map((f) => f.fill), ['#1b212b', '#161b23', '#1b212b', '#161b23', '#1b212b', '#161b23']);
});
t('gemArt: every level has its own colour; odd levels and unknown ids are handled', () => {
  const inks = [1, 2, 3, 4, 5, 6].map((l) => G.gemArt('critic', l).ink);
  assert.equal(new Set(inks).size, 6);
  assert.equal(G.gemArt('critic', 99).ink, G.LEVEL_COLORS[6]);
  assert.equal(G.gemArt('critic', -3).dashed, true);
  assert.equal(G.gemArt('critic', 2.5).dashed, true);
  assert.deepEqual(G.gemArt('no-such-badge', 2).icon, G.FALLBACK_ICON);
});
t('every badge has an icon, and every icon belongs to a badge', () => {
  assert.deepEqual(Object.keys(G.BADGE_ICONS).sort(), BADGES.map((b) => b.id).sort());
  for (const [id, paths] of Object.entries(G.BADGE_ICONS)) assert.ok(paths.every((d) => /^M[\d.\- ]/.test(d)), id);
});
console.log(`\n${n} badge art tests passed`);
