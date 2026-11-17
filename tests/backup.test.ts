// Run with: TZ=Europe/Amsterdam npx tsx tests/backup.test.ts
import assert from 'node:assert/strict';
import {
  BACKUP_FILE,
  DATA_PREFIX,
  decodeSnapshot,
  encodeSnapshot,
  makeSnapshot,
  mergeSnapshot,
  stampChanges,
  tasksFromDeadlines,
  type SyncedData,
} from '../src/backup';
import { BUSY_HEADER, parseBusyText, shortcutUrl } from '../src/shortcutBridge';
import { DEFAULT_SETTINGS, type Task } from '../src/types';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log('✓', name);
  } catch (e) {
    console.error('✗', name);
    throw e;
  }
}

const T0 = Date.UTC(2026, 10, 17, 9, 0);
const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({
  id,
  title,
  estimateMin: 60,
  loggedSec: 0,
  priority: 2,
  done: false,
  createdAt: T0 - 86400_000,
  ...over,
});
const data = (over: Partial<SyncedData> = {}): SyncedData => ({
  tasks: [],
  projects: [],
  settings: { ...DEFAULT_SETTINGS },
  tombstones: {},
  ...over,
});

test('a snapshot survives the trip as one line, accents and symbols included', () => {
  const d = data({ tasks: [task('a', 'Scriptie: één ⚑ — “quotes” | pipes & ampersands 📚', { notes: 'line 1\nline 2' })] });
  const line = encodeSnapshot(makeSnapshot(d, T0));
  assert.ok(line.startsWith(DATA_PREFIX));
  assert.ok(!line.includes('\n') && !line.includes('|'));
  // As it comes back from the shortcut: file line, then the busy list.
  const back = decodeSnapshot(`${line}\n${BUSY_HEADER}\n2026-11-18T10:00:00+01:00|2026-11-18T11:00:00+01:00|Lecture`);
  assert.equal(back?.tasks[0].title, d.tasks[0].title);
  assert.equal(back?.tasks[0].notes, 'line 1\nline 2');
  assert.equal(back?.at, T0);
});

test('no backup line, or a broken one, means no backup (not an empty one)', () => {
  assert.equal(decodeSnapshot(`${BUSY_HEADER}\n`), null);
  assert.equal(decodeSnapshot(`\n${BUSY_HEADER}\n`), null); // shortcut updated, file not saved yet
  assert.equal(decodeSnapshot(`${DATA_PREFIX}not-base64!!\n${BUSY_HEADER}`), null);
});

test('device-only settings stay on the device', () => {
  const s = makeSnapshot(data({ settings: { ...DEFAULT_SETTINGS, shortcutReady: true, autoWrite: true, accent: 'teal' } }), T0);
  assert.equal(s.settings.shortcutReady, undefined);
  assert.equal(s.settings.autoWrite, undefined);
  assert.equal(s.settings.accent, 'teal');
});

test('only edited tasks get a new change time', () => {
  const a = task('a', 'A');
  const b = task('b', 'B');
  const next = stampChanges([a, b], [a, { ...b, done: true }, task('c', 'C')], T0);
  assert.equal(next[0], a);
  assert.equal(next[1].updatedAt, T0);
  assert.equal(next[2].updatedAt, T0);
});

test('Safari cleared: an empty Paced gets everything back from iCloud Drive', () => {
  const phone = data({
    tasks: [task('a', 'idl exam', { deadline: T0 + 2 * 86400_000, updatedAt: T0 }), task('b', 'TA grading', { done: true, updatedAt: T0 })],
    projects: [{ id: 'p', name: 'Thesis', color: '#000', createdAt: T0, updatedAt: T0 }],
    settings: { ...DEFAULT_SETTINGS, accent: 'teal', font: 'inter' },
    settingsAt: T0,
  });
  const wiped = data({ settings: { ...DEFAULT_SETTINGS, shortcutReady: true } });
  const m = mergeSnapshot(wiped, makeSnapshot(phone, T0));
  assert.ok(m.changed);
  assert.deepEqual(m.tasks.map((x) => x.title), ['idl exam', 'TA grading']);
  assert.equal(m.projects[0].name, 'Thesis');
  assert.equal(m.settings.accent, 'teal');
  assert.equal(m.settings.shortcutReady, true); // the device's own connection survives
});

test('two devices: each keeps its own new tasks, and the newer edit of a shared task wins', () => {
  const shared = task('s', 'Report', { estimateMin: 60, updatedAt: T0 });
  const phone = data({ tasks: [{ ...shared, estimateMin: 120, updatedAt: T0 + 5000 }, task('p1', 'Phone task', { updatedAt: T0 + 1 })] });
  const ipad = data({ tasks: [shared, task('i1', 'iPad task', { updatedAt: T0 + 2 })] });
  const onIpad = mergeSnapshot(ipad, makeSnapshot(phone, T0 + 6000));
  assert.deepEqual(onIpad.tasks.map((x) => x.id).sort(), ['i1', 'p1', 's']);
  assert.equal(onIpad.tasks.find((x) => x.id === 's')!.estimateMin, 120);
  // And back the other way: nothing lost, nothing changes.
  const onPhone = mergeSnapshot(phone, makeSnapshot(onIpad, T0 + 7000));
  assert.deepEqual(onPhone.tasks.map((x) => x.id).sort(), ['i1', 'p1', 's']);
  assert.equal(onPhone.tasks.find((x) => x.id === 's')!.estimateMin, 120);
});

test("a task deleted for good on one device doesn't come back from the other", () => {
  const phone = data({ tasks: [task('x', 'Old', { updatedAt: T0 })] });
  const ipad = data({ tasks: [], tombstones: { x: T0 + 1000 } });
  const m = mergeSnapshot(phone, makeSnapshot(ipad, T0 + 2000));
  assert.equal(m.tasks.length, 0);
  assert.ok(m.changed);
  assert.equal(m.tombstones.x, T0 + 1000);
});

test('soft delete and restore travel like any other edit', () => {
  const phone = data({ tasks: [task('x', 'T', { deletedAt: T0 + 10, updatedAt: T0 + 10 })] });
  const ipad = data({ tasks: [task('x', 'T', { updatedAt: T0 })] });
  assert.equal(mergeSnapshot(ipad, makeSnapshot(phone, T0 + 20)).tasks[0].deletedAt, T0 + 10);
});

test('an older backup never overwrites newer local edits or settings', () => {
  const local = data({ tasks: [task('a', 'New title', { updatedAt: T0 + 100 })], settings: { ...DEFAULT_SETTINGS, accent: 'pink' }, settingsAt: T0 + 100 });
  const old = data({ tasks: [task('a', 'Old title', { updatedAt: T0 })], settings: { ...DEFAULT_SETTINGS, accent: 'teal' }, settingsAt: T0 });
  const m = mergeSnapshot(local, makeSnapshot(old, T0 + 50));
  assert.equal(m.tasks[0].title, 'New title');
  assert.equal(m.settings.accent, 'pink');
  assert.equal(m.changed, false);
});

test("the Paced calendar's deadlines are read, never counted as busy, and can rebuild tasks", () => {
  const text = [
    BUSY_HEADER,
    '2026-11-18T10:00:00+01:00|2026-11-18T12:00:00+01:00|Lecture',
    '2026-11-19T08:45:00+01:00|2026-11-19T09:00:00+01:00|⚑ Due: idl exam',
    '2026-11-19T08:45:00+01:00|2026-11-19T09:00:00+01:00|⚑ Due: idl exam', // same event in two places
    '2026-11-25T16:45:00+01:00|2026-11-25T17:00:00+01:00|⚑ Project due: Thesis draft',
    '2026-11-18T13:00:00+01:00|2026-11-18T14:00:00+01:00|▶ idl exam',
  ].join('\n');
  const p = parseBusyText(text)!;
  assert.deepEqual(p.busy.map((b) => b.title), ['Lecture']);
  assert.equal(p.deadlines.length, 3);
  let n = 0;
  const r = tasksFromDeadlines(p.deadlines, T0, () => `id${++n}`);
  assert.deepEqual(r.tasks.map((x) => [x.title, x.estimateMin, new Date(x.deadline!).toISOString()]), [
    ['idl exam', 60, '2026-11-19T08:00:00.000Z'],
  ]);
  assert.deepEqual(r.projects.map((x) => x.name), ['Thesis draft']);
});

test('the hand-off to the shortcut carries the backup next to the plan', () => {
  const line = encodeSnapshot(makeSnapshot(data({ tasks: [task('a', 'A')] }), T0));
  const url = shortcutUrl([{ t: '⚑ Due: A', s: '2026-11-19 08:45', e: '2026-11-19 09:00' }], 'https://x.github.io/paced/', line);
  const text = decodeURIComponent(url.split('&text=')[1].split('&x-error=')[0]);
  const payload = JSON.parse(text);
  assert.equal(payload.data, line);
  assert.equal(payload.events.length, 1);
  assert.equal(BACKUP_FILE, 'paced-backup.txt');
});

console.log(`${passed} backup tests passed`);
