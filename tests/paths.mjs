// Shared path helpers for the test harness, so the suites run from any checkout
// (Windows, macOS, Linux) instead of the old hard-coded /home/claude/... paths.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Path inside the repo: repoPath('src', 'store', 'db.js') */
export const repoPath = (...p) => path.join(ROOT, ...p);
/** Folder holding the browser suites, fonts.css and fakecloud.js */
export const BROWSER = repoPath('shot', 'browser');
export const browserFile = (name) => path.join(BROWSER, name);
/** Scratch area (git-ignored). workPath('tmp') / workPath('out_gl') are created on demand. */
export const WORK = repoPath('.harness-work');
export const workPath = (...p) => {
  const f = path.join(WORK, ...p);
  fs.mkdirSync(path.extname(f) ? path.dirname(f) : f, { recursive: true });
  return f;
};
/** Test build of the app that the browser suites serve (made by shot/build-test-dists.mjs) */
export const APP_DIST = path.join(WORK, 'dist');
