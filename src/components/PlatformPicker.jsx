import React from 'react';

import { PLATFORMS, platformById, providerToPlatform, platformFromProviders } from './platformsData.js';
export { PLATFORMS, platformById, providerToPlatform, platformFromProviders };

// Small read-only pill for showing the chosen platform. Always brand-coloured,
// because it only ever renders the one platform you actually picked.
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
//
// Selected chip = full brand colour (inline styles below). Unselected chips are
// neutral grey — styled in styles.css via `button.chip:not(.on)` — so only your
// pick stands out. The brand colour is still handed to CSS as the `--chip`
// custom property, which drives a subtle hover tint (nice on desktop; harmless
// on touch).
export default function PlatformPicker({ value, onChange }) {
  return (
    <div className="chips">
      {PLATFORMS.map((p) => {
        const on = value === p.id;
        const style = on
          ? { background: p.color, borderColor: p.color, color: p.dark ? '#0b0f17' : '#fff' }
          : { '--chip': p.color };
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
