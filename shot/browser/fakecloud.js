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
// Account-switch prompt: a test opens it with window.__setAccountSwitch({ fromEmail, toEmail, shows, movies });
// the answer is recorded in window.__events as 'switch-fresh' / 'switch-merge' / 'switch-cancel'.
let accountSwitch = null; const switchSubs = new Set();
export const getAccountSwitch = () => accountSwitch;
export const subscribeAccountSwitch = (fn) => { switchSubs.add(fn); return () => switchSubs.delete(fn); };
const setSwitch = (v) => { accountSwitch = v || null; switchSubs.forEach((f) => f()); };
if (typeof window !== 'undefined') window.__setAccountSwitch = setSwitch;
export async function resolveAccountSwitch(choice) {
  if (!accountSwitch) return false;
  (window.__events = window.__events || []).push('switch-' + choice);
  if (choice === 'fresh') { resetAll(); takeDirty(); }
  setSwitch(null);
  return true;
}
