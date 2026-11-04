import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProjectEditor } from './src/components/ProjectEditor';
import { ShortcutGuide } from './src/components/ShortcutGuide';
import { TaskEditor } from './src/components/TaskEditor';
import { PlanScreen } from './src/screens/PlanScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { StoreProvider, useStore } from './src/store';
import { AccentContext, useTheme } from './src/theme';
import type { Project, Task } from './src/types';
import { Icon, type IconName } from './src/ui';

type Tab = 'today' | 'tasks' | 'plan' | 'settings';

const TABS: { key: Tab; label: string; icon: IconName; iconActive: IconName }[] = [
  { key: 'today', label: 'Today', icon: 'today-outline', iconActive: 'today' },
  { key: 'tasks', label: 'Tasks', icon: 'checkbox-outline', iconActive: 'checkbox' },
  { key: 'plan', label: 'Plan', icon: 'calendar-outline', iconActive: 'calendar' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline', iconActive: 'settings' },
];

function Main() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { loaded, plan, tasks, timer } = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const [taskEditor, setTaskEditor] = useState<{ task: Task | null; projectId?: string } | null>(null);
  const [projectEditor, setProjectEditor] = useState<{ project: Project | null } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const openGuide = () => setGuideOpen(true);

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  const openTask = (task: Task) => setTaskEditor({ task });
  const newTask = (projectId?: string) => setTaskEditor({ task: null, projectId });
  const openProject = (project: Project) => setProjectEditor({ project });

  const atRisk = tasks.filter((x) => !x.done && ['late', 'unscheduled'].includes(plan.tasks[x.id]?.status)).length;
  // Keep the editor showing the latest version of the task (e.g. tracked time while the timer runs).
  const editingTask = taskEditor?.task ? tasks.find((x) => x.id === taskEditor.task!.id) ?? null : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {tab === 'today' && <TodayScreen onOpenTask={openTask} onNewTask={() => newTask()} onOpenGuide={openGuide} />}
        {tab === 'tasks' && (
          <TasksScreen onOpenTask={openTask} onNewTask={newTask} onOpenProject={openProject} onNewProject={() => setProjectEditor({ project: null })} />
        )}
        {tab === 'plan' && <PlanScreen onOpenTask={openTask} onOpenProject={openProject} onOpenGuide={openGuide} />}
        {tab === 'settings' && <SettingsScreen onOpenGuide={openGuide} />}
      </View>

      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 0.5,
          borderTopColor: t.border,
          backgroundColor: t.card,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        }}
      >
        {TABS.map((x) => {
          const active = tab === x.key;
          const badge = (x.key === 'plan' && atRisk > 0) || (x.key === 'today' && !!timer && tab !== 'today');
          return (
            <Pressable key={x.key} onPress={() => setTab(x.key)} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <View>
                <Icon name={active ? x.iconActive : x.icon} size={24} color={active ? t.accent : t.faint} />
                {badge && (
                  <View
                    style={{
                      position: 'absolute',
                      right: -4,
                      top: -2,
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: x.key === 'plan' ? t.danger : t.ok,
                    }}
                  />
                )}
              </View>
              <Text style={{ fontSize: 11, color: active ? t.accent : t.faint, fontWeight: active ? '700' : '500' }}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <TaskEditor
        visible={!!taskEditor}
        task={editingTask}
        defaultProjectId={taskEditor?.projectId}
        onClose={() => setTaskEditor(null)}
      />
      <ShortcutGuide visible={guideOpen} onClose={() => setGuideOpen(false)} />
      <ProjectEditor visible={!!projectEditor} project={projectEditor?.project ?? null} onClose={() => setProjectEditor(null)} />
    </View>
  );
}

/** Hands the chosen accent colour to every screen. */
function Themed() {
  const { settings } = useStore();
  return (
    <AccentContext.Provider value={settings.accent ?? 'indigo'}>
      <Main />
    </AccentContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Themed />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
