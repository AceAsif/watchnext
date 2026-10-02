import React, { useEffect, useRef } from 'react';
import { img } from '../api/tmdb.js';
import './ui.css';

// Small shared pieces for the redesigned show page (and, later, the other
// screens). Styling lives in ui.css under `sd-*` classes.

// ---------------------------------------------------------------- icons
export function Chevron({ dir = 'right', size = 16, color = 'var(--text-dim)', style }) {
  const d = { right: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6', left: 'M15 5l-7 7 7 7' }[dir];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none', transition: 'transform .15s', ...style }}
    >
      <path d={d} />
    </svg>
  );
}

// ---------------------------------------------------------------- bars
// value 0–100. `height` in px. Colour is any CSS colour.
export function Bar({ value = 0, color = 'var(--amber)', height = 8 }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      className="sd-bar"
      style={{ height, borderRadius: height / 2 }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: pct + '%', background: color }} />
    </span>
  );
}

// ---------------------------------------------------------------- avatar
const TINTS = ['#3a2f3f', '#2f3a3a', '#3a3529', '#2c3547', '#3f2f2f', '#2d3a2e', '#33293f'];
const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

// Round headshot with an initials fallback (TMDB has no photo for many
// crew and minor cast). `ring` draws the card-coloured border used when
// avatars overlap in a stack.
export function Avatar({ name, path, size = 40, tint = 0, ring = false, style }) {
  const base = {
    width: size,
    height: size,
    border: ring ? '2px solid var(--bg-raise)' : 'none',
    boxSizing: 'border-box',
    ...style,
  };
  if (path) {
    return <img className="sd-avatar" src={img(path, 'w185')} alt="" loading="lazy" style={base} />;
  }
  return (
    <span
      className="sd-avatar"
      aria-hidden="true"
      style={{ ...base, background: TINTS[tint % TINTS.length], fontSize: Math.round(size * 0.3) }}
    >
      {initials(name)}
    </span>
  );
}

// ---------------------------------------------------------------- sheet
// Only the top-most open sheet reacts to Escape, so a person sheet opened on
// top of the cast sheet closes first.
const openSheets = [];

export function Sheet({ open, title, subtitle, action, onClose, children, variant, role = 'dialog' }) {
  const panel = useRef(null);
  const token = useRef({});
  // Remember what had focus BEFORE the sheet opened. This has to be read during
  // render: a child that autofocuses itself (the Add dialog's search box) takes
  // focus before any effect here runs, and we'd then "restore" focus to an
  // element that is about to be removed instead of back to the trigger button.
  const returnFocus = useRef(null);
  if (open && !returnFocus.current) returnFocus.current = document.activeElement;
  if (!open) returnFocus.current = null;

  useEffect(() => {
    if (!open) return undefined;
    // Capture now: by the time this effect's cleanup runs (when `open` flips to
    // false) the render above has already reset the ref.
    const back = returnFocus.current;
    const me = token.current;
    openSheets.push(me);
    const onKey = (e) => {
      if (e.key === 'Escape' && openSheets[openSheets.length - 1] === me) onClose();
    };
    document.addEventListener('keydown', onKey);

    // Lock background scroll while a sheet is up (restore whatever was there).
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the panel — unless something inside (e.g. an autofocused search
    // box) has already taken focus, which we must not steal.
    if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      const i = openSheets.indexOf(me);
      if (i >= 0) openSheets.splice(i, 1);
      if (openSheets.length === 0) document.body.style.overflow = prevOverflow;
      if (back && back.focus && document.contains(back)) back.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="sd-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={'sd-sheet' + (variant ? ` sd-sheet--${variant}` : '')}
        role={role}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
      >
        <div className="sd-handle" />
        <div className="sd-sheet-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="sd-h2 sd-ell" style={{ fontSize: 20 }}>{title}</span>
            {subtitle && (
              <span className="sd-ell" style={{ fontSize: 12, color: 'var(--text-dim)' }}>{subtitle}</span>
            )}
          </div>
          {action || (
            <button
              className="sd-linkbtn"
              onClick={onClose}
              style={{ height: 44, padding: '0 8px', fontSize: 15 }}
            >
              Done
            </button>
          )}
        </div>
        <div className="sd-sheet-body">{children}</div>
      </div>
    </div>
  );
}
