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
