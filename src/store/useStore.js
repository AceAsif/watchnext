import { useSyncExternalStore } from 'react';
import { subscribe, getState } from './db.js';

export function useStore() {
  return useSyncExternalStore(subscribe, getState);
}
