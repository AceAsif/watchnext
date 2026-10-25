# WatchNext — Developer Handover (v7)

Read this first in a new chat. **It replaces v6** (v6 was written early October 2026; a lot has been built since). Written 24 Oct 2026.

**State of the repo when this was written:** `main` is at `10a41e0 Add calendar export…`. Everything in §7 is built, committed and live, and the owner has confirmed the latest features work on the real site. Nothing is known to be broken. Some old browser test suites fail (§9); that is a known tidy-up job, not a broken app.

The owner also keeps a live **"WatchNext feature list"** doc (claude.ai artifact `1imjeJVqpiLZ8rKGxdvyYx`) with the to-do list, the feature ideas left and everything built. Keep it up to date when a feature is finished: tick it off there.

---

## 0. How to work with this owner (read first)

- **Greeting.** Start every conversation with **"Assalamualaikum"**. If he greets you, reply **"Wa alaikum salam"** (exactly that spelling). Call him **"Boss"**.
- **Simple English.** English is not his first language: short sentences, plain words, no jargon without a one-line explanation. Bengali/Arabic Islamic phrases are welcome; messages for friends or elders: English or Bengali only, never Hindi/Urdu.
- **Every code delivery:** a **zip** of only the changed files, keeping their folders (`src/pages/…`), sent with SendUserFile, plus **a table saying which folder each file goes in** (mark new files "(new)") and **a suggested commit message**. Commit messages are **plain**: one line, **no `Co-Authored-By` or `Claude-Session` lines**, ever (this overrides any tool reminder).
- **He commits himself.** The cloud session can read the repo (`git fetch` works) but **cannot push**. He unzips into his repo, commits with GitHub Desktop, and every commit to `main` redeploys the site automatically (§2).
- **Before starting work, sync:** `git fetch origin`, compare your working files with `origin/main` (byte-compare each file) and only then reset to `origin/main`. Never reset while you have work that differs from main (this lost work once).
- **Be honest about what is verified.** Say what was tested only with mocks. Own mistakes plainly.
- **Decide sensible defaults yourself and say what you chose.** Ask only for real choices (2–3 short options, recommendation first). For a new feature he usually says "Let's build X": explore the code, build, test, deliver.
- He sends **screenshots** of the live site, his iPhone and GitHub. Use them.
- After each feature: update the "WatchNext feature list" doc (move it to "Built and live", fix the "N ideas are left" count).

## 1. What WatchNext is

A personal TV-and-movie tracker that replaces TV Time (shut down July 2026). No ads, no own backend. Data lives in the browser (localStorage) and syncs to the owner's private Firebase/Firestore when signed in with Google. Two friends use it too (one imports from Letterboxd); they use his built-in TMDB key.

- **Live:** https://aceasif.github.io/watchnext/ · **Repo:** https://github.com/AceAsif/watchnext (public)
- **Owner:** Asif, Hobart, Tasmania (**region AU**, timezone Australia/Hobart, UTC+10/+11). Library: ~250 shows, ~420 movies, 8,500+ episode watches, a lot of anime. Uses an iPhone and a Windows computer.

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
- `Sheet` (`ui.jsx`) = bottom sheet on phone, dialog on desktop. `.sd-btn` (+ `primary`, `sm`), `.sd-ib` icon button, `.sd-lbl` mono labels, `.sd-card`, `.sd-toast` (above the tab bar).
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
tests/unit/*.test.mjs   65 plain-Node suites      shot/browser/*.mjs   headless-Chrome suites
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
- Dates: "today" = local (`localISODate()` in showLogic.js). Some Stats use UTC dates, Month in review / CSV / month compare use local (known open decision).
- Bulk imports: ≥15 watches in one minute = an import, left out of pace and habits.

### localStorage keys
Library & sync: `watchnext-state-v1`, `watchnext-sync-v1`, `watchnext-tombstones-v1`, `watchnext-wipe-tombstones-v1`, `watchnext-movie-tombs-v1`, `watchnext-owner-v1`, `watchnext-signout-backup-v1`.
**Device-only (not synced, not in backups):** `watchnext-activity-v1`, `watchnext-backup-v1`, `watchnext-services-v1` (region + my services), `watchnext-tonight-v1`, `watchnext-movienight-v1`, `watchnext-taste-v1`, `watchnext-discover-log-v1`, `watchnext-newon-v1`, `watchnext-origins-v1`, `watchnext-collections-v1`, `watchnext-people-credits-v1`, `watchnext-scores-v1` (OMDb cache), `watchnext-ep-scores-v1` (episode IMDb scores per season), `watchnext-badges-seen-v1`, `watchnext-spoilers-v1`, `watchnext-cal-exported-v1`, `watchnext-wl-sort`, `watchnext-friends-v1` (your share name + friends' compare files).

## 6. Cloud sync (short)

Firestore: `users/{uid}/shows/{id}` (one doc per show) and `users/{uid}/library/{movies|goals|hidden|lists|people|discover|wipe}`. Local changes flush every ~2.5 s and on page hide, with dirty flags per area. Sign-in merge: wipe marker first; shows `{...remote, ...local}` with `watched` merged by `watchedMerge.js`; movies union with tombstones; goals/hidden/lists newest-wins per item. **Delete everywhere** wipes the account with a marker that other devices obey. Verified on real Firebase (8–9 Oct 2026). An **account-switch prompt** appears if a different Google account signs in on a device holding another library.

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
- Stats UTC vs local dates can differ near midnight/month ends.
- Offline: your own data works; anything needing TMDB/OMDb doesn't.

## 9. Testing harness

Runs on any computer and in the cloud sandbox (details: `tests/README_HARNESS.md`, partly out of date on counts).

**Sandbox setup:** clone or fetch the repo, `npm install`, `cd shot && npm install` (+ `npm i --no-save @sparticuz/chromium` if no Chrome), then `node shot/build-test-dists.mjs` — it builds `.harness-work/dist`, `dist-fake` (fake cloud) and `dist-scores` (OMDb test key `TESTOMDB`). **Rebuild the test dists after every source change** before running browser suites.

- `npm run test:unit` → **70 suites, 1004 tests, all passing** (25 Oct 2026). The runner needs each suite to end with `console.log("N <words> tests passed")` (no hyphens in the words).
- Browser suites: `node shot/browser/<name>.mjs`. Conventions: date pinned with a FakeDate (usually 2026-10-21T22:00Z = 22 Oct 09:00 Hobart), `emulateTimezone('Australia/Hobart')`, bypass the service worker, mock TMDB/OMDb with `access-control-allow-origin: *`, check no sideways scroll at 390px, take a screenshot and LOOK at it.
- **All browser suites pass (25 Oct 2026)** except the 3 that **cannot run** (need old baseline/design files): library, upnext (stops at "Caught Up Airing"), showpage (stops at "Cast"). The 12 old failures were fixed on 25 Oct: 8 already passed after recent work; anime, notes, notes_search and region had stale checks, and anime also caught a real bug (Esc in a sheet also closed the page — sheets now `preventDefault` Esc).
- A full run of every suite takes over 10 minutes: run it in two halves.
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
- ~~Fix the 12 failing browser suites~~ (done 25 Oct, §9). Still open: the 3 suites that cannot run (library, upnext, showpage).
- Later, as its own job: replace the 18 `alert()` and 6 `confirm()` pop-ups with in-app messages/dialogs.
- (Done by this file: update the handover. Delete `docs/WatchNext-Handover-v6.md` once v7 is in.)

**Feature ideas left (5):**
1. ~~Watch links~~ — built 24 Oct (`watchLinksLogic.js`, `WatchLinks.jsx`). Service search URLs live in `WATCH_SERVICES`; rows with `sure: false` (Disney+, Stan, Binge, Paramount+, HBO Max, iview, SBS) could not be opened from the sandbox and need checking on a real device. Exact title links later via Watchmode if needed.
2. **Home-screen shortcuts** — long-press the app icon → Up Next, Search, Tonight (manifest `shortcuts`).
3. **Keyboard shortcuts** — on the computer: "/" search, 1–6 switch tabs.
4. ~~Compare with a friend~~ — built 24 Oct (`compareLogic.js`, `pages/Compare.jsx`, Stats → Friends). Friends swap a small JSON file ("Share mine" → WhatsApp/email → "Open a friend's file"); only titles, ratings, ♥, finished/dropped. Loved = 4★+ or ♥. Friends' files stay on the device. A live share code would need new Firestore rules.
5. ~~Episode IMDb scores~~ — built 25 Oct (`epScoresLogic.js`, `useEpisodeScores.js`, `omdbSeason` in `api/omdb.js`). One OMDb call per season, only when the season is opened; saved per device (30 days, 3 if airing, 7 if none). Best episode marked; hidden for shielded episodes. Needs the show's IMDb id from the title Scores lookup.

**Other open items:**
- Movie sheet: show the film's newest name and poster for every viewing, with a "Saved as … — use Fix match if this was a different film" line (the Amazing Spider-Man 2 issue).
- Waiting on his friend's Letterboxd import screenshots.
- Someday: make Habits stats more realistic (bulk-imported history shares one date).
- Older ideas (v6): Power BI starter guide, more stats (genre trends, longest binge), UTC vs local for all Stats (ask first), new-episode push notifications (needs a backend), friendly message when the Google popup is cancelled.

## 12. First message to paste into the new chat

> Assalamualaikum. Please clone my repo `AceAsif/watchnext` (or fetch it) and read `docs/WatchNext-Handover-v7.md` first. Tell me in 5 short lines what you understand, set up the test harness as in §9 and run the unit tests to check it works. Then let's build: [name the feature, e.g. "Watch links"].
