// "Watch it Hot" and "Hot Ticket" badges: watching something right after it comes out.
// PURE: no DOM, no store.
//
// Watch it Hot (levels): episodes watched within 24 hours of airing. TMDB only gives an air
//   DATE (no time), so "within 24 hours" = on the air day or the day after, in YOUR local days
//   (a Netflix drop at 6pm Hobart time, watched at 1am, still counts).
// Hot Ticket (one rare badge): 10 different films watched within 7 days of release (TMDB's
//   release date, usually the cinema date).
//
// An episode only knows its air date if the app saw it when you ticked it, so the air date is
// saved on the watch record (`air: 'YYYY-MM-DD'`) — only when the watch was hot, to keep records
// small. Old watches have no air date and don't count. Films save `released` (full date) when
// added or when their sheet is opened.

import { localDate } from './csvExport.js';

export const HOT_EP_DAYS = 1;     // air day + 1 day
export const HOT_MOVIE_DAYS = 7;  // release day + 7 days
export const HOT_TICKET_GOAL = 10;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dayNum = (d) => { const [y, m, dd] = d.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, dd) / 86400000); };
export const isDate = (d) => typeof d === 'string' && DATE.test(d) && Number.isFinite(dayNum(d));

// Days from release to your (local) watch day; null when either is unknown.
export function daysAfter(at, released) {
  if (!isDate(released) || typeof at !== 'string') return null;
  const day = localDate(at);
  return isDate(day) ? dayNum(day) - dayNum(released) : null;
}
export const isHotEp = (at, air) => { const d = daysAfter(at, air); return d != null && d >= 0 && d <= HOT_EP_DAYS; };
export const isHotMovie = (at, released) => { const d = daysAfter(at, released); return d != null && d >= 0 && d <= HOT_MOVIE_DAYS; };

// The air date of episode s×e from what the show record already knows: TMDB's last aired
// episode, its next episode, or the cached upcoming list. hint (e.g. from the season list on
// the show page) wins.
export function airOf(show, s, e, hint) {
  if (isDate(hint)) return hint;
  if (!show || typeof show !== 'object') return null;
  const same = (x) => x && Number(x.season) === Number(s) && Number(x.episode) === Number(e);
  if (same(show.lastAir) && isDate(show.lastAir.date)) return show.lastAir.date;
  if (same(show.nextAir) && isDate(show.nextAir.date)) return show.nextAir.date;
  for (const u of Array.isArray(show.upcoming) ? show.upcoming : []) {
    if (u && Number(u.s) === Number(s) && Number(u.e) === Number(e) && isDate(u.air)) return u.air;
  }
  return null;
}

// What to add to a NEW watch record: { air } when it was watched hot, else nothing.
export function hotPatch(show, s, e, at, hint) {
  const air = airOf(show, s, e, hint);
  return air && isHotEp(at, air) ? { air } : {};
}

// Badge numbers.
export function countHotEpisodes(shows) {
  let n = 0;
  for (const s of Object.values(shows && typeof shows === 'object' ? shows : {})) {
    if (!s || typeof s !== 'object') continue;
    for (const w of Object.values(s.watched && typeof s.watched === 'object' ? s.watched : {})) {
      if (w && typeof w === 'object' && isHotEp(w.at, w.air)) n++; // first watch only (rewatches aren't "new")
    }
  }
  return n;
}
export function countHotMovies(movies) {
  const films = new Set();
  for (const m of Array.isArray(movies) ? movies : []) {
    if (!m || typeof m !== 'object' || (m.status && m.status !== 'watched')) continue;
    if (isHotMovie(m.watchedAt, m.released)) films.add(m.tmdbId != null ? 'id:' + m.tmdbId : 'n:' + String(m.name || '').toLowerCase());
  }
  return films.size;
}
