import React, { useMemo } from 'react';
import useTaste from './useTaste.js';
import { tasteSummary } from './tasteLogic.js';
import { loadLog, hitStats, hitLine } from './hitLogic.js';
import { BarList, Section, Note } from './StatsUI.jsx';

// Stats → Breakdown: what the recommendation engine thinks you like (the same profile Discover,
// Tonight and Movie night use), so you can check it is right. Plus Discover's hit rate.
export default function YourTaste({ state }) {
  const { prof, cache } = useTaste(state);
  const learned = Object.keys(cache.items).length;
  const sum = useMemo(() => tasteSummary(prof, { learned }), [prof, learned]);
  const hits = useMemo(() => { try { return hitLine(hitStats(loadLog(window.localStorage), state)); } catch (e) { return ''; } }, [state.shows, state.movies]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sum) {
    return (
      <Section title="Your taste">
        <div className="sd-card sd-pad sd-empty">Rate or watch a few shows and movies, and what WatchNext learns about your taste will show here.</div>
      </Section>
    );
  }
  const people = sum.people.map((p) => `${p.name}${p.role === 'c' ? ' (creator/director)' : ''}`);
  return (
    <Section title="Your taste">
      <div data-testid="your-taste">
        <BarList rows={sum.genres.map((g) => ({ label: g.label, value: g.pct }))} unit="%" ariaLabel="Genres you lean to" />
        <div className="sd-card sd-pad sd-taste-facts">
          {sum.languages.length > 0 && <p><span className="sd-lbl">Languages</span> {sum.languages.map((l) => `${l.label} ${l.pct}%`).join(' · ')}</p>}
          {sum.themes.length > 0 && <p><span className="sd-lbl">Themes</span> {sum.themes.join(' · ')}</p>}
          {people.length > 0 && <p><span className="sd-lbl">People</span> {people.join(' · ')}</p>}
          {sum.away.length > 0 && <p><span className="sd-lbl">Steering away from</span> {sum.away.join(' · ')}</p>}
          {hits && <p data-testid="taste-hits"><span className="sd-lbl">Discover</span> {hits}</p>}
        </div>
        <Note>
          {learned > 0
            ? `Built from ${sum.titles.toLocaleString()} titles: your ratings, how far you got, what you dropped and “Not interested”, with recent watching counting more. Discover, Tonight and Movie night all use it.`
            : 'Built from your ratings and genres so far. Open Watchlist → Discover once and it also learns the themes and people in what you watch.'}
        </Note>
      </div>
    </Section>
  );
}
