# WatchNext test harness

These files are the tests Claude runs in its own sandbox (Linux, Node 22). They are kept in the
repo as an archive so they survive between chats. **They are not wired into `npm test`** and they
will not run as-is on a normal computer: the scripts hard-code the sandbox paths below.

## Where the files live

| In this repo | In the Claude sandbox | What it is |
|---|---|---|
| `tests/unit/*.test.mjs` | `/home/claude/tests/unit/` (the old `*_test.mjs` names also work) | 24 plain-Node unit suites. They import `/home/claude/wl/src/...` |
| `shot/browser/*.mjs`, `fakecloud.js`, `fonts.css` | `/home/claude/shot/` (all in ONE folder) | 19 headless-Chromium suites (puppeteer). They serve `/home/claude/wl/dist` |
| `docs/WatchNext-Handover-v5.md` | (attached to the chat) | the handover document |
| `docs/screenshots/` | (not needed) | sample screenshots from each feature |

At the start of a chat: upload the handover plus a zip of `tests/` and `shot/`; Claude recreates the
sandbox layout above, clones the repo to `/home/claude/wl`, writes a placeholder `.env` and runs `npm run build`.

## Placeholder `.env` for test builds
```
VITE_FIREBASE_API_KEY=placeholder_key_for_build_test
VITE_FIREBASE_AUTH_DOMAIN=x.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=x
VITE_FIREBASE_STORAGE_BUCKET=x.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1
VITE_FIREBASE_APP_ID=1:1:web:1
```
Delete it after building. Never commit it.

## Running
- Unit: `node tests/unit/<name>.test.mjs` prints `N tests passed`.
- Browser: `node shot/browser/<name>.mjs` prints `N checks passed` and `PROBLEMS: none`.
  Needs `npm i puppeteer-core @sparticuz/chromium` in the folder, plus empty `tmp/` and `out6`..`out9`/`out_*` folders.
- The browser suites serve `wl/dist`, stub Google Fonts from `fonts.css`, mock TMDB, pin the date to
  2026-10-01T22:00Z and the timezone to Australia/Hobart, and bypass the service worker.
- `wipe_resume.mjs` needs a second, test-only build with the cloud module swapped for `fakecloud.js`;
  see `shot/browser/wipe_resume.README.md`.

## Last known results (all passing)
Unit: library 19 · settings 11 · upnext 24 · stats 25 · backup 14 · notes 16 · logic 44 · anime 34 ·
settings_render 14 · yearimage 24 · dropped_csv 28 · wipe 23 · resume_db 11 · rewatch 14 · notes_search 19 ·
month_recap 14 · finish_card 21 · watchdates 22 · backup_nudge 14 · services 16 · providers_db 7 ·
tonight 23 · movie_genres_db 6 · movie_night 21.

Browser: settings 47 · desktop 56 · notes 35 · restore 24 · anime 35 · yearimage 25 · dropped_csv 25 ·
rewatch 8 · recaps 20 · watchdates 21 · notes_search 22 · backup_nudge 21 · services 34 · tonight 27 ·
movie_night 26 · wipe_resume 33.

## Suites that cannot run on their own
- `library.mjs` compares the Library tab against an OLD build kept in `/home/claude/wl-base-dist`
  (the app before the Library redesign). That baseline no longer exists, so it does not run. It is
  kept for reference; delete its old-vs-new section if it is ever revived.
- `upnext.mjs` and `showpage.mjs` compare against design mock-ups (`/home/claude/design/*.html`) from the
  original design hand-off, which are not part of the harness.

## Rules
- Tests assert the CURRENT UI. When a screen is changed on purpose, update the matching suite
  (e.g. `settings.mjs` lists the Settings cards in order and was updated for My services / Export for Power BI).
- Derive expectations from the seeded data in the test, not from the app's own code.
- After a new feature, run every suite, not only the new one.
