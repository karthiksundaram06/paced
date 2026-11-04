import React from 'react';
import { Switch, Text, View } from 'react-native';
import { longDate, clock } from '../format';
import { addDays, startOfDay } from '../scheduler';
import { useTheme } from '../theme';
import { Chip } from '../ui';
import { DateTimeInput } from './DateTimeInput';

const at = (dayStart: number, h: number) => dayStart + h * 3600_000;

/** Toggle + quick picks + native date/time picker. */
export function DeadlineField({ value, onChange, label = 'Deadline' }: { value?: number; onChange: (v?: number) => void; label?: string }) {
  const t = useTheme();
  const now = Date.now();
  const today = startOfDay(now);
  const fri = (() => {
    const d = new Date(today).getDay();
    const diff = (5 - d + 7) % 7 || 7;
    return addDays(today, diff);
  })();

  const quick: { label: string; v: number }[] = [
    ...(now < at(today, 17) ? [{ label: 'Today 17:00', v: at(today, 17) }] : [{ label: 'Tonight 23:00', v: at(today, 23) }]),
    { label: 'Tomorrow 17:00', v: at(addDays(today, 1), 17) },
    { label: 'Friday 17:00', v: at(fri, 17) },
    { label: 'In 1 week', v: at(addDays(today, 7), 17) },
  ];

  return (
    <View style={{ backgroundColor: t.card, borderRadius: 14, padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
          <Text style={{ color: t.sub, fontSize: 13, marginTop: 2 }}>
            {value ? `${longDate(value)}, ${clock(value)}` : 'None: Paced will suggest one'}
          </Text>
        </View>
        <Switch
          value={value !== undefined}
          onValueChange={(on) => onChange(on ? at(addDays(today, 1), 17) : undefined)}
          trackColor={{ true: t.accent }}
        />
      </View>
      {value !== undefined && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {quick.map((q) => (
              <Chip key={q.label} label={q.label} selected={value === q.v} onPress={() => onChange(q.v)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: t.sub }}>Exact date & time</Text>
            <DateTimeInput value={value} mode="datetime" onChange={onChange} />
          </View>
        </>
      )}
    </View>
  );
}
