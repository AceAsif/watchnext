// Movie title search helpers. TMDB's /search/movie ranks by popularity, so a
// common word like "Ready" buries the film you mean. A trailing year
// ("Ready 2011") narrows it to that release year.

// "Ready 2011" -> { title: 'Ready', year: '2011' }; "Ready" -> { title: 'Ready', year: null }.
// Only a trailing 4-digit year (1888-2100) counts, and only when a title is left,
// so a movie literally named "2012" or "1917" still searches as typed.
export function parseMovieQuery(raw) {
  const q = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
  const m = q.match(/^(.*\S)\s*[\s(]\s*(\d{4})\)?$/);
  if (m) {
    const y = Number(m[2]);
    const title = m[1].replace(/[(\s]+$/, '').trim();
    if (title && y >= 1888 && y <= 2100) return { title, year: m[2] };
  }
  return { title: q, year: null };
}

// Run a search with year awareness. `fetchPage(params)` resolves to TMDB's
// { results }. With a year we try the year first and fall back to the plain
// full text if nothing matched, so a title that ends in a number still works.
export async function searchWithYear(fetchPage, raw) {
  const { title, year } = parseMovieQuery(raw);
  if (year) {
    const hit = await fetchPage({ query: title, year });
    if (hit && hit.results && hit.results.length) return hit;
    const loose = await fetchPage({ query: title });
    const results = ((loose && loose.results) || []).filter((r) => (r.release_date || '').slice(0, 4) === year);
    if (results.length) return { ...loose, results };
    return fetchPage({ query: String(raw).trim() });
  }
  return fetchPage({ query: title });
}

export const FIX_RESULTS_MAX = 20;
