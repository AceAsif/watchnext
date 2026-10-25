// OMDb (www.omdbapi.com): IMDb, Rotten Tomatoes (critics) and Metacritic scores for one IMDb id.
// The key is built into the site from VITE_OMDB_API_KEY (the GitHub ENV_FILE secret). Without
// it, scores simply don't show. Free keys allow 1,000 lookups a day; answers are saved on the
// device (components/scoresLogic.js), so each title is looked up rarely.

export const omdbKey = () => import.meta.env.VITE_OMDB_API_KEY || '';
export const hasOmdb = () => !!omdbKey();

export async function omdbById(imdbId) {
  const key = omdbKey();
  if (!key) throw new Error('No OMDb key');
  const q = new URLSearchParams({ i: imdbId, apikey: key });
  const res = await fetch(`https://www.omdbapi.com/?${q}`);
  if (res.status === 401) throw new Error('OMDb key not accepted (or the daily limit is used up)');
  if (!res.ok) throw new Error(`OMDb ${res.status}`);
  return res.json();
}

// One season's episodes with their IMDb scores, in one lookup (components/epScoresLogic.js).
export async function omdbSeason(imdbId, season) {
  const key = omdbKey();
  if (!key) throw new Error('No OMDb key');
  const q = new URLSearchParams({ i: imdbId, Season: String(season), apikey: key });
  const res = await fetch(`https://www.omdbapi.com/?${q}`);
  if (res.status === 401) throw new Error('OMDb key not accepted (or the daily limit is used up)');
  if (!res.ok) throw new Error(`OMDb ${res.status}`);
  return res.json();
}
