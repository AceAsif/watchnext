// PURE: "What should I watch tonight?" — suggestions sized to the time you have and the
// mood you're in. No DOM, no store (the store helpers it needs are passed in).
//
// Where suggestions come from
//   continue  a show you're part-way through with an episode that's out (Up Next's "Continue
//             watching"): it can fit several episodes if the time allows
//   start     a show on your Watchlist (not started): begins with its first episode
//   movie     a movie on your Watchlist (planned): it must fit entirely
// Dropped and finished shows are never suggested. Runtimes are the ones already stored
// (episode runtime on the show; minutes on watched episodes; runtime on the movie).

import { buildUpNext, daysBetween, codeOf } from './upnextLogic.js';
import { nextToMark } from './showLogic.js';
import { isEpKey, cleanNote } from '../store/notes.js';
import { isOnMyServices, servicesLabel } from './servicesLogic.js';

export const TIME_CHOICES = [20, 30, 45, 60, 90, 120, 180];
export const DEFAULT_MINUTES = 45;
export const DEFAULT_RUNTIME = 40; // when a show has no stored runtime at all (marked "about")
export const DEFAULT_MOVIE_RUNTIME = 105;
export const MAX_EPISODES = 6; // never suggest "binge 9 episodes"; cap what we say fits
export const PICKS = 3;

export const MOODS = [
  { id: 'any', label: 'Surprise me', genres: [] },
  { id: 'funny', label: 'Make me laugh', genres: ['Comedy', 'Animation', 'Family'] },
  { id: 'feelgood', label: 'Feel-good', genres: ['Comedy', 'Family', 'Romance', 'Music'] },
  { id: 'gripping', label: 'Edge of my seat', genres: ['Crime', 'Mystery', 'Thriller', 'Horror'] },
  { id: 'escape', label: 'Escape somewhere', genres: ['Sci-Fi & Fantasy', 'Science Fiction', 'Fantasy', 'Adventure', 'Action & Adventure', 'Action', 'Western'] },
  { id: 'thoughtful', label: 'Something thoughtful', genres: ['Drama', 'Documentary', 'History', 'War', 'War & Politics'] },
];
export const moodById = (id) => MOODS.find((m) => m.id === id) || MOODS[0];

export function formatMinutes(m) {
  const n = Math.round(Number(m));
  if (!(n > 0)) return '';
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60), r = n % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

const pos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);
const BAD = new Set(['__proto__', 'constructor', 'prototype']);

export function episodeRuntime(show) {
  const r = pos(show && show.runtimeMin);
  if (r) return { min: r, approx: false };
  const mins = Object.values((show && show.watched) || {}).map((w) => pos(w && w.min)).filter(Boolean).sort((a, b) => a - b);
  if (mins.length) return { min: mins[Math.floor(mins.length / 2)], approx: false }; // median of what you actually watched
  return { min: DEFAULT_RUNTIME, approx: true };
}
export function movieRuntime(m) {
  const r = pos(m && m.runtimeMin);
  return r ? { min: r, approx: false } : { min: DEFAULT_MOVIE_RUNTIME, approx: true };
}

// How many 😍 / 😂 reactions you've left on a show's episodes.
export function reactionCounts(show) {
  let love = 0, funny = 0;
  for (const [k, n] of Object.entries((show && show.notes) || {})) {
    if (!isEpKey(k) || !n || typeof n !== 'object') continue;
    const r = cleanNote({ react: n.react, text: n.text }).react;
    if (r === 'love') love++; else if (r === 'funny') funny++;
  }
  return { love, funny };
}

// ------------------------------------------------------------------ candidates
// h = { watchedCount, lastWatchDate } (the store's helpers).
export function buildCandidates(state, today, h) {
  const out = [];
  const shows = Object.entries((state && state.shows) || {}).filter(([id, s]) => !BAD.has(id) && s && typeof s === 'object');
  const { cont } = buildUpNext(shows, today, h);

  for (const { id, show, next } of cont) {
    const total = pos(show.totalEpisodes), seen = h.watchedCount(show);
    const unaired = Array.isArray(show.upcoming) ? show.upcoming.filter((ep) => ep.air >= today).length : show.nextAir && show.nextAir.date >= today ? 1 : 0;
    out.push({
      key: 's:' + id, kind: 'continue', id, tmdbId: show.tmdbId, name: String(show.name || 'Untitled'), poster: show.poster || null,
      genres: Array.isArray(show.genres) ? show.genres : [], runtime: episodeRuntime(show),
      avail: total ? Math.max(1, total - seen - unaired) : 99, next, seen, total, lastWatch: h.lastWatchDate(show) || '',
      ...reactionCounts(show), rec: show,
    });
  }
  for (const [id, show] of shows) {
    if (show.followed || !show.watchlist || show.dropped === true) continue;
    const next = nextToMarkSafe(show, today);
    if (next === false) continue; // its first season isn't out yet
    const total = pos(show.totalEpisodes);
    out.push({
      key: 's:' + id, kind: 'start', id, tmdbId: show.tmdbId, name: String(show.name || 'Untitled'), poster: show.poster || null,
      genres: Array.isArray(show.genres) ? show.genres : [], runtime: episodeRuntime(show), avail: total || 99, next, seen: 0, total, lastWatch: '',
      ...reactionCounts(show), rec: show,
    });
  }
  (Array.isArray(state && state.movies) ? state.movies : []).forEach((m, index) => {
    if (!m || typeof m !== 'object' || m.status !== 'planned') return;
    out.push({
      key: 'm:' + (m.tmdbId != null ? m.tmdbId : m.name) + ':' + index, kind: 'movie', index, tmdbId: m.tmdbId, name: String(m.name || 'Untitled'), poster: m.poster || null, year: m.year || '',
      genres: Array.isArray(m.genres) ? m.genres : null, // null = never fetched (shows have [] when TMDB lists none)
      runtime: movieRuntime(m), avail: 1, next: null, seen: 0, total: 1, lastWatch: '', love: 0, funny: 0, rec: m,
    });
  });
  return out;
}

// First episode of a not-yet-started show: { season, episode } | null (no season data yet) | false (not out yet).
function nextToMarkSafe(show, today) {
  const hasSeasons = (show.seasons || []).some((se) => se.n >= 1 && se.count > 0);
  if (!hasSeasons) return null;
  const n = nextToMark(show, today);
  return n || false;
}

// ------------------------------------------------------------------ fitting
export function fitFor(c, minutes) {
  const r = c.runtime.min;
  if (c.kind === 'movie') return r <= minutes ? { fits: true, episodes: 1, used: r, spare: minutes - r } : { fits: false, episodes: 0, used: 0, spare: 0 };
  const n = Math.floor(minutes / r);
  if (n < 1) return { fits: false, episodes: 0, used: 0, spare: 0 };
  const episodes = Math.min(n, c.avail, MAX_EPISODES);
  return { fits: true, episodes, used: episodes * r, spare: minutes - episodes * r };
}

export function moodState(c, mood) {
  const M = moodById(mood);
  if (M.id === 'any') return null;
  if (!c.genres || c.genres.length === 0) return 'unknown'; // we don't know its genres (yet)
  return c.genres.some((g) => M.genres.includes(g)) ? 'match' : 'no';
}

// Deterministic jitter so "Another" can reshuffle: a different seed, a different tie-break.
function jitter(seed, key) {
  let x = Math.imul((seed | 0) + 1, 2654435761) >>> 0;
  for (let i = 0; i < key.length; i++) x = Math.imul(x ^ key.charCodeAt(i), 16777619) >>> 0;
  return (x % 700) / 100; // 0 .. 7
}

function recency(c, today) {
  if (c.kind !== 'continue' || !c.lastWatch) return 0;
  const d = daysBetween(c.lastWatch.slice(0, 10), today);
  return d == null ? 0 : d <= 3 ? 10 : d <= 7 ? 7 : d <= 14 ? 4 : 0;
}

// opts: { minutes, mood, seed, exclude:Set<key>, mine:Set<platformId>|null, onlyMine, today }
// -> { picks: [...], fitting, matching, wrapped }   (picks carry fit, moodState, score)
export function suggest(cands, opts = {}) {
  const minutes = TIME_CHOICES.includes(opts.minutes) ? opts.minutes : DEFAULT_MINUTES;
  const mood = moodById(opts.mood).id;
  const mine = opts.mine || null;
  const rows = [];
  for (const c of cands) {
    const fit = fitFor(c, minutes);
    if (!fit.fits) continue;
    if (opts.onlyMine && !(mine && isOnMyServices(c.rec, mine))) continue;
    const ms = moodState(c, mood);
    const where = mine ? servicesLabel(c.rec, mine) : '';
    let score = 30 * (fit.used / minutes) + (c.kind === 'continue' ? 25 + recency(c, opts.today) : c.kind === 'start' ? 12 : 10);
    score += ms === 'match' ? 40 : ms === 'unknown' ? 8 : 0;
    if (mood === 'funny' && c.funny) score += 8;
    if (c.love) score += 6;
    if (where) score += 6;
    score += jitter(opts.seed || 0, c.key);
    rows.push({ ...c, fit, moodState: ms, where, score });
  }
  const rank = (r) => (r.moodState === 'no' ? 2 : r.moodState === 'unknown' ? 1 : 0); // matches first, then "we don't know", then non-matches
  rows.sort((a, b) => rank(a) - rank(b) || b.score - a.score || a.key.localeCompare(b.key));

  const exclude = opts.exclude instanceof Set ? opts.exclude : new Set();
  let pool = rows.filter((r) => !exclude.has(r.key));
  let wrapped = false;
  if (!pool.length && rows.length) { pool = rows; wrapped = true; } // seen them all: start over
  return { picks: pool.slice(0, PICKS), fitting: rows.length, matching: rows.filter((r) => r.moodState === 'match').length, wrapped };
}

// ------------------------------------------------------------------ wording
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export function whyLines(p, minutes) {
  const lines = [];
  const approx = p.runtime.approx ? '~' : '';
  if (p.kind === 'continue') {
    lines.push(p.next ? `Next up: ${codeOf(p.next.season, p.next.episode)}` : 'Pick up where you left off');
    if (p.avail > 1 && p.avail < 99) lines.push(`${p.avail} episodes waiting`);
    lines.push(`Fits ${plural(p.fit.episodes, 'episode', 'episodes')} · ${approx}${p.fit.used} min`);
  } else if (p.kind === 'start') {
    lines.push(p.next ? `Start with ${codeOf(p.next.season, p.next.episode)}` : 'Start from the beginning');
    lines.push(`${approx}${p.runtime.min} min an episode · fits ${plural(p.fit.episodes, 'episode', 'episodes')}`);
  } else {
    lines.push(`${approx}${p.runtime.min} min${p.runtime.approx ? ' (runtime not stored)' : ''}`);
    if (p.fit.spare >= 5) lines.push(`${formatMinutes(p.fit.spare)} to spare`);
  }
  return lines;
}
export function moodNote(p, mood) {
  const M = moodById(mood);
  if (M.id === 'any') return '';
  return p.moodState === 'match' ? `Matches “${M.label}”` : p.moodState === 'unknown' ? 'Genres not known yet' : 'Closest fit, not a mood match';
}
export function emptyText(minutes, mood, onlyMine) {
  const M = moodById(mood);
  return `Nothing on your Up Next or Watchlist fits ${formatMinutes(minutes)}${onlyMine ? ' on your services' : ''}${M.id === 'any' ? '' : ` for “${M.label}”`}. Try more time${onlyMine ? ', switching off “On my services”,' : ''} or a different mood.`;
}

// ------------------------------------------------------------------ remembered choices (per device)
export const PREFS_KEY = 'watchnext-tonight-v1';
export function sanitizePrefs(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { minutes: TIME_CHOICES.includes(r.minutes) ? r.minutes : DEFAULT_MINUTES, mood: MOODS.some((m) => m.id === r.mood) ? r.mood : 'any', onlyMine: r.onlyMine === true };
}
export function loadPrefs(storage) { try { return sanitizePrefs(JSON.parse(storage.getItem(PREFS_KEY))); } catch (e) { return sanitizePrefs(null); } }
export function savePrefs(storage, prefs) { try { storage.setItem(PREFS_KEY, JSON.stringify(sanitizePrefs(prefs))); } catch (e) { /* blocked: just not remembered */ } }
