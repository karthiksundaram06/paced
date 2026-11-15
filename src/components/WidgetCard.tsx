import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Card, Muted } from '../ui';
import { WIDGET_SCRIPT, WIDGET_SCRIPT_NAME } from '../widgetScript';

const STEPS = [
  'Install Scriptable from the App Store (free).',
  `Open it, tap +, and paste. Tap the title at the top and name it ${WIDGET_SCRIPT_NAME}. Tap ▶ once and allow Calendar access, then Done.`,
  'Lock Screen: press and hold it → Customize → Lock Screen → tap the box below the time → Scriptable → the wide widget.',
  `Tap the new widget → Script → ${WIDGET_SCRIPT_NAME}. Tap outside it, then Done.`,
];

/** Web: hands over the Scriptable widget script (Paced itself can't put a widget on the Lock Screen). */
export function WidgetCard() {
  const t = useTheme();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(WIDGET_SCRIPT);
      setState('copied');
      setTimeout(() => setState('idle'), 4000);
    } catch {
      setState('failed');
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Card style={{ gap: 12 }}>
        <Muted>
          A live countdown to your next deadline on your Lock Screen (or Home Screen). It uses the free Scriptable app and reads the deadlines in your
          "Paced" calendar, so tap Sync now after you change a deadline.
        </Muted>
        <Button
          title={state === 'copied' ? 'Copied' : 'Copy widget script'}
          icon={state === 'copied' ? 'checkmark' : 'copy-outline'}
          kind={state === 'copied' ? 'secondary' : 'primary'}
          onPress={copy}
        />
        {state === 'failed' && (
          <View style={{ gap: 6 }}>
            <Muted style={{ fontSize: 13 }}>Couldn't copy by itself. Tap the box, Select All, Copy:</Muted>
            <TextInput
              multiline
              value={WIDGET_SCRIPT}
              onChangeText={() => {}}
              style={{ height: 140, backgroundColor: t.cardAlt, color: t.text, borderRadius: 10, padding: 10, fontSize: 16, fontFamily: 'Menlo, monospace' }}
            />
          </View>
        )}
        {STEPS.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={{ color: t.accent, fontWeight: '700', fontSize: 15, width: 16 }}>{i + 1}</Text>
            <Text style={{ color: t.text, fontSize: 15, flex: 1, lineHeight: 21 }}>{s}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}
