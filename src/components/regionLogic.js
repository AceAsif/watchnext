// PURE: the region the app checks streaming availability for. No DOM, no store.
//
// TMDB (via JustWatch) answers "where can I watch this?" per country, so the app needs to
// know which one you are in. It was fixed to Australia; it is now a setting kept on THIS
// device (see store/servicesPrefs.js), because a phone you take overseas is in a different
// place from a laptop at home. Every cached availability answer carries the region it was
// checked for (`providersRegion`), so changing the setting never mixes two countries' lists.

export const DEFAULT_REGION = 'AU';

// ISO 3166-1 alpha-2 codes TMDB has watch providers for (the common ones; sorted by name).
export const REGIONS = [
  ['AR', 'Argentina'], ['AU', 'Australia'], ['AT', 'Austria'], ['BD', 'Bangladesh'], ['BE', 'Belgium'],
  ['BR', 'Brazil'], ['CA', 'Canada'], ['CL', 'Chile'], ['CO', 'Colombia'], ['CZ', 'Czechia'],
  ['DK', 'Denmark'], ['EG', 'Egypt'], ['FI', 'Finland'], ['FR', 'France'], ['DE', 'Germany'],
  ['GR', 'Greece'], ['HK', 'Hong Kong'], ['HU', 'Hungary'], ['IN', 'India'], ['ID', 'Indonesia'],
  ['IE', 'Ireland'], ['IL', 'Israel'], ['IT', 'Italy'], ['JP', 'Japan'],
  ['MY', 'Malaysia'], ['MX', 'Mexico'], ['NL', 'Netherlands'], ['NZ', 'New Zealand'], ['NO', 'Norway'],
  ['PK', 'Pakistan'], ['PE', 'Peru'], ['PH', 'Philippines'], ['PL', 'Poland'], ['PT', 'Portugal'],
  ['RO', 'Romania'], ['SA', 'Saudi Arabia'], ['SG', 'Singapore'], ['ZA', 'South Africa'], ['KR', 'South Korea'], ['ES', 'Spain'],
  ['SE', 'Sweden'], ['CH', 'Switzerland'], ['TW', 'Taiwan'], ['TH', 'Thailand'], ['TR', 'Türkiye'],
  ['AE', 'United Arab Emirates'], ['GB', 'United Kingdom'], ['US', 'United States'], ['VN', 'Vietnam'],
].map(([code, name]) => ({ code, name }));

const CODES = new Set(REGIONS.map((r) => r.code));
export const isRegion = (v) => typeof v === 'string' && CODES.has(v);
// Anything saved or synced that isn't a known code falls back to the default (never throws).
export const cleanRegion = (v) => (isRegion(v) ? v : DEFAULT_REGION);
export const regionName = (code) => (REGIONS.find((r) => r.code === code) || REGIONS.find((r) => r.code === DEFAULT_REGION)).name;

// "in Australia" / "in the United States": a few names need "the".
const THE = new Set(['US', 'GB', 'AE', 'NL', 'PH']);
export const inRegion = (code) => `in ${THE.has(code) ? 'the ' : ''}${regionName(code)}`;

// The region a cached record was checked for. Records saved before this setting existed
// have no stamp and were always Australian.
export const recordRegion = (rec) => cleanRegion(rec && rec.providersRegion);
