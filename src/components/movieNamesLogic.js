// Movie names on the sheet and old saved names (pure logic, unit-tested in plain node).
//
// Every viewing of a film is its own saved entry and keeps the name, poster and year from when
// it was logged (an import, an old TMDB title, or a film that was matched wrongly). The Movies
// grid already joins viewings of one film into one tile; the movie sheet now always shows the
// film's CURRENT name and poster (TMDB's, or the newest viewing's when offline) and, under a
// viewing saved with a really different name, a "Saved as …" line with Fix match / Use the new name.
// Settings → Old movie names can update every old name in one go (to the film's newest viewing).

// Same title? Ignores case, accents, "The"/"A" at the start, "&" vs "and", punctuation and spaces.
export function normTitle(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
    .replace(/ /g, '');
}
export const sameTitle = (a, b) => normTitle(a) === normTitle(b);

const yearOf = (d) => (typeof d === 'string' && /^\d{4}/.test(d) ? d.slice(0, 4) : null);

/**
 * What the sheet shows as the film: TMDB's current title/poster/year when loaded, else the
 * newest viewing's (group = groupMovies() entry).
 */
export function currentFilm(group, details) {
  const g = group || {};
  const d = details && !details.error && (details.title || details.poster_path) ? details : null;
  return {
    name: (d && d.title) || g.name || '',
    poster: (d && d.poster_path) || g.poster || null,
    year: (d && yearOf(d.release_date)) || (g.year ? String(g.year) : null),
    fromTmdb: !!(d && d.title),
  };
}

/** The viewing's own saved name when it really differs from the film's current name, else null. */
export function savedAs(viewing, film) {
  const n = viewing && viewing.name;
  if (!n || !film || !film.name) return null;
  return sameTitle(n, film.name) ? null : n;
}

/** The change that makes a viewing use the current name/poster/year (only what differs). */
export function newNamePatch(viewing, film) {
  const patch = {};
  if (film.name && viewing.name !== film.name) patch.name = film.name;
  if (film.poster && viewing.poster !== film.poster) patch.poster = film.poster;
  if (film.year && String(viewing.year || '') !== String(film.year)) patch.year = String(film.year);
  return patch;
}

/**
 * Settings → Old movie names. groups = groupMovies(watched entries). For each film watched more
 * than once, the viewings saved under a really different name than its newest viewing.
 * → [{ key, name, poster, year, old: [{ index, name }], patches: [{ index, patch }] }], films A–Z.
 */
export function oldNames(groups) {
  const out = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    if (!g || !Array.isArray(g.viewings) || g.viewings.length < 2) continue;
    const film = { name: g.name, poster: g.poster || null, year: g.year ? String(g.year) : null };
    const stale = g.viewings.filter((v) => savedAs(v, film));
    if (!stale.length) continue;
    out.push({
      key: g.key, name: g.name, poster: g.poster || null, year: film.year,
      old: stale.map((v) => ({ index: v.index, name: v.name })),
      patches: stale.map((v) => ({ index: v.index, patch: newNamePatch(v, film) })).filter((p) => Object.keys(p.patch).length),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const allPatches = (rows) => rows.flatMap((r) => r.patches);
export const oldNamesIntro = (rows) => {
  const n = rows.reduce((s, r) => s + r.old.length, 0);
  return `${n} ${n === 1 ? 'viewing is' : 'viewings are'} saved under an older name than the film's newest viewing. Check them below; if one was a different film, open it in Movies and use Fix match instead.`;
};
