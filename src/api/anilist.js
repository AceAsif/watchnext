// Minimal AniList GraphQL client — read-only public data, no account, no
// OAuth, no API key. One POST per user action; never retries on its own.
//
// AniList's documented limit is 90 requests/minute but the docs currently say
// the API is degraded to 30/minute, so this client deliberately does NOT loop
// or auto-retry: a 429 is surfaced as a message and the user decides.

import { normalizeMedia } from '../components/animeLogic.js';

const ENDPOINT = 'https://graphql.anilist.co';
const TIMEOUT_MS = 10000;

// kind: 'network' | 'timeout' | 'rate' | 'graphql' | 'http'
export class AniListError extends Error {
  constructor(message, kind, status = 0) {
    super(message);
    this.name = 'AniListError';
    this.kind = kind;
    this.status = status;
  }
}

const MEDIA_FIELDS = `
  id
  idMal
  siteUrl
  title { romaji english native }
  format
  status
  episodes
  duration
  season
  seasonYear
  genres
  averageScore
  studios { nodes { name isAnimationStudio } }
  nextAiringEpisode { episode airingAt }
`;

// SEARCH_MATCH orders by relevance. It's the one enum value here that couldn't
// be cross-checked against the reference, so searchAnime() falls back to the
// same query without `sort` if the API rejects it (HTTP 400 validation error).
const SEARCH_SORTED = `query ($q: String) {
  Page(page: 1, perPage: 8) {
    media(search: $q, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
  }
}`;
const SEARCH_PLAIN = `query ($q: String) {
  Page(page: 1, perPage: 8) {
    media(search: $q, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} }
  }
}`;
const BY_ID = `query ($id: Int) {
  Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} }
}`;

async function post(query, variables) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new AniListError('AniList took too long to respond. Try again in a moment.', 'timeout');
    }
    throw new AniListError(
      'Couldn’t reach AniList. Check your connection (or whether something is blocking it) and try again.',
      'network'
    );
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }

  if (res.status === 429) {
    // Retry-After is only readable if the server exposes it to browsers.
    const wait = Number(res.headers && res.headers.get && res.headers.get('Retry-After'));
    const secs = Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : 60;
    throw new AniListError(`AniList is rate-limiting requests. Try again in about ${secs}s.`, 'rate', 429);
  }

  const gqlMsg = body && body.errors && body.errors[0] && body.errors[0].message;
  if (!res.ok || (body && body.errors && body.errors.length && !body.data)) {
    throw new AniListError(
      gqlMsg || `AniList returned an error (${res.status}).`,
      res.status === 400 ? 'graphql' : 'http',
      res.status
    );
  }
  if (!body || !body.data) {
    throw new AniListError('AniList sent a response this app couldn’t read.', 'http', res.status);
  }
  return body.data;
}

// Free-text title search. Returns normalized snapshots (see animeLogic).
export async function searchAnime(query) {
  const q = (query || '').trim();
  if (!q) return [];
  let data;
  try {
    data = await post(SEARCH_SORTED, { q });
  } catch (e) {
    if (e instanceof AniListError && e.kind === 'graphql') {
      data = await post(SEARCH_PLAIN, { q }); // at most one fallback request
    } else {
      throw e;
    }
  }
  const items = (data.Page && data.Page.media) || [];
  return items.map((m) => normalizeMedia(m)).filter(Boolean);
}

// Re-fetch one entry by its AniList id (the "Refresh" button).
export async function fetchAnime(id) {
  const data = await post(BY_ID, { id });
  const a = normalizeMedia(data.Media);
  if (!a) throw new AniListError('AniList no longer has that entry. Try “Change match”.', 'http', 404);
  return a;
}
