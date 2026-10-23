import React, { useMemo, useState } from 'react';
import { Sheet } from './ui.jsx';
import { useSpoilerShield, isShielded } from './spoilerShield.js';
import { buildIcs, fileName, loadExported, rememberExported, plan } from './calendarExportLogic.js';
import { localISODate } from './showLogic.js';

// Up Next → On the way → "Add to calendar": downloads upcoming episodes as a calendar file.
const storage = () => { try { return window.localStorage; } catch (e) { return null; } };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}${iso.slice(0, 4) !== localISODate().slice(0, 4) ? ` ${iso.slice(0, 4)}` : ''}`;
const eps = (n) => `${n} episode${n === 1 ? '' : 's'}`;

export default function CalendarExportSheet({ open, items, onClose }) {
  const shield = useSpoilerShield();
  const [exported, setExported] = useState(() => (storage() ? loadExported(storage()) : []));
  const [which, setWhich] = useState('fresh');
  const [done, setDone] = useState(null); // number of episodes in the last file
  const p = useMemo(() => plan(items, exported), [items, exported]);
  const some = p.fresh.length > 0 && p.fresh.length < p.all.length;
  const none = p.all.length > 0 && p.fresh.length === 0;
  const chosen = some ? (which === 'fresh' ? p.fresh : p.all) : p.all;

  function download() {
    const text = buildIcs(chosen, {
      hide: (it) => isShielded(shield, it.show, it.s, it.e),
      siteUrl: window.location.origin + window.location.pathname,
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    a.download = fileName(localISODate());
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000); // iPhone opens it a moment later
    if (storage()) setExported(rememberExported(storage(), exported, chosen));
    setDone(chosen.length);
  }
  const close = () => { setDone(null); setWhich('fresh'); onClose(); };

  return (
    <Sheet open={open} title="Add to your calendar" subtitle={p.all.length ? `${eps(p.all.length)} on the way · ${day(p.first)} – ${day(p.last)}` : ''} onClose={close}>
      <div className="sd-cal-x" data-testid="cal-export">
        {done != null ? (
          <>
            <p className="sd-cal-x-ok" role="status">Downloaded {eps(done)}. Now open the file:</p>
            <ul className="sd-cal-x-how">
              <li><b>iPhone or iPad:</b> open the file (it may open by itself) and tap <b>Add All</b>.</li>
              <li><b>Google Calendar:</b> on a computer, go to calendar.google.com → ⚙ Settings → <b>Import &amp; export</b> → choose the file.</li>
              <li><b>Outlook or Mac:</b> open the file and add the events.</li>
            </ul>
            <p className="sd-cal-x-note">This is a copy of today’s dates. When new episodes are announced, export again: only the new ones are offered, so nothing is added twice.</p>
            <button type="button" className="sd-btn" onClick={close}>Done</button>
          </>
        ) : p.all.length === 0 ? (
          <p className="sd-cal-x-note">No upcoming episodes yet. Tap refresh on “On the way” to check TMDB for new dates.</p>
        ) : (
          <>
            <p className="sd-cal-x-p">Each episode becomes an all-day event on its air date, so it doesn’t block your day. TMDB doesn’t give the time.</p>
            {some && (
              <div className="sd-cal-x-pick" role="radiogroup" aria-label="Which episodes">
                <label><input type="radio" name="calx" checked={which === 'fresh'} onChange={() => setWhich('fresh')} /> Only the {eps(p.fresh.length)} not added before</label>
                <label><input type="radio" name="calx" checked={which === 'all'} onChange={() => setWhich('all')} /> All {eps(p.all.length)}</label>
              </div>
            )}
            {none && <p className="sd-cal-x-note">You’ve already exported all of these. Download them again only if you deleted them from your calendar.</p>}
            {shield && <p className="sd-cal-x-note">Spoiler shield is on, so episode titles are left out.</p>}
            <button type="button" className="sd-btn primary" onClick={download} data-testid="cal-download">
              Download {eps(chosen.length)} (.ics)
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
