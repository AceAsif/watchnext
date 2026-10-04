// PURE: the "You finished <show>" share card. No DOM, no store.
//
// A show is FINISHED when every episode TMDB lists has been watched AND the show is
// not still running (a returning series you're caught up on is "caught up", not
// finished). Dates are honest: the finish date is the last watch, but a START date
// and "took N days" are shown only when this show's watches look like real viewing,
// not a bulk import / "mark season watched" that stamped many episodes in one minute.

import { BATCH_MIN, fmtDay } from './statsLogic.js';
import { localDate } from './csvExport.js';
import { IMG_W, IMG_H, IMG_PAD, fitText } from './yearImageLogic.js';

const ONGOING = new Set(['returning series', 'in production', 'planned', 'pilot']);
export const isOngoing = (show) => ONGOING.has(String((show && show.status) || '').trim().toLowerCase());
const seenCount = (show) => Object.keys((show && show.watched) || {}).length;

export function isFinishedShow(show) {
  const total = show && show.totalEpisodes;
  return !!total && total > 0 && seenCount(show) >= total && !isOngoing(show);
}

// Would marking `added` more (new) episodes complete the show? Used to offer the card
// right after the final episode is marked.
export function becomesFinished(show, added) {
  const total = show && show.totalEpisodes;
  if (!total || total <= 0 || !(added > 0) || isOngoing(show)) return false;
  const seen = seenCount(show);
  return seen < total && seen + added >= total;
}

// Minutes (to the minute) in which BATCH_MIN or more episodes were stamped, across
// every show: the same "bulk import" rule Stats and the CSV use.
export function bulkMinutes(shows, min = BATCH_MIN) {
  const per = new Map();
  for (const s of Object.values(shows || {})) {
    if (!s || typeof s !== 'object') continue;
    for (const w of Object.values(s.watched || {})) {
      if (w && w.at) { const m = String(w.at).slice(0, 16); per.set(m, (per.get(m) || 0) + 1); }
    }
  }
  const out = new Set();
  for (const [m, c] of per) if (c >= min) out.add(m);
  return out;
}

const dayNum = (ds) => { const [y, m, d] = ds.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };

// Everything the card shows. `bulk` = bulkMinutes(all shows).
export function finishFacts(show, bulk) {
  const entries = Object.values((show && show.watched) || {}).filter((w) => w && typeof w === 'object');
  let minutes = 0;
  for (const w of entries) { const m = Number(w.min); minutes += Number.isFinite(m) && m > 0 ? m : (Number(show.runtimeMin) > 0 ? Number(show.runtimeMin) : 40); }
  const ats = entries.map((w) => w.at).filter((a) => typeof a === 'string' && a).sort();
  const first = ats.length ? localDate(ats[0]) : '';
  const last = ats.length ? localDate(ats[ats.length - 1]) : '';
  const okDates = /^\d{4}-\d{2}-\d{2}$/.test(first) && /^\d{4}-\d{2}-\d{2}$/.test(last);
  const inBulk = (bulk instanceof Set) && entries.some((w) => w.at && bulk.has(String(w.at).slice(0, 16)));
  const startCredible = okDates && !inBulk;
  return {
    name: String((show && show.name) || 'Untitled'),
    poster: (show && show.poster) || null,
    episodes: entries.length,
    hours: Math.round(minutes / 60),
    rating: Math.min(5, Math.max(0, Math.round(Number(show && show.rating) || 0))),
    finishedDate: okDates ? last : '',
    startedDate: startCredible ? first : '',
    days: startCredible ? dayNum(last) - dayNum(first) + 1 : null,
  };
}

export function finishStatCells(f) {
  const cells = [[f.episodes.toLocaleString(), f.episodes === 1 ? 'EPISODE' : 'EPISODES'], [f.hours.toLocaleString(), f.hours === 1 ? 'HOUR' : 'HOURS']];
  if (f.days != null) cells.push([f.days.toLocaleString(), f.days === 1 ? 'DAY' : 'DAYS']);
  return cells;
}

export function finishDatesLine(f) {
  if (!f.finishedDate) return '';
  return f.startedDate && f.startedDate !== f.finishedDate
    ? `Started ${fmtDay(f.startedDate)} · Finished ${fmtDay(f.finishedDate)}`
    : `Finished ${fmtDay(f.finishedDate)}`;
}

export function finishShareLine(f) {
  return [
    `I just finished ${f.name} on WatchNext:`,
    `${f.episodes.toLocaleString()} ${f.episodes === 1 ? 'episode' : 'episodes'}, ${f.hours.toLocaleString()} ${f.hours === 1 ? 'hour' : 'hours'}.`,
    f.days != null && f.days > 1 ? `Took ${f.days.toLocaleString()} days.` : '',
    f.rating ? `${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}` : '',
  ].filter(Boolean).join(' ');
}

export const finishFileName = (f) => {
  const slug = f.name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `watchnext-finished-${slug || 'show'}.png`;
};

// ------------------------------------------------------------------ title wrapping
// Largest font size at which the title fits `maxLines` lines. `measureAt(size, str)`
// gives a string's pixel width at that size. Lines break at spaces; a single word
// wider than the line (a long CJK title, say) is split by character. If nothing
// fits even at the smallest size, the last line ends with an ellipsis.
export function wrapTitle(measureAt, text, { sizes = [150, 128, 108, 92, 80, 68], maxW, maxLines = 2 } = {}) {
  const str = String(text == null ? '' : text).trim() || 'Untitled';
  const wrapAt = (size) => {
    const m = (s) => measureAt(size, s);
    const lines = [];
    let cur = '';
    const push = (piece) => { lines.push(piece); cur = ''; };
    for (const word of str.split(/\s+/)) {
      const tryLine = cur ? `${cur} ${word}` : word;
      if (m(tryLine) <= maxW) { cur = tryLine; continue; }
      if (cur) push(cur);
      if (m(word) <= maxW) { cur = word; continue; }
      // a single over-long word: split by character
      let piece = '';
      for (const ch of Array.from(word)) {
        if (piece && m(piece + ch) > maxW) { push(piece); piece = ''; }
        piece += ch;
      }
      cur = piece;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  for (const size of sizes) {
    const lines = wrapAt(size);
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  const all = wrapAt(size);
  const kept = all.slice(0, maxLines);
  kept[maxLines - 1] = fitText((s) => measureAt(size, s), all.slice(maxLines - 1).join(' '), maxW);
  return { size, lines: kept };
}

// ------------------------------------------------------------------ layout
// The poster takes whatever height is free under the title (between these limits), always 2:3.
export const FINISH_POSTER_H = { min: 600, max: 720 };

export function planFinishImage(f, title) {
  const P = IMG_PAD, W = IMG_W;
  const size = title.size, n = title.lines.length;
  const lineH = Math.round(size * 1.02);
  const labelY = P + 20;
  const firstBase = labelY + 36 + Math.round(size * 0.82);
  const titleBottom = firstBase + (n - 1) * lineH + Math.round(size * 0.22);
  const posterTop = titleBottom + 36;
  const footerBase = IMG_H - P;
  const footerRule = footerBase - 52;
  const datesLine = finishDatesLine(f);
  const free = footerRule - 48 - posterTop - (datesLine ? 74 : 0);
  const ph = Math.max(FINISH_POSTER_H.min, Math.min(FINISH_POSTER_H.max, free));
  const poster = { x: P, y: posterTop, w: Math.round((ph * 2) / 3), h: ph };
  const col = { x: poster.x + poster.w + 56 };
  col.w = W - P - col.x;

  const cells = finishStatCells(f);
  // spread the stats down the poster's height (150..190px apart)
  const pitch = Math.max(150, Math.min(190, Math.floor((ph - 110 - (f.rating ? 90 : 0)) / Math.max(1, cells.length - 1))));
  const stats = cells.map((c, i) => ({ value: c[0], label: c[1], valueY: posterTop + 72 + i * pitch, labelY: posterTop + 72 + i * pitch + 34 }));
  const statsBottom = stats.length ? stats[stats.length - 1].labelY : posterTop;
  const starsY = f.rating ? statsBottom + 76 : null;
  const colBottom = starsY != null ? starsY + 14 : statsBottom;

  const content = Math.max(poster.y + poster.h, colBottom);
  const datesY = datesLine ? content + 62 : null;
  const bottom = datesY != null ? datesY + 12 : content;
  // spread the leftover space: everything under the caption moves down a little so
  // a one-line title doesn't leave a hole above the footer
  const dy = Math.max(0, Math.min(40, Math.floor((footerRule - 48 - bottom) / 2)));

  const mv = (y) => (y == null ? y : y + dy);
  return {
    labelY,
    titleSize: size, titleLineH: lineH, titleBases: title.lines.map((_, i) => firstBase + dy + i * lineH),
    poster: { ...poster, y: poster.y + dy },
    col, stats: stats.map((s) => ({ ...s, valueY: s.valueY + dy, labelY: s.labelY + dy })),
    starsY: mv(starsY), datesY: mv(datesY), datesLine,
    bottom: bottom + dy, footerBase, footerRule,
  };
}
