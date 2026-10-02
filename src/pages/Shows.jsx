import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  watchedCount,
  lastWatchDate,
  addShowFromTmdb,
  addShowToWatchlist,
  applyTmdbDetails,
  setShowPlatform,
  setShowProviders,
} from '../store/db.js';
import { searchShows, showDetails, resolveShow, hasKey, watchProviders } from '../api/tmdb.js';
import { platformFromProviders, platformById, PLATFORMS } from '../components/PlatformPicker.jsx';
import {
  SHOW_STATUSES,
  SHOW_SORTS,
  DEFAULT_SHOW_FILTERS,
  filterShows,
  sortShows,
  statusCounts,
  platformCounts,
  platformsInUse,
  isFiltered,
  emptyKind,
  describeFilters,
  sortSummary,
  sortLabel,
  showResultState,
} from '../components/libraryLogic.js';
import {
  LibHead,
  AddButton,
  ToolsMenu,
  ProgressCard,
  FilterField,
  StatusTabs,
  ChipSelect,
  SortDirButton,
  CountLine,
  ToolbarClear,
  LibEmpty,
  ShowTile,
  AddDialog,
  ResBtn,
  PlusIcon,
  RefreshIcon,
  SignalIcon,
  TvIcon,
} from '../components/LibraryBar.jsx';

// Shows (the library) — Claude Design, Direction A: the page has ONE input and it
// is plainly a filter. Adding a show lives behind the amber "+ Add" button (a
// TMDB search dialog), and the two bulk tools live in a Tools menu. The filter,
// sort and status rules are exactly the ones this page always had (see
// components/libraryLogic.js, which is tested against the original code).

const H = { watchedCount, lastWatchDate };
const searchShowsList = (q) => searchShows(q).then((d) => d.results || []);

export default function Shows({ openShow }) {
  const state = useStore();
  const [filters, setFilters] = useState(DEFAULT_SHOW_FILTERS); // { status, platform, query }
  const [sortBy, setSortBy] = useState('Alphabetical');
  const [sortDir, setSortDir] = useState('asc');
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [sync, setSync] = useState(null); // {done, total} while syncing
  const [detect, setDetect] = useState(null); // {done, total} while detecting platforms

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const clearFilters = () => setFilters(DEFAULT_SHOW_FILTERS);

  const entries = useMemo(() => Object.entries(state.shows), [state.shows]);
  const followed = useMemo(() => entries.filter(([, s]) => s.followed), [entries]);
  const list = useMemo(
    () => sortShows(filterShows(entries, filters, H), sortBy, sortDir, H),
    [entries, filters, sortBy, sortDir]
  );
  const counts = useMemo(() => statusCounts(entries, filters, H), [entries, filters]);
  const pcounts = useMemo(() => platformCounts(entries, filters, H), [entries, filters]);
  const platforms = useMemo(() => platformsInUse(entries, PLATFORMS), [entries]);

  const unsynced = useMemo(() => followed.filter(([, s]) => !s.lastSynced), [followed]);
  const needPlatform = useMemo(() => followed.filter(([, s]) => s.tmdbId && !s.platform), [followed]);

  const followedTmdbIds = useMemo(
    () => new Set(entries.filter(([, s]) => s.followed && s.tmdbId).map(([, s]) => s.tmdbId)),
    [entries]
  );
  const watchlistTmdbIds = useMemo(
    () => new Set(entries.filter(([, s]) => s.watchlist && s.tmdbId).map(([, s]) => s.tmdbId)),
    [entries]
  );

  // ---- bulk tools (unchanged behaviour)
  async function syncAll() {
    const targets = unsynced.length ? unsynced : followed;
    setSync({ done: 0, total: targets.length });
    let done = 0;
    for (const [id, show] of targets) {
      try {
        const details = await resolveShow(show);
        if (details) applyTmdbDetails(id, details);
      } catch (err) {
        console.warn('sync failed for', show.name, err);
      }
      done++;
      setSync({ done, total: targets.length });
    }
    setSync(null);
  }

  async function detectPlatforms() {
    // Fill empty platform chips from TMDB's AU streaming providers, and cache the
    // provider list on each show for the detail page. Only touches shows that
    // don't already have a platform set, so it never overrides your picks.
    const targets = needPlatform;
    setDetect({ done: 0, total: targets.length });
    let done = 0;
    for (const [id, show] of targets) {
      try {
        const au = await watchProviders('tv', show.tmdbId);
        const flatrate = (au && au.flatrate) || [];
        setShowProviders(
          id,
          flatrate.map((p) => ({ name: p.provider_name, logo: p.logo_path })),
          au && au.link
        );
        const pid = platformFromProviders(flatrate);
        if (pid) setShowPlatform(id, pid);
      } catch (err) {
        console.warn('provider lookup failed for', show.name, err);
      }
      done++;
      setDetect({ done, total: targets.length });
    }
    setDetect(null);
  }

  const keyOk = hasKey();
  const running = !!(sync || detect);
  const tools = [
    {
      id: 'sync',
      label: unsynced.length ? `Sync ${unsynced.length} new with TMDB` : 'Refresh all from TMDB',
      description: !keyOk
        ? 'Needs a TMDB API key — add one in Settings.'
        : unsynced.length
          ? 'Fetch posters, episode counts and air dates for shows that haven’t been synced yet.'
          : `Re-fetch posters, episode counts and air dates for all ${followed.length} shows.`,
      icon: <RefreshIcon />,
      disabled: !keyOk || running || followed.length === 0,
      onSelect: syncAll,
    },
    {
      id: 'detect',
      label: 'Detect platforms',
      description: !keyOk
        ? 'Needs a TMDB API key — add one in Settings.'
        : needPlatform.length
          ? `Fill in the platform for ${needPlatform.length} show${needPlatform.length === 1 ? '' : 's'} without one, from TMDB’s Australian streaming providers. Never overrides your picks.`
          : 'Every show already has a platform.',
      icon: <SignalIcon />,
      disabled: !keyOk || running || needPlatform.length === 0,
      onSelect: detectPlatforms,
    },
  ];

  // ---- the Add dialog
  const openAdd = (q = '') => {
    setAddQuery(q);
    setAddOpen(true);
  };
  const existingId = (r) => {
    const hit = entries.find(([, s]) => s.tmdbId === r.id);
    return hit ? hit[0] : null;
  };
  const openResult = (r) => {
    const id = existingId(r);
    if (id) {
      setAddOpen(false);
      openShow(id);
    }
  };
  const addShow = async (r) => addShowFromTmdb(await showDetails(r.id));
  const addWatch = async (r) => addShowToWatchlist(await showDetails(r.id));

  const renderActions = (r, { busy, act }) => {
    const st = showResultState(r, followedTmdbIds, watchlistTmdbIds);
    if (st === 'followed') return <ResBtn kind="ok" onClick={() => openResult(r)}>Open</ResBtn>;
    const add = (
      <ResBtn kind="primary" disabled={busy} onClick={() => act(r, () => addShow(r), `Added “${r.name}” to your library`)}>
        <PlusIcon size={16} /> Add
      </ResBtn>
    );
    if (st === 'watchlisted') {
      return (
        <>
          {add}
          <ResBtn onClick={() => openResult(r)}>Open</ResBtn>
        </>
      );
    }
    return (
      <>
        {add}
        <ResBtn kind="wide" disabled={busy} onClick={() => act(r, () => addWatch(r), `Added “${r.name}” to your watchlist`)}>
          Add to watchlist
        </ResBtn>
      </>
    );
  };
  const badgeFor = (r) => {
    const st = showResultState(r, followedTmdbIds, watchlistTmdbIds);
    return st === 'followed' ? 'In library' : st === 'watchlisted' ? 'On watchlist' : null;
  };

  // ---- toolbar pieces
  const filtered = isFiltered(filters);
  const platformLabel = (id) => (platformById(id) ? platformById(id).label : id);
  const platformOptions = [
    { id: 'All', label: 'Any platform', count: pcounts.total },
    ...platforms.map((p) => ({ id: p.id, label: p.label, count: pcounts.byId[p.id] || 0 })),
  ];
  if (filters.platform !== 'All' && !platforms.some((p) => p.id === filters.platform)) {
    platformOptions.push({ id: filters.platform, label: platformLabel(filters.platform), count: 0 });
  }
  const kind = emptyKind(followed.length, filters);

  return (
    <div className="sd-page sd-page--wide">
      <LibHead title="Shows" count={followed.length}>
        {followed.length > 0 && <ToolsMenu tools={tools} running={running} />}
        <AddButton label="Add a show from TMDB" onClick={() => openAdd()} />
      </LibHead>

      {sync && <ProgressCard text={`Syncing ${sync.done}/${sync.total}`} tag="TMDB" done={sync.done} total={sync.total} />}
      {detect && <ProgressCard text={`Detecting ${detect.done}/${detect.total}`} tag="PLATFORMS" done={detect.done} total={detect.total} />}

      {followed.length > 0 && (
        <>
          <div className="sd-lbar">
            <FilterField
              value={filters.query}
              onChange={(query) => setFilter({ query })}
              placeholder={`Filter ${followed.length.toLocaleString()} show${followed.length === 1 ? '' : 's'}`}
            />
            <StatusTabs options={SHOW_STATUSES} value={filters.status} onChange={(status) => setFilter({ status })} counts={counts} />
            <div className="sd-lbar-chips">
              <ChipSelect
                chip={filters.platform === 'All' ? 'Platform' : platformLabel(filters.platform)}
                active={filters.platform !== 'All'}
                title="Platform"
                subtitle="Filter by where you watch it"
                options={platformOptions}
                value={filters.platform}
                onChange={(platform) => setFilter({ platform })}
                layout="grid"
              />
              <ChipSelect
                chip={<><span className="dim">Sort</span> {sortLabel(sortBy)}</>}
                title="Sort shows"
                subtitle="Reverse the order with the arrow button next to Sort"
                options={SHOW_SORTS}
                value={sortBy}
                onChange={setSortBy}
                popWidth={220}
              />
              <SortDirButton dir={sortDir} onToggle={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} />
            </div>
            {filtered && <ToolbarClear onClear={clearFilters} />}
          </div>
          <CountLine
            shown={list.length}
            total={followed.length}
            noun="shows"
            summary={sortSummary(sortBy, sortDir)}
            filtered={filtered}
            onClear={clearFilters}
          />
        </>
      )}

      {list.length > 0 ? (
        <div className="sd-lgrid">
          {list.map(([id, show]) => (
            <ShowTile key={id} show={show} seen={watchedCount(show)} onOpen={() => openShow(id)} />
          ))}
        </div>
      ) : kind === 'library' ? (
        <LibEmpty
          icon={<TvIcon size={28} />}
          title="Your library is empty"
          actions={<ResBtn kind="primary" onClick={() => openAdd()}><PlusIcon size={16} /> Add a show</ResBtn>}
        >
          Add the first show you’re watching and WatchNext will track every episode. Everything is stored in this
          browser and syncs across your devices if you sign in. You can also import your TV Time history in Settings.
        </LibEmpty>
      ) : kind === 'name' ? (
        <LibEmpty
          icon={<TvIcon size={28} />}
          title={`Nothing called “${filters.query.trim()}” in your library`}
          actions={
            <>
              <ResBtn kind="primary" onClick={() => openAdd(filters.query.trim())}>Search TMDB for “{filters.query.trim()}”</ResBtn>
              <button type="button" className="sd-lclear" onClick={() => setFilter({ query: '' })}>Clear filter</button>
            </>
          }
        >
          Check the spelling, or look it up on TMDB to add it.
        </LibEmpty>
      ) : (
        <LibEmpty
          icon={<TvIcon size={28} />}
          title="No shows match these filters"
          chips={describeFilters(filters, platformLabel)}
          actions={<ResBtn kind="primary" onClick={clearFilters}>Clear filters</ResBtn>}
        >
          Nothing in your library fits all of these at once. Loosen a filter to see more.
        </LibEmpty>
      )}

      {addOpen && (
        <AddDialog
          kind="show"
          search={searchShowsList}
          initialQuery={addQuery}
          onClose={() => setAddOpen(false)}
          badgeFor={badgeFor}
          renderActions={renderActions}
        />
      )}
    </div>
  );
}
