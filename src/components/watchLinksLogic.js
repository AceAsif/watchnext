// Watch links (pure logic, unit-tested in plain node).
// On the show page and the movie sheet: [▶ Netflix] [▶ Stan] [All options].
// A service button opens that service's own search for the title (the exact title page
// would need a paid API, e.g. Watchmode — maybe later). "All options" opens TMDB's
// "Where to watch" page (powered by JustWatch), whose logos link to the exact title.
// Which services come from TMDB's watch providers for your region (the same data as
// "Streaming in Australia"), so we only show services that really have the title.
//
// To fix or add a service, change one row in WATCH_SERVICES.
//   match:   tested against TMDB's provider name (e.g. "Netflix basic with Ads")
//   search:  the service's search page; {q} is replaced by the title
//   sure:    true = checked; false = best guess, please check by tapping it once

import { isFreeProviderName } from './servicesLogic.js';

export const WATCH_SERVICES = [
  { id: 'netflix', label: 'Netflix', match: /netflix/i, search: 'https://www.netflix.com/search?q={q}', sure: true },
  { id: 'prime', label: 'Prime Video', match: /prime video|amazon video/i, search: 'https://www.primevideo.com/search?phrase={q}', sure: true },
  { id: 'disney', label: 'Disney+', match: /disney/i, search: 'https://www.disneyplus.com/search?q={q}', sure: false },
  { id: 'stan', label: 'Stan', match: /^stan\b/i, search: 'https://www.stan.com.au/search?q={q}', sure: false },
  { id: 'binge', label: 'Binge', match: /^binge\b/i, search: 'https://binge.com.au/search?q={q}', sure: false },
  { id: 'appletv', label: 'Apple TV+', match: /apple tv\s*(\+|plus)/i, search: 'https://tv.apple.com/search?term={q}', sure: true },
  { id: 'paramount', label: 'Paramount+', match: /paramount/i, search: 'https://www.paramountplus.com/search/?q={q}', sure: false },
  { id: 'max', label: 'HBO Max', match: /^(hbo )?max\b/i, search: 'https://play.hbomax.com/search?q={q}', sure: false },
  { id: 'crunchyroll', label: 'Crunchyroll', match: /crunchyroll/i, search: 'https://www.crunchyroll.com/search?q={q}', sure: true },
  { id: 'iview', label: 'ABC iview', match: /iview/i, search: 'https://iview.abc.net.au/search?keyword={q}', sure: false },
  { id: 'sbs', label: 'SBS On Demand', match: /\bsbs\b/i, search: 'https://www.sbs.com.au/ondemand/search?q={q}', sure: false },
  { id: 'youtube', label: 'YouTube', match: /youtube/i, search: 'https://www.youtube.com/results?search_query={q}', sure: true },
];

export const MAX_BUTTONS = 3; // service buttons; the rest are in "All options"

export const serviceFor = (providerName) => WATCH_SERVICES.find((s) => s.match.test(String(providerName || ''))) || null;

export function searchUrl(service, title) {
  const q = encodeURIComponent(String(title || '').trim());
  return service.search.replace('{q}', q);
}

const names = (list) => (Array.isArray(list) ? list : []).map((p) => (p && (p.name || p.provider_name)) || '').filter(Boolean);

/**
 * The buttons to show.
 * rec:   { providers, providersFree, providersLink } for your region (subscription + free lists)
 * title: the name to search for
 * mine:  ids of the services you pay for (Settings → My services) — these come first
 * Returns { buttons: [{ id, label, url }], more: N other services not shown as buttons,
 *           all: the "All options" url or '' }
 */
export function watchLinks(rec, title, mine = []) {
  const r = rec && typeof rec === 'object' ? rec : {};
  const own = new Set(mine instanceof Set ? [...mine] : Array.isArray(mine) ? mine : []);
  const subs = names(r.providers);
  const free = names(r.providersFree);
  const found = []; // services in TMDB order, no repeats
  const other = new Set(); // providers we have no button for
  for (const [n, isFree] of [...subs.map((x) => [x, false]), ...free.map((x) => [x, true])]) {
    const s = serviceFor(n);
    if (!s) { other.add(n.replace(/\s+(with ads|basic with ads|standard with ads)$/i, '')); continue; }
    if (!found.some((f) => f.s.id === s.id)) found.push({ s, isFree: isFree || isFreeProviderName(n) });
  }
  // Yours first, then free ones, then the rest (each group keeps TMDB's order).
  const rank = (f) => (own.has(f.s.id) ? 0 : f.isFree ? 1 : 2);
  const sorted = found.map((f, i) => ({ ...f, i })).sort((a, b) => rank(a) - rank(b) || a.i - b.i);
  const t = String(title || '').trim();
  const buttons = t ? sorted.slice(0, MAX_BUTTONS).map(({ s }) => ({ id: s.id, label: s.label, url: searchUrl(s, t), mine: own.has(s.id) })) : [];
  const more = Math.max(0, sorted.length - buttons.length) + other.size;
  const all = typeof r.providersLink === 'string' && /^https:\/\//.test(r.providersLink) ? r.providersLink : '';
  return { buttons, more, all };
}

// Movie sheet: TMDB's details response with append_to_response=watch/providers has
// d["watch/providers"].results[REGION] = { flatrate, free, ads, link, … } (or nothing).
export const regionBlock = (details, region) => {
  const wp = details && details['watch/providers'];
  return (wp && wp.results && wp.results[region]) || null;
};
