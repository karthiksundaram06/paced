// Uses the legacy expo-calendar API on purpose: the newer object API is not available inside Expo Go.
import * as Cal from 'expo-calendar/legacy';
import { Platform } from 'react-native';
import { MIN } from './scheduler';
import type { BusyInterval, Plan, Project, Settings, Task } from './types';

export const APP_CALENDAR_TITLE = 'Paced';
const APP_CALENDAR_COLOR = '#4F46E5';

export interface CalendarInfo {
  id: string;
  title: string;
  color: string;
  sourceName: string;
  isApp: boolean;
}

export async function getPermission(): Promise<boolean> {
  const p = await Cal.getCalendarPermissionsAsync();
  return p.granted;
}

export async function requestPermission(): Promise<boolean> {
  const p = await Cal.requestCalendarPermissionsAsync();
  return p.granted;
}

export async function listCalendars(appCalendarId?: string): Promise<CalendarInfo[]> {
  const cals = await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT);
  return cals
    .map((c) => ({
      id: c.id,
      title: c.title,
      color: c.color,
      sourceName: c.source?.name ?? '',
      isApp: c.id === appCalendarId || (c.title === APP_CALENDAR_TITLE && c.allowsModifications),
    }))
    .sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.title.localeCompare(b.title));
}

/** Find or create the dedicated "Paced" calendar that holds work blocks and deadlines. */
export async function ensureAppCalendar(knownId?: string): Promise<string> {
  const cals = await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT);
  const existing =
    cals.find((c) => c.id === knownId) ?? cals.find((c) => c.title === APP_CALENDAR_TITLE && c.allowsModifications);
  if (existing) return existing.id;

  const base = {
    title: APP_CALENDAR_TITLE,
    name: APP_CALENDAR_TITLE,
    color: APP_CALENDAR_COLOR,
    entityType: Cal.EntityTypes.EVENT,
    ownerAccount: 'personal',
    accessLevel: Cal.CalendarAccessLevel.OWNER,
  };

  if (Platform.OS !== 'ios') {
    return Cal.createCalendarAsync({ ...base, source: { isLocalAccount: true, name: 'Paced', type: 'LOCAL' } });
  }

  // Prefer the account your default calendar lives in (usually iCloud, so it syncs to your Mac/iPad too).
  const candidates: Cal.Source[] = [];
  try {
    const def = await Cal.getDefaultCalendarAsync();
    if (def?.source) candidates.push(def.source);
  } catch {
    // no default calendar
  }
  try {
    const sources = await Cal.getSourcesAsync();
    const icloud = sources.find((s) => /icloud/i.test(s.name));
    const local = sources.find((s) => s.type === Cal.SourceType.LOCAL);
    if (icloud) candidates.push(icloud);
    if (local) candidates.push(local);
  } catch {
    // ignore
  }

  let lastError: unknown;
  for (const source of candidates) {
    try {
      return await Cal.createCalendarAsync({ ...base, sourceId: source.id, source });
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('No calendar account found that allows new calendars.');
}

function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

const toMs = (d: string | Date) => (typeof d === 'string' ? new Date(d).getTime() : d.getTime());

/** Events that make you busy, from every selected calendar except Paced's own. */
export async function fetchBusy(settings: Settings, from: number, to: number): Promise<BusyInterval[]> {
  const cals = await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT);
  const appId = settings.appCalendarId;
  const ids = cals
    .filter((c) => c.id !== appId && !(c.title === APP_CALENDAR_TITLE && c.allowsModifications))
    .filter((c) => (settings.busyCalendarIds ? settings.busyCalendarIds.includes(c.id) : true))
    .map((c) => c.id);
  if (!ids.length) return [];
  const colorById = new Map(cals.map((c) => [c.id, c.color]));
  const events = await Cal.getEventsAsync(ids, new Date(from), new Date(to));
  return events
    .filter((e) => !(settings.ignoreAllDay && e.allDay))
    .filter((e) => e.availability !== Cal.Availability.FREE && e.status !== Cal.EventStatus.CANCELED)
    .map((e) => ({
      start: toMs(e.startDate),
      end: toMs(e.endDate),
      title: e.title,
      calendarColor: colorById.get(e.calendarId),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
}

export interface SyncResult {
  calendarId: string;
  written: number;
  removed: number;
}

/**
 * Replace everything in the Paced calendar from now on with the current plan:
 * one event per work block and one per upcoming deadline.
 * Past blocks are left alone, so your calendar keeps a history of what you planned.
 */
export async function syncPlanToCalendar(
  plan: Plan,
  tasks: Task[],
  projects: Project[],
  settings: Settings,
  now: number
): Promise<SyncResult> {
  const calendarId = await ensureAppCalendar(settings.appCalendarId);
  const windowEnd = now + Math.min(settings.horizonDays, 21) * 24 * 60 * MIN;

  // Wide window so far-off deadline events are replaced too, not duplicated.
  const existing = await Cal.getEventsAsync([calendarId], new Date(now - 24 * 60 * MIN), new Date(now + 400 * 24 * 60 * MIN));
  const timeZone = deviceTimeZone();
  let removed = 0;
  for (const e of existing) {
    if (toMs(e.endDate) > now) {
      try {
        await Cal.deleteEventAsync(e.id);
        removed++;
      } catch {
        // already gone
      }
    }
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  let written = 0;

  for (const b of plan.blocks) {
    if (b.start > windowEnd) break;
    const t = taskById.get(b.taskId);
    if (!t) continue;
    const tp = plan.tasks[t.id];
    const project = projectById.get(t.projectId ?? '');
    const lines = [
      project ? `Project: ${project.name}` : null,
      `Block: ${Math.round((b.end - b.start) / MIN)} min of ${Math.round(tp?.remainingMin ?? 0)} min left`,
      tp?.deadline ? `Due: ${new Date(tp.deadline).toLocaleString()}` : null,
      'Planned by Paced. It reshuffles when your calendar changes.',
    ].filter(Boolean);
    await Cal.createEventAsync(calendarId, {
      title: `▶ ${t.title}`,
      timeZone,
      startDate: new Date(b.start),
      endDate: new Date(b.end),
      notes: lines.join('\n'),
      alarms: settings.alertMin > 0 ? [{ relativeOffset: -settings.alertMin }] : [],
      availability: Cal.Availability.BUSY,
    });
    written++;
  }

  // Deadlines: task deadlines and project deadlines that are still ahead.
  const deadlines: { title: string; at: number; note: string }[] = [];
  for (const t of tasks) {
    if (t.done || !t.deadline || t.deadline <= now) continue;
    deadlines.push({ title: `⚑ Due: ${t.title}`, at: t.deadline, note: projectById.get(t.projectId ?? '')?.name ?? '' });
  }
  for (const p of projects) {
    const pp = plan.projects[p.id];
    if (!p.deadline || p.deadline <= now || pp?.status === 'done') continue;
    deadlines.push({ title: `⚑ Project due: ${p.name}`, at: p.deadline, note: `${pp?.openTasks ?? 0} open tasks` });
  }
  for (const d of deadlines) {
    await Cal.createEventAsync(calendarId, {
      title: d.title,
      timeZone,
      startDate: new Date(d.at - 15 * MIN),
      endDate: new Date(d.at),
      notes: d.note,
      alarms: [{ relativeOffset: -24 * 60 }, { relativeOffset: -120 }],
      availability: Cal.Availability.FREE,
    });
    written++;
  }

  return { calendarId, written, removed };
}

/** Remove the Paced calendar entirely (Settings → "Remove Paced calendar"). */
export async function removeAppCalendar(settings: Settings): Promise<void> {
  const cals = await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT);
  for (const c of cals) {
    if (c.id === settings.appCalendarId || (c.title === APP_CALENDAR_TITLE && c.allowsModifications)) {
      await Cal.deleteCalendarAsync(c.id);
    }
  }
}
