/**
 * Backup + sync through iCloud Drive.
 *
 * Paced lives in Safari, and Safari's data goes when you clear history. So every time Paced hands
 * a plan to the "Paced Sync" shortcut it also hands over a snapshot of your tasks; the shortcut saves
 * it to iCloud Drive (Shortcuts/paced-backup.txt) and sends the saved file back on every run.
 * Each device merges what it receives: per task, the newest change wins; deleted-for-good tasks
 * leave a tombstone so another device can't bring them back.
 */
import type { Project, Settings, Task } from './types';

export const DATA_PREFIX = 'PACED-DATA:';
export const BACKUP_FILE = 'paced-backup.txt';
const TOMBSTONE_DAYS = 90;

/** Per-device settings that never travel between devices. */
const LOCAL_SETTINGS: (keyof Settings)[] = ['shortcutReady', 'appCalendarId', 'autoWrite', 'busyCalendarIds'];

export interface Snapshot {
  v: 1;
  at: number; // when this snapshot was made
  tasks: Task[];
  projects: Project[];
  settings: Partial<Settings>;
  settingsAt?: number;
  tombstones: Record<string, number>; // id → when it was deleted for good
}

export interface SyncedData {
  tasks: Task[];
  projects: Project[];
  settings: Settings;
  settingsAt?: number;
  tombstones: Record<string, number>;
}

export function syncedSettings(s: Settings): Partial<Settings> {
  const out: Partial<Settings> = { ...s };
  for (const k of LOCAL_SETTINGS) delete out[k];
  return out;
}

export function makeSnapshot(d: SyncedData, now: number): Snapshot {
  return {
    v: 1,
    at: now,
    tasks: d.tasks,
    projects: d.projects,
    settings: syncedSettings(d.settings),
    settingsAt: d.settingsAt,
    tombstones: pruneTombstones(d.tombstones, now),
  };
}

/* ---------- text encoding (one line, safe in URLs and the shortcut's text) ---------- */

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSnapshot(s: Snapshot): string {
  return DATA_PREFIX + toBase64(JSON.stringify(s));
}

/** Finds the PACED-DATA line in whatever the shortcut sent back. */
export function decodeSnapshot(text: string): Snapshot | null {
  const line = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith(DATA_PREFIX));
  if (!line) return null;
  try {
    const s = JSON.parse(fromBase64(line.slice(DATA_PREFIX.length).replace(/\s/g, ''))) as Snapshot;
    if (s?.v !== 1 || !Array.isArray(s.tasks) || !Array.isArray(s.projects)) return null;
    return { ...s, tombstones: s.tombstones ?? {}, settings: s.settings ?? {} };
  } catch {
    return null;
  }
}

/* ---------- change stamps ---------- */

type Stamped = { id: string; createdAt: number; updatedAt?: number };
const stampOf = (x: Stamped) => x.updatedAt ?? x.createdAt ?? 0;

/** Marks every item that a local edit replaced (a new object) with the time of the edit. */
export function stampChanges<T extends Stamped>(prev: T[], next: T[], now: number): T[] {
  const before = new Map(prev.map((x) => [x.id, x]));
  return next.map((x) => (before.get(x.id) === x ? x : { ...x, updatedAt: now }));
}

export function pruneTombstones(t: Record<string, number>, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(t)) if (now - at < TOMBSTONE_DAYS * 24 * 3600_000) out[id] = at;
  return out;
}

function mergeList<T extends Stamped>(local: T[], remote: T[], tombstones: Record<string, number>): { list: T[]; changed: boolean } {
  const byId = new Map(local.map((x) => [x.id, x]));
  let changed = false;
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l || stampOf(r) > stampOf(l)) {
      byId.set(r.id, r);
      changed = true;
    }
  }
  const list: T[] = [];
  for (const x of byId.values()) {
    const gone = tombstones[x.id];
    if (gone !== undefined && gone >= stampOf(x)) {
      if (local.some((l) => l.id === x.id)) changed = true;
      continue;
    }
    list.push(x);
  }
  // Keep the local order, new ones at the end.
  const order = new Map(local.map((x, i) => [x.id, i]));
  list.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  return { list, changed };
}

/** Folds a snapshot from iCloud Drive into this device's data. */
export function mergeSnapshot(local: SyncedData, remote: Snapshot): SyncedData & { changed: boolean } {
  const tombstones = { ...local.tombstones };
  for (const [id, at] of Object.entries(remote.tombstones)) tombstones[id] = Math.max(at, tombstones[id] ?? 0);
  const t = mergeList(local.tasks, remote.tasks, tombstones);
  const p = mergeList(local.projects, remote.projects, tombstones);
  let settings = local.settings;
  let settingsAt = local.settingsAt;
  let settingsChanged = false;
  if ((remote.settingsAt ?? 0) > (local.settingsAt ?? 0)) {
    const keep: Partial<Settings> = {};
    for (const k of LOCAL_SETTINGS) (keep as Record<string, unknown>)[k] = local.settings[k];
    settings = { ...local.settings, ...remote.settings, ...keep };
    settingsAt = remote.settingsAt;
    settingsChanged = true;
  }
  return { tasks: t.list, projects: p.list, settings, settingsAt, tombstones, changed: t.changed || p.changed || settingsChanged };
}

/* ---------- one-time rescue from the "Paced" calendar ---------- */

export interface CalendarDeadline {
  title: string;
  deadline: number;
  project: boolean;
}

/** Turns the "⚑ Due: …" events Paced wrote into tasks (estimates unknown: 1 h each, edit later). */
export function tasksFromDeadlines(list: CalendarDeadline[], now: number, newId: () => string): { tasks: Task[]; projects: Project[] } {
  const seen = new Set<string>();
  const tasks: Task[] = [];
  const projects: Project[] = [];
  for (const d of [...list].sort((a, b) => a.deadline - b.deadline)) {
    const key = `${d.project}|${d.title.toLowerCase()}|${d.deadline}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (d.project) {
      projects.push({ id: newId(), name: d.title, color: '#6366f1', deadline: d.deadline, createdAt: now, updatedAt: now });
    } else {
      tasks.push({ id: newId(), title: d.title, estimateMin: 60, loggedSec: 0, priority: 2, done: false, deadline: d.deadline, createdAt: now, updatedAt: now });
    }
  }
  return { tasks, projects };
}
