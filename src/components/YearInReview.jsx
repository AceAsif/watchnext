import React, { useState } from 'react';
import { img } from '../api/tmdb.js';

// Public app URL — included in the share text so a screenshot/link points people
// back to WatchNext.
const APP_URL = 'https://aceasif.github.io/watchnext/';

// The card is styled inline (rather than in styles.css) on purpose: it's a
// self-contained shareable artifact meant to look right when screenshotted,
// with no hover/interactive state to need a stylesheet. It reuses the app's
// design tokens via var(--...) so it still matches the theme.
const cardStyle = {
  maxWidth: 430,
  margin: '10px auto 0',
  borderRadius: 18,
  border: '1px solid var(--line)',
  background:
    'radial-gradient(120% 80% at 0% 0%, rgba(242,163,60,0.16), transparent 55%), ' +
    'radial-gradient(120% 80% at 100% 100%, rgba(86,200,181,0.14), transparent 55%), ' +
    'var(--bg-card)',
  padding: '22px 20px 18px',
  overflow: 'hidden',
};
const kicker = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-dim)',
};

function StatBox({ big, label }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em' }}>{big}</div>
      <div style={{ ...kicker, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <div style={kicker}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default function YearInReview({ data, years, onYear }) {
  const [copied, setCopied] = useState(false);
  if (!data) return null;

  const share = async () => {
    const text = [
      `My ${data.year} in review on WatchNext:`,
      `${data.episodes.toLocaleString()} episodes (${data.hours.toLocaleString()} hrs) + ${data.movies} movie${data.movies === 1 ? '' : 's'}.`,
      data.topShows[0] ? `Top show: ${data.topShows[0].name}.` : '',
      data.busiestMonth ? `Busiest month: ${data.busiestMonth.name}.` : '',
    ].filter(Boolean).join(' ');

    try {
      if (navigator.share) {
        await navigator.share({ title: 'WatchNext — Year in Review', text, url: APP_URL });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // user dismissed the share sheet
    }
    try {
      await navigator.clipboard.writeText(`${text} ${APP_URL}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — nothing more we can do without a dependency */
    }
  };

  return (
    <>
      <div className="lib-controls" style={{ marginTop: 4 }}>
        <h2 className="section" style={{ margin: 0 }}>Year in review</h2>
        <div className="row" style={{ gap: 8 }}>
          <div className="sort-field">
            <label htmlFor="yir-year" className="muted" style={{ fontSize: 13 }}>Year</label>
            <select id="yir-year" className="select" value={data.year} onChange={(e) => onYear(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button className="btn primary" type="button" onClick={share}>
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>
            Watch<span style={{ color: 'var(--amber)' }}>Next</span>
          </span>
          <span style={{ ...kicker, letterSpacing: '0.14em' }}>Year in review</span>
        </div>

        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(52px, 16vw, 72px)', lineHeight: 1, letterSpacing: '-0.03em', margin: '8px 0 2px' }}>
          {data.year}
        </div>
        {data.epDelta != null && (
          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
            {data.epDelta >= 0 ? '▲' : '▼'} {Math.abs(data.epDelta)}% {data.epDelta >= 0 ? 'more' : 'fewer'} episodes than {data.prevYear}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '14px 0 16px' }}>
          <StatBox big={data.episodes.toLocaleString()} label="Episodes" />
          <StatBox big={data.hours.toLocaleString()} label="Hours" />
          <StatBox big={data.movies.toLocaleString()} label="Movies" />
          <StatBox big={data.activeDays.toLocaleString()} label="Days watched" />
        </div>

        {data.topShows.length > 0 && (
          <>
            <div style={{ ...kicker, marginBottom: 8 }}>Top shows</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {data.topShows.map((sh) => (
                <div key={sh.name} style={{ width: '33.33%', minWidth: 0 }}>
                  {img(sh.poster) ? (
                    <img src={img(sh.poster)} alt="" style={{ width: '100%', aspectRatio: '2 / 3', objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '2 / 3', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-raise)' }} />
                  )}
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sh.name}>{sh.name}</div>
                  <div className="muted" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{sh.count} eps</div>
                </div>
              ))}
            </div>
          </>
        )}

        {(data.busiestMonth || data.topGenre) && (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            {data.busiestMonth && <Fact label="Busiest month" value={data.busiestMonth.name} />}
            {data.topGenre && <Fact label="Top genre" value={data.topGenre} />}
          </div>
        )}

        <div className="muted" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginTop: 14, textAlign: 'right' }}>
          aceasif.github.io/watchnext
        </div>
      </div>
    </>
  );
}
