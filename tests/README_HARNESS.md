# WatchNext test harness

The tests live in the repo and now run on any computer (Windows, macOS, Linux) with Node 20+.
All paths are worked out from the repo folder (`tests/paths.mjs`), so nothing depends on where you cloned it.
They are **not** part of the deploy: GitHub Actions only runs `npm run build`.

## Layout

| Folder | What it is |
|---|---|
| `tests/unit/*.test.mjs` | 26 plain-Node unit suites (~505 tests). They import `src/...` directly. |
| `tests/paths.mjs`, `tests/run-unit.mjs` | shared path helpers; runs every unit suite |
| `shot/browser/*.mjs`, `fakecloud.js`, `fonts.css`, `launch.mjs` | 17 runnable headless-Chrome suites (puppeteer) + helpers |
| `shot/build-test-dists.mjs`, `shot/run-browser.mjs`, `shot/package.json` | builds the app for the tests, runs the browser suites, browser-test dependency |
| `.harness-work/` | scratch output (test builds, screenshots). Git-ignored; safe to delete. |
| `docs/` | handover + sample screenshots |

## Run the unit tests (nothing extra to install)
```
npm install              # once, in the repo root
npm run test:unit        # all 26 suites
node tests/run-unit.mjs goals wipe      # only suites whose name contains these words
node tests/unit/goals.test.mjs          # one suite directly
```

## Run the browser tests
```
npm install              # root, once
cd shot && npm install && cd ..    # once: installs puppeteer-core (no browser download)
npm run test:browser:build         # builds .harness-work/dist and .harness-work/dist-fake
npm run test:browser               # all runnable suites (about 10 minutes)
node shot/run-browser.mjs goals    # only suites matching a word
node shot/browser/goals.mjs        # one suite directly (build first)
```
- **Browser used:** `launch.mjs` uses `CHROME_PATH` if set, otherwise Chrome or Edge in its normal install location.
  If it can't find one, set it, e.g. PowerShell: `$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"`.
- **No `.env` needed.** The build script passes placeholder Firebase values as environment variables, so it never
  touches or needs your real `.env`. Re-run `test:browser:build` after changing anything in `src/`.
- The suites pin the date to 2026-10-01T22:00Z and the timezone to Australia/Hobart, stub Google Fonts, mock TMDB
  and bypass the service worker. Ports 4179-4190 must be free.
- `wipe_resume.mjs` uses the second build (`dist-fake`, with `fakecloud.js` standing in for Firebase); the build script makes it.

## Last known results (all passing)
Unit: library 19 · settings 11 · upnext 24 · stats 25 · backup 14 · notes 16 · logic 44 · anime 34 ·
settings_render 14 · yearimage 29 · dropped_csv 28 · wipe 23 · resume_db 11 · rewatch 14 · notes_search 19 ·
month_recap 14 · finish_card 21 · watchdates 22 · backup_nudge 14 · services 16 · providers_db 7 ·
tonight 23 · movie_genres_db 6 · movie_night 24 · goals 22 · goals_db 14.

Browser: settings 47 · desktop 56 · notes 35 · restore 24 · anime 35 · yearimage 25 · dropped_csv 25 ·
rewatch 8 · recaps 20 · watchdates 21 · notes_search 22 · backup_nudge 21 · services 34 · tonight 27 ·
movie_night 41 · goals 25 · wipe_resume 33.

## Suites that cannot run on their own
- `library.mjs` compares the Library tab against an OLD build kept in `.harness-work/wl-base-dist`
  (the app before the Library redesign). That baseline no longer exists, so it does not run. It is
  kept for reference; delete its old-vs-new section if it is ever revived.
- `upnext.mjs` and `showpage.mjs` compare against design mock-ups (`.harness-work/design/*.html`) from the
  original design hand-off, which are not part of the harness.

## Rules
- Tests assert the CURRENT UI. When a screen is changed on purpose, update the matching suite
  (e.g. `settings.mjs` lists the Settings cards in order and was updated for My services / Export for Power BI).
- Derive expectations from the seeded data in the test, not from the app's own code.
- After a new feature, run every suite, not only the new one.
