import React from 'react';
import { img } from '../api/tmdb.js';
import './ui.css';

// Shared pieces for the Movies / Watchlist / Settings redesign — the same
// look as Shows, Up Next and Stats: a big page title, a search field, poster
// tiles and card rows. Styling lives in ui.css (sd-* classes).

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

// "Movies 408" — page title with a dim count, and optional controls on the right.
export function PageHead({ title, count, right }) {
  return (
    <div className="sd-pagehead">
      <h1 className="sd-title">
        {title}
        {count != null && <span className="sd-count">{count.toLocaleString()}</span>}
      </h1>
      {right}
    </div>
  );
}

// Rounded search box with a leading icon. Pass `onSubmit` to make it a form
// with a trailing action button (e.g. "Search").
export function SearchField({ value, onChange, placeholder, label, onSubmit, action, busy, disabled }) {
  const field = (
    <label className="sd-field">
      <SearchIcon />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label || placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
  if (!onSubmit) return field;
  return (
    <form className="sd-searchbar" onSubmit={onSubmit}>
      {field}
      <button className="sd-btn primary sd-searchbtn" type="submit" disabled={busy || disabled}>
        {action || 'Search'}
      </button>
    </form>
  );
}

// A poster image, or a titled placeholder when TMDB has none.
export function Poster({ path, name, width, height, radius = 8 }) {
  const style = { width, height, borderRadius: radius };
  return path ? (
    <img className="sd-poster" src={img(path, 'w185')} alt="" loading="lazy" style={style} />
  ) : (
    <span className="sd-poster sd-poster-ph" aria-hidden="true" style={style}>
      {name}
    </span>
  );
}

// Grid tile: big poster, title, small mono meta line. `badge` sits on the
// poster's bottom-left corner (e.g. a rating).
export function PosterTile({ path, name, meta, badge, onClick }) {
  return (
    <button type="button" className="sd-tilebtn" onClick={onClick}>
      <span className="sd-tilebtn-art">
        {path ? (
          <img src={img(path, 'w342')} alt="" loading="lazy" />
        ) : (
          <span className="sd-poster-ph sd-tilebtn-ph">{name}</span>
        )}
        {badge ? <span className="sd-tilebtn-badge">{badge}</span> : null}
      </span>
      <span className="sd-tilebtn-name">{name}</span>
      {meta ? <span className="sd-tilebtn-meta">{meta}</span> : null}
    </button>
  );
}

// A card row: poster, title + sub-lines, and actions on the right.
export function MediaRow({ path, name, children, actions, onClick, sep }) {
  const body = (
    <>
      <Poster path={path} name={name} width={44} height={66} />
      <span className="sd-mrow-info">{children}</span>
    </>
  );
  return (
    <div className={'sd-mrow' + (sep ? ' sd-sep' : '')}>
      {onClick ? (
        <button type="button" className="sd-open" onClick={onClick}>{body}</button>
      ) : (
        <div className="sd-open">{body}</div>
      )}
      {actions ? <div className="sd-mrow-actions">{actions}</div> : null}
    </div>
  );
}

export const Empty = ({ title, children }) => (
  <div className="sd-card sd-pad sd-empty">
    {title && <strong>{title}</strong>}
    {title && <br />}
    {children}
  </div>
);

export const CheckIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
