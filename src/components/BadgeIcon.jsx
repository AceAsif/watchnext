import React from 'react';
import { gemArt, HEX } from './badgeArt.js';

// One badge as a "Gem hex": a faceted crest in the level colour with the icon on a dark disc.
//   id: the badge id (achievementsLogic BADGES), level: 0 (not yet) … 6 (Legend)
// Decorative: the card next to it already names the badge and its level.
export default function BadgeIcon({ id, level, size = 56 }) {
  const art = gemArt(id, level);
  return (
    <svg className="ach-gem" width={size} height={Math.round((size * 92) / 84)} viewBox="0 0 84 92" aria-hidden="true" focusable="false">
      {art.facets.map((f, i) => <path key={i} d={f.d} fill={f.fill} />)}
      <polygon points={HEX} fill="none" stroke={art.edge} strokeWidth="2" strokeDasharray={art.dashed ? '5 6' : undefined} strokeLinejoin="round" />
      <circle cx="42" cy="46" r="21" fill="#10141b" stroke={art.edge} strokeWidth="1.5" />
      <g transform="translate(30.6 34.6) scale(0.95)" fill="none" stroke={art.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {art.icon.map((d, i) => <path key={i} d={d} />)}
      </g>
    </svg>
  );
}
