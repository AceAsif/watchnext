# WatchNext — Developer Handover (v4)

Paste this whole file into a new chat (and attach `watchnext-test-harness.zip`) to bring an assistant fully up to speed, then ask it to build the next feature. **This supersedes v3.** It reflects the complete UI redesign (every tab), AniList, Restore from backup, the Cinema platform, and Notes & reactions. Last verified against the repo at commit `4c08e6f` (2 Oct 2026) plus one pending delivery (§9).

---

## 0. How to work with this owner (read first)

- **Greet with "Assalamualaikum"** at the start of a conversation; reply to his greeting with **"Wa alaikum salam"**. English only; Bengali/Arabic Islamic phrases are welcome.
- **Every code delivery must say which folder each file goes in, and give a git commit message** (summary line + short bullet description). He applies files by copying into his repo with GitHub Desktop and pushing; deploy is automatic.
- **Tell him to Fetch/Pull in GitHub Desktop before copying.** The repo is edited from more than one place (see §10, "drift").
- **Be honest about what is and isn't verified.** He has repeatedly valued: admitting mistakes plainly, saying what was only tested with mocks, and flagging risky decisions before making them. He has limited usage budget on some days, so stay lean: no long preambles, discuss before big builds, and don't re-run suites that can't be affected.
- Ask before destructive or hard-to-reverse behaviour (e.g. "wipe everywhere" is deliberately NOT built).
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
    backupMerge.js            PURE: additive restore-from-backup merge (hostile-file safe)
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
  components/
    ui.jsx                    Sheet, Bar, Chevron, Avatar
    LibraryBar.jsx            FilterField, StatusTabs, ChipSelect (sheet/popover), ToolsMenu, ProgressCard, LibEmpty,
                              ShowTile, MovieTile, AddDialog, icons, useIsDesktop
    LibraryUI.jsx             PageHead/SearchField/MediaRow/Poster/Empty (older shared bits, used by Watchlist/Discover/Movies sheet)
    StatsUI.jsx, Heatmap.jsx, YearInReview.jsx      stats pieces (YearInReview: on-screen card + canvas PNG export)
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

## 6. Cloud sync

- `cloud.js` is a firebase-free facade; the real engine is `cloudEngine.js`, loaded by `import()`. **Never statically import firebase or `firebase.js` from eagerly-loaded code** (undoes the ~230 kB main / ~440 kB lazy split). Importing small PURE modules (e.g. `./notes.js`) into the engine is fine.
- Sign in → pull Firestore and merge: **union of `watched`** (local entry wins on conflict) and, now, **union of `notes`** (yours win per episode); other show fields are `{...remote, ...local}`. Shows are docs under `users/{uid}/shows/{id}`; movies are ONE doc `users/{uid}/library/movies` (existing movies dedupe on `name|watchedAt` and the local copy wins — so editing the same movie's rating/note on two devices is last-sync-wins; known limit).
- Local changes flush on a ~2.5 s timer + `visibilitychange`/`pagehide`. **Persistent tombstones** stop deleted shows resurrecting; re-adding/restoring/importing a show lifts its tombstone.
- **Settings and the TMDB key are never synced** (the cloud code never reads `settings`).
- **`resetAll()` ("Delete all data") clears THIS DEVICE only.** It writes no tombstones and does not touch Firestore, so when signed in the cloud copy may sync back. The UI says so honestly. A true "wipe everywhere" is **not built** (on the to-do list; needs a deliberate design).

## 7. What exists now (feature summary)

- **Up Next:** Continue watching (one-tap mark next, Undo toast, double-tap guard, ≈finish estimates) + On the way (grouped agenda with month dividers, List/Calendar). Never offers an unaired episode.
- **Shows:** one funnel-icon **Filter** box; status tabs with **faceted counts** (they respect the platform/name filters and always sum); Platform and Sort chips (bottom sheet on phone, popover on desktop); asc/desc toggle; **Tools** menu (Sync/Refresh from TMDB, Detect platforms — never overrides your picks — with a progress card); **+ Add** opens a TMDB search dialog (live search, 350 ms debounce, stale responses ignored; results offer Open / Add / Add to watchlist, and *Open only* for tracked shows). Empty states: name-not-found (with "Search TMDB for …" shortcut), filters-match-nothing, brand-new library. Sorts: Title, Recently watched, Recently added, Progress, Rating (internal ids `Alphabetical`, `Recently watched`, `Recently added`, `Progress`, `Rating`).
- **Movies:** same filter bar; Sort Recent / A–Z / Rating; **+ Add** dialog (buttons "Watched it", "Add to watchlist", and for tracked films "Open"/"Log again"); detail sheet has rating, **Your thoughts**, platform, trailer, Fix match, Remove.
- **Show page:** summary rows with bottom sheets; seasons fold; cast & crew browsing (person → other titles, "In library" flags); **AniList** details (link/refresh/unlink, display-only; episode-count mismatches are noted, never applied); streaming in Australia; trailer; **episode notes & reactions** (§8).
- **Stats:** Overview (all-time hero, 4 tiles, Year in Review card with Share + Save image), Habits (streaks, full-width heatmap, de-skewed day-of-week, records), Rankings, Breakdown (per-year, platforms incl. Cinema, completion, genres).
- **Settings:** Sync (not configured / signed out / "Opening sign-in…" / signed in), TMDB key (with "Key saved" state), Import TV Time history, Clean up shows (leftovers; real confirm dialogs), **Backup + Restore from backup**, Danger zone (Delete all data on this device). Inline success/error **banner** (kept by owner's choice; scrolls into view). Native `confirm()`/`alert()` are no longer used anywhere in Settings.
- **Backup/Restore:** "Download backup" writes the app state **minus `settings.tmdbKey`** (`backupState`). "Restore from backup" is **additive**: it adds what's missing and never deletes or overwrites anything (your values win; the backup fills blanks, adds missing watched episodes/notes/movies); restored shows are marked for sync and tombstones lifted; the file's `settings` are ignored; hostile files (`__proto__`, junk types, 10k-char notes) are sanitised. Exact snapshot = Delete all data, then Restore. A TV Time export dropped in the Restore box (or a backup in the Import box) gets a clear message pointing to the right card.
- **Platforms** (one row each in `PlatformPicker.jsx`): Netflix, Disney+, Prime Video, Max, Apple TV+, Hulu, Crunchyroll, Stan, Binge, ABC iview, YouTube, **Cinema** (#F5C518, manual only, never auto-detected), Other.

## 8. Notes & reactions (newest feature)

Six reactions — Loved it 😍, Funny 😂, Shocked 😱, Sad 😢, Angry 😡, Bored 😴 — plus an optional note ≤ **280** chars (`NOTE_MAX`). Episodes: a speech-bubble button on each **watched** episode (or any episode that has a note) opens `NoteSheet`; rows show the emoji (amber bubble if text-only). Movies: "Your thoughts" inline in the detail sheet. Save is explicit; × / Escape discards; tapping the chosen reaction again clears it; Remove deletes the note (and the whole `notes` property when it was the last). The text box is clamped in `onChange` too (`maxLength` only limits typing/pasting). Restore and cloud merge carry notes.

## 9. Pending / unverified

- **Notes & reactions was delivered but may not be committed yet.** Files: `store/notes.js`, `components/NoteEditor.jsx` (new); `pages/ShowDetail.jsx`, `pages/Movies.jsx`, `store/db.js`, `store/cloudEngine.js`, `store/backupMerge.js`, `components/settingsLogic.js`, `components/ui.css` (changed). First action in a new chat: check the repo for `src/store/notes.js`; if missing, re-deliver or ask the owner to apply the zip.
- **Never run against real services (mocked only):** Google sign-in; cross-device sync of notes/restored data against real Firestore; real clipboard on a phone; mouse-hover styles; colour emoji; restoring a genuine backup of his 250-show library; real TMDB posters in the new tiles (he has confirmed they look right live).
- The owner's Stats screenshot showed a faint warm→teal **gradient on the on-screen Year-in-Review card**, but the redesigned card is flat (`var(--bg-card)`). Unexplained; ask which he wants (relevant to the next feature).

## 10. How to make & ship a change (assistant workflow that works)

1. **Always start from the freshest repo.** `git clone --depth 20 https://github.com/AceAsif/watchnext.git` into the sandbox (the repo has been edited by other sessions — e.g. a Claude Code web session on branch `claude/determined-hamilton-*` redesigned Movies/Watchlist and added `LibraryUI.jsx`). Diff against your working copy; the **repo is the source of truth.**
2. Build with a placeholder `.env` (`VITE_FIREBASE_API_KEY=placeholder_key_for_build_test`, `VITE_FIREBASE_AUTH_DOMAIN`, `…PROJECT_ID`, `…STORAGE_BUCKET`, `…MESSAGING_SENDER_ID`, `…APP_ID`); `npm run build` must pass and still show a separate ~440 kB `cloudEngine` chunk. Delete `.env` afterwards. Symlink `node_modules` from any installed copy.
3. Put new decisions into **pure functions** (`*Logic.js` / `store/*.js`) and unit-test them with plain node; use browser tests for behaviour/layout (harness in the zip).
4. **Deliver only files that differ from the owner's current repo** (`diff -rq <fresh clone>/src <work copy>/src`), mirror their folder paths under `/mnt/user-data/outputs/`, call `present_files`, and give the folder table + commit message.
5. Stale-state trap: never overwrite `ui.css`/other shared files with an older copy.

## 11. Testing harness (in `watchnext-test-harness.zip`)

~200 unit tests (plain node, import from `/home/claude/wl/src/...`) and ~360 browser checks (puppeteer-core + @sparticuz/chromium, headless; fonts stubbed from `fonts.css`; TMDB mocked; date shim pinned to 2026-10-01T22:00Z = Hobart morning 2 Oct; `emulateTimezone('Australia/Hobart')`). See the README inside the zip for setup and the paths each script expects. The Shows/Movies suite also does **parity testing against a baseline build** of the old pages (`wl-base-dist`), which is how "same ordered titles as before" was proven; reuse that technique when redesigning an existing screen. Counts at last run: unit 201; browser — library 119, settings 47, restore 24, notes 35, anime 35, upnext 44, desktop/layout 55 (+ show-page harness), all passing.

**Gotchas learned the hard way (don't repeat):**
- A global `input[type='text']` rule in `styles.css` gives every input a border/padding/background; scope inputs inside custom fields with `.x input[type='text']` (higher specificity) or you get a double border.
- `flex: 1` in a **column** flex container collapses a fixed `height` (the TMDB key box became a sliver on phones). Use `flex: 1 1 auto; min-height`.
- Date loops that add `86,400,000` ms break on DST days (the old heatmap duplicated 5 Apr and skipped 4 Oct in Hobart). Use calendar arithmetic (`new Date(y, 0, n)`).
- Puppeteer clicks by screen coordinates; elements behind the **fixed bottom tab bar** get the tab bar clicked instead. Click via `el.click()` in `evaluate`. For React-controlled inputs set the value with the native setter + `input` event. `innerText` applies CSS `text-transform` (use `textContent`).
- Test your own tests: no placeholder `ok(…, () => {})` assertions; derive expectations from data instead of hard-coding counts that random seeds can change.
- `Sheet` focus restore needs the trigger recorded **during render** (autofocused children grab focus before effects run).
- The "old file" trap: restoring/regenerating shared files from an earlier download silently reverts other sessions' work.

## 12. Backlog (owner decisions in **bold**)

1. **NEXT ACTION — Year-in-Review saved image matching the new card** (see below).
2. Real-device verification pass (checklist: Google sign-in, Add dialog with real TMDB, Copy button, restore a real backup, two-device notes sync, hover states).
3. **Dropped status** for abandoned shows (small model addition: `dropped` flag; update Continue watching, Watching filter, completion stats, backup merge).
4. **CSV export** of full watch history (Settings; feeds his Power BI interest).
5. **"Wipe everywhere"** — he wants it kept on the to-do list, not built yet; needs design (tombstones for every show + clearing the movies doc, confirm wording).
6. **Stats day attribution: UTC vs local** (open decision; changes history).
7. Backup & the TMDB key: he said he'd keep the key **in** backups only if the site doesn't leak it; since his key is probably baked into the build (so the site does expose it) and not in browser data, the current "key excluded" behaviour is unchanged — revisit only if he pastes a key in Settings and wants it in backups.
8. Taste-weighted Discover; Random pick on Watchlist; AniList list import/sync; rewatches as dated history (changes `watched` shape + cloud merge); custom lists; watch goals; Letterboxd/Trakt import; tablet-specific layout (currently phone column under 900px).
9. Cleanups: delete unused `PosterCard.jsx`; stale text/comments.

---

## NEXT ACTION: Year-in-Review saved image that matches the new on-screen card

**Where:** `src/components/YearInReview.jsx`. The on-screen card was redesigned (flat `var(--bg-card)` card; big year + ▲/▼ delta vs last year; 4 stats Episodes/Hours/Movies/Days; **Top 3 shows as rows** with 28×42 poster, rank, name, "N eps"; Busiest month / Top genre; Share + Save image buttons below). **The saved PNG still uses the OLD layout** — a 1080×1400 canvas (`downloadImage()`, `const W = 1080, H = 1400, P = 60`) with a gradient background, WatchNext brand row, a 3-poster grid and a domain footer. Result: what's on screen no longer matches what's saved/shared.

**Goal:** make the exported PNG visually match the new card (same hierarchy, flat dark card look, rows with posters), while keeping what already works.

**Keep / don't break:**
- `loadImg()` loads posters with `crossOrigin='anonymous'` + cache-bust so the canvas **never taints**; keep the titled-placeholder fallback when TMDB blocks CORS or a poster is missing (some shows have none).
- Await `document.fonts.ready` before drawing so Bricolage Grotesque / Inter / IBM Plex Mono are used.
- `canvas.toBlob(...,'image/png')` → download; `share()` uses `navigator.share` with a clipboard fallback (don't regress either).
- Data comes from the `data` object computed in `Stats.jsx` (`year, episodes, hours, movies, activeDays, topShows[{name,count,poster}], busiestMonth, topGenre, epDelta, prevYear`). **No data-model change needed.**

**Decisions to confirm with the owner first (cheap):** keep a small "WatchNext" brand/URL footer on the image? Keep 1080×1400 or switch to 1080×1350 (Instagram 4:5)? Was the faint gradient he saw on the on-screen card intentional (§9)?

**Edge cases to handle & test:** no movies; fewer than 3 shows (or none); no previous year (no delta); negative delta (▼ in dim colour, not red); very long titles (ellipsis via `measureText`); non-Latin titles (Japanese); missing posters; year with no data.

**How to verify:** unit-test any new pure layout/format helpers; in headless Chromium call the export and read the blob/dataURL — assert dimensions, that it isn't blank/uniform, then **look at the PNG** (screenshot review has caught real bugs here); test the poster-failure path by aborting `image.tmdb.org` requests. Run the Settings/Stats-adjacent suites for regressions.

**Deliver:** changed files only, with folders and a commit message, per §0.

---

### First message to paste into the new chat

> Assalamualaikum. I'm attaching `WatchNext-Handover-v4.md` and `watchnext-test-harness.zip`. Please read the handover, clone my repo fresh (`AceAsif/watchnext`), tell me in 5 lines what you understand, check whether the Notes & reactions files are already committed, then propose the plan for the next action (Year-in-Review saved image) before building.
