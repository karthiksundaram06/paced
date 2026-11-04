import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import { useTheme } from '../theme';

/** Native (iOS) version: the system compact picker. The web version lives in DateTimeInput.web.tsx. */
export function DateTimeInput({ value, mode, onChange }: { value: number; mode: 'datetime' | 'time'; onChange: (ms: number) => void }) {
  const t = useTheme();
  return (
    <DateTimePicker
      value={new Date(value)}
      mode={mode}
      display="compact"
      accentColor={t.accent}
      themeVariant={t.dark ? 'dark' : 'light'}
      onValueChange={(_e, d) => d && onChange(d.getTime())}
    />
  );
}
