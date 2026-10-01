import React, { useEffect, useRef, useState } from 'react';
import { setShowAnime } from '../store/db.js';
import { searchAnime, fetchAnime } from '../api/anilist.js';
import { Chevron, Sheet } from './ui.jsx';
import {
  titleOf,
  titlesMatch,
  summaryLine,
  seasonLabel,
  statusLabel,
  formatLabel,
  nextEpisodeInfo,
  ageLabel,
  episodeCountNote,
} from './animeLogic.js';

// "Anime details" sheet — read-only metadata from AniList (no account, no
// OAuth). Two views:
//   search : find the right AniList entry (pre-filled with the show's name,
//            searched once on open) and tap "Use this" to link it.
//   detail : the linked entry's titles / format / studio / score / next episode,
//            with Refresh, Change match, Open on AniList and Unlink.
// Display only: linking never changes watch history, seasons or episode counts.
// The match is always the user's pick — fuzzy title matching is never trusted.

function Fact({ label, children, first }) {
  return (
    <div
      className={'sd-row' + (first ? '' : ' sd-sep')}
      style={{ alignItems: 'baseline', minHeight: 44, paddingTop: 10, paddingBottom: 10, cursor: 'default' }}
    >
      <span className="sd-lbl" style={{ width: 84, flexShrink: 0, fontSize: 10 }}>{label}</span>
      <span style={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

const Note = ({ children, color = 'var(--text-dim)' }) => (
  <p style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.45, color }}>{children}</p>
);

const DISPLAY_ONLY =
  'Display only — your watch history, seasons and episode counts are never changed.';

export default function AnimeSheet({ id, show, onClose }) {
  const linked = show.anime || null;
  const [mode, setMode] = useState(linked ? 'detail' : 'search');
  const [query, setQuery] = useState(show.name || '');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Guards against setting state after unmount, and against an older request
  // finishing after a newer one (rapid re-searches).
  const alive = useRef(true);
  const seq = useRef(0);
  useEffect(() => () => { alive.current = false; }, []);

  async function run(fn, onOk) {
    const mine = ++seq.current;
    setBusy(true);
    setErr(null);
    try {
      const out = await fn();
      if (alive.current && mine === seq.current) onOk(out);
    } catch (e) {
      if (alive.current && mine === seq.current) setErr(e.message || 'Something went wrong.');
    } finally {
      if (alive.current && mine === seq.current) setBusy(false);
    }
  }

  const doSearch = (q) => run(() => searchAnime(q), setResults);

  // One automatic search when opening an unlinked show; every later search is
  // an explicit tap, so a flaky or rate-limited API is never hammered.
  useEffect(() => {
    if (mode === 'search' && results === null && query.trim()) doSearch(query);
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) doSearch(query);
  };

  const link = (a) => {
    setShowAnime(id, a);
    setErr(null);
    setMode('detail');
  };

  // ---------------------------------------------------------------- search view
  if (mode === 'search' || !linked) {
    return (
      <Sheet open title="Link to AniList" subtitle={show.name} onClose={onClose}>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45 }}>
          Pick the AniList entry that matches this show. AniList lists each season
          separately, so check the year and episode count.
        </p>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search AniList"
            style={{
              flex: 1, minWidth: 0, height: 44, borderRadius: 12, border: '1px solid var(--line)',
              background: 'var(--bg-raise)', color: 'var(--text)', font: 'inherit', fontSize: 14,
              padding: '0 12px',
            }}
          />
          <button className="sd-btn" type="submit" disabled={busy || !query.trim()}>
            {busy ? 'Searching…' : 'Search'}
          </button>
        </form>

        {err && <Note color="var(--red)">{err}</Note>}
        {busy && !results && !err && <Note>Searching AniList…</Note>}

        {results && results.length === 0 && !err && (
          <Note>No matches. Try the English or romaji title.</Note>
        )}

        {results && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {results.map((a) => {
              const exact = titlesMatch(show.name, a);
              const meta = [seasonLabel(a.season, a.year), summaryLine(a)].filter(Boolean).join(' · ');
              return (
                <div
                  key={a.id}
                  className="sd-card"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 14px' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>{titleOf(a)}</div>
                    <div className="sd-ell" style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{meta}</div>
                    {exact && (
                      <span
                        className="sd-mono"
                        style={{
                          display: 'inline-block', marginTop: 6, fontSize: 10, letterSpacing: '0.06em',
                          color: 'var(--teal)', border: '1px solid rgba(86, 200, 181, 0.4)',
                          background: 'rgba(86, 200, 181, 0.08)', borderRadius: 999, padding: '2px 8px',
                        }}
                      >
                        EXACT TITLE MATCH
                      </span>
                    )}
                  </div>
                  <button
                    className="sd-btn primary"
                    style={{ height: 36, padding: '0 12px', fontSize: 13, flex: 'none' }}
                    onClick={() => link(a)}
                  >
                    Use this
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <Note>{DISPLAY_ONLY}</Note>
        {linked && (
          <button className="sd-linkbtn" style={{ marginTop: 12 }} onClick={() => { setErr(null); setMode('detail'); }}>
            ← Back to current match
          </button>
        )}
      </Sheet>
    );
  }

  // ---------------------------------------------------------------- detail view
  const a = linked;
  const next = nextEpisodeInfo(a.next);
  const countNote = episodeCountNote(show, a);
  const when = (ms) =>
    new Date(ms).toLocaleString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    });
  const names = [
    ['English', a.title.english],
    ['Romaji', a.title.romaji],
    ['Native', a.title.native],
  ].filter(([, v]) => v);

  const refresh = () =>
    run(() => fetchAnime(a.id), (fresh) => setShowAnime(id, fresh));

  // Format, status and when it aired read as one line: "TV · Airing · Spring 2016".
  const typeLine = [formatLabel(a.format), statusLabel(a.status), seasonLabel(a.season, a.year)]
    .filter(Boolean)
    .join(' · ');

  const eps = a.episodes
    ? `${a.episodes}${a.duration ? ` · ${a.duration} min each` : ''}`
    : a.status === 'RELEASING'
      ? `Still airing${a.duration ? ` · ${a.duration} min each` : ''}`
      : null;

  return (
    <Sheet open title="Anime details" subtitle={`AniList · ${ageLabel(a.syncedAt) || 'saved'}`} onClose={onClose}>
      <div className="sd-card">
        {names.map(([label, v], i) => (
          <Fact key={label} label={label} first={i === 0}>{v}</Fact>
        ))}
        {typeLine && <Fact label="Type" first={names.length === 0}>{typeLine}</Fact>}
        {eps && <Fact label="Episodes">{eps}</Fact>}
        {a.studios.length > 0 && <Fact label="Studio">{a.studios.join(', ')}</Fact>}
        {a.score !== null && <Fact label="Score">{a.score}%</Fact>}
        {a.genres.length > 0 && <Fact label="Genres">{a.genres.join(' · ')}</Fact>}
        {next && (
          <Fact label="Next ep">
            <span style={{ color: next.past ? 'var(--text-dim)' : 'var(--amber)' }}>
              {next.past
                ? `Episode ${next.episode} was due ${when(next.at)} — refresh for the latest`
                : `Episode ${next.episode} · ${when(next.at)} (${next.rel.replace(/ /g, '\u00a0')})`}
            </span>
          </Fact>
        )}
      </div>

      {countNote && <Note color="var(--amber)">{countNote} Your episode list is left as TMDB has it.</Note>}
      {err && <Note color="var(--red)">{err}</Note>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="sd-btn" style={{ flex: 1 }} onClick={refresh} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          className="sd-btn"
          style={{ flex: 1 }}
          onClick={() => { setErr(null); setMode('search'); }}
          disabled={busy}
        >
          Change match
        </button>
      </div>

      {a.url && (
        <div className="sd-card" style={{ marginTop: 8 }}>
          <a href={a.url} target="_blank" rel="noreferrer" className="sd-row" style={{ minHeight: 48 }}>
            <span style={{ flexGrow: 1, color: 'var(--sd-text-2)' }}>Open on AniList</span>
            <Chevron />
          </a>
        </div>
      )}

      <div className="sd-card" style={{ marginTop: 8 }}>
        <button
          className="sd-row"
          style={{ color: 'var(--red)', minHeight: 48 }}
          onClick={() => { setShowAnime(id, null); onClose(); }}
        >
          Unlink from AniList
        </button>
      </div>

      <Note>{DISPLAY_ONLY} Data from AniList.</Note>
    </Sheet>
  );
}
