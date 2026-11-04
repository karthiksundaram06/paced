import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CalendarSyncCard } from '../components/CalendarSyncCard';
import { Screen } from '../components/Screen';
import { deadlineLine } from '../components/TaskRow';
import { clock, dayLabel, duration, relative, when } from '../format';
import { MIN, startOfDay } from '../scheduler';
import { IS_WEB, useStore } from '../store';
import { useTheme } from '../theme';
import type { Project, Task, WorkBlock } from '../types';
import { Button, Card, Empty, Icon, Muted, Progress, SectionTitle, StatusPill } from '../ui';

export function PlanScreen({
  onOpenTask,
  onOpenProject,
  onOpenGuide,
}: {
  onOpenTask: (t: Task) => void;
  onOpenProject: (p: Project) => void;
  onOpenGuide: () => void;
}) {
  const t = useTheme();
  const s = useStore();
  const { plan, tasks, projects, now, settings, sync, syncing, permission } = s;
  const taskById = new Map(tasks.map((x) => [x.id, x]));
  const projectOf = (task?: Task) => projects.find((p) => p.id === task?.projectId);

  const remaining = Object.values(plan.tasks).reduce((m, p) => m + p.remainingMin, 0);
  const load = plan.freeMinInHorizon > 0 ? remaining / plan.freeMinInHorizon : 0;
  const problems = tasks.filter((x) => !x.done && ['late', 'unscheduled', 'tight'].includes(plan.tasks[x.id]?.status));
  const lastFinish = Object.values(plan.tasks)
    .filter((p) => p.status !== 'done' && p.projectedFinish)
    .reduce((m, p) => Math.max(m, p.projectedFinish!), 0);

  // Group blocks by day (next 14 days)
  const days = new Map<number, WorkBlock[]>();
  for (const b of plan.blocks) {
    const d = startOfDay(b.start);
    if (d > now + 14 * 24 * 60 * MIN) break;
    if (!days.has(d)) days.set(d, []);
    days.get(d)!.push(b);
  }

  const activeProjects = projects.filter((p) => (plan.projects[p.id]?.openTasks ?? 0) > 0);

  return (
    <Screen title="Plan" onRefresh={IS_WEB ? undefined : s.refreshBusy} refreshing={s.refreshing}>
      {/* Calendar sync */}
      {IS_WEB ? (
        <CalendarSyncCard onOpenGuide={onOpenGuide} />
      ) : (
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name={permission === 'granted' && settings.writeToCalendar ? 'calendar' : 'calendar-outline'} color={t.accent} size={22} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>
              {permission !== 'granted'
                ? 'Calendar not connected'
                : !settings.writeToCalendar
                  ? 'Reading your calendar only'
                  : syncing
                    ? 'Updating your calendar…'
                    : 'Synced to the "Paced" calendar'}
            </Text>
            <Muted style={{ fontSize: 13 }}>
              {permission !== 'granted'
                ? 'Connect it so work avoids your events.'
                : !settings.writeToCalendar
                  ? 'Writing blocks and deadlines is off in Settings.'
                  : sync.lastSyncAt
                    ? `Updated ${relative(sync.lastSyncAt, now)} · ${sync.lastWritten ?? 0} events (blocks + deadlines)`
                    : 'Not written yet.'}
            </Muted>
          </View>
        </View>
        {!!sync.lastError && <Text style={{ color: t.danger, fontSize: 13 }}>{sync.lastError}</Text>}
        {permission !== 'granted' ? (
          <Button title="Connect calendar" icon="lock-open-outline" onPress={s.connectCalendar} />
        ) : settings.writeToCalendar ? (
          <Button title={syncing ? 'Updating…' : 'Update calendar now'} kind="secondary" icon="sync" disabled={syncing} onPress={s.syncNow} />
        ) : null}
      </Card>
      )}

      {/* Workload */}
      {remaining > 0 && (
        <Card style={{ gap: 8 }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>Workload</Text>
          <Muted>
            {duration(remaining)} of work vs {duration(plan.freeMinInHorizon)} of free time in the next {settings.horizonDays} days
          </Muted>
          <Progress value={load} color={load > 0.9 ? t.danger : load > 0.6 ? t.warn : t.ok} />
          {lastFinish > 0 && <Muted style={{ fontSize: 13 }}>If nothing changes, you're clear of everything {when(lastFinish, now)}.</Muted>}
        </Card>
      )}

      {/* Problems */}
      {problems.length > 0 && (
        <>
          <SectionTitle>Needs attention</SectionTitle>
          {problems.map((x) => {
            const tp = plan.tasks[x.id];
            const line = deadlineLine(x, tp, now);
            return (
              <Pressable key={x.id} onPress={() => onOpenTask(x)}>
                <Card style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: t.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                      {x.title}
                    </Text>
                    <StatusPill status={tp.status} />
                  </View>
                  <Text style={{ color: line.tone === 'danger' ? t.danger : t.warn, fontSize: 13 }}>{line.text}</Text>
                  <Muted style={{ fontSize: 12 }}>
                    {tp.status === 'tight'
                      ? 'Little slack: one missed block and it slips.'
                      : 'Fix it: move the deadline, cut the estimate, widen working hours in Settings, or free up calendar time.'}
                  </Muted>
                </Card>
              </Pressable>
            );
          })}
        </>
      )}

      {/* Projects */}
      {activeProjects.length > 0 && (
        <>
          <SectionTitle>Projects</SectionTitle>
          {activeProjects.map((p) => {
            const pp = plan.projects[p.id];
            return (
              <Pressable key={p.id} onPress={() => onOpenProject(p)}>
                <Card style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.color }} />
                    <Text style={{ color: t.text, fontWeight: '800', fontSize: 17, flex: 1 }} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <StatusPill status={pp.status} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <Stat label="Time to complete" value={duration(pp.remainingMin)} />
                    <Stat label="Done by" value={pp.projectedFinish ? when(pp.projectedFinish, now) : '—'} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <Stat
                      label={pp.deadline ? 'Deadline' : 'Suggested deadline'}
                      value={pp.deadline ? when(pp.deadline, now) : pp.suggestedDeadline ? when(pp.suggestedDeadline, now) : '—'}
                    />
                    <Stat label="Tracked" value={`${duration(pp.loggedMin)} / ${duration(pp.totalEstimateMin)}`} />
                  </View>
                  <Progress value={pp.totalEstimateMin ? (pp.totalEstimateMin - pp.remainingMin) / pp.totalEstimateMin : 0} color={p.color} />
                </Card>
              </Pressable>
            );
          })}
        </>
      )}

      {/* Day by day */}
      <SectionTitle>Next two weeks</SectionTitle>
      {days.size === 0 ? (
        <Card>
          <Empty icon="calendar-clear-outline" title="Nothing scheduled" body="Work blocks appear here once you have open tasks." />
        </Card>
      ) : (
        [...days.entries()].map(([day, blocks]) => {
          const total = blocks.reduce((m, b) => m + (b.end - b.start) / MIN, 0);
          return (
            <Card key={day} style={{ padding: 0, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, paddingBottom: 6 }}>
                <Text style={{ color: t.text, fontWeight: '800' }}>{dayLabel(day + 12 * 60 * MIN, now)}</Text>
                <Muted style={{ fontSize: 13 }}>{duration(total)} of work</Muted>
              </View>
              {blocks.map((b, i) => {
                const task = taskById.get(b.taskId);
                const proj = projectOf(task);
                return (
                  <Pressable
                    key={`${b.taskId}-${b.start}`}
                    onPress={() => task && onOpenTask(task)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}
                  >
                    <Text style={{ color: t.sub, width: 92, fontVariant: ['tabular-nums'], fontSize: 13 }}>
                      {clock(b.start)}–{clock(b.end)}
                    </Text>
                    <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: proj?.color ?? t.accent }} />
                    <Text style={{ color: t.text, flex: 1 }} numberOfLines={1}>
                      {task?.title}
                    </Text>
                  </Pressable>
                );
              })}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: t.faint, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>{value}</Text>
    </View>
  );
}
