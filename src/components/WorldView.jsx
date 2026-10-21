import React, { useEffect, useMemo, useState } from 'react';
import useOrigins from './useOrigins.js';
import { buildWorld, shadeLevel, SHADE_STEPS } from './originsLogic.js';
import { BarList } from './StatsUI.jsx';

const FILTERS = [['all', 'All'], ['tv', 'Shows'], ['movie', 'Movies']];
const LIST_PREVIEW = 10;
const TITLES_PREVIEW = 24;
const n = (x) => x.toLocaleString('en-AU');
const plural = (x, one, many) => `${n(x)} ${x === 1 ? one : many || one + 's'}`;

// "Looking up where your titles come from… 120 of 900" / failures / no key. Shared with Badges.
export function OriginsStatus({ origins, what }) {
  if (origins.noKey) return <p className="sd-note">{what} need a TMDB key (Settings).</p>;
  if (origins.checking) {
    return (
      <p className="sd-note wm-status" role="status">
        Looking up where your titles come from… {n(origins.done)} of {n(origins.total)}. The first time takes a few minutes; it is remembered on this device after that.
      </p>
    );
  }
  if (origins.failed > 0) {
    return (
      <p className="sd-note wm-status">
        {plural(origins.failed, 'title')} couldn’t be looked up (offline?).{' '}
        <button type="button" className="sd-linkbtn" onClick={origins.retry}>Try again</button>
      </p>
    );
  }
  return null;
}

// The map itself. Its shapes (~110 KB) load only when the World tab is opened.
function WorldMap({ countries, selected, onSelect }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    import('./worldMapData.js').then((m) => live && setData(m)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  if (failed) return <p className="sd-note">The map couldn’t load (offline?). The lists below still work.</p>;
  if (!data) return <div className="wm-map wm-loading" aria-hidden="true" />;
  return (
    <svg className="wm-map" viewBox={`0 0 ${data.VIEW_W} ${data.VIEW_H}`} role="img" aria-label={`World map: ${plural(countries.length, 'country', 'countries')} with something you watched`} data-testid="world-map">
      {data.COUNTRY_PATHS.map(([code, d], i) => {
        const c = code ? byCode.get(code) : null;
        const lvl = c ? shadeLevel(c.count) : 0;
        return (
          <path
            key={code || 'x' + i}
            d={d}
            className={`wm-c wm-l${lvl}${selected === code && code ? ' wm-sel' : ''}`}
            data-code={code || undefined}
            onClick={c ? () => onSelect(selected === code ? null : code) : undefined}
          >
            <title>{c ? `${c.name} · ${plural(c.count, 'title')}` : ''}</title>
          </path>
        );
      })}
    </svg>
  );
}

// Stats → World: where everything you watched comes from, and in which languages.
export default function WorldView({ state }) {
  const origins = useOrigins(state, true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [allCountries, setAllCountries] = useState(false);
  const [allTitles, setAllTitles] = useState(false);
  const world = useMemo(() => buildWorld(origins.titles, origins.cache, filter), [origins.titles, origins.cache, filter]);
  const sel = selected ? world.countries.find((c) => c.code === selected) : null;
  const pick = (code) => { setSelected(code); setAllTitles(false); };
  const shownCountries = allCountries ? world.countries : world.countries.slice(0, LIST_PREVIEW);
  const empty = world.known === 0;

  return (
    <div className="sd-stack" data-testid="world">
      <div className="sd-tabs2 wm-filter" role="tablist" aria-label="Show on the map">
        {FILTERS.map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => { setFilter(v); setSelected(null); }}>{label}</button>
        ))}
      </div>

      <div className="sd-tiles">
        <div className="sd-tile sd-tile--md" data-stat="countries"><span className="sd-tile-v v-md">{n(world.countries.length)}</span><span className="sd-tile-l">Countries</span></div>
        <div className="sd-tile sd-tile--md" data-stat="languages"><span className="sd-tile-v v-md">{n(world.languages.length)}</span><span className="sd-tile-l">Languages</span></div>
      </div>
      <OriginsStatus origins={origins} what="The world map and language list" />

      <div className="sd-card wm-card">
        <WorldMap countries={world.countries} selected={selected} onSelect={pick} />
        <div className="wm-legend" aria-hidden="true">
          <span>Titles</span>
          {SHADE_STEPS.map((s, i) => <span key={s} className="wm-key"><i className={`wm-sw wm-l${i + 1}`} />{s}</span>)}
        </div>
        {!sel && !empty && <p className="sd-note wm-hint">Tap a country to see what you watched from there.</p>}
      </div>

      {sel && (
        <div className="sd-card sd-pad wm-sel-card" data-testid="world-country">
          <div className="wm-sel-head">
            <h3>{sel.name}</h3>
            <button type="button" className="sd-btn sm" onClick={() => setSelected(null)}>Close</button>
          </div>
          <p className="sd-sub">{plural(sel.titles.filter((t) => t.kind === 'tv').length, 'show')} · {plural(sel.titles.filter((t) => t.kind === 'movie').length, 'film')}</p>
          <ul className="wm-titles">
            {(allTitles ? sel.titles : sel.titles.slice(0, TITLES_PREVIEW)).map((t, i) => (
              <li key={t.kind + t.name + i}><span className="wm-kind">{t.kind === 'tv' ? 'Show' : 'Film'}</span>{t.name}</li>
            ))}
          </ul>
          {sel.titles.length > TITLES_PREVIEW && (
            <button type="button" className="sd-btn sm" onClick={() => setAllTitles((v) => !v)}>{allTitles ? 'Show fewer' : `Show all ${n(sel.titles.length)}`}</button>
          )}
        </div>
      )}

      <div className="sd-cols-even">
      {!empty && (
        <section className="sd-sec2">
          <span className="sd-lbl">Countries</span>
          <div className="sd-card wm-list" role="list">
            {shownCountries.map((c, i) => (
              <button key={c.code} type="button" role="listitem" className={'wm-row' + (selected === c.code ? ' on' : '')} onClick={() => pick(selected === c.code ? null : c.code)} data-country={c.code}>
                <span className="wm-rank">{i + 1}</span>
                <span className="wm-name">{c.name}</span>
                <span className="wm-count">{n(c.count)}</span>
              </button>
            ))}
          </div>
          {world.countries.length > LIST_PREVIEW && (
            <button type="button" className="sd-btn sm wm-more" onClick={() => setAllCountries((v) => !v)}>{allCountries ? 'Show fewer' : `Show all ${world.countries.length}`}</button>
          )}
        </section>
      )}

      {world.languages.length > 0 && (
        <section className="sd-sec2">
          <span className="sd-lbl">Original languages</span>
          <BarList rows={world.languages.slice(0, 12).map((l) => ({ label: l.label, value: l.count }))} ariaLabel="Titles per original language" />
          {world.languages.length > 12 && <p className="sd-note">And {plural(world.languages.length - 12, 'more language')}: {world.languages.slice(12).map((l) => l.label).join(', ')}.</p>}
        </section>
      )}
      </div>

      {empty && !origins.checking && !origins.noKey && <div className="sd-card sd-pad sd-empty">Nothing to show yet: none of your titles have been looked up.</div>}
      <p className="sd-note">
        A title counts for every country TMDB lists as its origin, so co-productions count more than once. Very small countries (Hong Kong, Singapore…) are too small to draw but are in the list.
        {world.unlinked > 0 ? ` ${plural(world.unlinked, 'title')} ${world.unlinked === 1 ? 'isn’t' : 'aren’t'} linked to TMDB, so ${world.unlinked === 1 ? 'it isn’t' : 'they aren’t'} counted (use Fix match).` : ''}
      </p>
    </div>
  );
}
