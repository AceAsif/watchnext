// Custom lists ("Ramadan watch", "Watch with friends"). PURE: no DOM, no store.
//
//   lists = {
//     '<list id>': {
//       id, name, at,            at: when the list last changed (ISO) — the sync clock
//       created,                 when it was made (ISO)
//       items: [{ key, kind, tmdbId, name, poster, year, added }],   in your order
//       deleted: true            (only on a deleted list, see below)
//     }
//   }
//   item.key is 'tv:<TMDB id>' or 'movie:<TMDB id>'. A list can hold titles that are not in
//   your library yet; name/poster/year are a snapshot so the list shows without asking TMDB.
//
// SYNC: like yearly goals, per list the most recently changed copy wins (ties: this device).
// Deleting a list keeps a small "deleted" marker with a fresh time, so another device's older
// copy can't bring it back. Backups restore lists you don't have; they never overwrite one.

export const LIST_MAX = 100;
export const ITEM_MAX = 500;
export const NAME_MAX = 60;
export const SUGGESTED_NAMES = ['Ramadan watch', 'Watch with friends', 'Comfort shows', 'Family movie night'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isoOk = (s) => typeof s === 'string' && s !== '' && Number.isFinite(Date.parse(s));
const ID = /^l[a-z0-9]{4,40}$/;
const KEY = /^(tv|movie):\d{1,9}$/;
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const str = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

export const cleanName = (s) => str(s, NAME_MAX);

function cleanItem(it) {
  if (!isObj(it) || !KEY.test(it.key)) return null;
  const [kind, id] = it.key.split(':');
  return {
    key: it.key,
    kind,
    tmdbId: Number(id),
    name: str(it.name, 200) || 'Untitled',
    poster: typeof it.poster === 'string' && it.poster.startsWith('/') ? it.poster.slice(0, 100) : null,
    year: /^\d{4}$/.test(String(it.year || '')) ? String(it.year) : null,
    added: isoOk(it.added) ? it.added : '',
  };
}

function cleanList(id, l) {
  if (!ID.test(id) || BAD.has(id) || !isObj(l)) return null;
  const at = isoOk(l.at) ? l.at : '';
  if (l.deleted === true) return { id, name: '', at, created: isoOk(l.created) ? l.created : at, items: [], deleted: true };
  const seen = new Set();
  const items = [];
  for (const it of Array.isArray(l.items) ? l.items : []) {
    const c = cleanItem(it);
    if (!c || seen.has(c.key)) continue;
    seen.add(c.key);
    items.push(c);
    if (items.length >= ITEM_MAX) break;
  }
  return { id, name: cleanName(l.name) || 'Untitled list', at, created: isoOk(l.created) ? l.created : at, items };
}

export function sanitizeLists(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [id, l] of Object.entries(raw)) {
    const c = cleanList(id, l);
    if (c) out[id] = c;
  }
  return out;
}

// A new list id: 'l' + time + random, so two devices never pick the same one.
export const newListId = (now = Date.now(), rand = Math.random) => 'l' + now.toString(36) + Math.floor(rand() * 36 ** 5).toString(36).padStart(5, '0');

// The lists you see (deleted ones left out), most recently changed first.
export function visibleLists(lists) {
  return Object.values(sanitizeLists(lists))
    .filter((l) => !l.deleted)
    .sort((a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name));
}
export const liveCount = (lists) => visibleLists(lists).length;

// ------------------------------------------------------------------ changes (all return NEW lists)
// Every change stamps the list's `at`, which is what sync compares.
const touch = (l, nowIso, patch) => ({ ...l, ...patch, at: nowIso });

// -> { lists, id } (id null when the name is empty or you already have LIST_MAX lists)
export function createList(lists, name, nowIso, id = newListId(Date.parse(nowIso) || Date.now())) {
  const cur = sanitizeLists(lists);
  const n = cleanName(name);
  if (!n || liveCount(cur) >= LIST_MAX || cur[id]) return { lists: cur, id: null };
  return { lists: { ...cur, [id]: { id, name: n, at: nowIso, created: nowIso, items: [] } }, id };
}

export function renameList(lists, id, name, nowIso) {
  const cur = sanitizeLists(lists);
  const n = cleanName(name);
  if (!cur[id] || cur[id].deleted || !n || n === cur[id].name) return cur;
  return { ...cur, [id]: touch(cur[id], nowIso, { name: n }) };
}

export function deleteList(lists, id, nowIso) {
  const cur = sanitizeLists(lists);
  if (!cur[id] || cur[id].deleted) return cur;
  return { ...cur, [id]: { id, name: '', at: nowIso, created: cur[id].created, items: [], deleted: true } };
}

// item: { kind: 'tv'|'movie', tmdbId, name, poster, year }. Added at the END of the list.
export function addItem(lists, id, item, nowIso) {
  const cur = sanitizeLists(lists);
  const l = cur[id];
  const c = item && cleanItem({ ...item, key: `${item.kind}:${item.tmdbId}`, added: nowIso });
  if (!l || l.deleted || !c || l.items.some((x) => x.key === c.key) || l.items.length >= ITEM_MAX) return cur;
  return { ...cur, [id]: touch(l, nowIso, { items: [...l.items, c] }) };
}

export function removeItem(lists, id, key, nowIso) {
  const cur = sanitizeLists(lists);
  const l = cur[id];
  if (!l || l.deleted || !l.items.some((x) => x.key === key)) return cur;
  return { ...cur, [id]: touch(l, nowIso, { items: l.items.filter((x) => x.key !== key) }) };
}

// Move an item one place up (dir -1) or down (dir +1).
export function moveItem(lists, id, key, dir, nowIso) {
  const cur = sanitizeLists(lists);
  const l = cur[id];
  if (!l || l.deleted) return cur;
  const i = l.items.findIndex((x) => x.key === key);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= l.items.length) return cur;
  const items = l.items.slice();
  [items[i], items[j]] = [items[j], items[i]];
  return { ...cur, [id]: touch(l, nowIso, { items }) };
}

// The ids of the (visible) lists that hold this title.
export const listsWith = (lists, key) => visibleLists(lists).filter((l) => l.items.some((x) => x.key === key)).map((l) => l.id);

// ------------------------------------------------------------------ items from library records / TMDB results
export const itemFromShow = (s) => (s && Number.isInteger(Number(s.tmdbId)) && Number(s.tmdbId) > 0
  ? { kind: 'tv', tmdbId: Number(s.tmdbId), name: s.name, poster: s.poster || null, year: s.year || ((s.seasons && s.seasons[0] && s.seasons[0].air) || '').slice(0, 4) || null }
  : null);
export const itemFromMovie = (m) => (m && Number.isInteger(Number(m.tmdbId)) && Number(m.tmdbId) > 0
  ? { kind: 'movie', tmdbId: Number(m.tmdbId), name: m.name, poster: m.poster || null, year: m.year || null }
  : null);
// A TMDB search result (from /search/tv or /search/movie).
export const itemFromResult = (r, kind) => (r && r.id
  ? { kind, tmdbId: r.id, name: kind === 'tv' ? r.name : r.title, poster: r.poster_path || null, year: ((kind === 'tv' ? r.first_air_date : r.release_date) || '').slice(0, 4) || null }
  : null);

// Where a list item stands in YOUR library.
// -> { tone: 'finished'|'watching'|'watched'|'planned'|'none', label, showId? }
export function itemStatus(item, state) {
  if (item.kind === 'tv') {
    const found = Object.entries((state && state.shows) || {}).find(([, s]) => s && Number(s.tmdbId) === item.tmdbId);
    if (!found) return { tone: 'none', label: 'Not in your library' };
    const [showId, s] = found;
    const seen = Object.keys(s.watched || {}).length;
    const total = Number(s.totalEpisodes) || 0;
    if (total && seen >= total) return { tone: 'finished', label: 'Finished', showId };
    if (seen) return { tone: 'watching', label: total ? `Watching · ${seen} of ${total}` : `Watching · ${seen} watched`, showId };
    if (s.watchlist && !s.followed) return { tone: 'planned', label: 'On your watchlist', showId };
    return { tone: 'planned', label: 'In your library · not started', showId };
  }
  const ms = ((state && state.movies) || []).filter((m) => m && Number(m.tmdbId) === item.tmdbId);
  const watched = ms.filter((m) => !m.status || m.status === 'watched');
  if (watched.length) {
    const rated = watched.find((m) => Number(m.rating) > 0);
    return { tone: 'watched', label: `Watched${watched.length > 1 ? ` ${watched.length}×` : ''}${rated ? ` · ★ ${rated.rating}` : ''}` };
  }
  if (ms.length) return { tone: 'planned', label: 'On your watchlist' };
  return { tone: 'none', label: 'Not in your library' };
}

// "3 of 8 watched" for a list: finished shows and watched films count as done.
export function listProgress(list, state) {
  const done = list.items.filter((it) => ['finished', 'watched'].includes(itemStatus(it, state).tone)).length;
  return { done, total: list.items.length };
}

// ------------------------------------------------------------------ sync + backup
// Per list the newer change wins (ties go to `local`). Lists only one side has are kept.
export function mergeLists(remote, local) {
  const r = sanitizeLists(remote);
  const l = sanitizeLists(local);
  const out = {};
  for (const id of new Set([...Object.keys(r), ...Object.keys(l)])) {
    const a = r[id];
    const b = l[id];
    if (!a) out[id] = b;
    else if (!b) out[id] = a;
    else out[id] = Date.parse(a.at || 0) > Date.parse(b.at || 0) ? a : b;
  }
  return out;
}
export const sameLists = (a, b) => JSON.stringify(sanitizeLists(a)) === JSON.stringify(sanitizeLists(b));

// Restore from backup: add the lists this device has never had (not even deleted). Never overwrites.
export function fillLists(local, backup) {
  const l = sanitizeLists(local);
  const b = sanitizeLists(backup);
  const out = { ...l };
  let added = 0;
  for (const [id, list] of Object.entries(b)) {
    if (out[id] || list.deleted || liveCount(out) >= LIST_MAX) continue;
    out[id] = list;
    added++;
  }
  return { lists: out, added };
}
