// Cloud sync: mirrors the local store to Firestore under the signed-in
// user's account, so every device that signs in sees the same data.
//
// Design: localStorage stays the source of truth for instant, offline-first
// reads and writes (see store/db.js). This module is a thin layer on top:
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
import { getState, update, takeDirty, markShowDirty, markMoviesDirty } from './db.js';

export function isCloudAvailable() {
  return hasFirebaseConfig;
}

// --- tiny pub/sub for the signed-in user, so UI can react to auth state ---
let currentUser = null;
const userListeners = new Set();

function setUser(u) {
  currentUser = u;
  userListeners.forEach((fn) => fn(u));
}

export function getCloudUser() {
  return currentUser;
}

export function subscribeCloudUser(fn) {
  userListeners.add(fn);
  return () => userListeners.delete(fn);
}

// --- sync engine state ---
let uid = null;
let unsubShows = null;
let flushTimer = null;
let applyingRemote = false;

export function initCloudSync() {
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
  pullAndMerge(uid);

  unsubShows = onSnapshot(collection(db, 'users', uid, 'shows'), (snap) => {
    applyingRemote = true;
    update((s) => {
      snap.docChanges().forEach((change) => {
        const id = change.doc.id;
        if (change.type === 'removed') {
          delete s.shows[id];
          return;
        }
        s.shows[id] = { ...(s.shows[id] || {}), ...change.doc.data() };
      });
    });
    applyingRemote = false;
  });

  clearInterval(flushTimer);
  flushTimer = setInterval(flush, 2500);
}

function stopSync() {
  if (unsubShows) unsubShows();
  unsubShows = null;
  uid = null;
  clearInterval(flushTimer);
  flushTimer = null;
}

async function pullAndMerge(forUid) {
  const [showsSnap, moviesSnap] = await Promise.all([
    getDocs(collection(db, 'users', forUid, 'shows')),
    getDoc(doc(db, 'users', forUid, 'library', 'movies')),
  ]);

  update((s) => {
    showsSnap.forEach((d) => {
      const remote = d.data();
      const local = s.shows[d.id];
      if (!local) {
        s.shows[d.id] = remote;
        return;
      }
      // Union watched maps so an episode marked on either device stays marked.
      const watched = { ...(remote.watched || {}), ...(local.watched || {}) };
      s.shows[d.id] = { ...remote, ...local, watched };
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
  flush();
}

async function flush() {
  if (!uid || applyingRemote) return;
  const { showIds, movies } = takeDirty();
  if (showIds.size === 0 && !movies) return;

  const state = getState();
  const batch = writeBatch(db);
  showIds.forEach((id) => {
    const show = state.shows[id];
    if (show) batch.set(doc(db, 'users', uid, 'shows', id), show);
  });
  if (movies) {
    batch.set(doc(db, 'users', uid, 'library', 'movies'), { movies: state.movies });
  }

  try {
    await batch.commit();
  } catch (err) {
    console.error('Cloud sync failed, will retry on next change:', err);
    // put the ids back so the next flush retries them
    showIds.forEach(markShowDirty);
    if (movies) markMoviesDirty();
  }
}
