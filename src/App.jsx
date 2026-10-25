import React, { useEffect, useRef, useState } from 'react';
import UpNext from './pages/UpNext.jsx';
import ShowDetail from './pages/ShowDetail.jsx';
import { initCloudSync } from './store/cloud.js';
import Shows from './pages/Shows.jsx';
import Movies from './pages/Movies.jsx';
import Watchlist from './pages/Watchlist.jsx';
import Stats from './pages/Stats.jsx';
import Settings from './pages/Settings.jsx';
import Search from './pages/Search.jsx';
import Notes from './pages/Notes.jsx';
import Help from './pages/Help.jsx';
import Compare from './pages/Compare.jsx';
import DialogHost from './components/DialogHost.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import AccountSwitchSheet from './components/AccountSwitchSheet.jsx';
import AccountChip from './components/AccountChip.jsx';
import BadgeNote from './components/BadgeNote.jsx';
import { useKeyboardShortcuts, ShortcutsSheet } from './components/KeyboardShortcuts.jsx';
import { newNotesMemo } from './components/notesSearchLogic.js';
import { launchTarget, cleanLaunchUrl } from './components/launchShortcutsLogic.js';

// Home-screen / taskbar shortcut the app was opened from ("./?go=search" etc.), read once.
const LAUNCH = typeof window !== 'undefined' ? launchTarget(window.location.search) : null;

const TABS = [
  {
    id: 'next',
    label: 'Up Next',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 4l14 8-14 8V4z" />
      </svg>
    ),
  },
  {
    id: 'shows',
    label: 'Shows',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="13" rx="2" />
        <path d="M8 21h8" />
      </svg>
    ),
  },
  {
    id: 'movies',
    label: 'Movies',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M7 4v5M12 4v5M17 4v5" />
      </svg>
    ),
  },
  {
    id: 'watchlist',
    label: 'Watchlist',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />
      </svg>
    ),
  },
  {
    id: 'stats',
    label: 'Stats',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function App() {
  const [tab, setTab] = useState('next');
  const [showOpen, setShowOpen] = useState(null); // show id or null
  const [searching, setSearching] = useState(LAUNCH === 'search');
  // "Tonight" shortcut: open Up Next with the "What should I watch tonight?" sheet, once.
  const [tonightOnStart, setTonightOnStart] = useState(LAUNCH === 'tonight');
  // "Your notes" (opened from Stats) lives here, not inside Stats, so opening a show
  // from it and pressing Back returns to the same search, filters and scroll.
  const [notesOpen, setNotesOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false); // Stats → Friends
  const notesMemo = useRef(newNotesMemo());
  // Which Stats section to open with ("See badges" opens Badges); the key re-opens Stats there.
  const [statsStart, setStatsStart] = useState({ tab: 'Overview', n: 0 });

  useEffect(() => {
    const unsub = initCloudSync();
    return unsub;
  }, []);

  // Take "?go=…" out of the address so a reload opens the app as normal.
  useEffect(() => {
    const clean = cleanLaunchUrl(window.location.href);
    if (clean) try { window.history.replaceState(window.history.state, '', clean); } catch { /* ignore */ }
  }, []);

  const openShow = (id) => setShowOpen(id);
  const closeShow = () => setShowOpen(null);
  const [keysOpen, setKeysOpen] = useState(false);
  // Help & FAQ (Settings → Help & FAQ, or the keyboard list's link). `at` = section to open at.
  const [help, setHelp] = useState(null); // null | { at }
  const openHelp = (at = null) => { setHelp({ at }); setTab('settings'); closeShow(); setSearching(false); setNotesOpen(false); setCompareOpen(false); setKeysOpen(false); };

  // Same as tapping a tab in the tab bar.
  const goTab = (id) => {
    setTab(id);
    if (id === 'stats' && statsStart.tab !== 'Overview') setStatsStart((s) => ({ tab: 'Overview', n: s.n + 1 }));
    closeShow();
    setSearching(false);
    setNotesOpen(false);
    setCompareOpen(false);
    setHelp(null);
  };
  const openSearch = () => {
    setSearching(true);
    setShowOpen(null);
  };

  // Computer keyboard shortcuts: "/" search, 1–6 tabs, Esc back, "?" the list.
  useKeyboardShortcuts(
    {
      search: () => {
        if (!searching) return openSearch();
        const box = document.querySelector('input[type="search"]');
        if (box) { box.focus(); box.select(); }
      },
      tab: goTab,
      back: () => {
        if (searching) setSearching(false);
        else if (showOpen) closeShow();
        else if (notesOpen) setNotesOpen(false);
        else if (compareOpen) setCompareOpen(false);
        else if (help) setHelp(null);
      },
      help: () => setKeysOpen(true),
    },
    searching || !!showOpen || notesOpen || compareOpen || !!help,
  );

  return (
    <div className="app">
      <OfflineBanner />
      <header className="masthead">
        <h1>
          Watch<span>Next</span>
        </h1>
        <span style={{ marginLeft: 'auto', minWidth: 0 }}>
          <AccountChip onOpen={() => { setTab('settings'); closeShow(); setSearching(false); setNotesOpen(false); setCompareOpen(false); setHelp(null); }} />
        </span>
        <button
          className="sd-ib masthead-search"
          onClick={openSearch}
          aria-label="Search shows and movies"
          title="Search (/)"
          style={{ color: searching ? 'var(--amber)' : 'var(--text)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </button>
      </header>

      {searching ? (
        <Search
          openShow={openShow}
          onClose={() => setSearching(false)}
        />
      ) : showOpen ? (
        <ShowDetail id={showOpen} onBack={closeShow} />
      ) : notesOpen ? (
        <Notes memo={notesMemo.current} openShow={openShow} onBack={() => setNotesOpen(false)} />
      ) : compareOpen ? (
        <Compare openShow={openShow} onBack={() => setCompareOpen(false)} />
      ) : help ? (
        <Help startAt={help.at} onBack={() => setHelp(null)} />
      ) : (
        <>
          {tab === 'next' && <UpNext openShow={openShow} startTonight={tonightOnStart} onStartedTonight={() => setTonightOnStart(false)} />}
          {tab === 'shows' && <Shows openShow={openShow} />}
          {tab === 'movies' && <Movies />}
          {tab === 'watchlist' && <Watchlist openShow={openShow} />}
          {tab === 'stats' && <Stats key={statsStart.n} startTab={statsStart.tab} onOpenNotes={() => { notesMemo.current = newNotesMemo(); setNotesOpen(true); }} onOpenCompare={() => setCompareOpen(true)} />}
          {tab === 'settings' && <Settings onOpenHelp={() => openHelp()} />}
        </>
      )}

      <AccountSwitchSheet />
      <DialogHost />
      <ShortcutsSheet open={keysOpen} onClose={() => setKeysOpen(false)} onOpenHelp={() => openHelp('shortcuts')} />
      <BadgeNote onOpen={() => { setStatsStart((s) => ({ tab: 'Badges', n: s.n + 1 })); setTab('stats'); closeShow(); setSearching(false); setNotesOpen(false); setCompareOpen(false); setHelp(null); }} />

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            className={tab === t.id && !showOpen && !searching ? 'active' : ''}
            title={`${t.label} (${i + 1})`}
            onClick={() => goTab(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
