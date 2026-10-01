import React, { useRef } from 'react';
import { Chevron } from './ui.jsx';
import { barRows, labelWidthFor, valueWidthFor, nextTab } from './statsLogic.js';

// Small building blocks for the Stats page (Claude Design round): a number
// tile, the segmented tab bar, a year chip, bar lists, and a labelled section.
// Styling lives in ui.css (sd-*).

// A big number with a small mono label. size: 'hero' (the all-time card),
// 'lg' (streaks), 'md' (the 2x2 tiles). `plain` makes the label a normal
// sentence instead of a small-caps mono caption (the hero's sub-line).
export function StatTile({ value, unit, label, size = 'md', accent = false, plain = false, statKey }) {
  return (
    <div className={`sd-tile sd-tile--${size}${accent ? ' sd-tile--accent' : ''}`} data-stat={statKey}>
      <span className={`sd-tile-v v-${size}`}>
        {value}
        {unit && <span className={`sd-tile-u u-${size}`}>{unit}</span>}
      </span>
      <span className={plain ? 'sd-tile-sub' : 'sd-tile-l'}>{label}</span>
    </div>
  );
}

// The Overview | Habits | Rankings | Breakdown switch. A proper ARIA tab list
// with arrow-key / Home / End navigation. The page renders the matching
// role="tabpanel" with id "stats-panel".
export function TabBar({ tabs, value, onChange, label }) {
  const refs = useRef({});
  const onKeyDown = (e) => {
    const next = nextTab(tabs, value, e.key);
    if (!next) return;
    e.preventDefault();
    onChange(next);
    if (refs.current[next]) refs.current[next].focus();
  };
  return (
    <div className="sd-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t}
          id={`stats-tab-${t}`}
          role="tab"
          aria-selected={value === t}
          aria-controls="stats-panel"
          tabIndex={value === t ? 0 : -1}
          ref={(el) => { refs.current[t] = el; }}
          onClick={() => onChange(t)}
          onKeyDown={onKeyDown}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// A year picker that looks like the design's "2026 ⌄" chip but is a real
// <select>, so keyboards, screen readers and phone pickers all just work.
export function YearSelect({ id, value, onChange, options, label }) {
  return (
    <label className="sd-yearsel">
      <span className="sd-vh">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Chevron dir="down" size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
    </label>
  );
}

// Horizontal bars in a card. rows: [{ label, value, color? }]. The largest row
// is drawn in full amber and the rest in a muted amber, unless a row brings its
// own colour (platforms, completion). Label/value columns size to their text.
export function BarList({ rows, unit = '', highlightTop = true, ariaLabel }) {
  const data = barRows(rows);
  const lw = labelWidthFor(rows.map((r) => r.label));
  const vw = valueWidthFor(rows.map((r) => r.value), unit);
  return (
    <div className="sd-card sd-pad" role="group" aria-label={ariaLabel}>
      <div className="sd-bars">
        {data.map((r) => (
          <div className={'sd-bar-row' + (highlightTop && r.isTop ? ' top' : '')} key={r.label} data-bar={r.label}>
            <span className="sd-bar-label" style={{ width: lw }} title={r.label}>{r.label}</span>
            <span className="sd-bar-track">
              <span className="sd-bar-fill" style={{ width: `${r.pct}%`, ...(r.color ? { background: r.color } : null) }} />
            </span>
            <span className="sd-bar-val" style={{ width: vw }}>{r.value.toLocaleString()}{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// A mono caption row (optionally with something on the right, such as a year
// chip) above the section's content.
export function Section({ title, right, children, className = '' }) {
  return (
    <section className={'sd-sec2 ' + className}>
      <div className={'sd-sec2-head' + (right ? ' has-ctl' : '')}>
        <span className="sd-lbl">{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

export const Note = ({ children }) => <p className="sd-note">{children}</p>;
