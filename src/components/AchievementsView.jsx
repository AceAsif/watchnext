import React, { useMemo } from 'react';
import useOrigins from './useOrigins.js';
import { useCollectionsCache } from '../store/collectionsCache.js';
import { buildCollections } from './collectionsLogic.js';
import { computeMetrics, buildBadges, badgeSummary, sortBadges } from './achievementsLogic.js';
import { localISODate } from './showLogic.js';
import { OriginsStatus } from './WorldView.jsx';
import BadgeIcon from './BadgeIcon.jsx';

// Stats → Badges. Every badge has levels (Bronze → Legend); the bar shows how far you are to
// the next one. Recomputed from the library each time; nothing is stored.
export default function AchievementsView({ state }) {
  const origins = useOrigins(state, true);
  const collCache = useCollectionsCache();
  const collections = useMemo(() => buildCollections(state.movies, collCache, localISODate()), [state.movies, collCache]);
  const metrics = useMemo(() => computeMetrics(state, { origins: origins.cache, collections }), [state, origins.cache, collections]);
  const badges = useMemo(() => sortBadges(buildBadges(metrics)), [metrics]);
  const sum = badgeSummary(badges);
  const pct = sum.maxLevels ? Math.round((sum.levels / sum.maxLevels) * 100) : 0;

  return (
    <div className="sd-stack" data-testid="badges">
      <div className="sd-card sd-pad ach-sum">
        <div className="ach-sum-row">
          <span className="ach-sum-big">{sum.earned}<span className="ach-sum-of"> of {sum.total} badges</span></span>
          <span className="ach-sum-lv">{sum.levels} of {sum.maxLevels} levels</span>
        </div>
        <span className="ach-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
        <OriginsStatus origins={origins} what="Countries, languages and anime badges" />
      </div>

      <div className="ach-grid">
        {badges.map((b) => (
          <article key={b.id} className={`sd-card ach ach-l${b.level}${b.done ? ' ach-done' : ''}`} data-badge={b.id} data-level={b.level}>
            <div className="ach-top">
              <span className="ach-icon"><BadgeIcon id={b.id} level={b.level} /></span>
              <div className="ach-head">
                <h3 className="ach-title">{b.title}</h3>
                <span className="ach-what">{b.what}</span>
              </div>
              {b.level > 0 && <span className="ach-chip">{b.levelName}</span>}
            </div>
            <div className="ach-dots" aria-label={`Level ${b.level} of ${b.maxLevel}`}>
              {b.goals.map((g, i) => <span key={g} className={i < b.level ? 'on' : ''} title={g.toLocaleString('en-AU')} />)}
            </div>
            <span className="ach-bar sm" aria-hidden="true"><i style={{ width: `${b.pct}%` }} /></span>
            <span className="ach-next">{b.nextLabel}</span>
          </article>
        ))}
      </div>
      <p className="sd-note">
        Badges follow your library: they are worked out again every time, so fixing a duplicate or a wrong match can change them.
        {metrics.collections === 0 ? ' Collections count once you have opened Movies → Collections on this device.' : ''}
      </p>
    </div>
  );
}
