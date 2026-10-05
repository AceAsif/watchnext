import assert from 'node:assert/strict';
import * as S from '/home/claude/wl/src/components/servicesLogic.js';
import * as P from '/home/claude/wl/src/components/platformsData.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const NOW = new Date('2026-10-05T00:00:00.000Z'); const ago = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
const prov = (...names) => names.map((name) => ({ name, logo: '/' + name + '.png' }));
const rec = (o = {}) => ({ providers: [], providersFree: [], providersSynced: ago(1), ...o });
const mine = (...ids) => new Set(ids);

t('platforms: Paramount+ exists and TMDB names map to chips (existing mappings unchanged)', () => {
  assert.ok(P.platformById('paramount')); for (const [name, id] of [['Paramount Plus', 'paramount'], ['Paramount+', 'paramount'], ['Netflix', 'netflix'], ['Disney Plus', 'disney'], ['Amazon Prime Video', 'prime'], ['Max', 'max'], ['HBO Max', 'max'], ['Stan', 'stan'], ['Binge', 'binge'], ['Apple TV Plus', 'appletv'], ['ABC iview', 'iview'], ['YouTube', 'youtube']]) assert.equal(P.providerToPlatform(name), id, name);
  assert.equal(P.providerToPlatform('Foxtel Now'), null); assert.equal(P.providerToPlatform(''), null); assert.equal(P.providerToPlatform(null), null);
});
t('service choices = subscription chips only (no cinema / other / YouTube / iview), including Paramount+', () => {
  const ids = S.serviceChoices().map((p) => p.id); for (const must of ['netflix', 'disney', 'prime', 'max', 'paramount', 'stan', 'binge', 'appletv', 'crunchyroll']) assert.ok(ids.includes(must), must);
  for (const no of ['cinema', 'other', 'youtube', 'iview']) assert.ok(!ids.includes(no), no);
});
t('normalizeProviders: subscription list, free + ad-supported merged and de-duplicated, rent/buy ignored, link kept; null/junk -> empty', () => {
  const au = { flatrate: [{ provider_name: 'Netflix', logo_path: '/n.png' }, { provider_name: 'Netflix', logo_path: '/n2.png' }], free: [{ provider_name: 'ABC iview' }], ads: [{ provider_name: 'Tubi' }, { provider_name: 'ABC iview' }], rent: [{ provider_name: 'Apple TV' }], buy: [{ provider_name: 'Google Play' }], link: 'https://tmdb/x' };
  const r = S.normalizeProviders(au); assert.deepEqual(r.providers, [{ name: 'Netflix', logo: '/n.png' }]); assert.deepEqual(r.free.map((p) => p.name), ['ABC iview', 'Tubi']); assert.equal(r.link, 'https://tmdb/x');
  for (const bad of [null, undefined, 5, 'x', [], { flatrate: 'no', free: [null, 3, {}] }]) assert.deepEqual(S.normalizeProviders(bad), { providers: [], free: [], link: '' });
});
t('freshness: never checked, cached before free lists existed, 13.9 days = fresh, 14 days = stale, bad date = stale', () => {
  assert.equal(S.needsCheck({}, NOW), true); assert.equal(S.needsCheck({ providersSynced: ago(1) }, NOW), true, 'old format: no providersFree');
  assert.equal(S.needsCheck(rec({ providersSynced: ago(13.9) }), NOW), false); assert.equal(S.needsCheck(rec({ providersSynced: ago(14) }), NOW), true); assert.equal(S.needsCheck(rec({ providersSynced: 'garbage' }), NOW), true);
  assert.equal(S.needsCheck(null, NOW), false); assert.equal(S.needsCheck(undefined, NOW), false);
});
t('on my services: a ticked subscription matches; an unticked one does not; rent/buy-only does not', () => {
  assert.equal(S.availabilityState(rec({ providers: prov('Netflix') }), mine('netflix')), 'on'); assert.equal(S.availabilityState(rec({ providers: prov('Netflix') }), mine('stan')), 'off');
  assert.equal(S.availabilityState(rec({ providers: prov('Netflix', 'Stan') }), mine('stan', 'disney')), 'on'); assert.equal(S.availabilityState(rec(), mine('netflix')), 'off', 'checked but streams nowhere');
});
t('FREE always counts (even with nothing ticked): free list, ad-supported, and free services listed under subscription', () => {
  assert.equal(S.availabilityState(rec({ providersFree: prov('ABC iview') }), mine()), 'on'); assert.equal(S.availabilityState(rec({ providersFree: prov('Tubi') }), mine('netflix')), 'on');
  for (const free of ['ABC iview', 'SBS On Demand', '9Now', '7plus', '10 Play', 'Plex', 'Pluto TV', 'YouTube', 'Freeview']) assert.equal(S.availabilityState(rec({ providers: prov(free) }), mine()), 'on', free);
  assert.equal(S.availabilityState(rec({ providers: prov('Binge') }), mine()), 'off'); assert.equal(S.isFreeProviderName('Netflix'), false); assert.equal(S.isFreeProviderName('Stan'), false);
});
t('unchecked is its own state (never "off"): hidden by the filter until its availability is known', () => {
  assert.equal(S.availabilityState({}, mine('netflix')), 'unchecked'); assert.equal(S.availabilityState(null, mine('netflix')), 'unchecked'); assert.equal(S.isOnMyServices({}, mine('netflix')), false);
});
t('stale data still answers (it is re-checked in the background, but the title does not vanish meanwhile)', () => {
  assert.equal(S.availabilityState(rec({ providers: prov('Netflix'), providersSynced: ago(60) }), mine('netflix')), 'on');
});
t('label: your subscriptions (max 2) then free ones; empty when nothing matches; accepts a Set or an array', () => {
  assert.equal(S.servicesLabel(rec({ providers: prov('Netflix') }), mine('netflix')), 'Netflix'); assert.equal(S.servicesLabel(rec({ providers: prov('Netflix', 'Stan', 'Max') }), mine('netflix', 'stan', 'max')), 'Netflix · Stan');
  assert.equal(S.servicesLabel(rec({ providers: prov('Netflix'), providersFree: prov('ABC iview', 'SBS On Demand', 'Tubi') }), mine('netflix')), 'Netflix · Free: ABC iview, SBS On Demand');
  assert.equal(S.servicesLabel(rec({ providersFree: prov('ABC iview') }), mine()), 'Free: ABC iview'); assert.equal(S.servicesLabel(rec({ providers: prov('Binge') }), mine('netflix')), ''); assert.equal(S.servicesLabel(rec({ providers: prov('Netflix') }), ['netflix']), 'Netflix');
});
t('matching is robust to junk entries in cached lists', () => {
  assert.equal(S.availabilityState(rec({ providers: [null, 5, {}, { name: '' }, { name: 'Netflix' }], providersFree: [null, {}] }), mine('netflix')), 'on');
  assert.equal(S.availabilityState(rec({ providers: 'oops', providersFree: 7 }), mine('netflix')), 'off');
});
t('filterOnMyServices keeps only the confirmed ones, in order', () => {
  const rows = [['a', rec({ providers: prov('Netflix') })], ['b', {}], ['c', rec()], ['d', rec({ providersFree: prov('Tubi') })]];
  assert.deepEqual(S.filterOnMyServices(rows, (r) => r[1], mine('netflix')).map((r) => r[0]), ['a', 'd']);
});
t('background scheduling: only titles that need a check and have a TMDB id; failed and in-flight ones are skipped; capped at the free slots', () => {
  const items = [{ key: 'a', tmdbId: 1, rec: {} }, { key: 'b', tmdbId: 2, rec: rec() }, { key: 'c', tmdbId: 0, rec: {} }, { key: 'd', tmdbId: 4, rec: {} }, { key: 'e', tmdbId: 5, rec: rec({ providersSynced: ago(30) }) }, { key: 'f', tmdbId: 6, rec: {} }, { key: 'g', tmdbId: 7, rec: {} }];
  assert.deepEqual(S.pending(items, new Set(), NOW).map((i) => i.key), ['a', 'd', 'e', 'f', 'g']);
  assert.deepEqual(S.nextBatch(items, { failed: new Set(['a']), inflight: new Set(['d']), max: 3, now: NOW }).map((i) => i.key), ['e', 'f'], 'a failed, d running, 2 free slots');
  assert.deepEqual(S.nextBatch(items, { inflight: new Set(['a', 'd', 'e']), max: 3, now: NOW }), [], 'no free slot'); assert.equal(S.nextBatch([], { now: NOW }).length, 0);
  assert.equal(S.CONCURRENCY, 3); assert.ok(S.GAP_MS >= 100);
});
t('status line: choose services / needs a key / checking N left / N could not be checked / no TMDB link / nothing', () => {
  assert.equal(S.statusLine({ noServices: true }), 'Choose the services you pay for. Free-to-watch titles show meanwhile.'); assert.equal(S.statusLine({ noServices: true, remaining: 3 }), 'Checking availability… 3 left', 'progress outranks the hint'); assert.equal(S.statusLine({ noServices: true, failed: 2 }), '2 titles couldn’t be checked.'); assert.match(S.statusLine({ noKey: true, remaining: 4 }), /Add your TMDB key/);
  assert.equal(S.statusLine({ remaining: 12 }), 'Checking availability… 12 left'); assert.equal(S.statusLine({ failed: 1 }), '1 title couldn’t be checked.'); assert.equal(S.statusLine({ failed: 3 }), '3 titles couldn’t be checked.');
  assert.match(S.statusLine({ unknownIds: 2 }), /^2 titles have no TMDB link/); assert.equal(S.statusLine({}), null); assert.equal(S.statusLine({ remaining: 3, failed: 2 }), 'Checking availability… 3 left');
});
t('preferences: sanitised (unknown / non-service ids dropped, duplicates removed, strict booleans); corrupt, missing and throwing storage are safe', () => {
  const s = S.sanitizePrefs({ mine: ['netflix', 'netflix', 'cinema', 'iview', 'bogus', 5, 'stan'], showsOnly: 'yes', watchlistOnly: true }); assert.deepEqual(s, { mine: ['netflix', 'stan'], showsOnly: false, watchlistOnly: true });
  for (const bad of [null, undefined, 5, 'x', [], { mine: 'netflix' }]) assert.deepEqual(S.sanitizePrefs(bad), { mine: [], showsOnly: false, watchlistOnly: false });
  const m = new Map(); const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  assert.deepEqual(S.loadPrefs(st), { mine: [], showsOnly: false, watchlistOnly: false }); S.savePrefs(st, { mine: ['stan', 'paramount'], showsOnly: true, watchlistOnly: false }); assert.deepEqual(S.loadPrefs(st), { mine: ['stan', 'paramount'], showsOnly: true, watchlistOnly: false });
  m.set(S.PREFS_KEY, '{oops'); assert.deepEqual(S.loadPrefs(st).mine, []);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('y'); } }; assert.deepEqual(S.loadPrefs(bad).mine, []); S.savePrefs(bad, { mine: ['stan'] });
  assert.equal(S.PREFS_KEY, 'watchnext-services-v1');
});
t('toggleService adds / removes without mutating', () => { const a = ['netflix']; assert.deepEqual(S.toggleService(a, 'stan'), ['netflix', 'stan']); assert.deepEqual(S.toggleService(a, 'netflix'), []); assert.deepEqual(a, ['netflix']); });
t('scale: 5,000 titles classified in well under a second', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => rec({ providers: prov(['Netflix', 'Stan', 'Binge', 'Max'][i % 4]), providersFree: i % 7 ? [] : prov('ABC iview') }));
  const t0 = Date.now(); const on = rows.filter((r) => S.isOnMyServices(r, mine('netflix', 'stan'))); assert.ok(Date.now() - t0 < 800); assert.ok(on.length > 2000);
});
console.log(`\n${n} tests passed`);
