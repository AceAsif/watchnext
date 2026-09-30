import React, { useEffect, useState } from 'react';
import { img, tvDetailsWithCredits, personCombinedCredits } from '../api/tmdb.js';
import { Avatar, Chevron, Sheet } from './ui.jsx';
import { summarizeCredits, mergeCredits } from './creditsLogic.js';

// Cast & crew card for the show page.
//   card:   avatar stack + first names → "See all" cast sheet
//           "Created by" row
//           "Full crew · N directors" → crew sheet
//   sheets: cast grid, crew list, and (tapping anyone) that person's other
//           titles with anything already in the library flagged.
// One TMDB request loads details + credits together (see tvDetailsWithCredits).

// ---------------------------------------------------------------- person sheet
function PersonSheet({ person, excludeTvId, trackedTv, trackedMovie, onClose }) {
  const [credits, setCredits] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setCredits(null);
    setErr(null);
    personCombinedCredits(person.id)
      .then((d) => alive && setCredits(mergeCredits(d, excludeTvId)))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [person.id]);

  return (
    <Sheet open title={person.name} subtitle={person.sub || 'Other titles'} onClose={onClose}>
      {err && <p className="muted">Couldn’t load credits: {err}</p>}
      {!credits && !err && <p className="muted">Loading credits…</p>}
      {credits && credits.length === 0 && <p className="muted">No other titles found.</p>}
      {credits && credits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {credits.map((c) => {
            const tracked = c.media_type === 'tv' ? trackedTv.has(c.id) : trackedMovie.has(c.id);
            return (
              <div
                key={c.key}
                className="sd-card"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8 }}
              >
                {c.poster ? (
                  <img
                    src={img(c.poster, 'w92')}
                    alt=""
                    loading="lazy"
                    style={{ width: 34, aspectRatio: '2/3', borderRadius: 5, objectFit: 'cover', flex: 'none' }}
                  />
                ) : (
                  <div style={{ width: 34, aspectRatio: '2/3', borderRadius: 5, background: 'var(--bg-card)', flex: 'none' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sd-ell" style={{ fontSize: 14 }}>{c.name}</div>
                  <div className="sd-ell" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {c.media_type === 'tv' ? 'TV' : 'Film'}
                    {c.year ? ` · ${c.year}` : ''}
                    {c.roles.length ? ` · ${c.roles.slice(0, 2).join(', ')}` : ''}
                  </div>
                </div>
                {tracked && (
                  <span
                    className="sd-mono"
                    style={{
                      flex: 'none', fontSize: 11, color: 'var(--amber)', background: 'var(--amber-soft)',
                      border: '1px solid var(--amber)', borderRadius: 999, padding: '3px 9px',
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
    </Sheet>
  );
}

// ---------------------------------------------------------------- the card
export default function CastCrew({ tmdbId, trackedTv, trackedMovie }) {
  const [data, setData] = useState(null); // summarizeCredits() output
  const [err, setErr] = useState(null);
  const [sheet, setSheet] = useState(null); // 'cast' | 'crew' | null
  const [person, setPerson] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setErr(null);
    tvDetailsWithCredits(tmdbId)
      .then((d) => alive && setData(summarizeCredits(d)))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [tmdbId]);

  const openPerson = (p, sub) => setPerson({ id: p.id, name: p.name, sub: sub || '' });

  // ---- loading / error: keep the card's footprint so the page doesn't jump
  if (err || !data) {
    return (
      <section className="sd-card" style={{ margin: '16px 0 0' }}>
        <div className="sd-row" style={{ minHeight: 72, cursor: 'default' }}>
          <span className="sd-h2" style={{ fontSize: 16 }}>Cast</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {err ? `Couldn’t load cast: ${err}` : 'Loading…'}
          </span>
        </div>
      </section>
    );
  }

  const { cast, created, directors, groups, crewTotal } = data;
  // Seven circles fit a phone-width row. When there's more cast than that, the
  // seventh circle becomes a "+N" chip instead of a second line of text (a
  // separate "+ 5" label plus "SEE ALL" doesn't fit in 328px and wraps).
  const SLOTS = 7;
  const overflow = cast.length > SLOTS;
  const stack = cast.slice(0, overflow ? SLOTS - 1 : SLOTS);
  const more = cast.length - stack.length;
  const names = cast.slice(0, 3).map((c) => c.name).join(', ');
  const crewLabel = directors.length
    ? `${directors.length} director${directors.length === 1 ? '' : 's'}`
    : `${crewTotal} credited`;

  return (
    <>
      <section className="sd-card" style={{ margin: '16px 0 0' }}>
        {cast.length > 0 && (
          <button
            className="sd-row"
            style={{ paddingTop: 12, paddingBottom: 12 }}
            onClick={() => setSheet('cast')}
            aria-label="Cast: see all"
          >
            <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="sd-h2" style={{ fontSize: 16 }}>Cast</span>
              <span style={{ display: 'flex', alignItems: 'center' }}>
                {stack.map((p, i) => (
                  <Avatar
                    key={p.id}
                    name={p.name}
                    path={p.profile}
                    size={40}
                    tint={i}
                    ring
                    style={{ marginLeft: i === 0 ? 0 : -10 }}
                  />
                ))}
                {overflow && (
                  <span
                    className="sd-avatar sd-mono"
                    aria-label={`${more} more`}
                    style={{
                      width: 40, height: 40, marginLeft: -10, boxSizing: 'border-box',
                      border: '2px solid var(--bg-raise)', background: 'var(--line)',
                      fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 12,
                      color: 'var(--text-dim)', whiteSpace: 'nowrap',
                    }}
                  >
                    {more > 99 ? '99+' : `+${more}`}
                  </span>
                )}
              </span>
              <span className="sd-ell" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {names}
                {cast.length > 3 ? '…' : ''}
              </span>
            </span>
            <span className="sd-mono" style={{ fontSize: 11, color: 'var(--amber)', whiteSpace: 'nowrap', flex: 'none' }}>SEE ALL</span>
            <Chevron />
          </button>
        )}

        {created.length > 0 && (
          <div
            className={'sd-row' + (cast.length > 0 ? ' sd-sep' : '')}
            style={{ alignItems: 'baseline', paddingTop: 14, paddingBottom: 14, cursor: 'default' }}
          >
            <span className="sd-lbl" style={{ width: 84, flexShrink: 0, fontSize: 10 }}>Created by</span>
            <span style={{ fontWeight: 500 }}>{created.join(', ')}</span>
          </div>
        )}

        {groups.length > 0 && (
          <button
            className={'sd-row' + (cast.length > 0 || created.length > 0 ? ' sd-sep' : '')}
            onClick={() => setSheet('crew')}
          >
            <span style={{ flexGrow: 1 }}>
              Full crew{' '}
              <span className="sd-mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                · {crewLabel}
              </span>
            </span>
            <Chevron />
          </button>
        )}

        {cast.length === 0 && groups.length === 0 && created.length === 0 && (
          <div className="sd-row" style={{ color: 'var(--text-dim)', cursor: 'default' }}>
            No cast or crew listed on TMDB.
          </div>
        )}
      </section>

      {/* ---- cast sheet */}
      <Sheet
        open={sheet === 'cast'}
        title="Cast"
        subtitle="Tap a person for their other titles"
        onClose={() => setSheet(null)}
      >
        <div className="sd-cast-grid">
          {cast.slice(0, 60).map((c, i) => (
            <button key={c.id} className="sd-cast-cell" onClick={() => openPerson(c, c.character)}>
              <Avatar name={c.name} path={c.profile} size={56} tint={i} />
              <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2 }}>{c.name}</span>
              {c.character && (
                <span className="sd-ell" style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: '100%' }}>
                  {c.character}
                </span>
              )}
            </button>
          ))}
        </div>
      </Sheet>

      {/* ---- crew sheet */}
      <Sheet
        open={sheet === 'crew'}
        title="Crew"
        subtitle="Tap a person for their other titles"
        onClose={() => setSheet(null)}
      >
        {created.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="sd-lbl" style={{ marginBottom: 6 }}>Created by</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{created.join(', ')}</div>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.title} style={{ marginBottom: 14 }}>
            <div className="sd-lbl" style={{ marginBottom: 6 }}>
              {g.title} · {g.people.length}
            </div>
            <div className="sd-card">
              {g.people.slice(0, 40).map((p, i) => (
                <button
                  key={p.id}
                  className={'sd-row' + (i > 0 ? ' sd-sep' : '')}
                  style={{ minHeight: 52 }}
                  onClick={() => openPerson(p, p.jobs.join(', '))}
                >
                  <Avatar name={p.name} path={p.profile} size={32} tint={i} />
                  <span className="sd-ell" style={{ flexGrow: 1 }}>{p.name}</span>
                  <span className="sd-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {p.eps ? `${p.eps} ep` : ''}
                  </span>
                  <Chevron />
                </button>
              ))}
            </div>
          </div>
        ))}
      </Sheet>

      {/* ---- a person's other titles (opens on top of whichever sheet is up) */}
      {person && (
        <PersonSheet
          person={person}
          excludeTvId={tmdbId}
          trackedTv={trackedTv}
          trackedMovie={trackedMovie}
          onClose={() => setPerson(null)}
        />
      )}
    </>
  );
}
