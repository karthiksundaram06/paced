import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { relative } from '../format';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Card, Icon, Muted } from '../ui';

/** Web-only: run the Paced Sync shortcut and load what it copied. */
export function CalendarSyncCard({ onOpenGuide, compact }: { onOpenGuide: () => void; compact?: boolean }) {
  const t = useTheme();
  const s = useStore();
  const { sync, now, busyUpdatedAt, permission, calendarStale, settings } = s;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState(false);
  const [pasted, setPasted] = useState('');

  const paste = async () => {
    const r = await s.pasteCalendar();
    setMsg({ ok: r.ok, text: r.message });
    if (!r.ok) setManual(true);
  };

  const loadManual = () => {
    const r = s.importBusyText(pasted);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) {
      setManual(false);
      setPasted('');
    }
  };

  const connected = permission === 'granted';

  const shown = msg ?? s.notice;
  // On Today, stay out of the way once everything is connected.
  if (compact && !sync.pendingPaste && connected && !shown) return null;

  return (
    <Card style={{ gap: 10, borderWidth: sync.pendingPaste ? 1 : 0, borderColor: t.accent + '66' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={connected ? 'calendar' : 'calendar-outline'} color={t.accent} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>
            {sync.pendingPaste ? 'Waiting for the shortcut' : connected ? 'Calendar connected' : 'Connect your calendar'}
          </Text>
          <Muted style={{ fontSize: 13 }}>
            {sync.pendingPaste
              ? "Paced Sync should bring you back here with your events. If it didn't, tap Paste calendar, or check the shortcut ends with Open URLs."
              : connected
                ? `Events read ${busyUpdatedAt ? relative(busyUpdatedAt, now) : 'never'}` +
                  (sync.lastSyncAt ? ` · plan sent ${relative(sync.lastSyncAt, now)}` : '') +
                  (settings.autoSync ? ' · syncs by itself' : '')
                : 'Plan around your lectures and shifts, and put work blocks in your calendar. One-time setup with Apple Shortcuts.'}
          </Muted>
        </View>
      </View>

      {connected && calendarStale && !sync.pendingPaste && (
        <Text style={{ color: t.warn, fontSize: 13 }}>
          {settings.autoSync
            ? 'Your tasks changed. Paced updates the calendar the next time you open it, or tap Sync now.'
            : 'Your tasks changed since the last sync. Sync to update your calendar.'}
        </Text>
      )}

      {sync.pendingPaste ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Sync again" icon="sync" onPress={s.syncNow} style={{ flex: 1 }} />
          <Button title="Paste" kind="secondary" icon="clipboard-outline" onPress={paste} />
        </View>
      ) : connected ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Sync now" icon="sync" onPress={s.syncNow} style={{ flex: 1 }} />
          <Button title="Paste" kind="secondary" icon="clipboard-outline" onPress={paste} />
        </View>
      ) : (
        <>
          <Button title="Show me how" icon="book-outline" onPress={onOpenGuide} />
          <Button title="I've built it: connect" kind="secondary" icon="link-outline" onPress={s.syncNow} />
        </>
      )}

      {shown && <Text style={{ color: shown.ok ? t.ok : t.danger, fontSize: 13 }}>{shown.text}</Text>}

      {manual && (
        <View style={{ gap: 8 }}>
          <TextInput
            value={pasted}
            onChangeText={setPasted}
            multiline
            placeholder="Long-press here → Paste"
            placeholderTextColor={t.faint}
            style={{ minHeight: 70, backgroundColor: t.cardAlt, color: t.text, borderRadius: 10, padding: 10, fontSize: 13 }}
          />
          <Button title="Load" kind="secondary" onPress={loadManual} disabled={!pasted.trim()} />
        </View>
      )}

      {connected && !compact && (
        <Button title="Shortcut setup guide" kind="plain" icon="book-outline" onPress={onOpenGuide} style={{ paddingVertical: 4 }} />
      )}
    </Card>
  );
}
