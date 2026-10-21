import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [], settings: {} }));
const L = await import('../../src/components/listsLogic.js');
const D = await import('../../src/store/db.js');
const { mergeBackup } = await import('../../src/store/backupMerge.js');
const { restoreResultText } = await import('../../src/components/settingsLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const T1 = '2026-10-01T00:00:00.000Z', T2 = '2026-10-02T00:00:00.000Z', T3 = '2026-10-03T00:00:00.000Z';
const dark = { kind: 'tv', tmdbId: 70523, name: 'Dark', poster: '/d.jpg', year: '2017' };
const rrr = { kind: 'movie', tmdbId: 579974, name: 'RRR', poster: '/r.jpg', year: '2022' };

// ---------------------------------------------------------------- pure logic
t('newListId: valid, and different each time', () => {
  const a = L.newListId(), b = L.newListId();
  assert.match(a, /^l[a-z0-9]{4,40}$/); assert.notEqual(a, b);
});
t('createList: trims the name, refuses an empty one', () => {
  const r = L.createList({}, '  Ramadan   watch ', T1, 'labcde1');
  assert.equal(r.id, 'labcde1'); assert.deepEqual(r.lists.labcde1, { id: 'labcde1', name: 'Ramadan watch', at: T1, created: T1, items: [] });
  assert.equal(L.createList({}, '   ', T1).id, null);
});
t('addItem / removeItem / moveItem: no duplicates, order kept, every change stamps the time', () => {
  let l = L.createList({}, 'Friends', T1, 'lfriends').lists;
  l = L.addItem(l, 'lfriends', dark, T2); l = L.addItem(l, 'lfriends', rrr, T2); l = L.addItem(l, 'lfriends', dark, T3);
  assert.deepEqual(l.lfriends.items.map((x) => x.key), ['tv:70523', 'movie:579974']); assert.equal(l.lfriends.at, T2);
  l = L.moveItem(l, 'lfriends', 'movie:579974', -1, T3);
  assert.deepEqual(l.lfriends.items.map((x) => x.key), ['movie:579974', 'tv:70523']); assert.equal(l.lfriends.at, T3);
  assert.deepEqual(L.moveItem(l, 'lfriends', 'movie:579974', -1, T3), l, 'cannot move above the top');
  l = L.removeItem(l, 'lfriends', 'tv:70523', T3);
  assert.deepEqual(l.lfriends.items.map((x) => x.key), ['movie:579974']);
});
t('renameList / deleteList: a deleted list keeps a marker and disappears from view', () => {
  let l = L.createList({}, 'Old name', T1, 'lrename').lists;
  l = L.renameList(l, 'lrename', 'New name', T2); assert.equal(l.lrename.name, 'New name');
  l = L.deleteList(l, 'lrename', T3);
  assert.equal(l.lrename.deleted, true); assert.equal(l.lrename.at, T3); assert.deepEqual(L.visibleLists(l), []);
  assert.deepEqual(L.addItem(l, 'lrename', dark, T3), l, 'nothing can be added to a deleted list');
});
t('sanitizeLists: hostile or broken data is cleaned, never crashes', () => {
  const s = L.sanitizeLists({ __proto__x: {}, 'bad id': {}, lgood1: { name: 'x'.repeat(200), at: 'nope', items: [{ key: 'tv:1', name: 'A', poster: 'http://evil' }, { key: 'tv:1' }, { key: 'book:2' }, null] } });
  assert.deepEqual(Object.keys(s), ['lgood1']); assert.equal(s.lgood1.name.length, L.NAME_MAX);
  assert.equal(s.lgood1.items.length, 1); assert.equal(s.lgood1.items[0].poster, null);
  assert.deepEqual(L.sanitizeLists('junk'), {});
});
t('visibleLists: most recently changed first; listsWith finds the lists holding a title', () => {
  let l = L.createList({}, 'A', T1, 'laaaaa').lists; l = L.createList(l, 'B', T2, 'lbbbbb').lists;
  l = L.addItem(l, 'laaaaa', dark, T3);
  assert.deepEqual(L.visibleLists(l).map((x) => x.name), ['A', 'B']);
  assert.deepEqual(L.listsWith(l, 'tv:70523'), ['laaaaa']);
});
t('itemStatus: finished / watching / on watchlist / watched film with rating / not in library', () => {
  const state = { shows: {
    'tmdb:1': { tmdbId: 1, totalEpisodes: 2, watched: { '1x1': {}, '1x2': {} } },
    'tmdb:2': { tmdbId: 2, totalEpisodes: 10, watched: { '1x1': {} } },
    'tmdb:3': { tmdbId: 3, watchlist: true, followed: false, watched: {} },
  }, movies: [{ tmdbId: 9, status: 'watched', rating: 4.5 }, { tmdbId: 9, status: 'watched' }, { tmdbId: 8, status: 'planned' }] };
  const st = (kind, id) => L.itemStatus({ kind, tmdbId: id }, state);
  assert.deepEqual(st('tv', 1), { tone: 'finished', label: 'Finished', showId: 'tmdb:1' });
  assert.equal(st('tv', 2).label, 'Watching · 1 of 10');
  assert.equal(st('tv', 3).label, 'On your watchlist');
  assert.equal(st('tv', 4).tone, 'none');
  assert.equal(st('movie', 9).label, 'Watched 2× · ★ 4.5');
  assert.equal(st('movie', 8).label, 'On your watchlist');
  assert.equal(st('movie', 7).label, 'Not in your library');
  const list = { items: [{ kind: 'tv', tmdbId: 1 }, { kind: 'movie', tmdbId: 9 }, { kind: 'tv', tmdbId: 2 }] };
  assert.deepEqual(L.listProgress(list, state), { done: 2, total: 3 });
});
t('itemFromShow / itemFromMovie / itemFromResult: need a TMDB id', () => {
  assert.equal(L.itemFromShow({ name: 'Unlinked' }), null);
  assert.deepEqual(L.itemFromShow({ tmdbId: 5, name: 'S', poster: '/p', seasons: [{ air: '2019-04-01' }] }), { kind: 'tv', tmdbId: 5, name: 'S', poster: '/p', year: '2019' });
  assert.equal(L.itemFromMovie({ tmdbId: 6, name: 'M', year: '2001' }).kind, 'movie');
  assert.deepEqual(L.itemFromResult({ id: 7, title: 'T', release_date: '1999-02-02', poster_path: '/x' }, 'movie'), { kind: 'movie', tmdbId: 7, name: 'T', poster: '/x', year: '1999' });
});
t('mergeLists: per list the newer change wins; a delete on one device wins over an older copy', () => {
  const local = { lone11: { name: 'Mine', at: T2, items: [] }, ldel11: { name: '', at: T3, deleted: true, items: [] } };
  const remote = { lone11: { name: 'Theirs', at: T1, items: [] }, ldel11: { name: 'Still here', at: T2, items: [] }, lnew11: { name: 'Phone list', at: T1, items: [] } };
  const m = L.mergeLists(remote, local);
  assert.equal(m.lone11.name, 'Mine'); assert.equal(m.ldel11.deleted, true); assert.equal(m.lnew11.name, 'Phone list');
  assert.equal(L.mergeLists({ lone11: { name: 'Newer', at: T3, items: [] } }, local).lone11.name, 'Newer');
});
t('fillLists (backup): adds lists you never had, never overwrites or revives a deleted one', () => {
  const local = { lmine1: { name: 'Mine', at: T2, items: [] }, lgone1: { name: '', at: T3, deleted: true, items: [] } };
  const backup = { lmine1: { name: 'Old', at: T1, items: [] }, lgone1: { name: 'Back?', at: T1, items: [] }, lfile1: { name: 'From file', at: T1, items: [{ key: 'tv:1', name: 'X' }] } };
  const r = L.fillLists(local, backup);
  assert.equal(r.added, 1); assert.equal(r.lists.lmine1.name, 'Mine'); assert.equal(r.lists.lgone1.deleted, true); assert.equal(r.lists.lfile1.items.length, 1);
});

// ---------------------------------------------------------------- the store
t('db: create, add, move, remove, rename, delete — each queues a sync of the lists doc', () => {
  D.takeDirty();
  const id = D.createList('Ramadan watch');
  assert.ok(id); assert.equal(D.takeDirty().lists, true);
  D.addToList(id, dark); D.addToList(id, rrr); D.addToList(id, dark);
  assert.deepEqual(D.getState().lists[id].items.map((x) => x.name), ['Dark', 'RRR']);
  D.takeDirty();
  D.addToList(id, dark); assert.equal(D.takeDirty().lists, false, 'nothing changed -> nothing to sync');
  D.moveInList(id, 'movie:579974', -1); D.removeFromList(id, 'tv:70523'); D.renameList(id, 'Ramadan 2027');
  assert.deepEqual(D.getState().lists[id].items.map((x) => x.name), ['RRR']); assert.equal(D.getState().lists[id].name, 'Ramadan 2027');
  D.deleteList(id); assert.equal(D.getState().lists[id].deleted, true); assert.equal(D.takeDirty().lists, true);
  assert.equal(D.createList(''), null);
});
t('db: lists are saved on this device (survive a reload)', () => {
  const id = D.createList('Watch with friends');
  assert.equal(JSON.parse(store.get('watchnext-state-v1')).lists[id].name, 'Watch with friends');
});
t('backup restore: brings back lists, the banner says so, and restoring twice adds nothing', () => {
  const file = { shows: {}, movies: [], settings: {}, lists: { lbackup1: { name: 'From backup', at: T1, created: T1, items: [{ key: 'movie:579974', name: 'RRR' }] } } };
  const sum = D.restoreBackup(file);
  assert.equal(sum.listsAdded, 1); assert.equal(D.getState().lists.lbackup1.name, 'From backup');
  assert.match(restoreResultText(sum), /1 list restored/);
  assert.equal(D.restoreBackup(file).listsAdded, 0);
  assert.equal(mergeBackup({ shows: {}, movies: [] }, { shows: {}, movies: [] }).summary.listsAdded, 0, 'an old backup without lists is fine');
});
t('Delete all data clears lists too', () => { D.resetAll(); assert.deepEqual(D.getState().lists, {}); });
console.log(`\n${n} lists tests passed`);
