import assert from 'node:assert/strict';
// db.js reads localStorage when it loads, so provide a tiny in-memory one first.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set('watchnext-state-v1', JSON.stringify({ shows: {
  'tmdb:1': { followed: true, name: 'Stranger Things', tmdbId: 1, runtimeMin: 50, seasons: [{ n: 1, count: 3 }], watched: { '1x1': { at: '2022-07-04T10:00:00.000Z', min: 50, n: 1 } } },
  'tmdb:2': { followed: true, name: 'Dark', tmdbId: 2, watched: {} },
}, movies: [
  { name: 'Heat', watchedAt: '2024-01-01T10:00:00.000Z', tmdbId: 949, status: 'watched' },
  { name: 'Up', watchedAt: '2024-02-01T10:00:00.000Z', tmdbId: 14160, status: 'watched' },
], settings: {} }));
const D = await import('../../src/store/db.js');
const A = await import('../../src/components/activityLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const S = () => D.getState();
const top = () => D.getActivity()[0];

t('a change is logged with its show, what happened, and only the part that changed', () => {
  D.markEpisode('tmdb:1', 1, 2, 50, true);
  const e = top();
  assert.equal(e.what, 'Watched S1E2'); assert.equal(e.title, 'Stranger Things'); assert.equal(e.kind, 'show');
  assert.deepEqual(e.changes.map((c) => c.path), [['watched', '1x2']]);
  assert.ok(!('b' in e.changes[0]), 'it was not there before');
  assert.equal(A.status(e, S()), 'ok');
});
t('Undo puts it back, logs the undo, and the entry then shows as undone', () => {
  const e = top();
  assert.deepEqual(D.undoActivity(e.id), { ok: true });
  assert.ok(!S().shows['tmdb:1'].watched['1x2']);
  assert.match(top().what, /^Undid “Watched S1E2”$/);
  assert.equal(A.status(e, S()), 'undone');
  assert.deepEqual(D.undoActivity(e.id), { ok: false, reason: 'undone' });
});
t('+1 and its Undo: the count and first date come back, `last` goes away', () => {
  D.logEpisodeRewatch('tmdb:1', 1, 1, 50);
  assert.equal(top().what, '+1 watch of S1E1');
  D.undoActivity(top().id);
  assert.deepEqual(S().shows['tmdb:1'].watched['1x1'], { at: '2022-07-04T10:00:00.000Z', min: 50, n: 1 });
});
t('changed again later: Undo asks first (reason "changed"), and force undoes it', () => {
  D.setShowRating('tmdb:2', 4);
  const first = top();
  assert.equal(first.what, 'Rated 4★');
  D.setShowRating('tmdb:2', 3);
  assert.equal(A.status(first, S()), 'changed');
  assert.deepEqual(D.undoActivity(first.id), { ok: false, reason: 'changed' });
  assert.equal(S().shows['tmdb:2'].rating, 3, 'nothing changed');
  assert.deepEqual(D.undoActivity(first.id, true), { ok: true });
  assert.ok(!S().shows['tmdb:2'].rating, 'back to how it was before the first rating');
});
t('changing OTHER episodes of the same show does not block Undo', () => {
  D.markEpisode('tmdb:1', 1, 2, 50, true);
  const e = top();
  D.markEpisode('tmdb:1', 1, 3, 50, true);
  assert.equal(A.status(e, S()), 'ok');
  D.undoActivity(e.id);
  assert.ok(!S().shows['tmdb:1'].watched['1x2']); assert.ok(S().shows['tmdb:1'].watched['1x3'], 'the later episode stays');
});
t('a deleted show comes back with Undo, is no longer blocked, and is queued to upload (not to delete)', () => {
  D.takeDirty();
  D.deleteShow('tmdb:2');
  const e = top();
  assert.equal(e.what, 'Deleted from library'); assert.equal(e.title, 'Dark');
  assert.ok(D.isTombstoned('tmdb:2'));
  D.undoActivity(e.id);
  assert.equal(S().shows['tmdb:2'].name, 'Dark');
  assert.equal(D.isTombstoned('tmdb:2'), false);
  const d = D.takeDirty(); assert.ok(d.showIds.has('tmdb:2')); assert.ok(!d.deletedIds.has('tmdb:2'));
});
t('undoing the undo deletes it again (redo)', () => {
  D.undoActivity(top().id);
  assert.equal(S().shows['tmdb:2'], undefined);
  assert.ok(D.takeDirty().deletedIds.has('tmdb:2'));
  D.undoActivity(top().id); // back again for the next tests
  assert.ok(S().shows['tmdb:2']);
});
t('movies: a deleted viewing comes back in its place; an edit goes back to the old date', () => {
  D.removeMovie(0);
  assert.equal(top().title, 'Heat'); assert.equal(top().kind, 'movie');
  D.undoActivity(top().id);
  assert.deepEqual(S().movies.map((m) => m.name), ['Heat', 'Up']);
  D.updateMovie(1, { watchedAt: '2025-05-05T10:00:00.000Z' });
  D.undoActivity(top().id);
  assert.equal(S().movies[1].watchedAt, '2024-02-01T10:00:00.000Z');
  assert.equal(S().movies.length, 2);
});
t('lists: undo of "created" deletes the list, undo of "added" takes the title out — both with a fresh sync time', () => {
  const id = D.createList('Ramadan watch');
  assert.equal(top().title, 'Ramadan watch');
  D.addToList(id, { kind: 'tv', tmdbId: 1, name: 'Stranger Things' });
  assert.equal(top().what, 'Added Stranger Things');
  const before = S().lists[id].at;
  D.undoActivity(top().id);
  assert.equal(S().lists[id].items.length, 0);
  assert.ok(S().lists[id].at >= before);
  const created = D.getActivity().find((e) => e.what === 'Created the list');
  D.undoActivity(created.id);
  assert.equal(S().lists[id].deleted, true);
});
t('"Not interested" undo shows the title again (kept as on:false so it syncs)', () => {
  D.setDiscoverHidden({ kind: 'movie', id: 603, name: 'The Matrix' }, true);
  assert.equal(top().title, 'The Matrix');
  D.undoActivity(top().id);
  assert.equal(S().hidden['movie:603'].on, false);
});
t('background refreshes are not logged', () => {
  const len = D.getActivity().length; const first = top().id;
  D.setShowProviders('tmdb:1', [{ provider_name: 'Netflix' }], '', [], 'AU');
  assert.equal(D.getActivity().length, len); assert.equal(top().id, first);
});
t('the log keeps the newest 50 and is saved on this device', () => {
  for (let i = 0; i < 60; i++) D.toggleWatchlist('tmdb:1');
  assert.equal(D.getActivity().length, 50);
  assert.equal(JSON.parse(store.get('watchnext-activity-v1')).length, 50);
});
t('no undefined is ever written (Firestore rejects it)', () => {
  assert.ok(!JSON.stringify(S()).includes('undefined'));
});
t('Delete all data also clears the log', () => {
  D.resetAll();
  assert.equal(D.getActivity().length, 0);
});
t('whenText reads like "22 Oct, 9:54 pm", with the year only when it is not this year', () => {
  const d = new Date(2026, 9, 22, 21, 54);
  assert.equal(A.whenText(d.toISOString(), new Date(2026, 11, 1)), '22 Oct, 9:54 pm');
  assert.equal(A.whenText(new Date(2025, 0, 3, 0, 5).toISOString(), new Date(2026, 0, 1)), '3 Jan 2025, 12:05 am');
});
console.log(`\n${n} activity log tests passed`);
