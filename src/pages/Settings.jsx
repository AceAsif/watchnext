import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Credits from '../components/Credits.jsx';
import { findDuplicateMovies } from '../components/duplicateMoviesLogic.js';
import { groupMovies } from '../components/movieGroupsLogic.js';
import { oldNames, allPatches, oldNamesIntro } from '../components/movieNamesLogic.js';
import { useStore } from '../store/useStore.js';
import { updateMovies, setTmdbKey, importTvTime, restoreBackup, getState, resetAll, deleteShow, watchedCount, setDiscoverHidden, getActivity, subscribeActivity, undoActivity, restoreFirstDates } from '../store/db.js';
import { planFirstDates, epCode as fdCode } from '../components/firstDatesLogic.js';
import { fmtDay } from '../components/statsLogic.js';
import { hiddenList } from '../components/hiddenLogic.js';
import { isBackupFile, isTvTimeFile } from '../store/backupMerge.js';
import { isCloudAvailable, getCloudUser, subscribeCloudUser, signIn, signOutCloud, wipeEverywhere } from '../store/cloud.js';
import { wipeDoneText, wipeFailText } from '../store/wipeLogic.js';
import { signInProblem } from '../store/signInLogic.js';
import { useServicesPrefs, toggleMyService, setServicesPrefs } from '../store/servicesPrefs.js';
import { useSpoilerShield, setSpoilerShield } from '../components/spoilerShield.js';
import {
  loadMeta, saveMeta, libraryCount, withSince, nudgeStatus, nudgeCopy, afterBackup, afterSnooze, lastBackupLine,
} from '../components/backupNudgeLogic.js';
import { localISODate } from '../components/showLogic.js';
import { useLetterboxd } from '../components/useLetterboxd.js';
import { buildCsv, csvDoneText } from '../components/csvExport.js';
import {
  keyStatus,
  backupState,
  backupFileName,
  importResultText,
  restoreResultText,
  orphanShows,
  deleteShowEffects,
  deleteAllEffects,
  signOutBackupOn,
  setSignOutBackup,
  signOutPlan,
  signOutText,
} from '../components/settingsLogic.js';
import {
  Banner,
  SyncCard,
  KeyCard,
  ImportCard,
  LetterboxdCard,
  CleanupCard,
  DuplicatesCard,
  OldNamesCard,
  HiddenCard,
  ActivityCard,
  UndoAnywayDialog,
  FirstDatesSheet,
  BackupCard,
  BackupNudge,
  ServicesCard,
  SpoilerCard,
  RegionCard,
  CsvCard,
  WipeDialog,
  DangerCard,
  ConfirmDialog,
  ShowThumb,
  HelpCard,
} from '../components/SettingsCards.jsx';

// Settings — Claude Design, Direction A: one column of cards (Sync, TMDB key,
// Import, Clean up, Backup) and a separate red Danger zone, with real confirm
// dialogs instead of the browser's popups. Behaviour is the page's own; the
// agreed changes are: backups leave out the TMDB key, and "Delete all data" is
// honest that it clears THIS DEVICE only (it does not touch the cloud copy).

const IMPORT_COMMAND = 'python tools/convert_tvtime.py gdpr-data.zip -o tvtime_import.json';

export default function Settings({ onOpenHelp = () => {} }) {
  const state = useStore();
  const shield = useSpoilerShield();
  const savedKey = state.settings.tmdbKey || '';
  const [key, setKey] = useState(savedKey);
  const [msg, setMsg] = useState(null); // { text, kind: 'ok' | 'err' }
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(null); // { type: 'show', id } | { type: 'all' }
  const [cloudBusy, setCloudBusy] = useState(false);
  const fileRef = useRef();
  const lbRef = useRef();
  const lb = useLetterboxd();
  const restoreRef = useRef();
  const datesRef = useRef();
  const [datesPlan, setDatesPlan] = useState(null);
  function onDatesFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (!isBackupFile(json)) throw new Error('That isn’t a WatchNext backup file.');
        const plan = planFirstDates(getState().shows, json).map((p) => ({ ...p, eps: p.eps.map((x) => ({ ...x, code: fdCode(x.key) })) }));
        if (!plan.length) say('Nothing to bring back: this backup has no earlier first watch dates than you have now.');
        else setDatesPlan(plan);
      } catch (err) {
        say('Couldn’t read that backup: ' + err.message, 'err');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }
  function applyDates() {
    const n = restoreFirstDates(datesPlan);
    setDatesPlan(null);
    say(`Brought back ${n} first watch date${n === 1 ? '' : 's'}. You can undo it in Your recent changes.`);
  }
  const fmtWhen = (iso) => fmtDay(localISODate(new Date(iso)));
  const bannerRef = useRef();
  const copyTimer = useRef();
  const cloudUser = useSyncExternalStore(subscribeCloudUser, getCloudUser);
  const cloudOn = isCloudAvailable();

  const say = (text, kind = 'ok') => setMsg({ text, kind });
  const activity = useSyncExternalStore(subscribeActivity, getActivity);
  const [askUndo, setAskUndo] = useState(null); // an entry changed again later: confirm first
  function undoEntry(e, st, force = false) {
    if (st === 'changed' && !force) { setAskUndo(e); return; }
    setAskUndo(null);
    const r = undoActivity(e.id, force);
    if (r.ok) say(`Undone: ${e.what} — ${e.title}`);
    else if (r.reason === 'undone') say('That change was already undone.');
    else say('Couldn’t undo that change.', 'err');
  }

  const svc = useServicesPrefs();

  // Backup reminder: when this device last downloaded a backup (kept per device, outside the library).
  const [bk, setBk] = useState(() => loadMeta(localStorage));
  const total = libraryCount(state);
  useEffect(() => {
    // the first time this device sees a non-empty library, remember it (so a brand-new library isn't nagged)
    const next = withSince(bk, total, new Date());
    if (next !== bk) { saveMeta(localStorage, next); setBk(next); }
  }, [total]); // eslint-disable-line react-hooks/exhaustive-deps
  const nudge = nudgeStatus(bk, total, new Date());
  const remindLater = () => { const next = afterSnooze(bk, new Date()); saveMeta(localStorage, next); setBk(next); };
  // The banner sits at the top; bring it into view when a message appears so an
  // import result or error is never missed on a long phone page.
  useEffect(() => {
    if (msg && bannerRef.current && bannerRef.current.scrollIntoView) {
      bannerRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [msg]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const dups = useMemo(() => findDuplicateMovies(state.movies), [state.movies]);
  const oldRows = useMemo(
    () => oldNames(groupMovies((state.movies || []).map((m, index) => ({ ...m, index })).filter((m) => (m.status || 'watched') === 'watched'))),
    [state.movies]
  );
  function useNewestNames() {
    const n = updateMovies(allPatches(oldRows));
    say(`Updated ${n} ${n === 1 ? 'viewing' : 'viewings'} to the film's newest name. You can undo it in Your recent changes.`);
  }
  const orphans = useMemo(
    () => orphanShows(state.shows).map(([id, sh]) => [id, sh, watchedCount(sh)]),
    [state.shows]
  );

  async function handleSignIn() {
    setCloudBusy(true);
    try {
      await signIn();
    } catch (err) {
      // Closing the Google window is not an error: signInProblem gives a calm note (or nothing).
      const p = signInProblem(err);
      if (p) say(p.text, p.kind);
    } finally {
      setCloudBusy(false);
    }
  }

  const [backupOnOut, setBackupOnOut] = useState(() => signOutBackupOn(localStorage));
  function toggleSignOutBackup(on) { setSignOutBackup(localStorage, on); setBackupOnOut(on); }
  // Sign out: download a backup FIRST (unless it's switched off or the library is empty), give the
  // browser a moment to start that download, then sign out. The library stays on this device.
  async function handleSignOut() {
    if (cloudBusy) return;
    setCloudBusy(true);
    const plan = signOutPlan(signOutBackupOn(localStorage), libraryCount(getState()));
    let failed = false;
    try {
      if (plan === 'backup') {
        try { exportBackup(false); await new Promise((r) => setTimeout(r, 800)); } catch (e) { failed = true; console.error('Backup before sign-out failed', e); }
      }
      await signOutCloud();
      say(signOutText(plan, { failed }), failed ? 'err' : 'ok');
    } catch (err) {
      say('Sign-out failed: ' + err.message, 'err');
    } finally {
      setCloudBusy(false);
    }
  }

  function saveKey() {
    setTmdbKey(key);
    setKey(key.trim());
    say(key.trim() ? 'TMDB key saved. It stays in this browser only.' : 'TMDB key removed.');
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(IMPORT_COMMAND);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      say('Couldn’t copy automatically — select the command and copy it by hand.', 'err');
    }
  }

  function onImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (isBackupFile(json)) {
          throw new Error('That is a WatchNext backup, not a TV Time export. Use “Restore from backup” in the Backup card instead.');
        }
        if (!json.shows && !json.movies) throw new Error('That file does not look like a WatchNext import.');
        say(importResultText(importTvTime(json)));
      } catch (err) {
        say('Import failed: ' + err.message, 'err');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function onRestoreFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (isTvTimeFile(json)) {
          throw new Error('That looks like a TV Time export. Use “Import TV Time history” above instead.');
        }
        say(restoreResultText(restoreBackup(json)));
      } catch (err) {
        say('Restore failed: ' + err.message, 'err');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function exportBackup(announce = true) {
    // The TMDB key is deliberately left out (see backupState).
    const blob = new Blob([JSON.stringify(backupState(getState()), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = backupFileName(localISODate());
    a.click();
    URL.revokeObjectURL(a.href);
    const next = afterBackup(loadMeta(localStorage), libraryCount(getState()), new Date());
    saveMeta(localStorage, next);
    setBk(next);
    if (announce) say('Backup downloaded. Your TMDB key is not included in the file.');
  }

  function exportCsv(kind) {
    const { text, count, fileName } = buildCsv(kind, getState(), localISODate());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
    say(csvDoneText(kind, count));
  }

  function confirmDeleteShow() {
    const sh = state.shows[confirm.id];
    deleteShow(confirm.id);
    setConfirm(null);
    say(`Deleted “${sh ? sh.name : 'show'}”.`);
  }
  const [wiping, setWiping] = useState(false);
  // Delete everywhere: download a backup FIRST, give the browser a moment to start
  // that download, then wipe the cloud and this device. If anything fails the
  // dialog closes with an error and the backup file is already saved.
  async function confirmWipeEverywhere() {
    if (wiping) return;
    setWiping(true);
    try {
      exportBackup();
      await new Promise((r) => setTimeout(r, 800));
      const res = await wipeEverywhere();
      setKey('');
      setConfirm(null);
      say(wipeDoneText(res.shows));
    } catch (err) {
      console.error('Delete everywhere failed', err);
      setConfirm(null);
      say(wipeFailText(err), 'err');
    } finally {
      setWiping(false);
    }
  }
  function confirmDeleteAll() {
    resetAll();
    setKey('');
    setConfirm(null);
    say('All data on this device was deleted.');
  }

  const target = confirm && confirm.type === 'show' ? state.shows[confirm.id] : null;
  const targetSeen = target ? watchedCount(target) : 0;
  const signedIn = cloudOn && !!cloudUser;

  return (
    <div className="sd-page sd-setpage">
      <h1 className="sd-title">Settings</h1>
      <Banner msg={msg} onClose={() => setMsg(null)} bannerRef={bannerRef} />
      {nudge.show && <BackupNudge copy={nudgeCopy(nudge)} onBackup={exportBackup} onLater={remindLater} />}

      <div className="sd-set">
        <HelpCard onOpen={onOpenHelp} />
        <SyncCard available={cloudOn} user={cloudUser} busy={cloudBusy} onSignIn={handleSignIn} onSignOut={handleSignOut} backupOnSignOut={backupOnOut} onToggleBackup={toggleSignOutBackup} />
        <KeyCard status={keyStatus(savedKey, key)} value={key} onChange={setKey} onSave={saveKey} />
        <RegionCard region={svc.region} onChange={(r) => setServicesPrefs({ region: r })} />
        <ServicesCard mine={svc.mine} onToggle={toggleMyService} region={svc.region} />
        <SpoilerCard on={shield} onChange={setSpoilerShield} />
        <ImportCard
          command={IMPORT_COMMAND}
          copied={copied}
          onCopy={copyCommand}
          onChoose={() => fileRef.current.click()}
          fileRef={fileRef}
          onFile={onImportFile}
        />
        <LetterboxdCard st={lb.st} fileRef={lbRef} onChoose={() => lbRef.current.click()} onFiles={lb.onFiles} onStart={lb.start} onStop={lb.stop} onReset={lb.reset} />
        <CleanupCard rows={orphans} onAskDelete={(id) => setConfirm({ type: 'show', id })} />
        <DuplicatesCard groups={dups.groups} titles={dups.titles} extra={dups.extra} />
        <OldNamesCard rows={oldRows} intro={oldNamesIntro(oldRows)} onUpdate={useNewestNames} />
        <HiddenCard rows={hiddenList(state.hidden)} onShowAgain={(e) => setDiscoverHidden(e, false)} />
        <ActivityCard log={activity} state={state} onUndo={undoEntry} />
        <BackupCard lastLine={lastBackupLine(bk, new Date())} onDownload={exportBackup} onRestore={() => restoreRef.current.click()} restoreRef={restoreRef} onRestoreFile={onRestoreFile} datesRef={datesRef} onDatesFile={onDatesFile} />
        <CsvCard onExport={exportCsv} />
        <DangerCard signedIn={signedIn} onAsk={() => setConfirm({ type: 'all' })} onAskEverywhere={() => setConfirm({ type: 'everywhere' })} />
        <Credits />
      </div>

      <p className="sd-credit" data-testid="credit">
        Created by <a href="https://github.com/AceAsif" target="_blank" rel="noopener noreferrer">AceAsif</a>
      </p>

      {target && (
        <ConfirmDialog
          title="Delete this show?"
          summary={
            <div className="sd-confirm-show">
              <ShowThumb show={target} />
              <div>
                <div className="nm">{target.name}</div>
                <div className={'mt' + (targetSeen ? '' : ' none')}>{targetSeen ? `${targetSeen.toLocaleString()} watched` : 'no history'}</div>
              </div>
            </div>
          }
          effects={deleteShowEffects(targetSeen)}
          confirmLabel="Delete show"
          onConfirm={confirmDeleteShow}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm && confirm.type === 'all' && (
        <ConfirmDialog
          title="Delete all data on this device?"
          effects={deleteAllEffects(signedIn)}
          confirmLabel="Delete all data"
          onConfirm={confirmDeleteAll}
          onCancel={() => setConfirm(null)}
        />
      )}
      {datesPlan && <FirstDatesSheet plan={datesPlan} fmt={fmtWhen} onApply={applyDates} onClose={() => setDatesPlan(null)} />}
      {askUndo && <UndoAnywayDialog entry={askUndo} onConfirm={() => undoEntry(askUndo, 'changed', true)} onCancel={() => setAskUndo(null)} />}
      {confirm && confirm.type === 'everywhere' && signedIn && (
        <WipeDialog busy={wiping} onConfirm={confirmWipeEverywhere} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
