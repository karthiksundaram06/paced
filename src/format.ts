import { addDays, startOfDay } from './scheduler';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export function clock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function minutesToClock(min: number): string {
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}

/** "2h 15m", "45m", "3d 4h" for long spans */
export function duration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** Calendar-time distance: "in 3h", "in 2d 4h", "5h ago" */
export function relative(ts: number, now: number): string {
  const diffMin = Math.round((ts - now) / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return 'just now';
  let s: string;
  if (abs < 60) s = `${abs}m`;
  else if (abs < 24 * 60) s = duration(abs >= 180 ? Math.round(abs / 60) * 60 : Math.round(abs / 15) * 15);
  else {
    const d = Math.floor(abs / 1440);
    const h = Math.round((abs % 1440) / 60);
    s = h ? `${d}d ${h}h` : `${d}d`;
  }
  return diffMin >= 0 ? `in ${s}` : `${s} ago`;
}

export function dayLabel(ts: number, now: number): string {
  const day = startOfDay(ts);
  const today = startOfDay(now);
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  if (day === addDays(today, -1)) return 'Yesterday';
  const d = new Date(ts);
  const sameWeekish = day > today && day < addDays(today, 7);
  return sameWeekish ? DAYS_LONG[d.getDay()] : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Today 14:00", "Thursday 09:30", "Mon 16 Nov 18:00" */
export function when(ts: number, now: number): string {
  return `${dayLabel(ts, now)} ${clock(ts)}`;
}

export function longDate(ts: number): string {
  const d = new Date(ts);
  return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Stopwatch: "4:05", "1:02:03" */
export function stopwatch(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

export const WEEKDAY_SHORT = DAYS;
