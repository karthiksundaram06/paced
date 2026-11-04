import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as CalendarApi from './calendar';
import { buildPlan, loggedSecNow, planSignature } from './scheduler';
import { buildSyncEvents, parseBusyText, shortcutUrl } from './shortcutBridge';
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
}

export interface Store {
  loaded: boolean;
  now: number;
  tasks: Task[];
  projects: Project[];
  settings: Settings;
  timer: RunningTimer | null;
  busy: BusyInterval[];
  plan: Plan;
  permission: Permission;
  sync: SyncState;
  syncing: boolean;
  refreshing: boolean;
  busyUpdatedAt?: number;
  /** Tasks or settings changed after the calendar was last updated. */
  calendarStale: boolean;

  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'loggedSec' | 'done'>) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  setDone: (id: string, done: boolean) => void;
  addLogged: (id: string, deltaMin: number) => void;

  addProject: (p: Omit<Project, 'id' | 'createdAt'>) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string, deleteTasks: boolean) => void;

  startTimer: (taskId: string) => void;
  stopTimer: () => void;

  updateSettings: (patch: Partial<Settings>) => void;
  connectCalendar: () => Promise<boolean>;
  refreshBusy: () => Promise<void>;
  syncNow: () => Promise<void>;
  removeCalendar: () => Promise<void>;
  resetAll: () => Promise<void>;

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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [sync, setSync] = useState<SyncState>({});
  const [busy, setBusy] = useState<BusyInterval[]>([]);
  const [nativePermission, setPermission] = useState<Permission>('unknown');
  const [busyUpdatedAt, setBusyUpdatedAt] = useState<number | undefined>();
  const [dataChangedAt, setDataChangedAt] = useState<number | undefined>();
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [syncTrigger, setSyncTrigger] = useState(0);
  const bump = () => {
    setSyncTrigger((n) => n + 1);
    setDataChangedAt(Date.now());
  };
  // On the web, "connected" means the shortcut has delivered your events at least once.
  const permission: Permission = IS_WEB ? (settings.shortcutReady ? 'granted' : 'unknown') : nativePermission;

  /* ---- load & save ---- */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw) as Partial<Persisted>;
          setTasks(data.tasks ?? []);
          setProjects(data.projects ?? []);
          setSettings({ ...DEFAULT_SETTINGS, ...(data.settings ?? {}) });
          setTimer(data.timer ?? null);
          setSync(data.sync ?? {});
          setBusy(data.busy ?? []);
          setBusyUpdatedAt(data.busyUpdatedAt);
          setDataChangedAt(data.dataChangedAt);
        }
      } catch {
        // corrupt storage: start fresh
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
      const data: Persisted = { tasks, projects, settings, timer, sync, busy, busyUpdatedAt, dataChangedAt };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
    }, 300);
    return () => clearTimeout(h);
  }, [loaded, tasks, projects, settings, timer, sync, busy, busyUpdatedAt, dataChangedAt]);

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
  const ref = useRef({ tasks, projects, settings, plan, permission, sync, timer });
  ref.current = { tasks, projects, settings, plan, permission, sync, timer };

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
    const sig = planSignature(p, ts) + ':' + s.alertMin;
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

  const syncNow = useCallback(async () => {
    if (IS_WEB) {
      const { plan: p, tasks: ts, projects: ps } = ref.current;
      const events = buildSyncEvents(p, ts, ps, Date.now());
      setSync((x) => ({ ...x, lastSyncAt: Date.now(), lastWritten: events.length, pendingPaste: true, lastError: undefined }));
      // Give storage a moment to save before iOS switches to the Shortcuts app.
      setTimeout(() => {
        window.location.href = shortcutUrl(events);
      }, 350);
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

  const importBusyText: Store['importBusyText'] = (text) => {
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
    setBusy(parsed.busy);
    setBusyUpdatedAt(Date.now());
    setSettings((x) => ({ ...x, shortcutReady: true }));
    setSync((x) => ({ ...x, pendingPaste: false, lastError: undefined }));
    setNow(Date.now());
    const extra = parsed.skipped ? ` (${parsed.skipped} skipped: unreadable dates)` : '';
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
      setTasks(data.tasks);
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setSettings((x) => ({ ...DEFAULT_SETTINGS, ...data.settings, shortcutReady: x.shortcutReady }));
      setTimer(null);
      bump();
      return { ok: true, message: `Restored ${data.tasks.length} tasks.` };
    } catch {
      return { ok: false, message: "That file couldn't be read." };
    }
  };

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
    setTasks((xs) => [...xs, { ...t, id, createdAt: Date.now(), loggedSec: 0, done: false }]);
    bump();
    return id;
  };

  const updateTask: Store['updateTask'] = (id, patch) => {
    setTasks((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    bump();
  };

  const deleteTask: Store['deleteTask'] = (id) => {
    if (ref.current.timer?.taskId === id) setTimer(null);
    setTasks((xs) => xs.filter((x) => x.id !== id));
    bump();
  };

  const setDone: Store['setDone'] = (id, done) => {
    const at = Date.now();
    const tm = ref.current.timer;
    setTasks((xs) =>
      (tm?.taskId === id ? commitTimer(xs, tm, at) : xs).map((x) =>
        x.id === id ? { ...x, done, doneAt: done ? at : undefined } : x
      )
    );
    if (done && tm?.taskId === id) setTimer(null);
    if (done) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    bump();
  };

  const addLogged: Store['addLogged'] = (id, deltaMin) => {
    setTasks((xs) => xs.map((x) => (x.id === id ? { ...x, loggedSec: Math.max(0, x.loggedSec + deltaMin * 60) } : x)));
    bump();
  };

  /* ---- projects ---- */
  const addProject: Store['addProject'] = (p) => {
    const id = newId();
    setProjects((xs) => [...xs, { ...p, id, createdAt: Date.now() }]);
    bump();
    return id;
  };

  const updateProject: Store['updateProject'] = (id, patch) => {
    setProjects((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    bump();
  };

  const deleteProject: Store['deleteProject'] = (id, deleteTasks) => {
    setProjects((xs) => xs.filter((x) => x.id !== id));
    setTasks((xs) =>
      deleteTasks ? xs.filter((x) => x.projectId !== id) : xs.map((x) => (x.projectId === id ? { ...x, projectId: undefined } : x))
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
    if (tm) setTasks((xs) => commitTimer(xs, tm, at));
    setTimer({ taskId, startedAt: at });
    setNow(at);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const stopTimer: Store['stopTimer'] = () => {
    const at = Date.now();
    const tm = ref.current.timer;
    if (!tm) return;
    setTasks((xs) => commitTimer(xs, tm, at));
    setTimer(null);
    setNow(at);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    bump();
  };

  /* ---- settings ---- */
  const updateSettings: Store['updateSettings'] = (patch) => {
    setSettings((x) => ({ ...x, ...patch }));
    if ('busyCalendarIds' in patch || 'ignoreAllDay' in patch || 'horizonDays' in patch) {
      setTimeout(() => refreshBusy(), 50);
    }
    bump();
  };

  const resetAll = async () => {
    setTasks([]);
    setProjects([]);
    setTimer(null);
    setSettings((x) => ({ ...DEFAULT_SETTINGS, appCalendarId: x.appCalendarId }));
    await AsyncStorage.removeItem(STORAGE_KEY);
    bump();
  };

  const value: Store = {
    loaded,
    now,
    tasks,
    projects,
    settings,
    timer,
    busy,
    plan,
    permission,
    sync,
    syncing,
    refreshing,
    busyUpdatedAt,
    calendarStale: !sync.lastSyncAt || (dataChangedAt ?? 0) > sync.lastSyncAt,
    addTask,
    updateTask,
    deleteTask,
    setDone,
    addLogged,
    addProject,
    updateProject,
    deleteProject,
    startTimer,
    stopTimer,
    updateSettings,
    connectCalendar,
    refreshBusy,
    syncNow,
    removeCalendar,
    resetAll,
    importBusyText,
    pasteCalendar,
    exportData,
    importData,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
