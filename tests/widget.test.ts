// Runs the Scriptable widget script against fake Scriptable APIs.
// Run with: TZ=Europe/Amsterdam npx tsx tests/widget.test.ts
import assert from 'node:assert/strict';
import { MIN } from '../src/scheduler';
import { buildSyncEvents } from '../src/shortcutBridge';
import type { Plan, Project, Task } from '../src/types';
import { WIDGET_SCRIPT } from '../src/widgetScript';

type El = { kind: string; text?: string; date?: Date; style?: string; children?: El[]; [k: string]: unknown };

function container(): El & Record<string, unknown> {
  const c: El & Record<string, unknown> = { kind: 'stack', children: [] };
  const add = (e: El) => (c.children!.push(e), e);
  const styled = (e: El) =>
    Object.assign(e, {
      centerAlignText() {},
      leftAlignText() {},
      rightAlignText() {},
      applyTimerStyle() {
        e.style = 'timer';
      },
      applyRelativeStyle() {
        e.style = 'relative';
      },
    });
  c.addText = (text: string) => add(styled({ kind: 'text', text }));
  c.addDate = (date: Date) => add(styled({ kind: 'date', date, style: 'date' }));
  c.addSpacer = () => add({ kind: 'spacer' });
  c.addStack = () => add(Object.assign(container(), { layoutHorizontally() {}, centerAlignContent() {} }));
  return c;
}

class FakeColor {
  constructor(public hex = '') {}
  static dynamic(a: FakeColor) {
    return a;
  }
  static white() {
    return new FakeColor('#fff');
  }
}
const FakeFont = new Proxy({}, { get: (_t, name) => (size?: number) => ({ name, size }) });

interface Ev {
  title: string;
  startDate: Date;
  endDate: Date;
}

async function run(events: Ev[] | null, family: string | undefined, runsInWidget = true) {
  let widget: ReturnType<typeof container> | null = null;
  class FakeListWidget {
    constructor() {
      widget = Object.assign(container(), { presentAccessoryRectangular: async () => {} });
      return widget as unknown as FakeListWidget;
    }
  }
  const Calendar = {
    forEventsByTitle: async (t: string) => {
      if (!events) throw new Error('no calendar ' + t);
      return { title: t };
    },
  };
  const CalendarEvent = {
    between: async (s: Date, e: Date) => events!.filter((x) => x.endDate > s && x.startDate < e),
  };
  let completed = false;
  const Script = {
    setWidget() {},
    complete() {
      completed = true;
    },
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction('Calendar', 'CalendarEvent', 'ListWidget', 'Font', 'Color', 'config', 'Script', WIDGET_SCRIPT);
  await fn(Calendar, CalendarEvent, FakeListWidget, FakeFont, FakeColor, { widgetFamily: family, runsInWidget }, Script);
  assert.ok(completed, 'Script.complete() called');
  return widget! as El & { refreshAfterDate?: Date; url?: string };
}

const flat = (e: El): El[] => [e, ...(e.children ?? []).flatMap(flat)];
const texts = (w: El) => flat(w).filter((e) => e.kind === 'text').map((e) => e.text!);
const dates = (w: El) => flat(w).filter((e) => e.kind === 'date');

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log('✓', name);
  } catch (e) {
    console.error('✗', name);
    throw e;
  }
}

// Build the calendar exactly as Paced writes it.
const now = Date.now();
const H = 60 * MIN;
const task = (id: string, title: string, deadline?: number, done = false): Task => ({
  id,
  title,
  estimateMin: 60,
  loggedSec: 0,
  priority: 2,
  done,
  createdAt: 1,
  deadline,
});
const tasks = [
  task('a', 'Text Mining A2 report', now + 30 * H),
  task('b', 'Thesis outline', now + 5 * 24 * H),
  task('c', 'Old one', now - 2 * H),
];
const projects: Project[] = [{ id: 'p', name: 'Quantum project', color: '#000', createdAt: 1, deadline: now + 10 * 24 * H }];
const plan = {
  blocks: [{ taskId: 'a', start: now + 2 * H, end: now + 3 * H }],
  projects: { p: { status: 'ok' } },
  tasks: {},
} as unknown as Plan;
const toDate = (s: string) => {
  const [d, t] = s.split(' ');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(y, mo - 1, da, h, mi);
};
const written: Ev[] = buildSyncEvents(plan, tasks, projects, now).map((e) => ({ title: e.t, startDate: toDate(e.s), endDate: toDate(e.e) }));

(async () => {
  await test('Lock Screen: shows the nearest deadline with a live ticking timer', async () => {
    const w = await run([...written, ...written], 'accessoryRectangular'); // written twice: counted once
    const t = texts(w);
    assert.equal(t[0], '⚑ Text Mining A2 report');
    assert.match(t[1], /\+2 more$/);
    const d = dates(w);
    assert.equal(d.length, 1);
    assert.equal(d[0].style, 'timer'); // 30 h away
    assert.ok(w.refreshAfterDate!.getTime() <= Date.now() + 15 * 60_000 + 1000);
    assert.equal(w.url, 'shortcuts://run-shortcut?name=Paced%20Sync');
  });

  await test('far deadlines count down in days instead of a huge timer', async () => {
    const w = await run(written.filter((e) => !e.title.includes('Text Mining')), 'accessoryRectangular');
    assert.equal(texts(w)[0], '⚑ Thesis outline');
    assert.equal(dates(w)[0].style, 'relative');
  });

  await test('project deadlines are included', async () => {
    const w = await run(written.filter((e) => e.title.includes('Project')), 'accessoryRectangular');
    assert.equal(texts(w)[0], '⚑ Quantum project');
    assert.match(texts(w)[1], /^Project · /);
  });

  await test('work blocks and passed deadlines are ignored', async () => {
    assert.ok(written.some((e) => e.title.startsWith('▶')));
    const w = await run(written.filter((e) => e.title.startsWith('▶')), 'accessoryRectangular');
    assert.equal(texts(w)[0], '⚑ No deadlines ahead');
  });

  await test('no Paced calendar: says so', async () => {
    const w = await run(null, 'accessoryRectangular');
    assert.equal(texts(w)[0], '⚑ No "Paced" calendar');
  });

  await test('every widget size renders', async () => {
    for (const fam of ['accessoryInline', 'accessoryCircular', 'small', 'medium', 'large', 'extraLarge', undefined]) {
      const w = await run(written, fam, fam !== undefined);
      assert.ok(texts(w).length > 0, String(fam));
    }
    const inline = await run(written, 'accessoryInline');
    assert.match(texts(inline)[0], /^⚑ Text Mining A2 report · (Today|Tomorrow|\w{3}) \d\d:\d\d$/);
    const medium = await run(written, 'medium');
    assert.equal(dates(medium).length, 3);
    const circ = await run(written.filter((e) => !e.title.includes('Text Mining')), 'accessoryCircular');
    assert.ok(texts(circ).includes('5d') || texts(circ).includes('4d'));
  });

  console.log(`${passed} widget tests passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
