import React, { useEffect, useMemo, useRef, useState } from 'react';
import Credits from '../components/Credits.jsx';
import { Chevron } from '../components/ui.jsx';
import { FilterField } from '../components/LibraryBar.jsx';
import { HELP_SECTIONS } from '../components/helpContent.js';
import { searchHelp, countItems, itemKey } from '../components/helpLogic.js';
import { SHORTCUT_LIST } from '../components/keyboardShortcutsLogic.js';

// Help & FAQ (opened from Settings, or from the keyboard shortcuts list).
// Text lives in helpContent.js. Tap a question to open its answer; the search box
// shows every matching answer already open.

const keysText = (item) => (item.keys ? SHORTCUT_LIST.map((s) => `${s.label} ${s.keys.join(' ')}`).join(' ') : '');

function KeysList() {
  return (
    <ul className="sd-keys" data-testid="help-keys">
      {SHORTCUT_LIST.map((s) => (
        <li key={s.label}>
          <span>{s.label}</span>
          <span className="sd-keys-k">{s.keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
        </li>
      ))}
    </ul>
  );
}

function Entry({ section, item, open, onToggle }) {
  const key = itemKey(section, item);
  const panel = `help-a-${section.id}-${item.id}`;
  return (
    <div className={'sd-help-item' + (open ? ' open' : '')} data-key={key}>
      <button type="button" className="sd-help-q" aria-expanded={open} aria-controls={panel} onClick={() => onToggle(key)}>
        <span>{item.q}</span>
        <Chevron dir={open ? 'down' : 'right'} />
      </button>
      {open && (
        <div className="sd-help-a" id={panel}>
          {(item.a || []).map((p, i) => <p key={i}>{p}</p>)}
          {item.steps && <ul>{item.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          {item.keys && <KeysList />}
        </div>
      )}
    </div>
  );
}

export default function Help({ onBack, startAt = null }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => {
    const s = HELP_SECTIONS.find((x) => x.id === startAt);
    return new Set(s ? [itemKey(s, s.items[0])] : []);
  });
  const sectionRefs = useRef({});

  useEffect(() => {
    const el = startAt && sectionRefs.current[startAt];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const searching = q.trim().length > 0;
  const groups = useMemo(() => searchHelp(HELP_SECTIONS, q, keysText), [q]);
  // While searching, every match starts open; `shut` holds the ones you closed (reset per search).
  const [shut, setShut] = useState(() => new Set());
  useEffect(() => { setShut(new Set()); }, [q]);
  const flip = (set) => (key) => set((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggle = searching ? flip(setShut) : flip(setOpen);
  const isOpen = (key) => (searching ? !shut.has(key) : open.has(key));
  const jump = (id) => {
    const el = sectionRefs.current[id];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <div className="sd-page sd-helppage">
      <button className="sd-back" onClick={onBack}><Chevron dir="left" />Back</button>
      <h1 className="sd-title">Help &amp; FAQ</h1>
      <p className="sd-nsub">How to use WatchNext, and answers to common questions.</p>

      <FilterField value={q} onChange={setQ} placeholder="Search help, e.g. rewatch, backup" label="Search help" />

      {!searching && (
        <nav className="sd-help-jump" aria-label="Help sections">
          {HELP_SECTIONS.map((s) => (
            <button key={s.id} type="button" className="sd-nchip words" onClick={() => jump(s.id)}>{s.title}</button>
          ))}
        </nav>
      )}

      {searching && (
        <p className="sd-help-count sd-mono" aria-live="polite">
          {countItems(groups) ? `${countItems(groups)} answer${countItems(groups) === 1 ? '' : 's'} found` : 'Nothing found. Try another word.'}
        </p>
      )}

      {groups.map(({ section, items }) => (
        <section key={section.id} className="sd-help-sec" aria-label={section.title} ref={(el) => { sectionRefs.current[section.id] = el; }}>
          <h2 className="sd-lbl">{section.title}</h2>
          <div className="sd-card sd-help-list">
            {items.map((item) => {
              const key = itemKey(section, item);
              return <Entry key={key} section={section} item={item} open={isOpen(key)} onToggle={toggle} />;
            })}
          </div>
        </section>
      ))}

      <Credits />
    </div>
  );
}
