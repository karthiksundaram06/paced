import { decodeSnapshot, encodeSnapshot, makeSnapshot, mergeSnapshot, stampChanges, tasksFromDeadlines, type CalendarDeadline } from './backup';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as CalendarApi from './calendar';
import { buildPlan, loggedSecNow, planSignature } from './scheduler';
import { busyKey, buildSyncEvents, dedupeBusy, looksAllDay, parseBusyText, parseShortcutReturn, shortcutUrl } from './shortcutBridge';
import {
  DEFAULT_SETTINGS,
  type BusyInterval,
  type Plan,
  type Project,
  type RunningTimer,
  type Settings,
  type SyncState,
  type Task,
} from './types';

const STORAGE_KEY = 'paced:v1';
export const IS_WEB = Platform.OS === 'web';

type Permission = 'unknown' | 'granted' | 'denied';

interface Persisted {
  tasks: Task[];
  projects: Project[];
  settings: Settings;
  timer: RunningTimer | null;
  sync: SyncState;
  busy?: BusyInterval[];
  busyUpdatedAt?: number;
  dataChangedAt?: number;
  paused?: string | null;
  tombstones?: Record<string, number>;
  settingsAt?: number;
}

export interface Store {
  loaded: boolean;
  now: number;
  tasks: Task[];
  /** Deleted tasks, newest first; restorable for 30 days. */
  deletedTasks: Task[];
  projects: Project[];
  settings: Settings;
  timer: RunningTimer | null;
  /** Task whose timer was paused; Today keeps showing it with a Resume button. */
  paused: string | null;
  busy: BusyInterval[];
  plan: Plan;
  permission: Permission;
  sync: SyncState;
  syncing: boolean;
  refreshing: boolean;
  busyUpdatedAt?: number;
  /** Tasks or settings changed after the calendar was last updated. */
  calendarStale: boolean;
  /** Web: short message about the last calendar sync. */
  notice: { ok: boolean; text: string } | null;
  /** Web: tell the store a task/project editor is open, so auto-sync never interrupts typing. */
  setUiBusy: (busy: boolean) => void;

  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'loggedSec' | 'done'>) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  restoreTask: (id: string) => void;
  purgeTask: (id: string) => void;
  emptyDeleted: () => void;
  setDone: (id: string, done: boolean) => void;
  addLogged: (id: string, deltaMin: number) => void;

  addProject: (p: Omit<Project, 'id' | 'createdAt'>) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string, deleteTasks: boolean) => void;

  startTimer: (taskId: string) => void;
  stopTimer: () => void;
  dismissPaused: () => void;

  updateSettings: (patch: Partial<Settings>) => void;
  connectCalendar: () => Promise<boolean>;
  refreshBusy: () => Promise<void>;
  syncNow: () => Promise<void>;
  removeCalendar: () => Promise<void>;
  resetAll: () => Promise<void>;
  /** Paced is empty but the Paced calendar still has deadlines: offer to bring them back. */
  restorable: CalendarDeadline[] | null;
  restoreFromCalendar: () => void;
  dismissRestore: () => void;

  /** Web: load events copied by the Paced Sync shortcut. Returns a message for the user. */
  importBusyText: (text: string) => { ok: boolean; message: string };
  pasteCalendar: () => Promise<{ ok: boolean; message: string }>;
  exportData: () => string;
  importData: (json: string) => { ok: boolean; message: string };
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [allTasks, setTasks] = useState<Task[]>([]);
  const tasks = useMemo(() => allTasks.filter((x) => !x.deletedAt), [allTasks]);
  const deletedTasks = useMemo(
    () => allTasks.filter((x) => x.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [allTasks]
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [paused, setPaused] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({});
  const [busy, setBusy] = useState<BusyInterval[]>([]);
  const [nativePermission, setPermission] = useState<Permission>('unknown');
  const [busyUpdatedAt, setBusyUpdatedAt] = useState<number | undefined>();
  const [dataChangedAt, setDataChangedAt] = useState<number | undefined>();
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [tombstones, setTombstones] = useState<Record<string, number>>({});
  const [settingsAt, setSettingsAt] = useState<number | undefined>();
  const [restorable, setRestorable] = useState<CalendarDeadline[] | null>(null);
  // Local edits go through these, so each changed task/project carries the time of its last change.
  const setTasksS = (fn: (xs: Task[]) => Task[]) => setTasks((prev) => stampChanges(prev, fn(prev), Date.now()));
  const setProjectsS = (fn: (xs: Project[]) => Project[]) => setProjects((prev) => stampChanges(prev, fn(prev), Date.now()));
  const bury = (ids: string[]) => {
    if (!ids.length) return;
    const at = Date.now();
    setTombstones((t) => ({ ...t, ...Object.fromEntries(ids.map((id) => [id, at])) }));
  };
  const bump = () => {
    setSyncTrigger((n) => n + 1);
    setDataChangedAt(Date.now());
  };
  // On the web, "connected" means the shortcut has delivered your events at least once.
  const permission: Permission = IS_WEB ? (settings.shortcutReady ? 'granted' : 'unknown') : nativePermission;

  /* ---- load & save ---- */
  const lastSavedRef = useRef<string | null>(null);
  const hydrate = useCallback((raw: string) => {
    const data = JSON.parse(raw) as Partial<Persisted>;
    lastSavedRef.current = raw;
    // Deleted tasks are kept for 30 days.
    setTasks((data.tasks ?? []).filter((x) => !x.deletedAt || Date.now() - x.deletedAt < 30 * 24 * 3600_000));
    setProjects(data.projects ?? []);
    setSettings({ ...DEFAULT_SETTINGS, ...(data.settings ?? {}) });
    setTimer(data.timer ?? null);
    setSync(data.sync ?? {});
    setBusy(dedupeBusy(data.busy ?? []));
    setBusyUpdatedAt(data.busyUpdatedAt);
    setDataChangedAt(data.dataChangedAt);
    setPaused(data.paused ?? null);
    setTombstones(data.tombstones ?? {});
    setSettingsAt(data.settingsAt);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          try {
            hydrate(raw);
          } catch {
            // Unreadable: keep a copy instead of overwriting it with an empty Paced.
            await AsyncStorage.setItem(`${STORAGE_KEY}:unreadable-${Date.now()}`, raw).catch(() => {});
          }
        }
      } catch {
        // storage unavailable: start fresh
      }
      if (!IS_WEB) {
        try {
          setPermission((await CalendarApi.getPermission()) ? 'granted' : 'unknown');
        } catch {
          setPermission('unknown');
        }
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const h = setTimeout(() => {
      const data: Persisted = { tasks: allTasks, projects, settings, timer, sync, busy, busyUpdatedAt, dataChangedAt, paused, tombstones, settingsAt };
      const json = JSON.stringify(data);
      if (json === lastSavedRef.current) return;
      lastSavedRef.current = json;
      AsyncStorage.setItem(STORAGE_KEY, json).catch(() => {});
    }, 300);
    return () => clearTimeout(h);
  }, [loaded, allTasks, projects, settings, timer, sync, busy, busyUpdatedAt, dataChangedAt, paused, tombstones, settingsAt]);

  /* ---- clock ---- */
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), timer ? 1000 : 30_000);
    return () => clearInterval(h);
  }, [timer]);

  /* ---- plan (recomputed at most once a minute, or when data changes) ---- */
  const nowMinute = Math.floor(now / 60_000) * 60_000;
  const plan = useMemo(
    () => buildPlan({ tasks, projects, busy, settings, timer, now: nowMinute }),
    [tasks, projects, busy, settings, timer, nowMinute]
  );

  /* ---- latest-state refs for async work ---- */
  const ref = useRef({ tasks, allTasks, projects, settings, plan, permission, sync, timer, busy, dataChangedAt, tombstones, settingsAt });
  ref.current = { tasks, allTasks, projects, settings, plan, permission, sync, timer, busy, dataChangedAt, tombstones, settingsAt };
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [uiBusy, setUiBusy] = useState(false);
  const uiBusyRef = useRef(false);
  uiBusyRef.current = uiBusy;
  // Messages fade after a few seconds.
  useEffect(() => {
    if (!notice || notice.text.startsWith('Updating')) return;
    const h = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(h);
  }, [notice]);

  /* ---- calendar ---- */
  const busyKeyRef = useRef('');
  const refreshBusy = useCallback(async () => {
    if (IS_WEB || ref.current.permission !== 'granted') return;
    setRefreshing(true);
    try {
      const s = ref.current.settings;
      const from = Date.now() - 24 * 3600_000;
      const to = Date.now() + (s.horizonDays + 1) * 24 * 3600_000;
      const fresh = await CalendarApi.fetchBusy(s, from, to);
      const key = fresh.map((b) => `${b.start}-${b.end}`).join(',');
      const changed = key !== busyKeyRef.current;
      busyKeyRef.current = key;
      setBusy(fresh);
      setBusyUpdatedAt(Date.now());
      setNow(Date.now());
      // Re-plan the calendar when your events changed, or the written plan is over 30 minutes old.
      const stale = !ref.current.sync.lastSyncAt || Date.now() - ref.current.sync.lastSyncAt > 30 * 60_000;
      if (changed || stale) bump();
    } catch (e) {
      setSync((x) => ({ ...x, lastError: `Couldn't read calendar: ${String(e)}` }));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const syncingRef = useRef(false);
  const doSync = useCallback(async (force: boolean) => {
    const { settings: s, permission: perm, plan: p, tasks: ts, projects: ps, sync: sy } = ref.current;
    if (IS_WEB || perm !== 'granted' || !s.writeToCalendar || syncingRef.current) return;
    const sig = planSignature(p, ts) + ':' + s.alertMin + ':' + s.calendarBlocks;
    if (!force && sig === sy.lastSyncHash) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const res = await CalendarApi.syncPlanToCalendar(p, ts, ps, s, Date.now());
      if (res.calendarId !== s.appCalendarId) setSettings((x) => ({ ...x, appCalendarId: res.calendarId }));
      setSync({ lastSyncAt: Date.now(), lastSyncHash: sig, lastWritten: res.written });
    } catch (e) {
      setSync((x) => ({ ...x, lastError: `Couldn't update calendar: ${String(e)}` }));
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  /** Web: hand the plan to the Paced Sync shortcut; it writes the calendar and opens Paced again with your events. */
  const startShortcutSync = useCallback((auto: boolean) => {
    const { plan: p, tasks: ts, allTasks: all, projects: ps, busy: b, settings: st, sync: sy, tombstones: tb, settingsAt: sa } = ref.current;
    const t = Date.now();
    const events = buildSyncEvents(p, ts, ps, t, st.calendarBlocks);
    // A device with nothing in it that has never written (a new iPad, or Safari just cleared) only reads:
    // writing would clear the shared "Paced" calendar and replace the iCloud Drive backup with an empty one.
    const readOnly = events.length === 0 && all.length === 0 && ps.length === 0 && !(sy.lastWritten && sy.lastWritten > 0);
    const data = encodeSnapshot(makeSnapshot({ tasks: all, projects: ps, settings: st, settingsAt: sa, tombstones: tb }, t));
    setSync((x) => ({
      ...x,
      lastSyncAt: t,
      lastWritten: readOnly ? x.lastWritten : events.length,
      pendingPaste: true,
      lastError: undefined,
      writtenBusyKey: busyKey(b),
      lastAutoAt: t, // any hand-off (auto or manual) counts for the loop guard
    }));
    // Give storage a moment to save before iOS switches to the Shortcuts app.
    setTimeout(() => {
      window.location.href = shortcutUrl(readOnly ? null : events, `${window.location.origin}${window.location.pathname}`, data);
    }, 400);
  }, []);

  const syncNow = useCallback(async () => {
    if (IS_WEB) {
      startShortcutSync(false);
      return;
    }
    await refreshBusy();
    await new Promise((r) => setTimeout(r, 50)); // let the new plan render
    await doSync(true);
  }, [refreshBusy, doSync]);

  // Auto-sync a few seconds after anything changes.
  useEffect(() => {
    if (!loaded || syncTrigger === 0) return;
    const h = setTimeout(() => doSync(false), 3000);
    return () => clearTimeout(h);
  }, [syncTrigger, loaded, doSync]);

  // Read the calendar when the app opens, comes back to the foreground, and every 5 minutes.
  useEffect(() => {
    if (!loaded || permission !== 'granted') return;
    refreshBusy();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refreshBusy();
    });
    const h = setInterval(refreshBusy, 5 * 60_000);
    return () => {
      sub.remove();
      clearInterval(h);
    };
  }, [loaded, permission, refreshBusy]);

  const connectCalendar = useCallback(async () => {
    try {
      const ok = await CalendarApi.requestPermission();
      setPermission(ok ? 'granted' : 'denied');
      ref.current.permission = ok ? 'granted' : 'denied';
      if (!ok) return false;
      const id = await CalendarApi.ensureAppCalendar(ref.current.settings.appCalendarId);
      setSettings((x) => ({ ...x, appCalendarId: id }));
      ref.current.settings = { ...ref.current.settings, appCalendarId: id };
      await refreshBusy();
      return true;
    } catch (e) {
      setSync((x) => ({ ...x, lastError: String(e) }));
      return false;
    }
  }, [refreshBusy]);

  /** Folds the iCloud Drive backup into this device. Returns how many tasks it brought in. */
  const applyBackup = (text: string): { found: boolean; tasks: number; projects: number; added: number } => {
    const snap = decodeSnapshot(text);
    if (!snap) return { found: false, tasks: ref.current.tasks.length, projects: ref.current.projects.length, added: 0 };
    const cur = ref.current;
    const m = mergeSnapshot({ tasks: cur.allTasks, projects: cur.projects, settings: cur.settings, settingsAt: cur.settingsAt, tombstones: cur.tombstones }, snap);
    const before = new Set(cur.allTasks.map((x) => x.id));
    if (m.changed) {
      setTasks(m.tasks);
      setProjects(m.projects);
      setSettings(m.settings);
      setSettingsAt(m.settingsAt);
    }
    setTombstones(m.tombstones);
    setSync((x) => ({ ...x, backupAt: Math.max(x.backupAt ?? 0, snap.at), backupReadAt: Date.now() }));
    const live = m.tasks.filter((x) => !x.deletedAt);
    return { found: true, tasks: live.length, projects: m.projects.length, added: live.filter((x) => !before.has(x.id)).length };
  };

  const restoreFromCalendar = () => {
    const list = restorable;
    if (!list?.length) return;
    const r = tasksFromDeadlines(list, Date.now(), newId);
    setTasksS((xs) => [...xs, ...r.tasks]);
    setProjectsS((xs) => [...xs, ...r.projects]);
    setRestorable(null);
    bump();
    const n = r.tasks.length + r.projects.length;
    setNotice({ ok: true, text: `Brought back ${n} from your Paced calendar. Check their time estimates (set to 1 h).` });
  };

  const importBusyText: Store['importBusyText'] = (text) => {
    const backup = applyBackup(text);
    const parsed = parseBusyText(text);
    if (!parsed) {
      return { ok: false, message: "That isn't from the Paced Sync shortcut. Run Sync with Calendar first, then paste." };
    }
    if (parsed.busy.length === 0 && parsed.skipped > 0) {
      return {
        ok: false,
        message: `Couldn't read the ${parsed.skipped} event dates. In the shortcut's Text action, set Start Date and End Date to the ISO 8601 format with time included.`,
      };
    }
    const kept = ref.current.settings.ignoreAllDay ? parsed.busy.filter((b) => !looksAllDay(b)) : parsed.busy;
    const allDay = parsed.busy.length - kept.length;
    parsed.busy = kept;
    setBusy(kept);
    setBusyUpdatedAt(Date.now());
    setSettings((x) => ({ ...x, shortcutReady: true }));
    setRestorable(backup.tasks === 0 && backup.projects === 0 && parsed.deadlines.length > 0 ? parsed.deadlines : null);
    setSync((x) => ({ ...x, pendingPaste: false, lastError: undefined }));
    setNow(Date.now());
    const extra =
      (parsed.skipped ? ` (${parsed.skipped} skipped: unreadable dates)` : '') +
      (allDay ? ` · ${allDay} all-day ignored` : '') +
      (parsed.duplicates ? ` · ${parsed.duplicates} duplicates merged` : '') +
      (backup.added ? ` · ${backup.added} task${backup.added === 1 ? '' : 's'} from iCloud Drive` : '');
    return { ok: true, message: `Loaded ${parsed.busy.length} calendar event${parsed.busy.length === 1 ? '' : 's'}${extra}.` };
  };

  const pasteCalendar: Store['pasteCalendar'] = async () => {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (!nav?.clipboard?.readText) throw new Error('no clipboard');
      const text = await nav.clipboard.readText();
      return importBusyText(text);
    } catch {
      return { ok: false, message: 'Paced could not read the clipboard. Long-press the box below, choose Paste, then tap Load.' };
    }
  };

  const exportData: Store['exportData'] = () =>
    JSON.stringify({ app: 'paced', version: 1, exportedAt: Date.now(), tasks, projects, settings }, null, 2);

  const importData: Store['importData'] = (json) => {
    try {
      const data = JSON.parse(json);
      if (data?.app !== 'paced' || !Array.isArray(data.tasks)) return { ok: false, message: "That file isn't a Paced backup." };
      setTasksS(() => data.tasks);
      setProjectsS(() => (Array.isArray(data.projects) ? data.projects : []));
      setSettings((x) => ({ ...DEFAULT_SETTINGS, ...data.settings, shortcutReady: x.shortcutReady }));
      setTimer(null);
      bump();
      return { ok: true, message: `Restored ${data.tasks.length} tasks.` };
    } catch {
      return { ok: false, message: "That file couldn't be read." };
    }
  };

  /* ---- web: automatic calendar sync ---- */

  // Coming back from the shortcut: …/paced/#sync=done&result=PACED-BUSY… (or ?sync=… from older shortcuts)
  const takeReturnRef = useRef<() => void>(() => {});
  takeReturnRef.current = () => {
    const { hash, search } = window.location;
    const ret = parseShortcutReturn(hash.length > 1 ? hash : search);
    if (!ret) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (ret.status === 'done' && ret.result !== undefined) {
      const r = importBusyText(ret.result);
      setNotice({ ok: r.ok, text: r.ok ? `Calendar synced. ${r.message}` : r.message });
    } else {
      setSync((x) => ({ ...x, pendingPaste: false }));
      if (ret.status === 'error') setNotice({ ok: false, text: `The shortcut stopped with an error${ret.error ? `: ${ret.error}` : ''}.` });
    }
  };
  useEffect(() => {
    if (!loaded || !IS_WEB) return;
    takeReturnRef.current();
    // Safari may reuse an open Paced tab and only change the part after '#'.
    const onHash = () => takeReturnRef.current();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [loaded]);

  // Does the calendar need the current plan? Only when you added, changed, finished or deleted
  // tasks since the last sync (never just because Paced was opened), and not twice within 30 s.
  const needsWrite = useCallback(() => {
    const { settings: s, sync: sy, dataChangedAt: changed } = ref.current;
    if (!s.shortcutReady || !s.autoWrite) return false;
    const sinceHandoff = sy.lastAutoAt ? Date.now() - sy.lastAutoAt : Infinity;
    return (changed ?? 0) > (sy.lastSyncAt ?? 0) && sinceHandoff > 30_000;
  }, []);

  const autoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scheduleAutoSync = useCallback(
    (delay: number) => {
      clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => {
        if (document.visibilityState !== 'visible' || uiBusyRef.current || !needsWrite()) return;
        setNotice({ ok: true, text: 'Updating your calendar…' });
        startShortcutSync(true);
      }, delay);
    },
    [needsWrite, startShortcutSync]
  );

  // After you add or change tasks (and close the editor), update the calendar by itself.
  useEffect(() => {
    if (!loaded || !IS_WEB || uiBusy) return;
    if ((dataChangedAt ?? 0) > (sync.lastSyncAt ?? 0)) {
      // Wait 5 s after the last edit, and at least 30 s after the previous hand-off.
      const sinceHandoff = sync.lastAutoAt ? Date.now() - sync.lastAutoAt : Infinity;
      scheduleAutoSync(Math.max(5000, 30_000 - sinceHandoff + 500));
    }
  }, [loaded, dataChangedAt, uiBusy, sync.lastSyncAt, sync.lastAutoAt, scheduleAutoSync]);

  useEffect(() => {
    if (!loaded || !IS_WEB) return;
    const check = () => scheduleAutoSync(1500);
    check();
    // Another Safari tab (e.g. the one the shortcut opened) saved newer data: pick it up.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && e.newValue !== lastSavedRef.current) hydrate(e.newValue);
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw && raw !== lastSavedRef.current) hydrate(raw);
      setNow(Date.now());
      check();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(autoTimer.current);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loaded, scheduleAutoSync, hydrate]);

  const removeCalendar = useCallback(async () => {
    await CalendarApi.removeAppCalendar(ref.current.settings);
    setSettings((x) => ({ ...x, appCalendarId: undefined, writeToCalendar: false }));
    setSync({});
  }, []);

  /* ---- tasks ---- */
  const commitTimer = (t: Task[], tm: RunningTimer | null, at: number): Task[] => {
    if (!tm) return t;
    return t.map((x) => (x.id === tm.taskId ? { ...x, loggedSec: loggedSecNow(x, tm, at) } : x));
  };

  const addTask: Store['addTask'] = (t) => {
    const id = newId();
    setTasksS((xs) => [...xs, { ...t, id, createdAt: Date.now(), loggedSec: 0, done: false }]);
    bump();
    return id;
  };

  const updateTask: Store['updateTask'] = (id, patch) => {
    setTasksS((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    bump();
  };

  /** Moves the task to Deleted (restorable). */
  const deleteTask: Store['deleteTask'] = (id) => {
    const at = Date.now();
    const tm = ref.current.timer;
    if (tm?.taskId === id) setTimer(null);
    setPaused((p) => (p === id ? null : p));
    setTasksS((xs) => (tm?.taskId === id ? commitTimer(xs, tm, at) : xs).map((x) => (x.id === id ? { ...x, deletedAt: at } : x)));
    bump();
  };

  const restoreTask: Store['restoreTask'] = (id) => {
    setTasksS((xs) => xs.map((x) => (x.id === id ? { ...x, deletedAt: undefined } : x)));
    bump();
  };

  const purgeTask: Store['purgeTask'] = (id) => {
    bury([id]);
    setTasks((xs) => xs.filter((x) => x.id !== id));
  };
  const emptyDeleted: Store['emptyDeleted'] = () => {
    bury(ref.current.allTasks.filter((x) => x.deletedAt).map((x) => x.id));
    setTasks((xs) => xs.filter((x) => !x.deletedAt));
  };

  const setDone: Store['setDone'] = (id, done) => {
    const at = Date.now();
    const tm = ref.current.timer;
    setTasksS((xs) =>
      (tm?.taskId === id ? commitTimer(xs, tm, at) : xs).map((x) =>
        x.id === id ? { ...x, done, doneAt: done ? at : undefined } : x
      )
    );
    if (done && tm?.taskId === id) setTimer(null);
    if (done) setPaused((p) => (p === id ? null : p));
    if (done) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    bump();
  };

  const addLogged: Store['addLogged'] = (id, deltaMin) => {
    setTasksS((xs) => xs.map((x) => (x.id === id ? { ...x, loggedSec: Math.max(0, x.loggedSec + deltaMin * 60) } : x)));
    bump();
  };

  /* ---- projects ---- */
  const addProject: Store['addProject'] = (p) => {
    const id = newId();
    setProjectsS((xs) => [...xs, { ...p, id, createdAt: Date.now() }]);
    bump();
    return id;
  };

  const updateProject: Store['updateProject'] = (id, patch) => {
    setProjectsS((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    bump();
  };

  const deleteProject: Store['deleteProject'] = (id, deleteTasks) => {
    bury([id]);
    setProjects((xs) => xs.filter((x) => x.id !== id));
    const at = Date.now();
    setTasksS((xs) =>
      xs.map((x) =>
        x.projectId !== id ? x : deleteTasks ? { ...x, projectId: undefined, deletedAt: x.deletedAt ?? at } : { ...x, projectId: undefined }
      )
    );
    if (deleteTasks) {
      const tm = ref.current.timer;
      if (tm && ref.current.tasks.find((t) => t.id === tm.taskId)?.projectId === id) setTimer(null);
    }
    bump();
  };

  /* ---- timer ---- */
  const startTimer: Store['startTimer'] = (taskId) => {
    const at = Date.now();
    const tm = ref.current.timer;
    if (tm?.taskId === taskId) return;
    if (tm) setTasksS((xs) => commitTimer(xs, tm, at));
    setTimer({ taskId, startedAt: at });
    setPaused(null);
    setNow(at);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const stopTimer: Store['stopTimer'] = () => {
    const at = Date.now();
    const tm = ref.current.timer;
    if (!tm) return;
    setTasksS((xs) => commitTimer(xs, tm, at));
    setTimer(null);
    setPaused(tm.taskId);
    setNow(at);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Re-plan (native auto-sync), but a pause alone isn't worth bouncing to Shortcuts on the web.
    setSyncTrigger((n) => n + 1);
  };

  /* ---- settings ---- */
  const updateSettings: Store['updateSettings'] = (patch) => {
    setSettings((x) => ({ ...x, ...patch }));
    if (Object.keys(patch).some((k) => !['shortcutReady', 'appCalendarId', 'autoWrite', 'busyCalendarIds'].includes(k))) setSettingsAt(Date.now());
    if ('busyCalendarIds' in patch || 'ignoreAllDay' in patch || 'horizonDays' in patch) {
      setTimeout(() => refreshBusy(), 50);
    }
    // Colour and sync preferences don't change the plan, so they don't need a calendar update.
    const cosmetic = ['accent', 'autoWrite', 'font', 'showSeconds'];
    if (Object.keys(patch).some((k) => !cosmetic.includes(k))) bump();
  };

  const resetAll = async () => {
    bury([...ref.current.allTasks.map((x) => x.id), ...ref.current.projects.map((x) => x.id)]);
    setTasks([]);
    setProjects([]);
    setTimer(null);
    setPaused(null);
    setSettings((x) => ({ ...DEFAULT_SETTINGS, appCalendarId: x.appCalendarId }));
    await AsyncStorage.removeItem(STORAGE_KEY);
    bump();
  };

  const value: Store = {
    loaded,
    now,
    tasks,
    deletedTasks,
    projects,
    settings,
    timer,
    paused,
    busy,
    plan,
    permission,
    sync,
    syncing,
    refreshing,
    busyUpdatedAt,
    calendarStale: !sync.lastSyncAt || (dataChangedAt ?? 0) > sync.lastSyncAt,
    notice,
    setUiBusy,
    addTask,
    updateTask,
    deleteTask,
    restoreTask,
    purgeTask,
    emptyDeleted,
    setDone,
    addLogged,
    addProject,
    updateProject,
    deleteProject,
    startTimer,
    stopTimer,
    dismissPaused: () => setPaused(null),
    updateSettings,
    connectCalendar,
    refreshBusy,
    syncNow,
    removeCalendar,
    resetAll,
    restorable,
    restoreFromCalendar,
    dismissRestore: () => setRestorable(null),
    importBusyText,
    pasteCalendar,
    exportData,
    importData,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
