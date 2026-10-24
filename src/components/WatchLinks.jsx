import React from 'react';
import { watchLinks } from './watchLinksLogic.js';

// [▶ Netflix] [▶ Stan] [All options] — on the show page and the movie sheet.
// rec: { providers, providersFree, providersLink } for your region; mine: services you pay for.
// Shows nothing when the title isn't streaming anywhere we know (or wasn't checked yet).
export default function WatchLinks({ rec, title, mine, checking = false, className = '' }) {
  const { buttons, more, all } = watchLinks(rec, title, mine);
  if (!buttons.length && !all) {
    return checking ? <div className={'sd-watch ' + className}><span className="sd-watch-wait sd-mono">Finding where to watch…</span></div> : null;
  }
  return (
    <div className={'sd-watch ' + className} role="group" aria-label="Watch it on" data-testid="watch-links">
      {buttons.map((b) => (
        <a
          key={b.id}
          className={'sd-btn sm sd-watch-btn' + (b.mine ? ' mine' : '')}
          href={b.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Search ${b.label} for “${title}”`}
          aria-label={`Watch on ${b.label} (opens ${b.label} search)`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
          {b.label}
        </a>
      ))}
      {all && (
        <a
          className="sd-btn sm sd-watch-all"
          href={all}
          target="_blank"
          rel="noopener noreferrer"
          title="Every service, with direct links (TMDB, by JustWatch)"
          aria-label={`All options${more ? `, ${more} more service${more === 1 ? '' : 's'}` : ''} (opens TMDB)`}
        >
          All options{more ? ` · +${more}` : ''}
        </a>
      )}
    </div>
  );
}
