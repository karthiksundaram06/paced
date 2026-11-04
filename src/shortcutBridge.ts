/**
 * Calendar connection for the web version.
 *
 * Safari can't touch the iPhone Calendar, but the Shortcuts app can. So:
 *  1. Paced opens  shortcuts://run-shortcut?name=Paced%20Sync&input=text&text=<plan JSON>
 *  2. The "Paced Sync" shortcut replaces future events in the "Paced" calendar with the plan,
 *     then reads your events for the next weeks and copies them to the clipboard as
 *        PACED-BUSY
 *        2026-11-04T13:15:00+01:00|2026-11-04T15:00:00+01:00|Lecture
 *  3. Back in Paced you tap "Paste calendar" and the plan re-flows around those events.
 */
import { MIN } from './scheduler';
import type { BusyInterval, Plan, Project, Task } from './types';

export const SHORTCUT_NAME = 'Paced Sync';
export const BUSY_HEADER = 'PACED-BUSY';
export const SYNC_DAYS = 14;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local time as "2026-11-04 18:00", which Shortcuts reads reliably as a date. */
export function shortcutDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface SyncEvent {
  t: string;
  s: string;
  e: string;
}

export function buildSyncEvents(plan: Plan, tasks: Task[], projects: Project[], now: number): SyncEvent[] {
  const until = now + SYNC_DAYS * 24 * 60 * MIN;
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const events: SyncEvent[] = [];
  for (const b of plan.blocks) {
    if (b.start > until) break;
    const t = taskById.get(b.taskId);
    if (t) events.push({ t: `▶ ${t.title}`, s: shortcutDate(b.start), e: shortcutDate(b.end) });
  }
  for (const t of tasks) {
    if (!t.done && t.deadline && t.deadline > now) {
      events.push({ t: `⚑ Due: ${t.title}`, s: shortcutDate(t.deadline - 15 * MIN), e: shortcutDate(t.deadline) });
    }
  }
  for (const p of projects) {
    if (p.deadline && p.deadline > now && plan.projects[p.id]?.status !== 'done') {
      events.push({ t: `⚑ Project due: ${p.name}`, s: shortcutDate(p.deadline - 15 * MIN), e: shortcutDate(p.deadline) });
    }
  }
  return events;
}

export function shortcutUrl(events: SyncEvent[]): string {
  const payload = JSON.stringify({ events });
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(payload)}`;
}

/** Strict ISO-8601 parser: Safari's Date.parse rejects some variants Shortcuts can produce (e.g. "+0100"). */
export function parseIsoDate(s: string): number | null {
  const m = s
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!m) {
    const fallback = Date.parse(s);
    return Number.isNaN(fallback) ? null : fallback;
  }
  const [, y, mo, d, h, mi, se, tz] = m;
  if (!tz) return new Date(+y, +mo - 1, +d, +h, +mi, +(se ?? 0)).getTime();
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se ?? 0));
  if (tz.toUpperCase() === 'Z') return utc;
  const sign = tz[0] === '-' ? -1 : 1;
  const digits = tz.slice(1).replace(':', '');
  const offsetMin = sign * (+digits.slice(0, 2) * 60 + +digits.slice(2, 4));
  return utc - offsetMin * MIN;
}

export interface ParsedBusy {
  busy: BusyInterval[];
  skipped: number;
}

/** Returns null when the text isn't from the Paced Sync shortcut at all. */
export function parseBusyText(text: string): ParsedBusy | null {
  const lines = text.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => l.trim() === BUSY_HEADER);
  if (start < 0) return null;
  const busy: BusyInterval[] = [];
  let skipped = 0;
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (!line) continue;
    const [s, e, ...rest] = line.split('|');
    const a = s ? parseIsoDate(s) : null;
    const b = e ? parseIsoDate(e) : null;
    if (a === null || b === null || b <= a) {
      skipped++;
      continue;
    }
    const title = rest.join('|').trim() || 'Busy';
    if (/^(▶|⚑)\s/.test(title)) continue; // Paced's own events, in case the shortcut didn't filter them out
    busy.push({ start: a, end: b, title });
  }
  busy.sort((x, y) => x.start - y.start);
  return { busy, skipped };
}
