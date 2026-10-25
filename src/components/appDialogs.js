// In-app messages and questions, instead of the browser's alert() and confirm() pop-ups
// (those block the whole page, look different on every phone, and can't be styled).
// PURE store — no React, no DOM — so it is unit-tested in plain node. DialogHost.jsx draws it.
//
//   notify('Could not load trailer: offline', { kind: 'err' })  → a notice at the top, closes itself
//   if (await askConfirm({ title: 'Delete this list?', body: '…', confirmLabel: 'Delete list' })) …
//
// Only one question shows at a time; a second one waits its turn.

export const NOTICE_MS = 6000;     // how long a message stays
export const ERROR_MS = 9000;      // errors stay a bit longer (more to read)
export const MAX_NOTICES = 3;      // older ones go first

let notices = [];   // [{ id, text, kind: 'ok' | 'err', ms }]
let asks = [];      // [{ id, title, body, confirmLabel, cancelLabel, danger, resolve }]
let seq = 0;
let state = { notices, ask: null };
const listeners = new Set();
const emit = () => { state = { notices, ask: asks[0] || null }; listeners.forEach((fn) => fn()); };

export const subscribeDialogs = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getDialogs = () => state;

/** Show a message. Returns its id. Same text twice in a row just restarts it (no stack of repeats). */
export function notify(text, { kind = 'ok', ms } = {}) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return null;
  notices = notices.filter((n) => !(n.text === t && n.kind === kind));
  const n = { id: ++seq, text: t, kind: kind === 'err' ? 'err' : 'ok', ms: ms || (kind === 'err' ? ERROR_MS : NOTICE_MS) };
  notices = [...notices, n].slice(-MAX_NOTICES);
  emit();
  return n.id;
}
export const notifyError = (text, opts = {}) => notify(text, { ...opts, kind: 'err' });

export function dismissNotice(id) {
  const before = notices.length;
  notices = notices.filter((n) => n.id !== id);
  if (notices.length !== before) emit();
}

/** Ask a yes/no question. Resolves true (confirmed) or false (Cancel, Esc, tapping outside). */
export function askConfirm({ title, body = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = true } = {}) {
  return new Promise((resolve) => {
    asks = [...asks, { id: ++seq, title: String(title || 'Are you sure?'), body: String(body || ''), confirmLabel, cancelLabel, danger: danger !== false, resolve }];
    emit();
  });
}

/** Answer the question that is showing. */
export function answerConfirm(id, yes) {
  const a = asks.find((x) => x.id === id);
  if (!a) return;
  asks = asks.filter((x) => x.id !== id);
  emit();
  a.resolve(!!yes);
}

// For tests: clear everything (unanswered questions resolve false).
export function resetDialogs() {
  const pending = asks;
  notices = []; asks = []; emit();
  pending.forEach((a) => a.resolve(false));
}

// A short, plain reason from an error ("Failed to fetch" → "you seem to be offline").
export function reason(e) {
  const m = String((e && e.message) || e || '').trim();
  if (!m) return 'something went wrong';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) return 'you seem to be offline';
  return m.length > 140 ? m.slice(0, 137) + '…' : m;
}
