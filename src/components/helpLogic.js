// Help & FAQ search (pure logic, unit-tested in plain node).

// Lower case, no accents, curly quotes made straight, so "dont" finds "don’t".
export function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/'/g, '');
}

// All the searchable text of one entry (its section title too). extra = text added by the page
// (e.g. the keyboard shortcut labels), so they can be found as well.
export function entryText(section, item, extra = '') {
  return norm([section.title, item.q, ...(item.a || []), ...(item.steps || []), extra].join(' \n '));
}

/**
 * Filter the help by a search. Every word must appear somewhere in an entry.
 * Returns [{ section, items }] with only matching entries (empty sections left out).
 * An empty search returns everything.
 * extraFor(item) can add searchable text for an entry.
 */
export function searchHelp(sections, query, extraFor = () => '') {
  const words = norm(query).split(/[^a-z0-9+?/]+/).filter(Boolean);
  if (!words.length) return sections.map((section) => ({ section, items: section.items }));
  const out = [];
  for (const section of sections) {
    const items = section.items.filter((item) => {
      const text = entryText(section, item, extraFor(item));
      return words.every((w) => text.includes(w));
    });
    if (items.length) out.push({ section, items });
  }
  return out;
}

export const countItems = (groups) => groups.reduce((n, g) => n + g.items.length, 0);

// Unique key for one entry, used to remember which answers are open.
export const itemKey = (section, item) => `${section.id}/${item.id}`;
