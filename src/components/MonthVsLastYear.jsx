import React, { useMemo, useState } from 'react';
import { Section, YearSelect } from './StatsUI.jsx';
import { localISODate } from './showLogic.js';
import { viewings, compareMonths, compare, diffText, currentMonthKey, monthYearLabel, sameMonthLastYear } from './monthCompareLogic.js';

// Stats → "This month vs last year": this month so far against the same days a year ago,
// or any earlier month against the same month the year before. Hidden without a year of history.
export default function MonthVsLastYear({ shows, movies }) {
  const views = useMemo(() => viewings(shows, movies), [shows, movies]);
  const nowYM = currentMonthKey();
  const list = useMemo(() => compareMonths(views, nowYM), [views, nowYM]);
  const [picked, setPicked] = useState(null);
  const ym = picked && list.includes(picked) ? picked : list[0];
  const today = localISODate();
  const c = useMemo(() => compare(views, ym, today), [views, ym, today]);
  const lastYM = sameMonthLastYear(nowYM);
  if (list.length < 2 && !views.some((v) => v[0].slice(0, 7) <= lastYM)) return null; // under a year of history
  const options = list.map((v) => ({ value: v, label: v === nowYM ? `${monthYearLabel(v)} (this month)` : monthYearLabel(v) }));
  return (
    <Section
      title="This month vs last year"
      className="a-mvl"
      right={<YearSelect id="mvl-month" label="Month" value={ym} onChange={setPicked} options={options} />}
    >
      <div className="sd-card sd-mvl" data-testid="month-vs-year">
        <div className="sd-mvl-head">{c.headline}</div>
        <div className="sd-mvl-span sd-mono">{c.partial ? `${c.nowLabel.split(',')[0]} in both years` : `${c.nowLabel.split(' ')[0]} in both years`}</div>
        <table className="sd-mvl-table">
          <thead>
            <tr>
              <th scope="col"><span className="sd-vh">What</span></th>
              <th scope="col" title={c.nowLabel}>{c.ym.slice(0, 4)}</th>
              <th scope="col" title={c.thenLabel}>{c.lastYM.slice(0, 4)}</th>
              <th scope="col"><span className="sd-vh">Change</span></th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.id} data-row={r.id}>
                <th scope="row">{r.label}</th>
                <td className="now">{r.now.toLocaleString('en-AU')}</td>
                <td className="then">{r.then.toLocaleString('en-AU')}</td>
                <td className={'chg' + (r.diff > 0 ? ' up' : r.diff < 0 ? ' down' : '')}>
                  {diffText(r.diff)}{r.pct !== null && r.diff !== 0 ? <span className="pct"> {r.pct > 0 ? '↑' : '↓'}{Math.abs(r.pct)}%</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(c.now.top || c.then.top) && (
          <div className="sd-mvl-top">
            <div><span className="sd-lbl">Top show</span> {c.now.top ? `${c.now.top.name} · ${c.now.top.count} ep${c.now.top.count === 1 ? '' : 's'}` : '—'}</div>
            <div><span className="sd-lbl">A year ago</span> {c.then.top ? `${c.then.top.name} · ${c.then.top.count} ep${c.then.top.count === 1 ? '' : 's'}` : '—'}</div>
          </div>
        )}
        {c.thenFull && (
          <p className="sd-note sd-mvl-full">
            All of {c.thenFull.label}: {c.thenFull.hours.toLocaleString('en-AU')} hrs · {c.thenFull.episodes.toLocaleString('en-AU')} episodes · {c.thenFull.movies} movie{c.thenFull.movies === 1 ? '' : 's'}
          </p>
        )}
      </div>
    </Section>
  );
}
