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
  state = { ...state };
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

export function markShowDirty(id) {
  dirtyShows.add(id);
}

export function markMoviesDirty() {
  dirtyMovies = true;
}

export function takeDirty() {
  const showIds = dirtyShows;
  const movies = dirtyMovies;
  dirtyShows = new Set();
  dirtyMovies = false;
  return { showIds, movies };
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
    s.shows[id] = { ...show, watched: map };
  });
  markShowDirty(id);
}

export function markSeason(id, season, episodes, watched = true) {
  update((s) => {
    const show = s.shows[id];
    if (!show) return;
    const map = { ...(show.watched || {}) };
    for (const ep of episodes) {
      const k = epKey(season, ep.episode_number);
      if (watched) {
        map[k] = map[k] || {
          at: new Date().toISOString(),
          min: ep.runtime || show.runtimeMin || null,
          n: 1,
        };
      } else {
        delete map[k];
      }
    }
    s.shows[id] = { ...show, watched: map };
  });
  markShowDirty(id);
}

export function addShowFromTmdb(details) {
  // details: TMDB /tv/{id} response
  const id = `tmdb:${details.id}`;
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
  markShowDirty(id);
}

export function tmdbFields(d) {
  return {
    tmdbId: d.id,
    poster: d.poster_path || null,
    backdrop: d.backdrop_path || null,
    status: d.status || null,
    totalEpisodes: d.number_of_episodes || null,
    seasons: (d.seasons || [])
      .filter((x) => x.season_number > 0)
      .map((x) => ({ n: x.season_number, count: x.episode_count })),
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
  if ((json.movies || []).length) markMoviesDirty();
  return { shows, watches };
}

export function resetAll() {
  state = empty();
  commit();
}
