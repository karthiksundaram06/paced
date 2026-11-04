import React, { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import * as CalendarApi from '../calendar';
import { CalendarSyncCard } from '../components/CalendarSyncCard';
import { DateTimeInput } from '../components/DateTimeInput';
import { Screen } from '../components/Screen';
import { confirmAction, notify } from '../confirm';
import { SHORTCUT_NAME } from '../shortcutBridge';
import { pickBackupFile, saveBackup } from '../webFiles';
import { WEEKDAY_SHORT, duration } from '../format';
import { startOfDay } from '../scheduler';
import { IS_WEB, useStore } from '../store';
import { ACCENTS, useTheme } from '../theme';
import { Button, Card, Chip, Divider, Icon, Muted, SectionTitle } from '../ui';

const FONTS: { key: 'system' | 'inter' | 'serif' | 'mono'; name: string; note: string; preview: string }[] = [
  { key: 'system', name: 'Default', note: 'iPhone system font', preview: '-apple-system, system-ui, sans-serif' },
  { key: 'inter', name: 'Notion', note: 'Inter, Notion’s sans', preview: "'InterVariable', sans-serif" },
  { key: 'serif', name: 'Serif', note: 'Like Notion’s Serif', preview: "'New York', ui-serif, Georgia, serif" },
  { key: 'mono', name: 'Mono', note: 'Like Notion’s Mono', preview: "ui-monospace, 'SF Mono', Menlo, monospace" },
];

export function SettingsScreen({ onOpenGuide }: { onOpenGuide: () => void }) {
  const t = useTheme();
  const s = useStore();
  const { settings, permission, updateSettings } = s;
  const [calendars, setCalendars] = useState<CalendarApi.CalendarInfo[]>([]);

  useEffect(() => {
    if (IS_WEB || permission !== 'granted') return;
    CalendarApi.listCalendars(settings.appCalendarId).then(setCalendars).catch(() => setCalendars([]));
  }, [permission, settings.appCalendarId]);

  const others = calendars.filter((c) => !c.isApp);
  const isBusyCal = (id: string) => (settings.busyCalendarIds ? settings.busyCalendarIds.includes(id) : true);
  const toggleCal = (id: string, on: boolean) => {
    const current = settings.busyCalendarIds ?? others.map((c) => c.id);
    const next = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
    updateSettings({ busyCalendarIds: next });
  };

  const day = startOfDay(Date.now());
  const timeValue = (min: number) => day + min * 60_000;
  const fromDate = (ms: number) => {
    const d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes();
  };

  const row = (label: string, sub: string | undefined, right: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16 }}>{label}</Text>
        {sub && <Muted style={{ fontSize: 12, marginTop: 2 }}>{sub}</Muted>}
      </View>
      {right}
    </View>
  );

  const chips = (values: number[], current: number, onPick: (v: number) => void, fmt: (v: number) => string) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {values.map((v) => (
        <Chip key={v} label={fmt(v)} selected={current === v} onPress={() => onPick(v)} />
      ))}
    </View>
  );

  return (
    <Screen title="Settings">
      <SectionTitle>Appearance</SectionTitle>
      <Card style={{ gap: 12 }}>
        <Text style={{ color: t.text, fontSize: 16 }}>Colour</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, justifyContent: 'space-between' }}>
          {ACCENTS.map((a) => {
            const selected = (settings.accent ?? 'indigo') === a.key;
            const swatch = t.dark ? a.dark : a.light;
            return (
              <Pressable
                key={a.key}
                onPress={() => updateSettings({ accent: a.key })}
                style={{ width: '25%', alignItems: 'center', gap: 6 }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: swatch,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 3,
                    borderColor: selected ? t.text : 'transparent',
                  }}
                >
                  {selected && <Icon name="checkmark" size={22} color={t.dark ? '#0B0B12' : '#FFFFFF'} />}
                </View>
                <Text style={{ color: selected ? t.text : t.sub, fontSize: 12, fontWeight: selected ? '700' : '500' }}>{a.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={{ gap: 12 }}>
        <Text style={{ color: t.text, fontSize: 16 }}>Font</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {FONTS.map((f) => {
            const selected = (settings.font ?? 'system') === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => updateSettings({ font: f.key })}
                style={{
                  width: '47%',
                  flexGrow: 1,
                  borderRadius: 12,
                  padding: 12,
                  gap: 2,
                  borderWidth: 2,
                  borderColor: selected ? t.accent : t.border,
                  backgroundColor: selected ? t.accent + '14' : t.cardAlt,
                }}
              >
                {/* Inline font so each tile previews its own font whatever is selected */}
                <Text style={{ color: t.text, fontSize: 24, fontFamily: f.preview }}>Aa</Text>
                <Text style={{ color: selected ? t.accent : t.text, fontSize: 14, fontWeight: '700' }}>{f.name}</Text>
                <Text style={{ color: t.sub, fontSize: 12 }}>{f.note}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionTitle>Calendar</SectionTitle>
      {IS_WEB ? (
        <>
          <CalendarSyncCard onOpenGuide={onOpenGuide} />
          <Card>
            {row(
              'Update Calendar automatically',
              'On: a few seconds after you add, finish or delete a task, Paced updates your Calendar (Shortcuts opens for a moment). It never does this just because you opened Paced. Off: tap Sync now when you want it. Either way, your events refresh in the background whenever you open Paced from its icon.',
              <Switch value={settings.autoWrite} onValueChange={(v) => updateSettings({ autoWrite: v })} trackColor={{ true: t.accent }} />
            )}
          </Card>
          <Muted style={{ fontSize: 12, paddingHorizontal: 4 }}>
            Which calendars count as busy and how early you get alerts are set inside the "{SHORTCUT_NAME}" shortcut (Find Calendar Events
            filters and the Add New Event alert).
          </Muted>
        </>
      ) : (
      <Card style={{ gap: 12 }}>
        {permission !== 'granted' ? (
          <>
            <Muted>Paced needs calendar access to plan around your events and to write work blocks and deadlines.</Muted>
            <Button title="Allow calendar access" icon="lock-open-outline" onPress={s.connectCalendar} />
          </>
        ) : (
          <>
            {row(
              'Write plan to calendar',
              'Adds work blocks and deadlines to a separate "Paced" calendar, with alerts',
              <Switch value={settings.writeToCalendar} onValueChange={(v) => updateSettings({ writeToCalendar: v })} trackColor={{ true: t.accent }} />
            )}
            {settings.writeToCalendar && (
              <View>
                <Text style={{ color: t.text, fontSize: 16 }}>Alert before each work block</Text>
                {chips([0, 5, 10, 15], settings.alertMin, (v) => updateSettings({ alertMin: v }), (v) => (v ? `${v} min` : 'None'))}
              </View>
            )}
            <Divider />
            {row(
              'Ignore all-day events',
              'Birthdays and holidays won’t block your time',
              <Switch value={settings.ignoreAllDay} onValueChange={(v) => updateSettings({ ignoreAllDay: v })} trackColor={{ true: t.accent }} />
            )}
            <Divider />
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>Calendars that make you busy</Text>
            {others.length === 0 && <Muted>No calendars found.</Muted>}
            {others.map((c) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.color }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text }}>{c.title}</Text>
                  {!!c.sourceName && <Muted style={{ fontSize: 12 }}>{c.sourceName}</Muted>}
                </View>
                <Switch value={isBusyCal(c.id)} onValueChange={(v) => toggleCal(c.id, v)} trackColor={{ true: t.accent }} />
              </View>
            ))}
          </>
        )}
      </Card>
      )}

      <SectionTitle>When you work</SectionTitle>
      <Card style={{ gap: 12 }}>
        {row(
          'Start of day',
          undefined,
          <DateTimeInput value={timeValue(settings.dayStartMin)} mode="time" onChange={(ms) => updateSettings({ dayStartMin: fromDate(ms) })} />
        )}
        {row(
          'End of day',
          undefined,
          <DateTimeInput value={timeValue(settings.dayEndMin)} mode="time" onChange={(ms) => updateSettings({ dayEndMin: fromDate(ms) })} />
        )}
        <View>
          <Text style={{ color: t.text, fontSize: 16 }}>Work days</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = settings.workDays.includes(d);
              return (
                <Chip
                  key={d}
                  label={WEEKDAY_SHORT[d]}
                  selected={on}
                  onPress={() => {
                    const next = on ? settings.workDays.filter((x) => x !== d) : [...settings.workDays, d];
                    if (next.length) updateSettings({ workDays: next });
                  }}
                />
              );
            })}
          </View>
        </View>
      </Card>

      <SectionTitle>Work blocks</SectionTitle>
      <Card style={{ gap: 14 }}>
        <View>
          <Text style={{ color: t.text, fontSize: 16 }}>Longest block</Text>
          <Muted style={{ fontSize: 12 }}>Bigger tasks get split into blocks of at most this</Muted>
          {chips([45, 60, 90, 120, 180], settings.maxChunkMin, (v) => updateSettings({ maxChunkMin: v, minChunkMin: Math.min(settings.minChunkMin, v) }), duration)}
        </View>
        <View>
          <Text style={{ color: t.text, fontSize: 16 }}>Shortest block</Text>
          <Muted style={{ fontSize: 12 }}>Gaps smaller than this are left free</Muted>
          {chips([15, 25, 30, 45], settings.minChunkMin, (v) => updateSettings({ minChunkMin: v, maxChunkMin: Math.max(settings.maxChunkMin, v) }), duration)}
        </View>
        <View>
          <Text style={{ color: t.text, fontSize: 16 }}>Break after each block</Text>
          {chips([0, 5, 10, 15], settings.breakMin, (v) => updateSettings({ breakMin: v }), (v) => (v ? `${v} min` : 'None'))}
        </View>
      </Card>

      <SectionTitle>Deadlines</SectionTitle>
      <Card style={{ gap: 14 }}>
        <View>
          <Text style={{ color: t.text, fontSize: 16 }}>Safety margin on suggested deadlines</Text>
          <Muted style={{ fontSize: 12 }}>Added on top of the projected finish time, because things take longer than planned</Muted>
          {chips([10, 20, 30, 50], settings.bufferPct, (v) => updateSettings({ bufferPct: v }), (v) => `${v}%`)}
        </View>
        <View>
          <Text style={{ color: t.text, fontSize: 16 }}>Plan ahead</Text>
          {chips([14, 28, 42, 60], settings.horizonDays, (v) => updateSettings({ horizonDays: v }), (v) => `${v} days`)}
        </View>
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card style={{ gap: 10 }}>
        {IS_WEB && (
          <>
            <Muted style={{ fontSize: 12 }}>
              Your tasks live in this app on this iPhone only. Save a backup now and then, so they survive a phone switch or a cleared browser.
            </Muted>
            <Button
              title="Back up tasks"
              kind="secondary"
              icon="share-outline"
              onPress={async () => {
                notify('Backup', await saveBackup(s.exportData()));
              }}
            />
            <Button
              title="Restore from backup"
              kind="secondary"
              icon="download-outline"
              onPress={async () => {
                const text = await pickBackupFile();
                if (!text) return;
                confirmAction('Restore backup?', 'This replaces your current tasks and projects with the ones in the file.', 'Restore', () => {
                  const r = s.importData(text);
                  notify(r.ok ? 'Restored' : 'Could not restore', r.message);
                });
              }}
            />
          </>
        )}
        {!IS_WEB && permission === 'granted' && (
          <Button
            title='Remove the "Paced" calendar'
            kind="secondary"
            icon="close-circle-outline"
            onPress={() =>
              confirmAction('Remove the Paced calendar?', 'All work blocks and deadline events Paced added will disappear. Your own calendars are not touched.', 'Remove', () =>
                s.removeCalendar().catch((e) => notify('Could not remove', String(e)))
              )
            }
          />
        )}
        <Button
          title="Delete all tasks and projects"
          kind="danger"
          icon="trash-outline"
          onPress={() =>
            confirmAction('Delete everything?', 'This removes every task and project from Paced. It cannot be undone.', 'Delete', () => s.resetAll())
          }
        />
      </Card>

      <SectionTitle>How Paced plans</SectionTitle>
      <Card>
        <Muted style={{ lineHeight: 20 }}>
          Paced takes your free time (working hours minus calendar events) and fills it with your tasks, earliest deadline first, using
          the time each task has left: your estimate minus what the timer has tracked. That gives every task a finish time. Tasks with a
          deadline show whether they'll make it and the latest time you can start. Tasks without one get a suggested deadline: the
          finish time plus a safety margin. Whenever your calendar or tasks change, the plan reshuffles and your "Paced" calendar is
          rewritten.
        </Muted>
      </Card>
    </Screen>
  );
}
