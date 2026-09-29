// Firebase SDK init. This file is intentionally only ever imported from
// store/cloudEngine.js, which itself is loaded behind a dynamic import() —
// so firebase/app, firebase/auth and firebase/firestore (the bulk of the
// >500kB bundle warning) end up in their own lazily-loaded chunk instead of
// the main one. Don't import this from anywhere that loads eagerly (App.jsx,
// cloud.js's top level, etc.) or it defeats the split.

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig, { hasFirebaseConfig } from './firebaseConfig.js';

export { hasFirebaseConfig };

export let app = null;
export let auth = null;
export let db = null;
export let googleProvider = null;

if (hasFirebaseConfig) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
}
