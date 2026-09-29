// Firebase config, read from Vite env vars set at build time. Deliberately
// has NO firebase imports — hasFirebaseConfig just checks whether env vars
// are present, so anything that only needs to know "is cloud sync possible"
// (e.g. cloud.js's thin facade) can check it without pulling in the firebase
// SDK. The actual SDK only loads inside store/cloudEngine.js, behind a
// dynamic import() (see cloud.js) so it's a separate, lazily-loaded chunk.
//
// These values are NOT secret — Firebase client config is meant to be public;
// access control is enforced by the Firestore security rules (see
// firestore.rules), not by hiding this config.

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const hasFirebaseConfig = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

export default firebaseConfig;
