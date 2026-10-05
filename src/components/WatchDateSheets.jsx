import React, { useMemo, useState } from 'react';
import { Sheet } from './ui.jsx';
import { EARLIEST_DAY, isAllowedDay, dateScopes, describeRange, fixPreview } from './watchDatesLogic.js';

// Two small sheets about WHEN something was watched.
//
//  WhenSheet      asked when you tap "Mark season watched": "Just now", or the real date
//                 (a show you watched in 2023 should not land in this month's stats).
//  FixDatesSheet  from a show's "⋯" menu: correct the dates already recorded, for all
//                 watched episodes, one season, or the episodes marked together on one day.
//
// A date is always a real day: there is deliberately no "unknown" option.

function DateField({ id, label, value, onChange, today }) {
  return (
    <label className="sd-datefield" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="date" value={value} min={EARLIEST_DAY} max={today} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function WhenSheet({ title, subtitle, today, onNow, onDate, onClose }) {
  const [day, setDay] = useState(today);
  const ok = isAllowedDay(day, today);
  return (
    <Sheet open title={title} subtitle={subtitle} onClose={onClose}>
      <p className="sd-setp">Pick when you really watched it, so your stats land in the right month and year.</p>
      <div className="sd-when-acts">
        <button type="button" className="sd-btn primary" autoFocus onClick={onNow}>Just now</button>
      </div>
      <DateField id="when-date" label="Or a different date" value={day} onChange={setDay} today={today} />
      <p className="sd-when-hint" role="status">{day === today ? '' : ok ? 'These episodes will be dated that day.' : 'Choose a real date that is not in the future.'}</p>
      <div className="sd-when-acts">
        <button type="button" className="sd-btn" disabled={!ok || day === today} onClick={() => onDate(day)}>Use this date</button>
        <button type="button" className="sd-btn" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

export function FixDatesSheet({ show, today, onApply, onClose }) {
  const scopes = useMemo(() => dateScopes(show), [show]);
  const [scopeId, setScopeId] = useState('all');
  const [day, setDay] = useState('');
  const scope = scopes.find((s) => s.id === scopeId) || scopes[0];
  const ok = !!scope && isAllowedDay(day, today);
  return (
    <Sheet open title="Fix watch dates" subtitle={show.name} onClose={onClose}>
      <p className="sd-setp">Marking an episode stamps today’s date. If you watched this earlier, set the real date here so it counts in the right month and year.</p>
      <p className="sd-when-hint">{describeRange(show)}</p>
      <label className="sd-datefield" htmlFor="fix-scope">
        <span>Which episodes</span>
        <select id="fix-scope" value={scope ? scope.id : ''} onChange={(e) => setScopeId(e.target.value)}>
          {scopes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <DateField id="fix-date" label="Date you watched them" value={day} onChange={setDay} today={today} />
      <p className="sd-when-hint" role="status">
        {day && !ok ? 'Choose a real date that is not in the future.' : ok ? fixPreview(scope.keys.length, day) : ''}
      </p>
      <div className="sd-when-acts">
        <button type="button" className="sd-btn primary" disabled={!ok} onClick={() => onApply(scope.keys, day)}>Apply</button>
        <button type="button" className="sd-btn" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}
