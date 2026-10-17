import { useRef, useState } from 'react';
import { csvRecords, csvKind, buildPlan, runImport, previewText, resultText } from './letterboxdLogic.js';
import { readZipTexts, isLetterboxdCsv } from './letterboxdZip.js';
import { searchMovieParams, movieDetails, hasKey } from '../api/tmdb.js';
import { importLetterboxd } from '../store/db.js';

// State machine behind the Letterboxd card: idle -> preview -> running -> done.
export function useLetterboxd() {
  const [st, setSt] = useState({ phase: 'idle' });
  const cancel = useRef(false);
  const planRef = useRef(null);

  async function onFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    try {
      const texts = []; // {name, text}
      for (const f of files) {
        if (/\.zip$/i.test(f.name)) texts.push(...(await readZipTexts(await f.arrayBuffer(), isLetterboxdCsv)));
        else texts.push({ name: f.name, text: await f.text() });
      }
      const by = {};
      for (const t of texts) {
        const k = csvKind(t.name, t.text);
        if (k) by[k] = csvRecords(t.text);
      }
      if (!by.watched && !by.diary && !by.ratings && !by.watchlist) {
        throw new Error('I could not find watched.csv, diary.csv, ratings.csv or watchlist.csv in that file. Choose the zip from Letterboxd, or those CSV files.');
      }
      const plan = buildPlan(by);
      if (!plan.counts.films && !plan.counts.watchlist) throw new Error('That Letterboxd file has no films in it.');
      planRef.current = plan;
      setSt({ phase: 'preview', counts: plan.counts, line: previewText(plan.counts), keyMissing: !hasKey() });
    } catch (e) {
      setSt({ phase: 'error', message: 'Import failed: ' + e.message });
    }
  }

  async function start() {
    const plan = planRef.current;
    if (!plan) return;
    if (!hasKey()) { setSt({ phase: 'error', message: 'Add your TMDB key above first — the import uses it to find posters and run times.' }); return; }
    cancel.current = false;
    setSt({ phase: 'running', done: 0, total: plan.films.length + plan.watchlist.length, unmatched: 0 });
    try {
      const res = await runImport(plan, {
        search: searchMovieParams,
        details: movieDetails,
        save: importLetterboxd,
        cancelled: () => cancel.current,
        onProgress: (p) => setSt({ phase: 'running', ...p }),
      });
      planRef.current = null;
      setSt({ phase: 'done', result: res, text: resultText(res) });
    } catch (e) {
      setSt({ phase: 'error', message: 'Import stopped: ' + e.message + ' Anything already imported was kept.' });
    }
  }

  return {
    st,
    onFiles,
    start,
    stop: () => { cancel.current = true; },
    reset: () => { planRef.current = null; setSt({ phase: 'idle' }); },
  };
}
