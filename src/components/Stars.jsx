import React, { useId, useState } from 'react';
import { starFill, starFromPointer, starLabel } from './starsLogic.js';

const STAR = 'M12 17.3l-6.2 3.7 1.6-7.1L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.4 4.7 1.6 7.1z';

// fill: 'full' | 'half' | 'empty'. A half star is the outline plus its left half filled.
function StarIcon({ fill, size, clipId }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {fill === 'half' ? (
        <>
          <defs>
            <clipPath id={clipId}><rect x="0" y="0" width="12" height="24" /></clipPath>
          </defs>
          <path d={STAR} fill="currentColor" clipPath={`url(#${clipId})`} />
        </>
      ) : null}
      <path d={STAR} fill={fill === 'full' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// A 5-star rating. Interactive by default; pass readOnly to just display.
// value is 0–5 and may be a half (3.5). onChange(n) fires on click; clicking the current
// value clears it back to 0 so a rating can be removed.
// half: tapping the LEFT half of a star gives a half star (movies use this, like Letterboxd).
export default function Stars({ value = 0, onChange, size = 20, readOnly = false, half = false }) {
  const [hover, setHover] = useState(0);
  const uid = useId().replace(/:/g, '');
  const clip = (n) => `st${uid}-${n}`;

  if (readOnly) {
    return (
      <span className="stars ro" role="img" aria-label={`${starLabel(value)} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => {
          const f = starFill(value, n);
          return (
            <span key={n} className={'star' + (f !== 'empty' ? ' on' : '')}>
              <StarIcon fill={f} size={size} clipId={clip(n)} />
            </span>
          );
        })}
      </span>
    );
  }

  const active = hover || value;
  // Mouse/touch: which half was hit. Keyboard (Enter/Space gives detail 0): the whole star.
  const pick = (e, n) => {
    if (!half || !e || e.detail === 0 || !e.currentTarget || !e.currentTarget.getBoundingClientRect) return n;
    const r = e.currentTarget.getBoundingClientRect();
    return starFromPointer(n, e.clientX - r.left, r.width);
  };
  return (
    <span className="stars" role="radiogroup" aria-label="Rate" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const f = starFill(active, n);
        return (
          <button
            key={n}
            type="button"
            className={'star' + (f !== 'empty' ? ' on' : '')}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={n <= value}
            onMouseMove={(e) => setHover(pick(e, n))}
            onClick={(e) => { const v = pick(e, n); setHover(0); onChange(v === value ? 0 : v); }}
          >
            <StarIcon fill={f} size={size} clipId={clip(n)} />
          </button>
        );
      })}
    </span>
  );
}
