// TEST-ONLY stand-in for src/store/cloud.js: a signed-in user and a fake wipeEverywhere
// that records what happened and clears the device the same way the real engine does.
import { resetAll, takeDirty, addWipeTombstones, getState } from '../../src/store/db.js';
export const isCloudAvailable = () => true;
const user = { email: 'asif@example.com', uid: 'u1' };
export const getCloudUser = () => user;
export const subscribeCloudUser = () => () => {};
export const initCloudSync = () => () => {};
// "Still downloading the library" flag; a test flips it with window.__setSyncing(true/false).
let syncing = false; const syncSubs = new Set();
export const getCloudSyncing = () => syncing;
export const subscribeCloudSyncing = (fn) => { syncSubs.add(fn); return () => syncSubs.delete(fn); };
if (typeof window !== 'undefined') window.__setSyncing = (v) => { syncing = !!v; syncSubs.forEach((f) => f()); };
export const signIn = async () => {};
export const signOutCloud = async () => {};
export async function wipeEverywhere() {
  (window.__events = window.__events || []).push('wipe-start');
  await new Promise((r) => setTimeout(r, window.__wipeDelay || 50));
  if (window.__wipeFail) { window.__events.push('wipe-failed'); throw new Error(window.__wipeFail); }
  const ids = Object.keys(getState().shows);
  const marker = { id: 't', at: new Date().toISOString() };
  resetAll(); takeDirty(); addWipeTombstones(ids, marker.at);
  window.__events.push('wipe-done');
  return { shows: ids.length, marker };
}
