import assert from 'node:assert/strict';
import { titleFacts, tvYears } from '../../src/components/titleInfoLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('movie: runtime and genres; runtime from the saved entry while details load', () => {
  assert.deepEqual(titleFacts('movie', { runtime: 100, genres: [{ name: 'Horror' }, { name: 'Comedy' }] }), ['100 min', 'Horror, Comedy']);
  assert.deepEqual(titleFacts('movie', null, { runtimeMin: 95 }), ['95 min']);
  assert.deepEqual(titleFacts('movie', { error: 'x' }), []);
});
t('show: years, seasons and episodes, status in plain words, episode length, genres', () => {
  assert.deepEqual(titleFacts('tv', { first_air_date: '2021-03-01', last_air_date: '2023-05-01', status: 'Ended', number_of_seasons: 3, number_of_episodes: 24, episode_run_time: [45], genres: [{ name: 'Drama' }] }),
    ['2021–2023', '3 seasons · 24 episodes', 'Ended', '~45 min', 'Drama']);
  assert.deepEqual(titleFacts('tv', { first_air_date: '2024-01-01', last_air_date: '2026-10-01', status: 'Returning Series', number_of_seasons: 1, number_of_episodes: 1 }),
    ['2024–', '1 season · 1 episode', 'Still airing']);
  assert.deepEqual(titleFacts('tv', { status: 'Canceled' }), ['Cancelled']);
  assert.deepEqual(titleFacts('tv', null), []);
});
t('tvYears: one year when it started and ended the same year; nothing without a date', () => {
  assert.equal(tvYears({ first_air_date: '2020-01-01', last_air_date: '2020-06-01', status: 'Ended' }), '2020');
  assert.equal(tvYears({ status: 'Ended' }), '');
});
console.log(`\n${n} title info tests passed`);
