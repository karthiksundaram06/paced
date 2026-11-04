import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { TaskRow } from '../components/TaskRow';
import { confirmAction } from '../confirm';
import { duration, relative, when } from '../format';
import { useStore } from '../store';
import { useTheme } from '../theme';
import type { Project, Task } from '../types';
import { Chip, Empty, Icon, RoundButton, StatusPill } from '../ui';

export function TasksScreen({
  onOpenTask,
  onNewTask,
  onOpenProject,
  onNewProject,
}: {
  onOpenTask: (t: Task) => void;
  onNewTask: (projectId?: string) => void;
  onOpenProject: (p: Project) => void;
  onNewProject: () => void;
}) {
  const t = useTheme();
  const { tasks, projects, plan, now, deletedTasks, restoreTask, purgeTask, emptyDeleted } = useStore();
  const [showDone, setShowDone] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const visible = tasks.filter((x) => x.done === showDone);
  const sortTasks = (xs: Task[]) =>
    showDone
      ? [...xs].sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
      : [...xs].sort((a, b) => {
          const fa = plan.tasks[a.id]?.blocks[0]?.start ?? Infinity;
          const fb = plan.tasks[b.id]?.blocks[0]?.start ?? Infinity;
          return fa - fb || a.createdAt - b.createdAt;
        });

  const groups: { project?: Project; tasks: Task[] }[] = [
    ...projects.map((p) => ({ project: p, tasks: sortTasks(visible.filter((x) => x.projectId === p.id)) })),
    { project: undefined, tasks: sortTasks(visible.filter((x) => !x.projectId || !projects.some((p) => p.id === x.projectId))) },
  ].filter((g) => g.tasks.length > 0 || (g.project && !showDone));

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title="Tasks"
        right={
          <Pressable onPress={onNewProject} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 6 }}>
            <Icon name="folder-open-outline" color={t.accent} size={20} />
            <Text style={{ color: t.accent, fontWeight: '700' }}>New project</Text>
          </Pressable>
        }
      >
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          <Chip label={`Open (${tasks.filter((x) => !x.done).length})`} selected={!showDone} onPress={() => setShowDone(false)} />
          <Chip label={`Done (${tasks.filter((x) => x.done).length})`} selected={showDone} onPress={() => setShowDone(true)} />
        </View>

        {groups.length === 0 && (
          <Empty
            icon={showDone ? 'checkmark-done-outline' : 'list-outline'}
            title={showDone ? 'Nothing finished yet' : 'No tasks yet'}
            body={
              showDone
                ? 'Tasks you complete show up here with the time they took.'
                : 'Add a task and say roughly how long it takes. Paced works out when to do it and when it will be done.'
            }
          />
        )}

        {groups.map((g) => {
          const pp = g.project ? plan.projects[g.project.id] : undefined;
          return (
            <View key={g.project?.id ?? 'none'} style={{ gap: 8, marginTop: 8 }}>
              {g.project ? (
                <Pressable onPress={() => onOpenProject(g.project!)} style={{ paddingHorizontal: 4, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: g.project.color }} />
                    <Text style={{ color: t.text, fontSize: 18, fontWeight: '800', flexShrink: 1 }} numberOfLines={1}>
                      {g.project.name}
                    </Text>
                    {pp && pp.openTasks > 0 && <StatusPill status={pp.status} compact />}
                    <View style={{ flex: 1 }} />
                    {!showDone && <RoundButton icon="add" size={30} onPress={() => onNewTask(g.project!.id)} color={g.project.color} />}
                  </View>
                  {pp && !showDone && (
                    <Text style={{ color: t.sub, fontSize: 13 }}>
                      {pp.openTasks === 0
                        ? 'No open tasks'
                        : `${duration(pp.remainingMin)} left` +
                          (pp.projectedFinish ? ` · done ${when(pp.projectedFinish, now)}` : '') +
                          (pp.deadline ? ` · due ${when(pp.deadline, now)}` : pp.suggestedDeadline ? ` · aim for ${when(pp.suggestedDeadline, now)}` : '')}
                    </Text>
                  )}
                </Pressable>
              ) : (
                <Text style={{ color: t.text, fontSize: 18, fontWeight: '800', paddingHorizontal: 4 }}>
                  {projects.length ? 'Other tasks' : showDone ? 'Finished' : 'All tasks'}
                </Text>
              )}
              {g.tasks.map((task) => (
                <TaskRow key={task.id} task={task} onPress={() => onOpenTask(task)} />
              ))}
            </View>
          );
        })}

        {deletedTasks.length > 0 && (
          <View style={{ marginTop: 16, gap: 8 }}>
            <Pressable
              onPress={() => setShowDeleted((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 6 }}
            >
              <Icon name={showDeleted ? 'chevron-down' : 'chevron-forward'} size={18} color={t.sub} />
              <Icon name="trash-outline" size={18} color={t.sub} />
              <Text style={{ color: t.sub, fontSize: 16, fontWeight: '700', flex: 1 }}>Deleted ({deletedTasks.length})</Text>
            </Pressable>
            {showDeleted && (
              <View style={{ backgroundColor: t.card, borderRadius: 16, overflow: 'hidden' }}>
                {deletedTasks.map((d, i) => (
                  <View
                    key={d.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.sub, fontSize: 15, textDecorationLine: 'line-through' }} numberOfLines={1}>
                        {d.title}
                      </Text>
                      <Text style={{ color: t.faint, fontSize: 12 }}>Deleted {relative(d.deletedAt!, now)}</Text>
                    </View>
                    <Pressable hitSlop={8} onPress={() => restoreTask(d.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon name="arrow-undo" size={16} color={t.accent} />
                      <Text style={{ color: t.accent, fontWeight: '700' }}>Restore</Text>
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      accessibilityLabel="Delete forever"
                      onPress={() => confirmAction('Delete forever?', d.title, 'Delete', () => purgeTask(d.id))}
                    >
                      <Icon name="close-circle" size={22} color={t.faint} />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={() => confirmAction('Empty Deleted?', 'These tasks will be gone for good.', 'Empty', emptyDeleted)}
                  style={{ padding: 14, borderTopWidth: 0.5, borderTopColor: t.border, alignItems: 'center' }}
                >
                  <Text style={{ color: t.danger, fontWeight: '700' }}>Empty Deleted</Text>
                </Pressable>
              </View>
            )}
            {showDeleted && <Text style={{ color: t.faint, fontSize: 12, paddingHorizontal: 4 }}>Deleted tasks are removed for good after 30 days.</Text>}
          </View>
        )}
      </Screen>

      <View style={{ position: 'absolute', right: 20, bottom: 24 }}>
        <RoundButton icon="add" filled size={60} onPress={() => onNewTask()} />
      </View>
    </View>
  );
}
