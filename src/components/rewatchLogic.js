// PURE: "Most rewatched" rankings. No DOM, no store.
//
// How rewatches are stored
//   * Episodes: one record per episode with a running total `n` (1 = watched once),
//     so a show's rewatches are the sum of (n - 1) over its episodes. There is no
//     per-viewing date, so this is an ALL-TIME figure and can't be split by year.
//   * Movies: every viewing is its own dated entry, so a film watched three times
//     is three entries (same tmdbId, or the same name when it has no tmdbId).
//     Planned (watchlist) entries are not viewings.
//
// "Rewatches" always means viewings AFTER the first.

export const REWATCH_LIMIT = 8;

const count = (n) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v >= 1 ? v : 1;
};

// A name appearing twice would collide as a list key, so later ones get " (2)", " (3)"…
function uniqueLabels(rows) {
  const seen = new Map();
  return rows.map((r) => {
    const k = r.label;
    const c = (seen.get(k) || 0) + 1;
    seen.set(k, c);
    return c === 1 ? r : { ...r, label: `${k} (${c})` };
  });
}

// shows: { id: show }. rows: [{ label, value: rewatches, eps: distinct episodes rewatched }]
export function rewatchedShows(shows, limit = REWATCH_LIMIT) {
  const all = [];
  let total = 0;
  for (const s of Object.values(shows || {})) {
    if (!s || typeof s !== 'object') continue;
    let re = 0, eps = 0;
    for (const w of Object.values(s.watched || {})) {
      if (!w || typeof w !== 'object') continue;
      const extra = count(w.n) - 1;
      if (extra > 0) { re += extra; eps += 1; }
    }
    if (re > 0) {
      total += re;
      all.push({ label: String(s.name || 'Untitled'), value: re, eps });
    }
  }
  all.sort((a, b) => b.value - a.value || b.eps - a.eps || a.label.localeCompare(b.label));
  return { rows: uniqueLabels(all.slice(0, limit)), total, titles: all.length };
}

// movies: the flat list. rows: [{ label, value: rewatches, times: viewings }]
export function rewatchedMovies(movies, limit = REWATCH_LIMIT) {
  const groups = new Map();
  for (const m of Array.isArray(movies) ? movies : []) {
    if (!m || typeof m !== 'object') continue;
    if ((m.status || 'watched') !== 'watched') continue; // a watchlist entry isn't a viewing
    const name = String(m.name || '').trim();
    const key = m.tmdbId != null ? 't' + m.tmdbId : 'n' + name.toLowerCase();
    if (key === 'n') continue; // no id and no name: can't tell what it is
    const g = groups.get(key) || { label: name || 'Untitled', times: 0 };
    g.times += 1;
    if (name) g.label = name;
    groups.set(key, g);
  }
  const all = [];
  let total = 0;
  for (const g of groups.values()) {
    if (g.times > 1) {
      total += g.times - 1;
      all.push({ label: g.label, value: g.times - 1, times: g.times });
    }
  }
  all.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return { rows: uniqueLabels(all.slice(0, limit)), total, titles: all.length };
}

export const rewatchSummary = (total, titles, noun) =>
  `${total.toLocaleString()} ${total === 1 ? 'rewatch' : 'rewatches'} across ${titles.toLocaleString()} ${titles === 1 ? noun : noun + 's'}, all time.`;
