import React, { useState } from 'react';
import { Bar } from './ui.jsx';
import { Section } from './StatsUI.jsx';
import GoalSheet from './GoalSheet.jsx';
import { goalRows, streakText } from './goalsLogic.js';

// "Goals · 2026": this year's targets with progress, pace and your day streak. `actualsOf(year)` returns
// { episodes, movies, hours } counted exactly as the Year in Review card counts them.
export default function GoalsCard({ year, goals, actualsOf, today, streak }) {
  const [open, setOpen] = useState(false);
  const rows = goalRows(goals, year, actualsOf(year), today);
  const nextYear = String(Number(year) + 1);
  return (
    <Section
      title={`Goals · ${year}`}
      className="a-goals"
      right={<button type="button" className="sd-btn sm" onClick={() => setOpen(true)}>{rows.length ? 'Edit goals' : 'Set goals'}</button>}
    >
      <div className="sd-card sd-goals">
        {rows.length === 0 ? (
          <p className="sd-goals-empty">Set a yearly target for episodes, movies or hours and see your progress and pace here.</p>
        ) : (
          rows.map((r) => (
            <div className="sd-goal" key={r.id} data-goal={r.id}>
              <div className="sd-goal-top">
                <span className="sd-goal-name">{r.label}</span>
                <span className="sd-goal-num sd-mono">{r.done.toLocaleString()} / {r.target.toLocaleString()} · {r.pct}%</span>
              </div>
              <Bar value={r.pct} color={r.met ? 'var(--amber)' : 'var(--teal)'} height={10} />
              <span className={'sd-goal-pace ' + r.state}>{r.pace}</span>
            </div>
          ))
        )}
        <div className="sd-goal-streak sd-mono" data-testid="goal-streak">{streakText(streak.current, streak.longest)}</div>
      </div>
      {open && <GoalSheet years={[year, nextYear]} initialYear={year} goals={goals} actualsOf={actualsOf} onClose={() => setOpen(false)} />}
    </Section>
  );
}
