import React, { useEffect, useState } from 'react';
import { Text, TextStyle, View } from 'react-native';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Icon } from '../ui';

const pad = (n: number) => String(n).padStart(2, '0');

/** "3d 04h 12m 09s", "4h 12m 09s", "12m 09s"; without seconds "3d 04h 12m", "4h 12m", "12m". */
export function countdownText(msLeft: number, seconds = true): string {
  const total = Math.floor(Math.abs(msLeft) / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const sec = seconds ? ` ${pad(s)}s` : '';
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m${sec}`;
  if (h > 0) return `${h}h ${pad(m)}m${sec}`;
  return seconds ? `${m}m ${pad(s)}s` : `${m}m`;
}

/** Whether timers show seconds (Settings → Appearance). */
function useShowSeconds(): boolean {
  return useStore().settings.showSeconds !== false;
}

/** Colour by urgency: red under a day (or overdue), orange under three days. */
export function useCountdownColor(msLeft: number): string {
  const t = useTheme();
  if (msLeft <= 24 * 3600_000) return t.danger;
  if (msLeft <= 72 * 3600_000) return t.warn;
  return t.accent;
}

/** Ticks every second on its own, so the rest of the screen doesn't re-render. */
function useSecondTick(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  return now;
}

/** Small pill: "⏳ 1d 04h 12m 09s left" */
export function CountdownPill({ to }: { to: number }) {
  const now = useSecondTick();
  const sec = useShowSeconds();
  const left = to - now;
  const color = useCountdownColor(left);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        backgroundColor: color + '1F',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
      }}
    >
      <Icon name={left > 0 ? 'hourglass-outline' : 'alert-circle'} size={13} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {left > 0 ? `${countdownText(left, sec)} left` : `Overdue ${countdownText(left, sec)}`}
      </Text>
    </View>
  );
}

/** Just the ticking text, for places with their own styling (e.g. the running-timer card). */
export function CountdownText({ to, style }: { to: number; style?: TextStyle }) {
  const now = useSecondTick();
  const sec = useShowSeconds();
  const left = to - now;
  return <Text style={[{ fontVariant: ['tabular-nums'] }, style]}>{left > 0 ? `${countdownText(left, sec)} left` : `overdue ${countdownText(left, sec)}`}</Text>;
}

/** Large ticking number for cards. */
export function CountdownBig({ to, style, label = true }: { to: number; style?: TextStyle; label?: boolean }) {
  const t = useTheme();
  const now = useSecondTick();
  const sec = useShowSeconds();
  const left = to - now;
  const color = useCountdownColor(left);
  return (
    <View>
      {label && (
        <Text style={{ color: t.sub, fontSize: 12, fontWeight: '600' }}>{left > 0 ? 'Time left' : 'Overdue by'}</Text>
      )}
      <Text style={[{ color, fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] }, style]}>{countdownText(left, sec)}</Text>
    </View>
  );
}
