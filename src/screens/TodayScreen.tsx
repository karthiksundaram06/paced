import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CalendarSyncCard } from '../components/CalendarSyncCard';
import { CountdownBig } from '../components/Countdown';
import { Screen } from '../components/Screen';
import { deadlineLine } from '../components/TaskRow';
import { clock, duration, longDate, relative, stopwatch, when } from '../format';
import { addDays, loggedSecNow, MIN, startOfDay } from '../scheduler';
import { IS_WEB, useStore } from '../store';
import { useTheme } from '../theme';
import type { Task } from '../types';
import { Button, Card, Empty, Icon, Muted, Progress, SectionTitle, StatusPill } from '../ui';

type AgendaItem =
  | { kind: 'event'; start: number; end: number; title: string; color?: string }
  | { kind: 'block'; start: number; end: number; task: Task };

export function TodayScreen({
  onOpenTask,
  onNewTask,
  onOpenGuide,
}: {
  onOpenTask: (t: Task) => void;
  onNewTask: () => void;
  onOpenGuide: () => void;
}) {
  const t = useTheme();
  const s = useStore();
  const { now, plan, tasks, projects, timer, busy, permission } = s;
  const taskById = new Map(tasks.map((x) => [x.id, x]));
  const projectColor = (task?: Task) => projects.find((p) => p.id === task?.projectId)?.color ?? t.accent;

  const dayStart = startOfDay(now);
  const dayEnd = addDays(dayStart, 1);
  const agenda: AgendaItem[] = [
    ...busy
      .filter((b) => b.end > dayStart && b.start < dayEnd)
      .map((b) => ({ kind: 'event' as const, start: b.start, end: b.end, title: b.title ?? 'Busy', color: b.calendarColor })),
    ...plan.blocks
      .filter((b) => b.start < dayEnd && taskById.has(b.taskId))
      .map((b) => ({ kind: 'block' as const, start: b.start, end: b.end, task: taskById.get(b.taskId)! })),
  ].sort((a, b) => a.start - b.start);

  const plannedToday = plan.blocks.filter((b) => b.start < dayEnd).reduce((m, b) => m + (b.end - b.start) / MIN, 0);
  const remainingTotal = Object.values(plan.tasks).reduce((m, p) => m + p.remainingMin, 0);
  const runningTask = timer ? taskById.get(timer.taskId) : undefined;
  const nextBlock = plan.blocks.find((b) => b.end > now && taskById.has(b.taskId));
  const nextTask = nextBlock ? taskById.get(nextBlock.taskId) : undefined;

  // Every open deadline, tasks and projects, soonest (or overdue) first.
  type DeadlineItem = { key: string; title: string; deadline: number; color: string; detail: string; status: import('../types').RiskStatus; open: () => void };
  const deadlines: DeadlineItem[] = [
    ...tasks
      .filter((x) => !x.done && plan.tasks[x.id]?.deadline !== undefined)
      .map((x) => {
        const tp = plan.tasks[x.id];
        return {
          key: `t-${x.id}`,
          title: x.title,
          deadline: tp.deadline!,
          color: projectColor(x),
          detail: `Due ${when(tp.deadline!, now)} · ${duration(tp.remainingMin)} of work left`,
          status: tp.status,
          open: () => onOpenTask(x),
        };
      }),
    ...projects
      .filter((p) => p.deadline !== undefined && (plan.projects[p.id]?.openTasks ?? 0) > 0)
      .map((p) => {
        const pp = plan.projects[p.id];
        return {
          key: `p-${p.id}`,
          title: `${p.name} (project)`,
          deadline: p.deadline!,
          color: p.color,
          detail: `Due ${when(p.deadline!, now)} · ${duration(pp.remainingMin)} left in ${pp.openTasks} task${pp.openTasks > 1 ? 's' : ''}`,
          status: pp.status,
          open: () => {},
        };
      }),
  ].sort((a, b) => a.deadline - b.deadline);
  const atRisk = tasks.filter((x) => !x.done && ['late', 'unscheduled'].includes(plan.tasks[x.id]?.status));

  return (
    <Screen title="Today" subtitle={longDate(now)} onRefresh={IS_WEB ? undefined : s.refreshBusy} refreshing={s.refreshing}>
      {IS_WEB && <CalendarSyncCard compact onOpenGuide={onOpenGuide} />}
      {!IS_WEB && permission !== 'granted' && (
        <Card style={{ gap: 10, borderWidth: 1, borderColor: t.accent + '55' }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Icon name="calendar" color={t.accent} size={22} />
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Connect your calendar</Text>
          </View>
          <Muted>
            Paced reads your events so it never plans work during a lecture or shift. It also adds your work blocks and deadlines
            to a separate "Paced" calendar.
          </Muted>
          <Button title="Allow calendar access" icon="lock-open-outline" onPress={s.connectCalendar} />
          {permission === 'denied' && (
            <Text style={{ color: t.danger, fontSize: 13 }}>
              Access was denied. Turn it on in the iPhone Settings app → Paced → Calendars → Full Access.
            </Text>
          )}
        </Card>
      )}

      {/* Now / Up next */}
      {runningTask ? (
        <Card style={{ backgroundColor: t.accent, gap: 8 }}>
          <Text style={{ color: t.accentText, opacity: 0.8, fontWeight: '700', fontSize: 13 }}>WORKING ON</Text>
          <Text style={{ color: t.accentText, fontSize: 20, fontWeight: '800' }} numberOfLines={2}>
            {runningTask.title}
          </Text>
          <Text style={{ color: t.accentText, fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {stopwatch((now - timer!.startedAt) / 1000)}
          </Text>
          <Text style={{ color: t.accentText, opacity: 0.9 }}>
            {duration(loggedSecNow(runningTask, timer, now) / 60)} tracked of {duration(runningTask.estimateMin)} ·{' '}
            {plan.tasks[runningTask.id]?.remainingMin
              ? `${duration(plan.tasks[runningTask.id].remainingMin)} left`
              : 'estimate reached'}
          </Text>
          <View style={{ marginVertical: 4 }}>
            <Progress value={loggedSecNow(runningTask, timer, now) / 60 / runningTask.estimateMin} color={t.accentText} />
          </View>
          {plan.tasks[runningTask.id]?.deadline !== undefined && (
            <Text style={{ color: t.accentText, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              Deadline {when(plan.tasks[runningTask.id].deadline!, now)}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Pause" icon="pause" kind="secondary" onPress={s.stopTimer} style={{ flex: 1 }} />
            <Button title="Done" icon="checkmark" kind="secondary" onPress={() => s.setDone(runningTask.id, true)} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : nextBlock && nextTask ? (
        <Card style={{ gap: 8 }}>
          <Text style={{ color: t.sub, fontWeight: '700', fontSize: 13 }}>
            {nextBlock.start <= now + 5 * MIN ? 'DO THIS NOW' : `UP NEXT · ${relative(nextBlock.start, now).toUpperCase()}`}
          </Text>
          <Pressable onPress={() => onOpenTask(nextTask)}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{nextTask.title}</Text>
          </Pressable>
          <Muted>
            {when(nextBlock.start, now)}–{clock(nextBlock.end)} · {duration((nextBlock.end - nextBlock.start) / MIN)} block ·{' '}
            {duration(plan.tasks[nextTask.id]?.remainingMin ?? 0)} left in total
          </Muted>
          <Muted style={{ fontSize: 13 }}>{deadlineLine(nextTask, plan.tasks[nextTask.id], now).text}</Muted>
          {plan.tasks[nextTask.id]?.deadline !== undefined && <CountdownBig to={plan.tasks[nextTask.id].deadline!} />}
          <Button title="Start timer" icon="play" onPress={() => s.startTimer(nextTask.id)} style={{ marginTop: 4 }} />
        </Card>
      ) : (
        <Card>
          <Empty icon="sunny-outline" title="Nothing planned" body="Add a task with a time estimate and Paced will find time for it." />
          <Button title="Add a task" icon="add" onPress={onNewTask} />
        </Card>
      )}

      {/* Load summary */}
      {remainingTotal > 0 && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Card style={{ flex: 1, padding: 14 }}>
            <Muted style={{ fontSize: 12 }}>Planned today</Muted>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{duration(plannedToday)}</Text>
          </Card>
          <Card style={{ flex: 1, padding: 14 }}>
            <Muted style={{ fontSize: 12 }}>Work left</Muted>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{duration(remainingTotal)}</Text>
          </Card>
          <Card style={{ flex: 1, padding: 14 }}>
            <Muted style={{ fontSize: 12 }}>At risk</Muted>
            <Text style={{ color: atRisk.length ? t.danger : t.ok, fontSize: 20, fontWeight: '800' }}>{atRisk.length}</Text>
          </Card>
        </View>
      )}

      {/* Agenda */}
      <SectionTitle>Schedule</SectionTitle>
      {agenda.length === 0 ? (
        <Muted style={{ paddingHorizontal: 4 }}>No events or work blocks left today.</Muted>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {agenda.map((item, i) => {
            const past = item.end <= now;
            const live = item.start <= now && item.end > now;
            const isBlock = item.kind === 'block';
            const color = isBlock ? projectColor(item.task) : item.color ?? t.busy;
            return (
              <Pressable
                key={`${item.kind}-${item.start}-${i}`}
                disabled={!isBlock}
                onPress={() => isBlock && onOpenTask(item.task)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderTopWidth: i ? 0.5 : 0,
                  borderTopColor: t.border,
                  opacity: past ? 0.45 : 1,
                  backgroundColor: live ? t.accent + '10' : 'transparent',
                }}
              >
                <View style={{ width: 48 }}>
                  <Text style={{ color: t.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{clock(item.start)}</Text>
                  <Text style={{ color: t.faint, fontSize: 12, fontVariant: ['tabular-nums'] }}>{clock(item.end)}</Text>
                </View>
                <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: isBlock ? t.text : t.sub, fontWeight: isBlock ? '700' : '500' }} numberOfLines={1}>
                    {isBlock ? item.task.title : item.title}
                  </Text>
                  <Text style={{ color: t.faint, fontSize: 12 }}>
                    {isBlock ? `Work block · ${duration((item.end - item.start) / MIN)}` : 'Calendar event'}
                    {live ? ' · now' : ''}
                  </Text>
                </View>
                {isBlock && !past && timer?.taskId !== item.task.id && (
                  <Pressable hitSlop={10} onPress={() => s.startTimer(item.task.id)}>
                    <Icon name="play-circle" size={28} color={color} />
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </Card>
      )}

      {/* Deadlines */}
      {deadlines.length > 0 && (
        <>
          <SectionTitle>Deadline countdowns</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {deadlines.map((d, i) => (
              <Pressable
                key={d.key}
                onPress={d.open}
                style={{ padding: 14, gap: 6, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color }} />
                  <Text style={{ color: t.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {d.title}
                  </Text>
                  <StatusPill status={d.status} />
                </View>
                <CountdownBig to={d.deadline} label={false} style={{ fontSize: 26 }} />
                <Muted style={{ fontSize: 13 }}>{d.detail}</Muted>
              </Pressable>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
