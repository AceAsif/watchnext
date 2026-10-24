import assert from 'node:assert/strict';
import { watchLinks, serviceFor, searchUrl, regionBlock, WATCH_SERVICES, MAX_BUTTONS } from '../../src/components/watchLinksLogic.js';
import { normalizeProviders } from '../../src/components/servicesLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const P = (...xs) => xs.map((name) => ({ name, logo: null }));
const JW = 'https://www.themoviedb.org/tv/1-x/watch?locale=AU';

t('TMDB provider names map to our services (ad tiers too)', () => {
  const m = (x) => (serviceFor(x) || {}).id || null;
  assert.equal(m('Netflix'), 'netflix'); assert.equal(m('Netflix basic with Ads'), 'netflix');
  assert.equal(m('Amazon Prime Video'), 'prime'); assert.equal(m('Amazon Prime Video with Ads'), 'prime');
  assert.equal(m('Disney Plus'), 'disney'); assert.equal(m('Stan'), 'stan'); assert.equal(m('Binge'), 'binge');
  assert.equal(m('Apple TV Plus'), 'appletv'); assert.equal(m('Apple TV+'), 'appletv');
  assert.equal(m('Paramount Plus'), 'paramount'); assert.equal(m('HBO Max'), 'max'); assert.equal(m('Max'), 'max');
  assert.equal(m('ABC iview'), 'iview'); assert.equal(m('SBS On Demand'), 'sbs'); assert.equal(m('Crunchyroll'), 'crunchyroll');
  assert.equal(m('YouTube Premium'), 'youtube');
});
t('unknown names and look-alikes are not matched', () => {
  for (const x of ['Foxtel Now', 'Kayo', 'Apple TV', 'Standard', 'Maxdome', '', null]) assert.equal(serviceFor(x), null, String(x));
});
t('search links put the title in safely', () => {
  const nf = WATCH_SERVICES.find((s) => s.id === 'netflix');
  assert.equal(searchUrl(nf, 'Dark'), 'https://www.netflix.com/search?q=Dark');
  assert.equal(searchUrl(nf, '  Tom & Jerry: #1 / 2? '), 'https://www.netflix.com/search?q=Tom%20%26%20Jerry%3A%20%231%20%2F%202%3F');
  assert.equal(searchUrl(WATCH_SERVICES.find((s) => s.id === 'iview'), 'Bluey'), 'https://iview.abc.net.au/search?keyword=Bluey');
});
t('every service has an https search link with {q}, a label and a unique id', () => {
  const ids = new Set();
  for (const s of WATCH_SERVICES) {
    assert.ok(/^https:\/\/[^{}]+\{q\}/.test(s.search), s.id); assert.ok(s.label); assert.ok(!ids.has(s.id)); ids.add(s.id);
    assert.equal(typeof s.sure, 'boolean');
  }
});
t('one button per service, in TMDB order, with All options', () => {
  const r = watchLinks({ providers: P('Netflix', 'Stan', 'Netflix basic with Ads'), providersLink: JW }, 'Dark');
  assert.deepEqual(r.buttons.map((b) => b.label), ['Netflix', 'Stan']);
  assert.equal(r.buttons[0].url, 'https://www.netflix.com/search?q=Dark');
  assert.equal(r.all, JW); assert.equal(r.more, 0);
});
t('your services come first, then free ones, then the rest', () => {
  const rec = { providers: P('Netflix', 'Disney Plus', 'Stan', 'ABC iview'), providersFree: P('SBS On Demand') };
  const r = watchLinks(rec, 'X', ['stan']);
  assert.deepEqual(r.buttons.map((b) => b.id), ['stan', 'iview', 'sbs']);
  assert.deepEqual(r.buttons.map((b) => b.mine), [true, false, false]);
  assert.equal(r.more, 2); // Netflix and Disney+ are in All options
});
t('at most three service buttons; services we have no link for count in "more"', () => {
  const rec = { providers: P('Netflix', 'Stan', 'Binge', 'Disney Plus', 'Foxtel Now', 'Kayo with Ads'), providersLink: JW };
  const r = watchLinks(rec, 'X', new Set());
  assert.equal(r.buttons.length, MAX_BUTTONS);
  assert.equal(r.more, 3); // Disney+, Foxtel Now, Kayo
});
t('only services we have no link for: no buttons, just All options', () => {
  const r = watchLinks({ providers: P('Foxtel Now'), providersLink: JW }, 'X');
  assert.deepEqual(r.buttons, []); assert.equal(r.all, JW); assert.equal(r.more, 1);
});
t('not streaming / not checked / bad data: nothing to show, no crash', () => {
  for (const rec of [null, undefined, {}, { providers: 'x', providersFree: 5 }, { providers: [null, {}, { name: '' }] }]) {
    const r = watchLinks(rec, 'X'); assert.deepEqual(r.buttons, []); assert.equal(r.all, '');
  }
});
t('a link that is not https is not used', () => {
  assert.equal(watchLinks({ providersLink: 'javascript:alert(1)' }, 'X').all, '');
  assert.equal(watchLinks({ providersLink: 'http://x' }, 'X').all, '');
});
t('no title: no search buttons (All options still works)', () => {
  const r = watchLinks({ providers: P('Netflix'), providersLink: JW }, '  ');
  assert.deepEqual(r.buttons, []); assert.equal(r.all, JW);
});
t('movie sheet: reads the region from TMDB details (append watch/providers)', () => {
  const d = { title: 'Dune', 'watch/providers': { results: { AU: { flatrate: [{ provider_name: 'Binge' }], ads: [{ provider_name: 'SBS On Demand' }], link: JW }, US: { flatrate: [{ provider_name: 'Max' }] } } } };
  const { providers, free, link } = normalizeProviders(regionBlock(d, 'AU'));
  const r = watchLinks({ providers, providersFree: free, providersLink: link }, d.title);
  assert.deepEqual(r.buttons.map((b) => b.id), ['sbs', 'binge']);
  assert.equal(regionBlock(d, 'NZ'), null); assert.equal(regionBlock({}, 'AU'), null); assert.equal(regionBlock(null, 'AU'), null);
});
console.log(`\n${n} watch links tests passed`);
