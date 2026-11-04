// Run with: TZ=Europe/Amsterdam npx tsx tests/scheduler.test.ts
import assert from 'node:assert/strict';
import { buildPlan, freeIntervals, latestStart, MIN, HOUR, mergeIntervals } from '../src/scheduler';
import { DEFAULT_SETTINGS, type Project, type Settings, type Task } from '../src/types';

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

const at = (d: string) => new Date(d).getTime(); // local time (TZ env)
const settings: Settings = { ...DEFAULT_SETTINGS, horizonDays: 7 };
let idc = 0;
const task = (over: Partial<Task>): Task => ({
  id: `t${++idc}`,
  title: 'Task',
  estimateMin: 60,
  loggedSec: 0,
  priority: 2,
  done: false,
  createdAt: idc,
  ...over,
});

// Wednesday 4 Nov 2026, 10:02
const now = at('2026-11-04T10:02:00');

test('merge overlapping intervals', () => {
  assert.deepEqual(mergeIntervals([{ start: 5, end: 8 }, { start: 1, end: 3 }, { start: 2, end: 6 }]), [{ start: 1, end: 8 }]);
});

test('free time respects working hours and busy events', () => {
  const busy = [{ start: at('2026-11-04T11:00:00'), end: at('2026-11-04T13:00:00') }];
  const free = freeIntervals(busy, settings, at('2026-11-04T10:05:00'), at('2026-11-05T00:00:00'));
  assert.deepEqual(free, [
    { start: at('2026-11-04T10:05:00'), end: at('2026-11-04T11:00:00') },
    { start: at('2026-11-04T13:00:00'), end: at('2026-11-04T22:00:00') },
  ]);
});

test('non-work days are skipped', () => {
  const s = { ...settings, workDays: [1, 2, 3, 4, 5] }; // Mon–Fri
  const free = freeIntervals([], s, at('2026-11-07T00:00:00'), at('2026-11-09T23:59:00')); // Sat–Mon
  assert.equal(free.length, 1);
  assert.equal(new Date(free[0].start).getDay(), 1);
});

test('single task is placed into the first free slot, split into chunks with breaks', () => {
  const t = task({ estimateMin: 150 });
  const plan = buildPlan({ tasks: [t], projects: [], busy: [], settings, timer: null, now });
  const tp = plan.tasks[t.id];
  assert.equal(tp.remainingMin, 150);
  assert.equal(tp.blocks.length, 2);
  assert.equal(tp.blocks[0].start, at('2026-11-04T10:05:00'));
  assert.equal((tp.blocks[0].end - tp.blocks[0].start) / MIN, 90);
  assert.equal(tp.blocks[1].start, tp.blocks[0].end + 10 * MIN);
  assert.equal(tp.projectedFinish, tp.blocks[1].end);
  assert.equal(tp.status, 'no-deadline');
  assert.ok(tp.suggestedDeadline! >= tp.projectedFinish! + HOUR);
});

test('no tiny leftover blocks: 100 min becomes 75 + 25', () => {
  const t = task({ estimateMin: 100 });
  const plan = buildPlan({ tasks: [t], projects: [], busy: [], settings, timer: null, now });
  assert.deepEqual(plan.tasks[t.id].blocks.map((b) => (b.end - b.start) / MIN), [75, 25]);
});

test('work is scheduled around calendar events', () => {
  const t = task({ estimateMin: 120 });
  const busy = [{ start: at('2026-11-04T10:30:00'), end: at('2026-11-04T16:00:00') }];
  const plan = buildPlan({ tasks: [t], projects: [], busy, settings, timer: null, now });
  const blocks = plan.tasks[t.id].blocks;
  // 10:05–10:30 is a 25 min gap: usable (= min chunk)
  assert.equal(blocks[0].start, at('2026-11-04T10:05:00'));
  assert.equal(blocks[0].end, at('2026-11-04T10:30:00'));
  assert.equal(blocks[1].start, at('2026-11-04T16:00:00'));
  for (const b of blocks) for (const x of busy) assert.ok(b.end <= x.start || b.start >= x.end);
});

test('earliest deadline goes first; status flags late work', () => {
  const later = task({ title: 'later', estimateMin: 60, deadline: at('2026-11-10T17:00:00') });
  const sooner = task({ title: 'sooner', estimateMin: 60, deadline: at('2026-11-04T12:00:00') });
  const huge = task({ title: 'huge', estimateMin: 600, deadline: at('2026-11-04T20:00:00') });
  const plan = buildPlan({ tasks: [later, sooner, huge], projects: [], busy: [], settings, timer: null, now });
  assert.equal(plan.blocks[0].taskId, sooner.id);
  assert.equal(plan.tasks[sooner.id].status, 'tight'); // finishes 11:05, due 12:00
  assert.equal(plan.tasks[huge.id].status, 'late'); // 10h of work, ~9h left today
  assert.equal(plan.tasks[later.id].status, 'ok');
  assert.ok(plan.tasks[later.id].slackMin! > 0);
});

test('timer progress reduces remaining time', () => {
  const t = task({ estimateMin: 60, loggedSec: 10 * 60 });
  const timer = { taskId: t.id, startedAt: now - 20 * MIN };
  const plan = buildPlan({ tasks: [t], projects: [], busy: [], settings, timer, now });
  assert.equal(plan.tasks[t.id].remainingMin, 30);
});

test('a running timer does not push urgent work aside', () => {
  const a = task({ estimateMin: 60, deadline: at('2026-11-05T12:00:00') });
  const b = task({ estimateMin: 60 });
  const plan = buildPlan({ tasks: [a, b], projects: [], busy: [], settings, timer: { taskId: b.id, startedAt: now }, now });
  assert.equal(plan.blocks[0].taskId, a.id);
});

test('task is tight when there is barely enough free time before its deadline', () => {
  // 100 min of work, deadline tomorrow 12:00; only 20:00–22:00 is free before it
  const t = task({ estimateMin: 100, deadline: at('2026-11-05T12:00:00') });
  const busy = [
    { start: at('2026-11-04T10:00:00'), end: at('2026-11-04T20:00:00') },
    { start: at('2026-11-05T09:00:00'), end: at('2026-11-05T12:00:00') },
  ];
  const plan = buildPlan({ tasks: [t], projects: [], busy, settings, timer: null, now });
  assert.equal(plan.tasks[t.id].startBy, at('2026-11-04T20:20:00'));
  assert.equal(plan.tasks[t.id].spareMin, 0); // last block ends 21:50, then a 10 min break
  assert.equal(plan.tasks[t.id].status, 'tight');
});

test('project deadline applies to its tasks and project totals add up', () => {
  const p: Project = { id: 'p1', name: 'Thesis', color: '#000', deadline: at('2026-11-06T17:00:00'), createdAt: 0 };
  const a = task({ projectId: 'p1', estimateMin: 120, loggedSec: 30 * 60 });
  const b = task({ projectId: 'p1', estimateMin: 60, done: true, doneAt: now - HOUR, loggedSec: 3600 });
  const plan = buildPlan({ tasks: [a, b], projects: [p], busy: [], settings, timer: null, now });
  assert.equal(plan.tasks[a.id].deadline, p.deadline);
  const pp = plan.projects.p1;
  assert.equal(pp.remainingMin, 90);
  assert.equal(pp.totalEstimateMin, 180);
  assert.equal(pp.loggedMin, 90);
  assert.equal(pp.openTasks, 1);
  assert.equal(pp.status, 'ok');
  assert.equal(pp.projectedFinish, plan.tasks[a.id].projectedFinish);
});

test('latest start walks back through free time', () => {
  const free = [
    { start: at('2026-11-04T10:00:00'), end: at('2026-11-04T12:00:00') },
    { start: at('2026-11-04T14:00:00'), end: at('2026-11-04T15:00:00') },
  ];
  assert.equal(latestStart(free, at('2026-11-04T15:00:00'), 90), at('2026-11-04T11:30:00'));
  assert.equal(latestStart(free, at('2026-11-04T15:00:00'), 500), undefined);
});

test('work that does not fit in the horizon is reported as unscheduled', () => {
  const t = task({ estimateMin: 100 * 60 });
  const plan = buildPlan({ tasks: [t], projects: [], busy: [], settings, timer: null, now });
  assert.equal(plan.tasks[t.id].status, 'unscheduled');
  assert.ok(plan.tasks[t.id].unscheduledMin > 0);
  assert.equal(plan.tasks[t.id].projectedFinish, undefined);
});

test('DST change week still produces 13h working days', () => {
  // Europe/Amsterdam DST ends 25 Oct 2026
  const free = freeIntervals([], settings, at('2026-10-24T00:00:00'), at('2026-10-27T00:00:00'));
  assert.equal(free.length, 3);
  for (const f of free) assert.equal((f.end - f.start) / HOUR, 13);
});

test('breaks count: 2h of work does not fit in a 2h gap', () => {
  const t = task({ estimateMin: 120, deadline: at('2026-11-05T12:00:00') });
  const busy = [
    { start: at('2026-11-04T10:00:00'), end: at('2026-11-04T20:00:00') },
    { start: at('2026-11-05T09:00:00'), end: at('2026-11-05T12:00:00') },
  ];
  const plan = buildPlan({ tasks: [t], projects: [], busy, settings, timer: null, now });
  assert.equal(plan.tasks[t.id].status, 'late');
});

test('blocks never overlap each other', () => {
  const ts = [task({ estimateMin: 200 }), task({ estimateMin: 45, deadline: now + 5 * HOUR }), task({ estimateMin: 300, priority: 1 })];
  const busy = [{ start: now + 2 * HOUR, end: now + 3 * HOUR }];
  const plan = buildPlan({ tasks: ts, projects: [], busy, settings, timer: null, now });
  for (let i = 1; i < plan.blocks.length; i++) assert.ok(plan.blocks[i].start >= plan.blocks[i - 1].end);
});

console.log(`\n${passed} tests passed`);

/* ---------- Shortcut bridge (web calendar connection) ---------- */
import { buildSyncEvents, parseBusyText, parseIsoDate, parseShortcutReturn, shortcutDate, shortcutUrl } from '../src/shortcutBridge';

test('ISO dates from Shortcuts parse in every variant', () => {
  const expected = Date.UTC(2026, 10, 4, 12, 15); // 13:15 Amsterdam
  assert.equal(parseIsoDate('2026-11-04T13:15:00+01:00'), expected);
  assert.equal(parseIsoDate('2026-11-04T13:15:00+0100'), expected);
  assert.equal(parseIsoDate('2026-11-04T12:15:00Z'), expected);
  assert.equal(parseIsoDate('2026-11-04T13:15'), at('2026-11-04T13:15:00'));
  assert.equal(parseIsoDate('not a date'), null);
});

test('busy text from the shortcut is parsed, own events and junk skipped', () => {
  const text = [
    'PACED-BUSY',
    '2026-11-04T13:15:00+01:00|2026-11-04T15:00:00+01:00|Advanced Data Mining | lecture',
    '2026-11-04T18:00:00+01:00|2026-11-04T19:00:00+01:00|▶ Grade TA submissions',
    'garbage line',
    '',
  ].join('\n');
  const r = parseBusyText(text)!;
  assert.equal(r.busy.length, 1);
  assert.equal(r.busy[0].title, 'Advanced Data Mining | lecture');
  assert.equal(r.skipped, 1);
  assert.equal(parseBusyText('hello'), null);
  assert.deepEqual(parseBusyText('PACED-BUSY\n'), { busy: [], skipped: 0 });
});

test('sync payload has blocks and deadlines in Shortcuts date format', () => {
  const t1 = task({ title: 'Essay', estimateMin: 60, deadline: at('2026-11-06T17:00:00') });
  const plan = buildPlan({ tasks: [t1], projects: [], busy: [], settings, timer: null, now });
  const ev = buildSyncEvents(plan, [t1], [], now);
  assert.deepEqual(ev[0], { t: '▶ Essay', s: '2026-11-04 10:05', e: '2026-11-04 11:05' });
  assert.deepEqual(ev[1], { t: '⚑ Due: Essay', s: '2026-11-06 16:45', e: '2026-11-06 17:00' });
  assert.equal(shortcutDate(at('2026-01-02T03:04:00')), '2026-01-02 03:04');
  const url = shortcutUrl(ev);
  assert.ok(url.startsWith('shortcuts://x-callback-url/run-shortcut?name=Paced%20Sync&input=text&text='));
  assert.deepEqual(JSON.parse(decodeURIComponent(url.split('&text=')[1])).events, ev);
  const withReturn = shortcutUrl(ev, 'https://x.io/paced/');
  assert.ok(withReturn.endsWith('&x-cancel=' + encodeURIComponent('https://x.io/paced/?sync=cancel')));
  assert.ok(!withReturn.includes('x-success'));
});

test('events come back from the shortcut in the URL, "+" offsets intact', () => {
  const busyText = 'PACED-BUSY\n2026-11-05T09:00:00+01:00|2026-11-05T12:00:00+01:00|Lecture & lab';
  // Shortcuts' URL Encode may or may not encode "+": both must work
  const encoded = encodeURIComponent(busyText);
  const loose = encoded.replace(/%2B/g, '+');
  for (const q of [`?sync=done&result=${encoded}`, `?sync=done&result=${loose}`]) {
    const r = parseShortcutReturn(q)!;
    assert.equal(r.status, 'done');
    const parsed = parseBusyText(r.result!)!;
    assert.equal(parsed.busy.length, 1);
    assert.equal(parsed.busy[0].start, Date.UTC(2026, 10, 5, 8, 0));
    assert.equal(parsed.busy[0].title, 'Lecture & lab');
  }
  assert.deepEqual(parseShortcutReturn('?sync=error&errorMessage=Calendar%20access%20denied'), {
    status: 'error',
    result: undefined,
    error: 'Calendar access denied',
  });
  const rawAmp = parseShortcutReturn('?sync=done&result=PACED-BUSY%0A2026-11-05T09:00:00+01:00|2026-11-05T10:00:00+01:00|Q&A session')!;
  assert.equal(parseBusyText(rawAmp.result!)!.busy[0].title, 'Q&A session');
  assert.equal(parseShortcutReturn(''), null);
  assert.equal(parseShortcutReturn('?utm=1'), null);
});

console.log(`${passed} tests passed (incl. bridge)`);
