// One tile per film in the Movies grid. PURE: no DOM, no store.
//
// Every viewing of a movie is its own dated entry (a rewatch is a second entry). The grid used
// to show one tile per entry, so a film watched four times filled four tiles. Here the
// viewings are grouped into one film, using the same rule as the "2×" chip (rewatchLogic):
// the same TMDB id, or the same name (ignoring case and spaces) when it isn't linked.
//
// groupMovies(watched) -> [{
//   key, name, tmdbId, poster, year,
//   watchedAt,       latest viewing date (what "Recent" sorts by and the tile shows)
//   rating,          the newest viewing's own rating, else the newest rating given at all, else 0
//   times,           how many viewings
//   latest,          the newest viewing entry (opened when the tile is tapped)
//   viewings,        every entry, newest first
// }]
// `watched` is the page's list of watched entries, each carrying its `index` in the real array.

export const movieKey = (m) => {
  const name = String((m && m.name) || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return m && m.tmdbId != null ? 't' + m.tmdbId : name ? 'n' + name : 'i' + (m && m.index);
};

const newestFirst = (a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || '') || (b.index ?? 0) - (a.index ?? 0);

export function groupMovies(watched) {
  const map = new Map();
  for (const m of Array.isArray(watched) ? watched : []) {
    if (!m || typeof m !== 'object') continue;
    const k = movieKey(m);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(m);
  }
  const out = [];
  for (const [key, list] of map) {
    const viewings = list.slice().sort(newestFirst);
    const latest = viewings[0];
    const rated = viewings.find((v) => Number(v.rating) > 0);
    out.push({
      key,
      name: latest.name,
      tmdbId: latest.tmdbId ?? null,
      poster: latest.poster || (viewings.find((v) => v.poster) || {}).poster || null,
      year: latest.year || (viewings.find((v) => v.year) || {}).year || null,
      watchedAt: latest.watchedAt || '',
      rating: Number(latest.rating) > 0 ? Number(latest.rating) : rated ? Number(rated.rating) : 0,
      times: viewings.length,
      latest,
      viewings,
    });
  }
  return out.sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || ''));
}

// The group a viewing belongs to (for the movie sheet's "Viewings" list).
export function groupOfIndex(groups, index) {
  return (groups || []).find((g) => g.viewings.some((v) => v.index === index)) || null;
}

// "Watched 4 times" / "Watched once"
export const viewingsLabel = (n) => (n === 1 ? 'Watched once' : `Watched ${n} times`);
