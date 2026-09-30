import React, { useState } from 'react';
import { img, tvAggregateCredits, personCombinedCredits } from '../api/tmdb.js';

// Tap-through cast & crew for a show. Lazy-loaded (one extra TMDB call) behind
// a "Cast & crew" button so opening a show stays cheap. Tapping a person opens
// an overlay of everything else they're in, with titles already in the user's
// library flagged. Self-contained + inline-styled per the project convention.

const YEAR = (s) => (s || '').slice(0, 4);
const nameOf = (c) => c.title || c.name || '';
const dateOf = (c) => c.release_date || c.first_air_date || '';

// A person's other work: merge their acting + crew credits, one row per title,
// drop the show we're already on, and sort so their better-known work leads.
function mergeCredits(combined, excludeTvId) {
  const byKey = new Map();
  const push = (c, role) => {
    if (!c || !c.id || !c.media_type) return;
    if (c.media_type !== 'tv' && c.media_type !== 'movie') return;
    if (c.media_type === 'tv' && c.id === excludeTvId) return;
    const key = c.media_type + ':' + c.id;
    const existing = byKey.get(key);
    if (existing) {
      if (role && !existing.roles.includes(role)) existing.roles.push(role);
      return;
    }
    byKey.set(key, {
      key,
      id: c.id,
      media_type: c.media_type,
      name: nameOf(c),
      year: YEAR(dateOf(c)),
      poster: c.poster_path || null,
      vote: c.vote_count || 0,
      pop: c.popularity || 0,
      roles: role ? [role] : [],
    });
  };
  (combined.cast || []).forEach((c) => push(c, c.character));
  (combined.crew || []).forEach((c) => push(c, c.job));
  return [...byKey.values()].sort(
    (a, b) => b.vote - a.vote || b.pop - a.pop
  );
}

function PersonOverlay({ person, excludeTvId, trackedTv, trackedMovie, onClose }) {
  const [credits, setCredits] = useState(null);
  const [err, setErr] = useState(null);

  React.useEffect(() => {
    let alive = true;
    personCombinedCredits(person.id)
      .then((d) => alive && setCredits(mergeCredits(d, excludeTvId)))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [person.id]);

  const scrim = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 50,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  };
  const sheet = {
    background: 'var(--bg-raise)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius) var(--radius) 0 0',
    width: '100%',
    maxWidth: 640,
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
  };

  return (
    <div style={scrim} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          {person.profile ? (
            <img
              src={img(person.profile, 'w185')}
              alt=""
              style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: 46, height: 46, borderRadius: '50%', flex: 'none',
                background: 'var(--bg-card)', border: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 16,
              }}
            >
              {(person.name || '?').slice(0, 1)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, lineHeight: 1.15 }}>
              {person.name}
            </div>
            {person.sub && (
              <div className="muted" style={{ fontSize: 12.5 }}>{person.sub}</div>
            )}
          </div>
          <button className="btn" onClick={onClose} style={{ flex: 'none' }}>Close</button>
        </div>

        {err && <p className="muted">Couldn’t load credits: {err}</p>}
        {!credits && !err && <p className="muted">Loading credits…</p>}

        {credits && credits.length === 0 && (
          <p className="muted">No other titles found.</p>
        )}

        {credits && credits.length > 0 && (
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {credits.map((c) => {
              const tracked =
                c.media_type === 'tv' ? trackedTv.has(c.id) : trackedMovie.has(c.id);
              return (
                <div
                  key={c.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--bg-card)', border: '1px solid var(--line)',
                    borderRadius: 10, padding: 8,
                  }}
                >
                  {c.poster ? (
                    <img
                      src={img(c.poster, 'w92')}
                      alt=""
                      style={{ width: 34, aspectRatio: '2/3', borderRadius: 5, objectFit: 'cover', display: 'block', flex: 'none' }}
                    />
                  ) : (
                    <div style={{ width: 34, aspectRatio: '2/3', borderRadius: 5, background: 'var(--bg-raise)', flex: 'none' }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {c.media_type === 'tv' ? 'TV' : 'Film'}
                      {c.year ? ` · ${c.year}` : ''}
                      {c.roles.length ? ` · ${c.roles.slice(0, 2).join(', ')}` : ''}
                    </div>
                  </div>
                  {tracked && (
                    <span
                      className="chip"
                      style={{
                        flex: 'none', cursor: 'default', fontSize: 11,
                        color: 'var(--amber)', borderColor: 'var(--amber)',
                        background: 'var(--amber-soft)', padding: '3px 9px',
                      }}
                    >
                      ✓ In library
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CastCrew({ tmdbId, trackedTv, trackedMovie }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [person, setPerson] = useState(null);

  async function load() {
    if (data || !tmdbId) return;
    try {
      setData(await tvAggregateCredits(tmdbId));
    } catch (e) {
      setErr(e.message);
    }
  }

  if (!tmdbId) return null;

  const cast = (data && data.cast ? data.cast : []).slice(0, 30);
  // Crew rolled up per person, jobs joined, key roles first.
  const crewMap = new Map();
  (data && data.crew ? data.crew : []).forEach((c) => {
    const jobs = (c.jobs || []).map((j) => j.job);
    const ex = crewMap.get(c.id);
    if (ex) {
      jobs.forEach((j) => ex.jobs.add(j));
    } else {
      crewMap.set(c.id, {
        id: c.id, name: c.name, profile: c.profile_path,
        department: c.department, jobs: new Set(jobs),
      });
    }
  });
  const KEY_JOBS = ['Director', 'Creator', 'Writer', 'Screenplay', 'Executive Producer'];
  const crew = [...crewMap.values()]
    .map((c) => ({ ...c, jobList: [...c.jobs] }))
    .filter((c) => c.jobList.some((j) => KEY_JOBS.includes(j)))
    .slice(0, 12);

  return (
    <div className="section" style={{ marginTop: 18 }}>
      <div className="row" style={{ marginBottom: open ? 10 : 0 }}>
        <div className="muted" style={{ fontSize: 12 }}>Cast &amp; crew</div>
        <div className="spacer" />
        <button
          className="btn"
          onClick={() => {
            setOpen(!open);
            if (!open) load();
          }}
          style={{ padding: '3px 10px', fontSize: 11.5 }}
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open && err && <p className="muted">Couldn’t load cast: {err}</p>}
      {open && !data && !err && <p className="muted">Loading cast…</p>}

      {open && data && (
        <>
          {cast.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>No cast listed on TMDB.</p>
          ) : (
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
              {cast.map((c) => (
                <button
                  key={c.id}
                  onClick={() =>
                    setPerson({
                      id: c.id,
                      name: c.name,
                      profile: c.profile_path,
                      sub: (c.roles || []).map((r) => r.character).filter(Boolean).slice(0, 2).join(', '),
                    })
                  }
                  style={{
                    flex: 'none', width: 78, background: 'none', border: 'none',
                    padding: 0, cursor: 'pointer', textAlign: 'center', color: 'var(--text)',
                  }}
                >
                  {c.profile_path ? (
                    <img
                      src={img(c.profile_path, 'w185')}
                      alt=""
                      style={{ width: 78, height: 78, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 78, height: 78, borderRadius: '50%',
                        background: 'var(--bg-card)', border: '1px solid var(--line)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 22,
                      }}
                    >
                      {(c.name || '?').slice(0, 1)}
                    </div>
                  )}
                  <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.2 }}>{c.name}</div>
                  {(c.roles || [])[0] && (
                    <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.2 }}>
                      {c.roles[0].character}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {crew.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 7 }}>Crew</div>
              <div className="chips">
                {crew.map((c) => (
                  <button
                    key={c.id}
                    className="chip"
                    onClick={() => setPerson({ id: c.id, name: c.name, profile: c.profile, sub: c.jobList.slice(0, 3).join(', ') })}
                    style={{ cursor: 'pointer' }}
                    title={c.jobList.join(', ')}
                  >
                    {c.name}
                    <span className="muted" style={{ fontSize: 10.5, marginLeft: 6 }}>
                      {c.jobList.filter((j) => KEY_JOBS.includes(j))[0] || c.department}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {person && (
        <PersonOverlay
          person={person}
          excludeTvId={tmdbId}
          trackedTv={trackedTv}
          trackedMovie={trackedMovie}
          onClose={() => setPerson(null)}
        />
      )}
    </div>
  );
}
