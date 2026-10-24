// Compare with a friend (pure logic, unit-tested in plain node).
//
// Each person's library is private in the cloud, so friends compare with a small FILE:
// "Share mine" makes it (titles, ratings, ♥, finished/dropped — no notes, dates, lists or
// email), they send it on WhatsApp/email, and "Open a friend's file" reads it. Friends'
// files are kept on this device only (watchnext-friends-v1), never synced or backed up.
//
// "Loved" = rated 4★ or more, or a ♥ favourite show.

export const FILE_KIND = 'watchnext-compare';
export const FILE_VERSION = 1;
export const LOVED_AT = 4;
export const MIN_SHARED_RATINGS = 3; // fewer ratings in common: no taste match % yet
const MAX_ITEMS = 20000;
const MAX_NAME = 40;

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const cleanRating = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(5, Math.round(n * 2) / 2);
};
const cleanId = (v) => (Number.isInteger(v) && v > 0 ? v : null);
export const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

// Same title in both files: TMDB id when both have one, else the name (+ year for films).
export const showKey = (s) => (s.id ? `tv:${s.id}` : `tvn:${normName(s.n)}`);
export const movieKey = (m) => (m.id ? `mv:${m.id}` : `mvn:${normName(m.n)}|${m.y || ''}`);

const seen = (show) => Object.keys((show && show.watched) || {}).length;
const ONGOING = new Set(['returning series', 'in production', 'planned', 'pilot']);
const finished = (show) => {
  const total = show && show.totalEpisodes;
  return !!total && seen(show) >= total && !ONGOING.has(String(show.status || '').toLowerCase());
};

/** Your library → the compare file (a plain object; JSON.stringify it to save). */
export function buildCompareFile(state, name, now = new Date()) {
  const shows = [];
  for (const sh of Object.values((state && state.shows) || {})) {
    if (!sh || !sh.name) continue;
    const w = seen(sh);
    const r = cleanRating(sh.rating);
    if (!w && !r && sh.favourite !== true) continue; // only what you have watched (or rated / ♥)
    const row = { id: cleanId(sh.tmdbId), n: str(sh.name), w };
    if (sh.poster) row.p = str(sh.poster, 120);
    if (r) row.r = r;
    if (sh.favourite === true) row.f = 1;
    if (finished(sh)) row.done = 1;
    if (sh.dropped === true) row.drop = 1;
    if (sh.anime) row.a = 1;
    shows.push(row);
  }
  // One row per film (several viewings → one row, highest rating, times watched).
  const films = new Map();
  for (const m of (state && state.movies) || []) {
    if (!m || !m.name || (m.status || 'watched') !== 'watched') continue;
    const row = { id: cleanId(m.tmdbId), n: str(m.name), y: str(String(m.year || ''), 4) || undefined };
    const k = movieKey(row);
    const prev = films.get(k);
    const r = cleanRating(m.rating);
    if (prev) { prev.x = (prev.x || 1) + 1; if (r > (prev.r || 0)) prev.r = r; continue; }
    if (!row.y) delete row.y;
    if (m.poster) row.p = str(m.poster, 120);
    if (r) row.r = r;
    films.set(k, row);
  }
  return { kind: FILE_KIND, v: FILE_VERSION, name: str(name, MAX_NAME) || 'A friend', at: now.toISOString(), shows, movies: [...films.values()] };
}

export const fileName = (name, now = new Date()) =>
  `watchnext-compare-${normName(name).replace(/ /g, '-') || 'friend'}-${now.toISOString().slice(0, 10)}.json`;

/** A file someone sent → a clean friend record, or throws an Error with a plain message. */
export function parseCompareFile(raw) {
  let j = raw;
  if (typeof raw === 'string') {
    try { j = JSON.parse(raw); } catch { throw new Error('That file isn’t a WatchNext compare file.'); }
  }
  if (!j || typeof j !== 'object' || j.kind !== FILE_KIND) {
    if (j && typeof j === 'object' && (j.app === 'WatchNext' || j.shows) && j.kind !== FILE_KIND) {
      throw new Error('That looks like a backup, not a compare file. Ask your friend for “Share mine” from Stats → Compare with a friend.');
    }
    throw new Error('That file isn’t a WatchNext compare file.');
  }
  if (!(Number(j.v) >= 1)) throw new Error('That compare file is damaged.');
  if (Number(j.v) > FILE_VERSION) throw new Error('That compare file is from a newer WatchNext. Reload the app and try again.');
  const list = (v) => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);
  const shows = [];
  for (const s of list(j.shows)) {
    if (!s || typeof s !== 'object' || !str(s.n)) continue;
    const row = { id: cleanId(s.id), n: str(s.n), w: Number.isInteger(s.w) && s.w > 0 ? s.w : 0 };
    if (str(s.p, 120).startsWith('/')) row.p = str(s.p, 120);
    const r = cleanRating(s.r); if (r) row.r = r;
    if (s.f === 1 || s.f === true) row.f = 1;
    if (s.done === 1 || s.done === true) row.done = 1;
    if (s.drop === 1 || s.drop === true) row.drop = 1;
    if (s.a === 1 || s.a === true) row.a = 1;
    shows.push(row);
  }
  const movies = [];
  for (const m of list(j.movies)) {
    if (!m || typeof m !== 'object' || !str(m.n)) continue;
    const row = { id: cleanId(m.id), n: str(m.n) };
    if (/^\d{4}$/.test(String(m.y || ''))) row.y = String(m.y);
    if (str(m.p, 120).startsWith('/')) row.p = str(m.p, 120);
    const r = cleanRating(m.r); if (r) row.r = r;
    if (Number.isInteger(m.x) && m.x > 1) row.x = m.x;
    movies.push(row);
  }
  const at = Number.isFinite(Date.parse(j.at)) ? new Date(j.at).toISOString() : null;
  return { name: str(j.name, MAX_NAME) || 'A friend', at, shows, movies };
}

export const isLoved = (it) => (it.r || 0) >= LOVED_AT || it.f === 1;
const watchedShow = (s) => (s.w || 0) > 0;

/**
 * Compare you and a friend. mine/theirs = { shows, movies } as in the file.
 * extra = { watchlist: Set of keys on your watchlist, library: Set of show keys you follow }
 * Returns {
 *   both:      titles you've both watched  [{ kind, key, id, n, p, y, mine, theirs, mineLoved, theirsLoved }]
 *   theyLoved: they loved, you haven't watched  [{ …, theirs, onWatchlist, inLibrary }]
 *   youLoved:  you loved, they haven't watched  [{ …, mine }]
 *   match:     { pct, n } taste match from titles you've both rated (pct null under MIN_SHARED_RATINGS)
 * }
 */
export function compareLibraries(mine, theirs, extra = {}) {
  const wl = extra.watchlist instanceof Set ? extra.watchlist : new Set();
  const lib = extra.library instanceof Set ? extra.library : new Set();
  const index = (lib0) => {
    const m = new Map();
    for (const s of (lib0 && lib0.shows) || []) if (watchedShow(s)) m.set(showKey(s), { ...s, kind: 'show' });
    for (const f of (lib0 && lib0.movies) || []) m.set(movieKey(f), { ...f, kind: 'movie' });
    // name-only fallback: a title one side has without a TMDB id still matches by name
    return m;
  };
  const A = index(mine);
  const B = index(theirs);
  const byName = (map) => {
    const n = new Map();
    for (const [k, v] of map) n.set(`${v.kind}|${normName(v.n)}${v.kind === 'movie' ? '|' + (v.y || '') : ''}`, k);
    return n;
  };
  const nameA = byName(A); const nameB = byName(B);
  const findIn = (map, names, v, k) => (map.has(k) ? map.get(k) : (() => { const k2 = names.get(`${v.kind}|${normName(v.n)}${v.kind === 'movie' ? '|' + (v.y || '') : ''}`); return k2 ? map.get(k2) : null; })());

  const base = (v, k) => ({ kind: v.kind, key: k, id: v.id || null, n: v.n, p: v.p || null, y: v.y || null });
  const both = []; const theyLoved = []; const youLoved = [];
  const matchedA = new Set();
  for (const [k, b] of B) {
    const a = findIn(A, nameA, b, k);
    if (a) {
      matchedA.add(a.kind === 'show' ? showKey(a) : movieKey(a));
      both.push({ ...base(b, k), n: a.n, y: a.y || b.y || null, id: a.id || b.id || null, p: a.p || b.p || null, mine: a.r || 0, theirs: b.r || 0, mineLoved: isLoved(a), theirsLoved: isLoved(b) });
    } else if (isLoved(b)) {
      theyLoved.push({ ...base(b, k), theirs: b.r || 0, fav: b.f === 1, onWatchlist: wl.has(k), inLibrary: lib.has(k) });
    }
  }
  for (const [k, a] of A) {
    if (matchedA.has(k) || !isLoved(a)) continue;
    if (findIn(B, nameB, a, k)) continue;
    youLoved.push({ ...base(a, k), mine: a.r || 0, fav: a.f === 1 });
  }
  const loveRank = (r, fav) => (r || 0) + (fav ? 0.25 : 0);
  const byName2 = (x, y) => x.n.localeCompare(y.n);
  both.sort((x, y) => (Number(y.mineLoved && y.theirsLoved) - Number(x.mineLoved && x.theirsLoved)) || (y.mine + y.theirs) - (x.mine + x.theirs) || byName2(x, y));
  theyLoved.sort((x, y) => Number(x.onWatchlist) - Number(y.onWatchlist) || loveRank(y.theirs, y.fav) - loveRank(x.theirs, x.fav) || byName2(x, y));
  youLoved.sort((x, y) => loveRank(y.mine, y.fav) - loveRank(x.mine, x.fav) || byName2(x, y));

  const rated = both.filter((x) => x.mine > 0 && x.theirs > 0);
  const avgDiff = rated.length ? rated.reduce((s, x) => s + Math.abs(x.mine - x.theirs), 0) / rated.length : 0;
  const pct = rated.length >= MIN_SHARED_RATINGS ? Math.round(100 * (1 - avgDiff / 4.5)) : null;
  return { both, theyLoved, youLoved, match: { pct, n: rated.length } };
}

// Keys on your watchlist (shows marked watchlist, planned films) and shows in your library.
export function myExtras(state) {
  const watchlist = new Set(); const library = new Set();
  for (const s of Object.values((state && state.shows) || {})) {
    if (!s || !s.name) continue;
    const k = showKey({ id: cleanId(s.tmdbId), n: s.name });
    if (s.watchlist === true) watchlist.add(k);
    if (s.followed === true) library.add(k);
  }
  for (const m of (state && state.movies) || []) {
    if (m && m.name && m.status === 'planned') watchlist.add(movieKey({ id: cleanId(m.tmdbId), n: m.name, y: m.year ? String(m.year) : undefined }));
  }
  return { watchlist, library };
}

// ---- friends kept on this device: { me: 'name', friends: [{ id, name, at, added, shows, movies }] }
export const FRIENDS_KEY = 'watchnext-friends-v1';
export function loadFriends(storage) {
  try {
    const j = JSON.parse(storage.getItem(FRIENDS_KEY));
    const friends = Array.isArray(j && j.friends) ? j.friends.filter((f) => f && f.id && Array.isArray(f.shows) && Array.isArray(f.movies)) : [];
    return { me: str(j && j.me, MAX_NAME), friends };
  } catch { return { me: '', friends: [] }; }
}
export function saveFriends(storage, data) {
  try { storage.setItem(FRIENDS_KEY, JSON.stringify(data)); return true; } catch { return false; }
}
// Adding a file from a friend you already have (same name) replaces their old file.
export function addFriend(data, parsed, now = new Date()) {
  const same = (f) => normName(f.name) === normName(parsed.name);
  const old = data.friends.find(same);
  const rec = { id: old ? old.id : `f${now.getTime().toString(36)}`, name: parsed.name, at: parsed.at, added: now.toISOString(), shows: parsed.shows, movies: parsed.movies };
  return { data: { ...data, friends: [rec, ...data.friends.filter((f) => !same(f))] }, replaced: !!old, id: rec.id };
}
export const removeFriend = (data, id) => ({ ...data, friends: data.friends.filter((f) => f.id !== id) });

export const countLine = (lib0) => {
  const s = ((lib0 && lib0.shows) || []).filter(watchedShow).length;
  const m = ((lib0 && lib0.movies) || []).length;
  return `${s.toLocaleString()} show${s === 1 ? '' : 's'} · ${m.toLocaleString()} movie${m === 1 ? '' : 's'}`;
};
