// Help & FAQ text (Settings → Help & FAQ). Plain data, so it is easy to update.
// When you build a new feature, add or change an entry here (see the handover's checklist).
//
// Each section: { id, title, items: [{ id, q, a, steps? }] }
//   q      the question or topic (short)
//   a      one or two short paragraphs (array of strings)
//   steps  optional bullet list (array of strings)
// The "shortcuts" section also shows the keyboard list from keyboardShortcutsLogic.js
// (one source, so the help never goes out of date).
//
// Keep it simple: short sentences, plain words, the real button names in “quotes”.

export const HELP_SECTIONS = [
  {
    id: 'start',
    title: 'Getting started',
    items: [
      {
        id: 'what',
        q: 'What is WatchNext?',
        a: [
          'A tracker for the TV shows and movies you watch. It shows what to watch next, what is coming soon and your stats. No ads.',
          'Your library is saved in this browser. Sign in with Google (Settings → Sync across devices) to keep it on all your devices.',
        ],
      },
      {
        id: 'add',
        q: 'How do I add a show or a movie?',
        a: ['Tap the search button at the top (🔍) and type a name.'],
        steps: [
          'Show: “Follow” adds it to your shows. “＋ Watchlist” saves it for later.',
          'Movie: “Watched it” logs it as watched today. “＋ Watchlist” saves it for later.',
          'You can also use “＋ Add” on the Shows or Movies tab.',
        ],
      },
      {
        id: 'mark',
        q: 'How do I mark an episode as watched?',
        a: [
          'On Up Next, tap the round button next to a show to mark its next episode. A message with “Undo” appears in case you tapped by mistake.',
          'On a show page, open a season and tap the round button next to any episode. “Mark season watched” marks the whole season.',
        ],
      },
      {
        id: 'tabs',
        q: 'What are the six tabs?',
        steps: [
          'Up Next: shows you are watching, new episodes coming soon, and “What should I watch tonight?”.',
          'Shows: all your shows, with filters (Status, Platform), sort and “On my services”.',
          'Movies: every film you have watched, and Collections (film series).',
          'Watchlist: things to watch later, your lists, what is new on your services, and Discover.',
          'Stats: goals, year and month in review, habits, rankings, badges and a world map.',
          'Settings: sync, region, your services, imports, backups and this help.',
        ],
      },
    ],
  },
  {
    id: 'shows',
    title: 'Shows & episodes',
    items: [
      {
        id: 'rewatch-one',
        q: 'I watched an episode again (a rewatch). How do I log it?',
        a: [
          'On the show page, tap “+1” next to the episode. It counts one more watch and keeps the date you first watched it. A message with “Undo” appears in case of a mistake.',
        ],
      },
      {
        id: 'rewatch-mode',
        q: 'How do I rewatch a whole show?',
        a: [
          'On the show page tap ⋯ → “Start a rewatch”. Up Next then shows your next rewatch episode (marked “rewatching”). Your first watch dates are kept.',
          'When you finish, or want to stop, tap ⋯ → “End this rewatch”.',
        ],
      },
      {
        id: 'rate',
        q: 'How do I rate a show or an episode, or add a note?',
        a: [
          'Show: use “Your rating” on the show page. Half stars are allowed.',
          'Episode: after you watch it, tap the speech bubble on the episode row. You can give stars, pick a reaction and write a note. All your notes are in Stats → “Your notes”.',
        ],
      },
      {
        id: 'summary',
        q: 'How do I read what an episode is about?',
        a: ['Tap the episode title on the show page. The summary opens under it.'],
      },
      {
        id: 'drop',
        q: 'I stopped watching a show. What do I do?',
        a: [
          'On the show page tap ⋯ → “Drop this show”. It leaves Up Next but stays in your library under Shows → Status → Dropped.',
          'Changed your mind? Tap ⋯ → “Resume watching”.',
        ],
      },
      {
        id: 'dates',
        q: 'The watch dates are wrong. Can I fix them?',
        a: ['Yes. On the show page tap ⋯ → “Fix watch dates…” and choose the right dates.'],
      },
      {
        id: 'favourite',
        q: 'How do I keep my favourite shows at the top?',
        a: ['Tap the heart (♥) on the show page. Favourites come first on Shows and Up Next.'],
      },
      {
        id: 'wrong-show',
        q: 'The show has the wrong poster or episodes.',
        a: ['It is probably matched to the wrong show on TMDB. On the show page tap ⋯ → “Fix TMDB match” and pick the right one.'],
      },
      {
        id: 'people',
        q: 'Can I follow an actor or director?',
        a: [
          'Yes. On a show page or a movie, open the cast, tap a person and tap “Follow”. Their new films and shows appear on Up Next.',
        ],
      },
      {
        id: 'where',
        q: 'Where can I stream a show?',
        a: [
          'The show page shows “Streaming in …” for your region. Set your country in Settings → Region and tick the services you pay for in Settings → My services.',
        ],
      },
    ],
  },
  {
    id: 'movies',
    title: 'Movies',
    items: [
      {
        id: 'movie-again',
        q: 'I watched a movie again.',
        a: ['Search for it and tap “Log rewatch”. Each viewing is listed when you open the movie.'],
      },
      {
        id: 'movie-date',
        q: 'How do I change the date I watched a movie?',
        a: ['Open the movie, pick the viewing and tap “Change date”. Only that one viewing changes.'],
      },
      {
        id: 'movie-wrong',
        q: 'The movie is the wrong film (same name, different year).',
        a: ['Open the movie and use “Fix match”. The search uses the year too, so you can pick the right film.'],
      },
      {
        id: 'collections',
        q: 'What are Collections?',
        a: [
          'Movies → Collections groups film series, like all the Harry Potter films. It shows which ones you have seen, and “Add next to watchlist” adds the next one.',
        ],
      },
      {
        id: 'lists',
        q: 'Can I make my own lists?',
        a: ['Yes. Use “Add to a list” on a show page or a movie. Your lists are in Watchlist → Lists.'],
      },
    ],
  },
  {
    id: 'find',
    title: 'Finding what to watch',
    items: [
      {
        id: 'tonight',
        q: 'What should I watch tonight?',
        a: [
          'Tap “What should I watch tonight?” on Up Next. Pick how much time you have and your mood, and it suggests something from your shows and watchlist.',
        ],
      },
      {
        id: 'discover',
        q: 'How does Discover work?',
        a: [
          'Watchlist → Discover suggests new shows and movies based on what you watch and rate, including “Hidden gems” and an anime row.',
          'Tap × on a card for “Not interested”, and it won’t be suggested again. You can bring it back in Settings → Hidden from Discover.',
          '“Movie night” finds a new movie for tonight from your time and mood.',
        ],
      },
      {
        id: 'new-on',
        q: 'What is new on my streaming services?',
        a: ['Watchlist → New shows titles that arrived this week on the services you ticked in Settings → My services.'],
      },
      {
        id: 'scores',
        q: 'What are the IMDb, Rotten Tomatoes and Metacritic scores?',
        a: [
          'They appear on show pages, movies and the Watchlist. Tap a score to open that website. TV shows often only have an IMDb score.',
          'In Watchlist → Queue, the “Highest rated” sort uses these scores.',
        ],
      },
      {
        id: 'queue-time',
        q: 'How long will my watchlist take?',
        a: ['Watchlist → Queue shows the total time to finish it at your usual pace. Sort by “Quickest first” to find short ones.'],
      },
      {
        id: 'calendar',
        q: 'Can I put new episodes in my phone’s calendar?',
        a: [
          'Yes. On Up Next → “On the way”, tap “Add to calendar”. It makes a file that works with iPhone, Google and Outlook calendars.',
          'It is a copy of the dates at that moment. Do it again later to add new episodes; it offers to add only the ones you haven’t added before.',
        ],
      },
      {
        id: 'spoilers',
        q: 'How do I avoid spoilers?',
        a: [
          'Turn on Settings → Spoiler shield. Episodes you haven’t watched show as “Episode 6” with no title or summary. Tap an episode, then “Show anyway”, to see one.',
        ],
      },
    ],
  },
  {
    id: 'stats',
    title: 'Stats & badges',
    items: [
      {
        id: 'goals',
        q: 'Can I set a goal for the year?',
        a: ['Yes. Open Stats → Overview and tap the Goals card. Set a target for episodes, movies or hours.'],
      },
      {
        id: 'review',
        q: 'What are Year in review and Month in review?',
        a: [
          'Summaries of what you watched, in Stats → Overview. “Save image” makes a picture you can share. “This month vs last year” compares this month with the same month last year.',
        ],
      },
      {
        id: 'badges',
        q: 'How do badges work?',
        a: [
          'Stats → Badges has 15 badges. Each has 6 levels: Bronze, Silver, Gold, Platinum, Diamond and Legend. When you reach a new level, a “New badge!” note appears.',
        ],
      },
      {
        id: 'world',
        q: 'What is the World tab?',
        a: ['A map of the countries and languages of everything you have watched.'],
      },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Shortcuts',
    items: [
      {
        id: 'keys',
        q: 'Keyboard shortcuts (computer)',
        a: [
          'On a computer you can use these keys. They don’t work while you are typing in a box. Press ? anywhere to see this list.',
        ],
        keys: true,
      },
      {
        id: 'icon',
        q: 'App icon shortcuts',
        a: [
          'If you installed WatchNext as an app, the app icon has three shortcuts: Up Next, Search and Tonight.',
        ],
        steps: [
          'Windows: right-click the WatchNext icon on the taskbar or in the Start menu.',
          'Android: press and hold the app icon.',
          'Mac: right-click the icon in the Dock.',
          'iPhone and iPad: not available. Apple doesn’t support this for web apps yet.',
        ],
      },
      {
        id: 'install',
        q: 'How do I install WatchNext as an app?',
        steps: [
          'iPhone: open the site in Safari, tap Share → “Add to Home Screen”.',
          'Android: in Chrome, tap ⋮ → “Add to Home screen” or “Install app”.',
          'Windows or Mac: in Chrome or Edge, click the install icon at the right of the address bar.',
        ],
      },
    ],
  },
  {
    id: 'data',
    title: 'Sync, backup & your data',
    items: [
      {
        id: 'sync',
        q: 'How do I use WatchNext on my phone and computer?',
        a: [
          'Sign in with Google in Settings → Sync across devices, on each device. Your shows, movies, ratings, goals, lists and the people you follow then sync by themselves.',
        ],
      },
      {
        id: 'device-only',
        q: 'Which settings stay on one device only?',
        a: ['These don’t sync. Set them on each phone or computer you use:'],
        steps: [
          'Region and My services',
          'Spoiler shield',
          'Your recent changes (the undo list)',
          'Calendar export memory, saved scores and badge notes',
        ],
      },
      {
        id: 'undo',
        q: 'I changed something by mistake. Can I undo it?',
        a: ['Yes. Settings → Your recent changes lists your last 50 changes. Tap “Undo” on the one you want to take back.'],
      },
      {
        id: 'backup',
        q: 'How do I make a backup?',
        a: [
          'Settings → Backup → download a backup file now and then. You can restore it on any device from the same card.',
          'If dates were lost, “Bring back first watch dates” takes the first dates from an older backup.',
        ],
      },
      {
        id: 'import',
        q: 'Can I bring my history from Letterboxd or TV Time?',
        a: [
          'Letterboxd: on letterboxd.com go to Settings → Import & Export → “Export your data”. Then in WatchNext open Settings → Import from Letterboxd and choose the zip file.',
          'TV Time: Settings → Import TV Time history has the steps.',
        ],
      },
      {
        id: 'tmdb-key',
        q: 'Do I need a TMDB API key?',
        a: [
          'No. WatchNext has one built in. Only add your own in Settings → TMDB API key if you are asked to.',
        ],
      },
      {
        id: 'csv',
        q: 'Can I get my data into Excel or Power BI?',
        a: ['Yes. Settings → Export for Power BI downloads CSV files: one for your episodes, one for your shows and one for your movies.'],
      },
    ],
  },
  {
    id: 'faq',
    title: 'Problems & FAQ',
    items: [
      {
        id: 'clear-data',
        q: 'Should I “Clear site data” or clear the browser’s storage?',
        a: [
          'No, please don’t. Your library lives in the browser, so clearing site data erases it on that device. If something looks wrong, try the steps below first, and make a backup (Settings → Backup).',
        ],
      },
      {
        id: 'old-version',
        q: 'The app looks old after an update.',
        steps: [
          'iPhone: close the app fully (swipe it away) and open it again.',
          'Computer: press Ctrl+Shift+R (Cmd+Shift+R on a Mac).',
          'Still old? Wait a few minutes; the update may still be going live.',
        ],
      },
      {
        id: 'no-posters',
        q: 'There are no posters or episodes.',
        a: [
          'Check you are online. Your own library works offline, but posters, episodes and scores need the internet.',
        ],
      },
      {
        id: 'no-scores',
        q: 'I don’t see IMDb or Rotten Tomatoes scores.',
        a: [
          'Scores need the internet, and some titles have no scores. New titles are checked again after a few days.',
        ],
      },
      {
        id: 'missing-on-device',
        q: 'My shows are missing on my other device.',
        a: [
          'Make sure you are signed in with the same Google account on both devices (Settings → Sync across devices). Changes take a few seconds to arrive.',
        ],
      },
      {
        id: 'other-account',
        q: 'It asks about a different Google account.',
        a: [
          'This device already holds a library from another Google account. Read the message carefully and choose. If you’re not sure, press “Cancel”: it signs out again and nothing changes.',
        ],
      },
      {
        id: 'delete',
        q: 'What is the difference between “Delete all data” and “Delete everywhere”?',
        a: [
          '“Delete all data” clears this device only; your cloud copy stays. “Delete everywhere” deletes your library on all your devices and in the cloud. Both are in the Danger zone at the bottom of Settings. Make a backup first.',
        ],
      },
    ],
  },
];
