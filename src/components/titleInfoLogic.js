// The facts line on the title info sheet (pure, unit-tested).
//   movie: ['100 min', 'Horror, Comedy']
//   tv:    ['2021–2023', '3 seasons · 24 episodes', 'Ended', '~45 min', 'Drama, Crime']
const yearOf = (d) => (typeof d === 'string' && /^\d{4}/.test(d) ? d.slice(0, 4) : '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const genres = (d) => (Array.isArray(d.genres) ? d.genres.map((g) => g && g.name).filter(Boolean).join(', ') : '');

export function tvYears(d) {
  const a = yearOf(d.first_air_date), b = yearOf(d.last_air_date);
  if (!a) return '';
  const ended = d.status === 'Ended' || d.status === 'Canceled';
  if (!ended) return `${a}–`; // still going
  return b && b !== a ? `${a}–${b}` : a;
}

export function titleFacts(kind, d, fallback = {}) {
  const x = d && typeof d === 'object' && !d.error ? d : null;
  if (kind === 'movie') {
    const runtime = (x && x.runtime) || fallback.runtimeMin || 0;
    return [runtime ? `${runtime} min` : '', x ? genres(x) : ''].filter(Boolean);
  }
  if (!x) return [];
  const s = Number(x.number_of_seasons) || 0, e = Number(x.number_of_episodes) || 0;
  const size = [s ? plural(s, 'season', 'seasons') : '', e ? plural(e, 'episode', 'episodes') : ''].filter(Boolean).join(' · ');
  const run = Array.isArray(x.episode_run_time) && x.episode_run_time[0] ? `~${x.episode_run_time[0]} min` : '';
  const status = x.status === 'Returning Series' ? 'Still airing' : x.status === 'Canceled' ? 'Cancelled' : x.status || '';
  return [tvYears(x), size, status, run, genres(x)].filter(Boolean);
}
