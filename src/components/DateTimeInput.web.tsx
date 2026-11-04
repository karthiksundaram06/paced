import React from 'react';
import { useTheme } from '../theme';

const pad = (n: number) => String(n).padStart(2, '0');

function toInput(ms: number, mode: 'datetime' | 'time'): string {
  const d = new Date(ms);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return mode === 'time' ? time : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}`;
}

function fromInput(v: string, mode: 'datetime' | 'time', base: number): number | null {
  if (!v) return null;
  if (mode === 'time') {
    const [h, m] = v.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }
  const [date, time] = v.split('T');
  const [y, mo, da] = date.split('-').map(Number);
  const [h, m] = (time ?? '00:00').split(':').map(Number);
  const ms = new Date(y, mo - 1, da, h, m).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Web version: a native <input>, which iPhone Safari shows as the system date/time wheel. */
export function DateTimeInput({ value, mode, onChange }: { value: number; mode: 'datetime' | 'time'; onChange: (ms: number) => void }) {
  const t = useTheme();
  return React.createElement('input', {
    type: mode === 'time' ? 'time' : 'datetime-local',
    value: toInput(value, mode),
    onChange: (e: { target: { value: string } }) => {
      const ms = fromInput(e.target.value, mode, value);
      if (ms !== null) onChange(ms);
    },
    style: {
      fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      fontSize: 16,
      color: t.accent,
      background: t.cardAlt,
      border: 'none',
      borderRadius: 8,
      padding: '6px 10px',
      colorScheme: t.dark ? 'dark' : 'light',
    },
  });
}
