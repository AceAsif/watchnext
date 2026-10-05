import React from 'react';
import { Sheet } from './ui.jsx';
import { serviceChoices } from './servicesLogic.js';
import { useServicesPrefs, toggleMyService } from '../store/servicesPrefs.js';

// Pieces of the "On my services" filter, shared by Settings, the Watchlist and the Shows tab.

// Tick the subscription services you pay for. Same chip look as the platform picker
// (selected = full brand colour). Free-to-watch services always count, so they aren't listed.
export function ServicesPicker({ mine, onToggle }) {
  return (
    <div className="chips" role="group" aria-label="Services you pay for">
      {serviceChoices().map((p) => {
        const on = mine.includes(p.id);
        const style = on ? { background: p.color, borderColor: p.color, color: p.dark ? '#0b0f17' : '#fff' } : { '--chip': p.color };
        return (
          <button key={p.id} type="button" className={'chip' + (on ? ' on' : '')} style={style} aria-pressed={on} onClick={() => onToggle(p.id)}>
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export const FREE_NOTE = 'Free-to-watch services (ABC iview, SBS On Demand, 7plus and similar) always count, so you don’t need to tick them.';

// The small pill that turns the filter on and off.
export function ServicesToggle({ on, onToggle, label = 'On my services' }) {
  return (
    <button type="button" className={'sd-chipbtn sd-svctoggle' + (on ? ' active' : '')} aria-pressed={on} onClick={onToggle}>
      <span className="ell">{label}</span>
    </button>
  );
}

// "Checking availability… 12 left" / "3 titles couldn't be checked. Retry" / hints.
export function ServicesStatus({ text, onRetry, canRetry }) {
  if (!text) return null;
  return (
    <p className="sd-svc-status" role="status" data-testid="services-status">
      <span>{text}</span>
      {canRetry ? <button type="button" className="sd-linkbtn" onClick={onRetry}>Retry</button> : null}
    </p>
  );
}

// Opened the first time you switch the filter on without having chosen any services.
export function ServicesSheet({ onClose }) {
  const prefs = useServicesPrefs();
  return (
    <Sheet open title="My services" subtitle="Which ones do you pay for?" onClose={onClose}>
      <ServicesPicker mine={prefs.mine} onToggle={toggleMyService} />
      <p className="sd-setp" style={{ marginTop: 14 }}>{FREE_NOTE}</p>
    </Sheet>
  );
}
