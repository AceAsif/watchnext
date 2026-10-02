import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '../store/useStore.js';
import { setTmdbKey, importTvTime, getState, resetAll, deleteShow, watchedCount } from '../store/db.js';
import { isCloudAvailable, getCloudUser, subscribeCloudUser, signIn, signOutCloud } from '../store/cloud.js';
import { localISODate } from '../components/showLogic.js';
import {
  keyStatus,
  backupState,
  backupFileName,
  importResultText,
  orphanShows,
  deleteShowEffects,
  deleteAllEffects,
} from '../components/settingsLogic.js';
import {
  Banner,
  SyncCard,
  KeyCard,
  ImportCard,
  CleanupCard,
  BackupCard,
  DangerCard,
  ConfirmDialog,
  ShowThumb,
} from '../components/SettingsCards.jsx';

// Settings — Claude Design, Direction A: one column of cards (Sync, TMDB key,
// Import, Clean up, Backup) and a separate red Danger zone, with real confirm
// dialogs instead of the browser's popups. Behaviour is the page's own; the
// agreed changes are: backups leave out the TMDB key, and "Delete all data" is
// honest that it clears THIS DEVICE only (it does not touch the cloud copy).

const IMPORT_COMMAND = 'python tools/convert_tvtime.py gdpr-data.zip -o tvtime_import.json';

export default function Settings() {
  const state = useStore();
  const savedKey = state.settings.tmdbKey || '';
  const [key, setKey] = useState(savedKey);
  const [msg, setMsg] = useState(null); // { text, kind: 'ok' | 'err' }
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(null); // { type: 'show', id } | { type: 'all' }
  const [cloudBusy, setCloudBusy] = useState(false);
  const fileRef = useRef();
  const bannerRef = useRef();
  const copyTimer = useRef();
  const cloudUser = useSyncExternalStore(subscribeCloudUser, getCloudUser);
  const cloudOn = isCloudAvailable();

  const say = (text, kind = 'ok') => setMsg({ text, kind });
  // The banner sits at the top; bring it into view when a message appears so an
  // import result or error is never missed on a long phone page.
  useEffect(() => {
    if (msg && bannerRef.current && bannerRef.current.scrollIntoView) {
      bannerRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [msg]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const orphans = useMemo(
    () => orphanShows(state.shows).map(([id, sh]) => [id, sh, watchedCount(sh)]),
    [state.shows]
  );

  async function handleSignIn() {
    setCloudBusy(true);
    try {
      await signIn();
    } catch (err) {
      say('Sign-in failed: ' + err.message, 'err');
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
        if (!json.shows && !json.movies) throw new Error('That file does not look like a WatchNext import.');
        say(importResultText(importTvTime(json)));
      } catch (err) {
        say('Import failed: ' + err.message, 'err');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function exportBackup() {
    // The TMDB key is deliberately left out (see backupState).
    const blob = new Blob([JSON.stringify(backupState(getState()), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = backupFileName(localISODate());
    a.click();
    URL.revokeObjectURL(a.href);
    say('Backup downloaded. Your TMDB key is not included in the file.');
  }

  function confirmDeleteShow() {
    const sh = state.shows[confirm.id];
    deleteShow(confirm.id);
    setConfirm(null);
    say(`Deleted “${sh ? sh.name : 'show'}”.`);
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

      <div className="sd-set">
        <SyncCard available={cloudOn} user={cloudUser} busy={cloudBusy} onSignIn={handleSignIn} onSignOut={() => signOutCloud()} />
        <KeyCard status={keyStatus(savedKey, key)} value={key} onChange={setKey} onSave={saveKey} />
        <ImportCard
          command={IMPORT_COMMAND}
          copied={copied}
          onCopy={copyCommand}
          onChoose={() => fileRef.current.click()}
          fileRef={fileRef}
          onFile={onImportFile}
        />
        <CleanupCard rows={orphans} onAskDelete={(id) => setConfirm({ type: 'show', id })} />
        <BackupCard onDownload={exportBackup} />
        <DangerCard signedIn={signedIn} onAsk={() => setConfirm({ type: 'all' })} />
      </div>

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
    </div>
  );
}
