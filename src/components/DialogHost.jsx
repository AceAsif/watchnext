import React, { useEffect, useSyncExternalStore } from 'react';
import { Sheet } from './ui.jsx';
import { subscribeDialogs, getDialogs, dismissNotice, answerConfirm } from './appDialogs.js';

// Draws the in-app messages (top of the screen) and the one open question (a confirm sheet),
// for the whole app. Mounted once in App.jsx. See appDialogs.js.

function Notice({ n }) {
  useEffect(() => {
    const t = setTimeout(() => dismissNotice(n.id), n.ms);
    return () => clearTimeout(t);
  }, [n.id, n.ms]);
  return (
    <div className={'sd-notice' + (n.kind === 'err' ? ' err' : '')} role={n.kind === 'err' ? 'alert' : 'status'} data-testid="notice">
      <span className="txt">{n.text}</span>
      <button type="button" className="x" aria-label="Dismiss message" onClick={() => dismissNotice(n.id)}>×</button>
    </div>
  );
}

export default function DialogHost() {
  const { notices, ask } = useSyncExternalStore(subscribeDialogs, getDialogs);
  return (
    <>
      {notices.length > 0 && (
        <div className="sd-notices">
          {notices.map((n) => <Notice key={n.id} n={n} />)}
        </div>
      )}
      {ask && (
        <Sheet key={ask.id} open title={ask.title} role="alertdialog" variant="confirm" onClose={() => answerConfirm(ask.id, false)} action={<span />}>
          {ask.body ? <p className="sd-ask-body">{ask.body}</p> : null}
          <div className="sd-confirm-acts">
            <button type="button" className={'sd-setbtn ' + (ask.danger ? 'solid-danger' : 'primary')} onClick={() => answerConfirm(ask.id, true)} data-testid="ask-yes">
              {ask.confirmLabel}
            </button>
            <button type="button" className="sd-setbtn" autoFocus onClick={() => answerConfirm(ask.id, false)} data-testid="ask-no">{ask.cancelLabel}</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
