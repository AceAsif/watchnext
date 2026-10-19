// Star ratings in half steps. PURE: no DOM, no store.
//
// Ratings are 0 (none) or 0.5–5 in steps of 0.5. Shows use whole stars only; movies can
// have halves (Letterboxd rates in halves too).

// How star n (1–5) looks for a rating: 'full', 'half' or 'empty'.
export function starFill(value, n) {
  const v = Number(value) || 0;
  if (v >= n) return 'full';
  if (v >= n - 0.5) return 'half';
  return 'empty';
}

// Which rating a tap on star n gives: the left half -> n - 0.5, the right half -> n.
export function starFromPointer(n, x, width) {
  return width > 0 && x < width / 2 ? n - 0.5 : n;
}

// Any number -> a valid rating: nearest half step, 0 when not a positive number, at most 5.
export function cleanRating(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(5, Math.max(0.5, Math.round(n * 2) / 2));
}

// "3.5", "4" — for labels.
export const starLabel = (v) => String(cleanRating(v));
