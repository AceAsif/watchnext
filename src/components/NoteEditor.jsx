import React, { useRef, useState } from 'react';
import { Sheet } from './ui.jsx';
import { XIcon } from './LibraryBar.jsx';
import { nextTab } from './statsLogic.js';
import { REACTIONS, NOTE_MAX, cleanNote, isEmptyNote } from '../store/notes.js';

// Reaction + note editor, used inline on the movie sheet and inside a sheet for
// an episode. `value` is { react, text } (from cleanNote); onSave receives the
// same shape; onRemove clears it. The text box is capped at NOTE_MAX.
export function NoteEditor({ value, onSave, onRemove, saveLabel = 'Save' }) {
  const initial = cleanNote(value);
  const [react, setReact] = useState(initial.react);
  const [text, setText] = useState((value && value.text) || '');
  const [saved, setSaved] = useState(false);
  const refs = useRef({});

  const current = cleanNote({ react, text });
  const dirty = current.react !== initial.react || current.text !== initial.text;
  const hasExisting = !isEmptyNote(initial);
  const canSave = dirty && !isEmptyNote(current);

  const ids = REACTIONS.map((r) => r.id);
  const pick = (id) => {
    setReact(id);
    setSaved(false);
    if (refs.current[id]) refs.current[id].focus();
  };
  const onKeyDown = (e) => {
    const key = e.key === 'ArrowDown' ? 'ArrowRight' : e.key === 'ArrowUp' ? 'ArrowLeft' : e.key;
    const from = react || ids[0];
    const next = nextTab(ids, from, key);
    if (!next) return;
    e.preventDefault();
    pick(next);
  };

  return (
    <div className="sd-noted">
      <div className="sd-reacts" role="radiogroup" aria-label="Your reaction" onKeyDown={onKeyDown}>
        {REACTIONS.map((r, i) => (
          <button
            key={r.id}
            ref={(el) => { refs.current[r.id] = el; }}
            type="button"
            role="radio"
            aria-checked={react === r.id}
            tabIndex={react === r.id || (!react && i === 0) ? 0 : -1}
            className={'sd-react' + (react === r.id ? ' on' : '')}
            // tapping the chosen reaction again clears it
            onClick={() => { setReact(react === r.id ? '' : r.id); setSaved(false); }}
          >
            <span className="e" aria-hidden="true">{r.emoji}</span>
            <span className="l">{r.label}</span>
          </button>
        ))}
      </div>

      <label className="sd-notefield">
        <span className="sd-vh">Your note</span>
        <textarea
          className="sd-notearea"
          rows={4}
          maxLength={NOTE_MAX}
          value={text}
          placeholder="Write a note… (optional)"
          onChange={(e) => { setText(e.target.value.slice(0, NOTE_MAX)); setSaved(false); }} // maxLength only limits typing/pasting
        />
      </label>
      <div className={'sd-notecount' + (text.length >= NOTE_MAX - 20 ? ' near' : '')} aria-live="off">
        {text.length}/{NOTE_MAX}
      </div>

      <div className="sd-noteacts">
        <button
          type="button"
          className="sd-setbtn primary"
          disabled={!canSave}
          onClick={() => { onSave(current); setSaved(true); }}
        >
          {saved && !dirty ? 'Saved' : saveLabel}
        </button>
        {hasExisting && (
          <button
            type="button"
            className="sd-setbtn danger"
            onClick={() => { setReact(''); setText(''); setSaved(false); onRemove(); }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// An episode's note, in a bottom sheet (phone) / centred dialog (desktop). The
// × closes WITHOUT saving; Save is explicit so nothing is lost or stored by accident.
export function NoteSheet({ title, subtitle, value, onSave, onRemove, onClose }) {
  return (
    <Sheet
      open
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      action={
        <button type="button" className="sd-xbtn" aria-label="Close without saving" onClick={onClose}>
          <XIcon size={20} />
        </button>
      }
    >
      <NoteEditor value={value} saveLabel="Save note" onSave={onSave} onRemove={onRemove} />
    </Sheet>
  );
}
