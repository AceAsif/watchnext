import React, { useEffect, useMemo, useRef, useState } from 'react';
import { img, hasKey } from '../api/tmdb.js';
import { Chevron, Sheet } from './ui.jsx';
import { nextTab } from './statsLogic.js';
import { posterTint, initialOf, resultsLabel } from './libraryLogic.js';
import './ui.css';

// The pieces of the Shows and Movies pages from the Claude Design round
// (Direction A): ONE obvious filter box, adding behind a separate "+ Add"
// button, Status / Platform / Sort as dropdown chips with counts (a bottom
// sheet on a phone, a popover on desktop), a Tools menu, honest empty states,
// and poster tiles. Styling lives in ui.css (sd-l* / sd-res* classes).

// ---------------------------------------------------------------- icons
const Svg = ({ children, size = 18, sw = 1.8, fill = 'none', style, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flex: 'none', ...style }}
    {...rest}
  >
    {children}
  </svg>
);
export const FunnelIcon = (p) => <Svg {...p}><path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8z" /></Svg>;
export const XIcon = (p) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const PlusIcon = (p) => <Svg sw={2.4} {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const SearchIcon = (p) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>;
export const WrenchIcon = (p) => <Svg {...p}><path d="M15 5a4 4 0 0 0-4.6 5.2L4 16.6V20h3.4l6.4-6.4A4 4 0 0 0 19 9l-2.6 2.6-2.6-.4-.4-2.6z" /></Svg>;
export const CheckIcon = (p) => <Svg sw={2.4} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const ArrowIcon = ({ down, ...p }) => (
  <Svg {...p}>{down ? <path d="M12 5v14M6 13l6 6 6-6" /> : <path d="M12 19V5M6 11l6-6 6 6" />}</Svg>
);
export const StarIcon = (p) => (
  <Svg fill="currentColor" sw={0} {...p}><path d="M12 2.8l2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.7l-5.8 3.1 1.1-6.5L2.6 9.7l6.5-.9z" /></Svg>
);
export const RefreshIcon = (p) => (
  <Svg {...p}><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></Svg>
);
export const SignalIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></Svg>
);
export const SpinnerIcon = (p) => (
  <Svg className="sd-spin" {...p}><path d="M12 3a9 9 0 1 0 9 9" /></Svg>
);
export const TvIcon = (p) => <Svg {...p}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8" /></Svg>;
export const FilmIcon = (p) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5M16 4v5" /></Svg>;

// ---------------------------------------------------------------- responsive
// True from 900px up, where dropdowns are popovers and the toolbar is one row.
export function useIsDesktop() {
  const q = '(min-width: 900px)';
  const get = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches;
  const [m, setM] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

// ---------------------------------------------------------------- the filter box
// The page's only text input. A funnel (not a magnifier) and a "Filter N …"
// placeholder say it narrows what you already have; adding lives behind "+ Add".
export function FilterField({ value, onChange, placeholder, label }) {
  return (
    <label className="sd-lfilter">
      <FunnelIcon style={{ color: 'var(--text-dim)' }} />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={label || placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {value ? (
        <button type="button" className="sd-lfilter-x" aria-label="Clear filter" onClick={() => onChange('')}>
          <XIcon size={16} />
        </button>
      ) : null}
    </label>
  );
}

// Status switch with counts (the Notes page). A real ARIA tab list (arrow keys, Home/End).
export function StatusTabs({ options, value, onChange, counts }) {
  const refs = useRef({});
  // With five tabs (the Dropped tab is showing) equal-width buttons are too narrow for
  // "Not started 1", so size them to their content and let the row scroll sideways on
  // the narrowest phones. Four tabs or fewer keep the original equal-width look.
  const roomy = options.length >= 5;
  useEffect(() => {
    const el = refs.current[value];
    if (roomy && el && el.scrollIntoView) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [value, roomy]);
  const onKeyDown = (e) => {
    const next = nextTab(options, value, e.key);
    if (!next) return;
    e.preventDefault();
    onChange(next);
    if (refs.current[next]) refs.current[next].focus();
  };
  return (
    <div className="sd-lstatus" role="tablist" aria-label="Show status" style={roomy ? { overflowX: 'auto', scrollbarWidth: 'none' } : undefined}>
      {options.map((o) => (
        <button
          key={o}
          role="tab"
          aria-selected={value === o}
          tabIndex={value === o ? 0 : -1}
          ref={(el) => { refs.current[o] = el; }}
          onClick={() => onChange(o)}
          onKeyDown={onKeyDown}
          style={roomy ? { flex: '1 0 auto', padding: '0 9px' } : undefined}
        >
          {o}
          <span className={'n' + (counts[o] === 0 ? ' z' : '')}>{counts[o]}</span>
        </button>
      ))}
    </div>
  );
}

// A small radio-style switch (the Movies "Recent / A–Z / Rating" sort).
export function SegmentedSort({ options, value, onChange, label }) {
  const ids = options.map((o) => o.id);
  const refs = useRef({});
  const onKeyDown = (e) => {
    const key = e.key === 'ArrowDown' ? 'ArrowRight' : e.key === 'ArrowUp' ? 'ArrowLeft' : e.key;
    const next = nextTab(ids, value, key);
    if (!next) return;
    e.preventDefault();
    onChange(next);
    if (refs.current[next]) refs.current[next].focus();
  };
  return (
    <div className="sd-lstatus sd-lseg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          tabIndex={value === o.id ? 0 : -1}
          ref={(el) => { refs.current[o.id] = el; }}
          onClick={() => onChange(o.id)}
          onKeyDown={onKeyDown}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- popover (desktop)
// Anchored dropdown panel: closes on outside click or Escape, arrow keys move
// between items. Render it inside a `.sd-pop-wrap` (position: relative).
export function Popover({ open, onClose, anchorRef, label, role = 'listbox', align = 'left', width = 260, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const inPanel = ref.current && ref.current.contains(e.target);
      const inAnchor = anchorRef.current && anchorRef.current.contains(e.target);
      if (!inPanel && !inAnchor) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        if (anchorRef.current) anchorRef.current.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open || !ref.current) return;
    const first = ref.current.querySelector('[aria-selected="true"]:not(:disabled)') ||
      ref.current.querySelector('[role="option"]:not(:disabled), [role="menuitem"]:not(:disabled)');
    if (first) first.focus();
  }, [open]);
  const onKeyDown = (e) => {
    const items = [...ref.current.querySelectorAll('[role="option"]:not(:disabled), [role="menuitem"]:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    let to = null;
    if (e.key === 'ArrowDown') to = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp') to = items[(i - 1 + items.length) % items.length];
    else if (e.key === 'Home') to = items[0];
    else if (e.key === 'End') to = items[items.length - 1];
    if (to) {
      e.preventDefault();
      to.focus();
    }
  };
  if (!open) return null;
  return (
    <div ref={ref} className="sd-pop" role={role} aria-label={label} style={{ width, [align]: 0 }} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- dropdown chip
// Platform / Sort chip. Opens a bottom sheet on phone (layout 'grid' or 'list')
// and a popover on desktop. options: [{ id, label, count? }].
export function ChipSelect({ chip, active, title, subtitle, options, value, onChange, layout = 'list', popWidth = 260 }) {
  const [open, setOpen] = useState(false);
  const desktop = useIsDesktop();
  const btn = useRef(null);
  const pick = (id) => {
    onChange(id);
    if (desktop) {
      setOpen(false);
      if (btn.current) btn.current.focus();
    }
  };
  return (
    <div className="sd-pop-wrap">
      <button
        ref={btn}
        type="button"
        className={'sd-chipbtn' + (active ? ' active' : '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="ell">{chip}</span>
        <Chevron dir="down" size={16} color={active ? 'var(--amber)' : 'var(--text-dim)'} />
      </button>

      {desktop ? (
        <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} label={title} width={popWidth}>
          {options.map((o) => (
            <button
              key={o.id}
              role="option"
              aria-selected={value === o.id}
              className={'sd-popopt' + (value === o.id ? ' on' : '')}
              onClick={() => pick(o.id)}
            >
              <span className="chk">{value === o.id ? <CheckIcon size={14} /> : null}</span>
              <span className="lab">{o.label}</span>
              {o.count != null ? <span className="n">{o.count}</span> : null}
            </button>
          ))}
        </Popover>
      ) : (
        <Sheet open={open} title={title} subtitle={subtitle} onClose={() => setOpen(false)}>
          {layout === 'grid' ? (
            <div className="sd-opt-grid" role="listbox" aria-label={title}>
              {options.map((o, i) => (
                <button
                  key={o.id}
                  role="option"
                  aria-selected={value === o.id}
                  className={'sd-sheetopt' + (value === o.id ? ' on' : '') + (i === 0 ? ' full' : '')}
                  onClick={() => pick(o.id)}
                >
                  <span className="ell">{o.label}</span>
                  {o.count != null ? <span className="n">{o.count}</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="sd-sheetlist" role="listbox" aria-label={title}>
              {options.map((o) => (
                <button
                  key={o.id}
                  role="option"
                  aria-selected={value === o.id}
                  className={'sd-sheetrow' + (value === o.id ? ' on' : '')}
                  onClick={() => pick(o.id)}
                >
                  <span style={{ flex: 1 }}>{o.label}</span>
                  {o.count != null ? <span className="n">{o.count}</span> : null}
                  {value === o.id ? <CheckIcon size={18} /> : <span style={{ width: 18 }} />}
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

// Sort direction toggle (the little arrow button).
export function SortDirButton({ dir, onToggle }) {
  return (
    <button
      type="button"
      className="sd-ib"
      aria-label={`${dir === 'asc' ? 'Default order' : 'Reversed order'} — tap to reverse`}
      title="Reverse sort order"
      onClick={onToggle}
      style={{ color: '#c3cad5' }}
    >
      <ArrowIcon down={dir === 'desc'} />
    </button>
  );
}

// "9 of 250 shows · Clear" on a phone (only while filtering); on desktop a
// caption that always reads "250 shows · sorted by title, A→Z".
export function CountLine({ shown, total, noun, summary, filtered, onClear }) {
  return (
    <div className={'sd-lcount' + (filtered ? ' on' : '')}>
      <span className="sd-lbl" aria-live="polite">
        {filtered ? `${shown.toLocaleString()} of ${total.toLocaleString()} ${noun}` : `${total.toLocaleString()} ${noun}`}
        <span className="sum"> · {summary}</span>
      </span>
      {filtered ? (
        <button type="button" className="sd-lclear phone" onClick={onClear}>Clear</button>
      ) : null}
    </div>
  );
}
// The desktop "Clear" that sits on the toolbar itself.
export const ToolbarClear = ({ onClear }) => (
  <button type="button" className="sd-lclear bar" onClick={onClear}>Clear</button>
);

// ---------------------------------------------------------------- tools menu
// tools: [{ id, label, description, icon, onSelect, disabled }]
export function ToolsMenu({ tools, running }) {
  const [open, setOpen] = useState(false);
  const desktop = useIsDesktop();
  const btn = useRef(null);
  const run = (t) => {
    setOpen(false);
    t.onSelect();
  };
  const items = tools.map((t) => (
    <button
      key={t.id}
      role="menuitem"
      className="sd-toolitem"
      disabled={t.disabled}
      onClick={() => run(t)}
    >
      <span className="ico">{t.icon}</span>
      <span className="txt">
        <span className="t">{t.label}</span>
        <span className="d">{t.description}</span>
      </span>
    </button>
  ));
  return (
    <div className="sd-pop-wrap">
      <button
        ref={btn}
        type="button"
        className={'sd-toolsbtn' + (running ? ' running' : '')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Library tools"
        onClick={() => setOpen(!open)}
      >
        <WrenchIcon style={{ color: '#c3cad5' }} />
        Tools
        <Chevron dir="down" size={16} />
      </button>
      {desktop ? (
        <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} role="menu" label="Library tools" align="right" width={360}>
          {items}
        </Popover>
      ) : (
        <Sheet open={open} title="Library tools" subtitle="Runs on the shows in your library" onClose={() => setOpen(false)}>
          <div className="sd-toollist" role="menu" aria-label="Library tools">{items}</div>
        </Sheet>
      )}
    </div>
  );
}

// "Detecting 3/12" with a bar. Shown under the header while a tool runs.
export function ProgressCard({ text, tag, done, total }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 100;
  return (
    <div className="sd-card sd-lprog" role="status" aria-live="polite">
      <div className="top">
        <SpinnerIcon size={16} style={{ color: 'var(--teal)' }} />
        <b>{text}</b>
        <span className="sd-lbl">{tag}</span>
      </div>
      <div className="bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// ---------------------------------------------------------------- header buttons
export const AddButton = ({ label, onClick }) => (
  <button type="button" className="sd-addbtn" aria-label={label} onClick={onClick}>
    <PlusIcon /> Add
  </button>
);

export function LibHead({ title, count, children }) {
  return (
    <div className="sd-libhead">
      <h1>
        {title}
        <span className="n">{count.toLocaleString()}</span>
      </h1>
      <div className="sd-libhead-actions">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- empty states
export function LibEmpty({ icon, title, children, chips, actions }) {
  return (
    <div className="sd-lempty">
      <div className="ico">{icon}</div>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {chips && chips.length ? (
        <div className="chips">{chips.map((c) => <span key={c}>{c}</span>)}</div>
      ) : null}
      {actions ? <div className="acts">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- poster tiles
function Art({ path, name, children, initialPos = 'top' }) {
  const [c1, c2] = posterTint(name);
  return (
    <span className="sd-ltile-art" style={path ? undefined : { background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
      {path ? (
        <img src={img(path, 'w342')} alt="" loading="lazy" />
      ) : (
        <span className={'sd-ltile-initial ' + initialPos} aria-hidden="true">{initialOf(name)}</span>
      )}
      {children}
    </span>
  );
}

// A show in the library grid: poster, progress bar while watching, a teal tick
// when finished, then title, "27 / 49 eps" and your star rating.
export function ShowTile({ show, seen, onOpen, sub }) {
  const total = show.totalEpisodes || 0;
  const done = total > 0 && seen >= total;
  const pct = total ? Math.min(100, Math.round((seen / total) * 100)) : 0;
  const dropped = show.dropped === true;
  const label = (total ? `${show.name}, ${seen} of ${total} episodes` : `${show.name}, ${seen} episodes watched`) + (dropped ? ', dropped' : '');
  return (
    <button type="button" className="sd-ltile" aria-label={label} onClick={onOpen} style={dropped ? { opacity: 0.7 } : undefined}>
      <Art path={show.poster} name={show.name}>
        {total > 0 && !done && !dropped && seen > 0 ? (
          <span className="sd-ltile-prog" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
        ) : null}
        {done ? <span className="sd-ltile-done" aria-hidden="true"><CheckIcon size={14} sw={2.6} /></span> : null}
      </Art>
      <span className="sd-ltile-name">{show.name}</span>
      <span className="sd-ltile-row">
        <span className="meta">{dropped ? (seen ? `Dropped · ${seen} eps` : 'Dropped') : total ? `${seen} / ${total} eps` : seen ? `${seen} eps seen` : 'not started'}</span>
        {show.rating ? (
          <span className="rate"><StarIcon size={10} />{show.rating}</span>
        ) : null}
      </span>
      {sub ? <span className="sd-ltile-sub">{sub}</span> : null}
    </button>
  );
}

// A watched movie: poster with a rating pill, title and the date you watched it.
export function MovieTile({ movie, onOpen }) {
  const date = (movie.watchedAt || '').slice(0, 10) || movie.year || '';
  return (
    <button
      type="button"
      className="sd-ltile"
      aria-label={`${movie.name}${movie.rating ? `, rated ${movie.rating}` : ''}${date ? `, watched ${date}` : ''}`}
      onClick={onOpen}
    >
      <Art path={movie.poster} name={movie.name} initialPos="bottom">
        {movie.rating ? (
          <span className="sd-ltile-badge"><StarIcon size={11} />{movie.rating}</span>
        ) : null}
      </Art>
      <span className="sd-ltile-name">{movie.name}</span>
      {date ? <span className="sd-ltile-date">{date}</span> : null}
    </button>
  );
}

// ---------------------------------------------------------------- the Add dialog
// A TMDB search in a full-height sheet (phone) / centred dialog (desktop). It
// searches as you type (and on Enter), and each result gets the buttons that
// make sense for it.
//   kind          'show' | 'movie'
//   search(q)     async → array of TMDB results
//   badgeFor(r)   → string | null   ("In library", "On watchlist", …)
//   renderActions(r, { busy, act })  → the buttons for result r
//       act(r, fn, okMessage) runs fn, disables the buttons meanwhile, and shows
//       okMessage (or the error) at the top of the list.
export function AddDialog({ kind, search, initialQuery = '', onClose, badgeFor, renderActions }) {
  const noun = kind === 'movie' ? 'movie' : 'show';
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const seq = useRef(0);
  const timer = useRef(null);
  const noticeTimer = useRef(null);
  const keyOk = hasKey();

  const run = async (q) => {
    const mine = ++seq.current;
    const text = q.trim();
    if (text.length < 2) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await search(text);
      if (mine === seq.current) setResults((r || []).slice(0, 10));
    } catch (e) {
      if (mine === seq.current) {
        setError(e.message || 'Search failed');
        setResults(null);
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery && keyOk) run(initialQuery);
    return () => {
      seq.current++;
      clearTimeout(timer.current);
      clearTimeout(noticeTimer.current);
    };
  }, []);

  const onChange = (v) => {
    setQuery(v);
    clearTimeout(timer.current);
    if (!v.trim()) {
      seq.current++;
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    timer.current = setTimeout(() => run(v), 350);
  };
  const onSubmit = (e) => {
    e.preventDefault();
    clearTimeout(timer.current);
    run(query);
  };

  const act = async (r, fn, okMessage) => {
    setBusyId(r.id);
    setError(null);
    try {
      await fn();
      if (okMessage) {
        setNotice(okMessage);
        clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), 4000);
      }
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  const titleOf = (r) => (kind === 'movie' ? r.title : r.name);
  const yearOf = (r) => ((kind === 'movie' ? r.release_date : r.first_air_date) || '').slice(0, 4);

  return (
    <Sheet
      open
      variant="add"
      title={`Add a ${noun}`}
      onClose={onClose}
      action={
        <button type="button" className="sd-xbtn" aria-label="Close" onClick={onClose}>
          <XIcon size={20} />
        </button>
      }
    >
      <form className="sd-addsearch" onSubmit={onSubmit}>
        <label className="sd-addfield">
          <SearchIcon style={{ color: 'var(--text-dim)' }} />
          <input
            type="text"
            autoFocus
            value={query}
            disabled={!keyOk}
            placeholder={`Search TMDB for a ${noun}`}
            aria-label={`Search TMDB for a ${noun}`}
            onChange={(e) => onChange(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {loading ? <SpinnerIcon size={16} style={{ color: 'var(--text-dim)' }} /> : null}
          {query && !loading ? (
            <button type="button" className="sd-lfilter-x" aria-label="Clear search" onClick={() => onChange('')}>
              <XIcon size={16} />
            </button>
          ) : null}
          <span className="sd-lbl tag">TMDB</span>
        </label>
      </form>

      <div className="sd-addstatus" role="status" aria-live="polite">
        {error ? (
          <span className="err">{error}</span>
        ) : notice ? (
          <span className="ok"><CheckIcon size={14} /> {notice}</span>
        ) : !keyOk ? (
          <span>Search needs a TMDB API key — add one in Settings.</span>
        ) : results ? (
          <span className="sd-lbl">{resultsLabel(results.length)}</span>
        ) : (
          <span className="sd-lbl">{query.trim().length === 1 ? 'Keep typing…' : `Type a ${noun} title`}</span>
        )}
      </div>

      {results && results.length > 0 ? (
        <ul className="sd-reslist" aria-label="TMDB results">
          {results.map((r) => {
            const badge = badgeFor ? badgeFor(r) : null;
            const [c1, c2] = posterTint(titleOf(r));
            return (
              <li className="sd-res" key={r.id}>
                {r.poster_path ? (
                  <img className="sd-res-poster" src={img(r.poster_path, 'w154')} alt="" loading="lazy" />
                ) : (
                  <span className="sd-res-poster ph" aria-hidden="true" style={{ background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
                    {initialOf(titleOf(r))}
                  </span>
                )}
                <div className="sd-res-info">
                  <div className="sd-res-title">{titleOf(r)}</div>
                  <div className="sd-res-meta">
                    <span className="sd-mono">{kind === 'movie' ? 'Movie' : 'TV'}{yearOf(r) ? ` · ${yearOf(r)}` : ''}</span>
                    {badge ? <span className="sd-badge"><CheckIcon size={12} />{badge}</span> : null}
                  </div>
                  {r.overview ? <p className="sd-res-over">{r.overview}</p> : null}
                </div>
                <div className="sd-res-actions">{renderActions(r, { busy: busyId === r.id || busyId != null, act })}</div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Sheet>
  );
}

// Primary / secondary / "open" buttons for a result row.
export const ResBtn = ({ kind = 'plain', icon, children, ...rest }) => (
  <button type="button" className={`sd-rbtn ${kind}`} {...rest}>
    {icon}
    {children}
  </button>
);
