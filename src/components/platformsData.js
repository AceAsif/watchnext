// PURE data + mapping for streaming platforms (no React), shared by the picker UI and
// the "On my services" logic. PlatformPicker.jsx re-exports these.

// Colours are brightened so the name reads clearly on the dark theme; `dark`
// means the filled (selected) chip needs dark text for contrast. Add a
// platform by adding one row here — nothing else needs to change.
export const PLATFORMS = [
  { id: 'netflix', label: 'Netflix', color: '#E50914', dark: false },
  { id: 'disney', label: 'Disney+', color: '#4F86F7', dark: false },
  { id: 'prime', label: 'Prime Video', color: '#22B8F0', dark: true },
  { id: 'max', label: 'Max', color: '#A855F7', dark: false },
  { id: 'paramount', label: 'Paramount+', color: '#3B82F6', dark: false },
  { id: 'appletv', label: 'Apple TV+', color: '#B0B3B8', dark: true },
  { id: 'hulu', label: 'Hulu', color: '#1CE783', dark: true },
  { id: 'crunchyroll', label: 'Crunchyroll', color: '#F47521', dark: true },
  { id: 'stan', label: 'Stan', color: '#EC4899', dark: false },
  { id: 'binge', label: 'Binge', color: '#FF5A36', dark: false },
  { id: 'iview', label: 'ABC iview', color: '#00B2A9', dark: true },
  { id: 'youtube', label: 'YouTube', color: '#FF0000', dark: false },
  { id: 'cinema', label: 'Cinema', color: '#F5C518', dark: true }, // in a cinema/theatre (movies, mostly); never auto-detected
  { id: 'other', label: 'Other / unofficial', color: '#9AA4B2', dark: true },
];

export function platformById(id) {
  return PLATFORMS.find((p) => p.id === id) || null;
}

// Map a TMDB watch-provider name to one of our chip ids, or null if we have no
// chip for it (e.g. Paramount+). Order matters — 'max' is matched loosely and
// last so it doesn't swallow other names.
export function providerToPlatform(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('netflix')) return 'netflix';
  if (n.includes('disney')) return 'disney';
  if (n.includes('prime video') || n.includes('amazon')) return 'prime';
  if (n.includes('apple tv')) return 'appletv';
  if (n.includes('crunchyroll')) return 'crunchyroll';
  if (n.includes('paramount')) return 'paramount';
  if (n.includes('binge')) return 'binge';
  if (n.includes('stan')) return 'stan';
  if (n.includes('iview')) return 'iview';
  if (n.includes('hulu')) return 'hulu';
  if (n.includes('youtube')) return 'youtube';
  if (n === 'max' || n.includes('hbo max')) return 'max';
  return null;
}

// Given a TMDB AU flatrate list, return the first recognized chip id, or null.
export function platformFromProviders(flatrate) {
  for (const p of flatrate || []) {
    const id = providerToPlatform(p.provider_name || p.name);
    if (id) return id;
  }
  return null;
}
