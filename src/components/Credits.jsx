import React from 'react';

// Where WatchNext's data comes from. TMDB's API terms require this exact notice in an About /
// Credits area (text only here: a TMDB logo would have to be one of their approved versions).
export const TMDB_NOTICE = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';

export default function Credits() {
  return (
    <footer className="sd-credits" data-testid="credits" aria-label="Credits">
      <h2 className="sd-lbl">Credits</h2>
      <p><b>{TMDB_NOTICE}</b></p>
      <p>
        Show and movie details, posters, cast and trailers come from{' '}
        <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">The Movie Database (TMDB)</a>.
        Anime details come from <a href="https://anilist.co/" target="_blank" rel="noopener noreferrer">AniList</a>.
      </p>
      <p>
        Where-to-watch data by <a href="https://www.justwatch.com/" target="_blank" rel="noopener noreferrer">JustWatch</a> (through TMDB).
        IMDb, Rotten Tomatoes and Metacritic scores come from the <a href="https://www.omdbapi.com/" target="_blank" rel="noopener noreferrer">OMDb API</a>.
      </p>
    </footer>
  );
}
