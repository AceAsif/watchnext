import React, { useSyncExternalStore } from 'react';
import { getCloudUser, subscribeCloudUser, isCloudAvailable } from '../store/cloud.js';
import { accountChip } from './settingsLogic.js';

// Masthead chip: which Google account's library is on screen. Just the initial on a phone, the
// email as well on wider screens. Tapping it opens Settings (the Sync card, with Sign out).
// Nothing is shown when signed out, or when cloud sync isn't set up.
export default function AccountChip({ onOpen }) {
  const user = useSyncExternalStore(subscribeCloudUser, getCloudUser, () => null);
  const chip = isCloudAvailable() ? accountChip(user) : null;
  if (!chip) return null;
  return (
    <button type="button" className="sd-chip-acct" onClick={onOpen} aria-label={chip.label} title={chip.email || 'Signed in'} data-testid="account-chip">
      <span className="av" aria-hidden="true">{chip.initial}</span>
      {chip.email && <span className="em">{chip.email}</span>}
    </button>
  );
}
