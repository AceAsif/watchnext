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

export function watchProviders(kind, tmdbId) {
  // kind: 'tv' | 'movie'. Returns the Australian providers block
  // ({ flatrate, rent, buy, link, ... }) or null when TMDB has none for AU.
  return get(`/${kind}/${tmdbId}/watch/providers`).then(
    (d) => (d && d.results && d.results.AU) || null
  );
}

// Discover: "because you liked X" recommendations, with a similar-titles
// fallback for shows/movies too niche to have recommendation data. page lets
// callers vary the results on refresh; not required otherwise.
// Movie night: TMDB's own "discover" search. TMDB filters server-side by region, streaming
// provider, runtime and genre, so what comes back is already on the services asked for.
export function discoverMovies(params) {
  return get('/discover/movie', params);
}

// The streaming providers TMDB knows in a region ({ results: [{ provider_id, provider_name }] }),
// so our service names (Netflix, Stan…) can be turned into TMDB's provider ids.
export function movieProviderList(region = 'AU') {
  return get('/watch/providers/movie', { watch_region: region });
}

export function tvRecommendations(tmdbId, page = 1) {
  return get(`/tv/${tmdbId}/recommendations`, { page });
}
export function movieRecommendations(tmdbId, page = 1) {
  return get(`/movie/${tmdbId}/recommendations`, { page });
}
export function tvSimilar(tmdbId, page = 1) {
  return get(`/tv/${tmdbId}/similar`, { page });
}
export function movieSimilar(tmdbId, page = 1) {
  return get(`/movie/${tmdbId}/similar`, { page });
}

// Show details + cast & crew in ONE request (append_to_response), for the
// show page's Cast card. The response carries created_by:[{id,name,…}] plus
// aggregate_credits:{cast,crew}. aggregate_credits (not plain credits) rolls a
// person's work up across every season, so recurring cast aren't duplicated:
// cast entries have roles:[{character, episode_count}]; crew entries have
// jobs:[{job, episode_count}] + department.
export function tvDetailsWithCredits(tmdbId) {
  return get(`/tv/${tmdbId}`, { append_to_response: 'aggregate_credits' });
}

// Everything a person is credited in (TV + film), for the "what else are they
// in" panel. Returns { cast:[...], crew:[...] }; each entry has media_type,
// id, title|name, poster_path, character|job, first_air_date|release_date,
// vote_count, popularity.
export function personCombinedCredits(personId) {
  return get(`/person/${personId}/combined_credits`);
}

export function tvVideos(tmdbId) {
  return get(`/tv/${tmdbId}/videos`);
}
export function movieVideos(tmdbId) {
  return get(`/movie/${tmdbId}/videos`);
}

// Picks the best trailer/teaser from a TMDB videos response: an official
// YouTube trailer first, then any YouTube trailer, then a teaser, then
// whatever YouTube video is left. Returns { key, name } or null.
export function pickTrailer(videosResponse) {
  const yt = ((videosResponse && videosResponse.results) || []).filter(
    (v) => v.site === 'YouTube'
  );
  const byType = (t) =>
    yt.find((v) => v.type === t && v.official) || yt.find((v) => v.type === t);
  return byType('Trailer') || byType('Teaser') || yt[0] || null;
}
