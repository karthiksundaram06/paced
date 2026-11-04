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
  const { sync, now, busyUpdatedAt, permission, calendarStale } = s;
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

  // After tapping Sync, the next thing to do is paste.
  if (compact && !sync.pendingPaste && connected && !msg) return null;

  return (
    <Card style={{ gap: 10, borderWidth: sync.pendingPaste ? 1 : 0, borderColor: t.accent + '66' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={connected ? 'calendar' : 'calendar-outline'} color={t.accent} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>
            {sync.pendingPaste ? 'Back from Shortcuts?' : connected ? 'Calendar' : 'Connect your calendar'}
          </Text>
          <Muted style={{ fontSize: 13 }}>
            {sync.pendingPaste
              ? 'Tap Paste calendar to load the events the shortcut copied.'
              : connected
                ? `Events read ${busyUpdatedAt ? relative(busyUpdatedAt, now) : 'never'}` +
                  (sync.lastSyncAt ? ` · plan sent ${relative(sync.lastSyncAt, now)}` : '')
                : 'Plan around your lectures and shifts, and put work blocks in your calendar. One-time setup with Apple Shortcuts.'}
          </Muted>
        </View>
      </View>

      {connected && calendarStale && !sync.pendingPaste && (
        <Text style={{ color: t.warn, fontSize: 13 }}>Your tasks changed since the last sync. Sync to update your calendar.</Text>
      )}

      {sync.pendingPaste ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Paste calendar" icon="clipboard-outline" onPress={paste} style={{ flex: 1 }} />
          <Button title="Sync again" kind="secondary" icon="sync" onPress={s.syncNow} />
        </View>
      ) : connected ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Sync with Calendar" icon="sync" onPress={s.syncNow} style={{ flex: 1 }} />
          <Button title="Paste" kind="secondary" icon="clipboard-outline" onPress={paste} />
        </View>
      ) : (
        <>
          <Button title="Show me how" icon="book-outline" onPress={onOpenGuide} />
          <Button title="I've built it: paste calendar" kind="secondary" icon="clipboard-outline" onPress={paste} />
        </>
      )}

      {msg && <Text style={{ color: msg.ok ? t.ok : t.danger, fontSize: 13 }}>{msg.text}</Text>}

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
