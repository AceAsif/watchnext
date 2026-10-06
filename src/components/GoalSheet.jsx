import React, { useMemo, useState } from 'react';
import { Sheet } from './ui.jsx';
import { setYearGoal } from '../store/db.js';
import { METRICS, goalsOfYear, parseGoalInput } from './goalsLogic.js';

// Set, change or clear this year's targets (episodes, movies, hours). Blank = no goal for that one.
// `years` = the years you can set goals for (this year and next); `actualsOf(year)` gives what you watched
// that year, used for the "Last year: N" hint.
export default function GoalSheet({ years, initialYear, goals, actualsOf, onClose }) {
  const [year, setYear] = useState(initialYear);
  const start = useMemo(() => goalsOfYear(goals, year), [goals, year]);
  const [text, setText] = useState(() => Object.fromEntries(METRICS.map((m) => [m.id, start[m.id] ? String(start[m.id]) : ''])));
  const parsed = Object.fromEntries(METRICS.map((m) => [m.id, parseGoalInput(text[m.id])]));
  const hasError = METRICS.some((m) => parsed[m.id].error);
  const changed = METRICS.some((m) => (parsed[m.id].value || null) !== (start[m.id] || null));

  const pickYear = (y) => {
    setYear(y);
    const g = goalsOfYear(goals, y);
    setText(Object.fromEntries(METRICS.map((m) => [m.id, g[m.id] ? String(g[m.id]) : ''])));
  };
  const save = () => {
    setYearGoal(year, Object.fromEntries(METRICS.map((m) => [m.id, parsed[m.id].value])));
    onClose();
  };
  const last = actualsOf(String(Number(year) - 1));

  return (
    <Sheet open title="Yearly goals" subtitle="Targets for episodes, movies and hours" onClose={onClose}>
      <div className="sd-nchips" role="group" aria-label="Year" style={{ marginBottom: 6 }}>
        {years.map((y) => (
          <button key={y} type="button" className={'sd-nchip' + (year === y ? ' on' : '')} aria-pressed={year === y} onClick={() => pickYear(y)}>{y}</button>
        ))}
      </div>
      {METRICS.map((m) => {
        const err = parsed[m.id].error;
        return (
          <div className="sd-goalfield" key={m.id}>
            <label htmlFor={`goal-${m.id}`}>{m.label}</label>
            <input
              id={`goal-${m.id}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="No goal"
              value={text[m.id]}
              aria-invalid={err ? 'true' : 'false'}
              aria-describedby={`goal-${m.id}-hint`}
              onChange={(e) => setText((t) => ({ ...t, [m.id]: e.target.value }))}
            />
            <div className="sd-nchips presets" role="group" aria-label={`${m.label} presets`}>
              {m.presets.map((p) => (
                <button key={p} type="button" className={'sd-nchip' + (text[m.id] === String(p) ? ' on' : '')} aria-pressed={text[m.id] === String(p)} onClick={() => setText((t) => ({ ...t, [m.id]: String(p) }))}>{p.toLocaleString()}</button>
              ))}
              {text[m.id] !== '' && <button type="button" className="sd-nchip" onClick={() => setText((t) => ({ ...t, [m.id]: '' }))}>Clear</button>}
            </div>
            <p id={`goal-${m.id}-hint`} className={'sd-goalhint' + (err ? ' err' : '')} role={err ? 'alert' : undefined}>
              {err || (last[m.id] > 0 ? `Last year (${Number(year) - 1}): ${last[m.id].toLocaleString()}` : '')}
            </p>
          </div>
        );
      })}
      <div className="sd-when-acts">
        <button type="button" className="sd-btn primary" disabled={hasError || !changed} onClick={save}>Save goals</button>
        <button type="button" className="sd-btn" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}
