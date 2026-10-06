import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as Y from '/home/claude/wl/src/components/yearImageLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const base = () => ({ year: 2026, prevYear: 2025, episodes: 1234, hours: 800, movies: 12, activeDays: 150, epDelta: 12,
  topShows: [{ name: 'Naruto', count: 90, poster: '/a.jpg' }, { name: 'Bleach', count: 70, poster: null }, { name: 'One Piece', count: 60, poster: '/c.jpg' }],
  busiestMonth: { name: 'March' }, topGenre: 'Animation' });

t('canvas is Instagram 4:5', () => { assert.equal(Y.IMG_W, 1080); assert.equal(Y.IMG_H, 1350); assert.equal(Y.IMG_W / Y.IMG_H, 0.8); });

t('GLOWS match the .sd-yir gradient in ui.css (on-screen card == saved image)', () => {
  const css = fs.readFileSync('/home/claude/wl/src/components/ui.css', 'utf8');
  const block = css.slice(css.indexOf('.sd-yir {'), css.indexOf('}', css.indexOf('.sd-yir {')));
  const re = /radial-gradient\((\d+)% (\d+)% at (\d+)% (\d+)%, rgba\((\d+), (\d+), (\d+), ([\d.]+)\), transparent (\d+)%\)/g;
  const found = [...block.matchAll(re)];
  assert.equal(found.length, Y.GLOWS.length);
  found.forEach((m, i) => {
    const g = Y.GLOWS[i];
    assert.equal(+m[1] / 100, g.rx); assert.equal(+m[2] / 100, g.ry);
    assert.equal(+m[3] / 100, g.x); assert.equal(+m[4] / 100, g.y);
    assert.deepEqual([+m[5], +m[6], +m[7]], g.rgb); assert.equal(+m[8], g.alpha); assert.equal(+m[9] / 100, g.stop);
  });
});

t('palette matches the design tokens', () => {
  const css = fs.readFileSync('/home/claude/wl/src/styles.css', 'utf8');
  for (const [tok, key] of [['--bg-card', 'card'], ['--bg-raise', 'raise'], ['--line', 'line'], ['--text-dim', 'dim']]) {
    const m = new RegExp(tok + ':\\s*(#[0-9a-fA-F]{6})').exec(css); assert.ok(m, tok);
    assert.equal(m[1].toLowerCase(), Y.COLORS[key]);
  }
});

t('deltaLine: up teal-side, down is "fewer" (never red), null when no previous year', () => {
  assert.deepEqual(Y.deltaLine(base()), { up: true, text: '▲ 12% more episodes than 2025' });
  assert.deepEqual(Y.deltaLine({ ...base(), epDelta: -30 }), { up: false, text: '▼ 30% fewer episodes than 2025' });
  assert.equal(Y.deltaLine({ ...base(), epDelta: 0 }).up, true);
  assert.equal(Y.deltaLine({ ...base(), epDelta: null }), null);
});

t('statCells: formatted, NaN/undefined become 0, order matches the card', () => {
  assert.deepEqual(Y.statCells(base()).map((c) => c[1]), ['EPISODES', 'HOURS', 'MOVIES', 'DAYS']);
  assert.equal(Y.statCells(base())[0][0], (1234).toLocaleString());
  const z = Y.statCells({ episodes: NaN, hours: undefined, movies: 0, activeDays: 0 });
  assert.deepEqual(z.map((c) => c[0]), ['0', '0', '0', '0']);
});

t('factCells: only what exists', () => {
  assert.equal(Y.factCells(base()).length, 2);
  assert.deepEqual(Y.factCells({ ...base(), topGenre: '' }), [['BUSIEST MONTH', 'March']]);
  assert.deepEqual(Y.factCells({ ...base(), busiestMonth: null, topGenre: null }), []);
});

// fitText with a fake monospace-ish measure: 10px per code point (CJK = 20px)
const measure = (s) => Array.from(s).reduce((w, c) => w + (c.charCodeAt(0) > 0x2e80 ? 20 : 10), 0);
t('fitText: fits -> unchanged; too long -> ellipsis within width', () => {
  assert.equal(Y.fitText(measure, 'Naruto', 100), 'Naruto');
  const out = Y.fitText(measure, 'A very very long show title indeed', 100);
  assert.ok(out.endsWith('…')); assert.ok(measure(out) <= 100);
});
t('fitText: non-Latin and emoji are never split mid-character', () => {
  const jp = Y.fitText(measure, '鋼の錬金術師 FULLMETAL ALCHEMIST', 120);
  assert.ok(measure(jp) <= 120); assert.ok(jp.endsWith('…'));
  const em = Y.fitText(measure, '😀😀😀😀😀😀😀😀', 45); // each emoji is 1 code point = 2 UTF-16 units
  assert.ok(!/[\ud800-\udbff]…$/.test(em) && !/[\ud800-\udbff]$/.test(em.replace('…', '')));
  assert.equal(Array.from(em.replace('…', '')).every((c) => c === '😀'), true);
});
t('fitText: absurdly narrow width still returns something (no infinite loop), null-safe', () => {
  assert.equal(Y.fitText(measure, 'Hello', 1), 'H…');
  assert.equal(Y.fitText(measure, null, 50), '');
});

t('initialOf: first character, uppercase, Japanese ok, empty -> ?', () => {
  assert.equal(Y.initialOf('naruto'), 'N'); assert.equal(Y.initialOf('鋼の錬金術師'), '鋼');
  assert.equal(Y.initialOf('  '), '?'); assert.equal(Y.initialOf(undefined), '?');
  assert.equal(Y.initialOf('😀 fun'), '😀');
});

// Layout: content must always end above the footer rule, and sections collapse cleanly.
const variants = {
  full: base(),
  noPrevYear: { ...base(), epDelta: null },
  negative: { ...base(), epDelta: -45 },
  noMovies: { ...base(), movies: 0 },
  oneShow: { ...base(), topShows: [base().topShows[0]] },
  twoShows: { ...base(), topShows: base().topShows.slice(0, 2) },
  noShows: { ...base(), topShows: [] },
  noFacts: { ...base(), busiestMonth: null, topGenre: null },
  empty: { ...base(), episodes: 0, hours: 0, movies: 0, activeDays: 0, topShows: [], busiestMonth: null, topGenre: null, epDelta: null },
  manyShows: { ...base(), topShows: Array.from({ length: 12 }, (_, i) => ({ name: 'S' + i, count: 12 - i })) },
};
for (const [name, d] of Object.entries(variants)) {
  t(`layout "${name}": content ends above the footer and stays inside the canvas`, () => {
    const p = Y.planYearImage(d);
    assert.ok(p.bottom < p.footerRule - 24, `${name}: bottom ${p.bottom} vs footer rule ${p.footerRule}`);
    assert.ok(p.footerBase <= Y.IMG_H - Y.IMG_PAD + 1);
    assert.ok(p.shows.length <= 3);
    const ys = [p.labelY, p.yearBase, p.deltaY, p.statsValueY, p.statsLabelY, p.showsLabelY, p.gridTop, p.nameY, p.epsY, p.factsLabelY, p.factsValueY].filter((v) => v != null);
    assert.deepEqual([...ys].sort((a, b) => a - b), ys, 'sections must run top to bottom');
  });
}
t('layout: sections collapse (no delta / no shows / no facts leave no gap or nulls)', () => {
  assert.equal(Y.planYearImage(variants.noPrevYear).deltaY, null);
  assert.equal(Y.planYearImage(variants.noShows).showsLabelY, null);
  assert.equal(Y.planYearImage(variants.noShows).gridTop, null);
  assert.equal(Y.planYearImage(variants.noFacts).factsRule, null);
  assert.ok(Y.planYearImage(variants.noShows).bottom < Y.planYearImage(variants.full).bottom);
  assert.equal(Y.planYearImage(variants.manyShows).shows.length, 3);
});
t('layout: full-card content leaves a comfortable gap above the footer (>= 40px)', () => {
  const p = Y.planYearImage(variants.full); assert.ok(p.footerRule - p.bottom >= 40, String(p.footerRule - p.bottom));
});

t('poster grid: three 2:3 posters side by side, inside the margins, never overlapping', () => {
  const p = Y.planYearImage(base());
  const boxes = [0, 1, 2].map((i) => Y.posterBox(p, i));
  assert.equal(Math.abs(boxes[0].h - boxes[0].w * 1.5) < 1, true);
  assert.equal(boxes[0].x, Y.IMG_PAD);
  assert.ok(Math.abs(boxes[2].x + boxes[2].w - (Y.IMG_W - Y.IMG_PAD)) < 1, 'right edge on the margin');
  for (let i = 1; i < 3; i++) assert.ok(boxes[i].x >= boxes[i - 1].x + boxes[i - 1].w + 20);
  assert.ok(boxes.every((b) => b.y === p.gridTop && b.y + b.h < p.nameY));
  assert.ok(p.nameY < p.epsY && p.epsY < p.bottom);
});
t('posters are big (>= 280px wide) — the point of the old layout', () => assert.ok(Y.POSTER_W >= 280));

// ---- goal progress on the saved image
const FULL = { year: 2026, prevYear: 2025, epDelta: 12, episodes: 355, hours: 280, movies: 9, activeDays: 120, topShows: [{ name: 'A', count: 5 }, { name: 'B', count: 4 }, { name: 'C', count: 3 }], busiestMonth: { name: 'Jul' }, topGenre: 'Drama' };
const GOALS = { episodes: { target: 400, done: 355, pct: 89, met: false }, hours: { target: 500, done: 280, pct: 56, met: false }, movies: { target: 24, done: 30, pct: 125, met: true } };
t('goals: with a goal the plan gains a bar + text row under the stats, and the posters shrink and spread across the width', () => {
  const a = Y.planYearImage(FULL), b = Y.planYearImage({ ...FULL, goals: GOALS });
  assert.equal(a.goals, false); assert.equal(a.goalBarY, null); assert.equal(a.ph, Y.POSTER_H); assert.equal(b.goals, true);
  assert.ok(b.goalBarY > b.statsLabelY && b.goalTextY > b.goalBarY && b.gridTop > b.goalTextY, 'bar sits under the label, text under the bar, posters below');
  assert.ok(b.pw < Y.POSTER_W && b.ph < Y.POSTER_H && Math.abs(b.ph / b.pw - 1.5) < 0.01);
  const last = Y.posterBox(b, 2); assert.ok(Math.abs(last.x + last.w - (Y.IMG_W - Y.IMG_PAD)) < 0.5, 'the third poster ends at the right margin'); assert.ok(Y.posterBox(b, 1).x > Y.posterBox(b, 0).x + b.pw, 'a gap between posters');
});
t('goals: nothing ever runs into the footer, for every combination of delta / facts / posters', () => {
  for (const delta of [true, false]) for (const facts of [true, false]) for (const nShows of [0, 1, 2, 3]) {
    const d = { ...FULL, goals: GOALS, topShows: FULL.topShows.slice(0, nShows), ...(delta ? {} : { epDelta: null, prevYear: null }), ...(facts ? {} : { busiestMonth: null, topGenre: null }) };
    const p = Y.planYearImage(d); assert.ok(p.bottom < p.footerRule - 24, JSON.stringify({ delta, facts, nShows, bottom: p.bottom, rule: p.footerRule }));
    for (let i = 0; i < nShows; i++) { const bx = Y.posterBox(p, i); assert.ok(bx.x >= Y.IMG_PAD - 0.5 && bx.x + bx.w <= Y.IMG_W - Y.IMG_PAD + 0.5); }
  }
});
t('goals: a FULL card with goals still leaves at least 40px above the footer (same bar as without goals)', () => { const p = Y.planYearImage({ ...FULL, goals: GOALS }); assert.ok(p.footerRule - p.bottom >= 40, String(p.footerRule - p.bottom)); });
t('goals: an empty goals object or none means the old layout exactly', () => { for (const g of [undefined, null, {}]) { const p = Y.planYearImage({ ...FULL, goals: g }), q = Y.planYearImage(FULL); assert.deepEqual(p, q); } assert.equal(Y.hasCardGoals({ goals: {} }), false); assert.equal(Y.hasCardGoals({ goals: GOALS }), true); });
t('goals: each stat maps to its goal (Days has none)', () => { assert.deepEqual(Y.GOAL_FOR_STAT, { EPISODES: 'episodes', HOURS: 'hours', MOVIES: 'movies' }); assert.equal(Y.GOAL_FOR_STAT.DAYS, undefined); });
console.log(`\n${n} tests passed`);
