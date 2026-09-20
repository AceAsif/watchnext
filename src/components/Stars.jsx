import React, { useState } from 'react';

const STAR = 'M12 17.3l-6.2 3.7 1.6-7.1L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.4 4.7 1.6 7.1z';

function StarIcon({ filled, size }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d={STAR} />
    </svg>
  );
}

// A 5-star rating. Interactive by default; pass readOnly to just display.
// value is 0–5. onChange(n) fires on click; clicking the current value clears
// it back to 0 so a rating can be removed.
export default function Stars({ value = 0, onChange, size = 20, readOnly = false }) {
  const [hover, setHover] = useState(0);

  if (readOnly) {
    return (
      <span className="stars ro" role="img" aria-label={`${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={'star' + (n <= value ? ' on' : '')}>
            <StarIcon filled={n <= value} size={size} />
          </span>
        ))}
      </span>
    );
  }

  const active = hover || value;
  return (
    <span
      className="stars"
      role="radiogroup"
      aria-label="Rate"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={'star' + (n <= active ? ' on' : '')}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={n <= value}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n === value ? 0 : n)}
        >
          <StarIcon filled={n <= active} size={size} />
        </button>
      ))}
    </span>
  );
}
