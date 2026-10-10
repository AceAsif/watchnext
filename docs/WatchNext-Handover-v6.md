# WatchNext — Developer Handover (v6)

Paste this whole file into a new chat and attach `watchnext-harness-for-repo.zip` to bring an assistant fully up to speed, then ask it to build the next thing. **This replaces v5** (v5 had grown by patching; v6 is rewritten from the real current state, October 2026).

**State of the repo when this was written:** every feature in §7 is built and tested. Everything up to and including *Movie night* was committed and deployed (green). **Watch goals** and the **reorganised test harness** were delivered last; they may not be committed yet, so the new assistant must check `git log` / `git status` (see §15). Nothing in the app is known to be broken.

---

## 0. How to work with this owner (read first)

- **Greeting.** Open the conversation with **"Assalamualaikum"**; if he greets you, reply **"Wa alaikum salam"** (that exact spelling). English only; Bengali/Arabic Islamic phrases are welcome ("dhonnobad", "Jazakallahu khairan"). When drafting messages for friends or elders: English or Bengali only, never Hindi/Urdu.
- **Every code delivery must say which folder each file goes in, list NEW files separately (so none is forgotten), and end with a git commit message** (summary line + short bullets). He copies files into his repo, commits with GitHub Desktop and pushes; deploy is automatic.
- **Tell him to Fetch/Pull first, to copy the whole `src/` folder when several files changed, and to run `npm run build` locally before pushing** (GitHub Desktop doesn't check that the app builds; one missed new file once broke a deploy). Before delivering, verify every relative import in the delivered `src/` resolves (a small script does it), and compare against the fresh clone.
- **Be honest about what is and isn't verified.** He values: owning mistakes plainly, saying what was only tested against mocks, and flagging risky decisions before making them. Never claim real-world behaviour you could only simulate.
- **Ask before big or irreversible things, and for real design choices.** The pattern that works: explore the code first, then ask 2–3 short tappable questions (where it lives, what it counts, sync or not), then build. Don't ask about things you can decide and state. He answers quickly.
- He has limited usage budget on some days: no long preambles, don't re-run suites that can't be affected, but DO run every suite after a feature (§9).
- He often sends screenshots of the live site and GitHub pages; use them.
- He edits the repo from more than one place; always start from a fresh clone (§10).

## 1. What WatchNext is

A personal TV-and-movie tracker, a self-hosted replacement for TV Time (shut down 15 July 2026). Single-user, privacy-first: no accounts needed, no ads, no backend of its own. Data lives in the browser (localStorage) and optionally syncs to the owner's private Firebase/Firestore. Two friends also use it locally with their own data (no Firebase).

- **Live:** https://aceasif.github.io/watchnext/ · **Repo:** https://github.com/AceAsif/watchnext (public)
- **Owner:** Asif, Hobart, Tasmania (**AU region**, timezone Australia/Hobart, UTC+10/+11 with DST). Library: ~250 shows, ~410 movies, 8,500+ episode watches, very anime-heavy. He uses an iPhone and a Windows computer (repo at `D:\IT Project - Personal\watchnext`).

## 2. Tech stack

- **React 18 + Vite.** No router (navigation is local state in `App.jsx`: a `tab` string, an optional open show id, a `searching` boolean, plus `notesOpen` for the Notes page). No TypeScript, no test framework in the repo, no state library, no UI libraries. **Plain CSS.**
- **TMDB v3** for metadata (`api_key` query param). Key from `getState().settings.tmdbKey` **or** build-time env `VITE_TMDB_API_KEY` (his deployment likely bakes it in via the `ENV_FILE` secret, so it is visible in the public JS; the README acknowledges this).
- **AniList GraphQL** (read-only, no OAuth) for anime details.
- **Firebase Auth (Google) + Firestore**, code-split into a lazy ~440 kB chunk (§6). localStorage is the source of truth.
- **PWA** (`public/sw.js`, self-updating). **Deploy:** GitHub Actions builds with the `ENV_FILE` secret and deploys to gh-pages on every push to `main`. There must be exactly **one** deploy workflow in `.github/workflows/` (a duplicate once produced a red run).

## 3. Design system

Dark theme; amber accent (`--amber` ≈ #f2a33c), teal (`--teal` ≈ #56c8b5) for "done/ok", red (`--red` ≈ #e5695e) for destructive. Fonts: Bricolage Grotesque (`--font-display`), Inter (`--font-body`), IBM Plex Mono (`--font-mono`, labels/codes). Corner radius ~12–14px. **44px minimum touch targets.** Tokens live in `:root` in `src/styles.css`; **all redesigned UI is in `src/components/ui.css` under the `sd-*` class prefix** (appended in sections; it is a large shared file, never regenerate it from an old copy).

- Phone: `.sd-page` single column capped at 560px. **Desktop ≥ 900px:** wider layouts (two-column Up Next/Show page/Stats; Settings a centred 640px column; Shows/Movies an auto-fill grid).
- `Sheet` (`ui.jsx`) = **bottom sheet on phone, centred dialog on desktop**; props `open, title, subtitle, action, onClose, variant, role`; it has a default "Done" button, restores focus to the trigger, and its Escape handler is attached ONCE (see the stale-`onClose` gotcha in §9).
- Common bits: `.sd-lbl` mono-caps labels, `.sd-card`, `.sd-btn` (+ `primary`, `sm`), `.sd-nchip` pill chips, `.sd-toast` (one toast at a time; fixed above the tab bar), `.sd-chipbtn`/`.sd-svctoggle` switches, `Bar` (value 0–100).
- The owner designs in Claude Design and sometimes uploads exported `WatchNext_redesign*.html` boards (bundle format: `__bundler/manifest`, `page_order`, gzip'd boards with a JSON `__bundler/template`). Design copy is sometimes invented; check it against the real code.

## 4. Project structure (current)

```
src/
  main.jsx, App.jsx           shell: header + bottom tab nav (Up Next, Shows, Movies, Watchlist, Stats, Settings),
                              show-detail routing, Search overlay, Notes page (App-level so Back restores it)
  styles.css, components/ui.css
  firebaseConfig.js, firebase.js      (firebase.js is ONLY imported by store/cloudEngine.js)
  api/        tmdb.js (client + hasKey, img, 429 backoff, watchProviders, discoverMovies, movieProviderList, ...)
              anilist.js
  store/
    db.js                     localStorage store + ALL mutations + derived helpers (§5)
    cloud.js                  firebase-free facade (dynamic import of the engine)
    cloudEngine.js            real Firebase sync (§6)
    useStore.js, servicesPrefs.js (per-device "my services" prefs store)
    PURE modules (unit-tested in plain node): notes.js, backupMerge.js, watchedMerge.js, wipeLogic.js
  pages/      UpNext, Shows, ShowDetail, Movies, Watchlist, Stats, Settings, Search, Notes
  components/
    ui.jsx, LibraryBar.jsx, LibraryUI.jsx, StatsUI.jsx, Heatmap.jsx, SettingsCards.jsx, NoteEditor.jsx,
    CastCrew.jsx, AnimeSheet.jsx, AgendaEpisode.jsx, CalendarGrid.jsx, Discover.jsx, Stars.jsx, PlatformPicker.jsx
    share cards:   RecapSection.jsx (period card UI), YearInReview.jsx, MonthInReview.jsx, FinishCardSheet.jsx,
                   yearImageLogic.js / yearImageRender.js (1080x1350 PNG plan + canvas), finishCardLogic.js / finishCardRender.js,
                   cardKit.js (shared canvas bits), shareImage.js (load/save/share helpers)
    sheets/cards:  TonightSheet.jsx, MovieNightSheet.jsx, GoalsCard.jsx, GoalSheet.jsx, WatchDateSheets.jsx, ServicesUI.jsx
    hooks:         useAvailability.js (background streaming-availability checks)
    PURE logic (unit-tested): showLogic, creditsLogic, animeLogic, upnextLogic, statsLogic, libraryLogic, settingsLogic,
                   csvExport, rewatchLogic, notesSearchLogic, monthRecapLogic, watchDatesLogic, backupNudgeLogic,
                   platformsData, servicesLogic, tonightLogic, movieNightLogic, goalsLogic
tools/convert_tvtime.py       one-off TV Time converter
.github/workflows/deploy.yml  builds with ENV_FILE secret -> gh-pages
firestore.rules               each user reads/writes only users/{uid}/** (no rules change was ever needed for new docs)
tests/unit/*.test.mjs         harness (§9)         shot/browser/*.mjs  harness (§9)         docs/  handover + screenshots
```

## 5. Data model & key store rules (`store/db.js`)

```js
{
  shows: { "tmdb:678": {                         // key "tmdb:ID" or "tvdb:ID"
      tvdbId, tmdbId, name, followed,            // followed = in the library
      watchlist,                                 // plan-to-watch (library beats watchlist)
      dropped, droppedAt,                        // explicit true/false and ISO|null (never undefined)
      rating, ratedAt, platform,                 // platform = PlatformPicker id (incl. 'cinema')
      watched: { "2x11": { at, min, n, fixedAt? } },   // n = watch count (rewatches); fixedAt = date set by hand
      notes: { "1x2": { react, text, at } },     // episode notes/reactions (separate map: un-marking keeps them)
      providers, providersFree, providersLink, providersSynced,   // AU streaming cache (§7 services)
      upcoming, upcomingSynced, poster, backdrop, status, totalEpisodes, genres, seasons:[{n,count,air}],
      runtimeMin, nextAir, lastSynced, addedAt,
      anime: { id, malId, ... } | null           // AniList snapshot; null on unlink
  } },
  movies: [ { tmdbId, name, status:'watched'|'planned', watchedAt, rating, ratedAt, platform, runtimeMin, poster, year,
              genres, react, note, providers, providersFree, providersLink, providersSynced } ],  // planned ones cache availability
  goals: { "2026": { episodes?, movies?, hours?, at } },     // yearly goals; at = last change (§7)
  settings: { tmdbKey }
}
```
- **localStorage keys:** `watchnext-state-v1` (the library), `watchnext-tombstones-v1` (deleted show ids), `watchnext-sync-v1` (per-account sync record: `lastSync`, `seenWipeId`), and per-device prefs that are NOT in the library, NOT synced and NOT in backups: `watchnext-backup-v1` (backup reminder), `watchnext-services-v1` (my services + the two filter switches), `watchnext-tonight-v1`, `watchnext-movienight-v1`.
- **Rules that bite:** `update()` hands out fresh `shows`/`movies` container references each call (load-bearing for memoised views; a mutator that changes `goals` must assign a NEW object). **Never write `undefined` to state** (Firestore rejects it): remove the key or use explicit `null`/`''`. `epKey(s,e)` = `"SxE"`.
- **Dates:** "today" = the **local** date (`localISODate()` in `showLogic.js`), never `toISOString().slice(0,10)`. Episode watches are stamped with the moment they are marked (`at`). **Stats attribute a watch to its UTC date** (Year in Review, streaks, heatmap, Goals); **Month in review and the CSV use LOCAL dates**. This inconsistency is a known, open decision (§13).
- **De-skew:** a minute bucket with ≥ `BATCH_MIN` (15) watches is one bulk-import event (used in Habits, pace estimates and the "You finished" start date). `BATCH_MIN` in `statsLogic.js` must equal `PACE_BATCH_MIN` in `db.js` (a unit test checks).
- **Mutators** (non-exhaustive): `markEpisode`, `markSeason(id, season, eps, watched, at?)`, `logEpisodeRewatch`, `setShowRating`, `setShowPlatform`, `setShowAnime`, `setShowDropped(id, dropped, at?)`, `setEpisodeNote`, `setMovieNote/Rating/Platform`, `setWatchDates` / `restoreWatchDates` (date fixes with Undo), `setShowProviders`, `setMovieProviders`, `setMovieGenres`, `setYearGoal`, `applyRemoteGoals`, `addShowFromTmdb`, `addShowToWatchlist`, `addMovieWatched`, `addMovieToWatchlist`, `markPlannedMovieWatched`, `deleteShow` (tombstone), `importTvTime`, `restoreBackup`, `resetAll`, `wipeLibrary`. Marking watched on a dropped show auto-resumes it.

## 6. Cloud sync

- `cloud.js` is a firebase-free facade; the real engine `cloudEngine.js` is loaded by `import()`. **Never statically import firebase or `firebase.js` from eagerly-loaded code** (it undoes the ~230 kB main / ~440 kB lazy split; the build must still show a separate ~440 kB `cloudEngine` chunk). Small PURE modules may be imported into the engine.
- **Firestore layout:** `users/{uid}/shows/{id}` (one doc per show), `users/{uid}/library/movies` (ONE doc), `users/{uid}/library/goals` (`{ goals }`), `users/{uid}/library/hidden` (`{ hidden }`, Discover's "Not interested"; merged like goals: the newest change PER TITLE wins, and "Show again" keeps the entry as `on:false` so the undo syncs), `users/{uid}/library/wipe` (`{ id, at }` marker). Local changes flush on a ~2.5 s timer and on `visibilitychange`/`pagehide`; dirty flags per show, movies, goals and hidden.
- **Merge at sign-in (`pullAndMerge`)**, in this order: (1) check the wipe marker FIRST and apply it if this device last synced before it; (2) shows: other fields `{...remote, ...local}`; **`watched` merged by `watchedMerge.js`** (this device's copy wins unless the cloud copy was corrected more recently via `fixedAt`; the higher rewatch `n` is always kept); notes = union (yours win per episode); tombstoned ids are not merged back; (3) movies: union deduped on `name|watchedAt`, local wins; (4) **goals: per YEAR the most recently changed (`at`) copy wins** (ties: this device); the device pushes whatever is newer than the cloud.
- **Live updates:** a shows listener replaces a show with the cloud doc; a wipe-marker listener and a **goals listener** start only after the first pull (a goals update first re-checks for a wipe marker, so it can't push old goals back after "Delete everywhere"). Movies have no live listener (merged at sign-in only).
- **Settings and the TMDB key are never synced.** Tombstones persist so deletes can't be resurrected.
- **"Delete all data"** clears THIS DEVICE only (also the TMDB key). **"Delete everywhere"** (signed in only) wipes the account: backup downloads first, then every show doc is deleted and, in the SAME atomic batch as the last ≤450 deletes, `library/movies = []`, `library/goals = {}`, `library/hidden = {}` and the wipe marker are written; this device is cleared; other devices clear themselves on their next sync via the marker (a device that never synced with the account is left alone). **Known limits:** a device must have opened a version that records `lastSync` before a wipe; the marker time uses the wiping device's clock.
- **Verified against REAL Firebase on 8–9 Oct 2026** (throwaway Google account, three browsers as three devices; see §11 item 1 for what passed). The automated tests still use fakes (a fake cloud module for the UI, pure-function tests and in-memory multi-device simulations). **One real bug was found and FIXED (9 Oct 2026):** *Delete everywhere* used to leave plain tombstones for the wiped show ids on the device that ran it, so a backup restored on a DIFFERENT device was treated as stale: the wiping device dropped the restored shows and re-queued their cloud delete, and they vanished from the cloud and every device (movies were unaffected). Now the wiper keeps **wipe tombstones** (`watchnext-wipe-tombstones-v1`, `{ id: wipeTimeIso }`, `db.js`) and every device remembers the time of the last wipe it has seen (`seenWipeAt` in the sync record, set from the marker). Each show doc a device uploads after seeing a wipe carries a cloud-only `_wipeAt` stamp (added in `flush`, stripped on read by `splitCloudShow`, never in local state, backups or CSVs). A wipe tombstone blocks a cloud doc unless its stamp is the same wipe or newer (`blockedByWipe`, `wipeLogic.js`): a STALE device that never heard of the wipe has no or an older stamp and is still refused (and its zombie doc is deleted via `queueShowDelete`, which adds no permanent tombstone), a deliberate restore or re-add from a device that HAS seen the wipe is accepted and lifts the tombstone. Normal tombstones (a show you deleted yourself) are unchanged and always block, so deleting a show on one device and re-adding the SAME show on another is still undone by the deleting device (known limit).

## 7. Features (what exists, with the decisions the owner made)

**Up Next.** *Continue watching* (one-tap mark next with Undo toast, double-tap guard, ≈finish estimates) and *On the way* (agenda with month dividers, List/Calendar); never offers an unaired episode; Dropped shows are hidden. A card **"What should I watch tonight?"** (below).

**What should I watch tonight?** (card on Up Next → sheet). Pick a time (20/30/45 min, 1 hr, 1 hr 30, 2 hr, 3 hr; default 45) and a mood (Surprise me, Make me laugh, Feel-good, Edge of my seat, Escape somewhere, Something thoughtful; each = a set of TMDB genre names). 3 suggestions from: shows you're part-way through, Watchlist shows not started, planned movies. A show must fit ≥1 episode (says how many, capped at 6 and at what's waiting); a film must fit whole. Runtime = stored episode runtime, else the median minutes you watched, else 40 ("~"); unknown film runtime = 105 ("runtime not stored"). Ranking: mood match > mid-way shows (more if watched in the last 2 weeks) > new shows > films; closer to filling the time scores higher; 😍/😂 reactions add a small boost; deterministic jitter makes "Show me different ones" reshuffle (never repeats until all shown, then starts over). Nothing matching the mood but something fitting → shown as "Closest fit". Films without genres rank after real matches ("Genres not known yet") and their genres are fetched quietly when a mood is chosen. Optional "Only on my services". Remembered per device.

**Shows.** One Filter box with a **Status** menu beside it (All, Watching, Finished, Not started, Dropped*, each with its faceted count; the chip reads "Status" on All, else e.g. "Dropped 5"; Oct 2026: replaced the row of tabs, which ran out of room once Dropped appeared and hid All); Platform/Sort chips; asc/desc; Tools menu ("Sync N new with TMDB" / "Refresh all from TMDB", and Detect platforms, which never overrides your picks; "Clean up shows" lives in Settings); **On my services** switch row; + Add dialog. (*Dropped tab only when something is dropped.)

**Show page.** Summary rows with bottom sheets; seasons/episodes (episode notes buttons); cast & crew (person → other titles, "In library" flags); AniList (link/refresh/unlink, display-only); streaming in Australia (subscription list + FREE list); trailer; ⋯ menu: **Drop / Resume watching**, **Fix watch dates…**; "DROPPED" pill; **Mark season watched** asks "When did you watch it?"; the "You finished" button/toast.

**Movies.** Same filter bar; Sort Recent / A–Z / Rating; Add dialog (Watched it / Add to watchlist / Open / Log again); detail sheet (rating, Your thoughts, platform, trailer, Fix match, Remove).

**Watchlist.** *Queue* (shows + planned movies; **On my services** switch) and *Discover* (Netflix-style rows from a taste profile, see below) with a **Movie night** button at the top.

- **Discover (taste-weighted, Oct 2026).** Code: `components/tasteLogic.js` (pure rules), `discoverEngine.js` (pipeline; TMDB passed in as `api`), `hiddenLogic.js` ("Not interested"), `Discover.jsx`. (1) *Engagement* per library title: a rating decides first (5★ 1.2 · 4★ 0.6 · 3★ 0 · 2★ −0.6 · 1★ −1.2); otherwise finished/caught-up 0.8, watching 0.2–0.7 by progress, **dropped after ≤2 episodes −0.8, dropped after ≥50 % or ≥20 episodes +0.4** (e.g. 13 Reasons Why after 2 seasons still counts as liked), watched movie 0.5, watchlist 0.25, "Not interested" −0.5; multiplied by recency (half after 2 years, floor 0.25). (2) *Profile*: those weights spread over each title's genres (TV and movie genre ids mapped to one set), original language, decade, TMDB keywords and creators/directors/top cast, looked up ONCE per title (`/tv|movie/{id}?append_to_response=keywords,credits`, the 150 strongest titles, 6 at a time) and cached on the device (`watchnext-taste-v1`, 120 days, max 800). The first visit shows "Learning your taste… N of M". (3) *Candidates*: TMDB recommendations (+ similar when thin) for the 8 strongest liked titles; combined credits of the top person (in ≥2 liked titles; makers count double); `/discover` by the top keyword (in ≥2 liked titles); `/discover` on your ticked services narrowed to your top 2 genres; `/trending/all/week`. Owned and hidden titles are dropped. (4) *Score* = 0.45 taste match (genres 0.6, language 0.25, decade 0.15) + 0.25 support (how many favourites point at it) + 0.2 quality (vote average shrunk toward 6.8 with 150 virtual votes) + 0.05 new (last 2 years) + 0.05 person/keyword. *Rows*: Top picks (12) · Because you rated/watched X (3 rows) · More from {person} · Your kind of story: {keyword} · On your services · Something different (trending, outside your usual genres, never a disliked genre). Greedy variety penalty (−0.12 per same main genre, −0.06 per same seed). Themed rows never share a title; Top picks is built last and may repeat one (−0.15 for repeats). Each card: match %, why-line, ×, + Watchlist; tap the poster for a sheet with description, **▶ Trailer** (YouTube) and Not interested. Built automatically once per app session (Refresh rebuilds). **Not interested** (× / sheet / Movie night's "Not for me") syncs, shows an Undo, and is listed in **Settings → Hidden from Discover** with "Show again"; it is in backups (restore adds missing ones). Movie night also skips hidden movies.

**Stats.** *Overview*: all-time hero + 4 tiles; a **Notes** button next to the title; **Goals · <year>** card; **Year in review**; **Month in review**. *Habits* (current/longest streak, heatmap, de-skewed day-of-week, records). *Rankings* (recently rated, **Most loved shows**, Most watched, **Most rewatched shows/movies**). *Breakdown* (per-year, platforms incl. Cinema, completion, genres).

**Settings** (top to bottom): Backup reminder banner (when due) · Sync · TMDB key · **My services** · Import TV Time · Clean up shows · Backup/Restore · Export for Power BI · Danger zone (Delete all data; **Delete everywhere** when signed in).

### Feature details
- **Dropped & auto-resume.** `dropped`/`droppedAt`; skipped by Up Next; own Dropped tab; still counts in totals. Marking an episode, a season or a rewatch on a dropped show resumes it, with a "Resumed · Name · Undo" toast (6 s) that restores the original drop date.
- **Fix watch dates** (show ⋯ menu). Marking stamps "now", so logging an old show puts it in the current month/year. The sheet offers scopes (all / each season / "Marked on <day>" for days with ≥3 together), a real past date (never future, ≥1980; stored as local noon; there is deliberately **no "unknown date"**), a preview, and an 8 s **Undo**. Only `at` changes (+ `fixedAt`); the date correction wins over older stamps on other devices (§6).
- **When did you watch it?** Tapping *Mark season watched* opens a sheet: **Just now** (default) or a real date. Single-episode ticks, the big "Mark next" button and "Unmark season" are unchanged.
- **Notes & reactions.** Six reactions (😍 Loved it, 😂 Funny, 😱 Shocked, 😢 Sad, 😡 Angry, 😴 Bored) + an optional note ≤ 280 chars, on watched episodes and on each movie viewing. **Notes page** (Stats → Notes): every note/reaction newest first; search by note text, show/movie name, reaction label/emoji and **exact** episode codes (`s1e5`, `S01E05`, `1x5`); All/Episodes/Movies switch; reaction chips with faceted counts + "Words only"; 50 at a time; tapping an episode opens the show and Back restores search, chips and scroll (the page lives in `App`). **Most loved shows**: each 😍 counts 2, each 😂 counts 1.
- **Year in review.** On-screen card = saved image (1080×1350, 4:5): big year, ▲/▼ delta vs last year, Episodes/Hours/Movies/Days, top 3 shows as 2:3 posters, busiest month, top genre, faint warm→teal wash (`GLOWS`, kept in sync with CSS by a unit test). Share sends text; Save image downloads the PNG. With goals set, bars appear under Episodes/Hours/Movies (and the saved image's posters shrink to 86% to make room).
- **Month in review** (Stats → Overview, under Year in review): same card for one calendar month; picker of months with activity; current month "so far"; delta vs previous month; "Busiest day". **Months use LOCAL dates** (owner's choice).
- **"You finished <show>" card.** *Finished* = every TMDB-listed episode watched AND the show not still running (Returning Series / In Production / Planned / Pilot are NOT finished). Offered by a button on the show page and a "You finished X! · Make card" toast (9 s) right after the final episode is marked. Card: big title (1–2 lines), a poster that grows to 600–720px, episodes/hours/days, star rating, "Started … · Finished …". Start date and "days" are hidden when the show's watches fall in a bulk-stamped minute (the finish date is always real). Share sends the PNG via the Web Share API where supported.
- **Watch goals** (Stats → Overview). Yearly targets for **episodes, movies and hours** (any subset; presets or custom 1–99,999; this year or next; hint "Last year (2025): N"). Per goal: `done / target · %`, a bar (teal; amber when reached), and a pace line: "N episodes ahead of pace · on track for P" / "On pace for P" / "N behind pace · X a week gets you there" / "Goal reached · N days to spare" / "Just getting started" (first 13 days). Pace = target × (day of year ÷ days in year); "on pace" = within 1% of the target (min 1); leap years handled. A streak line ("3 days in a row · best 7 days") reuses the all-time day streak. Progress counts exactly what the Year card counts (UTC year, rewatches count, hours = TV + movie minutes). Goals **sync between devices**, are in backups (restore only fills years you have no goal for), and are cleared by both deletes. Clearing every target keeps an empty `{ at }` entry so the clearing syncs.
- **CSV export** (Settings): `watchnext-episodes|shows|movies-<local date>.csv` for Power BI. Episode rows carry `watched_at_utc` AND `watched_date_local`/`watched_time_local`, `is_bulk_import` (same minute rule), status, platform, genres, reaction, note. UTF-8 BOM, CRLF, RFC-4180 quoting, text starting `= + - @` is apostrophe-prefixed. Never includes the TMDB key.
- **Backup & restore.** Download backup = the state minus `settings.tmdbKey` (goals included). Restore is **additive**: adds what's missing, never deletes or overwrites (your values win; backup fills blanks). **Backup reminder** banner: amber "It's been N days since your last backup" with Download / Remind me later (snooze 7 days); shown when the library isn't empty and either the last backup is ≥30 days old AND the library changed since, or no backup was ever made and the device has had the library ≥7 days. "A backup" = downloading the backup file from this device (also the automatic one before Delete everywhere); CSV doesn't count. The Backup card always shows "Last backup: <date> (N days ago)".
- **On my services.** Settings → *My services* ticks subscriptions (Netflix, Disney+, Prime Video, Max, Paramount+, Apple TV+, Hulu, Crunchyroll, Stan, Binge); **free-to-watch (ABC iview, SBS On Demand, 7plus, free ad-supported…) always counts**; rent/buy never. Switch on the Watchlist and Shows tab filters the whole page (and counts); rows/tiles show where ("Netflix · Free: Tubi"). Availability = TMDB's AU watch-providers block cached on each show / planned movie (`providers`, `providersFree`), refreshed in the background when older than **14 days** (3 lookups at a time; "Checking availability… N left", "N couldn't be checked · Retry", "Add your TMDB key…"). Titles not yet known are hidden until checked. First switch-on with nothing ticked opens the picker. TMDB/JustWatch data can be wrong or stale.
- **Movie night** (Watchlist → Discover → Movie night, also shown when nothing is rated). A NEW movie (anything already in your library is excluded) for a time (1 hr 30, 1 hr 45, 2 hr, 2 hr 30, 3 hr; default 2 hr) and a mood; 3 at a time with **+ Watchlist** (queues it with runtime/year/genres; the card stays marked "On your Watchlist ✓"), **Not for me** and **Show me different ones**. **Details & trailer** (tap the poster, the title or the button): opens the pick's tagline + synopsis (from the details already fetched for the runtime, so no extra request) and a **▶ Watch trailer** button that opens the official YouTube trailer in a new tab (one `/movie/{id}/videos` lookup on tap, cached for the sitting; shows an inline message when there is no trailer, the lookup fails or the browser blocks the tab). Sources: *recommended* = TMDB recommendations (+ similar when thin) for your top-rated MOVIES (max 6 seeds), labelled "Because you liked A and B" (personal signal ×3 in ranking); *popular* = TMDB `/discover/movie` (region AU, popularity order, ≥150 votes, ≥6.0, runtime 60..time, mood genres) once for YOUR ticked services (provider ids found by name in `/watch/providers/movie`, subscription only) and once for free/ad-supported. With no ratings and no services it still works from free-to-watch movies. List results carry no runtime, so details are looked up (3 at a time, session-cached) for the most promising candidates. Optional **Only on my services** (recommended movies are availability-checked, session only).
- **Platforms** (PlatformPicker): Netflix, Disney+, Prime Video, Max, Paramount+, Apple TV+, Hulu, Crunchyroll, Stan, Binge, ABC iview, YouTube, **Cinema** (manual only), Other.

## 8. Known limits & what has never been verified

- **Never run against real services (mocks/simulations only):** the real Firestore behaviour of `dropped`/notes sync and the `fixedAt` merge (shows, movies, goals, Delete everywhere, the wipe marker, Restore and sign-out/in WERE verified on real Firebase, §11 item 1); TMDB's real provider names / discover filters / recommendation quality for Movie night and On my services; the saved/shared cards on iPhone Safari (`ctx.letterSpacing` needs Safari 16.4+, Web Share with files); the CSVs opened in Power BI; colour emoji on every device.
- Goals: the newest edit of a YEAR wins as a whole (editing different metrics of one year on two offline devices loses one); a bulk-marked backlog counts toward goals (use Fix watch dates).
- Stats dates: UTC (Year/streaks/heatmap/goals) vs local (Month/CSV) can differ near a boundary.
- Settings, TMDB key, services prefs and the per-feature prefs are per device by design.
- Discover: the learned taste (`watchnext-taste-v1`) is per device, so each device does the one-time "Learning your taste" itself (up to 150 TMDB calls, about 5–15 s); "Not interested" syncs. Shows imported from TV Time without a TMDB id only add their stored genres to the taste. The `library/hidden` sync is tested against an in-memory Firestore only (`cloud_hidden`), not yet real Firebase. Match % is a friendly figure from genre/language/decade fit, not a probability.
- Offline, only your own data works: season/episode lists, cast, search and Movie night need TMDB ("Failed to fetch"), but "Mark next episode", ratings and goals work and sync when back online. DevTools "Offline" does not reliably cut an already-open Firestore stream; to test offline, set Offline and then reload, and confirm `ERR_INTERNET_DISCONNECTED` failures before editing.
- The harness runs on his own computer too (§9). Three original browser suites (library, upnext, showpage) can't run any more; they need old baselines/design files.

## 9. Testing harness (repo: `tests/unit`, `shot/browser`, `docs`)

The harness lives in the repo (`tests/unit`, `shot/browser`) and **runs on any computer** (paths are relative to the repo via `tests/paths.mjs`; scratch output goes to the git-ignored `.harness-work/`). Full details are in `tests/README_HARNESS.md`.

| Where | What |
|---|---|
| `tests/unit/*.test.mjs` | 30 plain-Node suites (≈574 tests; `cloud_hidden` runs the REAL `cloudEngine.js` against an in-memory Firestore from `tests/unit/fakes/`). Run: `npm run test:unit` |
| `shot/browser/*.mjs`, `fakecloud.js`, `fonts.css`, `launch.mjs` | 18 runnable headless-Chrome suites (≈526 checks). Run: `npm run test:browser:build`, then `npm run test:browser` (needs `npm install` in `shot/` once) |

**Setup in a new session (Claude's sandbox):** `git clone --depth 20 https://github.com/AceAsif/watchnext.git /home/claude/wl && cd /home/claude/wl && npm install && cd shot && npm install && npm i --no-save @sparticuz/chromium` (the sandbox browser; on his own computer `launch.mjs` uses installed Chrome/Edge or `CHROME_PATH`), then `node shot/build-test-dists.mjs`. No `.env` is needed for tests; the build script passes placeholder Firebase values itself. `wipe_resume.mjs` uses the second build (`dist-fake`) that the same script makes.

**Conventions:** browser tests pin the date to 2026-10-01T22:00Z (= 08:00 Fri 2 Oct in Hobart, local day-of-year 275), `emulateTimezone('Australia/Hobart')`, **bypass the service worker** (`setBypassServiceWorker(true)`), stub fonts, mock TMDB. **Last known results, all passing:** unit — library 19, settings 11, upnext 24, stats 25, backup 14, notes 16, logic 44, anime 34, settings_render 14, yearimage 29, dropped_csv 28, wipe 29, wipe_tomb_db 11, resume_db 10, rewatch 14, notes_search 19, month_recap 14, finish_card 21, watchdates 22, backup_nudge 14, services 16, providers_db 7, tonight 23, movie_genres_db 6, movie_night 24, goals 22, goals_db 14, taste 32, hidden 12, cloud_hidden 6. Browser — settings 47, desktop 56, notes 35, restore 24, anime 35, yearimage 25, dropped_csv 27, rewatch 8, recaps 20, watchdates 21, notes_search 22, backup_nudge 21, services 34, tonight 27, movie_night 41, goals 25, wipe_resume 33, discover 25. **Cannot run:** `library.mjs` (needs an old baseline build `wl-base-dist`), `upnext.mjs` and `showpage.mjs` (need design mock-up files from the original hand-off); kept for reference.

**Rules that have paid off:**
- After EVERY feature run all unit suites and every browser suite, not just the new ones. Update older tests when a screen changes on purpose (e.g. `settings.mjs` lists the Settings cards in order; "Mark season watched" now opens a sheet, so tests answer "Just now").
- Derive expectations from the seeded data with separate arithmetic in the test; never copy the app's formula. A hand-written number is the most common test error: when a mismatch appears, work out which side is wrong before editing either.
- **Mutation-test new logic:** deliberately break it (floor→ceil, flip a ranking, remove a guard, make the older copy win) and confirm a test fails. This found missing fixtures several times.
- When a browser test contradicts the design, check the design is what the owner wanted, then fix the TEST.
- No placeholder assertions (`|| true`, `ok(..., () => {})`, `if/else` that can skip the check).

**Gotchas learned the hard way:** a global `input[type='text']` rule in `styles.css` double-borders custom inputs (scope them); `flex: 1` in a column collapses a fixed height; date loops adding 86,400,000 ms break on DST days (use calendar arithmetic); Puppeteer clicks by coordinates, so elements behind the fixed tab bar need `el.click()` in `evaluate`; React-controlled inputs need the native value setter + an `input` event; `innerText` applies `text-transform` (use `textContent` or case-insensitive regex); `Sheet`'s Escape handler is attached once, so a dialog that must not close while busy needs a **ref** (`busyRef.current`), not `busy ? noop : onCancel`; two quick taps computed from a render's copy overwrite each other (read the latest saved value, e.g. `toggleMyService`); a `useEffect` that must re-run on Retry needs the retry counter in its deps; a pure module can't import a `.jsx` (extract data into a `.js`, as `platformsData.js`); cached values arrive via sync so guard `for…of` with `Array.isArray`; substring search on identifiers is a trap ("s1e5" matched S1E50); check early `return`s in a screen before adding an entry point (Discover's "no ratings" return would have hidden Movie night); a feature that completes something can trip older "no toast" assertions (assert on the specific toast); never run a stdin-reading command in the sandbox (`cat > /dev/null` hangs).

## 10. How to make & ship a change

1. **Start from the freshest repo:** clone fresh; the repo has been edited by other sessions. Diff your work copy against it before delivering.
2. Put decisions into **pure functions** (`*Logic.js` / `store/*.js`) and unit-test them with plain node; use browser tests for behaviour and layout. Keep Firebase out of eager imports.
3. Build with the placeholder `.env`; `npm run build` must pass and still show the separate ~440 kB `cloudEngine` chunk; delete `.env`.
4. Run all suites (§9). Take screenshots of new UI at 390px, 320px and 1280px and LOOK at them.
5. **Deliver** only files that differ from his repo, mirroring folder paths under `/mnt/user-data/outputs/`; run the "every import resolves" check; call `present_files`; give the folder table, list NEW files separately, and a commit message. Update the handover and the harness zip when tests change.
6. Never overwrite shared files (`ui.css`, `db.js`, `Stats.jsx`, `Settings.jsx`, `ShowDetail.jsx`) from an older copy.

## 11. Owner's own to-do (things only he can do)

0. **Apply the latest delivery:** Fetch/Pull; copy the whole `src/` from the latest delivery; `npm run build`; commit ("Add yearly watch goals…"); apply `watchnext-harness-for-repo.zip` (copy its `tests`, `shot`, `docs` folders over the repo), then delete `watchnext-test-harness/`, `docs/WatchNext-Handover-v4.md` and v5 (once v6 is in `docs/`), and `tests/unit/library_test.mjs`.
1. ~~**Verify the sync engine against REAL Firebase with a throwaway Google account**~~ **DONE 8–9 Oct 2026** (account deleted afterwards). Device A = Chrome Incognito, B = Chrome Guest, C = Edge InPrivate (incognito windows share storage, so separate browsers/profiles are needed). Results:
   - **Sign-in, A→cloud and A↔B sync of shows, movies and goals:** passed (live, and after reload).
   - **Goals:** clear on A → B follows; edits on both with B really offline → the newer edit wins on both: passed.
   - **Delete everywhere:** backup downloaded first, A and B empty, console `shows` empty, `library/movies` = `[]`, `library/goals` = `{}`, `library/wipe` = `{ at, id }`: passed.
   - **Offline wipe:** B offline made an episode and rating change, A wiped, B back online → B cleared and the offline edits did not return anywhere: passed.
   - **Third device (C) sign-in and Restore from backup on the wiping device:** passed (all three devices got the shows and movies).
   - **Restore on a DIFFERENT device than the one that wiped:** FAILED at the time, shows vanished everywhere (the tombstone bug, §6). Restoring again on the wiping device recovered everything. Fixed afterwards (§6); re-test pending.
   - **Sign-out keeps local data; an edit made while signed out syncs after signing back in; cancelling the Google popup leaves the app usable:** passed. Cosmetic: the cancelled popup shows the raw text "Sign-in failed: Firebase: Error (auth/popup-closed-by-user)." (§13).
   - **Cleanup:** every device signed out and the test user deleted from Firebase Authentication. Leftover empty documents under the test user's `users/{uid}` in Firestore are harmless; never delete the other `users/*` entry, that is the real account.
2. **Real-data pass** of the newer features: Movie night and On my services (spot-check titles against the Netflix/Stan/etc. apps), What should I watch tonight?, Backup reminder (make a backup; check "Last backup: today"), Goals (set real targets and read the pace).
3. **Fix the real history:** show ⋯ → Fix watch dates… on shows logged in bulk (e.g. DAHMER → 2022/2023, The Mind of Jake Paul → 2018); check July 2026 on Month in review. Look at other months' "Busiest day" for suspiciously big counts.
4. **iPhone pass:** save/share the Year, Month and "You finished" cards; auto-resume Undo; the three CSV downloads; load the CSVs into Power BI (set date columns to Date type).

## 12. Done so far (for orientation)

Complete UI redesign of every tab · AniList · Restore from backup · Cinema platform · Notes & reactions · Year-in-Review saved image + poster-grid card · Dropped status · CSV export for Power BI · auto-resume (with Undo) · **Delete everywhere** · Most rewatched · Notes search + Most loved shows · Month in review + "You finished" card · Fix watch dates + "When did you watch it?" · Backup reminder · **On my services** filter · **What should I watch tonight?** · **Movie night** · **Watch goals** · **taste-weighted Discover** (rows, Not interested synced) · test harness reorganised and documented · **sync engine verified on real Firebase** (§11 item 1).

## 13. Features remaining (backlog) — with a suggested order

**Suggested next, in order**
0. ~~Fix: restore on a different device than the one that ran Delete everywhere~~ DONE 9 Oct 2026 (§6; unit simulations `wipe.test.mjs` + `wipe_tomb_db.test.mjs`). **Re-verify on real Firebase** with a throwaway account: wipe on A, Restore on B → A, B and C keep the shows. The same-show delete-on-A / re-add-on-B case is a related known limit (normal tombstones).
1. **Power BI starter guide** (not built; offered): the three CSV tables and how to relate them, ready-made DAX measures (hours per month, completion %, binge days), a dashboard layout. A document, not a `.pbix` (can't be produced here). Ties in with his Power BI/freelance goals.
2. **Calendar export (.ics):** put upcoming episodes in his phone calendar; no server needed (medium).
3. **More stats:** genre trends year over year, longest binge, time-of-day view (medium).
4. **Decide UTC vs local for ALL of Stats** (open decision; changes how history is counted; Month in review and the CSV are already local). Ask him before touching.

**Medium / small**
- A nudge on Month/Year in review when many episodes were marked together on one day ("18 episodes were marked on 7 Jul. Fix their dates?"). The day-cluster scope already exists in the fix sheet.
- **Rewatches as dated history** (changes the `watched` shape + cloud merge; would let "Most rewatched" split by year). The biggest data change of the lot.
- Per-metric goal merging (today the newest edit of a YEAR wins as a whole).
- Cancelling the Google sign-in popup should be silent or friendly (`auth/popup-closed-by-user` is not a failure); today it shows the raw Firebase error.
- The Delete everywhere success banner says other devices "will clear the next time they open WatchNext", but open devices clear live within seconds; reword.
- "Pick one for me" (random) on the Watchlist. (Taste-weighted Discover: Phase 1 DONE Oct 2026, see §7.)
- **Discover Phase 2/3 ideas:** use the same taste profile in Movie night and "What should I watch tonight?"; anime rows from AniList; a "Your taste" card in Stats (top genres/keywords/people); time-of-day context; a hit-rate figure (how many suggestions you later added or watched); re-verify the `library/hidden` sync on real Firebase (hide on A → gone on B; Show again on B → back on A).
- Cleanups: stale comments; the unused `.poster-card` rules in `styles.css` (left over from the deleted `PosterCard.jsx`). (Done Oct 2026: `PosterCard.jsx` deleted; the harness now runs on his own computer, see `tests/README_HARNESS.md`.)

**Bigger (several days, may need a backend)**
- **New-episode push notifications** (iPhone web apps can; needs Firebase Cloud Messaging + a scheduled job; the heaviest item).
- Letterboxd/Trakt import (movie history); AniList list import/sync; shared watchlist ("watch together"); custom lists; tablet layout (phone column under 900px).

## 14. What to do next (recommended)

1. **Housekeeping first (15 minutes):** apply the latest delivery and the harness zip (§11 item 0), confirm the deploy is green and there is only one deploy workflow.
2. **Re-test on real Firebase:** the restore-on-another-device fix (§13 item 0) and the new "Not interested" sync (§13 Discover ideas). The cloud engine has passed the real-Firebase test (§11 item 1); the one bug it found is fixed in code and in the simulations, but not yet re-checked against real Firestore. Until then, restore a backup on the same device that ran Delete everywhere.
3. **Use the new features with real data for a few days** (§11 items 2–4) and write down what feels wrong; those fixes are usually worth more than a new feature.
4. **Then build the next feature:** the Power BI guide, then calendar export, then more stats (§13). Propose the plan and ask 2–3 questions before building, as in §0.

---

## 15. First message to paste into the new chat

> Assalamualaikum. I'm attaching `WatchNext-Handover-v6.md` and `watchnext-harness-for-repo.zip`. Please read the handover, clone my repo fresh (`AceAsif/watchnext`), and tell me in 5 lines what you understand. Check with `git log` / `git status` whether the latest features (Movie night, Watch goals) and the harness reorganisation are committed. Then set up the test harness in your sandbox as described in §9, run the unit suites to confirm it works, and ask me which of the "what to do next" items I want to start with before building anything.
