// Pure logic for "Restore from backup". No store, no localStorage and no React,
// so it can be unit-tested with plain node (db.js touches localStorage at load).
//
// A backup file is the app state saved by "Download backup":
//   { shows: { "tmdb:123": {...}, ... }, movies: [ {...}, ... ], settings: {...} }
// (the TMDB key is left out of new backups). A TV Time import is different: its
// `shows` is an ARRAY. That's how the two are told apart.
//
// Restore is ADDITIVE: it brings back what's missing and never deletes or
// overwrites what you already have. For a show that exists in both, your current
// values win and the backup only fills blanks and adds missing watched
// episodes. (Want an exact snapshot? Delete all data, then Restore into the
// empty state — nothing local is there to conflict with.)

// Ids / keys that must never be copied from a file: assigning to one of these on
// a plain object can rewrite its prototype.
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
// "Blank" values the backup is allowed to fill in.
const blank = (v) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (isObj(v) && Object.keys(v).length === 0);

// A WatchNext backup keeps `shows` as an object keyed by id.
export function isBackupFile(json) {
  return isObj(json) && isObj(json.shows);
}
// A TV Time export keeps `shows` as an array (what importTvTime expects).
export function isTvTimeFile(json) {
  return isObj(json) && Array.isArray(json.shows);
}

const movieKey = (m) => `${m.tmdbId != null ? m.tmdbId : m.name}|${m.watchedAt || ''}|${m.status || 'watched'}`;

function mergeShow(local, back) {
  const out = {};
  for (const k of new Set([...Object.keys(back), ...Object.keys(local)])) {
    if (BAD_KEYS.has(k)) continue;
    out[k] = blank(local[k]) ? clone(back[k]) : local[k]; // local wins unless blank
  }

  // watched episodes: union. Both have it -> keep yours, but never lose a rewatch count.
  const watched = { ...(local.watched || {}) };
  let watchesAdded = 0;
  for (const [key, w] of Object.entries(back.watched || {})) {
    if (BAD_KEYS.has(key) || !isObj(w)) continue;
    if (!watched[key]) {
      watched[key] = clone(w);
      watchesAdded++;
    } else if ((w.n || 1) > (watched[key].n || 1)) {
      watched[key] = { ...watched[key], n: w.n };
    }
  }
  out.watched = watched;

  // library / watchlist: being in the library beats being on the watchlist
  // (only written when the value actually changes, so a show that simply never
  // had these keys isn't rewritten — restoring the same file twice stays a no-op)
  const followed = !!(local.followed || back.followed);
  const watchlist = !followed && !!(local.watchlist || back.watchlist);
  if (!!out.followed !== followed) out.followed = followed;
  if (!!out.watchlist !== watchlist) out.watchlist = watchlist;

  // your rating wins; otherwise take the backup's (with its date)
  if (local.rating) {
    out.rating = local.rating;
    if (!blank(local.ratedAt)) out.ratedAt = local.ratedAt;
  } else if (back.rating) {
    out.rating = back.rating;
    if (!blank(back.ratedAt)) out.ratedAt = back.ratedAt;
  }
  return { show: out, watchesAdded };
}

// local: { shows, movies }.  backup: the parsed file.
// Returns { shows, movies, touchedIds, moviesChanged, summary } — it does NOT
// modify `local` or `backup`. Throws if the file isn't a WatchNext backup.
export function mergeBackup(local, backup) {
  if (!isBackupFile(backup)) throw new Error('That file does not look like a WatchNext backup.');

  const shows = { ...local.shows };
  const touchedIds = [];
  const summary = { showsAdded: 0, showsUpdated: 0, watchesAdded: 0, moviesAdded: 0, skipped: 0 };

  for (const [id, back] of Object.entries(backup.shows)) {
    if (BAD_KEYS.has(id) || !isObj(back)) {
      summary.skipped++;
      continue;
    }
    const mine = shows[id];
    if (!mine) {
      const copy = clone(back);
      if (!isObj(copy.watched)) copy.watched = {};
      shows[id] = copy;
      summary.showsAdded++;
      summary.watchesAdded += Object.keys(copy.watched).length;
      touchedIds.push(id);
    } else {
      const { show, watchesAdded } = mergeShow(mine, back);
      if (JSON.stringify(show) !== JSON.stringify(mine)) {
        shows[id] = show;
        summary.showsUpdated++;
        summary.watchesAdded += watchesAdded;
        touchedIds.push(id);
      }
    }
  }

  // movies: add entries you don't already have (same film + date + status)
  let movies = (local.movies || []).slice();
  const have = new Set(movies.map(movieKey));
  const startLen = movies.length;
  let removedPlanned = 0;
  for (const m of Array.isArray(backup.movies) ? backup.movies : []) {
    if (!isObj(m) || (m.name == null && m.tmdbId == null)) {
      summary.skipped++;
      continue;
    }
    if (m.status === 'planned') {
      if (m.tmdbId != null && movies.some((x) => x.tmdbId === m.tmdbId)) continue; // already watched/planned here
    } else if (m.tmdbId != null) {
      const before = movies.length;
      movies = movies.filter((x) => !(x.status === 'planned' && x.tmdbId === m.tmdbId)); // watched beats planned
      removedPlanned += before - movies.length;
    }
    const k = movieKey(m);
    if (have.has(k)) continue;
    movies.push(clone(m));
    have.add(k);
    summary.moviesAdded++;
  }
  const moviesChanged = summary.moviesAdded > 0 || removedPlanned > 0 || movies.length !== startLen;

  return { shows, movies, touchedIds, moviesChanged, summary };
}
