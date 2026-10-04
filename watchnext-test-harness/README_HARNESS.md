# WatchNext test harness

Written for the Claude sandbox (Linux, Node 22). Everything is plain Node ES modules.
The scripts hard-code these paths — recreate them (or search/replace):

| Path | What |
|---|---|
| `/home/claude/wl` | a **fresh clone** of AceAsif/watchnext with `node_modules` (symlink OK), a placeholder `.env` (see handover §10) and `npm run build` done → `dist/` |
| `/home/claude/wl-base-dist` | a copy of `dist/` built from the repo **before** your change (only `browser/library.mjs` uses it, for old-vs-new parity; delete that section if you don't need it) |
| `/home/claude/tests/` | put `unit/*` here (they import `/home/claude/wl/src/...`); `mkdir /home/claude/tests/tmp` for `settings_render.test.mjs` (bundles with esbuild from `wl/node_modules`) |
| `/home/claude/shot/` | put `browser/*` here; `npm i puppeteer-core @sparticuz/chromium` in this folder; `mkdir tmp`; output screenshots go to `out6…out9` |

Run: `node unit/<name>.test.mjs` (prints `N tests passed`) and `node browser/<name>.mjs` (prints `N checks passed` + `PROBLEMS: none`). Browser suites serve `wl/dist` on a local port, stub Google Fonts from `fonts.css`, mock TMDB, pin the date to 2026-10-01T22:00Z and the timezone to Australia/Hobart.

Last known results (all passing): unit 201 · library 119 · settings 47 · restore 24 · notes 35 · anime 35 · upnext 44 · desktop/layout 55 · showpage harness.
Tests assert the DOM/classes of the CURRENT UI — when you intentionally change a screen, update the matching suite. `stats` browser parity needs a baseline build of the old Stats page and is not included (the stats unit tests are).
