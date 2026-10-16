import assert from 'node:assert/strict';
import * as R from '../../src/components/regionLogic.js';
import * as S from '../../src/components/servicesLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const prov = (...names) => names.map((name) => ({ name, logo: null }));
const rec = (o = {}) => ({ providers: [], providersFree: [], providersSynced: '2026-10-10T00:00:00.000Z', ...o });
const NOW = new Date('2026-10-16T00:00:00Z');
const mine = (...ids) => new Set(ids);

t('region list: unique codes, sorted by name, Australia is the default and is in the list', () => {
  const codes = R.REGIONS.map((r) => r.code); assert.equal(new Set(codes).size, codes.length);
  const names = R.REGIONS.map((r) => r.name); assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  assert.equal(R.DEFAULT_REGION, 'AU'); assert.ok(R.isRegion('AU')); assert.ok(R.isRegion('NZ')); assert.ok(R.isRegion('GB'));
});
t('cleanRegion: junk, lower case, empty and non-strings fall back to Australia, never throw', () => {
  for (const bad of [null, undefined, '', 'au', 'ZZ', 5, {}, [], 'AUS', '__proto__']) assert.equal(R.cleanRegion(bad), 'AU');
  assert.equal(R.cleanRegion('NZ'), 'NZ');
});
t('names: regionName, inRegion adds "the" where English does', () => {
  assert.equal(R.regionName('NZ'), 'New Zealand'); assert.equal(R.regionName('zz'), 'Australia');
  assert.equal(R.inRegion('AU'), 'in Australia'); assert.equal(R.inRegion('US'), 'in the United States'); assert.equal(R.inRegion('GB'), 'in the United Kingdom'); assert.equal(R.inRegion('NZ'), 'in New Zealand');
});
t('recordRegion: no stamp means Australia (cached before this setting existed)', () => {
  assert.equal(R.recordRegion(rec()), 'AU'); assert.equal(R.recordRegion(rec({ providersRegion: 'NZ' })), 'NZ'); assert.equal(R.recordRegion(null), 'AU'); assert.equal(R.recordRegion(rec({ providersRegion: 'nope' })), 'AU');
});
t('prefs: region is saved, cleaned and defaults to Australia', () => {
  assert.equal(S.sanitizePrefs({ region: 'NZ' }).region, 'NZ'); assert.equal(S.sanitizePrefs({ region: 'xx' }).region, 'AU'); assert.equal(S.sanitizePrefs({}).region, 'AU');
  const mem = {}; const st = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  S.savePrefs(st, { mine: ['netflix'], region: 'GB' }); assert.equal(S.loadPrefs(st).region, 'GB');
  assert.equal(S.loadPrefs({ getItem: () => 'not json' }).region, 'AU');
});
t('an old saved prefs file with no region still loads as Australia', () => {
  const st = { getItem: () => JSON.stringify({ mine: ['stan'], showsOnly: true, watchlistOnly: false }) };
  assert.deepEqual(S.loadPrefs(st), { mine: ['stan'], showsOnly: true, watchlistOnly: false, region: 'AU' });
});
t('needsCheck: an answer cached for another region is stale at once, even when fresh', () => {
  const r = rec({ providersRegion: 'AU' });
  assert.equal(S.needsCheck(r, NOW, 'AU'), false); assert.equal(S.needsCheck(r, NOW), false); assert.equal(S.needsCheck(r, NOW, 'NZ'), true);
  assert.equal(S.needsCheck(rec(), NOW, 'AU'), false); assert.equal(S.needsCheck(rec(), NOW, 'GB'), true); // unstamped = Australian
  assert.equal(S.needsCheck(rec({ providersRegion: 'NZ' }), NOW, 'NZ'), false);
});
t('availabilityState / isOnMyServices: another region\'s answer reads as unchecked, never as on or off', () => {
  const r = rec({ providers: prov('Netflix'), providersRegion: 'AU' });
  assert.equal(S.availabilityState(r, mine('netflix'), 'AU'), 'on'); assert.equal(S.availabilityState(r, mine('netflix'), 'NZ'), 'unchecked');
  assert.equal(S.isOnMyServices(r, mine('netflix'), 'NZ'), false); assert.equal(S.isOnMyServices(r, mine('netflix')), true);
  assert.equal(S.availabilityState(rec({ providers: prov('Netflix'), providersRegion: 'NZ' }), mine('netflix'), 'NZ'), 'on');
});
t('servicesLabel: no label from another region\'s cache', () => {
  const r = rec({ providers: prov('Netflix'), providersFree: prov('ABC iview'), providersRegion: 'AU' });
  assert.equal(S.servicesLabel(r, mine('netflix'), 'AU'), 'Netflix · Free: ABC iview'); assert.equal(S.servicesLabel(r, mine('netflix'), 'GB'), '');
});
t('pending / nextBatch: switching region queues every cached title again, and only those with a TMDB id', () => {
  const items = [{ key: 'a', tmdbId: 1, rec: rec() }, { key: 'b', tmdbId: 2, rec: rec({ providersRegion: 'NZ' }) }, { key: 'c', rec: rec() }];
  assert.deepEqual(S.pending(items, new Set(), NOW, 'AU').map((i) => i.key), ['b']);
  assert.deepEqual(S.pending(items, new Set(), NOW, 'NZ').map((i) => i.key), ['a']);
  assert.deepEqual(S.nextBatch(items, { now: NOW, region: 'GB' }).map((i) => i.key), ['a', 'b']);
});
t('service choices: Stan and Binge only in Australia (unless you already ticked them); the rest everywhere', () => {
  const ids = (r, m) => S.serviceChoices(r, m).map((p) => p.id);
  assert.ok(ids('AU').includes('stan') && ids('AU').includes('binge'));
  assert.ok(!ids('NZ').includes('stan') && !ids('NZ').includes('binge')); assert.ok(ids('NZ').includes('netflix') && ids('NZ').includes('disney'));
  assert.ok(ids('NZ', ['stan']).includes('stan')); assert.equal(S.serviceChoices().length, S.serviceChoices('AU').length);
  assert.ok(S.sanitizePrefs({ mine: ['stan'], region: 'NZ' }).mine.includes('stan')); // a saved tick is never dropped
});
t('free services: UK and US free players count as free', () => {
  for (const name of ['BBC iPlayer', 'ITVX', 'Channel 4', 'My5', 'Freevee', 'The Roku Channel', 'Tubi TV']) assert.ok(S.isFreeProviderName(name), name);
  assert.ok(!S.isFreeProviderName('Netflix')); assert.ok(!S.isFreeProviderName('Disney Plus'));
});
console.log(`\n${n} tests passed`);
