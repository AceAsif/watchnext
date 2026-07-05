# WatchNext

A personal, self-hosted TV show tracker. Built as a replacement for [TV Time](https://techcrunch.com/2026/07/02/popular-tv-tracking-app-tv-time-is-shutting-down-as-company-focuses-on-ai/), which shut down on 15 July 2026, taking a decade of watch history with it unless users exported their data first.

WatchNext imports that export and keeps tracking going: no accounts, no server, no ads. All data lives in your own browser, with one-click backup to a JSON file.

## Features

- **Up Next**: continue-watching list sorted by recency, plus upcoming air dates for followed shows
- **Shows**: your full library with posters and progress bars, filterable by watching / finished / not started, with TMDB search to follow new shows
- **Episode tracking**: seasons and episodes pulled live from TMDB, mark single episodes or whole seasons
- **Stats**: total episodes, hours and days watched, most-watched shows, episodes per year, movie totals
- **TV Time import**: converts the official GDPR export (8,000+ watch records tested) into the app
- **PWA**: installable on a phone home screen, works offline for everything already cached
- **Own your data**: everything is stored locally; export and re-import backups anywhere

## Tech stack

- React 18 + Vite, no other runtime dependencies
- [TMDB API](https://developer.themoviedb.org/) for show metadata, posters and air dates
- Python 3 (standard library only) for the TV Time export converter
- localStorage persistence with a small subscribe-based store (`useSyncExternalStore`)

## Setup

1. **Install and run**

   ```bash
   npm install
   npm run dev
   ```

2. **Get a TMDB API key** (free): create an account at [themoviedb.org](https://www.themoviedb.org/), then Settings → API → request a key. Paste the v3 key into the app's Settings tab. The key never leaves your browser.

3. **Import your TV Time history** (optional):

   ```bash
   python tools/convert_tvtime.py path/to/gdpr-data.zip -o tvtime_import.json
   ```

   Then in the app: Settings → Choose import file → select `tvtime_import.json`. Finally, on the Shows tab, press **Sync with TMDB** to resolve every show (the export uses TVDB IDs; the app maps them to TMDB via the `/find` endpoint) and load posters, episode counts and air dates.

## Cloud sync (optional, but recommended)

By default your data lives only in the current browser's storage — great for
privacy, but it means switching devices loses your history unless you use the
manual backup/import above every time.

WatchNext can optionally sync across devices via Firebase, using Google
sign-in so it's still only you accessing your own data (enforced by
`firestore.rules`, not by hiding any keys).

**One-time setup:**

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → name it anything (e.g. `watchnext`) → skip Google Analytics (not needed) → Create.
2. **Build → Authentication** → Get started → enable **Google** as a sign-in provider → Save.
3. **Build → Firestore Database** → Create database → start in **production mode** → pick any region → Enable.
4. In Firestore, go to the **Rules** tab, replace the contents with everything in `firestore.rules` from this repo, and click **Publish**.
5. Go to **Project settings** (gear icon) → scroll to "Your apps" → click the **</>** (web) icon → register an app (any nickname) → you'll be shown a `firebaseConfig` object.
6. Copy those values into a `.env` file in the project root (copy `.env.example` to `.env` first):
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```
7. Rebuild and redeploy: `npm run deploy`.
8. In **Authentication → Settings → Authorized domains**, add your GitHub Pages domain (e.g. `aceasif.github.io`) if it isn't already listed — otherwise Google sign-in will reject the popup.

After that, open the deployed app → Settings → **Sign in with Google**. Your existing local data merges into the cloud automatically, and any other device that signs in with the same Google account will pick up the same shows and watched episodes within a few seconds of any change.

Cost: Firebase's free "Spark" plan covers this comfortably — a single-user watch history is a tiny fraction of the free Firestore read/write quota.

## Deploying

`npm run build` produces a static `dist/` folder. Host it anywhere static files go: GitHub Pages, Netlify, Cloudflare Pages, or a home server. Because storage is per-browser, use Settings → Download backup to move history between devices.

## Privacy notes

- `data/`, `*.zip` exports and backup files are gitignored so watch history never lands in the repo
- A TMDB key entered in Settings is stored in localStorage only; a key baked in via `.env` ends up visible in the built JavaScript, so prefer the Settings route for anything public

## Project structure

```
tools/convert_tvtime.py   TV Time GDPR zip -> import JSON (pure stdlib)
src/store/db.js           localStorage store, import/merge logic, mutations
src/api/tmdb.js           TMDB client (search, TVDB id resolution, seasons)
src/pages/                Up Next, Shows, ShowDetail, Stats, Settings
public/                   PWA manifest, icons, service worker
```

## Why not just use another tracker?

Simkl, Showly and friends are good. This exists because the TV Time shutdown made the lesson obvious: when your watch history lives in someone else's product, it can disappear on two weeks' notice. Here the history is a JSON file you own.
