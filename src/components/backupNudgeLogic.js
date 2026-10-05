// PURE (apart from the tiny storage helpers, which take the storage as an argument):
// the gentle "it's been 30 days since your last backup" reminder in Settings.
//
// What counts as a backup: downloading the backup file from THIS device (Settings →
// Download backup, which "Delete everywhere" also does first). CSV exports are not
// backups. The record is per device (a file lives on one device) and is never
// synced or added to the backup file itself.
//
// When it nudges
//   * there is something worth protecting (the library is not empty), and
//   * it is not snoozed, and
//   * either: the last backup is 30+ days old AND the library has changed since
//     (a library that has not changed needs no new backup), or
//     no backup was ever made and this device has had the library for a week.
//   "Remind me later" snoozes for a week.

import { localDate } from './csvExport.js';
import { fmtDay } from './statsLogic.js';

export const META_KEY = 'watchnext-backup-v1';
export const NUDGE_DAYS = 30;
export const FIRST_NUDGE_DAYS = 7;
export const SNOOZE_DAYS = 7;
const DAY = 86400000;

const ms = (iso) => { const v = Date.parse(iso); return Number.isFinite(v) ? v : NaN; };
const validIso = (s) => typeof s === 'string' && s !== '' && Number.isFinite(Date.parse(s));
const nowMs = (now) => (now instanceof Date ? now.getTime() : Number(now));

export const EMPTY_META = Object.freeze({ lastAt: '', lastCount: null, since: '', snoozedUntil: '' });

export function sanitizeMeta(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  const c = Number(m.lastCount);
  return {
    lastAt: validIso(m.lastAt) ? m.lastAt : '',
    lastCount: Number.isInteger(c) && c >= 0 ? c : null,
    since: validIso(m.since) ? m.since : '',
    snoozedUntil: validIso(m.snoozedUntil) ? m.snoozedUntil : '',
  };
}

// storage = { getItem, setItem } (localStorage in the app, a fake in tests)
export function loadMeta(storage) {
  try { return sanitizeMeta(JSON.parse(storage.getItem(META_KEY))); } catch (e) { return { ...EMPTY_META }; }
}
export function saveMeta(storage, meta) {
  try { storage.setItem(META_KEY, JSON.stringify(sanitizeMeta(meta))); } catch (e) { /* storage full / blocked: the nudge just won't remember */ }
}

// A cheap fingerprint of "how much is in the library": shows + watched episodes + movies.
export function libraryCount(state) {
  let n = 0;
  for (const s of Object.values((state && state.shows) || {})) {
    if (!s || typeof s !== 'object') continue;
    n += 1 + Object.keys(s.watched || {}).length;
  }
  return n + (Array.isArray(state && state.movies) ? state.movies.length : 0);
}

// Whole days since `iso` (null if it isn't a date). Negative if it is in the future (clock skew).
export function daysSince(iso, now = new Date()) {
  const t = ms(iso);
  return Number.isFinite(t) ? Math.floor((nowMs(now) - t) / DAY) : null;
}

// First time this device sees a non-empty library: remember it, so a brand-new library isn't nagged.
export function withSince(meta, count, now = new Date()) {
  return !meta.since && count > 0 ? { ...meta, since: new Date(nowMs(now)).toISOString() } : meta;
}

// -> { show, kind: 'overdue' | 'never' | null, days }
export function nudgeStatus(meta, count, now = new Date()) {
  const none = { show: false, kind: null, days: null };
  if (!(count > 0)) return none;
  if (validIso(meta.snoozedUntil) && ms(meta.snoozedUntil) > nowMs(now)) return none;
  if (validIso(meta.lastAt)) {
    const days = daysSince(meta.lastAt, now);
    return days >= NUDGE_DAYS && count !== meta.lastCount ? { show: true, kind: 'overdue', days } : none;
  }
  const days = daysSince(meta.since, now);
  return days != null && days >= FIRST_NUDGE_DAYS ? { show: true, kind: 'never', days } : none;
}

export function afterBackup(meta, count, now = new Date()) {
  const iso = new Date(nowMs(now)).toISOString();
  return { ...meta, lastAt: iso, lastCount: count, snoozedUntil: '', since: meta.since || iso };
}
export function afterSnooze(meta, now = new Date()) {
  return { ...meta, snoozedUntil: new Date(nowMs(now) + SNOOZE_DAYS * DAY).toISOString() };
}

export function nudgeCopy(status) {
  const body = 'A quick download keeps a copy of your history safe, in case you ever delete something or a sync goes wrong.';
  return status.kind === 'never'
    ? { title: 'You haven’t made a backup yet', body }
    : { title: `It’s been ${status.days} days since your last backup`, body };
}

// The always-visible line in the Backup card.
export function lastBackupLine(meta, now = new Date()) {
  if (!validIso(meta.lastAt)) return 'No backup downloaded from this device yet.';
  const days = daysSince(meta.lastAt, now);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${fmtDay(localDate(meta.lastAt))} (${days} days ago)`;
  return `Last backup: ${when}`;
}
