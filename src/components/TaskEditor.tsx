import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { duration, when } from '../format';
import { buildPlan, loggedSecNow } from '../scheduler';
import { useStore } from '../store';
import { useTheme } from '../theme';
import type { Priority, Task } from '../types';
import { Button, Chip, FieldLabel, Icon, RoundButton, Sheet, StatusPill } from '../ui';
import { DeadlineField } from './DeadlineField';
import { deadlineLine } from './TaskRow';

const ESTIMATES = [15, 30, 60, 90, 120, 180, 300, 480];

export function TaskEditor({
  visible,
  task,
  defaultProjectId,
  onClose,
}: {
  visible: boolean;
  task: Task | null;
  defaultProjectId?: string;
  onClose: () => void;
}) {
  const t = useTheme();
  const store = useStore();
  const { projects, tasks, busy, settings, timer, now } = store;

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>();
  const [estimateMin, setEstimateMin] = useState(60);
  const [deadline, setDeadline] = useState<number | undefined>();
  const [priority, setPriority] = useState<Priority>(2);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle(task?.title ?? '');
    setProjectId(task ? task.projectId : defaultProjectId);
    setEstimateMin(task?.estimateMin ?? 60);
    setDeadline(task?.deadline);
    setPriority(task?.priority ?? 2);
    setNotes(task?.notes ?? '');
  }, [visible, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live preview: plan with this draft included.
  const preview = useMemo(() => {
    if (!visible) return null;
    const draftId = task?.id ?? '__draft__';
    const draft: Task = {
      id: draftId,
      title: title || 'New task',
      projectId,
      estimateMin,
      deadline,
      priority,
      loggedSec: task?.loggedSec ?? 0,
      done: task?.done ?? false,
      createdAt: task?.createdAt ?? Date.now(),
    };
    const others = tasks.filter((x) => x.id !== draftId);
    const plan = buildPlan({ tasks: [...others, draft], projects, busy, settings, timer, now: Math.floor(now / 60000) * 60000 });
    return { draft, tp: plan.tasks[draftId] };
  }, [visible, task, title, projectId, estimateMin, deadline, priority, tasks, projects, busy, settings, timer, now]);

  const save = () => {
    const clean = title.trim();
    if (!clean) return;
    const data = { title: clean, projectId, estimateMin, deadline, priority, notes: notes.trim() || undefined };
    if (task) store.updateTask(task.id, data);
    else store.addTask(data);
    onClose();
  };

  const confirmDelete = () => {
    if (!task) return;
    // Goes to Tasks → Deleted, where it can be restored, so no confirmation needed.
    store.deleteTask(task.id);
    onClose();
  };

  const logged = task ? loggedSecNow(task, timer, now) / 60 : 0;
  const line = preview ? deadlineLine(preview.draft, preview.tp, now) : null;

  return (
    <Sheet visible={visible} title={task ? 'Edit task' : 'New task'} onClose={onClose} onSave={save} saveDisabled={!title.trim()}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="What needs doing?"
        placeholderTextColor={t.faint}
        autoFocus={!task}
        returnKeyType="done"
        style={{ backgroundColor: t.card, color: t.text, fontSize: 18, fontWeight: '600', padding: 14, borderRadius: 14 }}
      />

      {preview?.tp && (
        <View style={{ backgroundColor: t.accent + '14', borderRadius: 14, padding: 14, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="sparkles" size={16} color={t.accent} />
            <Text style={{ color: t.accent, fontWeight: '700' }}>Paced's estimate</Text>
            <StatusPill status={preview.tp.status} />
          </View>
          <Text style={{ color: t.text, fontSize: 15 }}>
            {preview.tp.remainingMin > 0 ? `${duration(preview.tp.remainingMin)} of work` : 'No work left on the estimate'}
            {preview.tp.projectedFinish && preview.tp.remainingMin > 0 ? `, done ${when(preview.tp.projectedFinish, now)}` : ''}
          </Text>
          {preview.tp.suggestedDeadline && (
            <Text style={{ color: t.text, fontSize: 15 }}>
              Suggested deadline: <Text style={{ fontWeight: '700' }}>{when(preview.tp.suggestedDeadline, now)}</Text>
            </Text>
          )}
          {!!line?.text && preview.tp.deadline !== undefined && <Text style={{ color: t.sub, fontSize: 13 }}>{line.text}</Text>}
          {preview.tp.blocks.length > 0 && (
            <Text style={{ color: t.sub, fontSize: 13 }}>
              {preview.tp.blocks.length} work block{preview.tp.blocks.length > 1 ? 's' : ''}, first {when(preview.tp.blocks[0].start, now)}
            </Text>
          )}
          {preview.tp.suggestedDeadline && !deadline && (
            <Button title="Use suggested deadline" kind="plain" icon="flag-outline" onPress={() => setDeadline(preview.tp.suggestedDeadline)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, paddingVertical: 4 }} />
          )}
        </View>
      )}

      <View>
        <FieldLabel>How long will it take?</FieldLabel>
        <View style={{ backgroundColor: t.card, borderRadius: 14, padding: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <RoundButton icon="remove" onPress={() => setEstimateMin((m) => Math.max(5, m - 15))} />
            <Text style={{ color: t.text, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{duration(estimateMin)}</Text>
            <RoundButton icon="add" onPress={() => setEstimateMin((m) => m + 15)} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ESTIMATES.map((m) => (
              <Chip key={m} label={duration(m)} selected={estimateMin === m} onPress={() => setEstimateMin(m)} />
            ))}
          </View>
        </View>
      </View>

      <DeadlineField value={deadline} onChange={setDeadline} />

      <View>
        <FieldLabel>Project</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="None" selected={!projectId} onPress={() => setProjectId(undefined)} />
          {projects.map((p) => (
            <Chip key={p.id} label={p.name} color={p.color} selected={projectId === p.id} onPress={() => setProjectId(p.id)} />
          ))}
        </View>
      </View>

      <View>
        <FieldLabel>Priority</FieldLabel>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="High" color={t.danger} selected={priority === 1} onPress={() => setPriority(1)} />
          <Chip label="Normal" selected={priority === 2} onPress={() => setPriority(2)} />
          <Chip label="Low" color={t.faint} selected={priority === 3} onPress={() => setPriority(3)} />
        </View>
        <Text style={{ color: t.faint, fontSize: 12, marginTop: 6 }}>Deadlines come first; priority breaks ties.</Text>
      </View>

      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Notes"
        placeholderTextColor={t.faint}
        multiline
        style={{ backgroundColor: t.card, color: t.text, fontSize: 15, padding: 14, borderRadius: 14, minHeight: 80, textAlignVertical: 'top' }}
      />

      {task && (
        <View style={{ backgroundColor: t.card, borderRadius: 14, padding: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>Time tracked</Text>
              <Text style={{ color: t.sub, fontSize: 13, marginTop: 2 }}>
                {duration(logged)} of {duration(estimateMin)} estimated
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <RoundButton icon="remove" onPress={() => store.addLogged(task.id, -15)} />
              <RoundButton icon="add" onPress={() => store.addLogged(task.id, 15)} />
            </View>
          </View>
          {logged >= estimateMin && !task.done && (
            <Button title="Add 30 min to the estimate" kind="secondary" icon="time-outline" onPress={() => setEstimateMin((m) => m + 30)} />
          )}
          <Button
            title={task.done ? 'Reopen task' : 'Mark as done'}
            kind="secondary"
            icon={task.done ? 'refresh' : 'checkmark'}
            onPress={() => {
              store.setDone(task.id, !task.done);
              onClose();
            }}
          />
          <Button title="Delete task" kind="danger" icon="trash-outline" onPress={confirmDelete} />
        </View>
      )}
    </Sheet>
  );
}
