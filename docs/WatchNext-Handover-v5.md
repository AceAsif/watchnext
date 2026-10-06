# WatchNext — Developer Handover (v5)

Paste this whole file into a new chat (and attach `watchnext-test-harness.zip`) to bring an assistant fully up to speed, then ask it to build the next feature. **This supersedes v4.** New since v4: the Year-in-Review saved image (3-across poster grid, matching the on-screen card), Dropped status, CSV export for Power BI, auto-resume of dropped shows, Delete everywhere (account-wide wipe) and Most rewatched (Stats → Rankings), Notes search + Most loved shows, the Month in review + "You finished" share cards, Fix watch dates + the "When did you watch it?" question, the Backup reminder, the "On my services" filter, and "What should I watch tonight?". See §5, §6, §7, §9 and the **owner to-do list in §12**. It reflects the complete UI redesign (every tab), AniList, Restore from backup, the Cinema platform, and Notes & reactions. Last verified against the repo at commit `4c08e6f` (2 Oct 2026) plus one pending delivery (§9).

---

## 0. How to work with this owner (read first)

- **Greet with "Assalamualaikum"** at the start of a conversation; reply to his greeting with **"Wa alaikum salam"**. English only; Bengali/Arabic Islamic phrases are welcome.
- **Every code delivery must say which folder each file goes in, and give a git commit message** (summary line + short bullet description). He applies files by copying into his repo with GitHub Desktop and pushing; deploy is automatic.
- **Tell him to Fetch/Pull in GitHub Desktop before copying.** The repo is edited from more than one place (see §10, "drift").
- **Be honest about what is and isn't verified.** He has repeatedly valued: admitting mistakes plainly, saying what was only tested with mocks, and flagging risky decisions before making them. He has limited usage budget on some days, so stay lean: no long preambles, discuss before big builds, and don't re-run suites that can't be affected.
- Ask before destructive or hard-to-reverse behaviour. (Delete everywhere was built only after he chose the design: type-DELETE confirmation, an automatic backup first, and honest wording about what other devices do.)
- He often sends screenshots of the live site and Claude Design exports; use them.

## 1. What WatchNext is

A personal TV-and-movie tracker, a self-hosted replacement for TV Time (shut down 15 July 2026). Single-user, privacy-first: no accounts needed, no ads, no backend of its own. Data lives in the browser and optionally syncs to the owner's private Firebase/Firestore. He also shared the link with 2 friends who use it locally on their own devices (no Firebase account).

- **Live:** https://aceasif.github.io/watchnext/ · **Repo:** https://github.com/AceAsif/watchnext (public)
- **Owner:** Asif, Hobart, Tasmania (**AU region**, timezone Australia/Hobart, UTC+10/+11 with DST). Library: ~250 shows, ~410 movies, 8,500+ episode watches, very anime-heavy.

## 2. Tech stack

- **React 18 + Vite**; no router (navigation is local state in `App.jsx`: a `tab` string, an optional open show id, a `searching` boolean). No TypeScript, no test framework in the repo, no state library, no UI libraries.
- **Plain CSS.** `src/styles.css` holds `:root` design tokens and the older styles; **all redesigned UI lives in `src/components/ui.css` under the `sd-*` class prefix** (appended in sections: Stats, Library, Settings, Notes…). Check `:root` for exact token values.
- **TMDB v3** for metadata (`api_key` query param). The key comes from `getState().settings.tmdbKey` **or** the build-time env `VITE_TMDB_API_KEY` (see §11 — his deployment very likely bakes it in via the `ENV_FILE` secret, which means the key is visible in the public JS; README acknowledges this).
- **AniList GraphQL** (read-only, no OAuth) for anime details. CORS verified working by the owner on the live site.
- **Firebase Auth (Google) + Firestore**, code-split into a lazy ~440 kB chunk (§6). localStorage is the source of truth.
- **PWA** (`public/sw.js`, self-updating). **Deploy:** GitHub Actions builds from the `ENV_FILE` secret and deploys to gh-pages on every push to `main`; `npm run build` locally is not required before pushing.

## 3. Design system

Dark theme; amber accent (`--amber` ≈ #f2a33c), teal (`--teal` ≈ #56c8b5) for "done/ok", red (`--red` ≈ #e5695e) for destructive. Fonts: Bricolage Grotesque (`--font-display`), Inter (`--font-body`), IBM Plex Mono (`--font-mono`, labels/codes). Corner radius ~12–14px. **44px minimum touch targets.**

**Layout rules**
- Phone: `.sd-page` is a single column capped at 560px. **Desktop ≥ 900px**: wider layouts (two-column Up Next/Show page/Stats; Settings is a centred 640px column; Shows/Movies use an auto-fill grid of ~7 columns).
- `Sheet` (`ui.jsx`) = **bottom sheet on phone, centred dialog on desktop.** Props: `open, title, subtitle, action, onClose, variant, role`. It restores keyboard focus to the trigger (recorded during render) and does not steal focus from an autofocused child.
- Mono-caps small labels use `.sd-lbl`; cards use `.sd-card`; segmented controls, chips, tiles, bars, banners all have `sd-*` classes in `ui.css`.
- Header: logo + a 44px bordered search button (`.sd-ib`); the old "personal tracker" tagline was removed.

**Workflow with Claude Design:** the owner designs boards in Claude Design and uploads an exported `WatchNext_redesign*.html`. To read it: the file contains `<script type="__bundler/manifest">` (id → `{data: base64, compressed}`), `<script type="__bundler/page_order">` (board ids in order), and each board is gzip'd HTML whose `<script type="__bundler/template">` is a JSON string of the board markup. Decode, strip the base64 `@font-face` noise, and read the markup for exact sizes/copy. **Design copy is sometimes invented** (labels, counts, claims like "stays on your own server") — always check it against the real code before shipping.

## 4. Project structure (current)

```
src/
  main.jsx, App.jsx           shell: header + bottom tab nav (Up Next, Shows, Movies, Watchlist, Stats, Settings),
                              show-detail routing, global Search overlay
  styles.css, components/ui.css   tokens + older styles / ALL redesigned (sd-*) styles
  firebaseConfig.js, firebase.js  (firebase.js ONLY imported by store/cloudEngine.js)
  api/
    tmdb.js                   TMDB client (+ hasKey, img(), 429 backoff, watchProviders, videos, credits)
    anilist.js                AniList GraphQL client (timeout, 429 handling)
  store/
    db.js                     localStorage store + ALL mutations + derived helpers (§5)
    notes.js                  PURE: reactions, cleanNote, setNoteIn, mergeNotes, movie-note helpers   [pending commit, §9]
    backupMerge.js            PURE: additive restore-from-backup merge (hostile-file safe; also sanitises `dropped`/`droppedAt`)
    tonightLogic.js           PURE: "What should I watch tonight?" — candidates (Up Next continue / Watchlist shows / planned movies), fit to the time, mood match, ranking, wording, remembered choices
    TonightSheet.jsx          the sheet (time chips, mood chips, "Only on my services", 3 suggestions, "Show me different ones"); opened from a card on Up Next
    platformsData.js          PURE: PLATFORMS chips (incl. Paramount+), `providerToPlatform` TMDB-name -> chip id; PlatformPicker.jsx re-exports them
    servicesLogic.js          PURE: "On my services" — normalise TMDB's AU provider block, match your ticked services (free always counts), freshness (14 days), background-check scheduling, status wording, per-device prefs
    ServicesUI.jsx            ServicesPicker (chips), ServicesToggle, ServicesStatus, ServicesSheet; Settings uses ServicesCard (SettingsCards.jsx)
    useAvailability.js        hook: checks availability in the background (3 at a time, 150ms apart), saves each answer, Retry
    backupNudgeLogic.js       PURE (+ tiny storage helpers that take the storage as an argument): when the Settings backup reminder shows, snooze, wording
    watchedMerge.js           PURE: how two copies of a show's watched map are merged at sign-in (a hand-corrected date beats an older stamp; rewatch counts never lost)
    servicesPrefs.js          (store/) tiny external store for the services prefs (own localStorage key); `toggleMyService` reads the latest list
    wipeLogic.js              PURE: Delete-everywhere flow (`runWipe` with injected ports), wipe-marker decisions, typed confirm, wording (§6)
    cloud.js                  firebase-free facade (dynamic import of the engine)
    cloudEngine.js            real Firebase sync; merges shows (watched union + notes union), movies
    useStore.js               useSyncExternalStore hook
  pages/
    UpNext.jsx                Continue watching + On the way (List/Calendar), mark-next with Undo
    Shows.jsx                 library: ONE filter box, status tabs w/ counts, Platform/Sort chips, Tools menu, + Add dialog
    ShowDetail.jsx            show page (summary rows + bottom sheets), seasons/episodes, notes buttons, AniList, cast/crew
    Movies.jsx                movie grid + filter + Add dialog; detail sheet (rating, thoughts, platform, trailer, fix match, remove)
    Watchlist.jsx             queue + Discover   (redesigned by a separate session; uses LibraryUI.jsx)
    Stats.jsx                 tabs Overview/Habits/Rankings/Breakdown (compute block unchanged; render redesigned)
    Settings.jsx              Sync, TMDB key, Import, Clean up, Backup/Restore, Danger zone + confirm dialogs
    Search.jsx                global TMDB search (header icon)
    Notes.jsx                 "Your notes": search/filter every note and reaction (opened from a button on Stats; state lives in App)
  components/
    ui.jsx                    Sheet, Bar, Chevron, Avatar
    LibraryBar.jsx            FilterField, StatusTabs, ChipSelect (sheet/popover), ToolsMenu, ProgressCard, LibEmpty,
                              ShowTile, MovieTile, AddDialog, icons, useIsDesktop
    LibraryUI.jsx             PageHead/SearchField/MediaRow/Poster/Empty (older shared bits, used by Watchlist/Discover/Movies sheet)
    StatsUI.jsx, Heatmap.jsx, YearInReview.jsx      stats pieces (YearInReview: on-screen card; the saved PNG is drawn by yearImageRender.js)
    yearImageLogic.js         PURE: 1080x1350 layout plan (shared by Year + Month cards), palette, GLOWS (unit test keeps them in sync with `.sd-yir` in ui.css); `data.facts` lets a card supply its own fact cells
    yearImageRender.js        canvas drawing of a PERIOD card: `renderPeriodImage(data, deps, {label, big})`; `renderYearImage` is a wrapper
    cardKit.js                canvas bits shared by every share card: fonts, rounded rects, background wash, footer, cover-draw
    shareImage.js             loadImg (CORS, never taints), canvasToBlob, downloadBlob, shareText, shareImageFile (Web Share with a PNG file where supported)
    RecapSection.jsx          the on-screen period card + picker + Share/Save buttons; YearInReview.jsx and MonthInReview.jsx are thin wrappers
    monthRecapLogic.js        PURE: per-LOCAL-month numbers (episodes, hours, movies, days, top shows, genre, busiest day, delta vs last month)
    watchDatesLogic.js        PURE: day validation, local-noon stamp for a chosen day, which episodes a date fix can target (all / season / day-cluster)
    WatchDateSheets.jsx       WhenSheet (asked on "Mark season watched") and FixDatesSheet (show ⋯ menu → "Fix watch dates…")
    finishCardLogic.js        PURE: when a show is "finished", honest start/finish dates, title wrapping, layout for the "You finished" card
    finishCardRender.js, FinishCardSheet.jsx   canvas drawing + the preview sheet (Share / Save image)
    csvExport.js              PURE: episodes / shows / movies CSV tables for Power BI (BOM, CRLF, formula-safe text)
    rewatchLogic.js           PURE: Most rewatched shows / movies rankings
    notesSearchLogic.js       PURE: collect every note/reaction, search + filters + facet counts, Most loved shows score
    SettingsCards.jsx         presentational Settings cards, Banner, ConfirmDialog
    NoteEditor.jsx            NoteEditor + NoteSheet                                                [pending commit, §9]
    CastCrew.jsx, AnimeSheet.jsx, AgendaEpisode.jsx, CalendarGrid.jsx, Discover.jsx, Stars.jsx, PlatformPicker.jsx
    PosterCard.jsx            UNUSED now (safe to delete)
    *Logic.js                 PURE, unit-tested: showLogic, creditsLogic, animeLogic, upnextLogic, statsLogic,
                              libraryLogic, settingsLogic
tools/convert_tvtime.py       one-off TV Time converter
.github/workflows/deploy.yml  builds with ENV_FILE secret -> gh-pages
firestore.rules               each user reads/writes only their own data
```

## 5. Data model & key store functions (`store/db.js`)

```js
{
  shows: { "tmdb:678": {                       // key "tmdb:ID" or "tvdb:ID"
      tvdbId, tmdbId, name,
      followed,                                // in the library
      watchlist,                               // plan-to-watch (independent of followed; library beats watchlist)
      rating, ratedAt, platform,               // platform = PlatformPicker id; includes 'cinema'
      providers, providersLink, providersSynced, addedAt,
      watched: { "2x11": { at, min, n } },     // per-episode; n = watch count (rewatches)
      notes: { "1x2": { react, text, at } },   // NEW — episode notes/reactions; separate map so un-marking keeps them
      upcoming, upcomingSynced, poster, backdrop, status, totalEpisodes, genres,
      seasons: [{ n, count, air }], runtimeMin, nextAir, lastSynced,
      anime: { id, malId, url, title:{english,romaji,native}, format, status, episodes, duration,
               season, year, genres, studios, score, next, syncedAt }   // AniList snapshot; null on unlink (NOT key deletion)
  } },
  movies: [ { tmdbId, name, status:'watched'|'planned', watchedAt, rating, ratedAt, platform,
              runtimeMin, poster, year,
              react, note } ],                 // NEW — movie thoughts live on the watch entry (each rewatch separate)
  settings: { tmdbKey }
}
```
localStorage keys: `watchnext-state-v1`, `watchnext-tombstones-v1`.

- **Rules that bite:** `update()` hands out fresh `shows`/`movies` container references on every call (load-bearing for memoised views). **Never write `undefined` to state** (Firestore rejects it) — remove the key instead; `notes.js` helpers (`withNotes`, `withMovieNote`) enforce this and drop the whole `notes` property when empty. `epKey(s,e)` = `"SxE"`.
- Mutators: `markEpisode`, `markSeason`, `logEpisodeRewatch`, `setShowRating`, `setShowPlatform`, `setShowAnime` (stores explicit `null` on unlink), `setEpisodeNote`, `setMovieNote`, `setMovieRating`, `setMoviePlatform`, `addShowFromTmdb`, `addShowToWatchlist`, `addMovieWatched`, `addMovieToWatchlist`, `deleteShow` (writes a tombstone), `importTvTime` (TV Time export: `shows` is an **array**), **`restoreBackup(json)`** (backup file: `shows` is an **object**), `resetAll` (see below).
- **De-skew:** a "minute bucket" with ≥ `BATCH_MIN` (15) watches is one bulk-import event (TV Time import dumped 1,000+ watches on a few dates). Used in Stats day-of-week/busiest day/heatmap and pace estimates. `BATCH_MIN` exists in `statsLogic.js` and as `PACE_BATCH_MIN` in `db.js` — **keep in sync** (a unit test checks).
- **Dates:** "today" must be the **local** date (`localISODate()` in `showLogic.js`), never `new Date().toISOString().slice(0,10)` (wrong for Hobart in the morning). **Known & deliberately unchanged:** Stats attributes each watch to a day by its **UTC** date, so a watch logged ~00:00–10:00 Hobart time lands on the previous day in the heatmap/streaks/day-of-week. Changing it would rewrite history — it's an open owner decision (§12).

- **Dropped:** `show.dropped` is an explicit `true`/`false` (never deleted, so cloud merge `{...remote, ...local}` lets the latest local choice win) and `droppedAt` is an ISO string or `null`. `setShowDropped(id, dropped, at?)` (the optional `at` lets Undo restore the original date). `markEpisode(…, true)`, `markSeason(…, true)` (non-empty) and `logEpisodeRewatch` **auto-resume** a dropped show (`resumePatch`); un-marking never resumes. Dropped shows are skipped by Up Next (Continue, On the way, refresh targets), get their own **Dropped** status tab (shown only when something is dropped), keep counting in episodes/hours, and leave the Finished/Watching/Not started completion rows (own "Dropped" row). Restore merges `dropped` with *your* explicit value winning, and removes non-boolean junk from a file.
- **Movie genres:** planned and watched movies now also store `genres` (names). Movies queued before this have none (`genres` missing) until `setMovieGenres(tmdbId, names)` backfills them; `[]` means TMDB lists no genres.
- **Streaming availability cache:** `show.providers` (subscription list, as before) + `show.providersFree` (free + ad-supported) + `providersLink` + `providersSynced`; planned (watchlist) movies carry the same four fields (`setMovieProviders(tmdbId, …)`, planned entries only). Written by the show page's Check, Shows → Tools → Detect platforms, and the filter's background checks (`setShowProviders(id, subs, link, free)`). A cache older than 14 days, or from before `providersFree` existed, counts as stale and is re-checked in the background (but still answers meanwhile). No AU block = "streams nowhere" = a valid, remembered answer.
- **Watch dates & `fixedAt`:** every episode entry is `{ at, min, n }` and `at` is stamped "now" when you mark it, so logging a show you saw years ago puts it in the current month/year (this is what made Dahmer/Mind of Jake Paul appear in July 2026). A date set **by hand** adds `fixedAt` (ISO of when it was set): `setWatchDates(id, keys, isoAt)` (returns the previous values for Undo), `restoreWatchDates(id, prev)` (stamps a NEWER `fixedAt`, so an undo also wins on a device that was offline), and `markSeason(id, season, eps, true, isoAt)` (only newly marked episodes get the date). There is deliberately **no "unknown date"**: a date is always a real day, stored as local noon (never in the future, not before 1980). Only `at`/`fixedAt` change; `n`, `min`, notes, rating are untouched.
- **Rewatches:** episodes keep a running total `watched[k].n` (no per-viewing date, so rewatch stats are all-time only); every movie viewing is its own dated entry (same `tmdbId`, else same name). `rewatchLogic.js` turns both into rankings.

## 6. Cloud sync

- `cloud.js` is a firebase-free facade; the real engine is `cloudEngine.js`, loaded by `import()`. **Never statically import firebase or `firebase.js` from eagerly-loaded code** (undoes the ~230 kB main / ~440 kB lazy split). Importing small PURE modules (e.g. `./notes.js`) into the engine is fine.
- Sign in → pull Firestore and merge: **union of `watched`** (local entry wins on conflict) and, now, **union of `notes`** (yours win per episode); other show fields are `{...remote, ...local}`. Shows are docs under `users/{uid}/shows/{id}`; movies are ONE doc `users/{uid}/library/movies` (existing movies dedupe on `name|watchedAt` and the local copy wins — so editing the same movie's rating/note on two devices is last-sync-wins; known limit).
- Local changes flush on a ~2.5 s timer + `visibilitychange`/`pagehide`. **Persistent tombstones** stop deleted shows resurrecting; re-adding/restoring/importing a show lifts its tombstone.
- **Settings and the TMDB key are never synced** (the cloud code never reads `settings`).
- **`resetAll()` ("Delete all data") clears THIS DEVICE only** (also removes this device's TMDB key); it writes no tombstones and does not touch Firestore, so when signed in the cloud copy may sync back. The UI says so.
- **Delete everywhere (signed in only; Settings → Danger zone)** wipes the whole account. Flow in `wipeLogic.runWipe`, wired in `cloudEngine.wipeEverywhere()` (lazy via `cloud.js`): (1) download a backup (Settings does this first), (2) list every show doc in Firestore (including ones this device never downloaded) and delete them, (3) in the **same atomic batch** as the last deletes (≤450 shows ride with it) set `users/{uid}/library/movies = { movies: [] }` and write the **marker** `users/{uid}/library/wipe = { id, at }`, (4) clear this device (`resetAll`, drain queues, `addTombstones`). Why the marker: shows are separate docs (deletes already reach other devices live) but **movies are one doc merged only at sign-in, and that merge ADDS** — an old device would push its movies straight back. Every device keeps `watchnext-sync-v1` = `{uid, lastSync, seenWipeId}`; on each pull, **before merging**, `wipeDecision` says `apply` (last synced before the wipe → `wipeLibrary()`, keeps that device's TMDB key), `record` (never synced with this account, or synced after the wipe → keep local data) or `ignore`. The marker listener starts only after the first pull; `lastSync` only advances after the first pull. No Firestore rules change needed (`users/{uid}/**` is already allowed). **Watched-map merge (`watchedMerge.js`, used at sign-in):** per episode, this device's copy wins UNLESS the cloud copy carries a more recent `fixedAt` (so fixing a date on the computer is not undone when an old phone copy meets the cloud later); the higher rewatch `n` is always kept. Live updates replace the whole `watched` map, as before.

**Known limits:** a device must have opened the *new* version at least once before a wipe (otherwise it has no `lastSync` and an old/cached copy will push data back); the marker's `at` uses the wiping device's clock; do not use other devices while a wipe of >450 shows is mid-flight. **Only tested with a fake cloud + an in-memory two-device simulation — see the to-do in §12.**

## 7. What exists now (feature summary)

- **Up Next:** Continue watching (one-tap mark next, Undo toast, double-tap guard, ≈finish estimates) + On the way (grouped agenda with month dividers, List/Calendar). Never offers an unaired episode.
- **Shows:** one funnel-icon **Filter** box; status tabs with **faceted counts** (they respect the platform/name filters and always sum); Platform and Sort chips (bottom sheet on phone, popover on desktop); asc/desc toggle; **Tools** menu (Sync/Refresh from TMDB, Detect platforms — never overrides your picks — with a progress card); **+ Add** opens a TMDB search dialog (live search, 350 ms debounce, stale responses ignored; results offer Open / Add / Add to watchlist, and *Open only* for tracked shows). Empty states: name-not-found (with "Search TMDB for …" shortcut), filters-match-nothing, brand-new library. Sorts: Title, Recently watched, Recently added, Progress, Rating (internal ids `Alphabetical`, `Recently watched`, `Recently added`, `Progress`, `Rating`).
- **Movies:** same filter bar; Sort Recent / A–Z / Rating; **+ Add** dialog (buttons "Watched it", "Add to watchlist", and for tracked films "Open"/"Log again"); detail sheet has rating, **Your thoughts**, platform, trailer, Fix match, Remove.
- **Show page:** summary rows with bottom sheets; seasons fold; cast & crew browsing (person → other titles, "In library" flags); **AniList** details (link/refresh/unlink, display-only; episode-count mismatches are noted, never applied); streaming in Australia; trailer; **episode notes & reactions** (§8).
- **Stats:** Overview (all-time hero, 4 tiles, Year in Review card with Share + Save image), Habits (streaks, full-width heatmap, de-skewed day-of-week, records), Rankings, Breakdown (per-year, platforms incl. Cinema, completion, genres).
- **Settings:** Sync (not configured / signed out / "Opening sign-in…" / signed in), TMDB key (with "Key saved" state), Import TV Time history, Clean up shows (leftovers; real confirm dialogs), **Backup + Restore from backup**, **Export for Power BI** (three CSVs: episodes, shows, movies), Danger zone (Delete all data on this device; **Delete everywhere** when signed in). Inline success/error **banner** (kept by owner's choice; scrolls into view). Native `confirm()`/`alert()` are no longer used anywhere in Settings.
- **Backup/Restore:** "Download backup" writes the app state **minus `settings.tmdbKey`** (`backupState`). "Restore from backup" is **additive**: it adds what's missing and never deletes or overwrites anything (your values win; the backup fills blanks, adds missing watched episodes/notes/movies); restored shows are marked for sync and tombstones lifted; the file's `settings` are ignored; hostile files (`__proto__`, junk types, 10k-char notes) are sanitised. Exact snapshot = Delete all data, then Restore. A TV Time export dropped in the Restore box (or a backup in the Import box) gets a clear message pointing to the right card.
- **Dropped & auto-resume:** show-page "⋯" menu → Drop this show / Resume watching; a "DROPPED" pill on the show page; marking anything on a dropped show resumes it with a "Resumed · Name · Undo" toast (6 s; Undo restores the original drop date). See §5.
- **CSV export (Settings → Export for Power BI):** `watchnext-episodes|shows|movies-<local date>.csv`. Episode rows carry `watched_at_utc` **and** `watched_date_local`/`watched_time_local` (device timezone — settles the UTC-vs-local question for Power BI), `is_bulk_import` (same minute rule as Stats, `BATCH_MIN`), show status, platform, genres, reaction and note. Text starting `= + - @` gets a leading apostrophe. The TMDB key is never included.
- **Year in Review:** the on-screen card and the saved PNG are the same design — big year + ▲/▼ delta (teal up, dim down), four stats in one row, **top 3 shows as big 2:3 posters across** with name + "N eps", busiest month / top genre, and the same faint warm→teal wash. The PNG is 1080×1350 (Instagram 4:5) with a "WatchNext" + URL footer.
- **What should I watch tonight? (Up Next → card under the title):** pick a time (20/30/45 min, 1 hr, 1 hr 30, 2 hr, 3 hr; default 45) and a mood (Surprise me, Make me laugh, Feel-good, Edge of my seat, Escape somewhere, Something thoughtful; each is a set of TMDB genre names in `MOODS`). It suggests 3 from: shows you're part-way through (Up Next "Continue watching", with an episode out), Watchlist shows not yet started (first episode), and planned movies. A show must fit at least one episode in the time (it says how many episodes fit, capped at 6 and at what's waiting; runtime = stored episode runtime, else the median of minutes you watched, else 40 min marked "~"); a film must fit whole (unknown film runtime = 105 min marked "runtime not stored"). Ranking: mood match (+40) > mid-way shows (+25, more if watched in the last 2 weeks) > new shows (+12) > films (+10); closer to filling your time scores higher; a show with 😍 reactions gets a small boost, 😂 more so for "Make me laugh"; a small deterministic jitter makes "Show me different ones" reshuffle (already-shown ones are skipped; when all have been shown it starts over with a note). If nothing matches the mood but something fits it is shown labelled "Closest fit, not a mood match"; films with unknown genres rank after real matches ("Genres not known yet") and their genres are fetched quietly when a mood is chosen. Optional "Only on my services" switch reuses the services filter (checks availability only for what fits the time). Dropped/finished shows, watched films and shows whose first season isn't out are never suggested. Choices are remembered per device in `watchnext-tonight-v1`.
- **On my services (Settings → My services; Watchlist; Shows tab):** tick the subscriptions you pay for (Netflix, Disney+, Prime Video, Max, Paramount+, Apple TV+, Hulu, Crunchyroll, Stan, Binge; kept on THIS device in `watchnext-services-v1`, not synced or backed up). A title is "on my services" if TMDB's Australian data says it streams on a ticked service OR is free to watch (free/ad-supported lists, and free names like ABC iview, SBS On Demand, 7plus, 9Now, 10 Play, Tubi, Plex, Pluto, YouTube) — free always counts; rent/buy does not. The **On my services** switch (own row under the Shows toolbar; under the Watchlist tabs) filters the whole page (list, status-tab counts, platform counts); rows/tiles then say where ("Netflix · Free: Tubi"). First switch-on with nothing ticked opens the picker. Titles not yet known are hidden until checked; checking is automatic and demand-driven (only what the page would show), ≤3 at a time, with "Checking availability… N left", "N titles couldn't be checked. Retry" (failed ones are not cached), "Add your TMDB key…" when there is no key, and "N titles have no TMDB link". Works on the Watchlist (shows + planned movies) and the Shows tab (library; Finished/Dropped included when visible); Movies tab not included. The show page now also lists free services (FREE tag) and no longer says "Not streaming in Australia" for a free-only title. Caveat: this uses TMDB/JustWatch data and can be wrong or out of date; the show page's Refresh re-checks one title.
- **Backup reminder (Settings, top):** a gentle amber banner "It's been N days since your last backup" with **Download backup** / **Remind me later** (snoozes 7 days). A *backup* = downloading the backup file from THIS device (the banner button, the Backup card button, and the automatic one before Delete everywhere; CSV exports do not count). Shown when the library is non-empty, not snoozed, and either last backup ≥30 whole days ago **and the library changed since** (fingerprint = shows + watched episodes + movies stored at backup time), or never backed up and this device has had the library ≥7 days (baseline `since` is stamped the first time Settings sees a non-empty library). The record lives in its own localStorage key `watchnext-backup-v1` `{lastAt, lastCount, since, snoozedUntil}`: per device, never synced, never inside the backup file. The Backup card always shows "Last backup: 12 Sep 2026 (22 days ago)" / "No backup downloaded from this device yet."
- **Fix watch dates (show page ⋯ menu, shown when the show has watched episodes):** pick which episodes (All / one season / "Marked on <day>" for days where ≥3 were marked together — that is how a bulk-marked show looks), pick a real past date, see "N episodes will be dated …", Apply → toast "Updated N episodes to <date> · Undo" (8 s). It replaces the finish/resumed toasts while shown.
- **"When did you watch it?" (tap *Mark season watched*):** a sheet with **Just now** (default, focused; identical to the old behaviour) or a date ("Use this date"; future dates refused). Only that button asks — ticking one episode, the big "Mark next" button and "Unmark season" are unchanged.
- **Month in review (Stats → Overview, directly under Year in review):** the same card for one calendar month (picker of every month with activity, newest first; the current month is labelled "so far"; delta vs the previous month; "Busiest day" instead of "Busiest month"). **Months use the device's LOCAL dates** (an 8am watch on 1 Oct counts as October) — unlike the rest of Stats, which groups by the stored UTC date; the totals can differ from Year-in-Review near a month boundary (open backlog decision about UTC vs local). Saved as `watchnext-YYYY-MM.png`, Share sends text.
- **"You finished <show>" card:** offered (a) by a "Share your “You finished” card" button on the show page whenever the show is finished, and (b) as a "You finished X! · Make card" toast (9 s) right after the final episode is marked on this page (episode tick, big "Mark next" button or "Mark season watched"). *Finished* = every TMDB-listed episode watched AND status not Returning Series / In Production / Planned / Pilot (a returning show you're caught up on is NOT finished). The card: big title (1–2 lines, auto-sized), a poster that grows to 600–720px tall, episodes / hours / days, your star rating, and "Started … · Finished …". **Start date and "days" are hidden when this show's watches fall in a bulk-stamped minute** (same ≥`BATCH_MIN` rule as Stats), because they'd be import artefacts; the finish date is always the last real watch. Share sends the PNG file via the Web Share API where the browser allows it (phones), otherwise the text. A finish toast replaces the "Resumed" toast if both would show.
- **Most rewatched (Stats → Rankings):** "Most rewatched shows" and "Most rewatched movies", up to 8 each, all-time, shown as `12×` (viewings after the first); sections are absent when nothing was rewatched.
- **Your notes (Stats → "Notes" button next to the title):** a page listing every episode note/reaction and every movie viewing note/reaction, newest first, with a search box (words in the note, show/movie name, reaction label/emoji, and **exact** episode codes `s1e5`/`S01E05`/`1x5`), an All/Episodes/Movies switch, six reaction chips plus **Words only** (a note with no emoji), faceted counts, 50 rows at a time. Episode rows open the show; movie rows are display-only. The page is rendered by **App** (not Stats) with a `notesMemo` ref, so opening a show and pressing Back restores the search, chips and scroll; opening it fresh from Stats starts clean; any bottom tab leaves it.
- **Most loved shows (Stats → Rankings, left column):** episode reactions only; each 😍 counts 2, each 😂 counts 1 (`LOVE_WEIGHT`/`FUNNY_WEIGHT`); rows show the 😍/😂 counts; ties break on more 😍 then name.
- **Platforms** (one row each in `PlatformPicker.jsx`): Netflix, Disney+, Prime Video, Max, Apple TV+, Hulu, Crunchyroll, Stan, Binge, ABC iview, YouTube, **Cinema** (#F5C518, manual only, never auto-detected), Other.

## 8. Notes & reactions (newest feature)

Six reactions — Loved it 😍, Funny 😂, Shocked 😱, Sad 😢, Angry 😡, Bored 😴 — plus an optional note ≤ **280** chars (`NOTE_MAX`). Episodes: a speech-bubble button on each **watched** episode (or any episode that has a note) opens `NoteSheet`; rows show the emoji (amber bubble if text-only). Movies: "Your thoughts" inline in the detail sheet. Save is explicit; × / Escape discards; tapping the chosen reaction again clears it; Remove deletes the note (and the whole `notes` property when it was the last). The text box is clamped in `onChange` too (`maxLength` only limits typing/pasting). Restore and cloud merge carry notes.

## 9. Pending / unverified

- **May not be committed yet (owner applies files via GitHub Desktop): ** Year-in-Review image + card, Dropped status, CSV export, auto-resume, Delete everywhere, Most rewatched. Run `git status` first and don't regenerate shared files (`db.js`, `ui.css`, `Settings.jsx`, `ShowDetail.jsx`, `Stats.jsx`) from an older copy — several of this session's features edit them.
- **Never run against real services (mocked only):** Google sign-in; **Delete everywhere against real Firestore (to-do §12)**; cross-device sync of the `dropped` flag, notes and restored data; the saved Year-in-Review PNG with real TMDB artwork on iPhone Safari (`ctx.letterSpacing` needs Safari 16.4+); the three CSVs opened in Power BI; real clipboard on a phone; mouse-hover styles; colour emoji; restoring a genuine backup of his 250-show library. (Real posters in the new on-screen tiles: he has confirmed they look right live.)
- **Resolved:** the faint warm→teal gradient on the Year-in-Review card is real CSS (`.sd-yir` in `ui.css`, two radial glows) — the earlier handover note saying the card was flat was wrong. The saved PNG now draws the same glows (`GLOWS` in `yearImageLogic.js`, unit-tested against the CSS).

## 10. How to make & ship a change (assistant workflow that works)

1. **Always start from the freshest repo.** `git clone --depth 20 https://github.com/AceAsif/watchnext.git` into the sandbox (the repo has been edited by other sessions — e.g. a Claude Code web session on branch `claude/determined-hamilton-*` redesigned Movies/Watchlist and added `LibraryUI.jsx`). Diff against your working copy; the **repo is the source of truth.**
2. Build with a placeholder `.env` (`VITE_FIREBASE_API_KEY=placeholder_key_for_build_test`, `VITE_FIREBASE_AUTH_DOMAIN`, `…PROJECT_ID`, `…STORAGE_BUCKET`, `…MESSAGING_SENDER_ID`, `…APP_ID`); `npm run build` must pass and still show a separate ~440 kB `cloudEngine` chunk. Delete `.env` afterwards. Symlink `node_modules` from any installed copy.
3. Put new decisions into **pure functions** (`*Logic.js` / `store/*.js`) and unit-test them with plain node; use browser tests for behaviour/layout (harness in the zip).
4. **Deliver only files that differ from the owner's current repo** (`diff -rq <fresh clone>/src <work copy>/src`), mirror their folder paths under `/mnt/user-data/outputs/`, call `present_files`, and give the folder table + commit message.
5. Stale-state trap: never overwrite `ui.css`/other shared files with an older copy.

## 11. Testing harness (in `watchnext-test-harness.zip`)

~200 unit tests (plain node, import from `/home/claude/wl/src/...`) and ~360 browser checks (puppeteer-core + @sparticuz/chromium, headless; fonts stubbed from `fonts.css`; TMDB mocked; date shim pinned to 2026-10-01T22:00Z = Hobart morning 2 Oct; `emulateTimezone('Australia/Hobart')`). See the README inside the zip for setup and the paths each script expects. The Shows/Movies suite also does **parity testing against a baseline build** of the old pages (`wl-base-dist`), which is how "same ordered titles as before" was proven; reuse that technique when redesigning an existing screen. Counts at last run: unit 201; browser — library 119, settings 47, restore 24, notes 35, anime 35, upnext 44, desktop/layout 55 (+ show-page harness), all passing.

**Suites added in v5:** unit — `yearimage` (24), `dropped_csv` (28), `wipe` (23, includes an in-memory two-device simulation), `resume_db` (11, loads the real `db.js` with a localStorage shim), `rewatch` (14), `notes_search` (19), `month_recap` (14), `finish_card` (21), `watchdates` (22), `backup_nudge` (14), `services` (16), `providers_db` (7), `tonight` (23), `movie_genres_db` (6); browser — `yearimage` (25), `dropped_csv` (25), `rewatch` (8), `notes_search` (22), `recaps` (20), `watchdates` (21), `backup_nudge` (21), `services` (34), `tonight` (27), `wipe_resume` (33). `wipe_resume` needs a **second, test-only build** where `src/store/cloud.js` is swapped for a fake signed-in `fakecloud.js` via a temporary `vite.fake.config.js` alias (steps in `wipe_resume.README.md`); delete the temp config afterwards, never commit it. Headless Chromium can't sign in to Google, so signed-in UI can only be tested this way.

**Gotchas learned the hard way (don't repeat):**
- A global `input[type='text']` rule in `styles.css` gives every input a border/padding/background; scope inputs inside custom fields with `.x input[type='text']` (higher specificity) or you get a double border.
- `flex: 1` in a **column** flex container collapses a fixed `height` (the TMDB key box became a sliver on phones). Use `flex: 1 1 auto; min-height`.
- Date loops that add `86,400,000` ms break on DST days (the old heatmap duplicated 5 Apr and skipped 4 Oct in Hobart). Use calendar arithmetic (`new Date(y, 0, n)`).
- Puppeteer clicks by screen coordinates; elements behind the **fixed bottom tab bar** get the tab bar clicked instead. Click via `el.click()` in `evaluate`. For React-controlled inputs set the value with the native setter + `input` event. `innerText` applies CSS `text-transform` (use `textContent`).
- Test your own tests: no placeholder `ok(…, () => {})` assertions; derive expectations from data instead of hard-coding counts that random seeds can change.
- `Sheet` focus restore needs the trigger recorded **during render** (autofocused children grab focus before effects run).
- The "old file" trap: restoring/regenerating shared files from an earlier download silently reverts other sessions' work.
- The service worker intercepts image requests, which **bypasses puppeteer request interception** (mock posters never arrive and the real network answers 403). Call `page.setBypassServiceWorker(true)`. The app's export cache-busts posters with `?cors=1`, so the SW cache never collides with the card's `<img>`.
- `Sheet` attaches its Escape handler once, so the `onClose` it holds goes **stale**. A dialog that must not close while busy needs a ref (`busyRef.current`), not `busy ? noop : onCancel` (this was a real bug caught by the Delete-everywhere browser test).
- A feature that completes something can trip an OLDER test that assumed "no toast": the "You finished" prompt appeared in the auto-resume test because "Mark season watched" finished that ended show. Assert on the specific toast (e.g. no *Resumed* toast), not on "no toast at all".
- Changing what a button does breaks older tests that click it: "Mark season watched" now opens the "When?" sheet, so tests must answer it (`Just now`).
- Two taps before a re-render can overwrite each other when the new value is computed from a render's copy (the services ticks lost the first tap): compute from the latest saved value (`toggleMyService`). Also: a `useEffect` that must re-run on Retry needs the retry counter in its deps (Retry silently did nothing).
- A pure module can't import a `.jsx` file in node tests: when UI-file code is needed by pure logic, extract it (`platformsData.js`).
- Cached values arrive through sync, so guard `for…of` over cached lists with `Array.isArray` (a corrupt `providersFree: 7` would crash the page).
- Mutation-test new logic: deliberately break the code (floor→ceil, flip a ranking, remove a guard) and confirm a test fails. It found a missing fixture (a dropped show on the Watchlist) that 22 green tests had missed.
- When a browser test contradicts the design (e.g. "Another" wraps around instead of disabling), fix the TEST, not the app, after checking the design is what the owner wanted.
- Substring search on identifiers is a trap: "s1e5" matched S1E50–S1E59. Episode codes are matched exactly in `notesSearchLogic.js` (caught by the browser test, now unit-tested).
- Never put a stray `cat > /dev/null` (or any stdin-reading command) in a sandbox command: it waits forever and the call times out.
- `innerText` is uppercased by CSS `text-transform` for section titles (use a case-insensitive regex or `textContent`).

## 12. Backlog & owner to-do (owner decisions in **bold**)

### Owner to-do — things **he** will do himself
1. **Verify Delete everywhere against REAL Firebase using a throwaway Google account** (never use his real account first). It has only been tested with a fake cloud and an in-memory simulation. Checklist:
   - [ ] Create a second Google account; sign in with it on two devices (e.g. phone + computer). **Open the new version on both devices at least once before testing** (a device with no `lastSync` can't react to a wipe).
   - [ ] On device A add a few shows and 2 movies; confirm they appear on device B.
   - [ ] On A: Settings → Danger zone → **Delete everywhere** → type DELETE. Expect: a backup `.json` downloads *first*, a success banner ("Everything was deleted: N shows and all movies…"), A is empty, the TMDB key box is cleared.
   - [ ] On B (left open): the shows disappear live and the movies clear without pushing anything back. Reload B to confirm it stays empty.
   - [ ] **Offline test:** put B in airplane mode, add a movie on B, wipe on A, bring B back online → B must clear itself and the movie must NOT reappear on A.
   - [ ] Firebase console → Firestore: `users/{uid}/shows` is empty, `library/movies` has `movies: []`, `library/wipe` exists with `{id, at}`.
   - [ ] A brand-new third device signing in afterwards keeps its own local data (it was never synced with the account).
   - [ ] On A: Settings → **Restore from backup** with the downloaded file → everything returns and syncs to B.
   - [ ] Failure path: turn the network off right before confirming → error banner mentions the backup, data untouched.
   - [ ] Only then consider it for the real account — and keep the downloaded backup file somewhere safe.
2. **What should I watch tonight?:** open it from Up Next with your real library at a few times and moods; check the suggestions feel right (runtimes, moods, "Show me different ones"); notice whether planned movies get genres after you pick a mood (they are fetched once and saved).
3. **On my services (real TMDB):** tick your real services in Settings, switch the filter on in the Watchlist and the Shows tab, and spot-check a few titles against the Netflix/Stan/etc. apps (TMDB/JustWatch data can be wrong). Watch the first run on the Shows tab: a big library is checked a few titles at a time and the status line counts down. Confirm "Detect platforms" and the show page's Refresh still work and now also store free lists.
4. **Backup reminder:** make a real backup and check the Backup card says "Last backup: today"; in about a month (or by editing `watchnext-backup-v1` in the browser's storage) confirm the banner appears and "Remind me later" hides it.
5. **Fix the real history:** use Show ⋯ → Fix watch dates… on shows that were logged in bulk (e.g. DAHMER → 2022/2023, The Mind of Jake Paul → 2018); check July 2026 on Stats → Month in review afterwards. Look at other months' "Busiest day" for suspiciously big counts (18 episodes on one day was the giveaway). **Two-device test:** fix a date on the computer, open the phone afterwards, confirm the phone does not revert it.
6. **Real-device pass** for the other new features: auto-resume toast + Undo on iPhone; saved Year-in-Review PNG on iPhone Safari (and the Stats card with real posters); the three CSV downloads on iPhone; load the CSVs into Power BI (set the date columns to Date type); the `dropped` flag syncing between two devices; Rankings → Most rewatched and Most loved shows with the real library; Stats → Notes with his real notes (search, chips, open a show, Back); Month in review (save/share on iPhone; check a month boundary against what he remembers watching); the "You finished" card with a real finished show (poster, dates, stars) and the toast after marking a real final episode.

### Done in v5 (for reference)
Year-in-Review saved image + poster-grid card · Dropped status · CSV export · auto-resume (with Undo) · Delete everywhere (code + tests; **real-account verification still open**, see above) · Most rewatched · Notes search + Most loved shows · Month in review + "You finished" card · Fix watch dates + "When did you watch it?" · Backup reminder · On my services filter · What should I watch tonight?.

### Remaining backlog
1. **Stats day attribution: UTC vs local** (open decision; changes history). The CSV exposes both columns, and **Month in review already uses local dates**, so a switch for the rest of Stats would make everything consistent.
2. Backup & the TMDB key: key stays **out** of backups; revisit only if he pastes a key in Settings and wants it kept.
3. Ideas he has seen (none chosen yet): **a movie version of "tonight" built on Discover** (he asked for it next) · watch goals · monthly recap image · calendar export (.ics) · more stats (genre trends, longest binge, time of day) · taste-weighted Discover · Random pick on Watchlist · Letterboxd/Trakt import · AniList list import/sync · new-episode push notifications (needs FCM + a scheduled job) · shared watchlist · custom lists · tablet layout (phone column under 900px) · **rewatches as dated history** (changes the `watched` shape + cloud merge; would let Most rewatched split by year).
4. A Power BI starter guide (the three tables and how to relate them, DAX measures such as hours per month / completion % / binge days, a dashboard layout) was offered, not built.
5. Idea: a gentle nudge on Month/Year in review when many episodes were marked together on one day ("18 episodes were marked on 7 Jul — fix their dates?"). Not built; a day-cluster scope already exists in the fix sheet.
6. Cleanups: delete unused `PosterCard.jsx`; stale text/comments.

---

## NEXT ACTION

None queued. Suggested next feature: **"What should I watch tonight?"**. Propose the plan (inputs, ranking rule, where it lives) and ask the owner before building. Remember the working rules in §0 (folder for every file, commit message, Fetch/Pull first, honest about what is only mock-tested).

---

### First message to paste into the new chat

> Assalamualaikum. I'm attaching `WatchNext-Handover-v5.md` and `watchnext-test-harness.zip`. Please read the handover, clone my repo fresh (`AceAsif/watchnext`), tell me in 5 lines what you understand, check with `git log`/`git status` whether the v5 features (Year-in-Review image, Dropped, CSV, auto-resume, Delete everywhere, Most rewatched) are already committed, then propose the plan for the next feature before building.
