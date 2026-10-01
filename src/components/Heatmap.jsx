import React, { useMemo, useRef, useState } from 'react';
import { YearSelect, Section } from './StatsUI.jsx';
import { buildYearGrid, cellAtFraction, heatLevel, MONTHS, DOW } from './statsLogic.js';

// GitHub-style contribution grid of de-skewed watches per day, one calendar
// year at a time (Sunday-first columns of weeks). countsByDay is a { day: count }
// map already de-skewed upstream; years is newest-first; today (YYYY-MM-DD)
// dims the rest of the current year.
//
// Claude Design layout: the grid fills the card's width with square cells (no
// horizontal scrolling), so on a phone the cells are small — a tap is resolved
// from the pointer position (cellAtFraction) rather than needing to land on a
// 5px square. On desktop the cells are comfortably large and hover shows a tip.

const LEVELS = ['#1e2530', '#4a3a22', '#7d5a2a', '#b87d33', '#f2a33c'];
const FUTURE = '#161b24';

function pretty(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return `${DOW[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}
const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 'es'}`;

export default function Heatmap({ countsByDay, years, today }) {
  const [year, setYear] = useState(() => Number(years[0]) || new Date().getFullYear());
  const [sel, setSel] = useState(null);
  const gridRef = useRef(null);

  const { columns, months, total, activeDays } = useMemo(
    () => buildYearGrid(year, countsByDay, today),
    [countsByDay, year, today]
  );
  const cols = columns.length;

  const summary = `${plural(total, 'watch')} across ${activeDays.toLocaleString()} day${activeDays === 1 ? '' : 's'} in ${year}`;

  function onPick(e) {
    const el = gridRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cell = cellAtFraction(columns, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    setSel(cell);
  }

  return (
    <Section
      title="Watch activity"
      className="a-activity"
      right={
        <YearSelect
          id="heat-year"
          label="Year"
          value={String(year)}
          onChange={(v) => { setYear(Number(v)); setSel(null); }}
          options={years.map((y) => ({ value: y, label: y }))}
        />
      }
    >
      <div className="sd-card sd-heat">
        {/* The summary line doubles as the tapped-day readout, so there's no
            reserved empty caption line and the card never changes height. */}
        <div className={'sd-heat-sum' + (sel ? ' picked' : '')} aria-live="polite">
          {sel ? (
            sel.count ? (
              <><b>{plural(sel.count, 'watch')}</b> on {pretty(sel.ds)}</>
            ) : (
              <>Nothing watched on {pretty(sel.ds)}</>
            )
          ) : (
            <><b>{plural(total, 'watch')}</b> across {activeDays.toLocaleString()} day{activeDays === 1 ? '' : 's'}</>
          )}
        </div>

        {/* month letters (J F M…), each placed on the week column holding the 1st */}
        <div className="sd-heat-months" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-hidden="true">
          {months.map((m) => (
            <span key={m.month} style={{ gridColumn: m.col + 1 }}>
              <i className="s">{MONTHS[m.month][0]}</i>
              <i className="l">{MONTHS[m.month]}</i>
            </span>
          ))}
        </div>

        <div
          ref={gridRef}
          className="sd-heat-grid"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          role="img"
          aria-label={summary}
          onClick={onPick}
        >
          {columns.map((col) =>
            col.map((c) => (
              <div
                key={c.ds}
                className={'sd-heat-cell' + (sel && sel.ds === c.ds ? ' sel' : '')}
                title={c.inYear ? `${plural(c.count, 'watch')} · ${pretty(c.ds)}` : undefined}
                style={{
                  background: !c.inYear
                    ? 'transparent'
                    : c.count
                      ? LEVELS[heatLevel(c.count)]
                      : c.future
                        ? FUTURE
                        : LEVELS[0],
                }}
              />
            ))
          )}
        </div>

        <div className="sd-heat-legend" aria-hidden="true">
          Less
          {LEVELS.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
          More
        </div>

      </div>
    </Section>
  );
}
