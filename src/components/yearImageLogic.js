// PURE layout/format decisions for the Year-in-Review saved image.
// No DOM, no canvas: everything here is unit-tested with plain node.
// The drawing itself lives in yearImageRender.js.

export const IMG_W = 1080;
export const IMG_H = 1350; // Instagram 4:5
export const IMG_PAD = 64;
export const IMG_URL = 'aceasif.github.io/watchnext';

export const COLORS = {
  card: '#171d28', // --bg-card
  raise: '#141922', // --bg-raise
  line: '#232a35', // --line
  text: '#e9ecf1',
  dim: '#8b95a5', // --text-dim
  amber: '#f2a33c',
  teal: '#56c8b5',
};

// The faint warm -> teal wash. MUST match `.sd-yir` in ui.css (a unit test
// reads the CSS and compares), so the on-screen card and the saved PNG look
// like the same object. `rx`/`ry` are the CSS ellipse radii as a fraction of
// the box; the colour fades out at `stop` of that radius.
export const GLOWS = [
  { x: 0, y: 0, rx: 1.2, ry: 0.9, stop: 0.55, rgb: [242, 163, 60], alpha: 0.12 }, // warm, top-left
  { x: 1, y: 1, rx: 1.2, ry: 0.9, stop: 0.55, rgb: [86, 200, 181], alpha: 0.1 }, // teal, bottom-right
];

// Largest prefix of `s` (plus an ellipsis) that fits `maxW`. `measure(str)`
// returns a pixel width. Works on code points, so it never splits a surrogate
// pair (emoji, rarer CJK) in half.
export function fitText(measure, s, maxW) {
  const str = String(s == null ? '' : s);
  if (measure(str) <= maxW) return str;
  const chars = Array.from(str);
  while (chars.length > 1 && measure(chars.join('') + '…') > maxW) chars.pop();
  return chars.join('') + '…';
}

// First visible character, used on the poster placeholder.
export function initialOf(name) {
  const c = Array.from(String(name || '').trim())[0];
  return c ? c.toLocaleUpperCase() : '?';
}

// "▲ 12% more episodes than 2025" — same wording as the on-screen card.
// Up is teal, down is dim (never red: a quieter year isn't an error).
export function deltaLine(data) {
  if (!data || data.epDelta == null) return null;
  const up = data.epDelta >= 0;
  return {
    up,
    text: `${up ? '▲' : '▼'} ${Math.abs(data.epDelta)}% ${up ? 'more' : 'fewer'} episodes than ${data.prevYear}`,
  };
}

const n = (v) => (Number.isFinite(v) ? v : 0);

export function statCells(data) {
  return [
    [n(data.episodes).toLocaleString(), 'EPISODES'],
    [n(data.hours).toLocaleString(), 'HOURS'],
    [n(data.movies).toLocaleString(), 'MOVIES'],
    [n(data.activeDays).toLocaleString(), 'DAYS'],
  ];
}

export function factCells(data) {
  if (Array.isArray(data.facts)) return data.facts.filter((c) => Array.isArray(c) && c[1]).slice(0, 2); // caller-supplied (Month in review)
  const f = [];
  if (data.busiestMonth && data.busiestMonth.name) f.push(['BUSIEST MONTH', data.busiestMonth.name]);
  if (data.topGenre) f.push(['TOP GENRE', data.topGenre]);
  return f;
}

// Top shows are three big posters across (like the original image), 2:3 each.
export const GRID = { cols: 3, gap: 28 };
export const POSTER_W = (IMG_W - 2 * IMG_PAD - (GRID.cols - 1) * GRID.gap) / GRID.cols; // ~298.7
export const POSTER_H = Math.round(POSTER_W * 1.5); // 448

// Box of poster `i` (0-based) given the plan's gridTop.
export function posterBox(plan, i) {
  return { x: IMG_PAD + i * (POSTER_W + GRID.gap), y: plan.gridTop, w: POSTER_W, h: POSTER_H };
}

// Vertical plan. Sections that have no data are skipped and everything below
// moves up; the footer is pinned to the bottom. Returns baselines/tops in px
// plus `bottom` (end of content) and `footerRule` so tests can prove nothing
// ever runs into the footer.
export function planYearImage(data) {
  const P = IMG_PAD;
  const delta = deltaLine(data);
  const shows = (data.topShows || []).slice(0, 3);
  const facts = factCells(data);

  let y = P;
  const labelY = y + 20;
  y = labelY + 34;
  const yearBase = y + 132;
  y = yearBase + 16;
  let deltaY = null;
  if (delta) { deltaY = y + 44; y = deltaY + 14; } // 10px more under the headline so a descender (the p in September) can't touch it
  const statsTop = y + (delta ? 26 : 36);
  const statsValueY = statsTop + 60;
  const statsLabelY = statsTop + 96;
  y = statsTop + 110;

  let showsLabelY = null, gridTop = null, nameY = null, epsY = null;
  if (shows.length) {
    showsLabelY = y + 48;
    gridTop = showsLabelY + 24;
    nameY = gridTop + POSTER_H + 40;
    epsY = nameY + 32;
    y = epsY + 8;
  }

  let factsRule = null, factsLabelY = null, factsValueY = null;
  if (facts.length) {
    factsRule = y + 36;
    factsLabelY = factsRule + 44;
    factsValueY = factsLabelY + 40;
    y = factsValueY + 10;
  }

  const footerBase = IMG_H - P;
  const footerRule = footerBase - 52;
  return {
    labelY, yearBase, deltaY, statsTop, statsValueY, statsLabelY,
    showsLabelY, gridTop, nameY, epsY, shows, factsRule, factsLabelY, factsValueY, facts,
    delta, footerBase, footerRule, bottom: y,
  };
}
