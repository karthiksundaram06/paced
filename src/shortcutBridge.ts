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
/** Where the shortcut sends you back to, with your events in ?result= */
export const PACED_URL = 'https://karthiksundaram06.github.io/paced/';
// After '#', so the events never go to the server (GitHub rejects long addresses) and stay on the phone.
export const RETURN_PREFIX = `${PACED_URL}#sync=done&result=`;

/** Fingerprint of calendar events, to know whether the written plan was based on the current ones. */
export function busyKey(busy: BusyInterval[]): string {
  let h = 5381;
  const s = busy.map((b) => `${b.start}-${b.end}`).join(',');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export interface ShortcutReturn {
  status: 'done' | 'error' | 'cancel';
  result?: string;
  error?: string;
}

/**
 * Read "?sync=done&result=…" from a URL query string. Decoded by hand: URLSearchParams would turn
 * an unencoded "+" (as in "+01:00") into a space.
 */
export function parseShortcutReturn(search: string): ShortcutReturn | null {
  let q = search.startsWith('?') || search.startsWith('#') ? search.slice(1) : search;
  if (!q) return null;
  const params: Record<string, string> = {};
  // "result" is always last; take everything after it, so an unencoded "&" in an event title can't cut it short.
  const ri = q.startsWith('result=') ? 0 : q.indexOf('&result=') + 1;
  if (ri > 0 || q.startsWith('result=')) {
    const raw = q.slice(ri + 'result='.length);
    try {
      params.result = decodeURIComponent(raw);
    } catch {
      params.result = raw;
    }
    q = q.slice(0, Math.max(0, ri - 1));
  }
  for (const part of q.split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = i < 0 ? part : part.slice(0, i);
    const v = i < 0 ? '' : part.slice(i + 1);
    try {
      params[k] = decodeURIComponent(v);
    } catch {
      params[k] = v;
    }
  }
  const status = params.sync as ShortcutReturn['status'] | undefined;
  if (!status && params.result === undefined) return null;
  return { status: status ?? 'done', result: params.result, error: params.errorMessage };
}

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

/**
 * Run the shortcut with the plan. On success the shortcut itself opens Paced again (its last action),
 * so only error/cancel callbacks are given here.
 */
export function shortcutUrl(events: SyncEvent[], returnBase?: string): string {
  const payload = JSON.stringify({ events });
  const base = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(payload)}`;
  if (!returnBase) return base;
  return `${base}&x-error=${encodeURIComponent(`${returnBase}#sync=error`)}&x-cancel=${encodeURIComponent(`${returnBase}#sync=cancel`)}`;
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

/** All-day events come back from Shortcuts as midnight-to-midnight spans of whole days. */
export function looksAllDay(b: BusyInterval): boolean {
  const s = new Date(b.start);
  const len = b.end - b.start;
  return s.getHours() === 0 && s.getMinutes() === 0 && len >= 23 * 3600_000 && Math.abs(len / 86400_000 - Math.round(len / 86400_000)) < 0.05;
}

/**
 * The same event often sits in Calendar more than once (e.g. a timetable subscribed twice).
 * Keep one per start + end + title.
 */
export function dedupeBusy(list: BusyInterval[]): BusyInterval[] {
  const seen = new Set<string>();
  const out: BusyInterval[] = [];
  for (const b of list) {
    const key = `${b.start}|${b.end}|${(b.title ?? '').trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

export interface ParsedBusy {
  busy: BusyInterval[];
  skipped: number;
  duplicates: number;
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
  const unique = dedupeBusy(busy);
  return { busy: unique, skipped, duplicates: busy.length - unique.length };
}
