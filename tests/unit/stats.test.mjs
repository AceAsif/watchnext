import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as S from '/home/claude/wl/src/components/statsLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

// ============================================ guard: the two batch thresholds must match
t('BATCH_MIN equals PACE_BATCH_MIN in store/db.js (the handover warns these must stay in sync)', () => {
  const src = fs.readFileSync('/home/claude/wl/src/store/db.js', 'utf8');
  const m = /const PACE_BATCH_MIN\s*=\s*(\d+)/.exec(src);
  assert.ok(m, 'PACE_BATCH_MIN not found in db.js'); assert.equal(S.BATCH_MIN, Number(m[1]));
});

// ============================================ moved verbatim: de-skew logic (golden behaviour)
const ev = (day, hhmmss, year = day.slice(0, 4)) => ({ year, day, wd: S.weekdayOf(day), minute: `${day}T${hhmmss.slice(0, 5)}`, ts: `${day}T${hhmmss}.000Z` });
t('dayNum / fmtDay / weekdayOf', () => {
  assert.equal(S.dayNum('2026-03-02') - S.dayNum('2026-03-01'), 1);
  assert.equal(S.dayNum('2026-04-06') - S.dayNum('2026-04-04'), 2); // across Hobart DST end
  assert.equal(S.fmtDay('2026-09-30'), '30 Sep 2026'); assert.equal(S.fmtDay(''), ''); assert.equal(S.fmtDay('bad'), 'bad');
  assert.equal(S.weekdayOf('2026-09-30'), 3); // Wednesday
});
t('computeHabits: a bulk batch (>=15 in one minute) counts as ONE event for day-of-week', () => {
  const evs = Array.from({ length: 20 }, (_, i) => ev('2019-03-05', '10:00:' + String(i).padStart(2, '0'))); // Tue, one minute
  const h = S.computeHabits(evs, 'all');
  assert.equal(h.dowRows.find((r) => r.label === 'Tue').value, 1);
  assert.deepEqual([h.batchMinutes, h.batchWatches, h.activeDays], [1, 20, 1]);
});
t('computeHabits: 14 in a minute is NOT a batch (threshold is exactly 15)', () => {
  const mk = (k) => Array.from({ length: k }, (_, i) => ev('2019-03-05', '10:00:' + String(i).padStart(2, '0')));
  assert.equal(S.computeHabits(mk(14), 'all').dowRows.find((r) => r.label === 'Tue').value, 14);
  assert.equal(S.computeHabits(mk(15), 'all').dowRows.find((r) => r.label === 'Tue').value, 1);
});
t('computeHabits: busiest day counts DISTINCT timestamps (200 stamped identically = 1)', () => {
  const dump = Array.from({ length: 200 }, () => ({ ...ev('2018-08-12', '00:00:00') }));
  const real = ['19:00:00', '19:30:00', '20:05:00', '21:10:00', '22:40:00'].map((x) => ev('2026-07-14', x));
  const h = S.computeHabits([...dump, ...real], 'all');
  assert.deepEqual(h.busiest, { date: '2026-07-14', count: 5 });
});
t('computeHabits: rows are Mon-first and year scoping works', () => {
  const evs = [ev('2025-01-06', '20:00:00'), ev('2026-01-05', '20:00:00'), ev('2026-01-11', '20:00:00')]; // Mon, Mon, Sun
  assert.deepEqual(S.computeHabits(evs, 'all').dowRows.map((r) => r.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const y26 = S.computeHabits(evs, '2026'); assert.deepEqual([y26.dowRows[0].value, y26.dowRows[6].value, y26.activeDays], [1, 1, 2]);
});
t('computeHabits: empty input is safe', () => {
  const h = S.computeHabits([], 'all'); assert.equal(h.busiest, null); assert.equal(h.activeDays, 0); assert.ok(h.dowRows.every((r) => r.value === 0));
});
t('busiestMonthOf / activeDaysOf', () => {
  const evs = [ev('2026-07-01', '20:00:00'), ev('2026-07-02', '20:00:00'), ev('2026-07-02', '21:00:00'), ev('2026-03-01', '20:00:00'), ev('2025-12-01', '20:00:00')];
  assert.deepEqual(S.busiestMonthOf(evs, '2026'), { name: 'Jul', count: 3 });
  assert.equal(S.busiestMonthOf(evs, '2030'), null); assert.equal(S.activeDaysOf(evs, '2026'), 3);
});

// ============================================ new: labels
t('streakRangeLabel: same month / same year / across years / same day / empty', () => {
  assert.equal(S.streakRangeLabel('2019-03-03', '2019-03-17'), '3–17 MAR 2019');
  assert.equal(S.streakRangeLabel('2019-02-28', '2019-03-14'), '28 FEB – 14 MAR 2019');
  assert.equal(S.streakRangeLabel('2018-12-28', '2019-01-14'), '28 DEC 2018 – 14 JAN 2019');
  assert.equal(S.streakRangeLabel('2019-03-03', '2019-03-03'), '3 MAR 2019');
  assert.equal(S.streakRangeLabel('', ''), ''); assert.equal(S.streakRangeLabel(null, undefined), '');
});
t('heatLevel thresholds', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 7, 8, 99].map(S.heatLevel), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

// ============================================ the heatmap grid — across DST zones
const OLD_gridDates = (year) => { // the old Heatmap.jsx loop, verbatim
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = new Date(year, 0, 1), gridStart = new Date(year, 0, 1 - start.getDay());
  const end = new Date(year, 11, 31), gridEnd = new Date(year, 11, 31 + (6 - end.getDay()));
  const out = []; for (let x = gridStart.getTime(); x <= gridEnd.getTime(); x += 86400000) out.push(ymd(new Date(x))); return out;
};
const wdOfDs = (ds) => { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const ZONES = ['Australia/Hobart', 'Pacific/Auckland', 'Australia/Lord_Howe', 'America/New_York', 'Europe/London', 'America/Sao_Paulo', 'Asia/Kolkata', 'UTC'];
const YEARS = [2020, 2021, 2023, 2024, 2025, 2026, 2027, 2028];

t('REGRESSION PROOF: the OLD algorithm duplicates a date in Hobart (so this suite would have caught it)', () => {
  process.env.TZ = 'Australia/Hobart';
  const dates = OLD_gridDates(2026); const dups = dates.filter((d, i) => dates.indexOf(d) !== i);
  assert.deepEqual(dups, ['2026-04-05']); assert.ok(!dates.includes('2026-10-04'), 'old grid skips 4 Oct');
  const g = S.buildYearGrid(2026, {}); const flat = g.columns.flat().map((c) => c.ds);
  assert.equal(new Set(flat).size, flat.length); assert.ok(flat.includes('2026-04-05') && flat.includes('2026-10-04'));
});
for (const zone of ZONES) {
  t(`grid is exact in ${zone} for ${YEARS.length} years: no dup/skip, consecutive, every cell in its true weekday row`, () => {
    process.env.TZ = zone;
    for (const year of YEARS) {
      const g = S.buildYearGrid(year, {}); const flat = g.columns.flat();
      assert.equal(flat.length % 7, 0, `${zone} ${year}: not whole weeks`);
      assert.ok(g.columns.every((c) => c.length === 7));
      assert.equal(new Set(flat.map((c) => c.ds)).size, flat.length, `${zone} ${year}: duplicate date`);
      flat.forEach((c, i) => {
        assert.equal(wdOfDs(c.ds), i % 7, `${zone} ${year}: ${c.ds} is in row ${i % 7} but is weekday ${wdOfDs(c.ds)}`);
        if (i > 0) assert.equal(S.dayNum(c.ds) - S.dayNum(flat[i - 1].ds), 1, `${zone} ${year}: gap before ${c.ds}`);
      });
      const inYear = flat.filter((c) => c.inYear).length;
      assert.equal(inYear, year % 4 === 0 ? 366 : 365, `${zone} ${year}: in-year cells`);
      assert.equal(g.columns[0][0].ds <= `${year}-01-01`, true); assert.equal(wdOfDs(g.columns[0][0].ds), 0); // starts on a Sunday
      assert.equal(g.months.length, 12);
      for (const m of g.months) assert.ok(g.columns[m.col].some((c) => c.inYear && c.day === 1 && c.month === m.month), `${zone} ${year}: month label column`);
    }
  });
}
t('counts: summed from the map, out-of-year cells ignored, each day counted ONCE (the old Apr-5 double count)', () => {
  process.env.TZ = 'Australia/Hobart';
  const counts = { '2026-04-05': 6, '2026-01-01': 2, '2026-12-31': 1, '2025-12-31': 50, '2027-01-01': 50 };
  const g = S.buildYearGrid(2026, counts);
  assert.equal(g.total, 9); assert.equal(g.activeDays, 3);
  const hits = g.columns.flat().filter((c) => c.ds === '2026-04-05'); assert.equal(hits.length, 1);
});
t('future flag: only in-year days after "today"; none when today is omitted', () => {
  process.env.TZ = 'UTC';
  const g = S.buildYearGrid(2026, {}, '2026-06-15'); const flat = g.columns.flat();
  assert.ok(flat.filter((c) => c.future).every((c) => c.inYear && c.ds > '2026-06-15'));
  assert.equal(flat.find((c) => c.ds === '2026-06-15').future, false); assert.equal(flat.find((c) => c.ds === '2026-06-16').future, true);
  assert.equal(S.buildYearGrid(2026, {}).columns.flat().some((c) => c.future), false);
  assert.equal(S.buildYearGrid(2020, {}, '2026-06-15').columns.flat().some((c) => c.future), false); // a past year is never future
});

// ============================================ tap hit-testing
t('cellAtFraction: corners, middle, clamping, and blank cells', () => {
  process.env.TZ = 'UTC';
  const { columns } = S.buildYearGrid(2026, {});            // 1 Jan 2026 is a Thursday -> col0 rows 0-3 blank
  assert.equal(S.cellAtFraction(columns, 0.0, 0.0), null);    // Sunday before 1 Jan: blank
  assert.equal(S.cellAtFraction(columns, 0.001, 4 / 7 + 0.01).ds, '2026-01-01'); // Thursday row of col 0
  const last = columns[columns.length - 1];
  assert.equal(S.cellAtFraction(columns, 1.0, last.findIndex((c) => c.ds === '2026-12-31') / 7 + 0.01).ds, '2026-12-31');
  assert.equal(S.cellAtFraction(columns, -5, -5), null); assert.equal(S.cellAtFraction(columns, 9, 9), null); // clamped, lands on blanks
  const mid = S.cellAtFraction(columns, 0.5, 3 / 7 + 0.01); assert.ok(mid && mid.inYear);
  assert.equal(S.cellAtFraction([], 0.5, 0.5), null);
});

// ============================================ bars
t('barRows: percentages, top row (first on ties), zero and empty', () => {
  const r = S.barRows([{ label: 'a', value: 50 }, { label: 'b', value: 100 }, { label: 'c', value: 100 }, { label: 'd', value: 0 }]);
  assert.deepEqual(r.map((x) => x.pct), [50, 100, 100, 0]); assert.deepEqual(r.map((x) => x.isTop), [false, true, false, false]);
  assert.ok(S.barRows([{ label: 'a', value: 0 }]).every((x) => x.pct === 0 && !x.isTop)); assert.deepEqual(S.barRows([]), []);
});
t('label/value widths: clamped between min and max and grow with text', () => {
  assert.equal(S.labelWidthFor(['Mon', 'Tue']), 30); assert.ok(S.labelWidthFor(['Prime Video']) > 60);
  assert.equal(S.labelWidthFor(['x'.repeat(80)]), 128); assert.equal(S.labelWidthFor([]), 30);
  assert.equal(S.valueWidthFor([5, 9]), 32); assert.ok(S.valueWidthFor([1234], ' hrs') > S.valueWidthFor([1234]));
});

// ============================================ tab keyboard nav
t('nextTab: arrows wrap, Home/End jump, anything else is ignored', () => {
  const T = ['Overview', 'Habits', 'Rankings', 'Breakdown'];
  assert.equal(S.nextTab(T, 'Overview', 'ArrowRight'), 'Habits'); assert.equal(S.nextTab(T, 'Breakdown', 'ArrowRight'), 'Overview');
  assert.equal(S.nextTab(T, 'Overview', 'ArrowLeft'), 'Breakdown'); assert.equal(S.nextTab(T, 'Habits', 'Home'), 'Overview');
  assert.equal(S.nextTab(T, 'Habits', 'End'), 'Breakdown'); assert.equal(S.nextTab(T, 'Habits', 'a'), null); assert.equal(S.nextTab(T, 'Nope', 'ArrowRight'), null);
});

console.log(`\n${n} stats tests passed`);
