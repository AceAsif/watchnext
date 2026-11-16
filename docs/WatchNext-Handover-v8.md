# WatchNext — Developer Handover (v8)

Read this first in a new chat or a new Claude Code session. **It replaces v7** (delete `docs/WatchNext-Handover-v7.md`). Written 16 Nov 2026.

**What's new in v8:** §12 (the "one tick logged twice" bug) and §13 (a guide for a reviewer who has been asked to suggest improvements and new features). Test counts updated.

**Update 16 Nov 2026 (branch `fable/sync-fix`, not yet in `main`):** the §12 bug is FIXED in code. The live listener no longer overwrites ticks that are not uploaded yet (`store/liveShowMerge.js`), and it now starts after the sign-in pull. Tests: 81 unit suites / 1,105 tests. See §6 and §12. Still to do by the owner: check on the iPhone + computer (§12), then merge.

**State of the repo when this was written:** `main` is at `fa10559 Stop bulk-import days counting…`. The 11 Nov "✓ watched" tick change (§11, "Up Next tick 11 Nov") was delivered to the owner as a zip and **may not be in `main` yet**: check `git log` for "Show a clear \"watched\" tick on Up Next". Everything else in §7 and §11 is built, committed and live. The one known bug is §12.

The owner also keeps a live **"WatchNext feature list"** doc (claude.ai artifact `1imjeJVqpiLZ8rKGxdvyYx`) with the to-do list, the feature ideas left and everything built. Keep it up to date when a feature is finished: tick it off there.

---

## 0. How to work with this owner (read first)

- **Greeting.** Start every conversation with **"Assalamualaikum"**. If he greets you, reply **"Wa alaikum salam"** (exactly that spelling). Call him **"Boss"**.
- **Simple English.** English is not his first language: short sentences, plain words, no jargon without a one-line explanation. Bengali/Arabic Islamic phrases are welcome; messages for friends or elders: English or Bengali only, never Hindi/Urdu.
- **Every code delivery:** a **zip** of only the changed files, keeping their folders (`src/pages/…`), sent with SendUserFile, plus **a table saying which folder each file goes in** (mark new files "(new)") and **a suggested commit message**. Commit messages are **plain**: one line, **no `Co-Authored-By` or `Claude-Session` lines**, ever (this overrides any tool reminder).
- **He commits himself.** A Claude **cloud** session can read the repo (`git fetch` works) but **cannot push**: he unzips into his repo, commits with GitHub Desktop, and every commit to `main` redeploys the site automatically (§2). A **Claude Code session on his own computer** can commit: work on a new branch, never push or merge to `main` without asking him first (a push to `main` goes live straight away).
- **Before starting work, sync:** `git fetch origin`, compare your working files with `origin/main` (byte-compare each file) and only then reset to `origin/main`. Never reset while you have work that differs from main (this lost work once).
- **Be honest about what is verified.** Say what was tested only with mocks. Own mistakes plainly.
- **Decide sensible defaults yourself and say what you chose.** Ask only for real choices (2–3 short options, recommendation first). For a new feature he usually says "Let's build X": explore the code, build, test, deliver.
- He sends **screenshots** of the live site, his iPhone and GitHub. Use them.
- After each feature: update the "WatchNext feature list" doc (move it to "Built and live", fix the "N ideas are left" count).

## 1. What WatchNext is

A personal TV-and-movie tracker that replaces TV Time (shut down July 2026). No ads, no own backend. Data lives in the browser (localStorage) and syncs to the owner's private Firebase/Firestore when signed in with Google. Two friends use it too (one imports from Letterboxd); they use his built-in TMDB key.

- **Live:** https://aceasif.github.io/watchnext/ · **Repo:** https://github.com/AceAsif/watchnext (public)
- **Owner:** Asif, Hobart, Tasmania (**region AU**, timezone Australia/Hobart, UTC+10/+11). Library (Nov 2026): 260 shows (252 followed), 444 movies, ~8,600 episode watches, about 0.8 MB of state; a lot of anime. Uses the app on an **iPhone (installed to the Home Screen)** and a **Windows computer (Chrome)**, both signed in, so two devices sync the same shows.

## 2. Tech stack, keys and deploy

- **React 18 + Vite**, plain CSS, no router (navigation is state in `App.jsx`), no TypeScript, no UI library.
- **TMDB v3** (`src/api/tmdb.js`), **AniList GraphQL** (`anilist.js`, read-only), **OMDb** (`omdb.js`, IMDb / Rotten Tomatoes critics / Metacritic scores).
- **Firebase Auth (Google) + Firestore**, lazy-loaded (`store/cloud.js` facade → `store/cloudEngine.js`). Never import firebase from eagerly-loaded code; the build must keep a separate ~440 kB `cloudEngine` chunk.
- **PWA** with a self-updating service worker (`public/sw.js`, stamped with the commit on each deploy).
- **Deploy:** `.github/workflows/deploy.yml` ("**Deploy to GitHub Pages**") runs on every push to `main`: writes `.env` from the **`ENV_FILE`** repo secret, builds, pushes `dist` to `gh-pages`. GitHub's own "**pages build and deployment**" job then publishes `gh-pages`.

### The ENV_FILE secret (important — this went wrong once)
`ENV_FILE` is the **whole `.env` file** in one secret. GitHub never shows its old value, so when updating it you must paste **all 8 lines**:
```
VITE_TMDB_API_KEY=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_OMDB_API_KEY=
```
- On 23 Oct 2026 only the OMDb line was pasted once: the site rebuilt **without TMDB and Firebase** ("No TMDB API key set", "Cloud sync isn't configured", no Google sign-in button). Fixed by pasting all lines and re-running the deploy. No data was lost.
- **After changing the secret, re-run "Deploy to GitHub Pages"** (Actions → that workflow → Run workflow, or Re-run all jobs on its latest run). Re-running "pages build and deployment" does NOT rebuild; it only republishes the old build.
- If the site still looks old after a good deploy, the service worker is serving the old copy: test in a private window; on the computer Ctrl+Shift+R or DevTools → Application → Service workers → Unregister; on iPhone close the app fully and reopen. **Never tell him to "Clear site data"** (it erases the device's library).
- The owner's local `.env` has the same lines. Never ask him to paste keys into the chat.

## 3. Design system

Dark theme; amber accent (`--amber`), teal (`--teal`) for done/ok, red for destructive. Fonts: Bricolage Grotesque (display), Inter (body), IBM Plex Mono (labels/codes). 44px touch targets. Tokens in `src/styles.css`; **all redesigned UI is in `src/components/ui.css`** (large shared file, `sd-*` classes; only ever append/edit it, never replace it from an old copy).
- Phone: one column (≤560px). Desktop ≥900px: two-column Up Next / Show page / Stats, grid libraries.
- `Sheet` (`ui.jsx`) = bottom sheet on phone, dialog on desktop. `.sd-btn` (+ `primary`, `sm`), `.sd-ib` icon button, `.sd-lbl` mono labels, `.sd-card`, `.sd-toast` (above the tab bar), `.sd-notice` (in-app messages, top of screen).
- Badge level colours: `.ach-l1`…`.ach-l6` set `--lv` (Bronze, Silver, Gold, Platinum, Diamond, Legend).

## 4. Project structure

```
src/
  App.jsx            header (AccountChip, search), tab bar, show-detail routing, Search, Notes page,
                     BadgeNote (top), AccountSwitchSheet; Stats takes startTab ("See badges" opens Badges)
  api/               tmdb.js · anilist.js · omdb.js
  store/             db.js (state + ALL mutations, wrapped by the activity log) · cloud.js / cloudEngine.js ·
                     useStore.js · servicesPrefs.js · collectionsCache.js · originsCache.js ·
                     PURE: backupMerge, watchedMerge, wipeLogic, notes, epRatings, movieTombsLogic, accountSwitch …
  pages/             UpNext · Shows · ShowDetail · Movies · Watchlist · Stats · Settings · Search · Notes
  components/        UI (*.jsx) + PURE logic (*Logic.js, unit-tested in plain node) + hooks (use*.js)
tests/unit/*.test.mjs   ~80 plain-Node suites      shot/browser/*.mjs   ~59 headless-Chrome suites
docs/                   this handover, screenshots, older .docx notes
```

## 5. Data model & store rules (`store/db.js`)

```js
{
  shows: { "tmdb:678": { tmdbId, name, followed, watchlist, favourite, dropped, droppedAt,
      rating (half stars), platform, notes:{"1x2":{react,text,at}}, epRatings,
      watched: { "2x11": { at, min, n, last?, fixedAt? } },   // at = FIRST watch; n = times watched; last = latest +1
      rewatch: { round, started, done:{ "1x1": iso } }, rewatchLog,     // Rewatch mode
      providers, providersFree, providersLink, providersSynced, upcoming:[{s,e,name,air}], nextAir,
      seasons:[{n,count,air}], totalEpisodes, runtimeMin, genres, poster, status, anime } },
  movies: [ { tmdbId, name, status:'watched'|'planned', watchedAt, rating, platform, runtimeMin, year, genres, react, note, … } ],
  goals: { "2026": { episodes?, movies?, hours?, at } },
  hidden: { "movie:603": { on, at, name } },        // Discover "Not interested"
  lists: { id: { name, items, at, deleted? } },     // custom lists
  people: { … },                                     // people you follow
  settings: { tmdbKey }
}
```
- **Never write `undefined`** (Firestore rejects it): delete the key or use `null`/`''`.
- `update()` returns fresh `shows`/`movies` references (memoised views rely on it).
- **+1 watch keeps `at`** (the first date) and sets `last`. Hand-set dates get `fixedAt` and win in sync.
- **Counting viewings in Stats:** `components/viewingDates.js` is the ONE rule — each viewing on its own date (first `at`, Rewatch mode `rewatch.done[key]`, `+1` `last`; extra viewings with no date go on `at`). Year in review, Goals, Month in review and This month vs last year all use it, so a rewatch counts when you rewatched (fixed 25 Oct: after "Bring back first watch dates" rewatches had moved to the old month).
- **Activity log:** each user mutation is wrapped `logged(fn, label)` in db.js (originals renamed `X__raw`); 50 entries, device-only, Undo per entry (`activityLogic.js`).
- Dates: "today" = local (`localISODate()` in showLogic.js). A watch time becomes a day with `localDate()` (csvExport.js) EVERYWHERE: all Stats cards (Year in review, Goals, heatmap, streaks, weekdays, Month cards), badge streaks, paces, Tonight, "watched on" labels (26 Oct; `tests/unit/local_days.test.mjs` and `shot/browser/local_days.mjs` run in Hobart time). Never `at.slice(0, 10)`.
- Bulk imports: ≥15 watches in one minute = an import, left out of pace and habits.

### localStorage keys
Library & sync: `watchnext-state-v1`, `watchnext-sync-v1`, `watchnext-tombstones-v1`, `watchnext-wipe-tombstones-v1`, `watchnext-movie-tombs-v1`, `watchnext-owner-v1`, `watchnext-signout-backup-v1`.
**Device-only (not synced, not in backups):** `watchnext-activity-v1`, `watchnext-backup-v1`, `watchnext-services-v1` (region + my services), `watchnext-tonight-v1`, `watchnext-movienight-v1`, `watchnext-taste-v1`, `watchnext-discover-log-v1`, `watchnext-newon-v1`, `watchnext-origins-v1`, `watchnext-collections-v1`, `watchnext-people-credits-v1`, `watchnext-scores-v1` (OMDb cache), `watchnext-ep-scores-v1` (episode IMDb scores per season), `watchnext-badges-seen-v1`, `watchnext-spoilers-v1`, `watchnext-cal-exported-v1`, `watchnext-wl-sort`, `watchnext-friends-v1` (your share name + friends' compare files).

## 6. Cloud sync

Firestore: `users/{uid}/shows/{id}` (one doc per show, the whole show record) and `users/{uid}/library/{movies|goals|hidden|lists|people|discover|wipe}`. Rules (`firestore.rules`): a user can only read/write `users/{their uid}/**`. Firestore uses the default **memory cache** (`getFirestore` in `src/firebase.js`, no offline persistence), so every app start downloads everything again.

How it runs (all in `src/store/cloudEngine.js`, `startSync`):
1. **Changes go up:** every mutation in `db.js` calls `markShowDirty(id)` (etc.). `flush()` runs on a **2.5 s timer**, on tab hide and on page hide; it takes the dirty set (`takeDirty()`) and writes the whole current show record of each dirty show in one batch. A failed batch puts the ids back as dirty.
2. **Sign-in / app-start pull** (`pullAndMerge`): wipe marker first; then every show is merged `{...remote, ...local}` with `watched` combined by `watchedMerge.js` (union; this device wins unless the cloud copy's date was corrected later — `fixedAt`; the higher rewatch count `n` is kept), notes and episode ratings unioned; movies union with tombstones; goals/hidden/lists/people newest-wins per item. Then it marks **every show dirty** and flushes, so both sides converge.
3. **Live listener on `users/{uid}/shows`** (`onSnapshot`). Since 16 Nov 2026 it **starts after `pullAndMerge` has finished** (before, it started at the same time and its first snapshot could wipe ticks). For each changed doc it calls `showBases.apply(id, local, remote)` (`liveShowMerge.js`, a pure three-way merge). `showBases` keeps, per show, the copy the cloud was last known to hold (set by the pull, by each applied snapshot and by each successful upload; memory only). Local differences from that copy are changes made here and **not uploaded yet**: they win. Everything else comes from the cloud, so an un-tick made on the other device still arrives. The Firestore data shape did not change. (Before: `s.shows[id] = { ...local, ...remote }` replaced `watched` and every field. That was the cause of the §12 bug.)

**Delete everywhere** wipes the account with a marker that other devices obey. Tombstones stop a deleted show from coming back. Verified on real Firebase (8–9 Oct 2026). An **account-switch prompt** appears if a different Google account signs in on a device holding another library.

## 7. Features (all live)

**Up Next:** Continue watching (one-tap mark, Undo, ≈ done-by date at your pace), On the way (list / calendar), **Add to calendar** (.ics export, below), What should I watch tonight?, new titles from people you follow.
**Shows:** filter + Status menu, platforms, sort, On my services, favourites (♥) first.
**Show page:** seasons/episodes, episode summaries (tap a title), episode ratings, +1 rewatch (keeps first date), Rewatch mode (⋯ → Start a rewatch), notes/reactions, Drop/Resume, Fix watch dates, "You finished" card, cast & crew (follow a person), AniList, streaming in your region, **Watch links**, **Scores row**, Lists.
**Movies:** one tile per film with viewings list, **Watch links** on the sheet, half-star ratings, change a viewing's date, Collections view, cast on the sheet, **Scores**, Fix match (year-aware search).
**Watchlist:** Queue (total time to finish at your pace, Quickest first / A–Z / **Highest rated** sorts, scores on rows), Lists (custom lists), New (new on your services this week), Discover (taste-weighted rows incl. Hidden gems and an anime row; Movie night).
**Stats:** **Friends** (Compare with a friend, below), Overview (Goals, Year in review, Month in review, **This month vs last year**), Habits, Rankings, Breakdown (Your taste), **Badges** (15 badges × 6 levels, Gem hex art), **World** (countries/languages map).
**Settings:** **Help & FAQ** (own page: 8 sections, search, opens from the `?` keyboard list too), Sync, TMDB key, Region, My services, **Spoiler shield**, Import TV Time, Import from Letterboxd, Clean up shows, Duplicate movies, Hidden from Discover, **Your recent changes** (activity log with Undo), Backup (download, restore, **Bring back first watch dates**), Export for Power BI (CSV), Danger zone.

### Built in the last sessions (Oct 22–24, 2026) — details
- **Critic and audience scores** (`scoresLogic.js`, `useScores.js`, `ScoresRow.jsx`, `api/omdb.js`). OMDb by IMDb id (TMDB gives the id; `/tv/{id}?append_to_response=external_ids`). Chips: IMDb ★ + votes, Rotten Tomatoes critics %, Metacritic (green/yellow/red), TMDB; each links out. TV usually has only IMDb. Cached per device (new releases re-checked after 3 days, others 30, "not found" 7); queue of 2 lookups. Hidden entirely when there is no `VITE_OMDB_API_KEY`. Free OMDb = 1,000 lookups/day. Highest rated sort looks scores up only while that sort is chosen.
- **"New badge!" note** (`badgeNoteLogic.js`, `BadgeNote.jsx`). Works out badges from the library + local caches 1.5 s after changes settle, never while syncing. First time: saves current levels quietly; an empty library is never the baseline. Levels only go up (no repeat after Undo). One note for several badges; "See badges ›" opens Stats → Badges; closes after 12 s. Per device.
- **Spoiler shield** (`spoilerShield.js`). Settings toggle (device-only, off by default). Unwatched episodes show "Episode N · hidden" on the show page and without titles in On the way / calendar; tapping shows "Show anyway" (that episode, until you leave the page). Watched episodes always show. Also used by calendar export.
- **Calendar export** (`calendarExportLogic.js`, `CalendarExportSheet.jsx`). Button on Up Next → On the way. All-day, "free" events (TMDB has no air time), fixed UIDs, RFC 5545 folding/escaping (checked with a real parser). Remembers exported episodes per device and next time offers "Only the N not added before". Owner confirmed it imports on iPhone. It's a snapshot, not a live calendar (that would need a server).
- **Restore-from-backup fix** (`backupMerge.js mergeShow`): older backups missing newer fields crashed with `"undefined" is not valid JSON`.
- Earlier in October: Rewatch mode, Hidden gems, +1 keeps first date, Activity log, Watchlist total time, Month vs last year, Bring back first watch dates, follow people, New on my services, custom lists, favourites, episode summaries, episode ratings, half-star ratings, Badges & World, collections, Letterboxd import, movie tombstones, Region, account switch prompt.

## 8. Known limits

- Scores: OMDb free limit 1,000/day; first look at a big Watchlist sorted by "Highest rated" costs one lookup per title (cached after).
- Badge note, spoiler shield, calendar export memory, scores and taste are **per device**.
- Calendar export is a snapshot; new dates need another export.
- Offline: your own data works; anything needing TMDB/OMDb doesn't.

## 9. Testing harness

Runs on any computer and in the cloud sandbox (details: `tests/README_HARNESS.md`, partly out of date on counts).

**Sandbox setup:** clone or fetch the repo, `npm install`, `cd shot && npm install` (+ `npm i --no-save @sparticuz/chromium` if no Chrome), then `node shot/build-test-dists.mjs` — it builds `.harness-work/dist`, `dist-fake` (fake cloud) and `dist-scores` (OMDb test key `TESTOMDB`). **Rebuild the test dists after every source change** before running browser suites.

- `npm run test:unit` → **81 suites, 1,105 tests, all passing** (16 Nov 2026, with the sync fix: new suites `live_show_merge` and `cloud_live_ticks`). The runner needs each suite to end with `console.log("N <words> tests passed")` (no hyphens in the words).
- `npm run test:browser:build` then `npm run test:browser` → **58 suites, ~1,267 checks, all passing** (11 Nov 2026). Browser suites print `N checks passed` and `PROBLEMS: none`.
- Browser suites: `node shot/browser/<name>.mjs`. Conventions: date pinned with a FakeDate (usually 2026-10-21T22:00Z = 22 Oct 09:00 Hobart), `emulateTimezone('Australia/Hobart')`, bypass the service worker, mock TMDB/OMDb with `access-control-allow-origin: *`, check no sideways scroll at 390px, take a screenshot and LOOK at it.
- **All browser suites run and pass (26 Oct 2026)**, including library, upnext and showpage: their old-build / design-mock-up comparisons were replaced with checks worked out from their own seeded data (library: Status is now a button + sheet/list, toolbar order Status · Platform · Sort · On my services; showpage: date fixed to 22 Oct 2026 and real checks instead of screenshots only). The 12 old failures were fixed on 25 Oct: 8 already passed after recent work; anime, notes, notes_search and region had stale checks, and anime also caught a real bug (Esc in a sheet also closed the page — sheets now `preventDefault` Esc).
- A full run of every browser suite takes 10–15 minutes.
- The real cloud engine is NOT covered by browser tests: they use `shot/browser/fakecloud.js` (a fake signed-in user, no Firestore). It IS run in plain-node unit suites (`cloud_*.test.mjs`, `hit_sync`) against an in-memory fake Firestore (`tests/unit/fakes/firestore.mjs`; `__fs.initialCollectionSnapshot = true` makes a collection listener send every doc as "added" on start, like real Firestore). Those fakes are not real Firebase: the sync fix is verified with them only, not yet on real Firestore. Unit tests cover the pure merge modules (`watchedMerge`, `backupMerge`, `wipeLogic`, …). A Firestore emulator could not be downloaded in the cloud sandbox (blocked network), but should work on the owner's computer (`npx firebase-tools emulators:start --only firestore`, needs Java).
- Sheets mark Esc as used (`e.preventDefault()` in `Sheet`); page-wide keys skip `defaultPrevented` events. Keep that if you add another Esc handler.
- When a suite fails, check it also fails on `origin/main` (git stash, rebuild dists, run) before blaming your change.
- Gotchas: `innerText` applies `text-transform` (use case-insensitive regex); elements behind the fixed tab bar need `el.click()` in `evaluate`; screenshots during sheet/note animations catch half-drawn UI (wait ~500 ms); new Settings cards must be added to the order list in `settings.mjs`; episode rows need a mocked `/tv/{id}/season/{n}` response.

## 10. How to make & ship a change

1. `git fetch`, compare, reset to `origin/main` (§0).
2. Put decisions in pure `*Logic.js` modules with unit tests; UI in `.jsx`; append CSS to `ui.css`.
3. `npm run build` must pass. Run all unit suites + the related browser suites + a new browser suite for the feature. Look at phone screenshots.
4. **Update Help & FAQ** (`src/components/helpContent.js`) when a feature adds or changes something people use: real button names, short plain answers. `tests/unit/help.test.mjs` checks the structure.
5. Zip only changed/new files with folders, SendUserFile, folder table, plain commit message.
6. Update the "WatchNext feature list" doc.

## 11. To-do list (from the feature list doc)

**Tidy-up from the code check (22–23 Oct):**
- ~~Remove the Discover hit-rate line from Watchlist → Discover~~ (done 25 Oct; still in Stats → Your taste).
- ~~Quiet the 3 background `console.warn` calls~~ (done 25 Oct: `devWarn` in `components/devLog.js`, logs only in `npm run dev`).
- ~~Fix the 12 failing browser suites~~ (done 25 Oct, §9). ~~The 3 suites that could not run (library, upnext, showpage)~~ (done 26 Oct).
- ~~Replace the 18 `alert()` and 6 `confirm()` pop-ups~~ (done 25 Oct). **Never use alert()/confirm() again**: `notify()` / `notifyError(…: ${reason(e)}.)` for messages and `await askConfirm({ title, body, confirmLabel, danger })` for questions (`components/appDialogs.js`, drawn by `DialogHost.jsx` in App). A unit test fails if alert( or confirm( comes back. Browser tests answer questions with `shot/browser/autoYes.js`.

**Feature ideas left (5):**
1. ~~Watch links~~ — built 24 Oct (`watchLinksLogic.js`, `WatchLinks.jsx`). Service search URLs live in `WATCH_SERVICES`; checked 26 Oct in a signed-out browser: Disney+ has no linkable search (button just opens Disney+ home), Stan search is on play.stan.com.au, SBS uses `?query=`, iview works, Paramount+ opens its AU search page without filling the title; HBO Max and Binge (blocked from the checking browser) are still `sure: false`. Exact title links later via Watchmode if needed. 26 Oct: the "All options" button says "Buy or rent" when TMDB lists only buy/rent here (`providersBuyRent` saved on shows and planned movies; older saves with a TMDB link but no streaming are checked again once), and Watchlist movie rows have Watch links (planned movies are checked quietly on the Queue tab, even with "On my services" off).
2. **Home-screen shortcuts** — long-press the app icon → Up Next, Search, Tonight (manifest `shortcuts`).
3. **Keyboard shortcuts** — on the computer: "/" search, 1–6 switch tabs.
4. ~~Compare with a friend~~ — built 24 Oct (`compareLogic.js`, `pages/Compare.jsx`, Stats → Friends). Friends swap a small JSON file ("Share mine" → WhatsApp/email → "Open a friend's file"); only titles, ratings, ♥, finished/dropped. Loved = 4★+ or ♥. Friends' files stay on the device. A live share code would need new Firestore rules.
5. ~~Episode IMDb scores~~ — built 25 Oct (`epScoresLogic.js`, `useEpisodeScores.js`, `omdbSeason` in `api/omdb.js`). One OMDb call per season, only when the season is opened; saved per device (30 days, 3 if airing, 7 if none). Best episode marked; hidden for shielded episodes. Needs the show's IMDb id from the title Scores lookup.

**Other open items:**
- ~~Movie sheet newest name/poster for every viewing~~ (done 25 Oct, `movieNamesLogic.js`): the sheet shows TMDB's current title/poster (else the newest viewing's); a viewing saved under a really different name shows "Saved as …" with Fix match / Use the new name; Settings → **Old movie names** updates all viewings to their film's newest viewing name (one undoable change, `updateMovies`).
- Waiting on his friend's Letterboxd import screenshots.
- ~~Habits stats more realistic with bulk-imported history~~ (done 29 Oct): see "Real days" below.
- Badges 26 Oct: **Watch it Hot** (6 levels: episodes watched on the air day or the day after, local days) and **Hot Ticket** (RARE, one level: 10 different films within 7 days of TMDB's release date). Logic in `hotLogic.js`. An episode's air date is saved on the watch record (`air`) only when the watch was hot (hint from the show page's season list, else `show.lastAir` (new, from TMDB `last_episode_to_air`), `nextAir`, `upcoming`); old watches don't count. Films save `released` (full date) when added, fixed, or when their sheet opens. Rare badges: `rare: true`, `tier` 6 (Legend colour), chip "Rare", note "Rare badge!". Help rows got brighter lines and an open-item highlight.
- More stats 27 Oct (`moreStatsLogic.js`): **Biggest binges** (Stats → Habits, top 5, follows the year picker): most episodes of ONE show on ONE local day; viewings with their own date only; same-minute batches of BATCH_MIN+ (imports, mark season) left out; 2+ episodes. **Genres over time** (Stats → Breakdown, under Genres): up to the last 5 years, top 5 genres by total, each cell = viewings of titles in that genre ÷ that year's viewings with genre data (can add to >100%); ▲/▼ line for changes of 5+ points between the last two years; hidden with under 2 years of data.
- Read before watching 27 Oct: Watchlist movie rows open `MovieInfoSheet.jsx` (one `movieDetailsWithCredits` request: overview, tagline, runtime, genres, ScoresRow or TMDB ★ fallback, Watch links, CastCrew, ▶ Trailer, "I watched it" / Remove). The show page has an **About** card (tagline + overview) from `tvDetailsWithCredits`, now passed to CastCrew as `details` so it is still one request (CastCrew renders once that download finishes).
- Search previews 27 Oct: `TitleInfoSheet.jsx` (kind movie|tv, caller gives the buttons) is the shared "read before adding" sheet; `MovieInfoSheet` now wraps it. Search results: tap the poster or name to open it; the sheet has Follow / ＋ Watchlist / Open show page (shows) or Watched it / Log rewatch / ＋ Watchlist (movies), following live library status. The show "Open" button for a show NOT in the library now opens the sheet instead of following it. Shows load `tvDetailsForPreview` (details + aggregate_credits + watch/providers). Facts line: `titleInfoLogic.js`.
- Credits 28 Oct: `Credits.jsx` footer at the bottom of Settings and Help & FAQ with TMDB's required notice (exact text, no logo) and JustWatch / OMDb / AniList credits; Help answer "Where does WatchNext get its show and movie information?" (data section). Monetising: parked for now (needs a TMDB commercial licence first).
- Real days 29 Oct (`realDaySet` in `statsLogic.js`): a day that only holds a bulk batch (a minute with BATCH_MIN+ watches) is NOT a real viewing day. It is left out of "Days with a watch", the longest/current streak, the heatmap and the Year in review active-days number, and can never be "Most in a day". "Most in a day" now counts each bulk batch as ONE sitting (before, an import stamped with different seconds could win). A bulk batch on a day you also really watched still counts once on that day. The Habits note says how many import-only days were left out (`bulkOnlyDays`). Test: `shot/browser/habits_bulk.mjs`. Month recap's own active-days number (`monthRecapLogic.js`) is unchanged.
- Help 29 Oct: new answer "Does WatchNext send notifications or reminders for new episodes?" (Shows & episodes... Finding what to watch section, id `notifications`): not yet, being worked on, use Up Next → On the way → Add to calendar.
- Up Next tick 11 Nov (`UpNext.jsx`, `upnextLogic.js`): the row used to jump straight to the next episode, and only one letter changed ("E07" → "E08"), so it looked like nothing happened and people tapped again, marking extra episodes (seen in real data: Suits S9 episodes 0.7–2 s apart). Now the ticked row shows "✓ S09·E07 watched" with a filled teal button for `JUST_MARKED_MS` (1.5 s) before moving on; the filled button can't be tapped; the double-tap guard (`MARK_COOLDOWN_MS`) is the same 1.5 s; Continue watching keeps its on-screen order during that time (`holdOrder`) so the row doesn't jump away under your finger; a show you just finished stays visible (✓) for that moment. The work behind a tick takes about 30 ms on the owner's real library (260 shows), so speed is not the issue. **Update 16 Nov:** a double "Watched S9E8" in the iPhone's activity log showed a second cause — ticks being silently undone by cloud sync. Fixed in `fable/sync-fix`, see §12; this 1.5 s change alone did not fix that.
- Power BI starter guide (29 Oct): a written Claude Doc for the owner (not in the repo); `docs/WatchNext Power BI starter guide.docx` is a copy.
- Older ideas (v6): ~~Power BI starter guide~~ (done 29 Oct), ~~more stats (genre trends, longest binge)~~ (done 27 Oct), ~~UTC vs local for all Stats~~ (done 26 Oct), new-episode push notifications (needs a backend; planned 29 Oct, see §13), ~~friendly message when the Google popup is cancelled~~ (done 25 Oct: `store/signInLogic.js`; closing the window = calm note, no red; fake cloud can start signed out with `window.__fakeSignedOut` / fail with `window.__signInError`).

## 12. Bug: one tick logged twice (Up Next) — FIXED in `fable/sync-fix` (16 Nov 2026), waiting for the owner's phone check

**What the owner saw (15 Nov 2026, iPhone):** Settings → Your recent changes showed **two** entries "Suits · Watched S9E8 · 15 Nov, 9:05 pm". Earlier (10–11 Nov) he said a tick on Up Next "does not change, so I press it 2 or 3 times and then it changes".

**Why two entries meant the tick was undone in between:** an entry is only written when the state really changes (`logged()` + `Activity.makeEntry` → `diffState`). Marking an already-watched episode changes nothing, so it makes no entry. A real Undo would add an "Unwatched S9E8" entry, and there was none. So S9E8 was removed without an entry, and only sync does that: changes from the cloud listener use `update()` directly and are not logged.

**Cause (reproduced with the real engine and the in-memory fake Firestore, `tests/unit/cloud_live_ticks.test.mjs`):** the live listener did `s.shows[id] = { ...local, ...remote }`. A tick lives only on the device until the next upload (up to 2.5 s). A cloud copy of that show arriving in the gap replaced `watched` and the tick vanished. Cloud copies arrive when the other device uploads the same show (every app start marks ALL shows dirty and uploads them) and at every app start (the first snapshot delivers every show). The listener also started at the same time as the pull, so its first snapshot could wipe ticks made since the last sync before the pull had merged them.

**The fix (no change to the Firestore data shape):**
- `src/store/liveShowMerge.js` (new, PURE): `applyRemoteShow(local, remote, base)` and `createBaseTracker()`. Three-way merge per episode and per field. `base` = the copy the cloud was last known to hold. Compared with `base`, a local difference is a change made here and not uploaded: a tick, an un-tick, a +1, a rating... It wins. Everything else follows the cloud. So: tick here + old cloud copy = tick kept; un-tick here, not uploaded = stays un-ticked; **un-tick on the other device (this device did not touch the episode) = removed here too**; tick on the other device = added. Unknown `base` = keep all local data and add the cloud's (never lose a tick). Notes and episode ratings are unioned when changed here.
- `src/store/cloudEngine.js`: `showBases` is filled by the pull (cloud copy), by every applied snapshot, and by every successful upload (a copy taken when the batch was built, so a tick made while the upload is in flight stays "pending"); cleared on sign-out, sign-in and Delete everywhere. The shows listener now starts inside the `.then` of `pullAndMerge`.
- Tests: `tests/unit/live_show_merge.test.mjs` (19, pure), `tests/unit/cloud_live_ticks.test.mjs` (7, real engine + fake Firestore: the lost tick, the double log entry, un-tick from the other device, tick+un-tick at the same time, un-tick here vs an old cloud copy, a rating, the start-up race), fake Firestore got `initialCollectionSnapshot`. The lost-tick test was written first and failed (4 of 7 failed on the old code), then passed after the fix.

**Known limits that are STILL OPEN (decide with the owner before changing; each needs a data-shape or write-style change):**
1. **The sign-in pull still unions.** An episode un-ticked on the computer while the phone app was closed comes back on the phone at its next app start (the phone has no `base` yet and cannot tell an un-tick from a tick it never uploaded), and is then re-uploaded to everywhere. Fixes: per-episode "removed at" markers (a new field in the show doc, like `movieTombsLogic.js`), or saving `showBases` on the device (extra localStorage).
2. **Two devices ticking the same show within about 2.5 s of each other** can still lose one tick: each upload writes the whole show document, last write wins, and the other device then reads the missing episode as an un-tick. Real fix: write only the changed episode (`updateDoc` with `watched.9x8`, `deleteField()` for an un-tick). The stored data would look the same.
3. `flush()` can run before the first pull has finished (2.5 s timer) and upload this device's copy of a show over the cloud's. It heals itself when the other device next starts, but it is a data-loss window. Fix: do not flush shows until `pulledOnce` (needs a retry if the pull fails).
4. Verified only with the fake Firestore and unit tests, not on real Firebase.

**Manual check on real devices (owner):** tick an episode on the phone, open the app on the computer at once, tick another on the computer, then look at both: no lost ticks, no doubles (Settings → Your recent changes); un-tick an episode on the computer: it should disappear on the phone within a few seconds while the phone app is open.

## 13. For a reviewer: how to look at this app and what to suggest

The owner wants an outside review: **what to improve and which new features to build**, in plain English, with effort sizes. Useful facts for that:
- **Who uses it:** the owner daily (iPhone + Windows), two friends occasionally. Personal project, not monetised (a TMDB commercial licence would be needed first). No own server: only GitHub Pages + Firebase (free Spark plan) + TMDB/OMDb/AniList from the browser.
- **Biggest risk areas:** cloud sync correctness (§6, §12); `ui.css` and `db.js` are very large single files; the real cloud engine has no automated test; per-device data that people may expect to sync (activity log, badges seen, spoiler shield, scores cache); localStorage size (state + caches; the browser limit is ~5 MB per site).
- **Where most code lives:** `src/store/db.js` (state + every mutation), `src/store/cloudEngine.js` (sync), `src/pages/*.jsx` (screens), `src/components/*Logic.js` (pure, tested logic), `src/components/ui.css` (all redesigned styles).
- **Ideas already on the list:** new-episode push notifications — planned 29 Oct as a GitHub Actions hourly job (free) + Firebase Cloud Messaging that sends one "New today" message per user at their chosen hour (iPhone needs the app on the Home Screen, iOS 16.4+); Compare with a friend (built, waiting for a friend to test); optional Letterboxd real-export test.
- **Read before suggesting:** §7 (what already exists, so you don't suggest it again), §8 (known limits), §11 (what was built recently and why).

## 14. First message to paste into the new chat

> Assalamualaikum. Please clone my repo `AceAsif/watchnext` (or fetch it) and read `docs/WatchNext-Handover-v8.md` first. Tell me in 5 short lines what you understand, set up the test harness as in §9 and run the unit tests to check it works. Then let's build: [name the feature, e.g. "Watch links"].
