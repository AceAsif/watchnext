// PURE: finds movies that appear more than once in the watched list. No DOM, no store.
//
// It only LISTS them. Nothing here deletes or changes anything: you look at the dates and
// decide, then remove the extra copy yourself (Movies -> the title -> Remove).
//
// How copies are recognised (same rule as the "2×" chip on the Movies tiles):
//   * the same TMDB id, or
//   * no TMDB id and the same title (case and spacing ignored).
// One extra pass catches the common leftover from an import: a copy with NO TMDB id whose
// title matches exactly one linked film, so the pair is listed together and flagged.
// Watchlist ("planned") entries are not viewings and are ignored.

const DAY = /^(\d{4})-(\d{2})-(\d{2})/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const normTitle = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export const dayOf = (iso) => { const m = DAY.exec(String(iso || '')); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
export function dayLabel(iso) {
  const m = DAY.exec(String(iso || ''));
  if (!m) return 'no date';
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? `${Number(m[3])} ${MONTHS[mo - 1]} ${m[1]}` : 'no date';
}

const linked = (m) => m.tmdbId != null && m.tmdbId !== '';
const entryOf = (m) => ({
  date: dayOf(m.watchedAt),
  rating: Number(m.rating) > 0 ? Number(m.rating) : 0,
  hasNote: Boolean((typeof m.note === 'string' && m.note.trim()) || m.react),
  linked: linked(m),
});

// movies: the flat list. -> { groups, titles, extra }
//   groups: [{ key, name, poster, year, entries: [{ date, rating, hasNote, linked }] oldest first,
//              sameDay: two or more copies share a date, unlinked: a copy has no TMDB id }]
//   titles: how many films appear more than once; extra: copies beyond the first of each
export function findDuplicateMovies(movies) {
  const byKey = new Map();
  for (const m of Array.isArray(movies) ? movies : []) {
    if (!m || typeof m !== 'object' || (m.status || 'watched') !== 'watched') continue;
    const name = String(m.name || '').trim();
    const key = linked(m) ? 't' + m.tmdbId : name ? 'n' + normTitle(name) : '';
    if (!key) continue; // no id and no title: nothing to compare
    const g = byKey.get(key) || { key, name, poster: null, year: null, norm: normTitle(name), isLinked: linked(m), movies: [] };
    g.movies.push(m);
    if (name) g.name = name;
    if (!g.poster && m.poster) g.poster = m.poster;
    if (!g.year && m.year) g.year = String(m.year);
    byKey.set(key, g);
  }
  // pass 2: an unlinked group joins the ONE linked group with the same title (remakes share names, so two matches = leave alone)
  const linkedByName = new Map();
  for (const g of byKey.values()) if (g.isLinked && g.norm) linkedByName.set(g.norm, [...(linkedByName.get(g.norm) || []), g]);
  for (const g of [...byKey.values()]) {
    if (g.isLinked || !g.norm) continue;
    const hit = linkedByName.get(g.norm);
    if (hit && hit.length === 1) {
      hit[0].movies.push(...g.movies);
      if (!hit[0].poster) hit[0].poster = g.poster;
      byKey.delete(g.key);
    }
  }
  const groups = [];
  for (const g of byKey.values()) {
    if (g.movies.length < 2) continue;
    const entries = g.movies.map(entryOf).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const days = entries.map((e) => e.date).filter(Boolean);
    groups.push({
      key: g.key, name: g.name || 'Untitled', poster: g.poster, year: g.year, entries,
      sameDay: new Set(days).size < days.length,
      unlinked: entries.some((e) => !e.linked),
    });
  }
  // most likely accidental first (same day), then A to Z
  groups.sort((a, b) => Number(b.sameDay) - Number(a.sameDay) || a.name.localeCompare(b.name));
  return { groups, titles: groups.length, extra: groups.reduce((n, g) => n + g.entries.length - 1, 0) };
}

export function duplicatesIntro(titles, extra) {
  const t = titles === 1 ? '1 movie appears' : `${titles.toLocaleString()} movies appear`;
  const e = extra === 1 ? '1 extra copy' : `${extra.toLocaleString()} extra copies`;
  return `${t} more than once in your watched list (${e}). Nothing is changed here. Copies logged on the same day are probably accidental; copies on different days may be real rewatches.`;
}

// The short tag beside a title: why it is listed.
export function dupTag(g) {
  if (g.sameDay) return 'Same day';
  if (g.unlinked) return 'One not linked';
  return 'Different days';
}

export const removeHint = 'To remove a copy: Movies → find the title → tap the one to remove → Remove. The “2×” chip disappears once only one copy is left.';
