import React, { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { Sheet } from './ui.jsx';
import { XIcon } from './LibraryBar.jsx';
import { createList, addToList, removeFromList } from '../store/db.js';
import { visibleLists, listsWith, cleanName, SUGGESTED_NAMES, LIST_MAX } from './listsLogic.js';

// "Lists" row for a show page / movie sheet: says which of your lists hold this title and
// opens the picker. item: { kind, tmdbId, name, poster, year } (null: not linked to TMDB).
export function ListsRow({ item, className = 'sd-row sd-sep' }) {
  const state = useStore();
  const [open, setOpen] = useState(false);
  if (!item) return null;
  const key = `${item.kind}:${item.tmdbId}`;
  const ids = listsWith(state.lists, key);
  const names = visibleLists(state.lists).filter((l) => ids.includes(l.id)).map((l) => l.name);
  return (
    <>
      <button type="button" className={className + ' sd-listsrow'} aria-haspopup="dialog" onClick={() => setOpen(true)} data-testid="lists-row">
        <span style={{ flexGrow: 1, textAlign: 'left' }}>Lists</span>
        <span className="sd-listsrow-val">{names.length ? names.join(', ') : 'Add to a list'}</span>
        <span aria-hidden="true" className="sd-listsrow-plus">＋</span>
      </button>
      {open && <ListPickerSheet item={item} onClose={() => setOpen(false)} />}
    </>
  );
}

// Tick the lists this title belongs in; or make a new list (the title goes straight into it).
export function ListPickerSheet({ item, onClose }) {
  const state = useStore();
  const [name, setName] = useState('');
  const lists = visibleLists(state.lists);
  const key = `${item.kind}:${item.tmdbId}`;
  const inIds = new Set(listsWith(state.lists, key));
  const full = lists.length >= LIST_MAX;
  const make = (n) => {
    const id = createList(n);
    if (id) addToList(id, item);
    setName('');
  };
  const taken = new Set(lists.map((l) => l.name.toLowerCase()));
  const ideas = SUGGESTED_NAMES.filter((n) => !taken.has(n.toLowerCase()));
  return (
    <Sheet
      open
      title="Add to a list"
      subtitle={item.name}
      onClose={onClose}
      action={<button type="button" className="sd-xbtn" aria-label="Close" onClick={onClose}><XIcon size={20} /></button>}
    >
      <div className="sd-lpick" data-testid="list-picker">
        {lists.length > 0 && (
          <div className="sd-card sd-lpick-lists" role="group" aria-label="Your lists">
            {lists.map((l, i) => {
              const on = inIds.has(l.id);
              return (
                <label key={l.id} className={'sd-lpick-row' + (i ? ' sd-sep' : '')}>
                  <input type="checkbox" checked={on} onChange={() => (on ? removeFromList(l.id, key) : addToList(l.id, item))} />
                  <span className="sd-lpick-name">{l.name}</span>
                  <span className="sd-mono sd-lpick-n">{l.items.length}</span>
                </label>
              );
            })}
          </div>
        )}
        {!full && (
          <form className="sd-lpick-new" onSubmit={(e) => { e.preventDefault(); if (cleanName(name)) make(name); }}>
            <label className="sd-field">
              <input type="text" value={name} maxLength={60} placeholder="New list name" aria-label="New list name" onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="submit" className="sd-btn primary sm" disabled={!cleanName(name)}>Create</button>
          </form>
        )}
        {!full && ideas.length > 0 && (
          <div className="sd-lpick-ideas">
            <span className="sd-note">Ideas:</span>
            {ideas.map((n) => <button key={n} type="button" className="sd-nchip" onClick={() => make(n)}>{n}</button>)}
          </div>
        )}
        <p className="sd-note">Ticks save straight away. A list can hold shows and movies, even ones you haven’t added to your library.</p>
      </div>
    </Sheet>
  );
}
