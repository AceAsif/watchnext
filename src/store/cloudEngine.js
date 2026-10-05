// The real cloud-sync engine. This module is never imported statically —
// cloud.js loads it with a dynamic import() the first time cloud sync is
// actually needed (app mount, if a Firebase config is present; or a sign-in
// click). That import() boundary is what makes Rollup put firebase/auth and
// firebase/firestore in their own chunk instead of the main bundle. Keep it
// that way: don't add a static `import ... from './cloudEngine.js'` anywhere.
//
// Design: localStorage stays the source of truth for instant, offline-first
// reads and writes (see store/db.js). This module mirrors it to Firestore:
//   - pulls remote data down and merges it into the local store on sign-in
//   - listens for remote changes (from other devices) and applies them locally
//   - watches the local store for changes and pushes only what changed
//     ("dirty" show ids / movies, tracked in db.js) up to Firestore
//
// Merging watched episodes is a union (if either device marked an episode
// watched, it stays watched) rather than a last-write-wins overwrite, since
// that matches how a single person actually uses two devices.

import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, googleProvider, hasFirebaseConfig } from '../firebase.js';
import { getState, update, takeDirty, markShowDirty, markMoviesDirty, markShowDeleted, isTombstoned, resetAll, wipeLibrary, addTombstones } from './db.js';
import { mergeNotes } from './notes.js';
import { runWipe, wipeDecision, readMeta, writeMeta } from './wipeLogic.js';
import { mergeWatched } from './watchedMerge.js';

// --- sync engine state ---
let uid = null;
let unsubShows = null;
let flushTimer = null;
let applyingRemote = false;
let wiping = false; // true while wipeEverywhere() runs: pauses the normal flush

// --- per-account sync record (localStorage) -------------------------------
// lastSync = the last time this device finished a pull or a successful push;
// seenWipeId = the last wipe marker this device has handled. wipeLogic.js uses
// them to decide whether a wipe from another device applies here. lastSync is
// only advanced AFTER the first pull of a session (pulledOnce), because the pull
// is where a wipe marker is checked.
const META_KEY = 'watchnext-sync-v1';
let pulledOnce = false;
function syncMeta(forUid) {
  try { return readMeta(localStorage.getItem(META_KEY), forUid); } catch (e) { return {}; }
}
function patchSyncMeta(forUid, patch) {
  try { localStorage.setItem(META_KEY, writeMeta(syncMeta(forUid), forUid, patch)); } catch (e) { /* storage full: best effort */ }
}
function touchSync(forUid) {
  if (pulledOnce && forUid) patchSyncMeta(forUid, { lastSync: new Date().toISOString() });
}
// Returns wipeDecision's verdict after acting on it.
function handleWipeDoc(forUid, data) {
  const verdict = wipeDecision(data, syncMeta(forUid));
  if (verdict === 'apply') {
    wipeLibrary(); // clear shows + movies here, keep this device's settings, drop queued uploads
    patchSyncMeta(forUid, { seenWipeId: data.id, lastSync: new Date().toISOString() });
  } else if (verdict === 'record') {
    patchSyncMeta(forUid, { seenWipeId: data.id });
  }
  return verdict;
}
let unsubWipe = null;

// Flush is normally on a 2.5s timer, but that timer is throttled or paused
// while the tab is in the background — so a change made right before switching
// away (or reloading) could be lost. These fire a flush the moment the tab is
// hidden or the page is being unloaded, which matters most for deletes: an
// un-flushed delete leaves the Firestore doc in place, and the next sign-in
// pulls the "deleted" show straight back.
function flushOnLeave() {
  if (document.visibilityState === 'hidden') flush();
}

// Called by cloud.js's thin facade once this chunk has loaded. setUser is
// cloud.js's internal pub/sub setter, kept there (not here) so the reactive
// user state works even before this chunk arrives.
export function initCloudSyncEngine(setUser) {
  if (!hasFirebaseConfig) return () => {};
  return onAuthStateChanged(auth, (user) => {
    setUser(user);
    if (user) startSync(user.uid);
    else stopSync();
  });
}

export function signIn() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutCloud() {
  return signOut(auth);
}

function startSync(newUid) {
  uid = newUid;
  pulledOnce = false;
  // The pull checks for a wipe marker BEFORE merging. Only after it has finished
  // do we start listening for markers written later, so the two never race.
  pullAndMerge(uid)
    .catch((err) => console.error('Cloud pull failed:', err))
    .then(() => {
      if (uid !== newUid || unsubWipe) return;
      unsubWipe = onSnapshot(doc(db, 'users', newUid, 'library', 'wipe'), (snap) => {
        if (snap.exists()) handleWipeDoc(newUid, snap.data());
      });
    });

  unsubShows = onSnapshot(collection(db, 'users', uid, 'shows'), (snap) => {
    applyingRemote = true;
    update((s) => {
      snap.docChanges().forEach((change) => {
        const id = change.doc.id;
        if (change.type === 'removed') {
          delete s.shows[id];
          return;
        }
        // A remote add/update for a show we've deleted locally must not
        // resurrect it — drop it and re-queue the Firestore delete.
        if (isTombstoned(id)) {
          delete s.shows[id];
          markShowDeleted(id);
          return;
        }
        s.shows[id] = { ...(s.shows[id] || {}), ...change.doc.data() };
      });
    });
    applyingRemote = false;
  });

  clearInterval(flushTimer);
  flushTimer = setInterval(flush, 2500);

  document.addEventListener('visibilitychange', flushOnLeave);
  window.addEventListener('pagehide', flush);
}

function stopSync() {
  if (unsubShows) unsubShows();
  unsubShows = null;
  if (unsubWipe) unsubWipe();
  unsubWipe = null;
  pulledOnce = false;
  uid = null;
  clearInterval(flushTimer);
  flushTimer = null;
  document.removeEventListener('visibilitychange', flushOnLeave);
  window.removeEventListener('pagehide', flush);
}

async function pullAndMerge(forUid) {
  // A wipe-everywhere from another device? Check BEFORE reading shows/movies: the
  // wipe is committed atomically, so if the marker is visible, the shows and movies
  // read next are already the post-wipe ones and nothing stale can be merged back.
  const wipeSnap = await getDoc(doc(db, 'users', forUid, 'library', 'wipe'));
  if (wipeSnap.exists()) handleWipeDoc(forUid, wipeSnap.data());

  const [showsSnap, moviesSnap] = await Promise.all([
    getDocs(collection(db, 'users', forUid, 'shows')),
    getDoc(doc(db, 'users', forUid, 'library', 'movies')),
  ]);

  update((s) => {
    showsSnap.forEach((d) => {
      // Skip shows the user deleted for good: don't merge them back in, and
      // re-queue the Firestore delete so the remote doc gets cleaned up.
      if (isTombstoned(d.id)) {
        markShowDeleted(d.id);
        return;
      }
      const remote = d.data();
      const local = s.shows[d.id];
      if (!local) {
        s.shows[d.id] = remote;
        return;
      }
      // Union watched maps so an episode marked on either device stays marked.
      const watched = mergeWatched(remote.watched, local.watched);
      const merged = { ...remote, ...local, watched };
      // Episode notes are a union too, so a note written on another device isn't
      // lost when this device already has some of its own (yours win per episode).
      const notes = mergeNotes(local.notes, remote.notes);
      if (notes) merged.notes = notes;
      else delete merged.notes;
      s.shows[d.id] = merged;
    });

    if (moviesSnap.exists()) {
      const remoteMovies = moviesSnap.data().movies || [];
      const seen = new Set(s.movies.map((m) => `${m.name}|${m.watchedAt}`));
      for (const m of remoteMovies) {
        const k = `${m.name}|${m.watchedAt}`;
        if (!seen.has(k)) {
          s.movies = [...s.movies, m];
          seen.add(k);
        }
      }
    }
  });

  // Push the merged result back up once, so both sides converge.
  Object.keys(getState().shows).forEach(markShowDirty);
  markMoviesDirty();
  pulledOnce = true;
  touchSync(forUid);
  flush();
}

async function flush() {
  if (!uid || applyingRemote || wiping) return;
  const { showIds, movies, deletedIds } = takeDirty();
  const hasDeletes = deletedIds && deletedIds.size > 0;
  if (showIds.size === 0 && !movies && !hasDeletes) return;

  const state = getState();
  const batch = writeBatch(db);
  showIds.forEach((id) => {
    if (hasDeletes && deletedIds.has(id)) return; // a delete wins over an update
    const show = state.shows[id];
    if (show) batch.set(doc(db, 'users', uid, 'shows', id), show);
  });
  if (hasDeletes) {
    deletedIds.forEach((id) => {
      batch.delete(doc(db, 'users', uid, 'shows', id));
    });
  }
  if (movies) {
    batch.set(doc(db, 'users', uid, 'library', 'movies'), { movies: state.movies });
  }

  try {
    await batch.commit();
    touchSync(uid);
  } catch (err) {
    console.error('Cloud sync failed, will retry on next change:', err);
    // put everything back so the next flush retries it
    showIds.forEach(markShowDirty);
    if (hasDeletes) deletedIds.forEach(markShowDeleted);
    if (movies) markMoviesDirty();
  }
}

// ---------------------------------------------------------------------------
// "Delete everywhere": wipe the whole account, not just this device. The flow
// (and why it works) lives in wipeLogic.js; this just connects it to Firestore.
// Needs no rules change: firestore.rules already allows users/{uid}/**.
// ---------------------------------------------------------------------------
const newId = () =>
  (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export async function wipeEverywhere() {
  if (!uid) throw new Error('You are not signed in');
  const forUid = uid;
  const showDoc = (id) => doc(db, 'users', forUid, 'shows', id);
  wiping = true;
  try {
    return await runWipe({
      listRemoteIds: async () => (await getDocs(collection(db, 'users', forUid, 'shows'))).docs.map((d) => d.id),
      localIds: () => Object.keys(getState().shows),
      markSeen: (id) => patchSyncMeta(forUid, { seenWipeId: id }),
      commitDeletes: async (ids) => {
        const b = writeBatch(db);
        ids.forEach((id) => b.delete(showDoc(id)));
        await b.commit();
      },
      commitFinal: async (ids, marker) => {
        const b = writeBatch(db);
        ids.forEach((id) => b.delete(showDoc(id)));
        b.set(doc(db, 'users', forUid, 'library', 'movies'), { movies: [] });
        b.set(doc(db, 'users', forUid, 'library', 'wipe'), marker);
        await b.commit();
      },
      clearLocal: (ids) => {
        resetAll(); // same as "Delete all data": shows, movies, settings (TMDB key) on this device
        takeDirty(); // nothing queued may be pushed back up
        addTombstones(ids); // so a stale device pushing these back can't resurrect them here
        patchSyncMeta(forUid, { lastSync: new Date().toISOString() });
      },
      now: () => new Date().toISOString(),
      randomId: newId,
    });
  } finally {
    wiping = false;
  }
}
