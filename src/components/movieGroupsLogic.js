import { localISODate } from './showLogic.js';
import { isAllowedDay, stampForDay } from './watchDatesLogic.js';
import { fmtDay } from './statsLogic.js';

// One tile per film in the Movies grid. PURE: no DOM, no store.
//
// Every viewing of a movie is its own dated entry (a rewatch is a second entry). The grid used
// to show one tile per entry, so a film watched four times filled four tiles. Here the
// viewings are grouped into one film, using the same rule as the "2×" chip (rewatchLogic):
// the same TMDB id, or the same name (ignoring case and spaces) when it isn't linked.
//
// groupMovies(watched) -> [{
//   key, name, tmdbId, poster, year,
//   watchedAt,       latest viewing date (what "Recent" sorts by and the tile shows)
//   rating,          the newest viewing's own rating, else the newest rating given at all, else 0
//   times,           how many viewings
//   latest,          the newest viewing entry (opened when the tile is tapped)
//   viewings,        every entry, newest first
// }]
// `watched` is the page's list of watched entries, each carrying its `index` in the real array.

export const movieKey = (m) => {
  const name = String((m && m.name) || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return m && m.tmdbId != null ? 't' + m.tmdbId : name ? 'n' + name : 'i' + (m && m.index);
};

const newestFirst = (a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || '') || (b.index ?? 0) - (a.index ?? 0);

export function groupMovies(watched) {
  const map = new Map();
  for (const m of Array.isArray(watched) ? watched : []) {
    if (!m || typeof m !== 'object') continue;
    const k = movieKey(m);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(m);
  }
  const out = [];
  for (const [key, list] of map) {
    const viewings = list.slice().sort(newestFirst);
    const latest = viewings[0];
    const rated = viewings.find((v) => Number(v.rating) > 0);
    out.push({
      key,
      name: latest.name,
      tmdbId: latest.tmdbId ?? null,
      poster: latest.poster || (viewings.find((v) => v.poster) || {}).poster || null,
      year: latest.year || (viewings.find((v) => v.year) || {}).year || null,
      watchedAt: latest.watchedAt || '',
      rating: Number(latest.rating) > 0 ? Number(latest.rating) : rated ? Number(rated.rating) : 0,
      times: viewings.length,
      latest,
      viewings,
    });
  }
  return out.sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || ''));
}

// The group a viewing belongs to (for the movie sheet's "Viewings" list).
export function groupOfIndex(groups, index) {
  return (groups || []).find((g) => g.viewings.some((v) => v.index === index)) || null;
}

// "Watched 4 times" / "Watched once"
export const viewingsLabel = (n) => (n === 1 ? 'Watched once' : `Watched ${n} times`);

// ------------------------------------------------------------------ change a viewing's date
// "Log again" and "Watched it" stamp TODAY. When a rewatch really happened earlier, the
// movie sheet lets you move that one viewing to its real day.


// The LOCAL day a viewing is dated ('YYYY-MM-DD'), or '' when it has no usable date.
export function viewingDay(v) {
  const t = Date.parse(v && v.watchedAt);
  return Number.isFinite(t) ? localISODate(new Date(t)) : '';
}

// Can viewing `index` of this film move to day `ymd`?
// -> { ok, msg } — msg is the hint shown under the date box ('' when there is nothing to say).
export function checkNewDay(group, index, ymd, today) {
  if (!ymd) return { ok: false, msg: '' };
  if (!isAllowedDay(ymd, today)) return { ok: false, msg: 'Choose a real date that is not in the future.' };
  const viewings = (group && group.viewings) || [];
  const me = viewings.find((v) => v.index === index);
  if (me && viewingDay(me) === ymd) return { ok: false, msg: '' }; // unchanged: nothing to save, nothing to warn about
  if (viewings.some((v) => v.index !== index && viewingDay(v) === ymd)) {
    return { ok: false, msg: 'You already have a viewing of this film on that day. If this one is a copy, use “Remove this one” instead.' };
  }
  return { ok: true, msg: `This viewing will be dated ${fmtDay(ymd)}. Rating and notes stay.` };
}

// The new watchedAt to save for that day (local noon, never in the future).
export const watchedAtFor = (ymd, now = new Date()) => stampForDay(ymd, now);
