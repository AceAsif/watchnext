import assert from 'node:assert/strict';
import * as N from '/home/claude/wl/src/store/notes.js';
import { mergeBackup } from '/home/claude/wl/src/store/backupMerge.js';
import { restoreResultText } from '/home/claude/wl/src/components/settingsLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const NOW = '2026-10-03T08:00:00.000Z';
const noUndef = (v) => { const s = JSON.stringify(v, (k, x) => (x === undefined ? '__UNDEF__' : x)); return !s.includes('__UNDEF__'); };

t('reactions: six, unique ids, each with an emoji and label', () => {
  assert.equal(N.REACTIONS.length, 6); assert.equal(new Set(N.REACTIONS.map((r) => r.id)).size, 6);
  assert.ok(N.REACTIONS.every((r) => r.emoji && r.label)); assert.equal(N.reactionById('funny').label, 'Funny'); assert.equal(N.reactionById('nope'), null);
});
t('cleanNote: trims, caps at 280, drops unknown reactions, tolerates junk', () => {
  assert.deepEqual(N.cleanNote({ react: 'funny', text: '  hi  ' }), { react: 'funny', text: 'hi' });
  assert.equal(N.cleanNote({ text: 'x'.repeat(500) }).text.length, 280);
  assert.deepEqual(N.cleanNote({ react: '<script>', text: 5 }), { react: '', text: '' });
  for (const j of [null, undefined, 5, 'x', []]) assert.deepEqual(N.cleanNote(j), { react: '', text: '' });
  assert.equal(N.cleanNote({ text: 'a'.repeat(279) + '  b' }).text, 'a'.repeat(279));   // never ends in stray spaces after the cap
});
t('isEpKey: only "SxE" digits; prototype-pollution names and junk rejected', () => {
  for (const k of ['1x5', '12x105', '0x1']) assert.equal(N.isEpKey(k), true);
  for (const k of ['__proto__', 'constructor', 'prototype', '1x', 'x5', '1-5', '1x5x6', '', null, 5, '1x5 ', 'a1x5']) assert.equal(N.isEpKey(k), false, String(k));
});
t('setNoteIn: add / edit / remove; the last removal returns undefined (so the property can be dropped)', () => {
  let a = N.setNoteIn(undefined, '1x2', { react: 'funny', text: 'Great' }, NOW); assert.deepEqual(a, { '1x2': { react: 'funny', text: 'Great', at: NOW } });
  const b = N.setNoteIn(a, '1x3', { text: 'only text' }, NOW); assert.deepEqual(Object.keys(b), ['1x2', '1x3']); assert.ok(!('react' in b['1x3']));
  const c = N.setNoteIn(b, '1x2', { react: 'sad', text: '' }, NOW); assert.deepEqual(c['1x2'], { react: 'sad', at: NOW }); assert.ok(!('text' in c['1x2']));
  const d = N.setNoteIn(c, '1x2', { react: '', text: '   ' }, NOW); assert.deepEqual(Object.keys(d), ['1x3']);
  assert.equal(N.setNoteIn(d, '1x3', {}, NOW), undefined);
});
t('setNoteIn never mutates its input and never produces undefined values', () => {
  const a = { '1x2': { react: 'love', text: 'x', at: NOW } }; const before = JSON.stringify(a);
  const r = N.setNoteIn(a, '1x2', { react: 'bored', text: 'y' }, NOW); assert.equal(JSON.stringify(a), before); assert.ok(noUndef(r));
  assert.ok(noUndef(N.setNoteIn(undefined, '1x1', { react: 'sad' }, NOW)));
});
t('setNoteIn ignores a bad key (nothing is written, existing notes returned unchanged)', () => {
  const a = { '1x2': { text: 'x', at: NOW } };
  assert.deepEqual(N.setNoteIn(a, '__proto__', { text: 'evil' }, NOW), a); assert.equal(N.setNoteIn(undefined, 'zzz', { text: 'evil' }, NOW), undefined); assert.equal({}.evil, undefined);
});
t('withNotes: sets or REMOVES the property (never `notes: undefined`) and keeps every other field', () => {
  const show = { name: 'S', followed: true, watched: { '1x1': {} }, notes: { '1x1': { text: 'a', at: NOW } } };
  const gone = N.withNotes(show, undefined); assert.ok(!('notes' in gone)); assert.deepEqual(gone.watched, show.watched); assert.ok(noUndef(gone));
  assert.deepEqual(N.withNotes({ name: 'S' }, { '1x1': { text: 'b', at: NOW } }).notes, { '1x1': { text: 'b', at: NOW } });
  assert.ok(!('notes' in N.withNotes({ name: 'S' }, {})));
});
t('movie notes live on the entry: set, edit, clear — keys are removed, never blank or undefined', () => {
  let m = { name: 'Akira', tmdbId: 9, rating: 5 };
  m = N.withMovieNote(m, { react: 'shocked', text: 'That ending' }); assert.deepEqual([m.react, m.note, m.rating], ['shocked', 'That ending', 5]);
  m = N.withMovieNote(m, { react: 'shocked', text: '' }); assert.ok(!('note' in m)); assert.equal(m.react, 'shocked');
  m = N.withMovieNote(m, {}); assert.ok(!('react' in m) && !('note' in m)); assert.equal(m.rating, 5); assert.ok(noUndef(m));
  assert.deepEqual(N.movieNoteOf({ react: 'sad', note: 'hmm' }), { react: 'sad', text: 'hmm' }); assert.deepEqual(N.movieNoteOf(null), { react: '', text: '' });
});
t('mergeNotes: union, YOURS win per episode, the other side only adds; sanitised; empty => undefined', () => {
  const mine = { '1x1': { react: 'love', text: 'mine', at: 'a' } }; const theirs = { '1x1': { text: 'theirs' }, '1x2': { react: 'funny', text: ' ok ', at: 'b' }, '__proto__': { text: 'x' }, 'bad': { text: 'y' }, '1x3': { react: 'nope', text: '' }, '1x4': 'str' };
  const m = N.mergeNotes(mine, theirs); assert.deepEqual(m, { '1x1': mine['1x1'], '1x2': { react: 'funny', text: 'ok', at: 'b' } });
  assert.equal(N.mergeNotes(undefined, undefined), undefined); assert.equal(N.mergeNotes({}, {}), undefined); assert.equal(N.mergeNotes(undefined, 'x'), undefined);
  assert.equal(JSON.stringify(mine), JSON.stringify({ '1x1': { react: 'love', text: 'mine', at: 'a' } })); assert.equal({}.x, undefined);
  assert.deepEqual(Object.keys(N.mergeNotes(undefined, { '1x1': { text: 'a' } })['1x1']), ['text']);   // no empty `at`
});
t('countNotes', () => { assert.equal(N.countNotes({ notes: { a: 1, b: 2 } }), 2); assert.equal(N.countNotes({}), 0); assert.equal(N.countNotes(null), 0); });

// ---------------- backup / restore carries notes
const W = (k) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`1x${i + 1}`, { at: 'x', n: 1 }]));
const backup = { shows: { 'tmdb:1': { name: 'Suits', followed: true, watched: W(3), notes: { '1x1': { react: 'funny', text: 'lol', at: NOW }, '1x2': { text: 'second', at: NOW } } } },
  movies: [{ name: 'Akira', tmdbId: 9, watchedAt: 'w1', react: 'shocked', note: 'wow' }, { name: 'Plain', tmdbId: 5, watchedAt: 'w2' }] };
t('RESTORE into an empty state brings every episode note and movie note back, and counts them', () => {
  const r = mergeBackup({ shows: {}, movies: [] }, JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(r.shows['tmdb:1'].notes, backup.shows['tmdb:1'].notes); assert.deepEqual([r.movies[0].react, r.movies[0].note], ['shocked', 'wow']);
  assert.equal(r.summary.notesAdded, 3); assert.ok(noUndef(r.shows) && noUndef(r.movies));
});
t('RESTORE is a union: your note for an episode wins, the backup adds the ones you lack', () => {
  const local = { shows: { 'tmdb:1': { name: 'Suits', followed: true, watched: W(3), notes: { '1x1': { text: 'MY note', at: 'z' } } } }, movies: [] };
  const r = mergeBackup(local, backup); const nt = r.shows['tmdb:1'].notes;
  assert.equal(nt['1x1'].text, 'MY note'); assert.equal(nt['1x2'].text, 'second'); assert.equal(r.summary.notesAdded, 1 + 1);
});
t('RESTORE fills a movie you already have only where YOUR react/note is blank, and never overwrites', () => {
  const local = { shows: {}, movies: [{ name: 'Akira', tmdbId: 9, watchedAt: 'w1', note: 'mine' }] };
  const r = mergeBackup(local, backup); const a = r.movies.find((m) => m.tmdbId === 9);
  assert.equal(a.note, 'mine'); assert.equal(a.react, 'shocked'); assert.equal(r.moviesChanged, true); assert.equal(r.movies.length, 2);
  const again = mergeBackup({ shows: r.shows, movies: r.movies }, backup); assert.equal(again.summary.notesAdded, 0); assert.equal(again.moviesChanged, false); assert.equal(again.movies.find((m) => m.tmdbId === 9).note, 'mine');
});
t('RESTORE is idempotent for notes too (second restore adds nothing)', () => {
  const first = mergeBackup({ shows: {}, movies: [] }, JSON.parse(JSON.stringify(backup)));
  const second = mergeBackup({ shows: first.shows, movies: first.movies }, backup);
  assert.equal(second.summary.notesAdded, 0); assert.deepEqual(second.touchedIds, []); assert.equal(second.moviesChanged, false);
});
t('SECURITY: hostile note data in a backup is sanitised (bad keys, unknown reactions, 10,000-char text, wrong types)', () => {
  const evil = JSON.parse('{"shows":{"tmdb:9":{"name":"E","watched":{},"notes":{"__proto__":{"text":"x"},"1x1":{"react":"<img onerror=1>","text":"' + 'A'.repeat(10000) + '"},"1x2":"str","1x3":{"react":"funny","text":"fine"}}}},"movies":[{"name":"M","tmdbId":1,"react":"zzz","note":' + JSON.stringify('B'.repeat(5000)) + '}]}');
  const r = mergeBackup({ shows: {}, movies: [] }, evil); const nt = r.shows['tmdb:9'].notes;
  assert.deepEqual(Object.keys(nt).sort(), ['1x1', '1x3']); assert.equal(nt['1x1'].text.length, 280); assert.ok(!('react' in nt['1x1'])); assert.equal({}.x, undefined);
  assert.equal(r.movies[0].note.length, 280); assert.ok(!('react' in r.movies[0]));
});
t('restoreResultText mentions restored notes', () => {
  const z = { showsAdded: 0, showsUpdated: 0, watchesAdded: 0, moviesAdded: 0, notesAdded: 0, skipped: 0 };
  assert.equal(restoreResultText({ ...z, showsAdded: 1, notesAdded: 3 }), 'Restored from backup: 1 show added, 3 notes restored.'); assert.match(restoreResultText({ ...z, notesAdded: 1 }), /1 note restored/);
  assert.equal(restoreResultText(z), 'Nothing to restore — this device already has everything in that file.');
});
console.log(`\n${n} notes tests passed`);
