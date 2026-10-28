import React from 'react';
import TitleInfoSheet from './TitleInfoSheet.jsx';
import { askConfirm } from './appDialogs.js';

// A film on your Watchlist that you haven't watched yet: read about it before you decide
// (description, ▶ Trailer, scores, where to watch, cast), then "I watched it" or "Remove".
// movie: the planned entry ({ index, tmdbId, name, poster, year, runtimeMin }).
export default function MovieInfoSheet({ movie, onClose, onWatched, onRemove }) {
  if (!movie) return null;
  return (
    <TitleInfoSheet
      kind="movie"
      title={movie}
      note="On your watchlist"
      testId="movie-info"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="sd-btn primary" onClick={() => { onWatched(movie); onClose(); }}>✓ I watched it</button>
          <button
            type="button"
            className="sd-btn"
            onClick={async () => {
              if (await askConfirm({ title: 'Remove from your watchlist?', body: `“${movie.name}” will be taken off your watchlist.`, confirmLabel: 'Remove' })) { onRemove(movie); onClose(); }
            }}
          >
            Remove from watchlist
          </button>
        </>
      }
    />
  );
}
