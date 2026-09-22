import React from 'react';

// Colours are brightened so the name reads clearly on the dark theme; `dark`
// means the filled (selected) chip needs dark text for contrast. Add a
// platform by adding one row here — nothing else needs to change.
export const PLATFORMS = [
  { id: 'netflix', label: 'Netflix', color: '#E50914', dark: false },
  { id: 'disney', label: 'Disney+', color: '#4F86F7', dark: false },
  { id: 'prime', label: 'Prime Video', color: '#22B8F0', dark: true },
  { id: 'max', label: 'Max', color: '#A855F7', dark: false },
  { id: 'appletv', label: 'Apple TV+', color: '#B0B3B8', dark: true },
  { id: 'hulu', label: 'Hulu', color: '#1CE783', dark: true },
  { id: 'crunchyroll', label: 'Crunchyroll', color: '#F47521', dark: true },
  { id: 'other', label: 'Other / unofficial', color: '#9AA4B2', dark: true },
];

export function platformById(id) {
  return PLATFORMS.find((p) => p.id === id) || null;
}

// Small read-only pill for showing the chosen platform.
export function PlatformChip({ id }) {
  const p = platformById(id);
  if (!p) return null;
  return (
    <span
      className="chip on"
      style={{ background: p.color, borderColor: p.color, color: p.dark ? '#0b0f17' : '#fff' }}
    >
      {p.label}
    </span>
  );
}

// Interactive picker. value is a platform id or ''. Clicking the selected chip
// again clears it back to ''.
export default function PlatformPicker({ value, onChange }) {
  return (
    <div className="chips">
      {PLATFORMS.map((p) => {
        const on = value === p.id;
        const style = on
          ? { background: p.color, borderColor: p.color, color: p.dark ? '#0b0f17' : '#fff' }
          : { background: p.color + '22', borderColor: p.color + '66', color: p.color };
        return (
          <button
            key={p.id}
            type="button"
            className={'chip' + (on ? ' on' : '')}
            style={style}
            aria-pressed={on}
            onClick={() => onChange(on ? '' : p.id)}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
