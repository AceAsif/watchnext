// Calendar export: upcoming episodes as a calendar file (.ics) for iPhone, Google or Outlook.
// PURE: no DOM, no store.
//
// TMDB gives the air DATE but not the time, so each episode is an all-day event.
// Every episode has a fixed id (UID), and the ids already exported are remembered on this
// device, so the next export can offer just the new ones and nothing is added twice.

export const EXPORTED_KEY = 'watchnext-cal-exported-v1';
const MAX_REMEMBERED = 2000;

const pad = (n) => String(n).padStart(2, '0');
export const epCode = (s, e) => `S${pad(s)}E${pad(e)}`;
export const uidOf = (it) => `watchnext-${it.show.tmdbId || it.id}-s${it.s}e${it.e}@watchnext`;
const ymd = (iso) => iso.replace(/-/g, '');
const nextDay = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// Text in .ics: backslash, ; , and new lines must be escaped.
export const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 bytes are folded (new line + a space), never inside a character.
export function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// A real episode title (TMDB's "Episode 6" placeholders say nothing).
const realName = (it) => {
  const n = String(it.name || '').trim();
  return n && !/^episode \d+$/i.test(n) ? n : '';
};

// items: Up Next "On the way" items ({ id, show, s, e, name, date }); hide(it) -> true to leave
// the episode title out (Spoiler shield); siteUrl: link back to WatchNext.
export function buildIcs(items, { hide = () => false, now = new Date(), siteUrl = '' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WatchNext//Episodes//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:WatchNext episodes',
  ];
  for (const it of items) {
    const name = hide(it) ? '' : realName(it);
    const title = `${it.show.name} · ${epCode(it.s, it.e)}${name ? ` · ${name}` : ''}`;
    const about = [
      name ? `${epCode(it.s, it.e)}: ${name}` : epCode(it.s, it.e),
      'Air date from TMDB. The time isn’t known, so this is an all-day event.',
      siteUrl ? `Mark it watched in WatchNext: ${siteUrl}` : '',
    ].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidOf(it)}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${ymd(it.date)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(it.date))}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(about)}`,
      'TRANSP:TRANSPARENT', // shows as free, not busy
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export const fileName = (today) => `watchnext-episodes-${today}.ics`;

// ------------------------------------------------------------------ what was exported before
export function loadExported(storage) {
  try {
    const v = JSON.parse(storage.getItem(EXPORTED_KEY));
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch (e) {
    return [];
  }
}
export function rememberExported(storage, before, items) {
  const all = [...new Set([...before, ...items.map(uidOf)])].slice(-MAX_REMEMBERED);
  try { storage.setItem(EXPORTED_KEY, JSON.stringify(all)); } catch (e) { /* blocked: everything counts as new next time */ }
  return all;
}

// -> { all, fresh (not exported before), first, last } for the sheet.
export function plan(items, exported) {
  const seen = new Set(exported);
  const fresh = items.filter((it) => !seen.has(uidOf(it)));
  return { all: items, fresh, first: items.length ? items[0].date : null, last: items.length ? items[items.length - 1].date : null };
}
