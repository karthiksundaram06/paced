import type {
  BusyInterval,
  Plan,
  Project,
  ProjectPlan,
  RiskStatus,
  RunningTimer,
  Settings,
  Task,
  TaskPlan,
  WorkBlock,
} from './types';

export const MIN = 60_000;
export const HOUR = 60 * MIN;

interface Interval {
  start: number;
  end: number;
}

/* ---------- time helpers ---------- */

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

export function roundUp(ts: number, stepMs: number): number {
  return Math.ceil(ts / stepMs) * stepMs;
}

/* ---------- task helpers ---------- */

export function loggedSecNow(task: Task, timer: RunningTimer | null, now: number): number {
  const live = timer && timer.taskId === task.id ? Math.max(0, (now - timer.startedAt) / 1000) : 0;
  return task.loggedSec + live;
}

export function remainingMin(task: Task, timer: RunningTimer | null, now: number): number {
  if (task.done) return 0;
  return Math.max(0, Math.ceil(task.estimateMin - loggedSecNow(task, timer, now) / 60));
}

export function effectiveDeadline(task: Task, project?: Project): number | undefined {
  const candidates = [task.deadline, project?.deadline].filter((d): d is number => typeof d === 'number');
  return candidates.length ? Math.min(...candidates) : undefined;
}

/* ---------- free time ---------- */

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ start: i.start, end: i.end });
  }
  return out;
}

/** Working-hour windows between `from` and `to`, minus busy calendar time. */
export function freeIntervals(busy: BusyInterval[], settings: Settings, from: number, to: number): Interval[] {
  const windows: Interval[] = [];
  for (let day = startOfDay(from); day < to; day = addDays(day, 1)) {
    if (!settings.workDays.includes(new Date(day).getDay())) continue;
    const ws = day + settings.dayStartMin * MIN;
    let we = day + settings.dayEndMin * MIN;
    if (settings.dayEndMin <= settings.dayStartMin) we += 24 * HOUR; // window crosses midnight
    const s = Math.max(ws, from);
    const e = Math.min(we, to);
    if (e > s) windows.push({ start: s, end: e });
  }

  const blocked = mergeIntervals(busy.map((b) => ({ start: b.start, end: b.end })));
  const free: Interval[] = [];
  for (const w of mergeIntervals(windows)) {
    let cursor = w.start;
    for (const b of blocked) {
      if (b.end <= cursor) continue;
      if (b.start >= w.end) break;
      if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, w.end) });
      cursor = Math.max(cursor, b.end);
      if (cursor >= w.end) break;
    }
    if (cursor < w.end) free.push({ start: cursor, end: w.end });
  }
  return free;
}

/** Latest moment you could start and still finish `needMin` of work before `deadline`, using only free time. */
export function latestStart(free: Interval[], deadline: number, needMin: number): number | undefined {
  if (needMin <= 0) return deadline;
  let acc = 0;
  for (let i = free.length - 1; i >= 0; i--) {
    const seg = free[i];
    if (seg.start >= deadline) continue;
    const segEnd = Math.min(seg.end, deadline);
    const segMin = (segEnd - seg.start) / MIN;
    if (acc + segMin >= needMin) return segEnd - (needMin - acc) * MIN;
    acc += segMin;
  }
  return undefined;
}

/* ---------- planning ---------- */

export interface PlanInput {
  tasks: Task[];
  projects: Project[];
  busy: BusyInterval[];
  settings: Settings;
  timer: RunningTimer | null;
  now: number;
}

function suggestDeadline(finish: number, now: number, bufferPct: number): number {
  const buffer = Math.max(HOUR, ((finish - now) * bufferPct) / 100);
  return roundUp(finish + buffer, HOUR);
}

function deadlineStatus(finish: number, deadline: number, now: number): RiskStatus {
  if (finish > deadline) return 'late';
  const slack = deadline - finish;
  const tightThreshold = Math.max(HOUR, 0.15 * (deadline - now));
  return slack < tightThreshold ? 'tight' : 'ok';
}

export function buildPlan({ tasks, projects, busy, settings, timer, now }: PlanInput): Plan {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const from = roundUp(now, 5 * MIN);
  const to = addDays(startOfDay(now), settings.horizonDays);
  const free = freeIntervals(busy, settings, from, to);
  const slots = free.map((f) => ({ ...f }));
  const freeMinInHorizon = free.reduce((sum, f) => sum + (f.end - f.start) / MIN, 0);

  const open = tasks.filter((t) => !t.done);
  // Earliest deadline first (a running timer doesn't jump the queue: urgent work still comes first).
  const order = [...open].sort((a, b) => {
    const da = effectiveDeadline(a, projectById.get(a.projectId ?? '')) ?? Infinity;
    const db = effectiveDeadline(b, projectById.get(b.projectId ?? '')) ?? Infinity;
    if (da !== db) return da - db;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.createdAt - b.createdAt;
  });

  const taskPlans: Record<string, TaskPlan> = {};
  const allBlocks: WorkBlock[] = [];

  for (const task of order) {
    const project = projectById.get(task.projectId ?? '');
    const deadline = effectiveDeadline(task, project);
    const remaining = remainingMin(task, timer, now);
    let rem = remaining;
    const blocks: WorkBlock[] = [];

    for (const slot of slots) {
      while (rem > 0) {
        const len = Math.floor((slot.end - slot.start) / MIN);
        if (len < Math.min(settings.minChunkMin, rem)) break;
        const wanted = Math.min(rem, settings.maxChunkMin);
        let chunk = Math.min(wanted, len);
        // Avoid leaving a crumb smaller than the minimum block for later: shrink this block if it can
        // stay above the minimum, otherwise keep the work together for the next free slot.
        const tail = rem - chunk;
        if (tail > 0 && tail < settings.minChunkMin) {
          if (chunk - (settings.minChunkMin - tail) >= settings.minChunkMin) chunk -= settings.minChunkMin - tail;
          else break;
        }
        blocks.push({ taskId: task.id, start: slot.start, end: slot.start + chunk * MIN });
        slot.start += (chunk + settings.breakMin) * MIN;
        rem -= chunk;
      }
      if (rem <= 0) break;
    }

    const projectedFinish = blocks.length ? blocks[blocks.length - 1].end : remaining === 0 ? now : undefined;
    let status: RiskStatus;
    if (rem > 0) status = deadline !== undefined ? 'late' : 'unscheduled';
    else if (deadline !== undefined) status = deadlineStatus(projectedFinish ?? now, deadline, now);
    else status = 'no-deadline';
    const startBy = deadline !== undefined && remaining > 0 ? latestStart(free, deadline, remaining) : undefined;
    // Spare free time left before the deadline once this and everything more urgent is planned.
    let spareMin: number | undefined;
    if (deadline !== undefined && rem === 0) {
      spareMin = slots.reduce((m, sl) => m + Math.max(0, (Math.min(sl.end, deadline) - sl.start) / MIN), 0);
      if (status === 'ok' && remaining > 0 && spareMin < Math.max(60, remaining * 0.5)) status = 'tight';
    }

    taskPlans[task.id] = {
      taskId: task.id,
      remainingMin: remaining,
      blocks,
      projectedFinish: rem > 0 ? undefined : projectedFinish,
      deadline,
      suggestedDeadline:
        deadline === undefined && rem === 0 && projectedFinish !== undefined
          ? suggestDeadline(projectedFinish, now, settings.bufferPct)
          : undefined,
      startBy,
      spareMin: spareMin !== undefined ? Math.round(spareMin) : undefined,
      slackMin:
        deadline !== undefined && rem === 0 && projectedFinish !== undefined
          ? Math.round((deadline - projectedFinish) / MIN)
          : undefined,
      unscheduledMin: rem,
      status,
    };
    allBlocks.push(...blocks);
  }

  for (const task of tasks.filter((t) => t.done)) {
    taskPlans[task.id] = {
      taskId: task.id,
      remainingMin: 0,
      blocks: [],
      projectedFinish: task.doneAt,
      deadline: effectiveDeadline(task, projectById.get(task.projectId ?? '')),
      unscheduledMin: 0,
      status: 'done',
    };
  }

  const projectPlans: Record<string, ProjectPlan> = {};
  for (const project of projects) {
    const pts = tasks.filter((t) => t.projectId === project.id);
    const openPts = pts.filter((t) => !t.done);
    const plans = openPts.map((t) => taskPlans[t.id]);
    const remainingTotal = plans.reduce((s, p) => s + p.remainingMin, 0);
    const anyUnscheduled = plans.some((p) => p.unscheduledMin > 0);
    const finishes = plans.map((p) => p.projectedFinish).filter((f): f is number => f !== undefined);
    const projectedFinish = !anyUnscheduled && finishes.length ? Math.max(...finishes) : undefined;

    let status: RiskStatus;
    if (pts.length > 0 && openPts.length === 0) status = 'done';
    else if (plans.some((p) => p.status === 'late')) status = 'late';
    else if (anyUnscheduled) status = 'unscheduled';
    else if (project.deadline !== undefined && projectedFinish !== undefined)
      status = deadlineStatus(projectedFinish, project.deadline, now);
    else if (plans.some((p) => p.status === 'tight')) status = 'tight';
    else if (project.deadline !== undefined) status = 'ok';
    else status = 'no-deadline';

    projectPlans[project.id] = {
      projectId: project.id,
      remainingMin: remainingTotal,
      totalEstimateMin: pts.reduce((s, t) => s + t.estimateMin, 0),
      loggedMin: Math.round(pts.reduce((s, t) => s + loggedSecNow(t, timer, now), 0) / 60),
      projectedFinish,
      deadline: project.deadline,
      suggestedDeadline:
        project.deadline === undefined && projectedFinish !== undefined && openPts.length > 0
          ? suggestDeadline(projectedFinish, now, settings.bufferPct)
          : undefined,
      status,
      openTasks: openPts.length,
    };
  }

  allBlocks.sort((a, b) => a.start - b.start);
  return { generatedAt: now, tasks: taskPlans, projects: projectPlans, blocks: allBlocks, freeMinInHorizon };
}

/** Stable fingerprint of what would be written to the calendar, to know when it's out of date. */
export function planSignature(plan: Plan, tasks: Task[]): string {
  const parts: string[] = plan.blocks.map((b) => `${b.taskId}:${b.start}:${b.end}`);
  for (const t of tasks) {
    const tp = plan.tasks[t.id];
    if (!t.done && tp?.deadline) parts.push(`d:${t.id}:${tp.deadline}:${t.title}`);
    if (!t.done) parts.push(`t:${t.id}:${t.title}`);
  }
  let h = 5381;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
