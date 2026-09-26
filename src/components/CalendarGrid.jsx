import React, { useMemo, useState } from 'react';
import { img } from '../api/tmdb.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ymd(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// A dated agenda row, matching the .next-row look used elsewhere.
function EpRow({ it, onOpen }) {
  return (
    <button className="next-row" onClick={() => onOpen(it.id)}>
      {it.show.poster ? (
        <img src={img(it.show.poster, 'w154')} alt="" loading="lazy" />
      ) : (
        <div className="thumb" />
      )}
      <div className="info">
        <div className="name">{it.show.name}</div>
        <div className="detail">
          <span className="epcode">
            S{String(it.s).padStart(2, '0')}·E{String(it.e).padStart(2, '0')}
          </span>
          {it.name ? ` — ${it.name}` : ''}
        </div>
      </div>
    </button>
  );
}

export default function CalendarGrid({ items, onOpen }) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const byDate = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date).push(it);
    }
    return m;
  }, [items]);

  // Start on the month of the earliest upcoming episode (else this month).
  const firstDate = items.length ? items[0].date : todayStr;
  const [cursor, setCursor] = useState(() => {
    const [y, m] = firstDate.split('-').map(Number);
    return { y, m: m - 1 };
  });
  const [selected, setSelected] = useState(firstDate);

  const firstPopulatedIn = (y, m) => {
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    const days = [...byDate.keys()].filter((d) => d.startsWith(prefix)).sort();
    return days[0] || null;
  };

  const goMonth = (delta) => {
    const dt = new Date(cursor.y, cursor.m + delta, 1);
    const y = dt.getFullYear();
    const m = dt.getMonth();
    setCursor({ y, m });
    const firstHit = firstPopulatedIn(y, m);
    if (firstHit) setSelected(firstHit);
  };

  // Build the grid: whole weeks (Sun-first) covering the cursor month.
  const cells = useMemo(() => {
    const startWeekday = new Date(cursor.y, cursor.m, 1).getDay();
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const weeks = Math.ceil((startWeekday + daysInMonth) / 7);
    const out = [];
    for (let i = 0; i < weeks * 7; i++) {
      const dt = new Date(cursor.y, cursor.m, 1 - startWeekday + i);
      const ds = ymd(dt.getFullYear(), dt.getMonth(), dt.getDate());
      out.push({
        ds,
        day: dt.getDate(),
        inMonth: dt.getMonth() === cursor.m,
        count: (byDate.get(ds) || []).length,
      });
    }
    return out;
  }, [cursor, byDate]);

  const selectedItems = selected ? byDate.get(selected) || [] : [];
  const selectedLabel = selected
    ? (() => {
        const [y, m, d] = selected.split('-').map(Number);
        return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
      })()
    : '';

  if (!items.length) {
    return (
      <p className="muted" style={{ fontSize: 13.5, marginTop: 10 }}>
        No upcoming episodes scheduled yet. Use "Refresh upcoming" to pull dated
        episodes from TMDB.
      </p>
    );
  }

  const btn = {
    background: 'var(--bg-card)',
    border: '1px solid var(--line)',
    color: 'var(--text)',
    borderRadius: 8,
    width: 32,
    height: 32,
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <button style={btn} onClick={() => goMonth(-1)} aria-label="Previous month">‹</button>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, minWidth: 160, textAlign: 'center' }}>
          {MONTHS[cursor.m]} {cursor.y}
        </div>
        <button style={btn} onClick={() => goMonth(1)} aria-label="Next month">›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)', paddingBottom: 2 }}>
            {w}
          </div>
        ))}

        {cells.map((c) => {
          const isToday = c.ds === todayStr;
          const isSel = c.ds === selected;
          const has = c.count > 0;
          return (
            <button
              key={c.ds}
              onClick={has ? () => setSelected(c.ds) : undefined}
              disabled={!has}
              style={{
                minHeight: 48,
                borderRadius: 8,
                border: isSel ? '1.5px solid var(--amber)' : '1px solid var(--line)',
                background: has ? 'var(--bg-card)' : 'transparent',
                opacity: c.inMonth ? 1 : 0.32,
                padding: 5,
                cursor: has ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                color: 'var(--text)',
                font: 'inherit',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: isToday ? 800 : 500,
                  color: isToday ? 'var(--amber)' : 'var(--text)',
                }}
              >
                {c.day}
              </span>
              {has && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    background: 'var(--amber)',
                    color: '#16110a',
                    borderRadius: 6,
                    padding: '1px 6px',
                  }}
                >
                  {c.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <>
          <div className="agenda-date" style={{ marginTop: 16 }}>{selectedLabel}</div>
          {selectedItems.length ? (
            selectedItems.map((it) => (
              <EpRow key={`${it.id}:${it.s}x${it.e}`} it={it} onOpen={onOpen} />
            ))
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>Nothing scheduled this day.</p>
          )}
        </>
      )}
    </div>
  );
}
