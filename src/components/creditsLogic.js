// Pure credit-crunching for the Cast & crew card. No React / no network, so
// it can be unit-tested with plain node.

const yearOf = (s) => (s || '').slice(0, 4);
const dateOf = (c) => c.release_date || c.first_air_date || '';

// TMDB /tv/{id}?append_to_response=aggregate_credits  →  what the UI needs.
export function summarizeCredits(details) {
  const ac = (details && details.aggregate_credits) || {};
  const cast = (ac.cast || []).map((c) => ({
    id: c.id,
    name: c.name,
    profile: c.profile_path || null,
    character: ((c.roles || []).find((r) => r.character) || {}).character || '',
  }));

  const created = ((details && details.created_by) || []).map((p) => p.name).filter(Boolean);

  // Group crew by the handful of roles worth surfacing. A person can appear in
  // several groups (a writer-director). Sorted by episodes worked, busiest first.
  const GROUPS = [
    { title: 'Directors', jobs: ['Director'] },
    { title: 'Writers', jobs: ['Writer', 'Screenplay', 'Teleplay', 'Story'] },
    { title: 'Executive producers', jobs: ['Executive Producer'] },
  ];
  const groups = GROUPS.map((g) => {
    const people = [];
    for (const c of ac.crew || []) {
      const hits = (c.jobs || []).filter((j) => g.jobs.includes(j.job));
      if (!hits.length) continue;
      people.push({
        id: c.id,
        name: c.name,
        profile: c.profile_path || null,
        jobs: hits.map((j) => j.job),
        eps: hits.reduce((n, j) => Math.max(n, j.episode_count || 0), 0),
      });
    }
    people.sort((a, b) => b.eps - a.eps || a.name.localeCompare(b.name));
    return { title: g.title, people };
  }).filter((g) => g.people.length > 0);

  const directors = (groups.find((g) => g.title === 'Directors') || { people: [] }).people;
  return { cast, created, groups, directors, crewTotal: (ac.crew || []).length };
}

// TMDB /movie/{id}?append_to_response=credits  →  the same shape as summarizeCredits, so the
// one Cast & crew card works for films too. A film's crew has one job per entry (no episode
// counts); people are grouped the same way, in TMDB's billing order.
export function summarizeMovieCredits(details) {
  const cr = (details && details.credits) || {};
  const cast = (cr.cast || [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((c) => ({ id: c.id, name: c.name, profile: c.profile_path || null, character: c.character || '' }));
  const GROUPS = [
    { title: 'Directors', jobs: ['Director'] },
    { title: 'Writers', jobs: ['Writer', 'Screenplay', 'Story', 'Novel', 'Characters'] },
    { title: 'Producers', jobs: ['Producer', 'Executive Producer'] },
    { title: 'Music', jobs: ['Original Music Composer', 'Music'] },
  ];
  const groups = GROUPS.map((g) => {
    const byId = new Map();
    for (const c of cr.crew || []) {
      if (!c || !g.jobs.includes(c.job)) continue;
      const p = byId.get(c.id) || { id: c.id, name: c.name, profile: c.profile_path || null, jobs: [], eps: 0 };
      if (!p.jobs.includes(c.job)) p.jobs.push(c.job);
      byId.set(c.id, p);
    }
    return { title: g.title, people: [...byId.values()] };
  }).filter((g) => g.people.length > 0);
  const directors = (groups.find((g) => g.title === 'Directors') || { people: [] }).people;
  return { cast, created: [], groups, directors, crewTotal: (cr.crew || []).length };
}

// A person's other work: acting + crew credits merged to one row per title,
// the show we're already on dropped, better-known work first.
export function mergeCredits(combined, excludeTvId, excludeMovieId) {
  const byKey = new Map();
  const push = (c, role) => {
    if (!c || !c.id || !c.media_type) return;
    if (c.media_type !== 'tv' && c.media_type !== 'movie') return;
    if (c.media_type === 'tv' && c.id === excludeTvId) return;
    if (c.media_type === 'movie' && c.id === excludeMovieId) return;
    const key = c.media_type + ':' + c.id;
    const existing = byKey.get(key);
    if (existing) {
      if (role && !existing.roles.includes(role)) existing.roles.push(role);
      return;
    }
    byKey.set(key, {
      key,
      id: c.id,
      media_type: c.media_type,
      name: c.title || c.name || '',
      year: yearOf(dateOf(c)),
      poster: c.poster_path || null,
      vote: c.vote_count || 0,
      pop: c.popularity || 0,
      roles: role ? [role] : [],
    });
  };
  (combined.cast || []).forEach((c) => push(c, c.character));
  (combined.crew || []).forEach((c) => push(c, c.job));
  return [...byKey.values()].sort((a, b) => b.vote - a.vote || b.pop - a.pop);
}
