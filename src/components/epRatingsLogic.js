// Episode ratings on the show page: your best episode and a rating line for each season.
// PURE: no DOM, no store.

import { cleanEntry } from '../store/epRatings.js';
import { isEpKey } from '../store/notes.js';

// Every rated episode of a show, in season/episode order.
// -> [{ key, s, e, r, t, at }]
export function ratedEpisodes(show) {
  const map = show && show.epRatings && typeof show.epRatings === 'object' ? show.epRatings : {};
  const out = [];
  for (const [key, v] of Object.entries(map)) {
    if (!isEpKey(key)) continue;
    const c = cleanEntry(v);
    if (!c) continue;
    const [s, e] = key.split('x').map(Number);
    out.push({ key, s, e, r: c.r, t: c.t || '', at: c.at || '' });
  }
  return out.sort((a, b) => a.s - b.s || a.e - b.e);
}

const round1 = (x) => Math.round(x * 10) / 10;
export const average = (list) => (list.length ? round1(list.reduce((n, x) => n + x.r, 0) / list.length) : 0);

// Your top-rated episode (ties: the earliest in the show), plus how many others share that rating.
// -> { ep, ties } or null
export function bestEpisode(rated) {
  if (!rated.length) return null;
  const top = Math.max(...rated.map((x) => x.r));
  const all = rated.filter((x) => x.r === top);
  return { ep: all[0], ties: all.length - 1 };
}

// One line per season that has a rating.
//   seasons: show.seasons ([{ n, count }]) — gives each season's episode count for the x axis
// -> [{ n, count, points: [{ e, r, t }], avg, best }]
export function seasonLines(rated, seasons) {
  const counts = new Map((Array.isArray(seasons) ? seasons : []).map((x) => [x && x.n, x && x.count]));
  const bySeason = new Map();
  for (const x of rated) {
    if (!bySeason.has(x.s)) bySeason.set(x.s, []);
    bySeason.get(x.s).push(x);
  }
  return [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, list]) => {
      const lastRated = Math.max(...list.map((x) => x.e));
      const known = Number.isInteger(counts.get(n)) && counts.get(n) > 0 ? counts.get(n) : 0;
      return {
        n,
        count: Math.max(known, lastRated),
        points: list.map((x) => ({ e: x.e, r: x.r, t: x.t })),
        avg: average(list),
        best: bestEpisode(list).ep,
      };
    });
}

// Chart geometry for one season, in a w×h box with `pad` inside the edges.
// x: episode 1 at the left, the season's last episode at the right. y: 0.5 stars at the bottom, 5 at the top.
// -> { dots: [{ x, y, e, r, t }], path ('' when fewer than 2 dots), grid: [{ y, label }] }
export function chartGeometry(line, w = 320, h = 96, pad = 12) {
  const span = Math.max(1, line.count - 1);
  const xOf = (e) => (line.count <= 1 ? w / 2 : pad + ((e - 1) / span) * (w - 2 * pad));
  const yOf = (r) => pad + ((5 - r) / 4.5) * (h - 2 * pad);
  const r1 = (v) => Math.round(v * 10) / 10;
  const dots = line.points.map((p) => ({ ...p, x: r1(xOf(p.e)), y: r1(yOf(p.r)) }));
  const path = dots.length > 1 ? dots.map((d, i) => `${i ? 'L' : 'M'}${d.x} ${d.y}`).join('') : '';
  const grid = [5, 3, 1].map((r) => ({ y: r1(yOf(r)), label: String(r) }));
  return { dots, path, grid };
}

// "S2E7" for a rated episode.
export const epCode = (x) => `S${x.s}E${x.e}`;
