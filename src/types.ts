export type Priority = 1 | 2 | 3; // 1 = high, 2 = normal, 3 = low

export interface Project {
  id: string;
  name: string;
  color: string;
  deadline?: number; // epoch ms
  createdAt: number;
}

export interface Task {
  id: string;
  projectId?: string;
  title: string;
  estimateMin: number; // how long you think it takes
  loggedSec: number; // time already tracked with the timer (excludes a running timer)
  deadline?: number; // epoch ms
  priority: Priority;
  done: boolean;
  doneAt?: number;
  notes?: string;
  createdAt: number;
}

export interface RunningTimer {
  taskId: string;
  startedAt: number; // epoch ms
}

export interface Settings {
  dayStartMin: number; // minutes after midnight when you're willing to start working
  dayEndMin: number; // minutes after midnight when you stop
  workDays: number[]; // 0 = Sunday … 6 = Saturday
  minChunkMin: number; // don't schedule blocks shorter than this
  maxChunkMin: number; // split work into blocks of at most this
  breakMin: number; // gap after each block
  bufferPct: number; // safety margin added to suggested deadlines
  horizonDays: number; // how far ahead to plan
  busyCalendarIds: string[] | null; // null = every calendar except Paced's own
  ignoreAllDay: boolean; // all-day events (birthdays, holidays) don't block time
  writeToCalendar: boolean;
  alertMin: number; // alert before each work block
  appCalendarId?: string;
  shortcutReady?: boolean; // web: the Paced Sync shortcut has delivered events at least once
}

export interface SyncState {
  lastSyncAt?: number;
  lastSyncHash?: string;
  lastError?: string;
  lastWritten?: number;
  pendingPaste?: boolean; // web: the shortcut was opened and its result hasn't been pasted yet
}

export interface BusyInterval {
  start: number;
  end: number;
  title?: string;
  calendarColor?: string;
}

export interface WorkBlock {
  taskId: string;
  start: number;
  end: number;
}

export type RiskStatus = 'done' | 'ok' | 'tight' | 'late' | 'unscheduled' | 'no-deadline';

export interface TaskPlan {
  taskId: string;
  remainingMin: number;
  blocks: WorkBlock[];
  projectedFinish?: number; // when the last block ends
  deadline?: number; // effective deadline (task or project, whichever is earlier)
  suggestedDeadline?: number; // for tasks without a deadline
  startBy?: number; // latest start that still meets the deadline (ignoring other tasks)
  slackMin?: number; // deadline - projected finish
  spareMin?: number; // free time still unplanned before the deadline
  unscheduledMin: number; // work that didn't fit inside the planning horizon
  status: RiskStatus;
}

export interface ProjectPlan {
  projectId: string;
  remainingMin: number;
  totalEstimateMin: number;
  loggedMin: number;
  projectedFinish?: number;
  deadline?: number;
  suggestedDeadline?: number;
  status: RiskStatus;
  openTasks: number;
}

export interface Plan {
  generatedAt: number;
  tasks: Record<string, TaskPlan>;
  projects: Record<string, ProjectPlan>;
  blocks: WorkBlock[];
  freeMinInHorizon: number;
}

export const DEFAULT_SETTINGS: Settings = {
  dayStartMin: 9 * 60,
  dayEndMin: 22 * 60,
  workDays: [0, 1, 2, 3, 4, 5, 6],
  minChunkMin: 25,
  maxChunkMin: 90,
  breakMin: 10,
  bufferPct: 20,
  horizonDays: 28,
  busyCalendarIds: null,
  ignoreAllDay: true,
  writeToCalendar: true,
  alertMin: 5,
};
