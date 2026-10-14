// PURE: Discover's hit rate — how many of its suggestions you went on to add or watch.
// No DOM, no store. The log lives in the library state (state.seenLog) and syncs to the cloud
// (users/{uid}/library/discover), so every device adds to, and shows, the same numbers.
//
//   log = { 'tv:1399': { at: '<first seen ISO>', name }, 'movie:603': {…}, 'anime:21': {…} }
//
// A title is logged only once it has actually been ON SCREEN (see Discover.jsx: a card at least
// 60% visible for about a second, or one you opened or added), not merely loaded into a row you
// never scrolled to. An anime pick added to the library is relinked to its TMDB show key; the
// anime entry stays behind marked { moved: 'tv:…' } so another device's copy can't bring it back
// as a second suggestion.
//
// A suggestion is never something you already have, so any title in the log that is in your
// library now was added after Discover showed it. "Watched" = at least one episode marked (a show)
// or marked watched (a movie).

export const LOG_KEY = 'watchnext-discover-log-v1';
export const LOG_MAX = 1500;
const KEY = /^(tv|movie|anime):\d{1,9}$/;
const isoOk = (s) => typeof s === 'string' && s !== '' && Number.isFinite(Date.parse(s));

export function sanitizeLog(raw) {
  const out = {};
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  for (const [k, e] of Object.entries(src)) {
    if (!KEY.test(k) || !e || typeof e !== 'object' || !isoOk(e.at)) continue;
    out[k] = { at: e.at, name: typeof e.name === 'string' ? e.name.slice(0, 200) : '' };
    if (typeof e.moved === 'string' && KEY.test(e.moved) && e.moved !== k) out[k].moved = e.moved;
  }
  const keys = Object.keys(out);
  if (keys.length > LOG_MAX) keys.sort((a, b) => out[b].at.localeCompare(out[a].at)).slice(LOG_MAX).forEach((k) => delete out[k]);
  return out;
}

// Add the titles just shown (first time only: the date a title was FIRST suggested is kept).
// items: [{ key, name }]. Returns a NEW log.
export function recordShown(log, items, nowIso) {
  const out = { ...sanitizeLog(log) };
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !KEY.test(it.key) || out[it.key]) continue;
    out[it.key] = { at: nowIso, name: String(it.name || '') };
  }
  return sanitizeLog(out);
}

// An anime pick (key 'anime:<AniList id>') is added to the library as a TMDB show: move its entry
// to that show's key ('tv:<tmdb id>') so it counts as a hit. Returns a NEW log.
export function relinkShown(log, fromKey, toKey) {
  const out = { ...sanitizeLog(log) };
  if (!out[fromKey] || out[fromKey].moved || !KEY.test(toKey) || fromKey === toKey) return out;
  if (!out[toKey]) out[toKey] = { at: out[fromKey].at, name: out[fromKey].name };
  out[fromKey] = { ...out[fromKey], moved: toKey };
  return out;
}

// Two devices' logs combined: every title either has seen, with the EARLIER first-seen date; a
// relinked (moved) mark on either side wins. Order-independent, so both sides converge.
export function mergeLog(a, b) {
  const x = sanitizeLog(a), y = sanitizeLog(b);
  const out = {};
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const p = x[k], q = y[k];
    if (!p || !q) { out[k] = p || q; continue; }
    const first = p.at <= q.at ? p : q;
    const e = { at: first.at, name: first.name || p.name || q.name };
    const moved = p.moved || q.moved;
    if (moved) e.moved = moved;
    out[k] = e;
  }
  return sanitizeLog(out);
}

export function sameLog(a, b) {
  const x = sanitizeLog(a), y = sanitizeLog(b);
  const kx = Object.keys(x);
  if (kx.length !== Object.keys(y).length) return false;
  return kx.every((k) => y[k] && y[k].at === x[k].at && y[k].name === x[k].name && (y[k].moved || '') === (x[k].moved || ''));
}

// Library titles by key, with whether you've watched any of it.
function libraryIndex(state) {
  const idx = new Map();
  for (const s of Object.values((state && state.shows) || {})) {
    if (!s || typeof s !== 'object') continue;
    const watched = Object.keys(s.watched || {}).length > 0;
    if (s.tmdbId) idx.set(`tv:${s.tmdbId}`, watched || idx.get(`tv:${s.tmdbId}`) === true);
    if (s.anime && Number.isInteger(s.anime.id)) idx.set(`anime:${s.anime.id}`, watched);
  }
  for (const m of Array.isArray(state && state.movies) ? state.movies : []) {
    if (!m || !m.tmdbId) continue;
    const watched = (m.status || 'watched') === 'watched';
    idx.set(`movie:${m.tmdbId}`, watched || idx.get(`movie:${m.tmdbId}`) === true);
  }
  return idx;
}

// -> { suggested, added, watched, since, recent: [{ key, name, watched }] } (recent = newest hits first, max 5)
export function hitStats(log, state) {
  const l = Object.fromEntries(Object.entries(sanitizeLog(log)).filter(([, e]) => !e.moved));
  const idx = libraryIndex(state);
  const hits = Object.entries(l).filter(([k]) => idx.has(k)).map(([k, e]) => ({ key: k, name: e.name, at: e.at, watched: idx.get(k) === true }));
  hits.sort((a, b) => b.at.localeCompare(a.at));
  const ats = Object.values(l).map((e) => e.at).sort();
  return {
    suggested: Object.keys(l).length,
    added: hits.length,
    watched: hits.filter((h) => h.watched).length,
    since: ats[0] || null,
    recent: hits.slice(0, 5).map(({ key, name, watched }) => ({ key, name, watched })),
  };
}

// "Discover has suggested 214 titles: you added 9 (4%) and watched 3." — or '' before any suggestion.
export function hitLine(st) {
  if (!st || !st.suggested) return '';
  const p = Math.round((st.added / st.suggested) * 100);
  const n = (x, one, many) => `${x.toLocaleString()} ${x === 1 ? one : many}`;
  if (!st.added) return `Discover has suggested ${n(st.suggested, 'title', 'titles')} so far. Add one you like and it counts here.`;
  return `Discover has suggested ${n(st.suggested, 'title', 'titles')}: you added ${st.added.toLocaleString()} (${p < 1 ? '<1' : p}%) and watched ${st.watched.toLocaleString()}.`;
}

// The old device-only log (before it synced, and before it counted only on-screen titles). It is
// no longer read: its "suggested" number included every title loaded into a row, seen or not.
// Kept exported so tests can check it is ignored.
export const OLD_LOG_KEY = LOG_KEY;
