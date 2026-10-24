import React, { useEffect, useRef } from 'react';
import { Sheet } from './ui.jsx';
import { shortcutFor, SHORTCUT_LIST } from './keyboardShortcutsLogic.js';

// Listens for shortcut keys on the whole page (computer keyboards only; phones
// never send these key presses outside a text box, which we ignore anyway).
// actions: { search, tab(id), back, help }   canGoBack: Search / show page / Notes is open
export function useKeyboardShortcuts(actions, canGoBack) {
  const latest = useRef({ actions, canGoBack });
  latest.current = { actions, canGoBack };

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return; // something on the page already used this key
      const { actions: a, canGoBack: back } = latest.current;
      const modalOpen = !!document.querySelector('[aria-modal="true"]');
      const act = shortcutFor(e, { modalOpen, back });
      if (!act) return;
      e.preventDefault(); // e.g. stops Firefox's "/" quick-find
      if (act.type === 'search') a.search();
      else if (act.type === 'tab') a.tab(act.id);
      else if (act.type === 'back') a.back();
      else if (act.type === 'help') a.help();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function ShortcutsSheet({ open, onClose, onOpenHelp }) {
  return (
    <Sheet open={open} title="Keyboard shortcuts" subtitle="On a computer keyboard" onClose={onClose}>
      <ul className="sd-keys">
        {SHORTCUT_LIST.map((s) => (
          <li key={s.label}>
            <span>{s.label}</span>
            <span className="sd-keys-k">
              {s.keys.map((k) => <kbd key={k}>{k}</kbd>)}
            </span>
          </li>
        ))}
      </ul>
      <p className="sd-keys-note">Shortcuts don't work while you type in a box. Press Esc to close this.</p>
      {onOpenHelp && (
        <button type="button" className="sd-linkbtn sd-keys-help" onClick={onOpenHelp} data-testid="keys-help">
          More help: Help &amp; FAQ ›
        </button>
      )}
    </Sheet>
  );
}
