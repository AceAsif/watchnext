// Public cloud-sync API. This is the ONLY module App.jsx and Settings.jsx
// import from — its own exports are tiny and firebase-free, so it costs
// nothing in the main bundle. The real work (and the firebase/auth +
// firebase/firestore SDKs) live in store/cloudEngine.js, loaded on demand via
// dynamic import(); Rollup turns that import() boundary into a separate
// chunk, which is the whole point of this split (see the original >500kB
// bundle-size note). Every exported function here keeps the exact signature
// the old, non-split cloud.js had, so nothing else in the app needed to
// change.

import { hasFirebaseConfig } from '../firebaseConfig.js';

export function isCloudAvailable() {
  return hasFirebaseConfig;
}

// --- tiny pub/sub for the signed-in user, so UI can react to auth state ---
// Lives here (not in cloudEngine.js) so useSyncExternalStore works correctly
// even in the moment before the engine chunk has finished loading.
let currentUser = null;
const userListeners = new Set();

function setUser(u) {
  currentUser = u;
  userListeners.forEach((fn) => fn(u));
}

// Same idea for "is this device still downloading the library from the cloud?" (see SyncingNote).
let syncing = false;
const syncListeners = new Set();
function setSyncing(v) {
  if (syncing === v) return;
  syncing = v;
  syncListeners.forEach((fn) => fn());
}
export function getCloudSyncing() { return syncing; }
export function subscribeCloudSyncing(fn) {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

// A different Google account signed in on a device holding another account's library: the
// engine waits for an answer (see store/accountSwitch.js). null, or
// { fromEmail, toEmail, shows, movies, goals, hidden } while the prompt is waiting.
let accountSwitch = null;
const switchListeners = new Set();
function setAccountSwitch(v) {
  accountSwitch = v || null;
  switchListeners.forEach((fn) => fn());
}
export function getAccountSwitch() { return accountSwitch; }
export function subscribeAccountSwitch(fn) {
  switchListeners.add(fn);
  return () => switchListeners.delete(fn);
}
// choice: 'fresh' | 'merge' | 'cancel'
export async function resolveAccountSwitch(choice) {
  const mod = await import('./cloudEngine.js');
  return mod.resolveAccountSwitch(choice);
}

export function getCloudUser() {
  return currentUser;
}

export function subscribeCloudUser(fn) {
  userListeners.add(fn);
  return () => userListeners.delete(fn);
}

// Kicks off cloud sync on app mount. Returns an unsubscribe function
// immediately (as the old synchronous version did), even though the real
// listener attaches once the lazy chunk resolves a moment later.
export function initCloudSync() {
  if (!hasFirebaseConfig) return () => {};
  let unsub = () => {};
  let cancelled = false;
  import('./cloudEngine.js').then((mod) => {
    if (cancelled) return;
    unsub = mod.initCloudSyncEngine(setUser, setSyncing, setAccountSwitch);
  });
  return () => {
    cancelled = true;
    unsub();
  };
}

export async function signIn() {
  const mod = await import('./cloudEngine.js');
  return mod.signIn();
}

// Delete the whole account (cloud + this device) and tell other devices to clear
// themselves. Resolves with { shows, marker }; rejects (changing nothing locally)
// if the cloud write fails. See store/wipeLogic.js.
export async function wipeEverywhere() {
  const mod = await import('./cloudEngine.js');
  return mod.wipeEverywhere();
}

export async function signOutCloud() {
  const mod = await import('./cloudEngine.js');
  return mod.signOutCloud();
}
