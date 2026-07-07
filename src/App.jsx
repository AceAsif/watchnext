import React, { useEffect, useState } from 'react';
import UpNext from './pages/UpNext.jsx';
import ShowDetail from './pages/ShowDetail.jsx';
import { initCloudSync } from './store/cloud.js';
import Shows from './pages/Shows.jsx';
import Movies from './pages/Movies.jsx';
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" />
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
