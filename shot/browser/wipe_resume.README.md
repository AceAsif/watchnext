# wipe_resume.mjs - needs a second, test-only build

The Delete-everywhere screens only show when signed in, which a headless browser can't do.
So this suite serves TWO builds:

1. `.harness-work/dist` - the normal test build (used for the "signed out" check).
2. `.harness-work/dist-fake` - the same app with `src/store/cloud.js` swapped for `shot/browser/fakecloud.js`
   (a signed-in fake user + a fake `wipeEverywhere` that records its order of events).

Both are made by one command from the repo root (no temporary config file, no `.env`):

    npm run test:browser:build

Then: `node shot/browser/wipe_resume.mjs` (expects "33 checks passed" and "PROBLEMS: none").
`tests/unit/wipe.test.mjs` and `tests/unit/resume_db.test.mjs` are plain node tests (db.js is loaded with a localStorage shim).
