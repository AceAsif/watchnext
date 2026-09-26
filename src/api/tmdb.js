// Thin TMDB v3 client. The API key comes from Settings (stored locally)
// or from a VITE_TMDB_API_KEY env var at build time.

import { getState } from '../store/db.js';

const BASE = 'https://api.themoviedb.org/3';

export function apiKey() {
  return getState().settings.tmdbKey || import.meta.env.VITE_TMDB_API_KEY || '';
}

export function hasKey() {
  return !!apiKey();
}

async function get(path, params = {}) {
  const key = apiKey();
  if (!key) throw new Error('No TMDB API key set. Add one in Settings.');
  const q = new URLSearchParams({ api_key: key, ...params });
  const res = await fetch(`${BASE}${path}?${q}`);
  if (res.status === 429) {
    // basic backoff on rate limit
    await new Promise((r) => setTimeout(r, 1500));
    return get(path, params);
  }
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
  return res.json();
}

export const img = (path, size = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

export function searchShows(query) {
  return get('/search/tv', { query });
}

export function searchMovies(query) {
  return get('/search/movie', { query });
}

export function movieDetails(tmdbId) {
  return get(`/movie/${tmdbId}`);
}

export async function findByTvdb(tvdbId) {
  const data = await get(`/find/${tvdbId}`, { external_source: 'tvdb_id' });
  return (data.tv_results && data.tv_results[0]) || null;
}

export function showDetails(tmdbId) {
  return get(`/tv/${tmdbId}`);
}

export function seasonDetails(tmdbId, seasonNumber) {
  return get(`/tv/${tmdbId}/season/${seasonNumber}`);
}

// Every still-to-air episode of a show's currently-airing season, for the
// Up Next agenda / calendar. Needs the show to have been TMDB-synced already
// (so nextAir tells us which season to pull). Returns [{ s, e, name, air }],
// only episodes with an air date of today or later. Shows with no scheduled
// next episode (ended, or between seasons) return []. One API call per show.
export async function fetchUpcomingEpisodes(show) {
  const tmdbId = show.tmdbId;
  const season = show.nextAir && show.nextAir.season;
  if (!tmdbId || !season) return [];
  const data = await seasonDetails(tmdbId, season);
  const today = new Date().toISOString().slice(0, 10);
  return (data.episodes || [])
    .filter((ep) => ep.air_date && ep.air_date >= today)
    .map((ep) => ({
      s: ep.season_number,
      e: ep.episode_number,
      name: ep.name || '',
      air: ep.air_date,
    }));
}

// Resolve + enrich one show record. Returns TMDB details or null.
export async function resolveShow(show) {
  let tmdbId = show.tmdbId;
  if (!tmdbId && show.tvdbId) {
    const hit = await findByTvdb(show.tvdbId);
    if (!hit) return null;
    tmdbId = hit.id;
  }
  if (!tmdbId) return null;
  return showDetails(tmdbId);
}
