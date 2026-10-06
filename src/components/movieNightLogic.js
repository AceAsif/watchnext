// PURE: "Movie night" (on the Discover tab) — find a NEW movie that fits the time you have,
// your mood, and (optionally) the services you pay for. No DOM, no store.
//
// Where candidates come from
//   recommended  Discover's "because you liked X": TMDB recommendations for the movies you rated
//   popular      popular movies TMDB says stream in Australia on your services (or are free to
//                watch), already filtered by TMDB for the time (runtime) and the mood (genres)
// Movies already in your library (any status) are never suggested: the Tonight sheet covers
// your planned ones. List results carry no runtime, so the top candidates are looked up
// (details) before they can be ranked; only movies with a known runtime that fits are shown.

import { MOODS, moodById, moodState, formatMinutes, PICKS } from './tonightLogic.js';
import { providerToPlatform } from './platformsData.js';
import { isOnMyServices, servicesLabel } from './servicesLogic.js';

export { MOODS, moodById, formatMinutes, PICKS };

// Movie nights are 90 minutes and up.
export const MOVIE_TIME_CHOICES = [90, 105, 120, 150, 180];
export const DEFAULT_MOVIE_MINUTES = 120;
export const MIN_FEATURE_MINUTES = 60; // shorter than this is a short film, not a movie night
export const MAX_SEEDS = 6;
export const ENRICH_BATCH = 12; // details looked up per round
export const ENRICH_MAX = 48; // never look up more than this many in one sitting
const SEED_WEIGHT = 3; // a movie recommended because you rated something highly beats a plain popular one

// TMDB's movie genre ids (stable, public). Names match TMDB's movie genre names.
export const MOVIE_GENRE_ID = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14,
  History: 36, Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749, 'Science Fiction': 878, 'TV Movie': 10770, Thriller: 53,
  War: 10752, Western: 37,
};
const GENRE_NAME = Object.fromEntries(Object.entries(MOVIE_GENRE_ID).map(([n, id]) => [id, n]));
export const genreNames = (ids) => (Array.isArray(ids) ? ids : []).map((id) => GENRE_NAME[id]).filter(Boolean);
// The TMDB genre ids a mood stands for (TV-only genre names in the mood lists are ignored).
export const moodGenreIds = (mood) => moodById(mood).genres.map((g) => MOVIE_GENRE_ID[g]).filter(Boolean);

// ------------------------------------------------------------------ TMDB queries
// TMDB provider ids for the services you ticked, from its provider list for the region.
export function myProviderIds(providerList, mine) {
  const m = mine instanceof Set ? mine : new Set(mine || []);
  return [...new Set((Array.isArray(providerList) ? providerList : [])
    .filter((p) => p && p.provider_id != null && m.has(providerToPlatform(p.provider_name)))
    .map((p) => p.provider_id))];
}

// Parameters for TMDB's /discover/movie. kind 'subs' = on one of YOUR providers (subscription);
// 'free' = free or ad-supported on any provider. Runtime and genre filters are applied by TMDB.
export function discoverParams({ providerIds = [], minutes, mood = 'any', page = 1, kind = 'subs', region = 'AU' } = {}) {
  const p = {
    watch_region: region, sort_by: 'popularity.desc', include_adult: 'false', page,
    'vote_count.gte': 150, 'vote_average.gte': 6, 'with_runtime.gte': MIN_FEATURE_MINUTES, 'with_runtime.lte': minutes,
  };
  const g = moodGenreIds(mood);
  if (g.length) p.with_genres = g.join('|');
  if (kind === 'free') p.with_watch_monetization_types = 'free|ads';
  else { p.with_watch_providers = providerIds.join('|'); p.with_watch_monetization_types = 'flatrate'; }
  return p;
}
export const popularQueries = ({ providerIds = [], minutes, mood, page = 1 }) => [
  ...(providerIds.length ? [{ kind: 'subs', params: discoverParams({ providerIds, minutes, mood, page, kind: 'subs' }) }] : []),
  { kind: 'free', params: discoverParams({ providerIds, minutes, mood, page, kind: 'free' }) },
];

// ------------------------------------------------------------------ candidates
const base = (raw) => ({
  key: 'n:' + raw.id, tmdbId: raw.id, name: String(raw.title), year: (raw.release_date || '').slice(0, 4), poster: raw.poster_path,
  genres: genreNames(raw.genre_ids), voteAvg: Number(raw.vote_average) || 0, runtime: null, details: null, avail: null,
});
const usable = (raw) => !!raw && typeof raw === 'object' && raw.id != null && !!raw.title && !!raw.poster_path;

export function recommendedCandidate(raw, seed) {
  if (!usable(raw)) return null;
  return { ...base(raw), because: [String(seed.name)], seedScore: Number(seed.rating) || 0, popular: false, onMine: false, via: null };
}
export function popularCandidate(raw, via) {
  if (!usable(raw)) return null;
  return { ...base(raw), because: [], seedScore: 0, popular: true, onMine: true, via };
}

// One list of unique candidates. `owned` = TMDB ids already in your library; `keep` = ids you added
// during this sitting (they stay visible, shown as added, instead of vanishing).
export function mergePool(lists, owned = new Set(), keep = new Set()) {
  const byId = new Map();
  for (const list of lists) {
    for (const c of list) {
      if (!c || (owned.has(c.tmdbId) && !keep.has(c.tmdbId))) continue;
      const e = byId.get(c.tmdbId);
      if (!e) { byId.set(c.tmdbId, { ...c, because: [...c.because] }); continue; }
      e.because = [...new Set([...e.because, ...c.because])];
      e.seedScore += c.seedScore;
      e.popular = e.popular || c.popular;
      e.onMine = e.onMine || c.onMine;
      e.via = e.via === 'subs' || c.via === 'subs' ? 'subs' : e.via || c.via;
      e.voteAvg = Math.max(e.voteAvg, c.voteAvg);
    }
  }
  return [...byId.values()];
}

// Add what a details lookup tells us (runtime, exact genres, year) and what an availability lookup told us.
export function withDetails(c, d) {
  if (!d || typeof d !== 'object') return c;
  const runtime = Number(d.runtime) > 0 ? Math.round(Number(d.runtime)) : null;
  const genres = Array.isArray(d.genres) && d.genres.length ? d.genres.map((g) => g && g.name).filter(Boolean) : c.genres;
  return { ...c, runtime, genres, year: (d.release_date || '').slice(0, 4) || c.year, details: d };
}
export const withAvail = (c, a) => (a ? { ...c, avail: a } : c);

// Which candidates should have their details looked up: the `limit` most promising overall (likely
// mood matches, movies you have reason to like, then popular ones), minus those already looked up.
// Raising `limit` (when you ask for more) widens the net; it never re-fetches what is already known.
export function enrichOrder(pool, { mood = 'any', have = new Set(), limit = ENRICH_BATCH } = {}) {
  const pre = (c) => (moodState(c, mood) === 'match' ? 40 : moodState(c, mood) === 'unknown' ? 8 : 0) + Math.min(c.seedScore, 20) * SEED_WEIGHT + (c.onMine ? 8 : 0) + c.voteAvg * 2;
  return [...pool].sort((a, b) => pre(b) - pre(a) || a.tmdbId - b.tmdbId).slice(0, limit).filter((c) => !have.has(c.tmdbId)).map((c) => c.tmdbId);
}

// ------------------------------------------------------------------ ranking
function jitter(seed, key) {
  let x = Math.imul((seed | 0) + 1, 2654435761) >>> 0;
  for (let i = 0; i < key.length; i++) x = Math.imul(x ^ key.charCodeAt(i), 16777619) >>> 0;
  return (x % 700) / 100;
}

// opts: { minutes, mood, seed, exclude:Set<key>, hidden:Set<key>, mine:Set<platformId>|null, onlyMine }
// -> { picks, fitting, matching, wrapped }
export function suggestMovies(cands, opts = {}) {
  const minutes = MOVIE_TIME_CHOICES.includes(opts.minutes) ? opts.minutes : DEFAULT_MOVIE_MINUTES;
  const mood = moodById(opts.mood).id;
  const mine = opts.mine || null;
  const hidden = opts.hidden instanceof Set ? opts.hidden : new Set();
  const rows = [];
  for (const c of cands) {
    if (!c || typeof c !== 'object') continue;
    if (hidden.has(c.key) || !(c.runtime >= MIN_FEATURE_MINUTES) || c.runtime > minutes) continue; // runtime must be known and fit
    const availOn = !!(c.avail && mine && isOnMyServices(c.avail, mine));
    const on = c.onMine || availOn;
    if (opts.onlyMine && !on) continue; // not confirmed on your services (or free)
    const ms = moodState(c, mood);
    let score = 30 * (c.runtime / minutes) + Math.min(c.seedScore, 20) * SEED_WEIGHT + c.voteAvg * 2 + (c.popular ? 6 : 0) + (on ? 6 : 0);
    score += ms === 'match' ? 40 : ms === 'unknown' ? 8 : 0;
    score += jitter(opts.seed || 0, String(c.key));
    const where = availOn && c.avail ? servicesLabel(c.avail, mine) : c.onMine ? (c.via === 'free' ? 'Free to watch' : 'On your services') : '';
    rows.push({ ...c, spare: minutes - c.runtime, moodState: ms, where, score });
  }
  const rank = (r) => (r.moodState === 'no' ? 2 : r.moodState === 'unknown' ? 1 : 0);
  rows.sort((a, b) => rank(a) - rank(b) || b.score - a.score || String(a.key).localeCompare(String(b.key)));
  const exclude = opts.exclude instanceof Set ? opts.exclude : new Set();
  let pool = rows.filter((r) => !exclude.has(r.key));
  let wrapped = false;
  if (!pool.length && rows.length) { pool = rows; wrapped = true; }
  return { picks: pool.slice(0, PICKS), fitting: rows.length, matching: rows.filter((r) => r.moodState === 'match').length, wrapped };
}

// ------------------------------------------------------------------ wording
export function whyLines(c) {
  const lines = [];
  const because = Array.isArray(c.because) ? c.because : [];
  if (because.length) lines.push(`Because you liked ${because.slice(0, 2).join(' and ')}`);
  else if (c.popular) lines.push(c.via === 'free' ? 'Popular and free to watch' : 'Popular on your services');
  lines.push(c.spare >= 5 ? `${c.runtime} min · ${formatMinutes(c.spare)} to spare` : `${c.runtime} min`);
  if (c.voteAvg > 0) lines.push(`★ ${c.voteAvg.toFixed(1)} on TMDB`);
  return lines;
}
export function sourceNote({ ratedMovies = 0, mineCount = 0 } = {}) {
  const from = [];
  if (ratedMovies > 0) from.push(`${ratedMovies} ${ratedMovies === 1 ? 'movie' : 'movies'} you rated`);
  if (mineCount > 0) from.push('popular movies on your services');
  from.push('popular free-to-watch movies');
  const tips = [];
  if (ratedMovies === 0) tips.push('rate a few movies');
  if (mineCount === 0) tips.push('tick your services in Settings');
  const list = from.length > 1 ? `${from.slice(0, -1).join(', ')} and ${from[from.length - 1]}` : from[0];
  const tip = tips.length ? ` ${tips.join(' and ').replace(/^./, (ch) => ch.toUpperCase())} for better picks.` : '';
  return `Picks come from ${list}.${tip}`;
}
export function emptyText(minutes, mood, onlyMine) {
  const M = moodById(mood);
  return `No new movie found that fits ${formatMinutes(minutes)}${onlyMine ? ' on your services' : ''}${M.id === 'any' ? '' : ` for “${M.label}”`}. Try more time${onlyMine ? ', switching off “Only on my services”,' : ''} or a different mood.`;
}

// ------------------------------------------------------------------ remembered choices (per device)
export const PREFS_KEY = 'watchnext-movienight-v1';
export function sanitizePrefs(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { minutes: MOVIE_TIME_CHOICES.includes(r.minutes) ? r.minutes : DEFAULT_MOVIE_MINUTES, mood: MOODS.some((m) => m.id === r.mood) ? r.mood : 'any', onlyMine: r.onlyMine === true };
}
export function loadPrefs(storage) { try { return sanitizePrefs(JSON.parse(storage.getItem(PREFS_KEY))); } catch (e) { return sanitizePrefs(null); } }
export function savePrefs(storage, prefs) { try { storage.setItem(PREFS_KEY, JSON.stringify(sanitizePrefs(prefs))); } catch (e) { /* blocked: just not remembered */ } }
