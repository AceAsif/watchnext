// TEST-ONLY stand-in for src/store/cloud.js: a signed-in user and a fake wipeEverywhere
// that records what happened and clears the device the same way the real engine does.
import { resetAll, takeDirty, addTombstones, getState } from '../../src/store/db.js';
export const isCloudAvailable = () => true;
const user = { email: 'asif@example.com', uid: 'u1' };
export const getCloudUser = () => user;
export const subscribeCloudUser = () => () => {};
export const initCloudSync = () => () => {};
export const signIn = async () => {};
export const signOutCloud = async () => {};
export async function wipeEverywhere() {
  (window.__events = window.__events || []).push('wipe-start');
  await new Promise((r) => setTimeout(r, window.__wipeDelay || 50));
  if (window.__wipeFail) { window.__events.push('wipe-failed'); throw new Error(window.__wipeFail); }
  const ids = Object.keys(getState().shows);
  resetAll(); takeDirty(); addTombstones(ids);
  window.__events.push('wipe-done');
  return { shows: ids.length, marker: { id: 't', at: new Date().toISOString() } };
}
