import React, { useState } from 'react';
import { localISODate } from './showLogic.js';
import { EARLIEST_DAY } from './watchDatesLogic.js';
import { fmtDay } from './statsLogic.js';
import { viewingDay, checkNewDay } from './movieGroupsLogic.js';

// "Watched on 19 Oct 2026 · Change date" for the viewing open in the movie sheet.
// Tapping Change date shows a date box with Save / Cancel. Only this one viewing moves;
// its rating, notes and platform stay with it.
//   group:  the film's group (movieGroupsLogic.groupMovies)
//   entry:  the viewing being shown (has .index)
//   onSave: (ymd) => void
// Give it key={entry.index} so it closes when another viewing is picked.
export default function ViewingDateEditor({ group, entry, onSave }) {
  const today = localISODate();
  const current = viewingDay(entry);
  const [day, setDay] = useState(null); // null = not editing
  const check = day == null ? null : checkNewDay(group, entry.index, day, today);

  if (day == null) {
    return (
      <div className="sd-vdate" data-testid="viewing-date">
        <span>Watched on <b>{current ? fmtDay(current) : 'no date'}</b></span>
        <button type="button" className="sd-btn sm" onClick={() => setDay(current || today)}>Change date</button>
      </div>
    );
  }
  return (
    <div className="sd-vdate-edit" data-testid="viewing-date-edit">
      <label className="sd-datefield" htmlFor={`vdate-${entry.index}`}>
        <span>When did you watch it?</span>
        <input id={`vdate-${entry.index}`} type="date" value={day} min={EARLIEST_DAY} max={today} onChange={(e) => setDay(e.target.value)} autoFocus />
      </label>
      <p className={'sd-when-hint' + (check && !check.ok && check.msg ? ' err' : '')} role="status">{check ? check.msg : ''}</p>
      <div className="sd-when-acts">
        <button type="button" className="sd-btn primary" disabled={!check || !check.ok} onClick={() => { onSave(day); setDay(null); }}>Save date</button>
        <button type="button" className="sd-btn" onClick={() => setDay(null)}>Cancel</button>
      </div>
    </div>
  );
}
