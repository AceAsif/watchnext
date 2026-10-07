// Builds the app for the browser suites into .harness-work/ (git-ignored). No .env file needed:
// placeholder Firebase values are passed as environment variables, which Vite reads.
//   node shot/build-test-dists.mjs          -> .harness-work/dist  and  .harness-work/dist-fake
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { ROOT, APP_DIST, browserFile, workPath } from '../tests/paths.mjs';

Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: 'placeholder_key_for_build_test', VITE_FIREBASE_AUTH_DOMAIN: 'x.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'x', VITE_FIREBASE_STORAGE_BUCKET: 'x.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1', VITE_FIREBASE_APP_ID: '1:1:web:1',
});
const base = { root: ROOT, configFile: false, plugins: [react()], base: './', logLevel: 'warn' };

console.log('Building normal test build ->', APP_DIST);
await build({ ...base, build: { outDir: APP_DIST, emptyOutDir: true } });

// Second build for wipe_resume.mjs: the cloud module is swapped for fakecloud.js (signed-in fake user)
console.log('Building fake-cloud build  ->', workPath('dist-fake'));
await build({
  ...base,
  resolve: { alias: [{ find: /^.*\/store\/cloud\.js$/, replacement: browserFile('fakecloud.js').replace(/\\/g, '/') }] },
  build: { outDir: workPath('dist-fake'), emptyOutDir: true },
});
console.log('Done.');
