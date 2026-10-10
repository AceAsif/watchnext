import React, { useRef, useState } from 'react';
import { Sheet } from './ui.jsx';
import { img } from '../api/tmdb.js';
import { posterTint, initialOf } from './libraryLogic.js';
import { orphanIntro, orphanMeta, deleteAllIntro } from './settingsLogic.js';
import { ServicesPicker, FREE_NOTE } from './ServicesUI.jsx';
import { WIPE_WORD, confirmOk, wipeIntro, wipeEffects, wipeBackupLine } from '../store/wipeLogic.js';

// The Settings cards (Claude Design, Direction A). Purely presentational: the
// page owns the state and handlers, which keeps these easy to test. Styling is
// in ui.css (sd-set*).

const Svg = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
    {children}
  </svg>
);
const I = {
  cloud: <Svg><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 7.97L17 18z" /></Svg>,
  key: <Svg><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></Svg>,
  upload: <Svg><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></Svg>,
  broom: <Svg><path d="M4 20l5-9 7 4-5 9zM13 5l2-3 3 5" /></Svg>,
  drive: <Svg><path d="M4 8l2-4h12l2 4v10H4zM4 8h16M8 14h.01" /></Svg>,
  lock: <Svg size={15}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>,
  info: <Svg size={16}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>,
  copy: <Svg size={16}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Svg>,
  check: <Svg size={16}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>,
  ext: <Svg size={15}><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" /></Svg>,
  download: <Svg><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Svg>,
  trash: <Svg><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6" /></Svg>,
  x: <Svg size={16}><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  warn: <Svg size={16}><path d="M12 3l10 18H2zM12 10v5M12 18h.01" /></Svg>,
};

export function Pill({ tone = 'teal', dot, children }) {
  return (
    <span className={`sd-pill ${tone}`}>
      {dot ? <i /> : null}
      {children}
    </span>
  );
}

function SetCard({ icon, label, title, pill, children, className = '', id }) {
  return (
    <section className={`sd-card sd-setcard ${className}`} id={id} aria-label={title}>
      <header className="sd-sethead">
        <span className="ico" aria-hidden="true">{icon}</span>
        <div className="txt">
          <div className="sd-lbl">{label}</div>
          <h2>{title}</h2>
        </div>
        {pill}
      </header>
      {children}
    </section>
  );
}

// The one status banner (success or error) — kept inline, as chosen.
export function Banner({ msg, onClose, bannerRef }) {
  if (!msg) return null;
  const err = msg.kind === 'err';
  return (
    <div ref={bannerRef} className={`sd-banner ${err ? 'err' : 'ok'}`} role={err ? 'alert' : 'status'}>
      <span className="ico">{err ? I.warn : I.check}</span>
      <span className="txt">{msg.text}</span>
      <button type="button" className="x" aria-label="Dismiss message" onClick={onClose}>{I.x}</button>
    </div>
  );
}

// ---------------------------------------------------------------- Sync
// available: is cloud sync configured for this build?  user: signed-in user or null.
export function SyncCard({ available, user, busy, onSignIn, onSignOut }) {
  const signedIn = available && !!user;
  return (
    <SetCard icon={I.cloud} label="Sync" title="Sync across devices" className={signedIn ? 'on' : ''}>
      {!available && (
        <p className="sd-setp">
          Cloud sync isn’t configured for this deployment yet — see the README for setup. Until then, use the
          backup file below to move data between devices.
        </p>
      )}
      {available && !user && (
        <>
          <p className="sd-setp">
            Sign in with Google to keep this browser and every other device you sign into showing the same watch
            history automatically.
          </p>
          <div className="sd-setacts">
            <button type="button" className="sd-setbtn primary" onClick={onSignIn} disabled={busy}>
              {busy ? 'Opening sign-in…' : 'Sign in with Google'}
            </button>
          </div>
        </>
      )}
      {signedIn && (
        <>
          <div className="sd-acct">
            <span className="av" aria-hidden="true">{(user.email || '?').charAt(0).toUpperCase()}</span>
            <div className="who">
              <div className="sd-lbl">Signed in as</div>
              <div className="em" title={user.email}>{user.email}</div>
            </div>
          </div>
          <p className="sd-setp">
            Changes sync to the cloud automatically and appear on your other signed-in devices within a few seconds.
          </p>
          <div className="sd-setacts">
            <button type="button" className="sd-setbtn" onClick={onSignOut}>Sign out</button>
          </div>
        </>
      )}
    </SetCard>
  );
}

// ---------------------------------------------------------------- TMDB key
export function KeyCard({ status, value, onChange, onSave }) {
  const saved = status === 'saved';
  return (
    <SetCard icon={I.key} label="Posters & episodes" title="TMDB API key" pill={saved ? <Pill dot>Key saved</Pill> : null}>
      <p className="sd-setp">
        Show posters, episode lists and air dates come from The Movie Database. Paste your free v3 API key to turn
        them on.
      </p>
      <a className="sd-setlink" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
        Get a free key at themoviedb.org {I.ext}
      </a>
      <form className="sd-keyrow" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <label className={'sd-keyfield' + (saved ? ' saved' : '')}>
          {I.key}
          <input
            type="password"
            value={value}
            placeholder="Paste your TMDB v3 API key"
            aria-label="TMDB v3 API key"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        <button type="submit" className="sd-setbtn" disabled={status === 'saved' || status === 'empty'}>Save key</button>
      </form>
      <div className="sd-setnote">{I.lock}Stored only in this browser, and left out of backup files.</div>
    </SetCard>
  );
}

// ---------------------------------------------------------------- Import
export function ImportCard({ command, copied, onCopy, onChoose, fileRef, onFile }) {
  return (
    <SetCard icon={I.upload} label="Import" title="Import TV Time history">
      <ol className="sd-steps">
        <li>
          <span className="num">1</span>
          <div className="body">
            <div className="st">Convert your TV Time export on your computer</div>
            <div className="sd-code">
              <div className="bar">
                <span className="sd-lbl">Terminal</span>
                <button type="button" className="cp" aria-label="Copy command" onClick={onCopy}>
                  {copied ? I.check : I.copy}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre><span className="py">python</span>{command.replace(/^python/, '')}</pre>
            </div>
          </div>
        </li>
        <li>
          <span className="num">2</span>
          <div className="body">
            <div className="st">Choose the JSON file it creates</div>
            <input ref={fileRef} type="file" accept="application/json" onChange={onFile} style={{ display: 'none' }} aria-label="Import file" />
            <button type="button" className="sd-setbtn primary" onClick={onChoose}>{I.upload} Choose import file</button>
          </div>
        </li>
      </ol>
      <div className="sd-setinfo">{I.info}<span>Importing merges with what you already track. It never deletes anything.</span></div>
    </SetCard>
  );
}

// ---------------------------------------------------------------- Clean up
export function ShowThumb({ show, w = 40, h = 60 }) {
  const [c1, c2] = posterTint(show.name);
  return show.poster ? (
    <img className="sd-orph-poster" src={img(show.poster, 'w92')} alt="" loading="lazy" style={{ width: w, height: h }} />
  ) : (
    <span className="sd-orph-poster ph" aria-hidden="true" style={{ width: w, height: h, background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
      {initialOf(show.name)}
    </span>
  );
}

// rows: [[id, show, seenCount], …]
export function CleanupCard({ rows, onAskDelete }) {
  if (!rows.length) return null;
  return (
    <SetCard icon={I.broom} label="Cleanup" title="Clean up shows" pill={<Pill tone="amber">{rows.length} left over</Pill>} id="cleanup">
      <p className="sd-setp">{orphanIntro(rows.length)}</p>
      <ul className="sd-orphs">
        {rows.map(([id, show, seen]) => (
          <li key={id}>
            <ShowThumb show={show} />
            <div className="who">
              <div className="nm" title={show.name}>{show.name}</div>
              <div className={'mt' + (seen ? '' : ' none')}>{orphanMeta(seen)}</div>
            </div>
            <button type="button" className="sd-setbtn danger" aria-label={`Delete ${show.name}`} onClick={() => onAskDelete(id)}>
              {I.trash} Delete
            </button>
          </li>
        ))}
      </ul>
    </SetCard>
  );
}

// Discover's "Not interested" titles, with a way to bring each back. Hidden when the list is empty.
export function HiddenCard({ rows, onShowAgain }) {
  if (!rows.length) return null;
  return (
    <SetCard icon={I.broom} label="Discover" title="Hidden from Discover" pill={<Pill tone="amber">{rows.length}</Pill>} id="hidden">
      <p className="sd-setp">
        Titles you marked “Not interested”. Discover won’t suggest them, and they count as a small “not for me” in your
        taste. Synced to your other devices when you’re signed in.
      </p>
      <ul className="sd-orphs">
        {rows.map((e) => (
          <li key={e.key}>
            <ShowThumb show={e} />
            <div className="who">
              <div className="nm" title={e.name}>{e.name || 'Untitled'}</div>
              <div className="mt">{[e.year, e.kind === 'tv' ? 'Show' : 'Movie'].filter(Boolean).join(' · ')}</div>
            </div>
            <button type="button" className="sd-setbtn" aria-label={`Show ${e.name} again`} onClick={() => onShowAgain(e)}>
              Show again
            </button>
          </li>
        ))}
      </ul>
    </SetCard>
  );
}

// ---------------------------------------------------------------- Backup + danger zone
// Which subscriptions you pay for, for the "On my services" filter (kept on this device).
export function ServicesCard({ mine, onToggle }) {
  return (
    <SetCard icon={I.cloud} label="Streaming" title="My services">
      <p className="sd-setp">
        Tick the subscriptions you pay for. “On my services” on the Watchlist and the Shows tab then shows only what you
        can stream right now.
      </p>
      <div style={{ marginTop: 14 }}><ServicesPicker mine={mine} onToggle={onToggle} /></div>
      <div className="sd-setinfo">{I.info}<span>{FREE_NOTE}</span></div>
      <div className="sd-setnote">{I.lock}Kept on this device only.</div>
    </SetCard>
  );
}

// The gentle reminder at the top of Settings (see backupNudgeLogic.js for when it shows).
export function BackupNudge({ copy, onBackup, onLater }) {
  return (
    <section className="sd-nudge" role="region" aria-label="Backup reminder">
      <span className="ico" aria-hidden="true">{I.drive}</span>
      <div className="txt">
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        <div className="acts">
          <button type="button" className="sd-btn primary" onClick={onBackup}>Download backup</button>
          <button type="button" className="sd-btn" onClick={onLater}>Remind me later</button>
        </div>
      </div>
    </section>
  );
}

export function BackupCard({ onDownload, onRestore, restoreRef, onRestoreFile, lastLine }) {
  return (
    <SetCard icon={I.drive} label="Your data" title="Backup">
      <p className="sd-setp">
        Everything lives in this browser’s storage. Download a backup now and then, especially after marking a lot
        of episodes. A backup file can be restored here, on any device.
      </p>
      {lastLine ? <p className="sd-lastbk sd-mono" data-testid="last-backup">{lastLine}</p> : null}
      <div className="sd-setacts">
        <button type="button" className="sd-setbtn" onClick={onDownload}>{I.download} Download backup</button>
        <input ref={restoreRef} type="file" accept="application/json" onChange={onRestoreFile} style={{ display: 'none' }} aria-label="Backup file to restore" />
        <button type="button" className="sd-setbtn" onClick={onRestore}>{I.upload} Restore from backup</button>
      </div>
      <div className="sd-setinfo">{I.info}<span>Restoring adds what’s missing and never deletes or overwrites what you already have.</span></div>
      <div className="sd-setnote">{I.lock}Your TMDB key is not included in the file.</div>
    </SetCard>
  );
}

export function CsvCard({ onExport }) {
  return (
    <SetCard icon={I.drive} label="Your data" title="Export for Power BI">
      <p className="sd-setp">
        Save your history as CSV files you can load into Power BI or Excel. One file for every watched episode,
        one for your shows and one for your movies.
      </p>
      <div className="sd-setacts">
        <button type="button" className="sd-setbtn" onClick={() => onExport('episodes')}>{I.download} Episodes</button>
        <button type="button" className="sd-setbtn" onClick={() => onExport('shows')}>{I.download} Shows</button>
        <button type="button" className="sd-setbtn" onClick={() => onExport('movies')}>{I.download} Movies</button>
      </div>
      <div className="sd-setinfo">{I.info}<span>Episode rows carry both the stored UTC time and your local date, and flag bulk-imported history so you can filter it out.</span></div>
      <div className="sd-setnote">{I.lock}Your TMDB key is not included.</div>
    </SetCard>
  );
}

export function DangerCard({ signedIn, onAsk, onAskEverywhere }) {
  return (
    <section className="sd-card sd-setcard danger" aria-label="Danger zone">
      <div className="sd-lbl danger">Danger zone</div>
      <div className="sd-danger-body">
        <div className="txt">
          <h2>Delete all data</h2>
          <p className="sd-setp">{deleteAllIntro(signedIn)}</p>
        </div>
        <button type="button" className="sd-setbtn danger" onClick={onAsk}>{I.trash} Delete all data</button>
      </div>
      {signedIn && onAskEverywhere && (
        <div className="sd-danger-body sd-danger-everywhere">
          <div className="txt">
            <h2>Delete everywhere</h2>
            <p className="sd-setp">{wipeIntro}</p>
          </div>
          <button type="button" className="sd-setbtn danger" onClick={onAskEverywhere}>{I.trash} Delete everywhere</button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- confirmation
// A bottom sheet on a phone and a centred dialog on desktop (the shared Sheet).
// Cancel is focused first, so an accidental Enter never deletes anything.
export function ConfirmDialog({ title, summary, effects, confirmLabel, onConfirm, onCancel }) {
  return (
    <Sheet open title={title} role="alertdialog" variant="confirm" onClose={onCancel} action={<span />}>
      {summary}
      <ul className="sd-effects">
        {effects.map((e) => (
          <li key={e}><span className="ico">{I.x}</span><span>{e}</span></li>
        ))}
      </ul>
      <p className="sd-undo">This can’t be undone.</p>
      <div className="sd-confirm-acts">
        <button type="button" className="sd-setbtn solid-danger" onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" className="sd-setbtn" autoFocus onClick={onCancel}>Cancel</button>
      </div>
    </Sheet>
  );
}

// Typed confirmation for "Delete everywhere": the button stays disabled until
// DELETE has been typed, and Cancel (not the delete button) takes focus first.
export function WipeDialog({ busy, onConfirm, onCancel }) {
  const [text, setText] = useState('');
  const ok = confirmOk(text);
  // Sheet keeps the onClose it had when it opened (its Escape handler is attached
  // once), so a plain `busy ? noop : onCancel` would go stale and Escape would close
  // the dialog mid-delete. A ref always holds the live value.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const close = () => { if (!busyRef.current) onCancel(); };
  return (
    <Sheet open title="Delete everywhere?" role="alertdialog" variant="confirm" onClose={close} action={<span />}>
      <ul className="sd-effects">
        {wipeEffects().map((e) => (
          <li key={e}><span className="ico">{I.x}</span><span>{e}</span></li>
        ))}
      </ul>
      <div className="sd-setinfo">{I.download}<span>{wipeBackupLine}</span></div>
      <label className="sd-wipefield">
        <span>Type <b>{WIPE_WORD}</b> to confirm</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={WIPE_WORD}
          aria-label={`Type ${WIPE_WORD} to confirm`}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
        />
      </label>
      <p className="sd-undo">This can’t be undone.</p>
      <div className="sd-confirm-acts">
        <button type="button" className="sd-setbtn solid-danger" disabled={!ok || busy} onClick={onConfirm}>
          {busy ? 'Deleting…' : 'Delete everywhere'}
        </button>
        <button type="button" className="sd-setbtn" autoFocus disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </Sheet>
  );
}
