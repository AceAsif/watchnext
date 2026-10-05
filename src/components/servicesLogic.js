// PURE: the "On my services" filter. No DOM, no store.
//
// You tick the subscription services you pay for (Settings → My services). A title is
// "on my services" when TMDB says it streams in Australia on one of those, OR it is
// free to watch (ABC iview, SBS On Demand, 7plus, free ad-supported tiers...) — free
// always counts, so you never need to tick those. Rent/buy does not count.
//
// Availability comes from TMDB's Australian watch-providers block, cached on each
// show / planned movie (`providers` = subscription list, `providersFree` = free +
// ad-supported list, `providersSynced`) and re-checked in the background when it is
// missing or older than FRESH_DAYS.

import { PLATFORMS, platformById, providerToPlatform } from './platformsData.js';

export const FRESH_DAYS = 14;
export const CONCURRENCY = 3; // lookups running at once
export const GAP_MS = 150; // pause before starting the next one (TMDB rate limits)
const DAY = 86400000;

// Chips that are not subscriptions you tick: free services always count anyway.
const NOT_SUBSCRIPTIONS = new Set(['cinema', 'other', 'youtube', 'iview']);
export const serviceChoices = () => PLATFORMS.filter((p) => !NOT_SUBSCRIPTIONS.has(p.id));
export const SERVICE_IDS = () => new Set(serviceChoices().map((p) => p.id));

// Providers that are free to watch even when TMDB lists them under subscription.
const FREE_NAME = /iview|\bsbs\b|9now|7plus|10 play|tubi|plex|pluto|freeview|youtube/i;
export const isFreeProviderName = (name) => FREE_NAME.test(String(name || ''));

const pick = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((p) => p && typeof p === 'object' && (p.provider_name || p.name))
    .map((p) => ({ name: String(p.provider_name || p.name), logo: p.logo_path || p.logo || null }));
const dedupe = (list) => { const seen = new Set(); return list.filter((p) => !seen.has(p.name) && seen.add(p.name)); };

// TMDB's AU block ({ flatrate, free, ads, rent, buy, link }) or null -> what we cache.
// `providers` stays the raw subscription list (the show page and "Detect platforms" use it).
export function normalizeProviders(au) {
  const a = au && typeof au === 'object' ? au : {};
  return { providers: dedupe(pick(a.flatrate)), free: dedupe([...pick(a.free), ...pick(a.ads)]), link: typeof a.link === 'string' ? a.link : '' };
}

// ------------------------------------------------------------------ freshness
export function needsCheck(rec, now = new Date()) {
  if (!rec || typeof rec !== 'object') return false;
  if (!rec.providersSynced || !Array.isArray(rec.providersFree)) return true; // never checked, or cached before free lists existed
  const t = Date.parse(rec.providersSynced);
  return !Number.isFinite(t) || (now.getTime() - t) / DAY >= FRESH_DAYS;
}

// ------------------------------------------------------------------ matching
// mine = Set of platform ids. -> { subs: [labels you subscribe to], free: [names] }
export function matchedServices(rec, mine) {
  const subs = [], free = [];
  const m = mine instanceof Set ? mine : new Set(mine || []);
  const list = (v) => (Array.isArray(v) ? v : []); // cached values can arrive corrupted through sync
  for (const p of list(rec && rec.providers)) {
    if (!p || !p.name) continue;
    if (isFreeProviderName(p.name)) { free.push(p.name); continue; }
    const id = providerToPlatform(p.name);
    if (id && m.has(id)) subs.push(platformById(id).label);
  }
  for (const p of list(rec && rec.providersFree)) if (p && p.name) free.push(p.name);
  return { subs: [...new Set(subs)], free: [...new Set(free)] };
}

// 'on' | 'off' | 'unchecked'
export function availabilityState(rec, mine) {
  if (!rec || !rec.providersSynced) return 'unchecked';
  const { subs, free } = matchedServices(rec, mine);
  return subs.length || free.length ? 'on' : 'off';
}
export const isOnMyServices = (rec, mine) => availabilityState(rec, mine) === 'on';

// "Netflix · Stan" / "Free: ABC iview" / "Netflix · Free: ABC iview"; '' when nothing matches.
export function servicesLabel(rec, mine) {
  const { subs, free } = matchedServices(rec, mine);
  const parts = [];
  if (subs.length) parts.push(subs.slice(0, 2).join(' · '));
  if (free.length) parts.push(`Free: ${free.slice(0, 2).join(', ')}`);
  return parts.join(' · ');
}

// Entries -> only those that are on my services (unchecked ones are left out until checked).
export const filterOnMyServices = (entries, getRec, mine) => entries.filter((e) => isOnMyServices(getRec(e), mine));

// ------------------------------------------------------------------ background checks
// items: [{ key, tmdbId, rec }]. Which lookups can start now?
export function pending(items, failed, now = new Date()) {
  return items.filter((i) => i && i.tmdbId && !(failed && failed.has(i.key)) && needsCheck(i.rec, now));
}
export function nextBatch(items, { failed = new Set(), inflight = new Set(), max = CONCURRENCY, now = new Date() } = {}) {
  const room = Math.max(0, max - inflight.size);
  return pending(items, failed, now).filter((i) => !inflight.has(i.key)).slice(0, room);
}

// What the little status line under the toggle says (or null).
export function statusLine({ remaining = 0, failed = 0, noKey = false, noServices = false, unknownIds = 0 } = {}) {
  if (noKey && remaining > 0) return 'Add your TMDB key in Settings so availability can be checked.';
  if (remaining > 0) return `Checking availability… ${remaining.toLocaleString()} left`;
  if (failed > 0) return `${failed.toLocaleString()} ${failed === 1 ? 'title' : 'titles'} couldn’t be checked.`;
  if (noServices) return 'Choose the services you pay for. Free-to-watch titles show meanwhile.';
  if (unknownIds > 0) return `${unknownIds.toLocaleString()} ${unknownIds === 1 ? 'title has' : 'titles have'} no TMDB link, so ${unknownIds === 1 ? 'it' : 'they'} can’t be checked.`;
  return null;
}

// ------------------------------------------------------------------ preferences (per device)
export const PREFS_KEY = 'watchnext-services-v1';
export const DEFAULT_PREFS = Object.freeze({ mine: [], showsOnly: false, watchlistOnly: false });

export function sanitizePrefs(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const ok = SERVICE_IDS();
  return {
    mine: [...new Set((Array.isArray(r.mine) ? r.mine : []).filter((id) => typeof id === 'string' && ok.has(id)))],
    showsOnly: r.showsOnly === true,
    watchlistOnly: r.watchlistOnly === true,
  };
}
export function loadPrefs(storage) {
  try { return sanitizePrefs(JSON.parse(storage.getItem(PREFS_KEY))); } catch (e) { return { ...DEFAULT_PREFS, mine: [] }; }
}
export function savePrefs(storage, prefs) {
  try { storage.setItem(PREFS_KEY, JSON.stringify(sanitizePrefs(prefs))); } catch (e) { /* storage blocked: it just won't be remembered */ }
}
export const toggleService = (mine, id) => (mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id]);
