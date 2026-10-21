// "New on my services": what's new this week on the streaming services you pay for.
// PURE: no DOM, no store, no network (the hook does the fetching).
//
// TMDB doesn't publish the day a title ARRIVED on a service, so "new" means:
//   episodes  shows on your services with an episode aired in the last 7 days
//   series    shows on your services that premiered in the last 30 days
//   films     films on your services released (anywhere) in the last 90 days
// One TMDB /discover query per section per service, so each title knows which of YOUR
// services has it. Results are cached on this device for a few hours.

import { providerToPlatform, platformById } from './platformsData.js';

export const CACHE_KEY = 'watchnext-newon-v1';
export const CACHE_HOURS = 6;
export const WINDOWS = { episodes: 7, series: 30, films: 90 };
export const SECTIONS = [
  { id: 'episodes', kind: 'tv', title: 'New episodes this week', blurb: 'Shows on your services with an episode out in the last 7 days.' },
  { id: 'series', kind: 'tv', title: 'New shows', blurb: 'Series that started in the last 30 days.' },
  { id: 'films', kind: 'movie', title: 'New films', blurb: 'Films released in the last 3 months that you can stream now.' },
];
const DAY = 86400000;

// 'YYYY-MM-DD' n days before `today` ('YYYY-MM-DD'), by calendar day.
export function daysBefore(today, n) {
  const t = Date.parse(today + 'T00:00:00Z');
  return new Date(t - n * DAY).toISOString().slice(0, 10);
}

// Your services as TMDB provider ids, one entry per service (a service can have several ids,
// e.g. "Amazon Prime Video" and "… with Ads").
//   providerList: TMDB /watch/providers results; mine: our service ids ('netflix', 'stan'…)
// -> [{ platform, label, ids: [Number] }]
export function myServices(providerList, mine) {
  const want = new Set(mine || []);
  const by = new Map();
  for (const p of Array.isArray(providerList) ? providerList : []) {
    if (!p || p.provider_id == null) continue;
    const plat = providerToPlatform(p.provider_name);
    if (!plat || !want.has(plat)) continue;
    if (!by.has(plat)) by.set(plat, { platform: plat, label: (platformById(plat) || {}).label || p.provider_name, ids: [] });
    const e = by.get(plat);
    if (!e.ids.includes(p.provider_id)) e.ids.push(p.provider_id);
  }
  return [...by.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// The /discover queries: one per section per service.
// -> [{ section, kind, platform, params }]
export function buildQueries(services, region, today) {
  const base = (s) => ({ watch_region: region, with_watch_providers: s.ids.join('|'), with_watch_monetization_types: 'flatrate|free|ads', include_adult: 'false', sort_by: 'popularity.desc', page: 1 });
  const out = [];
  for (const s of services) {
    out.push({ section: 'episodes', kind: 'tv', platform: s.platform, params: { ...base(s), 'air_date.gte': daysBefore(today, WINDOWS.episodes), 'air_date.lte': today } });
    out.push({ section: 'series', kind: 'tv', platform: s.platform, params: { ...base(s), 'first_air_date.gte': daysBefore(today, WINDOWS.series), 'first_air_date.lte': today } });
    out.push({ section: 'films', kind: 'movie', platform: s.platform, params: { ...base(s), 'primary_release_date.gte': daysBefore(today, WINDOWS.films), 'primary_release_date.lte': today, 'vote_count.gte': 5 } });
  }
  return out;
}

const posInt = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

// Put the answers together.
//   answers: [{ section, kind, platform, results: [TMDB discover results] }]
//   state:   the library (to mark what you follow / have watched / queued)
//   hidden:  a Set of 'tv:<id>' / 'movie:<id>' you marked "Not interested" (left out)
// -> { episodes: [item], series: [item], films: [item] }
//   item: { key, kind, tmdbId, name, poster, date, pop, services: [platform], library: { tone, label, showId? } }
// A title appears in ONE section: a brand-new series isn't repeated under "new episodes".
export function collect(answers, state, hidden = new Set()) {
  const items = new Map();
  for (const a of answers || []) {
    for (const r of (a && a.results) || []) {
      const id = posInt(r && r.id);
      if (!id) continue;
      const key = `${a.kind}:${id}`;
      if (hidden.has(key)) continue;
      const cur = items.get(key);
      if (cur) {
        if (!cur.services.includes(a.platform)) cur.services.push(a.platform);
        if (a.section === 'series' && cur.section === 'episodes') cur.section = 'series';
        continue;
      }
      items.set(key, {
        key,
        kind: a.kind,
        tmdbId: id,
        section: a.section,
        name: (a.kind === 'tv' ? r.name : r.title) || 'Untitled',
        poster: r.poster_path || null,
        date: (a.kind === 'tv' ? r.first_air_date : r.release_date) || '',
        pop: Number(r.popularity) || 0,
        services: [a.platform],
      });
    }
  }
  const out = { episodes: [], series: [], films: [] };
  for (const it of items.values()) {
    it.library = libraryOf(it, state);
    out[it.section].push(it);
  }
  for (const k of Object.keys(out)) {
    // Things you follow first (you'll want those new episodes), then the most popular.
    out[k].sort((a, b) => (b.library.tone === 'following') - (a.library.tone === 'following') || b.pop - a.pop || a.name.localeCompare(b.name));
  }
  return out;
}

// Where a new title stands for you.
export function libraryOf(it, state) {
  if (it.kind === 'tv') {
    const found = Object.entries((state && state.shows) || {}).find(([, s]) => s && Number(s.tmdbId) === it.tmdbId);
    if (!found) return { tone: 'none', label: '' };
    const [showId, s] = found;
    if (s.followed && s.dropped !== true) return { tone: 'following', label: 'You follow this', showId };
    if (s.watchlist) return { tone: 'queued', label: 'On your watchlist', showId };
    return { tone: 'library', label: 'In your library', showId };
  }
  const ms = ((state && state.movies) || []).filter((m) => m && Number(m.tmdbId) === it.tmdbId);
  if (ms.some((m) => !m.status || m.status === 'watched')) return { tone: 'watched', label: 'Watched' };
  if (ms.length) return { tone: 'queued', label: 'On your watchlist' };
  return { tone: 'none', label: '' };
}

export const servicesText = (platforms) => platforms.map((p) => (platformById(p) || {}).label || p).join(' · ');

// ------------------------------------------------------------------ cache (this device only)
// The cache key changes when the services, region or day change, so a stale answer is never shown.
export const cacheId = (services, region, today) => `${region}|${today}|${services.map((s) => s.platform).join(',')}`;

export function loadCache(storage, id, now = Date.now()) {
  try {
    const c = JSON.parse(storage.getItem(CACHE_KEY));
    if (!c || c.id !== id || !Array.isArray(c.answers) || !(now - Date.parse(c.at) < CACHE_HOURS * 3600000)) return null;
    return c.answers;
  } catch (e) {
    return null;
  }
}
export function saveCache(storage, id, answers, now = Date.now()) {
  // Only what collect() needs, to keep it small.
  const slim = answers.map((a) => ({ section: a.section, kind: a.kind, platform: a.platform, results: (a.results || []).slice(0, 20).map((r) => ({ id: r.id, name: r.name, title: r.title, poster_path: r.poster_path, first_air_date: r.first_air_date, release_date: r.release_date, popularity: r.popularity })) }));
  try { storage.setItem(CACHE_KEY, JSON.stringify({ id, at: new Date(now).toISOString(), answers: slim })); } catch (e) { /* full or blocked: fetched again next time */ }
}
