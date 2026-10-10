// Fake firebase/firestore: an in-memory document store with snapshot listeners and batches.
// globalThis.__fs.docs is a Map of 'users/u1/library/goals' -> data. Writes from "another device"
// go through __fs.remoteSet(path, data), which notifies listeners like Firestore would.
const docs = new Map();
const listeners = []; // { path, isCollection, cb }
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const snapOf = (path, pending = false) => ({ id: path.split('/').pop(), exists: () => docs.has(path), data: () => clone(docs.get(path)), metadata: { hasPendingWrites: pending } });
function notify(path, pending, type) {
  for (const l of listeners) {
    if (!l.isCollection && l.path === path) l.cb(snapOf(path, pending));
    if (l.isCollection && path.startsWith(l.path + '/') && path.split('/').length === l.path.split('/').length + 1) {
      const d = snapOf(path, pending);
      l.cb({ docChanges: () => [{ type, doc: d }], forEach: () => {}, metadata: { hasPendingWrites: pending } });
    }
  }
}
globalThis.__fs = {
  docs, writes: [],
  remoteSet(path, data) { docs.set(path, clone(data)); notify(path, false, 'modified'); },
  failNextCommit: false,
};
export const doc = (db, ...parts) => ({ path: parts.join('/') });
export const collection = (db, ...parts) => ({ path: parts.join('/'), isCollection: true });
export async function getDoc(ref) { return snapOf(ref.path); }
export async function getDocs(ref) {
  const kids = [...docs.keys()].filter((p) => p.startsWith(ref.path + '/') && p.split('/').length === ref.path.split('/').length + 1);
  const list = kids.map((p) => snapOf(p));
  return { forEach: (f) => list.forEach(f), docs: list };
}
export function onSnapshot(ref, cb) {
  const l = { path: ref.path, isCollection: !!ref.isCollection, cb };
  listeners.push(l);
  if (!l.isCollection) cb(snapOf(ref.path));
  return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
}
export function writeBatch() {
  const ops = [];
  return {
    set: (ref, data) => ops.push(['set', ref.path, clone(data)]),
    delete: (ref) => ops.push(['delete', ref.path]),
    async commit() {
      if (globalThis.__fs.failNextCommit) { globalThis.__fs.failNextCommit = false; throw new Error('offline'); }
      for (const [op, path, data] of ops) {
        globalThis.__fs.writes.push([op, path]);
        if (op === 'set') docs.set(path, data); else docs.delete(path);
        notify(path, true, op === 'set' ? 'modified' : 'removed');
      }
    },
  };
}
