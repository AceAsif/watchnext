import { mergeBackup } from './backupMerge.js';
import { setNoteIn, withNotes, withMovieNote } from './notes.js';

// Simple localStorage-backed store with a subscribe API.
// Single-user app, so no backend needed: everything lives in the browser.

const KEY = 'watchnext-state-v1';

const empty = () => ({
  shows: {},   // id -> show record (id is "tvdb:123" or "tmdb:456")
  movies: [],  // { name, watchedAt, runtimeMin }
  settings: { tmdbKey: '' },
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch (e) {
    console.error('Failed to load state', e);
  }
  return empty();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state (storage full?)', e);
  }
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit() {
  persist();
  listeners.forEach((fn) => fn(state));
}

export function update(mutator) {
  // shows/movies get fresh container references on every update, even though
  // individual mutators only reassign one key (`s.shows[id] = {...}`) rather
  // than replacing the whole object. Without this, `state.shows` is the same
  // object reference before and after a mutation, so anything memoized on
  // `[state.shows]` (Stats' big useMemo, for one) never recomputes unless the
  // component happens to fully remount — which mostly hides the bug, except
  // when a page is already open and a change arrives in the background (a
  // cloud-sync update from another device/tab is the main way this happens).
  // Individual show/movie objects inside stay reference-stable when unchanged,
  // which is the correct, standard immutable-update shape.
  state = { ...state, shows: { ...state.shows }, movies: [...state.movies] };
  mutator(state);
  commit();
}

// ---------------------------------------------------------------------------
// Dirty tracking for cloud sync (see store/cloud.js).
// Mutations below call markShowDirty()/markMoviesDirty() so the sync layer
// knows what changed since its last flush, without re-uploading everything.
// ---------------------------------------------------------------------------

let dirtyShows = new Set();
let dirtyMovies = false;
let deletedShows = new Set();

// Persistent tombstones: ids the user has deleted for good. Kept in
// localStorage (unlike deletedShows, which is an in-memory flush queue that
// resets on reload) so a delete survives a reload/redeploy even when the async
// Firestore delete didn't land before the page unloaded. Without this,
// pullAndMerge (cloud.js) sees the still-present remote doc, finds it missing
// locally, and resurrects it. A tombstone is lifted only when the user
// deliberately re-adds a show with that id (see the add/import paths below).
const TOMB_KEY = 'watchnext-tombstones-v1';
function loadTombstones() {
  try {
    const raw = localStorage.getItem(TOMB_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to load tombstones', e);
  }
  return new Set();
}
let tombstones = loadTombstones();
function persistTombstones() {
  try {
    localStorage.setItem(TOMB_KEY, JSON.stringify([...tombstones]));
  } catch (e) {
    console.error('Failed to save tombstones', e);
  }
}
export function isTombstoned(id) {
  return tombstones.has(id);
}
export function clearTombstone(id) {
  if (tombstones.delete(id)) persistTombstones();
}

// Remember many deleted ids at once WITHOUT queueing Firestore deletes (the
// caller has already deleted them in the cloud). One localStorage write.
export function addTombstones(ids) {
  let changed = false;
  for (const id of ids) if (!tombstones.has(id)) { tombstones.add(id); changed = true; }
  if (changed) persistTombstones();
}

export function markShowDirty(id) {
  dirtyShows.add(id);
}

export function markMoviesDirty() {
  dirtyMovies = true;
}

export function markShowDeleted(id) {
  deletedShows.add(id);
  dirtyShows.delete(id); // a deleted show must not also be pushed as an update
  tombstones.add(id); // remember it across reloads so it can't be resurrected
  persistTombstones();
}

export function takeDirty() {
  const showIds = dirtyShows;
  const movies = dirtyMovies;
  const deletedIds = deletedShows;
  dirtyShows = new Set();
  dirtyMovies = false;
  deletedShows = new Set();
  return { showIds, movies, deletedIds };
}

// ---------------------------------------------------------------------------
// Show helpers
// ---------------------------------------------------------------------------

export const epKey = (s, e) => `${s}x${e}`;

export function showId(show) {
  if (show.tvdbId) return `tvdb:${show.tvdbId}`;
  if (show.tmdbId) return `tmdb:${show.tmdbId}`;
  return `name:${show.name}`;
}

export function watchedCount(show) {
  return Object.keys(show.watched || {}).length;
}

export function lastWatched(show) {
  // Highest (season, episode) pair that has been watched.
  let best = null;
  for (const k of Object.keys(show.watched || {})) {
    const [s, e] = k.split('x').map(Number);
    if (!best || s > best[0] || (s === best[0] && e > best[1])) best = [s, e];
  }
  return best; // [season, episode] or null
}

export function lastWatchDate(show) {
  let latest = null;
  for (const w of Object.values(show.watched || {})) {
    if (w.at && (!latest || w.at > latest)) latest = w.at;
  }
  return latest;
}

// --- "time left to finish" helpers (pure functions of a show record) ---
const PACE_BATCH_MIN = 15;    // a minute with >= this many watches is a bulk import
const PACE_WINDOW_DAYS = 120; // recent-pace lookback

// Episodes remaining. 0 when the show is complete or has no episode count yet.
export function episodesLeft(show) {
  const total = show.totalEpisodes || 0;
  if (!total) return 0;
  return Math.max(0, total - watchedCount(show));
}

// Rough hours remaining = episodes left x per-episode runtime (40m fallback).
export function hoursLeft(show) {
  const mins = episodesLeft(show) * (show.runtimeMin || 40);
  return mins > 0 ? Math.round(mins / 60) : 0;
}

// Finish-date estimate from THIS show's own recent watch pace. Returns
// { days, date } (date = "YYYY-MM-DD") or null when there isn't enough recent
// signal to be meaningful — so it never guesses off one binge or a stale show.
// Bulk-import minutes are de-skewed (counted once) so a backlog dump can't fake
// a blistering pace.
export function paceFinish(show) {
  const left = episodesLeft(show);
  if (left <= 0) return null;

  const entries = Object.values(show.watched || {}).filter((w) => w && w.at);
  if (entries.length < 3) return null;

  const dayNumOf = (iso) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  };
  const todayNum = Math.floor(Date.now() / 86400000);
  const windowStart = todayNum - PACE_WINDOW_DAYS;

  const minuteCount = {};
  for (const w of entries) {
    const min = w.at.slice(0, 16);
    minuteCount[min] = (minuteCount[min] || 0) + 1;
  }

  const seenBatch = new Set();
  const activeDays = new Set();
  let watchedInWindow = 0;
  let earliest = null;
  for (const w of entries) {
    const dn = dayNumOf(w.at);
    if (dn < windowStart) continue;
    const min = w.at.slice(0, 16);
    if (minuteCount[min] >= PACE_BATCH_MIN) {
      if (seenBatch.has(min)) continue; // collapse a bulk-import minute to 1
      seenBatch.add(min);
    }
    watchedInWindow += 1;
    activeDays.add(w.at.slice(0, 10));
    if (earliest === null || dn < earliest) earliest = dn;
  }

  // Trust a rate only with a few episodes across at least two separate days.
  if (activeDays.size < 2 || watchedInWindow < 3) return null;

  const spanDays = Math.max(1, todayNum - earliest);
  const perDay = watchedInWindow / spanDays;
  if (perDay <= 0) return null;

  const days = Math.ceil(left / perDay);
  if (days > 3650) return null; // slower than ~10 years out: not worth showing

  const date = new Date((todayNum + days) * 86400000).toISOString().slice(0, 10);
  return { days, date };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function setTmdbKey(key) {
  update((s) => {
    s.settings = { ...s.settings, tmdbKey: key.trim() };
  });
}

export function toggleFollow(id) {
  update((s) => {
    const show = s.shows[id];
    if (show) s.shows[id] = { ...show, followed: !show.followed };
  });
  markShowDirty(id);
}

// Drop / resume a show. `dropped` is stored as an explicit true/false (never
// deleted) so that cloud sync's "{...remote, ...local}" merge lets the latest
// choice on this device win; droppedAt is an ISO time, or null once resumed
// (null, never undefined — Firestore rejects undefined). Watch history,
// ratings and notes are untouched, and the show stays in the library.
// `at` (optional ISO string) lets Undo put the ORIGINAL drop date back.
export function setShowDropped(id, dropped, at) {
  update((s) => {
    const show = s.shows[id];
    if (!show) return;
    const when = typeof at === 'string' && at ? at : new Date().toISOString();
    s.shows[id] = { ...show, dropped: !!dropped, droppedAt: dropped ? when : null };
  });
  markShowDirty(id);
}

// Watching something is the clearest sign you're back on a dropped show, so
// marking an episode / a season, or logging a rewatch, resumes it (the show page
// offers an Undo). Un-marking never resumes. Returns the patch to spread into
// the show record — empty when the show isn't dropped.
const RESUME = { dropped: false, droppedAt: null };
const resumePatch = (show) => (show.dropped === true ? RESUME : {});

export function setShowRating(id, rating) {
  // rating: 0–5. 0 clears it. ratedAt records when you rated it (for the
  // "Recently rated" list). Rides the existing per-show sync doc.
  update((s) => {
    const show = s.shows[id];
    if (show) {
      s.shows[id] = rating
        ? { ...show, rating, ratedAt: new Date().toISOString() }
        : { ...show, rating: 0 };
    }
  });
  markShowDirty(id);
}

export function setShowPlatform(id, platform) {
  // platform: a PlatformPicker id, or '' to clear. Rides the per-show doc.
  update((s) => {
    const show = s.shows[id];
    if (show) s.shows[id] = { ...show, platform: platform || '' };
  });
  markShowDirty(id);
}

export function setShowUpcoming(id, upcoming) {
  // upcoming: cached list of still-to-air episodes for the calendar/agenda,
  //   [{ s, e, name, air }] sorted-agnostic (the UI sorts). Populated from
  //   TMDB season details (see fetchUpcomingEpisodes in api/tmdb.js). Rides
  //   the per-show sync doc like any other field — no cloud.js change needed.
  update((s) => {
    const show = s.shows[id];
    if (show) s.shows[id] = { ...show, upcoming: upcoming || [], upcomingSynced: new Date().toISOString() };
  });
  markShowDirty(id);
}

export function setShowProviders(id, providers, link) {
  // providers: cached AU streaming list [{ name, logo }] for the show detail
  //   "streaming in Australia" display; link: the TMDB/JustWatch URL. Filled by
  //   the Detect platforms action (see Shows.jsx). Rides the per-show sync doc.
  update((s) => {
    const show = s.shows[id];
    if (show) {
      s.shows[id] = {
        ...show,
        providers: providers || [],
        providersLink: link || '',
        providersSynced: new Date().toISOString(),
      };
    }
  });
  markShowDirty(id);
}

export function setShowAnime(id, anime) {
  // anime: the AniList snapshot from animeLogic.normalizeMedia(), or null to
  //   unlink. Display-only — never touches watched/seasons/episode counts.
  //   Rides the per-show sync doc. Unlinking stores an explicit null rather
  //   than deleting the key: the cloud merge is { ...remote, ...local }, so a
  //   missing key would let the remote copy bring the link back.
  update((s) => {
    const show = s.shows[id];
    if (show) s.shows[id] = { ...show, anime: anime || null };
  });
  markShowDirty(id);
}

export function deleteShow(id) {
  // True delete: remove the record from local state now, and from Firestore on
  // the next sync flush (see cloud.js). Unlike unfollow, which only hides a
  // show, this leaves no lingering record behind on any device.
  update((s) => {
    delete s.shows[id];
  });
  markShowDeleted(id);
}

// ---------------------------------------------------------------------------
// Watchlist ("plan to watch"). `watchlist: true` is independent of
// `followed` — a show can be queued without being in the library yet.
// ---------------------------------------------------------------------------

export function addShowToWatchlist(details) {
  // details: TMDB /tv/{id} response. Same dedupe pattern as addShowFromTmdb:
  // if this show already exists (e.g. imported under a tvdb: key, or already
  // followed), flag the existing record instead of creating a duplicate.
  const existing = Object.entries(getState().shows).find(
    ([, s]) => s.tmdbId === details.id
  );
  const id = existing ? existing[0] : `tmdb:${details.id}`;
  update((s) => {
    if (s.shows[id]) {
      s.shows[id] = { ...s.shows[id], watchlist: true };
      return;
    }
    s.shows[id] = {
      tmdbId: details.id,
      name: details.name,
      followed: false,
      watchlist: true,
      watched: {},
      addedAt: new Date().toISOString(),
      ...tmdbFields(details),
    };
  });
  clearTombstone(id); // deliberately (re-)adding lifts any delete tombstone
  markShowDirty(id);
}

export function toggleWatchlist(id) {
  update((s) => {
    const show = s.shows[id];
    if (show) s.shows[id] = { ...show, watchlist: !show.watchlist };
  });
  markShowDirty(id);
}

export function startWatchingShow(id) {
  // Promote a watchlist show into the library (Up Next / Shows tab).
  update((s) => {
    const show = s.shows[id];
    if (show) s.shows[id] = { ...show, followed: true, watchlist: false };
  });
  markShowDirty(id);
}

export function markEpisode(id, season, episode, runtimeMin, watched = true) {
  update((s) => {
    const show = s.shows[id];
    if (!show) return;
    const map = { ...(show.watched || {}) };
    const k = epKey(season, episode);
    if (watched) {
      map[k] = map[k] || { at: new Date().toISOString(), min: runtimeMin || show.runtimeMin || null, n: 1 };
    } else {
      delete map[k];
    }
    s.shows[id] = { ...show, watched: map, ...(watched ? resumePatch(show) : {}) };
  });
  markShowDirty(id);
}

// `at` (optional ISO string) is when the NEWLY marked episodes were really watched;
// without it they are stamped "now". A chosen date is also remembered as a hand-set
// date (`fixedAt`) so it beats a plain "now" stamp from another device when synced.
const validIso = (s) => typeof s === 'string' && s !== '' && !isNaN(Date.parse(s));

export function markSeason(id, season, episodes, watched = true, at) {
  const when = watched && validIso(at) ? at : null;
  update((s) => {
    const show = s.shows[id];
    if (!show) return;
    const map = { ...(show.watched || {}) };
    for (const ep of episodes) {
      const k = epKey(season, ep.episode_number);
      if (watched) {
        map[k] = map[k] || {
          at: when || new Date().toISOString(),
          min: ep.runtime || show.runtimeMin || null,
          n: 1,
          ...(when ? { fixedAt: new Date().toISOString() } : {}),
        };
      } else {
        delete map[k];
      }
    }
    s.shows[id] = { ...show, watched: map, ...(watched && episodes.length ? resumePatch(show) : {}) };
  });
  markShowDirty(id);
}

// Correct WHEN episodes were watched (e.g. a show logged today that you really saw in
// 2023). Only the date changes: the rewatch count, minutes and notes are untouched.
// Returns { key: previous values } for the entries it changed so the caller can offer
// Undo. Every corrected entry is stamped `fixedAt`, which makes the correction win
// over an older copy of the same episode on another device (see watchedMerge.js).
export function setWatchDates(id, keys, at) {
  const prev = {};
  if (!validIso(at)) return prev;
  update((s) => {
    const show = s.shows[id];
    if (!show) return;
    const map = { ...(show.watched || {}) };
    const stamp = new Date().toISOString();
    for (const k of keys) {
      const w = map[k];
      if (!w || typeof w !== 'object') continue;
      prev[k] = { at: typeof w.at === 'string' ? w.at : null, fixedAt: typeof w.fixedAt === 'string' ? w.fixedAt : null };
      map[k] = { ...w, at, fixedAt: stamp };
    }
    s.shows[id] = { ...show, watched: map };
  });
  if (Object.keys(prev).length) markShowDirty(id);
  return prev;
}

// Undo for setWatchDates. Counts as a newer correction (fresh `fixedAt`), so the undo
// also wins over the corrected copy on a device that was offline at the time.
export function restoreWatchDates(id, prev) {
  update((s) => {
    const show = s.shows[id];
    if (!show || !prev || typeof prev !== 'object') return;
    const map = { ...(show.watched || {}) };
    const stamp = new Date().toISOString();
    for (const [k, p] of Object.entries(prev)) {
      const w = map[k];
      if (!w || !p || typeof p !== 'object') continue;
      const e = { ...w, fixedAt: stamp };
      if (typeof p.at === 'string' && p.at) e.at = p.at; else delete e.at;
      map[k] = e;
    }
    s.shows[id] = { ...show, watched: map };
  });
  markShowDirty(id);
}

// Log an extra watch of an episode you've already seen. markEpisode/markSeason
// are deliberately no-ops on an already-watched episode (map[k] || {...}), so
// this is the only path that bumps the count. `n` is a running total, not a
// per-date history (that's the movies model instead — each movie rewatch is
// its own array entry with its own date) — so Episodes watched / Hours of TV /
// Most watched shows all correctly include every rewatch (they already read
// `n`), but Habits/the activity heatmap only see the most recent watch date,
// since that's all a single map entry can hold. `at` is bumped to now so
// "Watched <date>" on the episode row reflects the latest viewing.
export function logEpisodeRewatch(id, season, episode, runtimeMin) {
  update((s) => {
    const show = s.shows[id];
    if (!show) return;
    const map = { ...(show.watched || {}) };
    const k = epKey(season, episode);
    const existing = map[k];
    map[k] = existing
      ? { ...existing, at: new Date().toISOString(), n: (existing.n || 1) + 1, min: runtimeMin || existing.min }
      : { at: new Date().toISOString(), min: runtimeMin || show.runtimeMin || null, n: 1 };
    s.shows[id] = { ...show, watched: map, ...resumePatch(show) };
  });
  markShowDirty(id);
}

export function addShowFromTmdb(details) {
  // details: TMDB /tv/{id} response
  // If a show with this TMDB id already exists (e.g. imported from TV Time
  // under a tvdb: key and synced), follow that record instead of duplicating.
  const existing = Object.entries(getState().shows).find(
    ([, s]) => s.tmdbId === details.id
  );
  const id = existing ? existing[0] : `tmdb:${details.id}`;
  update((s) => {
    if (s.shows[id]) {
      s.shows[id] = { ...s.shows[id], followed: true };
      return;
    }
    s.shows[id] = {
      tmdbId: details.id,
      name: details.name,
      followed: true,
      watched: {},
      addedAt: new Date().toISOString(),
      ...tmdbFields(details),
    };
  });
  clearTombstone(id); // deliberately (re-)adding lifts any delete tombstone
  markShowDirty(id);
}

export function tmdbFields(d) {
  return {
    tmdbId: d.id,
    poster: d.poster_path || null,
    backdrop: d.backdrop_path || null,
    status: d.status || null,
    totalEpisodes: d.number_of_episodes || null,
    genres: (d.genres || []).map((g) => g.name),
    seasons: (d.seasons || [])
      .filter((x) => x.season_number > 0)
      .map((x) => ({ n: x.season_number, count: x.episode_count, air: x.air_date || null })),
    runtimeMin: (d.episode_run_time && d.episode_run_time[0]) || null,
    nextAir: d.next_episode_to_air
      ? {
          date: d.next_episode_to_air.air_date,
          season: d.next_episode_to_air.season_number,
          episode: d.next_episode_to_air.episode_number,
          name: d.next_episode_to_air.name,
        }
      : null,
    lastSynced: new Date().toISOString(),
  };
}

export function applyTmdbDetails(id, details) {
  update((s) => {
    const show = s.shows[id];
    if (!show) return;
    s.shows[id] = { ...show, ...tmdbFields(details) };
  });
  markShowDirty(id);
}

// ---------------------------------------------------------------------------
// Import from the converter's JSON
// ---------------------------------------------------------------------------

// Restore a WatchNext backup file (what "Download backup" writes). ADDITIVE: it
// brings back what's missing and never deletes or overwrites what you have (see
// backupMerge.js). Restored shows are marked for cloud sync and any delete
// tombstone for them is lifted — like re-importing, restoring is deliberate.
export function restoreBackup(json) {
  const r = mergeBackup(state, json); // throws if the file isn't a backup
  update((s) => {
    s.shows = r.shows;
    s.movies = r.movies;
  });
  r.touchedIds.forEach(markShowDirty);
  r.touchedIds.forEach(clearTombstone);
  if (r.moviesChanged) markMoviesDirty();
  return r.summary;
}

export function importTvTime(json) {
  let shows = 0;
  let watches = 0;
  const touchedIds = [];
  update((s) => {
    for (const src of json.shows || []) {
      const id = `tvdb:${src.tvdbId}`;
      touchedIds.push(id);
      const existing = s.shows[id] || {
        tvdbId: src.tvdbId,
        name: src.name,
        followed: false,
        watched: {},
      };
      const map = { ...existing.watched };
      for (const w of src.watches || []) {
        const k = epKey(w.season, w.episode);
        if (map[k]) {
          map[k] = { ...map[k], n: (map[k].n || 1) + (w.rewatch ? 1 : 0) };
        } else {
          map[k] = { at: w.watchedAt, min: w.runtimeMin, n: 1 };
          watches++;
        }
      }
      s.shows[id] = {
        ...existing,
        name: src.name || existing.name,
        followed: existing.followed || !!src.followed,
        watched: map,
      };
      shows++;
    }
    const seen = new Set(s.movies.map((m) => `${m.name}|${m.watchedAt}`));
    for (const m of json.movies || []) {
      const k = `${m.name}|${m.watchedAt}`;
      if (!seen.has(k)) {
        s.movies = [...s.movies, m];
        seen.add(k);
      }
    }
  });
  touchedIds.forEach(markShowDirty);
  touchedIds.forEach(clearTombstone); // re-importing a show lifts its tombstone
  if ((json.movies || []).length) markMoviesDirty();
  return { shows, watches };
}

export function resetAll() {
  state = empty();
  commit();
}

// Another device wiped the whole account: clear the shows and movies here but
// keep this device's own settings (its TMDB key), and drop any queued uploads so
// nothing stale is pushed back up. Tombstones are left alone.
export function wipeLibrary() {
  state = { ...empty(), settings: state.settings };
  commit();
  dirtyShows = new Set();
  dirtyMovies = false;
  deletedShows = new Set();
}

// ---------------------------------------------------------------------------
// Movie mutations. Movies are a flat list: imported TV Time entries have just
// name/watchedAt/runtimeMin; movies added in-app (or matched later) also carry
// tmdbId, poster and year.
// ---------------------------------------------------------------------------

// Movies added before the watchlist feature have no `status` field at all —
// treat that as 'watched' everywhere so existing entries keep showing up
// exactly as before.
export const movieStatus = (m) => m.status || 'watched';

export function addMovieWatched(details, force = false) {
  // details: TMDB /movie/{id} response
  // force = true logs another watch (a rewatch) as its own dated entry.
  update((s) => {
    const idx = s.movies.findIndex((m) => m.tmdbId === details.id);
    if (idx !== -1 && !force) {
      const existing = s.movies[idx];
      if (movieStatus(existing) === 'planned') {
        // It was queued on the watchlist — promote it instead of a no-op,
        // so "Watched it" from search always does something sensible.
        s.movies = s.movies.map((m, i) =>
          i === idx
            ? { ...m, status: 'watched', watchedAt: new Date().toISOString() }
            : m
        );
      }
      return;
    }
    s.movies = [
      ...s.movies,
      {
        tmdbId: details.id,
        name: details.title,
        status: 'watched',
        watchedAt: new Date().toISOString(),
        runtimeMin: details.runtime || null,
        poster: details.poster_path || null,
        year: (details.release_date || '').slice(0, 4) || null,
      },
    ];
  });
  markMoviesDirty();
}

export function addMovieToWatchlist(details) {
  // details: TMDB /movie/{id} response. Queued, not watched — no watchedAt.
  update((s) => {
    const already = s.movies.some((m) => m.tmdbId === details.id);
    if (already) return;
    s.movies = [
      ...s.movies,
      {
        tmdbId: details.id,
        name: details.title,
        status: 'planned',
        addedAt: new Date().toISOString(),
        runtimeMin: details.runtime || null,
        poster: details.poster_path || null,
        year: (details.release_date || '').slice(0, 4) || null,
      },
    ];
  });
  markMoviesDirty();
}

export function markPlannedMovieWatched(index) {
  update((s) => {
    s.movies = s.movies.map((m, i) =>
      i === index
        ? { ...m, status: 'watched', watchedAt: new Date().toISOString() }
        : m
    );
  });
  markMoviesDirty();
}

// Episode note/reaction. Stored in show.notes (a map keyed "SxE"), NOT in
// show.watched, so un-marking an episode never deletes what you wrote. An empty
// note removes the key (and the whole map when it was the last) — never undefined.
export function setEpisodeNote(showId, epKey, input) {
  if (!state.shows[showId]) return;
  update((s) => {
    const show = s.shows[showId];
    s.shows[showId] = withNotes(show, setNoteIn(show.notes, epKey, input, new Date().toISOString()));
  });
  markShowDirty(showId);
}
// Movie thoughts live on the watch entry itself (react + note), so each viewing
// — including a rewatch — has its own. Rides the existing movies sync doc.
export function setMovieNote(index, input) {
  update((s) => {
    s.movies = s.movies.map((m, i) => (i === index ? withMovieNote(m, input) : m));
  });
  markMoviesDirty();
}
export function setMovieRating(index, rating) {
  // rating: 0–5. 0 clears it. ratedAt records when you rated it. Rides the
  // existing movies sync doc.
  update((s) => {
    s.movies = s.movies.map((m, i) =>
      i === index
        ? (rating ? { ...m, rating, ratedAt: new Date().toISOString() } : { ...m, rating: 0 })
        : m
    );
  });
  markMoviesDirty();
}

export function setMoviePlatform(index, platform) {
  update((s) => {
    s.movies = s.movies.map((m, i) =>
      i === index ? { ...m, platform: platform || '' } : m
    );
  });
  markMoviesDirty();
}

export function removeMovie(index) {
  update((s) => {
    s.movies = s.movies.filter((_, i) => i !== index);
  });
  markMoviesDirty();
}

export function updateMovie(index, patch) {
  update((s) => {
    s.movies = s.movies.map((m, i) => (i === index ? { ...m, ...patch } : m));
  });
  markMoviesDirty();
}
