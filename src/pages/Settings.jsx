import React, { useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { setTmdbKey, importTvTime, getState, resetAll } from '../store/db.js';

export default function Settings() {
  const state = useStore();
  const [key, setKey] = useState(state.settings.tmdbKey || '');
  const [msg, setMsg] = useState('');
  const fileRef = useRef();

  function saveKey() {
    setTmdbKey(key);
    setMsg('TMDB key saved. It stays in this browser only.');
  }

  function onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (!json.shows && !json.movies) {
          throw new Error('That file does not look like a WatchNext import.');
        }
        const res = importTvTime(json);
        setMsg(
          `Imported ${res.shows} shows and ${res.watches} new episode watches. ` +
            'Now add a TMDB key (if you have not) and run "Sync with TMDB" on the Shows tab.'
        );
      } catch (err) {
        setMsg('Import failed: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(getState(), null, 1)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `watchnext-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function reset() {
    if (confirm('Delete all local WatchNext data? This cannot be undone.')) {
      resetAll();
      setKey('');
      setMsg('All local data deleted.');
    }
  }

  return (
    <div>
      <h2 className="section">TMDB API key</h2>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        Show posters, episode lists and air dates come from The Movie Database.
        Create a free account at themoviedb.org, request an API key under
        Settings → API, and paste the v3 key here. The key is stored only in
        this browser.
      </p>
      <div className="row">
        <input
          type="password"
          placeholder="TMDB v3 API key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          style={{ flex: 1 }}
          autoComplete="off"
        />
        <button className="btn primary" onClick={saveKey}>
          Save key
        </button>
      </div>

      <h2 className="section">Import TV Time history</h2>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        Run <code>python tools/convert_tvtime.py gdpr-data.zip -o tvtime_import.json</code>{' '}
        on your TV Time export, then load the JSON here. Importing merges with
        anything already tracked; it never deletes.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        onChange={onImportFile}
        style={{ display: 'none' }}
      />
      <button className="btn primary" onClick={() => fileRef.current.click()}>
        Choose import file
      </button>

      {msg && <div className="notice accent">{msg}</div>}

      <h2 className="section">Backup</h2>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        Everything lives in this browser's storage. Download a backup now and
        then whenever you have marked a lot of episodes — a backup file can be
        re-imported on any device.
      </p>
      <div className="row">
        <button className="btn" onClick={exportBackup}>
          Download backup
        </button>
        <div className="spacer" />
        <button className="btn danger" onClick={reset}>
          Delete all data
        </button>
      </div>
    </div>
  );
}
