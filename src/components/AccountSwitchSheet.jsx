import React, { useRef, useState, useSyncExternalStore } from 'react';
import { Sheet } from './ui.jsx';
import { getAccountSwitch, subscribeAccountSwitch, resolveAccountSwitch } from '../store/cloud.js';
import { switchCopy } from '../store/accountSwitch.js';
import { getState } from '../store/db.js';
import { backupState, backupFileName } from './settingsLogic.js';
import { localISODate } from './showLogic.js';

// Shown when a different Google account signs in on a device that holds another account's
// library. Nothing syncs until one of the three answers is picked. Closing the sheet
// (Escape, tapping outside) is the same as Cancel: it signs out and changes nothing.
function downloadBackup() {
  const blob = new Blob([JSON.stringify(backupState(getState()), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = backupFileName(localISODate());
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AccountSwitchSheet() {
  const pending = useSyncExternalStore(subscribeAccountSwitch, getAccountSwitch, () => null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  if (!pending) return null;
  const copy = switchCopy(pending);

  async function choose(choice) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (choice === 'fresh') {
        downloadBackup(); // the library is about to leave this device: keep a copy first
        await new Promise((r) => setTimeout(r, 800)); // let the browser start the download
      }
      await resolveAccountSwitch(choice);
    } catch (err) {
      console.error('Account switch failed', err);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Sheet open title={copy.title} role="alertdialog" variant="confirm" onClose={() => choose('cancel')} action={<span />}>
      <div data-testid="account-switch">
        <p className="sd-switch-intro">{copy.intro}</p>
        <div className="sd-switch-opts">
          <button type="button" className="sd-switch-opt primary" disabled={busy} onClick={() => choose('fresh')} data-testid="switch-fresh">
            <b>{busy ? 'Working…' : copy.fresh.label}</b>
            <span>{copy.fresh.line}</span>
          </button>
          <button type="button" className="sd-switch-opt" disabled={busy} onClick={() => choose('merge')} data-testid="switch-merge">
            <b>{copy.merge.label}</b>
            <span>{copy.merge.line}</span>
          </button>
          <button type="button" className="sd-switch-opt" autoFocus disabled={busy} onClick={() => choose('cancel')} data-testid="switch-cancel">
            <b>{copy.cancel.label}</b>
            <span>{copy.cancel.line}</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
