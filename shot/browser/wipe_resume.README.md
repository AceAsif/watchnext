# wipe_resume.mjs — needs a second, test-only build

The Delete-everywhere screens only show when signed in, which a headless browser can't do.
So this suite serves TWO builds:

1. `/home/claude/wl/dist` — the normal build (used for the "signed out" check).
2. `/home/claude/shot/dist-fake` — the same app with `src/store/cloud.js` swapped for `fakecloud.js`
   (a signed-in user + a fake `wipeEverywhere` that records its order of events).

Build the second one from the repo folder with a TEMPORARY config (don't commit it):

    // vite.fake.config.js
    import { defineConfig } from 'vite';
    import react from '@vitejs/plugin-react';
    export default defineConfig({
      plugins: [react()], base: './',
      resolve: { alias: [{ find: /^.*\/store\/cloud\.js$/, replacement: '/home/claude/shot/fakecloud.js' }] },
      build: { outDir: '/home/claude/shot/dist-fake', emptyOutDir: true },
    });

    npx vite build --config vite.fake.config.js     # needs the placeholder .env from the main README
    rm vite.fake.config.js

Put `fakecloud.js` in `/home/claude/shot/`. Run: `node wipe_resume.mjs` (expects "32 checks passed").
`unit/wipe.test.mjs` and `unit/resume_db.test.mjs` are plain node tests (db.js is loaded with a localStorage shim).
