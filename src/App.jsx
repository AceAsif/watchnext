import React, { useEffect, useState } from 'react';
import UpNext from './pages/UpNext.jsx';
import ShowDetail from './pages/ShowDetail.jsx';
import { initCloudSync } from './store/cloud.js';
import Shows from './pages/Shows.jsx';
import Movies from './pages/Movies.jsx';
import Watchlist from './pages/Watchlist.jsx';
import Stats from './pages/Stats.jsx';
import Settings from './pages/Settings.jsx';

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

  useEffect(() => {
    const unsub = initCloudSync();
    return unsub;
  }, []);

  const openShow = (id) => setShowOpen(id);
  const closeShow = () => setShowOpen(null);

  return (
    <div className="app">
      <header className="masthead">
        <h1>
          Watch<span>Next</span>
        </h1>
        <span className="sub">personal tracker</span>
      </header>

      {showOpen ? (
        <ShowDetail id={showOpen} onBack={closeShow} />
      ) : (
        <>
          {tab === 'next' && <UpNext openShow={openShow} />}
          {tab === 'shows' && <Shows openShow={openShow} />}
          {tab === 'movies' && <Movies />}
          {tab === 'watchlist' && <Watchlist openShow={openShow} />}
          {tab === 'stats' && <Stats />}
          {tab === 'settings' && <Settings />}
        </>
      )}

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id && !showOpen ? 'active' : ''}
            onClick={() => {
              setTab(t.id);
              closeShow();
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
