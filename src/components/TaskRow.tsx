import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { duration, relative, stopwatch, when } from '../format';
import { loggedSecNow } from '../scheduler';
import { useStore } from '../store';
import { useTheme } from '../theme';
import type { Task, TaskPlan } from '../types';
import { Icon, Progress, RoundButton, StatusPill } from '../ui';
import { CountdownPill } from './Countdown';

/**
 * Task cards in the Tasks tab only speak up when something needs doing; the deadline itself is the
 * countdown pill, and Today / the task editor still show the full "due · done · start by" line.
 */
export function taskIssue(task: Task, tp: TaskPlan | undefined, now: number): string {
  if (!tp || task.done) return '';
  if (tp.deadline !== undefined && tp.deadline <= now) return 'Deadline passed. Mark it done, or set a new deadline.';
  if (tp.remainingMin === 0) return 'Estimate used up. Mark it done, or add time in the task.';
  if (tp.unscheduledMin > 0) return `${duration(tp.unscheduledMin)} doesn't fit in your free time`;
  if (tp.status === 'late' && tp.deadline !== undefined && tp.projectedFinish !== undefined)
    return `Would finish ${duration((tp.projectedFinish - tp.deadline) / 60000)} after the deadline`;
  return '';
}

/** One-line explanation of where a task stands: deadline, finish time, what to do. */
export function deadlineLine(task: Task, tp: TaskPlan | undefined, now: number): { text: string; tone: 'normal' | 'warn' | 'danger' } {
  if (!tp) return { text: '', tone: 'normal' };
  if (task.done) return { text: task.doneAt ? `Finished ${when(task.doneAt, now)}` : 'Finished', tone: 'normal' };
  if (tp.deadline !== undefined && tp.deadline <= now) {
    return { text: `Deadline passed (${when(tp.deadline, now)}). Mark it done, or set a new deadline.`, tone: 'danger' };
  }
  if (tp.remainingMin === 0) {
    return { text: 'Estimate used up. Mark it done, or add time in the task.', tone: 'warn' };
  }
  if (tp.unscheduledMin > 0) {
    const short = `${duration(tp.unscheduledMin)} doesn't fit in your free time`;
    return { text: tp.deadline ? `Due ${when(tp.deadline, now)} · ${short}` : short, tone: 'danger' };
  }
  if (tp.deadline !== undefined && tp.projectedFinish !== undefined) {
    if (tp.status === 'late') {
      return {
        text: `Due ${when(tp.deadline, now)} · you'd finish ${when(tp.projectedFinish, now)}, ${duration((tp.projectedFinish - tp.deadline) / 60000)} late`,
        tone: 'danger',
      };
    }
    const startBy = tp.startBy !== undefined ? ` · start by ${when(tp.startBy, now)}` : '';
    return {
      text: `Due ${when(tp.deadline, now)} · done ${when(tp.projectedFinish, now)}${startBy}`,
      tone: tp.status === 'tight' ? 'warn' : 'normal',
    };
  }
  if (tp.suggestedDeadline !== undefined && tp.projectedFinish !== undefined) {
    return { text: `Done ${when(tp.projectedFinish, now)} · suggested deadline ${when(tp.suggestedDeadline, now)}`, tone: 'normal' };
  }
  return { text: '', tone: 'normal' };
}

export function TaskRow({ task, onPress, showProject = false }: { task: Task; onPress: () => void; showProject?: boolean }) {
  const t = useTheme();
  const { plan, timer, now, projects, startTimer, stopTimer, setDone, settings } = useStore();
  const tp = plan.tasks[task.id];
  const running = timer?.taskId === task.id;
  const logged = loggedSecNow(task, timer, now);
  const project = projects.find((p) => p.id === task.projectId);
  const issue = taskIssue(task, tp, now);
  const issueColor = tp?.remainingMin === 0 && !(tp.deadline !== undefined && tp.deadline <= now) ? t.warn : t.danger;
  const progress = task.estimateMin > 0 ? logged / 60 / task.estimateMin : 0;
  const over = logged / 60 > task.estimateMin;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: running ? t.accent + '14' : t.card, opacity: pressed ? 0.75 : 1 }]}
    >
      <Pressable hitSlop={10} onPress={() => setDone(task.id, !task.done)} style={{ paddingTop: 1 }}>
        <Icon name={task.done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={task.done ? t.ok : t.faint} />
      </Pressable>

      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {task.priority === 1 && !task.done && <Icon name="flag" size={13} color={t.danger} />}
          <Text
            numberOfLines={2}
            style={{
              color: task.done ? t.faint : t.text,
              fontSize: 16,
              fontWeight: '600',
              textDecorationLine: task.done ? 'line-through' : 'none',
              flexShrink: 1,
            }}
          >
            {task.title}
          </Text>
        </View>

        {!task.done && tp?.deadline !== undefined && <CountdownPill to={tp.deadline} />}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {!task.done && tp && <StatusPill status={tp.status} />}
          <Text style={{ color: over ? t.warn : t.sub, fontSize: 13, fontVariant: ['tabular-nums'] }}>
            {running
              ? `${stopwatch(logged, settings.showSeconds !== false)} / ${duration(task.estimateMin)}`
              : task.done
                ? `${duration(logged / 60)} tracked`
                : `${duration(tp?.remainingMin ?? task.estimateMin)} left of ${duration(task.estimateMin)}`}
          </Text>
          {showProject && project && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: project.color }} />
              <Text style={{ color: t.sub, fontSize: 13 }}>{project.name}</Text>
            </View>
          )}
        </View>

        {!!issue && <Text style={{ color: issueColor, fontSize: 13, lineHeight: 18 }}>{issue}</Text>}
        {!task.done && tp?.blocks[0] && !running && (
          <Text style={{ color: t.faint, fontSize: 12 }}>
            {tp.blocks[0].start - now < 60_000
              ? 'Next block: now'
              : `Next block ${when(tp.blocks[0].start, now)} (${relative(tp.blocks[0].start, now)})`}
          </Text>
        )}
        {!task.done && (
          <View style={{ marginTop: 4 }}>
            <Progress value={progress} color={over ? t.warn : project?.color} />
          </View>
        )}
      </View>

      {!task.done && (
        <RoundButton icon={running ? 'pause' : 'play'} filled={running} onPress={() => (running ? stopTimer() : startTimer(task.id))} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16 },
});
