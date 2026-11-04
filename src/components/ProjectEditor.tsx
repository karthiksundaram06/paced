import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { chooseAction } from '../confirm';
import { duration, when } from '../format';
import { useStore } from '../store';
import { PROJECT_COLORS, useTheme } from '../theme';
import type { Project } from '../types';
import { Button, FieldLabel, Icon, Sheet, StatusPill } from '../ui';
import { DeadlineField } from './DeadlineField';

export function ProjectEditor({ visible, project, onClose }: { visible: boolean; project: Project | null; onClose: () => void }) {
  const t = useTheme();
  const store = useStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [deadline, setDeadline] = useState<number | undefined>();

  useEffect(() => {
    if (!visible) return;
    setName(project?.name ?? '');
    setColor(project?.color ?? PROJECT_COLORS[store.projects.length % PROJECT_COLORS.length]);
    setDeadline(project?.deadline);
  }, [visible, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pp = project ? store.plan.projects[project.id] : undefined;

  const save = () => {
    const clean = name.trim();
    if (!clean) return;
    if (project) store.updateProject(project.id, { name: clean, color, deadline });
    else store.addProject({ name: clean, color, deadline });
    onClose();
  };

  const confirmDelete = () => {
    if (!project) return;
    chooseAction(
      `Delete "${project.name}"?`,
      'What should happen to its tasks?',
      { label: 'Keep tasks', onPress: () => (store.deleteProject(project.id, false), onClose()) },
      { label: 'Delete tasks too', destructive: true, onPress: () => (store.deleteProject(project.id, true), onClose()) },
      'Delete its tasks too?\n\nOK = delete them · Cancel = keep them as tasks without a project'
    );
  };

  return (
    <Sheet visible={visible} title={project ? 'Edit project' : 'New project'} onClose={onClose} onSave={save} saveDisabled={!name.trim()}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Project name (e.g. Thesis, Text Mining A2)"
        placeholderTextColor={t.faint}
        autoFocus={!project}
        style={{ backgroundColor: t.card, color: t.text, fontSize: 18, fontWeight: '600', padding: 14, borderRadius: 14 }}
      />

      {pp && pp.openTasks > 0 && (
        <View style={{ backgroundColor: t.accent + '14', borderRadius: 14, padding: 14, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="sparkles" size={16} color={t.accent} />
            <Text style={{ color: t.accent, fontWeight: '700' }}>Paced's estimate</Text>
            <StatusPill status={pp.status} />
          </View>
          <Text style={{ color: t.text, fontSize: 15 }}>
            {duration(pp.remainingMin)} of work left across {pp.openTasks} task{pp.openTasks > 1 ? 's' : ''}
          </Text>
          {pp.projectedFinish && <Text style={{ color: t.text, fontSize: 15 }}>Done {when(pp.projectedFinish, store.now)}</Text>}
          {pp.suggestedDeadline && !deadline && (
            <Button
              title={`Use suggested deadline: ${when(pp.suggestedDeadline, store.now)}`}
              kind="plain"
              icon="flag-outline"
              onPress={() => setDeadline(pp.suggestedDeadline)}
              style={{ alignSelf: 'flex-start', paddingHorizontal: 0, paddingVertical: 4 }}
            />
          )}
        </View>
      )}

      <View>
        <FieldLabel>Colour</FieldLabel>
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          {PROJECT_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: c,
                borderWidth: 3,
                borderColor: color === c ? t.text : 'transparent',
              }}
            />
          ))}
        </View>
      </View>

      <DeadlineField label="Project deadline" value={deadline} onChange={setDeadline} />
      <Text style={{ color: t.faint, fontSize: 12, marginTop: -8 }}>
        Every task in the project has to be finished by this, even if the task has a later deadline of its own.
      </Text>

      {project && <Button title="Delete project" kind="danger" icon="trash-outline" onPress={confirmDelete} />}
    </Sheet>
  );
}
