// Discover's pipeline: learn your taste, gather candidates from TMDB, rank them into rows.
// The TMDB calls come in through `api` (see Discover.jsx), so this file runs in plain Node
// tests with a fake TMDB. The scoring rules themselves live in tasteLogic.js.

import {
  libraryEntries, needFeatures, featuresFromDetails, buildProfile, pickSeeds, topPerson, topKeyword,
  topGenres, genreIdsFor, candidateFrom, mergeCandidates, buildRows, titleKey, MAX_SEEDS,
} from './tasteLogic.js';
import { hiddenList } from './hiddenLogic.js';
import { myProviderIds } from './movieNightLogic.js';

export const CONCURRENCY = 6;
export const GAP_MS = 60;

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

// Run fn over list with at most n in flight. Errors are swallowed per item (best effort).
export async function mapLimit(list, n, fn, gap = GAP_MS) {
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const item = list[i++];
      try { await fn(item); } catch (e) { /* one failed lookup never stops the rest */ }
      await sleep(gap);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, worker));
}

// Everything already in the library, as 'tv:<id>' / 'movie:<id>' keys.
export function ownedKeys(state) {
  const out = new Set();
  for (const s of Object.values((state && state.shows) || {})) if (s && s.tmdbId) out.add(titleKey('tv', s.tmdbId));
  for (const m of (state && state.movies) || []) if (m && m.tmdbId) out.add(titleKey('movie', m.tmdbId));
  return out;
}

const results = (d) => (d && Array.isArray(d.results) ? d.results : []);

// state: the app state. hidden: the Not interested map. cache: { items } feature cache (updated
// in place; the caller saves it). mine: ids of the services you ticked. onProgress({ phase, done, total }).
// -> { rows, profile, seeds, stats: { learned, failed, calls } }
export async function runDiscover({ state, hidden, cache, api, mine = [], now = new Date(), onProgress = () => {}, gap = GAP_MS }) {
  const stats = { learned: 0, failed: 0, calls: 0 };
  const call = async (fn) => { stats.calls++; return fn(); };
  const hid = hiddenList(hidden);
  const entries = libraryEntries(state, hid, now);

  // 1) learn: look up keywords + people for your strongest titles we haven't seen yet
  const todo = needFeatures(entries, cache);
  let done = 0;
  onProgress({ phase: 'learning', done, total: todo.length });
  await mapLimit(todo, CONCURRENCY, async (e) => {
    try {
      const d = await call(() => api.details(e.kind, e.tmdbId));
      const f = featuresFromDetails(e.kind, d);
      if (f) { cache.items[e.key] = { ...f, t: now.toISOString() }; stats.learned++; }
    } catch (err) {
      stats.failed++;
    } finally {
      done++;
      onProgress({ phase: 'learning', done, total: todo.length });
    }
  }, gap);

  // 2) profile + where to look
  const prof = buildProfile(entries, cache);
  const seeds = pickSeeds(entries, MAX_SEEDS);
  const person = topPerson(prof);
  const keyword = topKeyword(prof);
  const genres = topGenres(prof, 2);
  onProgress({ phase: 'finding', done: 0, total: 0 });

  // 3) candidates
  const lists = [];
  const jobs = [];
  for (const s of seeds) {
    jobs.push(async () => {
      const via = { type: 'seed', key: s.key, name: s.name, w: s.w * s.d };
      let r = results(await call(() => api.recommendations(s.kind, s.tmdbId)));
      if (r.length < 5) {
        try { r = r.concat(results(await call(() => api.similar(s.kind, s.tmdbId)))); } catch (e) { /* best effort */ }
      }
      lists.push(r.map((x) => candidateFrom(x, s.kind, via)));
    });
  }
  if (person) {
    jobs.push(async () => {
      const d = await call(() => api.personCredits(person.id));
      const all = [...((d && d.cast) || []), ...((d && d.crew) || [])].filter((x) => x && (x.vote_count || 0) >= 30);
      lists.push(all.map((x) => candidateFrom(x, x.media_type, { type: 'person', name: person.name })));
    });
  }
  if (keyword) {
    for (const kind of ['tv', 'movie']) {
      jobs.push(async () => {
        const r = results(await call(() => api.discover(kind, { with_keywords: String(keyword.id), sort_by: 'popularity.desc', 'vote_count.gte': 50, include_adult: 'false' })));
        lists.push(r.map((x) => candidateFrom(x, kind, { type: 'keyword', name: keyword.name })));
      });
    }
  }
  const servicesOn = Array.isArray(mine) && mine.length > 0;
  if (servicesOn) {
    jobs.push(async () => {
      const ids = myProviderIds(results(await call(() => api.providerList())), mine);
      if (!ids.length) return;
      await Promise.all(['tv', 'movie'].map(async (kind) => {
        const p = { watch_region: 'AU', with_watch_providers: ids.join('|'), with_watch_monetization_types: 'flatrate', sort_by: 'popularity.desc', 'vote_count.gte': 100, include_adult: 'false' };
        const g = genreIdsFor(kind, genres);
        if (g.length) p.with_genres = g.join('|');
        const r = results(await call(() => api.discover(kind, p)));
        lists.push(r.map((x) => candidateFrom(x, kind, { type: 'services' })));
      }));
    });
  }
  jobs.push(async () => {
    const r = results(await call(() => api.trending()));
    lists.push(r.map((x) => candidateFrom(x, x.media_type, { type: 'trending' })));
  });
  await mapLimit(jobs, CONCURRENCY, (job) => job(), gap);

  const exclude = ownedKeys(state);
  for (const h of hid) exclude.add(h.key);
  const pool = mergeCandidates(lists, exclude);

  // 4) rank into rows
  const rows = buildRows({ pool, prof, seeds, person, keyword, servicesOn, now });
  return { rows, profile: prof, seeds, stats };
}
