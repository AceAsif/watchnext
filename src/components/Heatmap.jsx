import React, { useMemo, useState } from 'react';

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Faint empty cell, then four amber intensities.
const LEVELS = ['#1b2029', 'rgba(242,163,60,0.30)', 'rgba(242,163,60,0.55)', 'rgba(242,163,60,0.80)', '#f2a33c'];
const CELL = 12;
const GAP = 3;
const LABELW = 30;

function levelOf(c) {
  if (!c) return 0;
  if (c <= 2) return 1;
  if (c <= 4) return 2;
  if (c <= 7) return 3;
  return 4;
}
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function pretty(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEK[dt.getDay()]} ${d} ${MON[m - 1]} ${y}`;
}

// GitHub-style contribution grid of de-skewed watches per day, one calendar
// year at a time (Sun-first columns of weeks). countsByDay is a { day: count }
// map already de-skewed upstream; years is newest-first.
export default function Heatmap({ countsByDay, years }) {
  const [year, setYear] = useState(() => Number(years[0]) || new Date().getFullYear());
  const [sel, setSel] = useState(null);

  const { columns, months, total, activeDays } = useMemo(() => {
    const start = new Date(year, 0, 1);
    const gridStart = new Date(year, 0, 1 - start.getDay());
    const end = new Date(year, 11, 31);
    const gridEnd = new Date(year, 11, 31 + (6 - end.getDay()));
    const days = [];
    let total = 0;
    let activeDays = 0;
    for (let t = gridStart.getTime(); t <= gridEnd.getTime(); t += 86400000) {
      const dt = new Date(t);
      const ds = ymd(dt);
      const inYear = dt.getFullYear() === year;
      const count = inYear ? (countsByDay[ds] || 0) : 0;
      if (inYear && count > 0) { total += count; activeDays++; }
      days.push({ ds, day: dt.getDate(), month: dt.getMonth(), inYear, count });
    }
    const columns = [];
    for (let i = 0; i < days.length; i += 7) columns.push(days.slice(i, i + 7));
    // label a column when it contains the 1st of a month
    const months = columns.map((col) => {
      const d1 = col.find((c) => c.inYear && c.day === 1);
      return d1 ? MON[d1.month] : '';
    });
    return { columns, months, total, activeDays };
  }, [countsByDay, year]);

  return (
    <div>
      <div className="lib-controls" style={{ marginTop: 4, marginBottom: 10 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {total.toLocaleString()} watch{total === 1 ? '' : 'es'} across {activeDays.toLocaleString()} day
          {activeDays === 1 ? '' : 's'} in {year}
        </p>
        <div className="sort-field">
          <label htmlFor="heat-year" className="muted" style={{ fontSize: 13 }}>Year</label>
          <select id="heat-year" className="select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
        <div style={{ display: 'inline-block', minWidth: 'min-content' }}>
          {/* month labels */}
          <div style={{ display: 'flex', marginLeft: LABELW, marginBottom: 4 }}>
            {months.map((m, i) => (
              <div key={i} style={{ width: CELL, marginRight: GAP, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'visible' }}>
                {m}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex' }}>
            {/* weekday labels */}
            <div style={{ width: LABELW, display: 'flex', flexDirection: 'column', gap: GAP }}>
              {WEEK.map((w, i) => (
                <div key={w} style={{ height: CELL, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', lineHeight: `${CELL}px` }}>
                  {i % 2 === 1 ? w : ''}
                </div>
              ))}
            </div>

            {/* week columns */}
            {columns.map((col, ci) => (
              <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: GAP, marginRight: GAP }}>
                {col.map((c) => (
                  <div
                    key={c.ds}
                    title={c.inYear ? `${c.count} watch${c.count === 1 ? '' : 'es'} · ${pretty(c.ds)}` : ''}
                    onClick={c.inYear && c.count ? () => setSel({ ds: c.ds, count: c.count }) : undefined}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 2,
                      background: c.inYear ? LEVELS[levelOf(c.count)] : 'transparent',
                      cursor: c.inYear && c.count ? 'pointer' : 'default',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 11 }}>Less</span>
        {LEVELS.map((c, i) => (
          <div key={i} style={{ width: CELL, height: CELL, borderRadius: 2, background: c }} />
        ))}
        <span className="muted" style={{ fontSize: 11 }}>More</span>
      </div>

      {sel && (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          {sel.count} watch{sel.count === 1 ? '' : 'es'} on {pretty(sel.ds)}.
        </p>
      )}
    </div>
  );
}
