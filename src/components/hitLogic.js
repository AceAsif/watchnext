// PURE: Discover's hit rate — how many of its suggestions you went on to add or watch.
// No DOM, no store. Kept on this device only (localStorage), like the learned taste.
//
//   log = { 'tv:1399': { at: '<first shown ISO>', name }, 'movie:603': {…}, 'anime:21': {…} }
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
  if (!out[fromKey] || !KEY.test(toKey)) return out;
  if (!out[toKey]) out[toKey] = out[fromKey];
  delete out[fromKey];
  return out;
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
  const l = sanitizeLog(log);
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

export function loadLog(storage) { try { return sanitizeLog(JSON.parse(storage.getItem(LOG_KEY))); } catch (e) { return {}; } }
export function saveLog(storage, log) { try { storage.setItem(LOG_KEY, JSON.stringify(sanitizeLog(log))); } catch (e) { /* full or blocked */ } }
