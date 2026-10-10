// PURE: the taste engine behind Discover. No DOM, no store, no network.
//
// How it works (the Netflix idea, scaled down to one person):
//   1. ENGAGEMENT  every show / movie in your library gets a weight from how you actually
//                  watched it: your star rating first; otherwise finished, still watching,
//                  dropped early (a "no") or dropped late (you liked most of it), or just on
//                  the watchlist (a small "maybe"). Older activity counts less (half after
//                  two years). "Not interested" picks count as a small "no".
//   2. PROFILE     those weights are spread over each title's features: genres, original
//                  language, decade, TMDB keywords and the people who made it. The result is
//                  your taste profile: how much of your watching leans to each feature.
//   3. CANDIDATES  (discoverEngine.js) TMDB's own "people who liked X also liked" lists for your
//                  strongest titles, plus a person, a keyword, your services and trending.
//   4. RANKING     each candidate is scored on taste match, how many of your favourites point
//                  at it, its quality (vote average, shrunk toward the middle when few people
//                  voted) and freshness. Rows are then filled greedily with a variety penalty
//                  so one genre can't take over a row, and no title appears twice on the page.

export const DAY = 86400000;
export const HALF_LIFE_DAYS = 730; // activity two years old counts half
export const MIN_DECAY = 0.25;
export const MAX_FEATURE_TITLES = 150; // titles whose keywords/people we look up (the strongest ones)
export const CACHE_KEY = 'watchnext-taste-v1';
export const CACHE_TTL_DAYS = 120;
export const CACHE_MAX = 800;
export const ROW_MAX = 15;
export const ROW_MIN = 4;
export const TOP_PICKS = 12;
export const SEED_ROWS = 3;
export const MAX_SEEDS = 8; // titles whose recommendation lists we fetch
export const HIDDEN_WEIGHT = -0.5;
export const REPEAT_PENALTY = 0.15; // Top picks: how much less a title already in a row below is worth

// ------------------------------------------------------------------ genres
// TMDB uses different genre ids for TV and movies (TV has "Action & Adventure", "Sci-Fi &
// Fantasy"…). Everything is mapped to one shared set of keys so a TV taste carries over to films.
export const GENRE_LABEL = {
  action: 'Action', adventure: 'Adventure', animation: 'Animation', comedy: 'Comedy', crime: 'Crime',
  documentary: 'Documentary', drama: 'Drama', family: 'Family', fantasy: 'Fantasy', history: 'History',
  horror: 'Horror', music: 'Music', mystery: 'Mystery', romance: 'Romance', scifi: 'Sci-Fi',
  thriller: 'Thriller', war: 'War', western: 'Western', kids: 'Kids', reality: 'Reality', soap: 'Soap',
  politics: 'Politics', news: 'News', talk: 'Talk', tvmovie: 'TV Movie',
};
const GENRE_BY_ID = {
  28: ['action'], 12: ['adventure'], 16: ['animation'], 35: ['comedy'], 80: ['crime'], 99: ['documentary'],
  18: ['drama'], 10751: ['family'], 14: ['fantasy'], 36: ['history'], 27: ['horror'], 10402: ['music'],
  9648: ['mystery'], 10749: ['romance'], 878: ['scifi'], 10770: ['tvmovie'], 53: ['thriller'], 10752: ['war'],
  37: ['western'], 10759: ['action', 'adventure'], 10762: ['kids'], 10763: ['news'], 10764: ['reality'],
  10765: ['scifi', 'fantasy'], 10766: ['soap'], 10767: ['talk'], 10768: ['war', 'politics'],
};
const GENRE_BY_NAME = {
  'action & adventure': ['action', 'adventure'], 'sci-fi & fantasy': ['scifi', 'fantasy'],
  'science fiction': ['scifi'], 'war & politics': ['war', 'politics'], 'tv movie': ['tvmovie'],
};
for (const [k, label] of Object.entries(GENRE_LABEL)) GENRE_BY_NAME[label.toLowerCase()] = [k];
// Which TMDB genre id to ask for when searching TV or movies for one of our keys.
const TV_ID = { action: 10759, adventure: 10759, animation: 16, comedy: 35, crime: 80, documentary: 99, drama: 18, family: 10751, kids: 10762, mystery: 9648, reality: 10764, scifi: 10765, fantasy: 10765, soap: 10766, war: 10768, politics: 10768, western: 37 };
const MOVIE_ID = Object.fromEntries(Object.entries(GENRE_BY_ID).filter(([, ks]) => ks.length === 1).map(([id, [k]]) => [k, Number(id)]));

const uniq = (a) => [...new Set(a)];
export const genreKeysFromIds = (ids) => uniq((Array.isArray(ids) ? ids : []).flatMap((id) => GENRE_BY_ID[id] || []));
export const genreKeysFromNames = (names) => uniq((Array.isArray(names) ? names : []).flatMap((n) => GENRE_BY_NAME[String(n || '').toLowerCase()] || []));
export const genreLabel = (k) => GENRE_LABEL[k] || '';
// TMDB genre ids (for /discover) for our keys, for 'tv' or 'movie'. Unknown keys are skipped.
export function genreIdsFor(kind, keys) {
  const map = kind === 'tv' ? TV_ID : MOVIE_ID;
  return uniq((keys || []).map((k) => map[k]).filter(Boolean));
}

// ------------------------------------------------------------------ small helpers
const validIso = (s) => typeof s === 'string' && s !== '' && Number.isFinite(Date.parse(s));
const latest = (list) => list.filter(validIso).sort().pop() || null;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const titleKey = (kind, id) => `${kind}:${id}`;
export const decadeOf = (year) => (Number.isInteger(year) && year > 1900 ? `${Math.floor(year / 10) * 10}s` : null);
const yearOf = (date) => { const y = parseInt(String(date || '').slice(0, 4), 10); return Number.isInteger(y) && y > 1900 ? y : null; };

// How much a moment ago counts now: 1 today, 0.5 after HALF_LIFE_DAYS, never below MIN_DECAY.
// Unknown time counts as "a while ago".
export function decay(atIso, now = new Date()) {
  if (!validIso(atIso)) return 0.5;
  const days = Math.max(0, (now.getTime() - Date.parse(atIso)) / DAY);
  return Math.max(MIN_DECAY, Math.pow(0.5, days / HALF_LIFE_DAYS));
}

// ------------------------------------------------------------------ 1. engagement
const ratingWeight = (r) => (r - 3) * 0.6; // 5★ 1.2 · 4★ 0.6 · 3★ 0 · 2★ -0.6 · 1★ -1.2

export function showTotal(show) {
  if (Number(show.totalEpisodes) > 0) return Number(show.totalEpisodes);
  const s = Array.isArray(show.seasons) ? show.seasons : [];
  return s.reduce((n, x) => n + (Number(x && x.count) || 0), 0);
}

// -> { w, why, at, seen, total }. why: 'rated' | 'finished' | 'caught-up' | 'watching' |
// 'dropped-early' | 'dropped-mid' | 'dropped-late' | 'watchlist' | 'none'
export function showEngagement(show) {
  const w = show && show.watched && typeof show.watched === 'object' ? show.watched : {};
  const seen = Object.keys(w).length;
  const total = showTotal(show || {});
  const p = total > 0 ? Math.min(1, seen / total) : 0;
  const at = latest([...Object.values(w).map((x) => x && x.at), show.ratedAt, show.addedAt]);
  const base = { at, seen, total };
  const r = Number(show.rating);
  if (r >= 1 && r <= 5) return { ...base, w: ratingWeight(r), why: 'rated', stars: r };
  if (show.dropped === true) {
    if (seen <= 2) return { ...base, w: -0.8, why: 'dropped-early' };
    if (p >= 0.5 || seen >= 20) return { ...base, w: 0.4, why: 'dropped-late' };
    if (p < 0.25) return { ...base, w: -0.3, why: 'dropped-mid' };
    return { ...base, w: 0.1, why: 'dropped-mid' };
  }
  if (seen > 0 && total > 0 && p >= 0.9) {
    const ended = /ended|cancel/i.test(show.status || '');
    return { ...base, w: 0.8, why: ended ? 'finished' : 'caught-up' };
  }
  if (seen > 0) return { ...base, w: 0.2 + 0.5 * p, why: 'watching' };
  if (show.watchlist) return { ...base, w: 0.25, why: 'watchlist' };
  return { ...base, w: 0, why: 'none' };
}

export function movieEngagement(movie) {
  const planned = (movie.status || 'watched') === 'planned';
  const at = latest([movie.ratedAt, movie.watchedAt, movie.addedAt]);
  const r = Number(movie.rating);
  if (r >= 1 && r <= 5) return { at, w: ratingWeight(r), why: 'rated', stars: r };
  if (planned) return { at, w: 0.25, why: 'watchlist' };
  return { at, w: 0.5, why: 'watched' };
}

// ------------------------------------------------------------------ 2. features
// Compact features of one title, from a TMDB details response fetched with
// append_to_response=keywords,credits. { g, l, y, k:[[id,name]], p:[[id,name,role]] }
// role 'c' = creator / director, 'a' = actor.
export function featuresFromDetails(kind, d) {
  if (!d || typeof d !== 'object') return null;
  const kwList = kind === 'tv' ? d.keywords && d.keywords.results : d.keywords && d.keywords.keywords;
  const kw = (Array.isArray(kwList) ? kwList : []).filter((k) => k && k.id != null && k.name).slice(0, 10).map((k) => [k.id, String(k.name)]);
  const makers = kind === 'tv'
    ? (Array.isArray(d.created_by) ? d.created_by : [])
    : ((d.credits && Array.isArray(d.credits.crew) ? d.credits.crew : []).filter((c) => c && c.job === 'Director'));
  const cast = (d.credits && Array.isArray(d.credits.cast) ? d.credits.cast : []).slice(0, 4);
  const people = [];
  const seenP = new Set();
  for (const [list, role, max] of [[makers, 'c', 2], [cast, 'a', 4]]) {
    for (const x of list.slice(0, max)) {
      if (!x || x.id == null || !x.name || seenP.has(x.id)) continue;
      seenP.add(x.id); people.push([x.id, String(x.name), role]);
    }
  }
  return {
    g: genreKeysFromIds((d.genres || []).map((g) => g && g.id)),
    l: typeof d.original_language === 'string' ? d.original_language : null,
    y: yearOf(kind === 'tv' ? d.first_air_date : d.release_date),
    k: kw,
    p: people,
  };
}

// What we already know about a library title without asking TMDB (genre names on the record).
export function featuresFromRecord(rec) {
  return { g: genreKeysFromNames(rec && rec.genres), l: null, y: Number.isInteger(rec && rec.year) ? rec.year : null, k: [], p: [] };
}

// ------------------------------------------------------------------ feature cache (device only)
export function sanitizeCache(raw, now = new Date()) {
  const items = {};
  const src = raw && typeof raw === 'object' && raw.items && typeof raw.items === 'object' ? raw.items : {};
  for (const [key, f] of Object.entries(src)) {
    if (!/^(tv|movie):\d+$/.test(key) || !f || typeof f !== 'object' || !validIso(f.t)) continue;
    if ((now.getTime() - Date.parse(f.t)) / DAY > CACHE_TTL_DAYS) continue;
    items[key] = {
      g: Array.isArray(f.g) ? f.g.filter((x) => GENRE_LABEL[x]) : [],
      l: typeof f.l === 'string' ? f.l : null,
      y: Number.isInteger(f.y) ? f.y : null,
      k: Array.isArray(f.k) ? f.k.filter((x) => Array.isArray(x) && x.length >= 2) : [],
      p: Array.isArray(f.p) ? f.p.filter((x) => Array.isArray(x) && x.length >= 3) : [],
      t: f.t,
    };
  }
  // keep the newest CACHE_MAX
  const keys = Object.keys(items);
  if (keys.length > CACHE_MAX) {
    keys.sort((a, b) => items[b].t.localeCompare(items[a].t)).slice(CACHE_MAX).forEach((k) => delete items[k]);
  }
  return { items };
}
export function loadCache(storage, now = new Date()) {
  try { return sanitizeCache(JSON.parse(storage.getItem(CACHE_KEY)), now); } catch (e) { return { items: {} }; }
}
export function saveCache(storage, cache, now = new Date()) {
  try { storage.setItem(CACHE_KEY, JSON.stringify(sanitizeCache(cache, now))); } catch (e) { /* full or blocked: just re-learn next time */ }
}

// ------------------------------------------------------------------ library -> entries
// Everything in the library (plus "Not interested" picks) as weighted entries.
// entry: { key, kind, tmdbId, name, w, d (decay), why, stars, rec (fallback features) }
export function libraryEntries(state, hiddenList = [], now = new Date()) {
  const out = [];
  const shows = state && state.shows && typeof state.shows === 'object' ? state.shows : {};
  for (const show of Object.values(shows)) {
    if (!show || typeof show !== 'object') continue;
    const e = showEngagement(show);
    if (e.w === 0) continue;
    out.push({ key: show.tmdbId ? titleKey('tv', show.tmdbId) : null, kind: 'tv', tmdbId: show.tmdbId || null, name: show.name || '', w: e.w, d: decay(e.at, now), why: e.why, stars: e.stars || 0, rec: featuresFromRecord(show) });
  }
  for (const m of Array.isArray(state && state.movies) ? state.movies : []) {
    if (!m || typeof m !== 'object') continue;
    const e = movieEngagement(m);
    if (e.w === 0) continue;
    out.push({ key: m.tmdbId ? titleKey('movie', m.tmdbId) : null, kind: 'movie', tmdbId: m.tmdbId || null, name: m.name || '', w: e.w, d: decay(e.at, now), why: e.why, stars: e.stars || 0, rec: featuresFromRecord(m) });
  }
  for (const h of hiddenList) {
    out.push({ key: h.key, kind: h.kind, tmdbId: h.id, name: h.name || '', w: HIDDEN_WEIGHT, d: decay(h.at, now), why: 'hidden', stars: 0, rec: { g: h.g || [], l: null, y: null, k: [], p: [] } });
  }
  return out;
}

// The titles worth looking up on TMDB (strongest first), that the cache doesn't already hold.
export function needFeatures(entries, cache, max = MAX_FEATURE_TITLES) {
  const have = (cache && cache.items) || {};
  const seen = new Set();
  return entries
    .filter((e) => e.key && e.why !== 'hidden')
    .sort((a, b) => Math.abs(b.w) * b.d - Math.abs(a.w) * a.d)
    .filter((e) => !seen.has(e.key) && seen.add(e.key))
    .slice(0, max)
    .filter((e) => !have[e.key]);
}

// ------------------------------------------------------------------ 3. profile
// profile = { g, l, d, k, p, mass, titles }
//   g / l / d: feature -> share of your (signed) engagement, roughly -1..1
//   k / p:     id -> { name, s (share), n (how many titles you liked have it), role }
export function buildProfile(entries, cache) {
  const items = (cache && cache.items) || {};
  const prof = { g: {}, l: {}, d: {}, k: {}, p: {}, mass: 0, titles: 0 };
  const add = (bucket, key, v) => { bucket[key] = (bucket[key] || 0) + v; };
  for (const e of entries) {
    const f = (e.key && items[e.key]) || e.rec;
    if (!f) continue;
    const v = e.w * e.d;
    prof.mass += Math.abs(v);
    prof.titles++;
    const g = f.g && f.g.length ? f.g : (e.rec && e.rec.g) || [];
    for (const k of g) add(prof.g, k, v / Math.sqrt(g.length)); // a 4-genre title shouldn't count 4x
    if (f.l) add(prof.l, f.l, v);
    const dec = decadeOf(f.y);
    if (dec) add(prof.d, dec, v);
    for (const [id, name] of f.k || []) {
      const x = prof.k[id] || (prof.k[id] = { name, s: 0, n: 0 });
      x.s += v; if (v > 0) x.n++;
    }
    for (const [id, name, role] of f.p || []) {
      const x = prof.p[id] || (prof.p[id] = { name, s: 0, n: 0, role });
      x.s += v; if (v > 0) x.n++;
      if (role === 'c') x.role = 'c';
    }
  }
  if (prof.mass > 0) {
    for (const b of [prof.g, prof.l, prof.d]) for (const k of Object.keys(b)) b[k] /= prof.mass;
    for (const b of [prof.k, prof.p]) for (const x of Object.values(b)) x.s /= prof.mass;
  }
  return prof;
}

const sortedPos = (b) => Object.entries(b).filter(([, v]) => v > 0).sort((a, b2) => b2[1] - a[1]);
export const topGenres = (prof, n = 3) => sortedPos(prof.g).slice(0, n).map(([k]) => k);
// A keyword or person only counts when at least `minTitles` titles you liked share it — one
// show's keyword shouldn't decide a whole row. Makers (creators / directors) rank above actors.
export function topKeyword(prof, minTitles = 2) {
  const best = Object.entries(prof.k).filter(([, x]) => x.n >= minTitles && x.s > 0).sort((a, b) => b[1].s - a[1].s)[0];
  return best ? { id: Number(best[0]), name: best[1].name } : null;
}
export function topPerson(prof, minTitles = 2) {
  const best = Object.entries(prof.p).filter(([, x]) => x.n >= minTitles && x.s > 0)
    .sort((a, b) => b[1].s * (b[1].role === 'c' ? 2 : 1) - a[1].s * (a[1].role === 'c' ? 2 : 1))[0];
  return best ? { id: Number(best[0]), name: best[1].name, role: best[1].role } : null;
}

// Seeds for "Because you watched…": your strongest liked titles TMDB knows, best first.
export function pickSeeds(entries, max = MAX_SEEDS) {
  const seen = new Set();
  return entries
    .filter((e) => e.tmdbId && e.w >= 0.4 && e.why !== 'hidden')
    .sort((a, b) => b.w * b.d - a.w * a.d || a.name.localeCompare(b.name))
    .filter((e) => !seen.has(e.key) && seen.add(e.key))
    .slice(0, max);
}

// ------------------------------------------------------------------ candidates
// A TMDB list result -> candidate. kind: 'tv' | 'movie'. via: why it was suggested
//   { type: 'seed', key, name, w } | { type: 'person', name } | { type: 'keyword', name } |
//   { type: 'services' } | { type: 'trending' }
export function candidateFrom(raw, kind, via) {
  if (!raw || raw.id == null || !raw.poster_path || raw.adult) return null;
  const k = raw.media_type === 'tv' || raw.media_type === 'movie' ? raw.media_type : kind;
  if (k !== 'tv' && k !== 'movie') return null;
  const name = k === 'tv' ? raw.name : raw.title;
  if (!name) return null;
  return {
    key: titleKey(k, raw.id), kind: k, id: raw.id, name: String(name),
    year: yearOf(k === 'tv' ? raw.first_air_date : raw.release_date),
    poster: raw.poster_path, overview: raw.overview || '',
    vote: Number(raw.vote_average) || 0, votes: Number(raw.vote_count) || 0,
    g: genreKeysFromIds(raw.genre_ids || (raw.genres || []).map((g) => g && g.id)),
    l: typeof raw.original_language === 'string' ? raw.original_language : null,
    via: via ? [via] : [],
  };
}

// Merge candidate lists by title; drop what you own or hid. Reasons are combined.
export function mergeCandidates(lists, exclude = new Set()) {
  const byKey = new Map();
  for (const c of lists.flat()) {
    if (!c || exclude.has(c.key)) continue;
    const have = byKey.get(c.key);
    if (!have) { byKey.set(c.key, { ...c, via: [...c.via] }); continue; }
    for (const v of c.via) if (!have.via.some((x) => x.type === v.type && x.key === v.key && x.name === v.name)) have.via.push(v);
  }
  return [...byKey.values()];
}

// ------------------------------------------------------------------ 4. scoring
const maxPos = (b) => Math.max(0, ...Object.values(b));
// How well a candidate's genres alone fit you, -1..1 (1 = your favourite genre).
export function genreFit(prof, c) {
  const gm = maxPos(prof.g);
  return c.g.length && gm > 0 ? clamp(c.g.reduce((s, k) => s + (prof.g[k] || 0), 0) / c.g.length / gm, -1, 1) : 0;
}
// How well a candidate's genres / language / decade fit your profile, -1..1.
export function tasteMatch(prof, c) {
  const lm = maxPos(prof.l), dm = maxPos(prof.d);
  const g = genreFit(prof, c);
  const l = c.l && lm > 0 ? (prof.l[c.l] || 0) / lm : 0;
  const dec = decadeOf(c.year);
  const d = dec && dm > 0 ? (prof.d[dec] || 0) / dm : 0;
  return clamp(0.6 * g + 0.25 * l + 0.15 * d, -1, 1);
}
// Vote average shrunk toward 6.8 when few people voted (a 9.0 from 12 votes isn't a 9.0), as 0..1.
export function quality(c) {
  const C = 6.8, m = 150;
  const q = (c.votes * c.vote + m * C) / (c.votes + m);
  return clamp((q - 5.5) / 3, 0, 1);
}
export function support(c) {
  return clamp(c.via.filter((v) => v.type === 'seed').reduce((s, v) => s + Math.max(0, v.w || 0), 0) / 2, 0, 1);
}
export function scoreCandidate(prof, c, now = new Date()) {
  const taste = tasteMatch(prof, c);
  const fresh = c.year && c.year >= now.getFullYear() - 2 ? 1 : 0;
  const special = c.via.some((v) => v.type === 'person' || v.type === 'keyword') ? 1 : 0;
  return 0.45 * taste + 0.25 * support(c) + 0.2 * quality(c) + 0.05 * fresh + 0.05 * special;
}
// A friendly "how well this fits you" figure for the card, 1..99.
export const matchPercent = (taste) => clamp(Math.round(62 + 36 * taste), 1, 99);

// ------------------------------------------------------------------ why-lines
const shortName = (s, max = 26) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);
// The strongest of your titles that pointed at this candidate.
export function bestSeed(c) {
  return c.via.filter((v) => v.type === 'seed').sort((a, b) => (b.w || 0) - (a.w || 0))[0] || null;
}
// The candidate's genre you like most (or null).
export function bestGenre(prof, c) {
  const g = c.g.filter((k) => (prof.g[k] || 0) > 0).sort((a, b) => prof.g[b] - prof.g[a])[0];
  return g || null;
}
// One short line under each card. rowType: 'top' | 'seed' | 'person' | 'keyword' | 'services' | 'different'
export function whyLine(prof, c, rowType) {
  const seed = bestSeed(c);
  const g = bestGenre(prof, c);
  if (rowType === 'top') {
    if (seed) return `Because you liked ${shortName(seed.name)}`;
    if (g) return `You watch a lot of ${genreLabel(g)}`;
    return 'Highly rated';
  }
  if (rowType === 'different') return c.g.length ? `${genreLabel(c.g[0])} · rated ${c.vote.toFixed(1)}` : `Rated ${c.vote.toFixed(1)}`;
  // the row title already says why for seed rows; elsewhere a liked title is the best reason
  if (rowType !== 'seed' && seed) return `Because you liked ${shortName(seed.name)}`;
  const parts = [];
  if (g) parts.push(genreLabel(g));
  if (c.year) parts.push(String(c.year));
  return parts.join(' · ') || (c.kind === 'tv' ? 'Show' : 'Movie');
}

// ------------------------------------------------------------------ 5. rows
// Greedy fill with a variety penalty: each pick lowers the value of others sharing its main
// genre (and, in mixed rows, the same seed), so a row isn't ten of one thing.
export function pickVaried(cands, n, scoreOf) {
  const left = [...cands];
  const out = [];
  const gCount = {}, sCount = {};
  while (out.length < n && left.length) {
    let bi = 0, bv = -Infinity;
    left.forEach((c, i) => {
      const g = c.g[0] || '-';
      const s = (bestSeed(c) || {}).key || '-';
      const v = scoreOf(c) - 0.12 * (gCount[g] || 0) - 0.06 * (sCount[s] || 0);
      if (v > bv) { bv = v; bi = i; }
    });
    const [c] = left.splice(bi, 1);
    out.push(c);
    const g = c.g[0] || '-', s = (bestSeed(c) || {}).key || '-';
    gCount[g] = (gCount[g] || 0) + 1; sCount[s] = (sCount[s] || 0) + 1;
  }
  return out;
}

const SEED_TITLE = {
  rated: (s) => `Because you rated ${s.name} ${s.stars}★`,
  default: (s) => `Because you watched ${s.name}`,
  watchlist: (s) => `Because ${s.name} is on your list`,
};
export function seedRowTitle(seed) {
  return (SEED_TITLE[seed.why] || SEED_TITLE.default)(seed);
}

// pool: merged candidates. Returns rows [{ id, type, title, sub, items:[{...c, score, match, why}] }]
// The themed rows ("Because you…", a person, a keyword, your services, something different) never
// share a title. Top picks — shown first but built last — is the best of everything, so it may
// repeat a title from a row below (as Netflix does); it leans toward ones not shown elsewhere.
// Rows with fewer than ROW_MIN titles are left out.
export function buildRows({ pool, prof, seeds = [], person = null, keyword = null, servicesOn = false, now = new Date() }) {
  const scored = pool.map((c) => {
    const taste = tasteMatch(prof, c);
    return { ...c, taste, score: scoreCandidate(prof, c, now), match: matchPercent(taste) };
  });
  const used = new Set();
  const rows = [];
  const take = (id, type, title, sub, list, n = ROW_MAX, scoreOf = (c) => c.score) => {
    const fresh = list.filter((c) => !used.has(c.key));
    if (fresh.length < ROW_MIN) return;
    const items = pickVaried(fresh, n, scoreOf).map((c) => ({ ...c, why: whyLine(prof, c, type) }));
    items.forEach((c) => used.add(c.key));
    rows.push({ id, type, title, sub, items });
  };
  const top = () => {
    const list = scored.filter((c) => !(c.via.length === 1 && c.via[0].type === 'trending') && c.taste > -0.2);
    if (list.length < ROW_MIN) return null;
    const items = pickVaried(list, TOP_PICKS, (c) => c.score - (used.has(c.key) ? REPEAT_PENALTY : 0)).map((c) => ({ ...c, why: whyLine(prof, c, 'top') }));
    return { id: 'top', type: 'top', title: 'Top picks for you', sub: 'Ranked on everything you watch', items };
  };
  for (const s of seeds.slice(0, SEED_ROWS)) {
    take(`seed:${s.key}`, 'seed', seedRowTitle(s), null, scored.filter((c) => c.via.some((v) => v.type === 'seed' && v.key === s.key)));
  }
  if (person) take(`person:${person.id}`, 'person', `More from ${person.name}`, person.role === 'c' ? 'A creator behind titles you liked' : 'In several titles you liked', scored.filter((c) => c.via.some((v) => v.type === 'person')));
  if (keyword) take(`keyword:${keyword.id}`, 'keyword', `Your kind of story: ${keyword.name}`, 'A theme that keeps coming up in what you like', scored.filter((c) => c.via.some((v) => v.type === 'keyword')));
  if (servicesOn) take('services', 'services', 'On your services', 'Your kind of thing, streaming on what you pay for', scored.filter((c) => c.via.some((v) => v.type === 'services')));
  // Something different: well-rated, trending titles in genres you don't usually watch — but
  // never a genre you've shown you dislike.
  const different = (c) => c.via.some((v) => v.type === 'trending') && !c.g.some((k) => (prof.g[k] || 0) < 0) && genreFit(prof, c) < 0.35 && quality(c) >= 0.4;
  take('different', 'different', 'Something different', 'Well rated, a little outside your usual', scored.filter(different), 10, (c) => quality(c));
  const t = top();
  return t ? [t, ...rows] : rows;
}

// ------------------------------------------------------------------ progress text
export function progressText(p) {
  if (!p) return '';
  if (p.phase === 'learning') return p.total > 0 ? `Learning your taste… ${p.done} of ${p.total}` : 'Learning your taste…';
  if (p.phase === 'finding') return 'Finding picks for you…';
  return '';
}
