// Critic and audience scores (IMDb, Rotten Tomatoes critics, Metacritic, TMDB).
// PURE: no DOM, no store, no network (api/omdb.js + useScores.js do the fetching).
//
// One saved entry per title, on THIS device only (like the streaming-info cache):
//   'movie:603' → { at, imdbId, imdb: 8.7, votes: 2100000, rt: 83, meta: 73, tmdb: 8.2, tmdbVotes: 26000, released: '1999-03-31' }
//   or { at, none: true } when the title has no IMDb page / OMDb doesn't know it.
// A new release's scores move a lot, so it is checked again after FRESH_DAYS; anything older
// after OLD_DAYS; "nothing found" after NONE_DAYS.

export const CACHE_KEY = 'watchnext-scores-v1';
export const CACHE_MAX = 3000;
export const FRESH_DAYS = 3;
export const OLD_DAYS = 30;
export const NONE_DAYS = 7;
export const NEW_FOR_DAYS = 90; // a title counts as "new" this long after release
const DAY = 86400000;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export const scoreKey = (kind, tmdbId) => `${kind === 'tv' ? 'tv' : 'movie'}:${Number(tmdbId)}`;

const num = (s) => {
  const v = Number(String(s == null ? '' : s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(v) && v > 0 ? v : null;
};

// OMDb's answer → { imdb, votes, rt, meta }  (missing scores are null)
export function parseOmdb(j) {
  if (!isObj(j) || j.Response === 'False') return null;
  const rating = (src) => ((Array.isArray(j.Ratings) ? j.Ratings : []).find((r) => r && r.Source === src) || {}).Value;
  const imdb = num(j.imdbRating) || num((rating('Internet Movie Database') || '').split('/')[0]);
  const rtRaw = rating('Rotten Tomatoes');
  const metaRaw = j.Metascore && j.Metascore !== 'N/A' ? j.Metascore : (rating('Metacritic') || '').split('/')[0];
  return {
    imdb: imdb && imdb <= 10 ? imdb : null,
    votes: num(j.imdbVotes),
    rt: rtRaw ? num(rtRaw) : null,
    meta: num(metaRaw),
  };
}

// TMDB details (movie or tv, with external_ids appended for tv) → { imdbId, tmdb, tmdbVotes, released }
export function fromTmdb(d) {
  if (!isObj(d)) return { imdbId: null, tmdb: null, tmdbVotes: null, released: null };
  const imdbId = d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || null;
  return {
    imdbId: typeof imdbId === 'string' && /^tt\d+$/.test(imdbId) ? imdbId : null,
    tmdb: Number(d.vote_count) >= 5 && Number(d.vote_average) > 0 ? Math.round(Number(d.vote_average) * 10) / 10 : null,
    tmdbVotes: Number(d.vote_count) || null,
    released: d.release_date || d.last_air_date || d.first_air_date || null,
  };
}

// Is a saved entry still good? now: ms
export function isFresh(e, now = Date.now()) {
  if (!isObj(e) || !e.at) return false;
  const age = now - Date.parse(e.at);
  if (!Number.isFinite(age)) return false;
  if (e.none) return age < NONE_DAYS * DAY;
  const rel = Date.parse(e.released || '');
  const isNew = Number.isFinite(rel) && now - rel < NEW_FOR_DAYS * DAY;
  return age < (isNew ? FRESH_DAYS : OLD_DAYS) * DAY;
}

// "1.2M", "840k", "9,512"
export function fmtVotes(n) {
  if (!n) return '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e4) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

// The chips to show, in order. name: the title (for search links on sites without a direct id).
// -> [{ id, label, value, sub?, url, title }]
export function chips(e, kind, tmdbId, name = '') {
  if (!isObj(e) || e.none && !e.tmdb) return [];
  const q = encodeURIComponent(name || '');
  const out = [];
  if (e.imdb) out.push({ id: 'imdb', label: 'IMDb', value: `★ ${e.imdb.toFixed(1)}`, sub: fmtVotes(e.votes), url: `https://www.imdb.com/title/${e.imdbId}/`, title: `IMDb ${e.imdb.toFixed(1)}/10${e.votes ? ` from ${e.votes.toLocaleString('en-AU')} votes` : ''}` });
  if (e.rt) out.push({ id: 'rt', label: 'Rotten Tomatoes', value: `🍅 ${e.rt}%`, url: `https://www.rottentomatoes.com/search?search=${q}`, title: `Rotten Tomatoes critics: ${e.rt}% liked it` });
  if (e.meta) out.push({ id: 'meta', label: 'Metacritic', value: `${e.meta}`, url: `https://www.metacritic.com/search/${q}/`, title: `Metacritic critics: ${e.meta}/100`, tone: e.meta >= 61 ? 'good' : e.meta >= 40 ? 'mixed' : 'bad' });
  if (e.tmdb) out.push({ id: 'tmdb', label: 'TMDB', value: `${e.tmdb.toFixed(1)}`, url: `https://www.themoviedb.org/${kind === 'tv' ? 'tv' : 'movie'}/${tmdbId}`, title: `TMDB users: ${e.tmdb.toFixed(1)}/10${e.tmdbVotes ? ` from ${e.tmdbVotes.toLocaleString('en-AU')} votes` : ''}` });
  return out;
}

// One number for sorting "Highest rated": IMDb, else TMDB (both out of 10); null when unknown.
export const sortScore = (e) => (isObj(e) ? e.imdb || e.tmdb || null : null);

// ------------------------------------------------------------------ cache (this device only)
export function loadCache(storage) {
  try {
    const raw = JSON.parse(storage.getItem(CACHE_KEY));
    if (!isObj(raw)) return {};
    const out = {};
    for (const [k, v] of Object.entries(raw)) if (/^(tv|movie):\d+$/.test(k) && isObj(v) && typeof v.at === 'string') out[k] = v;
    return out;
  } catch (e) {
    return {};
  }
}
// Keeps the newest CACHE_MAX entries.
export function trimCache(cache) {
  const keys = Object.keys(cache);
  if (keys.length <= CACHE_MAX) return cache;
  const keep = keys.sort((a, b) => String(cache[b].at).localeCompare(String(cache[a].at))).slice(0, CACHE_MAX);
  return Object.fromEntries(keep.map((k) => [k, cache[k]]));
}
export function saveCache(storage, cache) {
  try { storage.setItem(CACHE_KEY, JSON.stringify(trimCache(cache))); } catch (e) { /* full: fetched again later */ }
}
