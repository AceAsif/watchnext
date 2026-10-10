// Fake firebase/auth: the test signs a user in by calling globalThis.__auth.emit(user).
const listeners = new Set();
globalThis.__auth = { emit: (user) => listeners.forEach((cb) => cb(user)) };
export function onAuthStateChanged(auth, cb) { listeners.add(cb); return () => listeners.delete(cb); }
export async function signInWithPopup() { return {}; }
export async function signOut() { globalThis.__auth.emit(null); }
