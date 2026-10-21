// Badge artwork: the "Gem hex" look (chosen in Claude Design, Oct 2026). PURE: no DOM.
//
// Each badge is a six-sided crest cut into light and dark facets like a gemstone, in its
// level colour, with a line icon on a dark disc in the middle. Locked badges are a dull grey
// crest with a dashed edge. BadgeIcon.jsx draws it from what gemArt() returns.
//
// Icons are 24×24 line drawings (stroke only), one or more SVG paths each.

export const LEVEL_COLORS = ['#5b6474', '#cd7f32', '#c4ccd6', '#f5c518', '#7fd1c7', '#8ab4ff', '#e879f9']; // locked, Bronze … Legend

const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const BADGE_ICONS = {
  episodes: ['M3 7h18v12H3z', 'M8 3l4 4 4-4'], // TV
  movies: ['M4 9h16v11H4z', 'M4 9l2-5h14l-2 5', 'M10 4l-2 5', 'M16 4l-2 5'], // clapperboard
  hours: ['M7 3h10', 'M7 21h10', 'M8 3c0 4 3 6 4 9 1-3 4-5 4-9', 'M8 21c0-4 3-6 4-9 1 3 4 5 4 9'], // hourglass
  finished: ['M5 21V4', 'M5 4h12l-2.5 4 2.5 4H5'], // flag
  anime: [circle(12, 6.5, 2.8), circle(16.8, 10, 2.8), circle(15, 15.6, 2.8), circle(9, 15.6, 2.8), circle(7.2, 10, 2.8), circle(12, 11.6, 1.3)], // blossom
  languages: ['M4 5h11v8H9l-3 3v-3H4z', 'M15 9h5v8h-2v3l-3-3h-4v-2'], // speech bubbles
  countries: [circle(12, 12, 9), 'M3 12h18', 'M12 3c3.5 3 3.5 15 0 18', 'M12 3c-3.5 3-3.5 15 0 18'], // globe
  genres: [circle(8, 7.5, 3.2), 'M13.5 13h7v7h-7z', 'M3.5 20l4.5-7 4.5 7z'], // shapes
  decades: ['M3 6h18v12H3z', circle(8.5, 11, 1.6), circle(15.5, 11, 1.6), 'M10 11h4', 'M7 18l2-3h6l2 3'], // cassette
  streak: ['M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z'], // flame
  rewatch: ['M4 11V9a3 3 0 0 1 3-3h12', 'M16 3l3 3-3 3', 'M20 13v2a3 3 0 0 1-3 3H5', 'M8 21l-3-3 3-3'], // repeat
  cinema: ['M6 9h12l-1.5 12h-9z', 'M10 9l.5 12', 'M14 9l-.5 12', 'M6.5 9a2.5 2.5 0 0 1 3.5-3.5 2.5 2.5 0 0 1 4 0 2.5 2.5 0 0 1 3.5 3.5'], // popcorn
  critic: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'], // star
  notes: ['M5 3h10l4 4v14H5z', 'M15 3v4h4', 'M9 11h6', 'M9 15h4'], // note
  collections: ['M4 4h4v16H4z', 'M10 4h4v16h-4z', 'M15 5l3.5-.9 3.2 14.9-3.5.9z'], // books
};
export const FALLBACK_ICON = BADGE_ICONS.critic;

// The crest, in an 84×92 box: six corners, and six facets (centre → corner → next corner).
export const HEX_POINTS = [[42, 4], [78, 25], [78, 67], [42, 88], [6, 67], [6, 25]];
export const HEX = HEX_POINTS.map((p) => p.join(',')).join(' ');
const FACET_PATHS = HEX_POINTS.map((p, i) => {
  const q = HEX_POINTS[(i + 1) % 6];
  return `M42 46L${p[0]} ${p[1]}L${q[0]} ${q[1]}z`;
});
// Light from the top left: the upper facets are brightest, the lower ones darkest.
const TONES = [1, 0.82, 0.62, 0.5, 0.66, 0.9];
const LOCKED_FACETS = ['#1b212b', '#161b23'];

// '#rrggbb' scaled by k (k < 1 darker), as 'rgb(r,g,b)'.
export function shade(hex, k) {
  const n = parseInt(String(hex).slice(1), 16);
  if (!Number.isFinite(n)) return 'rgb(0,0,0)';
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// Everything BadgeIcon needs for one badge at one level (0 = not earned yet … 6 = Legend).
// -> { facets: [{ d, fill }], edge, dashed, ink, icon: [path] }
export function gemArt(id, level) {
  const lv = Number.isInteger(level) ? Math.max(0, Math.min(6, level)) : 0;
  const color = LEVEL_COLORS[lv];
  const on = lv > 0;
  return {
    facets: FACET_PATHS.map((d, i) => ({ d, fill: on ? shade(color, TONES[i]) : LOCKED_FACETS[i % 2] })),
    edge: on ? shade(color, 0.45) : LEVEL_COLORS[0],
    dashed: !on,
    ink: on ? color : '#8b95a5',
    icon: BADGE_ICONS[id] || FALLBACK_ICON,
  };
}
