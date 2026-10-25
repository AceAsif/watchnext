// Episode IMDb scores (pure logic, unit-tested in plain node). No DOM, no network.
//
// OMDb gives a whole season in one call: ?i=<show imdb id>&Season=N →
//   { Response: 'True', Episodes: [{ Episode: '1', imdbRating: '8.7', Released: '2016-07-15' }, …] }
// Saved on THIS device (like the title scores), one entry per show season:
//   'tt4574334:4' → { at, eps: { 1: 8.7, 2: 8.9 }, latest: '2022-07-01' }   or   { at, none: true }
// A season still airing (an episode released in the last 60 days, or one without a score yet)
// is checked again after AIRING_DAYS; an older season after OLD_DAYS; "nothing found" after NONE_DAYS.

export const CACHE_KEY = 'watchnext-ep-scores-v1';
export const CACHE_MAX = 600; // seasons kept; the oldest looked-up go first
export const AIRING_DAYS = 3;
export const OLD_DAYS = 30;
export const NONE_DAYS = 7;
export const RECENT_DAYS = 60;
const DAY = 86400000;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export const seasonKey = (imdbId, season) => `${imdbId}:${Number(season)}`;
export const validImdbId = (id) => typeof id === 'string' && /^tt\d+$/.test(id);

const rating = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 10 ? Math.round(n * 10) / 10 : null;
};

/** OMDb's season answer → { eps, latest, pending } or null when OMDb has nothing. */
export function parseSeason(j) {
  if (!isObj(j) || j.Response === 'False' || !Array.isArray(j.Episodes)) return null;
  const eps = {};
  let latest = '';
  let pending = false; // released recently or not yet rated: scores will still change
  for (const e of j.Episodes) {
    if (!isObj(e)) continue;
    const n = Number(e.Episode);
    if (!Number.isInteger(n) || n < 1) continue;
    const r = rating(e.imdbRating);
    if (r != null) eps[n] = r; else pending = true;
    if (typeof e.Released === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.Released) && e.Released > latest) latest = e.Released;
  }
  if (!Object.keys(eps).length && !latest) return null;
  return { eps, latest: latest || null, pending };
}

/** Is a saved season still good? */
export function isFresh(e, now = Date.now()) {
  if (!isObj(e) || !e.at) return false;
  const age = now - Date.parse(e.at);
  if (!Number.isFinite(age) || age < 0) return false;
  if (e.none) return age < NONE_DAYS * DAY;
  const rel = Date.parse(e.latest || '');
  const airing = e.pending || (Number.isFinite(rel) && now - rel < RECENT_DAYS * DAY);
  return age < (airing ? AIRING_DAYS : OLD_DAYS) * DAY;
}

/** The highest-rated episode of a season (only when 3+ episodes have a score; ties → the earlier one). */
export function bestEpisode(eps) {
  const list = Object.entries(isObj(eps) ? eps : {}).map(([k, v]) => [Number(k), v]).filter(([, v]) => typeof v === 'number');
  if (list.length < 3) return null;
  list.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return list[0][0];
}

export const scoreText = (r) => (typeof r === 'number' ? r.toFixed(1) : '');

// ---- the device cache
export function loadCache(storage) {
  try {
    const j = JSON.parse(storage.getItem(CACHE_KEY));
    if (!isObj(j)) return {};
    const out = {};
    for (const [k, v] of Object.entries(j)) if (/^tt\d+:\d+$/.test(k) && isObj(v) && v.at) out[k] = v;
    return out;
  } catch { return {}; }
}
export function trimCache(cache, max = CACHE_MAX) {
  const keys = Object.keys(cache);
  if (keys.length <= max) return cache;
  const keep = keys.sort((a, b) => String(cache[b].at).localeCompare(String(cache[a].at))).slice(0, max);
  return Object.fromEntries(keep.map((k) => [k, cache[k]]));
}
export function saveCache(storage, cache) {
  try { storage.setItem(CACHE_KEY, JSON.stringify(trimCache(cache))); return true; } catch { return false; }
}
