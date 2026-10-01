// Pure logic for the AniList "Anime details" feature. No React, no network, no
// store imports, so it can be unit-tested with plain node.
//
// What gets stored on a show is a small, display-only snapshot (show.anime).
// It never feeds back into watch history, seasons or episode counts.
//
// IMPORTANT: that snapshot is written to Firestore with batch.set(), which
// throws on `undefined`. So every field here is a real value or `null` —
// never `undefined` — and normalizeMedia() is the only place that builds it.

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Raw AniList Media object -> the snapshot we store (or null if unusable).
// `nowIso` is injectable so tests can pin syncedAt.
export function normalizeMedia(m, nowIso = new Date().toISOString()) {
  if (!m || !Number.isInteger(m.id)) return null;
  const t = m.title || {};

  // Studios: keep animation studios (AniList also lists licensors/producers
  // as studios with isAnimationStudio:false), at most three.
  const studios = ((m.studios && m.studios.nodes) || [])
    .filter((s) => s && s.isAnimationStudio !== false && str(s.name))
    .map((s) => s.name.trim())
    .slice(0, 3);

  // Next airing episode: AniList gives unix seconds; store ISO.
  let next = null;
  const nae = m.nextAiringEpisode;
  if (nae && num(nae.airingAt) !== null && num(nae.episode) !== null) {
    const d = new Date(nae.airingAt * 1000);
    if (Number.isFinite(d.getTime())) next = { episode: nae.episode, at: d.toISOString() };
  }

  return {
    id: m.id,
    malId: num(m.idMal),
    url: str(m.siteUrl),
    title: { english: str(t.english), romaji: str(t.romaji), native: str(t.native) },
    format: str(m.format),
    status: str(m.status),
    episodes: num(m.episodes),
    duration: num(m.duration),
    season: str(m.season),
    year: num(m.seasonYear),
    genres: (m.genres || []).filter((g) => str(g)).map((g) => g.trim()).slice(0, 8),
    studios,
    score: num(m.averageScore),
    next,
    syncedAt: nowIso,
  };
}

// Deep check used by tests (and handy in a console): true if the object
// contains `undefined` anywhere, which Firestore would reject.
export function hasUndefined(v) {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.some(hasUndefined);
  if (v && typeof v === 'object') return Object.values(v).some(hasUndefined);
  return false;
}

// ---------------------------------------------------------------- titles
export const titleOf = (a) =>
  (a && a.title && (a.title.english || a.title.romaji || a.title.native)) || 'Untitled';

// Lowercase, strip accents and punctuation; keeps Japanese characters so
// native titles still compare. Used only for "is this the same title" hints.
export function normTitle(s) {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, '');
}

// Does this AniList entry carry exactly the same title as the show? Drives the
// "Exact title match" tag so the obvious pick stands out in the results.
export function titlesMatch(name, anime) {
  const n = normTitle(name);
  if (!n || !anime || !anime.title) return false;
  return [anime.title.english, anime.title.romaji, anime.title.native].some(
    (t) => normTitle(t) === n
  );
}

// Alternate titles worth showing under the show's own name (native script
// and romaji), skipping anything that's just the name again.
export function altTitles(show, anime) {
  if (!anime || !anime.title) return [];
  const have = new Set([normTitle(show && show.name)]);
  const out = [];
  for (const t of [anime.title.native, anime.title.romaji, anime.title.english]) {
    const k = normTitle(t);
    if (t && k && !have.has(k)) {
      have.add(k);
      out.push(t);
    }
  }
  return out.slice(0, 2);
}

// ---------------------------------------------------------------- labels
const FORMATS = {
  TV: 'TV', TV_SHORT: 'TV short', MOVIE: 'Movie', SPECIAL: 'Special',
  OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music',
};
const STATUSES = {
  FINISHED: 'Finished', RELEASING: 'Airing', NOT_YET_RELEASED: 'Not yet released',
  CANCELLED: 'Cancelled', HIATUS: 'On hiatus',
};
const SEASONS = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };

const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();
export const formatLabel = (f) => (f ? FORMATS[f] || titleCase(f.replace(/_/g, ' ')) : null);
export const statusLabel = (s) => (s ? STATUSES[s] || titleCase(s.replace(/_/g, ' ')) : null);
export function seasonLabel(season, year) {
  const s = season ? SEASONS[season] || titleCase(season) : null;
  if (s && year) return `${s} ${year}`;
  return s || (year ? String(year) : null);
}

// "TV · 25 eps · Finished" — one line for the page row and the sheet header.
export function summaryLine(a) {
  if (!a) return '';
  return [
    formatLabel(a.format),
    a.episodes ? `${a.episodes} ep${a.episodes === 1 ? '' : 's'}` : null,
    statusLabel(a.status),
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---------------------------------------------------------------- airing
// Next-episode info relative to `nowMs`. If the stored date has already passed
// (the snapshot is stale) we say so instead of showing a stale countdown.
export function nextEpisodeInfo(next, nowMs = Date.now()) {
  if (!next || !next.at) return null;
  const at = Date.parse(next.at);
  if (!Number.isFinite(at)) return null;
  const diff = at - nowMs;
  if (diff <= 0) return { episode: next.episode, at, past: true, rel: null };
  const min = Math.round(diff / 60000);
  let rel;
  if (min < 60) rel = `in ${Math.max(min, 1)} min`;
  else if (min < 48 * 60) rel = `in ${Math.round(min / 60)} h`;
  else rel = `in ${Math.round(min / 1440)} d`;
  return { episode: next.episode, at, past: false, rel };
}

// "Updated today / yesterday / 3 days ago" for the cached snapshot.
export function ageLabel(syncedAt, nowMs = Date.now()) {
  const t = Date.parse(syncedAt);
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((nowMs - t) / 86400000);
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  return `Updated ${days} days ago`;
}

// ---------------------------------------------------------------- hints
// AniList splits a franchise into one entry per season, TMDB into seasons of
// one entry — so the two episode counts are only comparable when TMDB has a
// single season. In that case, point out a mismatch (the very problem this
// feature exists for) without changing anything.
export function episodeCountNote(show, anime) {
  if (!show || !anime || !anime.episodes) return null;
  const seasons = show.seasons || [];
  if (seasons.length !== 1 || !show.totalEpisodes) return null;
  if (show.totalEpisodes === anime.episodes) return null;
  return `TMDB lists ${show.totalEpisodes} episodes; AniList lists ${anime.episodes}.`;
}

// Should the page offer the "Anime details" row up front? TMDB tags cartoons
// and anime alike as Animation, so this is a hint; anything else can still be
// linked from the ⋯ menu.
export function looksLikeAnime(show) {
  return !!show && (show.genres || []).some((g) => /animation|anime/i.test(g));
}
