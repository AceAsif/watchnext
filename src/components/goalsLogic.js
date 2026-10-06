// PURE: yearly watch goals. No DOM, no store.
//
// A goal is a target for one calendar year, for any of three things: episodes, movies, hours.
//   goals = { '2026': { episodes: 400, movies: 24, hours: 500, at: '<ISO time it was last changed>' } }
// Progress counts exactly what the Year in Review card counts (so the numbers always agree).
// Goals sync between devices: the copy changed most recently (`at`) wins, per year; clearing
// every target of a year keeps an empty entry with a fresh `at` so the clearing syncs too.

export const METRICS = [
  { id: 'episodes', label: 'Episodes', noun: 'episode', nouns: 'episodes', presets: [200, 300, 400, 500, 750] },
  { id: 'movies', label: 'Movies', noun: 'movie', nouns: 'movies', presets: [12, 24, 52, 100] },
  { id: 'hours', label: 'Hours', noun: 'hour', nouns: 'hours', presets: [250, 500, 750, 1000] },
];
export const METRIC_IDS = METRICS.map((m) => m.id);
export const metricById = (id) => METRICS.find((m) => m.id === id) || null;
export const MAX_GOAL = 99999;
export const EARLY_DAYS = 14; // before this many days into the year there is nothing sensible to project

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const YEAR = /^\d{4}$/;
const isoOk = (s) => typeof s === 'string' && s !== '' && Number.isFinite(Date.parse(s));
const goalNum = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= MAX_GOAL ? n : null; };

// ------------------------------------------------------------------ storage rules
export function sanitizeGoals(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [year, g] of Object.entries(raw)) {
    if (BAD_KEYS.has(year) || !YEAR.test(year) || Number(year) < 1980 || Number(year) > 2100 || !g || typeof g !== 'object') continue;
    const e = {};
    for (const id of METRIC_IDS) { const n = goalNum(g[id]); if (n != null) e[id] = n; }
    e.at = isoOk(g.at) ? g.at : '';
    out[year] = e;
  }
  return out;
}

// Per year the most recently changed copy wins (ties go to `local`). Years only one side has are kept.
export function mergeGoals(remote, local) {
  const r = sanitizeGoals(remote), l = sanitizeGoals(local);
  const out = {};
  for (const year of new Set([...Object.keys(r), ...Object.keys(l)])) {
    const a = r[year], b = l[year];
    if (!a) out[year] = b; else if (!b) out[year] = a;
    else out[year] = Date.parse(a.at || 0) > Date.parse(b.at || 0) ? a : b;
  }
  return out;
}
export const sameGoals = (a, b) => JSON.stringify(sanitizeGoals(a)) === JSON.stringify(sanitizeGoals(b));

// Add the backup's years that this device has no entry for. Never overwrites (restore only fills gaps).
export function fillGoals(local, backup) {
  const l = sanitizeGoals(local), b = sanitizeGoals(backup);
  const out = { ...l }; let added = 0;
  for (const [year, g] of Object.entries(b)) if (!out[year] && METRIC_IDS.some((id) => g[id])) { out[year] = g; added++; }
  return { goals: out, added };
}

// patch: { episodes?: number|null, movies?: number|null, hours?: number|null }. A number sets that target,
// null / 0 / '' removes it, undefined leaves it. Returns NEW goals (the input is not modified).
export function setGoal(goals, year, patch, nowIso) {
  const cur = sanitizeGoals(goals);
  const y = String(year);
  const e = { ...(cur[y] || {}) };
  for (const id of METRIC_IDS) {
    if (!patch || !(id in patch) || patch[id] === undefined) continue;
    const n = goalNum(patch[id]);
    if (n == null) delete e[id]; else e[id] = n;
  }
  e.at = nowIso;
  return sanitizeGoals({ ...cur, [y]: e });
}
export const goalsOfYear = (goals, year) => {
  const g = sanitizeGoals(goals)[String(year)];
  return g ? Object.fromEntries(METRIC_IDS.filter((id) => g[id]).map((id) => [id, g[id]])) : {};
};
export const hasGoals = (goals, year) => Object.keys(goalsOfYear(goals, year)).length > 0;

// ------------------------------------------------------------------ dates
export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInYear = (y) => (isLeap(Number(y)) ? 366 : 365);
export function dayOfYear(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return 0;
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(+m[1], 0, 1)) / 86400000) + 1;
}

// ------------------------------------------------------------------ progress and pace
// state: 'met' | 'early' | 'ahead' | 'on' | 'behind'  (this year)   'met' | 'missed' (a past year)   'upcoming'
export function progressFor({ target, done, year, today }) {
  const d = Math.max(0, Math.round(Number(done) || 0));
  const pct = target > 0 ? Math.round((d / target) * 100) : 0;
  const base = { target, done: d, pct, remaining: Math.max(0, target - d), met: d >= target };
  const y = Number(year), cy = Number((today || '').slice(0, 4));
  if (y < cy) return { ...base, state: base.met ? 'met' : 'missed', fraction: 1, daysLeft: 0, projected: null, delta: 0, perWeek: 0 };
  if (y > cy) return { ...base, state: 'upcoming', fraction: 0, daysLeft: daysInYear(y), projected: null, delta: 0, perWeek: 0 };
  const diy = daysInYear(y), doy = dayOfYear(today), daysLeft = diy - doy, fraction = doy / diy;
  const delta = Math.round(d - target * fraction);
  const tol = Math.max(1, Math.round(target * 0.01));
  const projected = doy >= EARLY_DAYS ? Math.round(d / fraction) : null;
  const perWeek = base.remaining / (Math.max(daysLeft, 1) / 7);
  const state = base.met ? 'met' : doy < EARLY_DAYS ? 'early' : delta >= tol ? 'ahead' : delta <= -tol ? 'behind' : 'on';
  return { ...base, state, fraction, daysLeft, projected, delta, perWeek };
}

const plural = (n, one, many) => (n === 1 ? one : many);
const rate = (r) => (r >= 10 ? String(Math.round(r)) : String(Math.round(r * 10) / 10));
export function paceText(metricId, p) {
  const m = metricById(metricId) || METRICS[0];
  const noun = (n) => plural(n, m.noun, m.nouns);
  switch (p.state) {
    case 'met': return p.daysLeft > 0 ? `Goal reached · ${p.daysLeft} ${plural(p.daysLeft, 'day', 'days')} to spare` : 'Goal reached';
    case 'missed': return `Ended the year at ${p.pct}% of the goal`;
    case 'upcoming': return 'Starts on 1 Jan';
    case 'early': return 'Just getting started';
    case 'on': return `On pace for ${p.projected.toLocaleString()}`;
    case 'ahead': return `${p.delta.toLocaleString()} ${noun(p.delta)} ahead of pace · on track for ${p.projected.toLocaleString()}`;
    case 'behind':
      return p.daysLeft < 7
        ? `${(-p.delta).toLocaleString()} ${noun(-p.delta)} behind pace · ${p.remaining.toLocaleString()} more to go`
        : `${(-p.delta).toLocaleString()} ${noun(-p.delta)} behind pace · ${rate(p.perWeek)} a week gets you there`;
    default: return '';
  }
}
export const streakText = (current, longest) =>
  `${current > 0 ? `${current} ${plural(current, 'day', 'days')} in a row` : 'No streak right now'} · best ${longest} ${plural(longest, 'day', 'days')}`;

// ------------------------------------------------------------------ what the cards show
// actuals = { episodes, movies, hours } for that year (as the Year in Review card counts them).
export function goalRows(goals, year, actuals, today) {
  const g = goalsOfYear(goals, year);
  return METRICS.filter((m) => g[m.id]).map((m) => {
    const p = progressFor({ target: g[m.id], done: actuals[m.id] || 0, year, today });
    return { id: m.id, label: m.label, ...p, pace: paceText(m.id, p) };
  });
}
// The compact version for the Year in Review card / saved image: { episodes: { target, done, pct, met } }
export function cardGoals(goals, year, actuals, today) {
  const out = {};
  for (const r of goalRows(goals, year, actuals, today)) out[r.id] = { target: r.target, done: r.done, pct: r.pct, met: r.met };
  return Object.keys(out).length ? out : null;
}
export function goalShareText(card) {
  if (!card) return '';
  const parts = METRICS.filter((m) => card[m.id]).map((m) => `${card[m.id].done.toLocaleString()}/${card[m.id].target.toLocaleString()} ${m.nouns}`);
  return parts.length ? `Goals: ${parts.join(', ')}.` : '';
}

// ------------------------------------------------------------------ the editor
// Parse what was typed. '' = no goal (null). Returns { value, error }.
export function parseGoalInput(text) {
  const t = String(text == null ? '' : text).trim();
  if (t === '') return { value: null, error: '' };
  if (!/^\d+$/.test(t)) return { value: null, error: 'Use a whole number.' };
  const n = Number(t);
  if (n < 1) return { value: null, error: 'Use a number above zero (or clear it).' };
  if (n > MAX_GOAL) return { value: null, error: `Use ${MAX_GOAL.toLocaleString()} or less.` };
  return { value: n, error: '' };
}
