// PURE: turns the app state into three flat CSV tables for Power BI / Excel.
// No DOM, no store, no localStorage — unit-tested with plain node.
//
//   episodes  one row per watched episode (the fact table)
//   shows     one row per show record (library, watchlist, dropped…)
//   movies    one row per movie entry (watched or planned)
//
// Files are UTF-8 with a BOM (so Excel reads Japanese titles correctly), CRLF
// line endings and RFC 4180 quoting. Booleans are true/false, missing values
// are empty cells, dates are ISO. Nothing here includes settings or the TMDB key.

import { BATCH_MIN } from './statsLogic.js';
import { showStatus } from './libraryLogic.js';
import { reactionById } from '../store/notes.js';

const BOM = '\uFEFF';
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ------------------------------------------------------------------ cells
// Text that starts with = + - @ (or tab / CR) can be run as a formula when the
// file is opened in Excel, so such TEXT cells get a leading apostrophe.
// (Numbers and dates are never touched.)
export function safeText(v) {
  const s = v == null ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

export function csvCell(v, text = false) {
  if (v == null) return '';
  let s = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
  if (text) s = safeText(s);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// columns: [{ h: 'header', text?: true }, …]; rows: arrays in the same order.
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.h)).join(',')];
  for (const r of rows) lines.push(columns.map((c, i) => csvCell(r[i], c.text)).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

export function csvFileName(kind, isoDate) {
  return `watchnext-${kind}-${isoDate}.csv`;
}

// ------------------------------------------------------------------ dates
const p2 = (n) => String(n).padStart(2, '0');
// The calendar date / clock time of an instant on THIS device (Hobart for
// Asif), unlike the UTC date stored in the file. Date-only strings pass through.
export function localDate(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export function localTime(iso) {
  if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

// ------------------------------------------------------------------ helpers
const H = { watchedCount: (s) => Object.keys((s && s.watched) || {}).length };
const reactionLabel = (id) => {
  const r = reactionById(id);
  return r ? r.label : '';
};
const genresOf = (s) => (Array.isArray(s.genres) ? s.genres.join('|') : '');
const isShowEntry = ([id, s]) => !BAD_KEYS.has(id) && s && typeof s === 'object';
const sortedShows = (state) =>
  Object.entries((state && state.shows) || {})
    .filter(isShowEntry)
    .sort((a, b) => String(a[1].name || '').localeCompare(String(b[1].name || '')) || a[0].localeCompare(b[0]));

// ------------------------------------------------------------------ episodes
export const EPISODE_COLUMNS = [
  { h: 'show_id' }, { h: 'tmdb_id' }, { h: 'show_name', text: true }, { h: 'season' }, { h: 'episode' },
  { h: 'watched_at_utc' }, { h: 'watched_date_local' }, { h: 'watched_time_local' },
  { h: 'watch_count' }, { h: 'runtime_min' }, { h: 'is_bulk_import' },
  { h: 'platform', text: true }, { h: 'show_status' }, { h: 'in_library' }, { h: 'dropped' },
  { h: 'genres', text: true }, { h: 'reaction', text: true }, { h: 'note', text: true },
];

// "Bulk import" uses the same rule as Stats: a minute with >= BATCH_MIN watches
// (across all shows) is one dump of history, not real viewing — so Power BI
// can filter it out exactly like the app does.
export function episodeRows(state) {
  const shows = sortedShows(state);
  const perMinute = new Map();
  for (const [, s] of shows) {
    for (const w of Object.values(s.watched || {})) {
      if (w && w.at) {
        const m = String(w.at).slice(0, 16);
        perMinute.set(m, (perMinute.get(m) || 0) + 1);
      }
    }
  }
  const rows = [];
  for (const [id, s] of shows) {
    const status = showStatus(s, H);
    for (const [key, w] of Object.entries(s.watched || {})) {
      if (BAD_KEYS.has(key) || !w || typeof w !== 'object') continue;
      const m = /^(\d+)x(\d+)$/.exec(key);
      if (!m) continue;
      const note = s.notes && s.notes[key];
      rows.push([
        id, s.tmdbId != null ? s.tmdbId : '', s.name || '', +m[1], +m[2],
        w.at || '', localDate(w.at), localTime(w.at),
        w.n || 1, w.min != null ? w.min : s.runtimeMin != null ? s.runtimeMin : '',
        w.at ? (perMinute.get(String(w.at).slice(0, 16)) || 0) >= BATCH_MIN : false,
        s.platform || '', status, !!s.followed, s.dropped === true,
        genresOf(s), note ? reactionLabel(note.react) : '', note && note.text ? note.text : '',
      ]);
    }
  }
  rows.sort((a, b) => String(a[5]).localeCompare(String(b[5])) || String(a[2]).localeCompare(String(b[2])) || a[3] - b[3] || a[4] - b[4]);
  return rows;
}

// ------------------------------------------------------------------ shows
export const SHOW_COLUMNS = [
  { h: 'show_id' }, { h: 'tmdb_id' }, { h: 'name', text: true },
  { h: 'in_library' }, { h: 'on_watchlist' }, { h: 'status' }, { h: 'dropped' }, { h: 'dropped_at_utc' },
  { h: 'platform', text: true }, { h: 'rating' }, { h: 'rated_at_utc' }, { h: 'added_at_utc' },
  { h: 'tmdb_status', text: true }, { h: 'total_episodes' }, { h: 'episodes_watched' }, { h: 'progress_pct' },
  { h: 'runtime_min' }, { h: 'genres', text: true }, { h: 'first_watched_at_utc' }, { h: 'last_watched_at_utc' },
  { h: 'is_anime' },
];

export function showRows(state) {
  return sortedShows(state).map(([id, s]) => {
    const seen = H.watchedCount(s);
    const total = s.totalEpisodes || 0;
    const ats = Object.values(s.watched || {}).map((w) => w && w.at).filter(Boolean).sort();
    return [
      id, s.tmdbId != null ? s.tmdbId : '', s.name || '',
      !!s.followed, !!s.watchlist, showStatus(s, H), s.dropped === true, s.droppedAt || '',
      s.platform || '', s.rating || '', s.ratedAt || '', s.addedAt || '',
      s.status || '', total || '', seen, total ? Math.min(100, Math.round((seen / total) * 100)) : '',
      s.runtimeMin != null ? s.runtimeMin : '', genresOf(s), ats[0] || '', ats[ats.length - 1] || '',
      !!(s.anime && s.anime.id),
    ];
  });
}

// ------------------------------------------------------------------ movies
export const MOVIE_COLUMNS = [
  { h: 'tmdb_id' }, { h: 'name', text: true }, { h: 'status' },
  { h: 'watched_at' }, { h: 'watched_date_local' }, { h: 'rating' }, { h: 'rated_at_utc' },
  { h: 'platform', text: true }, { h: 'runtime_min' }, { h: 'year' },
  { h: 'reaction', text: true }, { h: 'note', text: true },
];

export function movieRows(state) {
  const list = Array.isArray(state && state.movies) ? state.movies.filter((m) => m && typeof m === 'object') : [];
  return list
    .map((m) => [
      m.tmdbId != null ? m.tmdbId : '', m.name || '', m.status || 'watched',
      m.watchedAt || '', localDate(m.watchedAt), m.rating || '', m.ratedAt || '',
      m.platform || '', m.runtimeMin != null ? m.runtimeMin : '', m.year || '',
      reactionLabel(m.react), m.note || '',
    ])
    .sort((a, b) => String(a[3]).localeCompare(String(b[3])) || String(a[1]).localeCompare(String(b[1])));
}

// ------------------------------------------------------------------ one call
export const CSV_KINDS = {
  episodes: { columns: EPISODE_COLUMNS, rows: episodeRows, noun: ['episode', 'episodes'] },
  shows: { columns: SHOW_COLUMNS, rows: showRows, noun: ['show', 'shows'] },
  movies: { columns: MOVIE_COLUMNS, rows: movieRows, noun: ['movie', 'movies'] },
};

// → { text, count, fileName } for 'episodes' | 'shows' | 'movies'
export function buildCsv(kind, state, isoDate) {
  const k = CSV_KINDS[kind];
  if (!k) throw new Error('Unknown export: ' + kind);
  const rows = k.rows(state);
  return { text: toCsv(k.columns, rows), count: rows.length, fileName: csvFileName(kind, isoDate) };
}

export function csvDoneText(kind, count) {
  const [one, many] = CSV_KINDS[kind].noun;
  return `Saved ${count.toLocaleString()} ${count === 1 ? one : many} as a CSV file.`;
}
