import React from 'react';
import { watchLinks } from './watchLinksLogic.js';

// [▶ Netflix] [▶ Stan] [All options] — on the show page, the movie sheet and Watchlist movie rows.
// rec: { providers, providersFree, providersLink, providersBuyRent } for your region; mine: services you pay for.
// "All options" says "Buy or rent" when that's the only way to watch it here.
// Shows nothing when the title isn't streaming anywhere we know (or wasn't checked yet).
export default function WatchLinks({ rec, title, mine, checking = false, className = '' }) {
  const { buttons, more, all, allLabel } = watchLinks(rec, title, mine);
  const buy = allLabel === 'Buy or rent';
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
          title={b.search ? `Search ${b.label} for “${title}”` : `Open ${b.label} (search for “${title}” there)`}
          aria-label={`Watch on ${b.label} (opens ${b.label}${b.search ? ' search' : ''})`}
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
          title={buy ? 'Not streaming here: where to buy or rent it, with direct links (TMDB, by JustWatch)' : 'Every service, with direct links (TMDB, by JustWatch)'}
          aria-label={`${allLabel}${more ? `, ${more} more service${more === 1 ? '' : 's'}` : ''} (opens TMDB)`}
        >
          {allLabel}{more ? ` · +${more}` : ''}
        </a>
      )}
    </div>
  );
}
