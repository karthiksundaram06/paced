import React from 'react';
import { Text, View } from 'react-native';
import { GUIDE } from '../guideSteps';
import { SHORTCUT_NAME } from '../shortcutBridge';
import { useTheme } from '../theme';
import { Card, Muted, Sheet } from '../ui';

export function ShortcutGuide({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  let n = 0;
  return (
    <Sheet visible={visible} title="Connect your calendar" onClose={onClose} onSave={onClose} saveLabel="Done">
      <Card style={{ gap: 6, backgroundColor: t.accent + '14' }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Why a Shortcut?</Text>
        <Muted style={{ lineHeight: 20 }}>
          Websites can't read your iPhone Calendar, but Apple's Shortcuts app can. You build one shortcut, "{SHORTCUT_NAME}", once
          (about 10 minutes). It writes Paced's work blocks and deadlines into a "Paced" calendar, reads your events and opens
          Paced with them. Make it your Paced icon and every open syncs by itself.
        </Muted>
      </Card>
      {GUIDE.map((section) => (
        <View key={section.title} style={{ gap: 8 }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '800', marginTop: 6 }}>{section.title}</Text>
          {section.note && <Muted style={{ fontSize: 13 }}>{section.note}</Muted>}
          {section.steps.map((step) => {
            n += 1;
            return (
              <View key={n} style={{ flexDirection: 'row', gap: 10, backgroundColor: t.card, borderRadius: 12, padding: 12 }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: t.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: t.accentText, fontWeight: '800', fontSize: 12 }}>{n}</Text>
                </View>
                <Text style={{ color: t.text, flex: 1, lineHeight: 21, fontSize: 15 }}>{step}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </Sheet>
  );
}
